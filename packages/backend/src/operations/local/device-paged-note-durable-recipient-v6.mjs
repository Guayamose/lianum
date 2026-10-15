/** Fixed durable Source D26/Paged W39 child. Only the authenticated intake
 * or an exact private checkpoint can continue this SAME computation. */
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {projectRoot} from '@lianum/environment';
import {createDevicePagedNoteProofRetentionV6} from '@lianum/engine/execution/local/device-paged-proof-client-v3';
import {createPrivateProofRecipientV1,readPrivateProofRecipientV1,readOriginalPrivateProofRecipientV1,openPrivateProofJobV1,sealPrivateProofJobV1,closePrivateProofRecipientV1,wipePrivateProofInputsV1,privateProofBindingSHA256V1,privateProofAuthorizationBindingV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import {createOriginalWalletNotePrivateProverV4} from '@lianum/proofs/jobs/wallet-note-private-prover-v4';
import {createFundedPagedGraphProofClientV3,readOriginalFundedPagedGraphProofResultV3,loadFundedPagedGraphArtifactsV3} from '@lianum/proofs/tooling/original-paged-artifacts-v3';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
const [mode,jobId,manifestSHA256]=process.argv.slice(2),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let store,recipient=null,prover,closing=false,sequence=Promise.resolve(),checkpoint=null,phase='STARTUP';
function retainFailure(error,code){const directory=join(projectRoot,'evidence/device-paged-note-computation');mkdirSync(directory,{recursive:true,mode:0o700});const frames=String(error?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,6).map(line=>line.trim().replace(projectRoot,'<own>'));writeFileSync(join(directory,jobId+'-'+process.pid+'-failure.json'),JSON.stringify({profile:'DEVICE_PAGED_NOTE_FAILURE_METADATA_V6',mode,jobId,phase,code,frames})+'\n',{mode:0o600,flag:'wx'});}
const send=packet=>new Promise((resolve,reject)=>process.send(packet,error=>error?reject(error):resolve()));
async function originalConsentClock(opened){const raw=P.pagedOwnerExactV3(opened.inputs,['profile','consent','signature','witness']),c=P.normalizeDevicePagedConsentV3(raw.consent);assert.equal(raw.profile,'ORIGINAL_DEVICE_PAGED_PRIVATE_INPUT_V3');assert.equal(c.mode,mode);assert.equal(c.jobId,jobId);assert.equal(c.descriptor.manifestSHA256,manifestSHA256);assert.deepEqual(readOriginalPrivateProofRecipientV1(opened),c.recipient);const message=P.devicePagedPermissionMessageV3(c);assert.deepEqual(opened.authorization,privateProofAuthorizationBindingV1({kind:'ORIGINAL_CONSENT_V1',jobId,consentSHA256:sha(message),witnessSHA256:c.witnessSHA256}));assert.deepEqual(opened.expectedPublicInputs,P.assertDevicePagedPublicJoinV3(c));assert.match(raw.signature,/^[0-9a-f]{128}$/);const pub=c.descriptor.devicePublicKey,key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(pub.slice(2,66),'hex').toString('base64url'),y:Buffer.from(pub.slice(66),'hex').toString('base64url')}});assert.ok(verify('sha256',message,{key,dsaEncoding:'ieee-p1363'},Buffer.from(raw.signature,'hex')),'PAGED_NOTE_PRIVATE_ORIGINAL_POP');await P.awaitDevicePagedIssuedTimeV3(c.expiresAt-15000);P.validateDevicePagedConsentFreshV3(c);assert.ok(!closing);}
async function stop(){if(closing)return;closing=true;await prover?.close();if(recipient)closePrivateProofRecipientV1(recipient);recipient=null;await store?.releaseComputation();store?.close();if(process.connected)process.disconnect();}
process.once('disconnect',()=>{void stop();});process.once('SIGTERM',()=>{void stop();});
assert.equal(process.argv.length,5);assert.ok(['deposit','withdraw'].includes(mode));assert.match(jobId,/^[a-z0-9-]{8,100}$/);loadFundedPagedGraphArtifactsV3(manifestSHA256);
process.on('message',raw=>{sequence=sequence.then(async()=>{
 assert.ok(!closing);assert.ok(Buffer.byteLength(JSON.stringify(raw))<=4*1024*1024,'PAGED_NOTE_PRIVATE_PACKET_BOUND');
 phase=raw.type;
 if(raw.type==='birth'){
  P.pagedOwnerExactV3(raw,['type','descriptor','retention']);assert.equal(store,undefined);assert.equal(raw.descriptor.manifestSHA256,manifestSHA256);store=await createDevicePagedNoteProofRetentionV6(raw.retention,raw.descriptor,mode,jobId);checkpoint=store.checkpoint();
  if(checkpoint!==null){await send({type:'restored-note-proof',checkpoint});return;}
  recipient=createPrivateProofRecipientV1({relation:P.DEVICE_PAGED_MODES_V3[mode].relation,role:P.DEVICE_PAGED_MODES_V3[mode].role,jobId});await send(readPrivateProofRecipientV1(recipient));return;
 }
 assert.ok(store);
 if(raw.type==='note-proof-intent'){
  P.pagedOwnerExactV3(raw,['type','consent','ciphertext']);assert.ok(recipient&&checkpoint===null);let opened;
  try{opened=openPrivateProofJobV1(recipient,raw.ciphertext);assert.deepEqual(opened.inputs.consent,P.normalizeDevicePagedConsentV3(raw.consent));await originalConsentClock(opened);checkpoint=await store.commitIntent(opened);assert.ok(!closing);await send({type:'note-proof-intent-retained',checkpoint});}
  finally{closePrivateProofRecipientV1(recipient);recipient=null;wipePrivateProofInputsV1(opened);}return;
 }
 if(raw.type==='continue-note-proof'){
  P.pagedOwnerExactV3(raw,['type','checkpoint']);assert.equal(recipient,null);assert.deepEqual(raw.checkpoint,checkpoint,'PAGED_NOTE_ORIGINAL_ACK_CHECKPOINT');await store.assertCurrent();let job,payload,relay,relayRecipient;
  try{
   job=await store.job();payload=await store.result();
   if(payload===null){
    await store.claimComputation();
    if(mode==='deposit'){
     // A new transport recipient carries exactly the already validated SAME
     // witness and original permission binding, not another mobile witness.
     relayRecipient=createPrivateProofRecipientV1({relation:'deposit_balance',role:'owner',jobId});const ready=readPrivateProofRecipientV1(relayRecipient),packet=sealPrivateProofJobV1(ready,{inputs:job.inputs,expectedPublicInputs:job.expectedPublicInputs,authorization:job.authorization});relay=openPrivateProofJobV1(relayRecipient,packet);closePrivateProofRecipientV1(relayRecipient);relayRecipient=null;prover=createOriginalWalletNotePrivateProverV4(relay);const result=await prover.prove('deposit_balance',relay.inputs,relay.expectedPublicInputs,'device-paged-d26-durable');assert.equal(result.metrics.acceptedResult,true);payload={proof:result.proof.toString('hex'),publicInputs:[...result.publicInputs],source:job.source};
    }else{prover=createFundedPagedGraphProofClientV3(manifestSHA256);const result=await prover.prove('withdraw',job.inputs,job.expectedPublicInputs),actual=readOriginalFundedPagedGraphProofResultV3(prover,result,'withdraw');try{payload={proof:actual.proof.toString('hex'),publicInputs:[...actual.publicInputs],source:job.source};}finally{actual.proof.fill(0);}}
    await prover.close();prover=null;assert.ok(!closing);checkpoint=await store.commitResult(payload);
   }
   assert.deepEqual(payload.publicInputs,job.expectedPublicInputs);await store.assertCurrent();assert.ok(!closing);await send({type:'original-device-paged-public-proof-v3',mode,jobId,manifestSHA256,bindingSHA256:privateProofBindingSHA256V1(job.authorization),...payload,checkpoint});
  }finally{if(relayRecipient)closePrivateProofRecipientV1(relayRecipient);wipePrivateProofInputsV1(job);wipePrivateProofInputsV1(relay);wipePrivateProofInputsV1(payload);await stop();}return;
 }
 if(raw.type==='close'){P.pagedOwnerExactV3(raw,['type']);await stop();return;}
 assert.fail('PAGED_NOTE_PRIVATE_PACKET_TYPE');
 }).catch(async error=>{const code=/^[A-Z][A-Z0-9_]{2,100}$/.exec(error.message)?.[0]??'PAGED_NOTE_PRIVATE_COMPUTATION_FAILED';try{retainFailure(error,code);}catch{}if(process.connected)await send({type:'failed',code}).catch(()=>{});process.exitCode=1;await stop();});});
