// Export the VS Code test projects listed in .github/ci/test-matrix.json from index.html.
//
//   node .github/ci/export_projects.mjs --matrix .github/ci/test-matrix.json --out <dir> [--html index.html]
//                               [--browser <chrome/edge path> | --port <existing DevTools port>]
//
// The page is driven like a user would do it: pick the family and chip, open each
// peripheral tab and press "Add" with the default form values, switch BLE / USB on,
// set the project mode (split / single file), then call the page's own
// vscProjectFiles() and write the files to <out>/<name>-<mode>/.
// Needs Node 22+ (built-in fetch and WebSocket), no npm packages.
// Exit code 1 when a scenario has a page exception, a console error, a module that
// could not be added, or an export error.
import fs from 'fs';
import os from 'os';
import path from 'path';
import {spawn} from 'child_process';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const matrixFile = arg('matrix', '.github/ci/test-matrix.json');
const outRoot = path.resolve(arg('out', 'ci-out'));
const html = path.resolve(arg('html', 'index.html'));
const only = arg('only', '');
let port = arg('port', '');
const matrix = JSON.parse(fs.readFileSync(matrixFile, 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser = null, profile = null;
if (!port) {
  const exe = arg('browser', process.env.CHROME_PATH || (process.platform === 'win32'
    ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : 'google-chrome'));
  port = String(9500 + Math.floor(Math.random() * 400));
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wch-ci-'));
  browser = spawn(exe, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], {stdio: 'ignore'});
}

let page;
for (let i = 0; i < 80 && !page; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch (e) {}
  if (!page) await sleep(250);
}
if (!page) { console.error('no DevTools page on port ' + port); process.exit(2); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pend = {}; const consoleErr = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
  if (d.method === 'Runtime.exceptionThrown') { const x = d.params.exceptionDetails; consoleErr.push('exception: ' + (x.exception ? x.exception.description : x.text)); }
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') consoleErr.push('console.error: ' + d.params.args.map(a => a.value || a.description).join(' '));
};
const call = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({id: i, method, params})); });
const ev = async e => {
  const r = await call('Runtime.evaluate', {expression: e, returnByValue: true, awaitPromise: true});
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800));
  return r.result.result.value;
};
await call('Runtime.enable'); await call('Page.enable');
const url = 'file:///' + html.split(path.sep).join('/').replace(/^\/+/, '');
/* open the page and wait until its script has run (a cold browser start can take seconds) */
const loadPage = async () => {
  await call('Page.navigate', {url});
  for (let i = 0; i < 100; i++) {
    await sleep(200);
    try { if (await ev("document.readyState === 'complete' && typeof state === 'object' && typeof vscProjectFiles === 'function'")) break; } catch (e) {}
  }
  await sleep(200);
};

