/** Genuine account/approval/manual bridge/generic journal/session/HTTP/SDK;
 * explicitly SYNTHETIC lower ownership, owner preparation/witness, ledger and
 * accepted proof ports. No native factory, child, key, signer, prover, backend,
 * node, chain transaction or genuine economic acceptance is executed. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { derivePrivateAssetIdentity } from '../../../../../packages/engine/src/notes/private-asset-runtime.mjs';
import { sha } from '../../../../../packages/engine/src/execution/accounts/generic-account-journal.mjs';
import { encodeWalletPoolInputs } from '../../../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import * as actualState from '../../../../../packages/backend/src/execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import { createWalletClient, accountReviewDetails } from '../../../../../packages/mobile-protocol/src/wallet/client/view-model.mjs';
import { validNativeNoteReview } from '../../../../../packages/mobile-protocol/src/wallet/contracts/native-note-review.mjs';
const h = text => createHash('sha256').update(text).digest('hex'), a = n => String(n).repeat(40), clone = x => structuredClone(x);
const worlds = new WeakMap(), owners = new WeakMap();
const forbidden = () => { throw Error('SYNTHETIC_LOWER_FACTORY_FORBIDDEN'); };
const url = p => new URL(p, import.meta.url).href;
mock.module(url('../../../../../packages/backend/src/operations/deployments/native-value/native-value-system-v2.mjs'), { exports: {
  // Every other deployment and recovery port remains forbidden in this host fixture.
  assertOwnedNativeValueSystem: forbidden, nativeValueOperatorResources: forbidden, deployNativeValueSystem: forbidden, deployNativeValueDevSystemV5: forbidden, nativeValueOriginalRecoverySourceV1: forbidden, assertOwnedNativeValueObservationSystemV1: forbidden, captureNativeValueD26ObservationSystemV1: forbidden, stopCapturedNativeValueD26ObservationSystemV1: forbidden, reopenNativeValueD26ObservationSystemV1: forbidden, fenceOriginalNativeSystemEconomicRecoveryV1: forbidden, captureOriginalNativeSystemEconomicRecoveryV1: forbidden, stopCapturedNativeSystemEconomicRecoveryV1: forbidden, abortNativeSystemEconomicRecoveryV1: forbidden, reopenOriginalNativeSystemEconomicRecoveryV1: forbidden, retainOriginalNativeSystemSourceV1: forbidden, reopenOriginalNativeSystemSourceV1: forbidden,
  assertOwnedNativeValueWalletSystem(runtime, system) { assert.equal(worlds.get(runtime)?.system, system, 'SYNTHETIC_NATIVE_SYSTEM'); assert.equal(system.claimsEnabled, false); }
} });
mock.module(url('../../../../../packages/backend/src/chains/evm/runtime/local-evm-ownership.mjs'), { exports: { assertLocalEvmDeploymentProfile: forbidden, async assertLocalEvm(r) { assert.ok(worlds.has(r)); } } });
mock.module(url('../../../../../packages/backend/src/chains/shared/contracts/owned-pool-asset.mjs'), { exports: {
  createOwnedPoolAsset: forbidden, createNativePoolAsset: forbidden, assertOwnedPoolAsset(r, cap) { assert.equal(worlds.get(r)?.poolCapability, cap); }
} });
mock.module(url('../../../../../packages/backend/src/custody/processes/native-value-owner-process-v2.mjs'), { exports: {
  nativeValueOwnerEconomicIdentityV1: forbidden,
  createNativeValueOwnerProcess: forbidden, assertOwnedNativeValueOwnerProcess(owner, expected) {
    const w = owners.get(owner); assert.ok(w && w.ownerAvailable, 'SYNTHETIC_ORIGINAL_PROCESS');
    assert.equal(w.runtime, expected.runtime); assert.equal(w.system, expected.system); assert.equal(expected.poolIndex, 0);
  }
} });
mock.module(url('../../../../../packages/backend/src/custody/observers/native-value-owner-observer-v2.mjs'), { exports: {
  async createNativeValueOwnerObserver({ runtime }) { return worlds.get(runtime).observer; },
  assertOwnedNativeValueOwnerObserver(o, { runtime }) { assert.equal(o, worlds.get(runtime).observer); }
} });
mock.module(url('../../../../../packages/backend/src/execution/native-value/reconciliation/native-value-system-state-v2.mjs'), { exports: {
  ...actualState, async createNativeValueSystemStateReader({ runtime }) { return worlds.get(runtime).reader; }
} });
mock.module(url('../../../../../packages/backend/src/execution/native-value/execution/native-value-execution-v2.mjs'), { exports: {
  reconcileOriginalDeviceNativeRecoveryV1: forbidden, assertOwnedNativeValueExecution: forbidden, ownedNativeValueManualGraphReview: forbidden
} });
mock.module(url('../../../../../packages/proofs/src/tooling/scoped-proof-tools.mjs'), { exports: {
  loadFlatABI: forbidden, withFlatHash: forbidden
} });
mock.module('@lianum/backend/proving/roles/scoped-proof-runner', { exports: {
  createFlatProofRunner() { return { async close() {}, async abort() {}, prove: forbidden }; }
} });
let proofs = 0;
mock.module(url('../../../../../packages/proofs/src/execution/proof-process.mjs'), { exports: {
  createNativeEconomicNoteProofProcessV1: forbidden, createProofProcess() { return { async prove(_mode, _inputs, publicInputs) { proofs++; return { proof: 'c0ffee'.padEnd(64, '0'), publicInputs, metrics: { acceptedResult: true } }; }, async close() {} }; }
} });
const { createNativeValueAccountAuthority, nativeValueAccountManualNoteDetails } = await import('../../../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs');
const { createNativeValueManualGraphAccountSession } = await import('../../../../../packages/backend/src/api/accounts/flat-manual-graph-session.mjs');
const { createNativeValueOwnerManualPreparation } = await import('../../../../../packages/backend/src/custody/preparation/native-value-owner-manual-preparation-v1.mjs');
const { startWalletApplication } = await import('../../../src/server/server.mjs');
const { createWalletApplicationClient } = await import('../../../../../packages/backend/src/api/wallet/wallet-application-client.mjs');
async function fixture(t, kind = 'TOP_UP') {
  const directory = await mkdtemp(join(tmpdir(), 'native-note-consent-host-'));
  const domain = Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace'].map(k => [k, h(k)]));
  domain.ledgerNamespace = domain.hubDomain; domain.asset = derivePrivateAssetIdentity(31337, '0x' + '0'.repeat(40), '0x' + '0'.repeat(64)).slice(2);
  const identity = { pool: a(1), domain, domainCommitment: '01'.repeat(32) }, poolCapability = {};
  const w = { head: { hash: h('head-42'), number: '42', timestamp: '6000' }, ownerAvailable: true, records: [], prepared: new Map(), calls: [], sends: 0,
    processIdentitySHA256: h('original process ' + directory), processGeneration: 1, keyScopeSHA256: h('original vault scope ' + directory), async prepareHook() {}, ownerOffline: false };
  const runtime = { metadata: { chainId: '31337', evmGenesis: '0x' + h('genesis'), scratchDirectory: directory },
    time: async () => BigInt(w.head.timestamp), async send() { w.sends++; throw Error('SYNTHETIC_UNKNOWN_SEND'); } };
  const system = { bootstrap: 'synthetic-lower-host', claimsEnabled: false, pools: [{ address: '0x' + identity.pool,
    asset: '0x' + '0'.repeat(40), codeHash: '0x' + h('pool-code'), assetCapability: poolCapability, assetMetadata: null, artifact: {} }] };
  const term = kind => { const prepared = w.prepared.get(kind), role = kind === 'deposit' ? 'source' : kind.slice(9);
    return { identitySHA256: sha(identity), kind, observed: { blockHash: w.head.hash, timestamp: w.head.timestamp }, eligible: !prepared,
      note: prepared ? { role, amount: prepared.amount, recipient: prepared.recipient, status: kind === 'deposit' ? 'UNISSUED' : 'LOCKED', observedUnspent: kind !== 'deposit' }
        : kind === 'deposit' ? null : { role, amount: '77', recipient: a(3), status: 'AVAILABLE', observedUnspent: true }, prepared: prepared ? clone(prepared) : null }; };
  const owner = { publicView: { async summary() { return { profile: 'FIXED_LOCAL_FLAT_OWNER_CUSTODY_V1', manualNoteProfile: 'NATIVE_VALUE_OWNER_NOTE_CONSENT_V1', identitySHA256: sha(identity), closed: false,
    keyScopeSHA256: w.keyScopeSHA256, processIdentitySHA256: w.processIdentitySHA256, processGeneration: w.processGeneration,
    operations: Object.fromEntries([...w.prepared].map(([kind, p]) => [kind, p.stage])) }; } },
    ownerView: { async nativeNotePreparations() { return clone({ version: 1, records: w.records }); },
      async preparationTerms({ kind }) { return term(kind); }, async summary() {
        if (w.ownerOffline) throw Error('SYNTHETIC_OWNER_OFFLINE');
        return { identitySHA256: sha(identity), observed: { blockHash: w.head.hash, timestamp: w.head.timestamp },
          balances: { available: '77', reserved: '0', recovery: '0', locked: '0' } }; } },
    owner: { async prepareNativeNotePreparation({ review }) { w.calls.push('prepare');
      assert.equal(review.keyScopeSHA256, w.keyScopeSHA256); assert.equal(review.processGeneration, w.processGeneration);
      assert.equal(review.processIdentitySHA256, w.processIdentitySHA256);
      assert.ok(!w.records.some(r => r.review.ownerKind === review.ownerKind));
      w.records.push({ review: clone(review), ownerState: 'PREPARED' });
      w.prepared.set(review.ownerKind, { stage: 'PREPARED', epoch: review.epoch, amount: review.amount, recipient: review.recipient, submissionBound: false });
      await w.prepareHook(); return { kind: review.ownerKind, stage: 'PREPARED', reconcileRequired: false, dispatchAllowed: false };
    }, async bindSubmission({ kind }) { w.calls.push('bindSubmission'); w.prepared.get(kind).submissionBound = true; return { dispatchAllowed: true }; },
      async renewEpoch() { throw Error('IMPLICIT_RENEWAL_FORBIDDEN'); } },
    ownerProof: { async deposit() { w.calls.push('witness'); const p = w.prepared.get('deposit');
      const statement = { scope: domain.scope, policy: domain.policy, epoch: p.epoch, amount: p.amount, output: h('synthetic-output') };
      return { statement, inputs: {}, publicInputs: encodeWalletPoolInputs('deposit_balance', statement) }; },
      withdrawal: forbidden } };
  w.observer = { identity, async readSnapshot() { w.calls.push('snapshot'); return {}; }, async readTransaction() { w.calls.push('observeOriginal'); return null; } };
  w.reader = { async read() { return { head: { ...w.head }, ledger: { commitments: [], nullifiers: [], publicState: { actualAssetBalance: '77', backedAmount: '77', surplus: '0' } } }; }, async assertCurrent() {} };
  Object.assign(w, { runtime, system, owner, poolCapability }); worlds.set(runtime, w); owners.set(owner, w);
  const account = await createNativeValueAccountAuthority({ runtime, system, poolIndex: 0, owner, nativeExecution: null,
    accountId: 'native_account_01', journalId: 'native_account_journal_01' }, { onPrivateAudit: async value => { w.audit = value; } });
  const bridge = await account.ownerActions.createManualPreparation();
  const proposal = kind === 'TOP_UP' ? { kind, requestId: 'native_topup_01', amount: '77', exitRecipient: a(3) }
    : { kind, requestId: 'native_exit_01', role: 'source' };
  const joined = await createNativeValueManualGraphAccountSession({ runtime, system, poolIndex: 0, account,
    journal: { path: join(directory, 'generic-account.vault'), password: 'synthetic-fixture-only' } });
  const app = await startWalletApplication({ accountSession: joined.session, actionAccessMode: 'exact-only' }), host = app.createManualActionHandoff();
  const sdk = createWalletApplicationClient({ origin: app.origin, ownerToken: app.ownerAccess.token, manualActionHandoff: host.descriptor });
  t.after(async () => { await app.close(); await joined.session.idle(); await joined.session.close(); await account.close(); });
  return { w, account, bridge, proposal, joined, app, host, sdk, async ready() {
    const review = await bridge.review(proposal); assert.equal(w.calls.length, 0);
    const body = await bridge.confirm(); assert.ok(body);
    const approval = bridge.originalApproval(proposal.requestId); joined.bindManualNote(approval);
    return { review, body, approval };
  } };
}
async function grant(f, action, body) {
  assert.equal(await f.sdk.refresh(), true); const review = f.sdk.review(action, body);
  assert.equal(f.sdk.canConfirm(), false); const request = f.sdk.getManualActionReview();
  const grant = await f.host.authorizeReview(request); assert.equal(await f.sdk.acceptManualActionGrant(grant), true);
  return { review, request, grant };
}
async function wire(f, action, body, access) {
  const path = { accountPrepare: 'prepare', accountExecute: 'execute', accountReconcile: 'reconcile', accountRecover: 'recover' }[action];
  const r = await fetch(f.app.origin + '/api/wallet/account/' + path, { method: 'POST', headers: { Origin: f.app.origin, 'Content-Type': 'application/json', 'x-wallet-action-token': access.token }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
test('native original note review/approval routes through the ONE shared Node SDK and HTTP with exact body SHA and one-use grants', async t => {
  for (const kind of ['TOP_UP', 'EXIT']) {
    const f = await fixture(t, kind), { body, approval, review } = await f.ready();
    assert.equal(f.account.features.legacyManualNoteConsent, false); assert.equal(f.account.features.nativeManualNoteConsent, true);
    assert.throws(() => JSON.stringify(approval), /NOT_SERIALIZABLE/);
    assert.throws(() => nativeValueAccountManualNoteDetails({ ...approval }), /ORIGINAL_REQUIRED/);
    const publicReview = nativeValueAccountManualNoteDetails(approval).review;
    assert.equal(validNativeNoteReview(publicReview), true); assert.equal(publicReview.termsSHA256, sha(review));
    const g = await grant(f, 'accountPrepare', body);
    assert.equal(g.request.profile, 'ORIGINAL_NATIVE_VALUE_NOTE_HANDOFF_V1'); assert.equal(g.request.bodySHA256, sha(body));
    assert.equal(g.request.note.kind, kind); assert.ok(accountReviewDetails(g.review.accountContext).some(([k, v]) => k === 'Importe exacto' && v.includes('77')));
    assert.equal(await f.sdk.confirm(), true); await f.joined.session.idle();
    assert.equal((await f.joined.session.snapshot()).requests[0].state, 'PREPARED');
    assert.equal((await wire(f, 'accountPrepare', body, g.grant.access)).status, 403);
    assert.equal(f.w.sends, 0); assert.equal(f.w.calls.filter(x => x === 'prepare').length, 1);
    const restored = await f.account.ownerActions.restoreManualPreparation();
    assert.equal(restored.review, undefined); assert.equal(restored.confirm, undefined);
    assert.deepEqual(await restored.reconcileOriginal({ requestId: body.requestId }), { status: 'ALREADY_ADMITTED', handoff: null });
    assert.equal(restored.originalApproval(body.requestId), approval);
    assert.equal(f.app.actionAccess, undefined);
    assert.doesNotMatch(JSON.stringify(f.sdk.getState()), /privateKey|private_key|witness|opening|password|rootKey/);
  }
});
test('native owner preparation rejects stale exact head, process generation and key scope before mutation', async t => {
  for (const change of [w => { w.head.hash = h('other head'); }, w => { w.processGeneration++; }, w => { w.keyScopeSHA256 = h('other scope'); }]) {
    const f = await fixture(t); await f.bridge.review(f.proposal); change(f.w);
    assert.equal(await f.bridge.confirm(), false); assert.deepEqual(f.w.calls, []);
  }
});
test('copied owner/account, wrong account, legacy review and changed native terms cannot acquire original note authority', async t => {
  const f = await fixture(t), other = await fixture(t);
  await assert.rejects(createNativeValueOwnerManualPreparation({ runtime: f.w.runtime, system: f.w.system, poolIndex: 0,
    owner: { ...f.w.owner }, account: f.account }), /ORIGINAL_PROCESS/);
  await assert.rejects(createNativeValueOwnerManualPreparation({ runtime: f.w.runtime, system: f.w.system, poolIndex: 0,
    owner: f.w.owner, account: { ...f.account } }), /OWNED_AUTHORITY/);
  const { approval, review } = await f.ready();
  assert.throws(() => other.joined.bindManualNote(approval), /ACCOUNT_CHANGED/);
  const legacy = clone(review); for (const key of ['version', 'profile', 'keyScopeSHA256', 'processIdentitySHA256', 'processGeneration', 'originalAccountLifetime', 'generationId']) delete legacy[key];
  await assert.rejects(f.account.ownerActions.registerNativeManualNote(legacy));
  for (const mutate of [r => r.amount = '78', r => r.asset.policy = h('other policy'), r => r.accountIdentitySHA256 = h('other account'), r => r.keyScopeSHA256 = h('other scope')]) {
    const changed = clone(review); mutate(changed); await assert.rejects(f.account.ownerActions.readNativeManualNoteApproval(changed));
  }
});
test('stale head, altered domain/amount/body, revoke, cancel and replacement listener deny grants without sending', async t => {
  const f = await fixture(t), { body } = await f.ready();
  await f.sdk.refresh(); f.sdk.review('accountPrepare', body); const review = f.sdk.getManualActionReview();
  for (const mutate of [r => r.note.terms.amount = '78', r => r.note.terms.asset.policy = h('other'), r => r.body.assetId = h('other'), r => r.binding.generationId = h('other'), r => r.listenerId = h('other')]) {
    const bad = clone(review); mutate(bad); await assert.rejects(f.host.authorizeReview(bad));
  }
  f.w.head.hash = h('new head'); await assert.rejects(f.host.authorizeReview(review), /CHANGED/);
  const g = await grant(f, 'accountPrepare', body); f.host.cancelReview();
  assert.equal((await wire(f, 'accountPrepare', body, g.grant.access)).status, 403);
  f.sdk.cancelReview(); assert.equal(await f.sdk.confirm(), false);
  const next = await grant(f, 'accountPrepare', body); await f.app.close();
  const replacement = await startWalletApplication({ accountSession: f.joined.session, actionAccessMode: 'exact-only' }); t.after(() => replacement.close());
  const replaced = { ...f, app: replacement };
  assert.equal((await wire(replaced, 'accountPrepare', body, next.grant.access)).status, 403);
  const newHost = replacement.createManualActionHandoff(); await assert.rejects(newHost.authorizeReview(next.request));
  assert.equal(f.w.sends, 0);
});
test('native original epoch never renews; an uncertain one-use send permits observation only and restore does not replay consent', async t => {
  const f = await fixture(t), { body } = await f.ready();
  await grant(f, 'accountPrepare', body); assert.equal(await f.sdk.confirm(), true); await f.joined.session.idle();
  const g = await grant(f, 'accountExecute', { requestId: body.requestId }), proofCount = proofs;
  assert.equal(await f.sdk.confirm(), true); await f.joined.session.idle();
  const snapshot = await f.joined.session.snapshot(); assert.equal(snapshot.requests[0].state, 'UNKNOWN');
  assert.equal(f.w.sends, 1, JSON.stringify({calls:f.w.calls,audit:f.w.audit})); assert.equal(proofs, proofCount + 1);
  assert.equal((await wire(f, 'accountExecute', { requestId: body.requestId }, g.grant.access)).status, 403);
  const restored = await f.account.ownerActions.restoreManualPreparation();
  assert.deepEqual(await restored.reconcileOriginal({ requestId: body.requestId }), { status: 'ALREADY_ADMITTED', handoff: null });
  assert.equal(restored.confirm, undefined); f.w.head.timestamp = '6600';
  await grant(f, 'accountReconcile', { requestId: body.requestId }); assert.equal(await f.sdk.confirm(), true); await f.joined.session.idle();
  assert.equal(f.w.sends, 1, JSON.stringify({calls:f.w.calls,audit:f.w.audit})); assert.equal(proofs, proofCount + 1); assert.ok(f.w.calls.includes('observeOriginal'));
  await f.sdk.refresh(); assert.throws(() => f.sdk.review('accountExecute', { requestId: body.requestId }));
  assert.throws(() => f.joined.bindManualNote({ request: body }));
});
test('lost owner preparation reply is UNKNOWN and read-only restore does not register or acquire an approval', async t => {
  const f = await fixture(t); f.w.prepareHook = async () => { throw Error('SYNTHETIC_LOST_REPLY'); };
  await f.bridge.review(f.proposal); assert.equal(await f.bridge.confirm(), false); assert.equal(f.bridge.getState().phase, 'UNKNOWN');
  assert.equal(await f.bridge.confirm(), false); assert.equal(f.w.calls.filter(x => x === 'prepare').length, 1);
  const restored = await f.account.ownerActions.restoreManualPreparation();
  assert.deepEqual(await restored.reconcileOriginal({ requestId: f.proposal.requestId }), { status: 'UNKNOWN', handoff: null });
  assert.throws(() => restored.originalApproval(f.proposal.requestId), /ORIGINAL_APPROVAL_REQUIRED/); assert.equal(f.w.sends, 0);
});
test('prepared amount or original process drift rejects shared-session admission before any proof or send', async t => {
  for (const mutate of [w => { w.prepared.get('deposit').amount = '78'; }, w => { w.processGeneration++; }, w => { w.keyScopeSHA256 = h('replacement scope'); }]) {
    const f = await fixture(t), { body } = await f.ready(), before = proofs; mutate(f.w);
    await grant(f, 'accountPrepare', body); assert.equal(await f.sdk.confirm(), true); await f.joined.session.idle();
    const snapshot = await f.joined.session.snapshot(); assert.notEqual(snapshot.requests[0].state, 'PREPARED');
    assert.equal(f.w.sends, 0); assert.equal(proofs, before);
  }
});
test('native SDK lost HTTP reply keeps original admission and requires fresh observation instead of retrying its grant', async t => {
  const f = await fixture(t), { body } = await f.ready(); let posts = 0;
  const browser = createWalletClient({ ownerToken: f.app.ownerAccess.token, manualActionHandoff: f.host.descriptor,
    fetchImpl: async (path, options) => {
      const response = await fetch(f.app.origin + path, { ...options, headers: { ...options.headers, Origin: f.app.origin } });
      if (options.method === 'POST') { posts++; await response.arrayBuffer(); throw Error('SYNTHETIC_LOST_HTTP_REPLY'); }
      return response;
    } });
  assert.equal(await browser.refresh(), true); browser.review('accountPrepare', body);
  const g = await f.host.authorizeReview(browser.getManualActionReview()); assert.equal(await browser.acceptManualActionGrant(g), true);
  assert.equal(await browser.confirm(), false); await f.joined.session.idle(); assert.equal(posts, 1);
  assert.equal(browser.getState().outcome.state, 'UNKNOWN'); assert.equal(await browser.confirm(), false);
  assert.equal((await wire(f, 'accountPrepare', body, g.access)).status, 403);
  assert.equal(await browser.refresh(), true); assert.equal(browser.getState().data.account.snapshot.requests[0].requestId, body.requestId);
  assert.equal(browser.getState().data.account.snapshot.requests[0].state, 'PREPARED'); assert.equal(f.w.sends, 0);
});
test('native note direct exact-token issuer cannot bypass mandatory reviewed terms/head/nonce or host revocation', async t => {
  const f = await fixture(t), { body } = await f.ready();
  assert.throws(() => f.app.issueActionCapability({ action: 'accountPrepare', body }), /NATIVE_NOTE_MANUAL_HANDOFF_REQUIRED/);
  for (const action of ['accountExecute', 'accountReconcile'])
    assert.throws(() => f.app.issueActionCapability({ action, body: { requestId: body.requestId } }), /NATIVE_NOTE_MANUAL_HANDOFF_REQUIRED/);
  const g = await grant(f, 'accountPrepare', body); f.host.cancelReview();
  assert.equal((await wire(f, 'accountPrepare', body, g.grant.access)).status, 403);
  assert.equal((await f.joined.session.snapshot()).requests.length, 0); assert.equal(f.w.sends, 0);
});
