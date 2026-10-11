/** Real portfolio routing/receipt brands, mixed keeper and encrypted journal.
 * Child authorities are explicit synthetic original ports; no owner keys,
 * native nodes, proof acceptance, signing, dispatch or actual funds run. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { genericAccountIdentity, validateBoundRequest, immutable, sha } from '@lianum/engine/accounts/journal';
const accountBrands = new WeakMap(), systems = new WeakMap();
// Explicit synthetic registry/issuer ports. The keeper and its encrypted
// journal below are real; these ports do not claim financial recovery.
const retainedRegistries = new WeakMap(), retainedParts = new WeakMap(), reopenTokens = new WeakMap();
const checkpointEvents = [];
const url = p => new URL(p, import.meta.url).href;
mock.module(url('../wallet-platform/modules/global-state/flat-account-authority.mjs'), { exports: {
  assertOwnedFlatAccountAuthority(account, expected) {
    const b = accountBrands.get(account); assert.ok(b, 'SYNTHETIC_ORIGINAL_CHILD_REQUIRED');
    for (const key of Object.keys(expected ?? {})) assert.equal(b[key], expected[key]);
  },
} });
mock.module(url('../wallet-platform/modules/ops/deploy-system.mjs'), { exports: {
  assertOwnedFlatSystem(runtime, system) { assert.equal(systems.get(runtime), system); },
} });
// This suite supplies no poolAdmissions. Do not instantiate the unrelated
// chain/configuration dependency tree through that unused optional port.
mock.module(url('../wallet-platform/modules/global-state/flat-pool-admission-policy.mjs'), { exports: {
  assertOwnedFlatPoolAdmissionPolicy() { assert.fail('HOST_POOL_ADMISSIONS_NOT_SUPPLIED'); },
} });
mock.module(url('../wallet-platform/modules/native-claims/wrapped-private-lifetime-registry-v1.mjs'), { exports: {
  async retainWrappedPrivateLifetimeIndexedPartV1(runtime, family, identity, privateState) {
    assert.equal(family, 'wallet-catalogue-keeper'); assert.ok(!retainedRegistries.has(runtime));
    const handle = Object.freeze(Object.create(null)), part = { identity: structuredClone(identity), privateState: structuredClone(privateState), handle };
    retainedRegistries.set(runtime, part); retainedParts.set(handle, part); return handle;
  },
  async readWrappedPrivateLifetimeIndexedPartV1(runtime, family, identity) {
    assert.equal(family, 'wallet-catalogue-keeper'); const part = retainedRegistries.get(runtime); assert.ok(part);
    assert.deepEqual(part.identity, identity); return { privateState: structuredClone(part.privateState), handle: part.handle };
  },
  async updateWrappedPrivateLifetimePartV1(handle, privateState) {
    const part = retainedParts.get(handle); assert.ok(part);
    const actual = await new Vault(privateState.journal.path).read(privateState.journal.password), cp = privateState.checkpoint;
    assert.deepEqual({ revision: actual.revision, stateSHA256: sha(actual.data) }, cp.acknowledged);
    if (cp.pending !== null) assert.equal(cp.pending.revision, actual.revision + 1);
    checkpointEvents.push(cp.pending === null ? 'acknowledged' : 'before-write');
    part.privateState = structuredClone(privateState);
  },
  assertWrappedPrivateLifetimePartSealedV1(handle) { assert.ok(retainedParts.has(handle)); },
} });
mock.module(url('../wallet-platform/modules/global-state/external-defi-catalogue-recovery-v1.mjs'), { exports: {
  consumeExternalDefiCatalogueKeeperReopenV1(token) {
    const entry = reopenTokens.get(token); assert.ok(entry && !entry.used, 'SYNTHETIC_ORIGINAL_ONE_USE_TOKEN_REQUIRED');
    entry.used = true; return entry.value;
  },
} });
const { createFlatPortfolioAuthority, assertOwnedFlatPortfolioAccount } = await import('../../../backend/src/accounts/authority/flat-portfolio-authority.mjs');
const { createFlatManualPortfolioKeeper, assertOwnedFlatManualPortfolioKeeper,
  createRetainedFlatManualPortfolioKeeperV1, captureRetainedFlatManualPortfolioKeeperV1,
  reopenRetainedFlatManualPortfolioKeeperV1, assertRetainedFlatManualPortfolioKeeperIdentityV1,
} = await import('../../../backend/src/accounts/portfolio/flat-manual-portfolio-keeper.mjs');
const { createFlatAccountSession } = await import('@lianum/backend/accounts/session');
const h = n => Number(n).toString(16).padStart(64, '0'), clone = x => structuredClone(x), NDRA = 'NO_DISPATCH_REAUTHORIZATION_REQUIRED';
function child(runtime, system, poolIndex, restored = null) {
  const asset = { assetId: h(10 + poolIndex), kind: 'NATIVE', symbol: poolIndex ? 'ETHB' : 'ETHA', decimals: 18,
    chainId: '31337', genesis: h(1), pool: String(poolIndex + 1).repeat(40), scope: h(20 + poolIndex), policy: h(30),
    token: '0'.repeat(40), codeHash: h(40 + poolIndex), assetIdentity: h(50), custody: 'ONCHAIN_NOTE_POOL', trust: 'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER' };
  const config = { accountId: 'child_account_0' + poolIndex, journalId: 'child_journal_0' + poolIndex, lifetime: h(60 + poolIndex), registry: [asset] };
  const entries = new Map(restored ? clone(restored.entries) : []), receipts = new WeakSet(); let root = null, epoch = restored?.epoch ?? '10', offline = false, failGraph = false, failRecovery = false, fakeGraphReceipt = false;
  const calls = { prepare: 0, execute: 0, reconcile: 0, recover: 0, recoveryEffects: 0, reauthorize: 0, ownerView: 0 };
  function linked(keeper) { assert.equal(keeper, root, 'SYNTHETIC_ORIGINAL_ROOT_REQUIRED'); }
  function original(request) { validateBoundRequest(request, config); const e = entries.get(request.ownerOperationRef); assert.ok(e);
    for (const k of ['requestId', 'kind', 'assetId', 'ownerOperationRef']) assert.equal(e.body[k], request[k]);
    if (e.request) assert.deepEqual(e.request, request); return e; }
  function outcome(e, disposition = 'APPLIED') { return { version: 1, state: 'CONFIRMED', bindingSHA256: e.request.bindingSHA256,
    assetBindingSHA256: e.request.assetBindingSHA256, outcomeId: h(200 + poolIndex), disposition, blockNumber: '1', blockHash: h(201) }; }
  function receipt(e, type) {
    const data = immutable({ version: 1, type, ownerIdentitySHA256: h(100 + poolIndex), accountIdentitySHA256: sha(genericAccountIdentity(config)),
      request: e.request, generation: e.generation, epoch: e.epoch, authorizationSHA256: e.authorizationSHA256,
      evidence: type === NDRA ? e.noDispatch : e.lastAuthorization ? { authorization: e.lastAuthorization, previousNoDispatch: e.previousNoDispatch } : null });
    const value = Object.freeze({ data }); receipts.add(value); return value;
  }
  const manualLifecycle = {
    assertCanBindPortfolioKeeper({ keeper, portfolio }) {
      assertOwnedFlatManualPortfolioKeeper(keeper, { runtime, portfolio }); assertOwnedFlatPortfolioAccount(portfolio, account);
      assert.ok(root === null || root === keeper);
      if (root === null && [...entries.values()].some(e => e.request !== null)) {
        assert.ok(restored); assertRetainedFlatManualPortfolioKeeperIdentityV1(keeper, restored.keeperSaved);
      } else assert.ok([...entries.values()].every(e => e.request === null) || root === keeper);
    },
    bindPortfolioKeeper(input) { this.assertCanBindPortfolioKeeper(input); root = input.keeper; },
    async prepare({ keeper, request }) { linked(keeper); const e = original(request); assert.ok(['TOP_UP', 'EXIT'].includes(request.kind)); e.request = request; calls.prepare++; },
    async execute({ keeper, request, generation }) {
      linked(keeper); const e = original(request); assert.equal(e.generation, generation); assert.ok(!offline); calls.execute++;
      if (epoch !== e.epoch) {
        e.state = NDRA;
        e.noDispatch = { version: 1, profile: 'FLAT_MANUAL_NO_DISPATCH_V1', bindingSHA256: request.bindingSHA256,
          ownerIdentitySHA256: h(100 + poolIndex), accountIdentitySHA256: sha(genericAccountIdentity(config)), generation,
          authorizationSHA256: e.authorizationSHA256, epoch: e.epoch, observedEpoch: epoch, reason: 'EPOCH_EXPIRED_BEFORE_ORIGINAL_SUBMISSION' };
        return { type: NDRA, receipt: receipt(e, NDRA) };
      }
      e.state = 'CONFIRMED'; e.outcome = outcome(e); return { type: 'CONFIRMED', outcome: e.outcome };
    },
    async observeOriginal({ keeper, request }) { linked(keeper); const e = original(request); calls.reconcile++;
      if (e.outcome) return { type: 'CONFIRMED', outcome: e.outcome };
      if ([NDRA, 'PREPARED'].includes(e.state)) return { type: e.state, receipt: receipt(e, e.state) };
      return { type: 'UNKNOWN', receipt: null }; },
    async verifyReceipt({ keeper, receipt: value }) { linked(keeper); assert.ok(receipts.has(value), 'SYNTHETIC_ORIGINAL_RECEIPT_REQUIRED');
      const e = original(value.data.request); assert.equal(e.state, value.data.type); assert.deepEqual(receipt(e, e.state).data, value.data); return value.data; },
    async reviewReauthorization({ keeper, request }) { linked(keeper); assert.ok(!offline); const e = original(request); assert.equal(e.state, NDRA);
      return immutable({ version: 1, profile: 'FLAT_MANUAL_EPOCH_REAUTHORIZATION_V1', revision: e.generation + 1, request: e.body,
        ownerIdentitySHA256: h(100 + poolIndex), accountIdentitySHA256: sha(genericAccountIdentity(config)), amount: '50', recipient: '34'.repeat(20),
        role: request.kind === 'EXIT' ? 'source' : null, priorEpoch: e.epoch, epoch, observed: { blockHash: h(101), timestamp: String(BigInt(epoch) * 600n) },
        previousAuthorizationSHA256: e.authorizationSHA256 }); },
    async reauthorize({ keeper, request, authorization }) { linked(keeper); assert.ok(!offline); const e = original(request); assert.equal(e.state, NDRA);
      assert.equal(authorization.accountIdentitySHA256, sha(genericAccountIdentity(config))); assert.deepEqual(authorization.request, e.body);
      assert.equal(authorization.previousAuthorizationSHA256, e.authorizationSHA256); assert.equal(authorization.epoch, epoch);
      calls.reauthorize++; e.previousNoDispatch = e.noDispatch; e.noDispatch = null; e.generation++; e.epoch = authorization.epoch;
      e.lastAuthorization = authorization; e.authorizationSHA256 = sha(authorization); e.state = 'PREPARED';
      return { type: 'PREPARED', receipt: receipt(e, 'PREPARED') }; },
    async graphPrepare({ keeper, request }) { linked(keeper); const e = original(request); assert.equal(request.kind, 'GRAPH'); e.request = request; calls.prepare++; return { version: 1, state: 'PREPARED', bindingSHA256: request.bindingSHA256, assetBindingSHA256: request.assetBindingSHA256 }; },
    async graphExecute({ keeper, request }) { linked(keeper); const e = original(request); assert.equal(request.kind, 'GRAPH'); calls.execute++;
      if (fakeGraphReceipt) return { type: NDRA, receipt: {} };
      if (failGraph) { e.state = 'UNKNOWN'; throw Error('synthetic original partial graph effect'); }
      e.outcome = outcome(e); e.state = 'CONFIRMED'; return e.outcome; },
    async graphReconcile({ keeper, request }) { linked(keeper); const e = original(request); assert.equal(request.kind, 'GRAPH'); calls.reconcile++;
      assert.ok(e.outcome, 'SYNTHETIC_ORIGINAL_GRAPH_UNRESOLVED'); return e.outcome; },
    async graphRecover({ keeper, request }) { linked(keeper); const e = original(request); assert.equal(request.kind, 'GRAPH'); calls.recover++;
      if (failRecovery) { e.state = 'RECOVERING'; throw Error('synthetic recovery still unresolved'); }
      if (!e.outcome) { e.outcome = outcome(e, 'RECOVERED'); calls.recoveryEffects++; } e.state = 'CONFIRMED'; return e.outcome; },
  };
  const account = Object.freeze({ config, registry: config.registry, assetId: asset.assetId, manualLifecycle: Object.freeze(manualLifecycle),
    authority: Object.freeze({ async observe({ request, outcome: o, challenge }) { const e = original(request); assert.deepEqual(o, e.outcome);
      return { version: 1, status: 'LIVE', bindingSHA256: request.bindingSHA256, assetBindingSHA256: request.assetBindingSHA256,
        outcomeId: o.outcomeId, challenge, observedAt: Date.now(), blockNumber: '2', blockHash: h(202), canonicalOutcomeBlockHash: o.blockHash,
        backing: { held: '100', liabilities: '100', surplus: '0', deficit: '0' } }; } }),
    async ownerView() { calls.ownerView++; return { asset, observed: null, status: 'UNAVAILABLE', requests: [] }; },
    async abort() {},
  });
  accountBrands.set(account, { runtime, system, poolIndex });
  return { account, asset, calls, get root() { return root; }, set epoch(v) { epoch = v; }, set offline(v) { offline = v; },
    retainedForHost(keeperSaved) { return { entries: clone([...entries]), epoch, keeperSaved }; },
    set failGraph(v) { failGraph = v; }, set failRecovery(v) { failRecovery = v; }, set fakeGraphReceipt(v) { fakeGraphReceipt = v; },
    register(kind, suffix) { const body = { requestId: 'original_' + suffix + '_01', kind, ownerOperationRef: h(300 + entries.size + poolIndex * 10), assetId: asset.assetId };
      entries.set(body.ownerOperationRef, { body, request: null, generation: 0, epoch: '10', state: 'PREPARED', authorizationSHA256: h(400 + entries.size),
        noDispatch: null, lastAuthorization: null, previousNoDispatch: null, outcome: null }); return body; } };
}
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'mixed-portfolio-test-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const runtime = {}, system = { bootstrap: 'synthetic_original_system' }; systems.set(runtime, system);
  const source = child(runtime, system, 0), target = child(runtime, system, 1), accounts = [{ poolIndex: 0, account: source.account }, { poolIndex: 1, account: target.account }];
  const portfolio = createFlatPortfolioAuthority({ runtime, system, accounts, accountId: 'mixed_original_account', journalId: 'mixed_original_journal' });
  const path = join(directory, 'one-portfolio.vault');
  const keeper = await createFlatManualPortfolioKeeper({ runtime, portfolio, journal: { path, password: 'synthetic-mixed-password' } }); t.after(() => keeper.close());
  return { runtime, system, accounts, portfolio, keeper, source, target, directory, path };
}
test('one genuine mixed keeper owns both child authorities and one journal for GRAPH plus target EXIT', async t => {
  const f = await setup(t); assert.equal(f.source.root, f.keeper); assert.equal(f.target.root, f.keeper);
  assertOwnedFlatManualPortfolioKeeper(f.keeper, { runtime: f.runtime, portfolio: f.portfolio });
  const graph = f.source.register('GRAPH', 'graph'), exit = f.target.register('EXIT', 'exit');
  await f.keeper.prepare(graph); await f.keeper.prepare(exit);
  const before = await f.keeper.privateStatus(); assert.equal(before.version, 3); assert.equal(before.requests.length, 2);
  assert.notEqual(before.requests[0].request.bindingSHA256, before.requests[1].request.bindingSHA256);
  await f.keeper.execute(graph.requestId); await f.keeper.execute(exit.requestId);
  const done = await f.keeper.snapshot(); assert.deepEqual(done.requests.map(r => r.state), ['CONFIRMED', 'CONFIRMED']);
  assert.equal(f.source.calls.execute, 1); assert.equal(f.target.calls.execute, 1);
  const bytes = await readFile(f.path); await f.keeper.execute(graph.requestId); await f.keeper.reconcile(exit.requestId);
  assert.deepEqual(await readFile(f.path), bytes); assert.equal(f.source.calls.execute, 1); assert.equal(f.target.calls.execute, 1);
});
test('child no-dispatch and reauthorization retain original child identity while outer request remains bound', async t => {
  const f = await setup(t), request = f.target.register('EXIT', 'renewal'); await f.keeper.prepare(request); f.target.epoch = '11';
  assert.deepEqual(await f.keeper.execute(request.requestId), { state: NDRA, generation: 0 });
  const row = (await f.keeper.privateStatus()).requests[0], evidence = row.noDispatch;
  assert.equal(evidence.accountIdentitySHA256, sha(genericAccountIdentity(f.portfolio.config)));
  assert.equal(evidence.childBinding.accountIdentitySHA256, sha(genericAccountIdentity(f.target.account.config)));
  assert.notEqual(evidence.request.bindingSHA256, evidence.childBinding.requestBindingSHA256);
  assert.equal(evidence.evidence.bindingSHA256, evidence.childBinding.requestBindingSHA256);
  const review = await f.keeper.reviewReauthorization(request.requestId);
  assert.equal(review.accountIdentitySHA256, evidence.childBinding.accountIdentitySHA256); assert.deepEqual(review.request, request);
  assert.deepEqual(await f.keeper.confirmReauthorization(), { state: 'PREPARED', generation: 1 });
  assert.equal(f.target.calls.reauthorize, 1); assert.equal(f.source.calls.reauthorize, 0);
  await f.keeper.restartCoordinator(); assert.equal(await f.keeper.confirmReauthorization(), false);
});
test('GRAPH partial failure and original recovery retain generic semantics without owner epoch/reset access', async t => {
  const f = await setup(t), graph = f.source.register('GRAPH', 'recover'); await f.keeper.prepare(graph); f.source.failGraph = true;
  await assert.rejects(f.keeper.execute(graph.requestId)); assert.equal((await f.keeper.snapshot()).requests[0].state, 'UNKNOWN');
  f.source.offline = true; f.source.failRecovery = true;
  await assert.rejects(f.keeper.recover(graph.requestId)); assert.equal((await f.keeper.snapshot()).requests[0].state, 'RECOVERING');
  await assert.rejects(f.keeper.reviewReauthorization(graph.requestId), /GRAPH_REAUTHORIZATION_FORBIDDEN/);
  f.source.failRecovery = false; await f.keeper.recover(graph.requestId);
  assert.equal((await f.keeper.snapshot()).requests[0].state, 'CONFIRMED');
  const row = (await f.keeper.privateStatus()).requests[0]; assert.equal(row.outcome.disposition, 'RECOVERED'); assert.equal(row.generation, 0);
  assert.equal(row.noDispatch, null); assert.equal(row.pendingReauthorization, null); assert.equal(f.source.calls.reauthorize, 0);
  assert.ok(row.history.some(e => e.phase === 'UNKNOWN')); assert.ok(row.history.some(e => e.phase === 'RECOVERING'));
  await f.keeper.recover(graph.requestId); assert.equal(f.source.calls.recoveryEffects, 1); assert.equal(f.source.calls.execute, 1);
});
test('counterfeit GRAPH no-effect result stays UNKNOWN and never becomes a note reauthorization', async t => {
  const f = await setup(t), graph = f.source.register('GRAPH', 'fake'); await f.keeper.prepare(graph); f.source.fakeGraphReceipt = true;
  await assert.rejects(f.keeper.execute(graph.requestId)); assert.equal((await f.keeper.snapshot()).requests[0].state, 'UNKNOWN');
  await assert.rejects(f.keeper.reviewReauthorization(graph.requestId), /GRAPH_REAUTHORIZATION_FORBIDDEN/);
  assert.equal(f.source.calls.reauthorize, 0);
});
test('outer/child receipt changes and copied receipt/keeper capabilities cannot establish no-dispatch', async t => {
  const f = await setup(t), request = f.source.register('TOP_UP', 'receipt'); await f.keeper.prepare(request); f.source.epoch = '11'; await f.keeper.execute(request.requestId);
  const row = (await f.keeper.privateStatus()).requests[0];
  const genuine = await f.portfolio.manualLifecycle.observeOriginal({ keeper: f.keeper, request: row.request });
  await assert.rejects(f.portfolio.manualLifecycle.verifyReceipt({ keeper: f.keeper, receipt: { data: clone(genuine.receipt.data) } }), /ORIGINAL_RECEIPT_REQUIRED/);
  await assert.rejects(f.portfolio.manualLifecycle.verifyReceipt({ keeper: { ...f.keeper }, receipt: genuine.receipt }), /OWNED_MANUAL_KEEPER/);
  for (const mutate of [x => { x.childBinding.poolIndex = 1; }, x => { x.childBinding.requestBindingSHA256 = h(777); },
    x => { x.accountIdentitySHA256 = h(778); }, x => { x.request.ownerOperationRef = h(779); }]) {
    const forged = clone(genuine.receipt.data); mutate(forged); assert.throws(() => f.portfolio.manualLifecycle.validateStoredReceiptData(forged, row.request));
  }
  assert.equal(f.source.calls.reauthorize, 0);
});
test('a second portfolio/journal cannot claim the same child authorities even after the original keeper closes', async t => {
  const f = await setup(t); f.keeper.close();
  const other = createFlatPortfolioAuthority({ runtime: f.runtime, system: f.system, accounts: f.accounts, accountId: 'other_mixed_account', journalId: 'other_mixed_journal' });
  await assert.rejects(createFlatManualPortfolioKeeper({ runtime: f.runtime, portfolio: other,
    journal: { path: join(f.directory, 'second.vault'), password: 'synthetic-mixed-password' } }), /AUTHORITY_ALREADY_CLAIMED/);
});
test('one journal rejects duplicate original request/reference across source and target assets', async t => {
  const f = await setup(t), first = f.source.register('TOP_UP', 'unique'), second = f.target.register('EXIT', 'unique_target');
  await f.keeper.prepare(first);
  await assert.rejects(f.keeper.prepare({ ...second, requestId: first.requestId }));
  await assert.rejects(f.keeper.prepare({ ...second, ownerOperationRef: first.ownerOperationRef }), /ORIGINAL_REFERENCE_ONLY/);
  assert.equal(f.target.calls.prepare, 0);
});
test('real FlatAccountSession accepts mixed original states, recovery and same-keeper restart', async t => {
  const f = await setup(t), graph = f.source.register('GRAPH', 'session');
  const session = await createFlatAccountSession({ keeper: f.keeper, ownerHandoff: { ownerView: () => f.portfolio.ownerView() } });
  session.prepare(graph); await session.idle(); f.source.failGraph = true;
  session.execute(graph.requestId); await session.idle(); assert.equal((await session.snapshot()).requests[0].state, 'UNKNOWN');
  f.source.offline = true; session.recover(graph.requestId); await session.idle(); assert.equal((await session.snapshot()).requests[0].state, 'CONFIRMED');
  const before = await readFile(f.path); session.restartCoordinator(); await session.idle();
  assert.equal((await session.snapshot()).phase, 'READY'); assert.deepEqual(await readFile(f.path), before);
});
import { Vault } from '@lianum/engine/crypto/vault';
test('existing legacy journal is never overwritten and failed creation retains its one-time child lease', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'mixed-legacy-test-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const runtime = {}, system = { bootstrap: 'legacy_fixture' }; systems.set(runtime, system); const source = child(runtime, system, 0);
  const portfolio = createFlatPortfolioAuthority({ runtime, system, accounts: [{ poolIndex: 0, account: source.account }],
    accountId: 'legacy_root_account', journalId: 'legacy_root_journal' });
  const path = join(directory, 'legacy.vault'); await new Vault(path).create({ version: 1, profile: 'LEGACY_FIXTURE_DO_NOT_ADOPT', retained: true }, 'synthetic-existing-password');
  const before = await readFile(path);
  await assert.rejects(createFlatManualPortfolioKeeper({ runtime, portfolio, journal: { path, password: 'synthetic-existing-password' } }), /already exists/);
  assert.deepEqual(await readFile(path), before);
  await assert.rejects(createFlatManualPortfolioKeeper({ runtime, portfolio,
    journal: { path: join(directory, 'replacement.vault'), password: 'synthetic-existing-password' } }), /AUTHORITY_ALREADY_CLAIMED/);
  assert.equal(source.root, null);
});
test('retained V3 journal reopens only its checkpoint, reconciles original state and requires a new review', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'retained-portfolio-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runtime = {}, system = { bootstrap: 'synthetic_original_retained_system' }; systems.set(runtime, system); const original = child(runtime, system, 0);
  const config = { accountId: 'retained_root_account', journalId: 'retained_root_journal' };
  const portfolio = createFlatPortfolioAuthority({ runtime, system, accounts: [{ poolIndex: 0, account: original.account }], ...config });
  const journal = { path: join(directory, 'original.vault'), password: 'synthetic-retained-password' };
  checkpointEvents.length = 0;
  const keeper = await createRetainedFlatManualPortfolioKeeperV1({ runtime, portfolio, journal });
  const request = original.register('EXIT', 'retained'); await keeper.prepare(request); original.epoch = '11';
  await keeper.execute(request.requestId); await keeper.reviewReauthorization(request.requestId);
  const before = await readFile(journal.path), saved = await captureRetainedFlatManualPortfolioKeeperV1(keeper);
  assert.equal(saved.checkpoint.pending, null); assert.deepEqual(await readFile(journal.path), before);
  assert.throws(() => assertOwnedFlatManualPortfolioKeeper(keeper), /OWNED_MANUAL_KEEPER_REQUIRED/);
  await assert.rejects(keeper.execute(request.requestId), /BUSY/);

  function successor(checkpoint, previous = original) {
    const nextRuntime = {}, nextSystem = { bootstrap: system.bootstrap }; systems.set(nextRuntime, nextSystem);
    const current = child(nextRuntime, nextSystem, 0, previous.retainedForHost(checkpoint));
    const nextPortfolio = createFlatPortfolioAuthority({ runtime: nextRuntime, system: nextSystem,
      accounts: [{ poolIndex: 0, account: current.account }], ...config });
    const handle = Object.freeze(Object.create(null)), part = { identity: { profile: 'EXTERNAL_FLAT_MANUAL_KEEPER_LIFETIME_V1',
      identity: genericAccountIdentity(checkpoint.config) }, privateState: { config: checkpoint.config,
      journal: checkpoint.journal, checkpoint: checkpoint.checkpoint }, handle };
    retainedRegistries.set(nextRuntime, part); retainedParts.set(handle, part);
    const token = Object.freeze(Object.create(null)); reopenTokens.set(token, { used: false,
      value: { input: { runtime: nextRuntime, portfolio: nextPortfolio, journal: checkpoint.journal }, saved: checkpoint } });
    return { current, token };
  }
  const next = successor(saved);
  await assert.rejects(reopenRetainedFlatManualPortfolioKeeperV1({ ...next.token }), /ONE_USE_TOKEN_REQUIRED/);
  const opened = await reopenRetainedFlatManualPortfolioKeeperV1(next.token);
  assert.notEqual(opened, keeper); t.after(() => opened.close());
  assertRetainedFlatManualPortfolioKeeperIdentityV1(opened, saved);
  assert.throws(() => assertRetainedFlatManualPortfolioKeeperIdentityV1({ ...opened }, saved), /OWNED_MANUAL_KEEPER_REQUIRED/);
  await assert.rejects(reopenRetainedFlatManualPortfolioKeeperV1(next.token), /ONE_USE_TOKEN_REQUIRED/);
  assert.equal(await opened.confirmReauthorization(), false);
  assert.equal((await opened.privateStatus()).pendingReview, null);
  assert.equal((await opened.snapshot()).requests[0].errorCode, 'FLAT_MANUAL_ORIGINAL_RECONCILIATION_REQUIRED');
  await assert.rejects(opened.execute(request.requestId), /ORIGINAL_RECONCILIATION_REQUIRED/);
  await assert.rejects(opened.reviewReauthorization(request.requestId), /ORIGINAL_RECONCILIATION_REQUIRED/);
  assert.equal(next.current.calls.execute, 0); assert.equal(next.current.calls.reauthorize, 0);
  await opened.reconcileOriginal(request.requestId);
  assert.ok(next.current.calls.reconcile > 0); assert.deepEqual(await readFile(journal.path), before);
  assert.equal(await opened.confirmReauthorization(), false);
  await opened.reviewReauthorization(request.requestId); await opened.confirmReauthorization();
  await opened.execute(request.requestId);
  const done = (await opened.privateStatus()).requests[0];
  assert.equal(done.phase, 'CONFIRMED'); assert.equal(done.generation, 1);
  assert.equal(next.current.calls.reauthorize, 1); assert.equal(next.current.calls.execute, 1);
  for (let i = 0; i < checkpointEvents.length; i++) if (checkpointEvents[i] === 'before-write') assert.equal(checkpointEvents[++i], 'acknowledged');
  const terminalSaved = await captureRetainedFlatManualPortfolioKeeperV1(opened), terminal = successor(terminalSaved, next.current);
  const terminalKeeper = await reopenRetainedFlatManualPortfolioKeeperV1(terminal.token); t.after(() => terminalKeeper.close());
  const terminalBytes = await readFile(journal.path);
  await assert.rejects(terminalKeeper.execute(request.requestId), /ORIGINAL_RECONCILIATION_REQUIRED/);
  await terminalKeeper.reconcileOriginal(request.requestId); await terminalKeeper.execute(request.requestId);
  assert.ok(terminal.current.calls.reconcile > 0); assert.equal(terminal.current.calls.execute, 0);
  assert.deepEqual(await readFile(journal.path), terminalBytes);
  const finalSaved = await captureRetainedFlatManualPortfolioKeeperV1(terminalKeeper);
  const actual = await new Vault(journal.path).read(journal.password);
  await new Vault(journal.path).update(journal.password, actual.revision, data => data);
  const tampered = successor(finalSaved, terminal.current);
  await assert.rejects(reopenRetainedFlatManualPortfolioKeeperV1(tampered.token), /ORIGINAL_CHECKPOINT_REQUIRED/);
  assert.equal(tampered.current.root, null); assert.equal(tampered.current.calls.execute, 0);
});
