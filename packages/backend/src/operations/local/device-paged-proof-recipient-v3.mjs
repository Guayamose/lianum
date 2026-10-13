/** Fixed executable recipient; original D26 and Paged VK clients remain distinct. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {projectRoot,resourceRoot} from '@lianum/environment';
import {preparePrivateProofJobV1,readOriginalPrivateProofRecipientV1,privateProofAuthorizationBindingV1,wipePrivateProofInputsV1,privateProofBindingSHA256V1} from '@lianum/engine/crypto/private-proof-transit-v1';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {createOriginalWalletNotePrivateProverV4} from '@lianum/proofs/jobs/wallet-note-private-prover-v4';
import {createFundedPagedGraphProofClientV3,readOriginalFundedPagedGraphProofResultV3,loadFundedPagedGraphArtifactsV3} from '@lianum/proofs/tooling/original-paged-artifacts-v3';
import {deriveOriginalDevicePagedPrivateJobV3} from '@lianum/engine/execution/local/device-paged-private-input-v3';
const [mode,jobId,manifestSHA256]=process.argv.slice(2);let opened,job,client,payload,stage='INTAKE';
async function awaitOriginalConsentClock(opened){
 const original=readOriginalPrivateProofRecipientV1(opened),raw=P.pagedOwnerExactV3(opened.inputs,['profile','consent','signature','witness']);
 assert.equal(raw.profile,'ORIGINAL_DEVICE_PAGED_PRIVATE_INPUT_V3');
 const consent=P.normalizeDevicePagedConsentV3(raw.consent);
 assert.equal(consent.mode,mode);assert.equal(consent.jobId,jobId);assert.equal(consent.descriptor.manifestSHA256,manifestSHA256);assert.deepEqual(original,consent.recipient);
 assert.ok(P.devicePagedNowV3()<consent.descriptor.deadlineMs,'PAGED_DEVICE_CLOSED');
 const message=P.devicePagedPermissionMessageV3(consent),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 assert.deepEqual(opened.authorization,privateProofAuthorizationBindingV1({kind:'ORIGINAL_CONSENT_V1',jobId,consentSHA256:sha(message),witnessSHA256:consent.witnessSHA256}));
 assert.deepEqual(opened.expectedPublicInputs,P.assertDevicePagedPublicJoinV3(consent));assert.match(raw.signature,/^[0-9a-f]{128}$/);
 const pub=consent.descriptor.devicePublicKey,key=createPublicKey({key:{kty:'EC',crv:'secp256k1',x:Buffer.from(pub.slice(2,66),'hex').toString('base64url'),y:Buffer.from(pub.slice(66),'hex').toString('base64url')},format:'jwk'});
 assert.ok(verify('sha256',message,{key,dsaEncoding:'ieee-p1363'},Buffer.from(raw.signature,'hex')),'PAGED_PRIVATE_DEVICE_POP');
 await P.awaitDevicePagedIssuedTimeV3(consent.expiresAt-15000);P.validateDevicePagedConsentFreshV3(consent);
}
// Private failure metadata only. Never persist an exception message, assertion
// comparison, witness, signature, key or returned private payload.
function retainFailure(error){try{
 const frames=[];
 for(const row of String(error?.stack??'').slice(0,65536).split('\n').slice(1,65)){
  const m=/\b(file:\/\/[^()\r\n?#]+\.mjs):([1-9][0-9]{0,8}):([1-9][0-9]{0,8})\)?$/.exec(row);
  if(!m)continue;const file=new URL(m[1]).pathname,path=relative(projectRoot,file);
  if(!file.startsWith(projectRoot+'/')||!/^[A-Za-z0-9_./-]+$/.test(path)||path.split('/').includes('..'))continue;
  frames.push({path,line:Number(m[2]),column:Number(m[3])});if(frames.length===6)break;
 }
 const directory=join(resourceRoot('engine'),'evidence/paeg-proof-attempts');mkdirSync(directory,{recursive:true,mode:0o700});
 const code=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{0,100}$/.test(error.code)?error.code:null;
 if(/^[a-z0-9-]{8,100}$/.test(jobId))writeFileSync(join(directory,'paged-recipient-'+jobId+'-failure.json'),JSON.stringify({format:'PAGED_RECIPIENT_PRIVATE_FAILURE_METADATA_V3',mode,stage,code,clockGapMs:code==='MOBILE_PAGED_CLOCK_FUTURE'&&Number.isSafeInteger(error?.clockGapMs)&&error.clockGapMs>=0&&error.clockGapMs<=3600000?error.clockGapMs:null,frames})+'\n',{mode:0o600,flag:'wx'});
}catch{}}
let stopping=false;function stop(){if(stopping)return;stopping=true;void(async()=>{try{await client?.close();}finally{wipePrivateProofInputsV1(job);wipePrivateProofInputsV1(opened);if(process.connected)process.disconnect();process.exit(2);}})();}process.once('disconnect',stop);process.once('SIGTERM',stop);
try{assert.equal(process.argv.length,5);assert.ok(['deposit','withdraw'].includes(mode));assert.match(jobId,/^[a-z0-9-]{8,100}$/);loadFundedPagedGraphArtifactsV3(manifestSHA256);const relation=mode==='deposit'?'deposit_balance':'funded_graph_paged_withdraw',role=mode==='deposit'?'owner':'recipient';opened=await preparePrivateProofJobV1({relation,role,jobId});assert.equal(stopping,false);await awaitOriginalConsentClock(opened);assert.equal(stopping,false);job=deriveOriginalDevicePagedPrivateJobV3(opened);assert.equal(job.mode,mode);assert.equal(job.consent.jobId,jobId);assert.equal(job.consent.descriptor.manifestSHA256,manifestSHA256);
 stage='PROVER_BIRTH';if(mode==='deposit'){wipePrivateProofInputsV1(opened.inputs);opened.inputs=job.inputs;opened.expectedPublicInputs=job.expectedPublicInputs;}client=mode==='deposit'?createOriginalWalletNotePrivateProverV4(opened):createFundedPagedGraphProofClientV3(manifestSHA256);stage='PROVE';let result;if(mode==='deposit'){result=await client.prove(relation,opened.inputs,opened.expectedPublicInputs,'device-paged-d26');assert.deepEqual(result.publicInputs,job.expectedPublicInputs);assert.equal(result.metrics.acceptedResult,true);payload={proof:Buffer.from(result.proof,'hex'),publicInputs:[...result.publicInputs]};}else{result=await client.prove('withdraw',job.inputs,job.expectedPublicInputs);payload=readOriginalFundedPagedGraphProofResultV3(client,result,'withdraw');}assert.equal(stopping,false);assert.deepEqual(payload.publicInputs,job.expectedPublicInputs);stage='PUBLIC_RESULT';const frame={type:'original-device-paged-public-proof-v3',mode,jobId,manifestSHA256,bindingSHA256:privateProofBindingSHA256V1(job.authorization),proof:payload.proof.toString('hex'),publicInputs:payload.publicInputs,source:job.source};await client.close();client=null;await new Promise((resolve,reject)=>process.send(frame,e=>e?reject(e):resolve()));process.off('disconnect',stop);process.disconnect();
}catch(error){retainFailure(error);process.exitCode=1;if(process.connected)process.disconnect();}finally{process.off('disconnect',stop);process.off('SIGTERM',stop);payload?.proof?.fill(0);wipePrivateProofInputsV1(job);wipePrivateProofInputsV1(opened);if(client)await client.close();}
