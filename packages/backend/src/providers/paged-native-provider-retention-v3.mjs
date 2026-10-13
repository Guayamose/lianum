/** Encrypted local retention only. These helpers issue no provider/runtime,
 * dispatch grant or recovery capability; the original operator supplies those. */
import assert from 'node:assert/strict';
import {lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {Vault} from '@lianum/engine/crypto/vault';

export const PAGED_NATIVE_PROVIDER_RETENTION_PROFILE_V3='ORIGINAL_PAGED_NATIVE_PROVIDER_RETENTION_V3';
const fields=['profile','providerIdentity','configurationSHA256','providerPassword'];
const exact=(value,keys)=>{assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype,'PAGED_NATIVE_RETENTION_RECORD');assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort());for(const key of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));};
function record(value){exact(value,fields);assert.equal(value.profile,PAGED_NATIVE_PROVIDER_RETENTION_PROFILE_V3);for(const key of fields.slice(1))assert.match(value[key],/^[0-9a-f]{64}$/);return value;}
async function fixedVault(directory){
 assert.equal(typeof directory,'string');const metadata=await lstat(directory);
 assert.ok(metadata.isDirectory()&&!metadata.isSymbolicLink()&&metadata.uid===process.getuid()&&(metadata.mode&0o777)===0o700&&await realpath(directory)===directory,'PAGED_NATIVE_RETENTION_DIRECTORY');
 return new Vault(join(directory,'provider-retention.vault'));
}
async function privateFile(path,maximum=8192){const metadata=await lstat(path);assert.ok(metadata.isFile()&&!metadata.isSymbolicLink()&&metadata.nlink===1&&metadata.uid===process.getuid()&&(metadata.mode&0o777)===0o600&&metadata.size>0&&metadata.size<=maximum,'PAGED_NATIVE_RETENTION_FILE');}
async function unlocked(vault){try{await lstat(vault.lockPath);}catch(error){if(error.code==='ENOENT')return;throw error;}assert.fail('PAGED_NATIVE_RETENTION_LOCKED');}
const credential=password=>assert.ok(typeof password==='string'&&password.length>=32&&password.length<=4096,'PAGED_NATIVE_RETENTION_CREDENTIAL');

/** The immutable envelope is authenticated under the ORIGINAL journal secret.
 * Repeated sealing accepts only its exact previous record, never replacement. */
export async function sealPagedNativeProviderCredentialV3(directory,journalPassword,value){
 assert.equal(arguments.length,3);credential(journalPassword);record(value);const vault=await fixedVault(directory);
 let exists=true;try{await privateFile(vault.path);}catch(error){if(error.code!=='ENOENT')throw error;exists=false;}
 if(!exists){try{await vault.create(value,journalPassword);}catch(error){
  // Vault may commit its rename before a durability error. Only the exact
  // authenticated immutable record can make that local outcome unambiguous.
  if(['VAULT_LOCKED','VAULT_EXISTS'].includes(error.code))throw error;await unlocked(vault);await privateFile(vault.path);const current=await vault.read(journalPassword);assert.equal(current.revision,0);assert.deepEqual(current.data,value);
 }}
 await unlocked(vault);await privateFile(vault.path);const current=await vault.read(journalPassword);assert.equal(current.revision,0);assert.deepEqual(record(current.data),value);
 return Object.freeze({profile:value.profile,providerIdentity:value.providerIdentity,configurationSHA256:value.configurationSHA256});
}

export async function readPagedNativeProviderCredentialV3(directory,journalPassword,identity){
 assert.equal(arguments.length,3);credential(journalPassword);exact(identity,['profile','providerIdentity','configurationSHA256']);
 const vault=await fixedVault(directory);await unlocked(vault);await privateFile(vault.path);const current=await vault.read(journalPassword);assert.equal(current.revision,0);record(current.data);
 for(const key of ['profile','providerIdentity','configurationSHA256'])assert.equal(current.data[key],identity[key],'PAGED_NATIVE_RETENTION_IDENTITY');
 return current.data;
}

export async function assertPagedNativeProviderStateFileV3(directory){assert.equal(arguments.length,1);await fixedVault(directory);const vault=new Vault(join(directory,'provider.vault'));await unlocked(vault);await privateFile(vault.path,2*1024*1024);}
