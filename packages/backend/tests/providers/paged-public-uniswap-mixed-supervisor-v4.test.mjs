/** Actual AEAD/Vault/process fence, original sub-SupNative3 and one-use tokens.
 * Seven component bodies are inert HOST DATA, never financial handles/proofs. */
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';import * as F from '@lianum/mobile-protocol/device/source-note-v1';
import * as M from '../../src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs';
import {consumeOriginalPagedComponentRecoveryV3,readOriginalPagedPublicActivationAnchorV4,createOriginalPagedPublicSupervisorRetentionV4,readOriginalPagedPublicSupervisorParentV6} from '../../src/operations/recovery/paged-runtime-recovery-authority-v3.mjs';
import {descriptor,fixture} from './fixtures/paged-mixed-host-v7.mjs';
test('Mixed7 uses own tokens and real Parent Native3 tokens; complete waits for all original children (HOST component DATA)',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'original-mixed-seven-')),config={directory,password:'HOST_INERT_MIXED_SUPERVISOR_PASSWORD_40'};let sup;
 try{
  sup=await M.createOriginalPagedPublicUniswapMixedSupervisorV4(config,descriptor);const saved=fixture(),bad=structuredClone(saved);bad.authority.entries[0].authority.descriptor.devicePublicKey='04'+'b'.repeat(128);await assert.rejects(sup.capture(bad));const published=await sup.publishActivationBaseV5(saved),activation=await M.readOriginalPagedPublicUniswapMixedActivationV5(published.mixedActivation);assert.deepEqual(activation,[{descriptor:saved.authority.entries[0].authority.descriptor,journalPath:saved.authority.entries[0].journalPath,sourceIndex:0}]);assert.deepEqual(await readOriginalPagedPublicActivationAnchorV4(published.parentActivation),[{descriptor,journalPath:saved.authority.parentLocation.journalPath,systemIndex:0}]);await assert.rejects(M.readOriginalPagedPublicUniswapMixedActivationV5({...published.mixedActivation}),/ORIGINAL_ACTIVATION_ACK/);assert.throws(()=>M.consumeOriginalPagedPublicUniswapMixedComponentV4(published.mixedActivation,'mixedAuthority'),/ORIGINAL_TOKEN/);await sup.capture(saved);await assert.rejects(M.readOriginalPagedPublicUniswapMixedActivationV5(published.mixedActivation),/ACTIVATION_HIGHWATER/);await sup.close();sup=await M.openOriginalPagedPublicUniswapMixedSupervisorV4(config);
  const names=['deployment','target','mixedSource','flatAuthority','authority','provider','native'],issued={};for(const n of names)issued[n]=await sup.issueComponent(n);
  assert.throws(()=>consumeOriginalPagedComponentRecoveryV3(issued.target,'deployment'),/ORIGINAL_OPEN_TOKEN/);assert.throws(()=>M.consumeOriginalPagedPublicUniswapMixedComponentV4({...issued.target},'target'),/ORIGINAL_TOKEN/);assert.deepEqual(M.consumeOriginalPagedPublicUniswapMixedComponentV4(issued.target,'target'),saved.target);assert.throws(()=>M.consumeOriginalPagedPublicUniswapMixedComponentV4(issued.target,'target'),/ORIGINAL_TOKEN/);
  for(const n of ['mixedSource','flatAuthority']){const children=M.splitOriginalPagedPublicUniswapMixedCollectionV4(issued[n],n);assert.equal(children.length,1);assert.deepEqual(M.consumeOriginalPagedPublicUniswapMixedComponentV4(children[0],n),n==='mixedSource'?saved[n].entries[0].source:saved[n].entries[0]);}
  for(const n of ['authority','provider']){const split=await sup.splitParentAndMixed(issued[n],n);assert.deepEqual(consumeOriginalPagedComponentRecoveryV3(split.parentToken,n),saved[n].parent);const child=split.entries[0].token;assert.deepEqual(M.consumeOriginalPagedPublicUniswapMixedComponentV4(child,n==='authority'?'mixedAuthority':'providerScope'),n==='authority'?{authority:saved[n].entries[0].authority,journalPath:saved[n].entries[0].journalPath}:{...saved[n].entries[0].provider,emptyReplacementRecoveryV9:true});}
  await assert.rejects(sup.complete(),/OPEN_COMPONENTS/);assert.deepEqual(consumeOriginalPagedComponentRecoveryV3(issued.native,'native'),saved.native);assert.deepEqual(consumeOriginalPagedComponentRecoveryV3(issued.deployment,'deployment'),saved.deployment);await sup.complete();assert.equal(sup.checkpoint().phase,'ACTIVE');assert.equal(sup.checkpoint().generation,1);
 }finally{await sup?.close();await rm(directory,{recursive:true,force:true});}
});
test('Mixed adoption retains the actual Native3 parent identity and directory across capture/reopening; copied parents cannot adopt',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'original-mixed-adoption-')),password='HOST shared actual Original supervisor password 12345',parentInput={directory:join(directory,'existing-parent'),password},mixedInput={directory:join(directory,'new-mixed'),password};let parent,sup;
 try{
  await mkdir(parentInput.directory,{mode:0o700});await mkdir(mixedInput.directory,{mode:0o700});parent=await createOriginalPagedPublicSupervisorRetentionV4(parentInput,descriptor);const before=await readOriginalPagedPublicSupervisorParentV6(parent);
  await assert.rejects(M.adoptOriginalPagedPublicUniswapMixedSupervisorV6(mixedInput,{...parent}),/ORIGINAL_PARENT/);
  await assert.rejects(M.adoptOriginalPagedPublicUniswapMixedSupervisorV6({...mixedInput,password:'WRONG shared supervisor password 123456'},parent));
  assert.deepEqual(await readOriginalPagedPublicSupervisorParentV6(parent),before,'rejected adoption does not close or reset the real parent');
  sup=await M.adoptOriginalPagedPublicUniswapMixedSupervisorV6(mixedInput,parent);const saved=fixture();await sup.publishActivationBaseV5(saved);await sup.capture(saved);await sup.close();await assert.rejects(readOriginalPagedPublicSupervisorParentV6(parent));
  sup=await M.openOriginalPagedPublicUniswapMixedSupervisorV4(mixedInput);const deployment=await sup.issueComponent('deployment');assert.deepEqual(consumeOriginalPagedComponentRecoveryV3(deployment,'deployment'),saved.deployment);
  const {Vault}=await import('@lianum/engine/crypto/vault');const retained=await new Vault(join(parentInput.directory,'supervisor.vault')).read(password);assert.equal(retained.data.identity,before.checkpoint.identity);assert.equal(retained.data.phase,'OPENING');assert.equal(retained.data.generation,before.checkpoint.generation,'adoption does not reset or increment the parent generation');
 }finally{await sup?.close();await parent?.close();await rm(directory,{recursive:true,force:true});}
});

