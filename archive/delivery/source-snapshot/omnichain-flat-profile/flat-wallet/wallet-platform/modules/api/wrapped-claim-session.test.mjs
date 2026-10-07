/** Durable API host boundary. Real encrypted storage; synthetic controller
 * effects explicitly do not establish native/proof acceptance. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment } from '../native-claims/framing.mjs';
import { createClaimRecordStore, openClaimRecordStore } from '../native-claims/segmented-record-store.mjs';
const bindings = new WeakMap(), journals = new WeakMap();
const url = path => new URL(path, import.meta.url).href;
mock.module(url('../native-claims/wrapped-controller-v1.mjs'), { exports: {
  ownedWrappedNativeClaimControllerBindingsV1(controller) { const value = bindings.get(controller); assert.ok(value, 'TEST_ORIGINAL_CONTROLLER'); return value; },
  async restartWrappedNativeClaimControllerV1(controller) { return bindings.get(controller).restart(); },
} });
mock.module(url('../native-claims/wrapped-controller-journal-v1.mjs'), { exports: {
  ownedClaimControllerJournal(keeper) { assert.ok(journals.has(keeper)); return journals.get(keeper); },
} });
mock.module(url('../ops/wrapped-wallet-release-v1.mjs'), { exports: { assertWrappedWalletAccountReleasedV1() {} } });
const { createWrappedClaimSessionV1: createNativeClaimSession, assertWrappedClaimSessionV1, walletClaimSessionIdentity,
  assertNativeClaimSession, nativeClaimSessionIdentity } = await import('./native-claim-session.mjs');
const { startWalletApplication } = await import('../../../wallet-app/server.mjs');
const { createWalletApplicationClient } = await import('./wallet-application-client.mjs');
const hash = value => createHash('sha256').update(value).digest('hex');
function syntheticConfig(family = '2') {
  const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([key, type]) => [key,
    type === 'address' ? hash(key).slice(0, 40) : type === 'u256' ? '31337' : type === 'u64' ? '5000'
      : type === 'u8' ? family : type === 'field32' ? '01' + hash(key).slice(2) : hash(key)]));
  config.ledgerNamespace = config.hubDomain; return config;
}
const domain = claimDomainCommitment(syntheticConfig()), owner = '22'.repeat(32), intentId = '33'.repeat(32), otherIntent = '44'.repeat(32);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

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
  let journalReads = 0, journalWrites = 0;
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
    async reconcileAll() { reconciliations++; assert.equal(fault, false); return { reconciled: true }; },
    async reconcile({ operationId }) { const data = await journal.read(); return projection(data.deposits.find(row => row.id === operationId)); },
    async preposition({ intentId: id }) { await journal.update(data => { const row = data.deposits.find(item => item.id === id); if (row.status === 'PREPARED') row.status = 'PREPOSITIONED'; return data; }); return controller.reconcile({ operationId: id }); },
    async ingress({ intentId: id }) { await journal.update(data => { const row = data.deposits.find(item => item.id === id); if (!row.native) { signing++; row.native = { originalId: 'synthetic-single-send' }; } return data; }); },
    async issue({ intentId: id }) { issuance++; await journal.update(data => { data.deposits.find(row => row.id === id).status = 'ISSUED'; return data; });
      if (loseIssueReply) { loseIssueReply = false; throw Error('CLAIM_TEST_LOST_REPLY'); }
      return controller.reconcile({ operationId: id }); },
    async status() { const data = await journal.read(); return { deposits: data.deposits.map(projection), tickets: [] }; },
  };
  const input = { controller, accountId: 'owner_account_01', ownerIdentitySHA256: owner, claimDomain: domain, caller: '0x' + '66'.repeat(20) };
  bindings.set(controller, { runtime: { accounts: [input.caller, '0x' + '77'.repeat(20)] }, claims, keeper,
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
    blockAdmission() { gate = { entered: deferred(), release: deferred() }; return gate; },
    failWrite() { interrupted = true; },
    async session(change = {}) { const session = await createNativeClaimSession({ ...input, ...change }); sessions.push(session); return session; },
    async reopenStore() { store.close(); store = await openClaimRecordStore(options); fault = false; interrupted = false; },
    async close() { for (const session of sessions) await session.close(); store.close(); /* Retain test-only source evidence; no cleanup deletion. */ },
  };
}

test('wrapped original durable controller uses the same wallet native routes and Node SDK without receiving a legacy session brand', async t => {
  for (const family of ['1', '2']) {
    const f = await fixture({ family }), session = await f.session();
    assertWrappedClaimSessionV1(session); assert.throws(() => assertNativeClaimSession(session));
    assert.throws(() => nativeClaimSessionIdentity(session));
    const identity = walletClaimSessionIdentity(session);
    assert.equal(identity.profile, 'ORIGINAL_WRAPPED_CLAIM_SESSION_IDENTITY_V1');
    assert.equal(identity.claimSymbol, family === '1' ? 'cBTC' : 'cSOL');
    const app = await startWalletApplication({ nativeClaimSession: session });
    const sdk = createWalletApplicationClient({ origin: app.origin, ownerToken: app.ownerAccess.token, actionToken: app.actionAccess.token });
    t.after(async () => { await app.close(); await f.close(); });
    assert.equal(await sdk.refresh(), true);
    sdk.review('deposit', { requestId: 'wrapped_claim_deposit_' + family, intentId });
    assert.equal(await sdk.confirm(), true); await session.idle();
    const snapshot = await session.snapshot(); assert.equal(snapshot.profile, 'OWNED_LOCAL_DURABLE_WRAPPED_CLAIM_ACCOUNT_V1');
    assert.equal(snapshot.requests[0].state, 'CONFIRMED');
    assert.deepEqual(f.stats(), { signing: 1, issuance: 1, restartCount: 0 });
    await session.submit('deposit', { requestId: 'wrapped_claim_deposit_' + family, intentId }); await session.idle();
    assert.deepEqual(f.stats(), { signing: 1, issuance: 1, restartCount: 0 });
    await assert.rejects(session.submit('deposit', { requestId: 'wrong_owner_deposit', intentId: otherIntent }), /OWNER_INTENT_REQUIRED/);
    assert.doesNotMatch(JSON.stringify(sdk.getState()), /privateKey|rootKey|witness|opening|password/);
  }
});
