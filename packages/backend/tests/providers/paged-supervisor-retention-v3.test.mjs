/** Real Vault/CAS/file retention. Runtime/component rows are explicit inert
 * data fixtures; no runtime, financial authority or accepted proof is simulated. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createOriginalPagedSupervisorRetentionV3,openOriginalPagedSupervisorRetentionV3,createOriginalPagedMixedSupervisorRetentionV3,openOriginalPagedMixedSupervisorRetentionV3,consumeOriginalPagedRuntimeRecoveryV3,consumeOriginalPagedComponentRecoveryV3,splitOriginalPagedSourceAuthorityRecoveryV4,PAGED_SOURCE_AUTHORITY_COLLECTION_RETENTION_V4} from '../../src/operations/recovery/paged-runtime-recovery-authority-v3.mjs';
const descriptor={profile:'LIANUM_DEVICE_PAGED_OWNER_V3',graphProfile:'LIANUM_PAEG_FUNDED_PAGED_V3',sparseEncoding:'BN254_POSEIDON2_SPARSE_V3',origin:'https://127.0.0.1:9449',pairingId:'paged-cold-retention-fixture',devicePublicKey:'04'+'a'.repeat(128),deadlineMs:1900000000000,chainId:'31337',...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(key=>[key,'b'.repeat(64)])),...Object.fromEntries(['pool','state','native','math'].map((key,i)=>[key,'0x'+String(i+1).repeat(40)]))};
test('captured private supervisor opens once, binds every token and rejects incomplete/partial reopening',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-supervisor-v3-')),config={directory,password:'synthetic-supervisor-password-32-byte'},runtimes={};let current;
 try{
  for(const family of ['receiver','graphNative','bitcoin','solana']){const cwd=join(directory,family);await mkdir(cwd,{mode:0o700});const row={schema:'HOST_INERT_RUNTIME_CAPTURE',family,cwd,processGeneration:0,terminal:{ownedProcessStopped:true,forced:false,...(family==='solana'?{nativeOrderlyExit:true}:{})},genesis:'a'.repeat(64),files:{files:[],totalBytes:0}};if(family==='receiver'){row.schema='OWNED_FIXED_EVM_CAPTURE_V2';await writeFile(join(cwd,'wrapped-runtime-terminal.json'),JSON.stringify(row),{mode:0o600});row.localCustody={password:'INERT_CUSTODY_AEAD_FIXTURE',commitment:'b'.repeat(64)};}else await writeFile(join(cwd,'wrapped-runtime-terminal.json'),JSON.stringify(row),{mode:0o600});runtimes[family]=row;}
  current=await createOriginalPagedSupervisorRetentionV3(config,descriptor);await assert.rejects(openOriginalPagedSupervisorRetentionV3(config),{code:'EEXIST'});
  await current.capture({deployment:{inert:true,data:'a'.repeat(1200000)},authority:{descriptor},provider:{inert:true},runtimes});assert.equal(current.checkpoint().phase,'CAPTURED');await current.close();
  await assert.rejects(openOriginalPagedSupervisorRetentionV3({...config,password:'wrong-synthetic-password-32-byte'}));current=await openOriginalPagedSupervisorRetentionV3(config);
  const runtimeTokens={},componentTokens={};for(const family of Object.keys(runtimes))runtimeTokens[family]=await current.issueRuntime(family);for(const kind of ['deployment','authority','provider'])componentTokens[kind]=await current.issueComponent(kind);
  await assert.rejects(current.complete(),/PAGED_SUPERVISOR_OPEN_COMPONENTS/);assert.throws(()=>consumeOriginalPagedRuntimeRecoveryV3({},'receiver'),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);assert.throws(()=>consumeOriginalPagedRuntimeRecoveryV3(runtimeTokens.receiver,'bitcoin'),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);
  for(const [family,token]of Object.entries(runtimeTokens)){const captured=consumeOriginalPagedRuntimeRecoveryV3(token,family);assert.deepEqual(captured,runtimes[family]);assert.throws(()=>consumeOriginalPagedRuntimeRecoveryV3(token,family),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);}
  for(const [kind,token]of Object.entries(componentTokens))consumeOriginalPagedComponentRecoveryV3(token,kind);const checkpoint=await current.complete();assert.equal(checkpoint.generation,1);assert.equal(checkpoint.phase,'ACTIVE');await current.close();await assert.rejects(openOriginalPagedSupervisorRetentionV3(config),/PAGED_SUPERVISOR_NO_CAPTURED_REOPEN/);
 }finally{await current?.close();await rm(directory,{recursive:true,force:true});}
});


test('mixed capture keeps the target receiver separate, requires all nine tokens and rejects substitution/replay',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-mixed-supervisor-v3-')),config={directory,password:'inert-mixed-supervisor-password-32-byte'},runtimes={};let current;
 const targetDescriptor={publicInertTarget:true,origin:'https://127.0.0.1:9450',pairingId:'inert-uniswap-target'};
 try{
  for(const name of ['receiver','graphNative','bitcoin','solana','uniswap']){
   const cwd=join(directory,name);await mkdir(cwd,{mode:0o700});const family=name==='uniswap'?'receiver':name,row={schema:name==='uniswap'?'OWNED_EXTERNAL_DEFI_RECEIVER_CAPTURE_V3':'HOST_INERT_RUNTIME_CAPTURE',family,cwd,processGeneration:0,terminal:{ownedProcessStopped:true,forced:false,...(name==='solana'?{nativeOrderlyExit:true}:{})},genesis:name==='uniswap'?'c'.repeat(64):'a'.repeat(64),files:{files:[],totalBytes:0}};
   await writeFile(join(cwd,'wrapped-runtime-terminal.json'),JSON.stringify(row),{mode:0o600});if(name==='uniswap')row.localCustody={password:'INERT_SEPARATE_UNISWAP_CUSTODY',commitment:'d'.repeat(64)};runtimes[name]=row;
  }
  const snapshot={deployment:{inert:true},authority:{descriptor},provider:{configuration:{publicConfiguration:{uniswap:{targetConnection:{descriptor:targetDescriptor}}}}},runtimes,uniswap:{profile:'ORIGINAL_PAGED_UNISWAP_CONTEXT_COLD_RETENTION_V3',targetDescriptor}};
  current=await createOriginalPagedMixedSupervisorRetentionV3(config,descriptor);
  const missing=structuredClone(snapshot);delete missing.runtimes.uniswap;await assert.rejects(current.capture(missing));assert.equal(current.checkpoint().phase,'ACTIVE');
  const wrongFamily=structuredClone(snapshot);wrongFamily.runtimes.uniswap.family='graphNative';await assert.rejects(current.capture(wrongFamily),/PAGED_SUPERVISOR_RUNTIME_FAMILY/);
  const aliased=structuredClone(snapshot);aliased.runtimes.uniswap.cwd=aliased.runtimes.receiver.cwd;await assert.rejects(current.capture(aliased),/PAGED_SUPERVISOR_RUNTIME_ALIAS/);
  const wrongTarget=structuredClone(snapshot);wrongTarget.uniswap.targetDescriptor={...targetDescriptor,pairingId:'different-target'};await assert.rejects(current.capture(wrongTarget),/PAGED_SUPERVISOR_UNISWAP_DESCRIPTOR/);
  await current.capture(snapshot);const saved=current.checkpoint();await current.close();
  await assert.rejects(openOriginalPagedSupervisorRetentionV3(config),/PAGED_SUPERVISOR_COMPOSITION/);
  current=await openOriginalPagedMixedSupervisorRetentionV3(config);assert.equal(current.checkpoint().identity,saved.identity);const issued=[];
  for(const name of Object.keys(runtimes)){const token=await current.issueRuntime(name);if(name==='uniswap'){assert.throws(()=>consumeOriginalPagedRuntimeRecoveryV3(token,'receiver'),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);assert.deepEqual(consumeOriginalPagedRuntimeRecoveryV3(token,name),runtimes[name]);}else consumeOriginalPagedRuntimeRecoveryV3(token,name);issued.push(token);}
  for(const name of ['deployment','authority','provider'])consumeOriginalPagedComponentRecoveryV3(await current.issueComponent(name),name);
  await assert.rejects(current.complete(),/PAGED_SUPERVISOR_OPEN_COMPONENTS/);
  const component=await current.issueComponent('uniswap');await assert.rejects(current.complete(),/PAGED_SUPERVISOR_OPEN_COMPONENTS/);assert.throws(()=>consumeOriginalPagedRuntimeRecoveryV3(component,'uniswap'),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);
  assert.deepEqual(consumeOriginalPagedComponentRecoveryV3(component,'uniswap'),snapshot.uniswap);assert.throws(()=>consumeOriginalPagedComponentRecoveryV3(component,'uniswap'),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);
  const reopened=await current.complete();assert.equal(reopened.phase,'ACTIVE');assert.equal(reopened.generation,1);await current.close();for(const token of issued)assert.throws(()=>consumeOriginalPagedRuntimeRecoveryV3(token,'uniswap'));
  await assert.rejects(openOriginalPagedMixedSupervisorRetentionV3(config),/PAGED_SUPERVISOR_NO_CAPTURED_REOPEN/);
 }finally{await current?.close();await rm(directory,{recursive:true,force:true});}
});


test('original captured source collection requires every original child and rejects DATA, copying and replay',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-source-supervisor-v4-')),config={directory,password:'inert-source-collection-password-32-bytes'},runtimes={};let current;
 try{
  for(const family of ['receiver','graphNative','bitcoin','solana']){const cwd=join(directory,family);await mkdir(cwd,{mode:0o700});const row={schema:'HOST_INERT_RUNTIME_CAPTURE',family,cwd,processGeneration:0,terminal:{ownedProcessStopped:true,forced:false,...(family==='solana'?{nativeOrderlyExit:true}:{})},genesis:'a'.repeat(64),files:{files:[],totalBytes:0}};await writeFile(join(cwd,'wrapped-runtime-terminal.json'),JSON.stringify(row),{mode:0o600});runtimes[family]=row;}
  const next={...descriptor,pairingId:'paged-next-retention-fixture'},capture=d=>({profile:'DEVICE_PAGED_AUTHORITY_RETAINED_V3',descriptor:d,identity:'c'.repeat(64),journalRevision:3,journalDataSHA256:'d'.repeat(64),ownerCheckpoint:{profile:'HOST_INERT_OWNER_CHECKPOINT'}});
  const authority={profile:PAGED_SOURCE_AUTHORITY_COLLECTION_RETENTION_V4,entries:[{authority:capture(descriptor),systemIndex:0,journalRelative:'authority/journal.vault'},{authority:capture(next),systemIndex:0,journalRelative:'sources/source-1/journal.vault'}]};
  const snapshot={deployment:{profile:'ORIGINAL_PAGED_DEPOSIT_CATALOGUE_RETENTION_V1',principal:'e'.repeat(64),systems:[{profile:'HOST_INERT_DEPLOYMENT'}]},authority,provider:{inert:true},runtimes};
  current=await createOriginalPagedSupervisorRetentionV3(config,descriptor);
  const aliased=structuredClone(snapshot);aliased.authority.entries[1].journalRelative='../authority/journal.vault';await assert.rejects(current.capture(aliased),/PAGED_SUPERVISOR_SOURCE_COLLECTION_JOURNAL/);
  const otherOwner=structuredClone(snapshot);otherOwner.authority.entries[1].authority.descriptor.devicePublicKey='04'+'f'.repeat(128);await assert.rejects(current.capture(otherOwner),/PAGED_SUPERVISOR_SOURCE_COLLECTION_BINDING/);
  await current.capture(snapshot);await current.close();current=await openOriginalPagedSupervisorRetentionV3(config);
  for(const family of Object.keys(runtimes))consumeOriginalPagedRuntimeRecoveryV3(await current.issueRuntime(family),family);
  for(const kind of ['deployment','provider'])consumeOriginalPagedComponentRecoveryV3(await current.issueComponent(kind),kind);
  const parent=await current.issueComponent('authority');assert.throws(()=>splitOriginalPagedSourceAuthorityRecoveryV4(authority),/PAGED_SUPERVISOR_ORIGINAL_SOURCE_COLLECTION_TOKEN/);
  assert.throws(()=>consumeOriginalPagedComponentRecoveryV3(parent,'authority'),/PAGED_SUPERVISOR_SOURCE_COLLECTION_SPLIT_REQUIRED/);
  const entries=splitOriginalPagedSourceAuthorityRecoveryV4(parent);assert.equal(entries.length,2);assert.throws(()=>splitOriginalPagedSourceAuthorityRecoveryV4(parent),/PAGED_SUPERVISOR_ORIGINAL_SOURCE_COLLECTION_TOKEN/);
  await assert.rejects(current.complete(),/PAGED_SUPERVISOR_OPEN_COMPONENTS/);
  assert.throws(()=>consumeOriginalPagedComponentRecoveryV3({...entries[0].token},'authority'),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);
  assert.deepEqual(consumeOriginalPagedComponentRecoveryV3(entries[0].token,'authority'),authority.entries[0].authority);
  await assert.rejects(current.complete(),/PAGED_SUPERVISOR_OPEN_COMPONENTS/);
  assert.deepEqual(consumeOriginalPagedComponentRecoveryV3(entries[1].token,'authority'),authority.entries[1].authority);
  assert.throws(()=>consumeOriginalPagedComponentRecoveryV3(entries[1].token,'authority'),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);
  assert.equal((await current.complete()).phase,'ACTIVE');await current.close();
  for(const entry of entries)assert.throws(()=>consumeOriginalPagedComponentRecoveryV3(entry.token,'authority'),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);
 }finally{await current?.close();await rm(directory,{recursive:true,force:true});}
});
