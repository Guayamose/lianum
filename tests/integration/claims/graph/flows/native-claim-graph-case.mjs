/** One claim-funded graph in the fixed local acceptance fixture.
 * Native delivery uses solver liquidity; custody principal backs every claim
 * until the existing burn/ticket/discharge workflow retires it. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { freshFixtureId, writeFixturePrivate } from '../../../fixtures/runners/owned-flat-fixture.mjs';
import { prepareNativeClaimGraph } from './prepare-native-claim-graph.mjs';
import { createFlatSystemStateReader } from '../../../../../packages/backend/src/execution/account/reconciliation/flat-system-state.mjs';
import { createProofProcess } from '../../../../../packages/engine/src/execution/proofs/proof-process.mjs';
import { walletInputPublicWords, decodeWalletPoolInputs } from '../../../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { encodeFlatTransaction } from '../../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { readClaimGraphReplayState, assertClaimGraphPayoutReplay } from '../validation/native-claim-graph-terminal-checks.mjs';
import { claimDomainCommitment } from '../../../../../packages/backend/src/claims/protocol/framing.mjs';

export const CLAIM_GRAPH_AMOUNTS = Object.freeze({ source: '3000000', payout: '1200000',
  change: '1800000', nativeDelivery: '1000000' });

export async function runNativeClaimGraphCase({ fixture, owner, account, execution,
  request, ownerView, stage, audit, onProof, privateDirectory }) {
  const { runtime, system } = fixture;
  const reader = await createFlatSystemStateReader({ runtime, system, poolIndex: 1 });
  const beforeCustody = await fixture.solana.inventory();
  const beforeClaims = await fixture.observer.read();
  const custodyEffectCount = fixture.solana.transfers.length;
  assert.equal(fixture.graphSolana.transfers.length, 0);
  const cutoff = String((await runtime.time()) + 7200n);
  await stage('prepare-graph-from-existing-private-sol-claim');
  const graph = await prepareNativeClaimGraph(fixture, privateDirectory, owner, {
    cutoff, payoutAmount: CLAIM_GRAPH_AMOUNTS.payout,
    nativeAmount: CLAIM_GRAPH_AMOUNTS.nativeDelivery, poolIndex: 1,
  }, onProof);
  const reference = freshFixtureId(), requestId = 'claim_funded_sol_graph';
  await account.ownerActions.registerGraph({ ownerOperationRef: reference,
    prepared: graph.prepared, providers: graph.providers });
  await request('prepare', { requestId, kind: 'GRAPH', ownerOperationRef: reference, assetId: account.assetId });
  // The authority still needs the owner to bind and acknowledge the original
  // reservation submission. It owns suspension after S is included and before
  // native execution begins; stopping the owner here prevents reservation.
  assert.equal(owner.report().available, true, 'CLAIM_GRAPH_OWNER_REQUIRED_FOR_RESERVATION');
  await stage('execute-claim-funded-graph');
  const executeBody = { requestId };
  async function retainExecution(result, error = null) {
    let snapshot = null, snapshotError = null, accountStatus = null, accountStatusError = null;
    try { snapshot = execution.snapshot(reference); }
    catch (cause) { snapshotError = { code: cause?.code ?? null, message: String(cause?.message ?? cause) }; }
    try { accountStatus = await account.privateStatus(); }
    catch (cause) { accountStatusError = { code: cause?.code ?? null, message: String(cause?.message ?? cause) }; }
    writeFixturePrivate(join(privateDirectory, 'claim-funded-graph-execution.json'), {
      graphReference: reference, request: { action: 'execute', body: executeBody },
      result, execution: snapshot, snapshotError, accountStatus, accountStatusError, ownerLifecycle: owner.report(),
      error: error ? { code: error?.code ?? null, message: String(error?.message ?? error) } : null,
    });
    return { snapshot, snapshotError, accountStatus, accountStatusError };
  }
  let settled;
  try { settled = await request('execute', executeBody); }
  catch (error) {
    // An audit failure must not replace the original request failure. Retain
    // any available exact request/snapshot before the outer failure cleanup.
    try { await retainExecution(null, error); await audit(); } catch {}
    throw error;
  }
  const retained = await retainExecution(settled);
  await audit();
  assert.equal(retained.snapshotError, null, 'CLAIM_GRAPH_EXECUTION_SNAPSHOT_UNAVAILABLE');
  assert.equal(retained.accountStatusError, null, 'CLAIM_GRAPH_ACCOUNT_STATUS_UNAVAILABLE');
  const settledRequest = settled.requests.find(row => row.requestId === requestId);
  const accountOperation = retained.accountStatus.operations.find(row => row.ownerOperationRef === reference);
  assert.equal(settledRequest?.state, 'CONFIRMED', accountOperation?.errorCode ?? settledRequest?.errorCode
    ?? retained.snapshot?.errorCode ?? 'CLAIM_GRAPH_REQUEST_NOT_CONFIRMED');
  assert.equal(retained.snapshot.outcome, 'FULFILLED', retained.snapshot.errorCode ?? 'CLAIM_GRAPH_NOT_FULFILLED');
  assert.equal(owner.report().available, false);

  const after = await reader.read(), custody = await fixture.solana.inventory();
  const claims = await fixture.observer.read();
  assert.equal(after.ledger.publicState.backedAmount, CLAIM_GRAPH_AMOUNTS.source);
  assert.equal(after.ledger.publicState.actualAssetBalance, CLAIM_GRAPH_AMOUNTS.source);
  assert.equal(after.ledger.publicState.liveReservations, 0);
  assert.equal(after.state.spentTagCount, '4');
  assert.deepEqual(custody.accounts, beforeCustody.accounts);
  assert.deepEqual(custody.feeAudit, beforeCustody.feeAudit);
  assert.equal(fixture.solana.transfers.length, custodyEffectCount);
  const domain = claimDomainCommitment(fixture.claims.configs[1]);
  for (const view of [beforeClaims, claims]) {
    const gateway = view.gateways.find(row => row.claimDomain === domain);
    assert.equal(gateway.wrapperSupply, CLAIM_GRAPH_AMOUNTS.source);
    assert.equal(gateway.pendingRedemptions, '0');
    assert.equal(gateway.pendingRefunds, '0');
    assert.equal(gateway.heldUnissued, '0');
  }
  const deliveries = fixture.graphSolana.transfers;
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].phase, 'OBSERVED_FINALIZED');
  assert.equal(deliveries[0].broadcastAttempts, 1);
  assert.equal(deliveries[0].intent.lamports, CLAIM_GRAPH_AMOUNTS.nativeDelivery);
  assert.ok(!Object.values(fixture.solana.roles).some(role =>
    role.endpoint === deliveries[0].intent.sourcePublicKey));
  if (fixture.solana.nonceInfrastructureByAuthority) {
    const excluded = Object.values(fixture.solana.nonceInfrastructureByAuthority)
      .flatMap(pin => [pin.payerPublicKey, pin.nonceAccountPublicKey]);
    for (const key of [deliveries[0].intent.sourcePublicKey, deliveries[0].intent.recipientPublicKey])
      assert.ok(!excluded.includes(key), 'CLAIM_GRAPH_SOLVER_NOT_NONCE_INFRASTRUCTURE');
    assert.deepEqual(custody.nonceInfrastructureByAuthority, beforeCustody.nonceInfrastructureByAuthority,
      'CLAIM_GRAPH_CUSTODY_NONCES_UNCHANGED_DURING_GRAPH');
  }
  const count = runtime.transactions.length;
  await request('execute', { requestId });
  await request('restart');
  await owner.restart();
  await request('reconcile', { requestId });
  assert.equal(runtime.transactions.length, count);
  assert.equal(fixture.graphSolana.transfers.length, 1);
  const view = await ownerView();
  assert.equal(view.assets[1].balances.available, CLAIM_GRAPH_AMOUNTS.change);
  assert.equal(view.assets[1].requests.find(row => row.requestId === requestId)?.disposition, 'FULFILLED');
  writeFixturePrivate(join(privateDirectory, 'claim-funded-graph.json'), {
    originalCutoff: cutoff, graphReference: reference, beforeCustody, custody,
    beforeClaims, claims, settlement: execution.snapshot(reference), privatePortfolio: view,
    graphDelivery: deliveries[0],
  });
  await audit();
  return { graph, report: { ownerOfflineSettlement: true, originalPrivateSource: CLAIM_GRAPH_AMOUNTS.source,
    ownerChange: CLAIM_GRAPH_AMOUNTS.change, solverPayout: CLAIM_GRAPH_AMOUNTS.payout,
    nativeDelivery: CLAIM_GRAPH_AMOUNTS.nativeDelivery, custodyPrincipalUnchangedDuringGraph: true,
    wrapperSupplyAndPoolBackingConserved: true, duplicateAndRestartNoNewEffect: true,
    fourCompletionSlotsConsumed: true, originalCutoff: cutoff,
    solverPayoutExited: false, solverNativeRedemptionDischarged: false,
    timeoutRecoveryThisRun: false, fullWalletAcceptance: false } };
}

/** The recipient alone authorizes its payout-note exit. Its subsequent native
 * redemption uses the existing exact caller-bound burn and payout workflow. */
