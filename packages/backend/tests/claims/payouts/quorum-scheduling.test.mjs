/** Controlled-promise tests of the actual quorum factory's orchestration.
 * Actor/signature boundaries are synthetic here; the combined-operator suite
 * separately exercises original actors, full audits and the shared native queue.
 * The SPL-tail case below additionally executes the original actor persistence
 * and signing bodies with real AEAD/CAS and host secp256k1 signatures. Its native
 * audit, ecrecover and branded-custody boundaries are explicit inert HOST ports;
 * no native node, proof, compiler, network or financial authority is created. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {validateRetainedClaimAuthorizationV1} from '../../../src/claims/authorization/retained-authorization-record-v1.mjs';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClaimVaultSession } from '../../../src/claims/storage/vault-session.mjs';
import { claimBackingFrame, claimIngressAuthorizationFrame, claimHash, assertClaimBackingQuorum }
  from '@lianum/engine/claims/permits';
import { claimUint } from '@lianum/engine/claims/framing';
import { encodeFlatNativeHealth } from '../../../src/chains/shared/health/native-health.mjs';
import { signature as lowSignature } from '@lianum/engine/notes/private-note-encoding';
import { nativeHubSignatureToAbi } from '@lianum/engine/evidence/native-hub-messages';
import { createNativeQuorumHostVerifier, nativeQuorumRegistryCommitment, NATIVE_QUORUM_PROFILE }
  from '@lianum/engine/evidence/native-quorum';
import { CLAIM_ACTIONS as A } from '@lianum/engine/claims/permits';
import { cloneInput, frozenInput } from '@lianum/components/plain-input';

const source = readFileSync(new URL('../../../src/claims/operations/operators.mjs', import.meta.url), 'utf8');
const start = source.indexOf('export function createClaimOperatorQuorum(input) {');
const end = source.indexOf('\n/** Original-brand private diagnostics,', start);
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
    + 'claimPayoutBroadcastFrame, nonceIngressBroadcastFrame, claimBackingFrame, claimDomainCommitment, isOwnedSolanaSplCustodyV1, assertOwnedSolanaSplCustodyV1 }) { return (' + factorySource + '); })')({ assert,
    exactRecord(value, names) { assert.deepEqual(Object.keys(value).sort(), Array.from(names).sort()); },
    fixedArray(value, length) { assert.ok(Array.isArray(value)); assert.equal(value.length, length); },
    A, operators: states, quorums, factsAnchors: anchors, freeze: frozenInput,
    copy(value) {
      const result = cloneInput(value);
      if (c.snapshotAdvance !== undefined) { c.time = c.snapshotAdvance; delete c.snapshotAdvance; }
      return result;
    },
    claimDomainCommitment: config => config.claimDomain ?? null, isOwnedSolanaSplCustodyV1: () => false,
    assertOwnedSolanaSplCustodyV1() { throw new Error('HOST_LEGACY_HAS_NO_SPL_CUSTODY'); },
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


function actorPart(from, to) {
  const a = source.indexOf(from), b = source.indexOf(to, a);
  assert.ok(a >= 0 && b > a, 'HOST_ORIGINAL_ACTOR_SOURCE_REQUIRED');
  return source.slice(a, b);
}
const originalSigningBodies = [
  actorPart('  async function readVault()', '  async function save('),
  actorPart('  async function save(', '  function withinAuditBudget('),
  actorPart('  function withinAuditBudget(', '  async function jointCurrent()'),
  actorPart('  async function serial(', '  async function audit('),
  actorPart('  function assertOriginalAuthorization(', '  /** V4 is intentionally different'),
  actorPart('  async function signed(', '  // Only the fixed backing/reservation'),
  actorPart('  async function signedPair(', '  async function retainInventoryAudit('),
].join('\n');

async function splTailHost(t, { branded = true, copiedNative = false, claimDomainMatches = true, reservationAction = A.RESERVE_INGRESS } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'original-spl-tail-host-'));
  const keys = Array.from({ length: 4 }, () => generateKeyPairSync('ec', { namedCurve: 'secp256k1' }));
  const registry = { profile: NATIVE_QUORUM_PROFILE, hubDomain: '11'.repeat(32), registryEpoch: '1', rulesRoot: '22'.repeat(32),
    keys: keys.map(key => { const j = key.publicKey.export({ format: 'jwk' });
      return { x: Buffer.from(j.x, 'base64url').toString('hex'), y: Buffer.from(j.y, 'base64url').toString('hex') }; }) };
  const registryCommitment = nativeQuorumRegistryCommitment(registry);
  const domain = '33'.repeat(32), head = { number: '60', hash: '44'.repeat(32), timestamp: '1000' };
  const native = Object.freeze({ hostPort: 'INERT_SPL_CUSTODY_BOUNDARY' }), splBrands = new WeakSet();
  if (branded) splBrands.add(native);
  const c = { time: 0, closed: false, calls: [], keys: [0, 0, 0], saves: [0, 0, 0], aggregated: 0,
    checks: [0, 0, 0], poisoned: new Set(), workGates: [0, 1, 2].map(deferred),
    reached: [0, 1, 2].map(deferred), failures: new Map(), failSave: new Map(), expectedHeads: [],
    sessions: [], actors: [], states: new WeakMap(), quorums: new WeakMap(), pending: [], returned: [] };
  const issued = new WeakSet();
  const observer = { async read() { const view = { head: clone(head), gateways: [{}] }; issued.add(view); return view; },
    async assertCurrent(view) { assert.ok(issued.has(view), 'HOST_ORIGINAL_VIEW'); assert.deepEqual(view.head, head); } };
  const binding = { observer, registry, configs: [{ registryCommitment, claimDomain: claimDomainMatches ? domain : '55'.repeat(32) }],
    nativeRuntimes: [copiedNative ? Object.freeze({ ...native }) : native] };
  const ingressMessage = { claimDomain: domain, intentId: '66'.repeat(32), revision: '1', claimSequence: '1', hubStateSequence: '1',
    amount: '100', wireKeyCommitment: '77'.repeat(32), unsignedWireCommitment: '88'.repeat(32), maxFee: '10',
    revocationState: '99'.repeat(32), inventoryCommitment: 'aa'.repeat(32), obligationsCommitment: 'bb'.repeat(32),
    validFrom: '1000', validUntil: '1030' };
  const backingMessage = { claimDomain: domain, custodyInventoryDomain: '66'.repeat(32), actionDigest: '77'.repeat(32),
    expectedClaimSequence: '1', hubStateSequence: '1', revocationState: '00'.repeat(32), wrapperSupply: '0', pendingRedemptions: '0',
    pendingRefunds: '0', heldUnissued: '0', unknownExposure: '0', nativePrincipalAvailable: '1000', feeReserveAvailable: '100',
    reservedFeesAfter: '10', inventoryCommitment: 'aa'.repeat(32), obligationsCommitment: 'bb'.repeat(32), validFrom: '1000', validUntil: '1030' };
  const field = '00'.repeat(31) + '01';
  const healthMessage = { pool: '11'.repeat(20), domain: field, hubDomain: registry.hubDomain, registryCommitment,
    evidenceState: field, receiptRoot: field, receiptCount: '0', spentTagDigest: '00'.repeat(32), spentTagCount: '0', spentTagSequence: '0',
    revokedDigest: field, revokedCount: '0', revocationSequence: '0', stateSequence: '1', revocationOverflowDigest: '00'.repeat(32),
    revocationOverflowCount: '0', halted: '0', validFrom: '1000', validUntil: '1030' };
  t.after(async () => {
    c.workGates.forEach(gate => gate.resolve()); await Promise.allSettled(c.pending);
    for (const session of c.sessions) session.close(); await rm(directory, { recursive: true, force: true });
  });
  for (const index of [0, 1, 2]) {
    const session = createClaimVaultSession({ path: join(directory, `operator-${index}.json`), password: `host-role-${index}` });
    c.sessions.push(session); const initialRecord = await session.create({ authorizations: [] });
    const vault = { read: () => session.read(), async update(revision, transform) {
      c.saves[index]++; if (c.failSave.has(index)) throw c.failSave.get(index);
      return session.update(revision, transform);
    } };
    const address = (index + 1).toString(16).padStart(40, '0');
    // The RPC port only selects recovery-v for the real host signature. It is
    // deliberately not an EVM, inventory observation or acceptance receipt.
    const bound = { ...binding, runtime: { async call(request, block) {
      assert.equal(request.to, '0x0000000000000000000000000000000000000001'); assert.equal(block, '0x3c');
      return request.data.slice(66, 130) === 27n.toString(16).padStart(64, '0') ? '0x' + '00'.repeat(12) + address : '0x' + '00'.repeat(32);
    } } };
    const environment = {validateRetainedClaimAuthorizationV1, assert, Buffer, signerIndex: index, initialRecord, bound, vault, observer, address, key: keys[index],
      performance: { now: () => c.time }, copy: cloneInput, freeze: frozenInput, equal: assert.deepEqual,
      claimHash, claimUint, claimBackingFrame, encodeFlatNativeHealth, nativeHubSignatureToAbi, claimIngressAuthorizationFrame,
      lowSignature(key, frame) { c.keys[index]++; return lowSignature(key, frame); }, c,
    };
    // These are the source's own serial, current, AEAD read/save, signed and
    // fixed-pair bodies. Only reciprocal audit/metrics/lifetime lower ports are
    // inert here; no combined-custody authority is manufactured by this test.
    const actorFactory = vm.runInThisContext('(function({ ' + Object.keys(environment).join(', ') + ' }) {'
      + 'let record=initialRecord,busy=false,poisoned=false,closed=false,operationGeneration=0,activeKeyUsed=false,activeView,cachedView,activeFactsAnchor,activeV4=null,activeV4Facts=null,started,auditMethod,auditRound,activeAuditMetrics; const custody=null;'
      + 'function live(){assert.ok(!c.closed&&!closed&&!poisoned,"HOST_ACTOR_CLOSED_OR_POISONED");} function ready(){live();} function poison(){poisoned=true;c.poisoned.add(signerIndex);}'
      + 'function beginMetrics(){return null;} function enterMetrics(){return null;} function leaveMetrics(){} function finishMetrics(){} function checkpointMetrics(){}'
      + 'async function jointCurrent(){await current();c.checks[signerIndex]++;await current();}'
      + originalSigningBodies
      + 'return { invoke(method,expectedHead,original){return serial(async()=>{c.calls.push({index:signerIndex,method});c.expectedHeads.push({index:signerIndex,head:expectedHead});c.reached[signerIndex].resolve();await c.workGates[signerIndex].promise;if(c.failures.has(signerIndex))throw c.failures.get(signerIndex);'
      + 'let result;if(method==="ingress")result=await signed("ingress",c.ingressMessage,claimIngressAuthorizationFrame(c.ingressMessage));else{const pair=await signedPair("reservation",c.backingMessage,c.healthMessage,original);result=freeze({...pair[0],healthCertificate:pair[1]});}'
      + 'if(c.mutateResult&&signerIndex===2)result=c.mutateResult(copy(result));c.returned[signerIndex]=result;return result;},expectedHead);},status(){return copy(record);}};})')(environment);
    const actor = Object.freeze({ signerIndex: index }); c.actors.push(actor);
    c.states.set(actor, { ready() { assert.ok(!c.closed && !c.poisoned.has(index), 'HOST_ACTOR_CLOSED_OR_POISONED'); }, observer, bound: binding,
      supportsV4: false, authorizeIngress: (request, expectedHead) => actorFactory.invoke('ingress', expectedHead),
      backing: (request, reservation, expectedHead, original) => {
        assert.equal(reservation, true); return actorFactory.invoke('reservation', expectedHead, original);
      } });
    c.actorStatus ??= []; c.actorStatus.push(() => actorFactory.status());
  }
  c.ingressMessage = ingressMessage; c.backingMessage = backingMessage; c.healthMessage = healthMessage;
  const environment = { assert, Buffer, A, operators: c.states, quorums: c.quorums, factsAnchors: new WeakSet(),
    exactRecord(value, names) { assert.deepEqual(Object.keys(value).sort(), Array.from(names).sort()); },
    fixedArray(value, length) { assert.equal(value.length, length); }, freeze: frozenInput, copy: cloneInput, equal: assert.deepEqual,
    performance: { now: () => c.time }, claimDomainCommitment: config => config.claimDomain,
    isOwnedSolanaSplCustodyV1: value => splBrands.has(value), assertOwnedSolanaSplCustodyV1(value) { assert.ok(splBrands.has(value) && !c.closed, 'HOST_ORIGINAL_SPL_CUSTODY_REQUIRED'); },
    CLAIM_OPERATOR_PROFILE: 'HOST_ORIGINAL_BODY_ONLY', CLAIM_QUORUM_COLLECTION_PROFILE: 'SAME_HOST_CLAIM_COMMON_HEAD_COLLECTION_V3',
    CLAIM_ORIGINAL_AUTHORIZATION_VALIDATION_PROFILE: 'CLAIM_ORIGINAL_AUTHORIZATION_VALIDATION_V1',
    CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE: 'CLAIM_AUTHORIZATION_LIFECYCLE_V4',
    CLAIM_BITCOIN_PAYOUT_BROADCAST_PROFILE: 'CLAIM_BITCOIN_PAYOUT_BROADCAST_V1', bitcoinBroadcastAuthorizations: new WeakMap(),
    claimBackingFrame, claimIngressAuthorizationFrame, encodeFlatNativeHealth, claimFactsRequest: cloneInput,
    assertClaimBackingQuorum(permit, config) { const result = assertClaimBackingQuorum(permit, config); c.aggregated++; return result; },
    createNativeQuorumHostVerifier(config) { const verifier = createNativeQuorumHostVerifier(config); return {
      assertQuorumForMessage(input) { const result = verifier.assertQuorumForMessage(input); c.aggregated++; return result; } }; },
  };
  c.quorum = vm.runInThisContext('(function({ ' + Object.keys(environment).join(', ') + ' }) {return (' + factorySource + ');})')(environment)({ operators: c.actors });
  c.start = method => { const request = { claimDomain: domain, ...(method === 'reservation' ? { terms: { action: reservationAction } } : { prepared: { hostFixture: true } }) };
    const operation = method === 'reservation' ? c.quorum.reservation(request) : c.quorum.authorizeIngress(request);
    c.pending.push(operation); return operation; };
  return c;
}

test('original SPL first-head quorum: real actor AEAD/signatures, independent tails, drain and unchanged authority gates', async t => {
  for (const method of ['ingress', 'reservation']) {
    const c = await splTailHost(t), operation = c.start(method); let settled = false;
    operation.then(() => { settled = true; }, () => { settled = true; });
    await c.reached[0].promise; assert.deepEqual(c.calls.map(x => x.index), [0]); assert.deepEqual(c.keys, [0, 0, 0]);
    c.workGates[0].resolve(); await Promise.all([c.reached[1].promise, c.reached[2].promise]);
    // The first original head must finish before either tail starts. The two
    // independent authenticated tails may reach their ports in either order.
    assert.deepEqual([c.calls[0].index, ...c.calls.slice(1).map(x => x.index).sort((a, b) => a - b)], [0, 1, 2]);
    assert.equal(c.keys[0], method === 'ingress' ? 1 : 2); assert.deepEqual(c.keys.slice(1), [0, 0]);
    for (const entry of c.expectedHeads.slice(1)) assert.equal(entry.head, c.returned[0].head);
    c.workGates[2].resolve(); await turn(); assert.equal(settled, false); assert.equal(c.aggregated, 0);
    await assert.rejects(c.start(method), /CLAIM_QUORUM_BUSY/);
    c.workGates[1].resolve(); const result = await operation;
    assert.deepEqual(result.indexes, [0, 1, 2]); assert.deepEqual(c.keys, method === 'ingress' ? [1, 1, 1] : [2, 2, 2]);
    for (const status of c.actorStatus) {
      const record = status(); assert.equal(record.data.authorizations.length, method === 'ingress' ? 1 : 2);
      assert.ok(record.data.authorizations.every(row => row.signature && row.abiSignature));
    }
    if (method === 'reservation') {
      const saves = [...c.saves], keys = [...c.keys];
      assert.throws(() => c.quorum.assertOriginalAuthorizationCurrent(clone(result)), /ORIGINAL_QUORUM_AUTHORIZATION_REQUIRED/);
      await c.quorum.assertOriginalAuthorizationCurrent(result);
      assert.deepEqual(c.saves, saves); assert.deepEqual(c.keys, keys); // validation creates no signature or journal row
    }
  }
  {
    const c = await splTailHost(t), failure = new Error('HOST_FIRST_ORIGINAL_FAILED'); c.failures.set(0, failure);
    const operation = c.start('ingress'), rejected = assert.rejects(operation, error => error === failure);
    await c.reached[0].promise; c.workGates[0].resolve(); await rejected;
    assert.deepEqual(c.calls.map(x => x.index), [0]); assert.deepEqual(c.keys, [0, 0, 0]); assert.equal(c.aggregated, 0);
  }
  {
    const c = await splTailHost(t), earlier = new Error('HOST_TAIL_ONE_CAS_FAILED'), later = new Error('HOST_TAIL_TWO_CAS_FAILED');
    c.failSave.set(1, earlier); c.failSave.set(2, later); let settled = false;
    const operation = c.start('reservation'); operation.then(() => { settled = true; }, () => { settled = true; });
    const rejected = assert.rejects(operation, error => error.message === 'CLAIM_OPERATOR_DURABLE_WRITE_UNCERTAIN' && error.cause === earlier);
    await c.reached[0].promise; c.workGates[0].resolve(); await Promise.all([c.reached[1].promise, c.reached[2].promise]);
    c.workGates[2].resolve(); await turn(); assert.equal(settled, false); assert.equal(c.aggregated, 0);
    c.workGates[1].resolve(); await rejected; assert.deepEqual([...c.poisoned].sort(), [1, 2]);
    assert.deepEqual(c.keys, [2, 0, 0]); assert.equal(c.aggregated, 0);
  }
  for (const fault of ['head', 'message', 'signature', 'deadline', 'closed']) {
    const c = await splTailHost(t); let operation = c.start('ingress');
    const rejection = fault === 'head' ? /CLAIM_QUORUM_HEAD_CHANGED/ : fault === 'message' ? /CLAIM_QUORUM_INVENTORY_DISAGREES/
      : fault === 'signature' ? /NATIVE_QUORUM_SIGNATURE_INVALID/ : fault === 'deadline' ? /CLAIM_OPERATOR_AUDIT_TOO_OLD/ : /CLOSED_OR_POISONED/;
    const rejected = assert.rejects(operation, rejection);
    await c.reached[0].promise; c.workGates[0].resolve(); await Promise.all([c.reached[1].promise, c.reached[2].promise]);
    if (fault === 'head') c.mutateResult = result => ({ ...result, head: { ...result.head, hash: 'ff'.repeat(32) } });
    if (fault === 'message') c.mutateResult = result => ({ ...result, message: { ...result.message, amount: '101' } });
    if (fault === 'signature') c.mutateResult = result => ({ ...result, signature: c.returned[0].signature });
    if (fault === 'deadline') c.time = 30_000;
    if (fault === 'closed') c.closed = true;
    c.workGates[1].resolve(); c.workGates[2].resolve(); await rejected;
  }
  for (const scope of [{ branded: false }, { copiedNative: true }, { claimDomainMatches: false }, { reservationAction: A.RESERVE_PAYOUT }]) {
    const c = await splTailHost(t, scope), operation = c.start('reservation');
    // RESERVE_PAYOUT already has the separate original common-head branch;
    // it remains there and is not selected by the new private SPL predicate.
    if (scope.reservationAction === A.RESERVE_PAYOUT) {
      await Promise.all(c.reached.map(x => x.promise)); c.workGates.forEach(x => x.resolve()); await operation;
    } else {
      await c.reached[0].promise; c.workGates[0].resolve(); await c.reached[1].promise;
      assert.deepEqual(c.calls.map(x => x.index), [0, 1]); c.workGates[1].resolve(); await c.reached[2].promise;
      c.workGates[2].resolve(); await operation;
    }
  }
});
