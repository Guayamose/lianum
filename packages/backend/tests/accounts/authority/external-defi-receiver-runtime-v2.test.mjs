import {legacyDataRoot} from '@lianum/environment';
/** HOST issuer/AEAD/lifecycle only. Native ports have private synthetic brands;
 * no Anvil, proof, wallet opening or financial acceptance is exercised. */
import test,{mock}from'node:test';
import assert from'node:assert/strict';
import{mkdir,rm,mkdtemp,readFile}from'node:fs/promises';
import{randomUUID}from'node:crypto';
import{join,resolve}from'node:path';
import{tmpdir}from'node:os';
import{fileURLToPath}from'node:url';
import{spawn}from'node:child_process';
const generated=fileURLToPath(import.meta.url).endsWith('/wallet-platform/modules/global-state/external-defi-receiver-runtime-v2.test.mjs');
const authorityURL=new URL(generated?'../native-claims/wrapped-recovery-authority-v1.mjs':'../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs',import.meta.url);
const runtimeURL=new URL(generated?'../chain-adapters/owned-evm-v2-runtime.mjs':'../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs',import.meta.url);
const systemURL=new URL(generated?'../ops/external-defi-bootstrap-recovery-v1.mjs':'../../../src/claims/wrapped/recovery/external-bootstrap-recovery-backend-v1.mjs',import.meta.url);
const ownersURL=new URL(generated?'../../../mobile-core/flat-owner-process.mjs':'../../../src/custody/processes/flat-owner-process.mjs',import.meta.url);
const walletURL=new URL(generated?'./external-defi-catalogue-recovery-v1.mjs':'../../../src/accounts/recovery/external-defi-catalogue-recovery-v1.mjs',import.meta.url);
const fixedRoot=legacyDataRoot('wallet');
const runtimes=new WeakMap();let captures=0,aborts=0,authority;
mock.module(runtimeURL,{exports:{
 assertOwnedDeviceExternalFlatReceiverV1(){assert.fail('EXPLICIT_HOST_DEVICE_RECEIVER_PORT_UNUSED');},
 async assertOwnedLocalEvmV2(runtime){assert.equal(arguments.length,1);assert.ok(runtimes.has(runtime),'EXPLICIT_HOST_ORIGINAL_V2_REQUIRED');assert.equal(runtimes.get(runtime).fenced,false);},
 assertOwnedExternalDefiReceiverV2(runtime){assert.equal(arguments.length,1);assert.ok(runtimes.has(runtime),'EXPLICIT_HOST_ORIGINAL_V2_REQUIRED');assert.equal(runtimes.get(runtime).fenced,false);},
 captureOwnedExternalDefiReceiverV2(runtime,token){const state=runtimes.get(runtime);assert.ok(state&&!state.fenced);const identity=authority.externalDefiReceiverCaptureIdentityV2(token);
  assert.equal(identity.sourceSHA256,state.identity.sourceSHA256);assert.throws(()=>authority.externalDefiReceiverCaptureIdentityV2({...token}),/ORIGINAL_CAPTURE_TOKEN/);
  state.fenced=true;state.token=token;state.closed=true;captures++;return Promise.resolve(state.record);},
 async abortOwnedExternalDefiReceiverCaptureV2(runtime,token){const state=runtimes.get(runtime);assert.equal(state.token,token);aborts++;state.closed=true;return{closed:true,recoveryIncomplete:true};}
}});
async function section(token,name){await authority.retainOriginalWrappedRecoverySectionV1(token,name,{schema:'EXPLICIT_INERT_HOST_SECTION',financialAcceptance:false});return{retained:true,originalResourcesStopped:true};}
mock.module(systemURL,{exports:{buildExternalDefiBootstrapRecoveryV1(){return {retainExternalDefiVaultExitSystemForReopenV1(input){assert.ok(runtimes.has(input.runtime));return section(input.attemptAuthority,'system');}};}}});
// This test owns only receiver/AEAD admission. The inert system backend above
// never invokes deployment contracts; keep their namespaces explicitly inert.
for (const source of [
 generated?'../ops/deploy-system.mjs':'../../../src/operations/deployments/system/deploy-system.mjs',
 generated?'../ops/official-protocol-fixture-v3.mjs':'../../../src/operations/deployments/defi/official-protocol-fixture-v3.mjs',
 generated?'../ops/deploy-private-external-router-v1.mjs':'../../../src/operations/deployments/defi/deploy-private-external-router-v1.mjs',
 generated?'../ops/native-operators.mjs':'../../../src/operations/operators/claims/native-operators.mjs',
]) mock.module(new URL(source,import.meta.url),{exports:{}});

