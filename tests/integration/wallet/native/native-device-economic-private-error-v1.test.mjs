/** HOST metadata only. No successor, authority, key, RPC or runtime is opened. */
import {test} from 'node:test';
import assert,{AssertionError} from 'node:assert';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {runInNewContext} from 'node:vm';
import {types} from 'node:util';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {PRIVATE_RESOURCE_POLICY} from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
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
 for(const label of ['MOBILE_ORIGINAL_EXPIRED','MOBILE_REVIEW_CHANGED','MOBILE_ORIGINAL_RESPONSE_INVALID',
  'MOBILE_SERVICE_UNAVAILABLE','MOBILE_ORIGINAL_STREAM_REQUIRED','MOBILE_RESPONSE_ORIGIN'])
  assert.equal(diagnose(new Error(label)).errorCode,label);
 for(const label of ['MOBILE_PRIVATE_VALUE','MOBILE_ORIGINAL_EXPIRED PRIVATE','MOBILE_SERVICE_UNAVAILABLE\n'])
  assert.equal(diagnose(new Error(label)).errorCode,null);
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

test('HOST original successor CLOSE keeps remote EOF and the same real ChildProcess close',async t=>{
 // Inert IPC child only: no account, issuer, RPC, signing, SDK or proof. The
 // actual private launcher control body drives this same ChildProcess.
 const directory=await mkdtemp(join(tmpdir(),'lianum-successor-close-eof-'));
 const entry=join(directory,'inert-control.mjs'),children=[];
 await writeFile(entry,`process.on('message',packet=>{
   if(packet.action!=='CLOSE'){process.exitCode=1;process.disconnect();return;}
   process.send({sequence:packet.sequence,ok:true,value:{closed:true,originalBackendStopped:true,
     listenerClosed:true,ownedSocketsRemaining:0,processId:process.pid}},error=>{
       if(error){process.exitCode=1;return;}
       // Deterministic reply-before-EOF ordering; no product deadline changes.
       setTimeout(()=>{if(process.connected)process.disconnect();},25);
     });
 });`,{mode:0o600});
 const spawn=async()=>{const child=fork(entry,[],{execArgv:['--max-old-space-size=64'],cwd:directory,
   env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},stdio:['ignore','inherit','inherit','ipc']});
   const exited=once(child,'exit');children.push({child,exited});await once(child,'spawn');return{child,exited};};
 t.after(async()=>{for(const{child,exited}of children){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
   if(child.connected)child.disconnect();await exited;assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});}
   await rm(directory,{recursive:true,force:true});});
 // Reproduce the original Node24 IPC close-count loss with a real child.
 const old=await spawn();let oldCloseObserved=false;
 old.child.once('close',()=>{oldCloseObserved=true;});
 const reply=once(old.child,'message');old.child.send({sequence:1,action:'CLOSE'});
 assert.equal((await reply)[0].ok,true);old.child.disconnect();
 assert.deepEqual(await old.exited,[0,null]);
 await new Promise(resolve=>setTimeout(resolve,50));assert.equal(oldCloseObserved,false);
 assert.throws(()=>process.kill(old.child.pid,0),{code:'ESRCH'});

 const source=readFileSync(new URL('./native-device-economic-launcher-v1.mjs',import.meta.url),'utf8');
 const start=source.indexOf(' const pending=new Map();'),end=source.indexOf(' economicLifetime.closeSuccessor=close;',start);
 assert.ok(start>=0&&end>start);
 const bind=runInNewContext('(child,context,identity)=>{const liveArmed=false;'+source.slice(start,end)+';return {close};}',
   {assert,Buffer,Error,setTimeout,clearTimeout,MAXIMUM_IPC_BYTES:2*1024*1024});
 const current=await spawn(),events=[];current.child.once('exit',()=>events.push('exit'));
 current.child.once('close',()=>events.push('close'));
 const lifetime=bind(current.child,{active(){}},{deadlineMs:Date.now()+5000});
 const stopped=await lifetime.close();assert.deepEqual(await current.exited,[0,null]);
 assert.equal(stopped.processId,current.child.pid);assert.equal(stopped.originalChildProcessClosed,true);
 assert.equal(stopped.originalBackendStopped,true);assert.equal(stopped.closed,true);
 assert.deepEqual({...stopped.exit},{code:0,signal:null});assert.deepEqual({...stopped.close},{code:0,signal:null});
 assert.deepEqual(events,['exit','close']);assert.throws(()=>process.kill(current.child.pid,0),{code:'ESRCH'});
 assert.equal(await lifetime.close(),stopped);
});

