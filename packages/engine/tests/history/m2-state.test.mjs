import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState, makeGraph, transition, graphHash, assertState, executorView, resourceKey, PAYMENT, STATE_VERSION, VERIFICATION_POLICY } from '../../src/core/core.mjs';
import { newIdentity, sign, canonical, verify } from '../../src/crypto/privacy.mjs';
import { simulationReceipt } from '../../src/core/simulation.mjs';
import { WalletSDK } from '../../src/api/sdk.mjs';
import { Vault } from '../../src/crypto/vault.mjs';

// All observations here are signed synthetic assertions, never native receipts.
const START = 1800000000000;
function harness({ order = ['ethereum'], ...options } = {}) {
  const user = newIdentity(), observer = newIdentity();
  let now = START, state = createState(START);
  const graph = makeGraph(START, { order, ...options });
  const signature = sign(graph, user.privateKey);
  const trust = { userPublicKey: user.publicKey, verifierPublicKey: observer.publicKey };
  const send = command => { state = transition(state, command, { now, ...trust }); return state; };
  const open = (g = graph) => send({ type: 'open', graph: g, signature: sign(g, user.privateKey), permission: 'demo-payment' });
  const receipt = (id = 'ethereum', overrides = {}, g = graph) => simulationReceipt(g, id, observer.privateKey, now, overrides);
  const fill = (id = 'ethereum', overrides = {}) => { const signed = receipt(id, overrides); send({ type: 'receipt', hash: graphHash(graph), receipt: signed }); return signed; };
  return { user, observer, graph, signature, trust, send, open, receipt, fill, get hash() { return graphHash(graph); }, get state() { return state; }, get op() { return state.operations.find(o => o.hash === graphHash(graph)); }, get now() { return now; }, set now(v) { now = v; } };
}
const inventory = h => h.state.solvers[0].inventory.find(a => a.asset.startsWith('ethereum'));
const output = h => h.state.assets.find(a => a.asset.startsWith('ethereum'));
const payment = h => h.state.assets.find(a => a.asset === PAYMENT);

test('M2: a second distinct effect for one leg preserves both outputs/losses and only one fulfillment', () => {
  const h = harness(); h.open();
  const first = h.fill('ethereum', { txRef: 'first-execution' });
  h.fill('ethereum', { txRef: 'accidental-second-execution' });
  assert.equal(output(h).received, '400');
  assert.equal(inventory(h).spent, '402');
  assert.equal(h.op.legs[0].observations.length, 2);
  assert.deepEqual(h.op.legs[0].receipt, first);
  assert.deepEqual(h.op.legs[0].observations.map(o => o.admission), ['FULFILLMENT', 'ADDITIONAL_EFFECT']);
  h.send({ type: 'settle', hash: h.hash });
  assert.equal(payment(h).spent, '1000'); assert.equal(h.state.solvers[0].paid, '1000');
  h.fill('ethereum', { txRef: 'third-execution-after-settlement' });
  assert.equal(output(h).received, '600'); assert.equal(inventory(h).spent, '603');
  assert.equal(h.op.status, 'SETTLED'); assert.equal(h.state.solvers[0].paid, '1000');
  assert.throws(() => h.send({ type: 'settle', hash: h.hash }), /INCOMPLETE/);
  assertState(h.state);
});

test('M2: repeated evidence of the same effect cannot recredit locally or through another graph', () => {
  const h = harness(); h.open(); const first = h.fill('ethereum', { txRef: 'unique-external-effect' });
  const before = structuredClone(h.state);
  assert.throws(() => h.send({ type: 'receipt', hash: h.hash, receipt: first }), /RESOURCE_REPLAY/);
  assert.deepEqual(h.state, before);
  const g2 = makeGraph(h.now, { order: ['ethereum'] }); h.open(g2);
  const rebound = h.receipt('ethereum', { txRef: 'unique-external-effect' }, g2);
  assert.throws(() => h.send({ type: 'receipt', hash: graphHash(g2), receipt: rebound }), /RESOURCE_REPLAY/);
  assert.equal(output(h).received, '200'); assert.equal(h.state.consumedResources.length, 1);
});