mock.module(ownersURL,{exports:{retainFlatOwnersForReopenV1(input){return section(input.attemptAuthority,'owners');}}});
mock.module(walletURL,{exports:{retainExternalDefiVaultCatalogueForReopenV1(input,token){return section(token,'wallet');}}});
authority=await import(authorityURL);
const registry=authority;
async function fixture(t,{forced=false,v3=false}={}){
 const runId=randomUUID(),directory=join(fixedRoot,'.local/external-defi-owner-cycle-v1','attempt-'+runId,'private-audit');
 await mkdir(directory,{recursive:true,mode:0o700});
 const cwd=await mkdtemp(join(tmpdir(),'external-defi-inert-host-'));
 const identity={directory,runId,sourceSHA256:'ab'.repeat(32),deadlineMs:Date.now()+60000};
 const runtime=Object.freeze({metadata:Object.freeze({version:'OWNED_FLAT_LOCAL_EVM_V2',evmGenesis:'cd'.repeat(32),chainId:'31337'}),ingressSendState:Object.freeze({phase:'IDLE',financialAcceptance:false})}),record={schema:v3?'OWNED_EXTERNAL_DEFI_RECEIVER_CAPTURE_V3':'OWNED_FIXED_EVM_CAPTURE_V2',family:'receiver',cwd,files:{files:[],totalBytes:0},terminal:{ownedProcessStopped:true,forced},localCustody:{schema:'EXPLICIT_INERT_HOST_CUSTODY',financialAcceptance:false}};
 runtimes.set(runtime,{identity:{profile:'EXTERNAL_DEFI_PRIVATE_RECOVERY_AUTHORITY_V1',...identity},record,fenced:false,closed:false});
 const owner=await authority.createExternalDefiRecoveryAuthorityV1(identity);let privateRegistry;
 try{privateRegistry=await registry.createWrappedPrivateLifetimeRegistryV1({runtime,...identity});}
 catch(error){await authority.closeWrappedRecoveryAuthorityV1(owner);await rm(resolve(directory,'..'),{recursive:true,force:true});await rm(cwd,{recursive:true,force:true});throw error;}
 const f={identity,runtime,owner,privateRegistry,authorityClosed:false,registryCheckpoint:await registry.wrappedPrivateLifetimeRegistryCheckpointV1(privateRegistry)};
 t.after(async()=>{await registry.closeWrappedPrivateLifetimeRegistryV1(privateRegistry);if(!f.authorityClosed)await authority.closeWrappedRecoveryAuthorityV1(owner);await rm(resolve(directory,'..'),{recursive:true,force:true});await rm(cwd,{recursive:true,force:true});});return f;
}
const childSource=`
import assert from'node:assert/strict';import{mock}from'node:test';
const input=JSON.parse(process.argv[1]);const issuer=await import(input.authorityURL);let opens=0,closed=0;
mock.module(input.runtimeURL,{exports:{async reopenOwnedExternalDefiReceiverV2(token){
 assert.throws(()=>issuer.consumeWrappedRuntimeRecoveryV1(token,'receiver'),/EXTERNAL_RECEIVER_DISTINCT_REOPEN_REQUIRED/);
 assert.throws(()=>issuer.consumeExternalDefiReceiverRuntimeSectionV2({...token}),/ORIGINAL_SECTION_TOKEN/);
 const record=issuer.consumeExternalDefiReceiverRuntimeSectionV2(token);assert.equal(record.schema,input.expectedSchema??'OWNED_FIXED_EVM_CAPTURE_V2');assert.equal(record.localCustody.financialAcceptance,false);
 assert.throws(()=>issuer.consumeExternalDefiReceiverRuntimeSectionV2(token),/ORIGINAL_OPEN_TOKEN/);opens++;
 return{async close(){closed++;return{closed:true};}};
}}});
let owner;
try{owner=await issuer.openExternalDefiRecoveryAuthorityV1(input.identity,input.checkpoint);
 const runtime=await issuer.reopenExternalDefiReceiverRuntimeV2(owner);await assert.rejects(issuer.reopenExternalDefiReceiverRuntimeV2(owner));
 await issuer.closeWrappedRecoveryAuthorityV1(owner);owner=null;await runtime.close();
 await assert.rejects(issuer.openExternalDefiRecoveryAuthorityV1(input.identity,input.checkpoint),/CHECKPOINT_CHANGED|CAPTURE_NOT_COMPLETE|ALREADY_CLAIMED/);
 process.stdout.write(JSON.stringify({opens,closed,pid:process.pid,financialAcceptance:false}));
}catch(error){if(owner)try{await issuer.closeWrappedRecoveryAuthorityV1(owner);}catch{}process.stderr.write(error.code??error.name);process.exitCode=1;}
`;
async function child(input){
 const proc=spawn(process.execPath,['--max-old-space-size=384','--experimental-test-module-mocks','--input-type=module','--eval',childSource,JSON.stringify(input)],{stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_OPTIONS:''}});
 const pid=proc.pid;let stdout='',stderr='';proc.stdout.on('data',bytes=>{stdout+=bytes;});proc.stderr.on('data',bytes=>{stderr+=bytes;});
 const completion=new Promise((resolve,reject)=>{proc.once('error',reject);proc.once('close',(code,signal)=>resolve({code,signal}));});
 const timer=setTimeout(()=>proc.kill('SIGTERM'),15000);
 try{const result=await completion;assert.equal(result.code,0,stderr);assert.equal(result.signal,null);assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});return JSON.parse(stdout);}
 finally{clearTimeout(timer);if(proc.exitCode===null&&proc.signalCode===null){proc.kill('SIGTERM');await completion;}}
}
test('External5 seals the original V2 receiver and a new process consumes its distinct token once',async t=>{
 const f=await fixture(t),before=captures;
 await assert.rejects(authority.retainExternalDefiReceiverRuntimeV2({...f.owner},f.runtime),/ORIGINAL_IDLE_AUTHORITY/);
 await assert.rejects(authority.retainExternalDefiReceiverRuntimeV2(f.owner,{...f.runtime}),/EXPLICIT_HOST_ORIGINAL_V2_REQUIRED/);
 assert.equal(captures,before);
 await assert.rejects(authority.retainExternalDefiReceiverRuntimeV2(f.owner,f.runtime),/PRIVATE_LIFETIME_CAPTURE_REQUIRED/);
 assert.equal(captures,before);
 assert.throws(()=>registry.assertStoppedWrappedPrivateLifetimeAttemptV1(f.runtime,{identity:runtimes.get(f.runtime).identity,checkpoint:f.registryCheckpoint}),/ORIGINAL_CAPTURED_REGISTRY_REQUIRED/);
 await authority.retainExternalDefiVaultCatalogueRecoveryV1(f.owner,{catalogue:Object.freeze({}),services:[]});
 await authority.retainExternalDefiOwnersRecoveryV1(f.owner,{owners:[]});
 await authority.retainExternalDefiVaultExitSystemRecoveryV1(f.owner,{runtime:f.runtime,system:Object.freeze({})});
 await authority.retainWrappedPrivateLifetimeRecoveryV1(f.owner,f.runtime);
 const stopped={identity:runtimes.get(f.runtime).identity,checkpoint:f.registryCheckpoint};
 assert.equal(registry.assertStoppedWrappedPrivateLifetimeAttemptV1(f.runtime,stopped),true);
 assert.throws(()=>registry.assertWrappedPrivateLifetimeAttemptV1(f.runtime,f.identity),/ORIGINAL_LIVE_REGISTRY_REQUIRED/);
 assert.throws(()=>registry.assertStoppedWrappedPrivateLifetimeAttemptV1({...f.runtime},stopped),/ORIGINAL_CAPTURED_REGISTRY_REQUIRED/);
 assert.throws(()=>registry.assertStoppedWrappedPrivateLifetimeAttemptV1(f.runtime,{...stopped,identity:{...stopped.identity,runId:randomUUID()}}),/ORIGINAL_ATTEMPT/);
 assert.throws(()=>registry.assertStoppedWrappedPrivateLifetimeAttemptV1(f.runtime,{...stopped,checkpoint:{...stopped.checkpoint,revision:stopped.checkpoint.revision+1}}),/CAPTURE_CHECKPOINT_CHANGED/);
 assert.equal(captures,before);
 await authority.retainExternalDefiReceiverRuntimeV2(f.owner,f.runtime);assert.equal(captures,before+1);
 await assert.rejects(authority.retainExternalDefiReceiverRuntimeV2(f.owner,f.runtime));
 const checkpoint=await authority.finishWrappedRecoveryCaptureV1(f.owner);f.authorityClosed=true;
 await assert.rejects(authority.openExternalDefiRecoveryAuthorityV1(f.identity,checkpoint),/NEW_PROCESS_REQUIRED/);
 const result=await child({identity:f.identity,checkpoint,authorityURL:authorityURL.href,runtimeURL:runtimeURL.href});
 assert.deepEqual({opens:result.opens,closed:result.closed,financialAcceptance:result.financialAcceptance},{opens:1,closed:1,financialAcceptance:false});assert.notEqual(result.pid,process.pid);
});
test('an unconfirmed stop burns the capture and closes the same owned substitute without publishing a checkpoint',async t=>{
 const f=await fixture(t,{forced:true}),before={captures,aborts};
 await authority.retainWrappedPrivateLifetimeRecoveryV1(f.owner,f.runtime);
 await assert.rejects(authority.retainExternalDefiReceiverRuntimeV2(f.owner,f.runtime),/EXTERNAL_RECEIVER_GRACEFUL_STOP_REQUIRED/);
 assert.deepEqual({captures,aborts},{captures:before.captures+1,aborts:before.aborts+1});assert.equal(runtimes.get(f.runtime).closed,true);
 const status=authority.wrappedRecoveryAuthorityStatusV1(f.owner);assert.equal(status.uncertain,true);assert.equal(status.sections.receiver,'ABSENT');
 await assert.rejects(authority.finishWrappedRecoveryCaptureV1(f.owner),/ORIGINAL_IDLE_AUTHORITY/);
 await authority.closeWrappedRecoveryAuthorityV1(f.owner);f.authorityClosed=true;
 await assert.rejects(readFile(join(f.identity.directory,'recovery/authority.active')),{code:'ENOENT'});
});

