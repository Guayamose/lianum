/** Run inside an independently packaged source candidate. No witness or proof. */
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {projectRoot,resourceMode,resourceRoot} from '@lianum/environment';
import {createPrivateProofRecipientV1,readPrivateProofRecipientV1,sealPrivateProofJobV1,
 openPrivateProofJobV1,closePrivateProofRecipientV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import {createOriginalWalletNotePrivateProverV4} from '../../src/jobs/wallet-note-private-prover-v4.mjs';
import {createOriginalPrivateNativeNoteProofProcessV3} from '../../src/jobs/native-private-note-process-v3.mjs';
import {createNativeEconomicNoteProofProcessV1} from '../../src/execution/proof-process.mjs';
import {loadProofProfile,decodeProofMessage} from '../../src/execution/proof-worker.mjs';
assert.equal(resourceMode,'candidate');
assert.equal(existsSync(projectRoot+'/.internal'),false);
const native=createOriginalPrivateNativeNoteProofProcessV3();
await native.close();
const economic=createNativeEconomicNoteProofProcessV1('owner');
await economic.close();
for(const [mode,words] of [['deposit_balance',26],['withdraw_balance',39]]){
 const profile=loadProofProfile(mode);
 assert.equal(profile.publicPins.statementWords,words);
 assert.equal(profile.publicPins.target,'evm');
 const jobId='bundle-probe-original-recipient',recipient=createPrivateProofRecipientV1({relation:mode,role:'owner',jobId});
 const opened=openPrivateProofJobV1(recipient,sealPrivateProofJobV1(readPrivateProofRecipientV1(recipient),{
  inputs:{},expectedPublicInputs:Array(words).fill('0'),
  authorization:{kind:'ORIGINAL_CONSENT_V1',jobId,consentSHA256:'11'.repeat(32),witnessSHA256:'22'.repeat(32)},
 }));
 // The real constructor must pin the executing modules, never copies under resources.
 const prover=createOriginalWalletNotePrivateProverV4(opened);
 assert.equal(prover.pins()[mode].keySHA256,profile.publicPins.keySHA256);
 await prover.close();closePrivateProofRecipientV1(recipient);
 const child=fork(fileURLToPath(new URL('../../src/jobs/wallet-note-private-worker-v4.mjs',import.meta.url)),[mode],{
  cwd:resourceRoot('engine'),execArgv:[],env:{LANG:'C.UTF-8'},serialization:'advanced',stdio:['ignore','pipe','pipe','ipc'],
 });
 let ready=0,failure=0,logs=0;
 const timer=setTimeout(()=>child.kill('SIGKILL'),5000);
 try{
  child.stdout.on('data',bytes=>{logs+=bytes.length;});child.stderr.on('data',bytes=>{logs+=bytes.length;});
  child.on('message',value=>{
   if(value instanceof Uint8Array){assert.deepEqual(decodeProofMessage(value),{event:'failure',code:'PAEG_PROOF_TOOLCHAIN_OR_CONSTRAINT_FAILURE'});failure++;}
   else{assert.equal(value.type,'flat-private-proof-input-ready');assert.equal(value.relation,mode);assert.equal(value.role,'owner');ready++;child.send({malformed:true});}
  });
  const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
  assert.deepEqual(exit,{code:1,signal:null});assert.equal(ready,1);assert.equal(failure,1);assert.equal(logs,0);
 }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
}
// The common role entry is also executed from this relocated source candidate.
const role=fork(fileURLToPath(new URL('../../src/jobs/role-process.mjs',import.meta.url)),['reservation'],{
 cwd:resourceRoot('wallet'),execArgv:[],env:{LANG:'C.UTF-8',PATH:'/usr/bin:/bin'},serialization:'json',stdio:['ignore','pipe','pipe','ipc'],
});
let roleReady=0,roleOutput='',roleErrors='';const roleTimer=setTimeout(()=>role.kill('SIGKILL'),5000);
try{
 role.stdout.on('data',bytes=>roleOutput+=bytes.toString());role.stderr.on('data',bytes=>roleErrors+=bytes.toString());
 role.on('message',message=>{assert.equal(message.type,'flat-private-proof-input-ready');assert.equal(message.relation,'reservation');roleReady++;role.send({malformed:true});});
 const exit=await new Promise((resolve,reject)=>{role.once('error',reject);role.once('close',(code,signal)=>resolve({code,signal}));});
 assert.deepEqual(exit,{code:1,signal:null});assert.equal(roleReady,1);assert.equal(roleErrors,'');
 const status=JSON.parse(roleOutput);assert.equal(status.errorCode,'PW_ROLE_JOB_FAILED');assert.equal(status.phase,'failed');
}finally{clearTimeout(roleTimer);if(role.exitCode===null&&role.signalCode===null)role.kill('SIGKILL');}
console.log(JSON.stringify({profiles:2,constructors:4,malformedIPCRejected:3,privateRuntimePresent:false,proofGenerated:false}));
