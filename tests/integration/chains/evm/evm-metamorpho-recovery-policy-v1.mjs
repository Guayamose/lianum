/** Fixed original MetaMorpho F postconditions. These validators confer no
 * owner, proof, receipt or dispatch authority. Legacy profiles are separate. */
import assert from 'node:assert/strict';
import {exactRecord} from '../../../../packages/backend/src/execution/encoding/commitments.mjs';
export const EVM_METAMORPHO_RECOVERY_RESULT_V1='FLAT_WALLET_PRIVATE_METAMORPHO_TIMEOUT_RECOVERY_RESULT_V1';
export const METAMORPHO_F_REVIEWED_RELEASE_V1='SOURCE_REVIEWED_FIXED_LOCAL_METAMORPHO_F_V1';
export function assertMetaMorphoFReleaseV1(){
 assert.equal(arguments.length,0);
 assert.equal(METAMORPHO_F_REVIEWED_RELEASE_V1,'SOURCE_REVIEWED_FIXED_LOCAL_METAMORPHO_F_V1','EVM_METAMORPHO_F_RELEASE_NOT_REVIEWED');
}
const match=(value,expression)=>typeof value==='string'&&expression.exec(value)?.[0]===value;
const integer=value=>{assert.ok(match(value,/^(?:0|[1-9][0-9]*)$/));return BigInt(value);};
const hash=value=>assert.ok(match(value,/^[0-9a-f]{64}$/),'METAMORPHO_F_ORIGINAL_HASH');

/** All reads were produced by the original current-head collector. F changes
 * the source note ledger, while mint accounting, tokens and target stay exact. */
export function assertOriginalMetaMorphoFAccountingV1(input){
 assert.equal(arguments.length,1);exactRecord(input,['delivered','recovered','reserveNullifier','solverPayoutCommitment']);
 const {delivered,recovered,reserveNullifier,solverPayoutCommitment}=input;
 assert.ok(match(reserveNullifier,/^0x[0-9a-f]{64}$/)&&match(solverPayoutCommitment,/^0x[0-9a-f]{64}$/));
 assert.ok(delivered.accounting.vault?.morpho&&recovered.accounting.vault?.morpho,'METAMORPHO_F_ORIGINAL_ACCOUNTING');
 assert.equal(Object.hasOwn(delivered.accounting,'uniswap'),false);assert.equal(Object.hasOwn(recovered.accounting,'uniswap'),false);
 assert.deepEqual(recovered.accounting.vault,delivered.accounting.vault,'METAMORPHO_F_CANNOT_UNDO_MINT');
 assert.deepEqual(recovered.accounting.tokens,delivered.accounting.tokens,'METAMORPHO_F_TOKEN_ACCOUNTING_CHANGED');
 // recoverGeneric releases precisely the source's four booked hub tags.
 // canonicalState(pool) and capacity expose that same global transition in
 // BOTH pool views; target-local state/history and every other hub field stay.
 assert.equal(delivered.accounting.pools.length,2);assert.equal(recovered.accounting.pools.length,2);
 const sequence=integer(delivered.accounting.pools[0].hubState.stateSequence);
 for(let index=0;index<2;index++){
  const before=delivered.accounting.pools[index],after=recovered.accounting.pools[index];
  assert.equal(integer(before.hubState.stateSequence),sequence);
  assert.equal(before.hubState.totalReservedTagCapacity,'4');assert.equal(before.hubState.reservedTagCapacity,index===0?'4':'0');
  assert.deepEqual(before.capacity,{reservedByPool:['4','0'],totalReserved:'4'});
  const hubState={...before.hubState,stateSequence:String(sequence+1n),totalReservedTagCapacity:'0',reservedTagCapacity:'0'};
  const capacity={reservedByPool:['0','0'],totalReserved:'0'};
  assert.deepEqual(after.hubState,hubState,'METAMORPHO_F_EXACT_HUB_CAPACITY_RELEASE');
  assert.deepEqual(after.capacity,capacity,'METAMORPHO_F_EXACT_GLOBAL_CAPACITY_RELEASE');
  if(index===1)assert.deepEqual(after,{...before,hubState,capacity},'METAMORPHO_F_TARGET_CHANGED');
 }
 for(const value of [delivered,recovered]){
  assert.equal(value.accounting.pools[0].publicState.backedAmount,'5000000');
  assert.equal(value.accounting.pools[1].publicState.backedAmount,'1000000000000000000');
  assert.equal(value.accounting.pools[1].publicState.actualAssetBalance,'1000000000000000000');
  assert.equal(value.accounting.pools[0].hubState.spentTagCount,'0');
  assert.equal(value.accounting.pools[0].hubState.receiptCount,'0');
 }
 assert.equal(recovered.accounting.pools[0].nullifiers.includes(reserveNullifier),true);
 assert.equal(recovered.accounting.pools[0].commitments.includes(solverPayoutCommitment),false,'METAMORPHO_F_NO_SOLVER_PAYOUT');
 return Object.freeze({mintAccountingUnchanged:true,targetAccountingUnchanged:true,tokenAccountingUnchanged:true,solverPayoutCommitmentIncluded:false});
}

