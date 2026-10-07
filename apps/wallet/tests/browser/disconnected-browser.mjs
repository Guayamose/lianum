/** Real Chromium smoke for the disconnected wallet. No keys, labs or funds. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { startWalletApplication } from '../../src/server/server.mjs';

const reports = process.env.LIANUM_BROWSER_REPORT_DIRECTORY;
assert.ok(reports && reports.startsWith('/'), 'BROWSER_REPORT_DIRECTORY_REQUIRED');
const memory = async () => Number(/^MemAvailable:\s+(\d+) kB$/m.exec(await readFile('/proc/meminfo', 'utf8'))?.[1] ?? 0) * 1024;
assert.ok(await memory() >= 4 * 1024 ** 3, 'BROWSER_INITIAL_MEMORY_FLOOR');
await mkdir(reports, { recursive: true, mode: 0o700 });
const app = await startWalletApplication();
let browser;
const report = { format: 'LIANUM_DISCONNECTED_BROWSER_SMOKE_V1', accepted: false,
  connectedEconomicFlow: false, physicalDeviceAcceptance: false, nativeEffects: 0 };
const requests = [];
const errors = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true,
    timeout: 30_000, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const request = route.request();
    const target = new URL(request.url());
    requests.push({ method: request.method(), path: target.pathname, ownOrigin: target.origin === app.origin });
    return target.origin === app.origin ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push({ name: error.name }));
  page.on('response', response => {
    if (response.status() >= 400 && new URL(response.url()).pathname !== '/favicon.ico')
      errors.push({ name: 'HTTP_' + response.status(), path: new URL(response.url()).pathname });
  });
  await page.goto(app.origin, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForFunction(() => document.getElementById('connection-badge')?.textContent === 'Desconectado',
    null, { timeout: 10_000 });
  assert.deepEqual(errors, [], 'BROWSER_SCRIPTS_OR_HTTP_FAILED');
  assert.equal(await page.locator('#asset-cards .asset-card').count(), 0, 'BROWSER_FICTIONAL_ASSETS');
  assert.match(await page.locator('#asset-cards').innerText(), /no disponible/i);
  assert.equal(await page.locator('#account').isVisible(), false, 'BROWSER_UNBOUND_ACCOUNT_VISIBLE');
  assert.equal(await page.locator('meta[name="wallet-owner-token"],meta[name="wallet-action-token"]').count(), 0);
  assert.equal((await page.content()).includes(app.ownerAccess.token), false, 'BROWSER_OWNER_TOKEN_DISCLOSED');
  const submissions = await page.locator('#action-forms button[type="submit"]').evaluateAll(elements =>
    elements.map(element => element.disabled));
  assert.ok(submissions.length > 0 && submissions.every(Boolean), 'BROWSER_DISCONNECTED_ACTION_ENABLED');
  await page.locator('#refresh').click();
  await page.waitForFunction(() => document.getElementById('refresh')?.disabled === false);
  assert.equal(await page.locator('#connection-badge').innerText(), 'Desconectado');
  assert.deepEqual(errors, []);
  assert.ok(requests.every(request => request.ownOrigin && request.method === 'GET'), 'BROWSER_UNEXPECTED_REQUEST');
  assert.ok(await memory() >= 2.5 * 1024 ** 3, 'BROWSER_AVAILABLE_MEMORY_FLOOR');
  await page.screenshot({ path: reports + '/browser-disconnected.png', fullPage: true });
  Object.assign(report, { accepted: true, browserVersion: browser.version(),
    testedBehavior: ['module-loading', 'disconnected-state', 'no-fictitious-balance', 'disabled-actions',
      'token-removal', 'explicit-refresh', 'own-origin-get-only'], requests, scriptErrors: errors });
} finally {
  try { await browser?.close(); } finally { await app.close(); }
  report.browserClosed = true; report.serverClosed = true;
  await writeFile(reports + '/browser-disconnected.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
assert.equal(report.accepted, true);
process.stdout.write(JSON.stringify({ accepted: report.accepted, scope: report.format,
  browserVersion: report.browserVersion, connectedEconomicFlow: false, report: reports + '/browser-disconnected.json' }) + '\n');