test('M2: authentic wrong amount, recipient or fee records the actual effect without fulfillment', () => {
  for (const [override, credit, cost, field] of [
    [{ amount: '201' }, '201', '202', 'amount'],
    [{ recipient: 'unintended-external-recipient' }, '0', '201', 'recipient'],
    [{ fee: '11' }, '200', '211', 'fee'],
  ]) {
    const h = harness(); h.open(); h.fill('ethereum', override);
    const observed = h.op.legs[0].observations[0];
    assert.equal(observed.admission, 'FULFILLMENT_MISMATCH'); assert.ok(observed.mismatches.includes(field));
    assert.equal(output(h).received, credit); assert.equal(inventory(h).spent, cost);
    assert.equal(h.op.legs[0].receipt, null); assert.equal(h.op.status, 'RECOVERY_PENDING');
    assert.throws(() => h.send({ type: 'settle', hash: h.hash }), /INCOMPLETE/);
    h.now = h.graph.expiresAt; h.send({ type: 'recover', hash: h.hash });
    assert.equal(h.state.solvers[0].paid, '0'); assertState(h.state);
  }
});

test('M2: reorg identifies a concrete extra observation without invalidating distinct fulfillment', () => {
  const h = harness(); h.open(); h.fill('ethereum', { txRef: 'admitted' });
  const extra = h.fill('ethereum', { txRef: 'extra' });
  h.send({ type: 'settle', hash: h.hash });
  h.send({ type: 'reorg', hash: h.hash, legId: 'ethereum', resource: resourceKey(extra.payload) });
  assert.equal(output(h).received, '200'); assert.equal(h.op.legs[0].status, 'FINAL');
  assert.equal(h.op.status, 'SETTLED'); assert.equal(payment(h).spent, '1000');
  assert.equal(h.op.legs[0].observations[1].validity, 'REORGED');
  assert.throws(() => h.send({ type: 'receipt', hash: h.hash, receipt: extra }), /RESOURCE_REPLAY/);
});

test('M2: prepare persists private dispatch intent and quarantines before submission', () => {
  const h = harness(); h.open();
  h.send({ type: 'prepareDispatch', hash: h.hash, legId: 'ethereum' });
  const leg = h.op.legs[0];
  assert.equal(leg.dispatch.state, 'INTENT_RECORDED'); assert.equal(leg.quarantined, '210'); assert.equal(leg.allocation, '0');
  assert.equal(inventory(h).quarantined, '210'); assert.equal(inventory(h).reserved, '0');
  assert.equal(leg.dispatch.intent.graphHash, h.hash);
  assert.equal(leg.dispatch.intent.envelope.dispatchToken, leg.dispatchToken);
  assert.equal(payment(h).committed, '1000');
  assert.throws(() => executorView(h.state, h.hash, 'ethereum'), /NOT_DISPATCHABLE/);
  assert.throws(() => h.send({ type: 'prepareDispatch', hash: h.hash, legId: 'ethereum' }), /NOT_DISPATCHABLE|ALREADY_DISPATCHED/);
  assertState(h.state);
});

test('M2: user refund cannot release submitted exposure; unsubmitted allocations release', () => {
  const h = harness({ order: ['ethereum', 'solana', 'bitcoin'] }); h.open();
  h.send({ type: 'prepareDispatch', hash: h.hash, legId: 'ethereum' });
  h.send({ type: 'markSubmitted', hash: h.hash, legId: 'ethereum', txRef: 'pending-transaction' });
  h.now = h.graph.expiresAt; h.send({ type: 'recover', hash: h.hash });
  assert.equal(h.op.status, 'REFUNDED'); assert.equal(payment(h).available, '10000');
  assert.equal(inventory(h).quarantined, '210'); assert.equal(inventory(h).available, '9790');
  for (const a of h.state.solvers[0].inventory.filter(a => !a.asset.startsWith('ethereum'))) {
    assert.equal(a.available, '10000'); assert.equal(a.reserved, '0'); assert.equal(a.quarantined, '0');
  }
  const unaffordable = makeGraph(h.now, { order: ['ethereum'] }); unaffordable.legs[0].amount = '9990';
  assert.throws(() => h.open(unaffordable), /INSUFFICIENT_SOLVER_INVENTORY/);
  assertState(h.state);
});

