import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, makeGraph, transition, graphHash, assertState, validateGraph, executorView, resourceKey, amount, PAYMENT } from '../../src/core/core.mjs';
import { newIdentity, sign } from '../../src/crypto/privacy.mjs';
import { simulationReceipt } from '../../src/core/simulation.mjs';

const start = 1800000000000;
function harness(options = {}) {
  const user = newIdentity(), observer = newIdentity(); let state = createState(start), now = start;
  const graph = makeGraph(start, options), hash = graphHash(graph);
  const send = cmd => { state = transition(state, cmd, { now, userPublicKey: user.publicKey, verifierPublicKey: observer.publicKey }); return state; };
  const open = g => send({ type: 'open', graph: g ?? graph, signature: sign(g ?? graph, user.privateKey), permission: 'demo-payment' });
  const receipt = (id, overrides = {}, g = graph) => simulationReceipt(g, id, observer.privateKey, now, overrides);
  const fill = id => send({ type: 'receipt', hash, receipt: receipt(id) });
  return { user, observer, graph, hash, send, open, receipt, fill, get state() { return state; }, get now() { return now; }, set now(v) { now = v; } };
}
const input = state => state.assets.find(a => a.asset === PAYMENT);

test('three dependent synthetic legs fulfill before one local payment; balances and fees conserve', () => {
  const h = harness(); h.open(); assert.equal(input(h.state).reserved, '1000');
  for (const leg of h.graph.legs) h.fill(leg.id);
  assert.equal(h.state.operations[0].status, 'FULFILLED');
  h.send({ type: 'settle', hash: h.hash });
  assert.equal(input(h.state).spent, '1000'); assert.equal(input(h.state).available, '9000');
  assert.equal(h.state.solvers[0].paid, '1000'); assert.equal(h.state.solvers[0].inventory[0].spent, '201');
  assertState(h.state);
  assert.throws(() => h.send({ type: 'settle', hash: h.hash }), /INCOMPLETE_FULFILLMENT/);
});

test('adversarial: graph-bound signatures alone permit same output twice; global resource consumption blocks it', () => {
  const h = harness(); h.open(); const g2 = makeGraph(start); h.open(g2);
  const first = h.receipt('ethereum', { txRef: 'same-chain-effect', effectIndex: 2 });
  h.send({ type: 'receipt', hash: h.hash, receipt: first });
  const rebound = h.receipt('ethereum', { txRef: 'same-chain-effect', effectIndex: 2 }, g2);
  assert.notEqual(first.payload.graphHash, rebound.payload.graphHash);
  assert.equal(resourceKey(first.payload), resourceKey(rebound.payload));
  // The deliberately naive policy sees two different graph hashes and would accept both.
  const naive = new Set([first.payload.graphHash]); assert.equal(naive.has(rebound.payload.graphHash), false);
  const before = structuredClone(h.state);
  assert.throws(() => h.send({ type: 'receipt', hash: graphHash(g2), receipt: rebound }), /RESOURCE_REPLAY/);
  assert.deepEqual(h.state, before);
});

test('Bitcoin observed before Solana failure: input recovers after expiry; irreversible output and solver loss remain', () => {
  const h = harness({ order: ['bitcoin', 'solana', 'ethereum'] }); h.open(); h.fill('bitcoin');
  h.send({ type: 'fail', hash: h.hash, reason: 'SOLANA_HALTED' });
  assert.throws(() => h.send({ type: 'settle', hash: h.hash }), /INCOMPLETE/);
  assert.throws(() => h.send({ type: 'recover', hash: h.hash }), /NOT_EXPIRED/);
  h.now = h.graph.expiresAt; h.send({ type: 'recover', hash: h.hash });
  assert.equal(h.state.operations[0].status, 'REFUNDED'); assert.equal(input(h.state).available, '10000');
  assert.equal(h.state.assets.find(a => a.asset.startsWith('bitcoin')).available, '400');
  assert.equal(h.state.solvers[0].inventory.find(a => a.asset.startsWith('bitcoin')).spent, '401');
  assert.equal(h.state.solvers[0].paid, '0');
  assert.throws(() => h.send({ type: 'recover', hash: h.hash }), /TERMINAL/);
});

test('projection omits graph id/hash, other legs and dependency identifiers', () => {
  const h = harness(); h.open(); const view = executorView(h.state, h.hash, 'ethereum');
  const serialized = JSON.stringify(view); assert.ok(!serialized.includes(h.hash)); assert.ok(!serialized.includes(h.graph.id));
  assert.ok(!serialized.includes('solana')); assert.ok(!serialized.includes('bitcoin'));
  assert.throws(() => executorView(h.state, h.hash, 'solana'), /NOT_DISPATCHABLE/);
  h.fill('ethereum'); const next = executorView(h.state, h.hash, 'solana');
  assert.notEqual(view.dispatchToken, next.dispatchToken);
});

test('authentic out of order effect stays observed without satisfying dependencies or authorizing payment', () => {
  const h = harness(); h.open(); h.fill('solana');
  const op = h.state.operations[0], leg = op.legs.find(l => l.id === 'solana');
  assert.equal(leg.observations[0].admission, 'DEPENDENCY_VIOLATION');
  assert.equal(leg.receipt, null); assert.equal(op.status, 'RECOVERY_PENDING');
  assert.equal(h.state.assets.find(a => a.asset.startsWith('solana')).received, '300');
  assert.throws(() => h.send({ type: 'settle', hash: h.hash }), /INCOMPLETE_FULFILLMENT/);
});

