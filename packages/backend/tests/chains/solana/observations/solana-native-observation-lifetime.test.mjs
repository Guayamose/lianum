/** Source-extracted actual nonce preparation and private lease acquisition.
 * Validation/codec and native RPC ports are explicit inert substitutes; the
 * untouched prepared-state codec suites separately cover full native facts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./owned-solana-runtime.mjs',import.meta.url),'utf8');
const part=source.slice(source.indexOf('    async function prepareNonceAtCurrentHead('),source.indexOf('    function assertPayoutNativeObservation('));
function fixture(route='redeem') {
 const state={now:100,closed:false,shuttingDown:false,isolationFailure:null,nativePersistenceFailure:null,healthMs:0,hook:null,reject:false,reads:[]};
 const prepared=Object.freeze({intent:Object.freeze({sourcePublicKey:'11',recipientPublicKey:'22',nonceAccountPublicKey:'33',durableNonce:'44',lamports:'10',wireKeyCommitment:'55'}),unsignedWire:'wire',funds:Object.freeze({feeLamports:'1'})});
 const contexts=new WeakMap(),observations=new WeakMap(),selectedRoute={name:route,sourceRole:'escrow',recipientIndex:1};
 const env={requireCondition:(ok,code)=>{if(!ok)throw Error(code)},performance:{now:()=>state.now},
  sourceKey:()=>({address:'source',publicBytes:Buffer.from('11','hex')}),recipientAddress:()=> 'recipient',
  selectedNonce:()=>({infrastructure:{nonceAccountPublicKey:'33'},account:{address:'nonce'}}),
  healthy:async()=>{state.now+=state.healthMs;},nonceObservations:observations,preparationContexts:contexts,
  read:async(method)=>{state.reads.push(method);await state.hook?.(method);if(method==='getMultipleAccounts')return{value:[{},{},{},{data:'nonce'}]};
   if(method==='getGenesisHash')return'genesis';return{value:{blockhash:'hash'}};},
  contextSlot:()=>1,decodeSolanaNonceAccountData:()=>({durableNonce:'44'}),accountBytes:()=>Buffer.alloc(1),
  base58Decode:()=>Buffer.from('22','hex'),lamportsValue:BigInt,bytes32:value=>value,genesis:'genesis',MEMO_PROGRAM:{address:'memo'},
  encodeSolanaNonceBindingMessage:()=> 'aabb',same:assert.deepEqual,Buffer,frozenInput:v=>v,cloneInput:structuredClone,close:()=>{},
  handle:{assertAlive(){if(state.dead)throw Error('DEAD')}},
  checkedNoncePreparedState(raw){ assert.equal(raw.intent.durableNonce,'44');assert.ok(Object.hasOwn(raw,'repeatedRecent'));if(state.reject)throw Error('NATIVE_FULL_VALIDATION_REJECTED');return{prepared,context:{slot:'1'}};},
  revalidateSolanaNoncePreparedState(raw){assert.equal(raw.prepared,prepared);assert.ok(raw.observations.repeatedRecent);if(state.reject)throw Error('NATIVE_FULL_REVALIDATION_REJECTED');return{slot:'2'};},
 };
 const api=vm.runInThisContext(`(function(env,state){const {requireCondition,performance,sourceKey,recipientAddress,selectedNonce,healthy,nonceObservations,preparationContexts,read,contextSlot,decodeSolanaNonceAccountData,accountBytes,base58Decode,lamportsValue,bytes32,genesis,MEMO_PROGRAM,encodeSolanaNonceBindingMessage,same,Buffer,frozenInput,cloneInput,close,handle,checkedNoncePreparedState,revalidateSolanaNoncePreparedState}=env;
 let closed=false,shuttingDown=false,isolationFailure=null,nativePersistenceFailure=null;
 ${part}
 return {prepare:expected=>prepareNonceAtCurrentHead(env.selectedRoute,'10','55',expected),setState(p){({closed,shuttingDown,isolationFailure,nativePersistenceFailure}={closed,shuttingDown,isolationFailure,nativePersistenceFailure,...p});}};
 })`)({...env,selectedRoute},state);
 return{state,prepared,contexts,observations,api};
}
test('successful full nonce observation lease begins before health and every RPC and retains original identity',async()=>{
 const f=fixture();f.state.healthMs=5000;f.state.hook=async()=>{f.state.now+=1000;};
 const prepared=await f.api.prepare(null);assert.equal(prepared,f.prepared);assert.equal(f.observations.get(prepared).started,100);
 assert.equal(f.state.now,13100);assert.deepEqual(f.state.reads,['getLatestBlockhash','getMultipleAccounts','getFeeForMessage','getBlockHeight','getMinimumBalanceForRentExemption','getMinimumBalanceForRentExemption','getGenesisHash','getLatestBlockhash']);
 const prior=f.observations.get(prepared);const start=f.state.now;await f.api.prepare(prepared);assert.equal(f.observations.get(prepared).started,start);assert.notEqual(f.observations.get(prepared),prior);assert.equal(f.contexts.get(prepared).slot,'2');
});
test('incomplete and rejected native revalidation cannot retain or renew an earlier successful lease',async()=>{
 const f=fixture();await f.api.prepare(null);let release;const suspended=new Promise(r=>release=r);
 f.state.hook=async method=>{if(method==='getMultipleAccounts')await suspended;};const work=f.api.prepare(f.prepared);
 await Promise.resolve();await Promise.resolve();assert.equal(f.observations.has(f.prepared),false);
 f.state.reject=true;release();await assert.rejects(work,/NATIVE_FULL_REVALIDATION_REJECTED/);assert.equal(f.observations.has(f.prepared),false);
});
for(const fault of ['closed','shutdown','isolation','journal','process'])test(`final native await ${fault} cannot mint lease`,async()=>{
 const f=fixture();let recentReads=0;f.state.hook=async method=>{if(method==='getLatestBlockhash'&&++recentReads===2){
  if(fault==='closed')f.api.setState({closed:true});if(fault==='shutdown')f.api.setState({shuttingDown:true});
  if(fault==='isolation')f.api.setState({isolationFailure:Error('ISOLATION')});if(fault==='journal')f.api.setState({nativePersistenceFailure:Error('JOURNAL')});if(fault==='process')f.state.dead=true;
 }};await assert.rejects(f.api.prepare(null),/CLOSED|ISOLATION|JOURNAL|DEAD/);assert.equal(f.observations.has(f.prepared),false);
});
test('copied prepared identity cannot acquire the original retained observation',async()=>{
 const f=fixture();await f.api.prepare(null);await assert.rejects(f.api.prepare(structuredClone(f.prepared)),/UNKNOWN_PREPARED_CONTEXT/);
});
test('deposit preparation creates no payout freshness scope',async()=>{
 const f=fixture('deposit');await f.api.prepare(null);assert.equal(f.observations.has(f.prepared),false);
});