/* runs inside the page */
const scenarioJs = sc => `(async () => {
  const sc = ${JSON.stringify(sc)};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const errs = [], added = [];
  const famBtn = document.querySelector('[data-fam="' + sc.family + '"]');
  if (!famBtn) return {errs: ['no family ' + sc.family]};
  famBtn.click(); await sleep(50);
  const vs = document.getElementById('variantSelect');
  if (![...vs.options].some(o => o.value === sc.variant)) return {errs: ['no variant ' + sc.variant]};
  vs.value = sc.variant; vs.dispatchEvent(new Event('change')); await sleep(80);
  if (sc.pkg) { const ps = document.getElementById('pkgSelect'); if (ps) { ps.value = sc.pkg; ps.dispatchEvent(new Event('change')); await sleep(50); } }
  const visible = [...document.querySelectorAll('#catTree .cat-item')].map(e => e.dataset.tab);
  /* example: the page's own "Load example" (LED, button, SPI, UART, ADC, timer on real pins) */
  if (sc.example) { document.getElementById('exampleBtn').click(); await sleep(80); }
  /* pins: {"PA8": "GPIO_Output", ...} assigned like a click in the pinout view */
  for (const [g, fn] of Object.entries(sc.pins || {})) { try { assignPin(g, fn); } catch (e) { errs.push('pin ' + g + ' ' + fn + ': ' + e.message); } }
  if (sc.pins) { state.configs.forEach(relabel); renderAll(); await sleep(50); }
  /* 'all': every tab the chip shows, except gpio (set through the pinout, the tab has no form),
     BLE/USB (switched on below) and the types the example already added */
  const have = new Set(state.configs.map(c => c.type));
  const skip = new Set(['gpio', 'ble', 'usb', ...(sc.skip || [])]);
  const tabs = sc.modules === 'all' ? visible.filter(t => !skip.has(t) && !have.has(t)) : (sc.modules || []);
  for (const tab of tabs) {
    const ci = document.querySelector('#catTree .cat-item[data-tab="' + tab + '"]');
    if (!ci) { errs.push('tab not shown for this chip: ' + tab); continue; }
    ci.click(); await sleep(40);
    for (const [k, v] of Object.entries((sc.fields || {})[tab] || {})) {
      const e = document.getElementById('f_' + k);
      if (!e) { errs.push(tab + ': no field f_' + k); continue; }
      e.value = v; e.dispatchEvent(new Event('input')); e.dispatchEvent(new Event('change')); await sleep(10);
    }
    const n = state.configs.length;
    document.getElementById('addBtn').click(); await sleep(60);
    if (state.configs.length === n) errs.push('Add did not create a config for ' + tab); else added.push(tab);
  }
  const caps = chipCaps(currentVariant());
  if (sc.ble) { if (!caps.ble) errs.push('chip has no BLE'); state.ble.enabled = true; }
  if (sc.usb) { if (!caps.usb) errs.push('chip has no USB device'); state.usb.enabled = true; }
  state.project = Object.assign(state.project || {}, {name: sc.projName, split: sc.split});
  if (typeof renderAll === 'function') renderAll();
  await sleep(50);
  let files = null;
  try { files = vscProjectFiles().files; } catch (e) { errs.push('export: ' + e.message); }
  const probs = typeof computeProblems === 'function' ? computeProblems(computeUsage()).map(p => p.lvl + ': ' + p.msg) : [];
  return {errs, added: [...(sc.example ? ['example:' + [...have].join('+')] : []), ...added], visible, files, probs};
})()`;

const results = [];
let failed = 0;
for (const entry of matrix.projects) {
  for (const split of (entry.modes || matrix.modes || ['split', 'single'])) {
    const name = `${entry.name}-${split}`;
    if (only && !name.includes(only)) continue;
    const sc = Object.assign({}, entry, {split: split === 'split', projName: name.replace(/[^A-Za-z0-9_]/g, '_')});
    consoleErr.length = 0;
    await loadPage();
    let res;
    try { res = await ev(scenarioJs(sc)); } catch (e) { res = {errs: ['page: ' + e.message]}; }
    const errs = [...(res.errs || []), ...consoleErr];
    const dir = path.join(outRoot, name);
    fs.rmSync(dir, {recursive: true, force: true});
    if (res.files) for (const [p, t] of Object.entries(res.files)) {
      const f = path.join(dir, p); fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, t);
    }
    if (!res.files || !res.files['wch-project.json']) errs.push('no wch-project.json exported');
    const rep = {name, variant: entry.variant, split: sc.split, added: res.added || [], errs, problems: res.probs || []};
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'export-report.json'), JSON.stringify(rep, null, 1));
    results.push(rep);
    if (errs.length) failed++;
    console.log(`${errs.length ? 'FAIL' : 'ok  '} ${name}: ${(res.added || []).length} modules [${(res.added || []).join(' ')}]${entry.ble ? ' +BLE' : ''}${entry.usb ? ' +USB' : ''}, ${Object.keys(res.files || {}).length} files`);
    errs.forEach(e => console.log('     ERR ' + e));
  }
}
fs.writeFileSync(path.join(outRoot, 'export-summary.json'), JSON.stringify(results, null, 1));
ws.close();
if (browser) { browser.kill(); await sleep(500); try { fs.rmSync(profile, {recursive: true, force: true}); } catch (e) {} }
console.log(`${results.length - failed}/${results.length} projects exported`);
process.exit(failed ? 1 : 0);
