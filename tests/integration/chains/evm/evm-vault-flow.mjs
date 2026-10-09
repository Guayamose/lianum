import {sha as canonicalJournalSHA} from '../../../../packages/engine/src/execution/accounts/generic-account-journal.mjs';
/** Actual affected path: one private underlying reservation pays a solver only after
 * its gated official action backs the preauthorized private output note.
 * This uses one owned local EVM and the original four-slot generic protocol.
 * Native action amounts/timing and the common-host keeper remain observable.
 */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFlatManualGraphAccountSession } from '../../../../packages/backend/src/api/accounts/flat-manual-graph-session.mjs';
import { createNativeRecipientProcess } from '../../../../packages/engine/src/execution/native/recipients/native-recipient-process.mjs';
import { createProofProcess } from '../../../../packages/engine/src/execution/proofs/proof-process.mjs';
import { walletInputPublicWords } from '../../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { noteWordsToHash } from '../../../../packages/engine/src/notes/private-note-tree.mjs';
import { nativeStaticCalldata } from '../../../../packages/engine/src/execution/native/dispatch/native-deployment.mjs';
import { ROOT } from '../../../../packages/proofs/src/catalog.mjs';
import { hash } from '../../../../packages/proofs/src/tooling/tooling.mjs';
import { createOwnedEvmVaultFixture, createOwnedRetainedMetaMorphoVaultFixtureV1, createOwnedRetainedAaveVaultFixtureV1, prepareEvmVaultFixtureGraph } from '../../fixtures/chains/evm/owned-evm-vault-fixture.mjs';
import { freshFixtureId, fixtureJSON, writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';
import { evmVaultSourcePins } from '../../runners/source-pins.mjs';
import { NATIVE_FLOW_LIMITS } from '../../native/native-flow-supervisor.mjs';
import { readEvmVaultReplayState, assertEvmVaultPayoutReplay, assertEvmVaultTerminalPools,
  EVM_UNISWAP_RECOVERY_RESULT, assertEvmUniswapRecoveryResult } from './evm-vault-terminal-checks.mjs';
import { loadBackedAssetDeploymentArtifacts } from '../../../../packages/backend/src/operations/deployments/defi/deploy-backed-assets.mjs';
import { createFlatNativeExecution } from '../../../../packages/backend/src/execution/account/execution/flat-native-execution.mjs';
import { encodeFlatTransaction } from '../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { createFlatAccountAuthority } from '../../../../packages/backend/src/accounts/authority/flat-account-authority.mjs';
import { createFlatPortfolioAuthority } from '../../../../packages/backend/src/accounts/authority/flat-portfolio-authority.mjs';
import { startFlatAccountHttp } from '../../../../packages/backend/src/api/accounts/flat-account-http.mjs';
import { startWalletApplication } from '../../../../apps/wallet/src/server/server.mjs';
import { createManualWalletAppDriver } from '../../wallet/manual/manual-wallet-app-driver.mjs';
import { createOwnedMetaMorphoVault, createOwnedAaveStaticVaultV1, assertOwnedMetaMorphoReceipt } from '../../../../packages/backend/src/defi/vaults/owned-metamorpho-vault.mjs';
import { createPrivateVaultPortfolioView } from '../../../../packages/backend/src/defi/vaults/private-vault-position.mjs';
import { createOwnedPrivateVaultExit } from '../../../../packages/backend/src/defi/withdrawals/private-vault-exit.mjs';

import {createRetainedMetaMorphoNoteExitWalletV1,createRetainedAaveNoteExitWalletV1} from '../../../../packages/backend/src/accounts/recovery/external-defi-retained-vault-wallet-v1.mjs';
import {externalDefiVaultExitSourcePinsV1} from './external-defi-vault-exit-source-pins-v1.mjs';
import {captureAndLaunchExternalDefiVaultExitSuccessorV1} from '../../wallet/native/native-device-economic-launcher-v1.mjs';
import {assertExternalDefiVaultExitRecoveryResultV1} from './external-defi-vault-exit-policy-v1.mjs';
import { aavePrivateGraphSourcePinsV1 } from './aave-private-graph-source-pins-v1.mjs';
const bare = value => value.slice(2);
// The fixed supervisor entries reuse this original worker. Neither accepts
// an argv/environment selector or changes the proof/custody authority.
const SCENARIOS = Object.freeze({
  'integration/run-evm-metamorpho-exit-recovery-v1.mjs':Object.freeze({protocol:'OFFICIAL_METAMORPHO_V1',local:'.local/external-defi-owner-cycle-v1',retainedExit:true}),
  'integration/run-evm-aave-exit-recovery-v1.mjs':Object.freeze({protocol:'OFFICIAL_AAVE_STATIC_V1',local:'.local/external-defi-owner-cycle-v1',retainedExit:true}),
  'integration/run-evm-vault-flow.mjs': Object.freeze({ protocol: 'OFFICIAL_METAMORPHO_V1', local: '.local/evm-vault-flow' }),
  'integration/run-evm-aave-flow.mjs': Object.freeze({protocol:'OFFICIAL_AAVE_STATIC_V1',local:'.local/evm-aave-flow-v1'}),
  'integration/run-evm-uniswap-flow.mjs': Object.freeze({ protocol: 'OFFICIAL_UNISWAP_V3_V1', local: '.local/evm-uniswap-flow' }),
  'integration/run-evm-uniswap-recovery-flow.mjs': Object.freeze({ protocol: 'OFFICIAL_UNISWAP_V3_V1',
    local: '.local/evm-uniswap-recovery-flow', recovery: true }),
});
const safeCode = error => {
  const value = error?.code ?? error?.message ?? '';
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{2,160}$/.exec(value)?.[0] === value
    ? value : 'FLAT_EVM_VAULT_FLOW_FAILED';
};

async function main() {
  assert.equal(process.argv.length, 2);
  assert.equal(realpathSync(process.argv[1]), fileURLToPath(import.meta.url));
  assert.deepEqual(process.execArgv, []);
  assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
  assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length, 2);
  const parentEntry = realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1]));
  const scenario = Object.entries(SCENARIOS).find(([entry]) => parentEntry === join(ROOT, entry))?.[1];
  assert.ok(scenario, 'EVM_VAULT_FIXED_ORIGINAL_SUPERVISOR');
  const PROTOCOL_PROFILE = scenario.protocol, AAVE = PROTOCOL_PROFILE === 'OFFICIAL_AAVE_STATIC_V1',
    UNISWAP = PROTOCOL_PROFILE === 'OFFICIAL_UNISWAP_V3_V1', RECOVERY = scenario.recovery === true, RETAINED_EXIT=scenario.retainedExit===true;
  assert.ok(!RECOVERY || UNISWAP, 'EVM_UNISWAP_F_FIXED_PROTOCOL_ONLY');
  const SOURCE = '5000000', SHARES = UNISWAP ? '1000' : AAVE ? '1000000' : '1000000000000000000',
    INPUT = UNISWAP ? '2000' : AAVE ? '1100000' : '1000000', PAYOUT = UNISWAP ? '1200' : '1200000',
    CHANGE = String(BigInt(SOURCE) - BigInt(PAYOUT));
  const lock = JSON.parse(readFileSync(join(ROOT, scenario.local, 'active.lock')));
  assert.equal(lock.pid, process.ppid);
  assert.match(lock.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt, scenario.local + '/attempt-' + lock.runId);
  const directory = join(ROOT, lock.attempt), privateDirectory = join(directory, 'private-audit');
  const proofDirectory = join(directory, 'public-proofs');
  mkdirSync(privateDirectory, { mode: 0o700 });
  mkdirSync(proofDirectory, { mode: 0o700 });
  const began = performance.now();
  const result = {
    format: RECOVERY ? EVM_UNISWAP_RECOVERY_RESULT : 'FLAT_WALLET_EVM_VAULT_FLOW_RESULT_V1', runId: lock.runId,
    startedAt: new Date().toISOString(), phase: 'starting', success: false,
    localOnly: true, fakeFundsOnly: true, publicNetwork: false,
    supervisor: { supervisorPID: process.ppid, workerPID: process.pid }, sourcePins: RETAINED_EXIT?externalDefiVaultExitSourcePinsV1():AAVE ? aavePrivateGraphSourcePinsV1() : evmVaultSourcePins(),
    stages: [], proofs: [], transactions: [], accountRequests: [], nativeEffects: { evmVault: 0 },
    cleanup: { closedEvm: false }, keeperRestart: false, nodeRestart: false,
    protocolProfile: PROTOCOL_PROFILE, privateVaultGraphAcceptance: false, privateUniswapGraphAcceptance: false, privateAaveGraphAcceptance: false,
    partialDeliveryRecoveryAcceptance: false, privateUniswapTimeoutRecoveryAcceptance: false,
    systemicPrivacyAcceptance: false, independentOperators: false,
    realClockFinalityAcceptance: false, performanceTargetAchieved: false, fullWalletAcceptance: false,
    disclosure: [
      UNISWAP ? 'One owned local EVM, official Uniswap V3 fee-3000 exact-output swap with synthetic tokens, controlled local inclusion and one canonical confirmation.'
        : AAVE ? 'One owned local EVM, official Aave V3/StaticATokenLM with synthetic underlying and genuine paid Pool yield, one canonical confirmation.'
        : 'One owned local EVM, official MetaMorpho with synthetic underlying, controlled local inclusion and one canonical confirmation.',
      'Solver supplies public input. Source private reserve pays only after exact destination private note backing is proven.',
      'The router action, amounts, K, protocol and destination pool remain public. Common-host observers/keeper are trusted.',
      RETAINED_EXIT?'Planned original closure after terminal graph/payout/EXIT/redemption; a new backend child opens the same five-section issuer and reconciles existing receipts. The audit parent remains alive; abrupt loss and GRAPH recovery are not established.':'Two encrypted owner children and a disposable account coordinator restart; the original authority and EVM survive.',
      'This exercises one registered EVM action under the generic relation; arbitrary DeFi and seven-chain acceptance remain unproved.',
      ...(RECOVERY ? ['Controlled interruption after the one completed swap/D27 delivery, before I/N/T; no physical network outage is claimed.',
        'F refunds the original source reserve at its signed cutoff. The swap is irreversible: target owns the delivered note; solver loses its actual input and receives no payout.'] : []),
    ],
  };
  const save = () => writeFixturePrivate(join(directory, 'result.json'), result);
  async function stage(name) {
    result.phase = name;
    result.stages.push({ name, at: new Date().toISOString(), elapsedMilliseconds: performance.now() - began });
    save(); process.stdout.write(JSON.stringify({ stage: name }) + '\n');
  }
  let fixture, execution, portfolio, keeper, session, http, walletApp, appDriver, vaultActor, vaultExit, legacy, manualSession, privateView;
  let retainedExitWallet,externalSuccessor,retainedExitCaptured=false;
  let solverBalanceBeforeDelivery, solverBalanceAfterDelivery;
  let graphRef, graphCutoff, solverPayoutCommitment, reserveNullifier;
  const graphId = 'private_vault_graph';
  let closed = false, interrupted = false;
  const accounts = [], ownerPreparations = [];
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
    if(externalSuccessor){try{const status=await externalSuccessor.close();result.cleanup.closedSuccessor=status.originalChildProcessClosed===true;result.externalVaultBackendRecovery.successorClosure=status;}catch(error){result.cleanup.closedSuccessor=false;result.success=false;result.phase='failed';result.cleanup.successorError=safeCode(error);}}
    if (walletApp) await walletApp.close().catch(() => {});
    await Promise.allSettled([...accounts.map(account => account.abort()), execution?.abort(), legacy?.close()].filter(Boolean));
    if (http) await http.close().catch(() => {});
    else if (session) await session.close().catch(() => {});
    else await keeper?.close().catch(() => {});
    try { portfolio?.close(); } catch {}
    for (const account of accounts) await account.close().catch(() => {});
    await execution?.close().catch(() => {});
    if(retainedExitWallet&&!retainedExitCaptured)await retainedExitWallet.close().catch(error=>{result.cleanup.retainedWalletError=safeCode(error);result.success=false;result.phase='failed';});
    if (fixture) result.cleanup = {...result.cleanup,...await fixture.close()};
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
  async function request(action, body = {}) {
    const response = await fetch(http.origin + '/api/flat-account/' + action, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: http.origin, 'x-flat-account-token': http.clientAccess.token },
      body: JSON.stringify(body) });
    assert.equal(response.status, 202, 'EVM_VAULT_HTTP_ADMISSION');
    assert.equal((await response.json()).admitted, true);
    const view = await session.idle();
    result.accountRequests.push({ action, requestId: body.requestId ?? null,
      lastAdmission: view.admissions.at(-1), phase: view.phase }); save(); return view;
  }
  const appState = () => appDriver.state();
  const appDefi = (action, body) => appDriver.defi(action, body);
  async function appAccount(action, body) {
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
    // The original manual session supplies wallet notes; official valuation is
    // read separately through the branded portfolio/vault at the same head.
    if (UNISWAP) return value.portfolio;
    const original = await privateView();
    assert.deepEqual(original.assets.map(row => row.balances), value.portfolio.assets.map(row => row.balances));
    return original;
  }
  async function exitOwnerNote(index, owner, role, requestId) {
    const preparation = ownerPreparations[index];
    const review = RETAINED_EXIT?await retainedExitWallet.catalogue.reviewOwnerPreparation({assetId:retainedExitWallet.accounts[index].assetId,request:{requestId,kind:'EXIT',role}}):await preparation.review({ requestId, kind: 'EXIT', role });
    assert.equal(review.kind, 'EXIT'); assert.equal(review.recipient, bare(index === 0 ? fixture.runtime.accounts[3] : fixture.targetExitRecipient));
    const body = RETAINED_EXIT?await retainedExitWallet.catalogue.confirmOwnerPreparation():await preparation.confirm(); assert.equal(body.requestId, requestId);
    await appAccount('prepare', body);
    assert.equal(row(await appAccount('execute', { requestId }), requestId).state, 'CONFIRMED');
    const completedCount = fixture.runtime.transactions.length;
    await appAccount('reconcile', { requestId });
    await appDuplicateExecute(requestId);
    assert.equal(fixture.runtime.transactions.length, completedCount, 'EVM_VAULT_APP_RECONCILE_RESENT');
  }

  /** Failure-only acceptance, not an automatic wallet policy. Keep the original
   * error, use the owner's original F and deliberately advance LOCAL time to
   * that exact signed cutoff. Never dispatch, replace or replay the vault leg.
   * Any unsafe/unknown runtime or unavailable original evidence stops this too.
   */
  async function recoverOriginalFailedDelivery() {
    if (!fixture || !execution || !graphRef || !graphCutoff) return;
    const state = execution.snapshot(graphRef);
    if (state.outcome !== null || !state.nativeExposure.some(item => item.status === 'DELIVERED')) return false;
    if (RECOVERY) {
      assert.equal(result.controlledPostDeliveryInterruption, true);
      assert.deepEqual(state.nativeExposure, [{ slot: 0, family: '3', status: 'DELIVERED' }]);
      assert.equal(state.admittedReceipts, 0, 'UNISWAP_F_NO_I_OR_N');
      assert.equal(fixture.sourceOwner.report().available, false);
      assert.equal(fixture.targetOwner.report().available, false);
    }
    const { runtime, sourceOwner, targetOwner, capabilities } = fixture;
    const originals = runtime.transactions.filter(entry => entry.signed && entry.receipt?.status === '0x1');
    assert.equal(originals.length, 1, 'EVM_VAULT_RECOVERY_EXACT_ORIGINAL');
    const original = originals[0], ownerAbsentAtRecovery = !sourceOwner.report().available;
    const replayState = () => readEvmVaultReplayState({ runtime, readers: fixture.readers,
      protocolFixture: fixture.officialProtocol, capabilities, sender: fixture.system.sender,
      holders: [...runtime.accounts, ...fixture.system.pools.map(pool => pool.address),
        fixture.router.address, fixture.officialProtocol.pool.address, fixture.officialProtocol.swapRouter.address] });
    const deliveredState = RECOVERY ? await replayState() : null;
    if (RECOVERY) {
      solverBalanceAfterDelivery = await capabilities[0].balance(fixture.solver);
      assert.equal(await capabilities[0].allowance(fixture.solver, fixture.router.address), 0n);
      assert.equal(deliveredState.accounting.pools[0].publicState.backedAmount, SOURCE);
      assert.equal(deliveredState.accounting.pools[1].publicState.backedAmount, SHARES);
      assert.equal(deliveredState.accounting.pools[1].publicState.actualAssetBalance, SHARES);
      assert.equal(deliveredState.accounting.pools[0].hubState.spentTagCount, '0');
      assert.equal(deliveredState.accounting.pools[0].hubState.receiptCount, '0', 'UNISWAP_F_NO_ADMISSION_RECEIPTS');
    }
    await stage('failure-only-original-cutoff-recovery');
    if (await runtime.time() < BigInt(graphCutoff)) await runtime.advanceTo(graphCutoff);
    const recovered = await appAccount('recover', { requestId: graphId });
    assert.equal(row(recovered, graphId).state, 'CONFIRMED', 'EVM_VAULT_FAILURE_RECOVERY_UNRESOLVED');
    assert.equal(execution.snapshot(graphRef).outcome, 'RECOVERED', 'EVM_VAULT_FAILURE_NOT_RECOVERED');
    if (RECOVERY) {
      assert.equal(sourceOwner.report().available, false, 'UNISWAP_F_OWNER_KEY_ABSENT');
      assert.equal(targetOwner.report().available, false, 'UNISWAP_F_TARGET_KEY_ABSENT');
      const proofs = result.proofs.filter(row => row.relation === 'recovery');
      assert.equal(proofs.length, 1, 'UNISWAP_F_SINGLE_ORIGINAL_PROOF');
      const inputs = JSON.parse(readFileSync(join(proofDirectory, proofs[0].file + '.inputs.json'), 'utf8'));
      assert.equal(inputs.length, 41); assert.equal(BigInt(inputs[40]), BigInt(graphCutoff), 'UNISWAP_F_CUTOFF_UNCHANGED');
      const recoveredState = await replayState();
      assert.deepEqual(recoveredState.accounting.uniswap, deliveredState.accounting.uniswap, 'UNISWAP_F_CANNOT_UNDO_SWAP');
      assert.deepEqual(recoveredState.accounting.tokens, deliveredState.accounting.tokens, 'UNISWAP_F_TOKEN_ACCOUNTING_CHANGED');
      assert.equal(recoveredState.accounting.pools[0].nullifiers.includes('0x' + reserveNullifier), true);
      assert.equal(recoveredState.accounting.pools[0].commitments.includes('0x' + solverPayoutCommitment), false, 'UNISWAP_F_NO_SOLVER_PAYOUT');
      const proofCount = result.proofs.length, transactionCount = runtime.transactions.length;
      await appAccount('recover', { requestId: graphId });
      await appAccount('reconcile', { requestId: graphId });
      await request('execute', { requestId: graphId });
      assert.equal(result.proofs.length, proofCount, 'UNISWAP_F_REPROVED');
      assert.equal(runtime.transactions.length, transactionCount, 'UNISWAP_F_RESENT');
      assert.deepEqual(await replayState(), recoveredState, 'UNISWAP_F_DUPLICATE_ACCOUNTING_CHANGED');
      result.originalFRecovery = { actualFProofAccepted: true, originalRequestId: graphId, disposition: 'RECOVERED',
        cutoff: graphCutoff, publicInputCount: inputs.length, publicInputCutoff: BigInt(inputs[40]).toString(),
        ownersAbsentAtIssuance: true, admittedReceipts: 0, repeatedRecoveryNoEffect: true,
        duplicateExecuteNoEffect: true, originalSwapNotResubmitted: true, swapAccountingUnchanged: true,
        solverPayoutCommitmentIncluded: false };
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
    const restored = await ownerView();
    assert.deepEqual(restored.assets.map(asset => asset.balances.available), [SOURCE, SHARES]);
    if (RECOVERY) {
      assert.equal(restored.status, 'LIVE'); assert.equal(restored.coherent, true);
      assert.deepEqual(restored.assets[0].balances, { available: SOURCE, reserved: '0', recovery: PAYOUT, locked: '0' });
      assert.deepEqual(restored.assets[1].balances, { available: SHARES, reserved: '0', recovery: '0', locked: '0' });
      assert.equal(restored.assets[0].requests.find(row => row.requestId === graphId)?.disposition, 'RECOVERED');
      result.recoveryBalances = { source: restored.assets[0].balances, target: restored.assets[1].balances,
        sourceRefundAtomic: PAYOUT, sourceChangeAtomic: CHANGE, sourceTotalAvailableAtomic: SOURCE };
    }
    await exitOwnerNote(0, sourceOwner, 'recovery', 'failure_exit_recovery');
    await exitOwnerNote(0, sourceOwner, 'change', 'failure_exit_change');
    await exitOwnerNote(1, targetOwner, 'source', 'failure_exit_target');
    assert.equal(await capabilities[0].balance(runtime.accounts[3]), BigInt(SOURCE));
    const solverAfter = await capabilities[0].balance(fixture.solver);
    const spent = solverBalanceBeforeDelivery - solverAfter;
    assert.ok(spent > 0n && spent <= BigInt(INPUT), 'EVM_VAULT_RECOVERY_ORIGINAL_SPEND');
    if (!UNISWAP && !AAVE) assert.equal(spent, BigInt(INPUT));
    if (RECOVERY) assert.equal(solverAfter, solverBalanceAfterDelivery, 'UNISWAP_F_SOLVER_MUST_BEAR_ACTUAL_LOSS');
    assert.equal(await capabilities[1].balance(fixture.targetExitRecipient), BigInt(SHARES));
    const finalPools = [];
    for (const reader of fixture.readers) {
      const value = (await reader.read()).ledger.publicState;
      assert.equal(value.backedAmount, '0'); assert.equal(value.actualAssetBalance, '0');
      assert.equal(value.liveReservations, 0); finalPools.push(value);
    }
    assert.equal(runtime.transactions.filter(entry => entry.signed).length, 1, 'EVM_VAULT_FAILURE_RESENT');
    result.failureRecovery = { originalCutoff: graphCutoff, ownerAbsentAtIssuance: ownerAbsentAtRecovery,
      sourceRefundAndChangeExited: SOURCE, originalDeliveredOutputExited: SHARES, solverPayoutIssued: false,
      solverUnderlyingLoss: String(spent), nativeVaultEffects: 1, finalPools, originalFailurePreserved: true };
    result.partialDeliveryRecoveryAcceptance = true;
    if (RECOVERY) {
      const final = await ownerView();
      assert.equal(final.status, 'LIVE'); assert.equal(final.coherent, true);
      assert.deepEqual(final.assets.map(row => row.balances.available), ['0', '0']);
      result.finalPools = finalPools;
      result.originalPrivateExits = { sourceRefundAtomic: PAYOUT, sourceChangeAtomic: CHANGE,
        sourceTotalExitedAtomic: SOURCE, targetOutputExitedAtomic: SHARES, duplicateNoEffect: true };
      result.economics = { sourceDepositAtomic: SOURCE, reservedAtomic: PAYOUT, changeAtomic: CHANGE,
        maximumInputAtomic: INPUT, actualInputAtomic: String(spent), deliveredOutputAtomic: SHARES,
        solverBalanceBeforeDelivery: String(solverBalanceBeforeDelivery),
        solverBalanceAfterDelivery: String(solverBalanceAfterDelivery), solverFinalBalance: String(solverAfter),
        solverPayoutAtomic: '0', swapIrreversible: true, targetKeepsOriginalOutput: true };
      result.sourcePrivateReservationEstablished = true; result.privateOutputExitEstablished = true;
      result.duplicateNoEffect = true; result.originalExactConsent = appDriver.evidence();
      result.privateUniswapTimeoutRecoveryAcceptance = true;
    }
    await audit(); return true;
  }

  try {
    save(); fixture = RETAINED_EXIT?await(AAVE?createOwnedRetainedAaveVaultFixtureV1:createOwnedRetainedMetaMorphoVaultFixtureV1)(privateDirectory,{onStage:stage,onDeployment:audit}):await createOwnedEvmVaultFixture(privateDirectory, { onStage: stage, onDeployment: audit, protocolProfile: PROTOCOL_PROFILE });
    const { runtime, system, assets, capabilities, sourceOwner, targetOwner, readers, quorum, evmDelivery, router, solver, targetExitRecipient, officialProtocol } = fixture;
    if(AAVE)writeFixturePrivate(join(privateDirectory,'aave-new-compilation.json'),officialProtocol.compilation);
    const assetArtifacts = loadBackedAssetDeploymentArtifacts().artifacts;
    execution = await createFlatNativeExecution({ runtime, system, poolIndex: 0,
      bitcoin: null, solana: null, evmDelivery, quorum }, {
      onProof: retainProof, onPrivateAudit: audit, onStage: async value => {
        await stage(value.stage);
        if (RECOVERY && value.stage === 'native-delivered-0') {
          assert.equal(result.controlledPostDeliveryInterruption, undefined, 'UNISWAP_F_INTERRUPT_ONCE');
          result.controlledPostDeliveryInterruption = true;
          result.expectedInterruptionCode = 'UNISWAP_F_CONTROLLED_AFTER_DELIVERY'; save();
          throw Object.assign(new Error('UNISWAP_F_CONTROLLED_AFTER_DELIVERY'),
            { code: 'UNISWAP_F_CONTROLLED_AFTER_DELIVERY' });
        }
      } });
    for (const [poolIndex, owner] of [sourceOwner, targetOwner].entries())
      accounts.push(await createFlatAccountAuthority({ runtime, system, poolIndex, owner,
        nativeExecution: poolIndex === 0 ? execution : null,
        accountId: 'vault_asset_' + poolIndex, journalId: 'vault_asset_journal_' + poolIndex }, {
        onProof: retainProof, onPrivateAudit: audit, onStage: value => stage('account-' + poolIndex + '-' + value.stage) }));
    // Retained profiles bind note preparation only to their original note
    // catalogue below. These separate accounts keep the private GRAPH path.
    if(!RETAINED_EXIT)for (const account of accounts) ownerPreparations.push(await account.ownerActions.createManualPreparation());
    portfolio = createFlatPortfolioAuthority({ runtime, system,
      accounts: accounts.map((account, poolIndex) => ({ poolIndex, account })),
      accountId: 'private_vault_account', journalId: 'private_vault_journal' });
    if (!UNISWAP) {
      if(RETAINED_EXIT){retainedExitWallet=await(AAVE?createRetainedAaveNoteExitWalletV1:createRetainedMetaMorphoNoteExitWalletV1)({runtime,system,owners:[sourceOwner,targetOwner],protocolFixture:officialProtocol},{onProof:retainProof});vaultActor=retainedExitWallet.vault;vaultExit=retainedExitWallet.exit;
        result.externalVaultBackendRecovery={profile:'ORIGINAL_RETAINED_OFFICIAL_VAULT_EXIT_BACKEND_V1',variant:AAVE?'AAVE_STATIC':'METAMORPHO',bornBeforeFunding:true,originalGraphRecoveryEstablished:false,abruptCrashRecoveryEstablished:false,parentProcessExitEstablished:false};
      }else{vaultActor = await (AAVE ? createOwnedAaveStaticVaultV1 : createOwnedMetaMorphoVault)({ runtime, protocolFixture: officialProtocol });
      vaultExit = await createOwnedPrivateVaultExit({ runtime, system, poolIndex: 1, account: accounts[1], vault: vaultActor });}
      privateView = createPrivateVaultPortfolioView({ runtime, portfolio, vault: vaultActor,
        shareAssetId: accounts[1].assetId, underlyingAssetId: accounts[0].assetId });
    }
    manualSession = await createFlatManualGraphAccountSession({ runtime, portfolio,
      journal: { path: join(privateDirectory, 'portfolio.vault'), password: freshFixtureId() } });
    session = manualSession.session;
    http = await startFlatAccountHttp({ session, port: 0 });
    walletApp = await startWalletApplication({ accountSession: RETAINED_EXIT?retainedExitWallet.session:session,
      ...(UNISWAP||RETAINED_EXIT ? {} : { defiExit: { runtime, service: vaultExit } }), actionAccessMode: 'exact-only', port: 0 });
    appDriver = createManualWalletAppDriver(walletApp, {
      deadlineMs: Date.parse(lock.startedAt) + NATIVE_FLOW_LIMITS.totalMilliseconds - NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds });
    assert.equal((await appState()).capabilities.graphExecution, false);

    await stage('explicit-local-funding-and-exact-allowances');
    for (const [label, from, method, args] of [
      ['authorize-source-deposit', runtime.accounts[0], 'approve(address,uint256)', [system.pools[0].address, SOURCE]],
      ['authorize-solver-router', solver, 'approve(address,uint256)', [router.address, INPUT]],
    ]) await runtime.send(label, { from, to: assets.token.address,
      data: nativeStaticCalldata(assetArtifacts.token, method, args) });
    assert.ok(await capabilities[0].balance(solver) >= BigInt(INPUT) + BigInt(SOURCE));
    assert.equal(await capabilities[0].allowance(solver, router.address), BigInt(INPUT));
    const fundingRequest={requestId:'vault_top_up',kind:'TOP_UP',amount:SOURCE,exitRecipient:bare(runtime.accounts[3])};
    const fundingReview=RETAINED_EXIT?await retainedExitWallet.catalogue.reviewOwnerPreparation({assetId:retainedExitWallet.accounts[0].assetId,request:fundingRequest}):await ownerPreparations[0].review(fundingRequest);
    assert.equal(fundingReview.amount, SOURCE);
    const fundingBody=RETAINED_EXIT?await retainedExitWallet.catalogue.confirmOwnerPreparation():await ownerPreparations[0].confirm();assert.equal(fundingBody.requestId,'vault_top_up');
    await appAccount('prepare', fundingBody);
    if(AAVE) {
      const lost=await appDriver.executeAccountWithLostReply({requestId:'vault_top_up'});
      assert.equal(row(lost.snapshot,'vault_top_up').state,'CONFIRMED');result.fundingReplyLoss=lost.loss;
      result.accountRequests.push({action:'execute',requestId:'vault_top_up',via:'NODE_SDK_EXACT_ONLY_HTTP',originalJournalState:'CONFIRMED'});save();
    }else {
    assert.equal(row(await appAccount('execute', { requestId: 'vault_top_up' }), 'vault_top_up').state, 'CONFIRMED');
    }
    await appDuplicateExecute('vault_top_up');
    const fundedCount = runtime.transactions.length;
    await appAccount('reconcile', { requestId: 'vault_top_up' });
    assert.equal(runtime.transactions.length, fundedCount, 'EVM_VAULT_APP_TOP_UP_RECONCILE_RESENT');
    result.sourceFundingConfirmed = true;
    assert.equal((await ownerView()).assets[0].balances.available, SOURCE);

    await stage(UNISWAP ? 'preposition-target-note-and-one-generic-uniswap-action' : 'preposition-target-note-and-one-generic-vault-action');
    if(RETAINED_EXIT){
      const listener=await walletApp.close();assert.equal(listener.listenerClosed,true);walletApp=null;
      walletApp=await startWalletApplication({accountSession:session,actionAccessMode:'exact-only',port:0});
      appDriver=createManualWalletAppDriver(walletApp,{deadlineMs:Date.parse(lock.startedAt)+NATIVE_FLOW_LIMITS.totalMilliseconds-NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds});
    }
    graphCutoff = String((await runtime.time()) + 7200n);
    const graph = await prepareEvmVaultFixtureGraph(fixture, privateDirectory, {
      assetAmount: INPUT, shareAmount: SHARES, payoutAmount: PAYOUT, cutoff: graphCutoff,
    }, retainProof);
    graphRef = freshFixtureId();
    reserveNullifier = graph.prepared.rolePackets.recovery.recovery.value.reserveNullifier;
    solverPayoutCommitment = graph.prepared.rolePackets.local[0].local.value.payoutCommitment;
    await accounts[0].ownerActions.registerGraph({ ownerOperationRef: graphRef,
      prepared: graph.prepared, providers: graph.providers });
    const approval = await accounts[0].ownerActions.approveManualEvmGraph({ requestId: graphId, ownerOperationRef: graphRef });
    const graphBody = manualSession.bindManualGraph(approval);
    await appAccount('prepare', graphBody);
    const consent = await appDriver.reviewAccount('execute', { requestId: graphId });
    const reviewed = consent.review.accountContext.graph;
    assert.equal(reviewed.reservedAmount, PAYOUT); assert.equal(reviewed.changeAmount, CHANGE);
    const reviewedRoute = reviewed.graph.legs[0].route;
    assert.equal(reviewedRoute.routeProfile, UNISWAP ? 'REGISTERED_LOCAL_EVM_UNISWAP_V3_V1' : AAVE ? 'REGISTERED_LOCAL_EVM_AAVE_STATIC_V1' : 'REGISTERED_LOCAL_EVM_METAMORPHO_V1');
    assert.equal(UNISWAP ? reviewedRoute.solverMaximumInputAmount : reviewedRoute.solverMaximumUnderlyingAmount, INPUT);
    assert.equal(UNISWAP ? reviewedRoute.deliveredOutputAmount : reviewedRoute.deliveredShares, SHARES);
    if (UNISWAP) {
      assert.equal(reviewedRoute.protocolKind, 'UNISWAP_V3_EXACT_OUTPUT_SINGLE'); assert.equal(reviewedRoute.fee, '3000');
      assert.equal(reviewedRoute.protocol, bare(officialProtocol.swapRouter.address));
      assert.equal(reviewedRoute.inputToken, bare(officialProtocol.first.address));
      assert.equal(reviewedRoute.outputToken, bare(officialProtocol.second.address));
    }
    assert.equal(reviewedRoute.protocolAmountsPublic, true);
    writeFixturePrivate(join(privateDirectory, UNISWAP ? 'original-uniswap-consent.json' : AAVE ? 'original-aave-consent.json' : 'original-metamorpho-consent.json'), consent.review);
    solverBalanceBeforeDelivery = await capabilities[0].balance(solver);
    const settled = await consent.confirmAfterAdmission(async () => {
      assert.equal(runtime.transactions.filter(entry => entry.signed).length, 0, 'EVM_VAULT_TARGET_MUST_STOP_BEFORE_DELIVERY');
      await targetOwner.suspend(); result.targetOwnerExitedBeforeDelivery = targetOwner.report().childExited;
      assert.equal(result.targetOwnerExitedBeforeDelivery, true);
    });
    assert.equal(row(settled.snapshot, graphId).state, 'CONFIRMED', 'EVM_VAULT_GRAPH_NOT_CONFIRMED');
    assert.equal(execution.snapshot(graphRef).outcome, 'FULFILLED');
    assert.equal(sourceOwner.report().childExited, true);
    assert.equal(targetOwner.report().childExited, true);
    const source = await readers[0].read(), destination = await readers[1].read();
    assert.equal(source.ledger.publicState.backedAmount, SOURCE);
    assert.equal(source.ledger.publicState.liveReservations, 0);
    assert.equal(source.state.spentTagCount, '4');
    assert.equal(destination.ledger.publicState.backedAmount, SHARES);
    assert.equal(destination.ledger.publicState.actualAssetBalance, SHARES);
    const deliveries = runtime.transactions.filter(entry => entry.signed);
    assert.equal(deliveries.length, 1, 'EVM_VAULT_EXACT_ONE_SIGNED_DISPATCH');
    const delivery = deliveries[0]; assert.equal(delivery.receipt.status, '0x1');
    solverBalanceAfterDelivery = await capabilities[0].balance(solver);
    const actualInput = solverBalanceBeforeDelivery - solverBalanceAfterDelivery;
    assert.ok(actualInput > 0n && actualInput <= BigInt(INPUT), 'EVM_VAULT_EXACT_BOUNDED_INPUT');
    if (!UNISWAP && !AAVE) assert.equal(actualInput, BigInt(INPUT));
    assert.equal(await capabilities[0].allowance(solver, router.address), 0n);
    result.actualGlobalClaim = { at: new Date().toISOString(), sourceOwnerAbsent: true, targetOwnerAbsent: true,
      source: source.ledger.publicState, destination: destination.ledger.publicState,
      protocol: UNISWAP ? 'OFFICIAL_UNISWAP_V3_EXACT_OUTPUT_SINGLE' : AAVE ? 'OFFICIAL_AAVE_V3_STATIC_TOKEN' : 'OFFICIAL_METAMORPHO',
      exactOutputAmount: SHARES, solverPayout: PAYOUT, maximumInput: INPUT, actualInput: String(actualInput) };
    if (UNISWAP) result.privateUniswapGraphAcceptance = true; else if(AAVE) result.privateAaveGraphAcceptance = true; else result.privateVaultGraphAcceptance = true;
    await audit(); process.stdout.write(JSON.stringify({ result: UNISWAP ? 'ACTUAL_PRIVATE_UNISWAP_GLOBAL_CLAIM' : AAVE ? 'ACTUAL_PRIVATE_AAVE_GLOBAL_CLAIM' : 'ACTUAL_PRIVATE_VAULT_GLOBAL_CLAIM' }) + '\n');
    const afterClaimCount = runtime.transactions.length;
    await request('execute', { requestId: graphId });
    assert.equal(runtime.transactions.length, afterClaimCount, 'EVM_VAULT_DUPLICATE_GRAPH_SENT');

    await stage('restart-owner-custody-and-account-reconcile-original-note');
    await request('restart'); await sourceOwner.restart(); await targetOwner.restart();
    const credit = { transactionHash: bare(delivery.transactionHash),
      calldataSHA256: hash(Buffer.from(delivery.request.data.slice(2), 'hex')) };
    assert.equal((await targetOwner.owner.reconcileDepositIntent(credit)).stage, 'CONFIRMED');
    assert.equal((await targetOwner.owner.reconcileDepositIntent(credit)).stage, 'CONFIRMED');
    await appAccount('reconcile', { requestId: graphId });
    assert.equal(runtime.transactions.length, afterClaimCount, 'EVM_VAULT_RESTART_OR_CREDIT_SENT');
    const coherent = await ownerView();
    assert.equal(coherent.status, 'LIVE'); assert.equal(coherent.coherent, true);
    assert.deepEqual(coherent.assets.map(asset => asset.balances.available), [CHANGE, SHARES]);
    assert.equal(coherent.assets[0].requests.find(value => value.requestId === graphId)?.disposition, 'FULFILLED');
    if (!UNISWAP) {
      assert.equal(coherent.positions[0].availableShares, SHARES);
      assert.equal(coherent.positions[0].estimatedRedeemableUnderlying,AAVE?SHARES:INPUT);
      assert.equal(coherent.positions[0].underlyingSpendable, false);
    }
    result.originalNotesRecoveredOnce = true;
    result.privatePortfolioAfterConversion = { coherent: coherent.coherent,
      assets: coherent.assets.map(asset => ({ symbol: asset.asset.symbol, available: asset.balances.available })),
      ...(UNISWAP ? { outputAssetId: accounts[1].assetId, outputAvailable: coherent.assets[1].balances.available }
        : { position: { availableShares: coherent.positions[0].availableShares,
          estimatedRedeemableUnderlying: coherent.positions[0].estimatedRedeemableUnderlying, underlyingSpendable: false } }) };

    if(AAVE) {
      const beforeYield=await privateView();
      result.aaveYield=await officialProtocol.accrueYield();
      const afterYield=await privateView();
      assert.deepEqual(afterYield.assets.map(row=>row.balances),beforeYield.assets.map(row=>row.balances),'AAVE_YIELD_NO_PRIVATE_NOTE_MINT');
      assert.equal(afterYield.positions[0].availableShares,SHARES);
      assert.ok(BigInt(afterYield.positions[0].estimatedRedeemableUnderlying)>BigInt(beforeYield.positions[0].estimatedRedeemableUnderlying),'AAVE_PRIVATE_POSITION_RETAINED_YIELD');
      result.aaveYield={...result.aaveYield,privateSharesBefore:beforeYield.positions[0].availableShares,
        privateSharesAfter:afterYield.positions[0].availableShares,estimatedBefore:beforeYield.positions[0].estimatedRedeemableUnderlying,
        estimatedAfter:afterYield.positions[0].estimatedRedeemableUnderlying};save();
    }
    if(RETAINED_EXIT){
      const listener=await walletApp.close();assert.equal(listener.listenerClosed,true);await http.close();walletApp=null;http=null;
      portfolio.close();portfolio=retainedExitWallet.portfolio;session=retainedExitWallet.session;
      privateView=createPrivateVaultPortfolioView({runtime:fixture.runtime,portfolio,vault:vaultActor,shareAssetId:retainedExitWallet.accounts[1].assetId,underlyingAssetId:retainedExitWallet.accounts[0].assetId});
      http=await startFlatAccountHttp({session,port:0});walletApp=await startWalletApplication({accountSession:session,defiExit:{runtime,service:retainedExitWallet.exit},actionAccessMode:'exact-only',port:0});
      appDriver=createManualWalletAppDriver(walletApp,{deadlineMs:Date.parse(lock.startedAt)+NATIVE_FLOW_LIMITS.totalMilliseconds-NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds});
    }
    await stage(UNISWAP ? 'exit-source-change-and-original-target-output' : 'exit-source-change-and-original-target-shares');
    await exitOwnerNote(0, sourceOwner, 'change', 'vault_exit_0');
    await exitOwnerNote(1, targetOwner, 'source', 'vault_exit_1');
    assert.equal(await capabilities[0].balance(runtime.accounts[3]), BigInt(CHANGE));
    assert.equal(await capabilities[1].balance(fixture.targetExitRecipient), BigInt(SHARES));
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
    assert.equal(await capabilities[0].balance(solver), solverBalanceAfterDelivery + BigInt(PAYOUT));
    const replayState = () => readEvmVaultReplayState({ runtime, readers, vault: vaultActor,
      ...(UNISWAP ? { protocolFixture: officialProtocol } : {}), capabilities,
      sender: system.sender, holders: [...runtime.accounts, ...system.pools.map(pool => pool.address), assets.vault.address, router.address,
        ...(UNISWAP ? [officialProtocol.pool.address, officialProtocol.swapRouter.address] : [])] });
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
    assert.equal(await capabilities[0].balance(solver), solverBalanceAfterDelivery + BigInt(PAYOUT));
    result.solverPayoutRecoveredAndExitedOnce = true;

    if (!UNISWAP) {
      await stage('redeem-exited-vault-shares-and-close-backing');
      const underlyingMinimum = AAVE ? String((await officialProtocol.read(officialProtocol.vault,'previewRedeem',[BigInt(SHARES)]))[0]) : INPUT;
      const redemption = { requestId: 'vault_exit_1', minimumOutput: underlyingMinimum, deadline: String((await runtime.time()) + 240n) };
      const preparedRedemption = await appDefi('prepare', redemption);
      assert.equal(preparedRedemption.shares, SHARES); assert.equal(preparedRedemption.phase, 'READY_TO_REDEEM');
      const redemptionResult = await appDefi('execute', { requestId: redemption.requestId });
      assert.equal(redemptionResult.phase, 'REDEEMED'); assert.equal(redemptionResult.redeemedUnderlying, underlyingMinimum); if(AAVE) assert.ok(BigInt(underlyingMinimum)>BigInt(SHARES),'AAVE_REDEEM_INCLUDES_GENUINE_YIELD');
      assert.equal(redemptionResult.underlyingPrivateSpendable, false);
      const redeemed = await(RETAINED_EXIT?retainedExitWallet.service:vaultExit).originalReceipt(redemption.requestId);
      assertOwnedMetaMorphoReceipt(vaultActor, redeemed);
      writeFixturePrivate(join(privateDirectory, 'vault-redemption.json'), redeemed);
      if(AAVE)result.aaveRedemption=redeemed.execution.confirmation.aaveRedemption;
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
        graphExecutionExposed: false, graphThroughOriginalExactConsent: true, graphUsedOriginalPrivateHarnessApi: false,
        browserVisualAcceptance: false, nativeClaimSessionAcceptance: false };
      result.manualPrivateShareExitRedemption = { ...redemptionResult, originalExitBound: true, duplicateNoEffect: true };
      assert.equal(await capabilities[0].balance(solver), solverBalanceAfterDelivery + BigInt(PAYOUT) + BigInt(underlyingMinimum));
      const vault = await vaultActor.observe();
      assert.equal(vault.snapshot.totalShares,'0'); if(AAVE) { assert.ok(BigInt(vault.snapshot.totalAssets)<=1n,'AAVE_EXPLICIT_RAY_RESIDUAL'); result.aaveResidualUnderlying=vault.snapshot.totalAssets; } else assert.equal(vault.snapshot.totalAssets,'0');
    } else {
      const finalApp = await appState(); assert.equal(finalApp.capabilities.graphExecution, false);
      result.walletApplicationHttpAcceptance = { originalAccountTopUpAndExit: true,
        originalRequestIdsRetained: true, accountHttp200WasVolatileOnly: true, confirmedOriginalJournalObserved: true,
        graphExecutionExposed: false, graphThroughOriginalExactConsent: true, graphUsedOriginalPrivateHarnessApi: false,
        browserVisualAcceptance: false, nativeClaimSessionAcceptance: false };
      assert.equal(await capabilities[0].balance(solver), solverBalanceAfterDelivery + BigInt(PAYOUT));
      assert.equal(await capabilities[1].balance(targetExitRecipient), BigInt(SHARES));
      result.manualPrivateOutputExit = { outputAssetId: accounts[1].assetId, outputAmount: SHARES,
        originalExitBound: true, duplicateNoEffect: true };
    }
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
    if (UNISWAP) result.privateUniswapGraphAcceptance = true; else if(AAVE) result.privateAaveGraphAcceptance = true; else result.privateVaultGraphAcceptance = true;
    result.protocol = UNISWAP ? 'OFFICIAL_UNISWAP_V3_EXACT_OUTPUT_SINGLE' : AAVE ? 'OFFICIAL_AAVE_V3_STATIC_TOKEN' : 'OFFICIAL_METAMORPHO';
    result.sourcePrivateReservationEstablished = true;
    result.privatePAEGConversionEstablished = true; result.originalExactConsent = appDriver.evidence();
    result.privateOutputExitEstablished = true;
    if (!UNISWAP) result.privateExitsAndUnderlyingRedemption = true;
    result.duplicateNoEffect = true;
    if(RETAINED_EXIT){
      await stage('planned-terminal-vault-catalogue-capture-and-new-backend');
      const closedApp=await walletApp.close();assert.equal(closedApp.listenerClosed,true);walletApp=null;
      // Dispose only the original, already terminal graph resources. Their
      // permissions are deliberately absent from the new EXIT-only backend.
      await execution.close();for(const account of accounts)await account.close();
      for(const selected of fixture.providers)await selected.provider.close();for(const operator of fixture.operators)await operator.close();for(const recipient of fixture.recipients)await recipient.close();
      const firstReceipt=await retainedExitWallet.service.originalReceipt('vault_exit_1');
      const quiesced=await session.quiesceForPrivateRecovery();assert.equal(quiesced.phase,'CLOSED');await http.close();http=null;
      externalSuccessor=await captureAndLaunchExternalDefiVaultExitSuccessorV1({externalDefiVaultExitRecovery:true,wallet:retainedExitWallet,fixture,privateDirectory,result,active(){assert.equal(interrupted,false);assert.ok(Date.now()<Date.parse(lock.startedAt)+NATIVE_FLOW_LIMITS.totalMilliseconds-NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds);},save});
      retainedExitCaptured=true;
      const observed=await externalSuccessor.audit();assert.equal(observed.sameOriginalReceipt,true);assert.equal(observed.actualWireCountBefore,observed.actualWireCountAfter);assert.equal(observed.originalExitRequestIdsRetained,true);assert.equal(observed.originalCatalogueRequestIdsRetained,true);
      result.externalVaultBackendRecovery={...result.externalVaultBackendRecovery,...externalSuccessor.report,audit:observed,originalRedemptionReceiptSHA256:canonicalJournalSHA(firstReceipt)};
    }
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
    if (RECOVERY && result.controlledPostDeliveryInterruption === true) {
      const failed = (await appState()).account.snapshot.admissions.filter(row =>
        row.action === 'execute' && row.requestId === graphId && row.state === 'FAILED');
      assert.equal(failed.length, 1, 'UNISWAP_F_ORIGINAL_FAILED_ADMISSION');
      assert.equal(failed[0].errorCode, result.errorCode);
      result.originalFailedAdmission = structuredClone(failed[0]);
    }
    let recovered = false;
    try { if (!AAVE) recovered = await recoverOriginalFailedDelivery(); }
    catch (recoveryError) {
      result.failureRecoveryError = safeCode(recoveryError);
      writeFixturePrivate(join(privateDirectory, 'failure-recovery-error.json'), {
        message: String(recoveryError.message), stack: String(recoveryError.stack) });
    }
    // Only the separate fixed F scenario accepts its exact controlled failure.
    // No arbitrary failure or happy-path fallback can acquire this acceptance.
    const expected = RECOVERY && recovered === true && result.controlledPostDeliveryInterruption === true
      && result.expectedInterruptionCode === 'UNISWAP_F_CONTROLLED_AFTER_DELIVERY'
      && result.failedStage === 'native-delivered-0' && result.errorCode === 'FLAT_ACCOUNT_OPERATION_FAILED';
    if (expected) { result.actualAdmissionFailureCode = result.errorCode; result.expectedInterruptionPreserved = true;
      delete result.errorCode; result.phase = 'completed'; result.success = true; }
    else { result.phase = 'failed'; result.success = false; }
    save();
  } finally {
    await cleanup(); process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    if (result.cleanup.closedEvm !== true) { result.success = false; result.phase = 'failed'; }
    try { assert.deepEqual(RETAINED_EXIT?externalDefiVaultExitSourcePinsV1():AAVE?aavePrivateGraphSourcePinsV1():evmVaultSourcePins(), result.sourcePins); result.sourceUnchanged = true; }
    catch { result.sourceUnchanged = false; result.success = false; result.phase = 'failed'; }
    result.finishedAt = new Date().toISOString(); result.milliseconds = performance.now() - began;
    if(RETAINED_EXIT&&result.success){try{assertExternalDefiVaultExitRecoveryResultV1(result);}catch(error){result.success=false;result.phase='failed';result.errorCode=safeCode(error);}}
    if (RECOVERY && result.success) {
      try { assertEvmUniswapRecoveryResult(result); }
      catch (error) { result.success = false; result.phase = 'failed'; result.errorCode = safeCode(error); }
    }
    save();
    if (!result.success) process.exitCode = 1;
  }
}
await main();
