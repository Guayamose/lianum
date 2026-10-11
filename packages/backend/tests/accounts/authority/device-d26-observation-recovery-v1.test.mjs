import {legacyDataRoot} from '@lianum/environment';
/** HOST crypto/ownership boundaries only. The two producer substitutes below
 * have explicit private synthetic brands; they never claim genuine EVM/proof
 * observation. No real custody, witness, journal or native process is read. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
// Filesystem URL literals are intentionally outside the ESM specifier
// translator. Select only the two fixed layouts of this original HOST test.
const runtimeLayout=fileURLToPath(import.meta.url).endsWith('/wallet-platform/modules/global-state/device-d26-observation-recovery-v1.test.mjs');
const authorityURL=new URL(runtimeLayout?'../native-claims/wrapped-recovery-authority-v1.mjs':'../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs',import.meta.url);
const accountURL=new URL(runtimeLayout?'./native-value-account-authority-v2.mjs':'../../../src/accounts/authority/native-value-account-authority-v2.mjs',import.meta.url);
const runtimeURL=new URL(runtimeLayout?'../chain-adapters/owned-evm-v2-runtime.mjs':'../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs',import.meta.url);
const readURL=new URL(runtimeLayout?'./device-d26-observation-recovery-v1.mjs':'../../../src/accounts/authority/device-d26-observation-recovery-v1.mjs',import.meta.url);
const fixedRoot=legacyDataRoot('wallet');
const [actualAccount,actualRuntime]=await Promise.all([import(accountURL),import(runtimeURL)]);
const accounts=new WeakSet(),runtimes=new WeakSet();let captured=0,stopped=0;
mock.module(accountURL,{exports:{...actualAccount,async captureOriginalDeviceD26ObservationV1(input){
  assert.ok(accounts.has(input.account));assert.ok(runtimes.has(input.runtime));captured++;
  return {schema:'EXPLICIT_INERT_HOST_DEVICE_SNAPSHOT',jobId:input.jobId,financialAcceptance:false,system:{retainedHostSourceSHA256:'12'.repeat(32)}};
}}});
mock.module(runtimeURL,{exports:{...actualRuntime,async captureOwnedEvmRecoveryV1(runtime){assert.ok(runtimes.has(runtime));stopped++;
  return {schema:'EXPLICIT_INERT_HOST_RECEIVER_CAPTURE',family:'receiver',terminal:{ownedProcessStopped:true,forced:false}};
}}});
const authority=await import(authorityURL);
async function fixture(t){
 const runId=randomUUID(),directory=join(fixedRoot,'.local/mobile-device-d26-observation-recovery-v1','attempt-'+runId,'private-audit');
 await mkdir(directory,{recursive:true,mode:0o700});t.after(()=>rm(resolve(directory,'..'),{recursive:true,force:true}));
 const identity={directory,runId,sourceSHA256:'12'.repeat(32),deadlineMs:Date.now()+60000};
 const account=Object.freeze({}),runtime=Object.freeze({});accounts.add(account);runtimes.add(runtime);
 const owner=await authority.createNativeDeviceD26ObservationRecoveryV1(identity);
 const checkpoint=await authority.retainNativeDeviceD26ObservationRecoveryV1(owner,
   {actor:Object.freeze({}),account,runtime,system:Object.freeze({}),jobId:'synthetic_original_d26'});
 return {identity,checkpoint};
}
const childSource=`
import assert from 'node:assert/strict';import {mock} from 'node:test';
const input=JSON.parse(process.argv[1]);const authority=await import(input.authorityURL);
let runtimeClosed=0,reads=0;
mock.module(input.runtimeURL,{exports:{async reopenOwnedNativeD26ObservationReceiverV1(token){
 assert.throws(()=>authority.consumeWrappedRuntimeRecoveryV1(token,'receiver'),/NATIVE_D26_DISTINCT_RECOVERY_TOKEN/);
 const record=authority.consumeNativeD26ObservationSectionV1(token,'receiver');assert.equal(record.schema,'EXPLICIT_INERT_HOST_RECEIVER_CAPTURE');
 assert.throws(()=>authority.consumeNativeD26ObservationSectionV1(token,'receiver'),/ORIGINAL_OPEN_TOKEN/);
 return {async close(){runtimeClosed++;return {closed:true};}};
}}});
mock.module(input.readURL,{exports:{async createRecoveredDeviceD26ObservationV1(token,runtime){
 const record=authority.consumeNativeD26ObservationSectionV1(token,'deviceD26');assert.equal(record.schema,'EXPLICIT_INERT_HOST_DEVICE_SNAPSHOT');
 assert.equal(record.financialAcceptance,false);assert.throws(()=>authority.consumeNativeD26ObservationSectionV1(token,'deviceD26'),/ORIGINAL_OPEN_TOKEN/);
 return {async read(){reads++;return {financialAcceptance:false};},async close(){await runtime.close();return {closed:true};}};
}}});
try{
 const reopened=await authority.openNativeDeviceD26ObservationRecoveryV1(input.identity,input.checkpoint);
 const service=await authority.reopenNativeDeviceD26ObservationV1(reopened);
 assert.deepEqual(await service.read(),{financialAcceptance:false});await service.close();assert.equal(runtimeClosed,1);assert.equal(reads,1);
 await assert.rejects(authority.openNativeDeviceD26ObservationRecoveryV1(input.identity,input.checkpoint),/CHECKPOINT_CHANGED|CAPTURE_NOT_COMPLETE|ALREADY_CLAIMED/);
 process.stdout.write(JSON.stringify({ok:true,financialAcceptance:false,reads,runtimeClosed,pid:process.pid}));
}catch(error){process.stderr.write(String(error.code??error.message));process.exitCode=1;}
`;
async function child(input){
 const proc=spawn(process.execPath,['--max-old-space-size=384','--experimental-test-module-mocks','--input-type=module','--eval',childSource,JSON.stringify(input)],
  {stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_OPTIONS:''}});
 let stdout='',stderr='';const identity=proc.pid;
 const completed=new Promise((resolve,reject)=>{proc.once('error',reject);proc.once('close',(code,signal)=>resolve({code,signal}));});
 proc.stdout.on('data',chunk=>{stdout+=chunk;});proc.stderr.on('data',chunk=>{stderr+=chunk;});
 const timer=setTimeout(()=>proc.kill('SIGTERM'),15000);
 try{const exit=await completed;assert.equal(exit.code,0,stderr);assert.equal(exit.signal,null);assert.throws(()=>process.kill(identity,0),{code:'ESRCH'});
  return JSON.parse(stdout);
 }finally{clearTimeout(timer);if(proc.exitCode===null&&proc.signalCode===null){proc.kill('SIGTERM');await completed;}}
}

test('native issuer authenticates and seals once; the capturing process cannot reopen',async t=>{
 const before={captured,stopped},f=await fixture(t);
 assert.equal(captured,before.captured+1);assert.equal(stopped,before.stopped+1);
 await assert.rejects(authority.openNativeDeviceD26ObservationRecoveryV1(f.identity,f.checkpoint),/NEW_PROCESS_REQUIRED/);
 assert.throws(()=>authority.consumeNativeD26ObservationSectionV1(Object.freeze({}),'receiver'),/DISTINCT_RECOVERY_TOKEN/);
 await assert.rejects(authority.reopenNativeDeviceD26ObservationV1(Object.freeze({})),/ORIGINAL_IDLE_AUTHORITY/);
 const active=join(f.identity.directory,'device-d26-observation/authority.active');
 await assert.rejects(readFile(active),{code:'ENOENT'});
});

test('a new process consumes distinct native tokens once, closes its owned substitute and rejects reopening',async t=>{
 const f=await fixture(t),result=await child({...f,authorityURL:authorityURL.href,runtimeURL:runtimeURL.href,readURL:readURL.href});
 assert.equal(result.ok,true);assert.equal(result.financialAcceptance,false);assert.notEqual(result.pid,process.pid);
 assert.deepEqual({reads:result.reads,runtimeClosed:result.runtimeClosed},{reads:1,runtimeClosed:1});
});

test('tampering with the original authenticated current marker rejects before receiver reopen',async t=>{
 const f=await fixture(t),store=join(f.identity.directory,'device-d26-observation/authority.vault');
 const target=join(store,'HEAD'); // Current authenticated marker, never an orphan object.
 const before=await readFile(target),value=JSON.parse(before.toString('utf8'));
 function flip(object){if(object&&typeof object==='object')for(const name of Object.keys(object)){
  if(name==='ciphertext'&&typeof object[name]==='string'&&object[name].length){object[name]=(object[name][0]==='0'?'1':'0')+object[name].slice(1);return true;}
  if(flip(object[name]))return true;}return false;}
 assert.equal(flip(value),true);await writeFile(target,JSON.stringify(value),{mode:0o600});
 assert.notEqual(createHash('sha256').update(before).digest('hex'),createHash('sha256').update(await readFile(target)).digest('hex'));
 await assert.rejects(authority.openNativeDeviceD26ObservationRecoveryV1(f.identity,f.checkpoint),{code:'CLAIM_STORE_AUTHENTICATION'});
});