test('captured Mixed read capabilities preserve both supervisors and cannot become financial tokens',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'original-mixed-read-')),input={directory,password:'HOST captured Mixed read supervisor password 12345678'};let sup,readSup;
 try{
  const saved=fixture();sup=await M.createOriginalPagedPublicUniswapMixedSupervisorV4(input,descriptor);await sup.capture(saved);await sup.close();
  const before=await M.readOriginalPagedPublicUniswapMixedRecoveryModeV6(input);readSup=await M.openOriginalPagedPublicUniswapReadRecoverySupervisorV6(input);
  assert.deepEqual(await readSup.sourceDescriptors(),[saved.authority.entries[0].authority.descriptor]);assert.deepEqual(await readSup.parent.sourceDescriptors(),[descriptor]);
  assert.deepEqual(await readSup.flatDescriptors(),[saved.flatAuthority.entries[0].descriptor]);
  await assert.rejects(readSup.issueFlat('f'.repeat(64)),/NOT_CAPTURED/);
  const flatToken=await readSup.issueFlat(saved.flatAuthority.entries[0].descriptor.pairingId);
  await assert.rejects(M.consumeOriginalPagedPublicUniswapFlatReadV8({...flatToken}),/ORIGINAL_TOKEN/);
  assert.throws(()=>M.consumeOriginalPagedPublicUniswapMixedComponentV4(flatToken,'flatAuthority'),/ORIGINAL_TOKEN/);
  assert.throws(()=>consumeOriginalPagedComponentRecoveryV3(flatToken,'native'),/ORIGINAL_OPEN_TOKEN/);
  const flatReader=await M.consumeOriginalPagedPublicUniswapFlatReadV8(flatToken);await assert.rejects(M.consumeOriginalPagedPublicUniswapFlatReadV8(flatToken),/ORIGINAL_TOKEN/);
  const flatCapture=await M.readOriginalPagedPublicUniswapFlatReadV8(flatReader);assert.deepEqual(flatCapture.authority,saved.flatAuthority.entries[0]);assert.deepEqual(flatCapture.target,saved.target);
  const flatSource=await M.readOriginalPagedPublicUniswapFlatValidationReaderV8(flatReader);assert.equal(M.isOriginalPagedPublicUniswapSourceReadReaderV6(flatSource),true);
  await assert.rejects(readSup.issueFlat(saved.flatAuthority.entries[0].descriptor.pairingId),/ALREADY_ISSUED/);
  const token=await readSup.issueSource(saved.authority.entries[0].authority.descriptor.pairingId);
  await assert.rejects(M.consumeOriginalPagedPublicUniswapSourceReadV6({...token}),/ORIGINAL_TOKEN/);
  assert.throws(()=>M.consumeOriginalPagedPublicUniswapMixedComponentV4(token,'target'),/ORIGINAL_TOKEN/);
  assert.throws(()=>consumeOriginalPagedComponentRecoveryV3(token,'native'),/ORIGINAL_OPEN_TOKEN/);
  const reader=await M.consumeOriginalPagedPublicUniswapSourceReadV6(token);await assert.rejects(M.consumeOriginalPagedPublicUniswapSourceReadV6(token),/ORIGINAL_TOKEN/);
  const scope=await M.readOriginalPagedPublicUniswapSourceReadV6(reader);assert.equal(scope.composition,'PUBLIC_SEPOLIA_UNISWAP_MIXED_V6');assert.equal(scope.supervisor.phase,'CAPTURED');
  assert.deepEqual((await M.readOriginalPagedPublicUniswapSourceReadBindingV6(reader)).uniswap.source,saved.mixedSource.entries[0].source);
  await readSup.close();await assert.rejects(M.readOriginalPagedPublicUniswapSourceReadV6(reader),/ORIGINAL_READER/);await assert.rejects(M.readOriginalPagedPublicUniswapFlatReadV8(flatReader),/ORIGINAL_READER/);assert.equal(M.isOriginalPagedPublicUniswapSourceReadReaderV6(flatSource),false);
  assert.deepEqual(await M.readOriginalPagedPublicUniswapMixedRecoveryModeV6(input),before);
 }finally{await readSup?.close();await sup?.close();await rm(directory,{recursive:true,force:true});}
});