test('External5 V3 authenticated section keeps its fixed format in a new process and forbids generic or copied token reopen',async t=>{
 const f=await fixture(t,{v3:true});
 await authority.retainExternalDefiVaultCatalogueRecoveryV1(f.owner,{catalogue:Object.freeze({}),services:[]});
 await authority.retainExternalDefiOwnersRecoveryV1(f.owner,{owners:[]});
 await authority.retainExternalDefiVaultExitSystemRecoveryV1(f.owner,{runtime:f.runtime,system:Object.freeze({})});
 await authority.retainWrappedPrivateLifetimeRecoveryV1(f.owner,f.runtime);
 await authority.retainExternalDefiReceiverRuntimeV2(f.owner,f.runtime);
 const checkpoint=await authority.finishWrappedRecoveryCaptureV1(f.owner);f.authorityClosed=true;
 await assert.rejects(authority.openExternalDefiRecoveryAuthorityV1(f.identity,checkpoint),/NEW_PROCESS_REQUIRED/);
 const result=await child({identity:f.identity,checkpoint,authorityURL:authorityURL.href,runtimeURL:runtimeURL.href,expectedSchema:'OWNED_EXTERNAL_DEFI_RECEIVER_CAPTURE_V3'});
 assert.deepEqual({opens:result.opens,closed:result.closed,financialAcceptance:result.financialAcceptance},{opens:1,closed:1,financialAcceptance:false});assert.notEqual(result.pid,process.pid);
});


