// Independent adversarial review of the synthetic model. These are not chain tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState, makeGraph, transition, graphHash, assertState, executorView, resourceKey, PAYMENT, DOMAIN } from '../src/core.mjs';
import { newIdentity, sign, verify, canonical } from '../src/privacy.mjs';
import { simulationReceipt } from '../src/simulation.mjs';
import { WalletSDK } from '../src/sdk.mjs';

const START = 1800000000000;
function harness(options = {}) {
  const user = newIdentity(), observer = newIdentity();
  let state = createState(START), now = START;
  const graph = makeGraph(START, options), hash = graphHash(graph);
  const send = command => {
    state = transition(state, command, { now, userPublicKey: user.publicKey, verifierPublicKey: observer.publicKey });
    return state;
  };
  const open = (g = graph) => send({ type: 'open', graph: g, signature: sign(g, user.privateKey), permission: 'demo-payment' });
  const receipt = (id, overrides = {}, g = graph) => simulationReceipt(g, id, observer.privateKey, now, overrides);
  const fill = id => send({ type: 'receipt', hash, receipt: receipt(id) });
  return { user, observer, graph, hash, send, open, receipt, fill, get state() { return state; }, get now() { return now; }, set now(v) { now = v; } };
}
const payment = state => state.assets.find(a => a.asset === PAYMENT);
const operation = h => h.state.operations.find(o => o.hash === h.hash);

test('review: multiple post-settlement reorgs cannot revive recoverable payment', () => {
  const h = harness(); h.open(); h.graph.legs.forEach(l => h.fill(l.id));
  h.send({ type: 'settle', hash: h.hash });
  for (const leg of h.graph.legs) {
    h.send({ type: 'reorg', hash: h.hash, legId: leg.id });
    assert.equal(operation(h).status, 'DISPUTED');
    assert.equal(operation(h).paymentState, 'spent');
  }
  h.now = h.graph.expiresAt;
  const before = structuredClone(h.state);
  assert.throws(() => h.send({ type: 'recover', hash: h.hash }), /TERMINAL|PAYMENT_ALREADY_DECIDED/);
  assert.deepEqual(h.state, before);
  assert.equal(payment(h.state).spent, '1000');
  assert.equal(payment(h.state).available, '9000');
  assert.equal(h.state.solvers[0].paid, '1000');
  assertState(h.state);
});

test('review: fail and predecessor reorg revoke further dispatch', () => {
  for (const cause of ['fail', 'reorg']) {
    const h = harness(); h.open(); h.fill('ethereum');
    assert.doesNotThrow(() => executorView(h.state, h.hash, 'solana'));
    h.send(cause === 'fail' ? { type: 'fail', hash: h.hash, reason: 'EXECUTOR_UNAVAILABLE' } : { type: 'reorg', hash: h.hash, legId: 'ethereum' });
    assert.throws(() => executorView(h.state, h.hash, 'solana'), /NOT_DISPATCHABLE/);
    assert.equal(operation(h).status, 'RECOVERY_PENDING');
  }
});

test('review: truthful late dependent effects survive missing predecessors without fulfillment', () => {
  const h = harness(); h.open(); h.now = h.graph.expiresAt;
  h.send({ type: 'recover', hash: h.hash });
  // External effects can arrive out of order, irrespective of the local dispatcher.
  for (const id of ['bitcoin', 'solana', 'ethereum']) h.fill(id);
  assert.equal(operation(h).status, 'REFUNDED');
  assert.equal(operation(h).lateEffects.length, 3);
  assert.equal(h.state.consumedResources.length, 3);
  assert.equal(payment(h.state).spent, '0');
  assert.equal(h.state.solvers[0].paid, '0');
  assert.equal(payment(h.state).available, '10000');
  assertState(h.state);
});

test('review: authentic effect after failure is observation only, including before expiry', () => {
  const h = harness(); h.open(); h.send({ type: 'fail', hash: h.hash, reason: 'CANCELLED_ROUTE' });
  h.fill('bitcoin');
  assert.equal(operation(h).legs.find(l => l.id === 'bitcoin').status, 'LATE');
  assert.equal(operation(h).status, 'RECOVERY_PENDING');
  assert.equal(h.state.assets.find(a => a.asset.startsWith('bitcoin')).received, '400');
  assert.throws(() => h.send({ type: 'settle', hash: h.hash }), /INCOMPLETE/);
});

