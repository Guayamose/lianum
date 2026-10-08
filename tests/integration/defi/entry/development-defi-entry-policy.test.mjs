/** Public metadata fixture only. No proof, protocol or runtime acceptance. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {DEVELOPMENT_DEFI_ENTRY_PROFILE,DEVELOPMENT_DEFI_ENTRY_RESULT,assertDevelopmentDefiEntryResult} from './development-defi-entry-policy.mjs';
function report() {
  const value={format:DEVELOPMENT_DEFI_ENTRY_RESULT,profile:DEVELOPMENT_DEFI_ENTRY_PROFILE,phase:'completed',success:true,
    cleanup:{closedEvm:true,evm:{stopped:true,scratchRemoved:true},errors:[]},checks:{originalProtocolPrivateEntryAndExit:true}};
  for(const field of ['localOnly','fakeFundsOnly','sourceUnchanged','protocolInputPublic'])value[field]=true;
  for(const field of ['publicNetwork','registeredLegAdmissionEstablished','privatePAEGConversionEstablished','graphExecutionEstablished','providerReimbursementEstablished',
    'independentOperators','nativeProcessRestartEstablished','keeperLossRecoveryEstablished','fullWalletAcceptance'])value[field]=false;
  value.proofs=['deposit_intent','withdraw_balance','deposit_intent','withdraw_balance'].map((relation,index)=>({relation,
    proofSHA256:String(index+1).repeat(64),publicInputsSHA256:String(index+5).repeat(64),evidence:{resourceReceiptCompleted:true,
      selfVerified:true,acceptedResult:true,manifestSHA256:'a'.repeat(64),resourcesSHA256:'b'.repeat(64),resultSHA256:'c'.repeat(64),telemetrySHA256:'d'.repeat(64)}}));
  value.cycles=['UNISWAP_V3_EXACT_OUTPUT_SINGLE','METAMORPHO_V1_EXACT_SHARE_MINT'].map((protocol,index)=>({protocol,
    outputAmount:index?'1000000000000000000':'1000',inputSpent:'1000',metamorphoReplyDiscardAndOriginalReconcile:index===1,
    ...Object.fromEntries(['originalD27PrivateEntry','originalPrivateExit','ownerOfflineDuringDelivery','ownerAndCoordinatorRestartNoSend',
      'duplicateNoEffect','originalObservationCopyRejected','protocolAllowancesCleared','privateLiabilitiesClosed','publicOutput'].map(key=>[key,true]))}));
  return value;
}
test('fixed DeFi entry result requires both original private note lifecycles, fresh proofs and complete owned cleanup',()=>{
  assert.equal(assertDevelopmentDefiEntryResult(report()).originalPrivateProtocolEntry,true);
  for(const mutate of [value=>value.proofs.pop(),value=>value.proofs[0].evidence.resourceReceiptCompleted=false,
    value=>value.proofs[1].evidence.acceptedResult=false,value=>value.proofs[3].proofSHA256=value.proofs[1].proofSHA256,
    value=>value.cycles[0].duplicateNoEffect=false,value=>value.cycles[1].originalD27PrivateEntry=false,
    value=>value.cleanup.evm.scratchRemoved=false,value=>value.cleanup.errors.push('OWNER'),value=>value.protocolInputPublic=false]) {
    const value=report();mutate(value);assert.throws(()=>assertDevelopmentDefiEntryResult(value));
  }
});
test('entry acceptance does not establish PAEG, graph, reimbursement, a public chain or complete wallet',()=>{
  for(const field of ['publicNetwork','registeredLegAdmissionEstablished','privatePAEGConversionEstablished','graphExecutionEstablished','providerReimbursementEstablished',
    'independentOperators','nativeProcessRestartEstablished','keeperLossRecoveryEstablished','fullWalletAcceptance']) {
    const value=report();value[field]=true;assert.throws(()=>assertDevelopmentDefiEntryResult(value),/ENTRY_SCOPE/);
  }
});
