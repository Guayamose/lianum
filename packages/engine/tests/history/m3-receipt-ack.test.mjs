import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState, makeGraph, transition, graphHash, assertState, resourceKey, DOMAIN, PAYMENT } from '../../src/core/core.mjs';
import { newIdentity, sign } from '../../src/crypto/privacy.mjs';
import { simulationReceipt } from '../../src/core/simulation.mjs';
import { WalletSDK } from '../../src/api/sdk.mjs';
import { Vault } from '../../src/crypto/vault.mjs';

const START = 1800000000000;
function harness({ quantity = '200' } = {}) {
  const user = newIdentity(), observer = newIdentity();
  let state = createState(START), now = START;
  const graph = makeGraph(START, { order: ['ethereum'] }); graph.legs[0].amount = quantity;
  const hash = graphHash(graph);
  const send = command => { state = transition(state, command, { now, userPublicKey: user.publicKey, verifierPublicKey: observer.publicKey }); return state; };
  send({ type: 'open', graph, signature: sign(graph, user.privateKey), permission: 'demo-payment' });
  const receipt = (txRef = 'intended-tx', overrides = {}) => simulationReceipt(graph, 'ethereum', observer.privateKey, now, { txRef, ...overrides });
  const fill = (txRef = 'intended-tx', overrides = {}) => { const signed = receipt(txRef, overrides); send({ type: 'receipt', hash, receipt: signed }); return signed; };
  const prepare = (identity = {}) => send({ type: 'prepareDispatch', hash, legId: 'ethereum', ...identity });
  const acknowledgement = (txRef = 'intended-tx', effectIndex = 0, overrides = {}, privateKey = observer.privateKey) => {
    const payload = { version: 1, domain: DOMAIN, evidenceType: 'simulation-submission-ack', graphHash: hash, legId: 'ethereum',
      dispatchToken: state.operations[0].legs[0].dispatchToken, txRef, effectIndex, acknowledgedAt: now, ...overrides };
    return { payload, signature: sign(payload, privateKey) };
  };
  const reconcile = signed => send({ type: 'reconcileDispatch', hash, acknowledgement: signed ?? acknowledgement() });
  return { user, observer, graph, hash, send, receipt, fill, prepare, acknowledgement, reconcile,
    get state() { return state; }, get op() { return state.operations[0]; }, get leg() { return state.operations[0].legs[0]; },
    get inventory() { return state.solvers[0].inventory[0]; }, get now() { return now; }, set now(value) { now = value; } };
}
const credit = h => h.state.assets.find(a => a.asset.startsWith('ethereum')).received;
const payment = h => h.state.assets.find(a => a.asset === PAYMENT);

test('M3: preknown exact effect resolves receipt-before-ack even with zero free inventory', () => {
  for (const quantity of ['200', '9990']) {
    const h = harness({ quantity }); h.prepare({ txRef: 'intended-tx', effectIndex: 0 }); h.fill();
    assert.equal(h.inventory.quarantined, '0');
    assert.equal(h.inventory.spent, (BigInt(quantity) + 1n).toString());
    assert.equal(h.leg.dispatch.state, 'CONFIRMED'); assert.equal(h.op.status, 'FULFILLED');
    const before = structuredClone(h.state);
    h.send({ type: 'markSubmitted', hash: h.hash, legId: 'ethereum', txRef: 'intended-tx', effectIndex: 0 });
    assert.equal(h.state.events.length, before.events.length); assert.equal(credit(h), quantity);
    h.send({ type: 'settle', hash: h.hash }); assert.equal(h.state.solvers[0].paid, '1000'); assertState(h.state);
  }
});

test('M3: authenticated legacy reconciliation releases quarantine without charging or crediting twice', () => {
  const h = harness(); h.prepare(); const signed = h.fill();
  assert.equal(h.inventory.quarantined, '210'); assert.equal(h.inventory.spent, '201');
  const consumed = [...h.state.consumedResources], ack = h.acknowledgement();
  h.reconcile(ack);
  assert.equal(h.inventory.quarantined, '0'); assert.equal(h.inventory.spent, '201'); assert.equal(h.inventory.available, '9799');
  assert.equal(credit(h), '200'); assert.deepEqual(h.state.consumedResources, consumed);
  assert.deepEqual(h.leg.receipt, signed); assert.equal(h.op.status, 'FULFILLED');
  const once = structuredClone(h.state); h.reconcile(ack); assert.deepEqual(h.state, once);
  assert.throws(() => h.send({ type: 'receipt', hash: h.hash, receipt: signed }), /RESOURCE_REPLAY/);
});

