/** Two fixed genuine acceptance workers. Importing starts nothing. Both remain
 * source-disabled; the second additionally requires a reviewed successful first
 * receipt. Uses the original mixed keeper, catalogue, owner, HTTP and Node SDK. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, lstatSync, mkdirSync, writeFileSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from '../proof-workers/catalog.mjs';
import { POOL_GENERATION_PHASE1_RELEASE, POOL_GENERATION_PHASE2_RELEASE, PHASE1_FORMAT, PHASE2_FORMAT,
  POOL_GENERATION_LIMITS, assertPoolGenerationPhase1Result, assertPoolGenerationPhase2Result } from './pool-generation-acceptance-policy.mjs';
import { NATIVE_FLOW_LIMITS } from './native-flow-supervisor.mjs';
import { poolGenerationSourcePins } from './pool-generation-source-pins.mjs';
import { createOwnedPoolGenerationFixture } from './pool-generation-fixture.mjs';
import { retainedOriginalPoolFacts, registrySnapshot, verifyPoolGenerationRuntimeClosure, verifyRetainedProspectivePool, checkAppendOnlyRejections }
  from './pool-generation-checks.mjs';
import { appendFlatPoolSuccessor, describeOwnedFlatPoolRegistry } from '../wallet-platform/modules/ops/deploy-system.mjs';
import { loadBackedAssetDeploymentArtifacts } from '../wallet-platform/modules/ops/deploy-backed-assets.mjs';
import { nativeStaticCalldata } from '../../../omnichain-product/src/paeg/native-deployment.mjs';
import { createFlatNativeExecution } from '../wallet-platform/modules/paeg/flat-native-execution.mjs';
import { createFlatJournalCatalogue, closeUnattachedFlatJournalGeneration } from '../wallet-platform/modules/global-state/flat-journal-catalogue.mjs';
import { createFlatManualGraphCatalogueSession } from '../wallet-platform/modules/api/flat-manual-graph-session.mjs';
import { startWalletApplication } from '../wallet-app/server.mjs';
import { createManualWalletAppDriver } from './manual-wallet-app-driver.mjs';
import { freshFixtureId, fixtureJSON, writeFixturePrivate } from './owned-flat-fixture.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bare = value => value.slice(2);
const safeCode = error => /^[A-Z][A-Z0-9_]{2,160}$/.test(error?.code ?? error?.message ?? '')
  ? error.code ?? error.message : 'POOL_GENERATION_ACCEPTANCE_FAILED';
const releaseDigest = value => assert.match(value, /^[0-9a-f]{64}$/, 'POOL_GENERATION_REVIEWED_CHECKPOINT_REQUIRED');

export async function runPoolGenerationPhase1() {
  assert.equal(arguments.length, 0); assert.ok(POOL_GENERATION_PHASE1_RELEASE, 'POOL_GENERATION_PHASE1_NOT_RELEASED');
  releaseDigest(POOL_GENERATION_PHASE1_RELEASE); return run(1);
}
export async function runPoolGenerationPhase2() {
  assert.equal(arguments.length, 0); assert.ok(POOL_GENERATION_PHASE2_RELEASE, 'POOL_GENERATION_PHASE2_NOT_RELEASED');
  verifyPriorPhase1(); return run(2);
}
function verifyPriorPhase1() {
  // Only a separately reviewed SOURCE literal may name the exact earlier
  // successful attempt. No CLI/path/env selection or "latest" alias exists.
  const release = POOL_GENERATION_PHASE2_RELEASE;
  assert.deepEqual(Object.keys(release).sort(), ['checkpointSHA256', 'phase1Attempt', 'phase1ResourcesSHA256', 'phase1ResultSHA256'].sort());
  for (const key of ['checkpointSHA256', 'phase1ResourcesSHA256', 'phase1ResultSHA256']) releaseDigest(release[key]);
  assert.match(release.phase1Attempt, /^attempt-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  function read(name, digest) {
    const file = join(ROOT, '.local/pool-generation-phase1', release.phase1Attempt, name);
    assert.equal(realpathSync(file), file); assert.ok(lstatSync(file).isFile());
    const bytes = readFileSync(file); assert.equal(sha(bytes), digest); return JSON.parse(bytes);
  }
  const prior = read('result.json', release.phase1ResultSHA256);
  const resources = read('resources.json', release.phase1ResourcesSHA256);
  assertPoolGenerationPhase1Result(prior);
  assert.equal(resources.format, 'FLAT_POOL_GENERATION_PHASE1_RESOURCES_V1');
  assert.equal(resources.phase, 'completed'); assert.equal(resources.failure, null);
  assert.equal(resources.resultAccepted, true); assert.equal(resources.ownedGroupCleanupConfirmed, true);
  assert.equal(resources.workerExit?.code, 0); assert.equal(resources.workerExit?.signal, null);
  assert.equal(resources.lockReleased, true); assert.equal(resources.runId, prior.runId);
  assert.deepEqual(resources.sourcePins, prior.sourcePins);
  assert.equal(prior.artifacts.compilerOutputSHA256, '8d7c19bdd8c52df50eb527a3f0edf80e4e6071c89ed4ec1b94eeef70299c6c02');
}
async function run(phase) {
  assert.ok(phase === 1 || phase === 2);
  assert.equal(process.argv.length, 2); assert.deepEqual(process.execArgv, []);
  assert.equal(realpathSync(process.argv[1]), join(ROOT, `integration/pool-generation-phase${phase}.mjs`));
  assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
  assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length, 2);
  assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1])),
    join(ROOT, `integration/run-pool-generation-phase${phase}.mjs`));
  const local = `.local/pool-generation-phase${phase}`, lock = JSON.parse(readFileSync(join(ROOT, local, 'active.lock')));
  assert.equal(lock.pid, process.ppid); assert.equal(lock.format, `FLAT_POOL_GENERATION_PHASE${phase}_LOCK_V1`);
  assert.match(lock.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt, local + '/attempt-' + lock.runId);
  const directory = join(ROOT, lock.attempt), privateDirectory = join(directory, 'private-audit');
  const proofDirectory = join(directory, 'public-proofs');
  mkdirSync(privateDirectory, { mode: 0o700 }); mkdirSync(proofDirectory, { mode: 0o700 });
  const result = { format: phase === 1 ? PHASE1_FORMAT : PHASE2_FORMAT, runId: lock.runId,
    checkpointSHA256: phase === 1 ? POOL_GENERATION_PHASE1_RELEASE : POOL_GENERATION_PHASE2_RELEASE.checkpointSHA256,
    localOnly: true, fakeFundsOnly: true, publicNetwork: false, phase: 'starting', success: false,
    sourcePins: poolGenerationSourcePins(), sourceUnchanged: false,
    supervisor: { supervisorPID: process.ppid, workerPID: process.pid }, stages: [], proofs: [], transactions: [], checks: {},
    limits: POOL_GENERATION_LIMITS, userDeposits: 0, cleanup: { closedEvm: false },
    fundedRecoveryAcceptance: false, recoveryProofAcceptance: false,
    fullWalletAcceptance: false, graphAcceptance: false, genericNativeValueAcceptance: false,
    keeperRestart: false, nodeRestart: false, noteMigration: false, paddingReclaimed: false,
    repeatedRollover: false, performanceClaim: false,
    artifacts: { compilerOutputSHA256: '8d7c19bdd8c52df50eb527a3f0edf80e4e6071c89ed4ec1b94eeef70299c6c02',
      standardInputSHA256: 'b97bd0b4b2f300197f7865d469d2e6cf5ef153c2adc6e1dc21ab6943e0df7a1d' },
    disclosure: ['One fresh original owned chain-31337 EVM; fake PALT; no external network or compiler.',
      'Exact runtime, constructor and public-source acceptance does not establish arbitrary graph safety.',
      'The registrar is trusted to pin the reviewed source/key closure; this is not trustless governance.',
      'Faults suppress one genuine response or exact successor reads; they do not replace chain facts.',
      'Recover remains GRAPH-only. Original note exit and reconciliation do not establish an F proof.',
      'The same live original catalogue and each original mixed keeper survive; whole-keeper/node recovery is not offered.'] };
  const save = () => writeFixturePrivate(join(directory, 'result.json'), result);
  const stage = name => { result.phase = name; result.stages.push(name); save(); process.stdout.write(JSON.stringify({ stage: name }) + '\n'); };
  let fixture, catalogue, session, app, driver, original, successor, originalDescriptor, originalBindings, closed = false, interrupted = false;
  const attached = new Set(), handoffs = new Map(), reviews = new Map();
  async function proof({ label, relation, proof }) {
    assert.equal(phase, 2, 'POOL_GENERATION_PHASE1_NO_PROOFS');
    const bytes = Buffer.isBuffer(proof.proof) ? proof.proof : Buffer.from(proof.proof, 'hex');
    const prefix = String(result.proofs.length + 1).padStart(2, '0') + '-' + relation;
    const inputs = fixtureJSON(proof.publicInputs);
    writeFileSync(join(proofDirectory, prefix + '.bin'), bytes, { flag: 'wx', mode: 0o600 });
    writeFileSync(join(proofDirectory, prefix + '.inputs.json'), inputs, { flag: 'wx', mode: 0o600 });
    result.proofs.push({ label, relation, file: prefix, proofSHA256: sha(bytes), publicInputsSHA256: sha(inputs) }); save();
  }
  async function audit() {
    if (fixture) {
      writeFixturePrivate(join(privateDirectory, 'runtime-audit.json'), { metadata: fixture.runtime.metadata,
        transactions: fixture.runtime.transactions, receipts: fixture.runtime.receipts });
      result.transactions = fixture.runtime.receipts.map(entry => ({ label: entry.label, transactionHash: entry.receipt.transactionHash,
        status: entry.receipt.status, blockHash: entry.receipt.blockHash }));
    }
    if (catalogue) writeFixturePrivate(join(privateDirectory, 'catalogue-audit.json'), catalogue.status());
    save();
  }
  async function cleanup() {
    if (closed) return; closed = true;
    if (app) await app.close().catch(() => {});
    if (session) await session.close().catch(() => {});
    else if (catalogue) await catalogue.keeper.close().catch(() => {});
    if (fixture) {
      for (const group of fixture.groups) if (group.generation && !attached.has(group.generation))
        await closeUnattachedFlatJournalGeneration(group.generation, { runtime: fixture.runtime }).catch(() => {});
      result.cleanup = await fixture.close();
    }
  }
  const stop = () => {
    if (interrupted) return; interrupted = true;
    result.errorCode = 'POOL_GENERATION_INTERRUPTED_ORIGINAL_OUTCOME_UNKNOWN';
    void audit().catch(() => {}).then(cleanup).finally(() => { result.phase = 'failed'; result.success = false; save(); process.exit(2); });
  };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  function assertOriginal() {
    assert.deepEqual(catalogue.status().generations[0], originalDescriptor);
    assert.equal(catalogue.status().originalBindingsRewritten, false);
    assert.equal(Object.isFrozen(fixture.system.pools), true); assert.equal(fixture.system.pools.length, 2);
    for (const binding of originalBindings ?? []) assert.deepEqual(catalogue.status().bindings.find(row =>
      row.request.requestId === binding.request.requestId), binding);
  }
  async function reviewNote(group, request) {
    const descriptor = catalogue.status().generations.find(row => row.generationId === group.generation.generationId);
    const route = descriptor.routes.find(row => row.assetId === group.accounts[0].assetId);
    const selected = await catalogue.selectOwnerGeneration({ economicIdentitySHA256: route.economicIdentitySHA256,
      generationId: group.generation.generationId, kind: request.kind });
    assert.equal(selected.assetId, group.accounts[0].assetId); assert.equal(selected.pool, bare(group.system.pools[0].address));
    const review = await catalogue.reviewOwnerPreparation({ assetId: selected.assetId, request });
    assert.equal(review.request.requestId, request.requestId); assert.equal(review.request.assetId, selected.assetId);
    assert.equal(review.asset.pool, selected.pool); assert.equal(review.kind, request.kind); assert.equal(review.asset.decimals, 6);
    const expected = group === original ? '7' : '5'; assert.equal(review.amount, expected);
    assert.equal(review.recipient, bare(fixture.runtime.accounts[group === original ? 3 : 4]));
    reviews.set(request.requestId, structuredClone(review));
    writeFixturePrivate(join(privateDirectory, request.requestId + '-review.json'), review);
    const handoff = await catalogue.confirmOwnerPreparation(); assert.deepEqual(handoff, review.request);
    handoffs.set(request.requestId, structuredClone(handoff)); assertOriginal(); return handoff;
  }
  async function sdk(action, body) {
    const reviewed = await driver.reviewAccount(action, body);
    const handoff = handoffs.get(body.requestId);
    if (handoff?.kind === 'EXIT' && ['prepare', 'execute'].includes(action)) {
      const group = [original, successor].find(group => group?.accounts[0].assetId === handoff.assetId);
      assert.ok(group); const current = await group.readers[0].read(); await group.readers[0].assertCurrent(current);
      const expected = { generationId: group.generation.generationId, pool: bare(group.system.pools[0].address),
        domainCommitment: bare(group.system.pools[0].domainCommitment),
        observed: { blockNumber: current.head.number, blockHash: current.head.hash, timestamp: current.head.timestamp } };
      assert.deepEqual(reviewed.review.accountContext.originalGeneration, expected);
      (result.exitReviewBindings ??= []).push({ requestId: body.requestId, action, ...expected });
    }
    const response = await reviewed.confirm();
    const row = response.snapshot.requests.find(row => row.requestId === body.requestId);
    assert.equal(row?.state, action === 'prepare' ? 'PREPARED' : 'CONFIRMED'); assertOriginal(); return response;
  }
  async function approve(system, amount) {
    const artifact = loadBackedAssetDeploymentArtifacts().artifacts.token;
    await fixture.runtime.send('pool-generation exact fake-token allowance', { from: fixture.system.sender,
      to: fixture.assets.token.address, data: nativeStaticCalldata(artifact, 'approve(address,uint256)', [system.pools[0].address, amount]) });
    assert.equal(await fixture.capabilities[0].allowance(fixture.system.sender, system.pools[0].address), BigInt(amount));
  }
  async function beforeFund() {
    assert.deepEqual(poolGenerationSourcePins(), result.sourcePins);
    const runtime = fixture.runtime;
    assert.deepEqual(runtime.mutationStatus, { busy: false, uncertain: false });
    assert.equal(fixture.system.provenance.nativeValueProfileCompatible, false);
    assert.equal(fixture.system.provenance.compilerStarted, false);
    for (const name of ['deposit_balance', 'withdraw_balance']) {
      const lineage = fixture.system.verifiers[name].lineage;
      assert.equal(lineage.binaryKeyLoaded, true); assert.equal(lineage.binaryKeyHeaderMatchesAST, true);
    }
    assert.equal(catalogue.status().bindings.length, 0); assert.equal(catalogue.status().generations.length, 1);
    for (const owner of original.owners) assert.equal(owner.report().available, true);
    for (let i = 0; i < original.readers.length; i++) {
      const view = await original.readers[i].read(); await original.readers[i].assertCurrent(view);
      assert.equal(view.ledger.publicState.backedAmount, '0'); assert.equal(view.ledger.publicState.actualAssetBalance, '0');
      assert.equal(view.ledger.publicState.leaves, 0); assert.equal(view.ledger.publicState.spent, 0);
      assert.equal(view.state.spentTagCount, '0'); assert.equal(view.state.revokedCount, '0');
      assert.equal(view.state.totalReservedTagCapacity, '0'); assert.equal(view.checkpointCount, '0');
      assert.equal(await fixture.capabilities[i].allowance(fixture.system.sender, fixture.system.pools[i].address), 0n);
    }
    assert.equal(await fixture.capabilities[0].balance(fixture.system.sender), 1000000n);
    await assert.rejects(createFlatNativeExecution({ runtime, system: fixture.system, poolIndex: 0,
      bitcoin: null, solana: null, quorum: null }), /APPEND_ONLY_GRAPH_RUNTIME_NOT_RELEASED/);
    result.checks.beforeFundPreflight = true; await audit();
  }
  try {
    // Consume this exact separately reviewed source release once, before keys,
    // startup or sends. Failure never deletes this marker or retries a nonce.
    const consumed = join(ROOT, local, 'release-' + result.checkpointSHA256 + '.consumed.json');
    const fd = openSync(consumed, 'wx', 0o600);
    try { writeFileSync(fd, fixtureJSON({ checkpointSHA256: result.checkpointSHA256, phase, runId: lock.runId,
      supervisorPID: process.ppid, oneExecutionOnly: true })); fsyncSync(fd); } finally { closeSync(fd); }
    const parentFD = openSync(join(ROOT, local), 'r'); try { fsyncSync(parentFD); } finally { closeSync(parentFD); }
    result.oneExecutionReleaseConsumed = true;
    stage('exact-lineage-before-any-deployment'); fixture = await createOwnedPoolGenerationFixture(privateDirectory, proof);
    result.runtimeClosure = await verifyPoolGenerationRuntimeClosure(fixture.runtime, fixture.system);
    result.checks.completeRuntimeAndConstructors = true;
    original = await fixture.openGeneration(fixture.system, 'original');
    catalogue = await createFlatJournalCatalogue({ runtime: fixture.runtime, initialGeneration: original.generation,
      journal: { path: join(privateDirectory, 'original-catalogue.vault'), password: freshFixtureId() } });
    attached.add(original.generation); originalDescriptor = structuredClone(catalogue.status().generations[0]);
    const bootstrap = await createFlatManualGraphCatalogueSession({ runtime: fixture.runtime, catalogue }); session = bootstrap.session;
    app = await startWalletApplication({ accountSession: session, actionAccessMode: 'exact-only', port: 0 });
    driver = createManualWalletAppDriver(app, { deadlineMs: Date.parse(lock.startedAt)
      + NATIVE_FLOW_LIMITS.totalMilliseconds - NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds });
    const fixedCatalogue = catalogue, fixedSession = session;
    stage('genuine-rejections-and-unfunded-preflight');
    result.rejections = await checkAppendOnlyRejections(fixture.runtime, fixture.system, original.readers);
    result.checks.exactRejectionSelectors = true; await beforeFund();
    result.checks.actualCurrentReader = true;
    // This is an exact local fake-token allowance, not a deposit. Required by
    // the existing owner registration; no funding check is bypassed in phase 1.
    await approve(fixture.system, '7');
    const oldTopUp = await reviewNote(original, { requestId: 'generation_old_topup', kind: 'TOP_UP', amount: '7',
      exitRecipient: bare(fixture.runtime.accounts[3]) });
    originalBindings = structuredClone(catalogue.status().bindings);
    result.originalGeneration = { generationId: original.generation.generationId, poolCount: 2,
      descriptorSHA256: sha(fixtureJSON(originalDescriptor)),
      bindingsBefore: originalBindings.map(row => ({ requestId: row.request.requestId, generationId: row.generationId,
        bindingSHA256: sha(fixtureJSON(row)) })) };
    if (phase === 2) {
      stage('fund-original-note-through-existing-sdk');
      await sdk('prepare', oldTopUp); await sdk('execute', { requestId: oldTopUp.requestId }); result.userDeposits++;
      assert.equal((await original.readers[0].read()).ledger.publicState.backedAmount, '7');
      assert.equal((await original.portfolio.ownerView()).assets[0].balances.available, '7');
      result.checks.originalFundedBeforeAppend = true;
    }
    const originalFacts = await Promise.all(original.readers.map(async reader => retainedOriginalPoolFacts(await reader.read())));
    const appendOptions = { predecessor: fixture.system.pools[0].address, deploymentDomain: '0x' + freshFixtureId(), policy: '0x' + freshFixtureId() };
    stage(phase === 1 ? 'append-once-with-withheld-registration-reply' : 'append-one-same-asset-successor');
    let successorSystem;
    if (phase === 1) {
      fixture.transport.withholdNextSuccessorRegistrationAcknowledgement();
      await assert.rejects(appendFlatPoolSuccessor(fixture.runtime, fixture.system, appendOptions), error => {
        assert.equal(error.message, 'APPEND_ONLY_SUCCESSOR_FAILED');
        assert.equal(error.cause?.message, 'POOL_GENERATION_WITHHELD_REGISTRATION_ACK'); return true;
      });
      const retained = describeOwnedFlatPoolRegistry(fixture.runtime, fixture.system);
      assert.equal(retained.appendFenced, true); assert.equal(retained.pools.length, 3);
      const pending = retained.pools[2], fault = fixture.transport.status();
      assert.equal(fault.acknowledgementWithheld, true); assert.equal(fault.successor.pool, pending.address);
      assert.equal(pending.registrationPin.predecessor, fixture.system.pools[0].address);
      assert.equal(pending.registrationPin.sourceManifestSHA256, '0x' + fixture.system.provenance.sourceManifestSHA256);
      assert.equal(pending.registrationPin.keyManifestSHA256, '0x' + fixture.system.provenance.keyManifestSHA256);
      assert.equal(await fixture.runtime.code(pending.address), pending.expectedCode);
      assert.equal(await fixture.runtime.keccak(pending.expectedCode), pending.codeHash);
      const receipt = await fixture.runtime.receipt(fault.successor.transactionHash);
      assert.equal(receipt.status, '0x1'); await fixture.runtime.checkReceipt(receipt);
      const retainedJSON = fixtureJSON({ address: pending.address, domain: pending.domain,
        domainCommitment: pending.domainCommitment, registrationPin: pending.registrationPin,
        immutableValues: pending.immutableValues, codeHash: pending.codeHash, expectedCode: pending.expectedCode });
      writeFileSync(join(privateDirectory, 'retained-prospective-descriptor.json'), retainedJSON, { flag: 'wx', mode: 0o600 });
      result.retainedProspective = { address: pending.address, domainCommitment: pending.domainCommitment,
        codeHash: pending.codeHash, descriptorSHA256: sha(retainedJSON), registrationTransactionHash: receipt.transactionHash };
      result.retainedProspectiveRuntime = await verifyRetainedProspectivePool(fixture.runtime, fixture.system);
      result.checks.registeredReplyWithheld = true; result.checks.prospectiveDescriptorRetained = true;
      fixture.transport.withholdSuccessorReads();
      await assert.rejects(fixture.runtime.code(pending.address), /POOL_GENERATION_SUCCESSOR_TRANSPORT_UNAVAILABLE/);
      assert.deepEqual(await Promise.all(original.readers.map(async reader => retainedOriginalPoolFacts(await reader.read()))), originalFacts);
      const reconcile = await catalogue.readOriginalOwnerPreparation(oldTopUp.requestId);
      assert.equal(reconcile.status, 'HANDOFF_READY'); assert.deepEqual(reconcile.handoff, oldTopUp); assertOriginal();
      result.checks.originalOwnerHandoffReconciled = true; result.checks.originalDescriptorRetained = true;
      result.checks.oldRouteReadableDuringSuccessorOutage = true;
      const transactions = fixture.runtime.transactions.length;
      await assert.rejects(appendFlatPoolSuccessor(fixture.runtime, fixture.system, appendOptions), /APPEND_ONLY_APPEND_FENCED/);
      assert.equal(fixture.runtime.transactions.length, transactions);
      assert.equal(describeOwnedFlatPoolRegistry(fixture.runtime, fixture.system).pools[2], pending);
      assert.equal(catalogue.status().generations.length, 1); result.checks.furtherAppendFenced = true;
      fixture.transport.restoreSuccessorReads();
    } else {
      successorSystem = await appendFlatPoolSuccessor(fixture.runtime, fixture.system, appendOptions);
      assert.equal(successorSystem.pools.length, 1); assert.equal(successorSystem.hub, fixture.system.hub);
      assert.notEqual(successorSystem.pools[0].address, fixture.system.pools[0].address);
      assert.equal(successorSystem.pools[0].assetCapability, fixture.system.pools[0].assetCapability);
      result.successorRuntimeClosure = await verifyPoolGenerationRuntimeClosure(fixture.runtime, successorSystem);
      assert.deepEqual(await Promise.all(original.readers.map(async reader => retainedOriginalPoolFacts(await reader.read()))), originalFacts);
      successor = await fixture.openGeneration(successorSystem, 'successor');
      await catalogue.appendGeneration(successor.generation); attached.add(successor.generation); assertOriginal();
      const route = catalogue.status().generations[0].routes.find(row => row.assetId === original.accounts[0].assetId);
      await assert.rejects(catalogue.selectOwnerGeneration({ economicIdentitySHA256: route.economicIdentitySHA256,
        generationId: null, kind: 'EXIT' }), /FLAT_CATALOGUE_SAME_ASSET_GENERATION_AMBIGUOUS/);
      await assert.rejects(catalogue.selectOwnerGeneration({ economicIdentitySHA256: route.economicIdentitySHA256,
        generationId: original.generation.generationId, kind: 'TOP_UP' }), /FLAT_CATALOGUE_FRESH_ROUTE_CHANGED/);
      assert.equal((await catalogue.selectTopUp({ assetId: original.accounts[0].assetId })).assetId, successor.accounts[0].assetId);
      assert.notEqual(original.accounts[0].assetId, successor.accounts[0].assetId);
      result.checks.sameAssetAmbiguityRejected = true; result.checks.explicitOwnerGenerationSelection = true;
      stage('new-successor-owner-review-topup-and-exit-through-sdk');
      assert.deepEqual(poolGenerationSourcePins(), result.sourcePins);
      assert.equal((await successor.readers[0].read()).ledger.publicState.backedAmount, '0');
      assert.equal((await original.readers[0].read()).ledger.publicState.backedAmount, '7');
      await approve(successorSystem, '5');
      const newTopUp = await reviewNote(successor, { requestId: 'generation_new_topup', kind: 'TOP_UP', amount: '5',
        exitRecipient: bare(fixture.runtime.accounts[4]) });
      assert.notEqual(newTopUp.ownerOperationRef, oldTopUp.ownerOperationRef);
      assert.notEqual(reviews.get(newTopUp.requestId).ownerIdentitySHA256, reviews.get(oldTopUp.requestId).ownerIdentitySHA256);
      await sdk('prepare', newTopUp); await sdk('execute', { requestId: newTopUp.requestId }); result.userDeposits++;
      assert.equal((await successor.readers[0].read()).ledger.publicState.backedAmount, '5');
      const newExit = await reviewNote(successor, { requestId: 'generation_new_exit', kind: 'EXIT', role: 'source' });
      await sdk('prepare', newExit); await sdk('execute', { requestId: newExit.requestId });
      assert.equal((await successor.readers[0].read()).ledger.publicState.backedAmount, '0');
      assert.equal(await fixture.capabilities[0].balance(fixture.runtime.accounts[4]), 5n);
      result.checks.successorOwnReviewAndConsent = true; result.checks.sdkTopUpExit = true;
      stage('original-funded-note-exit-while-successor-reads-unavailable');
      fixture.transport.withholdSuccessorReads();
      await assert.rejects(successor.readers[0].read(), /POOL_GENERATION_SUCCESSOR_TRANSPORT_UNAVAILABLE/);
      const partial = (await driver.state()).portfolio;
      const unavailable = partial.generations.find(row => row.generationId === successor.generation.generationId);
      assert.ok(unavailable); assert.equal(partial.status, 'PARTIAL');
      for (const row of unavailable.portfolio?.assets ?? []) {
        assert.equal(row.status, 'UNAVAILABLE'); assert.equal(row.balances, null); assert.equal(row.observed, null);
      }
      assert.ok(unavailable.portfolio === null || unavailable.portfolio.assets.length === 1);
      assert.equal(partial.capabilities.privateBalancesAggregated, false); result.checks.successorAmountsUnknownDuringOutage = true;
      await assert.rejects(catalogue.selectTopUp({ assetId: original.accounts[0].assetId }));
      const oldExit = await reviewNote(original, { requestId: 'generation_old_exit', kind: 'EXIT', role: 'source' });
      await sdk('prepare', oldExit); await sdk('execute', { requestId: oldExit.requestId });
      assert.equal((await original.readers[0].read()).ledger.publicState.backedAmount, '0');
      assert.equal(await fixture.capabilities[0].balance(fixture.runtime.accounts[3]), 7n);
      result.checks.originalExitDuringSuccessorOutage = true;
      const after = fixture.runtime.transactions.length;
      await sdk('reconcile', { requestId: oldTopUp.requestId }); await sdk('reconcile', { requestId: oldExit.requestId });
      await driver.duplicateAccountExecute(oldExit.requestId);
      // Explicitly show the unchanged recovery boundary rather than inventing a
      // successful note/F recovery. This error must not submit anything.
      await assert.rejects(catalogue.keeper.recover(oldExit.requestId), /FLAT_MANUAL_GRAPH_RECOVERY_ONLY/);
      assert.equal(fixture.runtime.transactions.length, after);
      result.checks.originalReconcileNoSendAndGraphRecoveryStillBlocked = true;
      fixture.transport.restoreSuccessorReads();
      stage('conservation-and-original-identity-closure');
      for (const group of [original, successor]) for (const reader of group.readers) {
        const view = await reader.read(); await reader.assertCurrent(view);
        assert.equal(view.ledger.publicState.backedAmount, '0'); assert.equal(view.ledger.publicState.actualAssetBalance, '0');
        assert.equal(view.ledger.publicState.liveReservations, 0); assert.equal(view.state.spentTagCount, '0');
        assert.equal(view.state.revokedCount, '0'); assert.equal(view.state.totalReservedTagCapacity, '0');
      }
      assert.equal(await fixture.capabilities[0].balance(fixture.system.sender), 999988n);
      for (const holder of [fixture.runtime.accounts[1], fixture.runtime.accounts[2], fixture.assets.vault.address])
        assert.equal(await fixture.capabilities[0].balance(holder), 0n);
      assert.equal(await fixture.capabilities[0].balance(fixture.runtime.accounts[3]), 7n);
      assert.equal(await fixture.capabilities[0].balance(fixture.runtime.accounts[4]), 5n);
      for (const group of [original, successor]) assert.equal(await fixture.capabilities[0].allowance(fixture.system.sender, group.system.pools[0].address), 0n);
      const token = loadBackedAssetDeploymentArtifacts().artifacts.token;
      const supply = await fixture.runtime.call({ to: fixture.assets.token.address, data: nativeStaticCalldata(token, 'totalSupply()', []) });
      assert.equal(BigInt(supply), 1000000n);
      result.economics = { originalDeposit: '7', successorDeposit: '5', originalExit: '7', successorExit: '5',
        finalOriginalBacking: '0', finalSuccessorBacking: '0', totalSupply: '1000000' };
      assert.equal(catalogue, fixedCatalogue); assert.equal(session, fixedSession); assertOriginal();
      result.checks.sameOriginalCatalogue = true; result.checks.sameOriginalSession = true; result.checks.sameOriginalBindings = true;
      result.checks.allBackingConserved = true; result.checks.noOriginalNoteMigration = true;
    }
    result.finalRegistry = await registrySnapshot(fixture.runtime, fixture.system);
    assert.equal(BigInt(result.finalRegistry.globals.registeredPoolCount), 3n);
    assert.equal(BigInt(result.finalRegistry.globals.pinnedPoolCount), 3n);
    result.originalGeneration.descriptorAfterSHA256 = sha(fixtureJSON(catalogue.status().generations[0]));
    result.originalGeneration.bindingsAfter = originalBindings.map(original => {
      const row = catalogue.status().bindings.find(row => row.request.requestId === original.request.requestId);
      return { requestId: row.request.requestId, generationId: row.generationId, bindingSHA256: sha(fixtureJSON(row)) };
    });
    result.finalPools = [];
    for (const group of fixture.groups) for (const reader of group.readers) {
      const view = await reader.read(); await reader.assertCurrent(view);
      result.finalPools.push({ pool: view.poolAddress, domainCommitment: view.domainCommitment, ...view.ledger.publicState });
    }
    result.sdkEvidence = driver.evidence(); await audit(); await cleanup();
    assert.deepEqual(poolGenerationSourcePins(), result.sourcePins); result.sourceUnchanged = true;
    result.phase = 'completed'; result.success = true;
    (phase === 1 ? assertPoolGenerationPhase1Result : assertPoolGenerationPhase2Result)(result); save();
  } catch (error) {
    result.errorCode = safeCode(error); result.causeCode = safeCode(error?.cause);
    if (error.fixtureCleanup) result.cleanup = error.fixtureCleanup;
    result.phase = 'failed'; result.success = false;
    try { await audit(); } catch {}
    try { await cleanup(); } catch { result.cleanup.closedEvm = false; }
    try { assert.deepEqual(poolGenerationSourcePins(), result.sourcePins); result.sourceUnchanged = true; } catch { result.sourceUnchanged = false; }
    save(); process.exitCode = 1;
  } finally { process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop); }
}
