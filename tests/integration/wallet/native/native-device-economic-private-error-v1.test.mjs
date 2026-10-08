/** HOST metadata only. No successor, authority, key, RPC or runtime is opened. */
import {test} from 'node:test';
import assert,{AssertionError} from 'node:assert';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {privateFailureDiagnostic} from '../../../../packages/backend/src/execution/account/reconciliation/failure-diagnostics.mjs';
import {privateNativeEconomicSuccessorFirstErrorV1 as diagnose} from './native-device-economic-private-error-v1.mjs';
// The public catalog is an existing source under the fixed root in both layouts.
const catalogPath=existsSync(join(ROOT,'proof-workers/catalog.mjs'))?join(ROOT,'proof-workers/catalog.mjs'):join(ROOT,'src/catalog.mjs');
const safeFrame=`    at original (${catalogPath}:41:7)`;
test('HOST first-error metadata excludes messages/values and bounds existing source frames',()=>{
 const error=new AssertionError({actual:'PRIVATE-ACTUAL',expected:'PRIVATE-EXPECTED',operator:'strictEqual'});
 error.stack=['AssertionError: PRIVATE-MESSAGE',safeFrame,'    at private (/tmp/witness.mjs:1:2)',
  ...Array(20).fill(safeFrame),'    at raw (node:internal/process:1:2)'].join('\n');
 const assigned=Object.getOwnPropertyDescriptor(error,'stack'),intrinsic=Object.getOwnPropertyDescriptor(new Error(),'stack');
 assert.equal(typeof intrinsic.get,'function');assert.equal(assigned.get,intrinsic.get,'HOST original Node24 getter after stack assignment');
 const value=diagnose(error);assert.equal(value.errorType,'ASSERTION_ERROR');assert.equal(value.errorCode,'ERR_ASSERTION');
 assert.equal(value.frames.length,16);assert.equal(value.frames[0].root,'flat-wallet');
 assert.equal(value.frames[0].path, catalogPath.slice(ROOT.length+1));assert.equal(value.frames[0].line,41);assert.equal(value.frames[0].column,7);
 const json=JSON.stringify(value);for(const secret of['PRIVATE-ACTUAL','PRIVATE-EXPECTED','PRIVATE-MESSAGE','witness','actual','expected','operator','message','original (','/tmp/'])assert.equal(json.includes(secret),false);
 const injected=new Error('PRIVATE');injected.code='ERR_ASSERTION\n';injected.stack='Error: PRIVATE\n'+safeFrame.replace(':41:7', '?private=VALUE:41:7');
 assert.equal(diagnose(injected).errorCode,null);assert.deepEqual(diagnose(injected).frames,[]);
 let accesses=0;const userStack=new Error('PRIVATE-STACK');
 Object.defineProperty(userStack,'stack',{configurable:true,get(){accesses++;return 'Error: PRIVATE\n'+safeFrame;}});
 assert.deepEqual(diagnose(userStack).frames,[]);assert.equal(accesses,0);
 for(const key of['name','message']){const unsafe=new Error('PRIVATE-TEXT');unsafe.stack='Error: PRIVATE\n'+safeFrame;
  Object.defineProperty(unsafe,key,{configurable:true,get(){accesses++;throw Error('PRIVATE');}});
  assert.deepEqual(diagnose(unsafe).frames,[]);assert.equal(accesses,0);}
 const originalName=Object.getOwnPropertyDescriptor(Error.prototype,'name');
 try{Object.defineProperty(Error.prototype,'name',{...originalName,value:'PRIVATE-ALTERED'});
  const unsafe=new Error('PRIVATE-PROTOTYPE');unsafe.stack='Error: PRIVATE\n'+safeFrame;assert.deepEqual(diagnose(unsafe).frames,[]);
 }finally{Object.defineProperty(Error.prototype,'name',originalName);}
 const originalPrepare=Object.getOwnPropertyDescriptor(Error,'prepareStackTrace');
 try{Object.defineProperty(Error,'prepareStackTrace',{configurable:true,writable:true,value(){accesses++;return 'PRIVATE';}});
  const unsafe=new Error('PRIVATE-PREPARE');assert.deepEqual(diagnose(unsafe).frames,[]);assert.equal(accesses,0);
 }finally{if(originalPrepare)Object.defineProperty(Error,'prepareStackTrace',originalPrepare);else delete Error.prepareStackTrace;}

 let reads=0;const hostile={get code(){reads++;throw Error('PRIVATE');},get stack(){reads++;throw Error('PRIVATE');},get message(){reads++;throw Error('PRIVATE');}};
 assert.equal(diagnose(hostile).errorType,'THROWN_VALUE');assert.deepEqual(diagnose(hostile).frames,[]);assert.equal(reads,0);
 const proxy=new Proxy(error,{get(){throw Error('PRIVATE');},getOwnPropertyDescriptor(){throw Error('PRIVATE');},getPrototypeOf(){throw Error('PRIVATE');}});
 assert.deepEqual(diagnose(proxy),{format:value.format,errorType:'THROWN_VALUE',errorCode:null,frames:[]});
 assert.deepEqual(privateFailureDiagnostic(error),{code:'FLAT_EXECUTION_ORIGINAL_OUTCOME_UNRESOLVED',causeCode:null,causeCodes:[]});
});
test('HOST actual worker catch retains first metadata before generic mapping and preserves storage failure',()=>{
 const source=readFileSync(new URL('./native-device-economic-successor-worker-v1.mjs',import.meta.url),'utf8');
 const marker="chain=chain.then(()=>handle(packet)).catch(async error=>{",start=source.indexOf(marker)+marker.length,end=source.indexOf(' if(process.connected)await send',start);
 assert.ok(start>=marker.length&&end>start);const body=source.slice(start,end),calls=[],outputs=[];
 const capture=runInNewContext('(error)=>{'+body+'}',{identity:{directory:'/fixed-private'},firstErrorRetained:false,join,
  privateNativeEconomicSuccessorFirstErrorV1:error=>{calls.push('first');return diagnose(error);},
  privateFailureDiagnostic:(error,fallback)=>{calls.push('generic');return privateFailureDiagnostic(error,fallback);},
  writeFixturePrivate:(path,value)=>{outputs.push({path,value});}});
 const first=new TypeError('PRIVATE-FIRST'),second=new RangeError('PRIVATE-SECOND');first.stack='TypeError: PRIVATE-FIRST\n'+safeFrame;
 capture(first);capture(second);assert.deepEqual(calls,['first','generic','generic']);
 const retained=outputs.filter(row=>row.path.endsWith('/successor-first-error-private.json'));assert.equal(retained.length,1);assert.equal(retained[0].value.errorType,'TYPE_ERROR');
 assert.equal(outputs.filter(row=>row.path.endsWith('/successor-error.json')).length,2);
 const failing=runInNewContext('(error)=>{'+body+'}',{identity:{directory:'/fixed-private'},firstErrorRetained:false,join,
  privateNativeEconomicSuccessorFirstErrorV1:diagnose,privateFailureDiagnostic,
  writeFixturePrivate:(path)=>{if(path.endsWith('/successor-first-error-private.json'))throw Error('private storage unavailable');}});
 assert.doesNotThrow(()=>failing(first));
});
