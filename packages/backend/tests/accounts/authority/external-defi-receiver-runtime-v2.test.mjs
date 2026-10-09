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
const registryURL=new URL('./wrapped-private-lifetime-registry-v1.mjs',authorityURL);
const systemURL=new URL(generated?'../ops/external-defi-bootstrap-recovery-v1.mjs':'../../../src/operations/recovery/external-defi-bootstrap-recovery-v1.mjs',import.meta.url);
const ownersURL=new URL(generated?'../../../mobile-core/flat-owner-process.mjs':'../../../../custody/src/processes/flat-owner-process.mjs',import.meta.url);
const walletURL=new URL(generated?'./external-defi-catalogue-recovery-v1.mjs':'../../../src/accounts/recovery/external-defi-catalogue-recovery-v1.mjs',import.meta.url);
const fixedRoot=fileURLToPath(new URL('../../../',authorityURL));
const runtimes=new WeakMap();let captures=0,aborts=0,authority;
mock.module(runtimeURL,{exports:{
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