test('HOST original parent tail retains safe failure before waiting for the same cleanup',async()=>{
 const source=readFileSync(new URL('./native-device-economic-original-continuation-v1.mjs',import.meta.url),'utf8');
 const marker=' }catch(error){',start=source.lastIndexOf(marker)+marker.length,end=source.indexOf('throw error;}',start)+'throw error;'.length;
 assert.ok(start>=marker.length&&end>start);const body=source.slice(start,end),events=[],outputs=[];
 let release;const pending=new Promise(resolve=>{release=resolve;});
 const failure=new AssertionError({actual:'PRIVATE-ACTUAL',expected:'PRIVATE-EXPECTED',operator:'strictEqual'});
 failure.stack='AssertionError: PRIVATE-MESSAGE\n'+safeFrame;
 const run=runInNewContext('(async(error)=>{'+body+'})',{join,
   context:{privateDirectory:'/fixed-private',result:{cleanup:{errors:[]}}},
   privateNativeEconomicSuccessorFirstErrorV1:diagnose,privateFailureDiagnostic,
   writeFixturePrivate:(path,value)=>{events.push('retained');outputs.push({path,value});},
   close:()=>events.push('local-fenced'),successor:{close:()=>{events.push('owned-cleanup');return pending;}}});
 const work=run(failure);let settled=false;work.catch(()=>{settled=true;});
 assert.deepEqual(events,['retained','local-fenced','owned-cleanup']);assert.equal(settled,false);
 assert.equal(outputs[0].path,'/fixed-private/parent-tail-first-error-private.json');
 assert.equal(outputs[0].value.errorCode,'ERR_ASSERTION');assert.equal(outputs[0].value.frames.length,1);
 for(const text of['PRIVATE-ACTUAL','PRIVATE-EXPECTED','PRIVATE-MESSAGE','actual','expected','operator','message'])assert.equal(JSON.stringify(outputs[0].value).includes(text),false);
 release();await assert.rejects(work,error=>error===failure);
 const failedStorage=runInNewContext('(async(error)=>{'+body+'})',{join,
   context:{privateDirectory:'/fixed-private',result:{cleanup:{errors:[]}}},
   privateNativeEconomicSuccessorFirstErrorV1:diagnose,privateFailureDiagnostic,
   writeFixturePrivate:()=>{throw Error('PRIVATE-STORAGE');},close(){},successor:{async close(){}}});
 await assert.rejects(failedStorage(failure),error=>error===failure);
});


