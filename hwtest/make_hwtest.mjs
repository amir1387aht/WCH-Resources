// Hardware test projects: blink + UART banner + ADC + PWM + timer IRQ count, PASS/FAIL over UART.
//
//   node hwtest/make_hwtest.mjs [--boards hwtest/boards.json] [--out hwtest-out] [--html index.html]
//                               [--mode split|single|both] [--only <name part>]
//                               [--browser <chrome/edge path> | --port <DevTools port>]
//
// For every board the configurator itself (index.html in headless Chrome/Edge) makes
// the project: chip + package, "Load example", keep the UART / ADC / timer / LED
// configs, add a 1 kHz timer interrupt, export the VS Code project. Then this script
// adds src/hwtest.c + src/hwtest.h (written for exactly those configs) and three
// calls in the USER CODE sections of src/main.c. So the board runs the init code the
// configurator generates, and hwtest.c checks it from the outside.
// Needs Node 22+ (built-in fetch and WebSocket), no npm packages.
import fs from 'fs';
import os from 'os';
import path from 'path';
import {spawn} from 'child_process';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const boardsFile = arg('boards', path.join(here, 'boards.json'));
const outRoot = path.resolve(arg('out', 'hwtest-out'));
const html = path.resolve(arg('html', path.join(here, '..', 'index.html')));
const mode = arg('mode', 'split');
const only = arg('only', '');
let port = arg('port', '');
const cfg = JSON.parse(fs.readFileSync(boardsFile, 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser = null, profile = null;
if (!port) {
  const exe = arg('browser', process.env.CHROME_PATH || (process.platform === 'win32'
    ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : 'google-chrome'));
  port = String(9500 + Math.floor(Math.random() * 400));
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wch-hwtest-'));
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
let id = 0; const pend = {}; const pageErr = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
  if (d.method === 'Runtime.exceptionThrown') pageErr.push(d.params.exceptionDetails.text);
};
const call = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({id: i, method, params})); });
const ev = async e => {
  const r = await call('Runtime.evaluate', {expression: e, returnByValue: true, awaitPromise: true});
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
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

/* ---------- in the page: build the configuration and export ---------- */
const pageJs = (b, split) => `(async () => {
  const b = ${JSON.stringify(b)};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('[data-fam="' + b.family + '"]').click(); await sleep(50);
  const vs = document.getElementById('variantSelect'); vs.value = b.variant; vs.dispatchEvent(new Event('change')); await sleep(80);
  if (state.variant !== b.variant) throw new Error('no variant ' + b.variant);
  if (b.pkg) { const ps = document.getElementById('pkgSelect'); ps.value = b.pkg; ps.dispatchEvent(new Event('change')); await sleep(50);
    if (state.pkg !== b.pkg) throw new Error('no package ' + b.pkg); }
  document.getElementById('exampleBtn').click(); await sleep(80);
  for (const [g, fn] of Object.entries(b.pins || {})) assignPin(g, fn);
  /* keep what the test uses; SPI / EXTI pins are freed (on CH5xx PA12 becomes the PWM pin) */
  const keep = ['uart', 'adc', 'timer', 'gpio'];
  state.configs = state.configs.filter(c => keep.includes(c.type));
  for (const t of ['uart', 'adc', 'gpio']) state.configs.filter(c => c.type === t).slice(1).forEach(c => state.configs.splice(state.configs.indexOf(c), 1));
  for (const k of Object.keys(state.labels || {})) if (state.labels[k] !== 'LED') delete state.labels[k];
  const v = currentVariant(), std = isStd(), clk = clockFreqs();
  let irq = null;
  if (std) {
    const pwm = state.configs.find(c => c.type === 'timer' && c.mode === 'pwm');
    const inst = b.irqTimer || v.tim.find(t => !pwm || t !== pwm.inst);
    if (pwm && inst === pwm.inst) throw new Error('irqTimer ' + inst + ' is the PWM timer');
    const tclk = timBus(inst) === 'APB2' ? clk.tim1clk : clk.tim2clk;
    const psc = Math.round(tclk / 1e6) - 1;
    irq = {id: state.seq++, type: 'timer', family: state.family, variant: state.variant, inst, mode: 'update_it', psc: String(psc), arr: '999', label: inst + ' · 1 kHz update IRQ (hwtest)'};
    state.configs.push(irq);
    irq = {hz: tclk / ((psc + 1) * 1000)};
  }
  state.configs.forEach(relabel);
  state.project = Object.assign(state.project || {}, {name: b.name.replace(/[^A-Za-z0-9_]/g, '_'), split: ${split}});
  renderAll(); await sleep(50);
  const probs = computeProblems(computeUsage()).map(p => p.lvl + ': ' + p.msg);
  const files = vscProjectFiles().files;
  return {std, clk, irqHz: irq ? irq.hz : 1000, configs: state.configs, labels: state.labels, files, probs, pkg: state.pkg};
})()`;

/* ---------- hwtest.c ---------- */
const P = (port, pin) => `P${port}${pin}`;
function stdSource(b, r) {
  const u = r.configs.find(c => c.type === 'uart');
  const a = r.configs.find(c => c.type === 'adc');
  const pwm = r.configs.find(c => c.type === 'timer' && c.mode === 'pwm');
  const it = r.configs.find(c => c.type === 'timer' && c.mode === 'update_it');
  const led = r.configs.find(c => c.type === 'gpio');
  if (!u || !a || !pwm || !it || !led) throw new Error(b.name + ': example lacks ' + ['uart', 'adc', 'pwm', 'irq timer', 'led'].filter((x, i) => ![u, a, pwm, it, led][i]).join(', '));
  const pulse = Math.round((parseInt(pwm.arr) + 1) * parseInt(pwm.duty) / 100);
  const pwmHz = (pwm.inst === 'TIM1' ? r.clk.tim1clk : r.clk.tim2clk) / ((parseInt(pwm.psc) + 1) * (parseInt(pwm.arr) + 1));
  const irqName = ['TIM1', 'TIM8', 'TIM9', 'TIM10'].includes(it.inst) ? it.inst + '_UP_IRQHandler' : it.inst + '_IRQHandler';
  const isrAttr = b.family === 'ch32f' ? '' : ' __attribute__((interrupt("WCH-Interrupt-fast")))';
  return `/* hwtest.c - hardware test for the ${b.variant} (${r.pkg}) project made by WCH Configurator.
 * Checks the generated init code on the real board and prints PASS/FAIL lines on
 * ${u.inst} (${u.baud} baud, TX=${P(u.txPort || u.port, u.tx)}). Then the LED on ${P(led.port, led.pin)} blinks at 1 Hz.
 */
${r.inc}
#include "hwtest.h"

#define HW_UART        ${u.inst}
#define HW_LED_GPIO    GPIO${led.port}
#define HW_LED_PIN     GPIO_Pin_${led.pin}
#define HW_PWM_TIM     ${pwm.inst}
#define HW_IRQ_TIM     ${it.inst}
#define HW_SYSCLK      ${r.clk.hclk}u        /* HCLK the configurator expects */
#define HW_IRQ_HZ      ${Math.round(r.irqHz)}u          /* ${it.inst} update rate the configurator set up */

static volatile uint32_t hw_irq_count;
static uint32_t hw_pass, hw_fail;

void ${irqName}(void)${isrAttr};
void ${irqName}(void)
{
    if(TIM_GetITStatus(HW_IRQ_TIM, TIM_IT_Update) != RESET)
    {
        TIM_ClearITPendingBit(HW_IRQ_TIM, TIM_IT_Update);
        hw_irq_count++;
    }
}

static void hw_putc(char ch)
{
    while(USART_GetFlagStatus(HW_UART, USART_FLAG_TXE) == RESET);
    USART_SendData(HW_UART, (uint16_t)ch);
}

static void hw_puts(const char *s)
{
    while(*s) hw_putc(*s++);
}

static void hw_putu(uint32_t v)
{
    char b[11];
    int i = 0;
    do { b[i++] = (char)('0' + v % 10u); v /= 10u; } while(v);
    while(i) hw_putc(b[--i]);
}

static void hw_result(int ok, const char *name)
{
    if(ok) hw_pass++; else hw_fail++;
    hw_puts(ok ? "PASS " : "FAIL ");
    hw_puts(name);
}

static int hw_within(uint32_t v, uint32_t want, uint32_t pct)
{
    uint32_t d = want * pct / 100u;
    return v + d >= want && v <= want + d;
}

void hwtest_run(void)
{
    uint32_t i, v, mn = 0xFFFF, mx = 0, sum = 0, n = 0, c0, c1;
    int ok;

    Delay_Ms(20);
    hw_puts("\\r\\n=== WCH HWTEST ${b.variant} ${r.pkg} ===\\r\\n");

    /* clock: SystemCoreClock against the clock tree the configurator set up */
    hw_puts("INFO clock SystemCoreClock="); hw_putu(SystemCoreClock);
    hw_puts(" Hz, configurator HCLK="); hw_putu(HW_SYSCLK); hw_puts(" Hz\\r\\n");
    hw_result(hw_within(SystemCoreClock, HW_SYSCLK, 1), "clock\\r\\n");

    /* UART: if this line is readable, ${u.inst} runs at ${u.baud} baud */
    hw_result(1, "uart ${u.inst} ${u.baud} baud TX=${P(u.txPort || u.port, u.tx)} RX=${P(u.rxPort || u.port, u.rx)} (this text is readable)\\r\\n");

    /* GPIO: drive the LED pin and read the pin level back */
    GPIO_WriteBit(HW_LED_GPIO, HW_LED_PIN, Bit_SET);
    Delay_Ms(1);
    ok = GPIO_ReadInputDataBit(HW_LED_GPIO, HW_LED_PIN) == Bit_SET;
    GPIO_WriteBit(HW_LED_GPIO, HW_LED_PIN, Bit_RESET);
    Delay_Ms(1);
    ok = ok && GPIO_ReadInputDataBit(HW_LED_GPIO, HW_LED_PIN) == Bit_RESET;
    hw_result(ok, "gpio LED ${P(led.port, led.pin)} high/low read back\\r\\n");

    /* ADC: 16 software-started conversions on the configured channel */
    for(i = 0; i < 16; i++)
    {
        uint32_t t = 100000;
        ADC_SoftwareStartConvCmd(${a.inst}, ENABLE);
        while(ADC_GetFlagStatus(${a.inst}, ADC_FLAG_EOC) == RESET && --t);
        if(!t) break;
        v = ADC_GetConversionValue(${a.inst});
        if(v < mn) mn = v;
        if(v > mx) mx = v;
        sum += v; n++;
    }
    hw_result(n == 16 && mx <= 4095u, "adc ${a.inst} ch${a.ch} ${P(a.port, a.pin)}: ");
    hw_putu(n); hw_puts(" conversions, min="); hw_putu(n ? mn : 0); hw_puts(" max="); hw_putu(mx);
    hw_puts(" avg="); hw_putu(n ? sum / n : 0); hw_puts(" (about "); hw_putu(n ? sum / n * 3300u / 4095u : 0); hw_puts(" mV at 3.3 V)\\r\\n");

    /* PWM: the counter runs and the compare value is the configured duty */
    c0 = TIM_GetCounter(HW_PWM_TIM);
    Delay_Us(150);
    c1 = TIM_GetCounter(HW_PWM_TIM);
    v = TIM_GetCapture${pwm.ch}(HW_PWM_TIM);
    hw_result(c0 != c1 && v == ${pulse}u, "pwm ${pwm.inst} ch${pwm.ch} ${P(pwm.pwmPort || pwm.port, pwm.pwmPin)}: counter ");
    hw_puts(c0 != c1 ? "running" : "STOPPED"); hw_puts(", CCR="); hw_putu(v);
    hw_puts(" (want ${pulse} = ${pwm.duty}% of ${parseInt(pwm.arr) + 1}), about ${Math.round(pwmHz)} Hz on the pin\\r\\n");

    /* timer interrupt: count ${it.inst} update IRQs for 1 s (SysTick delay) */
    c0 = hw_irq_count;
    Delay_Ms(1000);
    v = hw_irq_count - c0;
    hw_result(hw_within(v, HW_IRQ_HZ, 3), "timer ${it.inst} update IRQ: ");
    hw_putu(v); hw_puts(" in 1 s (want "); hw_putu(HW_IRQ_HZ); hw_puts(" +-3%)\\r\\n");

    hw_puts(hw_fail ? "RESULT FAIL (" : "RESULT PASS ("); hw_putu(hw_pass); hw_puts(" pass, "); hw_putu(hw_fail); hw_puts(" fail)\\r\\n");
}

void hwtest_loop(void)
{
    static uint32_t ticks;
    GPIO_WriteBit(HW_LED_GPIO, HW_LED_PIN, (ticks & 1u) ? Bit_SET : Bit_RESET);
    Delay_Ms(500);
    if(++ticks % 10u == 0)
    {
        hw_puts("ALIVE "); hw_putu(ticks / 2u); hw_puts(" s, irq="); hw_putu(hw_irq_count); hw_puts("\\r\\n");
    }
}
`;
}

function bleSource(b, r) {
  const u = r.configs.find(c => c.type === 'uart');
  const a = r.configs.find(c => c.type === 'adc');
  const it = r.configs.find(c => c.type === 'timer' && c.it === '1');
  const led = r.configs.find(c => c.type === 'gpio');
  const pw = b.ch5xxPwm;
  if (!u || !a || !it || !led || !pw) throw new Error(b.name + ': example lacks uart/adc/timer/led or ch5xxPwm missing');
  const t = it.inst, hz = Math.round(1e6 / parseInt(it.period));
  const used = [u, a, led].some(c => (c.port === pw.port && String(c.pin) === String(pw.pin)) || (c.txPort === pw.port && c.tx == pw.pin) || (c.rxPort === pw.port && c.rx == pw.pin));
  if (used) throw new Error(b.name + ': PWM pin is used by another config');
  return `/* hwtest.c - hardware test for the ${b.variant} (${r.pkg}) project made by WCH Configurator.
 * Checks the generated init code on the real board and prints PASS/FAIL lines on
 * ${u.inst} (${u.baud} baud, TX=${P(u.txPort || u.port, u.tx)}). Then the LED on ${P(led.port, led.pin)} blinks at 1 Hz.
 * The PWM on ${P(pw.port, pw.pin)} (PWM${pw.ch}) is set up here: the configurator has no CH5xx PWM option.
 */
${r.inc}
#include "hwtest.h"

#define HW_SYSCLK      ${r.clk.sysclk}u      /* system clock the configurator expects */
#define HW_IRQ_HZ      ${hz}u          /* ${t} cycle rate the configurator set up (${it.period} us) */

static volatile uint32_t hw_irq_count;
static uint32_t hw_pass, hw_fail;

/* the generated ${t}_IRQHandler() calls this hook on every cycle end */
void ${t}_PeriodElapsedCallback(void)
{
    hw_irq_count++;
}

static void hw_puts(const char *s)
{
    uint16_t n = 0;
    while(s[n]) n++;
    ${u.inst}_SendString((uint8_t *)s, n);
}

static void hw_putu(uint32_t v)
{
    char b[11], o[11];
    int i = 0, k = 0;
    do { b[i++] = (char)('0' + v % 10u); v /= 10u; } while(v);
    while(i) o[k++] = b[--i];
    o[k] = 0;
    hw_puts(o);
}

static void hw_result(int ok, const char *name)
{
    if(ok) hw_pass++; else hw_fail++;
    hw_puts(ok ? "PASS " : "FAIL ");
    hw_puts(name);
}

static int hw_within(uint32_t v, uint32_t want, uint32_t pct)
{
    uint32_t d = want * pct / 100u;
    return v + d >= want && v <= want + d;
}

void hwtest_run(void)
{
    uint32_t i, v, mn = 0xFFFF, mx = 0, sum = 0, c0;
    int ok;

    DelayMs(20);
    hw_puts("\\r\\n=== WCH HWTEST ${b.variant} ${r.pkg} ===\\r\\n");

    /* clock: GetSysClock() against the clock the configurator set up */
    hw_puts("INFO clock GetSysClock="); hw_putu(GetSysClock());
    hw_puts(" Hz, configurator "); hw_putu(HW_SYSCLK); hw_puts(" Hz\\r\\n");
    hw_result(hw_within(GetSysClock(), HW_SYSCLK, 1), "clock\\r\\n");

    /* UART: if this line is readable, ${u.inst} runs at ${u.baud} baud */
    hw_result(1, "uart ${u.inst} ${u.baud} baud TX=${P(u.txPort || u.port, u.tx)} RX=${P(u.rxPort || u.port, u.rx)} (this text is readable)\\r\\n");

    /* GPIO: drive the LED pin and read the pin level back */
    GPIO${led.port}_SetBits(GPIO_Pin_${led.pin});
    DelayMs(1);
    ok = GPIO${led.port}_ReadPortPin(GPIO_Pin_${led.pin}) != 0;
    GPIO${led.port}_ResetBits(GPIO_Pin_${led.pin});
    DelayMs(1);
    ok = ok && GPIO${led.port}_ReadPortPin(GPIO_Pin_${led.pin}) == 0;
    hw_result(ok, "gpio LED ${P(led.port, led.pin)} high/low read back\\r\\n");

    /* ADC: 16 conversions on the configured channel */
    for(i = 0; i < 16; i++)
    {
        v = ADC_ExcutSingleConver();
        if(v < mn) mn = v;
        if(v > mx) mx = v;
        sum += v;
    }
    hw_result(mx <= 4095u, "adc ch${a.ch} ${P(a.port, a.pin)}: 16 conversions, min=");
    hw_putu(mn); hw_puts(" max="); hw_putu(mx); hw_puts(" avg="); hw_putu(sum / 16u); hw_puts(" (raw)\\r\\n");

    /* PWM${pw.ch} on ${P(pw.port, pw.pin)}: 50% duty, 64 steps of 4 system clocks (EVT PWMX example) */
    GPIO${pw.port}_ModeCfg(GPIO_Pin_${pw.pin}, GPIO_ModeOut_PP_5mA);
    PWMX_CLKCfg(4);
    PWMX_CycleCfg(PWMX_Cycle_64);
    PWMX_ACTOUT(CH_PWM${pw.ch}, 64 / 2, High_Level, ENABLE);
    hw_result((R8_PWM_OUT_EN & CH_PWM${pw.ch}) != 0, "pwm PWM${pw.ch} ${P(pw.port, pw.pin)}: output enabled, 50%, about ");
    hw_putu(HW_SYSCLK / 4u / 64u); hw_puts(" Hz on the pin\\r\\n");

    /* timer interrupt: count ${t} cycle IRQs for 1 s */
    c0 = hw_irq_count;
    DelayMs(1000);
    v = hw_irq_count - c0;
    hw_result(hw_within(v, HW_IRQ_HZ, 5), "timer ${t} cycle IRQ: ");
    hw_putu(v); hw_puts(" in 1 s (want "); hw_putu(HW_IRQ_HZ); hw_puts(" +-5%)\\r\\n");

    hw_puts(hw_fail ? "RESULT FAIL (" : "RESULT PASS ("); hw_putu(hw_pass); hw_puts(" pass, "); hw_putu(hw_fail); hw_puts(" fail)\\r\\n");
}

void hwtest_loop(void)
{
    static uint32_t ticks;
    if(ticks & 1u) GPIO${led.port}_SetBits(GPIO_Pin_${led.pin}); else GPIO${led.port}_ResetBits(GPIO_Pin_${led.pin});
    DelayMs(500);
    if(++ticks % 10u == 0)
    {
        hw_puts("ALIVE "); hw_putu(ticks / 2u); hw_puts(" s, irq="); hw_putu(hw_irq_count); hw_puts("\\r\\n");
    }
}
`;
}

const header = `/* hwtest.h - hardware test entry points (see hwtest.c) */
#ifndef HWTEST_H
#define HWTEST_H

void hwtest_run(void);   /* once, after Peripheral_Init() */
void hwtest_loop(void);  /* in the main loop: LED blink + ALIVE line */

#endif
`;

function hookMain(t) {
  const nl = t.includes('\r\n') ? '\r\n' : '\n';
  const ins = (s, anchor, add) => {
    if (s.split(anchor).length !== 2) throw new Error('main.c anchor not found once: ' + anchor);
    return s.replace(anchor, anchor + nl + add);
  };
  t = ins(t, '/* USER CODE BEGIN Includes */', '#include "hwtest.h"');
  t = ins(t, '/* USER CODE BEGIN 2 */', '    hwtest_run();');
  t = ins(t, '/* USER CODE BEGIN WHILE */', '        hwtest_loop();');
  return t;
}

const modes = mode === 'both' ? [true, false] : [mode !== 'single'];
const summary = [];
let failed = 0;
for (const b of cfg.boards) {
  if (only && !b.name.includes(only)) continue;
  for (const split of modes) {
    const name = b.name + (modes.length > 1 ? (split ? '-split' : '-single') : '');
    pageErr.length = 0;
    await loadPage();
    try {
      const r = await ev(pageJs(b, split));
      const files = r.files;
      /* split mode: main.h; single file: the same includes as main.c */
      r.inc = files['src/main.h'] ? '#include "main.h"'
        : files['src/main.c'].split('/* USER CODE BEGIN Includes */')[0].split(/\r?\n/).filter(l => /^#include\s/.test(l)).join('\n');
      files['src/hwtest.c'] = r.std ? stdSource(b, r) : bleSource(b, r);
      files['src/hwtest.h'] = header;
      files['src/main.c'] = hookMain(files['src/main.c']);
      const dir = path.join(outRoot, name);
      fs.rmSync(dir, {recursive: true, force: true});
      for (const [p, t] of Object.entries(files)) { const f = path.join(dir, p); fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, t); }
      const labels = r.configs.map(c => c.label);
      fs.writeFileSync(path.join(dir, 'HWTEST.txt'), `${b.variant} ${r.pkg}\n` + labels.map(l => ' - ' + l).join('\n') + '\n' +
        (b.ch5xxPwm ? ` - PWM${b.ch5xxPwm.ch} on P${b.ch5xxPwm.port}${b.ch5xxPwm.pin} (set up by hwtest.c)\n` : '') + (r.probs.length ? 'Configurator notes:\n' + r.probs.map(p => ' - ' + p).join('\n') + '\n' : ''));
      console.log(`ok   ${name}: ${labels.join(' | ')}${b.ch5xxPwm ? ` | PWM${b.ch5xxPwm.ch} P${b.ch5xxPwm.port}${b.ch5xxPwm.pin}` : ''}`);
      pageErr.forEach(e => console.log('     page error: ' + e));
      summary.push({name, ok: !pageErr.length, labels});
      if (pageErr.length) failed++;
    } catch (e) {
      console.log(`FAIL ${name}: ${e.message}`); failed++; summary.push({name, ok: false, error: e.message});
    }
  }
}
fs.mkdirSync(outRoot, {recursive: true});
fs.writeFileSync(path.join(outRoot, 'hwtest-summary.json'), JSON.stringify(summary, null, 1));
ws.close();
if (browser) { browser.kill(); await sleep(500); try { fs.rmSync(profile, {recursive: true, force: true}); } catch (e) {} }
process.exit(failed ? 1 : 0);
