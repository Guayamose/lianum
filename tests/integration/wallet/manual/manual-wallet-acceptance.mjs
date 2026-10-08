/** Actual affected path: one private PALT reservation pays a solver only after
 * its gated vault action backs the exact preauthorized private BLTV note.
 * Reviewed manual/exact-only catalogue route for a fresh development laboratory.
 * This uses one owned local EVM and the original four-slot generic protocol.
 * Native action amounts/timing and the common-host keeper remain observable.
 */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNativeRecipientProcess } from '../../../../packages/engine/src/execution/native/recipients/native-recipient-process.mjs';
import { createProofProcess } from '../../../../packages/engine/src/execution/proofs/proof-process.mjs';
import { walletInputPublicWords } from '../../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { noteWordsToHash } from '../../../../packages/engine/src/notes/private-note-tree.mjs';
import { nativeStaticCalldata } from '../../../../packages/engine/src/execution/native/dispatch/native-deployment.mjs';
import { ROOT } from '../../../../packages/proofs/src/catalog.mjs';
import { hash } from '../../../../packages/proofs/src/tooling/tooling.mjs';
import { createOwnedEvmVaultFixture, prepareEvmVaultFixtureGraph } from '../../fixtures/chains/evm/owned-evm-vault-fixture.mjs';
import { freshFixtureId, fixtureJSON, writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';
import { manualWalletSourcePins } from './manual-wallet-source-pins.mjs';
import { manualWalletBrowserSourcePins } from './manual-wallet-browser-source-pins.mjs';
import { MANUAL_WALLET_BROWSER_FORMAT, assertManualWalletBrowserResult } from './manual-wallet-browser-policy.mjs';
import { NATIVE_FLOW_LIMITS } from '../../native/native-flow-supervisor.mjs';
import { readEvmVaultReplayState, assertEvmVaultPayoutReplay, assertEvmVaultTerminalPools } from '../../chains/evm/evm-vault-terminal-checks.mjs';
import { loadBackedAssetDeploymentArtifacts } from '../../../../packages/backend/src/operations/deployments/defi/deploy-backed-assets.mjs';
import { createFlatNativeExecution } from '../../../../packages/backend/src/execution/account/execution/flat-native-execution.mjs';
import { encodeFlatTransaction } from '../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { createFlatAccountAuthority } from '../../../../packages/backend/src/accounts/authority/flat-account-authority.mjs';
import { createFlatPortfolioAuthority } from '../../../../packages/backend/src/accounts/authority/flat-portfolio-authority.mjs';
import { startWalletApplication } from '../../../../apps/wallet/src/server/server.mjs';
import { createManualWalletAppDriver } from './manual-wallet-app-driver.mjs';
import { assertManualWalletConvertedPosition } from './manual-wallet-position-checks.mjs';
import { createFlatPoolAdmissionPolicy } from '../../../../packages/backend/src/accounts/authority/flat-pool-admission-policy.mjs';
import { createFlatJournalGeneration, createFlatJournalCatalogue, closeUnattachedFlatJournalGeneration }
  from '../../../../packages/backend/src/accounts/storage/flat-journal-catalogue.mjs';
import { createFlatManualGraphCatalogueSession } from '../../../../packages/backend/src/api/accounts/flat-manual-graph-session.mjs';
import { createGenerationPrivateVaultExit } from '../../../../packages/backend/src/defi/withdrawals/generation-private-vault-exit.mjs';
import { MANUAL_WALLET_REAL_RUN_DISABLED, assertManualWalletResult } from './manual-wallet-acceptance-policy.mjs';
import { MANUAL_WALLET_RECOVERY_FORMAT, assertManualWalletRecoveryResult } from './manual-wallet-recovery-policy.mjs';
import { createOwnedBackedVault, assertOwnedBackedVaultReceipt } from '../../../../packages/backend/src/defi/vaults/owned-backed-vault.mjs';
import { createOwnedPrivateVaultExit } from '../../../../packages/backend/src/defi/withdrawals/private-vault-exit.mjs';

const bare = value => value.slice(2);
const safeCode = error => {
  const value = error?.code ?? error?.message ?? '';
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{2,160}$/.exec(value)?.[0] === value
    ? value : 'FLAT_EVM_VAULT_FLOW_FAILED';
};

export async function runManualWalletAcceptance() {
  assert.equal(arguments.length, 0, 'MANUAL_WALLET_FIXED_WORKER_NO_OPTIONS');
  assert.equal(MANUAL_WALLET_REAL_RUN_DISABLED, false, 'MANUAL_WALLET_REQUIRES_EXCLUSIVE_CHECKPOINTED_SLOT');
  assert.equal(process.argv.length, 2);
  const worker = realpathSync(process.argv[1]);
  const timeoutRecovery = worker === join(ROOT, 'integration/manual-wallet-timeout-recovery.mjs');
  const browserMode = worker === join(ROOT, 'integration/manual-wallet-browser-acceptance.mjs');
  assert.ok(timeoutRecovery || browserMode || worker === fileURLToPath(import.meta.url), 'MANUAL_WALLET_FIXED_WORKER_REQUIRED');
  const flowName = browserMode ? 'manual-wallet-browser-acceptance' : timeoutRecovery ? 'manual-wallet-timeout-recovery' : 'manual-wallet-acceptance';
  const captureSources = browserMode ? manualWalletBrowserSourcePins : manualWalletSourcePins;
  assert.deepEqual(process.execArgv, []);
  assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
  assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length, 2);
  assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1])),
    join(ROOT, 'integration/run-' + flowName + '.mjs'));
  const lock = JSON.parse(readFileSync(join(ROOT, '.local/' + flowName + '/active.lock')));
  assert.equal(lock.pid, process.ppid);
  assert.match(lock.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt, '.local/' + flowName + '/attempt-' + lock.runId);
  const directory = join(ROOT, lock.attempt), privateDirectory = join(directory, 'private-audit');
  const proofDirectory = join(directory, 'public-proofs');
  mkdirSync(privateDirectory, { mode: 0o700 });
  mkdirSync(proofDirectory, { mode: 0o700 });
  const began = performance.now();
  const result = {
    format: browserMode ? MANUAL_WALLET_BROWSER_FORMAT : timeoutRecovery ? MANUAL_WALLET_RECOVERY_FORMAT : 'FLAT_MANUAL_WALLET_ACCEPTANCE_RESULT_V1', runId: lock.runId,
    startedAt: new Date().toISOString(), phase: 'starting', success: false,
    localOnly: true, fakeFundsOnly: true, publicNetwork: false,
    supervisor: { supervisorPID: process.ppid, workerPID: process.pid }, sourcePins: captureSources(),
    stages: [], proofs: [], transactions: [], accountRequests: [], nativeEffects: { evmVault: 0 },
    cleanup: { closedEvm: false }, keeperRestart: false, nodeRestart: false,
    privateVaultGraphAcceptance: false, partialDeliveryRecoveryAcceptance: false,
    walletSdkEvmFlowCompleted: false, walletBrowserEvmFlowCompleted: false, browserClosures: [],
    actualTimeoutFRecoveryAcceptance: false,
    systemicPrivacyAcceptance: false, independentOperators: false,
    realClockFinalityAcceptance: false, performanceTargetAchieved: false, fullWalletAcceptance: false,
    disclosure: [
      'One owned local EVM, fake PALT and BLTV, controlled inclusion time and one canonical local confirmation.',
      'Solver supplies public vault liquidity. Source private reserve pays only after exact destination private note backing is proven.',
      'The router action, amount, K, vault and destination pool remain public. Common-host observers/keeper are trusted.',
      'Two encrypted owner children restart; the mixed coordinator reopens its same journal and the listener is replaced. Original authorities, keeper and EVM survive.',
      'This exercises one registered EVM vault action under the generic relation, not arbitrary DeFi or seven-chain acceptance.',
    ],
  };
  const save = () => writeFixturePrivate(join(directory, 'result.json'), result);
  async function stage(name) {
    result.phase = name;
    result.stages.push({ name, at: new Date().toISOString(), elapsedMilliseconds: performance.now() - began });
    save(); process.stdout.write(JSON.stringify({ stage: name }) + '\n');
  }
  let fixture, execution, portfolio, generation, catalogue, bootstrap, session, walletApp, appDriver, vaultActor, vaultExit, defiFacade, legacy;
  const originalHandoffs = new Map(), originalGraphReviews = new Map(), ownerReviews = new Map();
  let graphRef, graphCutoff;
  const graphId = 'private_vault_graph';
  let closed = false, interrupted = false, browserRuntime = null;
  const accounts = [];
  async function retainProof({ label, relation, proof }) {
    const payload = Buffer.isBuffer(proof.proof) ? Buffer.from(proof.proof) : Buffer.from(proof.proof, 'hex');
    const file = `${String(result.proofs.length + 1).padStart(3, '0')}-${label}`;
    const inputs = fixtureJSON(proof.publicInputs);
    writeFileSync(join(proofDirectory, file + '.bin'), payload, { flag: 'wx', mode: 0o600 });
    writeFileSync(join(proofDirectory, file + '.inputs.json'), inputs, { flag: 'wx', mode: 0o600 });
    result.proofs.push({ label, relation, file, proofSHA256: hash(payload), publicInputsSHA256: hash(inputs),
      evidence: proof.evidence ?? proof.metrics }); save();
  }
  async function audit(detail) {
    if (detail) writeFixturePrivate(join(privateDirectory, 'latest-application.json'), detail);
    if (fixture?.runtime) {
      const runtime = fixture.runtime;
      writeFixturePrivate(join(privateDirectory, 'evm.json'), {
        metadata: runtime.metadata, transactions: runtime.transactions, receipts: runtime.receipts });
      result.transactions = runtime.receipts.map(entry => ({ label: entry.label,
        transactionHash: entry.receipt.transactionHash, blockHash: entry.receipt.blockHash,
        status: entry.receipt.status, gasUsed: entry.gasUsed }));
      result.nativeEffects.evmVault = runtime.transactions.filter(entry => entry.signed && entry.receipt?.status === '0x1').length;
    }
    save();
  }
  async function cleanup() {
    if (closed) return; closed = true;
    if (browserRuntime) {
      try { await closeBrowser(); } catch (error) {
        result.browserCleanupFailure = safeCode(error); result.success = false; result.phase = 'failed';
      }
    }
    if (walletApp) await walletApp.close().catch(() => {});
    await Promise.allSettled([...accounts.map(account => account.abort()), execution?.abort(), legacy?.close()].filter(Boolean));
    if (session) await session.close().catch(() => {});
    else if (catalogue) await catalogue.keeper.close().catch(() => {});
    else if (generation) await closeUnattachedFlatJournalGeneration(generation, { runtime: fixture.runtime }).catch(() => {});
    try { portfolio?.close(); } catch {}
    for (const account of accounts) await account.close().catch(() => {});
    await execution?.close().catch(() => {});
    if (fixture) result.cleanup = await fixture.close();
  }
  const stop = () => {
    if (interrupted) return; interrupted = true;
    result.interruption = { at: new Date().toISOString(), phase: result.phase };
    void audit().catch(() => {}).then(cleanup).finally(() => {
      result.phase = 'failed'; result.success = false;
      result.errorCode = 'EVM_VAULT_INTERRUPTED_ORIGINAL_OUTCOME_UNKNOWN'; save(); process.exit(2);
    });
  };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  async function closeBrowser() {
    if (!browserRuntime) return;
    const original = browserRuntime; browserRuntime = null; appDriver?.close();
    result.browserClosures.push(await original.close()); save();
  }
  async function openListener() {
    if (browserMode) await closeBrowser();
    walletApp = await startWalletApplication({ accountSession: session,
      defiExit: { runtime: fixture.runtime, service: defiFacade }, actionAccessMode: 'exact-only', port: 0 });
    const deadlineMs = Date.parse(lock.startedAt) + NATIVE_FLOW_LIMITS.totalMilliseconds - NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds;
    if (browserMode) {
      const { startOwnedWalletBrowser } = await import('./owned-wallet-browser.mjs');
      const { createManualWalletDomDriver } = await import('./manual-wallet-dom-driver.mjs');
      browserRuntime = await startOwnedWalletBrowser(privateDirectory, walletApp.origin);
      appDriver = await createManualWalletDomDriver(walletApp, { page: browserRuntime.page, deadlineMs });
    } else appDriver = createManualWalletAppDriver(walletApp, { deadlineMs });
    assert.equal(walletApp.actionAccess, undefined);
  }
  async function checkpointBindings() {
    const status = catalogue.status();
    assert.equal(status.generations.length, 1); assert.equal(status.generations[0].generationId, generation.generationId);
    assert.equal(status.originalBindingsRewritten, false);
    for (const [requestId, body] of originalHandoffs) {
      const rows = status.bindings.filter(entry => entry.request.requestId === requestId);
      assert.equal(rows.length, 1); assert.equal(rows[0].generationId, generation.generationId);
      assert.deepEqual(rows[0].request, body);
    }
    writeFixturePrivate(join(privateDirectory, 'catalogue-bindings.json'), status);
    return structuredClone(status.bindings);
  }
  async function manualNote(assetId, request) {
    // Scripted local acceptance review/confirmation, not standing consent.
    const review = await catalogue.reviewOwnerPreparation({ assetId, request });
    assert.equal(review.request.requestId, request.requestId); assert.equal(review.kind, request.kind);
    assert.equal(review.asset.decimals, 6);
    if (request.kind === 'TOP_UP') {
      assert.equal(review.amount, '500'); assert.equal(review.recipient, request.exitRecipient);
    }
    ownerReviews.set(request.requestId, structuredClone(review));
    writeFixturePrivate(join(privateDirectory, request.requestId + '-owner-review.json'), review);
    const body = await catalogue.confirmOwnerPreparation();
    assert.deepEqual(body, review.request); originalHandoffs.set(request.requestId, structuredClone(body));
    await checkpointBindings(); return body;
  }
  const appState = () => appDriver.state();
  const appDefi = (action, body) => appDriver.defi(action, body);
  async function appAccount(action, body) {
    // Keep the authenticated private read used for this exact review. A stale
    // or fenced view must remain diagnosable without weakening UI admission.
    writeFixturePrivate(join(privateDirectory, body.requestId + '-' + action + '-wallet-state.json'), await appState());
    const { snapshot, ...observation } = await appDriver.account(action, body);
    result.accountRequests.push({ via: 'WALLET_APP_HTTP', ...observation }); save(); return snapshot;
  }
  async function appDuplicateExecute(requestId) {
    const count = fixture.runtime.transactions.length;
    await appDriver.duplicateAccountExecute(requestId);
    assert.equal(fixture.runtime.transactions.length, count, 'EVM_VAULT_APP_DUPLICATE_SENT');
  }
  function row(view, requestId) {
    const selected = view.requests.find(entry => entry.requestId === requestId);
    assert.ok(selected, 'EVM_VAULT_ACCOUNT_REQUEST_MISSING'); return selected;
  }
  async function ownerView() {
    const value = await appState();
    assert.ok(value.portfolio, 'EVM_VAULT_APP_PORTFOLIO_REQUIRED');
    assert.equal(value.portfolio.profile, 'FLAT_IMMUTABLE_JOURNAL_CATALOGUE_V2');
    assert.equal(value.portfolio.generations.length, 1);
    assert.equal(value.portfolio.capabilities.privateBalancesAggregated, false);
    const original = value.portfolio.generations[0];
    assert.equal(original.generationId, generation.generationId);
    assert.ok(original.portfolio, 'MANUAL_ACCEPTANCE_ORIGINAL_GENERATION_UNAVAILABLE');
    return original.portfolio;
  }
  async function exitOwnerNote(index, owner, role, requestId) {
    const runtime = fixture.runtime;
    const body = await manualNote(accounts[index].assetId, { requestId, kind: 'EXIT', role });
    const expected = role === 'change' ? '380' : index === 1 ? '100' : '120';
    const retained = await owner.ownerView.manualPreparations();
    const review = retained.records.find(record => record.review.request.requestId === requestId)?.review;
    assert.equal(review?.amount, expected);
    assert.equal(review.recipient, bare(runtime.accounts[index === 0 ? 3 : 4]));
    await appAccount('prepare', body);
    assert.equal(row(await appAccount('execute', { requestId }), requestId).state, 'CONFIRMED');
    const completedCount = runtime.transactions.length;
    await appAccount('reconcile', { requestId });
    await appDuplicateExecute(requestId);
    assert.equal(runtime.transactions.length, completedCount, 'EVM_VAULT_APP_RECONCILE_RESENT');
  }

  async function reopenOriginalOfflineCoordinator() {
    const { sourceOwner, targetOwner } = fixture;
    const beforeRestartBindings = await checkpointBindings();
    const oldGrant = await appDriver.unspentGraphGrantForListenerReplacement(graphId);
    result.exactActionEvidenceBeforeRestart = appDriver.evidence();
    await walletApp.close();
    const restartAdmission = session.restartCoordinator();
    const restarted = await session.idle();
    assert.equal(restarted.admissions.find(row => row.sequence === restartAdmission.sequence)?.state, 'SUCCEEDED');
    if (result.originalFailedAdmission) assert.deepEqual(restarted.admissions.find(row =>
      row.sequence === result.originalFailedAdmission.sequence), result.originalFailedAdmission,
    'EVM_VAULT_ORIGINAL_FAILED_ADMISSION_CHANGED');
    assert.deepEqual(await checkpointBindings(), beforeRestartBindings);
    await openListener();
    await appDriver.rejectForeignListenerGrant('accountReconcile', { requestId: graphId }, oldGrant);
    assert.equal(sourceOwner.report().childExited, true); assert.equal(targetOwner.report().childExited, true);
    const offlineState = await appState();
    assert.equal(offlineState.portfolio.status, 'UNAVAILABLE');
    const offlinePortfolio = offlineState.portfolio.generations[0].portfolio;
    if (offlinePortfolio !== null) for (const asset of offlinePortfolio.assets) {
      assert.equal(asset.status, 'UNAVAILABLE'); assert.equal(asset.balances, null);
    }
    assert.deepEqual(offlineState.account.manualGraphs.find(row => row.requestId === graphId), originalGraphReviews.get(graphId));
    result.listenerRestart = { originalSessionRetained: true, originalCatalogueRetained: true,
      oldGrantRejected: true, originalIdsRetained: true, keeperRestart: false, nodeRestart: false,
      coordinatorMode: 'SAME_ORIGINAL_AUTHENTICATED_JOURNAL_REOPEN', coordinatorProcessRestart: false };
  }

  /** Failure-only acceptance, not an automatic wallet policy. Keep the original
   * error, use the owner's original F and deliberately advance LOCAL time to
   * that exact signed cutoff. Never dispatch, replace or replay the vault leg.
   * Any unsafe/unknown runtime or unavailable original evidence stops this too.
   */
  async function recoverOriginalFailedDelivery() {
    if (!fixture || !execution || !graphRef || !graphCutoff) return;
    const state = execution.snapshot(graphRef);
    if (state.outcome !== null || !state.nativeExposure.some(item => item.status === 'DELIVERED')) return;
    const { runtime, sourceOwner, targetOwner, capabilities } = fixture;
    const originals = runtime.transactions.filter(entry => entry.signed && entry.receipt?.status === '0x1');
    assert.equal(originals.length, 1, 'EVM_VAULT_RECOVERY_EXACT_ORIGINAL');
    const original = originals[0], ownerAbsentAtRecovery = !sourceOwner.report().available;
    if (timeoutRecovery) {
      assert.equal(ownerAbsentAtRecovery, true); assert.equal(targetOwner.report().available, false);
      assert.equal(result.controlledPostDeliveryInterruption, true);
      await stage('reopen-original-coordinator-before-timeout-recovery');
      await reopenOriginalOfflineCoordinator();
    }
    await stage('failure-only-original-cutoff-recovery');
    if (await runtime.time() < BigInt(graphCutoff)) await runtime.advanceTo(graphCutoff);
    const recovered = await appAccount('recover', { requestId: graphId });
    assert.equal(row(recovered, graphId).state, 'CONFIRMED', 'EVM_VAULT_FAILURE_RECOVERY_UNRESOLVED');
    assert.equal(execution.snapshot(graphRef).outcome, 'RECOVERED', 'EVM_VAULT_FAILURE_NOT_RECOVERED');
    if (timeoutRecovery) {
      const proofCount = result.proofs.length, transactionCount = runtime.transactions.length;
      const fProofs = result.proofs.filter(proof => proof.relation === 'recovery');
      assert.equal(fProofs.length, 1, 'EVM_VAULT_ORIGINAL_F_PROOF_REQUIRED');
      const fInputs = JSON.parse(readFileSync(join(proofDirectory, fProofs[0].file + '.inputs.json'), 'utf8'));
      assert.equal(fInputs.length, 41, 'EVM_VAULT_F_PUBLIC_INPUT_ORDER');
      assert.equal(BigInt(fInputs[40]), BigInt(graphCutoff), 'EVM_VAULT_F_ORIGINAL_CUTOFF_CHANGED');
      await appAccount('recover', { requestId: graphId });
      await appAccount('reconcile', { requestId: graphId });
      assert.equal(result.proofs.length, proofCount, 'EVM_VAULT_F_RECOVERY_REPROVED');
      assert.equal(runtime.transactions.length, transactionCount, 'EVM_VAULT_F_RECOVERY_RESENT');
      assert.equal(runtime.transactions.filter(entry => entry.signed).length, 1, 'EVM_VAULT_NATIVE_LEG_RESUBMITTED');
      assert.equal(execution.snapshot(graphRef).outcome, 'RECOVERED');
    }
    if (!sourceOwner.report().available) await sourceOwner.restart();
    if (!targetOwner.report().available) await targetOwner.restart();
    const credit = await accounts[0].ownerActions.recoveryCreditRequest(graphRef);
    assert.equal((await sourceOwner.owner.reconcileRecovery(credit)).stage, 'CONFIRMED');
    assert.equal((await sourceOwner.owner.reconcileRecovery(credit)).stage, 'CONFIRMED');
    const deliveryCredit = { transactionHash: bare(original.transactionHash),
      calldataSHA256: hash(Buffer.from(original.request.data.slice(2), 'hex')) };
    assert.equal((await targetOwner.owner.reconcileDepositIntent(deliveryCredit)).stage, 'CONFIRMED');
    assert.equal((await targetOwner.owner.reconcileDepositIntent(deliveryCredit)).stage, 'CONFIRMED');
    // A failed catalogue admission can latch its fence. Do not clear it or
    // manufacture exit eligibility; retain original recovered/exposed balances.
    const restored = await ownerView();
    result.failureRecovery = { originalCutoff: graphCutoff, ownerAbsentAtIssuance: ownerAbsentAtRecovery,
      recoveryThroughExactSDK: true, originalFailurePreserved: true, solverPayoutIssued: false,
      solverUnderlyingLoss: '100', nativeVaultEffects: 1, ownerExitsAttempted: false,
      remainingPrivateBalances: restored.assets.map(asset => ({ assetId: asset.asset.assetId, balances: asset.balances })),
      catalogueAdmissionsFenced: catalogue.status().admissionFault };
    result.partialDeliveryRecoveryAcceptance = false;
    if (timeoutRecovery) {
      assert.equal(restored.status, 'LIVE'); assert.equal(restored.coherent, true);
      assert.equal(restored.assets[0].requests.find(item => item.requestId === graphId)?.disposition, 'RECOVERED');
      const poolStates = await Promise.all(fixture.readers.map(async reader => (await reader.read()).ledger.publicState));
      const vault = await vaultActor.observe();
      result.finalPools = poolStates;
      // recovery120 labels an existing subset of available500: never 500+120.
      result.recoveryBalances = { source: restored.assets[0].balances, target: restored.assets[1].balances,
        solverPaltAtomic: String(await capabilities[0].balance(runtime.accounts[1])),
        targetExternalBltvAtomic: String(await capabilities[1].balance(runtime.accounts[4])),
        sourcePoolBackingAtomic: poolStates[0].backedAmount, targetPoolBackingAtomic: poolStates[1].backedAmount,
        vaultAssetsAtomic: vault.snapshot.totalAssets, vaultSharesAtomic: vault.snapshot.totalShares };
      result.originalFRecovery = { actualFProofAccepted: true, originalRequestId: graphId, disposition: 'RECOVERED',
        recoveryCutoffPreserved: true, repeatedRecoveryNoEffect: true, nativeLegNotResubmitted: true,
        ownersRestartedAfterRecovery: true, coordinatorMode: 'SAME_ORIGINAL_AUTHENTICATED_JOURNAL_REOPEN',
        coordinatorProcessRestart: false, originalListenerReplaced: true, oldGrantRejected: true,
        originalBindingsUnchanged: true };
      result.originalGeneration = { generationId: generation.generationId, poolCount: fixture.system.pools.length,
        requestIds: [...originalHandoffs.keys()], bindingsUnchanged: true };
      await checkpointBindings();
      result.exactActionEvidenceAfterRestart = appDriver.evidence();
      result.manualConsentContractVerified = true;
      result.actualTimeoutFRecoveryAcceptance = true;
    }
    await audit();
    return true;
  }

  try {
    save(); fixture = await createOwnedEvmVaultFixture(privateDirectory, { onStage: stage, onDeployment: audit });
    const { runtime, system, assets, capabilities, sourceOwner, targetOwner, readers, quorum, evmDelivery, router } = fixture;
    const assetArtifacts = loadBackedAssetDeploymentArtifacts().artifacts;
    execution = await createFlatNativeExecution({ runtime, system, poolIndex: 0,
      bitcoin: null, solana: null, evmDelivery, quorum }, {
      onProof: retainProof, onPrivateAudit: audit, onStage: async value => {
        await stage(value.stage);
        if (timeoutRecovery && value.stage === 'native-delivered-0') {
          assert.equal(result.controlledPostDeliveryInterruption, undefined, 'MANUAL_ACCEPTANCE_INTERRUPTION_ONCE');
          result.controlledPostDeliveryInterruption = true;
          result.expectedInterruptionCode = 'MANUAL_ACCEPTANCE_CONTROLLED_AFTER_DELIVERY'; save();
          throw Object.assign(new Error('MANUAL_ACCEPTANCE_CONTROLLED_AFTER_DELIVERY'),
            { code: 'MANUAL_ACCEPTANCE_CONTROLLED_AFTER_DELIVERY' });
        }
      } });
    for (const [poolIndex, owner] of [sourceOwner, targetOwner].entries())
      accounts.push(await createFlatAccountAuthority({ runtime, system, poolIndex, owner,
        nativeExecution: poolIndex === 0 ? execution : null,
        accountId: 'vault_asset_' + poolIndex, journalId: 'vault_asset_journal_' + poolIndex }, {
        onProof: retainProof, onPrivateAudit: audit, onStage: value => stage('account-' + poolIndex + '-' + value.stage) }));
    portfolio = createFlatPortfolioAuthority({ runtime, system,
      accounts: accounts.map((account, poolIndex) => ({ poolIndex, account })),
      accountId: 'private_vault_account', journalId: 'private_vault_journal' });
    vaultActor = await createOwnedBackedVault({ runtime, deployment: assets.backedVaultDeployment,
      sender: bare(runtime.accounts[4]), receiver: bare(runtime.accounts[4]) });
    vaultExit = await createOwnedPrivateVaultExit({ runtime, system, poolIndex: 1, account: accounts[1], vault: vaultActor });
    const poolAdmissions = await createFlatPoolAdmissionPolicy({ runtime, system,
      accounts: accounts.map((account, poolIndex) => ({ poolIndex, account })), routeOrder: accounts.map(account => account.assetId) });
    generation = await createFlatJournalGeneration({ runtime, portfolio, poolAdmissions,
      journal: { path: join(privateDirectory, 'mixed-portfolio.vault'), password: freshFixtureId() } });
    catalogue = await createFlatJournalCatalogue({ runtime, initialGeneration: generation,
      journal: { path: join(privateDirectory, 'catalogue.vault'), password: freshFixtureId() } });
    bootstrap = await createFlatManualGraphCatalogueSession({ runtime, catalogue }); session = bootstrap.session;
    defiFacade = createGenerationPrivateVaultExit({ runtime, catalogue, services: [vaultExit] });
    assert.equal(system.pools.length, 2); assert.equal(catalogue.status().generations.length, 1);
    await openListener(); await checkpointBindings();

    await stage('explicit-local-funding-and-exact-allowances');
    for (const [label, from, method, args] of [
      ['fund-solver-liquidity', runtime.accounts[0], 'transfer(address,uint256)', [runtime.accounts[1], '100']],
      ['authorize-source-deposit', runtime.accounts[0], 'approve(address,uint256)', [system.pools[0].address, '500']],
      ['authorize-solver-router', runtime.accounts[1], 'approve(address,uint256)', [router.address, '100']],
    ]) await runtime.send(label, { from, to: assets.token.address,
      data: nativeStaticCalldata(assetArtifacts.token, method, args) });
    assert.equal(await capabilities[0].balance(runtime.accounts[1]), 100n);
    assert.equal(await capabilities[0].allowance(runtime.accounts[1], router.address), 100n);
    const topUp = await manualNote(accounts[0].assetId, { requestId: 'vault_top_up', kind: 'TOP_UP',
      amount: '500', exitRecipient: bare(runtime.accounts[3]) });
    await appAccount('prepare', topUp);
    const lostFunding = await appDriver.executeAccountWithLostReply({ requestId: 'vault_top_up' });
    result.responseLoss = lostFunding.loss;
    const { snapshot: fundingSnapshot, loss: _loss, ...fundingEvidence } = lostFunding;
    result.accountRequests.push({ via: browserMode ? 'BROWSER_DOM_EXACT_ONLY_HTTP' : 'NODE_SDK_EXACT_ONLY_HTTP', ...fundingEvidence });
    assert.equal(row(fundingSnapshot, 'vault_top_up').state, 'CONFIRMED');
    await appDuplicateExecute('vault_top_up');
    const fundedCount = runtime.transactions.length;
    await appAccount('reconcile', { requestId: 'vault_top_up' });
    assert.equal(runtime.transactions.length, fundedCount, 'EVM_VAULT_APP_TOP_UP_RECONCILE_RESENT');
    result.sourceFundingConfirmed = true;
    assert.equal((await ownerView()).assets[0].balances.available, '500');

    await stage('preposition-target-note-and-one-generic-vault-action');
    graphCutoff = String((await runtime.time()) + 7200n);
    const graph = await prepareEvmVaultFixtureGraph(fixture, privateDirectory, {
      assetAmount: '100', shareAmount: '100', payoutAmount: '120', cutoff: graphCutoff,
    }, retainProof);
    graphRef = freshFixtureId();
    await accounts[0].ownerActions.registerGraph({ ownerOperationRef: graphRef,
      prepared: graph.prepared, providers: graph.providers });
    const approval = await accounts[0].ownerActions.approveManualEvmGraph({ requestId: graphId, ownerOperationRef: graphRef });
    const graphBody = await bootstrap.bindManualGraph(approval);
    originalHandoffs.set(graphId, structuredClone(graphBody)); await checkpointBindings();
    await appAccount('prepare', graphBody);
    // Review and exact HTTP admission finish while the original view is intact.
    // Suspending beforehand would correctly invalidate that bound live view.
    const graphExecution = await appDriver.reviewAccount('execute', { requestId: graphId });
    const manualGraph = graphExecution.review.accountContext.graph;
    for (const [key, expected] of Object.entries({ sourceAmount: '500', reservedAmount: '120', changeAmount: '380',
      solverUnderlyingAmount: '100', deliveredShares: '100', settleBefore: graphCutoff })) assert.equal(manualGraph[key], expected);
    assert.equal(manualGraph.asset.decimals, 6); originalGraphReviews.set(graphId, structuredClone(manualGraph));
    writeFixturePrivate(join(privateDirectory, 'original-graph-sdk-review.json'), graphExecution.review);
    const settled = await graphExecution.confirmAfterAdmission(async () => {
      assert.equal(runtime.transactions.filter(entry => entry.signed).length, 0,
        'EVM_VAULT_TARGET_MUST_STOP_BEFORE_DELIVERY');
      await targetOwner.suspend();
      result.targetOwnerExitedBeforeDelivery = targetOwner.report().childExited;
      assert.equal(result.targetOwnerExitedBeforeDelivery, true);
      result.targetOwnerSuspendedAfterExactHttpAdmission = true;
    });
    result.accountRequests.push({ via: browserMode ? 'BROWSER_DOM_EXACT_ONLY_HTTP' : 'NODE_SDK_EXACT_ONLY_HTTP',
      requestId: graphId, action: 'execute', admissionSequence: settled.admissionSequence });
    assert.equal(row(settled.snapshot, graphId).state, 'CONFIRMED', 'EVM_VAULT_GRAPH_NOT_CONFIRMED');
    assert.equal(execution.snapshot(graphRef).outcome, 'FULFILLED');
    assert.equal(sourceOwner.report().childExited, true);
    assert.equal(targetOwner.report().childExited, true);
    const source = await readers[0].read(), destination = await readers[1].read();
    assert.equal(source.ledger.publicState.backedAmount, '500');
    assert.equal(source.ledger.publicState.liveReservations, 0);
    assert.equal(source.state.spentTagCount, '4');
    assert.equal(destination.ledger.publicState.backedAmount, '100');
    assert.equal(destination.ledger.publicState.actualAssetBalance, '100');
    const deliveries = runtime.transactions.filter(entry => entry.signed);
    assert.equal(deliveries.length, 1, 'EVM_VAULT_EXACT_ONE_SIGNED_DISPATCH');
    const delivery = deliveries[0]; assert.equal(delivery.receipt.status, '0x1');
    assert.equal(await capabilities[0].balance(runtime.accounts[1]), 0n);
    assert.equal(await capabilities[0].allowance(runtime.accounts[1], router.address), 0n);
    result.actualGlobalClaim = { at: new Date().toISOString(), sourceOwnerAbsent: true, targetOwnerAbsent: true,
      source: source.ledger.publicState, destination: destination.ledger.publicState,
      exactShares: '100', solverPayout: '120', actualUnderlying: '100' };
    result.privateVaultGraphAcceptance = true;
    await audit(); process.stdout.write(JSON.stringify({ result: 'ACTUAL_PRIVATE_VAULT_GLOBAL_CLAIM' }) + '\n');
    const afterClaimCount = runtime.transactions.length;
    await appDuplicateExecute(graphId);
    assert.equal(runtime.transactions.length, afterClaimCount, 'EVM_VAULT_DUPLICATE_GRAPH_SENT');

    await stage('restart-owner-custody-and-account-reconcile-original-note');
    await reopenOriginalOfflineCoordinator();
    await appAccount('reconcile', { requestId: graphId });
    await appAccount('recover', { requestId: graphId }); // fulfilled original: idempotent, no new F proof or send
    assert.equal(execution.snapshot(graphRef).outcome, 'FULFILLED');
    assert.equal(runtime.transactions.length, afterClaimCount, 'MANUAL_ACCEPTANCE_TERMINAL_RECOVERY_SENT');
    result.offlineOriginalRecovery = { reconcile: true, recover: true, terminalNoOp: true, actualFProofAccepted: false };
    await sourceOwner.restart(); await targetOwner.restart();
    const credit = { transactionHash: bare(delivery.transactionHash),
      calldataSHA256: hash(Buffer.from(delivery.request.data.slice(2), 'hex')) };
    assert.equal((await targetOwner.owner.reconcileDepositIntent(credit)).stage, 'CONFIRMED');
    assert.equal((await targetOwner.owner.reconcileDepositIntent(credit)).stage, 'CONFIRMED');
    await appAccount('reconcile', { requestId: graphId });
    assert.equal(runtime.transactions.length, afterClaimCount, 'EVM_VAULT_RESTART_OR_CREDIT_SENT');
    const coherent = await ownerView();
    assert.equal(coherent.status, 'LIVE'); assert.equal(coherent.coherent, true);
    assert.deepEqual(coherent.assets.map(asset => asset.balances.available), ['380', '100']);
    assert.equal(coherent.assets[0].requests.find(value => value.requestId === graphId)?.disposition, 'FULFILLED');
    const positionState = await appState();
    const convertedPosition = assertManualWalletConvertedPosition({ positions: positionState.defi.positions,
      portfolio: positionState.portfolio.generations[0].portfolio, generationId: generation.generationId,
      shareAssetId: accounts[1].assetId, underlyingAssetId: accounts[0].assetId });
    result.originalNotesRecoveredOnce = true;
    result.privatePortfolioAfterConversion = { coherent: coherent.coherent,
      assets: coherent.assets.map(asset => ({ symbol: asset.asset.symbol, available: asset.balances.available })),
      position: convertedPosition };

    await stage('exit-source-change-and-original-target-shares');
    await exitOwnerNote(0, sourceOwner, 'change', 'vault_exit_0');
    await exitOwnerNote(1, targetOwner, 'source', 'vault_exit_1');
    assert.equal(await capabilities[0].balance(runtime.accounts[3]), 380n);
    assert.equal(await capabilities[1].balance(runtime.accounts[4]), 100n);
    result.ownerPrivateExitsAccepted = true;

    await stage('restart-solver-payout-custody-and-exit-once');
    await fixture.recipients[0].close();
    fixture.recipients[0] = await createNativeRecipientProcess({ ...fixture.recipientBoots[0], mode: 'recover' });
    const recipient = fixture.recipients[0], status = await recipient.withdrawalStatus();
    const current = await readers[0].read();
    const position = current.ledger.commitments.indexOf('0x' + status.payoutCommitment);
    assert.ok(position >= 0, 'EVM_VAULT_PAYOUT_NOT_INCLUDED');
    const witness = await recipient.authorizeWithdrawal({ scope: status.scope, policy: status.policy,
      payoutCommitment: status.payoutCommitment, recipient: status.recipient, amount: status.amount,
      epoch: String(BigInt(current.head.timestamp) / 600n), path: current.ledger.tree.path(position) });
    const words = walletInputPublicWords('withdraw_balance', witness);
    assert.equal(noteWordsToHash(words.slice(25, 33)), '0x' + status.canonicalNullifier);
    legacy = createProofProcess({ purpose: 'recipient', modes: ['withdraw_balance'] });
    let payout;
    try {
      const proof = await legacy.prove('withdraw_balance', witness, words, 'vault-solver-payout');
      payout = { proof: Buffer.from(proof.proof).toString('hex'), publicInputs: [...proof.publicInputs], metrics: proof.metrics };
      await retainProof({ label: 'vault-solver-payout', relation: 'withdraw_balance', proof: payout });
    } finally { await legacy.close(); legacy = null; }
    // Metrics are audit metadata, not part of the exact proof transport ABI.
    const exitData = encodeFlatTransaction('withdrawBalance', {
      proof: payout.proof, publicInputs: payout.publicInputs });
    const solverExit = await runtime.send('vault-solver-payout-exit', { to: system.pools[0].address, data: exitData });
    assert.equal(await capabilities[0].balance(runtime.accounts[1]), 120n);
    const replayState = () => readEvmVaultReplayState({ runtime, readers, vault: vaultActor, capabilities,
      sender: system.sender, holders: [...runtime.accounts, ...system.pools.map(pool => pool.address), assets.vault.address, router.address] });
    const beforeReplay = await replayState();
    // Empty backing can reject before the spent-nullifier guard. Require the
    // economic rejection and original spent state, rather than guard precedence.
    const replayReceipt = await runtime.send('reject-vault-solver-payout-replay',
      { to: system.pools[0].address, data: exitData }, '0x0');
    const afterReplay = await replayState();
    const replayEntries = runtime.transactions.filter(entry => entry.transactionHash === replayReceipt.transactionHash);
    assert.equal(replayEntries.length, 1, 'EVM_VAULT_REPLAY_ORIGINAL_JOURNAL');
    const replayEvidence = { original: await runtime.transaction(solverExit.transactionHash),
      replay: await runtime.transaction(replayReceipt.transactionHash), receipt: replayReceipt,
      before: beforeReplay, after: afterReplay, nullifier: '0x' + status.canonicalNullifier,
      actualReason: replayEntries[0].revert?.reason ?? null };
    result.solverPayoutReplay = assertEvmVaultPayoutReplay(replayEvidence);
    writeFixturePrivate(join(privateDirectory, 'solver-payout-replay.json'), replayEvidence);
    assert.equal(await capabilities[0].balance(runtime.accounts[1]), 120n);
    result.solverPayoutRecoveredAndExitedOnce = true;

    await stage('redeem-exited-vault-shares-and-close-backing');
    const redemption = { requestId: 'vault_exit_1', minimumOutput: '100', deadline: String((await runtime.time()) + 240n) };
    const originalExitBefore = await accounts[1].privateStatus();
    const preparedRedemption = await appDefi('prepare', redemption);
    const originalExitAfter = await accounts[1].privateStatus();
    assert.deepEqual(originalExitAfter, originalExitBefore, 'MANUAL_WALLET_CONFIRMED_EXIT_REVIEW_CHANGED_ORIGINAL_STATE');
    writeFixturePrivate(join(privateDirectory, 'original-exit-review-state.json'), { before: originalExitBefore, after: originalExitAfter });
    result.originalExitReviewStateUnchanged = true;
    assert.equal(preparedRedemption.shares, '100'); assert.equal(preparedRedemption.phase, 'READY_TO_REDEEM');
    const redemptionResult = await appDefi('execute', { requestId: redemption.requestId });
    assert.equal(redemptionResult.phase, 'REDEEMED'); assert.equal(redemptionResult.redeemedUnderlying, '100');
    assert.equal(redemptionResult.underlyingPrivateSpendable, false);
    const redeemed = await vaultExit.originalReceipt(redemption.requestId);
    assertOwnedBackedVaultReceipt(vaultActor, redeemed);
    writeFixturePrivate(join(privateDirectory, 'vault-redemption.json'), redeemed);
    const redemptionCount = runtime.transactions.length;
    await appDefi('reopen', {}); await appDefi('prepare', redemption);
    await appDefi('reconcile', { requestId: redemption.requestId });
    await appDriver.duplicateDefiExecute(redemption.requestId); assert.equal(runtime.transactions.length, redemptionCount);
    const finalApp = await appState();
    assert.equal(finalApp.capabilities.graphExecution, false);
    assert.equal(finalApp.defi.snapshot.operations.find(item => item.requestId === redemption.requestId)?.phase, 'REDEEMED');
    result.walletApplicationHttpAcceptance = { originalAccountTopUpAndExit: true,
      originalDeFiPrepareExecuteReconcileReopen: true, originalRequestIdsRetained: true,
      accountHttp200WasVolatileOnly: true, confirmedOriginalJournalObserved: true,
      graphExecutionExposed: false, manualGraphThroughExactSDK: !browserMode, manualGraphThroughExactBrowser: browserMode,
      graphUsedOriginalPrivateHarnessApi: false,
      originalHostManualHandoff: true, authenticatedGrantCommitment: true, explicitScriptedHandoffConfirm: true,
      ownerLocalImmutablePreparations: true, oneMixedKeeper: true, oneCatalogueGeneration: true,
      originalGenerationDeFiFacade: true, exactOneUseReplayRejected: true, noImplicitReauthorization: true,
      browserVisualAcceptance: browserMode, nativeClaimSessionAcceptance: false };
    result.manualPrivateShareExitRedemption = { ...redemptionResult, originalExitBound: true, duplicateNoEffect: true };
    assert.equal(await capabilities[0].balance(runtime.accounts[4]), 100n);
    const vault = await vaultActor.observe();
    assert.equal(vault.snapshot.totalAssets, '0'); assert.equal(vault.snapshot.totalShares, '0');
    result.finalPools = [];
    for (const reader of readers) {
      const value = (await reader.read()).ledger.publicState;
      assert.equal(value.backedAmount, '0'); assert.equal(value.actualAssetBalance, '0');
      assert.equal(value.liveReservations, 0); result.finalPools.push(value);
    }
    result.finalCapacity = assertEvmVaultTerminalPools(result.finalPools);
    const final = await ownerView();
    assert.equal(final.status, 'LIVE');
    assert.deepEqual(final.assets.map(asset => asset.balances.available), ['0', '0']);
    assert.equal(runtime.transactions.filter(entry => entry.signed).length, 1);
    result.originalGeneration = { generationId: generation.generationId, poolCount: system.pools.length,
      requestIds: [...originalHandoffs.keys()], bindingsUnchanged: true };
    await checkpointBindings();
    result.exactActionEvidenceAfterRestart = appDriver.evidence();
    for (const owner of [sourceOwner, targetOwner]) {
      const extension = await owner.ownerView.manualPreparations();
      for (const { review, reauthorizations = [] } of extension.records) {
        assert.deepEqual(review, ownerReviews.get(review.request.requestId));
        assert.deepEqual(reauthorizations, [], 'MANUAL_ACCEPTANCE_IMPLICIT_REAUTHORIZATION');
      }
    }
    assert.equal(ownerReviews.size, 3);
    const terminalTokens = await replayState();
    assert.equal(terminalTokens.accounting.tokens[0].totalSupply, '1000000');
    assert.equal(await capabilities[1].balance(runtime.accounts[4]), 0n);
    result.finalRecipients = { changePaltAtomic: String(await capabilities[0].balance(runtime.accounts[3])),
      solverPaltAtomic: String(await capabilities[0].balance(runtime.accounts[1])),
      targetPaltAtomic: String(await capabilities[0].balance(runtime.accounts[4])), targetBltvAtomic: '0',
      paltTotalSupplyAtomic: terminalTokens.accounting.tokens[0].totalSupply };
    result.finalVault = { totalAssets: vault.snapshot.totalAssets, totalShares: vault.snapshot.totalShares };
    result.economics = { decimals: 6, sourceDepositAtomic: '500', privatePayoutAtomic: '120', sourceChangeAtomic: '380',
      solverOwnUnderlyingAtomic: '100', deliveredPrivateSharesAtomic: '100', redeemedExternalUnderlyingAtomic: '100' };
    result.privateVaultGraphAcceptance = true;
    result.privateExitsAndUnderlyingRedemption = true;
    result.duplicateNoEffect = true; result.walletSdkEvmFlowCompleted = !browserMode; result.walletBrowserEvmFlowCompleted = browserMode;
    result.manualConsentContractVerified = true;
    result.phase = 'completed'; result.success = true; await audit();
  } catch (error) {
    result.failedStage = result.phase; result.phase = 'failed'; result.success = false; result.errorCode = safeCode(error);
    if (!fixture && error.fixtureCleanup) result.cleanup = error.fixtureCleanup;
    writeFixturePrivate(join(privateDirectory, 'error.json'), { message: String(error.message), stack: String(error.stack),
      cause: error.cause ? { message: String(error.cause.message), stack: String(error.cause.stack) } : null });
    result.lastObservedPools = [];
    for (const reader of fixture?.readers ?? []) {
      try { result.lastObservedPools.push((await reader.read()).ledger.publicState); } catch {}
    }
    await audit().catch(() => {});
    if (timeoutRecovery && result.controlledPostDeliveryInterruption === true) {
      try {
        const failed = (await appState()).account.snapshot.admissions.filter(item =>
          item.action === 'execute' && item.requestId === graphId && item.state === 'FAILED');
        assert.equal(failed.length, 1, 'EVM_VAULT_ORIGINAL_FAILED_ADMISSION_REQUIRED');
        assert.equal(failed[0].errorCode, result.errorCode);
        result.originalFailedAdmission = structuredClone(failed[0]);
      } catch (observationError) {
        result.errorCode = safeCode(observationError);
      }
    }
    let recovered = false;
    try { recovered = await recoverOriginalFailedDelivery(); }
    catch (recoveryError) {
      result.failureRecoveryError = safeCode(recoveryError);
      writeFixturePrivate(join(privateDirectory, 'failure-recovery-error.json'), {
        message: String(recoveryError.message), stack: String(recoveryError.stack) });
    }
    // Only the fixed F worker can accept the exact intentional interruption.
    // An arbitrary failure or a happy-path fallback remains failed.
    // The real public session sanitizes private exception codes; preserve that
    // rejection rather than widening its allowed labels for a test harness.
    const expected = timeoutRecovery && recovered === true && result.controlledPostDeliveryInterruption === true
      && result.expectedInterruptionCode === 'MANUAL_ACCEPTANCE_CONTROLLED_AFTER_DELIVERY'
      && result.failedStage === 'native-delivered-0' && result.errorCode === 'FLAT_ACCOUNT_OPERATION_FAILED';
    if (expected) {
      result.actualAdmissionFailureCode = result.errorCode; result.expectedInterruptionPreserved = true;
      delete result.errorCode; result.phase = 'completed'; result.success = true;
    } else { result.phase = 'failed'; result.success = false; }
    save();
  } finally {
    await cleanup(); process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    if (result.cleanup.closedEvm !== true) { result.success = false; result.phase = 'failed'; }
    try { assert.deepEqual(captureSources(), result.sourcePins); result.sourceUnchanged = true; }
    catch { result.sourceUnchanged = false; result.success = false; result.phase = 'failed'; }
    result.finishedAt = new Date().toISOString(); result.milliseconds = performance.now() - began; save();
    if (result.success) {
      try { if (browserMode) assertManualWalletBrowserResult(result);
        else if (timeoutRecovery) assertManualWalletRecoveryResult(result); else assertManualWalletResult(result); }
      catch (error) { result.success = false; result.phase = 'failed'; result.errorCode = safeCode(error); save(); }
    }
    if (!result.success) process.exitCode = 1;
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await runManualWalletAcceptance();
