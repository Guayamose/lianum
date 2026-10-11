import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { once } from 'node:events';
import { startLocalServer } from '../../../packages/backend/src/api/private-runtime-server.mjs';
import { unusedLoopbackPort, sleep, projectRoot } from '../../../packages/engine/src/chains/shared/runtime-harness.mjs';

const app = await startLocalServer({ port: 0 }), profile = await mkdtemp(join(projectRoot, '.local/m9-browser-'));
const milestone = process.argv[2] || 'm9'; assert.ok(['m9', 'm10'].includes(milestone));
const port = await unusedLoopbackPort();
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', `--user-data-dir=${profile}`, `--disk-cache-dir=${join(profile, 'cache')}`, `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', '--window-size=1440,1200', app.origin + '/#native'], { windowsHide: true, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH, TEMP: profile, TMP: profile }, stdio: ['ignore', 'ignore', 'pipe'] });
const report = { classification: 'BROWSER_BUTTONS_DRIVE_REAL_LOCAL_EVM_BITCOIN_NOT_PRIVATE_OR_TRIPLE', phase: 'starting', steps: [], scriptExceptions: [], screenshots: [], protocolMessages: [] };
let socket;
chrome.stderr.on('data', bytes => { report.browserDiagnostic = ((report.browserDiagnostic || '') + bytes.toString()).replaceAll(profile, '[OWN_BROWSER_PROFILE]').slice(0, 3000); });
try {
  let target;
  for (let i = 0; i < 100; i++) { try { const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = pages.find(p => p.type === 'page'); if (target) break; } catch {} await sleep(100); }
  assert.ok(target); socket = new WebSocket(target.webSocketDebuggerUrl); await once(socket, 'open');
  let next = 0; const pending = new Map();
  socket.addEventListener('message', e => {
    const m = JSON.parse(e.data); if (report.protocolMessages.length < 20) report.protocolMessages.push({ id: m.id, method: m.method, error: m.error?.message });
    if (m.method === 'Runtime.exceptionThrown') report.scriptExceptions.push(m.params.exceptionDetails.text);
    const promise = pending.get(m.id); if (promise) { pending.delete(m.id); clearTimeout(promise.timer); m.error ? promise.reject(new Error(m.error.message)) : promise.done(m.result); }
  });
  const cdp = (method, params = {}) => new Promise((done, reject) => {
    const id = ++next; const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP_TIMEOUT:' + method)); }, 10000);
    pending.set(id, { done, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('BROWSER_EVALUATION_FAILED'); return r.result.value; };
  report.browserVersion = await cdp('Browser.getVersion');
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Page.navigate', { url: app.origin + '/#native' });
  for (let i = 0; i < 100; i++) { if (await evaluate("!!document.querySelector('[data-native=prepare]') && !document.querySelector('[data-native=prepare]').disabled")) break; await sleep(100); }
  const click = async (action, status) => {
    assert.equal(await evaluate(`!document.querySelector('[data-native=${action}]').disabled`), true, action + ' enabled');
    const previousStatus = await evaluate("document.getElementById('native-status').textContent");
    await evaluate(`document.querySelector('[data-native=${action}]').click()`);
    let matched = false;
    for (let i = 0; i < 600; i++) {
      const view = await evaluate("({text:document.getElementById('native-status').textContent,idle:[...document.querySelectorAll('[data-native]')].some(b=>!b.disabled)})");
      if (view.text === status && view.idle) { matched = true; break; }
      if (view.text !== status && view.text !== previousStatus) assert.notEqual(view.text, 'Revisión necesaria'); await sleep(100);
    }
    assert.ok(matched, action + ' completed'); report.steps.push({ action, displayedStatus: status });
  };
  const shot = async name => {
    const clip = await evaluate("(()=>{const r=document.getElementById('native').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()");
    const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
    const path = 'evidence/' + name; await writeFile(join(projectRoot, path), Buffer.from(result.data, 'base64')); report.screenshots.push(path);
  };
  await click('prepare', 'Entorno preparado'); await click('lock', 'EVM retenido'); await click('send', 'Bitcoin pendiente'); await click('confirm', 'Bitcoin confirmado localmente');
  if (milestone === 'm10') {
    const runtime = app.native.ownedRuntimeForReview, send = runtime.send;
    runtime.send = async (...args) => { const receipt = await send(...args); if (args[0].includes('pays solver')) { runtime.send = send; throw new Error('INJECTED_RESPONSE_LOSS'); } return receipt; };
    await click('settle', 'Revisión necesaria'); await click('reconcile', 'Pago EVM ejecutado'); report.injectedLossAfterNativePayout = true;
  } else await click('settle', 'Pago EVM ejecutado');
  await shot(milestone + '-client-paid.png');
  await cdp('Page.reload'); await sleep(1800); assert.equal(await evaluate("document.getElementById('native-status').textContent"), 'Pago EVM ejecutado'); report.reloadPreservedOperation = true;
  await click('lock', 'EVM retenido'); await click('send', 'Bitcoin pendiente'); await click('confirm', 'Bitcoin confirmado localmente'); await click('expire', 'Plazo vencido'); await click('refund', 'EVM recuperado');
  await shot(milestone + '-client-unpaid-delivery.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await shot(milestone + '-client-narrow.png');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'narrow layout must not overflow');
  report.narrowLayoutWidth = 390;
  report.sourceSHA256 = {};
  for (const path of ['client/index.html', 'client/style.css', 'client/native.mjs', 'src/server.mjs', 'src/native-local.mjs', 'src/native-authority.mjs', 'src/chains/native-runtime.mjs', 'contracts/LocalBitcoinDeliveryEscrow.sol', 'scripts/qa-native-client.mjs']) report.sourceSHA256[path] = createHash('sha256').update(await readFile(join(projectRoot, path))).digest('hex');
  report.finalSnapshot = app.native.snapshot(); report.solanaPrerequisiteVisible = await evaluate("document.querySelector('.native-prerequisite').textContent.includes('Solana no se ejecuta')");
  assert.equal(report.solanaPrerequisiteVisible, true); assert.deepEqual(report.scriptExceptions, []); report.phase = 'completed';
} catch (error) { report.phase = 'failed'; report.failure = error.message; process.exitCode = 1; console.error(error.message); }
finally { if (socket) socket.close(); if (chrome.exitCode === null) { const exit = once(chrome, 'exit'); chrome.kill(); await exit; } await app.close(); report.ownRuntimesStopped = true; await writeFile(join(projectRoot, `evidence/${milestone}-browser-client.json`), JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ phase: report.phase, browserActions: report.steps.length, screenshotCount: report.screenshots.length, scriptExceptions: report.scriptExceptions.length }));
