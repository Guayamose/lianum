/** Inert Mixed target/source DATA below the actual child-process Root fixture.
 * Real Sup7, encrypted child/flat/provider journals and original OWNER capsule;
 * no financial Mixed kernel, deployment, signer or payment is created. */
import {createHash,createHmac} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import {fixture} from './paged-mixed-host-v7.mjs';
import * as M from '../../../src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs';
import * as Owner from '../../../src/operations/local/device-paged-private-graph-v3.mjs';
import {createDevicePagedOwnerRetentionV3} from '../../../src/operations/local/device-paged-owner-retention-v3.mjs';
import {createPagedNativeProviderStateVaultV3,canonicalPagedProviderDataV3} from '../../../src/providers/paged-native-provider-state-v3.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
export async function prepareMixedStorageHostV8({directory,supervisor,anchor,descriptor,providerPassword}){
 const snapshot=structuredClone(fixture()),mixedJournalPassword='HOST_MIXED_STORAGE_JOURNAL_PASSWORD_V8',flatJournalPassword='HOST_FLAT_STORAGE_JOURNAL_PASSWORD_V8';
 const rootPassword='host-private-journal-password-32bytes',supDir=join(directory,'mixed-supervisor'),mixedDir=join(directory,'mixed-authority'),flatDir=join(directory,'flat-authority'),providerDir=join(directory,'mixed-provider');
 for(const path of [supDir,mixedDir,flatDir,providerDir])await mkdir(path,{mode:0o700});
 const a=snapshot.authority.entries[0].authority;
 for(const key of ['origin','devicePublicKey','chainId','genesis','assetIdentity','manifestSHA256','consumerSHA256'])a.descriptor[key]=descriptor[key];
 // Child has its own original lifetime, which remains live after Root expires.
 a.descriptor.deadlineMs=Date.now()+3600000;
 const ownerPassword=sha('LIANUM/PAGED/OWNER-RETENTION/V3\0'+mixedJournalPassword+'\0'+a.descriptor.pairingId),ownerPath=join(mixedDir,'private-owner.vault'),retention=await createDevicePagedOwnerRetentionV3({path:ownerPath,password:ownerPassword,expected:null},a.descriptor),controller=Owner.createOriginalDevicePagedPrivateGraphV3(a.descriptor),capsule=Owner.retainOriginalDevicePagedPrivateGraphV3(controller);
 try{a.ownerCheckpoint=await retention.commit(capsule);}finally{retention.close();await controller.close();}
 const mixedPath=join(mixedDir,'journal.vault'),mixedRecord=await new Vault(mixedPath).create({schema:'LIANUM_DEVICE_PAGED_OWNER_V3',identity:a.identity,descriptor:a.descriptor,jobs:[],pending:null,graph:null},mixedJournalPassword);a.journalRevision=mixedRecord.revision;a.journalDataSHA256=sha(canonical(mixedRecord.data));snapshot.authority.entries[0].journalPath=mixedPath;
 const flat=snapshot.flatAuthority.entries[0],flatPath=join(flatDir,'journal.vault');flat.descriptor.origin=descriptor.origin;flat.descriptor.devicePublicKey=descriptor.devicePublicKey;flat.journalPath=flatPath;const flatRecord=await new Vault(flatPath).create({identity:flat.identity,descriptor:flat.descriptor,targetPlanSHA256:flat.targetPlanSHA256,jobs:[],pending:null},flatJournalPassword);flat.journalRevision=flatRecord.revision;flat.journalDataSHA256=sha(JSON.stringify(flatRecord.data));
 snapshot.deployment=structuredClone(anchor.deployment);snapshot.native=structuredClone(anchor.native);snapshot.authority.parent=structuredClone(anchor.authority);snapshot.authority.parentLocation=structuredClone(anchor.sourceLocation);snapshot.provider.parent=structuredClone(anchor.provider);snapshot.target.plan.keysetId=anchor.native.keysetId;snapshot.target.plan.predecessor=descriptor.pool;
 const source=snapshot.mixedSource.entries[0];source.devicePublicKey=descriptor.devicePublicKey;source.source.plan.keysetId=anchor.native.keysetId;source.source.plan.predecessor=descriptor.pool;
 const provider=snapshot.provider.entries[0].provider,scope=provider.configuration.publicConfiguration.mixedScope;provider.directory=providerDir;provider.configuration.binding.descriptor=structuredClone(a.descriptor);scope.parentProviderIdentity=anchor.provider.checkpoint.providerIdentity;scope.keysetId=anchor.native.keysetId;scope.scopeSHA256=sha('HOST_MIXED_SCOPE');
 const scopePassword=createHmac('sha256',Buffer.from(providerPassword,'hex')).update('LIANUM/PAGED/PUBLIC/MIXED-PROVIDER/4\n'+scope.scopeSHA256).digest('hex'),scopeRecord=await createPagedNativeProviderStateVaultV3(join(providerDir,'provider.vault')).create({publicUniswapScope:scope,HOST_INERT:true},scopePassword);provider.checkpoint={profile:'ORIGINAL_PAGED_NATIVE_PROVIDER_CHECKPOINT_V3',providerIdentity:sha('HOST_MIXED_PROVIDER'),configurationSHA256:sha(canonical(provider.configuration)),revision:scopeRecord.revision,dataSHA256:sha(canonicalPagedProviderDataV3(scopeRecord.data))};
 // Actual Native3 adoption shares the parent's password by construction.
 const input={directory:supDir,password:rootPassword},mixed=await M.adoptOriginalPagedPublicUniswapMixedSupervisorV6(input,supervisor);await mixed.publishActivationBaseV5(snapshot);
 return{input:{...input,mixedJournalPassword,flatJournalPassword},snapshot,mixedPath,flatPath,ownerPath,providerPath:join(providerDir,'provider.vault')};
}
