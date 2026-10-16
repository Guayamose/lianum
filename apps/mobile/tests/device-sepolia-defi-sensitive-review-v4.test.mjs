/** Session custody and actual SDK/Vault boundaries. Android biometrics/storage
 * are HOST ports; no APK, RPC, proof producer or financial effect runs here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

test('one sensitive Sepolia DeFi review precedes original note signing and fixes shares/custodian/output; HOST storage/TLS, no prover or chain',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const storage=new Map(),reads=new Map(),keys=new WeakMap(),imports=[],appListeners=new Set();let bios=0,releaseRoot=null;
 const app={currentState:'active',addEventListener(_event,callback){appListeners.add(callback);return{remove(){appListeners.delete(callback);}};}};
 const privateSlot='lianum.owner.secp256k1.v1',publicSlot='lianum.owner.public.v1';
 const count=key=>reads.get(key)??0,sha=value=>createHash('sha256').update(value).digest('hex');
 t.mock.module('expo-secure-store',{exports:{WHEN_UNLOCKED_THIS_DEVICE_ONLY:6,isAvailableAsync:async()=>true,canUseBiometricAuthentication:()=>true,
  async getItemAsync(key,options){reads.set(key,count(key)+1);const value=storage.get(key)??null;if(key===privateSlot)assert.equal(options.requireAuthentication,true);if(releaseRoot&&key===releaseRoot.key){const {gate}=releaseRoot;releaseRoot.started();await gate;}return value;},
  async setItemAsync(key,value,options){if(key===privateSlot||key.endsWith('.root')||key==='lianum.note.root.encryption.v1')assert.equal(options.requireAuthentication,true);if(key.startsWith('lianum.wallet.session.sealed-root.'))assert.notEqual(options.requireAuthentication,true);storage.set(key,value);},
  async deleteItemAsync(key){storage.delete(key);}}});
 t.mock.module('expo-local-authentication',{exports:{hasHardwareAsync:async()=>true,isEnrolledAsync:async()=>true,authenticateAsync:async options=>{bios++;assert.equal(options.biometricsSecurityLevel,'strong');assert.equal(options.disableDeviceFallback,true);return{success:true};}}});
 t.mock.module('react-native',{exports:{Platform:{OS:'android'},AppState:app}});
 t.mock.module('expo-crypto',{exports:{getRandomBytesAsync:async n=>new Uint8Array(randomBytes(n)),
  AESEncryptionKey:{async import(bytes){imports.push(bytes);const key={};keys.set(key,Buffer.from(bytes));return key;}},
  AESSealedData:{fromCombined(bytes,options){assert.ok(bytes instanceof Uint8Array);assert.deepEqual(options,{ivLength:12,tagLength:16});return{bytes:Buffer.from(bytes)};}},
  async aesEncryptAsync(clear,key,options){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keys.get(key),iv);cipher.setAAD(options.additionalData);const combined=Buffer.concat([iv,cipher.update(clear),cipher.final(),cipher.getAuthTag()]);return{combined:async()=>combined.toString('base64')};},
  async aesDecryptAsync(sealed,key,options){const bytes=sealed.bytes,decipher=createDecipheriv('aes-256-gcm',keys.get(key),bytes.subarray(0,12));decipher.setAAD(options.additionalData);decipher.setAuthTag(bytes.subarray(-16));return Uint8Array.from(Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]));}}});
 const signing=await import('../src/custody/signing.mjs'),P=await import('../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs'),C=await import('../../../packages/mobile-protocol/src/device-paged-graph-v3.mjs');
 const W=await import('../src/custody/wallet-session-v1.ts');
 const privateHex='0'.repeat(63)+'1',privateKey=signing.privateKeyFromHex(privateHex),publicKey=signing.devicePublicKey(privateKey);privateKey.fill(0);
 storage.set(privateSlot,privateHex);storage.set(publicSlot,publicKey);
 const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://127.0.0.1:9443',pairingId:'host-wallet-session-v1',devicePublicKey:publicKey,deadlineMs:P.devicePagedNowV3()+9*3600000,chainId:'31337',
  ...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(key=>[key,sha(key)])),
  ...Object.fromEntries(['pool','state','native','math'].map((key,i)=>[key,'0x'+String(i+1).repeat(40)]))});
 t.after(()=>W.lockWalletSessionV1());
 assert.equal(W.walletSessionStatusV1().managed,false);const status=await W.openWalletSessionV1();assert.equal(status.active,true);assert.equal(status.publicKey,publicKey);assert.equal(count(privateSlot),1);assert.equal(bios,0,'the authenticated identity read is the only login biometric');
 await W.openWalletSessionV1();assert.equal(count(privateSlot),1,'opening an active session does not prompt again');


 const E=await import('@lianum/mobile-protocol/device/source-note-v1'),R=await import('@lianum/mobile-protocol/device/sepolia-defi-review-v4'),V=await import('../src/custody/device-external-flat-note-vault-v1.ts'),SDK=await import('../src/api/device-sepolia-defi-shares-api-v4.mjs');
 const d=E.normalizeExternalFlatDescriptorV1({profile:E.DEVICE_EXTERNAL_FLAT_SHARE_V1,origin:'https://lianum.example.test',devicePublicKey:publicKey,pairingId:sha('aave pairing'),lifetime:sha('aave lifetime'),poolTerms:{...Object.fromEntries(['pool','asset','hub'].map((name,i)=>[name,String(i+1).repeat(40)])),...Object.fromEntries(['poolCodeHash','scope','policy','assetIdentity','assetCodeHash','genesis','domainCommitment','hubCodeHash','hubDomain','ledgerNamespace'].map(name=>[name,sha(name)]))},assetMetadata:{kind:'ERC20',symbol:'stataUSDC',decimals:6}}),vault=await V.createDeviceExternalFlatRoutedNoteVaultV1(d);t.after(()=>vault.close());const summary=await vault.summary();assert.equal(summary.commitment,null);const now=Math.floor(Date.now()/1000),review=R.normalizeDeviceSepoliaDefiReviewV4({profile:R.DEVICE_SEPOLIA_DEFI_REVIEW_V4,protocol:'AAVE_STATIC',action:'INVEST',descriptor:d,rootId:summary.rootId,noteRevision:summary.noteRevision,reference:sha('review before signature'),shares:'1000000',maximumInputAtomic:'1001000',minimumAssetsAtomic:null,underlyingReceiver:'0x'+'5'.repeat(40),shareWithdrawalRecipient:'0x'+'6'.repeat(40),validFrom:String(now),validUntil:String(now+600),receiptCommitment:sha('reviewed receipt')});
 let requests=0,issued=0,failAck=true,authorized=null;const http=async(url,options)=>{requests++;const payload=JSON.parse(options.body);assert.equal(options.headers['x-lianum-defi-pairing-id'],d.pairingId);let value;
  if(url.endsWith('/challenges'))value={profile:d.profile,action:'ACCESS',origin:d.origin,pairingId:d.pairingId,devicePublicKey:publicKey,challengeId:sha('challenge'+(++issued)),nonce:sha('nonce'+issued),expiresAt:Date.now()+15000};
  else if(url.endsWith('/defi-read-review'))value={reference:review.reference,state:authorized?'AUTHORIZED':'NOT_ISSUED',review:authorized};
  else if(url.endsWith('/defi-reviews')){assert.equal(bios,1,'sensitive approval has happened before review signing');assert.equal((await vault.summary()).commitment,null,'no note signature/witness existed before review');value={profile:R.DEVICE_SEPOLIA_DEFI_REVIEW_CHALLENGE_V4,review:payload.review,challengeId:sha('financial challenge'),nonce:sha('financial nonce'),expiresAt:Date.now()+15000};}
  else if(url.endsWith('/defi-authorizations')){assert.ok(signing.devicePublicKey(signing.privateKeyFromHex(privateHex))===d.devicePublicKey);assert.equal((await vault.summary()).commitment,null);authorized=payload.challenge.review;value={reference:review.reference,authorized:true,financialNativeMounted:false};if(failAck){failAck=false;throw Error('HOST_LOST_AUTHORIZATION_ACK');}}
  else assert.fail('no proof or financial send is expected in this preparation test');return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
 };
 const api=SDK.createDeviceSepoliaDefiSharesApiV4({descriptor:d,fetchImpl:http});t.after(()=>api.close());
 await assert.rejects(api.prepare({...vault},review),/ORIGINAL_VAULT/);assert.equal(bios,0);assert.equal(requests,0);
 await assert.rejects(api.prepare(vault,review),/LOST_AUTHORIZATION_ACK/);assert.equal(bios,1);assert.equal((await vault.summary()).commitment,null,'lost review response leaves no note signature or witness');
 const token=await api.prepare(vault,review);assert.equal(bios,2,'explicit user retry is a new approval, not an automatic financial signature');assert.equal(authorized.reference,review.reference);const after=await vault.summary();assert.notEqual(after.commitment,null);assert.equal(after.recipient,review.shareWithdrawalRecipient.slice(2));assert.equal(after.amount,review.shares);
 const challenge={profile:R.DEVICE_SEPOLIA_DEFI_REVIEW_CHALLENGE_V4,review,challengeId:sha('second review'),nonce:sha('second nonce'),expiresAt:Date.now()+15000};const approval=await W.approveWalletSessionSepoliaDefiV4(review);const bioBefore=bios;assert.throws(()=>W.signWalletSessionSepoliaDefiReviewV4(approval,{...challenge,review:{...review,underlyingReceiver:'0x'+'7'.repeat(40)}}),/REVIEW_CHANGED/);assert.throws(()=>W.assertWalletSessionSepoliaDefiV4({...approval},review),/AUTHORIZATION/);assert.match(W.signWalletSessionSepoliaDefiReviewV4(approval,challenge),/^[0-9a-f]{128}$/);assert.equal(bios,bioBefore,'the same approval signs its exact challenge without another biometric');W.closeWalletSessionAuthorizationV1(approval);
 // This HOST issuer substitutes only the Source7 Vault's opaque pending-page
 // cap. The actual session's receipt-only classification/signers stay live.
 const receiptCap=Object.freeze(Object.create(null));let receiptLive=true;
 t.mock.module('../src/custody/device-paged-note-vault-v3.ts',{exports:{readDevicePagedSepoliaDefiReceiptPreparationV8:async cap=>{assert.equal(cap,receiptCap);if(!receiptLive)throw Error('HOST_RECEIPT_CLOSED');return{descriptor:{...descriptor,chainId:'11155111',origin:review.descriptor.origin},review,capitalNodeId:'defi-receipt-host',receiptCommitment:review.receiptCommitment};}}});
 const receiptBios=bios;
 await assert.rejects(W.prepareWalletSessionSepoliaDefiReceiptV8(review,{...receiptCap}));
 const receiptApproval=await W.prepareWalletSessionSepoliaDefiReceiptV8(review,receiptCap);
 assert.equal(bios,receiptBios,'an authenticated Source7 receipt preparation uses the open session');
 assert.match(W.signWalletSessionSepoliaDefiReviewV4(receiptApproval,{...challenge,nonce:sha('receipt-only nonce')}),/^[0-9a-f]{128}$/);
 assert.throws(()=>W.assertWalletSessionSepoliaDefiV4(receiptApproval,{...review,action:'REDEEM',maximumInputAtomic:null,minimumAssetsAtomic:'1',receiptCommitment:null}),/REVIEW_CHANGED/);
 assert.throws(()=>W.assertWalletSessionSepoliaMorphoBatchV5(receiptApproval,{}),/AUTHORIZATION/);
 W.closeWalletSessionAuthorizationV1(receiptApproval);receiptLive=false;
 await assert.rejects(W.prepareWalletSessionSepoliaDefiReceiptV8(review,receiptCap),/HOST_RECEIPT_CLOSED/);
 api.close();await assert.rejects(api.submit(token),/REVIEW_BINDING/);W.lockWalletSessionV1();
});