export function assertEvmMetaMorphoRecoveryResultV1(result){
 assert.equal(arguments.length,1);assert.equal(result.format,EVM_METAMORPHO_RECOVERY_RESULT_V1);
 assert.equal(result.phase,'completed');assert.equal(result.success,true);assert.equal(result.protocolProfile,'OFFICIAL_METAMORPHO_V1');
 for(const field of ['localOnly','fakeFundsOnly','sourceUnchanged','sourceFundingConfirmed','controlledPostDeliveryInterruption',
  'expectedInterruptionPreserved','targetOwnerExitedBeforeDelivery','partialDeliveryRecoveryAcceptance',
  'privateMetaMorphoTimeoutRecoveryAcceptance','sourcePrivateReservationEstablished','privateOutputExitEstablished','duplicateNoEffect'])assert.equal(result[field],true,field);
 for(const field of ['publicNetwork','privateUniswapTimeoutRecoveryAcceptance','privateUniswapGraphAcceptance','privateVaultGraphAcceptance',
  'privateAaveGraphAcceptance','keeperRestart','nodeRestart','systemicPrivacyAcceptance','independentOperators',
  'performanceTargetAchieved','fullWalletAcceptance'])assert.equal(result[field],false,field);
 assert.equal(result.cleanup.closedEvm,true);assert.equal(result.expectedInterruptionCode,'METAMORPHO_F_CONTROLLED_AFTER_DELIVERY');
 assert.equal(result.failedStage,'native-delivered-0');assert.equal(result.actualAdmissionFailureCode,'FLAT_ACCOUNT_OPERATION_FAILED');
 const failed=result.originalFailedAdmission;assert.equal(failed.action,'execute');assert.equal(failed.requestId,'private_vault_graph');
 assert.equal(failed.state,'FAILED');assert.equal(failed.errorCode,result.actualAdmissionFailureCode);assert.ok(Number.isSafeInteger(failed.sequence)&&failed.sequence>0);
 assert.deepEqual(result.proofs.map(row=>row.relation),['deposit_balance','deposit_intent','authorization','reservation','dependency','ready','recovery','withdraw_balance','withdraw_balance','withdraw_balance']);
 for(const proof of result.proofs){hash(proof.proofSHA256);hash(proof.publicInputsSHA256);}
 assert.equal(result.nativeEffects.evmVault,1);
 const recovery=result.originalFRecovery;
 for(const field of ['actualFProofAccepted','ownersAbsentAtIssuance','repeatedRecoveryNoEffect','duplicateExecuteNoEffect','originalMintNotResubmitted','mintAccountingUnchanged'])assert.equal(recovery[field],true,field);
 assert.equal(recovery.originalRequestId,'private_vault_graph');assert.equal(recovery.disposition,'RECOVERED');
 assert.equal(recovery.publicInputCount,41);assert.equal(recovery.admittedReceipts,0);assert.equal(integer(recovery.cutoff),integer(recovery.publicInputCutoff));
 assert.equal(recovery.solverPayoutCommitmentIncluded,false);
 const accounting=result.metaMorphoFAccounting;
 for(const field of ['originalObserverFactsAccepted','mintAccountingUnchangedAfterF','mintAccountingUnchangedAfterExits','targetAccountingUnchangedAfterF','tokenAccountingUnchangedAfterF'])assert.equal(accounting[field],true,field);
 assert.equal(accounting.receiptStatus,'0x1');hash(accounting.receiptSHA256);hash(accounting.D27ProofSHA256);hash(accounting.D27PublicInputsSHA256);
 assert.equal(accounting.D27ProofSHA256,result.proofs[1].proofSHA256);assert.equal(accounting.D27PublicInputsSHA256,result.proofs[1].publicInputsSHA256);
 const economics=result.economics;
 assert.equal(economics.sourceDepositAtomic,'5000000');assert.equal(economics.reservedAtomic,'1200000');assert.equal(economics.changeAtomic,'3800000');
 assert.equal(economics.maximumInputAtomic,'1000000');assert.equal(economics.actualInputAtomic,'1000000');
 assert.equal(economics.deliveredOutputAtomic,'1000000000000000000');assert.equal(economics.solverPayoutAtomic,'0');
 assert.equal(integer(economics.solverBalanceBeforeDelivery)-integer(economics.solverBalanceAfterDelivery),1000000n);
 assert.equal(economics.solverFinalBalance,economics.solverBalanceAfterDelivery);
 assert.equal(economics.mintIrreversible,true);assert.equal(economics.targetKeepsOriginalOutput,true);
 assert.deepEqual(result.recoveryBalances,{source:{available:'5000000',reserved:'0',recovery:'1200000',locked:'0'},
  target:{available:'1000000000000000000',reserved:'0',recovery:'0',locked:'0'},sourceRefundAtomic:'1200000',sourceChangeAtomic:'3800000',sourceTotalAvailableAtomic:'5000000'});
 assert.deepEqual(result.originalPrivateExits,{sourceRefundAtomic:'1200000',sourceChangeAtomic:'3800000',sourceTotalExitedAtomic:'5000000',targetOutputExitedAtomic:'1000000000000000000',duplicateNoEffect:true});
 assert.equal(result.failureRecovery.originalCutoff,recovery.cutoff);assert.equal(result.failureRecovery.ownerAbsentAtIssuance,true);assert.equal(result.failureRecovery.originalFailurePreserved,true);
 assert.equal(result.failureRecovery.sourceRefundAndChangeExited,'5000000');assert.equal(result.failureRecovery.originalDeliveredOutputExited,'1000000000000000000');
 assert.equal(result.failureRecovery.solverUnderlyingLoss,'1000000');assert.equal(result.failureRecovery.solverPayoutIssued,false);assert.equal(result.failureRecovery.nativeVaultEffects,1);
 assert.equal(result.finalPools.length,2);for(const pool of result.finalPools){assert.equal(pool.backedAmount,'0');assert.equal(pool.actualAssetBalance,'0');assert.equal(pool.liveReservations,0);}
 assert.deepEqual(result.failureRecovery.finalPools,result.finalPools);
 return Object.freeze({scope:'ORIGINAL_PRIVATE_METAMORPHO_F_AFTER_ONE_IRREVERSIBLE_MINT',actualFRecoveryAcceptance:true,
  privateOutputExitAcceptance:true,solverUnderlyingSpentAtomic:'1000000',solverPayoutIssued:false,happyPathTCompleted:false,
  netSolverWealthLossEstablished:false,arbitraryDeFiAcceptance:false,fullWalletAcceptance:false});
}
