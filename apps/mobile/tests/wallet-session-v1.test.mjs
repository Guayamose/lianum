/** Session custody and actual SDK/Vault boundaries. Android biometrics/storage
 * are HOST ports; no APK, RPC, proof producer or financial effect runs here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

test('one login read, sealed original ROOTs, scoped approvals and fail-closed lock',async t=>{
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

 const rootName='lianum.device.paged.graph.v3.'+sha('legacy namespace')+'.root',root='12'.repeat(32),options={requireAuthentication:true,keychainAccessible:6,keychainService:rootName.slice(0,-5),authenticationPrompt:'HOST'};storage.set(rootName,root);
 assert.equal(await W.readWalletSessionSecret(rootName,options),root);assert.equal(count(rootName),1,'legacy ROOT is read once during migration');
 const envelopeName=[...storage.keys()].find(key=>key.startsWith('lianum.wallet.session.sealed-root.'));assert.ok(envelopeName);assert.equal(storage.get(rootName),root,'legacy authenticated ROOT remains unchanged');assert.ok(!storage.get(envelopeName).includes(root),'the unprotected envelope never contains plaintext ROOT');
 for(let i=0;i<4;i++)assert.equal(await W.readWalletSessionSecret(rootName,options),root);assert.equal(count(rootName),1);assert.equal(bios,0);assert.equal(count(privateSlot),1);
 await assert.rejects(()=>W.readWalletSessionSecret(rootName,{...options,requireAuthentication:false}),/SECRET_SCOPE/);
 await assert.rejects(()=>W.readWalletSessionSecret(rootName,{...options,keychainService:'another-service'}),/SECRET_SCOPE/);
 const replacement='34'.repeat(32);await W.writeWalletSessionSecret(rootName,replacement,options);assert.equal(await W.readWalletSessionSecret(rootName,options),replacement);assert.equal(storage.get(rootName),replacement);assert.equal(count(rootName),1,'writing and sealing does not reread a protected ROOT');

 // Actual integrated Vault birth/read uses the session wrapper and the same
 // persisted ROOT; repeats do not invoke either native authentication port.
 const {createDevicePagedGraphNoteVaultV3}=await import('../src/custody/device-paged-note-vault-v3.ts');const vault=await createDevicePagedGraphNoteVaultV3(descriptor);t.after(()=>vault.close());const initial=await vault.summary(),draft=await vault.readDraft();
 const vaultRoot=[...storage.keys()].find(key=>key.endsWith('.root')&&key!==rootName),vaultReads=count(vaultRoot);
 for(let i=0;i<3;i++){assert.equal((await vault.summary()).rootId,initial.rootId);assert.equal((await vault.readDraft()).rootId,draft.rootId);}assert.equal(count(vaultRoot),vaultReads);assert.equal(count(privateSlot),1);assert.equal(bios,0);

 const {createDevicePagedOwnerApiV3}=await import('../src/api/device-paged-owner-api-v3.mjs');let challenges=0;
 const words=hex=>Array.from({length:8},(_,i)=>BigInt('0x'+hex.slice(i*8,i*8+8)).toString()),rootId=sha('note-root'),jobId='paged-d26-host-session',inputs=[...words(descriptor.scope),...words(descriptor.policy),'1','600',...words(sha('output'))];
 const proofDraft=P.normalizeDevicePagedDraftV3({action:'PROVE_D26',jobId,rootId,revision:1,mode:'deposit',publicInputs:inputs,witnessSHA256:sha('witness'),authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null});
 const proofSHA256=sha('HOST original proof result bytes'),sourceRow={profile:P.DEVICE_PAGED_OWNER_V3,descriptor,jobId,rootId,revision:1,mode:'deposit',publicInputs:inputs,witnessSHA256:proofDraft.witnessSHA256,proofSHA256,stage:'PROVED',commitment:sha('output'),nullifier:sha('spent'),transactionHash:null,errorCode:null};
 const api=createDevicePagedOwnerApiV3({descriptor,fetchImpl:async(url,request)=>{const body=JSON.parse(request.body);if(url.endsWith('/challenges')){const r=body.mode?{type:'flat-private-proof-input-ready',profile:'ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1',relation:'deposit_balance',role:'owner',jobId:body.jobId,recipientPublicKey:'MCowBQYDK2VuAyEA'+'A'.repeat(43)+'='}:null;return{status:200,text:async()=>JSON.stringify({...body,version:3,profile:P.DEVICE_PAGED_OWNER_V3,descriptor,challengeId:'host-challenge-'+(++challenges),nonce:sha('nonce'+challenges),recipient:r,expiresAt:P.devicePagedWallNowV3()+15000})};}assert.equal(body.consent.action,'READ_STATE','no proof or financial effect is sent');const issuedAt=P.devicePagedWallNowV3();return{status:200,text:async()=>JSON.stringify({profile:P.DEVICE_PAGED_OWNER_V3,descriptor,jobs:[sourceRow],note:null,issuedAt,expiresAt:issuedAt+15000,blockHash:'0x'+sha('head'+challenges),blockNumber:'1',epoch:'1'})};}});t.after(()=>api.close());
 for(let i=0;i<3;i++){const read=await api.challenge(await vault.readDraft());assert.match(await W.signWalletSessionPagedOwnerV1(read,descriptor.origin,descriptor.pairingId),/^[0-9a-f]{128}$/);}assert.equal(count(privateSlot),1);assert.equal(bios,0);
 const approval=await W.approveWalletSessionPagedDepositV1(descriptor,proofDraft);assert.equal(bios,1);assert.equal(count(privateSlot),1,'financial approval signs from the already unlocked identity');
 const consent=await api.challenge(proofDraft);await assert.rejects(()=>W.signWalletSessionPagedOwnerV1(consent,descriptor.origin,descriptor.pairingId),/AUTHORIZATION/);
 const changed=await api.challenge({...proofDraft,jobId:'paged-d26-another-job'});await assert.rejects(()=>W.signWalletSessionPagedOwnerV1(changed,descriptor.origin,descriptor.pairingId,undefined,approval),/BINDING/);
 assert.match(await W.signWalletSessionPagedOwnerV1(consent,descriptor.origin,descriptor.pairingId,undefined,approval),/^[0-9a-f]{128}$/);await assert.rejects(()=>W.signWalletSessionPagedOwnerV1(consent,descriptor.origin,descriptor.pairingId,undefined,approval),/AUTHORIZATION_USED/);
 const fund=P.normalizeDevicePagedDraftV3({...proofDraft,action:'FUND_D26',mode:null,publicInputs:null,witnessSHA256:null,proofSHA256});const fundConsent=await api.challenge(fund);
 await assert.rejects(()=>W.signWalletSessionPagedOwnerV1(fundConsent,descriptor.origin,descriptor.pairingId,undefined,approval),/AUTHORIZATION/);
 const readConsent=await api.challenge(await vault.readDraft()),readSig=await W.signWalletSessionPagedOwnerV1(readConsent,descriptor.origin,descriptor.pairingId),original=await api.submit(readConsent,readSig);
 assert.throws(()=>W.bindWalletSessionPagedDepositV1(approval,structuredClone(original)),/ORIGINAL_SDK/);W.bindWalletSessionPagedDepositV1(approval,original);
 assert.match(await W.signWalletSessionPagedOwnerV1(fundConsent,descriptor.origin,descriptor.pairingId,undefined,approval),/^[0-9a-f]{128}$/);assert.equal(bios,1,'the same exact deposit approval covers PROVE and its original FUND result');W.closeWalletSessionAuthorizationV1(approval);

 // Actual managed historical approval + Original SDK row binding. The local
 // issuer's ROOT preimage is a HOST custody fixture; Vault note/AEAD selection
 // is exercised by the coupled recovery fixture, not inferred from these DATA.
 const H=await import('../src/custody/device-paged-historical-withdrawal-review-v16.mjs');
 const heldRoot=Uint8Array.from(randomBytes(32)),heldRootId=sha(heldRoot),oldDescriptor=P.normalizeDevicePagedDescriptorV3({...descriptor,pairingId:'host-expired-graph-v16',deadlineMs:P.devicePagedNowV3()-1000}),broker=P.normalizeDevicePagedDescriptorV3({...descriptor,pairingId:'host-fresh-broker-v16'});
 let custodyActive=true;const issuer=H.createDevicePagedHistoricalWithdrawalViewIssuerV16(heldRoot,oldDescriptor,()=>assert.ok(custodyActive,'HOST_CUSTODY_CLOSED'),1);heldRoot.fill(0);
 const historicalTerms={sourceDescriptor:oldDescriptor,brokerDescriptor:broker,rootId:heldRootId,revision:1,graphId:'paged-graph-'+'a'.repeat(32),authorizationRoot:sha('old authorization'),phase:'RECOVERED',role:'recovery',id:null,commitment:sha('retained terminal note'),nullifier:sha('retained terminal nullifier'),amount:'23',epoch:'7',recipient:'0x'+'f'.repeat(40),x:sha('x'),y:sha('y'),message:'12'.repeat(32),expiresAt:P.devicePagedNowV3()+59000};
 const view=issuer.review(historicalTerms,()=>assert.ok(custodyActive,'HOST_CUSTODY_CLOSED'));
 assert.throws(()=>H.readDevicePagedHistoricalWithdrawalReviewV16(structuredClone(view)),/HISTORICAL_WITHDRAWAL/);
 for(const changed of [{brokerDescriptor:oldDescriptor},{brokerDescriptor:{...broker,pool:'0x'+'9'.repeat(40)}},{role:'payout',id:'pay1'},{amount:'0'}])assert.throws(()=>issuer.review({...historicalTerms,...changed},()=>{}));
 const historicalBio=bios,historicalApproval=await W.approveWalletSessionPagedHistoricalWithdrawalV16(view);assert.equal(bios,historicalBio+1);
 assert.throws(()=>W.consumeWalletSessionPagedHistoricalNoteSignatureV16(historicalApproval,structuredClone(view)),/HISTORICAL_WITHDRAWAL|BINDING/);
 W.consumeWalletSessionPagedHistoricalNoteSignatureV16(historicalApproval,view);assert.throws(()=>W.consumeWalletSessionPagedHistoricalNoteSignatureV16(historicalApproval,view),/AUTHORIZATION_USED/);
 const withdrawalInputs=[...words(broker.scope),...words(broker.policy),view.epoch,...words(sha('canonical root')),...words(view.nullifier),view.amount,...Array.from({length:5},(_,i)=>BigInt('0x'+view.recipient.slice(2+i*8,10+i*8)).toString())];
 const historicalDraft=P.normalizeDevicePagedDraftV3({action:'PROVE_W39',jobId:'paged-historical-proof-v16',rootId:heldRootId,revision:1,mode:'withdraw',publicInputs:withdrawalInputs,witnessSHA256:sha('retained terminal witness'),authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null});
 const historicalRow={...sourceRow,descriptor:broker,jobId:historicalDraft.jobId,rootId:heldRootId,mode:'withdraw',publicInputs:withdrawalInputs,witnessSHA256:historicalDraft.witnessSHA256,commitment:null,nullifier:view.nullifier};
 let historicalChallenges=0;const historicalApi=createDevicePagedOwnerApiV3({descriptor:broker,fetchImpl:async(url,request)=>{const body=JSON.parse(request.body);if(url.endsWith('/challenges'))return{status:200,text:async()=>JSON.stringify({...body,version:3,profile:P.DEVICE_PAGED_OWNER_V3,descriptor:broker,challengeId:'host-historical-challenge-'+(++historicalChallenges),nonce:sha('historical nonce '+historicalChallenges),recipient:body.mode?{type:'flat-private-proof-input-ready',profile:'ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1',relation:'funded_graph_paged_withdraw',role:'recipient',jobId:body.jobId,recipientPublicKey:'MCowBQYDK2VuAyEA'+'A'.repeat(43)+'='}:null,expiresAt:P.devicePagedWallNowV3()+15000})};assert.equal(body.consent.action,'OBSERVE_JOB','HOST reads an Original SDK row; no proof or withdrawal POST');return{status:200,text:async()=>JSON.stringify(historicalRow)};}});t.after(()=>historicalApi.close());
 const hsign=c=>W.signWalletSessionPagedOwnerV1(c,broker.origin,broker.pairingId,undefined,historicalApproval);
 for(const [index,value] of [[16,'8'],[25,'1'],[33,'24'],[34,'1']]){const changed=[...withdrawalInputs];changed[index]=value;await assert.rejects(()=>historicalApi.challenge({...historicalDraft,publicInputs:changed}).then(hsign),/BINDING/);}
 const historicalProve=await historicalApi.challenge(historicalDraft);assert.match(await hsign(historicalProve),/^[0-9a-f]{128}$/);await assert.rejects(()=>hsign(historicalProve),/AUTHORIZATION/);
 const historicalEffect={...historicalDraft,action:'WITHDRAW_W39',mode:null,publicInputs:null,witnessSHA256:null,proofSHA256};
 await assert.rejects(()=>historicalApi.challenge(historicalEffect).then(hsign),/AUTHORIZATION/);
 const historicalObserve=await historicalApi.challenge({...historicalEffect,action:'OBSERVE_JOB'}),historicalObserved=await historicalApi.submit(historicalObserve,await W.signWalletSessionPagedOwnerV1(historicalObserve,broker.origin,broker.pairingId));
 assert.throws(()=>W.bindWalletSessionPagedHistoricalWithdrawalProofV16(historicalApproval,structuredClone(historicalObserved)),/ORIGINAL_SDK/);W.bindWalletSessionPagedHistoricalWithdrawalProofV16(historicalApproval,historicalObserved);
 await assert.rejects(()=>historicalApi.challenge({...historicalEffect,proofSHA256:sha('other proof')}).then(hsign),/AUTHORIZATION/);
 const historicalWithdraw=await historicalApi.challenge(historicalEffect);assert.match(await hsign(historicalWithdraw),/^[0-9a-f]{128}$/);await assert.rejects(()=>hsign(historicalWithdraw),/AUTHORIZATION_USED/);assert.equal(bios,historicalBio+1,'one fresh approval covers note signature, exact proof and its bound effect');
 custodyActive=false;assert.throws(()=>W.bindWalletSessionPagedHistoricalWithdrawalProofV16(historicalApproval,historicalObserved),/HOST_CUSTODY_CLOSED/);W.closeWalletSessionAuthorizationV1(historicalApproval);

 const noteBio=bios,noteApproval=await W.approveWalletSessionPagedNoteWithdrawalV10(broker,historicalDraft);assert.equal(bios,noteBio+1);
 const noteSign=c=>W.signWalletSessionPagedOwnerV1(c,broker.origin,broker.pairingId,undefined,noteApproval);
 for(const [index,value]of [[25,'1'],[33,'24'],[34,'1']]){const changed=[...withdrawalInputs];changed[index]=value;await assert.rejects(()=>historicalApi.challenge({...historicalDraft,publicInputs:changed}).then(noteSign),/BINDING/);}
 await assert.rejects(()=>historicalApi.challenge(historicalEffect).then(noteSign),/BINDING/);
 const noteProve=await historicalApi.challenge(historicalDraft);assert.match(await noteSign(noteProve),/^[0-9a-f]{128}$/);await assert.rejects(()=>noteSign(noteProve),/AUTHORIZATION_USED/);
 assert.throws(()=>W.bindWalletSessionPagedNoteWithdrawalV10(noteApproval,structuredClone(historicalObserved)),/ORIGINAL_SDK/);W.bindWalletSessionPagedNoteWithdrawalV10(noteApproval,historicalObserved);
 await assert.rejects(()=>historicalApi.challenge({...historicalEffect,proofSHA256:sha('other proof')}).then(noteSign),/BINDING/);
 const noteWithdraw=await historicalApi.challenge(historicalEffect);assert.match(await noteSign(noteWithdraw),/^[0-9a-f]{128}$/);await assert.rejects(()=>noteSign(noteWithdraw),/AUTHORIZATION_USED/);assert.equal(bios,noteBio+1);W.closeWalletSessionAuthorizationV1(noteApproval);

 // A derived custody scope stores only session-encrypted bytes; its original
 // authenticated source remains unchanged. Copies cannot cross invalidation.
 const aliasName='lianum.device.paged.v3.'+sha('session-derived custody')+'.root',aliasOptions={...options,keychainService:aliasName.slice(0,-5)};
 await W.copyWalletSessionSecretV10(rootName,options,aliasName,aliasOptions);assert.equal(storage.has(aliasName),false,'no additional per-operation Android authenticated ROOT write');assert.equal(await W.readWalletSessionSecret(aliasName,aliasOptions),replacement);assert.equal(storage.get(rootName),replacement);
 const aliasStorage=JSON.stringify([...storage]);await W.copyWalletSessionSecretV10(rootName,options,aliasName,aliasOptions);assert.equal(JSON.stringify([...storage]),aliasStorage,'same encrypted copy is idempotent');
 await assert.rejects(W.copyWalletSessionSecretV10(rootName,options,rootName,options),/SECRET_SCOPE/);await assert.rejects(W.copyWalletSessionSecretV10(rootName,options,aliasName,{...aliasOptions,keychainService:'foreign'}),/SECRET_SCOPE/);
 const raceAlias='lianum.device.paged.v3.'+sha('interrupted derived custody')+'.root',raceAliasOptions={...options,keychainService:raceAlias.slice(0,-5)},nativeCrypto=await import('expo-crypto');let copyBegin,copyResume;
 const copyStarted=new Promise(resolve=>copyBegin=resolve),copyGate=new Promise(resolve=>copyResume=resolve),originalImport=nativeCrypto.AESEncryptionKey.import;
 const intercepted=t.mock.method(nativeCrypto.AESEncryptionKey,'import',async function(...args){copyBegin();await copyGate;return originalImport.apply(this,args);});
 try{const pendingCopy=W.copyWalletSessionSecretV10(rootName,options,raceAlias,raceAliasOptions);await copyStarted;await W.invalidateWalletSessionSecret(rootName,options);copyResume();await assert.rejects(pendingCopy,/SECRET_CHANGED/);assert.equal(storage.has(raceAlias),false);}finally{copyResume();intercepted.mock.restore();}
 assert.equal(await W.readWalletSessionSecret(rootName,options),replacement);

 // A pending migration cannot commit old ROOT bytes across invalidation.
 const racedName='lianum.device.paged.graph.v3.'+sha('raced namespace')+'.root',raceOptions={...options,keychainService:racedName.slice(0,-5)};storage.set(racedName,'56'.repeat(32));let begin,finish;const started=new Promise(resolve=>begin=resolve),gate=new Promise(resolve=>finish=resolve);releaseRoot={key:racedName,started:begin,gate};const pending=W.readWalletSessionSecret(racedName,raceOptions);await started;await W.invalidateWalletSessionSecret(racedName,raceOptions);storage.set(racedName,'78'.repeat(32));finish();await assert.rejects(()=>pending,/SECRET_CHANGED/);releaseRoot=null;
 assert.equal(await W.readWalletSessionSecret(racedName,raceOptions),'78'.repeat(32));

 const readsBeforeLock=count(privateSlot),rootReadsBeforeLock=count(rootName),bioBeforeLock=bios;W.lockWalletSessionV1();assert.equal(W.walletSessionStatusV1().managed,true);assert.equal(W.walletSessionStatusV1().active,false);
 await assert.rejects(()=>W.readWalletSessionSecret(rootName,options),/LOCKED/);await assert.rejects(async()=>vault.summary(),/LOCKED/);await assert.rejects(()=>W.signWalletSessionPagedOwnerV1(consent,descriptor.origin,descriptor.pairingId),/LOCKED/);assert.equal(count(privateSlot),readsBeforeLock);assert.equal(count(rootName),rootReadsBeforeLock);assert.equal(bios,bioBeforeLock,'lock never silently reopens native authentication');
 await assert.rejects(()=>W.copyWalletSessionSecretV10(rootName,options,aliasName,aliasOptions),/LOCKED/);
 await W.openWalletSessionV1();assert.equal(count(privateSlot),2);assert.equal(await W.readWalletSessionSecret(rootName,options),replacement);assert.equal(count(rootName),rootReadsBeforeLock,'subsequent logins decrypt the preserved sealed ROOT');
 app.currentState='background';for(const callback of appListeners)callback('background');assert.equal(W.walletSessionStatusV1().active,false);await assert.rejects(()=>W.openWalletSessionV1(),/LOCKED/);assert.equal(count(privateSlot),2);app.currentState='active';
 await W.openWalletSessionV1();assert.equal(count(privateSlot),3);await W.readWalletSessionSecret(rootName,options);t.mock.timers.tick(15*60*1000);assert.equal(W.walletSessionStatusV1().active,false,'normal ROOT reads do not renew the idle timer');await assert.rejects(()=>W.readWalletSessionSecret(rootName,options),/LOCKED/);assert.equal(count(privateSlot),3);
 assert.equal(storage.get(privateSlot),privateHex);assert.equal(storage.get(publicSlot),publicKey);assert.ok(imports.every(bytes=>bytes.every(byte=>byte===0)),'lock wipes session wrapping bytes and temporary ROOT imports');
});
