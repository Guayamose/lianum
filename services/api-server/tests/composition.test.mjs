import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../src/entry.mjs', import.meta.url));
function environment() {
  // Never inherit a developer's database/keys into this disconnected test.
  return { PATH: process.env.PATH, LIANUM_PUBLIC_ORIGIN: 'https://wallet.example.test' };
}
test('one executable entry starts the actual disconnected admission service and closes cleanly', { timeout: 4000 }, async t => {
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['--max-old-space-size=384', entry, 'admission'], {
    env: { ...environment(), PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', errors = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stderr.on('data', value => { errors += value; });
  const finished = once(child, 'exit');
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); await finished; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('ENTRY_START_TIMEOUT')), 2000); timer.unref();
    child.once('error', reject); child.once('exit', () => { clearTimeout(timer); reject(Error('ENTRY_START_FAILED')); });
    child.stdout.on('data', value => { output += value; if (output.includes('\n')) { clearTimeout(timer); resolve(); } });
  });
  assert.equal(JSON.parse(output.trim()).operations, 'UNAVAILABLE');
  const origin = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(origin + '/health/live')).status, 200);
  assert.equal((await fetch(origin + '/health/ready')).status, 503);
  const state = await (await fetch(origin + '/v1/mobile/state')).json();
  assert.equal(state.connection, 'DISCONNECTED'); assert.equal(state.privatePortfolio, null);
  assert.ok(Object.values(state.capabilities).every(value => value === false));
  child.kill('SIGTERM'); assert.deepEqual(await finished, [0, null]);
  assert.ok(errors.includes('SERVICE_STARTED'));
});
test('unknown profiles and extra CLI fields fail before opening any configured infrastructure', async () => {
  for (const args of [['arbitrary-executor'], ['admission', 'ignored-options']]) {
    await assert.rejects(promisify(execFile)(process.execPath, [entry, ...args], { env: environment(), timeout: 2000 }), error => {
      assert.equal(error.code, 1); assert.equal(error.stdout, '');
      assert.match(error.stderr, /PLATFORM_PROFILE_INVALID/); return true;
    });
  }
});
