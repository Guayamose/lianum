/** Software-custody interop only: actual routed Vault/AES/backup bodies.
 * No backend, proof worker, protocol deployment or financial call is started. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {openOriginalPagedMobileHostV3,PagedHostStoreV3,retainOriginalPagedMobileUniswapCopyV3} from './device-paged-mobile-host-v3.mjs';
import {normalizeDevicePagedUniswapIntentV3,normalizeDevicePagedNativePageRequestV3} from '@lianum/mobile-protocol/device/paged-graph-v3';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
const sha=value=>createHash('sha256').update(value).digest('hex');
test('actual routed D27 custody fits strict host ports; sealed copy joins same root and typed intent',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-uniswap-host-'));let host,vault,prepared,clear,forgedClear;
 try{
  host=await openOriginalPagedMobileHostV3(directory);
  const {createPrivateWalletStateV1}=await import('../../../../apps/mobile/src/state/private-wallet-state-v1.mjs'),{walletPortfolioGroupsV1}=await import('../../../../apps/mobile/src/state/wallet-portfolio-v1.mjs');const actor=createPrivateWalletStateV1();assert.deepEqual(walletPortfolioGroupsV1(actor.snapshot().rows).assets,[]);assert.equal(actor.snapshot().aggregateBalance,null);
  const {createDeviceExternalFlatRoutedNoteVaultV1}=await import('../../../../apps/mobile/src/custody/device-external-flat-note-vault-v1.ts'),{unsealDeviceCustodyBackupV1,sealDeviceCustodyBackupV1}=await import('../../../../apps/mobile/src/custody/sealed-custody-backup-v1.mjs');
  const poolTerms=Object.fromEntries(['poolCodeHash','scope','policy','assetIdentity','assetCodeHash','genesis','domainCommitment','hubCodeHash','hubDomain','ledgerNamespace'].map(key=>[key,sha(key)]));Object.assign(poolTerms,{pool:'12'.repeat(20),asset:'23'.repeat(20),hub:'34'.repeat(20)});
  const descriptor=P.normalizeExternalFlatDescriptorV1({profile:P.DEVICE_EXTERNAL_FLAT_SHARE_V1,origin:'https://127.0.0.1:9445',pairingId:'45'.repeat(32),devicePublicKey:host.devicePublicKey,lifetime:'56'.repeat(32),poolTerms,assetMetadata:{kind:'ERC20',symbol:'OUT',decimals:18}});
  vault=await createDeviceExternalFlatRoutedNoteVaultV1(descriptor);prepared=await vault.prepareDeposit(descriptor,'67'.repeat(20),'100','1000','8200');const summary=await vault.summary();assert.equal(summary.commitment,prepared.draft.statement.output);assert.equal(summary.rootId,prepared.draft.rootId);assert.equal(summary.jobs.length,0);
  const passphrase=randomBytes(32).toString('hex'),backup=await vault.exportBackup(passphrase,host.devicePublicKey),binding={profile:'DEVICE_EXTERNAL_FLAT_CUSTODY_V1',devicePublicKey:host.devicePublicKey,routeSHA256:sha(JSON.stringify(descriptor))};
  clear=await unsealDeviceCustodyBackupV1(backup,passphrase,binding);const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(clear));assert.equal(JSON.parse(payload.envelope).rootId,summary.rootId);assert.deepEqual(payload.descriptor,descriptor);
  assert.notEqual(sha(Buffer.from(payload.rootKey,'hex')),summary.rootId,'ExternalFlat rootId is independently generated, not SHA256(ROOT)');
  assert.deepEqual(await vault.verifyBackupCopy(backup,passphrase,host.devicePublicKey),await vault.recoveryCheckpoint());
  payload.rootKey=randomBytes(32).toString('hex');forgedClear=new TextEncoder().encode(JSON.stringify(payload));const forged=await sealDeviceCustodyBackupV1(forgedClear,passphrase,binding);forgedClear.fill(0);forgedClear=null;payload.rootKey=null;clear.fill(0);clear=null;
  await assert.rejects(()=>vault.verifyBackupCopy(forged,passphrase,host.devicePublicKey),/RECOVERY_COPY_CHANGED/,'an authenticated copy with another ROOT must fail');
  const reordered=Object.fromEntries(Object.entries(descriptor).reverse());reordered.poolTerms=Object.fromEntries(Object.entries(descriptor.poolTerms).reverse());reordered.assetMetadata=Object.fromEntries(Object.entries(descriptor.assetMetadata).reverse());assert.notEqual(JSON.stringify(reordered),JSON.stringify(descriptor));
  const retained=retainOriginalPagedMobileUniswapCopyV3(host,reordered,backup,passphrase);assert.equal(retained.routeSHA256,binding.routeSHA256);assert.equal(retained.backupSHA256,sha(backup));assert.equal(retained.softwareCustodyOnly,true);
  assert.throws(()=>retainOriginalPagedMobileUniswapCopyV3(host,{...reordered,poolTerms:{...reordered.poolTerms,scope:'ab'.repeat(32)}},backup,passphrase));assert.throws(()=>retainOriginalPagedMobileUniswapCopyV3(host,{...reordered,privateKey:'forbidden'},backup,passphrase));
  await assert.rejects(()=>unsealDeviceCustodyBackupV1(backup,'a different secret passphrase',binding),/AUTHENTICATION/);
  await assert.rejects(()=>PagedHostStoreV3.setItemAsync('lianum.external-flat.root.v1','caller-key',{requireAuthentication:true,keychainAccessible:6}));
  const intent=normalizeDevicePagedUniswapIntentV3({kind:'UNISWAP_V3_EXACT_OUTPUT_SINGLE',depositJobId:'78'.repeat(32),rootId:summary.rootId,outputCommitment:summary.commitment,maximumInput:'200',outputAmount:'100',validFrom:'1000',validUntil:'8200'});
  const page={preparation:{preparationId:'paged-page-'+'89'.repeat(16),pageIndex:'0',nodes:[{id:'swap',ordinal:'0',chainDomain:sha('chain'),evidencePolicy:sha('policy'),amount:'17',receiptKeyCommitment:sha('key'),receiptRho:sha('rho'),payoutCommitment:sha('payout'),intent}]},settleBefore:'9000'};
  assert.deepEqual(normalizeDevicePagedNativePageRequestV3(page).preparation.nodes[0].intent,intent);assert.equal(normalizeDevicePagedNativePageRequestV3(page).preparation.nodes[0].amount,'17');
  assert.throws(()=>normalizeDevicePagedUniswapIntentV3({...intent,privateKey:'caller-key'}));assert.throws(()=>normalizeDevicePagedNativePageRequestV3({...page,settleBefore:'8199'}));assert.throws(()=>normalizeDevicePagedUniswapIntentV3({...intent,outputAmount:'0'}));
  P.externalFlatWipeV1(prepared.witness);prepared=await vault.prepareDeposit(descriptor,'67'.repeat(20),'100','1000','8200');assert.equal(prepared.draft.statement.output,summary.commitment,'same prepared opening remains');
  await assert.rejects(()=>vault.verifyBackupCopy(backup,passphrase,host.devicePublicKey),/RECOVERY_COPY_CHANGED/,'a prior encrypted revision cannot authorize the current handoff');
  const currentBackup=await vault.exportBackup(passphrase,host.devicePublicKey);assert.deepEqual(await vault.verifyBackupCopy(currentBackup,passphrase,host.devicePublicKey),await vault.recoveryCheckpoint());
  const preserved=await vault.recoveryCheckpoint();P.externalFlatWipeV1(prepared.witness);prepared=null;await vault.close();vault=await createDeviceExternalFlatRoutedNoteVaultV1(descriptor);assert.deepEqual(await vault.recoveryCheckpoint(),preserved,'same target custody namespace survives orderly reopening');assert.equal((await vault.summary()).commitment,summary.commitment);assert.deepEqual(await vault.verifyBackupCopy(currentBackup,passphrase,host.devicePublicKey),preserved);
 }finally{P.externalFlatWipeV1(prepared?.witness);clear?.fill(0);forgedClear?.fill(0);await vault?.close();await host?.close();await rm(directory,{recursive:true,force:true});}
});
