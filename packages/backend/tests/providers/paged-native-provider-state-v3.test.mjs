/** Inert serialized DATA + ORIGINAL Vault AES/CAS on a private HOST directory.
 * No provider identity, native runtime, proof grant or ledger is fabricated. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {canonical} from '@lianum/engine/crypto/privacy';
import {Vault} from '@lianum/engine/crypto/vault';
import {createPagedNativeProviderStateVaultV3,canonicalPagedProviderDataV3,PAGED_PROVIDER_STATE_LIMITS_V3} from '../../src/providers/paged-native-provider-state-v3.mjs';
const password='HOST-inert-vault-password-32-characters';

test('large provider DATA crosses generic canonical limit, retaining exact last rows through AES/CAS and reopen',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-compact-data-host-')),path=join(directory,'provider.vault'),vault=createPagedNativeProviderStateVaultV3(path),generic=new Vault(path);
 try{
  const small={schema:'HOST_INERT_DATA',rows:[]};assert.equal(canonicalPagedProviderDataV3(small),canonical(small));await vault.create(small,password);assert.deepEqual((await generic.read(password)).data,small);
  const data={schema:'HOST_INERT_DATA',rows:Array.from({length:768},(_,i)=>({id:'original-row-'+i,index:i,wire:'ab'.repeat(1200),quote:{immutable:'retained-policy',amount:String(i)}}))};
  assert.ok(Buffer.byteLength(canonicalPagedProviderDataV3(data))>1024*1024);assert.throws(()=>canonical(data));
  const stored=await vault.update(password,0,()=>data);assert.equal(stored.revision,1);assert.deepEqual(stored.data,data);assert.ok((await readFile(path)).length<2*1024*1024);
  const physical=(await generic.read(password)).data;assert.equal(physical.profile,'ORIGINAL_PAGED_NATIVE_PROVIDER_COMPACT_DATA_V3');assert.equal(physical.encoding,'DEFLATE_RAW');
  const reopened=createPagedNativeProviderStateVaultV3(path),actual=await reopened.read(password);assert.deepEqual(actual,stored);assert.equal(actual.data.rows[767].id,'original-row-767');
  await assert.rejects(reopened.update(password,0,()=>small),{code:'VAULT_CONFLICT'});assert.deepEqual(await reopened.read(password),actual);
  await generic.update(password,1,raw=>({...raw,sha256:'0'.repeat(64)}));await assert.rejects(reopened.read(password),/PAGED_PROVIDER_STATE_DIGEST/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('strict DATA, decode bomb and noncanonical/trailing encodings fail before replacing committed state',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-compact-bounds-host-')),path=join(directory,'provider.vault'),vault=createPagedNativeProviderStateVaultV3(path),generic=new Vault(path);
 try{
  await vault.create({retained:true},password);let invoked=0;const getter={};Object.defineProperty(getter,'key',{enumerable:true,get(){invoked++;return 'secret';}});
  await assert.rejects(vault.update(password,0,()=>getter),/PAGED_PROVIDER_STATE_DATA_PROPERTY/);assert.equal(invoked,0);assert.deepEqual((await vault.read(password)).data,{retained:true});
  await assert.rejects(vault.update(password,0,()=>({value:'x'.repeat(PAGED_PROVIDER_STATE_LIMITS_V3.decodedBytes)})),/PAGED_PROVIDER_STATE_DECODED_BOUND/);assert.equal((await vault.read(password)).revision,0);
  await vault.update(password,0,()=>({value:'x'.repeat(700000)}));const raw=(await generic.read(password)).data;
  await generic.update(password,1,()=>({...raw,length:raw.length+1}));await assert.rejects(vault.read(password),/PAGED_PROVIDER_STATE_LENGTH/);
  await generic.update(password,2,()=>({...raw,data:Buffer.concat([Buffer.from(raw.data,'base64'),Buffer.from('trailing')]).toString('base64')}));await assert.rejects(vault.read(password),/PAGED_PROVIDER_STATE_TRAILING_BYTES/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
