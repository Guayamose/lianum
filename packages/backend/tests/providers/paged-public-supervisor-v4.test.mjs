/** Actual AEAD supervisor, exclusive file claim and CAS. Public component
 * rows are inert DATA fixtures; no RPC, signer, SNARK or payment is simulated. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createOriginalPagedPublicSupervisorRetentionV4,openOriginalPagedPublicSupervisorRetentionV4,openOriginalPagedSupervisorRetentionV3,consumeOriginalPagedComponentRecoveryV3,consumeOriginalPagedRuntimeRecoveryV3} from '../../src/operations/recovery/paged-runtime-recovery-authority-v3.mjs';
const hash='a'.repeat(64),descriptor={profile:'LIANUM_DEVICE_PAGED_OWNER_V3',graphProfile:'LIANUM_PAEG_FUNDED_PAGED_V3',sparseEncoding:'BN254_POSEIDON2_SPARSE_V3',origin:'https://api.lianum.oryontechnology.com',pairingId:'public-supervisor-inert-fixture',devicePublicKey:'04'+'a'.repeat(128),deadlineMs:1900000000000,chainId:'11155111',...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(key=>[key,hash])),...Object.fromEntries(['pool','state','native','math'].map((key,i)=>[key,'0x'+String(i+1).repeat(40)]))};
const snapshot=()=>({deployment:{profile:'ORIGINAL_PAGED_SEPOLIA_DEPLOYMENT_RETENTION_V4',system:{receiverProfile:'ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4',...Object.fromEntries(['pool','state','native','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256'].map(key=>[key,descriptor[key]]))},configuration:{inert:true}},authority:{profile:'DEVICE_PAGED_AUTHORITY_RETAINED_V3',descriptor,identity:hash,journalRevision:7,journalDataSHA256:hash,ownerCheckpoint:{profile:'HOST_INERT_OWNER_CHECKPOINT'}},provider:{profile:'ORIGINAL_PAGED_PROVIDER_COLD_RETENTION_V3',directory:'/inert/provider',checkpoint:{profile:'HOST_INERT_PROVIDER_CHECKPOINT'},configuration:{profile:'ORIGINAL_PAGED_PUBLIC_TESTNET_PROVIDER_V4',binding:{descriptor}}},native:{profile:'ORIGINAL_PAGED_PUBLIC_RUNTIME_RETENTION_V4',directory:'/inert/native',keysetId:hash,configuration:{inert:true},checkpoint:{profile:'HOST_INERT_NATIVE_CHECKPOINT',keysetId:hash},source:null}});
test('PUBLIC supervisor retains four original component tokens without claiming stopped external chains',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-public-supervisor-')),config={directory,password:'inert-public-supervisor-password-32-bytes'};let s;
 try{
  s=await createOriginalPagedPublicSupervisorRetentionV4(config,descriptor);await assert.rejects(openOriginalPagedPublicSupervisorRetentionV4(config),{code:'EEXIST'});
  const wrong=snapshot();wrong.deployment.system.receiverProfile='LOCAL';await assert.rejects(s.capture(wrong));
  const legacy=snapshot();legacy.native.terminal={ownedProcessStopped:true};await assert.rejects(s.capture(legacy),/PAGED_SUPERVISOR_PUBLIC_NO_LOCAL_CAPTURE/);
  const keyset=snapshot();keyset.native.checkpoint.keysetId='b'.repeat(64);await assert.rejects(s.capture(keyset),/PAGED_SUPERVISOR_PUBLIC_KEYSET/);
  const saved=snapshot();await s.capture(saved);const retained=s.checkpoint();assert.equal(retained.phase,'CAPTURED');await s.close();
  await assert.rejects(openOriginalPagedSupervisorRetentionV3(config),/PAGED_SUPERVISOR_COMPOSITION/);
  s=await openOriginalPagedPublicSupervisorRetentionV4(config);assert.equal(s.checkpoint().identity,retained.identity);await assert.rejects(s.issueRuntime('receiver'));
  const handles={};for(const name of ['native','deployment','provider','authority'])handles[name]=await s.issueComponent(name);
  for(const [name,token]of Object.entries(handles)){
   assert.throws(()=>consumeOriginalPagedComponentRecoveryV3({...token},name),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);
   assert.throws(()=>consumeOriginalPagedRuntimeRecoveryV3(token,'receiver'),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);
   await assert.rejects(s.complete(),/PAGED_SUPERVISOR_OPEN_COMPONENTS/);
   assert.deepEqual(consumeOriginalPagedComponentRecoveryV3(token,name),saved[name]);assert.throws(()=>consumeOriginalPagedComponentRecoveryV3(token,name),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);
  }
  const opened=await s.complete();assert.equal(opened.phase,'ACTIVE');assert.equal(opened.generation,1);await s.close();await assert.rejects(openOriginalPagedPublicSupervisorRetentionV4(config),/PAGED_SUPERVISOR_NO_CAPTURED_REOPEN/);
 }finally{await s?.close();await rm(directory,{recursive:true,force:true});}
});
test('closing a partial PUBLIC opening never renews or reissues its used authority tokens',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-public-partial-')),config={directory,password:'inert-public-supervisor-password-32-bytes'};let s;
 try{s=await createOriginalPagedPublicSupervisorRetentionV4(config,descriptor);await s.capture(snapshot());await s.close();s=await openOriginalPagedPublicSupervisorRetentionV4(config);const native=await s.issueComponent('native');consumeOriginalPagedComponentRecoveryV3(native,'native');await assert.rejects(s.complete(),/PAGED_SUPERVISOR_OPEN_COMPONENTS/);await s.close();await assert.rejects(openOriginalPagedPublicSupervisorRetentionV4(config),/PAGED_SUPERVISOR_NO_CAPTURED_REOPEN/);assert.throws(()=>consumeOriginalPagedComponentRecoveryV3(native,'native'),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);}finally{await s?.close();await rm(directory,{recursive:true,force:true});}
});
