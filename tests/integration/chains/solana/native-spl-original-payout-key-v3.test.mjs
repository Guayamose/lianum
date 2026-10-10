/** Original framing oracle only; no program, native authority or send. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {claimTicketSecret} from '../../../../packages/backend/src/claims/protocol/framing.mjs';
import {receiptKeyCommitment} from '../../../../packages/backend/src/chains/shared/dispatch/native-receipt-binding.mjs';
const expected='7fc4fb20c2b8734f0e48b9089e91afab2f28ae4b09e571b8d1408532f5b450b6';
test('original payout key framing fixes the oracle and separates domain, namespace and ticket',()=>{
 const claimDomain='11'.repeat(32),ledgerNamespace='22'.repeat(32),ticketId='33'.repeat(32);
 const key=(domain,namespace,ticket)=>receiptKeyCommitment({ledgerNamespace:namespace,secret:claimTicketSecret({claimDomain:domain,ticketId:ticket})});
 assert.equal(key(claimDomain,ledgerNamespace,ticketId),expected);
 for(const [domain,namespace,ticket] of [['12'.repeat(32),ledgerNamespace,ticketId],[claimDomain,'23'.repeat(32),ticketId],[claimDomain,ledgerNamespace,'34'.repeat(32)]])
  assert.notEqual(key(domain,namespace,ticket),expected);
});


/** Actual original preparation/latch bodies. RPC and persistence are explicit
 * inert ports; this establishes no native inclusion or economic recovery. */
test('expired original SPL preparation is rejected before broadcast admission while one-send guards remain',async()=>{
 const sourceUrl=new URL(import.meta.url.endsWith('/integration/native-spl-original-payout-key-v3.test.mjs')?'../wallet-platform/modules/chain-adapters/owned-solana-spl-custody-v1.mjs':'../../../../packages/backend/src/chains/solana/runtime/owned-solana-spl-custody-v1.mjs',import.meta.url);
 const source=await readFile(sourceUrl,'utf8');
 const body=(start,end)=>{const i=source.indexOf(start),j=source.indexOf(end,i);assert.ok(i>=0&&j>i);return source.slice(i,j);};
 const budgetBody=body(' function activeBudget(prepared)','\n function account(');
 const sendBody=body(' async function latchAndSend(record,authority=null,prepared=null)','\n async function infrastructureSend(');
 const prepared=Object.freeze({unsignedWire:'ORIGINAL_HOST_WIRE'}),preparedState=new WeakMap();
 let now=30001,writes=0,stateWrites=0,sends=0,liveChecks=0;const events=[];
 preparedState.set(prepared,{prepared,started:0});
 const activeBudget=new Function('assert','preparedState','performance',`return (${budgetBody.trim()});`)(assert,preparedState,{now:()=>now});
 let lost=false;const ctx={async persistTransfer(record){writes++;events.push('record:'+record.phase);},async sendOnce(wire){sends++;assert.equal(wire,'ORIGINAL_HOST_WIRE');events.push('send');if(lost)throw new Error('HOST_ORIGINAL_SEND_REPLY_LOST');return 'ORIGINAL_HOST_SIGNATURE';}};
 const persist=async()=>{stateWrites++;events.push('state');},live=()=>{liveChecks++;events.push('live');};
 const send=new Function('assert','ctx','persist','activeBudget','live',`return (${sendBody.trim()});`)(assert,ctx,persist,activeBudget,live);
 const record=()=>({phase:'SIGNED_NOT_BROADCAST',broadcastAttempts:0,nativeId:'ORIGINAL_HOST_NATIVE_ID',nativeWire:'ORIGINAL_HOST_WIRE',signature:'ORIGINAL_HOST_SIGNATURE'});
 const expired=record();await assert.rejects(send(expired,null,prepared),{code:'ERR_ASSERTION',message:'SPL_ORIGINAL_NATIVE_PREPARATION_TOO_OLD'});
 assert.deepEqual(expired,record());assert.equal(writes,0);assert.equal(stateWrites,0);assert.equal(sends,0);assert.equal(liveChecks,0);
 // Exactly at the original bound and a backwards clock fail before admission.
 for(const at of [30000,-1]){now=at;const r=record();await assert.rejects(send(r,null,prepared),{code:'ERR_ASSERTION'});assert.deepEqual(r,record());}
 assert.equal(writes,0);assert.equal(stateWrites,0);assert.equal(sends,0);
 now=29999;const original=record();const authority={async beforeSend(value){assert.equal(value,prepared);assert.equal(original.phase,'BROADCAST_UNKNOWN');assert.equal(original.broadcastAttempts,1);events.push('beforeSend');},assertBeforeSend(value){assert.equal(value,prepared);events.push('assertBeforeSend');}};
 await send(original,authority,prepared);assert.equal(original.phase,'BROADCAST');assert.equal(original.broadcastAttempts,1);assert.equal(sends,1);
 assert.deepEqual(events,['record:BROADCAST_UNKNOWN','state','beforeSend','assertBeforeSend','live','send','record:BROADCAST','state']);
 await assert.rejects(send(original,authority,prepared),{code:'ERR_ASSERTION'});assert.equal(sends,1);
 // Expiry during an admitted asynchronous guard remains uncertain; the final
 // original budget check still rejects before RPC and never undoes its latch.
 const late=record();await assert.rejects(send(late,{async beforeSend(value){assert.equal(value,prepared);now=30000;},assertBeforeSend(value){assert.equal(value,prepared);}},prepared),{code:'ERR_ASSERTION',message:'SPL_ORIGINAL_NATIVE_PREPARATION_TOO_OLD'});
 assert.equal(late.phase,'BROADCAST_UNKNOWN');assert.equal(late.broadcastAttempts,1);assert.equal(sends,1);
 now=29999;
 // A lost RPC response keeps the exact admitted wire/id, one attempt and the
 // original observe-only uncertainty. No automatic second send is introduced.
 events.length=0;lost=true;const unknown=record();let error;try{await send(unknown,null,prepared);}catch(e){error=e;}
 assert.equal(error?.message,'SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE');assert.equal(error?.nativeId,unknown.nativeId);
 assert.equal(unknown.phase,'BROADCAST_UNKNOWN');assert.equal(unknown.broadcastAttempts,1);assert.equal(unknown.nativeWire,'ORIGINAL_HOST_WIRE');assert.equal(unknown.broadcastFailure,'SPL_ORIGINAL_SEND_REPLY_UNAVAILABLE');assert.equal(sends,2);
 await assert.rejects(send(unknown,null,prepared),{code:'ERR_ASSERTION'});assert.equal(sends,2);
});