test('M3: ack-first and receipt-first orders conserve the exact observed fee with a nonzero selector', () => {
  for (const acknowledgementFirst of [true, false]) {
    const h = harness(); h.prepare({ txRef: 'intended-tx', effectIndex: 7 });
    const ack = h.acknowledgement('intended-tx', 7);
    const acknowledge = () => h.send({ type: 'markSubmitted', hash: h.hash, legId: 'ethereum', txRef: 'intended-tx', effectIndex: 7, acknowledgement: ack });
    if (acknowledgementFirst) acknowledge();
    h.fill('intended-tx', { effectIndex: 7, fee: '5' });
    if (!acknowledgementFirst) acknowledge();
    assert.equal(h.inventory.quarantined, '0'); assert.equal(h.inventory.spent, '205'); assert.equal(h.inventory.available, '9795');
    assert.equal(h.leg.dispatch.state, 'CONFIRMED'); assert.equal(credit(h), '200');
    assertState(h.state);
  }
});

test('M3: a different transaction or selector on the same leg cannot resolve its pending attempt', () => {
  for (const extra of [{ txRef: 'other-tx', effectIndex: 7 }, { txRef: 'intended-tx', effectIndex: 8 }]) {
    const h = harness(); h.prepare({ txRef: 'intended-tx', effectIndex: 7 });
    const first = h.fill(extra.txRef, { effectIndex: extra.effectIndex });
    assert.equal(h.inventory.quarantined, '210'); assert.equal(h.leg.dispatch.state, 'INTENT_RECORDED');
    assert.throws(() => h.reconcile(h.acknowledgement(extra.txRef, extra.effectIndex)), /DISPATCH_IDENTITY_CONFLICT/);
    h.fill('intended-tx', { effectIndex: 7 });
    assert.equal(h.inventory.quarantined, '0'); assert.equal(h.inventory.spent, '402'); assert.equal(credit(h), '400');
    assert.deepEqual(h.leg.receipt, first); // Fulfillment and attempt attribution are separate.
    h.send({ type: 'settle', hash: h.hash }); assert.equal(h.state.solvers[0].paid, '1000');
    assert.equal(h.leg.observations.filter(o => o.admission === 'FULFILLMENT').length, 1);
  }
});

test('M3: authenticated legacy accounting repair cannot retroactively promote an inadmissible receipt', () => {
  const h = harness({ quantity: '9990' }); h.prepare(); const original = h.fill();
  assert.equal(h.op.status, 'RECOVERY_PENDING'); assert.equal(h.leg.observations[0].inventoryAccounting, 'UNRECONCILED');
  assert.equal(h.inventory.spent, '0'); assert.equal(h.inventory.quarantined, '10000');
  h.reconcile();
  assert.equal(h.inventory.spent, '9991'); assert.equal(h.inventory.available, '9'); assert.equal(h.inventory.quarantined, '0');
  assert.equal(h.state.solvers[0].inventoryStatus, 'RECONCILED');
  assert.equal(h.op.status, 'RECOVERY_PENDING'); assert.equal(h.leg.receipt, null);
  assert.equal(h.leg.observations[0].admission, 'UNRECONCILED'); assert.deepEqual(h.leg.observations[0].receipt, original);
  assert.throws(() => h.send({ type: 'settle', hash: h.hash }), /INCOMPLETE/);
  h.now = h.graph.expiresAt; h.send({ type: 'recover', hash: h.hash });
  assert.equal(payment(h).available, '10000'); assert.equal(h.state.solvers[0].paid, '0');
});

test('M3: excess fee is retained; insufficient capital keeps both quarantine and authenticated reconciliation', () => {
  const affordable = harness(); affordable.prepare(); affordable.fill('intended-tx', { fee: '11' }); affordable.reconcile();
  assert.equal(affordable.inventory.spent, '211'); assert.equal(affordable.inventory.quarantined, '0');
  assert.equal(affordable.op.status, 'RECOVERY_PENDING'); assert.equal(affordable.leg.receipt, null);

  const h = harness({ quantity: '9990' }); h.prepare(); h.fill('intended-tx', { fee: '20' });
  const ack = h.acknowledgement(); h.reconcile(ack);
  assert.equal(h.leg.observations[0].reconciliation.outcome, 'INSUFFICIENT_CAPITAL');
  assert.deepEqual(h.leg.observations[0].reconciliation.acknowledgement, ack);
  assert.equal(h.inventory.quarantined, '10000'); assert.equal(h.inventory.spent, '0'); assert.equal(h.inventory.available, '0');
  assert.equal(h.state.solvers[0].inventoryStatus, 'UNRECONCILED');
  const before = structuredClone(h.state); h.reconcile(ack); assert.deepEqual(h.state, before);
  assert.equal(h.state.consumedResources.length, 1); assert.equal(credit(h), '9990');
});

