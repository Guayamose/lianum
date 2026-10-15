/** Encrypted checkpoints of one private OWNER, beneath the original authority.
 * This store establishes storage lineage, never proof or dispatch authority. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,realpath} from 'node:fs/promises';
import {dirname,resolve,basename} from 'node:path';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import {wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
const PROFILE='DEVICE_PAGED_OWNER_DURABLE_CHECKPOINT_V3';
const readRecoveryOpenings=new WeakMap();
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
export async function createDevicePagedOwnerRetentionV3(config,descriptor){
 P.pagedOwnerExactV3(config,['path','password','expected']);const path=resolve(config.path);
 assert.equal(path,config.path);assert.equal(basename(path),'private-owner.vault');
 assert.ok(typeof config.password==='string'&&config.password.length>=32&&config.password.length<=4096);
 const dir=await lstat(dirname(path));assert.ok(dir.isDirectory()&&!dir.isSymbolicLink()&&(dir.mode&0o777)===0o700&&dir.uid===process.getuid());assert.equal(await realpath(dirname(path)),dirname(path));
 const normalized=P.normalizeDevicePagedDescriptorV3(descriptor),vault=new Vault(path);let password=config.password,record=null,closed=false;
 async function physical(required){
  try{await lstat(path+'.lock');assert.fail('PAGED_OWNER_CHECKPOINT_LOCKED');}catch(error){if(error.code!=='ENOENT')throw error;}
  try{const file=await lstat(path);assert.ok(file.isFile()&&!file.isSymbolicLink()&&file.nlink===1&&file.uid===process.getuid()&&(file.mode&0o777)===0o600,'PAGED_OWNER_CHECKPOINT_PRIVATE_FILE');}
  catch(error){if(required||error.code!=='ENOENT')throw error;}
 }
 await physical(config.expected!==null);
 const binding=hash(normalized),metadata=r=>Object.freeze({profile:PROFILE,descriptorSHA256:binding,revision:r.revision,dataSHA256:hash(r.data),public:structuredClone(r.data.controller.public)});
 function validate(r){assert.ok(!closed);P.pagedOwnerExactV3(r.data,['profile','descriptor','controller']);assert.equal(r.data.profile,PROFILE);assert.deepEqual(r.data.descriptor,normalized);return metadata(r);}
 if(config.expected!==null){P.pagedOwnerExactV3(config.expected,['profile','descriptorSHA256','revision','dataSHA256','public']);record=await vault.read(password);assert.deepEqual(validate(record),config.expected,'PAGED_OWNER_CHECKPOINT_CHANGED');}
 return Object.freeze({
  async readProofCheckpointAfter(before){
   assert.ok(!closed);P.pagedOwnerExactV3(before,['profile','descriptorSHA256','revision','dataSHA256','public']);
   assert.equal(before.profile,PROFILE);assert.equal(before.descriptorSHA256,binding);await physical(true);
   const current=await vault.read(password);try{
    const after=validate(current);assert.equal(after.revision,before.revision+1,'PAGED_OWNER_RECOVERY_CHECKPOINT_STEP');
    assert.deepEqual(after.public,before.public,'PAGED_OWNER_RECOVERY_PROGRESS_CHANGED');
    assert.ok(current.data.controller.pending?.proof&&current.data.controller.automation,'PAGED_OWNER_RECOVERY_PROOF_REQUIRED');return after;
   }finally{wipePrivateProofInputsV1(current.data.controller);}
  },
  async readProofIntentCheckpointV4(before,accepted){
   assert.ok(!closed);for(const item of [before,accepted])P.pagedOwnerExactV3(item,['profile','descriptorSHA256','revision','dataSHA256','public']);assert.equal(before.profile,PROFILE);assert.equal(before.descriptorSHA256,binding);assert.equal(accepted.profile,PROFILE);assert.equal(accepted.descriptorSHA256,binding);assert.equal(accepted.revision,before.revision+1);assert.deepEqual(accepted.public,before.public);await physical(true);const current=await vault.read(password);
   try{const actual=validate(current),c=current.data.controller;assert.deepEqual(actual.public,before.public,'PAGED_OWNER_RECOVERY_PROGRESS_CHANGED');assert.ok(actual.revision===accepted.revision||actual.revision===accepted.revision+1,'PAGED_OWNER_PROOF_INTENT_CHECKPOINT_STEP');
    if(actual.revision===accepted.revision){assert.deepEqual(actual,accepted,'PAGED_OWNER_PROOF_INTENT_CHECKPOINT_CHANGED');assert.ok(c.proofIntent&&c.pending===null,'PAGED_OWNER_ORIGINAL_PROOF_INTENT_REQUIRED');return {stage:'INTENT',checkpoint:actual};}
    assert.ok(c.pending?.proof&&c.proofIntent===undefined,'PAGED_OWNER_RECOVERY_PROOF_REQUIRED');return {stage:'PROVED',checkpoint:actual};
   }finally{wipePrivateProofInputsV1(current.data.controller);}
  },
  async readEmptyBirthCheckpoint(){
   assert.ok(!closed);await physical(true);const current=await vault.read(password);
   try{const result=validate(current),c=current.data.controller;assert.equal(c.phase,'BUILDING','PAGED_REFILL_BIRTH_ALREADY_ACTIVE');assert.equal(c.pending,null);assert.equal(c.preparation,null);assert.equal(c.automation,null);assert.equal(c.public.sourceCommitment,null);assert.equal(c.public.authorizationRoot,null);assert.equal(c.public.progressCommitment,null);return result;}
   finally{wipePrivateProofInputsV1(current.data.controller);}
  },
  restored(){assert.ok(!closed&&record);return structuredClone(record.data.controller);},
  async assertCheckpointCurrentV4(){assert.ok(!closed&&record,'PAGED_OWNER_CHECKPOINT_REQUIRED');await physical(true);const actual=await vault.read(password);assert.deepEqual(validate(actual),validate(record),'PAGED_OWNER_CHECKPOINT_CHANGED');},
  checkpoint(){assert.ok(!closed);return record===null?null:validate(record);},
  async commit(controller){assert.ok(!closed);await physical(record!==null);const data={profile:PROFILE,descriptor:normalized,controller:structuredClone(controller)};
   if(record!==null){const current=await vault.read(password);assert.deepEqual(validate(current),validate(record),'PAGED_OWNER_CHECKPOINT_CHANGED');}
   let next;try{next=record===null?await vault.create(data,password):await vault.update(password,record.revision,()=>data);}
   catch(error){const actual=await vault.read(password);if(actual.revision!==(record===null?0:record.revision+1)||hash(actual.data)!==hash(data))throw error;next=actual;}
   const actual=await vault.read(password);assert.deepEqual(actual,next,'PAGED_OWNER_CHECKPOINT_READBACK');record=actual;return validate(record);
  },
  close(){if(closed)return;closed=true;password=null;wipePrivateProofInputsV1(record?.data?.controller);record=null;}
 });
}

/** Internal one-use opening from this module's actual authenticated OWNER
 * read. A descriptor, private capsule DTO or callback cannot issue it. */
