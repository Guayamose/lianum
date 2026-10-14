/** Genuine account authority + encrypted Vault, with synthetic branded host
 * ports. No owner child, backend, node, proof, transport or execution runs. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeFlatWords } from '../../../backend/src/execution/encoding/flat-words.mjs';
import { createHash } from 'node:crypto';
import {FLAT_MINIMUM_PROFILE} from '../../../backend/src/operations/deployments/system/append-only-build-v3.mjs';
const h = s => createHash('sha256').update(s).digest('hex');
const worlds = new WeakMap(), systemWorlds = new WeakMap(), ownerWorlds = new WeakMap();
const url = p => new URL(p, import.meta.url).href;
mock.module(url('../../../backend/src/accounts/authority/flat-pool-admission-policy.mjs'), { exports: {
  assertOwnedFlatPoolAdmissionPolicy() { throw Error('HOST_POOL_ADMISSIONS_NOT_SUPPLIED'); }
} });
mock.module(url('../../../backend/src/operations/deployments/system/deploy-system.mjs'), { exports: {
  ...Object.fromEntries(['appendFlatPoolSuccessor', 'assertOwnedFlatSystem', 'captureOwnedFlatSystemRecoveryV1', 'deployFlatAppendOnlySystem', 'deployFlatSystem', 'describeOwnedFlatPoolRegistry', 'flatRecoveryViewDataV1', 'reopenOwnedFlatSystemRecoveryV1'].map(name => [name, () => { throw Error('HOST_UNUSED_ORIGINAL_PORT'); }])),
  assertOwnedFlatSystem(runtime, system) { assert.equal(worlds.get(runtime)?.system, system); }
} });
mock.module(url('../../../backend/src/chains/evm/runtime/local-evm-ownership.mjs'), { exports: {
  async assertLocalEvm(runtime) { assert.ok(worlds.has(runtime)); },
  async assertLocalEvmDeploymentProfile() { throw Error('HOST_DEPLOYMENT_NOT_SUPPLIED'); }
} });
mock.module(url('../../../backend/src/chains/shared/contracts/owned-pool-asset.mjs'), { exports: {
  ...Object.fromEntries(['assertOwnedPoolAsset', 'createNativePoolAsset', 'createOwnedPoolAsset'].map(name => [name, () => { throw Error('HOST_UNUSED_ORIGINAL_PORT'); }])),
  assertOwnedPoolAsset(runtime, value) { assert.equal(worlds.get(runtime)?.poolCapability, value); },
  createOwnedPoolAsset() { throw Error('HOST_ASSET_CREATION_NOT_SUPPLIED'); }
} });
mock.module(url('../../../backend/src/custody/processes/flat-owner-process.mjs'), { exports: {
  assertOwnedFlatOwnerProcess(owner, expected) { assert.equal(ownerWorlds.get(owner)?.runtime, expected.runtime); },
  assertOwnedNativeClaimIngressHandoff() { throw Error('HOST_NATIVE_CLAIMS_NOT_SUPPLIED'); },
  assertOwnedPrivateNativeClaimIngressHandoffV2() { throw Error('HOST_NATIVE_CLAIMS_NOT_SUPPLIED'); }
} });
mock.module(url('../../../backend/src/custody/observers/flat-owner-observer.mjs'), { exports: {
  async createFlatOwnerObserver({ runtime }) { return worlds.get(runtime).observer; },
  assertOwnedFlatOwnerObserver(observer, { runtime }) { assert.equal(observer, worlds.get(runtime).observer); }
} });
mock.module(url('../../../backend/src/execution/account/reconciliation/flat-system-state.mjs'), { exports: {
  decodeFlatWords,
  async createFlatSystemStateReader({ runtime }) { return worlds.get(runtime).reader; }
} });
mock.module(url('../../../backend/src/execution/account/execution/flat-native-execution.mjs'), { exports: { assertOwnedFlatNativeExecution() { throw Error('no native executor in synthetic fixture'); }, ownedFlatManualEvmGraphReview() { throw Error('no graph review in this fixture'); } } });
const hostScopedProofTools = {
  createFlatProofRunner() { return { async close() {}, async abort() {} }; },
  withFlatHash() { throw Error('no proof/hash work in synthetic fixture'); }
};
mock.module(url('../../../proofs/src/tooling/scoped-proof-tools.mjs'), { exports: hostScopedProofTools });
mock.module(import.meta.resolve('@lianum/backend/proving/roles/scoped-proof-runner'), {exports: {
  createFlatProofRunner: hostScopedProofTools.createFlatProofRunner,
}});
mock.module(url('../../../backend/src/execution/account/reconciliation/flat-terminal-observer.mjs'), { exports: {
  createFlatTerminalObserver() { throw Error('no terminal observation'); }, decodeFlatTerminalCalldata() { throw Error('no terminal decode'); }
} });
const proofControl = { calls: 0, async hook() {} };
mock.module(url('../../../proofs/src/execution/proof-process.mjs'), { exports: {
  createProofProcess() { return { async prove(mode, inputs, publicInputs) { proofControl.calls++; await proofControl.hook();
    return { proof: Buffer.alloc(32, 1), publicInputs, metrics: { acceptedResult: true } }; }, async close() {} }; }
} });
const { FLAT_TRANSACTION_METHODS } = await import('../../../backend/src/execution/encoding/transaction-codec.mjs');
const { Vault } = await import('@lianum/engine/crypto/vault');
const { derivePrivateAssetIdentity } = await import('@lianum/engine/notes/private-asset-runtime');
const { genericAccountIdentity, bindGenericAccountRequest, sha } = await import('@lianum/engine/accounts/journal');
const { PrivateNoteTree, privateSpentDigest } = await import('@lianum/engine/notes/private-note-tree');
const { openTrustedFlatOwnerCustody, ownerDigest } = await import('../../src/signing/flat-owner-custody.mjs');
const { createFlatManualAccountKeeper } = await import('../../../backend/src/accounts/storage/flat-manual-account-keeper.mjs');
const { createFlatAccountAuthority, assertOwnedFlatAccountAuthority } = await import('../../../backend/src/accounts/authority/flat-account-authority.mjs');
async function setup(t, { custody = false, legacy = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'manual-account-test-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const domain = Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace'].map(k => [k, h(k)]));
  domain.ledgerNamespace = domain.hubDomain; domain.asset = derivePrivateAssetIdentity(31337, '0x' + '0'.repeat(40), '0x' + '0'.repeat(64)).slice(2);
  const identity = { pool: '12'.repeat(20), domain, domainCommitment: '01'.repeat(32) };
  let timestamp = '6000', sendCalls = 0, commitments = [];
  const runtime = { async time() { return BigInt(timestamp); }, async send() { sendCalls++; throw Error('synthetic lost dispatch result'); }, metadata: { chainId: '31337', evmGenesis: '0x' + h('genesis'), scratchDirectory: directory } };
  const poolCapability = {}, system = { bootstrap: 'fixture', ...(legacy?{}:{deploymentProfile:FLAT_MINIMUM_PROFILE}), pools: [{ address: '0x' + identity.pool, asset: '0x' + '0'.repeat(40),
    codeHash: '0x' + h('code'), minimumDepositAtomic:'10', runtimeCode:'0x6000', async call(method,args,tag){assert.equal(method,'minimumDepositAmount()');assert.deepEqual(args,[]);assert.equal(tag,'0x1');return '0x'+10n.toString(16).padStart(64,'0');}, artifact: {}, assetCapability: poolCapability, assetMetadata: null }] };
  runtime.block=async()=>({number:'0x1',hash:'0x'+h('minimum-fixture-head'),timestamp:'0x1770'});runtime.code=async(pool,tag)=>{assert.equal(pool,'0x'+identity.pool);assert.equal(tag,'0x1');return '0x6000';};runtime.assertCanonical=async head=>assert.equal(head.hash,'0x'+h('minimum-fixture-head'));
  let summaryReads = 0;
  const owner = { publicView: { async summary() { summaryReads++; return { identitySHA256: sha(identity), operations: { deposit: 'PREPARED', withdraw_source: 'PREPARED' } }; } } };
  owner.ownerProof={deposit:async()=>({statement:{amount:'50'}})};
  let ownerCheckpointHook = async () => {}, reauthorizeCalls = 0;
  let localCustody, ownerCheckpoint, termsCount = 0, termsFailure = -1, preparedReplyFailure = false, prepareCalls = 0;
  const ownerConfig = { path: join(directory, 'owner.vault'), password: 'synthetic-local-test', identity,
    poolArtifact: { evm: { methodIdentifiers: Object.fromEntries(Object.values(FLAT_TRANSACTION_METHODS).map(m => [m.signature, m.selector])) } }, create: true, checkpoint: null };
  const deps = { observer: { async readSnapshot() { return snapshot(identity, { timestamp, commitments, backing: commitments.length ? '50' : '0', outputs: commitments.length }); }, async readTransaction() { return null; } },
    async onCheckpoint(cp) { ownerCheckpoint = structuredClone(cp); await ownerCheckpointHook(cp); }, async withHashFields() { throw Error('no backend'); } };
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
    owner.ownerProof = { deposit: () => localCustody.depositWitness(), withdrawal: role => localCustody.withdrawalWitness({ role }) };
    owner.owner = { reauthorizeManualPreparation: input => { reauthorizeCalls++; return localCustody.reauthorizeManualPreparation(input); },
      renewEpoch: input => localCustody.renewEpoch(input), bindSubmission: input => localCustody.bindSubmission(input),
      async prepareManualPreparation(input) {
      prepareCalls++; const result = await localCustody.prepareManualPreparation(input);
      if (preparedReplyFailure) throw Error('synthetic lost prepared reply'); return result;
    } };
  }
  const w = { runtime, system, owner, poolCapability, observer: { identity, readSnapshot: () => deps.observer.readSnapshot() }, reader: {}, get summaryReads() { return summaryReads; } };
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
  return { ...w, directory, get timestamp() { return timestamp; }, set timestamp(value) { timestamp = value; },
    get sendCalls() { return sendCalls; }, get reauthorizeCalls() { return reauthorizeCalls; },
    set ownerCheckpointHook(fn) { ownerCheckpointHook = fn; },
    async ownerState() { return (await new Vault(ownerConfig.path).read(ownerConfig.password)).data; },
    async seedSourceNote() {
      await localCustody.prepareDeposit({ amount: '50', epoch: '10', exitRecipient: '34'.repeat(20) }); localCustody.close();
      const vault = new Vault(ownerConfig.path), old = await vault.read(ownerConfig.password);
      const next = await vault.update(ownerConfig.password, old.revision, data => { data.notes.source.status = 'AVAILABLE'; return data; });
      commitments = ['0x' + next.data.notes.source.commitment];
      ownerCheckpoint = { version: 1, identitySHA256: sha(identity), acknowledged: { revision: next.revision, stateSHA256: sha(next.data) }, pending: null };
      localCustody = await openTrustedFlatOwnerCustody({ ...ownerConfig, create: false, checkpoint: ownerCheckpoint }, deps);
    }, get summaryReads() { return summaryReads; }, account, path, review, input,
    get prepareCalls() { return prepareCalls; }, ownerPath: ownerConfig.path,
    set termsFailure(n) { termsFailure = n; }, set preparedReplyFailure(v) { preparedReplyFailure = v; },
    async restartSyntheticOwner() {
      localCustody.close(); localCustody = await openTrustedFlatOwnerCustody({ ...ownerConfig, create: false, checkpoint: ownerCheckpoint }, deps);
    } };
}
const { createFlatOwnerManualPreparation, restoreFlatOwnerManualPreparation } = await import('@lianum/backend/custody/preparation/flat-owner-manual-preparation');
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


test('genuine child creates one original private manual preparation bridge and read-only restore without caller-supplied owner', async t => {
  const f = await setup(t, { custody: true }), before = await readFile(f.ownerPath);
  const [first, second] = await Promise.all([f.account.ownerActions.createManualPreparation(), f.account.ownerActions.createManualPreparation()]);
  assert.equal(first, second); assert.deepEqual(await readFile(f.ownerPath), before);
  await assert.rejects(f.account.ownerActions.createManualPreparation({ owner: {} }));
  const review = await first.review({ requestId: 'private_factory_01', kind: 'TOP_UP', amount: '50', exitRecipient: '34'.repeat(20) });
  assert.equal(review.asset.assetId, f.account.assetId); assert.deepEqual(await readFile(f.ownerPath), before);
  const restored = await f.account.ownerActions.restoreManualPreparation();
  assert.equal(restored.confirm, undefined); assert.equal(restored.review, undefined); assert.equal(restored.getState().review, null);
  assert.deepEqual(await first.confirm(), review.request);
  assert.deepEqual(await restored.reconcileOriginal({ requestId: review.request.requestId }), { status: 'HANDOFF_READY', handoff: review.request });
});
const { createFlatPortfolioAuthority } = await import('../../../backend/src/accounts/authority/flat-portfolio-authority.mjs');
const { createFlatManualPortfolioKeeper } = await import('../../../backend/src/accounts/portfolio/flat-manual-portfolio-keeper.mjs');
test('real owner, real child authority and real mixed root journal bind and persist the same-original new epoch', async t => {
  const f = await setup(t, { custody: true });
  const portfolio = createFlatPortfolioAuthority({ runtime: f.runtime, system: f.system, accounts: [{ poolIndex: 0, account: f.account }],
    accountId: 'real_mixed_account', journalId: 'real_mixed_journal' });
  const keeper = await createFlatManualPortfolioKeeper({ runtime: f.runtime, portfolio,
    journal: { path: join(f.directory, 'real-mixed.vault'), password: 'synthetic-real-mixed-only' } }); t.after(() => keeper.close());
  const preparation = await f.account.ownerActions.createManualPreparation();
  const reviewed = await preparation.review({ requestId: 'real_mixed_original_01', kind: 'TOP_UP', amount: '50', exitRecipient: '34'.repeat(20) });
  const handoff = await preparation.confirm(); await keeper.prepare(handoff); f.timestamp = '6600';
  assert.deepEqual(await keeper.execute(handoff.requestId), { state: 'NO_DISPATCH_REAUTHORIZATION_REQUIRED', generation: 0 });
  const paused = (await keeper.privateStatus()).requests[0];
  assert.notEqual(paused.request.bindingSHA256, paused.noDispatch.childBinding.requestBindingSHA256);
  assert.equal(paused.noDispatch.childBinding.accountIdentitySHA256, reviewed.accountIdentitySHA256);
  const next = await keeper.reviewReauthorization(handoff.requestId); assert.equal(next.accountIdentitySHA256, reviewed.accountIdentitySHA256);
  assert.deepEqual(await keeper.confirmReauthorization(), { state: 'PREPARED', generation: 1 });
  assert.equal((await f.ownerState()).manualPreparations.records[0].reauthorizations[0].epoch, '11');
  assert.equal(f.reauthorizeCalls, 1); assert.equal(f.sendCalls, 0);
  await f.restartSyntheticOwner(); await keeper.restartCoordinator(); assert.equal(await keeper.confirmReauthorization(), false);
  assert.deepEqual((await keeper.privateStatus()).requests[0].request, paused.request);
});

test('HOST legacy V1 fresh TOP_UP stays fenced before owner signing or account write',async t=>{const f=await setup(t,{legacy:true}),before=await readFile(f.path),calls=f.summaryReads;await assert.rejects(f.account.ownerActions.registerTopUp(f.review.request.ownerOperationRef),/FLAT_LEGACY_FRESH_DEPOSIT_DISABLED/);assert.deepEqual(await readFile(f.path),before);assert.equal(f.summaryReads,calls+1);});
