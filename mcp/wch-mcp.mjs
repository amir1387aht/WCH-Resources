#!/usr/bin/env node
/*
 * WCH Configurator MCP server
 * WCH Configurator by Amir1387aht (Another) - https://github.com/amir1387aht/WCH-Resources
 *
 * Lets an AI assistant (Claude Desktop, Claude Code, Cursor, VS Code Copilot, Windsurf, ...) use the
 * configurator through the Model Context Protocol: choose a chip, assign pins, add peripherals, set the
 * clock, load examples, check Problems and generate the project into a folder (USER CODE is kept).
 *
 * It runs the configurator itself (index.html) in Edge / Chrome / Chromium, so the generated code is the
 * same as from the UI. No npm packages are needed: Node.js 22 or newer and a Chromium-based browser.
 *
 *   node mcp/wch-mcp.mjs                      headless (default)
 *   node mcp/wch-mcp.mjs --show               opens a visible browser window, so you can watch the AI work
 *   node mcp/wch-mcp.mjs --attach 9222        drives an already open configurator (desktop app started with
 *                                             --mcp-port 9222, or Chrome/Edge with --remote-debugging-port)
 *   options: --html <index.html>  --browser <chrome/edge executable>
 *   env:     WCH_CONFIGURATOR_HTML, WCH_BROWSER, WCH_MCP_ATTACH
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {spawn, execFileSync} from 'child_process';
import {fileURLToPath, pathToFileURL} from 'url';

const VERSION = '1.0.0';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, env) => { const i = argv.indexOf('--' + name); return i >= 0 ? (argv[i + 1] || '') : (env ? process.env[env] : undefined); };
const flag = name => argv.includes('--' + name);
const log = (...a) => process.stderr.write('[wch-mcp] ' + a.join(' ') + '\n');

if(flag('help') || flag('h')){
  process.stderr.write(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0] + '*/\n');
  process.exit(0);
}
if(typeof WebSocket === 'undefined'){ log('Node.js 22 or newer is needed (global WebSocket).'); process.exit(1); }

/* ================= browser ================= */
function findBrowser(){
  const given = opt('browser', 'WCH_BROWSER');
  if(given) return given;
  const c = [];
  if(process.platform === 'win32'){
    /* MCP clients often start servers with a reduced environment (no PROGRAMFILES), so the usual folders are tried too */
    const drv = process.env['SYSTEMDRIVE'] || 'C:';
    const pf = [...new Set([process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA'],
      drv + '\\Program Files', drv + '\\Program Files (x86)', process.env['USERPROFILE'] && path.join(process.env['USERPROFILE'], 'AppData', 'Local')].filter(Boolean))];
    for(const b of pf) c.push(path.join(b, 'Google/Chrome/Application/chrome.exe'), path.join(b, 'Microsoft/Edge/Application/msedge.exe'), path.join(b, 'Chromium/Application/chrome.exe'));
  } else if(process.platform === 'darwin'){
    c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser');
  } else {
    for(const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable', 'brave-browser']){
      try{ const p = execFileSync('which', [n], {encoding: 'utf8'}).trim(); if(p) c.push(p); }catch(e){}
    }
    c.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/snap/bin/chromium');
  }
  return c.find(p => { try{ return fs.statSync(p).isFile(); }catch(e){ return false; } });
}
function findHtml(){
  const given = opt('html', 'WCH_CONFIGURATOR_HTML');
  const c = [given, path.join(HERE, '..', 'index.html'), path.join(HERE, 'index.html')].filter(Boolean);
  return c.find(p => { try{ return fs.statSync(p).isFile(); }catch(e){ return false; } });
}