test('HOST original TOP_UP cause precedes UNKNOWN persistence and fixed private retention never grants an effect',async()=>{
 const mappedAuthority=join(ROOT,'wallet-platform/modules/global-state/native-value-account-authority-v2.mjs');
 const authorityPath=existsSync(mappedAuthority)?mappedAuthority:join(ROOT,'../backend/src/accounts/authority/native-value-account-authority-v2.mjs');
 const authority=readFileSync(authorityPath,'utf8');
 const unresolvedStart=authority.indexOf('  async function unresolved(ref, error) {'),unresolvedEnd=authority.indexOf('\n  /** Read the already retained original outcome',unresolvedStart);
 const executeStart=authority.indexOf('  async function originalGraphExecute(value) {'),executeEnd=authority.indexOf('\n  async function originalGraphReconcile',executeStart);
 assert.ok(unresolvedStart>=0&&unresolvedEnd>unresolvedStart&&executeStart>=0&&executeEnd>executeStart);
 const first=new TypeError('PRIVATE-ORIGINAL');first.stack='TypeError: PRIVATE-ORIGINAL\n'+safeFrame;
 const later=new Error('PRIVATE-JOURNAL');
 async function run({callbackFails=false,writeFails=false,unavailable=false}={}){
  const events=[],captured=[];const entry={request:{},outcome:null,stage:'READY'},bound={kind:'TOP_UP',ownerOperationRef:'fixed-host-reference'};
  const execute=runInNewContext('(()=>{'+authority.slice(unresolvedStart,unresolvedEnd)+authority.slice(executeStart,executeEnd)+';return originalGraphExecute;})()',{
   assert,unavailable,privateFailureDiagnostic,healthy:async()=>{},request:()=>({entry,bound}),operation:()=>entry,
   async update(ref,value){events.push(value.stage);if(value.stage==='UNKNOWN'&&writeFails)throw later;},
   async onStage(){},async executeNote(){events.push('original-note');throw first;},
   async executeGraph(){throw Error('HOST_GRAPH_FORBIDDEN');},async confirmTerminal(){throw Error('HOST_TERMINAL_FORBIDDEN');},
   async reconcileOriginal(){throw Error('HOST_RECONCILE_FORBIDDEN');},
   async onPrivateAudit(event){events.push(event.stage);if(event.stage==='account-first-failure'){
    assert.equal(event.originalError,first);captured.push(event);if(callbackFails)throw Error('PRIVATE-DIAGNOSTIC');}}
  });
  await assert.rejects(execute({}),error=>error===(writeFails&&!unavailable?later:first));
  assert.equal(captured.length,1);assert.equal(captured[0].diagnostic.code,'FLAT_ACCOUNT_ORIGINAL_OUTCOME_UNRESOLVED');
  assert.ok(events.indexOf('account-first-failure')>events.indexOf('original-note'));
  if(!unavailable)assert.ok(events.indexOf('account-first-failure')<events.indexOf('UNKNOWN'));
  else assert.equal(events.includes('UNKNOWN'),false);
 }
 await run();await run({callbackFails:true});await run({writeFails:true});await run({unavailable:true});

 const driver=readFileSync(new URL('./native-wallet-real-driver-v1.mjs',import.meta.url),'utf8');
 const start=driver.indexOf('  function retainAccountFailure(event){'),end=driver.indexOf('  async function retainProof',start);assert.ok(start>=0&&end>start);
 const outputs=[],capture=runInNewContext('(()=>{'+driver.slice(start,end)+';return retainAccountFailure;})()',{
  Object,firstAccountErrorRetained:false,privateNativeEconomicSuccessorFirstErrorV1:diagnose,privateFailureDiagnostic,join,
  privateDirectory:'/fixed-private',writeFixturePrivate:(path,value)=>{outputs.push({path,value});}
 });
 capture({stage:'owner-transition',receipt:{private:'PRIVATE-RECEIPT'}});assert.equal(outputs.length,0);
 capture({stage:'account-first-failure',originalError:first});capture({stage:'account-first-failure',originalError:later});
 assert.equal(outputs.length,1);assert.equal(outputs[0].path,'/fixed-private/account-first-error-private.json');
 assert.equal(outputs[0].value.errorType,'TYPE_ERROR');assert.equal(outputs[0].value.frames.length,1);
 for(const value of['PRIVATE-ORIGINAL','PRIVATE-JOURNAL','PRIVATE-RECEIPT','reference','message','actual','expected','wire'])assert.equal(JSON.stringify(outputs[0].value).includes(value),false);
 const failing=runInNewContext('(()=>{'+driver.slice(start,end)+';return retainAccountFailure;})()',{
  Object,firstAccountErrorRetained:false,privateNativeEconomicSuccessorFirstErrorV1:diagnose,privateFailureDiagnostic,join,
  privateDirectory:'/fixed-private',writeFixturePrivate:()=>{throw Error('PRIVATE-STORAGE');}
 });
 assert.doesNotThrow(()=>failing({stage:'account-first-failure',originalError:first}));
});