test('M2: crash after durable intent and ambiguous submission keep quarantine past refund', () => {
  for (const ambiguous of [false, true]) {
    const h = harness(); h.open(); h.send({ type: 'prepareDispatch', hash: h.hash, legId: 'ethereum' });
    if (ambiguous) h.send({ type: 'markAmbiguous', hash: h.hash, legId: 'ethereum', reason: 'ACK_LOST' });
    h.now = h.graph.expiresAt; h.send({ type: 'recover', hash: h.hash });
    assert.equal(inventory(h).quarantined, '210'); assert.equal(inventory(h).available, '9790');
    assert.equal(h.op.legs[0].dispatch.state, ambiguous ? 'AMBIGUOUS' : 'INTENT_RECORDED');
    assert.equal(h.op.legs[0].observations.length, 0); assert.equal(payment(h).spent, '0');
  }
});

test('M2: known pending transaction can confirm after refund without creating a new payment', () => {
  const h = harness(); h.open(); h.send({ type: 'prepareDispatch', hash: h.hash, legId: 'ethereum' });
  h.send({ type: 'markSubmitted', hash: h.hash, legId: 'ethereum', txRef: 'known-pending' });
  h.send({ type: 'markAmbiguous', hash: h.hash, legId: 'ethereum', reason: 'RPC_UNAVAILABLE' });
  h.now = h.graph.expiresAt; h.send({ type: 'recover', hash: h.hash });
  h.fill('ethereum', { txRef: 'known-pending' });
  assert.equal(h.op.status, 'REFUNDED'); assert.equal(h.op.legs[0].dispatch.state, 'CONFIRMED');
  assert.equal(inventory(h).quarantined, '0'); assert.equal(inventory(h).spent, '201'); assert.equal(inventory(h).available, '9799');
  assert.equal(output(h).received, '200'); assert.equal(payment(h).spent, '0'); assert.equal(h.state.solvers[0].paid, '0');
  assert.equal(h.op.legs[0].receipt, null); assert.equal(h.op.legs[0].observations[0].admission, 'LATE');
});

test('M2: a different effect cannot resolve the pending transaction of the same leg', () => {
  const h = harness(); h.open(); h.send({ type: 'prepareDispatch', hash: h.hash, legId: 'ethereum' });
  h.send({ type: 'markSubmitted', hash: h.hash, legId: 'ethereum', txRef: 'still-pending' });
  h.fill('ethereum', { txRef: 'other-execution' });
  h.send({ type: 'settle', hash: h.hash });
  assert.equal(inventory(h).quarantined, '210'); assert.equal(h.op.legs[0].dispatch.state, 'SUBMITTED');
  h.fill('ethereum', { txRef: 'still-pending' });
  assert.equal(inventory(h).quarantined, '0'); assert.equal(inventory(h).spent, '402');
  assert.equal(output(h).received, '400'); assert.equal(h.state.solvers[0].paid, '1000');
  assert.equal(h.op.legs[0].observations[1].admission, 'ADDITIONAL_EFFECT');
});

test('M2: submission acknowledgements require a persisted intent and preserve delayed expiry outcome', () => {
  const h = harness(); h.open(); const before = structuredClone(h.state);
  assert.throws(() => h.send({ type: 'markSubmitted', hash: h.hash, legId: 'ethereum', txRef: 'tx' }), /DISPATCH_INTENT_REQUIRED/);
  assert.deepEqual(h.state, before);
  h.send({ type: 'prepareDispatch', hash: h.hash, legId: 'ethereum' });
  h.now = h.graph.expiresAt; h.send({ type: 'recover', hash: h.hash });
  h.send({ type: 'markSubmitted', hash: h.hash, legId: 'ethereum', txRef: 'late-ack' });
  assert.equal(h.op.status, 'REFUNDED'); assert.equal(inventory(h).quarantined, '210');
  h.fill('ethereum', { txRef: 'late-ack' });
  assert.equal(inventory(h).quarantined, '0'); assert.equal(payment(h).spent, '0');
});

