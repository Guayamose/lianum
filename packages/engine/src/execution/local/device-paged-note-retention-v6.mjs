/** Authenticated private note computation retention. It supplies no Source
 * permission, Native command, signing key, payment or READ_RECOVER grant. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {lstat,realpath,open,readFile,unlink} from 'node:fs/promises';
import {dirname,resolve,basename} from 'node:path';
import {Vault} from '../../crypto/vault.mjs';
import {canonical} from '../../crypto/privacy.mjs';
import {readOriginalPrivateProofRecipientV1,wipePrivateProofInputsV1} from '../../crypto/private-proof-transit-v1.mjs';
import {deriveOriginalDevicePagedPrivateJobV3,validateDevicePagedRetainedPrivateInputsV6} from './device-paged-private-input-v3.mjs';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
const PROFILE='DEVICE_PAGED_NOTE_PRIVATE_COMPUTATION_V6',CHECKPOINT='DEVICE_PAGED_NOTE_PROOF_CHECKPOINT_V6';
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
function ownerProcess(){const stat=readFileSync('/proc/self/stat','utf8'),tail=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/);assert.equal(Number(tail[2]),process.pid,'PAGED_NOTE_FIXED_PRIVATE_PROCESS_GROUP');return{bootId:readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),pid:process.pid,startTicks:tail[19],processGroup:process.pid};}
export function assertDevicePagedNoteProofOwnerStoppedV6(owner){
 P.pagedOwnerExactV3(owner,['bootId','pid','startTicks','processGroup']);assert.match(owner.bootId,/^[0-9a-f-]{36}$/);assert.ok(Number.isSafeInteger(owner.pid)&&owner.pid>0);assert.match(owner.startTicks,/^[1-9][0-9]*$/);assert.equal(owner.processGroup,owner.pid);
 if(owner.bootId!==readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim())return;
 try{const stat=readFileSync('/proc/'+owner.pid+'/stat','utf8'),tail=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/);assert.ok(tail[19]!==owner.startTicks||['Z','X'].includes(tail[0]),'PAGED_NOTE_PRIVATE_OWNER_STILL_LIVE');}
 catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;}
 for(const entry of readdirSync('/proc'))if(/^[1-9][0-9]*$/.test(entry)){
  try{const stat=readFileSync('/proc/'+entry+'/stat','utf8'),tail=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/);assert.ok(Number(tail[2])!==owner.processGroup||['Z','X'].includes(tail[0]),'PAGED_NOTE_PRIVATE_PROCESS_GROUP_STILL_LIVE');}
  catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;}
 }
}
export async function createDevicePagedNoteProofRetentionV6(config,descriptor,mode,jobId){
 assert.equal(arguments.length,4);return createStore(config,descriptor,mode,jobId,false);
}
/** Authenticated metadata only, including the single completed transition
 * lost before the authority ACK. No private capsule or proof handle escapes. */
