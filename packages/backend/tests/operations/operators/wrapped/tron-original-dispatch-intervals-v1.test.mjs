import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {retainNativeValueOriginalDispatchTimingV1,nativeValueFailureDiagnostic} from '../../../../src/execution/native-value/reconciliation/native-value-failure-retention.mjs';
const sample=()=>({profile:'NATIVE_VALUE_ORIGINAL_DISPATCH_TIMING_V1',phase:'broadcast',
 preparationMilliseconds:1.5,beforeKeyMilliseconds:11,signatureMilliseconds:3,retentionMilliseconds:7,
 beforeSendMilliseconds:13,broadcastMilliseconds:0,elapsedMilliseconds:35.5,limitMilliseconds:30000});
test('HOST private intervals belong only to original errors and retain the first bounded data without reading exception values',()=>{
 const error=new Error();Object.defineProperty(error,'message',{get(){throw Error('PRIVATE_GETTER_MUST_NOT_RUN');}});
 retainNativeValueOriginalDispatchTimingV1(error,sample());
 const diagnostic=nativeValueFailureDiagnostic(new Error('closed',{cause:error}));
 assert.equal(diagnostic.nativeDispatchTiming.elapsedMilliseconds,35);
 assert.equal(diagnostic.nativeDispatchTiming.limitMilliseconds,30000);
 assert.ok(Object.isFrozen(diagnostic.nativeDispatchTiming));
 const changed=sample();changed.elapsedMilliseconds=999;retainNativeValueOriginalDispatchTimingV1(error,changed);
 assert.equal(nativeValueFailureDiagnostic(error).nativeDispatchTiming.elapsedMilliseconds,35);
 assert.equal(nativeValueFailureDiagnostic(new Error()).nativeDispatchTiming,undefined);
});
test('HOST forged, proxy, accessor, nonfinite and extra dispatch timing records cannot retain authority or private fields',()=>{
 let accesses=0;
 const getter=sample();Object.defineProperty(getter,'phase',{enumerable:true,get(){accesses++;return 'broadcast';}});
 for(const value of [new Proxy(sample(),{get(){throw Error('PRIVATE_PROXY_MUST_NOT_RUN');}}),getter,
  {...sample(),elapsedMilliseconds:NaN},{...sample(),beforeKeyMilliseconds:-0},
  {...sample(),phase:'private-phase'},{...sample(),nativeWire:'private'},
  {...sample(),limitMilliseconds:60000},{...sample(),signatureMilliseconds:3600001}]){
  const error=new Error();retainNativeValueOriginalDispatchTimingV1(error,value);
  assert.equal(nativeValueFailureDiagnostic(error).nativeDispatchTiming,undefined);
 }
 assert.equal(accesses,0);
});
test('HOST original dispatch retains measured phase before held UNKNOWN cleanup and preserves same error and sole sign/send',async()=>{
 let source;
 for(const url of [new URL('../../../../src/chains/tron/runtime/owned-tron-native-value-runtime.mjs',import.meta.url),new URL('../chain-adapters/owned-tron-native-value-runtime.mjs',import.meta.url)]){
  try{source=readFileSync(url,'utf8');break;}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 assert.equal(typeof source,'string');
 const begin=source.indexOf('   const dispatchTiming={'),end=source.indexOf('\n  },\n  async observeNativeValueOriginal',begin);
 assert.ok(begin>=0&&end>begin);
 // Actual dispatch tail, explicit inert ports: no runtime/key/effect authority.
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const run=new AsyncFunction('env',
  'const {assert,performance,driver,scope,retain,append,current,prepareOwnedTronNative,bindOwnedTronSigned,retainNativeValueOriginalDispatchTimingV1,journal}=env;'
  +"const intent={amountSun:'0',wireKeyCommitment:'inert'},binding={},wrappedV4=false;"
  +'const exact=()=>{},hex=()=>{},clone=value=>structuredClone(value);'
  +"let entry={active:true,prepared:null,signed:null,preparationId:null},cause='persistence',operationV4=null,latched=false,busy=true;"
  +source.slice(begin,end));
 let now=0,signs=0,broadcasts=0,releaseCleanup;
 const cleanup=new Promise(resolve=>releaseCleanup=resolve),error=new Error('PRIVATE_SENTINEL_DISPATCH_ERROR'),journal={events:[]};
 const signed={nativeWire:'inert-wire',nativeId:'inert-id',transactionSHA256:'inert-hash'};
 const driver={prepare:async()=>{now+=1.5;return {preparationId:'0'.repeat(64),snapshot:{},timestampMs:'0',unsignedWire:'inert-unsigned'};},
  armKey:async()=>{},armSend:async()=>{},sign:async()=>{signs++;now+=3000;return signed;},
  broadcast:async()=>{broadcasts++;throw error;}};
 const result=run({assert,performance:{now:()=>now},driver,journal,
  scope:{beforeSign:async()=>{now+=11000;},onSigned:async()=>{now+=7000;},beforeSend:async()=>{now+=13000;}},
  retain:async()=>{},append:async kind=>{journal.events.push({kind});if(kind==='UNKNOWN')await cleanup;},current:async()=>{},
  prepareOwnedTronNative:()=>({unsignedWire:'inert-unsigned',transaction:{}}),bindOwnedTronSigned:()=>signed,
  retainNativeValueOriginalDispatchTimingV1});
 let completed=false;result.then(()=>completed=true,()=>completed=true);
 await new Promise(resolve=>setImmediate(resolve));
 const diagnostic=nativeValueFailureDiagnostic(error).nativeDispatchTiming;
 assert.equal(completed,false);assert.equal(signs,1);assert.equal(broadcasts,1);
 assert.equal(diagnostic.phase,'broadcast');assert.equal(diagnostic.beforeKeyMilliseconds,11000);
 assert.equal(diagnostic.signatureMilliseconds,3000);assert.equal(diagnostic.retentionMilliseconds,7000);
 assert.equal(diagnostic.beforeSendMilliseconds,13000);assert.equal(diagnostic.elapsedMilliseconds,34001);
 assert.equal(diagnostic.limitMilliseconds,30000);
 releaseCleanup();await assert.rejects(result,failure=>failure===error);
});
