/** Durable prospective PUBLIC provider seed. These AEAD helpers retain DATA;
 * only the Original provider constructor/Native claim may turn it into a live
 * unbound provider. No runtime, dispatch, proof or signing grant is issued. */
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonicalPagedProviderDataV3} from './paged-native-provider-state-v3.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),hash=v=>assert.match(v,/^[0-9a-f]{64}$/),exact=(v,keys)=>{assert.ok(v&&Object.getPrototypeOf(v)===Object.prototype);assert.deepEqual(Reflect.ownKeys(v).sort(),keys.slice().sort());for(const k of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'));};
const digest=v=>sha(canonicalPagedProviderDataV3(v));
export const PAGED_PUBLIC_PROVIDER_BIRTH_RETENTION_V5='ORIGINAL_PAGED_PUBLIC_PROVIDER_BIRTH_RETENTION_V5';
function record(v){exact(v,['profile','directory','keysetId','nativeConfigurationSHA256','providerPassword','providerDataSHA256','providerData']);assert.equal(v.profile,PAGED_PUBLIC_PROVIDER_BIRTH_RETENTION_V5);assert.equal(resolve(v.directory),v.directory);for(const k of ['keysetId','nativeConfigurationSHA256','providerPassword','providerDataSHA256'])hash(v[k]);assert.equal(digest(v.providerData),v.providerDataSHA256);assert.equal(v.providerData.schema,'ORIGINAL_PAGED_PUBLIC_TESTNET_PROVIDER_V4');assert.equal(v.providerData.binding,null);assert.deepEqual(v.providerData.preparations,[]);assert.deepEqual(v.providerData.deliveries,[]);assert.ok(!Object.hasOwn(v.providerData,'sourceContexts'));return v;}
async function location(directory){assert.equal(resolve(directory),directory);const st=await lstat(directory);assert.ok(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&(st.mode&0o777)===0o700&&await realpath(directory)===directory,'PAGED_PUBLIC_BIRTH_DIRECTORY');return new Vault(join(directory,'provider-birth.vault'));}
const password=p=>assert.ok(typeof p==='string'&&p.length>=32&&p.length<=4096,'PAGED_PUBLIC_BIRTH_OPERATOR_CREDENTIAL');
async function file(v){const st=await lstat(v.path);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&st.nlink===1&&(st.mode&0o777)===0o600&&st.size>0&&st.size<=2*1024*1024,'PAGED_PUBLIC_BIRTH_FILE');try{await lstat(v.lockPath);}catch(error){if(error.code==='ENOENT')return;throw error;}assert.fail('PAGED_PUBLIC_BIRTH_LOCKED');}
/** The original constructor calls this BEFORE provider.vault creation. Lost
 * rename/fsync ACK accepts only exact authenticated revision0 readback. */
export async function sealPagedPublicProviderBirthV5(directory,journalPassword,value){
 assert.equal(arguments.length,3);password(journalPassword);record(value);assert.equal(value.directory,directory);const vault=await location(directory);let present=true;try{await file(vault);}catch(error){if(error.code!=='ENOENT')throw error;present=false;}
 if(!present){try{await vault.create(value,journalPassword);}catch(error){if(['VAULT_EXISTS','VAULT_LOCKED'].includes(error.code))throw error;await file(vault);const row=await vault.read(journalPassword);assert.equal(row.revision,0);assert.deepEqual(row.data,value);}}
 await file(vault);const actual=await vault.read(journalPassword);assert.equal(actual.revision,0);assert.deepEqual(record(actual.data),value);return Object.freeze({profile:value.profile,directory,keysetId:value.keysetId,nativeConfigurationSHA256:value.nativeConfigurationSHA256,providerIdentity:value.providerData.providerIdentity,birthDataSHA256:digest(value)});
}
/** Returns credential DATA only to a holder of the stable operator secret.
 * The production Original opener separately validates Native/keyset/context,
 * its exclusive prospective claim, and the actual unbound provider Vault. */
export async function readPagedPublicProviderBirthV5(directory,journalPassword){assert.equal(arguments.length,2);password(journalPassword);const vault=await location(directory);await file(vault);const actual=await vault.read(journalPassword);assert.equal(actual.revision,0);assert.equal(record(actual.data).directory,directory);await file(vault);const again=await vault.read(journalPassword);assert.deepEqual(again,actual);return actual.data;}
