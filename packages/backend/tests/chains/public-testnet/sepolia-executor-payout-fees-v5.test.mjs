import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSepoliaExecutorPayoutHistoryDataV5 as history,assertSepoliaExecutorPayoutReservationDataV5 as reserve} from '../../../src/chains/public-testnet/sepolia-executor-payout-fees-v5.mjs';

const h=n=>n.toString(16).padStart(2,'0').repeat(32),fee=tx=>BigInt(tx.maximumFeeAtomic);
function command(n,extra={}){return{profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_COMMAND_V4',identity:h(1),jobId:h(n+10),action:'WITHDRAW_OUTPUT_W39',value:'0',expiresAt:2000,executorPayout:{profile:'ORIGINAL_PAGED_EXECUTOR_PAYOUT_COMMAND_V5',collectionId:h(2),planSHA256:h(3),quoteRoot:h(4),id:'pay-'+n,ordinal:String(n),commitment:h(n+30),nullifier:h(n+40),amountAtomic:'1000',beneficiary:'0x'+'11'.repeat(20),maximumFeeAtomic:'60',maximumTotalFeeAtomic:'100',collectBy:2000,...extra}};}
function row(n,cost,phase='FINALIZED',extra={}){return{profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_ROW_V4',id:h(n+50),command:command(n,extra),transaction:{maximumFeeAtomic:String(cost)},phase,policySHA256:h(n+60)};}

test('payout reserves fees cumulatively across every retained phase and financial epoch',()=>{
 for(const phase of ['KEY_PENDING','SIGNED','SUBMITTING','UNKNOWN','CONFIRMED','FINALIZED','REVERTED']){
  const rows=[row(0,60,phase)];
  assert.doesNotThrow(()=>reserve(rows,command(1),{maximumFeeAtomic:'40'},fee,1000));
  assert.throws(()=>reserve(rows,command(1),{maximumFeeAtomic:'41'},fee,1000),/TOTAL_FEE_CEILING/);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)),rows,'accounting does not mutate retained operations');
 }
 const epochs=[row(0,35),row(1,35,'UNKNOWN')];
 assert.throws(()=>reserve(JSON.parse(JSON.stringify(epochs)),command(2),{maximumFeeAtomic:'31'},fee,1000),/TOTAL_FEE_CEILING/);
});
test('payout per-note fee, immutable collection and replay checks fail before a reservation',()=>{
 assert.throws(()=>reserve([],command(0),{maximumFeeAtomic:'61'},fee,1000),/PAYOUT_FEE_CEILING/);
 const rows=[row(0,30)];
 for(const extra of [{quoteRoot:h(90)},{planSHA256:h(91)},{maximumTotalFeeAtomic:'101'}])assert.throws(()=>reserve(rows,command(1,extra),{maximumFeeAtomic:'30'},fee,1000),/COLLECTION_CHANGED/);
 assert.throws(()=>reserve(rows,command(0),{maximumFeeAtomic:'30'},fee,1000),/ALREADY_RESERVED/);
 assert.throws(()=>reserve(rows,command(1,{nullifier:rows[0].command.executorPayout.nullifier}),{maximumFeeAtomic:'30'},fee,1000),/ALREADY_RESERVED/);
});
test('expired retained payouts remain observable but cannot reserve any further fee',()=>{
 const rows=[row(0,40)];
 assert.doesNotThrow(()=>history(rows,fee));
 assert.throws(()=>reserve(rows,command(1),{maximumFeeAtomic:'30'},fee,2000),/PAYOUT_EXPIRED/);
 assert.throws(()=>reserve(rows,command(1),{maximumFeeAtomic:'30'},fee,2500),/PAYOUT_EXPIRED/);
});
test('payout accounting rejects malformed terms and preserves V4 commands',()=>{
 const old={profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_COMMAND_V4',identity:h(1),jobId:h(2),action:'WITHDRAW_OUTPUT_W39',value:'0'};
 assert.doesNotThrow(()=>reserve([],old,{maximumFeeAtomic:'999'},fee,5000));
 for(const extra of [{beneficiary:'0x'+'00'.repeat(20)},{id:'1invalid'},{ordinal:'01'},{amountAtomic:'0'},{maximumFeeAtomic:'0'},{maximumTotalFeeAtomic:'59'},{collectBy:1.5},{quoteRoot:'0'.repeat(64)},{extra:true}])assert.throws(()=>reserve([],command(0,extra),{maximumFeeAtomic:'1'},fee,1000),/EXECUTOR_PAYOUT/);
 for(const change of [{action:'DEPOSIT_NOTE_D26'},{value:'1'},{expiresAt:2001}])assert.throws(()=>reserve([],{...command(0),...change},{maximumFeeAtomic:'1'},fee,1000),/EXECUTOR_PAYOUT/);
 assert.throws(()=>history([row(0,60),row(1,60)],fee),/TOTAL_FEE_CEILING/);
});
