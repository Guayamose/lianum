/** HOST regression: actual Vault/SDK/PC23 codec and AES-GCM, with strict Android
 * SecureStore ports and an inert signed HTTP fixture. No proof, chain effect,
 * biometric hardware or financial acceptance is established by this test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createCipheriv,createDecipheriv,randomBytes,generateKeyPairSync,sign,verify} from 'node:crypto';

test('ExternalFlat stores the original operation before SIGN; its one-use CAS arm never opens ROOT after SIGN',async t=>{
 const store=new Map(),keys=new WeakMap(),imported=[];let rootReads=0,sequence=0,corruptWrite=null;
 const h=value=>createHash('sha256').update(String(value)).digest('hex');
 t.mock.module('expo-secure-store',{exports:{WHEN_UNLOCKED_THIS_DEVICE_ONLY:6,isAvailableAsync:async()=>true,canUseBiometricAuthentication:()=>true,
  getItemAsync:async(key,options)=>{if(key.startsWith('lianum.external-flat.root.v1')){assert.equal(options.requireAuthentication,true);assert.equal(options.keychainAccessible,6);rootReads++;}return store.get(key)??null;},
  setItemAsync:async(key,value,options)=>{if(key.startsWith('lianum.external-flat.root.v1'))assert.equal(options.requireAuthentication,true);store.set(key,corruptWrite?.(key,value)??value);}}});
 t.mock.module('expo-local-authentication',{exports:{hasHardwareAsync:async()=>true,isEnrolledAsync:async()=>true,authenticateAsync:async options=>{assert.equal(options.biometricsSecurityLevel,'strong');assert.equal(options.disableDeviceFallback,true);return{success:true};}}});
 t.mock.module('react-native',{exports:{Platform:{OS:'android'},AppState:{currentState:'active',addEventListener:()=>({remove(){}})}}});
 t.mock.module('expo-crypto',{exports:{CryptoDigestAlgorithm:{SHA256:'SHA256'},digest:async(algorithm,bytes)=>{assert.equal(algorithm,'SHA256');return Uint8Array.from(createHash('sha256').update(new Uint8Array(bytes)).digest()).buffer;},getRandomBytesAsync:async n=>new Uint8Array(randomBytes(n)),
  AESEncryptionKey:{async import(bytes){imported.push(bytes);const key={};keys.set(key,Buffer.from(bytes));return key;}},
  AESSealedData:{fromCombined(raw,options){assert.ok(raw instanceof Uint8Array,'ANDROID_AES_FROM_COMBINED_REQUIRES_UINT8ARRAY');assert.deepEqual(options,{ivLength:12,tagLength:16});return{bytes:Buffer.from(raw)};}},
  async aesEncryptAsync(clear,key,options){assert.equal(options.tagLength,16);const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keys.get(key),iv);cipher.setAAD(options.additionalData);try{const combined=Buffer.concat([iv,cipher.update(clear),cipher.final(),cipher.getAuthTag()]);return{combined:async()=>combined.toString('base64')};}finally{keys.get(key).fill(0);}},
  async aesDecryptAsync(sealed,key,options){assert.equal(options.output,'bytes');const b=sealed.bytes,decipher=createDecipheriv('aes-256-gcm',keys.get(key),b.subarray(0,12));decipher.setAAD(options.additionalData);decipher.setAuthTag(b.subarray(-16));try{return Uint8Array.from(Buffer.concat([decipher.update(b.subarray(12,-16)),decipher.final()]));}finally{keys.get(key).fill(0);}}
 }});
 const P=await import('../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs');
 const G=await import('../../../packages/mobile-protocol/src/device-external-flat-graph-v1.mjs');
 const {createDeviceExternalFlatRoutedNoteVaultV1,openExistingDeviceExternalFlatCustodyV1,restoreDeviceExternalFlatNoteBackupV1}=await import('../src/custody/device-external-flat-note-vault-v1.ts');
 const {createDeviceExternalFlatNoteApiV1,readDeviceExternalFlatConsentV1,readDeviceExternalFlatUnsubmittedConsentV1}=await import('../src/api/device-external-flat-note-api-v1.mjs');
 const {createDeviceExternalFlatGraphApiV1,readDeviceExternalFlatGraphConsentV1}=await import('../src/api/device-external-flat-graph-api-v1.mjs');
 const {verifyDeviceRecoveryCopyV1}=await import('../src/custody/device-recovery-copy-gate-v1.ts');
 const device=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),jwk=device.publicKey.export({format:'jwk'});
 const pub='04'+Buffer.from(jwk.x,'base64url').toString('hex')+Buffer.from(jwk.y,'base64url').toString('hex');
 function deviceSign(frame){let raw=sign('sha256',frame,{key:device.privateKey,dsaEncoding:'ieee-p1363'});const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,s=BigInt('0x'+raw.subarray(32).toString('hex'));if(s>order/2n)raw=Buffer.concat([raw.subarray(0,32),Buffer.from((order-s).toString(16).padStart(64,'0'),'hex')]);return raw.toString('hex');}
 function checkedSignature(frame,signature){assert.ok(verify('sha256',frame,{key:device.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'hex')));}
 function response(url,value){return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});}
 async function fixture(share=false,reception=false){
  const id=++sequence,profile=share?P.DEVICE_EXTERNAL_FLAT_SHARE_V1:P.DEVICE_EXTERNAL_FLAT_NOTE_V1;
  const descriptor=P.normalizeExternalFlatDescriptorV1({profile,origin:'https://127.0.0.1:9444',pairingId:h('pair-'+id),devicePublicKey:pub,lifetime:h('life-'+id),poolTerms:Object.fromEntries(['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace'].map(name=>[name,h(name+id).slice(0,['pool','asset','hub'].includes(name)?40:64)])),assetMetadata:{kind:'ERC20',symbol:share?'staticUSDC':'USDC',decimals:6}});
  const vault=await createDeviceExternalFlatRoutedNoteVaultV1(descriptor);t.after(()=>vault.close());
  const prepared=await vault.prepareDeposit(descriptor,'ab'.repeat(20),'500','1000',share?'2000':undefined);
  const checked=new Set();let operations=0,remoteRow=null,observations=0,dropObservation=false,signedObserveReads=null;
  const api=createDeviceExternalFlatNoteApiV1({descriptor,fetchImpl:async(url,options)=>{
   assert.equal(options.method,'POST');assert.equal(options.headers.Origin,descriptor.origin);const request=JSON.parse(options.body);
   if(url.endsWith('/challenges'))return response(url,{profile,action:'ACCESS',origin:descriptor.origin,pairingId:descriptor.pairingId,devicePublicKey:pub,challengeId:h('access-'+(++sequence)),nonce:h('access-nonce-'+sequence),expiresAt:Date.now()+15000});
   if(url.endsWith('/status')){checkedSignature(P.externalFlatPermissionMessageV1(request.access),request.signature);const now=Date.now();return response(url,{descriptor,jobs:remoteRow?[remoteRow]:[],observed:{blockNumber:'1',blockHash:h('block'),timestamp:'1000'},observedAt:now,expiresAt:now+15000,...(share?{note:{state:remoteRow?.stage==='CONFIRMED'?'LIVE':'UNISSUED',commitment:remoteRow?.consentFields.statement.output??null,available:remoteRow?.stage==='CONFIRMED'?'500':null,backing:remoteRow?.stage==='CONFIRMED'?{held:'500',liabilities:'500',surplus:'0',deficit:'0'}:null}}:{})});}
   if(url.endsWith('/reviews')){checkedSignature(P.externalFlatPermissionMessageV1(request.access),request.signature);assert.ok(!checked.has(request.access.challengeId));checked.add(request.access.challengeId);const draft=request.draft,jobId=draft.jobId??h('job-'+(++sequence));return response(url,{consent:{profile,descriptor,challengeId:h('consent-'+sequence),nonce:h('nonce-'+sequence),expiresAt:Date.now()+15000,...draft,jobId,depositJobId:jobId,proofSHA256:draft.action==='OBSERVE_D27'?remoteRow.consentFields.proofSHA256:null,publicInputsSHA256:draft.action==='OBSERVE_D27'?remoteRow.consentFields.publicInputsSHA256:null,observed:{blockNumber:'1',blockHash:h('block'),timestamp:'1000'},openingDisclosure:draft.action==='OBSERVE_D27'?null:P.DEVICE_EXTERNAL_FLAT_OPENING_V1}});}
   checkedSignature(P.externalFlatPermissionMessageV1(request.consent),request.signature);operations++;
   if(reception){const c=request.consent;assert.ok(['PROVE_D27','OBSERVE_D27'].includes(c.action),'no funding, swap or withdrawal port');
    if(c.action==='OBSERVE_D27'){observations++;assert.equal(request.witness,null);if(signedObserveReads!==null)assert.equal(rootReads,signedObserveReads,'no protected ROOT between observation SIGN and POST');assert.equal(c.jobId,remoteRow.jobId);assert.equal(c.rootId,remoteRow.consentFields.rootId);assert.deepEqual(c.statement,remoteRow.consentFields.statement);}
    const fields=Object.fromEntries(['jobId','depositJobId','rootId','noteRevision','recipient','statement','path','witnessSHA256','proofSHA256','publicInputsSHA256'].map(k=>[k,c[k]]));if(c.action==='PROVE_D27'){fields.proofSHA256=h('accepted-proof-'+id);fields.publicInputsSHA256=h('accepted-inputs-'+id);}
    const observed={blockNumber:'1',blockHash:h('block'),timestamp:'1000'},observation=c.action==='OBSERVE_D27'?{profile,jobId:c.jobId,depositJobId:c.depositJobId,rootId:c.rootId,commitment:c.statement.output,amount:c.statement.amount,recipient:c.recipient,proofSHA256:c.proofSHA256,publicInputsSHA256:c.publicInputsSHA256,transactionHash:h('receipt-tx-'+id),calldataSHA256:h('receipt-data-'+id),receiptBlockHash:h('receipt-block-'+id),observed,status:'CONFIRMED',canonicalRpcVerifiedBy:'ORIGINAL_BACKEND_OBSERVER',mobileCanonicalRpcVerified:false}:null;
    remoteRow={profile,descriptor,jobId:c.jobId,mode:'deposit_intent',stage:observation?'CONFIRMED':'PROVED',consentFields:fields,observation,errorCode:null};if(c.action==='OBSERVE_D27'&&dropObservation){dropObservation=false;throw Error('HOST_LOST_OBSERVATION_REPLY');}return response(url,remoteRow);
   }
   throw Error('HOST_INERT_OPERATION_STOP');
  }});t.after(()=>api.close());
  async function review(){const access=await api.challenge();return api.review(access,deviceSign(P.externalFlatPermissionMessageV1(access)),prepared.draft);}
  return{descriptor,vault,prepared,api,review,operations:()=>operations,observations:()=>observations,handOff:()=>{assert.equal(remoteRow?.stage,'PROVED');remoteRow={...remoteRow,stage:'DELIVERY_UNKNOWN'};},dropObservation:()=>{dropObservation=true;},sign:async value=>{const signature=deviceSign(P.externalFlatPermissionMessageV1(value));if(value.action==='OBSERVE_D27')signedObserveReads=rootReads;return signature;}};
 }
 const f=await fixture(true),controller=new AbortController();
 await assert.rejects(()=>f.vault.beginSubmissionStorage('NOTE',f.prepared.draft,{aborted:false}),/SUBMISSION_ARM/);
 const before=rootReads,loan=await f.vault.beginSubmissionStorage('NOTE',f.prepared.draft,controller.signal);assert.equal(rootReads,before+1);
 const baseline=await f.vault.submissionRecoveryCheckpoint(loan);assert.equal(rootReads,before+1);
 await f.vault.summary();assert.equal(rootReads,before+2,'ordinary displays retain protected ROOT access');
 const consent=await f.review();assert.equal(readDeviceExternalFlatConsentV1(consent),consent);assert.throws(()=>readDeviceExternalFlatConsentV1(structuredClone(consent)),/RESPONSE_REJECTED/);
 const selected={vault:f.vault},cut={selected,kind:'SHARE',prepared:f.prepared,checkpoint:baseline},ports={readCopy:()=>cut,assertCurrent:(_ticket,value)=>assert.equal(value,selected),readCheckpoint:()=>f.vault.submissionRecoveryCheckpoint(loan)};
 await verifyDeviceRecoveryCopyV1(selected,'SHARE',f.prepared.witness,1,ports);
 const armed=await f.vault.bindSubmissionStorage(loan,consent);assert.equal(rootReads,before+2,'latch and verified encrypted write reuse only the pre-ACCESS root');
 assert.deepEqual(await f.vault.submissionRecoveryCheckpoint(armed),baseline,'copy covers unchanged openings; current ciphertext CAS is checked independently');
 const signature=deviceSign(P.externalFlatPermissionMessageV1(consent)),afterSign=rootReads;
 await verifyDeviceRecoveryCopyV1(selected,'SHARE',f.prepared.witness,1,{...ports,readCheckpoint:()=>f.vault.submissionRecoveryCheckpoint(armed)});
 await f.vault.consumeSubmissionArm(armed,consent);assert.equal(rootReads,afterSign,'copy verification and consume require no ROOT after SIGN');
 await assert.rejects(()=>f.vault.consumeSubmissionArm(armed,consent),/SUBMISSION_ARM/);
 await assert.rejects(()=>f.api.submit(consent,signature,f.prepared.witness),/HOST_INERT_OPERATION_STOP/);assert.equal(f.operations(),1);assert.equal(rootReads,afterSign);
 assert.throws(()=>readDeviceExternalFlatConsentV1(consent),/RESPONSE_REJECTED/,'consumed permission cannot be rearmed');
 const local=await f.vault.summary();assert.equal(local.pending.action,'PROVE_D27');assert.equal(local.jobs[0].jobId,consent.jobId,'server-assigned original job is durable before SIGN');

 // Each rejection uses a separate prepared namespace: no economic retry, reset,
 // proof acceptance or synthetic authority is implied by these storage fixtures.
 for(const why of ['copy','abort','close','apiClosed','cas','expired']){
  const x=await fixture(),stop=new AbortController(),token=await x.vault.beginSubmissionStorage('NOTE',x.prepared.draft,stop.signal),original=await x.review();
  if(why==='copy'){await assert.rejects(()=>x.vault.bindSubmissionStorage(token,structuredClone(original)),/RESPONSE_REJECTED/);await assert.rejects(()=>x.vault.bindSubmissionStorage(token,original),/SUBMISSION_ARM/);continue;}
  const ready=await x.vault.bindSubmissionStorage(token,original),unchanged=rootReads;
  if(why==='abort')stop.abort();if(why==='close')await x.vault.close();if(why==='apiClosed')x.api.close();
  let savedKey,savedValue,now;
  if(why==='cas'){savedKey=[...store.keys()].find(key=>key.startsWith('lianum.external-flat.pointer.v1')&&JSON.parse(store.get(key)).rootId===x.prepared.draft.rootId);savedValue=store.get(savedKey);store.set(savedKey,JSON.stringify({...JSON.parse(savedValue),revision:999}));}
  if(why==='expired'){now=Date.now;Date.now=()=>original.expiresAt;}
  try{await assert.rejects(async()=>x.vault.consumeSubmissionArm(ready,original),/SUBMISSION_EXPIRED|UNAVAILABLE|STORAGE_CHANGED|DEVICE_EXTERNAL_FLAT_DATA|RESPONSE_REJECTED/);assert.equal(rootReads,unchanged);}
  finally{if(savedKey)store.set(savedKey,savedValue);if(now)Date.now=now;}
 }
 const abandoned=await fixture(),stop=new AbortController(),abandonedLoan=await abandoned.vault.beginSubmissionStorage('NOTE',abandoned.prepared.draft,stop.signal);stop.abort();await assert.rejects(async()=>abandoned.vault.bindSubmissionStorage(abandonedLoan,await abandoned.review()),/SUBMISSION_ARM/);

 // SIGN cancellation/expiry can repair only an unconsumed, never-submitted
 // local arm. It commits a new revision, preserves the exact plaintext and
 // permanently retires the old SDK permission before any public storage write.
 function stored(rootId){const pointerKey=[...store.keys()].find(key=>key.startsWith('lianum.external-flat.pointer.v1')&&JSON.parse(store.get(key)).rootId===rootId),suffix=pointerKey.slice('lianum.external-flat.pointer.v1'.length),pointer=JSON.parse(store.get(pointerKey)),manifest=JSON.parse(store.get('lianum.external-flat.record.v1'+suffix));return{pointerKey,suffix,pointer,envelope:JSON.parse(Array.from({length:manifest.chunks},(_,i)=>store.get('lianum.external-flat.chunk.v1'+suffix+'.'+manifest.sha256+'.'+i)).join(''))};}
 function privateFixtureState(snapshot){const key=Buffer.from(store.get('lianum.external-flat.root.v1'+snapshot.suffix),'hex'),e=snapshot.envelope,b=Buffer.from(e.sealed,'base64'),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAAD(Buffer.from(JSON.stringify({profile:e.profile,rootId:e.rootId,revision:e.revision,previousSHA256:e.previousSHA256})));d.setAuthTag(b.subarray(-16));try{return JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]));}finally{key.fill(0);}}
 for(const why of ['cancel','expiry']){
  const r=await fixture(),stop=new AbortController(),before=stored(r.prepared.draft.rootId),plaintext=privateFixtureState(before),witness=structuredClone(r.prepared.witness),loan=await r.vault.beginSubmissionStorage('NOTE',r.prepared.draft,stop.signal),c=await r.review(),arm=await r.vault.bindSubmissionStorage(loan,c),latched=stored(r.prepared.draft.rootId),reads=rootReads;
  deviceSign(P.externalFlatPermissionMessageV1(c));let oldNow;
  if(why==='expiry'){oldNow=Date.now;Date.now=()=>c.expiresAt;assert.throws(()=>readDeviceExternalFlatConsentV1(c),/DEVICE_EXTERNAL_FLAT_DATA/);assert.equal(readDeviceExternalFlatUnsubmittedConsentV1(c),c,'history is not a fresh signing permission');}
  let repaired;try{repaired=await r.vault.recoverUnsubmittedStorage(arm,c);}finally{if(oldNow)Date.now=oldNow;}
  assert.equal(rootReads,reads,'repair after SIGN does not open ROOT');assert.equal(repaired.kind,'NOTE');assert.deepEqual(repaired.draft,r.prepared.draft);assert.deepEqual(r.prepared.witness,witness);
  const after=stored(r.prepared.draft.rootId);assert.equal(after.pointer.revision,latched.pointer.revision+1);assert.equal(after.envelope.previousSHA256,latched.pointer.recordSHA256);assert.deepEqual(privateFixtureState(after),plaintext,'same root/key/note/openings/amount/witness draft; no regenerated private material');
  assert.equal(repaired.checkpoint.revision,after.pointer.revision);assert.equal(repaired.checkpoint.recordSHA256,after.pointer.recordSHA256);
  await assert.rejects(()=>r.vault.recoverUnsubmittedStorage(arm,c),/SUBMISSION_UNCERTAIN/);await assert.rejects(()=>r.api.submit(c,deviceSign(P.externalFlatPermissionMessageV1(c)),r.prepared.witness),/RESPONSE_REJECTED/);assert.equal(r.operations(),0,'retired original consent cannot POST late');
  const local=await r.vault.summary();assert.equal(local.pending,null);assert.deepEqual(local.jobs,[]);
  const retry=await r.vault.beginSubmissionStorage('NOTE',r.prepared.draft,stop.signal);r.vault.endSubmissionStorage(retry);
 }
 const faulty=await fixture(),faultStop=new AbortController(),faultLoan=await faulty.vault.beginSubmissionStorage('NOTE',faulty.prepared.draft,faultStop.signal),faultConsent=await faulty.review(),faultArm=await faulty.vault.bindSubmissionStorage(faultLoan,faultConsent),faultSnapshot=stored(faulty.prepared.draft.rootId),faultReads=rootReads;
 corruptWrite=(key,value)=>key==='lianum.external-flat.record.v1'+faultSnapshot.suffix?JSON.stringify({...JSON.parse(value),bytes:999}):value;
 try{await assert.rejects(()=>faulty.vault.recoverUnsubmittedStorage(faultArm,faultConsent),/WRITE_UNCERTAIN/);}finally{corruptWrite=null;}
 assert.equal(rootReads,faultReads,'failed ciphertext readback never opens ROOT');assert.equal(JSON.parse(store.get(faultSnapshot.pointerKey)).state,'WRITING');await assert.rejects(async()=>faulty.vault.recoverUnsubmittedStorage(faultArm,faultConsent),/UNAVAILABLE/);assert.equal(faulty.operations(),0,'uncertain write remains blocked and cannot reset or send');
 const attempted=await fixture(),attemptStop=new AbortController(),attemptLoan=await attempted.vault.beginSubmissionStorage('NOTE',attempted.prepared.draft,attemptStop.signal),attemptConsent=await attempted.review(),attemptArm=await attempted.vault.bindSubmissionStorage(attemptLoan,attemptConsent),beforeAttempt=stored(attempted.prepared.draft.rootId).pointer.recordSHA256;
 await assert.rejects(()=>attempted.api.submit(attemptConsent,'invalid',attempted.prepared.witness));assert.equal(attempted.operations(),0,'invalid signature fails before HTTP');
 await assert.rejects(()=>attempted.vault.recoverUnsubmittedStorage(attemptArm,attemptConsent),/RESPONSE_REJECTED/);assert.equal(stored(attempted.prepared.draft.rootId).pointer.recordSHA256,beforeAttempt,'even a rejected SDK submit invocation forbids repair');
 const consumed=await fixture(),consumeStop=new AbortController(),consumeLoan=await consumed.vault.beginSubmissionStorage('NOTE',consumed.prepared.draft,consumeStop.signal),consumeConsent=await consumed.review(),consumeArm=await consumed.vault.bindSubmissionStorage(consumeLoan,consumeConsent);await consumed.vault.consumeSubmissionArm(consumeArm,consumeConsent);await assert.rejects(()=>consumed.vault.recoverUnsubmittedStorage(consumeArm,consumeConsent),/SUBMISSION_UNCERTAIN/);
 const reopened=await fixture(),restartStop=new AbortController(),restartLoan=await reopened.vault.beginSubmissionStorage('NOTE',reopened.prepared.draft,restartStop.signal),restartConsent=await reopened.review(),restartArm=await reopened.vault.bindSubmissionStorage(restartLoan,restartConsent);await reopened.vault.close();const restartVault=await createDeviceExternalFlatRoutedNoteVaultV1(reopened.descriptor);t.after(()=>restartVault.close());await assert.rejects(()=>restartVault.recoverUnsubmittedStorage(restartArm,restartConsent),/SUBMISSION_UNCERTAIN/);assert.equal((await restartVault.summary()).pending.action,'PROVE_D26','reopened process without its private mark remains pending, observation-only');

 // A valid strict encrypted graph preparation fixture exercises the identical
 // original graph SDK handle and Vault latch. It establishes no source funding.
 const x=await fixture(),{deviceReservationFixtureV1}=await import('./helpers/device-reservation-fixture-v1.mjs'),data=deviceReservationFixtureV1();
 const {decodeDeviceNoteStoredStateV1}=await import('../src/custody/device-note-stored-state-v1.ts');
 const {compileLocalFundedBalanceGraphV1,localFundedOwnerFrameV1}=await import('../src/custody/funded-balance-owner-codec-v1.mjs');
 const pointerKey=[...store.keys()].find(key=>key.startsWith('lianum.external-flat.pointer.v1')&&JSON.parse(store.get(key)).rootId===x.prepared.draft.rootId),suffix=pointerKey.slice('lianum.external-flat.pointer.v1'.length),rootKey=Buffer.from(store.get('lianum.external-flat.root.v1'+suffix),'hex'),manifestKey='lianum.external-flat.record.v1'+suffix,oldPointer=JSON.parse(store.get(pointerKey)),manifest=JSON.parse(store.get(manifestKey));
 const chunkKey=(hash,i)=>'lianum.external-flat.chunk.v1'+suffix+'.'+hash+'.'+i;
 const oldEnvelope=JSON.parse(Array.from({length:manifest.chunks},(_,i)=>store.get(chunkKey(manifest.sha256,i))).join(''));
 const combined=Buffer.from(oldEnvelope.sealed,'base64'),decrypt=createDecipheriv('aes-256-gcm',rootKey,combined.subarray(0,12));decrypt.setAAD(Buffer.from(JSON.stringify({profile:oldEnvelope.profile,rootId:oldEnvelope.rootId,revision:oldEnvelope.revision,previousSHA256:oldEnvelope.previousSHA256})));decrypt.setAuthTag(combined.subarray(-16));const state=decodeDeviceNoteStoredStateV1(JSON.parse(Buffer.concat([decrypt.update(combined.subarray(12,-16)),decrypt.final()])));
 const input={...data.witness.input,scope:x.descriptor.poolTerms.scope,policy:x.descriptor.poolTerms.policy,asset:x.descriptor.poolTerms.assetIdentity,inputNote:state.note.opening};
 const statement=compileLocalFundedBalanceGraphV1(input).authorizationStatement;
 const draft=G.normalizeExternalFlatGraphDraftV1({action:'PROVE_U',depositJobId:h('host-deposit'),rootId:state.rootId,quoteId:h('host-quote'),jobId:h('host-graph'),custody:{rootId:state.rootId,noteRevision:1,encryptedRecordSHA256:oldPointer.recordSHA256,frameSHA256:h(Buffer.from(localFundedOwnerFrameV1(statement)).toString('hex')),sourceCommitment:statement.inputCommitment,sourceNullifier:statement.inputNullifier,changeCommitment:statement.changeCommitment,recoveryCommitment:statement.recoveryCommitment},statement,witnessSHA256:h('host-witness'),proofSHA256:null,publicInputsSHA256:null});
 state.graph={draft,change:{opening:input.changeNote,privateKey:'2'.padStart(64,'0')},recovery:{opening:input.recoveryNote,privateKey:'3'.padStart(64,'0')},row:null,pending:null,withdrawals:[],withdrawalPending:[],withdrawalPrepared:null};
 const nextEnvelope={profile:oldEnvelope.profile,rootId:state.rootId,revision:oldEnvelope.revision+1,previousSHA256:oldPointer.recordSHA256},iv=randomBytes(12),encrypt=createCipheriv('aes-256-gcm',rootKey,iv);encrypt.setAAD(Buffer.from(JSON.stringify(nextEnvelope)));nextEnvelope.sealed=Buffer.concat([iv,encrypt.update(JSON.stringify(state)),encrypt.final(),encrypt.getAuthTag()]).toString('base64');rootKey.fill(0);
 const encoded=JSON.stringify(nextEnvelope),recordSHA=createHash('sha256').update(encoded).digest('hex'),parts=Math.ceil(encoded.length/1500);for(let i=0;i<parts;i++)store.set(chunkKey(recordSHA,i),encoded.slice(i*1500,(i+1)*1500));store.set(manifestKey,JSON.stringify({profile:state.profile,sha256:recordSHA,bytes:encoded.length,chunks:parts}));store.set(pointerKey,JSON.stringify({...oldPointer,revision:nextEnvelope.revision,recordSHA256:recordSHA}));
 const graphApi=createDeviceExternalFlatGraphApiV1({descriptor:x.descriptor,fetchImpl:async(url,options)=>{const request=JSON.parse(options.body);if(url.endsWith('/challenges'))return response(url,{profile:x.descriptor.profile,action:'ACCESS',origin:x.descriptor.origin,pairingId:x.descriptor.pairingId,devicePublicKey:pub,challengeId:h('graph-access-'+(++sequence)),nonce:h('graph-access-nonce-'+sequence),expiresAt:Date.now()+15000});assert.ok(url.endsWith('/reviews'));checkedSignature(P.externalFlatPermissionMessageV1(request.access),request.signature);return response(url,{profile:G.DEVICE_EXTERNAL_FLAT_GRAPH_V1,descriptor:x.descriptor,challengeId:h('graph-consent-'+sequence),nonce:h('graph-nonce-'+sequence),expiresAt:Date.now()+15000,draft:request.draft,observed:{blockNumber:'1',blockHash:h('block'),timestamp:'1000'},openingDisclosure:'ONE_FUNDED_OWNER_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER'});}});t.after(()=>graphApi.close());
 const graphStop=new AbortController(),graphLoan=await x.vault.beginSubmissionStorage('GRAPH',draft,graphStop.signal),graphBefore=rootReads,access=await graphApi.challenge(),graphConsent=await graphApi.review(access,deviceSign(P.externalFlatPermissionMessageV1(access)),draft);
 assert.equal(readDeviceExternalFlatGraphConsentV1(graphConsent),graphConsent);assert.throws(()=>readDeviceExternalFlatGraphConsentV1(structuredClone(graphConsent)),/GRAPH_RESPONSE_REJECTED/);
 const firstGraphArm=await x.vault.bindSubmissionStorage(graphLoan,graphConsent);deviceSign(G.externalFlatGraphPermissionMessageV1(graphConsent));const graphRepair=await x.vault.recoverUnsubmittedStorage(firstGraphArm,graphConsent);assert.deepEqual(graphRepair.draft,draft);assert.equal(rootReads,graphBefore,'graph SIGN cancellation repairs without ROOT');assert.throws(()=>readDeviceExternalFlatGraphConsentV1(graphConsent),/GRAPH_RESPONSE_REJECTED/);
 const secondLoan=await x.vault.beginSubmissionStorage('GRAPH',draft,graphStop.signal),secondAccess=await graphApi.challenge(),secondConsent=await graphApi.review(secondAccess,deviceSign(P.externalFlatPermissionMessageV1(secondAccess)),draft),secondBefore=rootReads,graphArm=await x.vault.bindSubmissionStorage(secondLoan,secondConsent);deviceSign(G.externalFlatGraphPermissionMessageV1(secondConsent));await x.vault.consumeSubmissionArm(graphArm,secondConsent);assert.equal(rootReads,secondBefore,'graph latch and post-SIGN consume have no protected ROOT request');
 graphApi.close();assert.throws(()=>readDeviceExternalFlatGraphConsentV1(graphConsent),/GRAPH_RESPONSE_REJECTED/);assert.equal((await x.vault.summary()).graph.pending,'PROVE_U');
 const finite=await fixture(),finiteStop=new AbortController();t.mock.timers.enable({apis:['setTimeout']});
 const finiteLoan=await finite.vault.beginSubmissionStorage('NOTE',finite.prepared.draft,finiteStop.signal),finiteReads=rootReads;t.mock.timers.tick(60001);await assert.rejects(()=>finite.vault.bindSubmissionStorage(finiteLoan,null),/SUBMISSION_ARM/);await finite.vault.summary();assert.equal(rootReads,finiteReads+1,'60-second timer independently wipes the draft-scoped ROOT loan');
 const ended=await finite.vault.beginSubmissionStorage('NOTE',finite.prepared.draft,finiteStop.signal);finite.vault.endSubmissionStorage(ended);await assert.rejects(()=>finite.vault.bindSubmissionStorage(ended,null),/SUBMISSION_ARM/);
 t.mock.timers.reset();
 const recovery=await fixture(),missing={...recovery.descriptor,pairingId:h('missing-joint-custody')},beforeMissing=h(JSON.stringify([...store]));
 await assert.rejects(openExistingDeviceExternalFlatCustodyV1(missing),/MOBILE_WALLET_CUSTODY_ABSENT/);assert.equal(h(JSON.stringify([...store])),beforeMissing,'joint discovery cannot create a routed ROOT');
 const password='joint-external-custody-password',copy=await recovery.vault.exportBackup(password,pub);await recovery.vault.close();let recovered=await restoreDeviceExternalFlatNoteBackupV1(copy,password,pub,recovery.descriptor);try{assert.equal((await recovered.summary()).recoveryFence.source,true);}finally{await recovered.close();}
 const installedSHA=h(JSON.stringify([...store]));recovered=await restoreDeviceExternalFlatNoteBackupV1(copy,password,pub,recovery.descriptor);try{assert.equal((await recovered.summary()).recoveryFence.source,true);assert.equal(h(JSON.stringify([...store])),installedSHA,'retrying the same completed restore changes no root or generation');}finally{await recovered.close();}
 const suffixRecovery='.'+h(JSON.stringify(recovery.descriptor)),pointerRecovery='lianum.external-flat.pointer.v1'+suffixRecovery,kept=store.get(pointerRecovery),foreign=JSON.parse(kept);foreign.revision++;store.set(pointerRecovery,JSON.stringify(foreign));await assert.rejects(restoreDeviceExternalFlatNoteBackupV1(copy,password,pub,recovery.descriptor),/MOBILE_EXTERNAL_FLAT_BACKUP_CONFLICT/);assert.equal(store.get(pointerRecovery),JSON.stringify(foreign));store.set(pointerRecovery,kept);

 {
 // The original SDK STATUS projects DELIVERY_UNKNOWN; the same D27 requires
 // one explicit OBSERVE. Exercise the production observer against this strict
 // signed SDK/AES Vault fixture, without a proof worker or chain effect.
 const {observeDeviceExternalFlatReceptionV1}=await import('../src/api/device-external-flat-reception-observer-v1.mjs');
 async function preparedReception(){const f=await fixture(true,true),stop=new AbortController(),loan=await f.vault.beginSubmissionStorage('NOTE',f.prepared.draft,stop.signal),c=await f.review(),arm=await f.vault.bindSubmissionStorage(loan,c);await f.vault.consumeSubmissionArm(arm,c);await f.vault.accept(await f.api.submit(c,deviceSign(P.externalFlatPermissionMessageV1(c)),f.prepared.witness));return{f,stop};}
 async function receptionInput(f,stop){const a=await f.api.challenge(),status=await f.api.status(a,await f.sign(a)),summary=await f.vault.reconcileOriginalStatus(status);return{descriptor:f.descriptor,status,summary,vault:f.vault,client:f.api,sign:f.sign,signal:stop.signal,assertCurrent:()=>assert.ok(!stop.signal.aborted)};}
 const received=await preparedReception();let receptionCase=await receptionInput(received.f,received.stop);
 assert.equal((await observeDeviceExternalFlatReceptionV1(receptionCase)).observed,false,'PROVED preparation remains untouched before the swap');assert.equal(received.f.observations(),0);
 received.f.handOff();receptionCase=await receptionInput(received.f,received.stop);
 await assert.rejects(observeDeviceExternalFlatReceptionV1({...receptionCase,status:structuredClone(receptionCase.status)}),/RESPONSE_REJECTED/,'a DTO cannot manufacture an SDK status');
 await assert.rejects(observeDeviceExternalFlatReceptionV1({...receptionCase,summary:{...receptionCase.summary,rootId:h('another-root')}}),/RECEPTION_BINDING/);assert.equal(received.f.observations(),0);
 const confirmed=await observeDeviceExternalFlatReceptionV1(receptionCase);assert.equal(confirmed.observed,true);assert.equal(confirmed.status.jobs[0].stage,'CONFIRMED');assert.equal(confirmed.status.note.state,'LIVE');assert.equal(confirmed.status.note.available,'500');assert.equal(confirmed.summary.pending,null);assert.deepEqual(confirmed.status.jobs[0].consentFields,receptionCase.status.jobs[0].consentFields);assert.equal(received.f.observations(),1);
 assert.equal((await observeDeviceExternalFlatReceptionV1({...receptionCase,status:confirmed.status,summary:confirmed.summary})).observed,false);assert.equal(received.f.observations(),1,'confirmed receipt is not submitted twice');
 const lost=await preparedReception();lost.f.handOff();lost.f.dropObservation();await assert.rejects(observeDeviceExternalFlatReceptionV1(await receptionInput(lost.f,lost.stop)),/HOST_LOST_OBSERVATION_REPLY/);assert.equal(lost.f.observations(),1);const recovered=await observeDeviceExternalFlatReceptionV1(await receptionInput(lost.f,lost.stop));assert.equal(recovered.status.note.available,'500');assert.equal(recovered.observed,false);assert.equal(lost.f.observations(),1,'lost OBSERVE response recovers through original STATUS, never a resend');
 const cancelled=await preparedReception();cancelled.f.handOff();receptionCase=await receptionInput(cancelled.f,cancelled.stop);cancelled.stop.abort();await assert.rejects(observeDeviceExternalFlatReceptionV1(receptionCase),/RECEPTION_BINDING/);assert.equal(cancelled.f.observations(),0);
 }
 assert.ok(imported.every(bytes=>bytes.every(byte=>byte===0)),'actual AES temporary ROOT imports are wiped');
});