test('HOST original mobile primary code precedes formatting and survives diagnostic storage failure',()=>{
 const source=readFileSync(new URL('./device-external-flat-erc20-flow-v1.mjs',import.meta.url),'utf8');
 const start=source.indexOf('const ORIGINAL_MOBILE_FAILURE_CODES_V1=new Set(['),end=source.indexOf('async function run(){',start);
 assert.ok(start>=0&&end>start);const body=source.slice(start,end),events=[],outputs=[];
 const bind=(writer,formatter=diagnose)=>runInNewContext('(()=>{'+body+';return {code:originalDeviceExternalFlatMobileFailureCodeV1,retain:retainOriginalDeviceExternalFlatFirstErrorV1};})()',{
  types,privateNativeEconomicSuccessorFirstErrorV1:formatter,writeFixturePrivate:writer
 });
 const original=new Error('MOBILE_EXTERNAL_FLAT_BINDING');original.stack='Error: PRIVATE-PRIMARY\n'+safeFrame;
 const capture=bind((path,value)=>{events.push('retained');outputs.push({path,value});},error=>{
  assert.equal(error,original);events.push('formatter');
  // Changing the error after the source-owned code was read cannot replace it.
  Object.defineProperty(error,'message',{value:'PRIVATE-LATER',configurable:true});return diagnose(error);
 });
 capture.retain('/fixed-private/first-error-private.json',original);
 assert.deepEqual(events,['formatter','retained']);assert.equal(outputs.length,1);
 assert.equal(outputs[0].value.originalMobileErrorCode,'MOBILE_EXTERNAL_FLAT_BINDING');
 assert.equal(outputs[0].value.errorType,'ERROR');assert.equal(outputs[0].value.errorCode,null);
 for(const text of ['PRIVATE-PRIMARY','PRIVATE-LATER','message','actual','expected'])assert.equal(JSON.stringify(outputs[0].value).includes(text),false);
 const helpers=bind(()=>{throw Error('PRIVATE-STORAGE');});
 const first=new Error('MOBILE_EXTERNAL_FLAT_WRITE_UNCERTAIN');assert.doesNotThrow(()=>helpers.retain('/fixed-private/first-error-private.json',first));
 assert.equal(first.message,'MOBILE_EXTERNAL_FLAT_WRITE_UNCERTAIN');
 for(const value of [new Error('MOBILE_EXTERNAL_FLAT_BINDING\n'),new Error('MOBILE_EXTERNAL_FLAT_BINDING PRIVATE'),new Error('PRIVATE-UNKNOWN'),{message:'MOBILE_EXTERNAL_FLAT_BINDING'}])assert.equal(helpers.code(value),null);
 let calls=0;const accessor=new Error('PRIVATE-MESSAGE');for(const key of ['code','message'])Object.defineProperty(accessor,key,{configurable:true,get(){calls++;throw Error('PRIVATE-ACCESSOR');}});
 assert.equal(helpers.code(accessor),null);assert.equal(calls,0);
 const proxy=new Proxy(first,{get(){calls++;throw Error('PRIVATE-PROXY');},getOwnPropertyDescriptor(){calls++;throw Error('PRIVATE-PROXY');}});
 assert.equal(helpers.code(proxy),null);assert.equal(calls,0);
 const explicit=new Error('PRIVATE-MESSAGE');explicit.code='MOBILE_EXTERNAL_FLAT_CAPACITY';assert.equal(helpers.code(explicit),'MOBILE_EXTERNAL_FLAT_CAPACITY');
 const marker=" }catch(error){primary=error;",catchStart=source.indexOf(marker),catchEnd=source.indexOf('\n finally{',catchStart);
 assert.ok(catchStart>=0&&catchEnd>catchStart);const caught=source.slice(catchStart,catchEnd);
 assert.ok(caught.indexOf('retainOriginalDeviceExternalFlatFirstErrorV1')<caught.indexOf('readOriginalDeviceExternalFlatHttpFailureV1'));
 assert.ok(caught.includes("join(privateDirectory,'first-error-private.json'),error"));
 assert.ok(source.includes('if(primary)throw primary;return result;'));
});


