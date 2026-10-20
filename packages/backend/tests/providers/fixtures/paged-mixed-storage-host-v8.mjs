/** Inert Mixed target/source DATA below the actual child-process Root fixture.
 * Real Sup7, encrypted child/flat/provider journals and original OWNER capsule;
 * no financial Mixed kernel, deployment, signer or payment is created. */
import {createHash,createHmac} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {fixture} from './paged-mixed-host-v7.mjs';
import * as M from '../../../src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs';
import * as Owner from '../../../src/operations/local/device-paged-private-graph-v3.mjs';
import {createDevicePagedOwnerRetentionV3} from '../../../src/operations/local/device-paged-owner-retention-v3.mjs';
import {createPagedNativeProviderStateVaultV3,canonicalPagedProviderDataV3} from '../../../src/providers/paged-native-provider-state-v3.mjs';
import {pagedExpiredMixedWithdrawalPathV10} from '../../../src/operations/recovery/paged-expired-mixed-withdrawal-data-v10.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
export async function prepareMixedStorageHostV8({directory,supervisor,anchor,descriptor,providerPassword}){
 const snapshot=structuredClone(fixture()),mixedJournalPassword='HOST_MIXED_STORAGE_JOURNAL_PASSWORD_V8',flatJournalPassword='HOST_FLAT_STORAGE_JOURNAL_PASSWORD_V8';
 const rootPassword='host-private-journal-password-32bytes',supDir=join(directory,'mixed-supervisor'),mixedDir=join(directory,'mixed-authority'),flatDir=join(directory,'flat-authority'),providerDir=join(directory,'mixed-provider');
 for(const path of [supDir,mixedDir,flatDir,providerDir])await mkdir(path,{mode:0o700});
 const a=snapshot.authority.entries[0].authority;
 for(const key of ['origin','devicePublicKey','chainId','genesis','assetIdentity','manifestSHA256','consumerSHA256'])a.descriptor[key]=descriptor[key];
 // Child has its own original lifetime, which remains live after Root expires.
 a.descriptor.deadlineMs=Date.now()+(process.env.LIANUM_ACTIVE_EXPIRED_BROKER_V10==='1'?2000:3600000);
 if(process.env.LIANUM_ACTIVE_MIXED_NOTES_V36==='1')a.descriptor.poolCodeHash=publicKeccak256(Buffer.from('6000','hex')).toString('hex');
 const ownerPassword=sha('LIANUM/PAGED/OWNER-RETENTION/V3\0'+mixedJournalPassword+'\0'+a.descriptor.pairingId),ownerPath=join(mixedDir,'private-owner.vault'),retention=await createDevicePagedOwnerRetentionV3({path:ownerPath,password:ownerPassword,expected:null},a.descriptor),controller=Owner.createOriginalDevicePagedPrivateGraphV3(a.descriptor),capsule=Owner.retainOriginalDevicePagedPrivateGraphV3(controller);
 try{a.ownerCheckpoint=await retention.commit(capsule);}finally{retention.close();await controller.close();}
 const mixedPath=join(mixedDir,'journal.vault'),mixedRecord=await new Vault(mixedPath).create({schema:'LIANUM_DEVICE_PAGED_OWNER_V3',identity:a.identity,descriptor:a.descriptor,jobs:[],pending:null,graph:null},mixedJournalPassword);a.journalRevision=mixedRecord.revision;a.journalDataSHA256=sha(canonical(mixedRecord.data));snapshot.authority.entries[0].journalPath=mixedPath;
 // Explicit inert HOST broker binding, below the actual protected Sup7 and
 // actual OWNER storage validator. PoP/Original broker birth is tested by the
 // separate coupled Authority fixture; this never issues a financial grant.
 let expiredBrokerV10=null;
 if(process.env.LIANUM_ACTIVE_EXPIRED_BROKER_V10==='1'){
  const brokerId=sha('HOST_EXPIRED_BROKER_V10'),epochId=sha('HOST_NEW_EPOCH_V10'),brokerDescriptor={...a.descriptor,pairingId:'host-expired-storage-broker-v10',deadlineMs:Date.now()+3600000},brokerPath=pagedExpiredMixedWithdrawalPathV10(mixedPath,epochId,brokerId);await mkdir(join(brokerPath,'..'),{recursive:true,mode:0o700});
  const scope={profile:'DEVICE_PAGED_EXPIRED_WITHDRAWAL_SCOPE_V10',brokerId,sourceDescriptor:structuredClone(a.descriptor),sourceIdentity:a.identity,sourceJournalRevision:a.journalRevision,sourceJournalDataSHA256:a.journalDataSHA256,sourceOwnerCheckpointSHA256:sha(canonical(a.ownerCheckpoint)),epochId,policySHA256:sha('HOST_EPOCH_POLICY_V10'),sponsorExpiresAtMs:Date.now()+7200000,maximumDeadlineMs:brokerDescriptor.deadlineMs,targetRootId:sha('HOST_WALLET_ROOT_V10'),targetRevision:1,targetCommitment:sha('HOST_NOTE_V10'),targetNullifier:sha('HOST_NF_V10'),maximumAmountAtomic:'10',recipient:'0x'+'9'.repeat(40),graphOutput:null,sourceJournalPath:mixedPath,sourceOwnerCheckpoint:structuredClone(a.ownerCheckpoint)},brokerIdentity=sha('HOST_BROKER_IDENTITY_V10'),brokerRecord=await new Vault(brokerPath).create({schema:'LIANUM_DEVICE_PAGED_OWNER_V3',identity:brokerIdentity,descriptor:brokerDescriptor,jobs:[],pending:null,graph:null,historicalWithdrawal:scope},mixedJournalPassword),brokerOwnerPath=join(brokerPath,'..','private-owner.vault'),brokerOwner=await createDevicePagedOwnerRetentionV3({path:brokerOwnerPath,password:sha('LIANUM/PAGED/OWNER-RETENTION/V3\0'+mixedJournalPassword+'\0'+brokerDescriptor.pairingId),expected:null},brokerDescriptor),brokerController=Owner.createOriginalDevicePagedPrivateGraphV3(brokerDescriptor);let ownerCheckpoint;
  try{ownerCheckpoint=await brokerOwner.commit(Owner.retainOriginalDevicePagedPrivateGraphV3(brokerController));}finally{brokerOwner.close();await brokerController.close();}
  const row={brokerId,authority:{profile:'DEVICE_PAGED_AUTHORITY_RETAINED_V3',descriptor:brokerDescriptor,identity:brokerIdentity,journalRevision:brokerRecord.revision,journalDataSHA256:sha(canonical(brokerRecord.data)),ownerCheckpoint},historicalWithdrawal:scope,journalPath:brokerPath};snapshot.authority.entries[0].expiredWithdrawalsV10=[row];expiredBrokerV10={path:brokerPath,ownerPath:brokerOwnerPath,row};
 }
 const flat=snapshot.flatAuthority.entries[0],flatPath=join(flatDir,'journal.vault');flat.descriptor.origin=descriptor.origin;flat.descriptor.devicePublicKey=descriptor.devicePublicKey;flat.journalPath=flatPath;const flatRecord=await new Vault(flatPath).create({identity:flat.identity,descriptor:flat.descriptor,targetPlanSHA256:flat.targetPlanSHA256,jobs:[],pending:null},flatJournalPassword);flat.journalRevision=flatRecord.revision;flat.journalDataSHA256=sha(JSON.stringify(flatRecord.data));
 snapshot.deployment=structuredClone(anchor.deployment);snapshot.native=structuredClone(anchor.native);snapshot.authority.parent=structuredClone(anchor.authority);snapshot.authority.parentLocation=structuredClone(anchor.sourceLocation);snapshot.provider.parent=structuredClone(anchor.provider);snapshot.target.plan.keysetId=anchor.native.keysetId;snapshot.target.plan.predecessor=descriptor.pool;
 const source=snapshot.mixedSource.entries[0];source.devicePublicKey=descriptor.devicePublicKey;source.source.plan.keysetId=anchor.native.keysetId;source.source.plan.predecessor=descriptor.pool;
 const provider=snapshot.provider.entries[0].provider,scope=provider.configuration.publicConfiguration.mixedScope;provider.directory=providerDir;provider.configuration.binding.descriptor=structuredClone(a.descriptor);scope.parentProviderIdentity=anchor.provider.checkpoint.providerIdentity;scope.keysetId=anchor.native.keysetId;scope.scopeSHA256=sha('HOST_MIXED_SCOPE');
 const scopePassword=createHmac('sha256',Buffer.from(providerPassword,'hex')).update('LIANUM/PAGED/PUBLIC/MIXED-PROVIDER/4\n'+scope.scopeSHA256).digest('hex'),scopeRecord=await createPagedNativeProviderStateVaultV3(join(providerDir,'provider.vault')).create({publicUniswapScope:scope,HOST_INERT:true},scopePassword);provider.checkpoint={profile:'ORIGINAL_PAGED_NATIVE_PROVIDER_CHECKPOINT_V3',providerIdentity:sha('HOST_MIXED_PROVIDER'),configurationSHA256:sha(canonical(provider.configuration)),revision:scopeRecord.revision,dataSHA256:sha(canonicalPagedProviderDataV3(scopeRecord.data))};
 // Actual Native3 adoption shares the parent's password by construction.
 const input={directory:supDir,password:rootPassword},mixed=await M.adoptOriginalPagedPublicUniswapMixedSupervisorV6(input,supervisor);await mixed.publishActivationBaseV5(snapshot);
 return{input:{...input,mixedJournalPassword,flatJournalPassword},snapshot,mixedPath,flatPath,ownerPath,providerPath:join(providerDir,'provider.vault'),...(expiredBrokerV10?{expiredBrokerV10}:{})};
}