test('M3: unauthenticated or substituted acknowledgements cannot release unknown quarantine', () => {
  const h = harness(); h.now++; h.prepare(); h.fill();
  assert.throws(() => h.send({ type: 'markSubmitted', hash: h.hash, legId: 'ethereum', txRef: 'intended-tx' }), /AUTHENTICATED_ACK_REQUIRED/);
  for (const override of [{ version: 2 }, { domain: 'other' }, { evidenceType: 'simulation-attestation' }, { graphHash: '0'.repeat(64) },
    { dispatchToken: '0'.repeat(64) }, { acknowledgedAt: h.now + 1 }, { acknowledgedAt: START }, { effectIndex: 65536 }]) {
    const before = structuredClone(h.state);
    assert.throws(() => h.reconcile(h.acknowledgement('intended-tx', 0, override)));
    assert.deepEqual(h.state, before);
  }
  const forged = h.acknowledgement('intended-tx', 0, {}, newIdentity().privateKey);
  assert.throws(() => h.reconcile(forged), /INVALID_SUBMISSION_ACK_SIGNATURE/);
  assert.equal(h.inventory.quarantined, '210'); assert.equal(h.state.consumedResources.length, 1);
});

test('M3: late acknowledgement after refund or settlement leaves terminal payment and resource count unchanged', () => {
  for (const terminal of ['REFUNDED', 'SETTLED']) {
    const h = harness(); h.prepare(); h.fill();
    if (terminal === 'SETTLED') h.send({ type: 'settle', hash: h.hash });
    else { h.now = h.graph.expiresAt; h.send({ type: 'recover', hash: h.hash }); }
    const spent = payment(h).spent, paid = h.state.solvers[0].paid;
    h.reconcile();
    assert.equal(h.op.status, terminal); assert.equal(payment(h).spent, spent); assert.equal(h.state.solvers[0].paid, paid);
    assert.equal(h.inventory.quarantined, '0'); assert.equal(h.inventory.spent, '201'); assert.equal(credit(h), '200');
    assert.equal(h.state.consumedResources.length, 1);
    const events = h.state.events.length, retained = structuredClone(h.leg.observations[0].reconciliation);
    h.now++; h.reconcile(h.acknowledgement());
    assert.equal(h.state.events.length, events); assert.deepEqual(h.leg.observations[0].reconciliation, retained);
  }
});

test('M3: ambiguous replacement cannot overwrite identity; reorged effects cannot resolve quarantine', () => {
  const pinned = harness(); pinned.prepare({ txRef: 'original', effectIndex: 0 });
  pinned.send({ type: 'markAmbiguous', hash: pinned.hash, legId: 'ethereum', reason: 'ACK_LOST' });
  pinned.fill('replacement');
  assert.throws(() => pinned.reconcile(pinned.acknowledgement('replacement')), /DISPATCH_IDENTITY_CONFLICT/);
  assert.throws(() => pinned.send({ type: 'markSubmitted', hash: pinned.hash, legId: 'ethereum', txRef: 'replacement' }), /DISPATCH_IDENTITY_CONFLICT/);
  assert.equal(pinned.inventory.quarantined, '210');

  const h = harness(); h.prepare(); const effect = h.fill();
  h.send({ type: 'reorg', hash: h.hash, legId: 'ethereum', resource: resourceKey(effect.payload) });
  const before = structuredClone(h.state); assert.throws(() => h.reconcile(), /ACK_OBSERVATION_REORGED/);
  assert.deepEqual(h.state, before); assert.equal(h.inventory.quarantined, '210'); assert.equal(credit(h), '0');

  const historical = harness(); historical.prepare(); const past = historical.fill(); const ack = historical.acknowledgement(); historical.reconcile(ack);
  historical.send({ type: 'reorg', hash: historical.hash, legId: 'ethereum', resource: resourceKey(past.payload) });
  const invalidated = structuredClone(historical.state); historical.reconcile(ack);
  assert.deepEqual(historical.state, invalidated); assert.equal(credit(historical), '0');
});

