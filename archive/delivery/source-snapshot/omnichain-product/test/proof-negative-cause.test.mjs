import test from 'node:test';
import assert from 'node:assert/strict';
import { requireConstraintFailure } from '../experiments/pc5-proof-probe/expected-constraint-failure.mjs';

test('pinned Noir constraint failure retains its concrete cause', async () => {
  assert.deepEqual(await requireConstraintFailure(async () => { throw new Error('Cannot satisfy constraint'); }), { name: 'Error', message: 'Cannot satisfy constraint' });
});
test('resource, timeout and filesystem failures cannot pass the wrong-key negative check', async () => {
  for (const message of ['out of memory', 'ENOENT', 'timeout', 'Cannot satisfy constraint: backend unavailable']) {
    await assert.rejects(requireConstraintFailure(async () => { throw new Error(message); }), /Unexpected operational errors/);
  }
});
test('successful witness execution cannot pass the wrong-key negative check', async () => {
  await assert.rejects(requireConstraintFailure(async () => ({ witness: new Uint8Array() })), /Unexpected operational errors/);
});
