/** Genuine account authority + encrypted Vault, with synthetic branded host
 * ports. No owner child, backend, node, proof, transport or execution runs. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault } from '../../../engine/src/crypto/vault.mjs';
import { FLAT_TRANSACTION_METHODS } from '../../../backend/src/execution/encoding/transaction-codec.mjs';
import { createHash } from 'node:crypto';
import { derivePrivateAssetIdentity } from '../../../engine/src/notes/private-asset-runtime.mjs';
import { genericAccountIdentity, bindGenericAccountRequest, sha } from '../../../engine/src/execution/accounts/generic-account-journal.mjs';
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
const proofControl = { calls: 0, async hook() {} };
mock.module(url('../../../omnichain-product/src/paeg/proof-process.mjs'), { exports: {
  createProofProcess() { return { async prove(mode, inputs, publicInputs) { proofControl.calls++; await proofControl.hook();
    return { proof: Buffer.alloc(32, 1), publicInputs, metrics: { acceptedResult: true } }; }, async close() {} }; }
} });
const { createFlatManualAccountKeeper } = await import('../../../backend/src/accounts/storage/flat-manual-account-keeper.mjs');
const { createFlatAccountAuthority, assertOwnedFlatAccountAuthority } = await import('../../../backend/src/accounts/authority/flat-account-authority.mjs');
async function setup(t, { custody = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'manual-account-test-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const domain = Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace'].map(k => [k, h(k)]));
  domain.ledgerNamespace = domain.hubDomain; domain.asset = derivePrivateAssetIdentity(31337, '0x' + '0'.repeat(40), '0x' + '0'.repeat(64)).slice(2);
  const identity = { pool: '12'.repeat(20), domain, domainCommitment: '01'.repeat(32) };
  let timestamp = '6000', sendCalls = 0, commitments = [];
  const runtime = { async time() { return BigInt(timestamp); }, async send() { sendCalls++; throw Error('synthetic lost dispatch result'); }, metadata: { chainId: '31337', evmGenesis: '0x' + h('genesis'), scratchDirectory: directory } };
  const poolCapability = {}, system = { bootstrap: 'fixture', pools: [{ address: '0x' + identity.pool, asset: '0x' + '0'.repeat(40),
    codeHash: '0x' + h('code'), artifact: {}, assetCapability: poolCapability, assetMetadata: null }] };
  let summaryReads = 0;
  const owner = { publicView: { async summary() { summaryReads++; return { identitySHA256: sha(identity), operations: { deposit: 'PREPARED', withdraw_source: 'PREPARED' } }; } } };
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
import { PrivateNoteTree, privateSpentDigest } from '../../../engine/src/notes/private-note-tree.mjs';
import { openTrustedFlatOwnerCustody, ownerDigest } from '../../src/signing/flat-owner-custody.mjs';
const { createFlatOwnerManualPreparation, restoreFlatOwnerManualPreparation } = await import('../../src/preparation/flat-owner-manual-preparation.mjs');
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

const NDRA = 'NO_DISPATCH_REAUTHORIZATION_REQUIRED';
async function lifecycle(t, { kind = 'TOP_UP', keeperCheckpoint = async () => {} } = {}) {
  proofControl.calls = 0; proofControl.hook = async () => {};
  const f = await setup(t, { custody: true });
  if (kind === 'EXIT') await f.seedSourceNote();
  const bridge = await createFlatOwnerManualPreparation({ runtime: f.runtime, system: f.system, poolIndex: 0, owner: f.owner, account: f.account });
  const initial = await bridge.review(kind === 'TOP_UP'
    ? { requestId: 'lifecycle_original_01', kind, amount: '50', exitRecipient: '34'.repeat(20) }
    : { requestId: 'lifecycle_original_01', kind, role: 'source' });
  const handoff = await bridge.confirm(); assert.deepEqual(handoff, initial.request);
  const keeperPath = join(f.directory, 'flat-manual.vault');
  const keeper = await createFlatManualAccountKeeper({ runtime: f.runtime, system: f.system, poolIndex: 0, owner: f.owner,
    account: f.account, path: keeperPath, password: 'synthetic-keeper-password', onCheckpoint: keeperCheckpoint });
  t.after(() => keeper.close()); await keeper.prepare(handoff);
  return { f, keeper, handoff, initial, keeperPath, id: handoff.requestId };
}
for (const kind of ['TOP_UP', 'EXIT']) test(kind + ' expired original requires fresh one-use owner review and preserves exact identity/history', async t => {
  const { f, keeper, handoff, initial, id } = await lifecycle(t, { kind });
  f.timestamp = '6600';
  assert.deepEqual(await keeper.execute(id), { state: NDRA, generation: 0 });
  assert.equal(f.sendCalls, 0); assert.equal(proofControl.calls, 0);
  await assert.rejects(keeper.execute(id), /ORIGINAL_NOT_EXECUTABLE/);
  assert.equal(await keeper.confirmReauthorization(), false);
  const fresh = await keeper.reviewReauthorization(id);
  assert.equal(fresh.epoch, '11'); assert.equal(fresh.priorEpoch, '10'); assert.deepEqual(fresh.request, handoff);
  assert.equal(fresh.amount, initial.amount); assert.equal(fresh.recipient, initial.recipient);
  const pending = keeper.confirmReauthorization(); assert.equal(await keeper.confirmReauthorization(), false);
  assert.deepEqual(await pending, { state: 'PREPARED', generation: 1 });
  assert.equal(f.reauthorizeCalls, 1); assert.equal(f.sendCalls, 0); assert.equal(proofControl.calls, 0);
  const state = await f.ownerState(), manual = state.manualPreparations.records.find(r => r.review.request.requestId === id);
  assert.equal(state.manualPreparations.version, 2); assert.deepEqual(manual.review, initial);
  assert.deepEqual(manual.reauthorizations, [fresh]);
  const operation = state.operations[initial.ownerKind]; assert.equal(operation.epoch, '11'); assert.equal(operation.history[0].epoch, '10');
  const journal = await keeper.privateStatus(); assert.deepEqual(journal.requests[0].request.ownerOperationRef, handoff.ownerOperationRef);
  assert.equal(journal.requests[0].history.filter(e => e.phase === NDRA).length, 1);
  await f.restartSyntheticOwner(); await keeper.restartJournal();
  assert.equal(await keeper.confirmReauthorization(), false); assert.equal((await keeper.privateStatus()).pendingReview, null);
});
test('expiry during synthetic proof work produces a genuine durable no-dispatch receipt before the existing latch', async t => {
  const { f, keeper, id } = await lifecycle(t); proofControl.hook = async () => { f.timestamp = '6600'; };
  assert.deepEqual(await keeper.execute(id), { state: NDRA, generation: 0 });
  assert.equal(proofControl.calls, 1); assert.equal(f.sendCalls, 0);
  const authority = await f.account.privateStatus(); assert.equal(authority.operations[0].submission, null);
  assert.equal(authority.operations[0].manualLifecycle.noDispatch.reason, 'EPOCH_EXPIRED_BEFORE_ORIGINAL_SUBMISSION');
  assert.equal((await f.ownerState()).operations.deposit.submission, null);
});
test('counterfeit error text cannot manufacture no-dispatch provenance or reset UNKNOWN', async t => {
  const { f, keeper, id } = await lifecycle(t);
  proofControl.hook = async () => { throw Error('FLAT_ACCOUNT_MANUAL_EPOCH_REVIEW_REQUIRED'); };
  await assert.rejects(keeper.execute(id)); assert.equal((await keeper.privateStatus()).requests[0].phase, 'UNKNOWN');
  assert.deepEqual(await keeper.reconcileOriginal(id), { state: 'UNKNOWN', generation: 0 });
  await assert.rejects(keeper.reviewReauthorization(id)); assert.equal(f.reauthorizeCalls, 0); assert.equal(f.sendCalls, 0);
});
test('copied no-dispatch receipt and counterfeit keeper are rejected by genuine authority brands', async t => {
  const { f, keeper, id } = await lifecycle(t); f.timestamp = '6600'; await keeper.execute(id);
  const bound = (await keeper.privateStatus()).requests[0].request;
  const genuine = await f.account.manualLifecycle.observeOriginal({ keeper, request: bound });
  await assert.rejects(f.account.manualLifecycle.verifyReceipt({ keeper, receipt: { data: structuredClone(genuine.receipt.data) } }), /NO_DISPATCH_PROVENANCE/);
  await assert.rejects(f.account.manualLifecycle.verifyReceipt({ keeper: { ...keeper }, receipt: genuine.receipt }), /OWNED_MANUAL_KEEPER/);
  assert.throws(() => JSON.stringify(genuine.receipt), /NOT_SERIALIZABLE/); assert.equal(f.reauthorizeCalls, 0);
});
test('original authority submission persisted before owner latch excludes reauthorization even without dispatch', async t => {
  const { f, keeper, id } = await lifecycle(t); f.owner.owner.bindSubmission = async () => { throw Error('synthetic owner latch interruption'); };
  await assert.rejects(keeper.execute(id)); assert.equal(f.sendCalls, 0);
  const entry = (await f.account.privateStatus()).operations[0]; assert.ok(entry.submission); assert.equal(entry.submission.dispatchLatched, false);
  await assert.rejects(keeper.reconcileOriginal(id));
  await assert.rejects(keeper.reviewReauthorization(id)); assert.equal(f.reauthorizeCalls, 0);
});
test('after original owner/authority dispatch latch uncertainty stays UNKNOWN and cannot obtain a new epoch', async t => {
  const { f, keeper, id } = await lifecycle(t); await assert.rejects(keeper.execute(id)); assert.equal(f.sendCalls, 1);
  const entry = (await f.account.privateStatus()).operations[0]; assert.equal(entry.submission.dispatchLatched, true);
  assert.ok((await f.ownerState()).operations.deposit.submission);
  f.timestamp = '6600'; await assert.rejects(keeper.reconcileOriginal(id));
  await assert.rejects(keeper.reviewReauthorization(id)); assert.equal(f.reauthorizeCalls, 0);
});
test('legacy generic authority execution cannot bypass the original private keeper', async t => {
  const { f, keeper, id } = await lifecycle(t); const bound = (await keeper.privateStatus()).requests[0].request;
  await assert.rejects(f.account.authority.execute(bound), /MANUAL_KEEPER_REQUIRED/);
  assert.equal(f.sendCalls, 0); assert.equal(proofControl.calls, 0);
});
test('epoch crossing while a fresh review awaits confirmation consumes it without renewal and permits a new review', async t => {
  const { f, keeper, id } = await lifecycle(t); f.timestamp = '6600'; await keeper.execute(id);
  const old = await keeper.reviewReauthorization(id); f.timestamp = '7200';
  assert.deepEqual(await keeper.confirmReauthorization(), { state: NDRA, generation: 0 });
  assert.equal(f.reauthorizeCalls, 0); assert.equal(await keeper.confirmReauthorization(), false);
  const fresh = await keeper.reviewReauthorization(id); assert.equal(fresh.epoch, '12'); assert.equal(old.epoch, '11');
  assert.deepEqual(await keeper.confirmReauthorization(), { state: 'PREPARED', generation: 1 });
  assert.equal(f.sendCalls, 0); assert.equal(f.reauthorizeCalls, 1);
});
test('another ordinary expiry requires another distinct manual review, never stored consent', async t => {
  const { f, keeper, id } = await lifecycle(t); f.timestamp = '6600'; await keeper.execute(id);
  await keeper.reviewReauthorization(id); await keeper.confirmReauthorization();
  f.timestamp = '7200'; assert.deepEqual(await keeper.execute(id), { state: NDRA, generation: 1 });
  assert.equal(await keeper.confirmReauthorization(), false); const next = await keeper.reviewReauthorization(id);
  assert.equal(next.revision, 2); assert.equal(next.priorEpoch, '11'); await keeper.confirmReauthorization();
  assert.equal((await f.ownerState()).manualPreparations.records[0].reauthorizations.length, 2);
  assert.equal(f.sendCalls, 0); assert.equal(f.reauthorizeCalls, 2);
});
test('cancel and journal reopening discard volatile consent; unknown request/reference cannot replace original', async t => {
  const { f, keeper, id, handoff } = await lifecycle(t); f.timestamp = '6600'; await keeper.execute(id);
  await keeper.reviewReauthorization(id); assert.equal(keeper.cancelReview(), true); assert.equal(await keeper.confirmReauthorization(), false);
  await keeper.reviewReauthorization(id); await keeper.restartJournal(); assert.equal(await keeper.confirmReauthorization(), false);
  await assert.rejects(keeper.prepare({ ...handoff, requestId: 'replacement_original_01' }), /ORIGINAL_REFERENCE_ONLY/);
  await assert.rejects(keeper.prepare({ ...handoff, ownerOperationRef: h('replacement') }));
  assert.equal(f.reauthorizeCalls, 0);
});
test('changed amount, recipient, reference, account identity and prior authorization cannot reach owner renewal', async t => {
  const { f, keeper, id } = await lifecycle(t); f.timestamp = '6600'; await keeper.execute(id);
  const accepted = await keeper.reviewReauthorization(id), bound = (await keeper.privateStatus()).requests[0].request;
  const variants = [a => { a.amount = '51'; }, a => { a.recipient = '56'.repeat(20); },
    a => { a.request.ownerOperationRef = h('other'); }, a => { a.accountIdentitySHA256 = h('other account'); },
    a => { a.previousAuthorizationSHA256 = h('other generation'); }];
  for (const mutate of variants) {
    const changed = structuredClone(accepted); mutate(changed);
    await assert.rejects(f.account.manualLifecycle.reauthorize({ keeper, request: bound, authorization: changed }));
  }
  assert.equal(f.reauthorizeCalls, 0); assert.equal((await keeper.privateStatus()).requests[0].phase, NDRA);
});
function failVaultWrite(t, path, predicate, after) {
  const update = Vault.prototype.update; let failed = false;
  t.mock.method(Vault.prototype, 'update', async function(password, revision, transform) {
    if (this.path !== path || failed) return update.call(this, password, revision, transform);
    const current = await this.read(password), next = transform(structuredClone(current.data));
    if (!predicate(next)) return update.call(this, password, revision, () => next);
    failed = true;
    if (after) await update.call(this, password, revision, () => next);
    throw Error('synthetic authenticated write interruption');
  });
  return () => failed;
}
for (const after of [false, true]) test('authority no-dispatch journal failure ' + (after ? 'after' : 'before') + ' write never authorizes a new epoch', async t => {
  const { f, keeper, id } = await lifecycle(t); f.timestamp = '6600';
  const tripped = failVaultWrite(t, f.path, data => data.operations.some(e => e.manualLifecycle?.state === NDRA), after);
  await assert.rejects(keeper.execute(id)); assert.equal(tripped(), true);
  assert.equal((await keeper.privateStatus()).requests[0].phase, 'UNKNOWN');
  await assert.rejects(keeper.reconcileOriginal(id)); await assert.rejects(keeper.reviewReauthorization(id));
  assert.equal(f.reauthorizeCalls, 0); assert.equal(f.sendCalls, 0);
});
for (const after of [false, true]) test('keeper no-dispatch checkpoint failure ' + (after ? 'after' : 'before') + ' write retains only the exact candidate', async t => {
  let fail = true;
  const { f, keeper, id } = await lifecycle(t, { keeperCheckpoint: async cp => {
    if (fail && (after ? cp.pending === null && cp.acknowledged.revision === 4 : cp.pending?.revision === 4)) {
      fail = false; throw Error('synthetic keeper checkpoint loss');
    }
  } });
  f.timestamp = '6600'; await assert.rejects(keeper.execute(id)); assert.equal(f.reauthorizeCalls, 0);
  if (after) { await keeper.restartJournal(); assert.equal((await keeper.privateStatus()).requests[0].phase, NDRA);
    assert.equal(await keeper.confirmReauthorization(), false); }
  else await assert.rejects(keeper.restartJournal(), /ORIGINAL_CHECKPOINT_REQUIRED/);
  assert.equal(f.sendCalls, 0);
});
test('owner reauthorization write acknowledgement loss reconciles retained history without replaying owner mutation', async t => {
  const { f, keeper, id } = await lifecycle(t); f.timestamp = '6600'; await keeper.execute(id); await keeper.reviewReauthorization(id);
  let lost = false; f.ownerCheckpointHook = async cp => { if (!lost && !cp.pending && cp.acknowledged.revision === 3) { lost = true; throw Error('lost owner ack'); } };
  await assert.rejects(keeper.confirmReauthorization()); assert.equal(lost, true); assert.equal(f.reauthorizeCalls, 1);
  assert.equal((await keeper.privateStatus()).requests[0].phase, 'UNKNOWN');
  f.ownerCheckpointHook = async () => {}; await f.restartSyntheticOwner();
  assert.deepEqual(await keeper.reconcileOriginal(id), { state: 'PREPARED', generation: 1 });
  const state = await keeper.privateStatus(); assert.ok(state.requests[0].history.some(e => e.phase === 'UNKNOWN'));
  assert.equal(f.reauthorizeCalls, 1); assert.equal(f.sendCalls, 0); assert.equal(await keeper.confirmReauthorization(), false);
});
for (const after of [false, true]) test('authority reauthorization-completion journal failure ' + (after ? 'after' : 'before') + ' write never claims durable readiness', async t => {
  const { f, keeper, id } = await lifecycle(t); f.timestamp = '6600'; await keeper.execute(id); await keeper.reviewReauthorization(id);
  const tripped = failVaultWrite(t, f.path, data => data.operations.some(e => e.manualLifecycle?.state === 'PREPARED' && e.manualLifecycle.generation === 1), after);
  await assert.rejects(keeper.confirmReauthorization()); assert.equal(tripped(), true);
  assert.equal((await keeper.privateStatus()).requests[0].phase, 'UNKNOWN');
  await assert.rejects(keeper.reconcileOriginal(id)); assert.equal(f.reauthorizeCalls, 1); assert.equal(f.sendCalls, 0);
});
for (const after of [false, true]) test('keeper reauthorization-completion checkpoint loss ' + (after ? 'after' : 'before') + ' write never reuses consent', async t => {
  let armed = false;
  const { f, keeper, id } = await lifecycle(t, { keeperCheckpoint: async cp => {
    if (armed && (after ? cp.pending === null && cp.acknowledged.revision === 6 : cp.pending?.revision === 6)) {
      armed = false; throw Error('synthetic keeper completion loss');
    }
  } });
  f.timestamp = '6600'; await keeper.execute(id); await keeper.reviewReauthorization(id); armed = true;
  await assert.rejects(keeper.confirmReauthorization()); assert.equal(f.reauthorizeCalls, 1);
  if (after) { await keeper.restartJournal(); assert.equal((await keeper.privateStatus()).requests[0].phase, 'PREPARED');
    assert.equal(await keeper.confirmReauthorization(), false); }
  else await assert.rejects(keeper.restartJournal(), /ORIGINAL_CHECKPOINT_REQUIRED/);
  assert.equal(f.sendCalls, 0);
});
test('new keeper refuses an existing legacy journal and another live keeper without overwriting either', async t => {
  const { f, keeper, keeperPath } = await lifecycle(t), bytes = await readFile(keeperPath);
  await assert.rejects(createFlatManualAccountKeeper({ runtime: f.runtime, system: f.system, poolIndex: 0, owner: f.owner,
    account: f.account, path: keeperPath, password: 'synthetic-keeper-password', onCheckpoint: async () => {} }), /already exists/);
  assert.deepEqual(await readFile(keeperPath), bytes);
  await assert.rejects(createFlatManualAccountKeeper({ runtime: f.runtime, system: f.system, poolIndex: 0, owner: f.owner,
    account: f.account, path: join(f.directory, 'second-manual.vault'), password: 'synthetic-keeper-password', onCheckpoint: async () => {} }), /ALREADY_BOUND/);
  assert.equal((await keeper.privateStatus()).requests.length, 1);
});
import { createFlatAccountSession } from '../../../backend/src/api/accounts/flat-account-session.mjs';
import { WALLET_PROFILE, validateWalletState, projectWalletState, accountActionContext } from '../../../../apps/wallet/src/client/state/view-model.mjs';
test('real FlatAccountSession and wallet view model display typed stop safely and require separate manual reauthorization', async t => {
  const { f, keeper, id } = await lifecycle(t), session = await createFlatAccountSession({ keeper, ownerHandoff: { ownerView: f.account.ownerView } });
  const wallet = snapshot => ({ version: 1, profile: WALLET_PROFILE, connection: 'CONNECTED', nativeClaims: null,
    account: { snapshot }, capabilities: { nativeDeposit: false, nativeRedeem: false, nativeRefund: false, nativeReconcile: false, nativeResume: false, accountPrepare: true, accountExecute: true, accountReconcile: true, graphExecution: false },
    errors: { portfolio: null, nativeClaims: null, account: null },
    portfolio: { version: 1, status: 'LIVE', asset: f.account.registry[0], observed: { blockHash: h('fixture'), timestamp: '6000', blockNumber: '1', observedAt: 1 },
      balances: { available: '0', reserved: '0', recovery: '0', locked: '0' }, backing: { held: '0', liabilities: '0', surplus: '0', deficit: '0' },
      requests: [{ requestId: id, kind: 'TOP_UP', state: 'UNRESOLVED', disposition: null }] } });
  assert.equal((await session.snapshot()).requests[0].state, 'PREPARED');
  f.timestamp = '6600'; assert.equal(session.execute(id).admitted, true); await session.idle();
  const stopped = await session.snapshot(); assert.equal(stopped.phase, 'READY'); assert.equal(stopped.requests[0].state, 'UNKNOWN');
  assert.equal(stopped.requests[0].errorCode, 'FLAT_ACCOUNT_OWNER_REAUTHORIZATION_REQUIRED');
  const visible = validateWalletState(wallet(stopped));
  assert.equal(projectWalletState(visible).accountRequests[0].errorCode, 'FLAT_ACCOUNT_OWNER_REAUTHORIZATION_REQUIRED');
  assert.throws(() => accountActionContext({ data: visible, stale: false, portfolioStale: false }, 'accountExecute', { requestId: id }), /estado compatible/);
  assert.equal(accountActionContext({ data: visible, stale: false, portfolioStale: false }, 'accountReconcile', { requestId: id }).journalState, 'UNKNOWN');
  const revision = stopped.revision; session.reconcile(id); await session.idle(); assert.equal((await session.snapshot()).revision, revision);
  await keeper.reviewReauthorization(id); await keeper.confirmReauthorization();
  const ready = await session.snapshot(); assert.equal(ready.requests[0].state, 'PREPARED'); assert.equal(ready.requests[0].errorCode, null);
  assert.equal(accountActionContext({ data: wallet(ready), stale: false, portfolioStale: false }, 'accountExecute', { requestId: id }).journalState, 'PREPARED');
  session.restartCoordinator(); await session.idle(); assert.equal((await session.snapshot()).phase, 'READY');
  assert.equal(await keeper.confirmReauthorization(), false); assert.equal(f.sendCalls, 0);
});