test('M2: excess genuine observations are retained with frozen inventory instead of fabricated capital', () => {
  const h = harness(); h.graph.legs[0].amount = '4990'; h.open();
  for (const txRef of ['first', 'second', 'third']) h.fill('ethereum', { txRef });
  assert.equal(h.op.legs[0].observations.length, 3); assert.equal(output(h).received, '14970');
  assert.equal(inventory(h).spent, '9982'); assert.equal(inventory(h).available, '18');
  assert.equal(h.op.legs[0].observations[2].inventoryAccounting, 'UNRECONCILED');
  assert.equal(h.state.solvers[0].inventoryStatus, 'UNRECONCILED');
  assert.throws(() => h.open(makeGraph(h.now)), /UNRECONCILED/);
  assertState(h.state);
});

test('M2: original signed graph and trusted acceptance provenance survive all mutations', () => {
  const h = harness(); h.open(); const retained = structuredClone(h.op.authorization);
  assert.equal(retained.signature, h.signature); assert.equal(retained.canonicalGraph, canonical(h.graph));
  assert.ok(verify(JSON.parse(retained.canonicalGraph), retained.signature, retained.signerPublicKey));
  assert.deepEqual(retained.provenance.policy, VERIFICATION_POLICY);
  assert.equal(retained.provenance.verifierPublicKey, h.observer.publicKey);
  h.fill(); h.send({ type: 'settle', hash: h.hash });
  assert.deepEqual(h.op.authorization, retained);
  const corrupt = structuredClone(h.state); corrupt.operations[0].authorization.signature = '00'.repeat(64);
  assert.throws(() => assertState(corrupt), /INVALID_RETAINED_AUTHORIZATION/);
});

test('M2: current caller configuration cannot reinterpret a graph accepted under another verifier', () => {
  const h = harness(); h.open(); const replacement = newIdentity(); h.trust.verifierPublicKey = replacement.publicKey;
  const forged = simulationReceipt(h.graph, 'ethereum', replacement.privateKey, h.now);
  assert.throws(() => h.send({ type: 'receipt', hash: h.hash, receipt: forged }), /INVALID_ATTESTATION/);
  h.fill(); h.send({ type: 'settle', hash: h.hash });
  assert.equal(h.op.status, 'SETTLED');
});

test('M2: old state schema is rejected rather than silently migrated', () => {
  const state = createState(START); assert.equal(state.version, STATE_VERSION);
  state.version = 1; assert.throws(() => assertState(state), /INVALID_STATE_DOMAIN/);
});

test('M2: idempotent failure preserves monotonic time without growing history', () => {
  const h = harness(); h.open(); h.send({ type: 'fail', hash: h.hash, reason: 'UNAVAILABLE' });
  const events = h.state.events.length; h.now++;
  h.send({ type: 'fail', hash: h.hash, reason: 'UNAVAILABLE' });
  assert.equal(h.state.events.length, events); assert.equal(h.state.lastNow, h.now);
  h.now--;
  assert.throws(() => h.send({ type: 'fail', hash: h.hash, reason: 'UNAVAILABLE' }), /CLOCK_ROLLBACK/);
});

test('M2: SDK durable intent survives reopening and refund; synthetic execute records three ordered transitions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paeg-m2-dispatch-')), path = join(directory, 'vault.json');
  const password = 'synthetic-m2-fixture-password'; let now = START;
  try {
    const sdk = new WalletSDK(path, password, { clock: () => now }); await sdk.create();
    const first = await sdk.openDemo({ order: ['ethereum'] });
    await sdk.prepareDispatch(first.hash, 'ethereum');
    const disk = await new Vault(path).read(password);
    assert.equal(disk.data.state.operations[0].legs[0].dispatch.state, 'INTENT_RECORDED');
    const reopened = new WalletSDK(path, password, { clock: () => now });
    now = first.state.operations[0].graph.expiresAt; await reopened.recover(first.hash);
    assert.equal((await reopened.snapshot()).state.solvers[0].inventory[0].quarantined, '210');
    const second = await reopened.openDemo({ order: ['ethereum'] });
    const executed = await reopened.executeSimulationLeg(second.hash, 'ethereum');
    assert.deepEqual(executed.state.events.slice(-3).map(e => e.type), ['prepareDispatch', 'markSubmitted', 'receipt']);
    assert.equal(executed.state.operations[1].legs[0].dispatch.state, 'CONFIRMED');
    assert.equal(executed.state.solvers[0].inventory[0].quarantined, '210');
  } finally {
    await unlink(path).catch(e => { if (e.code !== 'ENOENT') throw e; }); await rmdir(directory);
  }
});
