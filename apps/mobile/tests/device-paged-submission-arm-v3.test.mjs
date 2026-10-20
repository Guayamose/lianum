/** Actual Vault/SDK and AES-GCM; protected Android storage and signed READ service
 * are HOST ports. No hardware, proof execution, chain effects or owner-key cache. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createCipheriv,createDecipheriv,randomBytes,generateKeyPairSync,sign,verify} from 'node:crypto';

test('Prepared D26 resumes its original note and prearmed SDK consents consume without ROOT prompts',async t=>{
 const dateProperty=Object.getOwnPropertyDescriptor(Date,'now');let wall=Date.now();
 Object.defineProperty(Date,'now',{...dateProperty,value:()=>wall});
 t.after(()=>Object.defineProperty(Date,'now',dateProperty));
 t.mock.timers.enable({apis:['setTimeout']});
 const store=new Map(),rootReads=new Map(),keys=new WeakMap(),imported=[];let latestState=null;
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
  async aesEncryptAsync(clear,key,options){const state=JSON.parse(new TextDecoder().decode(clear));if(state.format==='DEVICE_PAGED_COMPACT_STORAGE_V3')latestState=state.state;assert.equal(options.tagLength,16);const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keys.get(key),iv);cipher.setAAD(options.additionalData);try{const combined=Buffer.concat([iv,cipher.update(clear),cipher.final(),cipher.getAuthTag()]);return{combined:async()=>combined.toString('base64')};}finally{}},
  async aesDecryptAsync(sealed,key,options){assert.equal(options.output,'bytes');const b=sealed.bytes,decipher=createDecipheriv('aes-256-gcm',keys.get(key),b.subarray(0,12));decipher.setAAD(options.additionalData);decipher.setAuthTag(b.subarray(-16));try{return Uint8Array.from(Buffer.concat([decipher.update(b.subarray(12,-16)),decipher.final()]));}finally{}}
 }});
 const P=await import('../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs');
 const {createDevicePagedGraphNoteVaultV3,createDevicePagedNoteVaultV3}=await import('../src/custody/device-paged-note-vault-v3.ts');
 const {createDevicePagedOwnerApiV3,readDevicePagedStatusV3}=await import('../src/api/device-paged-owner-api-v3.mjs');
 const device=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),jwk=device.publicKey.export({format:'jwk'});
 const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://127.0.0.1:9443',pairingId:'host-read-loan-v3',devicePublicKey:'04'+Buffer.from(jwk.x,'base64url').toString('hex')+Buffer.from(jwk.y,'base64url').toString('hex'),deadlineMs:P.devicePagedNowV3()+9*3600000,chainId:'31337',
  ...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(name=>[name,sha(name)])),
  ...Object.fromEntries(['pool','state','native','math'].map((name,i)=>[name,'0x'+String(i+1).repeat(40)]))});
 const controller=new AbortController(),vault=await createDevicePagedGraphNoteVaultV3(descriptor,controller.signal);
 t.after(()=>vault.close());
 const C=await import('../../../packages/mobile-protocol/src/device-paged-graph-v3.mjs');
 const {createDevicePagedGraphApiV3}=await import('../src/api/device-paged-graph-api-v3.mjs');
 const recipient=generateKeyPairSync('x25519').publicKey.export({format:'der',type:'spki'}).toString('base64');
 let challengeNumber=0,epoch='2',serverJobs=[],serverNote=null,operationPosts=0;
 const ready=(mode,jobId)=>({type:'flat-private-proof-input-ready',profile:'ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1',...P.DEVICE_PAGED_MODES_V3[mode],jobId,recipientPublicKey:recipient});
 // Ready is the original exact transit shape; words is not a wire field.
 const exactReady=(mode,jobId)=>{const r=ready(mode,jobId);delete r.words;return r;};
 const api=createDevicePagedOwnerApiV3({descriptor,fetchImpl:async(url,options)=>{
  const request=JSON.parse(options.body);assert.equal(options.method,'POST');
  if(url.endsWith('/challenges'))return{status:200,text:async()=>JSON.stringify({...request,version:3,profile:P.DEVICE_PAGED_OWNER_V3,descriptor,challengeId:'host-arm-'+(++challengeNumber),nonce:sha('nonce'+challengeNumber),recipient:request.mode?exactReady(request.mode,request.jobId):null,expiresAt:P.devicePagedWallNowV3()+15000})};
  operationPosts++;assert.equal(request.consent.action,'READ_STATE','fixture never dispatches a proof or financial effect');
  assert.ok(verify('sha256',P.devicePagedPermissionMessageV3(request.consent),{key:device.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(request.signature,'hex')));
  const issuedAt=P.devicePagedWallNowV3();return{status:200,text:async()=>JSON.stringify({profile:P.DEVICE_PAGED_OWNER_V3,descriptor,jobs:serverJobs,note:serverNote,issuedAt,expiresAt:issuedAt+15000,blockHash:'0x'+sha('head'+challengeNumber),blockNumber:'1',blockTimestamp:String(BigInt(epoch)*600n),epoch})};
 }});t.after(()=>api.close());
 const pop=consent=>{let signature=sign('sha256',P.devicePagedPermissionMessageV3(consent),{key:device.privateKey,dsaEncoding:'ieee-p1363'});const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,s=BigInt('0x'+signature.subarray(32).toString('hex'));if(s>order/2n)signature=Buffer.concat([signature.subarray(0,32),Buffer.from((order-s).toString(16).padStart(64,'0'),'hex')]);return signature.toString('hex');};
 async function status(){const c=await api.challenge(await vault.readDraft());return api.submit(c,pop(c));}
 const initial=await status();await vault.acceptStatus(initial);const prepared=await vault.prepareDeposit(initial,'600');
 const noteDigest=sha(JSON.stringify(latestState.note)),root=prepared.draft.rootId,jobId=prepared.draft.jobId;
 const firstArm=await vault.prearmDraft(prepared.draft),firstConsent=await api.challenge(prepared.draft),beforeConsume=count(graphPrefix);
 await vault.consumeArm(firstArm,firstConsent);assert.equal(count(graphPrefix),beforeConsume,'no protected ROOT retrieval after signature');
 await assert.rejects(()=>vault.consumeArm(firstArm,firstConsent),/MOBILE_PAGED_SUBMISSION_ARM/);
 assert.equal(operationPosts,1,'consuming an arm never dispatches an effect');
 assert.equal((await vault.summary()).pending.jobId,jobId);
 const observedEmpty=await status();await vault.acceptStatus(observedEmpty);
 assert.equal((await vault.summary()).preparedDeposit.jobId,jobId,'missing server job retains the prepared note');
 await assert.rejects(()=>vault.resumePreparedDeposit(structuredClone(observedEmpty)),/MOBILE_PAGED_ORIGINAL_SDK/);
 const unchanged=await vault.resumePreparedDeposit(observedEmpty);
 assert.ok(sha(JSON.stringify(unchanged))===sha(JSON.stringify(prepared)),'same epoch preserves exact original draft and witness');
 epoch='3';const renewedRead=await status();await vault.acceptStatus(renewedRead);const renewed=await vault.resumePreparedDeposit(renewedRead);
 assert.equal(renewed.draft.jobId,jobId);assert.equal(renewed.draft.rootId,root);assert.equal(renewed.draft.revision,1);assert.equal(renewed.draft.publicInputs[16],epoch);
 assert.equal(sha(JSON.stringify(latestState.note)),noteDigest,'epoch renewal preserves private key, opening, commitment and nullifier');
 const expectedWitness={...prepared.witness,epoch,signature:renewed.witness.signature};
 assert.ok(sha(JSON.stringify(renewed.witness))===sha(JSON.stringify(expectedWitness)),'only epoch and note signature change in witness');
 const expectedDraft={...prepared.draft,publicInputs:prepared.draft.publicInputs.map((v,i)=>i===16?epoch:v),witnessSHA256:renewed.draft.witnessSHA256};
 assert.ok(sha(JSON.stringify(renewed.draft))===sha(JSON.stringify(expectedDraft)),'only epoch input and witness digest change in draft');
 assert.equal(renewed.draft.witnessSHA256,sha(JSON.stringify(renewed.witness)));
 const wrongArm=await vault.prearmDraft(renewed.draft),wrong=await api.challenge({...renewed.draft,jobId:'host-another-proof-job'});
 await assert.rejects(()=>vault.consumeArm(wrongArm,wrong),/MOBILE_PAGED_SUBMISSION_ARM/);
 await assert.rejects(async()=>vault.consumeArm(wrongArm,await api.challenge(renewed.draft)),/MOBILE_PAGED_SUBMISSION_ARM/);
 const copiedArm=await vault.prearmDraft(renewed.draft),copyConsent=await api.challenge(renewed.draft);
 await assert.rejects(()=>vault.consumeArm(copiedArm,structuredClone(copyConsent)),/MOBILE_PAGED_ORIGINAL_SDK/);
 await assert.rejects(()=>vault.consumeArm(copiedArm,copyConsent),/MOBILE_PAGED_SUBMISSION_ARM/);
 const casArm=await vault.prearmDraft(renewed.draft),casConsent=await api.challenge(renewed.draft),recordKey=[...store.keys()].find(k=>k.startsWith(graphPrefix)&&k.endsWith('.record')),record=store.get(recordKey);
 store.set(recordKey,record+' ');const beforeCas=count(graphPrefix);await assert.rejects(()=>vault.consumeArm(casArm,casConsent),/MOBILE_PAGED_STORAGE_CHANGED/);assert.equal(count(graphPrefix),beforeCas);store.set(recordKey,record);
 await assert.rejects(()=>vault.consumeArm(casArm,casConsent),/MOBILE_PAGED_SUBMISSION_ARM/);
 const crossArm=await vault.prearmDraft(renewed.draft),crossConsent=await api.challenge(renewed.draft),otherController=new AbortController(),other=await createDevicePagedNoteVaultV3(descriptor,otherController.signal);
 try{await assert.rejects(()=>other.consumeArm(crossArm,crossConsent),/MOBILE_PAGED_SUBMISSION_ARM/);await vault.consumeArm(crossArm,crossConsent);}finally{await other.close();}
 const expiredArm=await vault.prearmDraft(renewed.draft),expiredConsent=await api.challenge(renewed.draft);wall+=15000;
 await assert.rejects(()=>vault.consumeArm(expiredArm,expiredConsent),/MOBILE_PAGED_OWNER_BINDING/);await assert.rejects(()=>vault.resumePreparedDeposit(renewedRead),/MOBILE_PAGED_OWNER_BINDING/);
 const ownRow={profile:P.DEVICE_PAGED_OWNER_V3,descriptor,jobId,rootId:root,revision:1,mode:'deposit',publicInputs:renewed.draft.publicInputs,witnessSHA256:renewed.draft.witnessSHA256,proofSHA256:null,stage:'PROVING',commitment:null,nullifier:null,transactionHash:null,errorCode:null};
 serverJobs=[ownRow];const alreadyStarted=await status();await assert.rejects(()=>vault.resumePreparedDeposit(alreadyStarted),/MOBILE_PAGED_PREPARED_DEPOSIT/);
 const note=structuredClone(latestState.note);serverJobs=[{...ownRow,stage:'PROVED',proofSHA256:sha('host-proof'),commitment:note.commitment,nullifier:note.nullifier}];await vault.acceptStatus(await status());
 await assert.rejects(async()=>vault.resumePreparedDeposit(await status()),/MOBILE_PAGED_PREPARED_DEPOSIT/);
 assert.equal((await vault.summary()).preparedDeposit,null,'observed proof replaces preparation rather than proving again');
 const fundingDraft=await vault.effectDraft('FUND_D26',jobId),fundArm=await vault.prearmDraft(fundingDraft),fundConsent=await api.challenge(fundingDraft),beforeFund=count(graphPrefix);await vault.consumeArm(fundArm,fundConsent);assert.equal(count(graphPrefix),beforeFund);
 serverJobs=[{...serverJobs[0],stage:'CONFIRMED',transactionHash:'0x'+sha('host-tx')}];serverNote={commitment:note.commitment,nullifier:note.nullifier,state:'LIVE',amount:'600',available:'600',path:{root:sha('ledger'),index:'0',siblings:Array(8).fill('0'.repeat(64))}};
 const funded=await status();await vault.acceptStatus(funded);const terms={budget:'300',fundingNotBefore:'1800',fundingValidUntil:'2400',settleBefore:'3000'},originalSeed=await vault.prepareGraph(funded,terms);
 const oldHead=latestState.graph.head,oldKeys=[...store.keys()],newTerms={budget:'300',fundingNotBefore:'2400',fundingValidUntil:'3600',settleBefore:'4800'};
 await assert.rejects(()=>vault.renewUnsubmittedGraphPreparationV45(funded,newTerms),/MOBILE_PAGED_GRAPH_BEGIN_PREPARED/,'an unexpired seed cannot be changed');
 epoch='4';const freshSeedRead=await status();await vault.acceptStatus(freshSeedRead);
 await assert.rejects(()=>vault.renewUnsubmittedGraphPreparationV45(structuredClone(freshSeedRead),newTerms),/MOBILE_PAGED_ORIGINAL_SDK/);
 await assert.rejects(()=>vault.renewUnsubmittedGraphPreparationV45(freshSeedRead,{...newTerms,budget:'301'}),/MOBILE_PAGED_GRAPH_BEGIN_PREPARED/,'renewal cannot change the amount');
 const seed=await vault.renewUnsubmittedGraphPreparationV45(freshSeedRead,newTerms);
 assert.equal(seed.graphId,originalSeed.graphId);assert.deepEqual(seed.command,{...originalSeed.command,...newTerms},'only unsigned local deadlines change; all notes and operation identities survive');
 assert.notEqual(latestState.graph.head,oldHead);assert.ok(oldKeys.every(key=>store.has(key)),'renewal appends encrypted history without removing old records');
 const publicPreparation=await vault.graphAgentPreparationDataV5();assert.equal(publicPreparation.hasBeginCommand,false);assert.deepEqual(publicPreparation.terms,newTerms);
 assert.deepEqual(await vault.graphInitialBeginCommandV5(freshSeedRead),seed);
 const p=await vault.graphCommand('BEGIN_GRAPH',seed.command),commandHead=latestState.graph.head;
 epoch='7';const afterCommandRead=await status();await vault.acceptStatus(afterCommandRead);
 await assert.rejects(()=>vault.renewUnsubmittedGraphPreparationV45(afterCommandRead,{...newTerms,fundingNotBefore:'4200',fundingValidUntil:'4800',settleBefore:'5400'}),/MOBILE_PAGED_GRAPH_BEGIN_PREPARED/,'even a saved, unarmed command permanently fences deadline renewal');
 assert.equal(latestState.graph.head,commandHead);epoch='4';
 const graphApi=createDevicePagedGraphApiV3({descriptor,fetchImpl:async(url,options)=>{assert.ok(url.endsWith('/challenges'),'no graph/economic submit is executed');const request=JSON.parse(options.body);return{status:200,text:async()=>JSON.stringify({...request,version:3,profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,descriptor,challengeId:'host-graph-arm-'+(++challengeNumber),nonce:sha('graph-nonce'+challengeNumber),authorizationRoot:null,reserveNullifier:null,progressCommitment:null,recipient:exactReady('reserve',request.jobId),expiresAt:P.devicePagedWallNowV3()+15000})};}});t.after(()=>graphApi.close());
 const graphArm=await vault.armGraphCommand(p),graphConsent=await graphApi.challenge(p.action,p.graphId,p.jobId,p.rootId,p.revision,p.command),beforeGraph=count(graphPrefix);await vault.consumeArmedGraphConsent(graphArm,graphConsent);assert.equal(count(graphPrefix),beforeGraph,'graph entry sends without ROOT prompts after signing');
 await assert.rejects(()=>vault.consumeArmedGraphConsent(graphArm,graphConsent),/MOBILE_PAGED_SUBMISSION_ARM/);
 assert.equal((await vault.graphSummary()).beginPrepared,true,'local BEGIN remains recoverable without a graph reply');
 const emptyGraphRead=await status();await vault.acceptStatus(emptyGraphRead);
 await assert.rejects(()=>vault.resumeGraphBegin(structuredClone(emptyGraphRead)),/MOBILE_PAGED_ORIGINAL_SDK/);
 const preservedHead=latestState.graph.head,resumedBegin=await vault.resumeGraphBegin(emptyGraphRead);
 assert.equal(resumedBegin.graphId,p.graphId);assert.equal(resumedBegin.jobId,p.jobId);assert.equal(resumedBegin.rootId,p.rootId);assert.equal(resumedBegin.revision,p.revision);
 assert.ok(sha(JSON.stringify(resumedBegin.command))===sha(JSON.stringify(p.command)),'BEGIN recovery retains the exact operation, input, change and recovery openings');
 assert.equal(latestState.graph.head,preservedHead,'reading a prepared BEGIN adds no event, seed or job');
 const resumedArm=await vault.armGraphCommand(resumedBegin),resumedConsent=await graphApi.challenge(resumedBegin.action,resumedBegin.graphId,resumedBegin.jobId,resumedBegin.rootId,resumedBegin.revision,resumedBegin.command),beforeResumeConsume=count(graphPrefix);
 await vault.consumeArmedGraphConsent(resumedArm,resumedConsent);assert.equal(count(graphPrefix),beforeResumeConsume);
 await assert.rejects(()=>vault.armGraphCommand(resumedBegin),/MOBILE_PAGED_SUBMISSION_ARM/);
 const liveNote=serverNote;serverNote={...liveNote,state:'UNKNOWN',amount:null,available:null};const remotePresent=await status();
 await assert.rejects(()=>vault.resumeGraphBegin(remotePresent),/MOBILE_PAGED_GRAPH_BEGIN_SOURCE/);
 serverNote=liveNote;const rechecked=await status();await vault.acceptStatus(rechecked);const casBegin=await vault.resumeGraphBegin(rechecked);
 await vault.acceptStatus(await status());await assert.rejects(()=>vault.armGraphCommand(casBegin),/MOBILE_PAGED_STORAGE_CHANGED/);
 assert.equal(latestState.graph.pending.jobId,p.jobId,'failed recovery never releases or replaces the original BEGIN intent');

 const observe=await vault.graphCommand('OBSERVE_GRAPH',{}),observeArm=await vault.armGraphCommand(observe),observeConsent=await graphApi.challenge(observe.action,observe.graphId,observe.jobId,observe.rootId,observe.revision,observe.command);
 await assert.rejects(()=>vault.consumeArmedGraphConsent(observeArm,structuredClone(observeConsent)),/MOBILE_PAGED_GRAPH_ORIGINAL_SDK/);await assert.rejects(()=>vault.consumeArmedGraphConsent(observeArm,observeConsent),/MOBILE_PAGED_SUBMISSION_ARM/);
 const finalArm=await vault.armGraphCommand(observe);controller.abort();assert.throws(()=>vault.consumeArmedGraphConsent(finalArm,observeConsent),/MOBILE_PAGED_CUSTODY_CLOSED/);await vault.close();
 for(const value of [prepared.witness,unchanged.witness,renewed.witness,note,latestState.note,latestState.prepared?.witness])P.pagedOwnerWipeV3(value);
 assert.ok(imported.every(bytes=>bytes.every(byte=>byte===0)),'temporary ROOT imports are wiped');
});
