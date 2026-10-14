import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import { commitment, ackBytes, requireFundedOrder, requireExactMenuPackage, requireAuthenticatedCopies } from '../../src/native/native-authority.mjs';
import { NativeLocalSession } from '../../src/native/native-local.mjs';
/** Synthetic application-gate fixture, not retained M9/native acceptance.
 * Genuine Ed25519 signatures authenticate synthetic metadata only. No chain,
 * reservation, ZK proof, authority grant, custody import or dispatch occurs. */
const roles=['E_B','E_S','P_B','P_S'];
const keys=Object.fromEntries(roles.map(role=>[role,generateKeyPairSync('ed25519')]));
const manifest={kind:'PC5_QB_PREPARATION_ONLY',scope:'01'.repeat(32),session:'02'.repeat(32),
 menuBinding:'03'.repeat(32),verificationKeySHA256:'04'.repeat(32),
 owner:'0x'+'05'.repeat(20),solver:'0x'+'06'.repeat(20),amountWei:'100',scriptHash:'07'.repeat(32),
 sats:'10',executeBy:'100',claimBy:'200',profile:'SYNTHETIC_APPLICATION_GATE_ONLY',
 branches:[0,1].map(branch=>({branch,C_S:String(branch+8).padStart(2,'0').repeat(32),C_B:String(branch+10).repeat(32)})),
 holders:Object.fromEntries(roles.map(role=>[role,keys[role].publicKey.export({format:'der',type:'spki'}).toString('base64')]))};
const reference={authority:'0x'+'12'.repeat(20),id:'0x'+'13'.repeat(32),owner:manifest.owner,orderHash:commitment(manifest)};
const observedReservation={...reference,state:'OPEN',...Object.fromEntries(['owner','solver','amountWei','scriptHash','sats','executeBy','claimBy','profile'].map(key=>[key,manifest[key]]))};
const fixture={holders:roles.map(role=>{const ack={role,reservationId:reference.id,frozenHash:reference.orderHash};return{ack:{...ack,signature:sign(null,ackBytes(ack),keys[role].privateKey).toString('hex')}};})};
const pkg = Object.fromEntries(['scope', 'session', 'menuBinding', 'verificationKeySHA256', 'branches'].map(k => [k, manifest[k]]));
test('synthetic order and observation authenticate exact manifest in application gate only', () => {
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
test('all four synthetic signed acknowledgments match frozen reservation and do not authorize triple dispatch', () => {
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