test('HOST original legacy resource receipt uses actual completed report and samples without an invented flag',()=>{
 // Public metadata only. Execute the actual parent completion and policy proof
 // loop; no proof, runtime, account, witness, signing or acceptance is created.
 const policy=readFileSync(new URL('./device-external-flat-erc20-policy-v1.mjs',import.meta.url),'utf8');
 const a=policy.indexOf(" assert.deepEqual(result.proofs.map(p=>p.relation),"),b=policy.indexOf(" assert.equal(result.assetMetadata.kind,",a);assert.ok(a>=0&&b>a);
 const check=runInNewContext('(result)=>{'+policy.slice(a,b)+'}',{assert,PRIVATE_RESOURCE_POLICY});
 const generated=import.meta.url.endsWith('/integration/native-device-economic-private-error-v1.test.mjs');
 const producerURL=new URL(generated?'../../../omnichain-product/src/paeg/proof-process.mjs':'../../../../packages/engine/src/execution/proofs/proof-process.mjs',import.meta.url);
 const producer=readFileSync(producerURL,'utf8');
 assert.equal(producer.includes('resourceReceiptCompleted'),false);
 const c=producer.indexOf('    const finish = (exitCode, signal) => {'),z=producer.indexOf('\n    current = { done, stop };',c);assert.ok(c>=0&&z>c);
 const originalFinishSource=producer.slice(c,z);assert.equal(originalFinishSource.split('import.meta.url').length-1,1);
 const finishSource=originalFinishSource.replace('import.meta.url','HOST_MODULE_URL');
 const key='aa'.repeat(32),receipt=(mode,label,index)=>{
  const report={classification:'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY',mode,operation:'prove',purpose:'owner',label,
   phase:'awaiting-child-exit',acceptedResult:false,policy:structuredClone(PRIVATE_RESOURCE_POLICY),zeroKnowledgeEnabled:true,threads:1,maximumPages:32768,keySHA256:key,
   resourceSamples:[{availableRAM:PRIVATE_RESOURCE_POLICY.floors.availableRAM,freeDisk:PRIVATE_RESOURCE_POLICY.floors.freeDisk,workerRSS:1024,parentRSS:1024}],
   worker:{verified:true,zeroKnowledgeEnabled:true,threads:1,maximumPages:32768,keySHA256:key,proofSHA256:String(index+1).repeat(64),publicInputsSHA256:String(index+3).repeat(64)}};
  let returned;const run=runInNewContext('(()=>{'+finishSource+';return finish;})()',{
   HOST_MODULE_URL:producerURL.href,finished:false,failure:null,report,resultSeen:true,nativeNote:false,nativeProducer:false,
   monitor:undefined,deadline:undefined,killTimer:undefined,payload:null,performance:{now:()=>2.5},began:0,
   clearInterval(){},clearTimeout(){},persist(){},releaseLock(){},current:null,activeHostJob:null,lastReport:null,
   child:{stdio:[]},result:{proof:'EXPLICIT_HOST_NO_PROOF',publicInputs:[]},structuredClone,
   proofError:code=>Object.assign(Error(code),{code}),wipePrivate(){},resolveDone:value=>{returned=value;},rejectDone:error=>{throw error;}
  });run(0,null);assert.ok(returned);assert.equal(Object.hasOwn(returned.metrics,'resourceReceiptCompleted'),false);
  return{label,relation:mode,publicWords:index?39:26,amountAtomic:'500',proofSHA256:report.worker.proofSHA256,publicInputsSHA256:report.worker.publicInputsSHA256,
   rawTelemetrySHA256:'cc'.repeat(32),retainedTelemetrySHA256:'cc'.repeat(32),actualProofChildGone:true,evidence:returned.metrics};
 };
 const value={proofs:[receipt('deposit_balance','device-external-flat-d26',0),receipt('withdraw_balance','device-external-flat-w39',1)],artifacts:{noteKeys:{deposit_balance:key,withdraw_balance:key}}};
 assert.equal(check(value),undefined);
 const deny=mutate=>{const row=structuredClone(value);mutate(row.proofs[0]);assert.throws(()=>check(row));};
 for(const name of ['failureCode','telemetryWriteFailed','fallbackTelemetryWriteFailed'])deny(p=>{p.evidence[name]=name==='failureCode'?'PAEG_PROOF_RESOURCE_SAMPLE':true;});
 deny(p=>{p.evidence.resourceSamples=[];p.evidence.resourceReceiptCompleted=true;});
 for(const [field,invalid]of [['availableRAM',PRIVATE_RESOURCE_POLICY.floors.availableRAM-1],['freeDisk',PRIVATE_RESOURCE_POLICY.floors.freeDisk-1],['workerRSS',PRIVATE_RESOURCE_POLICY.proofWorkerRSSLimit+1],['workerRSS',-1],['workerRSS',NaN]])deny(p=>{p.evidence.resourceSamples[0][field]=invalid;});
 deny(p=>{p.evidence.phase='failed';});deny(p=>{p.evidence.acceptedResult=false;});deny(p=>{p.evidence.exit.signal='SIGTERM';});
 deny(p=>{p.evidence.worker.verified=false;});deny(p=>{p.evidence.worker.proofSHA256='dd'.repeat(32);});deny(p=>{p.retainedTelemetrySHA256='dd'.repeat(32);});deny(p=>{p.actualProofChildGone=false;});
});

