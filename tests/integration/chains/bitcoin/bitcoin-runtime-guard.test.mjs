/** Real owned Node children; no Bitcoin process, wallet or chain authority. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { startBitcoinAcceptanceGuard, BITCOIN_ACCEPTANCE_GUARD_POLICY } from './bitcoin-runtime-guard.mjs';

for (const signal of ['SIGTERM', 'SIGINT']) {
  test('owner ' + signal + ' drains only the owned child and reports cancellation', async () => {
    const helper = fileURLToPath(new URL('./fixtures/bitcoin-guard-signal-fixture.mjs', import.meta.url));
    const owner = spawn(process.execPath, [helper], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', diagnostic = '', ownedPID;
    const exit = once(owner, 'exit');
    const ready = new Promise((resolve, reject) => {
      owner.stdout.on('data', bytes => {
        output += bytes.toString();
        const line = output.split('\n').find(line => line.includes('"ready"'));
        if (line) { const value = JSON.parse(line); ownedPID = value.ownedPID; resolve(); }
      });
      owner.once('error', reject); owner.once('exit', () => { if (!ownedPID) reject(Error('fixture exited before ready')); });
    });
    owner.stderr.on('data', bytes => diagnostic += bytes.toString());
    try {
      await ready; assert.equal(owner.kill(signal), true);
      const [code, endedSignal] = await exit; assert.equal(code, 0, diagnostic); assert.equal(endedSignal, null);
      const result = JSON.parse(output.trim().split('\n').at(-1));
      assert.equal(result.failure, 'BITCOIN_ACCEPTANCE_OWNER_' + signal);
      assert.deepEqual(result.cleanup, { childStopped: true, exitCode: 0, signal: null, closeCalls: 1 });
      assert.throws(() => process.kill(ownedPID, 0), { code: 'ESRCH' });
    } finally { if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL'); }
  });
}

test('fixed total deadline rejects admission and closes once', async context => {
  context.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  let closes = 0;
  const guard = startBitcoinAcceptanceGuard(async () => ({ closed: true, calls: ++closes }), async () => {});
  context.mock.timers.tick(BITCOIN_ACCEPTANCE_GUARD_POLICY.totalMilliseconds);
  assert.equal(await guard.failed, 'BITCOIN_ACCEPTANCE_TOTAL_DEADLINE');
  assert.throws(() => guard.assertActive(), /TOTAL_DEADLINE/);
  const ended = await guard.finish(); assert.equal(ended.cleanup.calls, 1); assert.equal(closes, 1);
});

test('periodic resource failure closes the owned fixture and cannot produce success', async context => {
  context.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  let closes = 0;
  const guard = startBitcoinAcceptanceGuard(async () => ({ closed: true, calls: ++closes }), async () => {
    throw Error('BITCOIN_ACCEPTANCE_RAM_FLOOR');
  });
  context.mock.timers.tick(BITCOIN_ACCEPTANCE_GUARD_POLICY.sampleMilliseconds);
  assert.equal(await guard.failed, 'BITCOIN_ACCEPTANCE_RAM_FLOOR');
  assert.throws(() => guard.assertActive(), /RAM_FLOOR/);
  const ended = await guard.finish(); assert.equal(ended.failure, 'BITCOIN_ACCEPTANCE_RAM_FLOOR'); assert.equal(closes, 1);
});