test('review: reorg of a late effect removes nonexistent balance without restoring payment', () => {
  const h = harness(); h.open(); h.now = h.graph.expiresAt;
  h.send({ type: 'recover', hash: h.hash }); h.fill('ethereum');
  h.send({ type: 'reorg', hash: h.hash, legId: 'ethereum' });
  assert.equal(operation(h).status, 'REFUNDED');
  assert.equal(operation(h).paymentState, 'refunded');
  assert.equal(h.state.assets.find(a => a.asset.startsWith('ethereum')).received, '0');
  assert.equal(payment(h.state).available, '10000');
  assert.equal(h.state.solvers[0].paid, '0');
  assertState(h.state);
});

test('review: rejected stale evidence is a full rollback including clock and resource consumption', () => {
  const h = harness(); h.open(); h.now++;
  const before = structuredClone(h.state);
  assert.throws(() => h.send({ type: 'receipt', hash: h.hash, receipt: h.receipt('ethereum', { observedAt: START - 1 }) }), /PREEXISTING/);
  assert.deepEqual(h.state, before);
});

test('review: accepted graph is detached from caller mutation', () => {
  const h = harness(); h.open();
  const accepted = structuredClone(operation(h).graph);
  h.graph.legs[0].recipient = 'changed-after-reservation';
  h.graph.payment.amount = '2000';
  assert.deepEqual(operation(h).graph, accepted);
  assert.equal(operation(h).hash, graphHash(accepted));
  assertState(h.state);
});

test('review: SDK snapshots requested authorization before asynchronous vault access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paeg-review-sdk-'));
  const path = join(directory, 'vault.json');
  try {
    const sdk = new WalletSDK(path, 'synthetic-review-password', { clock: () => START });
    const created = await sdk.create();
    assert.ok(!JSON.stringify(created).includes('PRIVATE KEY'));
    assert.ok(!Object.hasOwn(created, 'data'));
    const graph = makeGraph(START), original = structuredClone(graph);
    const pending = sdk.open(graph);
    graph.payment.amount = '2000';
    graph.legs[0].recipient = 'changed-before-vault-read-completes';
    const opened = await pending;
    assert.deepEqual(opened.state.operations[0].graph, original);
    assert.equal(payment(opened.state).reserved, '1000');
  } finally {
    await unlink(path).catch(e => { if (e.code !== 'ENOENT') throw e; });
    await rmdir(directory);
  }
});

test('review: SDK rejects dispatch once its actual clock crosses expiry without another mutation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paeg-review-deadline-'));
  const path = join(directory, 'vault.json');
  let now = START;
  try {
    const sdk = new WalletSDK(path, 'synthetic-review-password', { clock: () => now });
    await sdk.create();
    const opened = await sdk.openDemo();
    const before = await sdk.snapshot();
    now = opened.state.operations[0].graph.expiresAt;
    await assert.rejects(() => sdk.executeSimulationLeg(opened.hash, 'ethereum'), /EXPIRED|NOT_DISPATCHABLE/);
    assert.deepEqual(await sdk.snapshot(), before);
  } finally {
    await unlink(path).catch(e => { if (e.code !== 'ENOENT') throw e; });
    await rmdir(directory);
  }
});

test('review: late cost conflicting with reused reservations persists and freezes unreliable inventory', () => {
  const h = harness({ order: ['ethereum'] });
  h.graph.legs[0].amount = '9990';
  const firstHash = graphHash(h.graph);
  h.open(); h.now = h.graph.expiresAt;
  h.send({ type: 'recover', hash: firstHash });
  const nextGraph = makeGraph(h.now, { order: ['ethereum'] });
  nextGraph.legs[0].amount = '9990'; h.open(nextGraph);
  const inventoryBefore = structuredClone(h.state.solvers[0].inventory);
  h.send({ type: 'receipt', hash: firstHash, receipt: h.receipt('ethereum') });
  const first = h.state.operations.find(o => o.hash === firstHash);
  assert.equal(first.status, 'REFUNDED');
  assert.equal(first.legs[0].status, 'LATE_UNRECONCILED');
  assert.equal(first.lateEffects.length, 1);
  assert.equal(h.state.solvers[0].inventoryStatus, 'UNRECONCILED');
  assert.deepEqual(h.state.solvers[0].inventory, inventoryBefore);
  assert.equal(h.state.assets.find(a => a.asset.startsWith('ethereum')).received, '9990');
  assert.throws(() => h.open(makeGraph(h.now)), /UNRECONCILED/);
  assert.throws(() => executorView(h.state, graphHash(nextGraph), 'ethereum'), /UNRECONCILED|NOT_DISPATCHABLE/);
  assert.equal(h.state.solvers[0].paid, '0');
  assertState(h.state);
});

