/** Synthetic public metadata tests only; no deployment/proof acceptance. */
import test from 'node:test';import assert from 'node:assert/strict';
import {OSAKA_SMOKE_PROFILE,OSAKA_SMOKE_RESULT,assertOsakaSmokeResult,osakaSmokeProcessFailure} from './development-osaka-smoke-policy.mjs';
const h=i=>'0x'+i.toString(16).padStart(64,'0'),a=i=>'0x'+i.toString(16).padStart(40,'0');
function fixture(){
 const transactions=Array.from({length:44},(_,i)=>({transactionHash:h(i+1),blockHash:h(i+100),phase:'mined',status:'0x1',
  originalReceiptCanonical:true,gas:'16777216',requestGas:'16777216',gasUsed:'1000',create:true,contractAddress:a(i+1),initcodeBytes:1000}));
 for(const i of [45,46])transactions.push({transactionHash:h(i),blockHash:h(i+100),phase:'mined',status:'0x1',
  originalReceiptCanonical:true,gas:'16777216',requestGas:'16777216',gasUsed:'500',create:false,contractAddress:null,initcodeBytes:0});
 transactions.push({transactionHash:h(47),blockHash:h(147),phase:'mined',status:'0x1',originalReceiptCanonical:true,
  gas:'16777216',requestGas:'16777216',gasUsed:'500',create:false,contractAddress:null,initcodeBytes:0});
 const before={head:{number:'0x0',hash:h(500)},journalLength:0,receiptLength:0};
 return {format:OSAKA_SMOKE_RESULT,profile:OSAKA_SMOKE_PROFILE,phase:'completed',success:true,sourceUnchanged:true,
  localOnly:true,fakeFundsOnly:true,publicNetwork:false,proofAcceptanceEstablished:false,privateLifecycleEstablished:false,
  fullWalletAcceptance:false,productionClientAcceptanceEstablished:false,publicConsensusOrFinalityVerified:false,
  proofs:[],fork:'osaka',transactionGasCap:'16777216',blockGasLimit:'30000000',observedGenesisBlockGasLimit:'30000000',nodeTransactionGasLimitEnabled:true,
  runtimeProcessId:12345,cleanup:{closedEvm:true,evm:{pid:12345,exitObserved:true,exitCode:0,signal:null,spawnErrorCode:null,stopped:true,scratchRemoved:true},
   stoppedOwnedEvmEvent:{event:'stopped-owned-process',pid:12345,exitObserved:true,exitCode:0,signal:null,spawnErrorCode:null,stopped:true,scratchRemoved:false,forced:false},errors:[]},originalVerifierCount:12,originalPoolCount:2,
  transactions,creations:transactions.filter(row=>row.create).map(row=>({address:row.contractAddress,transactionHash:row.transactionHash,
    runtimeSHA256:'a'.repeat(64),creationSHA256:'b'.repeat(64),initcodeBytes:1000,runtimeBytes:500,originalCompleteCodeMatched:true})),
  runtimeGasRejections:['0','16777217','30000000'].map(gas=>({gas,noJournalNonceBalanceOrHeadEffect:true})),
  nodeCapRejection:{schema:'ORIGINAL_OWNED_OSAKA_NODE_GAS_REJECTION_V1',attempts:1,gas:'16777217',cap:'16777216',zeroValue:true,
   originalStateUnchanged:true,before,after:structuredClone(before),originalNodeRejection:{schema:'ORIGINAL_OWNED_LOOPBACK_RPC_FAILURE_V1',method:'eth_sendTransaction',
    message:{text:'Transaction gas limit is greater than the block gas limit, gas_limit: 16777217, cap: 16777216'}}},
  originalPoolRegistrationTransactionHashes:[h(45),h(46)],
  publicTransfer:{transactionHash:h(47),amount:'1',senderNonceDelta:'1',sourceTokenDelta:'-1',recipientTokenDelta:'1',
   contractCodesUnchanged:true,broadcasts:1,originalCanonicalReceipt:true,signedWireAcceptanceEstablished:false}};
}
test('policy joins deployed code, tx cap, observed rejection, one token effect and original cleanup without broadening scope',()=>{
 const value=fixture(),scope=assertOsakaSmokeResult(value);assert.equal(scope.nodeCapRejectionObserved,true);assert.equal(scope.privateLifecycleEstablished,false);
 for(const corrupt of [v=>v.transactions[0].gas='30000000',v=>v.transactions[0].requestGas='1',v=>v.transactions[0].gasUsed='16777217',
  v=>v.transactions[0].status='0x0',v=>v.creations[0].runtimeBytes=24577,v=>v.creations[0].initcodeBytes=49153,
  v=>v.creations[0].transactionHash=h(999),v=>v.creations[0].originalCompleteCodeMatched=false,v=>v.originalVerifierCount=11,
  v=>v.nodeCapRejection.after.journalLength=1,v=>v.nodeCapRejection.originalNodeRejection.message.text='generic rejection',
  v=>v.nodeCapRejection.attempts=2,v=>v.runtimeGasRejections[0].noJournalNonceBalanceOrHeadEffect=false,
  v=>v.publicTransfer.senderNonceDelta='2',v=>v.publicTransfer.sourceTokenDelta='0',v=>v.publicTransfer.broadcasts=2,
  v=>v.publicTransfer.signedWireAcceptanceEstablished=true,v=>v.proofs.push({relation:'made-up'}),
  v=>v.publicNetwork=true,v=>v.fullWalletAcceptance=true,v=>v.cleanup.stoppedOwnedEvmEvent.forced=true,v=>v.cleanup.closedEvm=false,
  v=>v.sourceUnchanged=false,v=>v.observedGenesisBlockGasLimit='60000000',
  v=>v.cleanup.stoppedOwnedEvmEvent.pid=12346,v=>delete v.cleanup.stoppedOwnedEvmEvent,
  v=>v.originalPoolRegistrationTransactionHashes[1]=h(47),v=>v.transactions.push({...v.transactions[46],transactionHash:h(999)})]){
  const changed=structuredClone(value);corrupt(changed);assert.throws(()=>assertOsakaSmokeResult(changed));
 }
});
test('smoke process policy rejects every other native/proof role and accepts only original main and Anvil lifetimes',()=>{
 assert.equal(osakaSmokeProcessFailure([{role:'main-worker',state:'S',proofWorker:false},{role:'evm-runtime',state:'R',proofWorker:false}]),null);
 for(const role of ['flat-proof-worker','golden-note-proof-worker','flat-proof-role','bitcoin-runtime','solana-runtime','owned-descendant'])
  assert.equal(osakaSmokeProcessFailure([{role,state:'S',proofWorker:false}]),'OSAKA_SMOKE_UNEXPECTED_PROCESS_OR_PROOF');
 assert.equal(osakaSmokeProcessFailure([{role:'evm-runtime',state:'S',proofWorker:true}]),'OSAKA_SMOKE_UNEXPECTED_PROCESS_OR_PROOF');
 assert.equal(osakaSmokeProcessFailure([{role:'flat-proof-worker',state:'Z',proofWorker:true}]),'OSAKA_SMOKE_UNEXPECTED_PROCESS_OR_PROOF');
 assert.equal(osakaSmokeProcessFailure([{role:'owned-descendant',state:'Z',proofWorker:false}]),'OSAKA_SMOKE_UNEXPECTED_PROCESS_OR_PROOF');
});
