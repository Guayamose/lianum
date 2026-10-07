/** Controlled-promise tests of the actual quorum factory's orchestration.
 * Actor/signature boundaries are synthetic here; the combined-operator suite
 * separately exercises original actors, full audits and the shared native queue.
 * No native node, proof, compiler, network, timing measurement or key is used. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CLAIM_ACTIONS as A } from './permits.mjs';
import { cloneInput, frozenInput } from '../paeg/readiness-inputs.mjs';

const source = readFileSync(new URL('./operators.mjs', import.meta.url), 'utf8');
const start = source.indexOf('export function createClaimOperatorQuorum(input) {');
const end = source.indexOf('\nexport function assertOwnedClaimOperatorQuorum', start);
assert.ok(start >= 0 && end > start);
// Execute the production factory verbatim, not a copied scheduling algorithm.
const factorySource = source.slice(start, end).replace(/^export /, '');
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const clone = value => structuredClone(value);

function fixture() {
  const head = { number: '60', hash: '12'.repeat(32), timestamp: '1000' };
  const calls = [], states = new WeakMap(), anchors = new WeakSet(), quorums = new WeakMap();
  const issued = new WeakSet();
  const observer = { async read() {
    c.reads++; await c.readHook?.(); const view = { head: clone(c.currentHead) }; issued.add(view); return view;
  }, async assertCurrent(view) {
    assert.ok(issued.has(view), 'TEST_ORIGINAL_VIEW_REQUIRED');
    c.currentChecks++; await c.currentHook?.(view);
    assert.deepEqual(view.head, c.currentHead, 'TEST_CURRENT_HEAD_CHANGED');
  } };
  const c = { calls, observer, reads: 0, currentChecks: 0, currentHead: clone(head), dead: new Set(), gates: [0, 1, 2].map(deferred), time: 0, observedHeads: [0, 1, 2].map(() => clone(head)) };
  const originalResults = [0, 1, 2].map(index => ({ message: { validFrom: '1000', value: 'same' },
    signature: 'signature-' + index, abiSignature: { signerIndex: index }, head: clone(head),
    certificate: { frameHex: '00', signature: 'fact-' + index },
    healthCertificate: { message: { validFrom: '1000', health: true }, signature: 'health-' + index,
      abiSignature: { signerIndex: index } } }));
  c.resolve = index => c.gates[index].resolve(originalResults[index]);
  const actors = [0, 1, 2].map(signerIndex => {
    const actor = Object.freeze({ signerIndex });
    const invoke = (method, request, expectedHead, anchor, original) => {
      calls.push({ method, signerIndex, request, expectedHead, anchor, original });
      if (expectedHead) assert.deepEqual(c.observedHeads[signerIndex], expectedHead, 'TEST_ORIGINAL_HEAD_CHANGED');
      return c.gates[signerIndex].promise;
    };
    states.set(actor, { ready() { assert.ok(!c.dead.has(signerIndex), 'TEST_OPERATOR_CLOSED_OR_POISONED'); }, observer,
      bound: { registry: {}, configs: [{ registryCommitment: '34'.repeat(32) }] },
      health: (request, expectedHead, original) => invoke('health', request, expectedHead, undefined, original),
      backing: (request, reservation, expectedHead, original) => invoke(reservation ? 'reservation' : 'backing', request, expectedHead, undefined, original),
      certify: (request, expectedHead, anchor) => invoke('facts', request, expectedHead, anchor),
      authorizeIngress: (request, expectedHead) => invoke('ingress', request, expectedHead),
      authorizePayout: (request, expectedHead) => invoke('payout', request, expectedHead),
      authorizeBroadcast: (request, expectedHead) => invoke('broadcast', request, expectedHead),
      authorizeIngressBroadcast: (request, expectedHead) => invoke('broadcastIngressV3', request, expectedHead) });
    return actor;
  });
  const verify = permit => {
    assert.deepEqual(Array.from(permit.indexes), [0, 1, 2]);
    assert.equal(new Set(permit.signatures).size, 3, 'three independent actor results required');
  };
  // Keep the host realm's strict plain-data prototypes; only lexical actor
  // boundaries and the monotonic clock are supplied to the original factory.
  const factory = vm.runInThisContext('(function({ assert, exactRecord, fixedArray, operators, quorums, factsAnchors, '
    + 'A, freeze, copy, equal, claimFactsRequest, CLAIM_OPERATOR_PROFILE, CLAIM_QUORUM_COLLECTION_PROFILE, CLAIM_ORIGINAL_AUTHORIZATION_VALIDATION_PROFILE, CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE, CLAIM_BITCOIN_PAYOUT_BROADCAST_PROFILE, bitcoinBroadcastAuthorizations, performance, Buffer, assertClaimBackingQuorum, '
    + 'createNativeQuorumHostVerifier, encodeFlatNativeHealth, claimIngressAuthorizationFrame, claimPayoutAuthorizationFrame, '
    + 'claimPayoutBroadcastFrame, nonceIngressBroadcastFrame, claimBackingFrame }) { return (' + factorySource + '); })')({ assert,
    exactRecord(value, names) { assert.deepEqual(Object.keys(value).sort(), Array.from(names).sort()); },
    fixedArray(value, length) { assert.ok(Array.isArray(value)); assert.equal(value.length, length); },
    A, operators: states, quorums, factsAnchors: anchors, freeze: frozenInput,
    copy(value) {
      const result = cloneInput(value);
      if (c.snapshotAdvance !== undefined) { c.time = c.snapshotAdvance; delete c.snapshotAdvance; }
      return result;
    },
    equal: assert.deepEqual, claimFactsRequest: cloneInput, CLAIM_OPERATOR_PROFILE: 'HOST_SCHEDULING_ONLY',
    CLAIM_QUORUM_COLLECTION_PROFILE: 'SAME_HOST_CLAIM_COMMON_HEAD_COLLECTION_V3',
    CLAIM_ORIGINAL_AUTHORIZATION_VALIDATION_PROFILE: 'CLAIM_ORIGINAL_AUTHORIZATION_VALIDATION_V1',
    CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE: 'CLAIM_AUTHORIZATION_LIFECYCLE_V4',
    CLAIM_BITCOIN_PAYOUT_BROADCAST_PROFILE: 'CLAIM_BITCOIN_PAYOUT_BROADCAST_V1', bitcoinBroadcastAuthorizations: new WeakMap(),
    performance: { now: () => c.time }, Buffer,
    assertClaimBackingQuorum: verify,
    createNativeQuorumHostVerifier: () => ({ assertQuorumForMessage: verify }),
    encodeFlatNativeHealth: () => Buffer.from('health'), claimIngressAuthorizationFrame: () => Buffer.from('ingress'),
    claimPayoutAuthorizationFrame: () => Buffer.from('payout'), claimPayoutBroadcastFrame: () => Buffer.from('broadcast'),
    nonceIngressBroadcastFrame: () => Buffer.from('broadcast-ingress'), claimBackingFrame: () => Buffer.from('backing') });
  c.quorum = factory({ operators: actors }); c.results = originalResults; c.head = head; c.anchors = anchors;
  return c;
}
const indexes = c => c.calls.map(call => call.signerIndex);
const request = () => ({ claimDomain: '56'.repeat(32), mode: 'debt' });

test('claim quorum common-head v3: health, unprepared backing and V3 broadcast start all three independently', async () => {
  for (const method of ['health', 'backing', 'authorizePayout', 'authorizeBroadcast', 'authorizeIngressBroadcast']) {
    const c = fixture(); let settled = false;
    const operation = c.quorum[method](request()); operation.then(() => { settled = true; }, () => { settled = true; });
    assert.deepEqual(indexes(c), []); await turn();
    assert.deepEqual(indexes(c), [0, 1, 2]); assert.equal(c.reads, 1);
    const expected = c.calls[0].expectedHead;
    assert.notEqual(expected, c.results[0].head); assert.ok(Object.isFrozen(expected));
    for (const call of c.calls) { assert.equal(call.expectedHead, expected); assert.deepEqual(call.expectedHead, c.head); }
    c.resolve(2); c.resolve(0); await turn(); assert.equal(settled, false);
    await assert.rejects(c.quorum.health(request()), /CLAIM_QUORUM_BUSY/);
    c.resolve(1); const result = await operation;
    assert.equal(c.currentChecks, 1); assert.deepEqual(Array.from(result.indexes), [0, 1, 2]);
    assert.deepEqual(Array.from(result.signatures), ['signature-0', 'signature-1', 'signature-2']);
    assert.equal(c.quorum.collectionProfile, 'SAME_HOST_CLAIM_COMMON_HEAD_COLLECTION_V3');
  }
});

test('claim quorum common-head v3: read failure or liveness loss at the anchor starts no actor', async () => {
  for (const fault of ['read', 'closed']) {
    const c = fixture(); c.readHook = () => {
      if (fault === 'read') throw new Error('TEST_READ_FAILED');
      c.dead.add(2);
    };
    await assert.rejects(c.quorum.backing(request()), fault === 'read' ? /TEST_READ_FAILED/ : /CLOSED_OR_POISONED/);
    assert.deepEqual(indexes(c), []);
  }
});

test('claim quorum common-head v3: first signer failure drains every started actor and preserves signer-order error', async () => {
  const c = fixture(), first = new Error('SIGNER_ZERO_FAILED'), second = new Error('SIGNER_TWO_FAILED');
  let settled = false; const operation = c.quorum.backing(request());
  operation.then(() => { settled = true; }, () => { settled = true; });
  const rejected = assert.rejects(operation, error => error === first); await turn();
  c.gates[0].reject(first); c.gates[2].reject(second); await turn(); assert.equal(settled, false);
  await assert.rejects(c.quorum.health(request()), /CLAIM_QUORUM_BUSY/);
  c.resolve(1); await rejected; assert.equal(settled, true); assert.equal(c.currentChecks, 0);
  c.gates = [0, 1, 2].map(deferred);
  const next = c.quorum.health(request()); await turn(); c.resolve(0); c.resolve(1); c.resolve(2); await next;
});

test('claim quorum common-head v3: a synchronous actor head mismatch still starts and drains every sibling', async () => {
  const c = fixture(); let settled = false;
  c.observedHeads[0].hash = 'ff'.repeat(32);
  const operation = c.quorum.health(request()); operation.then(() => { settled = true; }, () => { settled = true; });
  const rejected = assert.rejects(operation, /TEST_ORIGINAL_HEAD_CHANGED/); await turn();
  assert.deepEqual(indexes(c), [0, 1, 2]); assert.equal(settled, false);
  c.resolve(1); await turn(); assert.equal(settled, false);
  await assert.rejects(c.quorum.backing(request()), /CLAIM_QUORUM_BUSY/);
  c.resolve(2); await rejected;
});

test('claim quorum common-head v3: one immutable request determines scheduling before the head await', async () => {
  const c = fixture(), input = { claimDomain: '56'.repeat(32), terms: { amount: '10' }, route: null, ownerAuthorization: null };
  const operation = c.quorum.backing(input);
  input.terms.amount = '999'; input.prepared = undefined; input.claimDomain = 'changed';
  await turn(); assert.deepEqual(indexes(c), [0, 1, 2]); const original = c.calls[0].request;
  assert.notEqual(original, input); assert.ok(Object.isFrozen(original) && Object.isFrozen(original.terms));
  for (const call of c.calls) {
    assert.equal(call.request, original); assert.equal(call.request.terms.amount, '10');
    assert.equal(call.request.claimDomain, '56'.repeat(32)); assert.equal(Object.hasOwn(call.request, 'prepared'), false);
  }
  c.resolve(0); c.resolve(1); c.resolve(2); await operation;
});

test('claim quorum scheduling: ingress presign/reservation remain serial', async () => {
  for (const [method, input] of [['reservation', { terms: { action: A.RESERVE_INGRESS } }], ['authorizeIngress', { prepared: {} }]]) {
    const c = fixture(), operation = c.quorum[method](input);
    assert.deepEqual(indexes(c), [0]); c.resolve(0); await turn(); assert.deepEqual(indexes(c), [0, 1]);
    if (Object.hasOwn(input, 'prepared')) delete input.prepared;
    await turn(); assert.deepEqual(indexes(c), [0, 1]);
    c.resolve(1); await turn(); assert.deepEqual(indexes(c), [0, 1, 2]);
    for (const call of c.calls.slice(1)) assert.equal(call.expectedHead, c.results[0].head);
    if (method === 'facts') {
      assert.ok(c.anchors.has(c.calls[1].anchor)); assert.equal(c.calls[2].anchor, c.calls[1].anchor);
      assert.equal(c.calls[1].anchor.certificate.signature, 'fact-0');
    }
    c.resolve(2); await operation; assert.equal(c.reads, 0); assert.equal(c.currentChecks, 0);
  }
});

test('claim quorum scheduling: own prepared undefined is rejected as malformed, never treated as absent', async () => {
  const c = fixture();
  await assert.rejects(c.quorum.backing({ prepared: undefined }), /INPUT_PLAIN_DATA/);
  assert.deepEqual(c.calls, []); assert.equal(c.reads, 0);
});

test('claim quorum scheduling: tail failure on a serial method never starts the third actor', async () => {
  for (const method of ['reservation', 'authorizeIngress']) {
    const c = fixture(), failure = new Error('SERIAL_SECOND_FAILED');
    const operation = c.quorum[method]({}), rejected = assert.rejects(operation, error => error === failure);
    c.resolve(0); await turn(); c.gates[1].reject(failure); await rejected;
    assert.deepEqual(indexes(c), [0, 1]);
  }
});

test('claim quorum common-head v3: every started actor is included in the strict whole-quorum clock', async () => {
  for (const endTime of [29_999, 30_000]) {
    const c = fixture(); const operation = c.quorum.health(request());
    const checked = endTime === 30_000 ? assert.rejects(operation, /CLAIM_QUORUM_AUDIT_TOO_OLD/) : operation;
    await turn(); c.time = 20_000; c.resolve(0); c.resolve(2); await turn();
    c.time = endTime; c.resolve(1); await checked;
  }
});

test('claim quorum common-head v3: immutable capture and initial head read stay inside the original deadline', async () => {
  for (const phase of ['copy', 'head']) {
    const c = fixture();
    if (phase === 'copy') c.snapshotAdvance = 10_000;
    else c.readHook = () => { c.time = 10_000; };
    const operation = c.quorum.health(request()), checked = assert.rejects(operation, /CLAIM_QUORUM_AUDIT_TOO_OLD/);
    await turn(); assert.equal(c.time, 10_000); c.resolve(0); c.resolve(1);
    c.time = 30_000; c.resolve(2); await checked;
  }
});

test('claim quorum common-head v3: final current await retains busy ownership and closes age/head/poison/close gaps', async () => {
  for (const fault of ['deadline', 'head', 'poison', 'close', 'pass']) {
    const c = fixture(), final = deferred(); let reached = false, settled = false;
    c.currentHook = async () => { reached = true; await final.promise; };
    const operation = c.quorum.backing(request()); operation.then(() => { settled = true; }, () => { settled = true; });
    const checked = fault === 'pass' ? operation : assert.rejects(operation,
      fault === 'deadline' ? /CLAIM_QUORUM_AUDIT_TOO_OLD/ : fault === 'head' ? /TEST_CURRENT_HEAD_CHANGED/ : /CLOSED_OR_POISONED/);
    await turn(); c.resolve(0); c.resolve(1); c.resolve(2); await turn();
    assert.ok(reached); assert.equal(settled, false);
    await assert.rejects(c.quorum.health(request()), /CLAIM_QUORUM_BUSY/);
    if (fault === 'deadline') c.time = 30_000;
    if (fault === 'pass') c.time = 29_999;
    if (fault === 'head') c.currentHead.hash = 'ff'.repeat(32);
    if (fault === 'poison' || fault === 'close') c.dead.add(0);
    final.resolve(); await checked;
  }
});

test('claim quorum common-head v3: independently returned head, backing or health disagreement cannot aggregate', async () => {
  for (const target of ['head', 'message', 'healthCertificate']) {
    const c = fixture();
    if (target === 'head') c.results[2].head.hash = 'ff'.repeat(32);
    else if (target === 'message') c.results[2].message.value = 'other';
    else c.results[2].healthCertificate.message.health = false;
    const operation = c.quorum.backing(request()), checked = assert.rejects(operation, /CLAIM_QUORUM_(?:HEAD_CHANGED|INVENTORY_DISAGREES|HEALTH_DISAGREES)/);
    await turn(); c.resolve(0); c.resolve(1); c.resolve(2); await checked;
  }
});

test('claim quorum common-head v3: original-only revalidation binds exact identity, head and bytes with no new authority', async () => {
  const c = fixture(); const issue = c.quorum.backing(request()); await turn();
  c.resolve(0); c.resolve(1); c.resolve(2); const original = await issue;
  assert.throws(() => c.quorum.assertOriginalAuthorizationCurrent(clone(original)), /ORIGINAL_QUORUM_AUTHORIZATION_REQUIRED/);
  assert.throws(() => c.quorum.assertOriginalAuthorizationCurrent(original, {}), /NO_OPTIONS/);
  assert.equal(await c.quorum.assertOriginalAuthorizationCurrent(original), undefined);
  assert.equal(c.calls.length, 6); for (const call of c.calls.slice(3)) assert.ok(call.original);
  c.currentHead.hash = 'ff'.repeat(32);
  await assert.rejects(c.quorum.assertOriginalAuthorizationCurrent(original), /ORIGINAL_QUORUM_AUTHORIZATION_HEAD/);
  assert.equal(c.calls.length, 6);
});


test('claim quorum common-head v3: exhausted head-read budget starts no actor', async () => {
  const c = fixture(); c.readHook = () => { c.time = 30_000; };
  await assert.rejects(c.quorum.backing(request()), /CLAIM_QUORUM_AUDIT_TOO_OLD/);
  assert.deepEqual(indexes(c), []);
});

const payoutStages = () => [['backing', { prepared: {}, terms: { action: A.BEGIN_PAYOUT } }],
  ['authorizePayout', { prepared: {} }], ['reservation', { terms: { action: A.RESERVE_PAYOUT } }], ['authorizeBroadcast', { prepared: {} }]];
test('every payout collection shares common-original-head, all-drain ownership and final-await head/liveness/deadline checks', async () => {
  for (const [method, input] of payoutStages()) for (const fault of ['late-rejection','head','closed','deadline','pass']) {
    const c=fixture(), final=deferred(); c.currentHook=()=>final.promise;
    const operation=c.quorum[method](input), checked=fault==='pass'?operation:assert.rejects(operation);
    await turn(); assert.deepEqual(indexes(c),[0,1,2]); assert.equal(c.reads,1);
    c.resolve(0); c.resolve(1); await turn();
    await assert.rejects(c.quorum.health(request()),/QUORUM_BUSY/);
    if(fault==='late-rejection')c.gates[2].reject(new Error('LATE_PAYOUT_SIBLING_FAILED'));else c.resolve(2);
    await turn();
    if(fault==='head')c.currentHead.hash='ff'.repeat(32);
    if(fault==='closed')c.dead.add(0);
    if(fault==='deadline')c.time=30000;
    if(fault==='pass')c.time=29999;
    final.resolve(); await checked;
  }
});

test('facts retain the first actual immutable certificate anchor, overlap only tails, and drain late failure before final original-current gate', async () => {
  for (const fault of ['pass','first','tail','deadline','head','closed']) {
    const c=fixture(), final=deferred();let settled=false;
    c.currentHook=()=>final.promise;
    const operation=c.quorum.facts({nativeId:'original'}), checked=fault==='pass'?operation:assert.rejects(operation);
    operation.then(()=>{settled=true;},()=>{settled=true;});
    await turn(); assert.deepEqual(indexes(c),[0]);assert.equal(c.reads,1);
    if(fault==='first'){c.gates[0].reject(Error('FIRST_FAILED'));await checked;assert.deepEqual(indexes(c),[0]);continue;}
    c.resolve(0);await turn();assert.deepEqual(indexes(c),[0,1,2]);
    const anchor=c.calls[1].anchor;assert.ok(c.anchors.has(anchor));assert.equal(anchor,c.calls[2].anchor);
    assert.equal(anchor.certificate.signature,'fact-0');assert.ok(Object.isFrozen(anchor));
    for(const call of c.calls)assert.deepEqual(call.expectedHead,c.head);
    if(fault==='tail')c.gates[1].reject(Error('TAIL_FAILED'));else c.resolve(1);
    await turn();assert.equal(settled,false);await assert.rejects(c.quorum.health(request()),/QUORUM_BUSY/);
    c.resolve(2);await turn();
    if(fault==='deadline')c.time=30000;
    if(fault==='head')c.currentHead.hash='ff'.repeat(32);
    if(fault==='closed')c.dead.add(0);
    final.resolve();await checked;
  }
});
