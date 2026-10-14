/** Exact runtime-owned latch continuations with explicit inert private-state
 * ports. No public issuer is added; no native runtime/key/send is executed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const clone=structuredClone,need=(ok,msg)=>assert.ok(ok,msg);
function fixture(family){
 const isBTC=family==='BTC',source=readFileSync(new URL(isBTC?'../../../../src/chains/bitcoin/runtime/owned-bitcoin-runtime.mjs':'../../../../src/chains/solana/transfers/solana-transfers.mjs',import.meta.url),'utf8');
 const begin=isBTC?'            const expected = clone(readOwnedBitcoinRuntimeAuditState(runtime));':'      const expected = cloneInput(readPayoutAuditState());';
 const end=isBTC?'\n            };':'\n      };',a=source.indexOf(begin),b=source.indexOf(end,a)+end.length;assert.ok(a>0&&b>a);
 const id=isBTC?'txid':'nativeId',record={[id]:'original',phase:'SIGNED_NOT_BROADCAST',broadcastAttempts:0,nativeWire:'original-wire',intent:{amount:'7'}};
 const other={[id]:'other',phase:'OBSERVED_CONFIRMED',broadcastAttempts:1,nativeWire:'other-wire'},records=new Map([['original',record]]),graph=[other];
 const state={readGeneration:'8',mutationGeneration:'3',signingUnresolved:false,persistenceFailed:false,isolationFailed:false,adverseHistory:false,lifetimeId:'original-lifetime'};
 const snapshot=()=>clone({...state,transfers:[...records.values()],custodyTransfers:[...records.values()],graphTransfers:graph});
 const env={clone,cloneInput:clone,need,requireCondition:need,record,records,runtime:{},readOwnedBitcoinRuntimeAuditState:snapshot,readPayoutAuditState:snapshot,same:(x,y,msg)=>assert.deepEqual(x,y,msg)};
 const continuation=vm.runInThisContext('(env=>{const {'+Object.keys(env).join(',')+'}=env;let assertLatchContinuation;'+source.slice(a,b)+';return assertLatchContinuation;})')(env);
 return {continuation,record,records,graph,state,latch(){record.phase='BROADCAST_UNKNOWN';record.broadcastAttempts=1;}};
}
for(const family of ['BTC','SOL']){
 test(`${family} exact private continuation permits only one original signed0 to latch1 transition`,()=>{const f=fixture(family);f.latch();f.continuation();assert.throws(()=>f.continuation(),/CONTINUATION_USED/);});
 for(const fault of ['before-latch','attempt2','record-copy','wire','intent','other-history','other-adverse','unresolved-key','read-generation','mutation-generation','lifetime','persistence','isolation'])
 test(`${family} continuation burns on ${fault} refusal and never grants a second send`,()=>{
  const f=fixture(family);if(fault!=='before-latch')f.latch();
  if(fault==='attempt2')f.record.broadcastAttempts=2;
  if(fault==='record-copy')f.records.set('original',clone(f.record));
  if(fault==='wire')f.record.nativeWire='changed';if(fault==='intent')f.record.intent.amount='8';
  if(fault==='other-history')f.graph[0].nativeWire='changed';if(fault==='other-adverse'){f.graph[0].adverseReason='NEW_ADVERSE';f.state.adverseHistory=true;}
  if(fault==='unresolved-key')f.state.signingUnresolved=true;
  if(fault==='read-generation')f.state.readGeneration='9';if(fault==='mutation-generation')f.state.mutationGeneration='4';
  if(fault==='lifetime')f.state.lifetimeId='other';if(fault==='persistence')f.state.persistenceFailed=true;if(fault==='isolation')f.state.isolationFailed=true;
  assert.throws(()=>f.continuation(),/LATCH_|STATE_CHANGE/);assert.throws(()=>f.continuation(),/CONTINUATION_USED/);
 });
}
