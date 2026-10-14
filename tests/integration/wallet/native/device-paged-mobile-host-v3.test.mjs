/** Software-custody loader regression; no chain, proof or funding is started. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openOriginalPagedMobileHostV3,PagedHostStoreV3} from './device-paged-mobile-host-v3.mjs';

test('Paged Node host loads original Expo provider bodies, authenticates real AES and closes software custody',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-original-host-loader-'));
 let host;
 try{
  host=await openOriginalPagedMobileHostV3(directory);
  const [owner,graph,vault]=await Promise.all([
   import('../../../../apps/mobile/src/api/device-paged-owner-transit-v3.mjs'),
   import('../../../../apps/mobile/src/api/device-paged-graph-transit-v3.mjs'),
   import('../../../../apps/mobile/src/custody/device-paged-note-vault-v3.ts'),
  ]);
  assert.equal(typeof owner.sealDevicePagedWitnessV3,'function');
  assert.equal(typeof vault.createDevicePagedGraphNoteVaultV3,'function');
  const recipient=await graph.createDevicePagedGraphReplyRecipientV3('loader-regression');
  assert.equal(Buffer.from(recipient.publicKey,'base64').length,44);
  graph.closeDevicePagedGraphReplyRecipientV3(recipient);
  // These are the original mobile provider export bodies. Only the explicitly
  // software HOST port implements Expo's AES contract, using Node/OpenSSL.
  // No provider, chain, proof, balance or financial authorization is replaced.
  const [pagedCrypto,nativeCrypto]=await Promise.all([
   import('../../../../apps/mobile/src/api/device-paged-graph-crypto-provider-v3.ts'),
   import('../../../../apps/mobile/src/api/native-private-crypto-provider-v2.ts'),
  ]);
  const keyBytes=await pagedCrypto.getRandomBytesAsync(32),nonce=await nativeCrypto.getRandomBytesAsync(12),clear=Uint8Array.from(Buffer.from('original HOST encrypted custody')),aad=Uint8Array.from(Buffer.from('original-host/custody'));
  const encryptionKey=await nativeCrypto.AESEncryptionKey.import(keyBytes),decryptionKey=await pagedCrypto.AESEncryptionKey.import(keyBytes);let sealed;
  try{
   sealed=await nativeCrypto.aesEncryptAsync(clear,encryptionKey,{nonce:{bytes:nonce},tagLength:16,additionalData:aad});
   const combined=Buffer.from(await sealed.combined('base64'),'base64');
   const restored=await pagedCrypto.aesDecryptAsync(pagedCrypto.AESSealedData.fromCombined(combined,{ivLength:12,tagLength:16}),decryptionKey,{output:'bytes',additionalData:aad});
   assert.deepEqual(restored,clear);restored.fill(0);
   await assert.rejects(pagedCrypto.aesDecryptAsync(pagedCrypto.AESSealedData.fromCombined(combined,{ivLength:12,tagLength:16}),decryptionKey,{output:'bytes',additionalData:Uint8Array.from(Buffer.from('different-custody'))}));
   combined[combined.length-1]^=1;
   await assert.rejects(pagedCrypto.aesDecryptAsync(pagedCrypto.AESSealedData.fromCombined(combined,{ivLength:12,tagLength:16}),decryptionKey,{output:'bytes',additionalData:aad}));combined.fill(0);
  }finally{keyBytes.fill(0);nonce.fill(0);clear.fill(0);aad.fill(0);}
  // Same real wallet session seals only a ROOT belonging to this HOST. The
  // exact software DATA port may retain its ciphertext, never an arbitrary
  // label or a caller's differently scoped ROOT envelope.
  const P=await import('../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs'),W=await import('../../../../apps/mobile/src/custody/wallet-session-v1.ts'),sha=value=>createHash('sha256').update(value).digest('hex');
  const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://127.0.0.1:9444',pairingId:'original-host-session-loader',devicePublicKey:host.devicePublicKey,deadlineMs:P.devicePagedNowV3()+3600000,chainId:'31337',...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(name=>[name,sha(name)])),...Object.fromEntries(['pool','state','native','math'].map((name,i)=>[name,'0x'+String(i+1).repeat(40)]))});
  await W.openWalletSessionV1();let held;try{held=await vault.createDevicePagedGraphNoteVaultV3(descriptor);const first=await held.summary();assert.equal((await held.summary()).rootId,first.rootId);await assert.rejects(()=>PagedHostStoreV3.getItemAsync('caller-generic-label',{}));const options={keychainAccessible:6,keychainService:'org.lianum.wallet.session.sealed-root.v1'};await assert.rejects(()=>PagedHostStoreV3.setItemAsync('lianum.wallet.session.sealed-root.v1.'+sha('unrelated'),JSON.stringify({format:'LIANUM_WALLET_SESSION_SEALED_ROOT_V1',devicePublicKey:host.devicePublicKey,scopeSHA256:sha('unrelated'),legacyRootSHA256:sha('another-root'),sealed:'YQ=='}),options),/ORIGINAL_SEALED_ROOT/);}finally{await held?.close();W.lockWalletSessionV1();}
  await host.close();
  await assert.rejects(graph.createDevicePagedGraphReplyRecipientV3('after-close'),/PAGED_MOBILE_HOST_CLOSED/);
  await assert.rejects(pagedCrypto.getRandomBytesAsync(32),/PAGED_MOBILE_HOST_CLOSED/);
  await assert.rejects(nativeCrypto.AESEncryptionKey.import(new Uint8Array(32)),/PAGED_MOBILE_HOST_CLOSED/);
  await assert.rejects(pagedCrypto.aesDecryptAsync(sealed,decryptionKey,{output:'bytes',additionalData:new Uint8Array()}),/PAGED_MOBILE_HOST_CLOSED/);
  await assert.rejects(nativeCrypto.aesEncryptAsync(new Uint8Array(),encryptionKey,{nonce:{bytes:new Uint8Array(12)},tagLength:16,additionalData:new Uint8Array()}),/PAGED_MOBILE_HOST_CLOSED/);
 }finally{await host?.close();await rm(directory,{recursive:true,force:true});}
});