class Page {
  constructor(){ this.id = 0; this.pend = new Map(); this.busy = false; this.proc = null; this.tmp = null; }
  async start(){
    const attach = opt('attach', 'WCH_MCP_ATTACH');
    let port, pageWs;
    if(attach){
      const base = /^\d+$/.test(attach) ? `http://127.0.0.1:${attach}` : attach.replace(/\/$/, '');
      let list;
      try{ list = await (await fetch(base + '/json/list')).json(); }
      catch(e){ throw new Error(`Cannot reach ${base}. Start the desktop app with --mcp-port ${/^\d+$/.test(attach) ? attach : '<port>'} (or Chrome/Edge with --remote-debugging-port) first.`); }
      const pages = list.filter(t => t.type === 'page');
      const t = pages.find(t => /WCH Configurator/i.test(t.title || '')) || pages.find(t => /index\.html/i.test(t.url || ''));
      if(!t) throw new Error(`No WCH Configurator page found at ${base} (pages: ${pages.map(p => p.title || p.url).join(', ') || 'none'}).`);
      pageWs = t.webSocketDebuggerUrl; this.attached = true;
    } else {
      const exe = findBrowser();
      if(!exe) throw new Error('No Chrome, Edge or Chromium found. Install one or pass --browser <path> (or set WCH_BROWSER).');
      this.html = findHtml();
      if(!this.html) throw new Error('index.html of the configurator not found. Pass --html <path to index.html> (or set WCH_CONFIGURATOR_HTML).');
      this.tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wch-mcp-'));
      const args = ['--remote-debugging-port=0', `--user-data-dir=${this.tmp}`, '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--disable-background-networking', '--disable-sync', '--allow-file-access-from-files', '--window-size=1600,1000'];
      if(!flag('show')) args.push('--headless=new', '--disable-gpu', '--hide-scrollbars');
      args.push('about:blank');
      this.proc = spawn(exe, args, {stdio: 'ignore'});
      this.proc.on('exit', () => { this.proc = null; });
      const f = path.join(this.tmp, 'DevToolsActivePort');
      for(let i = 0; i < 150 && !port; i++){
        try{ port = fs.readFileSync(f, 'utf8').split(/\r?\n/)[0]; }catch(e){}
        if(!port) await sleep(100);
      }
      if(!port) throw new Error('The browser did not start (' + exe + ').');
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      pageWs = list.find(t => t.type === 'page').webSocketDebuggerUrl;
    }
    this.ws = new WebSocket(pageWs);
    await new Promise((ok, bad) => { this.ws.onopen = ok; this.ws.onerror = () => bad(new Error('Cannot open the DevTools connection.')); });
    this.ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if(d.id && this.pend.has(d.id)){ this.pend.get(d.id)(d); this.pend.delete(d.id); }
      /* confirm()/alert() of the page: accepted while a tool runs, so nothing blocks */
      if(d.method === 'Page.javascriptDialogOpening' && (this.busy || !this.attached)) this.call('Page.handleJavaScriptDialog', {accept: true}).catch(() => {});
    };
    this.ws.onclose = () => { this.ws = null; for(const r of this.pend.values()) r({error: {message: 'connection closed'}}); this.pend.clear(); };
    await this.call('Page.enable'); await this.call('Runtime.enable');
    if(!this.attached){
      if(!flag('show')) await this.call('Emulation.setDeviceMetricsOverride', {width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false});
      await this.call('Page.navigate', {url: pathToFileURL(path.resolve(this.html)).href});
      for(let i = 0; i < 100; i++){ await sleep(150); try{ if(await this.evalRaw('typeof generateFiles === "function" && typeof state === "object" && !!document.getElementById("variantSelect")')) break; }catch(e){} }
    }
    if(!(await this.evalRaw('typeof generateFiles === "function" && typeof state === "object"'))) throw new Error('The page is not the WCH Configurator.');
    await this.evalRaw(PAGE_HELPER);
  }
  call(method, params){
    if(!this.ws) return Promise.reject(new Error('not connected'));
    return new Promise((ok, bad) => {
      const id = ++this.id;
      this.pend.set(id, d => d.error ? bad(new Error(d.error.message)) : ok(d.result));
      this.ws.send(JSON.stringify({id, method, params}));
    });
  }
  async evalRaw(expr){
    const r = await this.call('Runtime.evaluate', {expression: expr, returnByValue: true, awaitPromise: true});
    if(r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text || 'error').split('\n')[0].replace(/^(Uncaught )?Error:\s*/, ''));
    return r.result.value;
  }
  /* calls window.__wchMcp.<fn>(...args) in the page */
  async run(fn, ...args){
    if(!this.ws) await this.start();
    if(!(await this.evalRaw('!!window.__wchMcp'))) await this.evalRaw(PAGE_HELPER); /* page reloaded */
    this.busy = true;
    try{ return await this.evalRaw(`window.__wchMcp.${fn}(...${JSON.stringify(args)})`); }
    finally{ this.busy = false; }
  }
  async screenshot(){
    if(!this.ws) await this.start();
    const r = await this.call('Page.captureScreenshot', {format: 'png'});
    return r.data;
  }
  stop(){
    try{ if(this.proc) this.proc.kill(); }catch(e){}
    if(this.tmp) setTimeout(() => { try{ fs.rmSync(this.tmp, {recursive: true, force: true}); }catch(e){} }, 300);
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ================= code that runs inside the configurator page ================= */
const PAGE_HELPER = String.raw`window.__wchMcp = (() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const H = {};
  const fam = () => FAMILIES[state.family];
  const probs = () => computeProblems(computeUsage()).map(p => Object.assign({level: p.lvl, msg: p.msg}, p.pin ? {pin: p.pin} : {}, p.cfg ? {config: p.cfg} : {}));
  const refresh = () => { try{ renderAll(); }catch(e){} try{ if(typeof renderProjectSettings === 'function') renderProjectSettings(); }catch(e){} };
  const specs = id => { const s = (typeof CHIP_SPECS !== 'undefined' && CHIP_SPECS[id]) || null; if(!s) return null;
    const o = {}; ['core', 'mhz', 'flash', 'ram', 'vmin', 'vmax', 'adcCh', 'uart', 'spi', 'i2c', 'timers', 'can', 'usbd', 'usbh', 'usbpd', 'eth', 'ble', 'rf24', 'ds'].forEach(k => { if(s[k] != null && s[k] !== false && s[k] !== 0) o[k] = s[k]; }); return o; };
  function chip(){
    const v = currentVariant(), pk = currentPkg ? currentPkg() : null, p = pinout();
    return {family: state.family, chip: v.id, package: pk ? pk.name : null, pins: pk ? pk.pins.length : null,
      packages: p ? p.pkgs.map(k => k.name) : [], library: fam().style === 'stdperiph' ? 'StdPeriph (CH32)' : 'CH5xx peripheral library',
      header: v.header, specs: specs(v.id)};
  }
  function gpioOf(pin){
    const pk = currentPkg();
    const s = String(pin).trim().toUpperCase();
    if(/^\d+$/.test(s)){
      if(!pk) throw new Error('this chip has no package drawing: give the pin as PA0, PB12, ...');
      const name = pk.pins[+s - 1]; if(!name) throw new Error('pin ' + s + ' does not exist on ' + pk.name);
      const g = gpiosOf(name); if(!g.length) throw new Error('pin ' + s + ' (' + name + ') is not a GPIO'); return g[0];
    }
    const m = s.match(/^P([A-Z])(\d{1,2})$/); if(!m) throw new Error('pin must be like PA9 or a pin number, got ' + pin);
    const g = 'P' + m[1] + (+m[2]);
    if(!fam().variants.find(v => v.id === state.variant).ports.includes(m[1])) throw new Error(g + ': port ' + m[1] + ' does not exist on ' + state.variant);
    return g;
  }
  function pinFunctions(g){
    const fi = fnInfo(g), std = isStd();
    const out = ['GPIO_Input', 'GPIO_Output'];
    if(std && fi.af.some(f => /^ADC_IN/.test(f))) out.push('GPIO_Analog');
    if(!(std && +g.slice(2) > 15)) out.push('GPIO_EXTI');
    const not = [];
    fi.af.filter(f => !/^OTHER:/.test(f)).forEach(f => { const a = fnAction(f); if(a.ok) out.push(f); else not.push(f + ' (' + a.why + ')'); });
    return {functions: out, notGenerated: not, other: fi.af.filter(f => /^OTHER:/.test(f)).map(f => f.slice(6)), remap: fi.rm};
  }
  function usageOf(g){ return (computeUsage()[g] || []).map(u => ({role: u.role, config: u.cfg.id, label: u.cfg.label})); }
  function cfgOut(c){ const o = {}; Object.keys(c).forEach(k => { if(!['family', 'variant'].includes(k) && c[k] !== undefined && c[k] !== '') o[k] = c[k]; }); return o; }

  H.listChips = () => Object.entries(FAMILIES).map(([id, f]) => ({family: id, name: f.label, library: f.style === 'stdperiph' ? 'StdPeriph' : 'CH5xx',
    chips: f.variants.map(v => Object.assign({chip: v.id, packages: PINOUTS[v.id] ? PINOUTS[v.id].pkgs.map(k => k.name) : []}, specs(v.id) ? {core: specs(v.id).core, mhz: specs(v.id).mhz, flashKB: specs(v.id).flash, ramKB: specs(v.id).ram} : {}))}));

  H.selectChip = async (id, pkg, keep) => {
    const want = String(id).toUpperCase();
    const famId = Object.keys(FAMILIES).find(f => FAMILIES[f].variants.some(v => v.id === want));
    if(!famId) throw new Error('unknown chip ' + id + '. Use list_chips.');
    exSelectChip(want); await sleep(60);
    if(!keep){ exClearConfig(); }
    if(pkg){
      const p = pinout(); if(!p) throw new Error(want + ' has no package drawing');
      const k = p.pkgs.find(x => x.name.toUpperCase() === String(pkg).toUpperCase()) || p.pkgs.find(x => x.name.toUpperCase().startsWith(String(pkg).toUpperCase()));
      if(!k) throw new Error('package ' + pkg + ' not found; packages: ' + p.pkgs.map(x => x.name).join(', '));
      exSelectPkg(k.name); await sleep(40);
    }
    refresh();
    return {chip: chip(), problems: probs()};
  };

  H.getConfig = () => {
    const out = {chip: chip(), project: {name: projectName(), split: projectSplit(), ide: typeof ideKind === 'function' ? ideKind() : 'vscode'},
      configs: state.configs.map(cfgOut), labels: state.labels || {}, clock: H.getClock(true),
      wireless: {}, example: state.example || null, problems: probs()};
    ['ble', 'usb', 'rf', 'usbh'].forEach(k => { if(state[k]) out.wireless[k] = state[k].enabled ? 'enabled' : 'off'; });
    if(state.userCode && Object.keys(state.userCode).length) out.userCodeSections = Object.keys(state.userCode);
    return out;
  };

  H.listPins = (onlyFree) => {
    const pk = currentPkg();
    if(!pk) return {chip: chip(), note: 'no package drawing for this chip; use pins by name (PA0...)', pins: []};
    const usage = computeUsage();
    const pins = pk.pins.map((name, i) => {
      const gs = gpiosOf(name);
      const o = {pin: i + 1, name};
      if(!gs.length){ o.kind = pinKind(name); return o; }
      o.gpio = gs;
      const used = gs.flatMap(g => (usage[g] || []).map(u => g + ': ' + u.role));
      if(used.length) o.used = used;
      o.functions = gs.flatMap(g => pinFunctions(g).functions.filter(f => !/^GPIO_/.test(f)));
      if(state.labels && gs.some(g => state.labels[g])) o.label = gs.map(g => state.labels[g]).filter(Boolean).join('/');
      return o;
    });
    return {chip: chip(), pins: onlyFree ? pins.filter(p => p.gpio && !p.used) : pins};
  };

  H.pinInfo = pin => {
    const g = gpioOf(pin);
    const pk = currentPkg();
    const n = pk ? pk.pins.findIndex(x => gpiosOf(x).includes(g)) + 1 : null;
    return Object.assign({gpio: g, packagePin: n || null, bonded: pk ? n > 0 : null, label: (state.labels || {})[g] || null, used: usageOf(g)}, pinFunctions(g),
      {electrical: state.pinElec && state.pinElec[g] || null, problems: probs().filter(p => p.pin === g)});
  };

  H.assignPin = async (pin, fn, label) => {
    const g = gpioOf(pin);
    const pf = pinFunctions(g);
    if(fn !== 'Reset_State' && !pf.functions.includes(fn)) throw new Error(fn + ' is not available on ' + g + '. Available: ' + pf.functions.join(', ') + (pf.notGenerated.length ? '. Not generated: ' + pf.notGenerated.join(', ') : ''));
    assignPin(g, fn);
    if(label != null) state.labels[g] = String(label).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 24);
    if(label != null) state.configs.forEach(relabel);
    refresh(); await sleep(20);
    return {pin: g, function: fn, used: usageOf(g), problems: probs()};
  };

  H.setLabel = (pin, label) => {
    const g = gpioOf(pin);
    const l = String(label || '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 24);
    if(l) state.labels[g] = l; else delete state.labels[g];
    state.configs.forEach(relabel); refresh();
    return {pin: g, label: l || null};
  };

  H.setPinElectrical = (pin, v) => {
    const g = gpioOf(pin);
    state.pinElec = state.pinElec || {};
    const e = Object.assign({}, state.pinElec[g] || {});
    if(v.signal5v != null) e.v5 = !!v.signal5v;
    if(v.currentMa != null) e.ma = +v.currentMa || 0;
    if(!e.v5 && !e.ma) delete state.pinElec[g]; else state.pinElec[g] = e;
    refresh();
    return {pin: g, electrical: state.pinElec[g] || null, problems: probs().filter(p => p.pin === g)};
  };

  H.listPeripherals = () => catGroups().map(gr => ({category: gr.title, items: gr.items.map(it => ({type: it.tab, name: tabTitle(it.tab),
    how: ['ble', 'usb', 'rf', 'usbh'].includes(it.tab) ? 'configure_wireless' : 'add_peripheral'}))})).filter(g => g.items.length);

  async function openTab(type){
    const ci = document.querySelector('#catTree .cat-item[data-tab="' + type + '"]');
    if(!ci) throw new Error('peripheral ' + type + ' is not available on ' + state.variant + '. Use list_peripherals.');
    if(['ble', 'usb', 'rf', 'usbh'].includes(type)) throw new Error(type + ' is set with configure_wireless, not with the form.');
    if(state.editId){ state.editId = null; syncFormHead(); }
    ci.click(); await sleep(50);
  }
  function labelOf(e){
    const f = e.closest('.field'); const l = f && f.querySelector('label');
    if(l && l.textContent.trim()) return l.textContent.trim().replace(/\s+/g, ' ');
    const w = e.closest('label'); if(w) return w.textContent.trim().replace(/\s+/g, ' ').slice(0, 80);
    return e.getAttribute('aria-label') || e.title || '';
  }
  function scrapeForm(){
    const fields = [];
    document.querySelectorAll('#formArea [id^="f_"]').forEach(e => {
      if(!/^(SELECT|INPUT|TEXTAREA)$/.test(e.tagName)) return;
      const f = {field: e.id.slice(2), label: labelOf(e)};
      if(e.tagName === 'SELECT'){ f.kind = 'select'; f.value = e.value; f.options = [...e.options].map(o => o.textContent.trim() && o.textContent.trim() !== o.value ? o.value + ' = ' + o.textContent.trim().replace(/\s+/g, ' ').slice(0, 70) : o.value); }
      else if(e.type === 'checkbox'){ f.kind = 'checkbox'; f.value = e.checked ? '1' : ''; }
      else { f.kind = e.type || 'text'; f.value = e.value; if(e.min) f.min = e.min; if(e.max) f.max = e.max; }
      const vis = e.offsetParent !== null || e.getClientRects().length > 0;
      if(!vis) f.hidden = true;
      fields.push(f);
    });
    const hints = [...document.querySelectorAll('#formArea .hint, #formArea .calc, #f_calc')].map(h => h.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean);
    return {fields, notes: [...new Set(hints)].slice(0, 20)};
  }
  async function fillForm(fields){
    const errs = [];
    for(const [k, v0] of Object.entries(fields || {})){
      const e = document.getElementById('f_' + k);
      if(!e){ errs.push('no field ' + k); continue; }
      const v = String(v0);
      if(e.type === 'checkbox'){ e.checked = !!v0 && v !== '0' && v !== 'false'; }
      else if(e.tagName === 'SELECT'){
        let o = [...e.options].find(o => o.value === v) || [...e.options].find(o => o.value.toLowerCase() === v.toLowerCase()) || [...e.options].find(o => o.textContent.trim().toLowerCase() === v.toLowerCase());
        if(!o){ errs.push(k + ': no option ' + v + ' (options: ' + [...e.options].map(o => o.value).join(', ') + ')'); continue; }
        e.value = o.value;
      } else e.value = v;
      e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true}));
      await sleep(15);
    }
    return errs;
  }
  H.describePeripheral = async type => {
    await openTab(type);
    const m = modFor(type);
    return Object.assign({type, name: tabTitle(type), chip: state.variant}, m && m.help ? {help: String(m.help).slice(0, 600)} : {}, scrapeForm(),
      {howTo: 'add_peripheral with {type, fields:{field: value}}; fields you leave out keep the default shown here. Some fields appear only after another field is set (hidden: true).'});
  };
  H.addPeripheral = async (type, fields) => {
    await openTab(type);
    const before = new Set(state.configs.map(c => c.id));
    const errs = await fillForm(fields);
    if(errs.length) return {added: false, errors: errs, form: scrapeForm()};
    const notes = scrapeForm().notes;
    document.getElementById('addBtn').click(); await sleep(60);
    const added = state.configs.filter(c => !before.has(c.id));
    return {added: added.length > 0, configs: added.map(cfgOut), notes, problems: probs()};
  };
  H.editPeripheral = async (id, fields) => {
    const c = state.configs.find(x => x.id === +id);
    if(!c) throw new Error('no configuration item ' + id + '. Use get_config.');
    if(state.tab !== c.type){ const ci = document.querySelector('#catTree .cat-item[data-tab="' + c.type + '"]'); if(ci){ ci.click(); await sleep(40); } }
    editConfig(c.id); await sleep(40);
    const errs = await fillForm(fields);
    if(errs.length){ state.editId = null; syncFormHead(); renderForm(); renderConfigList(); return {updated: false, errors: errs}; }
    const notes = scrapeForm().notes;
    document.getElementById('addBtn').click(); await sleep(60);
    const n = state.configs.find(x => x.id === c.id);
    return {updated: true, config: n ? cfgOut(n) : null, notes, problems: probs()};
  };
  H.removePeripheral = id => {
    const n = state.configs.length;
    state.configs = state.configs.filter(c => c.id !== +id);
    if(state.editId === +id){ state.editId = null; syncFormHead(); renderForm(); }
    refresh();
    return {removed: n !== state.configs.length, problems: probs()};
  };

  /* --- clock --- */
  function clockChoices(d){
    const ch = {};
    const n = l => (l || []).map(x => x.n);
    if(d.kind === 'ble'){ ch.sys = d.options.map(o => o.e + ' = ' + (o.hz / 1e6) + ' MHz' + (o.ble ? '' : ' (no BLE)') + (o.usb ? '' : ' (no USB)')); if(d.lse) ch.ls = ['LSI', 'LSE']; return ch; }
    ch.sys = ['HSI', 'HSE', 'PLL'];
    ch.hse = 'HSE crystal in Hz (number)';
    if(d.pllIn) ch.pllIn = d.pllIn.map(x => x.id);
    if(d.pllMul) ch.mul = n(d.pllMul);
    if(d.ahb) ch.ahb = n(d.ahb);
    if(d.apb1) ch.apb1 = n(d.apb1);
    if(d.apb2) ch.apb2 = n(d.apb2);
    if(d.adc) ch.adc = n(d.adc.divs);
    if(d.usb) ch.usb = n(d.usb.divs);
    return ch;
  }
  H.getClock = (short) => {
    const d = clockDef();
    if(!d) return {available: false, note: 'no clock tree for ' + state.variant + ': the EVT default clock is used'};
    const f = clockFreqs(), hz = {};
    Object.keys(f).forEach(k => { if(typeof f[k] === 'number' && f[k] > 0) hz[k] = f[k]; });
    const o = {custom: !!state.clock, settings: clockCfg(), frequenciesHz: hz};
    if(!short){ o.choices = clockChoices(d); o.problems = clockProblems().map(p => p.msg); if(d.maxSys || d.sysMax) o.limits = {sysclk: d.maxSys || d.sysMax}; }
    return o;
  };
  H.setClock = (settings, reset) => {
    const d = clockDef(); if(!d) throw new Error('no clock tree for ' + state.variant);
    if(reset){ state.clock = null; state.configs.forEach(relabel); refresh(); return H.getClock(); }
    const c = Object.assign({}, clockCfg());
    for(const [k, v] of Object.entries(settings || {})){
      if(!(k in d.def) && !['hse', 'sys', 'pllIn', 'mul', 'ahb', 'apb1', 'apb2', 'adc', 'usb', 'ls'].includes(k)) throw new Error('unknown clock setting ' + k + '; settings: ' + Object.keys(d.def).join(', '));
      c[k] = typeof d.def[k] === 'number' ? +v : String(v).split(' = ')[0];
    }
    state.clock = c; state.configs.forEach(relabel); refresh();
    return H.getClock();
  };

  /* --- BLE / USB / 2.4G / USB host (CH5xx and CH32 USB) --- */
  H.configureWireless = (kind, settings) => {
    if(!['ble', 'usb', 'rf', 'usbh'].includes(kind)) throw new Error('kind must be ble, usb, rf or usbh');
    const caps = chipCaps(currentVariant());
    if(!caps[kind]) throw new Error(state.variant + ' has no ' + kind + ' in this configurator');
    const s = state[kind];
    if(settings && typeof settings === 'object'){
      for(const [k, v] of Object.entries(settings)){
        if(!(k in s)) throw new Error('unknown ' + kind + ' setting ' + k + '; settings: ' + Object.keys(s).join(', '));
        s[k] = typeof s[k] === 'number' ? +v : typeof s[k] === 'boolean' ? (v === true || v === 'true' || v === 1 || v === '1') : v;
      }
    }
    if(state.tab === kind) renderForm();
    refresh();
    const pr = probs().filter(p => new RegExp(kind === 'ble' ? 'BLE|Bluetooth' : kind === 'usb' ? 'USB' : kind === 'rf' ? 'RF|2\\.4' : 'USB host', 'i').test(p.msg));
    return {kind, settings: JSON.parse(JSON.stringify(s)), problems: pr};
  };

  /* --- examples --- */
  H.listExamples = chipId => EXAMPLES.filter(e => !chipId || e.chips.includes(String(chipId).toUpperCase())).map(e => ({id: e.id, title: e.title, uses: e.periph, chips: e.chips}));
  H.loadExample = async (id, chipId) => {
    const r = exLoad(id, {chip: chipId ? String(chipId).toUpperCase() : undefined, noConfirm: true});
    await sleep(60); refresh();
    if(!r || !r.ok) throw new Error((r && r.error) || 'could not load the example');
    return {loaded: id, chip: chip(), configs: state.configs.map(cfgOut), userCodeSections: Object.keys(state.userCode || {}), problems: probs()};
  };

  /* --- project --- */
  H.setProject = (s) => {
    state.project = state.project || {name: '', split: false};
    if(s.name != null) state.project.name = String(s.name);
    if(s.split != null) state.project.split = !!s.split;
    if(s.ide != null){ if(!['vscode', 'mrs', 'pio'].includes(s.ide)) throw new Error('ide must be vscode, mrs or pio'); state.project.ide = s.ide === 'vscode' ? undefined : s.ide; }
    refresh();
    return {name: projectName(), split: projectSplit(), ide: ideKind(), problems: probs().filter(p => /PlatformIO|MounRiver/i.test(p.msg))};
  };
  H.files = (which) => {
    const {name, files} = vscProjectFiles();
    if(which) { if(files[which] == null) throw new Error('no file ' + which + '; files: ' + Object.keys(files).join(', ')); return {name, file: which, text: files[which]}; }
    return {name, files: Object.keys(files).map(k => ({path: k, bytes: files[k].length}))};
  };
  H.projectFiles = () => { const {name, files} = vscProjectFiles(); return {name, files, chip: state.variant}; };
  /* same rules as Generate code in the UI: USER CODE is carried over, 'create' files are never rewritten */
  H.merge = (files, old) => {
    const writes = {}, kept = [], noMarks = [], lost = [], changed = [];
    for(const rel of Object.keys(files)){
      let text = files[rel];
      const prev = old[rel];
      if(prev != null){
        if(projPolicy(rel) === 'create') continue;
        const crlf = /\r\n/.test(prev);
        const m = mergeUserCode(text.replace(/\r\n/g, '\n'), prev.replace(/\r\n/g, '\n'));
        text = crlf ? m.text.replace(/\n/g, '\r\n') : m.text;
        if(text === prev) continue;
        if(m.sections) kept.push(rel); else if(/\.(c|h)$/.test(rel)) noMarks.push(rel);
        m.lost.forEach(k => lost.push(rel + ': ' + k));
        changed.push(rel);
      }
      writes[rel] = text;
    }
    return {writes, kept, noMarks, lost, changed};
  };
  H.projectJson = generated => { projIO.generated = generated || projIO.generated || []; return {name: projectName(), text: projectJson(projIO.generated)}; };
  H.load = text => { const r = projectLoad(text); projIO.generated = r.generated || []; refresh(); return {loaded: r.count, chip: chip(), problems: probs()}; };
  H.problems = () => probs();
  H.view = async v => {
    v = v || 'pinout';
    if(v === 'clock' && !clockDef()) throw new Error('no clock tree for ' + state.variant);
    const pg = v === 'project' ? 'project' : v === 'clock' ? 'clock' : 'pinout';
    const t = document.querySelector('.mtab[data-page="' + pg + '"]'); if(t) t.click();
    await sleep(60);
    if(pg === 'pinout'){ const b = document.querySelector('.vtab[data-view="' + v + '"]'); if(b && !b.hidden) b.click(); }
    const pm = document.getElementById('pinMenu'); if(pm) pm.hidden = true;
    if(v === 'pinout' || !v){ const z = document.getElementById('zoomFit'); if(z) z.click(); }
    await sleep(250);
    return true;
  };
  return H;
})(); true`;

/* ================= tools ================= */
const S = (props, req) => ({type: 'object', properties: props || {}, required: req || [], additionalProperties: false});
const str = d => ({type: 'string', description: d});
const TOOLS = [
  {name: 'list_chips', description: 'Lists every supported WCH chip (CH32V/CH32X/CH32L/CH32M/CH32F/CH641/CH643/CH5xx...) by family, with packages, core, clock, flash and RAM.', inputSchema: S()},
  {name: 'select_chip', description: 'Selects the chip (and optionally the package, e.g. "TSSOP20", "QFN28"). Clears the current configuration unless keep_config is true.', inputSchema: S({chip: str('Chip id, e.g. CH32V003, CH32V203, CH592'), package: str('Package name or prefix (optional)'), keep_config: {type: 'boolean'}}, ['chip'])},
  {name: 'get_config', description: 'Returns the whole current configuration: chip, package, project settings, every configuration item (with its id), pin labels, clock, BLE/USB state and the Problems list.', inputSchema: S()},
  {name: 'list_pins', description: 'Lists the package pins with their GPIO names, what each is used for, user labels and the alternate functions the generator supports there (from the datasheet pin table).', inputSchema: S({only_free: {type: 'boolean', description: 'only GPIO pins that are not used yet'}})},
  {name: 'pin_info', description: 'Details of one pin: functions that can be assigned, functions that exist but are not generated, remaps, current use, label, 5 V / current marks and problems.', inputSchema: S({pin: str('PA9, PB12... or the package pin number')}, ['pin'])},
  {name: 'assign_pin', description: 'Assigns a function to a pin, like clicking the pin in the chip view: GPIO_Output, GPIO_Input, GPIO_Analog, GPIO_EXTI, Reset_State (free the pin) or an alternate function such as USART1_TX, SPI1_SCK, I2C1_SDA, ADC_IN3, TIM2_CH1. The peripheral is created or completed automatically.', inputSchema: S({pin: str('PA9 or pin number'), function: str('function name as given by pin_info'), label: str('optional user label, e.g. LED or BTN')}, ['pin', 'function'])},
  {name: 'set_pin_label', description: 'Sets or clears the user label of a pin (used for #define names in the code).', inputSchema: S({pin: str('PA9'), label: str('label, empty to clear')}, ['pin', 'label'])},
  {name: 'set_pin_electrical', description: 'Marks a pin as receiving a 5 V signal and/or sets the load current of an output, so the 5 V-tolerance and current checks run (see Problems).', inputSchema: S({pin: str('PA9'), signal_5v: {type: 'boolean'}, current_ma: {type: 'number'}}, ['pin'])},
  {name: 'list_peripherals', description: 'Lists the peripheral types available on the selected chip, by category (System Core, Analog, Timers, Connectivity, Wireless/USB, Power, Middleware...).', inputSchema: S()},
  {name: 'describe_peripheral', description: 'Shows the form of one peripheral type for the selected chip: every field with its options and default, plus notes and live calculations (ADC sample rate, timer frequency...). Call it before add_peripheral.', inputSchema: S({type: str('type from list_peripherals, e.g. gpio, uart, spi, i2c, timer, adc, exti, dma, rtc, iwdg, can, freertos...')}, ['type'])},
  {name: 'add_peripheral', description: 'Adds one configuration item of the given type with the given form fields (values as in describe_peripheral). Returns the new item, notes/calculations and Problems.', inputSchema: S({type: str('peripheral type'), fields: {type: 'object', description: 'field -> value, e.g. {"inst":"USART1","baud":"115200","port":"A","tx":"9","rx":"10"}', additionalProperties: true}}, ['type'])},
  {name: 'edit_peripheral', description: 'Changes fields of an existing configuration item (id from get_config).', inputSchema: S({id: {type: 'number'}, fields: {type: 'object', additionalProperties: true}}, ['id', 'fields'])},
  {name: 'remove_peripheral', description: 'Removes a configuration item (id from get_config).', inputSchema: S({id: {type: 'number'}}, ['id'])},
  {name: 'get_clock', description: 'Returns the clock tree settings, the possible values of each setting, every resulting frequency in Hz and the clock problems (out of datasheet range).', inputSchema: S()},
  {name: 'set_clock', description: 'Changes clock settings (e.g. {"sys":"PLL","hse":8000000,"mul":18,"ahb":1}) or resets to the EVT default clock with reset=true.', inputSchema: S({settings: {type: 'object', additionalProperties: true}, reset: {type: 'boolean'}})},
  {name: 'configure_wireless', description: 'Reads or changes the Bluetooth LE ("ble"), USB device ("usb"), 2.4G RF ("rf") or USB host ("usbh") settings. Call with only kind to see the settings; set {"enabled": true} to turn it on.', inputSchema: S({kind: {type: 'string', enum: ['ble', 'usb', 'rf', 'usbh']}, settings: {type: 'object', additionalProperties: true}}, ['kind'])},
  {name: 'list_examples', description: 'Lists the ready-to-build example applications (blink, UART echo, ADC, PWM, I2C scan, SPI, CAN, USB CDC, BLE, FreeRTOS, WS2812...), optionally only those for one chip.', inputSchema: S({chip: str('optional chip id')})},
  {name: 'load_example', description: 'Loads an example: sets the chip, pins, peripherals and clock and puts the application code into the USER CODE sections. Replaces the current configuration.', inputSchema: S({id: str('example id from list_examples'), chip: str('chip id (default: the selected chip)')}, ['id'])},
  {name: 'get_problems', description: 'Returns the Problems list: pin conflicts, functions not on a pin, clock out of range, debug/SWD pins used, 5 V on non-tolerant pins, too much current, duplicate interrupt handlers, missing signals...', inputSchema: S()},
  {name: 'set_project', description: 'Project settings: name, split (one .c/.h pair per peripheral, like CubeMX) and ide: "vscode" (CMake), "mrs" (MounRiver Studio) or "pio" (PlatformIO).', inputSchema: S({name: str('project name'), split: {type: 'boolean'}, ide: {type: 'string', enum: ['vscode', 'mrs', 'pio']}})},
  {name: 'preview_code', description: 'Without writing anything: lists the files the project would contain, or returns the text of one file (e.g. "src/main.c").', inputSchema: S({file: str('optional file path inside the project')})},
  {name: 'generate_project', description: 'Generates the complete project into a folder (created if needed), like Generate code in Project Manager: code between USER CODE BEGIN/END is kept, files that change are first copied to .wch-backup/<time>/, and <name>.wchproj is written too.', inputSchema: S({folder: str('absolute path of the project folder'), force: {type: 'boolean', description: 'generate even when Problems has errors'}}, ['folder'])},
  {name: 'open_project', description: 'Opens a .wchproj file (or a project folder that contains one) and loads its configuration.', inputSchema: S({path: str('path of the .wchproj or of the project folder')}, ['path'])},
  {name: 'save_project', description: 'Saves the configuration as a .wchproj file (path of the file, or a folder: <name>.wchproj is written into it).', inputSchema: S({path: str('file or folder path')}, ['path'])},
  {name: 'screenshot', description: 'Returns a PNG image of the configurator: the pinout, the pin table, the clock tree or Project Manager. Useful to check the result visually.', inputSchema: S({view: {type: 'string', enum: ['pinout', 'table', 'clock', 'project']}})},
];

const page = new Page();
let lastFolder = null;
const txt = o => ({content: [{type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o, null, 1)}]});
function safeRel(rel){ return !(rel.includes('..') || path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)); }
function readOld(folder, rels){
  const out = {};
  for(const r of rels){ if(!safeRel(r)) continue; try{ out[r] = fs.readFileSync(path.join(folder, r), 'utf8'); }catch(e){} }
  return out;
}
function findWchproj(folder){ try{ return fs.readdirSync(folder).filter(n => /\.wchproj$/i.test(n)).map(n => path.join(folder, n))[0] || null; }catch(e){ return null; } }

