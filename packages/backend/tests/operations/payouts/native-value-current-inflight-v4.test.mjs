/** Execute the original private pending-check body over inert reader/round ports.
 * These four races establish no native, signer, deployment or financial authority.
 * No production export, fake successful current-view certificate, key or proof.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
let source;
try { source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/operations/operators/native-value/native-value-operators-v4.mjs'), 'utf8'); }
catch (error) {
  // ./dev maps this existing domain directory to the same runtime ops folder.
  assert.equal(error.code, 'ENOENT');
  source = readFileSync(new URL('./native-value-operators-v4.mjs', import.meta.url), 'utf8');
}
const begin = source.indexOf('async function assertRoundCurrent('), end = source.indexOf('\nconst copy =', begin);
assert.ok(begin >= 0 && end > begin);
const originalPrivateBody = source.slice(begin, end);
function fixture(assertCurrent) {
  const rounds = new WeakSet(), checks = new WeakMap(), reader = Object.freeze({ assertCurrent });
  const run = Function('assert', 'rounds', 'roundCurrentChecks', originalPrivateBody + '\nreturn assertRoundCurrent;')(assert, rounds, checks);
  const view = Object.freeze({ inertPublicHead: 'same-block-only' });
  const round = () => {
    const shared = Object.freeze({ view, token: Object.freeze({}) });
    const state = { reader, view, pending: null }; rounds.add(shared); checks.set(shared, state);
    return { shared, state, close() { checks.delete(shared); rounds.delete(shared); } };
  };
  return { run, reader, view, round };
}
function barrier() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('overlapping three callers drain one full pending check with individual continuation', async () => {
  const entered = barrier(), release = barrier(); let reads = 0; const after = [];
  const f = fixture(async view => { assert.equal(view, f.view); reads++; entered.resolve(); await release.promise; });
  const r = f.round();
  const calls = [0, 1, 2].map(i => f.run(r.shared, f.reader, f.view).then(() => after.push(i)));
  await entered.promise;
  assert.equal(reads, 1); assert.deepEqual(after, []); assert.ok(r.state.pending);
  release.resolve(); await Promise.all(calls);
  assert.deepEqual(after.sort(), [0, 1, 2]); assert.equal(r.state.pending, null); r.close();
});

test('copied round/view and revoked round reject before original reader work', async () => {
  let reads = 0; const f = fixture(async () => { reads++; }); const r = f.round();
  await assert.rejects(f.run(Object.freeze({ ...r.shared }), f.reader, f.view), /PRIVATE_CURRENT_ROUND_REQUIRED/);
  await assert.rejects(f.run(r.shared, f.reader, Object.freeze({ ...f.view })), /PRIVATE_CURRENT_ROUND_REQUIRED/);
  r.close();
  await assert.rejects(f.run(r.shared, f.reader, f.view), /PRIVATE_CURRENT_ROUND_REQUIRED/);
  assert.equal(reads, 0); assert.equal(r.state.pending, null);
});

test('a full-check rejection reaches all callers unchanged and drains before round closes', async () => {
  const entered = barrier(), release = barrier(), original = Error('INERT_FULL_CURRENT_CHECK_REJECTED'); let reads = 0;
  const f = fixture(async () => { reads++; entered.resolve(); await release.promise; throw original; }); const r = f.round();
  const calls = [0, 1, 2].map(() => f.run(r.shared, f.reader, f.view));
  const drained = Promise.allSettled(calls); await entered.promise; release.resolve();
  const outcomes = await drained;
  assert.equal(reads, 1); assert.ok(outcomes.every(row => row.status === 'rejected' && row.reason === original));
  assert.equal(r.state.pending, null); r.close();
  await assert.rejects(f.run(r.shared, f.reader, f.view), /PRIVATE_CURRENT_ROUND_REQUIRED/);
});

test('settled phase is never cached and next phase rechecks an adverse head', async () => {
  let reads = 0, adverse = false; const rejection = Error('INERT_HEAD_CHANGED_BETWEEN_PHASES');
  const f = fixture(async () => { reads++; if (adverse) throw rejection; }); const r = f.round();
  await f.run(r.shared, f.reader, f.view); assert.equal(reads, 1); assert.equal(r.state.pending, null);
  adverse = true;
  await assert.rejects(f.run(r.shared, f.reader, f.view), error => error === rejection);
  assert.equal(reads, 2); assert.equal(r.state.pending, null); r.close();
  // Another genuine fixture round owns a new pending slot, never old completion.
  adverse = false; const next = f.round(), distinct = f.round();
  await Promise.all([f.run(next.shared, f.reader, f.view), f.run(distinct.shared, f.reader, f.view)]);
  assert.equal(reads, 4); assert.equal(next.state.pending, null); assert.equal(distinct.state.pending, null);
  next.close(); distinct.close();
});