// Competent ordinary baseline: signed full graph + configured receipt authority
// + exact leg matching + cross-graph effect registry. This baseline already fixes
// graph-specific replay. PAEG must not claim replay resistance as a unique benefit.
function fullGraphBaseline(userPublicKey, verifierPublicKey) {
  const graphs = new Map(), consumed = new Set();
  return {
    open(graph, signature) {
      assert.ok(verify(graph, signature, userPublicKey));
      graphs.set(graphHash(graph), structuredClone(graph));
    },
    consume(signed) {
      const p = signed.payload, g = graphs.get(p.graphHash);
      assert.ok(g && p.domain === DOMAIN && p.version === 1);
      assert.ok(verify(p, signed.signature, verifierPublicKey));
      const l = g.legs.find(x => x.id === p.legId); assert.ok(l);
      for (const field of ['chain', 'asset', 'amount', 'recipient', 'executor']) assert.equal(p[field], l[field]);
      // Independent ordinary identity construction, deliberately not resourceKey().
      const key = canonical([p.domain, p.chain, p.txRef, p.effectIndex]);
      if (consumed.has(key)) throw new Error('BASELINE_RESOURCE_REPLAY');
      consumed.add(key);
    },
    executorView(hash) { return structuredClone(graphs.get(hash)); },
  };
}

test('review: competent signed-graph baseline and PAEG both reject cross-graph effect reuse', () => {
  const h = harness(); h.open(); const graph2 = makeGraph(START); h.open(graph2);
  const baseline = fullGraphBaseline(h.user.publicKey, h.observer.publicKey);
  baseline.open(h.graph, sign(h.graph, h.user.privateKey));
  baseline.open(graph2, sign(graph2, h.user.privateKey));
  const first = h.receipt('ethereum', { txRef: 'same-real-effect', effectIndex: 7 });
  const rebound = h.receipt('ethereum', { txRef: 'same-real-effect', effectIndex: 7 }, graph2);
  baseline.consume(first); h.send({ type: 'receipt', hash: h.hash, receipt: first });
  assert.throws(() => baseline.consume(rebound), /BASELINE_RESOURCE_REPLAY/);
  assert.throws(() => h.send({ type: 'receipt', hash: graphHash(graph2), receipt: rebound }), /RESOURCE_REPLAY/);
  assert.equal(resourceKey(first.payload), resourceKey(rebound.payload));
});

test('review: minimized leg projection discloses less than a full-graph baseline, no unlinkability claim', () => {
  const h = harness(); h.open();
  const baseline = fullGraphBaseline(h.user.publicKey, h.observer.publicKey);
  baseline.open(h.graph, sign(h.graph, h.user.privateKey));
  const baselineView = JSON.stringify(baseline.executorView(h.hash));
  const paegView = JSON.stringify(executorView(h.state, h.hash, 'ethereum'));
  assert.ok(baselineView.includes('solana') && baselineView.includes('bitcoin'));
  assert.ok(!paegView.includes('solana') && !paegView.includes('bitcoin'));
  assert.ok(!paegView.includes(h.hash) && !paegView.includes(h.graph.id));
  // A baseline can also add this projection. This is an interface comparison,
  // not proof of novelty, separate-process secrecy, ZK or metadata unlinkability.
});

test('review: effect identity cannot change by reinterpreting its asset or recipient', () => {
  const h = harness(); const p = h.receipt('ethereum').payload;
  assert.equal(resourceKey(p), resourceKey({ ...p, asset: 'reinterpretation', recipient: 'different-recipient', graphHash: 'another-graph' }));
  assert.notEqual(resourceKey(p), resourceKey({ ...p, effectIndex: p.effectIndex + 1 }));
});