export async function exitAndRedeemClaimGraphPayout({ fixture, graphCase, controller,
  stage, audit, onProof, confirmOriginal, privateDirectory }) {
  const { runtime, system } = fixture, recipient = graphCase.graph.recipients[0];
  const reader = await createFlatSystemStateReader({ runtime, system, poolIndex: 1 });
  await stage('exit-original-solver-private-claim-payout');
  const status = await recipient.withdrawalStatus(), view = await reader.read();
  assert.equal(status.amount, CLAIM_GRAPH_AMOUNTS.payout);
  const index = view.ledger.commitments.indexOf('0x' + status.payoutCommitment);
  assert.ok(index >= 0, 'CLAIM_GRAPH_ORIGINAL_PAYOUT_MEMBERSHIP');
  const witness = await recipient.authorizeWithdrawal({ scope: status.scope, policy: status.policy,
    payoutCommitment: status.payoutCommitment, recipient: status.recipient, amount: status.amount,
    epoch: String(BigInt(view.head.timestamp) / 600n), path: view.ledger.tree.path(index) });
  const words = walletInputPublicWords('withdraw_balance', witness);
  const prover = createProofProcess({ purpose: 'recipient', modes: ['withdraw_balance'] });
  let proof;
  try {
    const generated = await prover.prove('withdraw_balance', witness, words, 'claim-graph-solver-exit');
    proof = { proof: Buffer.from(generated.proof).toString('hex'), publicInputs: [...generated.publicInputs] };
    await onProof({ label: 'claim-graph-solver-exit', relation: 'withdraw_balance',
      proof: { ...proof, metrics: generated.metrics } });
  } finally { await prover.close(); }
  const calldata = encodeFlatTransaction('withdrawBalance', proof);
  const originalReceipt = await runtime.send('claim-graph-solver-note-exit', { to: system.pools[1].address, data: calldata });
  const original = await runtime.transaction(originalReceipt.transactionHash);
  const nullifier = '0x' + status.canonicalNullifier;
  assert.equal(decodeWalletPoolInputs('withdraw_balance', proof.publicInputs).nullifier, nullifier, 'CLAIM_GRAPH_ORIGINAL_PAYOUT_N');
  const readers = [await createFlatSystemStateReader({ runtime, system, poolIndex: 0 }), reader];
  const replayState = () => readClaimGraphReplayState({ fixture, readers, sender: original.from });
  const before = await replayState();
  // After the final withdrawal, backing can reject before the spent-N guard.
  // The exact original call still must mine a revert with no economic effect.
  const receipt = await runtime.send('reject-claim-graph-solver-exit-replay',
    { to: system.pools[1].address, data: calldata }, '0x0');
  const after = await replayState();
  const entries = runtime.transactions.filter(row => row.transactionHash === receipt.transactionHash);
  assert.equal(entries.length, 1, 'CLAIM_GRAPH_REPLAY_ORIGINAL_JOURNAL');
  const evidence = { original, originalReceipt, replay: await runtime.transaction(receipt.transactionHash),
    receipt, before, after, nullifier, proof, actualReason: entries[0].revert?.reason ?? null };
  graphCase.report.solverPayoutReplay = assertClaimGraphPayoutReplay(evidence);
  writeFixturePrivate(join(privateDirectory, 'solver-payout-replay.json'), evidence);
  graphCase.report.solverPayoutExited = true;

  await stage('redeem-original-solver-claim-tokens');
  const request = { requestId: freshFixtureId(), claimDomain: claimDomainCommitment(fixture.claims.configs[1]),
    caller: runtime.accounts[1], amount: CLAIM_GRAPH_AMOUNTS.payout,
    maxFee: fixture.claims.configs[1].refundMaxFee };
  const ticket = await controller.requestRedemption(request);
  let outcome = await controller.payout({ ticketId: ticket.ticketId });
  if (outcome.status !== 'DISCHARGED') {
    await confirmOriginal(ticket.ticketId);
    outcome = await controller.payout({ ticketId: ticket.ticketId });
  }
  assert.equal(outcome.status, 'DISCHARGED');
  const transfers = fixture.solana.transfers.length, transactions = runtime.transactions.length;
  assert.equal((await controller.requestRedemption(request)).ticketId, ticket.ticketId);
  assert.equal((await controller.payout({ ticketId: ticket.ticketId })).status, 'DISCHARGED');
  assert.equal(fixture.solana.transfers.length, transfers);
  assert.equal(runtime.transactions.length, transactions);
  graphCase.report.solverNativeRedemptionDischarged = true;
  const final = await reader.read();
  assert.equal(final.ledger.publicState.backedAmount, '0');
  assert.equal(final.ledger.publicState.actualAssetBalance, '0');
  assert.equal(final.ledger.publicState.liveReservations, 0);
  graphCase.report.finalPoolBacking = '0';
  graphCase.report.finalPoolAssetBalance = '0';
  await audit();
}
