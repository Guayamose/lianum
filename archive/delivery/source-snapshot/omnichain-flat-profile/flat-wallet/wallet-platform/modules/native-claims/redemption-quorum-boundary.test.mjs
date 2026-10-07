/** Source-extracted redemption -> aggregate -> preparation -> original-only
 * final audit tests. Every I/O, actor and dispatch port is synthetic. No owned
 * runtime, private key, signature function, prover or network is invoked. The
 * simulated histories establish host ordering, not loaded native acceptance.
 * The exact production V4 quorum, private lease opener, controller dispatch,
 * and key-token consumer are composed over modeled actor/storage/read ports. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { CLAIM_ACTIONS as A } from './permits.mjs';
import { cloneInput as copy, frozenInput as freeze } from '../paeg/readiness-inputs.mjs';

const claimSource = readFileSync(new URL('./operators.mjs', import.meta.url), 'utf8');
const controllerSource = readFileSync(new URL('./controller.mjs', import.meta.url), 'utf8');
const cut = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'TEST_EXACT_PRODUCTION_SOURCE_BOUNDARY'); return source.slice(a, b);
};
const quorumSource = cut(claimSource, 'export function createClaimOperatorQuorum(input) {', '\nexport function assertOwnedClaimOperatorQuorum').replace(/^export /, '');
const leaseSource = cut(claimSource, 'export function openClaimOriginalAuthorizationLeaseV4(', '\nexport function createClaimOperatorQuorum').replace(/^export /, '');
const keyConsumerSource = cut(controllerSource, 'export function consumeNativeClaimOriginalKeyAuthorityV4(', '\n// Only the genuine completed payout').replace(/^export /, '');
const controllerLeaseSource = cut(controllerSource, '  async function originalLeaseV4(', '\n  async function payoutKeyAuthorityV4(');
const originalGuardSource = cut(claimSource, '  function assertOriginalAuthorization(', '\n  async function signed(');
const controllerHelpers = cut(controllerSource, "const FINAL_AUDIT_PROFILE =", '/** Runtime gate calls this once.');
const authorizeSource = cut(controllerSource, '  async function authorize(method, request) {', '\n  const readers =');
const evmSource = cut(controllerSource, '  async function evm({', '\n  function endpoint(');
const redeemSource = cut(controllerSource, '    requestRedemption: request =>', '\n    payout: request =>').trim().replace(/,$/, '');
const uint = value => { assert.match(value, /^(0|[1-9][0-9]*)$/); return BigInt(value); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const codec = value => Buffer.from(JSON.stringify(value));
const exactRecord = (value, keys) => assert.deepEqual(Object.keys(value).sort(), Array.from(keys).sort());
const frame = (kind, value) => codec({ kind, value });
const emptyDecode = () => assert.fail('TEST_REDEMPTION_HAS_NO_PROOF_DECODING');
const compile = (body, environment) => vm.runInThisContext('(function({' + Object.keys(environment).join(',') + '}) {' + body + '\n})')(environment);

function fixture() {
  const c = { time: 0, reads: [], calls: [], validations: [], histories: [], dead: new Set(), dispatches: 0,
    guardPassed: 0, round: 0, currentChecks: 0, fixtureOnlyNoKey: true, sourceGeneration: 0 };
  const head = { number: '60', hash: '12'.repeat(32), timestamp: '1000' };
  const snapshot = { head: copy(head) }, issued = new WeakSet([snapshot]);
  const view = { snapshot, gateway: { nextTicketNonce: '0', tickets: [] } };
  c.head = head; c.snapshot = snapshot;
  const observer = { async read() { const result = { head: copy(head) }; issued.add(result); return result; },
    async assertCurrent(value) {
      assert.ok(issued.has(value), 'TEST_ORIGINAL_OBSERVER_VIEW');
      c.currentChecks++; await c.currentHook?.(value);
      assert.deepEqual(value.head, head, 'TEST_CURRENT_HEAD_CHANGED');
    } };
  const originalValidationLeases = new WeakMap();
  const states = new WeakMap(), quorums = new WeakMap(), operatorJournals = [0, 1, 2].map(() => ({ data: { authorizations: [] } }));
  // Distinct per-operator modeled histories include old and unadmitted rows,
  // both configured families, graph and custody branches. No expiry pruning.
  c.histories = [0, 1, 2].map(signerIndex => ['custody', 'graph'].flatMap(branch => ['BTC', 'SOL'].flatMap(family =>
    Array.from({ length: 17 }, (_, index) => ({ signerIndex, branch, family, index, expired: index < 5, admitted: index % 2 === 0, adverse: false })))));
  const actors = [0, 1, 2].map(signerIndex => {
    const actor = Object.freeze({ signerIndex });
    const ready = () => assert.ok(!c.dead.has(signerIndex), 'TEST_OPERATOR_CLOSED_OR_POISONED');
    const backing = async (request, reservation, expectedHead, original) => {
      const auditStarted = c.time; ready(); assert.equal(reservation, false); assert.deepEqual(head, expectedHead, 'TEST_ACTOR_HEAD');
      const validation = Boolean(original); c.calls.push({ signerIndex, validation, request });
      // Independent logical reads all drain. A failed modeled read is retained
      // and refused after the scan, as the production audit source prescribes.
      let bad = false;
      for (const entry of c.histories[signerIndex]) { await Promise.resolve(); c.reads.push(copy(entry)); bad ||= entry.adverse; }
      assert.equal(bad, false, 'TEST_RETAINED_ADVERSE_HISTORY');
      await c.actorHook?.({ signerIndex, validation, request }); ready();
      assert.ok(c.time >= auditStarted && c.time - auditStarted < 30000, 'CLAIM_QUORUM_AUDIT_TOO_OLD');
      const message = { claimDomain: request.claimDomain, actionDigest: hash(codec(request.terms)), inventoryCommitment: hash(Buffer.from('synthetic-full-inventory')),
        validFrom: head.timestamp, validUntil: c.until ?? (BigInt(head.timestamp) + 30n).toString() };
      const health = { health: true, validFrom: message.validFrom, validUntil: message.validUntil };
      const make = (kind, message) => ({ kind, message, digest: hash(frame(kind === 'health' ? 'health' : 'backing', message)),
        signature: 'SYNTHETIC_ONLY_' + kind + '_' + signerIndex, abiSignature: { signerIndex: String(signerIndex), v: '27', r: 'synthetic', s: 'synthetic' },
        signerIndex, head: copy(head) });
      let permit, healthCertificate;
      if (original) {
        c.validations.push(signerIndex);
        const guard = compile(originalGuardSource + '; return assertOriginalAuthorization;', { assert, equal: assert.deepEqual,
          claimUint: uint, claimHash: hash, signerIndex, activeView: { head }, record: operatorJournals[signerIndex] });
        permit = guard('backing', message, frame('backing', message), original.result, original.frameHex);
        healthCertificate = guard('health', health, frame('health', health), original.result.healthCertificate, original.healthFrameHex);
        permit = { ...copy(permit), signerIndex, head: copy(head) };
        healthCertificate = { ...copy(healthCertificate), signerIndex, head: copy(head) };
      } else {
        permit = make('backing', message); healthCertificate = make('health', health);
        operatorJournals[signerIndex].data.authorizations = [copy(permit), copy(healthCertificate)];
      }
      return freeze({ ...permit, healthCertificate, authorizationLifecycleProfile: 'CLAIM_AUTHORIZATION_LIFECYCLE_V4',
        economicInventoryCommitment: hash(Buffer.from('synthetic-full-inventory')) });
    };
    states.set(actor, { ready, observer, bound: { registry: {}, configs: [{ registryCommitment: '34'.repeat(32) }] }, backing,
      supportsV4: true, keyUseEpoch: 0, poisonIfKeyUsed() {}, nativeReadHandles: () => [],
      captureV4EvmFence: () => c.sourceGeneration, captureV4NativeState: () => ({ generation: c.sourceGeneration }),
      assertV4ResultCurrent(result, fence) { ready(); assert.equal(c.sourceGeneration, fence, 'TEST_SOURCE_GENERATION_CHANGED');
        assert.equal(result.signature, operatorJournals[signerIndex].data.authorizations[0].signature, 'CLAIM_ORIGINAL_AUTHORIZATION_RECORD_CHANGED'); } });
    return actor;
  });
  const verify = permit => {
    assert.deepEqual(permit.indexes, [0, 1, 2]); assert.equal(new Set(permit.signatures).size, 3);
    assert.ok(permit.signatures.every(signature => signature.startsWith('SYNTHETIC_ONLY_')));
  };
  const quorumEnvironment = {
    assert, exactRecord, fixedArray: (v, n) => assert.equal(v.length, n), A, operators: states, quorums, factsAnchors: new WeakSet(), originalValidationLeases,
    claimUint: uint, CLAIM_ORIGINAL_AUTHORIZATION_LEASE_PROFILE: 'CLAIM_ORIGINAL_AUTHORIZATION_LEASE_V4',
    quiesceOwnedOperatorNativeReads: async () => Object.freeze({ generation: c.sourceGeneration }),
    assertOwnedOperatorNativeReadsQuiescent: value => assert.equal(value.generation, c.sourceGeneration, 'TEST_QUEUE_GENERATION_CHANGED'),
    releaseOwnedOperatorNativeReadQuiescence() {},
    freeze, copy, equal: assert.deepEqual, claimFactsRequest: copy, CLAIM_OPERATOR_PROFILE: 'SYNTHETIC_TEST_ONLY',
    CLAIM_QUORUM_COLLECTION_PROFILE: 'SAME_HOST_CLAIM_COMMON_HEAD_COLLECTION_V3',
    CLAIM_ORIGINAL_AUTHORIZATION_VALIDATION_PROFILE: 'CLAIM_ORIGINAL_AUTHORIZATION_VALIDATION_V1',
    CLAIM_AUTHORIZATION_LIFECYCLE_PROFILE: 'CLAIM_AUTHORIZATION_LIFECYCLE_V4',
    CLAIM_BITCOIN_PAYOUT_BROADCAST_PROFILE: 'CLAIM_BITCOIN_PAYOUT_BROADCAST_V1', bitcoinBroadcastAuthorizations: new WeakMap(), performance: { now: () => c.time }, Buffer,
    assertClaimBackingQuorum: (permit, expected) => { verify(permit); assert.ok(uint(permit.message.validFrom) <= uint(expected.timestamp)
      && uint(expected.timestamp) < uint(permit.message.validUntil), 'TEST_INITIAL_CERTIFICATE_EXPIRED'); },
    createNativeQuorumHostVerifier: () => ({ assertQuorumForMessage: verify }),
    encodeFlatNativeHealth: v => frame('health', v), claimBackingFrame: v => frame('backing', v),
    claimIngressAuthorizationFrame: emptyDecode, claimPayoutAuthorizationFrame: emptyDecode,
    claimPayoutBroadcastFrame: emptyDecode, nonceIngressBroadcastFrame: emptyDecode,
  };
  const quorumFactory = compile(quorumSource + '; return createClaimOperatorQuorum;', quorumEnvironment);
  const openClaimOriginalAuthorizationLeaseV4 = compile(leaseSource + '; return openClaimOriginalAuthorizationLeaseV4;', quorumEnvironment);
  const originalQuorum = quorumFactory({ operators: actors });
  const quorum = Object.freeze({ authorizationLifecycleProfile: 'CLAIM_AUTHORIZATION_LIFECYCLE_V4',
    async backing(request) { c.round++; const result = await originalQuorum.backing(request); c.original = result; return result; },
    async validateOriginalAuthorizationV4(result) { c.round++; await c.finalAuditHook?.(result);
      return originalQuorum.validateOriginalAuthorizationV4(result); } });
  const claimOperators = { openClaimOriginalAuthorizationLeaseV4(token, value, result) {
    assert.equal(value, quorum); return openClaimOriginalAuthorizationLeaseV4(token, originalQuorum, result); } }; 
  c.quorum = originalQuorum; c.operatorJournals = operatorJournals;
  const journalData = { tickets: [], evm: [] };
  const journal = { async read() { return copy(journalData); }, async update(work) {
    const next = work(copy(journalData)); await c.journalHook?.(next);
    Object.assign(journalData, copy(next)); return copy(journalData);
  } };
  const dispatchTokens = new WeakMap(), authorizationStarts = new WeakMap(), authorizationOrigins = new WeakMap(), originalKeyAuthoritiesV4 = new WeakMap();
  const domain = '56'.repeat(32), caller = '0x' + '78'.repeat(20), id = '9a'.repeat(32);
  const gateway = { address: '0x' + 'ab'.repeat(20), artifact: {} }, config = { ledgerNamespace: 'bc'.repeat(32) };
  const runtime = { accounts: [caller], metadata: { evmGenesis: 'cd'.repeat(32), chainId: '31337' }, async dispatch(token) {
    // Synthetic guard driver only: never constructs an owned runtime or calls a
    // key, onSigned, signer, send or native operation. Passing the guard is the
    // observable terminal point; journal success below is test scaffolding.
    c.dispatches++; const scope = dispatchTokens.get(token).scope, tx = scope.transaction;
    const prepared = { genesis: runtime.metadata.evmGenesis,
      head: { number: '0x' + BigInt(head.number).toString(16), hash: '0x' + head.hash, timestamp: '0x' + BigInt(head.timestamp).toString(16) },
      transaction: { ...copy(tx), gas: BigInt(tx.gas).toString(), value: '0', chainId: runtime.metadata.chainId } };
    c.prepared = prepared; c.scope = scope; await c.prepareHook?.(prepared);
    if (c.replay === 'concurrent') {
      const settled = await Promise.allSettled([scope.beforeSign(prepared), scope.beforeSign(prepared)]);
      const rejected = settled.find(result => result.status === 'rejected'); if (rejected) throw rejected.reason;
    }
    else { const keyToken = await scope.beforeSign(prepared); if (c.replay === 'serial') await scope.beforeSign(prepared);
      await c.beforeConsumeHook?.(); c.auditStarted = scope.consumeBeforeKey(keyToken, prepared);
      if (c.replay === 'key-token') scope.consumeBeforeKey(keyToken, prepared); }
    c.guardPassed++;
    c.runtimeOriginal = { prepared, signed: { nativeWire: 'SYNTHETIC_NO_KEY_OR_TRANSACTION' } };
    await scope.onSigned(c.runtimeOriginal.signed); journalData.evm.at(-1).status = 'SUCCEEDED';
    view.gateway.tickets.push({ ticket: copy(journalData.tickets.at(-1).ticket) });
  } };
  const live = () => { for (const actor of actors) states.get(actor).ready(); };
  const updateEvm = async (id, change) => journal.update(data => { Object.assign(data.evm.find(row => row.id === id), copy(change)); return data; });
  const env = { assert, copy, freeze, claimUint: uint, claimHash: hash, exactRecord, Buffer, performance: { now: () => c.time },
    A: { PREPOSITION: '0', ISSUE: '3', REDEEM: '5', BEGIN_PAYOUT: '6', RESERVE_INGRESS: '2', RESERVE_PAYOUT: '7' },
    decodeDepositIntentInputs: emptyDecode, decodeClaimIngressInputs: emptyDecode, decodeClaimDischargeInputs: emptyDecode,
    authorizationStarts, authorizationOrigins, originalKeyAuthoritiesV4, quorum, dispatchTokens, journal, runtime, observer, claimOperators,
    assertIngressKeeperLive: () => assert.ok(!c.keeperUncertain, 'CLAIM_EVM_KEEPER_UNAVAILABLE'),
    clearUnknown: async () => {}, live, selected: () => ({ gateway, config }), randomBytes: n => Buffer.alloc(n, c.dispatches + 1),
    encodeControllerClaimCall: (_artifact, method, args) => '0x' + codec({ method, args }).toString('hex'), hashCalldata: value => hash(Buffer.from(value.slice(2), 'hex')),
    LOCAL_EVM_PROFILE: { maxGas: 30000000 }, compactClaimEvmRequest: copy, compactClaimEvmPreparation: copy,
    keeper: { status: () => ({ closed: false, uncertain: Boolean(c.keeperUncertain), controllerOpen: true }) }, updateEvm,
    createClaimEvmDispatchRequest: async token => token,
    retainFailure: async (_error, work) => work(), resolveEvm: async row => row,
    originalClaimEvmRecord: () => c.runtimeOriginal, assertSignedEvmTransaction: value => assert.equal(value, 'SYNTHETIC_NO_KEY_OR_TRANSACTION'),
    serial: async work => work(), bytes32: value => { assert.match(value, /^[0-9a-f]{64}$/); },
    view: async () => view, route: async () => { c.route = { endpoint: 'de'.repeat(32), quotedFee: '5' }; return c.route; },
    destination: () => 'ef'.repeat(32), claimTicketId: () => id, terms: (_state, value) => value,
    claimRouteCommitment: value => hash(codec(value)), claimTicketSecret: () => '01'.repeat(32),
    receiptKeyCommitment: () => '02'.repeat(32), ZERO: '00'.repeat(32), prefix: value => '0x' + value,
    assertAuthorizationSnapshot: async (value, expected) => { assert.deepEqual(value.head, expected); await observer.assertCurrent(value); },
    ticket: async id => copy(journalData.tickets.find(row => row.id === id)), syncRow: async row => row,
  };
  const api = compile(keyConsumerSource + controllerHelpers + authorizeSource + controllerLeaseSource + evmSource + '; return { ' + redeemSource + ' };', env);
  c.run = () => api.requestRedemption({ claimDomain: domain, caller, amount: '1800000', maxFee: '5000', requestId: '03'.repeat(32) });
  c.data = journalData; return c;
}

test('redemption aggregate: loaded synthetic histories cross original issue and final preparation guards without a signing port', async () => {
  const c = fixture(); c.actorHook = ({ validation }) => { c.time = validation ? (c.dispatches ? 91_000 : 22_000) : 21_000; };
  c.prepareHook = () => { c.time = 90_000; };
  const result = await c.run(); assert.equal(result.ticket.amount, '1800000');
  assert.equal(c.guardPassed, 1); assert.equal(c.dispatches, 1); assert.equal(c.data.tickets.length, 1);
  assert.equal(c.calls.length, 9); assert.deepEqual(c.validations.sort(), [0, 0, 1, 1, 2, 2]);
  for (const signerIndex of [0, 1, 2]) assert.equal(c.reads.filter(row => row.signerIndex === signerIndex).length, 204);
  assert.ok(c.reads.some(row => row.expired && !row.admitted));
  const audit = c.data.evm[0].finalAudit;
  assert.equal(audit.profile, 'CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V4');
  assert.equal(audit.originalAuthorizationAgeMilliseconds, 91_000); assert.equal(audit.auditElapsedMilliseconds, 1000);
  assert.equal(audit.limitMilliseconds, 30_000); assert.equal(c.fixtureOnlyNoKey, true);
  const originalBytes = codec(c.original).toString('hex');
  await c.run(); assert.equal(c.dispatches, 1); assert.equal(c.calls.length, 9); assert.equal(codec(c.original).toString('hex'), originalBytes);
});

test('redemption aggregate: failure before initial quorum return creates no ticket or dispatch', async () => {
  for (const fault of ['deadline', 'old-unadmitted', 'old-graph', 'actor-head']) {
    const c = fixture();
    if (fault === 'deadline') c.actorHook = () => { c.time = 30_000; };
    if (fault === 'old-unadmitted') c.histories[1].find(row => row.expired && !row.admitted).adverse = true;
    if (fault === 'old-graph') c.histories[2].find(row => row.expired && row.branch === 'graph').adverse = true;
    if (fault === 'actor-head') c.actorHook = () => { c.head.hash = 'ff'.repeat(32); };
    await assert.rejects(c.run(), fault === 'deadline' ? /CLAIM_QUORUM_AUDIT_TOO_OLD/
      : fault.startsWith('old-') ? /TEST_RETAINED_ADVERSE_HISTORY/ : /CLAIM_QUORUM_HEAD_CHANGED/);
    assert.equal(c.data.tickets.length, 0); assert.equal(c.data.evm.length, 0); assert.equal(c.dispatches, 0);
    assert.equal(c.calls.length, 3); assert.equal(c.reads.length, 204);
  }
});

test('redemption predispatch: original certificate expiry or exclusive next-block expiry prevents final validation and guard admission', async () => {
  for (const until of ['1000', '1001']) {
    const c = fixture(); c.until = until;
    await assert.rejects(c.run(), /CLAIM_ORIGINAL_AUTHORIZATION_EXPIRED/);
    assert.equal(c.validations.length, 3); assert.equal(c.guardPassed, 0);
  }
});

test('redemption predispatch: changed initial prepared head, original head, prepared bytes and call bytes fail closed', async () => {
  for (const fault of ['prepared-head', 'original-head', 'prepared-bytes', 'call-bytes', 'retained-signature']) {
    const c = fixture();
    if (fault === 'prepared-head') c.prepareHook = prepared => { prepared.head.hash = '0x' + 'ff'.repeat(32); };
    if (fault === 'original-head') c.finalAuditHook = () => { c.head.hash = 'ff'.repeat(32); };
    if (fault === 'prepared-bytes') c.finalAuditHook = () => { c.prepared.transaction.data += 'ff'; };
    if (fault === 'call-bytes') c.finalAuditHook = () => { c.route.quotedFee = '6'; };
    if (fault === 'retained-signature') c.finalAuditHook = () => { c.operatorJournals[1].data.authorizations[0].signature = 'changed'; };
    await assert.rejects(c.run(), fault === 'prepared-head' ? /CLAIM_EVM_PREPARED_HEAD_CHANGED/ : fault === 'original-head'
      ? /CLAIM_ORIGINAL_QUORUM_AUTHORIZATION_HEAD/ : fault === 'prepared-bytes' ? /CLAIM_EVM_PREPARATION_CHANGED/
        : fault === 'call-bytes' ? /CLAIM_EVM_CALL_ARGUMENTS_CHANGED/ : /CLAIM_ORIGINAL_AUTHORIZATION_RECORD_CHANGED/);
    assert.equal(c.guardPassed, 0); assert.equal(c.data.evm[0].status, 'REJECTED_NO_KEY');
  }
});

test('redemption predispatch: single-use final guard rejects sequential and concurrent replay', async () => {
  for (const replay of ['serial', 'concurrent', 'key-token']) {
    const c = fixture(); c.replay = replay;
    await assert.rejects(c.run(), replay === 'key-token' ? /CLAIM_ORIGINAL_KEY_AUTHORITY_V4_REQUIRED/ : /CLAIM_EVM_FINAL_GUARD_ALREADY_USED/);
    assert.equal(c.guardPassed, 0); assert.equal(c.dispatches, 1);
  }
});

test('redemption V4: persisted preparation can precede a fresh complete round without renewing original signatures or head', async () => {
  for (const stage of ['journal', 'current']) {
    const c = fixture(); let armed = false;
    c.journalHook = async next => { if (next.evm.at(-1)?.status === 'SIGNING_UNKNOWN') { armed = true; if (stage === 'journal') c.time = 90_000; } };
    c.currentHook = async () => { if (armed && stage === 'current') c.time = 90_000; };
    await c.run(); assert.equal(c.guardPassed, 1); assert.equal(c.calls.length, 9);
    assert.equal(c.data.evm[0].finalAudit.originalAuthorizationAgeMilliseconds, 90_000);
    assert.equal(c.data.evm[0].finalAudit.auditElapsedMilliseconds, 0);
    assert.equal(c.auditStarted, 90_000);
  }
});

test('redemption V4: final journal and current awaits preserve liveness, keeper and original head before fresh validation', async () => {
  for (const stage of ['journal', 'current']) for (const fault of ['poison', 'keeper', 'head']) {
    const c = fixture(); let armed = false;
    const fail = () => { if (fault === 'poison') c.dead.add(0); if (fault === 'keeper') c.keeperUncertain = true; if (fault === 'head') c.head.hash = 'ff'.repeat(32); };
    c.journalHook = async next => { if (next.evm.at(-1)?.status === 'SIGNING_UNKNOWN') { armed = true; if (stage === 'journal') fail(); } };
    c.currentHook = async () => { if (armed && stage === 'current') fail(); };
    await assert.rejects(c.run(), fault === 'poison' ? /CLOSED_OR_POISONED/ : fault === 'keeper' ? /CLAIM_EVM_KEEPER_UNAVAILABLE/ : /TEST_CURRENT_HEAD_CHANGED/);
    assert.equal(c.guardPassed, 0); assert.equal(c.data.evm[0].status, 'REJECTED_NO_KEY');
  }
});

test('redemption V4: completed fresh round cannot reset its clock or source fence before consuming the private key token', async () => {
  for (const fault of ['deadline', 'negative-clock', 'poison', 'keeper', 'source', 'prepared']) {
    const c = fixture();
    c.beforeConsumeHook = () => {
      if (fault === 'deadline') c.time = 30_000; if (fault === 'negative-clock') c.time = -1;
      if (fault === 'poison') c.dead.add(0); if (fault === 'keeper') c.keeperUncertain = true;
      if (fault === 'source') c.sourceGeneration++; if (fault === 'prepared') c.prepared.transaction.data += 'ff';
    };
    await assert.rejects(c.run(), fault === 'deadline' || fault === 'negative-clock' ? /CLAIM_QUORUM_AUDIT_TOO_OLD/
      : fault === 'poison' ? /CLOSED_OR_POISONED/ : fault === 'keeper' ? /CLAIM_EVM_KEEPER_UNAVAILABLE/
        : fault === 'source' ? /TEST_SOURCE_GENERATION_CHANGED/ : /CLAIM_EVM_PREPARATION_CHANGED/);
    assert.equal(c.guardPassed, 0); assert.equal(c.data.evm[0].status, 'REJECTED_NO_KEY');
  }
});