test('HOST ordered device receiver retains before effects and preserves its distinct original capture token',async()=>{
 // Real instance-scoped family and synchronous capture mechanism. Core,
 // retention and token readers below are finite inert ports, without processes.
 const {buildDeviceReceiverFamilyV1,createDeviceReceiverCaptureControlV1}=await import(new URL('./device-receiver-family-v1.mjs',runtimeURL));
 const {createNativeEconomicRecoveryAccessV1}=await import(new URL('./native-economic-recovery-access-v1.mjs',runtimeURL));
 const events=[],instances=new WeakMap(),writes=new WeakMap(),reads=new WeakMap(),sourceReads=new WeakMap(),sourceRequests=new WeakMap();let factoryCalls=0,retentionGate=null,retentionError=null,cleanupError=null,captureGate=null,captureError=null;
 const identity=Object.freeze({profile:'DEVICE_EXTERNAL_FLAT_ORDERED_OBSERVATION_RECOVERY_V1',sourceSHA256:'cd'.repeat(32)});
 const record=Object.freeze({schema:'OWNED_EXTERNAL_DEFI_RECEIVER_CAPTURE_V3',family:'receiver',terminal:Object.freeze({ownedProcessStopped:true,forced:false}),explicitInertHost:true});
 const captureIdentity=token=>{const saved=writes.get(token);assert.ok(saved&&!saved.fault,'HOST_ORIGINAL_DEVICE_WRITE_TOKEN');return saved.identity;};
 const consume=token=>{const saved=reads.get(token);assert.ok(saved&&!saved.used,'HOST_ORIGINAL_DEVICE_OPEN_TOKEN');saved.used=true;return saved.record;};
 const createCore=async(saved,source)=>{factoryCalls++;assert.ok(saved===null||saved===record);const state={closed:false,fenced:false,retained:false};
   const runtime=Object.freeze({async close(){events.push('close');state.closed=true;if(cleanupError)throw cleanupError;return{closed:true};}});instances.set(runtime,state);
   const capture=createDeviceReceiverCaptureControlV1({captureIdentity,
     assertAliveAndPin(){assert.equal(state.closed,false);},assertQuiescent(){assert.equal(state.fenced,false,'DEVICE_EXTERNAL_FLAT_RECEIVER_CAPTURE_REQUIRES_QUIESCENCE');},
     installFence(value){assert.equal(value,identity);state.fenced=true;state.retained=true;},
     async captureRetained(){assert.equal(state.retained,true);assert.equal(state.fenced,true);events.push('capture');if(captureGate)await captureGate;if(captureError)throw captureError;return record;},
     async closeCaptured(){await runtime.close();}
   });events.push(saved?'open-core':'new-core');
   return{runtime,capture,source:source?{observationOnly:saved!==null,preflight(){assert.equal(state.closed,false);},async snapshot(opening){assert.equal(opening,saved!==null);return record;}}:null};
 };
 const ports={createOrderedCore:saved=>createCore(saved,false),createSourceCore:saved=>createCore(saved,true),consumeOrderedSection:consume,
   consumeSourceSection(token){const saved=sourceReads.get(token);assert.ok(saved&&!saved.used,'HOST_ORIGINAL_SOURCE_OPEN_TOKEN');saved.used=true;return saved.record;},
   consumeSourceCheckpoint(token,runtime){const saved=sourceRequests.get(token);assert.ok(saved&&!saved.used&&saved.runtime===runtime,'HOST_ORIGINAL_SOURCE_CHECKPOINT_TOKEN');saved.used=true;return{opening:saved.opening};},
   async armRetention(runtime){assert.ok(instances.has(runtime));events.push('retain-before-effects');if(retentionGate)await retentionGate;if(retentionError)throw retentionError;return{retained:true,explicitInertHost:true};}
 };
 const family=buildDeviceReceiverFamilyV1(ports),native=createNativeEconomicRecoveryAccessV1({assertDistinctReceiver:family.assertDistinct,readOriginalFence(){return undefined;}});
 const bridge={...family,assert:family.assertReceiver,native:native.assertRecoverable,fenceNative:native.fence,captureNative:native.capture,abortNative:native.abort};
 let releaseRetention;retentionGate=new Promise(resolve=>{releaseRetention=resolve;});let returned=false;
 const creation=bridge.create().then(runtime=>{returned=true;return runtime;});await new Promise(resolve=>setTimeout(resolve,0));
 assert.deepEqual(events,['new-core','retain-before-effects']);assert.equal(returned,false);releaseRetention();const runtime=await creation;retentionGate=null;
 assert.equal(bridge.assert(runtime),undefined);assert.throws(()=>bridge.assert({...runtime}),/ORIGINAL_REQUIRED/);assert.throws(()=>bridge.native(runtime),/DISTINCT_ISSUER/);
 assert.throws(()=>bridge.fenceNative(runtime,{}),/DISTINCT_ISSUER/);await assert.rejects(bridge.captureNative(runtime,{}),/DISTINCT_ISSUER/);await assert.rejects(bridge.abortNative(runtime,{}),/DISTINCT_ISSUER/);
 await assert.rejects(bridge.create({}),/0/);await assert.rejects(bridge.abort(runtime,null),/ORIGINAL_CAPTURE_TOKEN/);assert.equal(instances.get(runtime).closed,false);
 const token=Object.freeze(Object.create(null));writes.set(token,{identity,fault:false});assert.throws(()=>bridge.capture(runtime,{...token}),/HOST_ORIGINAL_DEVICE_WRITE_TOKEN/);assert.throws(()=>bridge.capture({...runtime},token),/ORIGINAL_REQUIRED/);
 let releaseCapture;captureGate=new Promise(resolve=>{releaseCapture=resolve;});captureError=new Error('HOST_ORIGINAL_CAPTURE_FAILURE');
 const work=bridge.capture(runtime,token);assert.equal(instances.get(runtime).fenced,true);assert.throws(()=>bridge.assert(runtime),/QUIESCENCE/);assert.throws(()=>bridge.capture(runtime,token),/QUIESCENCE/);
 await assert.rejects(bridge.abort(runtime,{...token}),/ORIGINAL_CAPTURE_TOKEN/);assert.equal(instances.get(runtime).closed,false);
 writes.get(token).fault=true;releaseCapture();await assert.rejects(work,error=>error===captureError);const aborted=await bridge.abort(runtime,token);
 assert.equal(aborted.closed,true);assert.equal(aborted.recoveryIncomplete,true);assert.equal(instances.get(runtime).closed,true);
 captureGate=null;captureError=null;const readToken=Object.freeze(Object.create(null));reads.set(readToken,{record,used:false});
 const before=factoryCalls;await assert.rejects(bridge.reopen({...readToken}),/HOST_ORIGINAL_DEVICE_OPEN_TOKEN/);assert.equal(factoryCalls,before);
 const recovered=await bridge.reopen(readToken);assert.equal(factoryCalls,before+1);assert.equal(bridge.assert(recovered),undefined);await assert.rejects(bridge.reopen(readToken),/HOST_ORIGINAL_DEVICE_OPEN_TOKEN/);
 const wrong=Object.freeze(Object.create(null));reads.set(wrong,{record:{...record,schema:'OWNED_FIXED_EVM_CAPTURE_V2'},used:false});await assert.rejects(bridge.reopen(wrong),/FIXED_V3/);assert.equal(factoryCalls,before+1);await assert.rejects(bridge.reopen(wrong),/HOST_ORIGINAL_DEVICE_OPEN_TOKEN/);
 // SOURCE births and reopened observation receivers belong to the same
 // private distinct-issuer set; neither can enter the generic native issuer.
 const source=await family.createSource();assert.equal(family.assertSource(source),undefined);assert.equal(family.assertReceiver(source),undefined);
 assert.throws(()=>family.assertSource(runtime),/SOURCE_ORIGINAL_RECEIVER/);assert.throws(()=>family.assertSource({...source}),/SOURCE_ORIGINAL_RECEIVER/);
 for(const receiver of [runtime,recovered,source]){assert.throws(()=>bridge.native(receiver),/DISTINCT_ISSUER/);assert.throws(()=>bridge.fenceNative(receiver,{}),/DISTINCT_ISSUER/);await assert.rejects(bridge.captureNative(receiver,{}),/DISTINCT_ISSUER/);await assert.rejects(bridge.abortNative(receiver,{}),/DISTINCT_ISSUER/);}
 const checkpoint=Object.freeze({});sourceRequests.set(checkpoint,{runtime:source,opening:false,used:false});
 await assert.rejects(family.checkpointSource(source,{...checkpoint}),/SOURCE_CHECKPOINT_TOKEN/);assert.equal(await family.checkpointSource(source,checkpoint),record);await assert.rejects(family.checkpointSource(source,checkpoint),/SOURCE_CHECKPOINT_TOKEN/);
 const sourceToken=Object.freeze({});sourceReads.set(sourceToken,{record,used:false});await assert.rejects(family.reopenSource({...sourceToken}),/SOURCE_OPEN_TOKEN/);const restoredSource=await family.reopenSource(sourceToken);await assert.rejects(family.reopenSource(sourceToken),/SOURCE_OPEN_TOKEN/);assert.throws(()=>bridge.native(restoredSource),/DISTINCT_ISSUER/);
 const wrongCheckpoint=Object.freeze({});sourceRequests.set(wrongCheckpoint,{runtime:restoredSource,opening:false,used:false});await assert.rejects(family.checkpointSource(restoredSource,wrongCheckpoint),/SOURCE_ORIGINAL_RECEIVER/);
 const separate=buildDeviceReceiverFamilyV1(ports),foreign=await separate.createSource();assert.throws(()=>family.assertReceiver(foreign),/ORIGINAL_REQUIRED/);assert.throws(()=>separate.assertReceiver(source),/ORIGINAL_REQUIRED/);assert.equal(family.assertDistinct(foreign),undefined);assert.throws(()=>bridge.native(foreign),/EVM_ECONOMIC_ORIGINAL_RUNTIME_REQUIRED/);
 await source.close();await restoredSource.close();await foreign.close();
 await recovered.close();const originalRetentionError=new Error('HOST_RETENTION_FAILED'),originalCleanupError=new Error('HOST_CLEANUP_FAILED');retentionError=originalRetentionError;
 await assert.rejects(bridge.create(),error=>error===originalRetentionError);cleanupError=originalCleanupError;
 await assert.rejects(bridge.create(),error=>error.cause===originalRetentionError&&error.errors[0]===originalRetentionError&&error.errors[1]===originalCleanupError);
});


