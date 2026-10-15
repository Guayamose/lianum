/** Fixed CLI profiles and the owned local partial-prefix/refund branch.
 * Importing this file never starts a runtime, opens a Vault or proves anything.
 * The controller retains private configuration; only the returning owner child
 * authenticates/decrypts the original Vault and its separate encrypted sidecar.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';

export function parseGenericNativeFlowArguments(argv) {
  if (Array.isArray(argv) && argv.length === 1) {
    assert.deepEqual(argv, ['--authorized-local-generic-native-flow'], 'GENERIC_NATIVE_LOCAL_AUTHORIZATION');
    return 'success';
  }
  assert.deepEqual(argv, ['--authorized-local-generic-native-flow', '--case=partial-refund'],
    'GENERIC_NATIVE_LOCAL_AUTHORIZATION');
  return 'partial-refund';
}

const bare = value => value.startsWith('0x') ? value.slice(2) : value;
const prefix = value => '0x' + bare(value);
const consumed = 'NOTE_CONSUMED_REQUIRES_TRANSACTION_RECONCILIATION';
const authorized = 'AUTHORIZED_UNSPENT_AT_OBSERVATION';

export async function runPartialRefundNativeFlow({ evm, system, solana, bitcoin, providers,
  owner, ownerConfig, prepared, reserveIndex, sourceNullifier, cutoff, ready, action,
  deliveryRiskSalt, coordinator, readyRole, privateDirectory, fresh, report,
  stage, persist, audit, prove, proofRole, savePublic, send, setReturningOwner, markRefunded }) {
  const { readNativeSystemState } = await import('../../../packages/backend/src/execution/native/state/native-system-state.mjs');
  const { createGenericOwnerRecoveryProcess } = await import('../../../packages/backend/src/execution/native/recovery/native-owner-recovery-process.mjs');
  const { refundInputs, publicWords, digestHex } = await import('../../../packages/proofs/programs/generic-wrappers/abi.mjs');
  const { walletInputPublicWords } = await import('../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs');
  const { wipePrivate } = await import('../../../packages/proofs/src/execution/proof-worker.mjs');
  const pool = system.pools[0];
  const read = () => readNativeSystemState(evm, system, 0);
  const assertOwnerAbsent = () => assert.equal(owner.report().exited, true, 'GENERIC_NATIVE_OWNER_RETURNED_BEFORE_REFUND');
  let view = await read();
  assert.equal(report.case, 'partial-refund');
  assertOwnerAbsent();
  assert.equal(solana.transfers.length, 1); assert.equal(bitcoin.transfers.length, 0);
  assert.equal(view.state.receiptCount, '1'); assert.equal(view.state.spentTagCount, '0');
  assert.equal(view.state.revokedCount, '0');
  assert.equal(view.ledger.publicState.backedAmount, '20000');
  assert.equal(view.ledger.publicState.actualAssetBalance, '20000');
  assert.equal(view.ledger.publicState.liveReservations, 1);
  assert.deepEqual(view.ledger.nullifiers, [prefix(sourceNullifier)]);
  assert.equal(view.ledger.tree.path(reserveIndex).leaf, prefix(prepared.reserveCommitment));
  const beforeRefund = view.ledger.publicState;
  const oldCheckpoint = prefix(digestHex(ready.publicInputs.slice(40, 48)));
  assert.equal(BigInt(await system.hub.call('isCheckpointCurrent(bytes32)', [oldCheckpoint])), 1n,
    'GENERIC_NATIVE_BTC_CHECKPOINT_NOT_CURRENT_BEFORE_EXPIRY');

  stage('deliberate-owned-clock-expiry-after-sol-admission');
  report.failureScenario = 'DELIBERATE_LOCAL_EXPIRY_AFTER_REAL_SOL_PREFIX';
  report.revocationScenarioTested = false;
  report.realTimeExpiryDemonstrated = false;
  report.disclosures.push('The SOL delivery remains delivered while the full 20000 local fake wei returns to its owner under the explicit provider loss clause.');
  // The EVM clock is owned and manually controlled. Neither an outage/reorg nor
  // natural wall-clock expiry is being simulated or claimed by this profile.
  await evm.advanceTo(cutoff);
  // The hub deliberately compares state after replacing the observed timestamp
  // with the recorded one. Clock advancement alone must not stale this digest.
  assert.equal(BigInt(await system.hub.call('isCheckpointCurrent(bytes32)', [oldCheckpoint])), 1n,
    'GENERIC_NATIVE_CHECKPOINT_CHANGED_WITHOUT_POOL_TRANSITION');
  stage('prove-and-include-exact-a0-reserve-refund');
  const reservePath = view.ledger.tree.path(reserveIndex);
  const witness = refundInputs(prepared.authorization, {
    acceptedRoot: bare(reservePath.root), siblings: reservePath.siblings.map(bare), leafIndex: reservePath.index,
    validFrom: cutoff.toString(), validUntil: (cutoff + 300n).toString() });
  let refund;
  try { refund = await prove(coordinator, 'refund', witness, publicWords('refund', witness), 'generic-native-partial-refund'); }
  finally { wipePrivate(witness); }
  assert.equal(digestHex(refund.publicInputs.slice(32, 40)), prepared.reserveNullifier);
  assert.equal(digestHex(refund.publicInputs.slice(40, 48)), prepared.recoveryCommitment);
  assert.equal(refund.publicInputs[48], cutoff.toString());
  savePublic('partial-refund', 'refund', refund);
  assert.equal(await system.verify('recover_generic', refund.proof, refund.publicInputs), true,
    'GENERIC_NATIVE_GENUINE_REFUND_VERIFIER');
  assertOwnerAbsent();
  report.refundAttempted = true; persist();
  const refundReceipt = await send('refund exact reserve after partial native prefix', pool.address,
    pool.proofData('recover_generic', refund.proof, refund.publicInputs));
  assert.equal(refundReceipt.status, '0x1');
  markRefunded();
  assertOwnerAbsent();
  view = await read();
  assert.equal(view.ledger.publicState.sequence, String(BigInt(beforeRefund.sequence) + 1n));
  assert.equal(view.ledger.publicState.backedAmount, '20000');
  assert.equal(view.ledger.publicState.actualAssetBalance, '20000');
  assert.equal(view.ledger.publicState.liveReservations, 0);
  assert.deepEqual(view.ledger.commitments, [prepared.fundingCommitment, prepared.reserveCommitment,
    prepared.changeCommitment, prepared.recoveryCommitment].map(prefix));
  assert.deepEqual(view.ledger.nullifiers, [sourceNullifier, prepared.reserveNullifier].map(prefix));
  assert.equal(view.state.receiptCount, '1'); assert.equal(view.state.spentTagCount, '0');
  assert.equal(BigInt(await system.hub.call('isCheckpointCurrent(bytes32)', [oldCheckpoint])), 0n,
    'GENERIC_NATIVE_REFUND_DID_NOT_STALE_CHECKPOINT');
  report.ownerAbsentThroughRecoveryIssuance = true;
  report.recoveryIssuance = { transactionHash: refundReceipt.transactionHash, receiptStatus: refundReceipt.status,
    exactReserveConsumed: true, exactRecoveryIssued: true, backedAmount: '20000', liveReservations: 0 };
  const issuedState = structuredClone({ pool: view.ledger.publicState, hub: view.state });
  await send('same reserve cannot refund twice', pool.address,
    pool.proofData('recover_generic', refund.proof, refund.publicInputs),
    { status: '0x0', reason: 'NOTE_ALREADY_SPENT' });
  view = await read();
  assert.deepEqual({ pool: view.ledger.publicState, hub: view.state }, issuedState);

  stage('genuine-old-btc-ready-refused-before-native-signing');
  const independentlyChecked = await readyRole.verify('ready', ready, ready.publicInputs,
    'generic-native-pre-refund-btc-ready-control');
  assert.equal(independentlyChecked.verified, true, 'GENERIC_NATIVE_GENUINE_READY_VERIFIER');
  assert.equal(independentlyChecked.metrics.acceptedResult, true);
  assert.equal(providers[1].report().phase, 'BOUND');
  assert.equal(bitcoin.processStatus().signingUnresolved, false);
  await assert.rejects(providers[1].execute({ readyProof: { proof: ready.proof,
    publicInputs: ready.publicInputs }, action, deliveryRiskSalt }),
  error => error?.code === 'PAEG_DISPATCH_CHECKPOINT_STALE', 'GENERIC_NATIVE_EXACT_STALE_READY_REFUSAL');
  const gate = providers[1].report();
  assert.equal(gate.phase, 'BOUND', 'GENERIC_NATIVE_BTC_DISPATCH_INTENT_CREATED');
  assert.equal(gate.uncertain, false); assert.equal(gate.preSignRejections, 0);
  assert.equal(gate.proofVerification.operation, 'verify');
  assert.equal(gate.proofVerification.acceptedResult, true);
  assert.equal(bitcoin.transfers.length, 0); assert.equal(bitcoin.processStatus().signingUnresolved, false);
  view = await read();
  assert.deepEqual({ pool: view.ledger.publicState, hub: view.state }, issuedState,
    'GENERIC_NATIVE_STALE_READY_CHANGED_STATE');
  report.staleReadyControl = { independentProofVerified: true, verificationMetrics: independentlyChecked.metrics,
    gateProofVerified: true, refusal: 'PAEG_DISPATCH_CHECKPOINT_STALE', providerPhase: gate.phase,
    checkpointCurrentAfterClockAdvance: true, checkpointCurrentAfterRefund: false,
    nativeTransferCount: 0, nativeSigningReached: false, revocationTested: false };
  audit();

  stage('returning-owner-binds-and-reopens-private-recovery-custody');
  const expectedBinding = {
    ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'operationId',
      'epoch', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore'].map(name => [name, ownerConfig[name]])),
    ...Object.fromEntries(['fundingCommitment', 'admissionTag', 'reserveCommitment', 'reserveNullifier',
      'changeCommitment', 'recoveryCommitment'].map(name => [name, prepared[name]])),
  };
  const destination = bare(evm.accounts[3]), balanceBefore = await evm.balance(evm.accounts[3]);
  const custody = { recoveryVault: { ...ownerConfig.vault },
    exitVault: { path: join(privateDirectory, 'owner-exits.vault'), password: fresh(), mode: 'create' },
    expectedBinding, destinations: { source: destination, change: null, recovery: destination } };
  let withdrawal;
  try {
    let returningOwner = await createGenericOwnerRecoveryProcess({ runtime: evm, system, poolIndex: 0, custody });
    setReturningOwner(returningOwner);
    const sourceStatus = await returningOwner.withdrawalStatus('source');
    assert.equal(sourceStatus.amount, '20000'); assert.equal(sourceStatus.canonicalNullifier, sourceNullifier);
    assert.equal((await returningOwner.authorizeCurrentNote('source')).status, consumed);
    const change = await returningOwner.withdrawalStatus('change');
    assert.equal(change.amount, '0'); assert.equal(change.eligibility, 'NO_CHANGE_NOTE');
    assert.equal(change.canonicalNullifier, null); assert.equal(change.recipient, null);
    const recoveryStatus = await returningOwner.withdrawalStatus('recovery');
    assert.equal(recoveryStatus.amount, '20000'); assert.equal(recoveryStatus.recipient, destination);
    assert.equal(recoveryStatus.authorization, null);
    const previousPID = returningOwner.report().pid, closed = await returningOwner.close();
    assert.equal(closed.exited, true, 'GENERIC_NATIVE_RETURNING_OWNER_EXIT');
    custody.exitVault.mode = 'recover';
    returningOwner = await createGenericOwnerRecoveryProcess({ runtime: evm, system, poolIndex: 0, custody });
    setReturningOwner(returningOwner);
    assert.notEqual(returningOwner.report().pid, previousPID, 'GENERIC_NATIVE_RETURNING_OWNER_NOT_RESTARTED');
    assert.deepEqual(await returningOwner.withdrawalStatus('recovery'), recoveryStatus);
    report.returningOwnerRestart = { previousPID, newPID: returningOwner.report().pid, closed,
      beforeWithdrawalSigning: true, sameDurableDestinations: true };
    report.ownerKeysReturnedOnlyForWithdrawal = true;
    report.ownerKeysUsedAfterReturn = 'RECOVERY_NOTE_WITHDRAWAL_ONLY';
    assert.equal((await returningOwner.authorizeCurrentNote('source')).status, consumed);
    withdrawal = await returningOwner.authorizeCurrentNote('recovery');
    assert.equal(withdrawal.status, authorized, 'GENERIC_NATIVE_RECOVERY_NOTE_NOT_AUTHORIZED');
    assert.deepEqual(walletInputPublicWords('withdraw_balance', withdrawal.witness), withdrawal.expectedPublicInputs);
    report.ownerRecoveryReconciliation = { source: consumed, recoveryBeforeWithdrawal: authorized,
      originalOwnedPoolRead: true, change: 'NO_CHANGE_NOTE' };
    report.foreignStoppedAfterRecoveryIssuance = { bitcoin: await bitcoin.close(), solana: await solana.close() };
    stage('prove-and-withdraw-owner-recovery-once');
    const withdrawRole = proofRole('owner', ['withdraw_balance']);
    let proof, attempts = 0;
    while (true) {
      proof = await prove(withdrawRole, 'withdraw_balance', withdrawal.witness, withdrawal.expectedPublicInputs,
        `generic-native-owner-recovery-exit-${attempts++}`);
      const currentTime = await evm.time();
      // Both the successful W and its exact replay mine one owned EVM block.
      // Keep both in the authorized epoch so replay tests the backing guard.
      if (String(currentTime / 600n) === withdrawal.observed.epoch && currentTime % 600n <= 597n) break;
      wipePrivate(withdrawal.witness);
      if (currentTime % 600n > 597n) await evm.advanceTo((currentTime / 600n + 1n) * 600n);
      withdrawal = await returningOwner.authorizeCurrentNote('recovery');
      assert.equal(withdrawal.status, authorized, 'GENERIC_NATIVE_RECOVERY_WITHDRAW_RECONCILE_REQUIRED');
    }
    assert.equal(proof.publicInputs[33], '20000');
    assert.equal(proof.publicInputs.slice(34, 39).map(word => BigInt(word).toString(16).padStart(8, '0')).join(''), destination);
    savePublic('withdraw-owner-recovery', 'withdraw_balance', proof);
    const receipt = await send('withdraw owner recovery 20000 local fake wei once', pool.address,
      pool.proofData('withdraw_balance', proof.proof, proof.publicInputs));
    assert.equal(receipt.status, '0x1'); await evm.checkReceipt(receipt);
    assert.equal((await evm.balance(evm.accounts[3])) - balanceBefore, 20000n,
      'GENERIC_NATIVE_OWNER_RECOVERY_BALANCE_DELTA');
    report.ownerRecoveryWithdrawal = { value: '20000', accountIndex: 3, transactionHash: receipt.transactionHash,
      receiptStatus: receipt.status, canonicalReceiptChecked: true, recipientBalanceDelta: '20000' };
    audit();
    view = await read();
    const paidState = structuredClone({ pool: view.ledger.publicState, hub: view.state });
    // At zero remaining backing, this guard precedes the spent-nullifier check.
    await send('same owner recovery cannot withdraw twice', pool.address,
      pool.proofData('withdraw_balance', proof.proof, proof.publicInputs),
      { status: '0x0', reason: 'ASSET_INSUFFICIENT_BACKING' });
    view = await read();
    assert.deepEqual({ pool: view.ledger.publicState, hub: view.state }, paidState);
    assert.equal((await evm.balance(evm.accounts[3])) - balanceBefore, 20000n);
    assert.equal((await returningOwner.authorizeCurrentNote('recovery')).status, consumed);
    report.ownerRecoveryReconciliation.recoveryAfterWithdrawal = consumed;
    Object.assign(report.ownerRecoveryWithdrawal, {
      replayRefusal: 'ASSET_INSUFFICIENT_BACKING', replayStateAndBalanceUnchanged: true });
    assert.deepEqual(view.ledger.nullifiers, [sourceNullifier, prepared.reserveNullifier, recoveryStatus.canonicalNullifier].map(prefix));
    report.returningOwnerProcess = returningOwner.report();
  } finally { wipePrivate(withdrawal?.witness); wipePrivate(custody); }

  view = await read();
  assert.equal(view.ledger.publicState.spent, 3);
  assert.equal(view.ledger.publicState.backedAmount, '0'); assert.equal(view.ledger.publicState.actualAssetBalance, '0');
  assert.equal(view.ledger.publicState.liveReservations, 0); assert.equal(view.ledger.publicState.outputCapacity, 1);
  assert.equal(view.ledger.publicState.leaves, 4);
  assert.equal(view.state.receiptCount, '1'); assert.equal(view.state.spentTagCount, '0');
  assert.equal(view.state.revokedCount, '0');
  assert.equal(solana.transfers.length, 1); assert.equal(bitcoin.transfers.length, 0);
  assert.equal(BigInt(await pool.call('canRetire()')), 1n);
  const untouched = await readNativeSystemState(evm, system, 1);
  assert.equal(untouched.ledger.publicState.leaves, 0); assert.equal(untouched.ledger.publicState.spent, 0);
  assert.equal(untouched.ledger.publicState.sequence, '0'); assert.equal(untouched.ledger.publicState.liveReservations, 0);
  assert.equal(untouched.ledger.publicState.backedAmount, '0'); assert.equal(untouched.ledger.publicState.actualAssetBalance, '0');
  assert.ok(report.proofMetrics.every(item => !['node', 'aggregate_pair', 'aggregate_all', 'fulfill'].includes(item.mode)));
  report.finalState = { pool: view.ledger.publicState, hub: view.state, secondPool: untouched.ledger.publicState };
  report.effectCounts = { solTransfers: 1, btcTransfers: 0, admittedReceipts: 1, terminalReceiptTagsConsumed: 0,
    sourceReserveRecoveryNullifiers: 3, liveReservations: 0, backedAmount: '0', actualAssetBalance: '0',
    remainingOutputCapacity: 1, remainingOutput: 'ZERO_VALUE_CHANGE_PADDING_ONLY' };
  report.actualGenericNativeFulfillment = false;
  report.partialDeliveryRefundAcceptance = true;
  report.multipleNativeGraphShapesAccepted = false;
  report.classification = 'ACTUAL_PARTIAL_NATIVE_DELIVERY_OWNER_RECOVERY_WITHDRAWAL_LOCAL_ONLY';
  audit();
}