test('HOST aggregate private diagnostics retain bounded primary/cleanup frames without payloads or accessors',()=>{
 const primary=new AssertionError({actual:'PRIVATE-ACTUAL',expected:'PRIVATE-EXPECTED',operator:'strictEqual'});
 primary.stack='AssertionError: PRIVATE-PRIMARY\n'+safeFrame;
 const cleanup=new Error('PRIVATE-CLEANUP');cleanup.code='VAULT_LOCKED';cleanup.stack='Error: PRIVATE-CLEANUP\n'+safeFrame;
 const aggregate=new AggregateError([primary,cleanup],'PRIVATE-AGGREGATE',{cause:primary});
 aggregate.stack='AggregateError: PRIVATE-AGGREGATE\n'+safeFrame;
 const value=diagnose(aggregate);assert.equal(value.errorType,'AGGREGATE_ERROR');
 assert.equal(value.cause.errorCode,'ERR_ASSERTION');assert.equal(value.cause.frames.length,1);
 assert.deepEqual(value.errors.map(row=>row.errorCode),['ERR_ASSERTION','VAULT_LOCKED']);
 assert.equal(value.errors[1].frames.length,1);
 for(const secret of ['PRIVATE-','actual','expected','operator','message'])assert.equal(JSON.stringify(value).includes(secret),false);
 let calls=0;const hostile=new AggregateError([],'PRIVATE');
 for(const key of ['cause','errors'])Object.defineProperty(hostile,key,{configurable:true,get(){calls++;throw Error('PRIVATE');}});
 assert.equal(Object.hasOwn(diagnose(hostile),'errors'),false);assert.equal(calls,0);
 const proxyErrors=new AggregateError([],'PRIVATE');proxyErrors.errors=new Proxy([],{get(){calls++;throw Error('PRIVATE');},getOwnPropertyDescriptor(){calls++;throw Error('PRIVATE');}});
 assert.equal(Object.hasOwn(diagnose(proxyErrors),'errors'),false);assert.equal(calls,0);
 const revoked=Proxy.revocable([],{});revoked.revoke();proxyErrors.errors=revoked.proxy;assert.equal(Object.hasOwn(diagnose(proxyErrors),'errors'),false);
 const cyclic=new AggregateError([],'PRIVATE');cyclic.errors=[cyclic];cyclic.cause=cyclic;
 assert.equal(diagnose(cyclic).nestedTruncated,true);assert.deepEqual(diagnose(cyclic).errors,[]);
 let deep=cleanup;for(let i=0;i<10;i++)deep=new AggregateError([deep],'PRIVATE',{cause:deep});
 let count=0,maxDepth=0;const walk=(row,depth=0)=>{count++;maxDepth=Math.max(maxDepth,depth);if(row.cause)walk(row.cause,depth+1);for(const child of row.errors??[])walk(child,depth+1);};
 const bounded=diagnose(deep);walk(bounded);assert.ok(count<=16);assert.ok(maxDepth<=3);
 assert.equal(JSON.stringify(bounded).includes('nestedTruncated'),true);
 const wide=diagnose(new AggregateError(Array(100).fill(cleanup),'PRIVATE'));assert.equal(wide.errors.length,8);assert.equal(wide.nestedTruncated,true);
});