export function consumeOriginalDevicePagedOwnerReadRecoveryOpeningV4(token){
 assert.equal(arguments.length,1);const opening=readRecoveryOpenings.get(token);assert.ok(opening,'PAGED_OWNER_ORIGINAL_READ_RECOVERY_OPENING');opening.current();readRecoveryOpenings.delete(token);return opening;
}

/** Only this closed producer can create an expired readonly opening: it
 * authenticates the existing physical OWNER vault and its exact checkpoint. */
export async function openOriginalDevicePagedOwnerReadRecoveryStoreV4(config,descriptor,expected){
 assert.equal(arguments.length,3);P.pagedOwnerExactV3(config,['path','password']);assert.ok(expected!==null,'PAGED_OWNER_READ_RECOVERY_EXISTING_REQUIRED');
 const reader=await createDevicePagedOwnerRetentionV3({...config,expected},descriptor),started=performance.now(),deadline=started+15000;let last=started,closed=false,token,expiry;
 const current=()=>{const now=performance.now();assert.ok(!closed&&Number.isFinite(now)&&now>=last&&now<deadline,'PAGED_OWNER_READ_RECOVERY_EXPIRED');last=now;};
 const close=()=>{if(closed)return;closed=true;clearTimeout(expiry);const unused=readRecoveryOpenings.get(token);if(unused){wipePrivateProofInputsV1(unused.capsule);readRecoveryOpenings.delete(token);}reader.close();};
 try{await reader.assertCheckpointCurrentV4();current();token=Object.freeze(Object.create(null));readRecoveryOpenings.set(token,{descriptor:P.normalizeDevicePagedDescriptorV3(descriptor),capsule:reader.restored(),current});expiry=setTimeout(close,Math.max(1,Math.ceil(deadline-performance.now())));expiry.unref?.();
  return Object.freeze({opening:token,checkpoint(){current();return reader.checkpoint();},async assertCurrent(){current();await reader.assertCheckpointCurrentV4();current();},close});
 }catch(error){close();throw error;}
}
