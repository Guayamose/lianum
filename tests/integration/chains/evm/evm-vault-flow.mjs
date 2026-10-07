/** Actual affected path: one private PALT reservation pays a solver only after
 * its gated vault action backs the exact preauthorized private BLTV note.
 * This uses one owned local EVM and the original four-slot generic protocol.
 * Native action amounts/timing and the common-host keeper remain observable.
 */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGenericAccountKeeper } from '../../../../packages/engine/src/execution/accounts/generic-account-keeper.mjs';
import { createNativeRecipientProcess } from '../../../../packages/engine/src/execution/native/recipients/native-recipient-process.mjs';
import { createProofProcess } from '../../../../packages/engine/src/execution/proofs/proof-process.mjs';
import { walletInputPublicWords } from '../../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { noteWordsToHash } from '../../../../packages/engine/src/notes/private-note-tree.mjs';
import { nativeStaticCalldata } from '../../../../packages/engine/src/execution/native/dispatch/native-deployment.mjs';
import { ROOT } from '../../../../packages/proofs/src/catalog.mjs';
import { hash } from '../../../../packages/proofs/src/tooling/tooling.mjs';
import { createOwnedEvmVaultFixture, prepareEvmVaultFixtureGraph } from '../../fixtures/chains/evm/owned-evm-vault-fixture.mjs';
import { freshFixtureId, fixtureJSON, writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';
import { evmVaultSourcePins } from '../../runners/source-pins.mjs';
import { NATIVE_FLOW_LIMITS } from '../../native/native-flow-supervisor.mjs';
import { readEvmVaultReplayState, assertEvmVaultPayoutReplay, assertEvmVaultTerminalPools } from './evm-vault-terminal-checks.mjs';
import { loadBackedAssetDeploymentArtifacts } from '../../../../packages/backend/src/operations/deployments/defi/deploy-backed-assets.mjs';
import { createFlatNativeExecution } from '../../../../packages/backend/src/execution/account/execution/flat-native-execution.mjs';
import { encodeFlatTransaction } from '../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { createFlatAccountAuthority } from '../../../../packages/backend/src/accounts/authority/flat-account-authority.mjs';
import { createFlatPortfolioAuthority } from '../../../../packages/backend/src/accounts/authority/flat-portfolio-authority.mjs';
import { createFlatAccountSession } from '../../../../packages/backend/src/api/accounts/flat-account-session.mjs';
import { startFlatAccountHttp } from '../../../../packages/backend/src/api/accounts/flat-account-http.mjs';
import { startWalletApplication } from '../../../../apps/wallet/src/server/server.mjs';
import { createEvmVaultWalletAppDriver } from './evm-vault-wallet-app-driver.mjs';
import { createOwnedBackedVault, assertOwnedBackedVaultReceipt } from '../../../../packages/backend/src/defi/vaults/owned-backed-vault.mjs';
import { createPrivateVaultPortfolioView } from '../../../../packages/backend/src/defi/vaults/private-vault-position.mjs';
import { createOwnedPrivateVaultExit } from '../../../../packages/backend/src/defi/withdrawals/private-vault-exit.mjs';

const bare = value => value.slice(2);
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
  assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1])),
    join(ROOT, 'integration/run-evm-vault-flow.mjs'));
  const lock = JSON.parse(readFileSync(join(ROOT, '.local/evm-vault-flow/active.lock')));
  assert.equal(lock.pid, process.ppid);
  assert.match(lock.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt, '.local/evm-vault-flow/attempt-' + lock.runId);
  const directory = join(ROOT, lock.attempt), privateDirectory = join(directory, 'private-audit');
  const proofDirectory = join(directory, 'public-proofs');
  mkdirSync(privateDirectory, { mode: 0o700 });
  mkdirSync(proofDirectory, { mode: 0o700 });
  const began = performance.now();
  const result = {
    format: 'FLAT_WALLET_EVM_VAULT_FLOW_RESULT_V1', runId: lock.runId,
    startedAt: new Date().toISOString(), phase: 'starting', success: false,
    localOnly: true, fakeFundsOnly: true, publicNetwork: false,
    supervisor: { supervisorPID: process.ppid, workerPID: process.pid }, sourcePins: evmVaultSourcePins(),
    stages: [], proofs: [], transactions: [], accountRequests: [], nativeEffects: { evmVault: 0 },
    cleanup: { closedEvm: false }, keeperRestart: false, nodeRestart: false,
    privateVaultGraphAcceptance: false, partialDeliveryRecoveryAcceptance: false,
    systemicPrivacyAcceptance: false, independentOperators: false,
    realClockFinalityAcceptance: false, performanceTargetAchieved: false, fullWalletAcceptance: false,
    disclosure: [
      'One owned local EVM, fake PALT and BLTV, controlled inclusion time and one canonical local confirmation.',
      'Solver supplies public vault liquidity. Source private reserve pays only after exact destination private note backing is proven.',
      'The router action, amount, K, vault and destination pool remain public. Common-host observers/keeper are trusted.',
      'Two encrypted owner children and a disposable account coordinator restart; the original authority and EVM survive.',
      'This exercises one registered EVM vault action under the generic relation, not arbitrary DeFi or seven-chain acceptance.',
    ],
  };
  const save = () => writeFixturePrivate(join(directory, 'result.json'), result);
  async function stage(name) {
    result.phase = name;
    result.stages.push({ name, at: new Date().toISOString(), elapsedMilliseconds: performance.now() - began });
    save(); process.stdout.write(JSON.stringify({ stage: name }) + '\n');
  }
  let fixture, execution, portfolio, keeper, session, http, walletApp, appDriver, vaultActor, vaultExit, legacy;
  let graphRef, graphCutoff;
  const graphId = 'private_vault_graph';
  let closed = false, interrupted = false;
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
    if (walletApp) await walletApp.close().catch(() => {});
    await Promise.allSettled([...accounts.map(account => account.abort()), execution?.abort(), legacy?.close()].filter(Boolean));
    if (http) await http.close().catch(() => {});
    else if (session) await session.close().catch(() => {});
    else await keeper?.close().catch(() => {});
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
    assert.ok(value.portfolio, 'EVM_VAULT_APP_PORTFOLIO_REQUIRED'); return value.portfolio;
  }
  async function exitOwnerNote(index, owner, role, requestId) {
    const runtime = fixture.runtime, ref = freshFixtureId();
    await owner.owner.prepareWithdrawal({ role, epoch: String((await runtime.time()) / 600n) });
    await accounts[index].ownerActions.registerExit(ref, role);
    await appAccount('prepare', { requestId, kind: 'EXIT', ownerOperationRef: ref, assetId: accounts[index].assetId });
    assert.equal(row(await appAccount('execute', { requestId }), requestId).state, 'CONFIRMED');
    const completedCount = runtime.transactions.length;
    await appAccount('reconcile', { requestId });
    await appDuplicateExecute(requestId);
    assert.equal(runtime.transactions.length, completedCount, 'EVM_VAULT_APP_RECONCILE_RESENT');
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
    await stage('failure-only-original-cutoff-recovery');
    if (await runtime.time() < BigInt(graphCutoff)) await runtime.advanceTo(graphCutoff);
    const recovered = await request('recover', { requestId: graphId });
    assert.equal(row(recovered, graphId).state, 'CONFIRMED', 'EVM_VAULT_FAILURE_RECOVERY_UNRESOLVED');
    assert.equal(execution.snapshot(graphRef).outcome, 'RECOVERED', 'EVM_VAULT_FAILURE_NOT_RECOVERED');
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
    assert.deepEqual(restored.assets.map(asset => asset.balances.available), ['500', '100']);
    await exitOwnerNote(0, sourceOwner, 'recovery', 'failure_exit_recovery');
    await exitOwnerNote(0, sourceOwner, 'change', 'failure_exit_change');
    await exitOwnerNote(1, targetOwner, 'source', 'failure_exit_target');
    assert.equal(await capabilities[0].balance(runtime.accounts[3]), 500n);
    assert.equal(await capabilities[0].balance(runtime.accounts[1]), 0n);
    assert.equal(await capabilities[1].balance(runtime.accounts[4]), 100n);
    const finalPools = [];
    for (const reader of fixture.readers) {
      const value = (await reader.read()).ledger.publicState;
      assert.equal(value.backedAmount, '0'); assert.equal(value.actualAssetBalance, '0');
      assert.equal(value.liveReservations, 0); finalPools.push(value);
    }
    assert.equal(runtime.transactions.filter(entry => entry.signed).length, 1, 'EVM_VAULT_FAILURE_RESENT');
    result.failureRecovery = { originalCutoff: graphCutoff, ownerAbsentAtIssuance: ownerAbsentAtRecovery,
      sourceRefundAndChangeExited: '500', originalDeliveredSharesExited: '100', solverPayoutIssued: false,
      solverUnderlyingLoss: '100', nativeVaultEffects: 1, finalPools, originalFailurePreserved: true };
    result.partialDeliveryRecoveryAcceptance = true;
    await audit();
  }

  try {
    save(); fixture = await createOwnedEvmVaultFixture(privateDirectory, { onStage: stage, onDeployment: audit });
    const { runtime, system, assets, capabilities, sourceOwner, targetOwner, readers, quorum, evmDelivery, router } = fixture;
    const assetArtifacts = loadBackedAssetDeploymentArtifacts().artifacts;
    execution = await createFlatNativeExecution({ runtime, system, poolIndex: 0,
      bitcoin: null, solana: null, evmDelivery, quorum }, {
      onProof: retainProof, onPrivateAudit: audit, onStage: value => stage(value.stage) });
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
    const privateView = createPrivateVaultPortfolioView({ runtime, portfolio, vault: vaultActor,
      shareAssetId: accounts[1].assetId, underlyingAssetId: accounts[0].assetId });
    keeper = await createGenericAccountKeeper({ config: portfolio.config,
      journal: { path: join(privateDirectory, 'portfolio.vault'), password: freshFixtureId() }, authority: portfolio.authority });
    session = await createFlatAccountSession({ keeper, ownerHandoff: { ownerView: privateView } });
    http = await startFlatAccountHttp({ session, port: 0 });
    walletApp = await startWalletApplication({ accountSession: session, defiExit: { runtime, service: vaultExit }, port: 0 });
    appDriver = createEvmVaultWalletAppDriver(walletApp, {
      deadlineMs: Date.parse(lock.startedAt) + NATIVE_FLOW_LIMITS.totalMilliseconds - NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds });
    assert.equal((await appState()).capabilities.graphExecution, false);

    await stage('explicit-local-funding-and-exact-allowances');
    for (const [label, from, method, args] of [
      ['fund-solver-liquidity', runtime.accounts[0], 'transfer(address,uint256)', [runtime.accounts[1], '100']],
      ['authorize-source-deposit', runtime.accounts[0], 'approve(address,uint256)', [system.pools[0].address, '500']],
      ['authorize-solver-router', runtime.accounts[1], 'approve(address,uint256)', [router.address, '100']],
    ]) await runtime.send(label, { from, to: assets.token.address,
      data: nativeStaticCalldata(assetArtifacts.token, method, args) });
    assert.equal(await capabilities[0].balance(runtime.accounts[1]), 100n);
    assert.equal(await capabilities[0].allowance(runtime.accounts[1], router.address), 100n);
    await sourceOwner.owner.prepareDeposit({ amount: '500', epoch: String((await runtime.time()) / 600n),
      exitRecipient: bare(runtime.accounts[3]) });
    const topUpRef = freshFixtureId(); await accounts[0].ownerActions.registerTopUp(topUpRef);
    await appAccount('prepare', { requestId: 'vault_top_up', kind: 'TOP_UP', ownerOperationRef: topUpRef, assetId: accounts[0].assetId });
    assert.equal(row(await appAccount('execute', { requestId: 'vault_top_up' }), 'vault_top_up').state, 'CONFIRMED');
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
    await request('prepare', { requestId: graphId, kind: 'GRAPH', ownerOperationRef: graphRef, assetId: accounts[0].assetId });
    const beforeGraphRejection = runtime.transactions.length;
    await appDriver.rejectGraphRequest(graphId);
    assert.equal(runtime.transactions.length, beforeGraphRejection, 'EVM_VAULT_APP_GRAPH_WAS_EXPOSED');
    await targetOwner.suspend();
    result.targetOwnerExitedBeforeDelivery = targetOwner.report().childExited;
    assert.equal(result.targetOwnerExitedBeforeDelivery, true);
    const settled = await request('execute', { requestId: graphId });
    assert.equal(row(settled, graphId).state, 'CONFIRMED', 'EVM_VAULT_GRAPH_NOT_CONFIRMED');
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
    await request('execute', { requestId: graphId });
    assert.equal(runtime.transactions.length, afterClaimCount, 'EVM_VAULT_DUPLICATE_GRAPH_SENT');

    await stage('restart-owner-custody-and-account-reconcile-original-note');
    await request('restart'); await sourceOwner.restart(); await targetOwner.restart();
    const credit = { transactionHash: bare(delivery.transactionHash),
      calldataSHA256: hash(Buffer.from(delivery.request.data.slice(2), 'hex')) };
    assert.equal((await targetOwner.owner.reconcileDepositIntent(credit)).stage, 'CONFIRMED');
    assert.equal((await targetOwner.owner.reconcileDepositIntent(credit)).stage, 'CONFIRMED');
    await request('reconcile', { requestId: graphId });
    assert.equal(runtime.transactions.length, afterClaimCount, 'EVM_VAULT_RESTART_OR_CREDIT_SENT');
    const coherent = await ownerView();
    assert.equal(coherent.status, 'LIVE'); assert.equal(coherent.coherent, true);
    assert.deepEqual(coherent.assets.map(asset => asset.balances.available), ['380', '100']);
    assert.equal(coherent.assets[0].requests.find(value => value.requestId === graphId)?.disposition, 'FULFILLED');
    assert.equal(coherent.positions[0].availableShares, '100');
    assert.equal(coherent.positions[0].estimatedRedeemableUnderlying, '100');
    assert.equal(coherent.positions[0].underlyingSpendable, false);
    result.originalNotesRecoveredOnce = true;
    result.privatePortfolioAfterConversion = { coherent: coherent.coherent,
      assets: coherent.assets.map(asset => ({ symbol: asset.asset.symbol, available: asset.balances.available })),
      position: { availableShares: coherent.positions[0].availableShares,
        estimatedRedeemableUnderlying: coherent.positions[0].estimatedRedeemableUnderlying, underlyingSpendable: false } };

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
    const preparedRedemption = await appDefi('prepare', redemption);
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
    await appDefi('execute', { requestId: redemption.requestId }); assert.equal(runtime.transactions.length, redemptionCount);
    const finalApp = await appState();
    assert.equal(finalApp.capabilities.graphExecution, false);
    assert.equal(finalApp.defi.snapshot.operations.find(item => item.requestId === redemption.requestId)?.phase, 'REDEEMED');
    result.walletApplicationHttpAcceptance = { originalAccountTopUpAndExit: true,
      originalDeFiPrepareExecuteReconcileReopen: true, originalRequestIdsRetained: true,
      accountHttp200WasVolatileOnly: true, confirmedOriginalJournalObserved: true,
      graphExecutionExposed: false, graphUsedOriginalPrivateHarnessApi: true,
      browserVisualAcceptance: false, nativeClaimSessionAcceptance: false };
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
    result.privateVaultGraphAcceptance = true;
    result.privateExitsAndUnderlyingRedemption = true;
    result.duplicateNoEffect = true; result.phase = 'completed'; result.success = true; await audit();
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
    try { await recoverOriginalFailedDelivery(); }
    catch (recoveryError) {
      result.failureRecoveryError = safeCode(recoveryError);
      writeFixturePrivate(join(privateDirectory, 'failure-recovery-error.json'), {
        message: String(recoveryError.message), stack: String(recoveryError.stack) });
    }
    // A fallback never upgrades the failed requested success path.
    result.phase = 'failed'; result.success = false; save();
  } finally {
    await cleanup(); process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    if (result.cleanup.closedEvm !== true) { result.success = false; result.phase = 'failed'; }
    try { assert.deepEqual(evmVaultSourcePins(), result.sourcePins); result.sourceUnchanged = true; }
    catch { result.sourceUnchanged = false; result.success = false; result.phase = 'failed'; }
    result.finishedAt = new Date().toISOString(); result.milliseconds = performance.now() - began; save();
    if (!result.success) process.exitCode = 1;
  }
}
await main();
