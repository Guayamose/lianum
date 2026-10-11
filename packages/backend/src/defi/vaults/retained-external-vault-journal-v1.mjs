/** Private checkpoint for the two fixed original official-vault closures.
 * Credentials/checkpoints are comparison data in the original AEAD lifetime;
 * only their fixed issuer tokens may reopen. No legacy file adoption. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,realpath} from 'node:fs/promises';
import {dirname,resolve,sep} from 'node:path';
import {canonical} from '@lianum/engine/crypto/privacy';
import {Vault} from '@lianum/engine/crypto/vault';
import {exactRecord} from '@lianum/components/encoding/commitments';
import {retainWrappedPrivateLifetimeIndexedPartV1,readWrappedPrivateLifetimeIndexedPartV1,updateWrappedPrivateLifetimePartV1,assertWrappedPrivateLifetimePartSealedV1} from '../../claims/wrapped/recovery/wrapped-private-lifetime-registry-v1.mjs';
const sha=value=>createHash('sha256').update(canonical(value)).digest('hex');
const mark=record=>({revision:record.revision,stateSHA256:sha(record.data)});
export async function assertOriginalExternalVaultJournalV1(runtime,path){
 assert.equal(arguments.length,2);assert.equal(resolve(path),path);assert.ok(path.startsWith(resolve(runtime.metadata.scratchDirectory)+sep),'EXTERNAL_VAULT_ORIGINAL_SCRATCH');
 const directory=dirname(path),parent=await lstat(directory);assert.ok(parent.isDirectory()&&!parent.isSymbolicLink()&&(parent.mode&0o777)===0o700,'EXTERNAL_VAULT_PRIVATE_DIRECTORY');assert.equal(await realpath(directory),directory);
 const file=await lstat(path);assert.ok(file.isFile()&&!file.isSymbolicLink()&&file.nlink===1&&(file.mode&0o777)===0o600&&file.size<=2*1024*1024,'EXTERNAL_VAULT_PRIVATE_FILE');assert.equal(await realpath(path),path);
 if(typeof process.getuid==='function'){assert.equal(parent.uid,process.getuid());assert.equal(file.uid,process.getuid());}
}
async function journal(runtime,family,identity,credentials,record,saved){
 assert.ok(['wallet-official-vault','wallet-vault-exit'].includes(family));exactRecord(credentials,['path','password']);assert.ok(typeof credentials.password==='string'&&credentials.password.length===64);
 await assertOriginalExternalVaultJournalV1(runtime,credentials.path);
 const state={credentials:structuredClone(credentials),checkpoint:mark(record),pending:null};let handle;
 if(saved){const actual=await readWrappedPrivateLifetimeIndexedPartV1(runtime,family,identity);assert.deepEqual(actual.privateState,state,'EXTERNAL_VAULT_ORIGINAL_CHECKPOINT');assert.deepEqual(saved,state,'EXTERNAL_VAULT_ORIGINAL_CHECKPOINT');handle=actual.handle;}
 else handle=await retainWrappedPrivateLifetimeIndexedPartV1(runtime,family,identity,state);
 assertWrappedPrivateLifetimePartSealedV1(handle);
 return Object.freeze({
  async check(current){await assertOriginalExternalVaultJournalV1(runtime,credentials.path);assert.deepEqual(mark(current),state.checkpoint,'EXTERNAL_VAULT_ORIGINAL_CHECKPOINT');assert.equal(state.pending,null);assertWrappedPrivateLifetimePartSealedV1(handle);},
  async reconcile(current){
   assert.equal(arguments.length,1);await assertOriginalExternalVaultJournalV1(runtime,credentials.path);
   const store=new Vault(credentials.path);assert.deepEqual(await store.read(credentials.password),current,'EXTERNAL_VAULT_ORIGINAL_PHYSICAL_RECORD');
   const retained=await readWrappedPrivateLifetimeIndexedPartV1(runtime,family,identity);
   assert.equal(retained.handle,handle,'EXTERNAL_VAULT_ORIGINAL_PART_HANDLE');assert.deepEqual(retained.privateState,state,'EXTERNAL_VAULT_ORIGINAL_CHECKPOINT');assertWrappedPrivateLifetimePartSealedV1(handle);
   const observed=mark(current);
   if(state.pending!==null){
    assert.equal(state.pending.revision,state.checkpoint.revision+1,'EXTERNAL_VAULT_ORIGINAL_PENDING');
    assert.deepEqual(observed,observed.revision===state.pending.revision?state.pending:state.checkpoint,'EXTERNAL_VAULT_ORIGINAL_CHECKPOINT');
    // The owning caller has already compared the complete AEAD record with
    // its original checkpoint/candidate. This acknowledges only that boundary.
    state.checkpoint=observed;state.pending=null;await updateWrappedPrivateLifetimePartV1(handle,state);
    const acknowledged=await readWrappedPrivateLifetimeIndexedPartV1(runtime,family,identity);
    assert.equal(acknowledged.handle,handle,'EXTERNAL_VAULT_ORIGINAL_PART_HANDLE');assert.deepEqual(acknowledged.privateState,state,'EXTERNAL_VAULT_ORIGINAL_CHECKPOINT');assertWrappedPrivateLifetimePartSealedV1(handle);
   }else assert.deepEqual(observed,state.checkpoint,'EXTERNAL_VAULT_ORIGINAL_CHECKPOINT');
   assert.deepEqual(await store.read(credentials.password),current,'EXTERNAL_VAULT_ORIGINAL_PHYSICAL_RECORD');await assertOriginalExternalVaultJournalV1(runtime,credentials.path);
  },
  async before(current,next){assert.deepEqual(mark(current),state.checkpoint);assert.equal(state.pending,null);state.pending=mark(next);await updateWrappedPrivateLifetimePartV1(handle,state);},
  async acknowledged(current){assert.deepEqual(mark(current),state.pending);state.checkpoint=state.pending;state.pending=null;await updateWrappedPrivateLifetimePartV1(handle,state);},
  async capture(current){await this.check(current);return structuredClone(state);},
 });
}
export function createRetainedOfficialVaultJournalV1(runtime,identity,credentials,record){assert.equal(arguments.length,4);return journal(runtime,'wallet-official-vault',identity,credentials,record,null);}
export function openRetainedOfficialVaultJournalV1(runtime,identity,credentials,record,saved){assert.equal(arguments.length,5);return journal(runtime,'wallet-official-vault',identity,credentials,record,saved);}
export function createRetainedPrivateVaultExitJournalV1(runtime,identity,credentials,record){assert.equal(arguments.length,4);return journal(runtime,'wallet-vault-exit',identity,credentials,record,null);}
export function openRetainedPrivateVaultExitJournalV1(runtime,identity,credentials,record,saved){assert.equal(arguments.length,5);return journal(runtime,'wallet-vault-exit',identity,credentials,record,saved);}
