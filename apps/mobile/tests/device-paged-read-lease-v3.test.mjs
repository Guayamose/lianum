/** Actual Vault/SDK and AES-GCM; protected Android storage and signed READ service
 * are HOST ports. No hardware, proof execution, chain effects or owner-key cache. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createCipheriv,createDecipheriv,randomBytes,generateKeyPairSync,sign,verify} from 'node:crypto';

test('Paged ROOT read loan is scoped, finite and unavailable to economic writes',async t=>{
 const dateProperty=Object.getOwnPropertyDescriptor(Date,'now');let wall=Date.now();
 Object.defineProperty(Date,'now',{...dateProperty,value:()=>wall});
 t.after(()=>Object.defineProperty(Date,'now',dateProperty));
 t.mock.timers.enable({apis:['setTimeout']});
 const store=new Map(),rootReads=new Map(),keys=new WeakMap(),imported=[];
 const sha=value=>createHash('sha256').update(value).digest('hex');
 const count=prefix=>[...rootReads].filter(([key])=>key.startsWith(prefix)).reduce((sum,[,n])=>sum+n,0);
 const graphPrefix='lianum.device.paged.graph.v3.',notePrefix='lianum.device.paged.v3.';
 t.mock.module('expo-secure-store',{exports:{WHEN_UNLOCKED_THIS_DEVICE_ONLY:6,isAvailableAsync:async()=>true,canUseBiometricAuthentication:()=>true,
  getItemAsync:async(key,options)=>{assert.ok(!key.startsWith('lianum.owner.'));if(key.endsWith('.root')){assert.equal(options.requireAuthentication,true);assert.equal(options.keychainAccessible,6);rootReads.set(key,(rootReads.get(key)??0)+1);}return store.get(key)??null;},
  setItemAsync:async(key,value,options)=>{if(key.endsWith('.root'))assert.equal(options.requireAuthentication,true);store.set(key,value);}}});
 t.mock.module('expo-local-authentication',{exports:{hasHardwareAsync:async()=>true,isEnrolledAsync:async()=>true,authenticateAsync:async options=>{assert.equal(options.biometricsSecurityLevel,'strong');assert.equal(options.disableDeviceFallback,true);return{success:true};}}});
 t.mock.module('react-native',{exports:{Platform:{OS:'android'},AppState:{currentState:'active',addEventListener:()=>({remove(){}})}}});
 t.mock.module('expo-crypto',{exports:{getRandomBytesAsync:async n=>new Uint8Array(randomBytes(n)),
  AESEncryptionKey:{async import(bytes){imported.push(bytes);const key={};keys.set(key,Buffer.from(bytes));return key;}},
  AESSealedData:{fromCombined(raw,options){assert.ok(raw instanceof Uint8Array,'ANDROID_AES_FROM_COMBINED_REQUIRES_UINT8ARRAY');assert.deepEqual(options,{ivLength:12,tagLength:16});return{bytes:Buffer.from(raw)};}},
  async aesEncryptAsync(clear,key,options){assert.equal(options.tagLength,16);const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keys.get(key),iv);cipher.setAAD(options.additionalData);try{const combined=Buffer.concat([iv,cipher.update(clear),cipher.final(),cipher.getAuthTag()]);return{combined:async()=>combined.toString('base64')};}finally{keys.get(key).fill(0);}},
  async aesDecryptAsync(sealed,key,options){assert.equal(options.output,'bytes');const b=sealed.bytes,decipher=createDecipheriv('aes-256-gcm',keys.get(key),b.subarray(0,12));decipher.setAAD(options.additionalData);decipher.setAuthTag(b.subarray(-16));try{return Uint8Array.from(Buffer.concat([decipher.update(b.subarray(12,-16)),decipher.final()]));}finally{keys.get(key).fill(0);}}
 }});
 const P=await import('../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs');
 const {createDevicePagedGraphNoteVaultV3,createDevicePagedNoteVaultV3}=await import('../src/custody/device-paged-note-vault-v3.ts');
 const {createDevicePagedOwnerApiV3,readDevicePagedStatusV3}=await import('../src/api/device-paged-owner-api-v3.mjs');
 const device=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),jwk=device.publicKey.export({format:'jwk'});
 const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://127.0.0.1:9443',pairingId:'host-read-loan-v3',devicePublicKey:'04'+Buffer.from(jwk.x,'base64url').toString('hex')+Buffer.from(jwk.y,'base64url').toString('hex'),deadlineMs:P.devicePagedNowV3()+9*3600000,chainId:'31337',
  ...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(name=>[name,sha(name)])),
  ...Object.fromEntries(['pool','state','native','math'].map((name,i)=>[name,'0x'+String(i+1).repeat(40)]))});
 const controller=new AbortController(),vault=await createDevicePagedGraphNoteVaultV3(descriptor,controller.signal);
 t.after(()=>vault.close());assert.equal(count(graphPrefix),2,'birth reuses only its temporary ROOT for write/readback');
 await assert.rejects(()=>vault.beginReadStorage(undefined),/MOBILE_PAGED_READ_STORAGE_SCOPE/);
 await assert.rejects(()=>vault.beginReadStorage({aborted:false,addEventListener(){},removeEventListener(){}}),/MOBILE_PAGED_READ_STORAGE_SCOPE/);
 await assert.rejects(()=>vault.beginReadStorage(new AbortController().signal),/MOBILE_PAGED_READ_STORAGE_SCOPE/);
 await vault.beginReadStorage(controller.signal);assert.equal(count(graphPrefix),3);
 await assert.rejects(()=>vault.beginReadStorage(controller.signal),/MOBILE_PAGED_READ_STORAGE_SCOPE/);
 const beforeReads=count(graphPrefix);
 await vault.readDraft();await vault.summary();await vault.graphSummary();await vault.walletDisplay();
 assert.equal(count(graphPrefix),beforeReads,'four display/read methods reuse one protected ROOT opening');

 let signedReads=0,challenges=0;const consumed=new Set();
 const api=createDevicePagedOwnerApiV3({descriptor,fetchImpl:async(url,options)=>{
  assert.equal(options.method,'POST');assert.equal(options.headers['Content-Type'],'application/json');const request=JSON.parse(options.body);
  if(url===descriptor.origin+'/v1/mobile/paged-owner/challenges'){
   const draft=P.normalizeDevicePagedDraftV3(request);assert.equal(draft.action,'READ_STATE');
   return{status:200,text:async()=>JSON.stringify({...draft,version:3,profile:P.DEVICE_PAGED_OWNER_V3,descriptor,challengeId:'host-read-challenge-'+(++challenges),nonce:sha(String(challenges)),recipient:null,expiresAt:P.devicePagedWallNowV3()+15000})};
  }
  assert.equal(url,descriptor.origin+'/v1/mobile/paged-owner/operations');const consent=P.validateDevicePagedConsentFreshV3(request.consent);
  assert.equal(consent.action,'READ_STATE');assert.equal(request.ciphertext,null);assert.ok(!consumed.has(consent.challengeId));
  assert.ok(verify('sha256',P.devicePagedPermissionMessageV3(consent),{key:device.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(request.signature,'hex')));
  consumed.add(consent.challengeId);signedReads++;const issuedAt=P.devicePagedWallNowV3();
  return{status:200,text:async()=>JSON.stringify({profile:P.DEVICE_PAGED_OWNER_V3,descriptor,jobs:[],note:null,issuedAt,expiresAt:issuedAt+15000,blockHash:'0x'+sha('host-head'),blockNumber:'1',epoch:'2'})};
 }});t.after(()=>api.close());
 async function signedStatus(){const consent=await api.challenge(await vault.readDraft());let signature=sign('sha256',P.devicePagedPermissionMessageV3(consent),{key:device.privateKey,dsaEncoding:'ieee-p1363'});const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,s=BigInt('0x'+signature.subarray(32).toString('hex'));if(s>order/2n)signature=Buffer.concat([signature.subarray(0,32),Buffer.from((order-s).toString(16).padStart(64,'0'),'hex')]);return api.submit(consent,signature.toString('hex'));}
 const status=await signedStatus();await assert.rejects(()=>vault.acceptStatus(structuredClone(status)),/MOBILE_PAGED_ORIGINAL_SDK/);
 await vault.acceptStatus(status);assert.equal(count(graphPrefix),beforeReads,'persisting the signed observation remains within the read loan');
 assert.equal((await vault.walletDisplay()).note.observed.expiresAt,status.expiresAt);
 wall=P.devicePagedNowV3()+16000;
 assert.throws(()=>readDevicePagedStatusV3(status),/MOBILE_PAGED_OWNER_BINDING/);
 await assert.rejects(()=>vault.acceptStatus(status),/MOBILE_PAGED_OWNER_BINDING/);
 assert.equal((await vault.walletDisplay()).note.observed,null,'60-second storage loan does not extend the original 15-second status');
 assert.equal(count(graphPrefix),beforeReads);
 const fresh=await signedStatus();assert.equal(signedReads,2,'each READ still requires a new signed original consent');
 const prepared=await vault.prepareDeposit(fresh,'25');P.pagedOwnerWipeV3(prepared.witness);
 assert.equal(count(graphPrefix),beforeReads+3,'economic preparation opens protected ROOT for read, write and verified readback');
 const afterMutation=count(graphPrefix);await vault.summary();await vault.readDraft();assert.equal(count(graphPrefix),afterMutation);

 const other=await createDevicePagedNoteVaultV3(descriptor);try{
  assert.equal(count(notePrefix),2);await assert.rejects(()=>other.beginReadStorage(controller.signal),/MOBILE_PAGED_READ_STORAGE_SCOPE/);
  await other.summary();assert.equal(count(notePrefix),3,'the same descriptor in another custody namespace cannot borrow this ROOT');
 }finally{await other.close();}
 wall=P.devicePagedNowV3()+60001;
 await assert.rejects(()=>vault.summary(),/MOBILE_PAGED_READ_STORAGE_EXPIRED/);assert.equal(count(graphPrefix),afterMutation);
 await vault.summary();assert.equal(count(graphPrefix),afterMutation+1,'expired loan is revoked and the next read opens protected ROOT');
 await vault.beginReadStorage(controller.signal);const beforeTimer=count(graphPrefix);
 t.mock.timers.tick(60001);await vault.summary();assert.equal(count(graphPrefix),beforeTimer+1,'timer independently revokes the loan');
 await vault.beginReadStorage(controller.signal);const beforeEnd=count(graphPrefix);
 vault.endReadStorage();await vault.summary();assert.equal(count(graphPrefix),beforeEnd+1,'explicit end revokes the loan');
 await vault.beginReadStorage(controller.signal);const beforeClose=count(graphPrefix);
 await vault.close();assert.throws(()=>vault.summary(),/MOBILE_PAGED_CUSTODY_CLOSED/);assert.equal(count(graphPrefix),beforeClose);
 const reopenedController=new AbortController(),reopened=await createDevicePagedGraphNoteVaultV3(descriptor,reopenedController.signal);t.after(()=>reopened.close());
 assert.equal(count(graphPrefix),beforeClose+1,'reopening cannot inherit the previous loan or constructor ROOT');
 await reopened.beginReadStorage(reopenedController.signal);const beforeAbort=count(graphPrefix);
 reopenedController.abort();assert.throws(()=>reopened.readDraft(),/MOBILE_PAGED_CUSTODY_CLOSED/);await reopened.close();assert.equal(count(graphPrefix),beforeAbort);
 assert.ok(imported.every(bytes=>bytes.every(byte=>byte===0)),'temporary imported ROOT bytes are wiped after actual AES operations');
});