export async function readOriginalDevicePagedNoteProofCheckpointV6(retention,descriptor,mode,jobId,before){
 assert.equal(arguments.length,5);P.pagedOwnerExactV3(retention,['path','password']);const store=await createStore({...retention,expected:before},descriptor,mode,jobId,true);try{await store.assertCurrent();return store.checkpoint();}finally{store.close();}
}
async function createStore(config,descriptor,mode,jobId,allowCompletedTransition){
 P.pagedOwnerExactV3(config,['path','password','expected']);assert.ok(['deposit','withdraw'].includes(mode));assert.match(jobId,/^[a-z0-9-]{8,100}$/);
 const normalized=P.normalizeDevicePagedDescriptorV3(descriptor),path=resolve(config.path);assert.equal(path,config.path);const name=basename(path),historicalName='private-historical-'+createHash('sha256').update(jobId,'utf8').digest('hex')+'-withdraw-proof.vault';assert.ok(name==='private-'+mode+'-proof.vault'||mode==='withdraw'&&name===historicalName,'PAGED_NOTE_RETENTION_JOB_PATH');assert.ok(typeof config.password==='string'&&config.password.length>=32&&config.password.length<=4096);
 const dir=await lstat(dirname(path));assert.ok(dir.isDirectory()&&!dir.isSymbolicLink()&&dir.uid===process.getuid()&&(dir.mode&0o777)===0o700);assert.equal(await realpath(dirname(path)),dirname(path));
 const vault=new Vault(path),descriptorSHA256=hash(normalized),leasePath=path+'.compute-lease';let password=config.password,record=null,closed=false,lease=null;
 const live=()=>assert.ok(!closed&&P.devicePagedNowV3()<normalized.deadlineMs,'PAGED_NOTE_RETENTION_CLOSED');
 async function physical(required){try{await lstat(path+'.lock');assert.fail('PAGED_NOTE_RETENTION_LOCKED');}catch(error){if(error.code!=='ENOENT')throw error;}try{const file=await lstat(path);assert.ok(file.isFile()&&!file.isSymbolicLink()&&file.nlink===1&&file.uid===process.getuid()&&(file.mode&0o777)===0o600,'PAGED_NOTE_RETENTION_PRIVATE_FILE');}catch(error){if(required||error.code!=='ENOENT')throw error;}}
 function metadata(r){const c=r.data.controller;return Object.freeze({profile:CHECKPOINT,descriptorSHA256,revision:r.revision,dataSHA256:hash(r.data),public:{jobId,mode,rootId:JSON.parse(c.inputsJSON).consent.rootId,sourceRevision:JSON.parse(c.inputsJSON).consent.revision,consentSHA256:c.authorization.consentSHA256,witnessSHA256:c.authorization.witnessSHA256,publicInputsSHA256:hash(c.expectedPublicInputs),stage:c.result===null?'INTENT':'PROVED',ownerProcess:structuredClone(c.ownerProcess)}});}
 function validate(r){live();P.pagedOwnerExactV3(r.data,['profile','descriptor','controller']);assert.equal(r.data.profile,PROFILE);assert.deepEqual(r.data.descriptor,normalized);const c=P.pagedOwnerExactV3(r.data.controller,['inputsJSON','scope','expectedPublicInputs','authorization','ownerProcess','acceptedAt','result']);assert.ok(typeof c.inputsJSON==='string'&&Buffer.byteLength(c.inputsJSON)<=1024*1024,'PAGED_NOTE_RETAINED_PRIVATE_BYTES_BOUND');const admitted=JSON.parse(c.inputsJSON);assert.equal(admitted.consent.mode,mode);assert.equal(admitted.consent.jobId,jobId);assert.deepEqual(admitted.consent.descriptor,normalized);assert.ok(Number.isSafeInteger(c.acceptedAt)&&c.acceptedAt>=admitted.consent.expiresAt-15000&&c.acceptedAt<admitted.consent.expiresAt,'PAGED_NOTE_ORIGINAL_ADMISSION_CLOCK');const job=validateDevicePagedRetainedPrivateInputsV6(JSON.parse(c.inputsJSON),c.scope,c.expectedPublicInputs,c.authorization);try{if(c.result!==null){P.pagedOwnerExactV3(c.result,['proof','publicInputs','source']);assert.match(c.result.proof,/^(?:[0-9a-f]{2})+$/);assert.ok(c.result.proof.length<=3*1024*1024);assert.deepEqual(c.result.publicInputs,job.expectedPublicInputs);assert.deepEqual(c.result.source,job.source);}}finally{wipePrivateProofInputsV1(job);}return metadata(r);}
 await physical(config.expected!==null);
 if(config.expected!==null){P.pagedOwnerExactV3(config.expected,['profile','descriptorSHA256','revision','dataSHA256','public']);record=await vault.read(password);const actual=validate(record);if(allowCompletedTransition&&actual.revision===config.expected.revision+1){assert.equal(config.expected.public.stage,'INTENT');assert.equal(actual.public.stage,'PROVED');assert.deepEqual({...actual.public,stage:'INTENT'},config.expected.public,'PAGED_NOTE_COMPLETED_ORIGINAL_SCOPE');assert.equal(actual.descriptorSHA256,config.expected.descriptorSHA256);}else assert.deepEqual(actual,config.expected,'PAGED_NOTE_RETENTION_CHECKPOINT_CHANGED');assertDevicePagedNoteProofOwnerStoppedV6(record.data.controller.ownerProcess);}
 else{try{await lstat(path);assert.fail('PAGED_NOTE_EXISTING_RETENTION_CANNOT_BIRTH');}catch(error){if(error.code!=='ENOENT')throw error;}}
 async function current(){live();assert.ok(record,'PAGED_NOTE_RETENTION_REQUIRED');await physical(true);const actual=await vault.read(password);try{assert.deepEqual(validate(actual),validate(record),'PAGED_NOTE_RETENTION_CHECKPOINT_CHANGED');}finally{wipePrivateProofInputsV1(actual.data.controller);}}
 return Object.freeze({
  checkpoint(){live();return record===null?null:validate(record);},
  async commitIntent(opened){live();assert.equal(record,null);const job=deriveOriginalDevicePagedPrivateJobV3(opened);let data;
   try{assert.equal(job.mode,mode);assert.equal(job.consent.jobId,jobId);assert.deepEqual(job.consent.descriptor,normalized);const acceptedAt=P.devicePagedNowV3();P.validateDevicePagedConsentFreshV3(job.consent);data={profile:PROFILE,descriptor:normalized,controller:{inputsJSON:JSON.stringify(opened.inputs),scope:readOriginalPrivateProofRecipientV1(opened),expectedPublicInputs:[...opened.expectedPublicInputs],authorization:structuredClone(opened.authorization),ownerProcess:ownerProcess(),acceptedAt,result:null}};await physical(false);const made=await vault.create(data,password),actual=await vault.read(password);assert.deepEqual(actual,made,'PAGED_NOTE_RETENTION_INTENT_READBACK');record=actual;return validate(record);}
   finally{wipePrivateProofInputsV1(job);wipePrivateProofInputsV1(data?.controller);}
  },
  async job(){await current();const c=record.data.controller;return validateDevicePagedRetainedPrivateInputsV6(JSON.parse(c.inputsJSON),c.scope,c.expectedPublicInputs,c.authorization);},
  async result(){await current();return record.data.controller.result===null?null:structuredClone(record.data.controller.result);},
  async commitResult(result){await current();assert.equal(record.data.controller.result,null,'PAGED_NOTE_ONE_RETAINED_RESULT');const next=structuredClone(record.data);next.controller.result=structuredClone(result);let saved;
   try{validate({revision:record.revision+1,data:next});try{saved=await vault.update(password,record.revision,()=>next);}catch(error){const actual=await vault.read(password);if(actual.revision!==record.revision+1||hash(actual.data)!==hash(next))throw error;saved=actual;}const actual=await vault.read(password);assert.deepEqual(actual,saved,'PAGED_NOTE_RETENTION_RESULT_READBACK');wipePrivateProofInputsV1(record.data.controller);record=actual;return validate(record);}
   finally{wipePrivateProofInputsV1(next.controller);}
  },
  async assertCurrent(){await current();},
  async claimComputation(){await current();assert.equal(record.data.controller.result,null);assert.equal(lease,null,'PAGED_NOTE_COMPUTATION_ONE_LEASE');let previous=null;
   try{const file=await lstat(leasePath);assert.ok(file.isFile()&&!file.isSymbolicLink()&&file.nlink===1&&file.uid===process.getuid()&&(file.mode&0o777)===0o600,'PAGED_NOTE_COMPUTATION_PRIVATE_LEASE');previous=await readFile(leasePath,'utf8');const held=P.pagedOwnerExactV3(JSON.parse(previous),['profile','checkpointSHA256','ownerProcess']);assert.equal(held.profile,'DEVICE_PAGED_NOTE_COMPUTATION_LEASE_V6');assert.equal(held.checkpointSHA256,hash(metadata(record)));assertDevicePagedNoteProofOwnerStoppedV6(held.ownerProcess);assert.equal(await readFile(leasePath,'utf8'),previous,'PAGED_NOTE_COMPUTATION_LEASE_CHANGED');await unlink(leasePath);}
   catch(error){if(error.code!=='ENOENT')throw error;}
   const body=JSON.stringify({profile:'DEVICE_PAGED_NOTE_COMPUTATION_LEASE_V6',checkpointSHA256:hash(metadata(record)),ownerProcess:ownerProcess()})+'\n',file=await open(leasePath,'wx',0o600);try{await file.writeFile(body);await file.sync();}finally{await file.close();}assert.equal(await readFile(leasePath,'utf8'),body,'PAGED_NOTE_COMPUTATION_LEASE_READBACK');lease=body;await current();
  },
  async releaseComputation(){if(lease===null)return;const body=lease;lease=null;assert.equal(await readFile(leasePath,'utf8'),body,'PAGED_NOTE_COMPUTATION_LEASE_CHANGED');await unlink(leasePath);},
  close(){if(closed)return;closed=true;password=null;wipePrivateProofInputsV1(record?.data?.controller);record=null;}
 });
}
