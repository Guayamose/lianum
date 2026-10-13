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
  restored(){assert.ok(!closed&&record);return structuredClone(record.data.controller);},
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
