import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {privateWalletAccountBindings} from '../src/private-wallet-account-bindings.mjs';
import {createPrivateCohortParticipantView} from '../src/private-wallet-authority.mjs';
import {PRIVATE_COHORT_PROFILE} from '../src/private-cohort-runtime.mjs';
const accounts=Array.from({length:9},(_,i)=>'0x'+(i+1).toString(16).padStart(40,'0'));
const bindings=i=>({profile:PRIVATE_COHORT_PROFILE,ownerIndex:i,deposit:accounts[i],ownerWithdrawal:accounts[i],relayer:accounts[6],payouts:{sol:accounts[2+2*i],btc:accounts[3+2*i]},authorities:{sol:accounts[7],btc:accounts[8]}});
test('legacy five-account roles remain identical',()=>{
 const b=privateWalletAccountBindings({runtime:{accounts:accounts.slice(0,5)}});
 assert.deepEqual(b,{deposit:accounts[0],ownerWithdrawal:accounts[0],relayer:accounts[2],payouts:{sol:accounts[3],btc:accounts[4]},authorities:{sol:accounts[2],btc:accounts[1]}});
});
test('each cohort account role is fixed and distinct where required',()=>{
 for(const i of [0,1]){
  const b=bindings(i),s={runtime:{accounts},accountBindings:b};
  assert.equal(privateWalletAccountBindings(s).deposit,accounts[i]);
  for(const key of ['deposit','ownerWithdrawal','relayer'])assert.throws(()=>privateWalletAccountBindings({...s,accountBindings:{...b,[key]:accounts[8]}}));
  for(const group of ['payouts','authorities'])for(const role of ['sol','btc'])assert.throws(()=>privateWalletAccountBindings({...s,accountBindings:{...b,[group]:{...b[group],[role]:accounts[0]}}}));
  assert.throws(()=>privateWalletAccountBindings({...s,accountBindings:{...b,endpoint:'http://untrusted'}}));
  assert.throws(()=>privateWalletAccountBindings({...s,accountBindings:{...b,ownerIndex:2}}));
 }
});
test('participant views preserve live clock and separate custody/lifetime/recipient capabilities',async()=>{
 const local=await mkdtemp(join(tmpdir(),'private-cohort-views-'));let clock=1,closes=0;const calls=[];
 const participants=[0,1].map(i=>({depositAccount:accounts[i],exitAccount:accounts[i],relayerAccount:accounts[6],payoutAccounts:bindings(i).payouts,solana:Object.freeze({recipient:'recipient-'+i})}));
 const base={local,runtime:{accounts},identity:{walletId:'f'.repeat(32),pool:'pool'},get clock(){return clock;},cohortBindings:{profile:PRIVATE_COHORT_PROFILE,authorities:bindings(0).authorities,participant:i=>{assert.ok(i===0||i===1);return participants[i];}},bindParticipant:(...a)=>{calls.push(a);return a[0];},close:async()=>{closes++;},privateState:async()=>({identity:{walletId:'f'.repeat(32)},snapshot:{value:1}})};
 try{
  const a=await createPrivateCohortParticipantView(base,{ownerIndex:0,walletId:'a'.repeat(32)}),b=await createPrivateCohortParticipantView(base,{ownerIndex:1,walletId:'b'.repeat(32)});
  assert.notEqual(a.local,b.local);assert.notEqual(a.identity.walletId,b.identity.walletId);assert.notEqual(a.solana.recipient,b.solana.recipient);
  assert.equal(a.clock,1);clock=7;assert.equal(a.clock,7);assert.equal(b.clock,7);
  assert.equal(a.bind('sol',{}),0);assert.equal(b.bind('btc',{}),1);assert.equal(calls.length,2);
  assert.equal((await a.privateState()).identity.walletId,'a'.repeat(32));
  assert.equal(privateWalletAccountBindings(a).relayer,accounts[6]);assert.equal(privateWalletAccountBindings(b).payouts.btc,accounts[5]);
  await a.close();await b.close();assert.equal(closes,0);assert.ok(Object.isFrozen(a));
  await assert.rejects(createPrivateCohortParticipantView(base,{ownerIndex:0,walletId:'../escape'}));
 }finally{await rm(local,{recursive:true,force:true});}
});
