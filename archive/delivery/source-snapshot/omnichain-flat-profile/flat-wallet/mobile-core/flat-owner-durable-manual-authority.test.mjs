/** Genuine account authority + encrypted Vault, with synthetic branded host
 * ports. No owner child, backend, node, proof, transport or execution runs. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { derivePrivateAssetIdentity } from '../../../omnichain-product/src/private-asset-runtime.mjs';
import { genericAccountIdentity, bindGenericAccountRequest, sha } from '../../../omnichain-product/src/paeg/generic-account-journal.mjs';
const h = s => createHash('sha256').update(s).digest('hex');
const worlds = new WeakMap(), systemWorlds = new WeakMap(), ownerWorlds = new WeakMap();
const url = p => new URL(p, import.meta.url).href;
mock.module(url('../wallet-platform/modules/ops/deploy-system.mjs'), { exports: {
  assertOwnedFlatSystem(runtime, system) { assert.equal(worlds.get(runtime)?.system, system); }
} });
mock.module(url('../wallet-platform/modules/chain-adapters/local-evm-ownership.mjs'), { exports: {
  async assertLocalEvm(runtime) { assert.ok(worlds.has(runtime)); }
} });
mock.module(url('../wallet-platform/modules/chain-adapters/owned-pool-asset.mjs'), { exports: {
  assertOwnedPoolAsset(runtime, value) { assert.equal(worlds.get(runtime)?.poolCapability, value); }
} });
mock.module(url('./flat-owner-process.mjs'), { exports: {
  assertOwnedFlatOwnerProcess(owner, expected) { assert.equal(ownerWorlds.get(owner)?.runtime, expected.runtime); }
} });
mock.module(url('./flat-owner-observer.mjs'), { exports: {
  async createFlatOwnerObserver({ runtime }) { return worlds.get(runtime).observer; },
  assertOwnedFlatOwnerObserver(observer, { runtime }) { assert.equal(observer, worlds.get(runtime).observer); }
} });
mock.module(url('../wallet-platform/modules/paeg/flat-system-state.mjs'), { exports: {
  async createFlatSystemStateReader({ runtime }) { return worlds.get(runtime).reader; }
} });
mock.module(url('../wallet-platform/modules/paeg/flat-native-execution.mjs'), { exports: { assertOwnedFlatNativeExecution() { throw Error('no native executor in synthetic fixture'); }, ownedFlatManualEvmGraphReview() { throw Error('no graph review in this fixture'); } } });
mock.module(url('../proof-workers/scoped-proof-tools.mjs'), { exports: {
  createFlatProofRunner() { return { async close() {}, async abort() {} }; },
  withFlatHash() { throw Error('no proof/hash work in synthetic fixture'); }
} });
mock.module(url('../wallet-platform/modules/paeg/flat-terminal-observer.mjs'), { exports: {
  createFlatTerminalObserver() { throw Error('no terminal observation'); }, decodeFlatTerminalCalldata() { throw Error('no terminal decode'); }
} });
const { createFlatAccountAuthority, assertOwnedFlatAccountAuthority } = await import('../wallet-platform/modules/global-state/flat-account-authority.mjs');
async function setup(t, { custody = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'manual-account-test-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const domain = Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace'].map(k => [k, h(k)]));
  domain.ledgerNamespace = domain.hubDomain; domain.asset = derivePrivateAssetIdentity(31337, '0x' + '0'.repeat(40), '0x' + '0'.repeat(64)).slice(2);
  const identity = { pool: '12'.repeat(20), domain, domainCommitment: '01'.repeat(32) };
  const runtime = { metadata: { chainId: '31337', evmGenesis: '0x' + h('genesis'), scratchDirectory: directory } };
  const poolCapability = {}, system = { bootstrap: 'fixture', pools: [{ address: '0x' + identity.pool, asset: '0x' + '0'.repeat(40),
    codeHash: '0x' + h('code'), artifact: {}, assetCapability: poolCapability, assetMetadata: null }] };
  let summaryReads = 0;
  const owner = { publicView: { async summary() { summaryReads++; return { identitySHA256: sha(identity), operations: { deposit: 'PREPARED', withdraw_source: 'PREPARED' } }; } } };
  let localCustody, ownerCheckpoint, termsCount = 0, termsFailure = -1, preparedReplyFailure = false, prepareCalls = 0;
  const ownerConfig = { path: join(directory, 'owner.vault'), password: 'synthetic-local-test', identity,
    poolArtifact: {}, create: true, checkpoint: null };
  const deps = { observer: { async readSnapshot() { return snapshot(identity); }, async readTransaction() { return null; } },
    async onCheckpoint(cp) { ownerCheckpoint = structuredClone(cp); }, async withHashFields() { throw Error('no backend'); } };
  if (custody) {
    localCustody = await openTrustedFlatOwnerCustody(ownerConfig, deps); t.after(() => localCustody.close());
    owner.publicView.summary = () => localCustody.summary();
    owner.ownerView = {
      manualPreparations: () => localCustody.manualPreparations(null),
      preparationTerms: async input => {
        if (++termsCount === termsFailure) throw Error('synthetic interrupted private response');
        return localCustody.preparationTerms(input);
      },
    };
    owner.owner = { async prepareManualPreparation(input) {
      prepareCalls++; const result = await localCustody.prepareManualPreparation(input);
      if (preparedReplyFailure) throw Error('synthetic lost prepared reply'); return result;
    } };
  }
  const w = { runtime, system, owner, poolCapability, observer: { identity }, reader: {}, get summaryReads() { return summaryReads; } };
  worlds.set(runtime, w); systemWorlds.set(system, w); ownerWorlds.set(owner, w);
  const input = { runtime, system, poolIndex: 0, owner, nativeExecution: null, accountId: 'manual_account_01', journalId: 'manual_journal_01' };
  const account = await createFlatAccountAuthority(input); t.after(() => account.close());
  const paths = await readdir(directory); const path = join(directory, paths.find(p => p.startsWith('flat-account-authority-')), 'operations.vault');
  const review = { request: { requestId: 'manual_request_01', kind: 'TOP_UP', ownerOperationRef: h('ref'), assetId: account.assetId },
    kind: 'TOP_UP', ownerKind: 'deposit', ownerIdentitySHA256: sha(identity), accountIdentitySHA256: sha(genericAccountIdentity(account.config)),
    asset: structuredClone(account.registry[0]), epoch: '10', amount: '50', recipient: '34'.repeat(20), role: null, noteStatus: null,
    observed: { blockHash: h('head'), timestamp: '6000' }, effect: 'CREATE_ORIGINAL_PRIVATE_DEPOSIT_PREPARATION',
    fundingApproval: 'EXISTING_EXACT_TOKEN_ALLOWANCE_REQUIRED_WHEN_APPLICABLE',
    registration: 'ORIGINAL_AUTHORITY_MAY_CREATE_RETAINED_TOKEN_DEPOSIT_WITNESS', spending: 'SEPARATE_ACCOUNT_PREPARE_AND_EXECUTE_REVIEW_REQUIRED' };
  return { ...w, get summaryReads() { return summaryReads; }, account, path, review, input,
    get prepareCalls() { return prepareCalls; }, ownerPath: ownerConfig.path,
    set termsFailure(n) { termsFailure = n; }, set preparedReplyFailure(v) { preparedReplyFailure = v; },
    async restartSyntheticOwner() {
      localCustody.close(); localCustody = await openTrustedFlatOwnerCustody({ ...ownerConfig, create: false, checkpoint: ownerCheckpoint }, deps);
    } };
}
test('real encrypted authority reads ABSENT/REGISTERED/ALREADY_ADMITTED without mutation or owner calls', async t => {
  const f = await setup(t); assertOwnedFlatAccountAuthority(f.account, f.input && { runtime: f.runtime, system: f.system, poolIndex: 0, owner: f.owner });
  const before = await readFile(f.path);
  assert.deepEqual(await f.account.ownerActions.readManualRegistration(f.review), { status: 'ABSENT' });
  assert.deepEqual(await readFile(f.path), before);
  await f.account.ownerActions.registerTopUp(f.review.request.ownerOperationRef);
  const registered = await readFile(f.path), reads = f.summaryReads;
  assert.deepEqual(await f.account.ownerActions.readManualRegistration(f.review), { status: 'REGISTERED' });
  assert.deepEqual(await readFile(f.path), registered); assert.equal(f.summaryReads, reads);
  await f.account.authority.prepare(bindGenericAccountRequest(f.review.request, f.account.config));
  const admitted = await readFile(f.path);
  assert.deepEqual(await f.account.ownerActions.readManualRegistration(f.review), { status: 'ALREADY_ADMITTED' });
  assert.deepEqual(await readFile(f.path), admitted);
});
for (const change of [
  r => { r.ownerIdentitySHA256 = h('wrong owner'); }, r => { r.accountIdentitySHA256 = h('wrong account'); },
  r => { r.request.ownerOperationRef = h('other reference'); }, r => { r.asset.symbol = 'OTHER'; },
]) test('real authority rejects foreign original binding without writing', async t => {
  const f = await setup(t); await f.account.ownerActions.registerTopUp(f.review.request.ownerOperationRef);
  const review = structuredClone(f.review); change(review); const bytes = await readFile(f.path);
  await assert.rejects(f.account.ownerActions.readManualRegistration(review)); assert.deepEqual(await readFile(f.path), bytes);
});
test('real authority rejects another request id after admission and never creates a replacement', async t => {
  const f = await setup(t); await f.account.ownerActions.registerTopUp(f.review.request.ownerOperationRef);
  await f.account.authority.prepare(bindGenericAccountRequest(f.review.request, f.account.config));
  const bytes = await readFile(f.path), changed = structuredClone(f.review); changed.request.requestId = 'replacement_request_01';
  await assert.rejects(f.account.ownerActions.readManualRegistration(changed), /REQUEST_REBOUND/);
  assert.deepEqual(await readFile(f.path), bytes);
});

import { PrivateNoteTree, privateSpentDigest } from '../../../omnichain-product/src/private-note-tree.mjs';
import { openTrustedFlatOwnerCustody, ownerDigest } from './flat-owner-custody.mjs';
const { createFlatOwnerManualPreparation, restoreFlatOwnerManualPreparation } = await import('./flat-owner-manual-preparation.mjs');
const ZERO = '0'.repeat(64), p = v => '0x' + v;
const word = v => typeof v === 'string' && v.startsWith('0x') ? v.slice(2).padStart(64, '0') : BigInt(v).toString(16).padStart(64, '0');
const words = values => '0x' + values.map(word).join('');
function snapshot(id, { commitments = [], nullifiers = [], sequence = '0', reservations = 0, outputs = 0, backing = '0', roots,
  timestamp = '6000', blockHash = h('block-' + sequence) } = {}) {
  const root = new PrivateNoteTree(commitments).root; roots ??= [root]; const count = Buffer.alloc(4); count.writeUInt32BE(roots.length);
  const padded = roots.concat(Array(65 - roots.length).fill(p(ZERO)));
  const history = p(createHash('sha256').update(Buffer.concat([Buffer.from([0x18]), Buffer.from(id.domain.scope, 'hex'), count,
    ...padded.map(value => Buffer.from(value.slice(2), 'hex'))])).digest('hex'));
  return { identitySHA256: ownerDigest(id), blockHash, canonicalBlockHashBefore: blockHash, canonicalBlockHashAfter: blockHash, timestamp,
    rawState: words([root, privateSpentDigest(p(id.domain.scope), nullifiers), sequence, commitments.length, nullifiers.length, reservations, outputs,
      ...commitments, ...Array(64 - commitments.length).fill(p(ZERO)), ...nullifiers, ...Array(64 - nullifiers.length).fill(p(ZERO))]),
    rawHistory: words([sequence, history, roots.length, ...padded]), rawBacking: words([sequence, backing, backing, 0, 0, 0]) };
}

for (const interruption of ['prepared reply', 'registered reply']) test('integrated real Vault owner/account survive ' + interruption + ' loss with original read-only reconciliation', async t => {
  const f = await setup(t, { custody: true });
  const input = { runtime: f.runtime, system: f.system, poolIndex: 0, owner: f.owner, account: f.account };
  const bridge = await createFlatOwnerManualPreparation(input);
  const review = await bridge.review({ requestId: 'integrated_manual_01', kind: 'TOP_UP', amount: '50', exitRecipient: '34'.repeat(20) });
  if (interruption === 'prepared reply') f.preparedReplyFailure = true;
  else f.termsFailure = 4; // after real authority registration persists
  assert.equal(await bridge.confirm(), false); assert.equal(bridge.getState().phase, 'UNKNOWN');
  await f.restartSyntheticOwner(); // same host capability and surviving authority, authenticated original checkpoint
  f.termsFailure = -1; f.preparedReplyFailure = false;
  const beforeOwner = await readFile(f.ownerPath), beforeAccount = await readFile(f.path), count = f.prepareCalls;
  const restored = await restoreFlatOwnerManualPreparation(input);
  assert.deepEqual(restored.getState().attempts[0].review, review); assert.equal(restored.confirm, undefined);
  const result = await restored.reconcileOriginal({ requestId: review.request.requestId });
  assert.deepEqual(result, interruption === 'prepared reply'
    ? { status: 'UNKNOWN', handoff: null } : { status: 'HANDOFF_READY', handoff: review.request });
  assert.equal(f.prepareCalls, count); assert.deepEqual(await readFile(f.ownerPath), beforeOwner);
  assert.deepEqual(await readFile(f.path), beforeAccount);
});