test('Mixed ACTIVE recovery rejects the live Original parent and unanchored or copied state',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'original-mixed-active-')),input={directory,password:'HOST actual Mixed ACTIVE supervisor password 123456789'};let sup;
 try{
  sup=await M.createOriginalPagedPublicUniswapMixedSupervisorV4(input,descriptor);
  await assert.rejects(M.recoverOriginalPagedPublicUniswapMixedActivationV7(input),/PAGED_PROCESS_FENCE_BUSY/);
  await sup.close();sup=null;
  await assert.rejects(M.recoverOriginalPagedPublicUniswapMixedActivationV7(input),/ACTIVE_RECOVERY_ANCHOR_REQUIRED/);
 }finally{await sup?.close();await rm(directory,{recursive:true,force:true});}
});

test('renewed EMPTY mixed capture preserves its authenticated lineage and immutable provider birth in one-use child tokens (HOST DATA)',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'original-mixed-empty-lineage-')),input={directory,password:'HOST EMPTY lineage supervisor password 12345678'};let sup;
 try{
  const saved=fixture(),entry=saved.authority.entries[0],old=structuredClone(entry.authority.descriptor),rootJournalPath=entry.journalPath,lineage={profile:'ORIGINAL_PAGED_EMPTY_SOURCE_REPLACEMENT_V9',generation:1,rootJournalPath,predecessor:{journalPath:rootJournalPath,identity:'1'.repeat(64),descriptor:old,journalRevision:0,journalDataSHA256:'2'.repeat(64),ownerCheckpoint:{profile:'DEVICE_PAGED_OWNER_DURABLE_CHECKPOINT_V3',descriptorSHA256:'3'.repeat(64),revision:0,dataSHA256:'4'.repeat(64),public:{}}},financial:{epochId:'5'.repeat(64),policySHA256:'6'.repeat(64),expiresAt:old.deadlineMs+3600000,maximumSourcesPerWallet:'2'},emptyLedger:{blockHash:'0x'+'7'.repeat(64),blockNumber:'1',leafCount:'0',backedAmount:'0',liveReservations:'0',balanceAtomic:'0'}};
  entry.authority.descriptor={...old,pairingId:'host-renewed-empty-pairing',deadlineMs:old.deadlineMs+60000};entry.journalPath='/HOST/mixed/renewals/1/journal.vault';entry.emptyReplacementV9=lineage;
  sup=await M.createOriginalPagedPublicUniswapMixedSupervisorV4(input,descriptor);const bad=structuredClone(saved);bad.authority.entries[0].journalPath='/HOST/mixed/renewals/2/journal.vault';await assert.rejects(sup.capture(bad),/EMPTY_REPLACEMENT_PATH/);await sup.capture(saved);await sup.close();sup=await M.openOriginalPagedPublicUniswapMixedSupervisorV4(input);
  const group=await sup.issueComponent('authority'),parts=await sup.splitParentAndMixed(group,'authority'),child=parts.entries[0].token,peek=M.readOriginalPagedPublicUniswapMixedAuthorityBirthV9(child);assert.deepEqual(peek.emptyReplacementV9,lineage);assert.equal(peek.journalPath,entry.journalPath);assert.throws(()=>M.readOriginalPagedPublicUniswapMixedAuthorityBirthV9({...child}),/ORIGINAL_AUTHORITY_BIRTH/);assert.deepEqual(M.consumeOriginalPagedPublicUniswapMixedComponentV4(child,'mixedAuthority'),peek);assert.throws(()=>M.readOriginalPagedPublicUniswapMixedAuthorityBirthV9(child),/ORIGINAL_AUTHORITY_BIRTH/);
 }finally{await sup?.close();await rm(directory,{recursive:true,force:true});}
});