/** Existing original classifier/audit bodies, with finite inert ownership and
 * ledger/proof-verification ports. No circuit, Native receiver or financial
 * acceptance is exercised by this HOST continuation regression. */
test('HOST original Meta four ordered audit preserves all twenty bindings and denies extra effects',async()=>{
 const {createHash}=await import('node:crypto'),sha=value=>createHash('sha256').update(value).digest('hex'),root=fixedRoot;
 const integration=name=>new URL(generated?'../../../integration/'+name:'../../../../../tests/integration/wallet/native/'+name,import.meta.url);
 const {classifyDeviceMetaFourGraphProcessV1:classify}=await import(integration('device-external-flat-erc20-policy-v1.mjs'));
 const {auditDeviceExternalFlatOrderedGraphV1}=await import(integration('device-external-flat-ordered-audit-v1.mjs'));
 const worker=join(root,'integration/device-external-flat-ordered-successor-v1.mjs'),main=join(root,'integration/device-external-flat-erc20-flow-v1.mjs'),argv=[process.execPath,worker];assert.deepEqual(classify(argv,argv[0],{argv:[argv[0],main]}),{role:'device-external-flat-observation-successor',proofWorker:false});for(const parent of [[argv[0],main,'extra'],[argv[0],main+'-copy']])assert.equal(classify(argv,argv[0],{argv:parent}).role,'device-external-flat-unexpected-process');assert.equal(classify([...argv,'extra'],argv[0],{argv:[argv[0],main]}).role,'device-external-flat-unexpected-process');
 const head={number:'22',hash:'0x'+'ab'.repeat(32)},pins={sameOriginalSources:'cd'.repeat(32)},account=Object.freeze({}),targets=Object.freeze(Array.from({length:4},()=>Object.freeze({}))),service=Object.freeze({}),originalRows=new WeakMap();
 const proof=(label,relation,index)=>({label,relation,result:{proof:Buffer.from([index+1]).toString('hex'),publicInputs:[String(index+1)]}});originalRows.set(account,[proof('device-external-flat-d26','deposit_balance',0)]);for(let slot=0;slot<4;slot++)originalRows.set(targets[slot],[proof('device-external-flat-d27','deposit_intent',slot+1),proof('device-external-flat-w39','withdraw_balance',slot+5)]);
 const graphRows=Array.from({length:11},(_,i)=>proof('original-graph-'+i,['authorization','reservation','dependency','ready','admission','node','node','node','node','settlement','withdraw_balance'][i],i+9));
 const rows=[...originalRows.get(account),...targets.flatMap((a,slot)=>originalRows.get(a).map(row=>({...row,label:'multi-slot-'+slot+'-'+row.label}))),...graphRows],bindings=rows.map(row=>[row.label,row.relation,sha(Buffer.from(row.result.proof,'hex'))+sha(Buffer.from(JSON.stringify(row.result.publicInputs)))]);assert.equal(bindings.length,20);
 const views=[0,1].map(poolIndex=>({header:head,poolObservation:Object.fromEntries(['rawState','rawHistory','rawBacking'].map(k=>[k,'original-'+poolIndex+'-'+k])),ledger:{nullifiers:['0x'+'ef'.repeat(32)],publicState:{backedAmount:'0',actualAssetBalance:'0'}}})),receiptHashes=Array.from({length:13},(_,i)=>String(i+1).padStart(64,'0'));let extraWire=false,checkedReceipts=0,verifiedProofs=0,sourceChange=false;
 const runtime={get transactions(){return extraWire?[...receiptHashes,'forbidden']:receiptHashes;},receipts:receiptHashes,block:async()=>head,assertCanonical:async value=>{if(Object.hasOwn(value,'transactionHash')){assert.equal(value.blockHash,head.hash);assert.equal(value.status,'0x1');assert.ok(receiptHashes.includes(value.transactionHash.slice(2)));}else assert.deepEqual(value,head);},async transaction(hash){assert.ok(receiptHashes.includes(hash.slice(2)));return{hash,blockHash:head.hash,input:'0x01'};},async receipt(hash){assert.ok(receiptHashes.includes(hash.slice(2)));return{transactionHash:hash,blockHash:head.hash,status:'0x1'};},checkReceipt:async()=>{checkedReceipts++;}},system={pools:views.map(()=>({assetCapability:{balance:async()=>0n}})),async verify(relation,proof,words){verifiedProofs++;return rows.some(r=>r.relation===relation&&Buffer.from(r.result.proof,'hex').equals(proof)&&words[0]==='0x'+BigInt(r.result.publicInputs[0]).toString(16).padStart(64,'0'));}};
 const expected={schema:'DEVICE_META_FOUR_GRAPH_ORDERED_AUDIT_V4',descriptorSHA256:'11'.repeat(32),targetDescriptorSHA256:'22'.repeat(32),head,recipient:'12'.repeat(20),wireCount:receiptHashes.length,receiptCount:receiptHashes.length,pools:views.map((view,poolIndex)=>({poolIndex,...Object.fromEntries(['rawState','rawHistory','rawBacking'].map(k=>[k+'SHA256',sha(Buffer.from(view.poolObservation[k]))])),nullifiers:['ef'.repeat(32)],backing:'0',assetBalance:'0',recipientBalance:'0'})),financialReceipts:receiptHashes.map(hash=>hash+head.hash.slice(2)+sha(Buffer.from([1]))),proofs:bindings};
 const identity={sourceSHA256:sha(JSON.stringify(pins))},context={runtime,system,account,targetAccount:targets[0],targetAccounts:targets},ports={assert,Buffer,process:{pid:4242},sha,live(){},exactRecord:(v,keys)=>assert.deepEqual(Object.keys(v).sort(),[...keys].sort()),expected,multiParent:true,blueParent:false,aaveParent:false,metaParent:false,uniswapParent:false,context,service,identity,currentPins:()=>sourceChange?{}:pins,createFlatSystemStateReader:async q=>({read:async()=>views[q.poolIndex],assertCurrent:async v=>assert.equal(v,views[q.poolIndex])}),readOriginalDeviceExternalFlatProofReceiptsV1:a=>originalRows.get(a),readOriginalDeviceExternalFlatSourceGraphServiceProofsV1:s=>{assert.equal(s,service);return graphRows;}};
 const audit=()=>auditDeviceExternalFlatOrderedGraphV1({expected,identity,context,service,variants:{multiParent:true,blueParent:false,aaveParent:false,metaParent:false,uniswapParent:false}},ports),observed=await audit();assert.equal(observed.proofCount,20);assert.equal(verifiedProofs,20);assert.equal(checkedReceipts,13);assert.equal(observed.noAdditionalWire,true);assert.equal(observed.noAdditionalProof,true);assert.equal(observed.wireCount,receiptHashes.length);
 const identityPacket={profile:'DEVICE_EXTERNAL_FLAT_ORDERED_OBSERVATION_RECOVERY_V1',directory:join(root,'.local/device-external-flat-ordered-observation-v1/attempt-11111111-2222-4333-8444-555555555555/private-audit'),runId:'11111111-2222-4333-8444-555555555555',sourceSHA256:identity.sourceSHA256,deadlineMs:1900000000000};assert.ok(Buffer.byteLength(JSON.stringify({sequence:1,action:'OPEN',identity:identityPacket,checkpoint:{revision:1,stateSHA256:'cd'.repeat(32)},expected}))<=8192);
 const originalProofBinding=expected.proofs[2][2];expected.proofs[2][2]='ff'.repeat(64);await assert.rejects(audit());expected.proofs[2][2]=originalProofBinding; // retain no tampered proof as authority
 sourceChange=true;await assert.rejects(audit());sourceChange=false;expected.wireCount++;await assert.rejects(audit());expected.wireCount--;extraWire=true;await assert.rejects(audit());assert.equal(verifiedProofs>20,true);
});