test('M3: repairing one attempt does not unfreeze unrelated unreconciled effects', () => {
  const h = harness({ quantity: '4990' }); h.prepare(); h.fill(); h.fill('untracked-extra-execution');
  assert.equal(h.leg.observations[1].inventoryAccounting, 'UNRECONCILED');
  h.reconcile();
  assert.equal(h.inventory.quarantined, '0'); assert.equal(h.inventory.spent, '4991'); assert.equal(h.inventory.available, '5009');
  assert.equal(h.state.solvers[0].inventoryStatus, 'UNRECONCILED');
  assert.equal(credit(h), '9980'); assert.equal(h.state.consumedResources.length, 2);
});

test('M3: retained acknowledgement and independently conserved costs are audited', () => {
  const h = harness(); h.prepare(); h.fill(); h.reconcile();
  const changedProof = structuredClone(h.state); changedProof.operations[0].legs[0].observations[0].reconciliation.acknowledgement.signature = '00'.repeat(64);
  assert.throws(() => assertState(changedProof), /INVALID_SUBMISSION_ACK_SIGNATURE/);
  const chargedTwice = structuredClone(h.state); chargedTwice.solvers[0].inventory[0].spent = '402'; chargedTwice.solvers[0].inventory[0].available = '9598';
  assert.throws(() => assertState(chargedTwice), /INVENTORY_COST_CONSERVATION/);
});

test('M3: SDK restart between receipt and signed acknowledgement repairs the exact stored attempt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paeg-m3-ack-')), path = join(directory, 'vault.json');
  const password = 'synthetic-m3-ack-fixture'; let now = START;
  try {
    const sdk = new WalletSDK(path, password, { clock: () => now }); await sdk.create();
    const opened = await sdk.openDemo({ order: ['ethereum'] }); await sdk.prepareDispatch(opened.hash, 'ethereum');
    const fixture = await new Vault(path).read(password);
    const signed = simulationReceipt(fixture.data.state.operations[0].graph, 'ethereum', fixture.data.observer.privateKey, now, { txRef: 'receipt-before-restart' });
    await sdk.recordReceipt(opened.hash, signed);
    now = opened.state.operations[0].graph.expiresAt; await sdk.recover(opened.hash);
    const reopened = new WalletSDK(path, password, { clock: () => now });
    await reopened.markSubmitted(opened.hash, 'ethereum', 'receipt-before-restart');
    const snapshot = await reopened.snapshot(), operation = snapshot.state.operations[0];
    assert.equal(operation.status, 'REFUNDED'); assert.equal(operation.legs[0].dispatch.state, 'CONFIRMED');
    assert.equal(snapshot.state.solvers[0].inventory[0].quarantined, '0'); assert.equal(snapshot.state.solvers[0].inventory[0].spent, '201');
    assert.equal(snapshot.state.consumedResources.length, 1); assert.equal(snapshot.state.solvers[0].paid, '0');
    await reopened.recordSubmissionAcknowledgement(opened.hash, operation.legs[0].observations[0].reconciliation.acknowledgement);
    assert.equal((await reopened.snapshot()).state.events.length, snapshot.state.events.length);
    await assert.rejects(() => reopened.recordReceipt(opened.hash, signed), /RESOURCE_REPLAY/);
  } finally {
    await unlink(path).catch(e => { if (e.code !== 'ENOENT') throw e; }); await rmdir(directory);
  }
});

test('M3: SDK persists a chosen nonzero selector before synthetic transmission', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paeg-m3-preknown-')), path = join(directory, 'vault.json');
  const password = 'synthetic-m3-preknown-fixture';
  try {
    const sdk = new WalletSDK(path, password, { clock: () => START }); await sdk.create();
    const opened = await sdk.openDemo({ order: ['ethereum'] }); await sdk.prepareDispatch(opened.hash, 'ethereum', { txRef: 'preknown', effectIndex: 5 });
    const fixture = await new Vault(path).read(password), op = fixture.data.state.operations[0];
    assert.deepEqual(op.legs[0].dispatch.intent.expectedEffect, { txRef: 'preknown', effectIndex: 5 });
    await sdk.recordReceipt(opened.hash, simulationReceipt(op.graph, 'ethereum', fixture.data.observer.privateKey, START, { txRef: 'preknown', effectIndex: 5 }));
    await sdk.markSubmitted(opened.hash, 'ethereum', 'preknown');
    const snapshot = await sdk.snapshot(); assert.equal(snapshot.state.solvers[0].inventory[0].quarantined, '0');
    assert.equal(snapshot.state.operations[0].legs[0].dispatch.effectIndex, 5);
  } finally {
    await unlink(path).catch(e => { if (e.code !== 'ENOENT') throw e; }); await rmdir(directory);
  }
});
