/** Source-only scheduling tests of the actual transfer/retained-send/resume
 * closures. All process, RPC, persistence, signing and codec ports are inert
 * controlled mocks. No runtime factory, native node, network, key or proof runs.
 * These tests establish host ordering, not native execution or authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { types } from 'node:util';
import vm from 'node:vm';

const source = readFileSync(new URL('./owned-solana-runtime.mjs', import.meta.url), 'utf8');
function excerpt(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'SOURCE_CLOSURE_BOUNDARIES');
  return text.slice(a, b);
}
const exactSource = readFileSync(new URL('../paeg/commitments.mjs', import.meta.url), 'utf8');
const inputSource = readFileSync(new URL('../paeg/readiness-inputs.mjs', import.meta.url), 'utf8');
// Execute the real strict-data helpers without importing application backends.
const { exactRecord, cloneInput, frozenInput } = vm.runInThisContext(`(function(assert,types){
  ${excerpt(exactSource, 'export function exactRecord(', 'export function bytes32(').replaceAll('export ', '')}
  ${excerpt(inputSource, 'export function frozenInput(', 'export function inputUint(').replaceAll('export ', '')}
  return {exactRecord,cloneInput,frozenInput};
})`)(assert, types);
const transferSource = excerpt(source, '    async function transfer(', '    async function readIngressFirstSendObservation(');
const stateCheckSource = excerpt(source, 'export function assertSolanaNonceFirstSendState(', '/** Fresh finalized').replace('export ', '');
const requireCondition = (condition, code) => { if (!condition) throw Error(code); };
const signature = Buffer.alloc(64, 7), nativeId = signature.toString('hex');
const prepared = frozenInput({ genesis: 'genesis', unsignedWire: '010203',
  intent: { sourcePublicKey: '11', recipientPublicKey: '22', nonceAccountPublicKey: '33',
    durableNonce: '44', lamports: '10', wireKeyCommitment: '55' },
  funds: { feeLamports: '1' } });
const originalWire = Buffer.concat([Buffer.from([1]), signature, Buffer.from(prepared.unsignedWire, 'hex')]).toString('base64');

function fixture(routeName = 'redeem', options = {}) {
  const events = [], persisted = [], records = new Map(), graphRecords = new Map();
  const signedPreparations = new Map(), preparationContexts = new WeakMap([[prepared, { slot: '100' }]]);
  const clock = { now: 100 }, selectedRoute = { name: routeName, sourceRole: 'escrow', recipientIndex: 1 };
  let api, signCalls = 0, sendCalls = 0, callbackCalls = 0, latchSeen = false;
  const samePrepared = value => assert.equal(value, prepared, 'ORIGINAL_PREPARATION_REFERENCE');
  const env = {
    requireCondition, exactRecord, cloneInput, frozenInput, Buffer, combined: false, custody: true,
    records, graphRecords, signedPreparations, preparationContexts, roles: {}, genesis: 'genesis',
    recipientAddresses: ['deposit', 'payout'], PKCS8_ED25519: Buffer.alloc(0),
    performance: { now: () => clock.now }, endpoint: 'INERT_SEND_PORT',
    usesNonce: route => ['deposit', 'refund', 'redeem'].includes(route?.name),
    lamportsValue: BigInt, bytes32: value => value,
    allRecords: () => [...records.values()], routeRecords: () => records,
    sourceKey: () => ({ seed: Buffer.alloc(0) }),
    createPrivateKey: () => ({ inertSigningPort: true }),
    sign() { signCalls++; events.push('sign-mock'); return signature; },
    encodeSolanaNonceBindingMessage(intent) { assert.deepEqual(intent, prepared.intent); return prepared.unsignedWire; },
    validateSolanaNonceBindingTransaction(wire, intent) {
      assert.equal(wire, originalWire); assert.deepEqual(intent, prepared.intent);
      return { signatureHex: nativeId, transactionSHA256: 'retained-sha256' };
    },
    validateSolanaBindingTransaction: () => assert.fail('NONCE_ROUTE_REQUIRED'),
    assertOwnedCustodyIntent(route, _roles, family, intent) {
      assert.equal(route, routeName); assert.equal(family, '2'); assert.deepEqual(intent, prepared.intent);
    },
    async prepareAtCurrentHead(route) {
      assert.equal(route, selectedRoute); events.push('prepare'); return prepared;
    },
    async healthy() { events.push('healthy'); },
    assertRetainedNonceRoute(record) { assert.equal(record.route, routeName); },
    async assertOriginalIngressUnobserved(record) {
      assert.equal(record.route, 'deposit'); events.push('ingress-history');
    },
    async prepareNonceAtCurrentHead(route, amount, key, value) {
      assert.equal(route, selectedRoute); assert.equal(amount, '10'); assert.equal(key, '55');
      samePrepared(value); events.push('revalidate-native');
    },
    reservationReads: { async run(work, settled) { const value = await work(); settled(); return value; } },
    handle: { assertAlive() { events.push('alive'); if (options.deadProcess && latchSeen) throw Error('SOLANA_PROCESS_DEAD'); } },
    async persistNative(record) {
      events.push('persist:' + record.phase); persisted.push(structuredClone(record));
      await Promise.resolve();
      if (record.phase === 'BROADCAST_UNKNOWN' && !latchSeen) {
        latchSeen = true;
        if (options.afterLatch) await options.afterLatch({ api, record, clock, events });
      }
      if (options.failFailureJournal && record.broadcastFailure) {
        api.setState({ nativePersistenceFailure: Error('SOLANA_NATIVE_JOURNAL_UNCERTAIN') });
        throw Error('SOLANA_NATIVE_JOURNAL_UNCERTAIN');
      }
    },
    base58Encode: bytes => 'signature:' + bytes.toString('hex'),
    async sendOwnedSolanaTransaction(endpoint, wire) {
      assert.equal(endpoint, 'INERT_SEND_PORT'); assert.equal(wire, originalWire);
      assert.equal(latchSeen, true); assert.equal(persisted.at(-1).phase, 'BROADCAST_UNKNOWN');
      assert.equal(persisted.at(-1).broadcastAttempts, 1);
      sendCalls++; events.push('send');
      if (options.sendFailure) throw options.sendFailure;
      return 'signature:' + nativeId;
    },
    recordFor(id) { requireCondition(records.has(id), 'SOLANA_UNKNOWN_SIGNED_IDENTITY'); return records.get(id); },
  };
  api = vm.runInThisContext(`(function(env) {
    const {requireCondition,exactRecord,cloneInput,frozenInput,Buffer,combined,custody,records,graphRecords,
      signedPreparations,preparationContexts,roles,genesis,recipientAddresses,PKCS8_ED25519,performance,endpoint,
      usesNonce,lamportsValue,bytes32,allRecords,routeRecords,sourceKey,createPrivateKey,sign,
      encodeSolanaNonceBindingMessage,validateSolanaNonceBindingTransaction,validateSolanaBindingTransaction,
      assertOwnedCustodyIntent,prepareAtCurrentHead,healthy,assertRetainedNonceRoute,
      assertOriginalIngressUnobserved,prepareNonceAtCurrentHead,reservationReads,handle,persistNative,
      base58Encode,sendOwnedSolanaTransaction,recordFor} = env;
    let readGeneration=0n,mutationGeneration=0n;
    let busy=false,observationBusy=false,inventoryBusy=false,closed=false,shuttingDown=false,
      isolationFailure=null,nativePersistenceFailure=null,signingUnresolved=false,
      activePrepared=null,activeRoute=null,preSignReadWindow=false,preBroadcastReadWindow=false;
    ${stateCheckSource}
    ${transferSource}
    return {transfer,resumeReservedPayout,resumeReservedIngress,
      state:()=>({busy,activePrepared,activeRoute,preSignReadWindow,preBroadcastReadWindow}),
      setState(patch) {
        if ('closed' in patch) closed=patch.closed;
        if ('shuttingDown' in patch) shuttingDown=patch.shuttingDown;
        if ('isolationFailure' in patch) isolationFailure=patch.isolationFailure;
        if ('nativePersistenceFailure' in patch) nativePersistenceFailure=patch.nativePersistenceFailure;
      }
    };
  })`)(env);
  const callbacks = () => ({
    async beforeSign(value) { samePrepared(value); events.push('before-sign'); },
    async onSigned(value) { assert.deepEqual(value, { nativeWire: originalWire }); events.push('on-signed'); },
    async beforeBroadcast(value) { samePrepared(value); callbackCalls++; events.push('before-broadcast'); },
    async beforeSend(value) { samePrepared(value); callbackCalls++; events.push('before-send'); },
    assertBeforeSend(value) { samePrepared(value); callbackCalls++; events.push('assert-before-send'); },
  });
  function reserve() {
    const record = { route: routeName, sourceRole: 'escrow', recipientIndex: 1, genesis: 'genesis',
      nativeId, nativeWire: originalWire, transactionSHA256: 'retained-sha256', intent: cloneInput(prepared.intent),
      phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0, failureObservation: null, observation: null };
    records.set(nativeId, record); signedPreparations.set(nativeId, prepared); return record;
  }
  function start(mode, given = callbacks()) {
    if (mode === 'transfer') return api.transfer(selectedRoute, '10', '55', given);
    const { beforeBroadcast, beforeSend, assertBeforeSend } = given;
    return api.resumeReservedPayout(selectedRoute, { nativeId }, { beforeBroadcast, beforeSend, assertBeforeSend });
  }
  return { api, selectedRoute, events, persisted, records, clock, reserve, callbacks, start,
    counters: () => ({ signCalls, sendCalls, callbackCalls }), record: () => records.get(nativeId) };
}
function assertReleased(f) {
  assert.deepEqual(f.api.state(), { busy: false, activePrepared: null, activeRoute: null,
    preSignReadWindow: false, preBroadcastReadWindow: false });
}
async function assertConsumedWithoutSend(f, mode, work, reason) {
  await assert.rejects(work, error => {
    assert.equal(error.message, 'SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE');
    assert.equal(error.nativeId, nativeId); assert.match(error.cause.message, reason); return true;
  });
  assert.equal(f.record().phase, 'BROADCAST_UNKNOWN'); assert.equal(f.record().broadcastAttempts, 1);
  assert.equal(f.counters().sendCalls, 0); assert.equal(f.record().nativeWire, originalWire);
  assertReleased(f);
  // Both public entry paths reject a consumed attempt; no reset, re-sign or send.
  const before = f.counters();
  await assert.rejects(f.start('resume'), /FIRST_SEND_ONLY|BUSY_OR_CLOSED/);
  await assert.rejects(f.start('transfer'), /PRIOR_TRANSFER_UNRESOLVED|BUSY_OR_CLOSED/);
  assert.deepEqual(f.counters(), before); assertReleased(f);
}

// The old permissive payout callback suites are retained byte-for-byte in
// this package's exact baseline. V2 deliberately changes their contract and
// exercises the replacement in solana-payout-authority-runtime.test.mjs and
// the actual-controller composition suite. Deposit and disabled legacy harness
// checks below remain regression coverage, never a V2 payout authority source.

test('deposit still uses the existing final-send contract and ingress-only history checks', async () => {
  const f = fixture('deposit'); await f.start('transfer');
  assert.equal(f.events.filter(event => event === 'ingress-history').length, 2);
  assert.equal(f.counters().sendCalls, 1);
  const missing = fixture('deposit'), callbacks = missing.callbacks(); callbacks.beforeSend = null;
  await assert.rejects(missing.start('transfer', callbacks), /SOLANA_REQUIRED_INGRESS_FINAL_SEND_CALLBACKS/);
  assert.equal(missing.counters().signCalls, 0);
});

test('payout hook semantics have a public custody-only version and no async gap after sync gate', () => {
  assert.match(source, /export const SOLANA_PAYOUT_FINAL_SEND_PROFILE = 'OWNED_SOLANA_PAYOUT_AUTHORITY_LIFETIME_V2';/);
  assert.match(source, /custody \? \{ roles,[\s\S]*?payoutFinalSendProfile: SOLANA_PAYOUT_FINAL_SEND_PROFILE \} : \{/);
  const tail = excerpt(source, '          requireCondition(assertBeforeSend(activePrepared)', '        const returned = await sendOwnedSolanaTransaction');
  const executable = tail.replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(executable, /\bawait\b|\bprepare\w*\(|\bpersistNative\(|\bbeforeBroadcast\(/);
  assert.match(executable, /handle\.assertAlive\(\)/);
  assert.match(executable, /performance\.now\(\) - broadcastGuardStarted < 30_000/);
});

const integration = new URL('../../../integration/', import.meta.url);
const acceptanceSource = readFileSync(new URL('solana-candidate-acceptance.mjs', integration), 'utf8');
const acceptanceChecksSource = excerpt(acceptanceSource, 'function createRuntimeOnlyFinalSendChecks(',
  'export async function runSolanaCandidateAcceptance(');
function nativeOnlyChecks(route = 'redeem') {
  const state = { now: 100, guard: true, process: true, socketFailure: null, checks: 0, pids: 0 };
  const originalPrepared = structuredClone(prepared), preparedCopy = structuredClone(prepared);
  const record = { nativeId, nativeWire: originalWire, transactionSHA256: 'retained-sha256', route,
    genesis: 'native-genesis', intent: structuredClone(prepared.intent), phase: 'BROADCAST_UNKNOWN', broadcastAttempts: 1 };
  const runtime = { payoutFinalSendProfile: 'OWNED_SOLANA_PAYOUT_POST_FSYNC_V1', genesis: 'native-genesis',
    transfers: [record], get metadata() { return { processId: 123, periodicSocketAudit: { failure: state.socketFailure } }; } };
  const checks = vm.runInThisContext(`(function(env){
    const {assert,Buffer,performance,validateSolanaNonceBindingTransaction,SOLANA_PAYOUT_FINAL_SEND_PROFILE}=env;
    ${acceptanceChecksSource} return createRuntimeOnlyFinalSendChecks;
  })`)({ assert, Buffer, performance: { now: () => state.now },
    SOLANA_PAYOUT_FINAL_SEND_PROFILE: 'OWNED_SOLANA_PAYOUT_POST_FSYNC_V1',
    validateSolanaNonceBindingTransaction(wire, intent) {
      assert.equal(wire, originalWire); assert.deepEqual(intent, prepared.intent);
      return { signatureHex: nativeId, transactionSHA256: 'retained-sha256' };
    },
  })({ runtime, route, prepared: originalPrepared, preparedCopy,
    signed: { nativeId, nativeWire: originalWire, transactionSHA256: 'retained-sha256' }, started: 100,
    guard: { check() { state.checks++; assert.ok(state.guard, 'HOST_RESOURCE_NOT_LIVE'); },
      verifyRuntimePID(pid) { state.pids++; assert.equal(pid, 123); assert.ok(state.process, 'OWNED_PROCESS_NOT_LIVE'); } },
  });
  return { checks, state, originalPrepared, preparedCopy, record, runtime };
}
for (const route of ['deposit', 'redeem']) {
  test(`disabled native-only ${route} callback guard retains the original and consumes once without claim authority`, async () => {
    const f = nativeOnlyChecks(route);
    assert.throws(() => f.checks.assertBeforeSend(f.originalPrepared), /FINAL_SEND_ONCE/);
    assert.equal(await f.checks.beforeSend(f.originalPrepared), undefined);
    assert.equal(f.checks.assertBeforeSend(f.originalPrepared), undefined);
    assert.equal(f.state.checks, 2); assert.equal(f.state.pids, 2);
    assert.throws(() => f.checks.assertBeforeSend(f.originalPrepared), /FINAL_SEND_ONCE/);
    await assert.rejects(f.checks.beforeSend(f.originalPrepared), /FINAL_SEND_ONCE/);
  });
  for (const stage of ['async', 'sync']) for (const fault of ['prepared-reference', 'prepared-bytes', 'wire', 'hash', 'route',
    'intent', 'genesis', 'attempt', 'phase', 'missing', 'duplicate', 'resource', 'process', 'socket', 'expiry']) {
    test(`disabled native-only ${route} ${stage} gate rejects late ${fault}`, async () => {
      const f = nativeOnlyChecks(route); let value = f.originalPrepared;
      if (stage === 'sync') await f.checks.beforeSend(value);
      if (fault === 'prepared-reference') value = structuredClone(value);
      if (fault === 'prepared-bytes') f.originalPrepared.unsignedWire = 'ff';
      if (fault === 'wire') f.record.nativeWire = 'changed-wire';
      if (fault === 'hash') f.record.transactionSHA256 = 'changed-hash';
      if (fault === 'route') f.record.route = 'wrong-route';
      if (fault === 'intent') f.record.intent.lamports = '99';
      if (fault === 'genesis') f.record.genesis = 'wrong-genesis';
      if (fault === 'attempt') f.record.broadcastAttempts = 0;
      if (fault === 'phase') f.record.phase = 'SIGNED_NOT_BROADCAST';
      if (fault === 'missing') f.runtime.transfers = [];
      if (fault === 'duplicate') f.runtime.transfers.push(structuredClone(f.record));
      if (fault === 'resource') f.state.guard = false;
      if (fault === 'process') f.state.process = false;
      if (fault === 'socket') f.state.socketFailure = 'lost-isolation';
      if (fault === 'expiry') f.state.now += 30_000;
      const reason = /SOLANA_CANDIDATE_|HOST_RESOURCE_NOT_LIVE|OWNED_PROCESS_NOT_LIVE/;
      if (stage === 'async') {
        await assert.rejects(f.checks.beforeSend(value), reason);
        await assert.rejects(f.checks.beforeSend(value), /FINAL_SEND_ONCE/);
      } else {
        assert.throws(() => f.checks.assertBeforeSend(value), reason);
        assert.throws(() => f.checks.assertBeforeSend(value), /FINAL_SEND_ONCE/);
      }
    });
  }
}

test('actual preflight route loop supplies strict nonce callbacks and stops at its exact before-key sentinel', async () => {
  const preflight = readFileSync(new URL('native-ingress-v3-preflight.mjs', integration), 'utf8');
  const loop = excerpt(preflight, '  const preparedRoutes = [], preparedByRoute = {};', '  // This negative check reaches');
  const routes = ['deposit', 'refund', 'redeem'], calls = [], sentinels = [];
  const roleNames = { deposit: ['depositor', 'escrow'], refund: ['escrow', 'depositor'], redeem: ['escrow', 'recipient'] };
  const roles = Object.fromEntries(['depositor', 'escrow', 'recipient'].map(role => [role, { endpoint: role + '-endpoint' }]));
  const runtime = { ingressSendState: { busy: false, uncertain: false } };
  const solana = { roles, nonceInfrastructureByAuthority: {}, adapter({ route }) {
    const [sourceRole, destinationRole] = roleNames[route];
    const value = { genesis: 'genesis', unsignedWire: 'unsigned',
      intent: { sourcePublicKey: roles[sourceRole].endpoint, recipientPublicKey: roles[destinationRole].endpoint,
        nonceAccountPublicKey: sourceRole + '-nonce', durableNonce: sourceRole + '-value',
        lamports: '1000000', wireKeyCommitment: route + '-key' },
      funds: { feeLamports: '1', nonceAccount: { authorityPublicKey: roles[sourceRole].endpoint, durableNonce: sourceRole + '-value' } } };
    return { async assertPrepared(input) { assert.equal(input, value); calls.push(route + '-prepare'); },
      async transfer(request, callbacks) {
        exactRecord(callbacks, ['beforeSign', 'onSigned', 'beforeBroadcast', ...(route === 'deposit' ? ['beforeSend', 'assertBeforeSend'] : [])]);
        assert.equal(callbacks.onSigned, callbacks.beforeBroadcast);
        if (route === 'deposit') { assert.equal(callbacks.onSigned, callbacks.beforeSend); assert.equal(callbacks.onSigned, callbacks.assertBeforeSend); }
        assert.equal(request.wireKeyCommitment, route + '-key');
        try { await callbacks.beforeSign(value); assert.fail('MUST_STOP_BEFORE_KEY'); }
        catch (error) { sentinels.push(error); throw error; }
      },
    };
  } };
  const result = await vm.runInThisContext(`(async function(env){
    const {assert,routes,solana,config,ownedCustodyRoute,nonceForRoute,hash,encodeSolanaNonceBindingMessage,
      copy,noEffects,runtime,epoch}=env;
    ${loop} return {preparedRoutes,preparedByRoute};
  })`)({ assert, routes, solana, runtime, epoch: runtime.ingressSendState,
    config: { nativeAsset: 'asset', nativeGenesis: 'genesis', refundMaxFee: '2' },
    ownedCustodyRoute: route => ({ sourceRole: roleNames[route][0], destinationRole: roleNames[route][1] }),
    nonceForRoute: route => ({ nonceAccountPublicKey: roleNames[route][0] + '-nonce', authorityPublicKey: roles[roleNames[route][0]].endpoint }),
    hash: route => route + '-key', encodeSolanaNonceBindingMessage: () => 'unsigned', copy: structuredClone,
    noEffects() { calls.push('no-effects'); },
  });
  assert.deepEqual(calls, routes.flatMap(route => [route + '-prepare', 'no-effects']));
  assert.equal(sentinels.length, 3); assert.ok(sentinels.every(error => error.message === 'V3_PREFLIGHT_STOP_BEFORE_NATIVE_KEY'));
  assert.deepEqual(result.preparedRoutes, routes.map(route => ({ route, unsignedPreparationRevalidated: true, stoppedBeforeNativeKey: true })));
});

test('acceptance callback wiring covers both nonce routes, throws on replay, and leaves source activation disabled', () => {
  assert.match(acceptanceSource, /kind !== 'solver' \? \{ async beforeBroadcast/);
  assert.match(acceptanceSource, /return finalSendChecks\.beforeSend\(prepared\)/);
  assert.match(acceptanceSource, /return finalSendChecks\.assertBeforeSend\(prepared\)/);
  const replay = excerpt(acceptanceSource, '    let repeatGateCalled = false;', '    assert.equal(repeatGateCalled, false);');
  for (const method of ['beforeBroadcast', 'beforeSend', 'assertBeforeSend'])
    assert.match(replay, new RegExp(method + '\\(\\) \\{ repeatGateCalled = true; throw Error'));
  assert.doesNotMatch(acceptanceChecksSource, /\bauthorize\w*\(|\bsign\(|\bsendOwnedSolanaTransaction\(|\bcreateOwned\w*Runtime\(/);
  assert.match(readFileSync(new URL('solana-candidate-acceptance-policy.mjs', integration), 'utf8'),
    /SOLANA_CANDIDATE_ACCEPTANCE_ENABLED = false/);
  assert.match(readFileSync(new URL('native-ingress-v3-preflight-policy.mjs', integration), 'utf8'),
    /PREFLIGHT_REAL_RUN_DISABLED = true/);
});
