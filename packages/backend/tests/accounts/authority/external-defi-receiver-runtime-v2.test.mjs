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
import{runInNewContext}from'node:vm';
const generated=fileURLToPath(import.meta.url).endsWith('/wallet-platform/modules/global-state/external-defi-receiver-runtime-v2.test.mjs');
const authorityURL=new URL(generated?'../native-claims/wrapped-recovery-authority-v1.mjs':'../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs',import.meta.url);
const runtimeURL=new URL(generated?'../chain-adapters/owned-evm-v2-runtime.mjs':'../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs',import.meta.url);
const registryURL=new URL('./wrapped-private-lifetime-registry-v1.mjs',authorityURL);
const systemURL=new URL(generated?'../ops/external-defi-bootstrap-recovery-v1.mjs':'../../../src/operations/recovery/external-defi-bootstrap-recovery-v1.mjs',import.meta.url);
const ownersURL=new URL(generated?'../../../mobile-core/flat-owner-process.mjs':'../../../../custody/src/processes/flat-owner-process.mjs',import.meta.url);
const walletURL=new URL(generated?'./external-defi-catalogue-recovery-v1.mjs':'../../../src/accounts/recovery/external-defi-catalogue-recovery-v1.mjs',import.meta.url);
const fixedRoot=fileURLToPath(new URL('../../../',authorityURL));
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
mock.module(systemURL,{exports:{retainExternalDefiVaultExitSystemForReopenV1(input){assert.ok(runtimes.has(input.runtime));return section(input.attemptAuthority,'system');}}});
mock.module(ownersURL,{exports:{retainFlatOwnersForReopenV1(input){return section(input.attemptAuthority,'owners');}}});
mock.module(walletURL,{exports:{retainExternalDefiVaultCatalogueForReopenV1(input,token){return section(token,'wallet');}}});
authority=await import(authorityURL);
const registry=await import(registryURL);
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
 // Native/issuer ports below are explicit inert private brands. Exercise the
 // production factory, public brand checks and synchronous core fence bodies;
 // no native process, wallet, proof, keys, funding or financial acceptance.
 const source=await readFile(runtimeURL,'utf8');
 const between=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
 const definitions=between('const originalExternalDefiReceiverV2=new WeakSet(),','const originalEvmRecoveryCapturesV1 =');
 const create=between('export async function createOwnedExternalDefiReceiverV2(){','export function isOwnedNativeEconomicRuntimeV2(').replace(/^export /gm,'');
 const reopen=between('export async function reopenOwnedDeviceExternalFlatReceiverV1(token){','export async function reopenOwnedNativeEconomicGraphRuntimeV1(').replace(/^export /gm,'');
 const fence=between('    if(deviceExternalFlatV1){let originalDeviceCaptureToken=null;','    if(originalEvmRecoveryCapturesV1.has(runtime))originalEvmRetentionArmsV1.set(');
 const native=source.slice(source.indexOf('export function assertOwnedNativeEconomicRuntimeRecoverableV1(runtime){')).replace(/^export /gm,'');
 assert.ok(native.includes('DEVICE_EXTERNAL_FLAT_RECEIVER_DISTINCT_ISSUER_REQUIRED'));
 const localProfile=Object.freeze({explicitInertHost:true}),nativePin=Object.freeze(['explicit-inert-host','ab'.repeat(32)]);
 const events=[],instances=new WeakMap(),writes=new WeakMap(),reads=new WeakMap();let factoryCalls=0,retentionGate=null,retentionError=null,cleanupError=null,captureGate=null,captureError=null,bridge;
 const identity=Object.freeze({profile:'DEVICE_EXTERNAL_FLAT_ORDERED_OBSERVATION_RECOVERY_V1',sourceSHA256:'cd'.repeat(32)});
 const record=Object.freeze({schema:'OWNED_EXTERNAL_DEFI_RECEIVER_CAPTURE_V3',family:'receiver',terminal:Object.freeze({ownedProcessStopped:true,forced:false}),explicitInertHost:true});
 const captureIdentity=token=>{const saved=writes.get(token);assert.ok(saved&&!saved.fault,'HOST_ORIGINAL_DEVICE_WRITE_TOKEN');return saved.identity;};
 const consume=token=>{const saved=reads.get(token);assert.ok(saved&&!saved.used,'HOST_ORIGINAL_DEVICE_OPEN_TOKEN');saved.used=true;return saved.record;};
 const bind=runInNewContext('(make)=>{'+definitions+create+reopen+native+
  ';return {symbol:DEVICE_EXTERNAL_FLAT_RECEIVER_RUNTIME_V1,install(runtime,state){let economicRecoveryFence=null,recoveryRetained=false,recoveryCapturing=false;const deviceExternalFlatV1=true,busy=false,recoveryRpcActive=0,nativeActiveReadsV4=0,runtimePin=NATIVE_ECONOMIC_ANVIL_PIN_V2;const assertAlive=()=>assert.equal(state.closed,false);const recoveryCapture=()=>{assert.equal(recoveryRetained,true);events.push("capture");state.fenced=true;return make.capture(runtime);};const close=()=>{assert.equal(recoveryCapturing,true);return runtime.close();};'+fence+'},create:createOwnedDeviceExternalFlatReceiverV1,assert:assertOwnedDeviceExternalFlatReceiverV1,capture:captureOwnedDeviceExternalFlatReceiverV1,abort:abortOwnedDeviceExternalFlatReceiverCaptureV1,reopen:reopenOwnedDeviceExternalFlatReceiverV1,external:assertOwnedExternalDefiReceiverV2,native:assertOwnedNativeEconomicRuntimeRecoverableV1,fenceNative:fenceOwnedNativeEconomicRuntimeV1,captureNative:captureOwnedNativeEconomicRuntimeV1,abortNative:abortOwnedNativeEconomicRuntimeV1};}',{
  assert,events,EXTERNAL_DEFI_RECEIVER_CAPTURE_SCHEMA_V3:record.schema,LOCAL_EVM_PROFILE:localProfile,NATIVE_ECONOMIC_ANVIL_PIN_V2:nativePin,
  originalEvmEconomicFencesV1:new WeakMap(),cloneRuntimeRecoveryV1:structuredClone,
  deviceExternalFlatReceiverCaptureIdentityV1:captureIdentity,consumeDeviceExternalFlatReceiverRuntimeSectionV1:consume,
  async createFixedOwnedLocalEvm(profile,generation,saved,selector){factoryCalls++;assert.equal(profile,localProfile);assert.equal(generation,false);assert.equal(selector,bridge.symbol);assert.ok(saved===null||saved===record);
   const state={closed:false,fenced:false};const runtime=Object.freeze({async close(){events.push('close');state.closed=true;if(cleanupError)throw cleanupError;return{closed:true};}});instances.set(runtime,state);bridge.install(runtime,state);events.push(saved?'open-core':'new-core');return runtime;},
  async armOwnedEvmRecoveryRetentionV1(runtime){assert.ok(instances.has(runtime));events.push('retain-before-effects');if(retentionGate)await retentionGate;if(retentionError)throw retentionError;return{retained:true,explicitInertHost:true};}
 });
 bridge=bind({capture:async runtime=>{assert.ok(instances.get(runtime).fenced);if(captureGate)await captureGate;if(captureError)throw captureError;return record;}});
 let releaseRetention;retentionGate=new Promise(resolve=>{releaseRetention=resolve;});let returned=false;
 const creation=bridge.create().then(runtime=>{returned=true;return runtime;});await new Promise(resolve=>setTimeout(resolve,0));
 assert.deepEqual(events,['new-core','retain-before-effects']);assert.equal(returned,false);releaseRetention();const runtime=await creation;retentionGate=null;
 assert.equal(bridge.assert(runtime),undefined);assert.throws(()=>bridge.assert({...runtime}),/ORIGINAL_REQUIRED/);assert.throws(()=>bridge.external(runtime),/EXTERNAL_RECEIVER_ORIGINAL/);assert.throws(()=>bridge.native(runtime),/DISTINCT_ISSUER/);
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
 await recovered.close();const originalRetentionError=new Error('HOST_RETENTION_FAILED'),originalCleanupError=new Error('HOST_CLEANUP_FAILED');retentionError=originalRetentionError;
 await assert.rejects(bridge.create(),error=>error===originalRetentionError);cleanupError=originalCleanupError;
 await assert.rejects(bridge.create(),error=>error.cause===originalRetentionError&&error.errors[0]===originalRetentionError&&error.errors[1]===originalCleanupError);
});