test('HOST D26 observation retains the same original failure behind a lost or rejected HTTP reply', async () => {
  const { types } = await import('node:util');
  const bridgeSource = readFileSync(new URL('../wallet-platform/modules/global-state/device-owner-deposit-bridge-v1.mjs', import.meta.url), 'utf8');
  const start = bridgeSource.indexOf('    async observe(input) {'), end = bridgeSource.indexOf('    close()', start);
  const waitStart = bridgeSource.indexOf('export async function awaitDeviceOwnerDepositOriginalObservationV1(');
  const waitEnd = bridgeSource.indexOf('export function deviceOwnerDepositBridgeActorV1(', waitStart);
  assert.ok(start >= 0 && end > start && waitStart >= 0 && waitEnd > waitStart);
  const factory = new Function('assert', 'types', 'authorize', 'runDeviceOwnerDepositAuthorizationV1', 'original',
    'const bridges = new WeakMap(), account = Object.freeze({ HOST_INERT_ACCOUNT: true }); let busy = false;' +
    'const bridge = {' + bridgeSource.slice(start, end) + '}; bridges.set(bridge, { original });' +
    bridgeSource.slice(waitStart, waitEnd).replace('export async function', 'async function') +
    ';return { bridge, wait: awaitDeviceOwnerDepositOriginalObservationV1 };');
  let authorized = 0, observed = 0, checks = 0;
  const running = Promise.withResolvers(), entered = Promise.withResolvers();
  const primary = Object.assign(new Error('HOST_ORIGINAL_CANONICAL_OBSERVATION_FAILED'), { code: 'HOST_ORIGINAL_CANONICAL_OBSERVATION_FAILED' });
  const fixed = factory(assert, types, async (input, action) => {
    assert.equal(action, 'OBSERVE_D26'); assert.equal(input.kind, 'HOST_SIGNED_OBSERVATION'); authorized++; return input;
  }, async () => { observed++; entered.resolve(); return running.promise; }, () => { checks++; });
  await assert.rejects(fixed.wait(Object.freeze({})), /ORIGINAL_OBSERVATION_REQUIRED/);
  const request = fixed.bridge.observe({ kind: 'HOST_SIGNED_OBSERVATION' }); request.catch(() => {});
  await entered.promise;
  const retained = fixed.wait(fixed.bridge); retained.catch(() => {});
  await assert.rejects(fixed.bridge.observe({ kind: 'HOST_SIGNED_OBSERVATION' }), /DEVICE_OWNER_BRIDGE_BUSY/);
  assert.equal(authorized, 1); assert.equal(observed, 1);
  running.reject(primary);
  await assert.rejects(request, error => error === primary);
  await assert.rejects(retained, error => error === primary);
  await assert.rejects(fixed.wait(fixed.bridge), error => error === primary);
  assert.equal(authorized, 1); assert.equal(observed, 1); assert.ok(checks >= 2);
  await assert.rejects(fixed.wait(new Proxy(fixed.bridge, {})), /ORIGINAL_REQUIRED/);
});