async function callTool(name, a){
  a = a || {};
  switch(name){
    case 'list_chips': return txt(await page.run('listChips'));
    case 'select_chip': return txt(await page.run('selectChip', a.chip, a.package || null, !!a.keep_config));
    case 'get_config': return txt(await page.run('getConfig'));
    case 'list_pins': return txt(await page.run('listPins', !!a.only_free));
    case 'pin_info': return txt(await page.run('pinInfo', a.pin));
    case 'assign_pin': return txt(await page.run('assignPin', a.pin, a.function, a.label == null ? null : a.label));
    case 'set_pin_label': return txt(await page.run('setLabel', a.pin, a.label));
    case 'set_pin_electrical': return txt(await page.run('setPinElectrical', a.pin, {signal5v: a.signal_5v, currentMa: a.current_ma}));
    case 'list_peripherals': return txt(await page.run('listPeripherals'));
    case 'describe_peripheral': return txt(await page.run('describePeripheral', a.type));
    case 'add_peripheral': return txt(await page.run('addPeripheral', a.type, a.fields || {}));
    case 'edit_peripheral': return txt(await page.run('editPeripheral', a.id, a.fields || {}));
    case 'remove_peripheral': return txt(await page.run('removePeripheral', a.id));
    case 'get_clock': return txt(await page.run('getClock', false));
    case 'set_clock': return txt(await page.run('setClock', a.settings || {}, !!a.reset));
    case 'configure_wireless': return txt(await page.run('configureWireless', a.kind, a.settings || null));
    case 'list_examples': return txt(await page.run('listExamples', a.chip || null));
    case 'load_example': return txt(await page.run('loadExample', a.id, a.chip || null));
    case 'get_problems': return txt(await page.run('problems'));
    case 'set_project': return txt(await page.run('setProject', {name: a.name, split: a.split, ide: a.ide}));
    case 'preview_code': return a.file ? txt((await page.run('files', a.file)).text) : txt(await page.run('files', null));
    case 'generate_project': {
      if(!a.folder) throw new Error('folder is required');
      const folder = path.resolve(a.folder);
      const errs = (await page.run('problems')).filter(p => p.level === 'err');
      if(errs.length && !a.force) return {content: [{type: 'text', text: JSON.stringify({generated: false, reason: 'Problems has errors; fix them or call again with force=true', errors: errs}, null, 1)}], isError: true};
      fs.mkdirSync(folder, {recursive: true});
      const {name, files, chip} = await page.run('projectFiles');
      const wp = findWchproj(folder);
      let prevGenerated = [];
      if(wp){ try{ prevGenerated = JSON.parse(fs.readFileSync(wp, 'utf8')).generated || []; }catch(e){} }
      try{ const meta = JSON.parse(fs.readFileSync(path.join(folder, 'wch-project.json'), 'utf8')); if(meta.chip && meta.chip !== chip && !a.force) return {content: [{type: 'text', text: `This folder is a ${meta.chip} project and the configuration is for ${chip}. Call again with force=true to generate anyway.`}], isError: true}; }catch(e){}
      const rels = Object.keys(files);
      const old = readOld(folder, [...new Set([...rels, ...prevGenerated])]);
      const m = await page.run('merge', files, old);
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '-').slice(0, 19);
      const backupDir = path.join(folder, '.wch-backup', stamp);
      const backup = rel => { const dst = path.join(backupDir, rel); fs.mkdirSync(path.dirname(dst), {recursive: true}); fs.writeFileSync(dst, old[rel]); };
      m.changed.forEach(backup);
      const removed = [];
      for(const rel of prevGenerated){
        if(files[rel] || old[rel] == null || /^\.wch-backup\//.test(rel) || !safeRel(rel)) continue;
        backup(rel); fs.rmSync(path.join(folder, rel), {force: true}); removed.push(rel);
      }
      const pj = await page.run('projectJson', rels);
      m.writes[pj.name + '.wchproj'] = pj.text;
      for(const [rel, text] of Object.entries(m.writes)){
        if(!safeRel(rel)) continue;
        const dst = path.join(folder, rel); fs.mkdirSync(path.dirname(dst), {recursive: true}); fs.writeFileSync(dst, text);
      }
      lastFolder = folder;
      return txt({generated: true, folder, project: name, filesWritten: Object.keys(m.writes).length, userCodeKeptIn: m.kept, removed,
        backup: m.changed.length || removed.length ? path.join('.wch-backup', stamp) : null,
        warnings: [].concat(m.noMarks.map(f => f + ': no USER CODE sections, old version only in the backup'), m.lost.map(s => 'section no longer exists (copy it back from the backup): ' + s)),
        problems: (await page.run('problems')).filter(p => p.level !== 'info'),
        next: 'Open the folder in VS Code (or import it in MounRiver Studio / PlatformIO) and build. The first build downloads the WCH EVT drivers and the toolchain (tools/wch.ps1 or tools/wch.sh setup).'});
    }
    case 'open_project': {
      let p = path.resolve(a.path);
      if(fs.existsSync(p) && fs.statSync(p).isDirectory()){ const w = findWchproj(p); if(!w) throw new Error('no .wchproj in ' + p); lastFolder = p; p = w; }
      else lastFolder = path.dirname(p);
      return txt(Object.assign({file: p}, await page.run('load', fs.readFileSync(p, 'utf8'))));
    }
    case 'save_project': {
      let p = path.resolve(a.path);
      const pj = await page.run('projectJson', null);
      if(!/\.wchproj$/i.test(p)){ fs.mkdirSync(p, {recursive: true}); p = path.join(p, pj.name + '.wchproj'); }
      else fs.mkdirSync(path.dirname(p), {recursive: true});
      fs.writeFileSync(p, pj.text);
      return txt({saved: p});
    }
    case 'screenshot': {
      await page.run('view', a.view || 'pinout');
      const data = await page.screenshot();
      return {content: [{type: 'image', data, mimeType: 'image/png'}]};
    }
  }
  throw new Error('unknown tool ' + name);
}

