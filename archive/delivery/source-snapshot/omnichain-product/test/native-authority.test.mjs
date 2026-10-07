import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commitment, requireFundedOrder, requireExactMenuPackage, requireAuthenticatedCopies } from '../src/native-authority.mjs';
import { NativeLocalSession } from '../src/native-local.mjs';
const fixture = JSON.parse(readFileSync(new URL('../evidence/m9-menu-reservation.json', import.meta.url)));
const { manifest, reference, observedReservation } = fixture;
const pkg = Object.fromEntries(['scope', 'session', 'menuBinding', 'verificationKeySHA256', 'branches'].map(k => [k, manifest[k]]));
test('retained real native reservation authenticates exact manifest in application gate', () => {
  assert.equal(requireFundedOrder(manifest, reference, observedReservation).hiddenAuthorizationProved, false);
  assert.equal(requireExactMenuPackage(pkg, manifest), commitment(manifest));
});
for (const [name, mutate] of [
  ['wrong intended owner', v => { v.expected.owner = '0x' + '00'.repeat(20); }],
  ['substituted authority', v => { v.observed.authority = '0x' + '00'.repeat(20); }],
  ['substituted reservation', v => { v.observed.id = '0x' + '00'.repeat(32); }],
  ['unfunded reservation', v => { v.observed.state = 'ABSENT'; }],
  ['already refunded reservation', v => { v.observed.state = 'REFUNDED'; }],
  ['coherent replacement session', v => { v.order.session = '11'.repeat(32); }],
  ['coherent replacement pairs with same menu', v => { v.order.branches[0].C_S = '22'.repeat(32); }],
]) test(`authority gate rejects ${name}`, () => {
  const v = structuredClone({ order: manifest, expected: reference, observed: observedReservation }); mutate(v);
  assert.throws(() => requireFundedOrder(v.order, v.expected, v.observed));
});
test('package cannot replace ordered complete pairs or add undocumented fields', () => {
  for (const change of [p => p.branches.reverse(), p => p.branches.pop(), p => { p.branches[1].branch = 0; }, p => { p.branches[0].C_B = 'aa'.repeat(32); }, p => { p.extra = true; }]) {
    const p = structuredClone(pkg); change(p); assert.throws(() => requireExactMenuPackage(p, manifest));
  }
});
test('all four retained signed acknowledgments match frozen reservation and do not authorize triple dispatch', () => {
  const acks = fixture.holders.map(h => h.ack);
  assert.equal(requireAuthenticatedCopies(acks, reference, manifest).authorizesNativeTripleExposure, false);
  for (const invalid of [acks.slice(1), [...acks, acks[0]], [acks[0], acks[0], ...acks.slice(2)], acks.map((a, i) => i ? a : { ...a, frozenHash: '0x' + '11'.repeat(32) }), acks.map((a, i) => i ? a : { ...a, signature: '00'.repeat(64) })]) assert.throws(() => requireAuthenticatedCopies(invalid, reference, manifest));
});
test('native session is inert on import/constructor and cannot expose unavailable actions', async () => {
  const session = new NativeLocalSession('not-used-without-command');
  assert.deepEqual(session.snapshot().allowedActions, ['prepare']);
  assert.equal(session.ownedRuntimeForReview, undefined);
  for (const action of ['settle', 'send', 'refund', 'solana', '__proto__']) assert.throws(() => session.submit(action), /NATIVE_ACTION_NOT_AVAILABLE/);
  await session.close(); assert.throws(() => session.submit('prepare'), /NATIVE_SESSION_CLOSED/);
});
