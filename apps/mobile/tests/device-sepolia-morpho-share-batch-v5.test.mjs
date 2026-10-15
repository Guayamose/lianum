/** Session custody and actual SDK/Vault boundaries. Android biometrics/storage
 * are HOST ports; no APK, RPC, proof producer or financial effect runs here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

test('one aggregate Morpho approval binds six original custodies and fences lost replies and cancellation; HOST storage/TLS, no prover or chain',async t=>{
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


 const E=await import('@lianum/mobile-protocol/device/source-note-v1'),R=await import('@lianum/mobile-protocol/device/sepolia-defi-review-v4'),V=await import('../src/custody/device-external-flat-note-vault-v1.ts'),Batch=await import('@lianum/mobile-protocol/device/sepolia-morpho-batch-review-v5'),Plan=await import('@lianum/mobile-protocol/device/sepolia-defi-share-plan-v4'),SDK=await import('../src/api/device-sepolia-morpho-share-batch-api-v5.mjs');
 const plan=Plan.planDeviceSepoliaMorphoShareNotesV4({totalSharesAtomic:'100000000000000000000',maximumNodes:256}),entries=[],notes=[],vaults=[];
 const now=Math.floor(Date.now()/1000);
 for(const part of plan.notes){const d=E.normalizeExternalFlatDescriptorV1({profile:E.DEVICE_EXTERNAL_FLAT_SHARE_V1,origin:'https://lianum.example.test',devicePublicKey:publicKey,pairingId:sha('morpho pairing '+part.id),lifetime:sha('morpho lifetime '+part.id),poolTerms:{...Object.fromEntries(['pool','asset','hub'].map((name,index)=>[name,String(index+1).repeat(40)])),...Object.fromEntries(['poolCodeHash','scope','policy','assetIdentity','assetCodeHash','genesis','domainCommitment','hubCodeHash','hubDomain','ledgerNamespace'].map(name=>[name,sha(name)]))},assetMetadata:{kind:'ERC20',symbol:'mvUSDC',decimals:18}}),vault=await V.createDeviceExternalFlatRoutedNoteVaultV1(d),summary=await vault.summary();vaults.push(vault);t.after(()=>vault.close());entries.push({id:part.id,vault});notes.push({id:part.id,review:R.normalizeDeviceSepoliaDefiReviewV4({profile:R.DEVICE_SEPOLIA_DEFI_REVIEW_V4,protocol:'MORPHO_V2',action:'INVEST',descriptor:d,rootId:summary.rootId,noteRevision:summary.noteRevision,reference:sha('review '+part.id),shares:part.sharesAtomic,maximumInputAtomic:'16666674',minimumAssetsAtomic:null,underlyingReceiver:'0x'+'5'.repeat(40),shareWithdrawalRecipient:'0x'+'6'.repeat(40),validFrom:String(now),validUntil:String(now+600),receiptCommitment:sha('receipt '+part.id)})});}
 const review=Batch.normalizeDeviceSepoliaMorphoBatchReviewV5({profile:Batch.DEVICE_SEPOLIA_MORPHO_BATCH_REVIEW_V5,reference:sha('whole100shares'),totalSharesAtomic:plan.totalSharesAtomic,maximumNodes:256,maximumInputAtomic:'100000044',notes});
 assert.equal(new Set(notes.map(note=>note.review.rootId)).size,6);assert.equal(new Set(notes.map(note=>note.review.descriptor.pairingId)).size,6);
 let requests=0,issued=0,signatures=0,entered;let release;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve),authorized=new Map();
 const http=async(url,options)=>{requests++;const payload=JSON.parse(options.body),pair=options.headers['x-lianum-defi-pairing-id'],index=notes.findIndex(note=>note.review.descriptor.pairingId===pair);assert.ok(index>=0);const leaf=notes[index].review;assert.equal(bios,1,'only one aggregate sensitive approval; no leaf biometric');let value;
  if(url.endsWith('/challenges'))value={profile:leaf.descriptor.profile,action:'ACCESS',origin:leaf.descriptor.origin,pairingId:pair,devicePublicKey:publicKey,challengeId:sha('challenge'+(++issued)),nonce:sha('nonce'+issued),expiresAt:Date.now()+15000};
  else if(url.endsWith('/defi-read-review'))value={reference:leaf.reference,state:authorized.has(pair)?'AUTHORIZED':'NOT_ISSUED',review:authorized.get(pair)??null};
  else if(url.endsWith('/defi-reviews')){assert.equal((await vaults[index].summary()).commitment,null,'sensitive approval precedes NoteOwner SIGN/witness');assert.deepEqual(payload.review,leaf);if(index===2){entered();await gate;}value={profile:R.DEVICE_SEPOLIA_DEFI_REVIEW_CHALLENGE_V4,review:leaf,challengeId:sha('financial challenge'+index),nonce:sha('financial nonce'+index),expiresAt:Date.now()+15000};}
  else if(url.endsWith('/defi-authorizations')){signatures++;assert.match(payload.signature,/^[0-9a-f]{128}$/);authorized.set(pair,payload.challenge.review);if(index===0)throw Error('HOST_LOST_AUTHORIZATION_ACK');value={reference:leaf.reference,authorized:true,financialNativeMounted:false};}
  else if(url.endsWith('/reviews')){assert.equal(index,1);assert.notEqual((await vaults[index].summary()).commitment,null);throw Error('HOST_NO_PROOF_PORT');}
  else assert.fail('no prover or financial POST in this HOST test');return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
 };
 const api=SDK.createDeviceSepoliaMorphoShareBatchApiV5({fetchImpl:http});t.after(()=>api.close());const signal=new AbortController();
 await assert.rejects(api.prepare(review,entries.map((entry,index)=>index===0?{...entry,vault:{...entry.vault}}:entry),signal.signal),/ORIGINAL_VAULT/);assert.equal(bios,0);assert.equal(requests,0);
 await assert.rejects(api.prepare(review,entries.map((entry,index)=>index===1?{...entry,vault:entries[0].vault}:entry),signal.signal),/BATCH_BINDING/);assert.equal(bios,0);
 const token=await api.prepare(review,entries,signal.signal);assert.equal(bios,1);assert.equal(requests,0);assert.equal(count(privateSlot),1);for(const vault of vaults)assert.equal((await vault.summary()).commitment,null);
 await assert.rejects(api.submitNote({...token},notes[0].id),/BATCH_BINDING/);await assert.rejects(api.submitNote(token,'foreign-note'),/BATCH_BINDING/);assert.equal(requests,0);
 await assert.rejects(api.submitNote(token,notes[0].id),/LOST_AUTHORIZATION_ACK/);assert.equal((await vaults[0].summary()).commitment,null);assert.equal(api.state(token).notes[0].phase,'UNKNOWN');const afterLoss=requests;await assert.rejects(api.submitNote(token,notes[0].id),/BATCH_BINDING/);assert.equal(requests,afterLoss);assert.equal(signatures,1);
 await assert.rejects(api.submitNote(token,notes[1].id),/NO_PROOF_PORT/);assert.equal(api.state(token).notes[1].phase,'UNKNOWN');assert.equal(signatures,2);assert.equal(bios,1);const beforeRetry=requests;await assert.rejects(api.submitNote(token,notes[1].id),/BATCH_BINDING/);assert.equal(requests,beforeRetry);
 const pending=api.submitNote(token,notes[2].id);await started;signal.abort();release();await assert.rejects(pending);assert.equal(signatures,2);assert.equal((await vaults[2].summary()).commitment,null);await assert.rejects(api.submitNote(token,notes[3].id),/BATCH_BINDING/);assert.equal(bios,1);api.close();W.lockWalletSessionV1();
});