/* ================= MCP (JSON-RPC 2.0 over stdio, one message per line) ================= */
const send = m => process.stdout.write(JSON.stringify(m) + '\n');
const INSTRUCTIONS = `WCH Configurator: pin, clock and peripheral configuration and code generation for WCH microcontrollers (CH32V/CH32X/CH32L/CH32M/CH32F, CH641/CH643, CH56x/CH57x/CH58x/CH59x), like STM32CubeMX.
Typical flow: list_chips -> select_chip -> assign_pin / describe_peripheral + add_peripheral -> get_clock / set_clock -> get_problems (fix errors) -> set_project -> generate_project.
Or start from load_example. Pins are given as PA9 or as the package pin number. Values of form fields come from describe_peripheral.
Write application code only between /* USER CODE BEGIN x */ and /* USER CODE END x */ in the generated files: it is kept on the next generate_project.`;
let queue = Promise.resolve();
async function handle(msg){
  const {id, method, params} = msg;
  const reply = result => { if(id !== undefined) send({jsonrpc: '2.0', id, result}); };
  const fail = (code, message) => { if(id !== undefined) send({jsonrpc: '2.0', id, error: {code, message}}); };
  try{
    if(method === 'initialize'){
      const want = params && params.protocolVersion;
      return reply({protocolVersion: ['2024-11-05', '2025-03-26', '2025-06-18'].includes(want) ? want : '2025-06-18',
        capabilities: {tools: {listChanged: false}}, serverInfo: {name: 'wch-configurator', title: 'WCH Configurator', version: VERSION}, instructions: INSTRUCTIONS});
    }
    if(method === 'notifications/initialized' || (method && method.startsWith('notifications/'))) return;
    if(method === 'ping') return reply({});
    if(method === 'tools/list') return reply({tools: TOOLS});
    if(method === 'resources/list') return reply({resources: []});
    if(method === 'prompts/list') return reply({prompts: []});
    if(method === 'tools/call'){
      const name = params && params.name;
      if(!TOOLS.find(t => t.name === name)) return fail(-32602, 'unknown tool ' + name);
      try{ return reply(await callTool(name, params.arguments)); }
      catch(e){ return reply({content: [{type: 'text', text: 'Error: ' + (e.message || e)}], isError: true}); }
    }
    return fail(-32601, 'method not found: ' + method);
  }catch(e){ return fail(-32603, e.message || String(e)); }
}
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => {
  buf += d;
  let i;
  while((i = buf.indexOf('\n')) >= 0){
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if(!line) continue;
    let msg; try{ msg = JSON.parse(line); }catch(e){ send({jsonrpc: '2.0', id: null, error: {code: -32700, message: 'parse error'}}); continue; }
    queue = queue.then(() => handle(msg));   /* one tool at a time: the page holds one configuration */
  }
});
const quit = () => { page.stop(); setTimeout(() => process.exit(0), 400); };
process.stdin.on('end', quit);
process.on('SIGINT', quit); process.on('SIGTERM', quit);
log(`WCH Configurator MCP server ${VERSION} ready (${opt('attach', 'WCH_MCP_ATTACH') ? 'attach ' + opt('attach', 'WCH_MCP_ATTACH') : flag('show') ? 'visible browser' : 'headless'}).`);