test('forged authority and unsupported domain/version/graph/finality fail closed', () => {
  const h = harness(); h.open();
  for (const override of [{domain:'paeg:public:v1'}, {version:2}, {graphHash:'wrong'}, {finality:'processed'}]) {
    const before = structuredClone(h.state);
    assert.throws(() => h.send({ type:'receipt', hash:h.hash, receipt:h.receipt('ethereum',override) })); assert.deepEqual(h.state,before);
  }
  const forged = simulationReceipt(h.graph, 'ethereum', newIdentity().privateKey, h.now);
  assert.throws(() => h.send({ type:'receipt', hash:h.hash, receipt:forged }), /INVALID_ATTESTATION/);
});

test('cycles, unknown dependency, duplicate legs, unsupported external atomicity and oversized amounts rejected', () => {
  const h = harness();
  for (const modify of [g=>g.legs[0].dependsOn=['bitcoin'], g=>g.legs[0].dependsOn=['unknown'], g=>g.legs[1].id='ethereum', g=>g.guarantee='native-all-or-nothing', g=>g.legs[0].amount='1e6', g=>g.legs[0].amount='999999999999999999999999999999999999999', g=>g.payment.fee='1001',g=>g.legs[0].extra=true]) {
    const g = structuredClone(h.graph); modify(g); assert.throws(() => validateGraph(g, start));
  }
  for (const invalid of ['-1','01','1.0',1,NaN,'340282366920938463463374607431768211456']) assert.throws(()=>amount(invalid));
});

test('local authorization, permissions, aggregate inventory and graph replay are enforced', () => {
  const h = harness();
  assert.throws(() => h.send({type:'open',graph:h.graph,signature:sign(h.graph,newIdentity().privateKey),permission:'demo-payment'}), /AUTHORIZATION/);
  h.open(); assert.throws(()=>h.open(),/GRAPH_REPLAY/);
  const g=makeGraph(start); g.payment.amount='2001'; assert.throws(()=>h.open(g),/PERMISSION_LIMIT/);
  const g2=makeGraph(start); g2.legs[0].amount='10001'; assert.throws(()=>h.open(g2),/INSUFFICIENT_SOLVER/);
});

test('deadline race: no settlement at expiry; recovery consumes the only payment outcome', () => {
  const h=harness(); h.open(); h.graph.legs.forEach(l=>h.fill(l.id)); h.now=h.graph.expiresAt;
  assert.throws(()=>h.send({type:'settle',hash:h.hash}),/EXPIRED/); h.send({type:'recover',hash:h.hash});
  assert.equal(input(h.state).spent,'0'); assert.equal(h.state.solvers[0].paid,'0');
  assert.throws(()=>h.send({type:'settle',hash:h.hash}),/EXPIRED/);
});

test('late authentic first effect after refund is retained but never unlocks payment', () => {
  const h=harness(); h.open(); h.now=h.graph.expiresAt; h.send({type:'recover',hash:h.hash});
  h.fill('ethereum'); assert.equal(h.state.operations[0].status,'REFUNDED');
  assert.equal(h.state.operations[0].lateEffects.length,1); assert.equal(h.state.solvers[0].paid,'0');
  assert.equal(h.state.assets.find(a=>a.asset.startsWith('ethereum')).received,'200'); assertState(h.state);
});

test('a finality violation after payment raises dispute without manufacturing a refund', () => {
  const h=harness(); h.open(); h.graph.legs.forEach(l=>h.fill(l.id)); h.send({type:'settle',hash:h.hash});
  h.send({type:'reorg',hash:h.hash,legId:'bitcoin'});
  assert.equal(h.state.operations[0].status,'DISPUTED'); assert.equal(input(h.state).spent,'1000');
  assert.throws(()=>h.send({type:'recover',hash:h.hash}),/TERMINAL/);
});

test('property sweep: 240 reproducible operation schedules preserve all balances; partial outcomes never pay', () => {
  let seed=8675309; const next=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed; };
  for(let i=0;i<240;i++) {
    const h=harness({order:i%2?['bitcoin','solana','ethereum']:['ethereum','solana','bitcoin']}); h.open();
    const n=next()%4; for(let j=0;j<n;j++) h.fill(h.graph.legs[j].id);
    if(n===3 && next()%2) h.send({type:'settle',hash:h.hash});
    else { h.now=h.graph.expiresAt; h.send({type:'recover',hash:h.hash}); assert.equal(h.state.solvers[0].paid,'0'); }
    assertState(h.state); assert.equal(amount(input(h.state).available)+amount(input(h.state).spent),10000n);
  }
});

test('clock rollback and altered reservation conservation fail closed', () => {
  const h=harness(); h.open(); h.now=start-1; assert.throws(()=>h.fill('ethereum'),/CLOCK_ROLLBACK/);
  const corrupt=structuredClone(h.state); input(corrupt).reserved='0'; assert.throws(()=>assertState(corrupt),/CONSERVATION/);
});
