/** Durable API host boundary. Real encrypted storage; synthetic controller
 * effects explicitly do not establish native/proof acceptance. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment } from '../../../src/claims/protocol/framing.mjs';
import { createClaimRecordStore, openClaimRecordStore } from '../../../src/claims/storage/segmented-record-store.mjs';
const bindings = new WeakMap(), journals = new WeakMap(), syntheticUnitBindings = new WeakMap();
const url = path => new URL(path, import.meta.url).href;
mock.module(url('../native-claims/controller.mjs'), { exports: {
  ownedNativeClaimControllerBindings(controller) { const value = bindings.get(controller); assert.ok(value, 'TEST_ORIGINAL_CONTROLLER'); return value; },
  async restartNativeClaimController(controller) { return bindings.get(controller).restart(); },
} });
mock.module(url('../native-claims/controller-journal.mjs'), { exports: {
  ownedClaimControllerJournal(keeper) { assert.ok(journals.has(keeper)); return journals.get(keeper); },
} });
// The controller is explicitly synthetic. This dependency substitutes only
// its fixed legacy presentation; production still requires the sealed system.
mock.module(url('../native-claims/native-claim-asset-units-v1.mjs'), { exports: {
  originalNativeClaimAssetUnitsV1(runtime, claims, config) {
    assert.equal(arguments.length, 3); assert.equal(syntheticUnitBindings.get(claims), runtime);
    assert.ok(claims.configs.includes(config)); assert.notEqual(claims.nativeSplCustodyProfile, true);
    assert.ok(['1', '2'].includes(config.nativeFamily));
    return Object.freeze(config.nativeFamily === '1'
      ? { claimSymbol: 'cBTC', nativeSymbol: 'BTC', decimals: 8, atomicUnit: 'satoshi' }
      : { claimSymbol: 'cSOL', nativeSymbol: 'SOL', decimals: 9, atomicUnit: 'lamport' });
  },
} });
const { createNativeClaimSession, nativeClaimApiErrorCode, nativeClaimSessionIdentity, nativeClaimSessionPrivateFailures, createPairedOriginalNativeClaimReaderV1, assertPairedOriginalNativeClaimReaderV1 } = await import('../../../src/api/claims/native-claim-session.mjs');
const { startNativeClaimHttp } = await import('../../../src/api/claims/native-claim-http.mjs');
const hash = value => createHash('sha256').update(value).digest('hex');
function syntheticConfig(family = '2') {
  const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([key, type]) => [key,
    type === 'address' ? hash(key).slice(0, 40) : type === 'u256' ? '31337' : type === 'u64' ? '5000'
      : type === 'u8' ? family : type === 'field32' ? '01' + hash(key).slice(2) : hash(key)]));
  config.ledgerNamespace = config.hubDomain; return config;
}
const domain = claimDomainCommitment(syntheticConfig()), owner = '22'.repeat(32), intentId = '33'.repeat(32), otherIntent = '44'.repeat(32);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function originalAuditFailure() {
  let error;
  try { assert.equal('synthetic private comparison actual', 'synthetic private comparison expected', 'CLAIM_OPERATOR_AUDIT_TOO_OLD'); }
  catch (value) { error = value; }
  error.auditBudget = Object.freeze({ phase: 'after-graph-coverage', method: 'begin-payout', round: 'pre-key',
    elapsedMilliseconds: 30017, limitMilliseconds: 30000 });
  error.nativeIdentity = 'synthetic private native identity';
  error.rpc = 'synthetic private rpc endpoint';
  return error;
}

test('public errors preserve fixed native uncertainty categories without exporting RPC text or identifiers', () => {
  for (const code of ['SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE', 'SOLANA_RPC_BLOCKHASH_NOT_FOUND',
    'BITCOIN_ORIGINAL_TRANSACTION_REQUIRED', 'LOCAL_EVM_UNCONTROLLED_TIME', 'ROLE_CLIENT_PROOF_INCOMPLETE'])
    assert.equal(nativeClaimApiErrorCode(new Error(code)), code);
  for (const message of ['SOLANA_RPC_BLOCKHASH_NOT_FOUND\n', 'raw native wire abc123',
    'SOLANA_RPC_ERROR: http://127.0.0.1:8899', 'PRIVATE_' + 'A'.repeat(64)])
    assert.equal(nativeClaimApiErrorCode(new Error(message)), 'NATIVE_CLAIM_OPERATION_FAILED');
});
test('explicit operator assertion codes survive ERR_ASSERTION without exporting comparison values', () => {
  for (const code of ['CLAIM_CURRENT_PRINCIPAL_DEFICIT', 'FLAT_OPERATOR_AUDIT_TOO_OLD',
    'COMBINED_OPERATOR_SAME_NATIVE_NODE_REQUIRED']) {
    let error;
    try { assert.equal('private actual value', 'private expected value', code); } catch (value) { error = value; }
    assert.equal(error.code, 'ERR_ASSERTION'); assert.equal(error.generatedMessage, false);
    assert.equal(nativeClaimApiErrorCode(error), code);
    assert.equal(nativeClaimApiErrorCode(new Error(code + '\nprivate actual value')), 'NATIVE_CLAIM_OPERATION_FAILED');
  }
  let generated;
  try { assert.equal('private actual value', 'private expected value'); } catch (value) { generated = value; }
  assert.equal(nativeClaimApiErrorCode(generated), 'NATIVE_CLAIM_OPERATION_FAILED');
});
async function fixture({ family = '2' } = {}) {
  const config = syntheticConfig(family), domain = claimDomainCommitment(config), claims = { configs: [config] };
  const directory = await mkdtemp(join(tmpdir(), 'claim-api-'));
  const options = { path: join(directory, 'store.v3'), password: 'synthetic durable claim API password', identity: { role: 'synthetic-api-test' } };
  const initial = { profile: 'SYNTHETIC_API', deposits: [
    { id: intentId, claimDomain: domain, packet: { ownerIdentitySHA256: owner }, status: 'PREPARED' },
    { id: otherIntent, claimDomain: domain, packet: { ownerIdentitySHA256: '55'.repeat(32) }, status: 'PREPARED' },
  ], tickets: [], evm: [], apiAccounts: [], apiAdmissions: [] };
  let store = await createClaimRecordStore(options, initial), fault = false, interrupted = false, gate = null;
  let signing = 0, issuance = 0, restartCount = 0, reconciliations = 0, loseIssueReply = false, failRestart = false;
  let journalReads = 0, journalWrites = 0, nextReconcileError = null;
  const journal = {
    read: async () => { journalReads++; return structuredClone((await store.read()).data); },
    async update(transform) {
      journalWrites++;
      const old = await store.read(), data = transform(structuredClone(old.data));
      if (gate && data.apiAdmissions.length > old.data.apiAdmissions.length) { const pending = gate; gate = null; pending.entered.resolve(); await pending.release.promise; }
      if (interrupted) { fault = true; throw Error('CLAIM_KEEPER_WRITE_UNCERTAIN'); }
      return (await store.update(old.revision, () => data)).data;
    },
  };
  const keeper = { status: () => ({ keeperRestart: true, uncertain: fault, requiresExternalEffectReconciliation: false }) };
  journals.set(keeper, journal);
  const projection = row => ({ intentId: row.id, claimDomain: row.claimDomain, amount: '1', status: row.status });
  const controller = {
    async reconcileAll() { reconciliations++; assert.equal(fault, false);
      if (nextReconcileError) { const failure = nextReconcileError; nextReconcileError = null;
        if (failure.uncertain) fault = true; throw failure.error; }
      return { reconciled: true }; },
    async reconcile({ operationId }) { const data = await journal.read(); return projection(data.deposits.find(row => row.id === operationId)); },
    async preposition({ intentId: id }) { await journal.update(data => { const row = data.deposits.find(item => item.id === id); if (row.status === 'PREPARED') row.status = 'PREPOSITIONED'; return data; }); return controller.reconcile({ operationId: id }); },
    async ingress({ intentId: id }) { await journal.update(data => { const row = data.deposits.find(item => item.id === id); if (!row.native) { signing++; row.native = { originalId: 'synthetic-single-send' }; } return data; }); },
    async issue({ intentId: id }) { issuance++; await journal.update(data => { data.deposits.find(row => row.id === id).status = 'ISSUED'; return data; });
      if (loseIssueReply) { loseIssueReply = false; throw Error('CLAIM_TEST_LOST_REPLY'); }
      return controller.reconcile({ operationId: id }); },
    async status() { const data = await journal.read(); return { deposits: data.deposits.map(projection), tickets: [] }; },
  };
  const input = { controller, accountId: 'owner_account_01', ownerIdentitySHA256: owner, claimDomain: domain, caller: '0x' + '66'.repeat(20) };
  const runtime = { accounts: [input.caller, '0x' + '77'.repeat(20)] };
  syntheticUnitBindings.set(claims, runtime);
  bindings.set(controller, { runtime, claims, keeper,
    async restart() { store.close();
      if (failRestart) { failRestart = false; fault = true; throw Error('CLAIM_KEEPER_REOPEN_UNCERTAIN'); }
      store = await openClaimRecordStore(options); fault = false; restartCount++; return controller; } });
  const sessions = [];
  return { input, controller, journal, keeper, claims, config,
    storageStats: () => ({ journalReads, journalWrites }),
    stats: () => ({ signing, issuance, restartCount }),
    reconciliations: () => reconciliations,
    loseReply() { loseIssueReply = true; },
    failRestartOnce() { failRestart = true; },
    failNextReconcile(error, { uncertain = false } = {}) { assert.equal(nextReconcileError, null); nextReconcileError = { error, uncertain }; },
    blockAdmission() { gate = { entered: deferred(), release: deferred() }; return gate; },
    failWrite() { interrupted = true; },
    async session(change = {}) { const session = await createNativeClaimSession({ ...input, ...change }); sessions.push(session); return session; },
    async reopenStore() { store.close(); store = await openClaimRecordStore(options); fault = false; interrupted = false; },
    async close() { for (const session of sessions) await session.close(); store.close(); await rm(directory, { recursive: true, force: true }); },
  };
}

test('private failure observation preserves the original audit code and budget without public or durable disclosure', async () => {
  const f = await fixture(); let http;
  try {
    const session = await f.session(), error = originalAuditFailure();
    assert.deepEqual(nativeClaimSessionPrivateFailures(session), []);
    f.failNextReconcile(error); http = await startNativeClaimHttp({ session });
    const response = await fetch(http.origin + '/api/native-claims/deposit', { method: 'POST', headers: {
      origin: http.origin, 'content-type': 'application/json', 'x-native-claim-token': http.clientAccess.token },
      body: JSON.stringify({ requestId: 'private_failure_01', intentId }) });
    assert.equal(response.status, 202); assert.equal((await response.json()).admitted, true);
    await session.idle();
    const expected = { requestId: 'private_failure_01', code: 'CLAIM_OPERATOR_AUDIT_TOO_OLD',
      causeCode: null, causeCodes: [], auditBudget: error.auditBudget };
    assert.deepEqual(nativeClaimSessionPrivateFailures(session), [expected]);
    const before = f.storageStats(), returned = nativeClaimSessionPrivateFailures(session);
    returned[0].auditBudget.elapsedMilliseconds = 0; returned[0].causeCodes.push('CLAIM_INVENTED'); returned.push({});
    assert.deepEqual(nativeClaimSessionPrivateFailures(session), [expected]);
    assert.deepEqual(f.storageStats(), before, 'private accessor performs no journal observation or update');
    const snapshot = await (await fetch(http.origin + '/api/native-claims/snapshot', { headers: {
      origin: http.origin, 'x-native-owner-token': http.ownerAccess.token } })).json();
    assert.equal(snapshot.requests[0].state, 'RECONCILIATION_REQUIRED');
    assert.equal(snapshot.requests[0].errorCode, 'CLAIM_OPERATOR_AUDIT_TOO_OLD');
    const ownerView = await (await fetch(http.origin + '/api/native-claims/owner', { headers: {
      origin: http.origin, 'x-native-owner-token': http.ownerAccess.token } })).json();
    const journal = await f.journal.read();
    for (const value of [snapshot, ownerView, journal]) {
      const text = JSON.stringify(value);
      for (const forbidden of ['auditBudget', 'elapsedMilliseconds', 'privateDiagnostics', 'private comparison',
        'private native identity', 'private rpc endpoint']) assert.equal(text.includes(forbidden), false, forbidden);
    }
    assert.deepEqual(f.stats(), { signing: 0, issuance: 0, restartCount: 0 });
    assert.equal(f.reconciliations(), 1, 'diagnosis adds no retry');
  } finally { await http?.close(); await f.close(); }
});

test('private failure observation retains a nested original budget and leaves uncertain durable state untouched', async () => {
  const f = await fixture();
  try {
    const session = await f.session(), original = originalAuditFailure();
    const error = new Error('CLAIM_ATTESTATION_UNCERTAIN', { cause: original });
    error.key = 'synthetic private key';
    f.failNextReconcile(error, { uncertain: true }); await session.submit('deposit', { requestId: 'private_failure_02', intentId });
    const snapshot = await session.idle();
    assert.equal(snapshot.requests[0].state, 'RUNNING');
    assert.equal(snapshot.storageAvailable, false); assert.equal(f.keeper.status().uncertain, true);
    const durableBefore = await f.journal.read();
    assert.deepEqual(nativeClaimSessionPrivateFailures(session), [{ requestId: 'private_failure_02',
      code: 'CLAIM_ATTESTATION_UNCERTAIN', causeCode: 'CLAIM_OPERATOR_AUDIT_TOO_OLD',
      causeCodes: ['CLAIM_OPERATOR_AUDIT_TOO_OLD'], auditBudget: original.auditBudget }]);
    assert.throws(() => nativeClaimSessionPrivateFailures({ ...session }), /ORIGINAL_SESSION_REQUIRED/);
    assert.throws(() => nativeClaimSessionPrivateFailures(session, {}), /PRIVATE_FAILURE_ARGUMENTS/);
    assert.throws(() => nativeClaimSessionPrivateFailures(), /PRIVATE_FAILURE_ARGUMENTS/);
    assert.deepEqual(f.stats(), { signing: 0, issuance: 0, restartCount: 0 });
    assert.equal(f.reconciliations(), 1);
    assert.equal(JSON.stringify(nativeClaimSessionPrivateFailures(session)).includes('synthetic private'), false);
    assert.equal(f.keeper.status().uncertain, true); assert.deepEqual(await f.journal.read(), durableBefore);
  } finally { await f.close(); }
});

test('private failure observation retains at most eight session-local failures and never persists or widens the audit budget', async () => {
  const f = await fixture();
  try {
    const session = await f.session();
    for (let index = 0; index < 10; index++) {
      const error = originalAuditFailure();
      if (index === 9) error.auditBudget = { ...error.auditBudget, limitMilliseconds: 30001 };
      f.failNextReconcile(error); await session.submit('deposit', { requestId: 'private_failure_' + String(index).padStart(2, '0'), intentId });
      await session.idle();
    }
    const failures = nativeClaimSessionPrivateFailures(session);
    assert.equal(failures.length, 8);
    assert.deepEqual(failures.map(value => value.requestId), Array.from({ length: 8 }, (_, index) => 'private_failure_' + String(index + 2).padStart(2, '0')));
    assert.equal(failures.at(-1).code, 'CLAIM_OPERATOR_AUDIT_TOO_OLD');
    assert.equal(Object.hasOwn(failures.at(-1), 'auditBudget'), false, 'an altered freshness limit is not retained as an original budget');
    assert.equal(f.reconciliations(), 10); assert.deepEqual(f.stats(), { signing: 0, issuance: 0, restartCount: 0 });
    await session.close(); await f.reopenStore(); const reopened = await f.session();
    assert.deepEqual(nativeClaimSessionPrivateFailures(reopened), []);
    assert.equal((await reopened.snapshot()).requests.length, 10);
    assert.equal(f.reconciliations(), 10, 'reopening performs no retry or diagnostic replay');
    assert.equal(JSON.stringify(await f.journal.read()).includes('auditBudget'), false);
  } finally { await f.close(); }
});

test('admission acknowledgment waits for encrypted durable write before any effect', async () => {
  const f = await fixture();
  try {
    const session = await f.session(), gate = f.blockAdmission(); let acknowledged = false;
    const submitted = session.submit('deposit', { requestId: 'deposit_0001', intentId }).then(value => { acknowledged = true; return value; });
    await gate.entered.promise;
    assert.equal(acknowledged, false); assert.deepEqual(f.stats(), { signing: 0, issuance: 0, restartCount: 0 });
    gate.release.resolve(); const ack = await submitted; assert.equal(ack.admitted, true);
    const result = await session.idle(); assert.equal(result.requests[0].state, 'CONFIRMED');
    assert.equal((await f.journal.read()).apiAdmissions[0].state, 'CONFIRMED');
  } finally { await f.close(); }
});

test('lost effect reply survives reconnect and explicit resume reconciles without another send or mint', async () => {
  const f = await fixture();
  try {
    const first = await f.session(); f.loseReply();
    await first.submit('deposit', { requestId: 'deposit_0002', intentId });
    assert.equal((await first.idle()).requests[0].state, 'RECONCILIATION_REQUIRED');
    await first.close(); await f.reopenStore();
    const next = await f.session(); assert.equal((await next.snapshot()).requests[0].state, 'RECONCILIATION_REQUIRED');
    assert.deepEqual(f.stats(), { signing: 1, issuance: 1, restartCount: 0 });
    await next.submit('resume', { requestId: 'deposit_0002' });
    assert.equal((await next.idle()).requests[0].state, 'CONFIRMED');
    await next.submit('deposit', { requestId: 'deposit_0002', intentId }); await next.idle();
    assert.deepEqual(f.stats(), { signing: 1, issuance: 1, restartCount: 0 });
    const observed = f.reconciliations();
    await next.submit('reconcile', { requestId: 'deposit_0002' }); await next.idle();
    assert.equal(f.reconciliations(), observed + 1, 'explicit reconciliation refreshes even a previously confirmed request');
    assert.deepEqual(f.stats(), { signing: 1, issuance: 1, restartCount: 0 });
  } finally { await f.close(); }
});

test('admitted interrupted work is retained on reopen but never automatically executed', async () => {
  const f = await fixture();
  try {
    const first = await f.session(); await first.close();
    await f.journal.update(data => { data.apiAdmissions.push({ accountId: f.input.accountId, requestId: 'interrupted_01',
      action: 'deposit', request: { requestId: 'interrupted_01', intentId }, controllerRequestId: '88'.repeat(32), state: 'RUNNING', errorCode: null, result: null }); return data; });
    await f.reopenStore(); const next = await f.session();
    assert.equal((await next.snapshot()).requests[0].state, 'RECONCILIATION_REQUIRED');
    assert.equal(f.stats().signing, 0);
    await next.submit('resume', { requestId: 'interrupted_01' });
    assert.equal((await next.idle()).requests[0].state, 'CONFIRMED'); assert.equal(f.stats().signing, 1);
  } finally { await f.close(); }
});

test('failed admission has no acknowledgment/effect; owner scope, exact requests and exclusive session are enforced', async () => {
  const f = await fixture();
  try {
    const session = await f.session();
    await assert.rejects(f.session(), /SESSION_BUSY/);
    await assert.rejects(session.submit('deposit', { requestId: 'wrong_owner_01', intentId: otherIntent }), /OWNER_INTENT_REQUIRED/);
    await assert.rejects(session.submit('redeem', { requestId: 'bad_fields_01', amount: '1', maxFee: '1', caller: f.input.caller }), /EXACT_FIELDS/);
    await session.submit('deposit', { requestId: 'same_request_01', intentId }); await session.idle();
    await assert.rejects(session.submit('refund', { requestId: 'same_request_01', intentId }), /REQUEST_REBOUND/);
    f.failWrite(); await assert.rejects(session.submit('restartKeeper', { requestId: 'failed_admission_01' }), /WRITE_UNCERTAIN/);
    assert.equal(f.stats().restartCount, 0);
    await session.close(); await f.reopenStore();
    await assert.rejects(f.session({ caller: '0x' + '77'.repeat(20) }), /ACCOUNT_REBOUND/);
  } finally { await f.close(); }
});

test('actual loopback HTTP exposes durable admission and separate private owner access', async () => {
  const f = await fixture(); let http;
  try {
    const session = await f.session(); http = await startNativeClaimHttp({ session });
    const headers = { origin: http.origin, 'content-type': 'application/json', 'x-native-claim-token': http.clientAccess.token };
    const response = await fetch(http.origin + '/api/native-claims/deposit', { method: 'POST', headers,
      body: JSON.stringify({ requestId: 'http_deposit_01', intentId }) });
    assert.equal(response.status, 202); assert.equal((await response.json()).admitted, true);
    await session.idle();
    const snapshotUrl = http.origin + '/api/native-claims/snapshot', beforeReads = f.storageStats();
    for (const readHeaders of [{}, headers, { 'x-native-owner-token': http.ownerAccess.token },
      { origin: 'http://example.invalid', 'x-native-owner-token': http.ownerAccess.token },
      { origin: http.origin, 'x-native-owner-token': '00'.repeat(32) }]) {
      const deniedHistory = await fetch(snapshotUrl, { headers: readHeaders });
      assert.equal(deniedHistory.status, 403);
      assert.deepEqual(await deniedHistory.json(), { error: readHeaders.origin === 'http://example.invalid'
        ? 'NATIVE_CLAIM_INVALID_ORIGIN' : 'NATIVE_CLAIM_OWNER_ACCESS_REQUIRED' });
    }
    assert.deepEqual(f.storageStats(), beforeReads, 'UNAUTHORIZED_HISTORY_READ_DOES_NOT_OBSERVE_JOURNAL');
    const snapshot = await (await fetch(snapshotUrl, { headers: {
      origin: http.origin, 'x-native-owner-token': http.ownerAccess.token } })).json();
    assert.equal(snapshot.requests[0].requestId, 'http_deposit_01');
    assert.equal(snapshot.requests[0].state, 'CONFIRMED'); assert.ok(!JSON.stringify(snapshot).includes(intentId));
    const denied = await fetch(http.origin + '/api/native-claims/owner', { headers }); assert.equal(denied.status, 403);
    const ownerView = await (await fetch(http.origin + '/api/native-claims/owner', { headers: {
      origin: http.origin, 'x-native-owner-token': http.ownerAccess.token } })).json();
    assert.equal(ownerView.nativeSelfCustody, false); assert.equal(ownerView.deposits.length, 1);
    assert.equal(ownerView.deposits[0].intentId, intentId);
  } finally { await http?.close(); await f.close(); }
});

test('close drains an admitted write and its later appended execution before releasing the controller', async () => {
  const f = await fixture();
  try {
    const session = await f.session(), gate = f.blockAdmission();
    const submitted = session.submit('deposit', { requestId: 'closing_deposit_01', intentId });
    await gate.entered.promise;
    let finished = false; const closing = session.close().then(value => { finished = true; return value; });
    assert.equal(finished, false);
    gate.release.resolve(); await submitted; const final = await closing;
    assert.equal(final.phase, 'CLOSED'); assert.equal(final.requests[0].state, 'CONFIRMED');
    assert.equal(f.stats().signing, 1);
    const reopened = await f.session(); assert.equal((await reopened.snapshot()).requests[0].state, 'CONFIRMED');
  } finally { await f.close(); }
});

test('concurrent unacknowledged admissions count toward the bounded work queue', async () => {
  const f = await fixture();
  try {
    const session = await f.session(), gate = f.blockAdmission();
    const submissions = Array.from({ length: 32 }, (_, index) => session.submit('deposit', {
      requestId: 'queued_request_' + String(index).padStart(2, '0'), intentId }).then(value => ({ value }), error => ({ error })));
    await gate.entered.promise;
    await assert.rejects(session.submit('deposit', { requestId: 'queue_overflow_01', intentId }), /BUSY/);
    const closing = session.close(); gate.release.resolve();
    const results = await Promise.all(submissions); await closing;
    assert.equal(results.filter(item => item.value).length, 1);
    assert.equal(results.filter(item => item.error).length, 31);
    assert.equal(f.stats().signing, 1);
  } finally { await f.close(); }
});

test('an interrupted keeper reopen can be repaired before durable acknowledgement of another restart', async () => {
  const f = await fixture();
  try {
    const session = await f.session(); f.failRestartOnce();
    await session.submit('restartKeeper', { requestId: 'restart_failed_01' });
    assert.equal((await session.idle()).storageAvailable, false);
    const admitted = await session.submit('restartKeeper', { requestId: 'restart_repair_01' });
    assert.equal(admitted.admitted, true);
    const after = await session.idle();
    assert.equal(after.requests.find(row => row.requestId === 'restart_repair_01').state, 'CONFIRMED');
    assert.equal(f.stats().restartCount, 1); assert.equal(f.stats().signing, 0);
  } finally { await f.close(); }
});

test('original session identity selects the registered BTC/SOL config and has no read or effect authority', async () => {
  const fields = ['version', 'profile', 'accountId', 'claimDomain', 'nativeFamily', 'nativeGenesis', 'nativeAsset',
    'wrapperAssetIdentity', 'claimSymbol', 'nativeSymbol', 'decimals', 'atomicUnit', 'observation'];
  for (const family of ['1', '2']) {
    const f = await fixture({ family });
    try {
      const session = await f.session(), storage = f.storageStats(), effects = f.stats();
      const identity = nativeClaimSessionIdentity(session);
      assert.deepEqual(Object.keys(identity), fields);
      assert.deepEqual(identity, { version: 1, profile: 'ORIGINAL_NATIVE_CLAIM_SESSION_IDENTITY_V1',
        accountId: f.input.accountId, claimDomain: f.input.claimDomain, nativeFamily: family,
        nativeGenesis: f.config.nativeGenesis, nativeAsset: f.config.nativeAsset,
        wrapperAssetIdentity: f.config.wrapperAssetIdentity, claimSymbol: family === '1' ? 'cBTC' : 'cSOL',
        nativeSymbol: family === '1' ? 'BTC' : 'SOL', decimals: family === '1' ? 8 : 9,
        atomicUnit: family === '1' ? 'satoshi' : 'lamport', observation: 'ORIGINAL_BOUND_CONFIGURATION_ONLY' });
      assert.ok(Object.isFrozen(identity)); assert.equal(nativeClaimSessionIdentity(session), identity);
      assert.throws(() => { identity.claimDomain = 'ff'.repeat(32); }, TypeError);
      assert.throws(() => nativeClaimSessionIdentity({ ...session }), /ORIGINAL_SESSION_REQUIRED/);
      assert.throws(() => nativeClaimSessionIdentity(session, {}), /IDENTITY_ARGUMENTS/);
      await assert.rejects(session.submit('redeem', { requestId: 'no_identity_override_01', amount: '1', maxFee: '1', identity }), /EXACT_FIELDS/);
      assert.deepEqual(f.storageStats(), storage); assert.deepEqual(f.stats(), effects);
      assert.equal(f.reconciliations(), 0);
      for (const hidden of ['ownerIdentitySHA256', 'caller', 'controller', 'runtime', 'keeper', 'endpoint', 'assetId', 'balance'])
        assert.equal(Object.hasOwn(identity, hidden), false);
    } finally { await f.close(); }
  }
});

test('unknown/ambiguous registered domains reject before journal writes or controller lease acquisition', async () => {
  const f = await fixture();
  try {
    const storage = f.storageStats();
    await assert.rejects(f.session({ claimDomain: 'ff'.repeat(32) }), /NATIVE_CLAIM_REGISTERED_DOMAIN_REQUIRED/);
    assert.deepEqual(f.storageStats(), storage);
    f.claims.configs = [f.config, f.config];
    await assert.rejects(f.session(), /NATIVE_CLAIM_REGISTERED_DOMAIN_REQUIRED/);
    assert.deepEqual(f.storageStats(), storage);
    f.claims.configs = [];
    await assert.rejects(f.session(), /NATIVE_CLAIM_REGISTERED_DOMAIN_REQUIRED/);
    assert.deepEqual(f.storageStats(), storage);
    f.claims.configs = [{ ...f.config, symbol: 'CALLER_LABEL' }];
    await assert.rejects(f.session(), /EXACT_FIELDS/); assert.deepEqual(f.storageStats(), storage);
    f.claims.configs = [{ ...f.config, nativeFamily: '3' }];
    await assert.rejects(f.session(), /CLAIM_NATIVE_FAMILY/); assert.deepEqual(f.storageStats(), storage);
    f.claims.configs = [f.config];
    for (const field of ['claimSymbol', 'nativeSymbol', 'decimals', 'identity'])
      await assert.rejects(f.session({ [field]: 'caller-label' }), /EXACT_FIELDS/);
    const session = await f.session(); assert.equal(nativeClaimSessionIdentity(session).claimDomain, f.input.claimDomain);
  } finally { await f.close(); }
});

test('captured identity remains immutable through original keeper restart, unavailable storage and session close', async () => {
  const f = await fixture();
  try {
    const session = await f.session(), identity = nativeClaimSessionIdentity(session);
    await session.submit('restartKeeper', { requestId: 'identity_restart_01' });
    await session.idle(); assert.equal(f.stats().restartCount, 1);
    assert.equal(nativeClaimSessionIdentity(session), identity);
    // The actual registered config is frozen. This deliberately mutable synthetic
    // fixture verifies that the accessor retained values, not a caller reference.
    f.config.nativeGenesis = 'ff'.repeat(32); f.claims.configs = [];
    assert.equal(nativeClaimSessionIdentity(session), identity);
    assert.notEqual(identity.nativeGenesis, f.config.nativeGenesis);
    f.failWrite(); await assert.rejects(session.submit('restartKeeper', { requestId: 'identity_failed_01' }));
    const before = f.storageStats(); assert.equal(nativeClaimSessionIdentity(session), identity);
    assert.deepEqual(f.storageStats(), before);
    await session.close();
    const closedReads = f.storageStats(); assert.equal(nativeClaimSessionIdentity(session), identity);
    assert.deepEqual(f.storageStats(), closedReads); assert.equal(f.stats().signing, 0);
  } finally { await f.close(); }
});


test('original mobile claim pairing persists before effects and reconciles only its same admitted request without native replay', async () => {
  // Real encrypted journal and secp256k1 PoP; controller native/proof ports are
  // the explicitly synthetic fixture above. This establishes no native credit.
  const f = await fixture(), keys = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const jwk = keys.publicKey.export({ format: 'jwk' }), publicKey = '04' + Buffer.from(jwk.x, 'base64url').toString('hex') + Buffer.from(jwk.y, 'base64url').toString('hex');
  const origin = 'https://127.0.0.1:9443', readers = [];
  function signature(permission) {
    const frame = Buffer.from('LIANUM_NATIVE_CLAIM_DEVICE_PERMISSION_V1\n' + JSON.stringify(permission));
    try { const bytes = sign('sha256', frame, { key: keys.privateKey, dsaEncoding: 'ieee-p1363' });
      const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
      const s = BigInt('0x' + bytes.subarray(32).toString('hex'));
      if (s > order / 2n) Buffer.from((order - s).toString(16).padStart(64, '0'), 'hex').copy(bytes, 32);
      return bytes.toString('hex');
    } finally { frame.fill(0); }
  }
  async function reader(session, devicePublicKey = publicKey) {
    const value = await createPairedOriginalNativeClaimReaderV1({ session, origin, devicePublicKey }); readers.push(value); return value;
  }
  try {
    const session = await f.session(), mobile = await reader(session);
    const descriptor = assertPairedOriginalNativeClaimReaderV1(mobile), retained = await f.journal.read();
    assert.equal(retained.apiDevicePairings.length, 1); assert.deepEqual(retained.apiDevicePairings[0].descriptor, descriptor);
    assert.equal(descriptor.nativeSymbol, 'SOL'); assert.equal(descriptor.claimSymbol, 'cSOL'); assert.equal(descriptor.decimals, 9);
    assert.deepEqual(f.stats(), { signing: 0, issuance: 0, restartCount: 0 });
    assert.throws(() => assertPairedOriginalNativeClaimReaderV1({ ...mobile }), /ORIGINAL_READER/);
    await assert.rejects(reader({ ...session }), /ORIGINAL_SESSION/);
    await assert.rejects(mobile.challenge({ action: 'RECONCILE_CLAIM_REQUEST', requestId: 'foreign_request_01' }), /OWN_ADMITTED_REQUEST/);
    const permission = await mobile.challenge({ action: 'READ_CLAIM_JOURNAL', requestId: null });
    await assert.rejects(mobile.operate({ permission: { ...permission, nonce: 'ff'.repeat(32) }, signature: signature(permission) }), /PERMISSION/);
    const read = await mobile.operate({ permission, signature: signature(permission) });
    assert.equal(read.state.deposits.length, 1); assert.equal(read.state.deposits[0].intentId, intentId);
    assert.equal(read.state.availablePrivateClaims, null); assert.equal(read.state.nativeSelfCustody, false);
    assert.equal(read.state.underlyingSpendable, false); assert.equal(read.state.independentOperators, false);
    await assert.rejects(mobile.operate({ permission, signature: signature(permission) }), /PERMISSION/);
    await session.submit('deposit', { requestId: 'same_original_deposit_01', intentId }); await session.idle();
    const effects = f.stats(), reconciled = f.reconciliations();
    const reconcile = await mobile.challenge({ action: 'RECONCILE_CLAIM_REQUEST', requestId: 'same_original_deposit_01' });
    const acknowledgement = await mobile.operate({ permission: reconcile, signature: signature(reconcile) });
    assert.equal(acknowledgement.admitted, true); assert.equal(acknowledgement.action, 'reconcile');
    await mobile.idle(); assert.deepEqual(f.stats(), effects); assert.equal(f.reconciliations(), reconciled + 1);
    await assert.rejects(mobile.operate({ permission: reconcile, signature: signature(reconcile) }), /PERMISSION/);
    assert.deepEqual(f.stats(), effects);
    mobile.close(); await mobile.idle(); await session.close(); await f.reopenStore();
    const reopened = await f.session(), restored = await reader(reopened);
    assert.deepEqual(assertPairedOriginalNativeClaimReaderV1(restored), descriptor, 'same durable pairing/lifetime after original keeper reopening');
    const otherKeys = generateKeyPairSync('ec', { namedCurve: 'secp256k1' }).publicKey.export({ format: 'jwk' });
    const otherPublicKey = '04' + Buffer.from(otherKeys.x, 'base64url').toString('hex') + Buffer.from(otherKeys.y, 'base64url').toString('hex');
    await assert.rejects(reader(reopened, otherPublicKey), /PAIRING_REBOUND/);
    restored.close(); await restored.idle(); await reopened.close();
    const late = await f.session({ accountId: 'late_mobile_account_01' });
    await assert.rejects(reader(late), /BEFORE_EFFECTS_REQUIRED/);
    assert.deepEqual(f.stats(), effects);
    assert.equal((await f.journal.read()).apiDevicePairings.length, 1);
  } finally { for (const value of readers) value.close(); for (const value of readers) await value.idle(); await f.close(); }
});
