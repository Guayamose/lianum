/** Fixed CBTC100000 source -> SOL1000000 delivery, with original provider/quorum.
 * Private amounts are satoshis and the delivery amount is lamports. This exact
 * accepted invoice does not assert price discovery or parity between them. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { prepareNativeClaimGraph } from '../graph/flows/prepare-native-claim-graph.mjs';
import { createFlatSystemStateReader } from '../../../../packages/backend/src/execution/account/reconciliation/flat-system-state.mjs';
import { createProofProcess } from '../../../../packages/engine/src/execution/proofs/proof-process.mjs';
import { walletInputPublicWords, decodeWalletPoolInputs } from '../../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { encodeFlatTransaction } from '../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { validateSolanaBindingTransaction } from '../../../../packages/backend/src/chains/shared/dispatch/native-receipt-binding.mjs';
import { claimDomainCommitment } from '../../../../packages/backend/src/claims/protocol/framing.mjs';
import { freshFixtureId, writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';

export const DEVELOPMENT_BTC_SOL_AMOUNTS = Object.freeze({ source: '100000', payout: '20000',
  change: '80000', deliveredLamports: '1000000' });

export async function runDevelopmentBtcSolGraphCase({ fixture, owner, account, execution,
  request, ownerView, stage, audit, onProof, privateDirectory }) {
  const { runtime, system } = fixture;
  const reader = await createFlatSystemStateReader({ runtime, system, poolIndex: 0 });
  const beforeCustody = [await fixture.bitcoin.inventory(), await fixture.solana.inventory()];
  const beforeClaims = await fixture.observer.read();
  const beforeGraphBalances = [await fixture.graphSolana.balance(fixture.graphSolana.solver),
    await fixture.graphSolana.balance(fixture.graphSolana.recipients[0])];
  assert.deepEqual(fixture.bitcoin.transfers.map(row => row.route), ['deposit']);
  assert.equal(fixture.solana.transfers.length, 0); assert.equal(fixture.graphBitcoin.transfers.length, 0);
  assert.equal(fixture.graphSolana.transfers.length, 0);
  assert.deepEqual(beforeClaims.gateways.map(row => row.wrapperSupply), ['100000', '0']);
  const cutoff = String((await runtime.time()) + 7200n);
  await stage('prepare-original-btc-claim-funded-sol-graph');
  const graph = await prepareNativeClaimGraph(fixture, privateDirectory, owner, {
    poolIndex: 0, cutoff, payoutAmount: DEVELOPMENT_BTC_SOL_AMOUNTS.payout,
    nativeAmount: DEVELOPMENT_BTC_SOL_AMOUNTS.deliveredLamports,
  }, onProof);
  const reference = freshFixtureId(), requestId = 'development_btc_claim_sol_graph';
  await account.ownerActions.registerGraph({ ownerOperationRef: reference,
    prepared: graph.prepared, providers: graph.providers });
  const prepared = await request('prepare', { requestId, kind: 'GRAPH', ownerOperationRef: reference, assetId: account.assetId });
  assert.equal(prepared.requests.find(row => row.requestId === requestId)?.state, 'PREPARED');
  const originalRequest = prepared.requests.find(row => row.requestId === requestId);
  assert.equal(owner.report().available, true);
  await stage('execute-original-btc-claim-funded-sol-graph');
  let settled;
  try { settled = await request('execute', { requestId }); }
  catch (error) {
    // The original error remains authoritative. No new delivery, replacement
    // signature, synthetic outcome or F fallback can turn this into success.
    let snapshot = null, accountStatus = null;
    try { snapshot = execution.snapshot(reference); } catch {}
    try { accountStatus = await account.privateStatus(); } catch {}
    try {
      writeFixturePrivate(join(privateDirectory, 'btc-sol-original-execution-failure.json'), {
        reference, requestId, originalRequest, snapshot, accountStatus,
        error: { code: error.code ?? null, message: String(error.message), stack: String(error.stack) } });
      await audit();
    } catch {}
    throw error;
  }
  const terminal = execution.snapshot(reference);
  const journalRow = settled.requests.find(row => row.requestId === requestId);
  writeFixturePrivate(join(privateDirectory, 'btc-sol-original-execution.json'), {
    reference, requestId, originalRequest, journalRow, terminal, ownerLifecycle: owner.report(),
    accountStatus: await account.privateStatus() });
  assert.equal(journalRow?.state, 'CONFIRMED', journalRow?.errorCode ?? terminal.errorCode ?? 'BTC_SOL_GRAPH_NOT_CONFIRMED');
  assert.equal(terminal.outcome, 'FULFILLED');
  assert.equal(owner.report().available, false); assert.equal(owner.report().childExited, true);
  assert.equal(fixture.graphSolana.transfers.length, 1); assert.equal(fixture.graphBitcoin.transfers.length, 0);
  const delivery = fixture.graphSolana.transfers[0];
  assert.equal(delivery.phase, 'OBSERVED_FINALIZED'); assert.equal(delivery.broadcastAttempts, 1);
  assert.equal(delivery.intent.lamports, '1000000');
  const wire = validateSolanaBindingTransaction(delivery.nativeWire, delivery.intent);
  assert.equal(wire.signatureHex, delivery.nativeId); assert.equal(wire.transactionSHA256, delivery.transactionSHA256);
  assert.equal(delivery.observation.nativeWire, delivery.nativeWire);
  assert.ok(!Object.values(fixture.solana.roles).some(role => role.endpoint === delivery.intent.sourcePublicKey));
  const afterGraphBalances = [await fixture.graphSolana.balance(fixture.graphSolana.solver),
    await fixture.graphSolana.balance(fixture.graphSolana.recipients[0])];
  assert.equal(BigInt(beforeGraphBalances[0]) - BigInt(afterGraphBalances[0]),
    1000000n + BigInt(delivery.observation.feeLamports));
  assert.equal(BigInt(afterGraphBalances[1]) - BigInt(beforeGraphBalances[1]), 1000000n);
  const afterCustody = [await fixture.bitcoin.inventory(), await fixture.solana.inventory()];
  for (const index of [0,1]) {
    assert.deepEqual(afterCustody[index].accounts, beforeCustody[index].accounts);
    assert.deepEqual(afterCustody[index].feeAudit, beforeCustody[index].feeAudit);
  }
  assert.deepEqual(afterCustody[1].nonceInfrastructureByAuthority, beforeCustody[1].nonceInfrastructureByAuthority);
  assert.deepEqual(fixture.bitcoin.transfers.map(row => row.route), ['deposit']); assert.equal(fixture.solana.transfers.length, 0);
  const claims = await fixture.observer.read(); await fixture.observer.assertCurrent(claims);
  // The original observer validates the new hub health/spent-tag state. The
  // custody claim accounting itself must remain byte identical through PAEG.
  const custodyAccounting = ({ healthState: _health, poolHeadroom: _headroom, ...accounting }) => accounting;
  assert.deepEqual(claims.gateways.map(custodyAccounting), beforeClaims.gateways.map(custodyAccounting));
  const pool = await reader.read();
  assert.equal(pool.ledger.publicState.backedAmount, '100000');
  assert.equal(pool.ledger.publicState.actualAssetBalance, '100000');
  assert.equal(pool.ledger.publicState.liveReservations, 0); assert.equal(pool.state.spentTagCount, '4');
  const counts = [runtime.transactions.length, fixture.bitcoin.transfers.length, fixture.solana.transfers.length,
    fixture.graphBitcoin.transfers.length, fixture.graphSolana.transfers.length];
  await request('execute', { requestId }); await request('restart'); await owner.restart();
  await request('reconcile', { requestId }); await request('recover', { requestId });
  assert.deepEqual([runtime.transactions.length, fixture.bitcoin.transfers.length, fixture.solana.transfers.length,
    fixture.graphBitcoin.transfers.length, fixture.graphSolana.transfers.length], counts);
  const view = await ownerView(); assert.equal(view.status, 'LIVE'); assert.equal(view.coherent, true);
  assert.deepEqual(view.assets.map(row => row.balances.available), ['80000','0']);
  assert.equal(view.assets[0].requests.find(row => row.requestId === requestId)?.disposition, 'FULFILLED');
  await audit();
  return { graph, report: { sourceAsset: 'CBTC', payoutAsset: 'CBTC', deliveryFamily: '2',
    sourceAtomic: '100000', payoutAtomic: '20000', changeAtomic: '80000', deliveredLamports: '1000000',
    ownerAbsentDuringNativeAndSettlement: true, originalConfirmedHttpJournal: true,
    originalFinalizedSignatureOnce: true, separateSolverLiquidity: true,
    custodyPrincipalAndNoncesUnchangedDuringGraph: true, claimsAndPoolBackingConserved: true,
    allFourCompletionSlotsConsumed: true, duplicateRestartReconcileRecoverNoSend: true,
    originalRequestId: requestId, originalCutoff: cutoff, coordinatorProcessRestart: false,
    actualFRecoveryAcceptance: false, evmVaultAcceptance: false, solverPayoutExited: false,
    solverNativeRedemptionDischarged: false, fullWalletAcceptance: false,
    nativeBtcRedemptionRecipient: 'FIXED_OWNED_CUSTODY_RECIPIENT_FOR_BOTH_REDEMPTIONS',
    priceDiscoveryEstablished: false, sameAssetBridgeEstablished: false } };
}

export async function exitAndRedeemDevelopmentBtcSolPayout({ fixture, graphCase, controller,
  stage, audit, onProof, confirmOriginal, privateDirectory }) {
  const { runtime, system } = fixture, recipient = graphCase.graph.recipients[0];
  const reader = await createFlatSystemStateReader({ runtime, system, poolIndex: 0 });
  await stage('exit-original-private-btc-solver-payout');
  const status = await recipient.withdrawalStatus(), view = await reader.read();
  assert.equal(status.amount, '20000'); assert.equal(status.recipient, runtime.accounts[1].slice(2));
  const index = view.ledger.commitments.indexOf('0x' + status.payoutCommitment);
  assert.ok(index >= 0, 'BTC_SOL_ORIGINAL_PAYOUT_NOT_INCLUDED');
  const witness = await recipient.authorizeWithdrawal({ scope: status.scope, policy: status.policy,
    payoutCommitment: status.payoutCommitment, recipient: status.recipient, amount: status.amount,
    epoch: String(BigInt(view.head.timestamp) / 600n), path: view.ledger.tree.path(index) });
  const words = walletInputPublicWords('withdraw_balance', witness);
  const prover = createProofProcess({ purpose: 'recipient', modes: ['withdraw_balance'] });
  let proof;
  try {
    const generated = await prover.prove('withdraw_balance', witness, words, 'btc-sol-solver-exit');
    proof = { proof: Buffer.from(generated.proof).toString('hex'), publicInputs: [...generated.publicInputs] };
    await onProof({ label: 'btc-sol-solver-exit', relation: 'withdraw_balance', proof: { ...proof, metrics: generated.metrics } });
  } finally { await prover.close(); }
  const nullifier = '0x' + status.canonicalNullifier;
  assert.equal(decodeWalletPoolInputs('withdraw_balance', proof.publicInputs).nullifier, nullifier);
  const receipt = await runtime.send('btc-sol-original-solver-note-exit', {
    to: system.pools[0].address, data: encodeFlatTransaction('withdrawBalance', proof) });
  await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt); assert.equal(receipt.status, '0x1');
  const request = { requestId: 'development_btc_sol_solver_redemption', claimDomain: claimDomainCommitment(fixture.claims.configs[0]),
    caller: runtime.accounts[1], amount: '20000', maxFee: fixture.claims.configs[0].refundMaxFee };
  const ticket = await controller.requestRedemption(request);
  let outcome = await controller.payout({ ticketId: ticket.ticketId });
  if (outcome.status !== 'DISCHARGED') {
    assert.equal(outcome.status, 'UNKNOWN', 'BTC_SOL_ORIGINAL_PAYOUT_STATE_UNEXPECTED');
    const pending = await controller.privateNativeReceipt({ operationId: ticket.ticketId });
    assert.equal(pending.family, '1'); assert.equal(pending.broadcastAttempts, 1);
    const actual = fixture.bitcoin.transfers.find(row => row.txid === pending.nativeId);
    assert.ok(actual, 'BTC_SOL_ORIGINAL_PAYOUT_RECEIPT_MISSING');
    assert.equal(actual.transactionSHA256, pending.transactionSHA256);
    // An unmined original transaction remains OBSERVATION_UNAVAILABLE; the
    // reader distinguishes an insufficiently confirmed included transaction
    // as OBSERVED_PENDING. Neither is finality, signing or resend authority.
    assert.ok(['OBSERVATION_UNAVAILABLE', 'OBSERVED_PENDING'].includes(actual.phase));
    writeFixturePrivate(join(privateDirectory, 'btc-sol-original-pending-payout.json'), { outcome, pending, actual });
    await confirmOriginal(ticket.ticketId); outcome = await controller.payout({ ticketId: ticket.ticketId });
  }
  assert.equal(outcome.status, 'DISCHARGED');
  const original = await controller.privateNativeReceipt({ operationId: ticket.ticketId });
  assert.equal(original.family, '1'); assert.equal(original.broadcastAttempts, 1);
  const counts = [runtime.transactions.length, fixture.bitcoin.transfers.length, fixture.graphSolana.transfers.length];
  assert.equal((await controller.requestRedemption(request)).ticketId, ticket.ticketId);
  assert.equal((await controller.payout({ ticketId: ticket.ticketId })).status, 'DISCHARGED');
  assert.deepEqual([runtime.transactions.length, fixture.bitcoin.transfers.length, fixture.graphSolana.transfers.length], counts);
  writeFixturePrivate(join(privateDirectory, 'btc-sol-original-solver-payout.json'), { status, receipt, ticket, original, outcome });
  graphCase.report.solverPayoutExited = true; graphCase.report.solverNativeRedemptionDischarged = true;
  await audit();
}
