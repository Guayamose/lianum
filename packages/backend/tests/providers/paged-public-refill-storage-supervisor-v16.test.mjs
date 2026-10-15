/** Original supervisor AEAD, process fence and one-use limited tokens.
 * All retained component rows are inert HOST DATA, with no financial claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {canonical} from '@lianum/engine/crypto/privacy';
import * as R from '../../src/operations/recovery/paged-runtime-recovery-authority-v3.mjs';
const hash='a'.repeat(64),descriptor={profile:'LIANUM_DEVICE_PAGED_OWNER_V3',graphProfile:'LIANUM_PAEG_FUNDED_PAGED_V3',sparseEncoding:'BN254_POSEIDON2_SPARSE_V3',origin:'https://api.lianum.oryontechnology.com',pairingId:'public-supervisor-inert-fixture',devicePublicKey:'04'+'a'.repeat(128),deadlineMs:1900000000000,chainId:'11155111',...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(key=>[key,hash])),...Object.fromEntries(['pool','state','native','math'].map((key,i)=>[key,'0x'+String(i+1).repeat(40)]))};
const snapshot=()=>({deployment:{profile:'ORIGINAL_PAGED_SEPOLIA_DEPLOYMENT_RETENTION_V4',system:{receiverProfile:'ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4',...Object.fromEntries(['pool','state','native','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256'].map(key=>[key,descriptor[key]]))},configuration:{inert:true}},authority:{profile:'DEVICE_PAGED_AUTHORITY_RETAINED_V3',descriptor,identity:hash,journalRevision:7,journalDataSHA256:hash,ownerCheckpoint:{profile:'HOST_INERT_OWNER_CHECKPOINT'}},provider:{profile:'ORIGINAL_PAGED_PROVIDER_COLD_RETENTION_V3',directory:'/inert/provider',checkpoint:{profile:'HOST_INERT_PROVIDER_CHECKPOINT'},configuration:{profile:'ORIGINAL_PAGED_PUBLIC_TESTNET_PROVIDER_V4',binding:{descriptor}}},native:{profile:'ORIGINAL_PAGED_PUBLIC_RUNTIME_RETENTION_V4',directory:'/inert/native',keysetId:hash,configuration:{inert:true},checkpoint:{profile:'HOST_INERT_NATIVE_CHECKPOINT',keysetId:hash},source:null}});

for(const phase of ['OPENING','ACTIVE'])test('Refill storage recovery preserves '+phase+' snapshot, epoch and phase while generic financial consumers stay fenced',{timeout:30000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-refill-storage-supervisor-')),location={directory,password:'inert-refill-supervisor-password-32-bytes'},saved=snapshot();saved.sourceLocation={journalPath:join(directory,'authority','journal.vault')};let owner;
 try{
  if(phase==='ACTIVE'){
   const input=join(directory,'fixture-input.json'),result=join(directory,'fixture-checkpoint.json');await writeFile(input,JSON.stringify({location,descriptor,snapshot:saved,result}),{mode:0o600});
   await promisify(execFile)(process.execPath,[fileURLToPath(new URL('paged-public-refill-storage-active-child-v16.mjs',import.meta.url)),input],{timeout:15000,maxBuffer:8192});
  }else{owner=await R.createOriginalPagedPublicSupervisorRetentionV4(location,descriptor);await owner.capture(saved);await owner.close();owner=await R.openOriginalPagedPublicSupervisorRetentionV4(location);await owner.close();}
  const beforeBytes=await readFile(join(directory,'supervisor.vault'));owner=await R.openOriginalPagedPublicRefillRecoveryStorageV16(location);const checkpoint=owner.checkpoint();assert.equal(checkpoint.phase,phase);assert.equal(checkpoint.generation,0);
  assert.deepEqual(await readFile(join(directory,'supervisor.vault')),beforeBytes);assert.deepEqual(await owner.readSourceLocationV4(),saved.sourceLocation);
  await assert.rejects(R.openOriginalPagedPublicRefillRecoveryStorageV16(location),{code:'EEXIST'});await assert.rejects(owner.capture(saved),/REFILL_STORAGE_NOT_PUBLISHED/);await assert.rejects(owner.publishActivationBaseV4(saved),/ACTIVATION_PHASE/);
  for(const name of ['native','deployment','provider','authority']){
   const token=await owner.issueComponent(name);assert.throws(()=>R.consumeOriginalPagedComponentRecoveryV3(token,name),/REFILL_STORAGE_ONLY/);
   assert.throws(()=>R.consumeOriginalPagedPublicRefillRecoveryComponentV16({...token},name),/ORIGINAL_REFILL_STORAGE_TOKEN/);
   const value=R.consumeOriginalPagedPublicRefillRecoveryComponentV16(token,name);assert.deepEqual(value,name==='authority'?{authority:saved.authority,journalPath:saved.sourceLocation.journalPath}:saved[name]);
   assert.throws(()=>R.consumeOriginalPagedPublicRefillRecoveryComponentV16(token,name),/ORIGINAL_REFILL_STORAGE_TOKEN/);
  }
  await owner.complete();assert.deepEqual(owner.checkpoint(),checkpoint);assert.deepEqual(await readFile(join(directory,'supervisor.vault')),beforeBytes,'Component readback does not reset phase or create a new financial checkpoint');
  await assert.rejects(owner.issueComponent('native'),/OPEN_PHASE/);await assert.rejects(owner.complete(),/COMPLETE_PHASE/);
  // Only after all fixed consumers completed can the normal publisher record
  // a freshly constructed coherent activation; no signing occurs in this test.
  await owner.publishActivationBaseV4(saved);assert.equal(owner.checkpoint().phase,'ACTIVE');assert.equal(owner.checkpoint().generation,checkpoint.generation);await owner.capture(saved);assert.equal(owner.checkpoint().phase,'CAPTURED');await owner.close();
  await assert.rejects(R.openOriginalPagedPublicRefillRecoveryStorageV16(location),/REFILL_STORAGE_PHASE/);
 }finally{await owner?.close();await rm(directory,{recursive:true,force:true});}
});

test('normal captured tokens cannot be used as storage-recovery tokens',{timeout:15000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-refill-storage-generic-')),location={directory,password:'inert-refill-supervisor-password-32-bytes'};let owner;
 try{owner=await R.createOriginalPagedPublicSupervisorRetentionV4(location,descriptor);await owner.capture(snapshot());await owner.close();owner=await R.openOriginalPagedPublicSupervisorRetentionV4(location);const token=await owner.issueComponent('native');assert.throws(()=>R.consumeOriginalPagedPublicRefillRecoveryComponentV16(token,'native'),/ORIGINAL_REFILL_STORAGE_TOKEN/);assert.deepEqual(R.consumeOriginalPagedComponentRecoveryV3(token,'native'),snapshot().native);}finally{await owner?.close();await rm(directory,{recursive:true,force:true});}
});

function collectionSnapshot(directory,profile){
 const saved=snapshot(),digest=value=>createHash('sha256').update(canonical(value)).digest('hex'),childDescriptor={...descriptor,pairingId:'host-refill-tip',deadlineMs:descriptor.deadlineMs-1},anchor={walletRootId:'b'.repeat(64),sourceRevision:1,sourceId:'c'.repeat(64),principalSHA256:'d'.repeat(64)},lineage={profile:'DEVICE_PAGED_ORIGINAL_SOURCE_REFILL_V4',walletRootId:anchor.walletRootId,sourceRevision:2,predecessorPairingId:descriptor.pairingId,predecessorSourceId:anchor.sourceId,principalSHA256:anchor.principalSHA256};
 const template=structuredClone(saved.authority),authority=d=>({...structuredClone(template),descriptor:d}),birth={authority:authority(descriptor),systemIndex:0,journalPath:join(directory,'birth','journal.vault'),sourceLineage:null,sourceAnchor:anchor},tip={authority:authority(childDescriptor),systemIndex:0,journalPath:join(directory,'tip','journal.vault'),sourceLineage:lineage,sourceAnchor:null};
 saved.sourceLocation={journalPath:birth.journalPath};saved.authority={profile,entries:[tip,birth]};
 if(profile==='ORIGINAL_PAGED_PUBLIC_POOL_GROUP_V6'){
  for(const row of saved.authority.entries)row.poolRollover=null;
  const brokerDescriptor={...descriptor,pairingId:'host-terminal-broker',deadlineMs:descriptor.deadlineMs-2},binding={profile:'DEVICE_PAGED_ORIGINAL_HISTORICAL_WITHDRAWAL_V5',epochId:'e'.repeat(64),policySHA256:hash,sponsorExpiresAtMs:descriptor.deadlineMs,maximumDeadlineMs:brokerDescriptor.deadlineMs,currentPairingId:childDescriptor.pairingId,currentDescriptorSHA256:digest(childDescriptor),principalSHA256:anchor.principalSHA256,walletRootId:anchor.walletRootId,targetSourceId:anchor.sourceId,targetPairingId:descriptor.pairingId,targetRootId:anchor.walletRootId,targetRevision:1,targetCommitment:'f'.repeat(64),targetNullifier:'1'.repeat(64),maximumAmountAtomic:'10',recipient:'0x'+'6'.repeat(40)};
  saved.authority.withdrawals=[{authority:authority(brokerDescriptor),systemIndex:0,journalPath:join(directory,'broker','journal.vault'),historicalWithdrawal:binding,terminalWithdrawal:{profile:'DEVICE_PAGED_ORIGINAL_HISTORICAL_WITHDRAWAL_TERMINAL_V5',jobId:'host-terminal-withdraw',transactionHash:'0x'+'7'.repeat(64),blockHash:'0x'+'8'.repeat(64),blockNumber:'100',nullifier:binding.targetNullifier,currentPairingId:binding.currentPairingId}}];
 }
 return saved;
}

for(const profile of ['ORIGINAL_PAGED_PUBLIC_SOURCE_CATALOGUE_V5','ORIGINAL_PAGED_PUBLIC_POOL_GROUP_V6'])for(const phase of ['OPENING','ACTIVE'])test('Storage catalogue child tokens retain Original ancestry and terminal brokers: '+profile+' '+phase,{timeout:30000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-refill-storage-catalogue-')),location={directory,password:'inert-refill-supervisor-password-32-bytes'},saved=collectionSnapshot(directory,profile);let owner;
 try{
  if(phase==='ACTIVE'){
   const input=join(directory,'fixture-input.json'),result=join(directory,'fixture-checkpoint.json');await writeFile(input,JSON.stringify({location,descriptor,snapshot:saved,result}),{mode:0o600});await promisify(execFile)(process.execPath,[fileURLToPath(new URL('paged-public-refill-storage-active-child-v16.mjs',import.meta.url)),input],{timeout:15000,maxBuffer:8192});
  }else{owner=await R.createOriginalPagedPublicSupervisorRetentionV4(location,descriptor);await owner.capture(saved);await owner.close();owner=await R.openOriginalPagedPublicSupervisorRetentionV4(location);await owner.close();}
  const before=await readFile(join(directory,'supervisor.vault'));owner=await R.openOriginalPagedPublicRefillRecoveryStorageV16(location);const checkpoint=owner.checkpoint();
  const parent=await owner.issueComponent('authority');assert.throws(()=>R.consumeOriginalPagedPublicRefillRecoveryComponentV16(parent,'authority'),/STORAGE_SPLIT_REQUIRED/);assert.throws(()=>R.splitOriginalPagedPublicCatalogueAuthorityRecoveryV5(parent),/REFILL_STORAGE_ONLY/);assert.throws(()=>R.splitOriginalPagedPublicRefillRecoveryAuthorityV16({...parent}),/ORIGINAL_REFILL_STORAGE_COLLECTION/);
  const split=R.splitOriginalPagedPublicRefillRecoveryAuthorityV16(parent);assert.equal(split.entries.length,2);assert.equal(split.withdrawals.length,saved.authority.withdrawals?.length??0);assert.throws(()=>R.splitOriginalPagedPublicRefillRecoveryAuthorityV16(parent),/ORIGINAL_REFILL_STORAGE_COLLECTION/);
  for(const name of ['native','deployment','provider'])assert.deepEqual(R.consumeOriginalPagedPublicRefillRecoveryComponentV16(await owner.issueComponent(name),name),saved[name]);
  await assert.rejects(owner.complete(),/OPEN_COMPONENTS/);
  const rows=[...split.entries,...split.withdrawals],retained=[...saved.authority.entries,...(saved.authority.withdrawals??[])];
  for(const [index,row]of rows.entries()){
   const original=retained[index],selection=R.readOriginalPagedPublicRefillRecoveryAuthoritySelectionV16(row.token);
   assert.equal(selection.journalPath,original.journalPath);assert.equal(selection.systemIndex,original.systemIndex);assert.deepEqual(selection.sourceLineage,original.sourceLineage??null);assert.deepEqual(selection.sourceAnchor,original.sourceAnchor??null);
   if(original.historicalWithdrawal){assert.deepEqual(selection.historicalWithdrawal,original.historicalWithdrawal);assert.deepEqual(selection.terminalWithdrawal,original.terminalWithdrawal);assert.equal(selection.historical,true);}else{assert.equal(selection.historical,original.sourceLineage===null);assert.equal(selection.sourceDepth,original.sourceLineage===null?1:2);}
   assert.throws(()=>R.readOriginalPagedPublicRefillRecoveryAuthoritySelectionV16({...row.token}),/ORIGINAL_REFILL_STORAGE_CHILD/);assert.throws(()=>R.consumeOriginalPagedComponentRecoveryV3(row.token,'authority'),/REFILL_STORAGE_ONLY/);assert.throws(()=>R.consumeOriginalPagedPublicRefillRecoveryComponentV16(row.token,'native'),/ORIGINAL_REFILL_STORAGE_TOKEN/);
   assert.deepEqual(R.consumeOriginalPagedPublicRefillRecoveryComponentV16(row.token,'authority'),{authority:original.authority,journalPath:original.journalPath});assert.throws(()=>R.readOriginalPagedPublicRefillRecoveryAuthoritySelectionV16(row.token),/ORIGINAL_REFILL_STORAGE_CHILD/);assert.throws(()=>R.consumeOriginalPagedPublicRefillRecoveryComponentV16(row.token,'authority'),/ORIGINAL_REFILL_STORAGE_TOKEN/);
   if(index<rows.length-1)await assert.rejects(owner.complete(),/OPEN_COMPONENTS/);
  }
  await owner.complete();assert.deepEqual(owner.checkpoint(),checkpoint);assert.deepEqual(await readFile(join(directory,'supervisor.vault')),before);
  await owner.publishActivationBaseV4(saved);assert.equal(owner.checkpoint().generation,checkpoint.generation);await owner.capture(saved);await owner.close();owner=null;
 }finally{await owner?.close();await rm(directory,{recursive:true,force:true});}
});
