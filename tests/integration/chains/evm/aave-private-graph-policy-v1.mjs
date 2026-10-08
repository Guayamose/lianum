/** Data checks for this fixed fresh financial profile, not a proof authority. */
import assert from 'node:assert/strict';
export const AAVE_PRIVATE_GRAPH_RELATIONS_V1=Object.freeze(['deposit_balance','deposit_intent','authorization','reservation',
  'dependency','ready','admission','node','node','node','node','settlement','withdraw_balance','withdraw_balance','withdraw_balance']);
const digest=value=>assert.match(value,/^[0-9a-f]{64}$/);
const number=value=>{assert.match(value,/^(0|[1-9][0-9]*)$/);return BigInt(value);};
export function assertAavePrivateGraphResultV1(result) {
  assert.equal(arguments.length,1);
  assert.equal(result.format,'FLAT_WALLET_EVM_VAULT_FLOW_RESULT_V1');assert.equal(result.protocolProfile,'OFFICIAL_AAVE_STATIC_V1');
  assert.equal(result.protocol,'OFFICIAL_AAVE_V3_STATIC_TOKEN');assert.equal(result.phase,'completed');assert.equal(result.success,true);
  for(const name of ['localOnly','fakeFundsOnly','sourceUnchanged','sourceFundingConfirmed','privateAaveGraphAcceptance',
    'sourcePrivateReservationEstablished','privatePAEGConversionEstablished','originalNotesRecoveredOnce',
    'ownerPrivateExitsAccepted','solverPayoutRecoveredAndExitedOnce','privateOutputExitEstablished',
    'privateExitsAndUnderlyingRedemption','duplicateNoEffect'])assert.equal(result[name],true,'AAVE_FINANCIAL_COMPLETION');
  for(const name of ['publicNetwork','privateVaultGraphAcceptance','privateUniswapGraphAcceptance','partialDeliveryRecoveryAcceptance',
    'systemicPrivacyAcceptance','independentOperators','realClockFinalityAcceptance','performanceTargetAchieved','fullWalletAcceptance'])
    assert.equal(result[name],false,'AAVE_SCOPE');
  assert.equal(result.cleanup?.closedEvm,true);assert.equal(result.cleanup?.closedEvmStatus?.stopped,true);
  assert.equal(result.nativeEffects?.evmVault,1,'AAVE_ONE_ORIGINAL_SIGNED_DELIVERY');
  assert.deepEqual(result.proofs?.map(row=>row.relation),AAVE_PRIVATE_GRAPH_RELATIONS_V1);
  assert.equal(new Set(result.proofs.map(row=>row.file)).size,15);assert.equal(new Set(result.proofs.map(row=>row.proofSHA256)).size,15);
  const roles=['owner','owner','reservation','dependency','local','local','local','local','local','local','assembler'];
  for(const [i,row] of result.proofs.entries()) {
    digest(row.proofSHA256);digest(row.publicInputsSHA256);const evidence=row.evidence;assert.ok(evidence);
    if(row.relation==='deposit_balance'||row.relation==='withdraw_balance') {
      assert.equal(evidence.classification,'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY');
      assert.equal(evidence.mode,row.relation);assert.equal(evidence.operation,'prove');assert.equal(evidence.phase,'completed');
      assert.equal(evidence.acceptedResult,true);assert.equal(evidence.zeroKnowledgeEnabled,true);
      assert.equal(evidence.worker?.verified,true);assert.equal(evidence.exit?.code,0);assert.equal(evidence.exit?.signal,null);
      assert.equal(evidence.statementWords,row.relation==='deposit_balance'?26:39);digest(evidence.keySHA256);
      assert.equal(evidence.purpose,i===14?'recipient':'owner');
    }else {
      assert.equal(evidence.relation,row.relation);assert.equal(evidence.role,roles[i-1]);
      assert.equal(evidence.proofSHA256,row.proofSHA256);digest(evidence.keySHA256);digest(evidence.manifestSHA256);
      assert.equal(typeof evidence.runId,'string');assert.ok(evidence.runId.length>0);assert.equal(typeof evidence.jobId,'string');assert.ok(evidence.jobId.length>0);
    }
  }
  const loss=result.fundingReplyLoss;
  for(const name of ['discardedActualAdmissionReply','sdkReportedUnknown','originalJournalReconciled','noAutomaticResubmit'])assert.equal(loss?.[name],true);
  assert.equal(loss.requestId,'vault_top_up');assert.equal(loss.executeHttpRequests,1);assert.equal(loss.actualNetworkOutage,false);
  const claim=result.actualGlobalClaim;assert.equal(claim.protocol,'OFFICIAL_AAVE_V3_STATIC_TOKEN');
  assert.equal(claim.sourceOwnerAbsent,true);assert.equal(claim.targetOwnerAbsent,true);assert.equal(claim.exactOutputAmount,'1000000');
  assert.equal(claim.maximumInput,'1100000');assert.equal(claim.actualInput,'1000000');assert.equal(claim.solverPayout,'1200000');
  const yieldResult=result.aaveYield;assert.equal(yieldResult.protocol,'AAVE_V3_FLASH_PREMIUM_YIELD');
  assert.ok(number(yieldResult.indexAfter)>number(yieldResult.indexBefore));assert.equal(yieldResult.publicPremium,'90000');
  assert.equal(yieldResult.staticShares,'1000000');assert.equal(yieldResult.privateSharesBefore,'1000000');assert.equal(yieldResult.privateSharesAfter,'1000000');
  assert.ok(number(yieldResult.estimatedAfter)>number(yieldResult.estimatedBefore));
  assert.equal(yieldResult.privateBalanceCredited,false);assert.equal(yieldResult.borrowAPYEstablished,false);
  assert.match(yieldResult.transactionHash,/^0x[0-9a-f]{64}$/);assert.match(yieldResult.blockHash,/^0x[0-9a-f]{64}$/);
  const redeem=result.manualPrivateShareExitRedemption;assert.equal(redeem.phase,'REDEEMED');assert.equal(redeem.originalExitBound,true);
  assert.equal(redeem.duplicateNoEffect,true);assert.equal(redeem.underlyingPrivateSpendable,false);
  assert.ok(number(redeem.redeemedUnderlying)>1000000n);assert.equal(redeem.redeemedUnderlying,yieldResult.estimatedAfter);
  const accounting=result.aaveRedemption;assert.equal(accounting.protocol,'AAVE_V3_STATIC_TOKEN');
  assert.equal(accounting.underlyingReleased,redeem.redeemedUnderlying);assert.equal(accounting.privateBalanceCredited,false);
  assert.equal(accounting.incomeIndex,yieldResult.indexAfter);assert.ok(number(accounting.scaledBurned)>0n);
  assert.ok(number(result.aaveResidualUnderlying)<=1n,'AAVE_EXPLICIT_RAY_DUST');
  assert.equal(result.finalPools?.length,2);
  for(const pool of result.finalPools){assert.equal(pool.backedAmount,'0');assert.equal(pool.actualAssetBalance,'0');assert.equal(pool.liveReservations,0);}
  assert.equal(result.solverPayoutReplay?.status,'REJECTED_WITHOUT_SECOND_PAYOUT');assert.equal(result.solverPayoutReplay?.originalNullifierRemainsSpent,true);
  assert.equal(result.solverPayoutReplay?.tokenVaultPoolAccountingUnchanged,true);assert.equal(result.solverPayoutReplay?.protocolStateAndHistoryUnchanged,true);
  assert.equal(result.solverPayoutReplay?.nativePrincipalTransferred,'0');
  assert.equal(result.walletApplicationHttpAcceptance?.originalDeFiPrepareExecuteReconcileReopen,true);
  assert.equal(result.walletApplicationHttpAcceptance?.graphThroughOriginalExactConsent,true);
  assert.equal(result.walletApplicationHttpAcceptance?.browserVisualAcceptance,false);assert.equal(result.walletApplicationHttpAcceptance?.nativeClaimSessionAcceptance,false);
  assert.ok(Array.isArray(result.originalExactConsent)&&result.originalExactConsent.length>0);
  return {privateAaveGraphAcceptance:true,sourcePrivateReservationEstablished:true,privatePAEGConversionEstablished:true,
    privateOutputExitEstablished:true,privateExitsAndUnderlyingRedemption:true,genuinePublicFlashPremiumYield:true,
    borrowAPYEstablished:false,browserVisualAcceptance:false,publicNetwork:false,fullWalletAcceptance:false};
}
