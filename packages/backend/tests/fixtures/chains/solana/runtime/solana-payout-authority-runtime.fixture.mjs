/** Source-only scheduling tests of the actual transfer/retained-send/resume
 * closures. All process, RPC, persistence, signing and codec ports are inert
 * controlled mocks. No runtime factory, native node, network, key or proof runs.
 * These tests establish host ordering, not native execution or authority. */
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
const fallbackPrepared = frozenInput({ genesis: 'genesis', unsignedWire: '010203',
  intent: { sourcePublicKey: '11', recipientPublicKey: '22', nonceAccountPublicKey: '33',
    durableNonce: '44', lamports: '10', wireKeyCommitment: '55' },
  funds: { feeLamports: '1' } });

export function createRuntimeFixture(routeName = 'redeem', options = {}) {
  const prepared = options.prepared ?? fallbackPrepared;
  const originalWire = options.nativeWire ?? Buffer.concat([Buffer.from([1]), signature, Buffer.from(prepared.unsignedWire, 'hex')]).toString('base64');
  const nativeId = options.nativeId ?? Buffer.from(originalWire, 'base64').subarray(1, 65).toString('hex');
  const nativeSignature = Buffer.from(originalWire, 'base64').subarray(1, 65);
  const transactionSHA256 = options.transactionSHA256 ?? 'retained-sha256';
  const close = options.close ?? (() => {}), nonceObservations = new WeakMap();
  const events = [], persisted = [], records = new Map(), graphRecords = new Map();
  const signedPreparations = new Map(), preparationContexts = new WeakMap([[prepared, { slot: '100' }]]);
  const clock = options.clock ?? { now: 100 }, selectedRoute = { name: routeName, sourceRole: routeName === 'deposit' ? 'depositor' : 'escrow', recipientIndex: options.recipientIndex ?? (routeName === 'refund' ? 0 : 1) };
  const testKeyToken=Object.freeze({});let testKeyStarted, testKeyUsed=false;
  let nativeReadGeneration=0;
  let api, signCalls = 0, sendCalls = 0, callbackCalls = 0, latchSeen = false;
  const samePrepared = value => assert.equal(value, prepared, 'ORIGINAL_PREPARATION_REFERENCE');
  const env = {
    requireCondition, exactRecord, cloneInput, frozenInput, Buffer, combined: false, custody: true,
    records, graphRecords, signedPreparations, preparationContexts, roles: {}, genesis: options.genesis ?? 'genesis',
    recipientAddresses: ['deposit', 'payout'], PKCS8_ED25519: Buffer.alloc(0),
    performance: { now: () => clock.now }, close, nonceObservations, same: (a,b,code) => assert.deepEqual(a,b,code),
    originalKeyControllerV4: options.originalKeyControllerV4 ?? { consumeNativeClaimOriginalKeyAuthorityV4(token,purpose,runtimeClose,genesis,route,original) {
      assert.equal(token,testKeyToken,'TEST_V4_PRIVATE_KEY_TOKEN');assert.equal(purpose,'payout');assert.equal(runtimeClose,close);assert.equal(genesis,options.genesis??'genesis');assert.equal(route,routeName);samePrepared(original);
      assert.equal(testKeyUsed,false);testKeyUsed=true;assert.ok(clock.now-testKeyStarted>=0&&clock.now-testKeyStarted<30000,'TEST_V4_KEY_TOO_OLD');return testKeyStarted;
    } },
    async assertPrepared(value) { samePrepared(value); const started=clock.now; await options.nativeKeyRead?.({api,clock,events}); api.retainNonceObservation(value,selectedRoute,started); },
    readPayoutAuditState:()=>frozenInput({transfers:cloneInput([...records.values()]),custodyTransfers:cloneInput([...records.values()]),graphTransfers:cloneInput([...graphRecords.values()]),readGeneration:String(nativeReadGeneration),...api.auditState()}),
    payoutController: options.payoutController ?? { openNativeClaimSolanaPayoutAuthority() { throw Error('CLAIM_SOLANA_PRIVATE_PAYOUT_AUTHORITY_REQUIRED'); } }, endpoint: 'INERT_SEND_PORT',
    usesNonce: route => ['deposit', 'refund', 'redeem'].includes(route?.name),
    lamportsValue: BigInt, bytes32: value => value,
    allRecords: () => [...records.values()], routeRecords: () => records,
    sourceKey: () => ({ seed: Buffer.alloc(0) }),
    createPrivateKey: () => { options.keyCodec?.({api,clock,events}); return { inertSigningPort: true }; },
    sign() { signCalls++; events.push('sign-mock'); return nativeSignature; },
    encodeSolanaNonceBindingMessage(intent) { assert.deepEqual(intent, prepared.intent); return prepared.unsignedWire; },
    validateSolanaNonceBindingTransaction(wire, intent) {
      options.decodeHook?.({ api, clock, events, latched: latchSeen });
      assert.equal(wire, originalWire); assert.deepEqual(intent, prepared.intent);
      return { signatureHex: nativeId, transactionSHA256 };
    },
    validateSolanaBindingTransaction: () => assert.fail('NONCE_ROUTE_REQUIRED'),
    assertOwnedCustodyIntent(route, _roles, family, intent) {
      assert.equal(route, routeName); assert.equal(family, '2'); assert.deepEqual(intent, prepared.intent);
    },
    async prepareAtCurrentHead(route) {
      nativeReadGeneration++;assert.equal(route, selectedRoute); events.push('prepare'); api.retainNonceObservation(prepared, route, clock.now); return prepared;
    },
    async healthy() { events.push('healthy'); },
    assertRetainedNonceRoute(record) { assert.equal(record.route, routeName); },
    async assertOriginalIngressUnobserved(record) {
      assert.equal(record.route, 'deposit'); events.push('ingress-history');
    },
    async prepareNonceAtCurrentHead(route, amount, key, value) {
      assert.equal(route, selectedRoute); assert.equal(amount, prepared.intent.lamports); assert.equal(key, prepared.intent.wireKeyCommitment);
      nativeReadGeneration++;samePrepared(value); events.push('revalidate-native');
      const started = clock.now; await options.nativeRead?.({ api, clock, events });
      api.retainNonceObservation(value, route, started);
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
      base58Encode,sendOwnedSolanaTransaction,recordFor,close,nonceObservations,same,payoutController,originalKeyControllerV4,assertPrepared,readPayoutAuditState} = env;
    let readGeneration=0n,mutationGeneration=0n;
    let busy=false,observationBusy=false,inventoryBusy=false,closed=false,shuttingDown=false,recoveryCapturing=false,
      isolationFailure=null,nativePersistenceFailure=null,signingUnresolved=false,
      activePrepared=null,activeRoute=null,preSignReadWindow=false,preBroadcastReadWindow=false;
    ${stateCheckSource}
    ${excerpt(source, '    function retainNonceObservation(', '    async function assertPrepared(')}
    ${transferSource}
    return {auditState:()=>({signingUnresolved,closed,shuttingDown,isolationFailed:Boolean(isolationFailure),persistenceFailed:Boolean(nativePersistenceFailure)}),transfer,resumeReservedPayout,resumeReservedIngress,retainNonceObservation,assertPayoutNativeObservation,
      state:()=>({busy,activePrepared,activeRoute,preSignReadWindow,preBroadcastReadWindow}),
      setState(patch) {
        if ('closed' in patch) closed=patch.closed;
        if ('shuttingDown' in patch) shuttingDown=patch.shuttingDown;
        if ('recoveryCapturing' in patch) recoveryCapturing=patch.recoveryCapturing;
        if ('isolationFailure' in patch) isolationFailure=patch.isolationFailure;
        if ('nativePersistenceFailure' in patch) nativePersistenceFailure=patch.nativePersistenceFailure;
      }
    };
  })`)(env);
  const callbacks = () => ({
    async beforeSign(value) { samePrepared(value); events.push('before-sign');if(['refund','redeem'].includes(routeName)){testKeyStarted=clock.now;return testKeyToken;} },
    async onSigned(value) { assert.deepEqual(value, { nativeWire: originalWire }); events.push('on-signed'); },
    async beforeBroadcast(value) { samePrepared(value); callbackCalls++; events.push('before-broadcast'); },
    ...(routeName === 'deposit' ? {
      async beforeSend(value) { samePrepared(value); callbackCalls++; events.push('before-send'); },
      assertBeforeSend(value) { samePrepared(value); callbackCalls++; events.push('assert-before-send'); },
    } : {}),
  });
  function reserve() {
    const record = { route: routeName, sourceRole: selectedRoute.sourceRole, recipientIndex: selectedRoute.recipientIndex, genesis: options.genesis ?? 'genesis', preparedFee: prepared.funds.feeLamports,
      nativeId, nativeWire: originalWire, transactionSHA256, intent: cloneInput(prepared.intent),
      phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0, failureObservation: null, observation: null };
    records.set(nativeId, record); signedPreparations.set(nativeId, prepared); return record;
  }
  function start(mode, given = callbacks()) {
    if (mode === 'transfer') return api.transfer(selectedRoute, prepared.intent.lamports, prepared.intent.wireKeyCommitment, given);
    const { beforeBroadcast, beforeSend, assertBeforeSend } = given;
    return routeName === 'deposit' ? api.resumeReservedIngress(selectedRoute, { nativeId }, { beforeBroadcast, beforeSend, assertBeforeSend })
      : api.resumeReservedPayout(selectedRoute, { nativeId }, { beforeBroadcast });
  }
  return { api, selectedRoute, events, persisted, records, clock, reserve, callbacks, start, close, prepared, originalWire, nativeId, transactionSHA256,
    revalidate: () => env.prepareNonceAtCurrentHead(selectedRoute, prepared.intent.lamports, prepared.intent.wireKeyCommitment, prepared),
    counters: () => ({ signCalls, sendCalls, callbackCalls }), record: () => records.get(nativeId) };
}
export function assertReleased(f) {
  assert.deepEqual(f.api.state(), { busy: false, activePrepared: null, activeRoute: null,
    preSignReadWindow: false, preBroadcastReadWindow: false });
}
export async function assertConsumedWithoutSend(f, mode, work, reason) {
  await assert.rejects(work, error => {
    assert.equal(error.message, 'SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE');
    assert.equal(error.nativeId, f.nativeId); assert.match(error.cause.message, reason); return true;
  });
  assert.equal(f.record().phase, 'BROADCAST_UNKNOWN'); assert.equal(f.record().broadcastAttempts, 1);
  assert.equal(f.counters().sendCalls, 0); assert.equal(f.record().nativeWire, f.originalWire);
  assertReleased(f);
  // Both public entry paths reject a consumed attempt; no reset, re-sign or send.
  const before = f.counters();
  await assert.rejects(f.start('resume'), /FIRST_SEND_ONLY|BUSY_OR_CLOSED/);
  await assert.rejects(f.start('transfer'), /PRIOR_TRANSFER_UNRESOLVED|BUSY_OR_CLOSED/);
  assert.deepEqual(f.counters(), before); assertReleased(f);
}
