import test from 'node:test';
import assert from 'node:assert/strict';
import { proofMetricsForTransport } from '../../src/jobs/role-client.mjs';
import { ownerCopy } from '../../../custody/src/signing/flat-owner-custody.mjs';
import {createPrivateProofRecipientV1,readPrivateProofRecipientV1,sealPrivateProofJobV1,
  openPrivateProofJobV1,closePrivateProofRecipientV1,privateProofBindingSHA256V1,
  wipePrivateProofInputsV1} from '../../src/jobs/private-proof-transit-v1.mjs';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('HOST private U SDK binds original preparation and ciphertext recipient; only selected encrypted role packets return', {timeout:20000}, async t=>{
  // Actual SDK, PoP, funded signatures, envelope builder and recipient crypto.
  // Expo AES and SHA-based field hash are explicit HOST ports, not Poseidon2,
  // a proof producer, an original account or financial acceptance.
  const physical=(a,b)=>{const p=new URL(a,import.meta.url);return existsSync(p)?p:new URL(b,import.meta.url);};
  const sdkURL=physical('../../../../apps/mobile/src/api/device-external-flat-graph-api-v1.mjs','../../../../../apps/mobile/src/api/device-external-flat-graph-api-v1.mjs');
  const cryptoURL=new URL('./device-private-graph-proof-transit-v2.mjs',sdkURL),deriveURL=physical('../../src/jobs/private-device-authorization-input-v2.mjs','./private-device-authorization-input-v2.mjs');
  const {registerHooks}=await import('node:module');
  const oracle=`import{createHash,randomBytes,createCipheriv}from'node:crypto';export const CryptoDigestAlgorithm={SHA256:'SHA256'};
    export const getRandomBytesAsync=async n=>new Uint8Array(randomBytes(n));export const digest=async(_,b)=>new Uint8Array(createHash('sha256').update(new Uint8Array(b)).digest()).buffer;
    export const AESEncryptionKey={import:async b=>({bytes:new Uint8Array(b)})};export const aesEncryptAsync=async(b,k,o)=>{const c=createCipheriv('aes-256-gcm',k.bytes,o.nonce.bytes);c.setAAD(o.additionalData);const e=Buffer.concat([c.update(b),c.final()]),all=Buffer.concat([Buffer.from(o.nonce.bytes),e,c.getAuthTag()]);k.bytes.fill(0);e.fill(0);return{combined:async format=>{const s=all.toString(format);all.fill(0);return s;}};};`;
  const hashPort=`import{createHash}from'node:crypto';export const withFlatHash=work=>work(async fields=>'00'+createHash('sha256').update(fields.map(v=>v.toString()).join(':')).digest('hex').slice(2));`;
  const hook=registerHooks({resolve(specifier,context,next){
    if(specifier==='expo-crypto'&&[sdkURL.href,cryptoURL.href].includes(context.parentURL))return{url:'data:text/javascript,'+encodeURIComponent(oracle),shortCircuit:true};
    if(context.parentURL===deriveURL.href&&['../tooling/scoped-proof-tools.mjs','./scoped-proof-tools.mjs'].includes(specifier))return{url:'data:text/javascript,'+encodeURIComponent(hashPort),shortCircuit:true};return next(specifier,context);
  }});t.after(()=>hook.deregister());
  const P=await import(physical('../../../mobile-protocol/src/device-external-flat-graph-v1.mjs','../../../mobile-protocol/src/device-external-flat-graph-v1.mjs'));
  const Note=await import(physical('../../../mobile-protocol/src/device-external-flat-note-v1.mjs','../../../mobile-protocol/src/device-external-flat-note-v1.mjs'));
  const {deriveOriginalDeviceAuthorizationJobV2}=await import(deriveURL),{sealOriginalDeviceAuthorizationWitnessV2}=await import(cryptoURL),sdk=await import(sdkURL);
  const {freshKey,signature}=await import(physical('../../../engine/src/notes/private-note-encoding.mjs','../../../omnichain-product/src/private-note-encoding.mjs'));
  const {compileFundedGraph,fundedSigningRequests}=await import(physical('../../../engine/src/execution/graph/funded-graph.mjs','../../../omnichain-product/src/paeg/funded-graph.mjs'));
  const {nativeReceiptKeyCommitment,nativeTransferActionCommitment}=await import(physical('../../../engine/src/execution/native/dispatch/native-capsules.mjs','../../../omnichain-product/src/paeg/native-capsules.mjs'));
  const h=v=>createHash('sha256').update(v).digest('hex'),hx=b=>Buffer.from(b).toString('hex'),owner=freshKey(),change=freshKey(),recovery=freshKey(),payee=freshKey(),device=freshKey();
  const domain=Object.fromEntries(['scope','policy','asset','hubDomain','registryCommitment','verifierSetCommitment','ledgerNamespace'].map(k=>[k,h('private-u-'+k)]));domain.ledgerNamespace=domain.hubDomain;
  const note=(key,value,label)=>({type:4,rho:h(label+'-rho'),x:hx(key.x),y:hx(key.y),value,secret:h(label+'-secret')});
  const action={chainDomain:h('U-chain'),signerIdentity:h('U-signer'),sourceCommitment:h('U-native-source'),destinationCommitment:h('U-native-target'),amount:'25',custodyKind:1,custodyCommitment:h('U-custody'),executionFrom:'100',executionUntil:'800',settleBefore:'900',receiptKeyCommitment:nativeReceiptKeyCommitment(domain.hubDomain,h('U-receipt-secret')),receiptRho:h('U-receipt-rho'),deliveryRiskCommitment:h('U-risk'),actionSalt:h('U-action-salt')};
  const input={scope:domain.scope,policy:domain.policy,asset:domain.asset,operationId:h('U-operation'),budget:'25',fundingNotBefore:'100',fundingValidUntil:'300',settleBefore:'900',reservationNonce:h('U-reservation'),reserveSecret:h('U-reserve'),graphNonce:h('U-graph'),inputNote:note(owner,'32','U-input'),changeNote:note(change,'7','U-change'),recoveryNote:note(recovery,'25','U-recovery'),nodes:[{id:'node-0',chainDomain:action.chainDomain,evidencePolicy:h('U-evidence'),actionCommitment:nativeTransferActionCommitment(action),dependsOn:[],payout:{x:hx(payee.x),y:hx(payee.y),value:'25',secret:h('U-payout-secret'),randomness:h('U-payout-randomness')}}],paddingSalts:Array.from({length:4},(_,i)=>h('U-padding-'+i))};
  const compiled=compileFundedGraph(input),requests=fundedSigningRequests(compiled),witness=P.normalizeDeviceReservationWitnessV1({input,ownerSignature:hx(signature(owner,requests.owner.message)),invoiceSignatures:requests.invoices.map(r=>hx(signature(payee,r.message))),envelopePreparation:{capsuleOptions:{nodes:[{id:'node-0',action,receiptSpendSecret:h('U-receipt-secret')}],slotSalts:Array.from({length:4},(_,i)=>({targetSalt:h('U-target-'+i),localCapsuleSalt:h('U-local-'+i),dependencyCapsuleSalt:h('U-dependency-'+i)}))},joinBlinds:Array.from({length:4},(_,i)=>h('U-join-'+i)),leafBlinds:Array.from({length:16},(_,i)=>h('U-leaf-'+i))}});
  const statement=compiled.authorizationStatement,bytes=P.deviceReservationWitnessBytesV1(witness),witnessSHA256=h(bytes);bytes.fill(0);
  const descriptor=Note.normalizeExternalFlatDescriptorV1({profile:Note.DEVICE_EXTERNAL_FLAT_NOTE_V1,origin:'https://localhost:9443',pairingId:h('U-pair'),devicePublicKey:'04'+hx(device.x)+hx(device.y),lifetime:h('U-life'),poolTerms:{pool:'12'.repeat(20),poolCodeHash:h('U-code'),scope:domain.scope,policy:domain.policy,assetIdentity:domain.asset,asset:'34'.repeat(20),assetCodeHash:h('U-asset-code'),genesis:h('U-genesis'),domainCommitment:'01'.repeat(32),hub:'56'.repeat(20),hubCodeHash:h('U-hub-code'),hubDomain:domain.hubDomain,ledgerNamespace:domain.ledgerNamespace},assetMetadata:{kind:'ERC20',symbol:'USDC',decimals:6}});
  const {ownerAuthorizationMessage}=await import(physical('../../../engine/src/execution/graph/funded-graph.mjs','../../../omnichain-product/src/paeg/funded-graph.mjs'));
  const frame=ownerAuthorizationMessage(statement),draft=P.normalizeExternalFlatGraphDraftV1({action:'PROVE_U',depositJobId:h('U-deposit'),rootId:h('U-root'),quoteId:h('U-quote'),jobId:h('U-job'),custody:{rootId:h('U-root'),noteRevision:1,encryptedRecordSHA256:h('U-record'),frameSHA256:h(frame),sourceCommitment:statement.inputCommitment,sourceNullifier:statement.inputNullifier,changeCommitment:statement.changeCommitment,recoveryCommitment:statement.recoveryCommitment},statement,witnessSHA256,proofSHA256:null,publicInputsSHA256:null});frame.fill(0);
  const proposal=Object.fromEntries(['scope','policy','asset','operationId','budget','fundingNotBefore','fundingValidUntil','settleBefore','nodes'].map(k=>[k,input[k]]));
  const make=job=>{const recipient=createPrivateProofRecipientV1({relation:'authorization',role:'owner',jobId:job}),resultRecipient=createPrivateProofRecipientV1({relation:'authorization',role:'owner',jobId:job});
    const c={profile:P.DEVICE_EXTERNAL_FLAT_GRAPH_V1,descriptor,challengeId:h(job+'-challenge'),nonce:h(job+'-nonce'),expiresAt:Date.now()+15000,draft,observed:{blockNumber:'1',blockHash:h('U-head'),timestamp:'100'},openingDisclosure:'ONE_FUNDED_OWNER_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER',privateProof:{profile:P.DEVICE_EXTERNAL_FLAT_PRIVATE_U_V2,recipient:readPrivateProofRecipientV1(recipient),resultRecipient:readPrivateProofRecipientV1(resultRecipient),context:{domain,proposalSHA256:P.externalFlatGraphPrivateDigestV2(proposal),capsuleOptionsSHA256:P.externalFlatGraphPrivateDigestV2(witness.envelopePreparation.capsuleOptions),invoiceSignaturesSHA256:P.externalFlatGraphPrivateDigestV2(witness.invoiceSignatures),sourceAmount:input.inputNote.value},transcriptSHA256:'1'.repeat(64)}};
    const t=P.externalFlatGraphPrivateTranscriptBytesV2(c);try{c.privateProof.transcriptSHA256=h(t);}finally{t.fill(0);}return{recipient,resultRecipient,c:P.normalizeExternalFlatGraphConsentV1(c)};};
  const original=make('private-u-job'),c=original.c,sign=v=>hx(signature(device,v.action==='ACCESS'?Note.externalFlatPermissionMessageV1(v):P.externalFlatGraphPermissionMessageV1(v)));
  let posts=0,derived,packet;const response=v=>new Response(JSON.stringify(v),{status:200,headers:{'content-type':'application/json'}});
  const client=sdk.createDeviceExternalFlatGraphApiV1({descriptor,fetchImpl:async(url,init)=>{
    const request=JSON.parse(init.body),route=new URL(url).pathname.split('/').at(-1);
    if(route==='challenges')return response({profile:descriptor.profile,action:'ACCESS',origin:descriptor.origin,pairingId:descriptor.pairingId,devicePublicKey:descriptor.devicePublicKey,challengeId:h('U-access'),nonce:h('U-access-nonce'),expiresAt:Date.now()+15000});
    if(route==='reviews'){assert.deepEqual(request.draft,draft);return response(c);}
    assert.equal(route,'private-operations');posts++;packet=structuredClone(request.witness);
    for(const value of [input.inputNote.rho,input.inputNote.secret,input.changeNote.secret,input.recoveryNote.secret,h('U-receipt-secret'),'"inputNote"','"envelopePreparation"','"joinBlinds"','"leafBlinds"'])assert.equal(init.body.includes(value),false,'HOST_PRIVATE_U_NO_CLEAR_WITNESS');
    const opened=openPrivateProofJobV1(original.recipient,request.witness);let returned;
    try{returned=await deriveOriginalDeviceAuthorizationJobV2(opened,{name:'authorization'});derived=returned.derivation;assert.equal(derived.sourceAmount,'32');assert.equal(derived.outputs.change.amount,'7');assert.equal(derived.outputs.recovery.amount,'25');
      const sealed=sealPrivateProofJobV1(returned.resultRecipient,{inputs:derived,expectedPublicInputs:opened.expectedPublicInputs,authorization:opened.authorization});assert.equal(JSON.stringify(sealed).includes(h('U-receipt-secret')),false);
      const own=openPrivateProofJobV1(original.resultRecipient,sealed);try{assert.deepEqual(own.inputs,derived);assert.deepEqual(own.expectedPublicInputs,derived.expectedPublicInputs);}finally{wipePrivateProofInputsV1(own.inputs);}
    }finally{wipePrivateProofInputsV1(opened.inputs);}
    return response({profile:P.DEVICE_EXTERNAL_FLAT_GRAPH_V1,descriptor,reservation:{jobId:draft.jobId,stage:'PROVED',consentFields:{...Object.fromEntries(['depositJobId','quoteId','jobId','custody','statement','witnessSHA256'].map(k=>[k,draft[k]])),proofSHA256:h('inert-Uproof'),publicInputsSHA256:h(JSON.stringify(derived.expectedPublicInputs))},statement,observation:null,errorCode:null,authorizationSHA256:h(P.externalFlatGraphPermissionMessageV1(c))},graph:{stage:'PREPARED',outcome:null,terminal:null},outputs:[]});
  }});
  try{const a=await client.challenge(),review=await client.review(a,sign(a),draft),row=await client.submit(review,sign(review),witness);assert.equal(sdk.readDeviceExternalFlatGraphRowV1(row),row);assert.throws(()=>sdk.readDeviceExternalFlatGraphRowV1(structuredClone(row)));await assert.rejects(client.submit(review,sign(review),witness));assert.equal(posts,1);assert.throws(()=>openPrivateProofJobV1(original.recipient,packet),/ONE_HANDOFF/);
    await assert.rejects(deriveOriginalDeviceAuthorizationJobV2({inputs:{profile:'DEVICE_U_PRIVATE_WITNESS_INPUT_V2',consent:c,signature:sign(c),witness}},{name:'authorization'}));
    const changed=structuredClone(c);changed.privateProof.context.proposalSHA256=h('foreign-U-context');await assert.rejects(sealOriginalDeviceAuthorizationWitnessV2(changed,sign(changed),witness));
    const bad=make('private-u-bad-signer'),wire=await sealOriginalDeviceAuthorizationWitnessV2(bad.c,hx(signature(owner,P.externalFlatGraphPermissionMessageV1(bad.c))),witness),opened=openPrivateProofJobV1(bad.recipient,wire);try{await assert.rejects(deriveOriginalDeviceAuthorizationJobV2(opened,{name:'authorization'}),/PW_PRIVATE_U_DEVICE_SIGNATURE/);}finally{wipePrivateProofInputsV1(opened.inputs);closePrivateProofRecipientV1(bad.resultRecipient);}
    const corrupt=make('private-u-corrupt'),valid=await sealOriginalDeviceAuthorizationWitnessV2(corrupt.c,sign(corrupt.c),witness),copy=structuredClone(valid);copy.tag=Buffer.alloc(16).toString('base64');assert.throws(()=>openPrivateProofJobV1(corrupt.recipient,copy),/INVALID_ENCRYPTED_JOB/);assert.throws(()=>openPrivateProofJobV1(corrupt.recipient,valid),/ONE_HANDOFF/);closePrivateProofRecipientV1(corrupt.resultRecipient);
    client.close();assert.throws(()=>sdk.readDeviceExternalFlatGraphRowV1(row));
  }finally{client.close();P.wipeDeviceReservationWitnessV1(witness);wipePrivateProofInputsV1(derived);wipePrivateProofInputsV1(input);}
});

test('HOST original PC23 second encrypted IPC preserves binding, burns corruption and drains disconnect', {timeout:20000}, async()=>{
 // Two real fresh IPC children use the production crypto/request validator.
 // Only a witness digest returns: no Noir/proof/acceptedResult is manufactured.
 const physical=(a,b)=>{const first=new URL(a,import.meta.url);return existsSync(first)?first:new URL(b,import.meta.url);};
 const transit=physical('../../src/jobs/private-proof-transit-v1.mjs','./private-proof-transit-v1.mjs'),work=physical('../../src/jobs/wallet-note-private-prover-v4.mjs','./wallet-note-private-prover-v4.mjs');
 const encoding=physical('../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs','../../../omnichain-product/src/private-wallet-note-encoding.mjs');
 const {ORIGINAL_WALLET_PRIVATE_PROVER_V4,readOriginalWalletNoteProverRequestV4}=await import(work);
 const {walletInputPublicWords,walletDepositInput}=await import(encoding);
 const notes=physical('../../../engine/src/notes/private-note-encoding.mjs','../../../omnichain-product/src/private-note-encoding.mjs'),{freshKey}=await import(notes);
 const owner=freshKey(),note={type:4,...owner,rho:Buffer.alloc(32,7),secret:Buffer.alloc(32,9),value:'20'},mode='deposit_balance',scope='10'.repeat(32),policy='20'.repeat(32);
 const input=walletDepositInput({scope,policy,epoch:'10',note}),expected=walletInputPublicWords(mode,input),authorization={kind:'ORIGINAL_CONSENT_V1',jobId:'31'.repeat(32),consentSHA256:'41'.repeat(32),witnessSHA256:createHash('sha256').update(JSON.stringify(input)).digest('hex')};
 const payload={inputs:{profile:ORIGINAL_WALLET_PRIVATE_PROVER_V4,protocol:'LIANUM_PRIVATE_PROOF_PROCESS_V1',purpose:'owner',operation:'prove',mode,label:'host-private-pc23',input},expectedPublicInputs:expected,authorization};
 const fresh=()=>createPrivateProofRecipientV1({relation:mode,role:'owner',jobId:'host-pc23-corruption'});
 for(const change of [p=>p.tag=Buffer.alloc(16).toString('base64'),p=>p.role='recipient',p=>p.authorization.consentSHA256='99'.repeat(32),p=>p.publicInputsSHA256='99'.repeat(32)]){
  const own=fresh(),good=sealPrivateProofJobV1(readPrivateProofRecipientV1(own),payload),corrupt=structuredClone(good);change(corrupt);assert.throws(()=>openPrivateProofJobV1(own,corrupt));assert.throws(()=>openPrivateProofJobV1(own,good),/ONE_HANDOFF/);
 }
 const own=fresh(),opened=openPrivateProofJobV1(own,sealPrivateProofJobV1(readPrivateProofRecipientV1(own),payload));
 try{assert.deepEqual(readOriginalWalletNoteProverRequestV4(opened,mode).expected,expected);assert.throws(()=>readOriginalWalletNoteProverRequestV4(structuredClone(opened),mode),/ORIGINAL_RECIPIENT/);opened.inputs.mode='withdraw_balance';assert.throws(()=>readOriginalWalletNoteProverRequestV4(opened,mode),/PRIVATE_SCOPE/);}finally{wipePrivateProofInputsV1(opened.inputs);}
 const script=`import assert from'node:assert/strict';import{spawn}from'node:child_process';import{createHash}from'node:crypto';
  import{preparePrivateProofJobV1,sealPrivateProofJobV1,privateProofBindingSHA256V1,wipePrivateProofInputsV1}from${JSON.stringify(transit.href)};
  import{readOriginalWalletNoteProverRequestV4}from${JSON.stringify(work.href)};
  import{walletInputPublicWords}from${JSON.stringify(encoding.href)};
  const mode='deposit_balance',stage=process.argv[1];let opened;
  try{opened=await preparePrivateProofJobV1({relation:mode,role:'owner',jobId:'host-pc23-'+stage});const current=readOriginalWalletNoteProverRequestV4(opened,mode);
   assert.deepEqual(walletInputPublicWords(mode,current.request.input),current.expected);
   if(stage==='second'){await new Promise((resolve,reject)=>process.send({type:'host-public-digest',digest:createHash('sha256').update(JSON.stringify(current.request.input)).digest('hex'),binding:privateProofBindingSHA256V1(current.binding)},e=>e?reject(e):resolve()));}
   else{const child=spawn(process.execPath,['--input-type=module','-e',process.env.HOST_PC23_SOURCE,'second'],{env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},stdio:['ignore','pipe','pipe','ipc'],serialization:'advanced'});
    const completed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>code===0&&signal===null?resolve():reject(Error('HOST_PC23_EXIT')));});let sent=false,output=0;
    for(const stream of[child.stdout,child.stderr])stream.on('data',b=>{output+=b.length;b.fill(0);if(output>4096)child.kill('SIGTERM');});
    child.on('message',m=>{if(m.type==='host-public-digest'){process.send(m);return;}assert.equal(sent,false);sent=true;const packet=sealPrivateProofJobV1(m,opened);assert.equal(Object.hasOwn(packet,'inputs'),false);child.send(packet,()=>wipePrivateProofInputsV1(packet));wipePrivateProofInputsV1(opened.inputs);});
    await completed;assert.equal(sent,true);assert.equal(output,0);}
  }catch{process.exitCode=1;}finally{wipePrivateProofInputsV1(opened?.inputs);if(process.connected)process.disconnect();}`;
 const children=[],drains=[];let output=0,timer;
 const start=stage=>{const child=spawn(process.execPath,['--input-type=module','-e',script,stage],{env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',HOST_PC23_SOURCE:script},stdio:['ignore','pipe','pipe','ipc'],serialization:'advanced'});children.push(child);
  for(const stream of[child.stdout,child.stderr])stream.on('data',b=>{output+=b.length;b.fill(0);if(output>4096)child.kill('SIGTERM');});
  const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));}),closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});return{child,exited,closed};};
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('HOST_PC23_PRIVATE_IPC_TIMEOUT')),15000);});
 try{
  const first=start('first');drains.push(first.closed);let returned,sent=false;first.child.on('message',m=>{if(m.type==='host-public-digest'){returned=m;return;}assert.equal(sent,false);sent=true;const packet=sealPrivateProofJobV1(m,payload);assert.equal(JSON.stringify(packet).includes('"secret"'),false);first.child.send(packet,()=>wipePrivateProofInputsV1(packet));});
  assert.deepEqual(await Promise.race([first.closed,deadline]),{code:0,signal:null});assert.equal(sent,true);assert.deepEqual(returned,{type:'host-public-digest',digest:createHash('sha256').update(JSON.stringify(input)).digest('hex'),binding:privateProofBindingSHA256V1(authorization)});
  const disconnected=start('second');drains.push(disconnected.exited);disconnected.child.once('message',()=>disconnected.child.disconnect());assert.deepEqual(await Promise.race([disconnected.exited,deadline]),{code:1,signal:null});
  assert.equal(existsSync('/proc/'+disconnected.child.pid),false,'HOST_PC23_PRIVATE_IPC_PID_ABSENT');for(const stream of[disconnected.child.stdout,disconnected.child.stderr])stream.destroy();assert.equal(output,0);
 }finally{
  clearTimeout(timer);for(const child of children){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');if(child.connected)child.disconnect();for(const stream of[child.stdout,child.stderr])stream?.destroy();}
  let drain;try{await Promise.race([Promise.allSettled(drains),new Promise((_,reject)=>{drain=setTimeout(()=>reject(Error('HOST_PC23_PRIVATE_IPC_DRAIN_TIMEOUT')),1000);})]);}finally{clearTimeout(drain);wipePrivateProofInputsV1(input);note.rho.fill(0);note.secret.fill(0);owner.privateKey=null;note.privateKey=null;}
 }
});

test('fractional measured durations cross unchanged integer-only owner transport as strings', () => {
  const metrics = { initializationMilliseconds: 36985.618175, jobPreparationMilliseconds: 22.837479000000002,
    witnessMilliseconds: 1384.2186120000042, proofMilliseconds: 123896.52390700001,
    verificationMilliseconds: 20.284783000010066, totalMilliseconds: 162801.040808,
    otherMilliseconds: 491.55785199995444 };
  const encoded = proofMetricsForTransport(metrics);
  assert.deepEqual(ownerCopy({ metrics: encoded }).metrics, encoded);
  for (const name of Object.keys(metrics)) assert.equal(Number(encoded[name]), metrics[name]);
  assert.throws(() => ownerCopy({ circuitValue: 1.5 }), /safe integer/);
  for (const value of [NaN, Infinity, -1, -0, '1.5'])
    assert.throws(() => proofMetricsForTransport({ ...metrics, proofMilliseconds: value }), /MEASURED_DURATION/);
});

test('original private proof transit encrypts two actual IPC hops and burns corrupt or replayed jobs', {timeout:20000}, async () => {
  const phase=value=>process.stderr.write(JSON.stringify({code:'HOST_PRIVATE_TRANSIT_PHASE',phase:value})+'\n');
  phase('CRYPTO');
  // Original transport and ABI validator; the short child is an explicit HOST
  // recipient. It produces no proof, account, consent or economic authority.
  const canonical = new URL('../../src/jobs/private-proof-transit-v1.mjs', import.meta.url);
  const transitURL = existsSync(canonical) ? canonical : new URL('./private-proof-transit-v1.mjs', import.meta.url);
  const trustedCanonical = new URL('../../src/jobs/trusted-jobs.mjs', import.meta.url);
  const trustedURL = existsSync(trustedCanonical) ? trustedCanonical : new URL('./trusted-jobs.mjs', import.meta.url);
  const scope = {relation:'deposit_intent',role:'owner',jobId:'11111111-1111-4111-8111-111111111111'};
  const marker = 'PRIVATE_HOST_WITNESS_NEVER_PRINTED';
  const authorization = {kind:'ORIGINAL_CONSENT_V1',jobId:'12'.repeat(32),
    consentSHA256:'34'.repeat(32),witnessSHA256:'56'.repeat(32)};
  const input = {inputs:{secret:marker,array:['17','18']},expectedPublicInputs:['1','2'],authorization};
  const h = bytes => createHash('sha256').update(bytes).digest('hex');
  const recipient = createPrivateProofRecipientV1(scope), ready = readPrivateProofRecipientV1(recipient);
  const packet = sealPrivateProofJobV1(ready,input);
  const wire = JSON.stringify(packet);
  assert.equal(wire.includes(marker),false);assert.equal(Object.hasOwn(packet,'inputs'),false);
  const opened = openPrivateProofJobV1(recipient,packet);
  assert.deepEqual(opened.inputs,input.inputs);assert.deepEqual(opened.authorization,authorization);
  assert.throws(()=>openPrivateProofJobV1(recipient,packet),/ONE_HANDOFF/);
  assert.throws(()=>readPrivateProofRecipientV1(recipient),/RECIPIENT_REQUIRED/);
  wipePrivateProofInputsV1(opened.inputs);assert.equal(opened.inputs.secret,null);
  for (const change of [p=>p.role='local',p=>p.relation='node',p=>p.jobId='other-job-id',
    p=>p.authorization.consentSHA256='99'.repeat(32),p=>p.authorization.jobId='99'.repeat(32),
    p=>p.authorization.witnessSHA256='99'.repeat(32),p=>p.publicInputsSHA256='99'.repeat(32),
    p=>p.tag=Buffer.alloc(16).toString('base64'),p=>p.ciphertext='AA==']) {
    const r=createPrivateProofRecipientV1(scope), p=sealPrivateProofJobV1(readPrivateProofRecipientV1(r),input);
    const corrupt=structuredClone(p);change(corrupt);assert.throws(()=>openPrivateProofJobV1(r,corrupt),/INVALID_ENCRYPTED_JOB/);
    assert.throws(()=>openPrivateProofJobV1(r,corrupt),/ONE_HANDOFF/);
  }
  const foreign=createPrivateProofRecipientV1(scope);
  assert.throws(()=>openPrivateProofJobV1(foreign,packet),/INVALID_ENCRYPTED_JOB/);
  assert.throws(()=>openPrivateProofJobV1(Object.freeze({}),packet),/ONE_HANDOFF/);
  const closed=createPrivateProofRecipientV1(scope);closePrivateProofRecipientV1(closed);
  assert.throws(()=>readPrivateProofRecipientV1(closed),/RECIPIENT_REQUIRED/);
  assert.throws(()=>sealPrivateProofJobV1(ready,{...input,inputs:{secret:'x'.repeat(2097153)}}),/INPUT_BOUND/);
  let getters=0;
  assert.throws(()=>sealPrivateProofJobV1(ready,{...input,inputs:{get secret(){getters++;return marker;}}}),/INPUT_DATA/);
  assert.throws(()=>sealPrivateProofJobV1(ready,{...input,inputs:new Proxy({},{get(){getters++;}})}),/INPUT_DATA/);
  assert.equal(getters,0);
  // Two fresh processes perform the same original decrypt/validate/reencrypt
  // path. Only hashes/phase/length cross back; no private value reaches stdout.
  const childSource = `import assert from 'node:assert/strict';
    import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';
    import {preparePrivateProofJobV1,sealPrivateProofJobV1,privateProofBindingSHA256V1,wipePrivateProofInputsV1} from ${JSON.stringify(transitURL.href)};
    import {validateJobAgainstABI} from ${JSON.stringify(trustedURL.href)};
    const scope=${JSON.stringify(scope)},target=process.argv[1];
    let job;try{job=await preparePrivateProofJobV1(scope);
      if(target==='last'){
        // Synthetic ABI is labelled HOST: only the genuine ABI adapter body
        // is exercised here, not a compiled circuit or published verifier.
        const abi={parameters:[{name:'words',visibility:'public',type:{kind:'array',length:27,type:{kind:'field'}}},
          {name:'secret',visibility:'private',type:{kind:'field'}}]};
        const checked=validateJobAgainstABI(abi,job.inputs,job.expectedPublicInputs,'deposit_intent');
        process.send({type:'host-completed',digest:createHash('sha256').update(JSON.stringify(checked)).digest('hex'),
          binding:privateProofBindingSHA256V1(job.authorization)});wipePrivateProofInputsV1(checked.inputs);
      }else{
        const child=spawn(process.execPath,['--input-type=module','-e',process.env.HOST_CHILD_SOURCE,'last'],
          {env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},stdio:['ignore','pipe','pipe','ipc'],serialization:'json'});
        let sent=false,output=0;const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>code===0&&signal===null?resolve():reject(Error('HOST_CHILD_EXIT')));});
        for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output+=b.length;if(output>4096)child.kill('SIGTERM');});
        child.on('message',message=>{if(message.type==='host-completed'){process.send(message);return;}
          assert.equal(sent,false);sent=true;const sealed=sealPrivateProofJobV1(message,job);
          assert.equal(Object.hasOwn(sealed,'inputs'),false);child.send(sealed);wipePrivateProofInputsV1(job.inputs);});
        await done;assert.equal(output,0);assert.equal(sent,true);
      }
    }catch{process.exitCode=1;if(process.connected)process.send({type:'host-failed',code:'HOST_PRIVATE_TRANSIT_FAILED'});}
    finally{wipePrivateProofInputsV1(job?.inputs);if(process.connected)process.disconnect();}`;
  const real = {inputs:{words:Array(27).fill('1'),secret:'17'},expectedPublicInputs:Array(27).fill('1'),authorization};
  const processes=[],closings=[];let output='';
  const kernel=child=>{try{const text=readFileSync('/proc/'+child.pid+'/stat','utf8'),parts=text.slice(text.lastIndexOf(')')+2).trim().split(/\s+/);return{startTicks:parts[19],state:parts[0]};}catch{return null;}};
  const start=mode=>{
    const child=spawn(process.execPath,['--input-type=module','-e',childSource,mode],
      {env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',HOST_CHILD_SOURCE:childSource},stdio:['ignore','pipe','pipe','ipc'],serialization:'json'});
    processes.push(child);
    for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output+=bytes.toString('utf8');if(output.length>4096)child.kill('SIGTERM');});
    const completion=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
    const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
    // Early parent.disconnect can suppress Node CLOSE despite a reaped EXIT.
    // The negative case asserts EXIT, physical absence and explicit I/O drain.
    closings.push(mode==='last'?exited:completion);return{child,completion,exited};
  };
  const timers=[];let currentPhase='FIRST_IPC';
  const deadline=new Promise((_,reject)=>timers.push(setTimeout(()=>reject(Error('HOST_PRIVATE_TRANSIT_TIMEOUT_'+currentPhase)),18000)));
  try{
    phase(currentPhase);
    const {child,completion}=start('first');let actual, sent=false;

    child.on('message',message=>{
      if(message.type==='host-completed'){actual=message;return;}
      if(message.type==='host-failed')return;
      assert.equal(sent,false);sent=true;const p=sealPrivateProofJobV1(message,real);
      assert.equal(JSON.stringify(p).includes('"secret"'),false);child.send(p);
    });
    assert.deepEqual(await Promise.race([completion,deadline]),{code:0,signal:null});assert.equal(sent,true);
    assert.deepEqual(actual,{type:'host-completed',digest:h(JSON.stringify({inputs:real.inputs,expectedPublicInputs:real.expectedPublicInputs})),
      binding:privateProofBindingSHA256V1(authorization)});
    currentPhase='DISCONNECT';phase(currentPhase);
    const disconnected=start('last');

    disconnected.child.once('message',()=>disconnected.child.disconnect());
    assert.deepEqual(await Promise.race([disconnected.exited,deadline]),{code:1,signal:null});
    assert.equal(kernel(disconnected.child),null,'HOST_PRIVATE_DISCONNECT_PHYSICAL_ABSENCE');
    assert.equal(disconnected.child.connected,false,'HOST_PRIVATE_DISCONNECT_CHANNEL');
    for(const stream of [disconnected.child.stdout,disconnected.child.stderr])stream.destroy();
    assert.equal(output,'');
    for(const child of processes){assert.equal(child.exitCode!==null,true);assert.equal(child.connected,false);}
  }finally{
    currentPhase='DRAIN';phase(currentPhase);
    for(const timer of timers)clearTimeout(timer);
    for(const child of processes){
      if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
      if(child.connected)child.disconnect();
      for(const stream of [child.stdout,child.stderr])stream?.destroy();
    }
    let drainTimer;
    try{await Promise.race([Promise.allSettled(closings),new Promise((_,reject)=>{drainTimer=setTimeout(()=>reject(Error('HOST_PRIVATE_TRANSIT_DRAIN_TIMEOUT')),1000);})]);}
    finally{clearTimeout(drainTimer);}
  }
  // Fixed runtime source pins include the new leaf. Pinned compiler intake
  // continues untouched, and the production senders have no clear fallback.
  const sourceCanonical=new URL('../../src/jobs/proving-execution.mjs',import.meta.url);
  const sourceURL=existsSync(sourceCanonical)?sourceCanonical:new URL('./proving-execution.mjs',import.meta.url);
  assert.equal(readFileSync(sourceURL,'utf8').includes("'proof-workers/private-proof-transit-v1.mjs'"),true);
});

test('HOST private D27 SDK sends only recipient ciphertext and original recipient validates signed witness and CM/NF', {timeout:20000}, async t => {
  // Actual SDK/protocol/X25519/HKDF/recipient/derivation, with an explicit
  // Node AES oracle for Expo. This response fixture issues no economic proof.
  const physical=(a,b)=>{const first=new URL(a,import.meta.url);return existsSync(first)?first:new URL(b,import.meta.url);};
  const sdkURL=physical('../../../../apps/mobile/src/api/device-external-flat-note-api-v1.mjs','../../../../../apps/mobile/src/api/device-external-flat-note-api-v1.mjs'),cryptoURL=new URL('./device-private-proof-transit-v2.mjs',sdkURL);
  const {registerHooks}=await import('node:module');
  const oracle=`import{createHash,randomBytes,createCipheriv}from'node:crypto';
    export const CryptoDigestAlgorithm={SHA256:'SHA256'};
    export const getRandomBytesAsync=async n=>new Uint8Array(randomBytes(n));
    export const digest=async(_,b)=>new Uint8Array(createHash('sha256').update(new Uint8Array(b)).digest()).buffer;
    export const AESEncryptionKey={import:async b=>({bytes:new Uint8Array(b)})};
    export const aesEncryptAsync=async(b,k,o)=>{const cipher=createCipheriv('aes-256-gcm',k.bytes,o.nonce.bytes);cipher.setAAD(o.additionalData);
      const encrypted=Buffer.concat([cipher.update(b),cipher.final()]),all=Buffer.concat([Buffer.from(o.nonce.bytes),encrypted,cipher.getAuthTag()]);
      k.bytes.fill(0);encrypted.fill(0);return{combined:async encoding=>{const result=all.toString(encoding);all.fill(0);return result;}};};`;
  const hook=registerHooks({resolve(specifier,context,next){if(specifier==='expo-crypto'&&[sdkURL.href,cryptoURL.href].includes(context.parentURL))return{url:'data:text/javascript,'+encodeURIComponent(oracle),shortCircuit:true};return next(specifier,context);}});t.after(()=>hook.deregister());
  const P=await import(physical('../../../mobile-protocol/src/device-external-flat-note-v1.mjs','../../../mobile-protocol/src/device-external-flat-note-v1.mjs'));
  const {deriveOriginalDeviceDepositIntentJobV2}=await import(physical('../../src/jobs/private-device-proof-input-v2.mjs','./private-device-proof-input-v2.mjs'));
  const {sealOriginalDeviceDepositIntentWitnessV2}=await import(cryptoURL),sdk=await import(sdkURL);
  const {freshKey,signature,nullifier}=await import(physical('../../../engine/src/notes/private-note-encoding.mjs','../../../omnichain-product/src/private-note-encoding.mjs'));
  const {balanceCommitment}=await import(physical('../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs','../../../omnichain-product/src/private-wallet-note-encoding.mjs'));
  const {depositIntentWitness,depositIntentFrame}=await import(physical('../../../backend/src/execution/account/preparation/deposit-intent.mjs','../wallet-platform/modules/paeg/deposit-intent.mjs'));
  const h=bytes=>createHash('sha256').update(bytes).digest('hex'),device=freshKey(),owner=freshKey();
  const descriptor=P.normalizeExternalFlatDescriptorV1({profile:P.DEVICE_EXTERNAL_FLAT_SHARE_V1,origin:'https://localhost:9443',pairingId:h('private-pair'),devicePublicKey:'04'+device.x.toString('hex')+device.y.toString('hex'),lifetime:h('private-life'),
    poolTerms:Object.fromEntries(['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace'].map(k=>[k,h('private-'+k).slice(0,['pool','asset','hub'].includes(k)?40:64)])),assetMetadata:{kind:'ERC20',symbol:'SHARE',decimals:6}});
  const note={type:4,rho:h('private-rho'),x:owner.x.toString('hex'),y:owner.y.toString('hex'),value:'20',secret:h('private-secret')};
  const statement={scope:descriptor.poolTerms.scope,policy:descriptor.poolTerms.policy,validFrom:'6000',validUntil:'9000',amount:note.value,output:balanceCommitment(descriptor.poolTerms.scope,descriptor.poolTerms.policy,note).toString('hex')};
  const prepared=depositIntentWitness({statement,note,signature:signature(owner,depositIntentFrame(statement)).toString('hex')}),witness=structuredClone(prepared.inputs);
  const witnessBytes=P.externalFlatWitnessBytesV1('deposit_intent',witness),witnessSHA256=h(witnessBytes);witnessBytes.fill(0);
  const makeConsent=ready=>{const c={profile:descriptor.profile,action:'PROVE_D27',descriptor,challengeId:h('private-challenge'),nonce:h('private-nonce'),expiresAt:Date.now()+15000,
    jobId:h('private-device-job'),depositJobId:h('private-device-job'),rootId:h('private-root'),noteRevision:1,recipient:'90'.repeat(20),statement,path:null,witnessSHA256,proofSHA256:null,publicInputsSHA256:null,
    observed:{blockNumber:'1',blockHash:h('private-head'),timestamp:'6000'},openingDisclosure:P.DEVICE_EXTERNAL_FLAT_OPENING_V1,
    privateProof:{profile:P.DEVICE_EXTERNAL_FLAT_PRIVATE_D27_V2,recipient:ready,transcriptSHA256:'1'.repeat(64)}};
    c.privateProof.transcriptSHA256=h(P.externalFlatPrivateProofTranscriptBytesV2(c));return P.normalizeExternalFlatConsentV1(c);};
  const recipient=createPrivateProofRecipientV1({relation:'deposit_intent',role:'owner',jobId:'private-recipient-job'}),consent=makeConsent(readPrivateProofRecipientV1(recipient));
  const signatures=new WeakMap(),signatureFor=c=>{let v=signatures.get(c);if(!v){v=signature(device,P.externalFlatPermissionMessageV1(c)).toString('hex');signatures.set(c,v);}return v;};
  let posts=0,derivation,wirePacket;const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
  const client=sdk.createDeviceExternalFlatNoteApiV1({descriptor,fetchImpl:async(target,init)=>{
    const request=JSON.parse(init.body),action=new URL(target).pathname.split('/').at(-1);
    if(action==='challenges')return response({profile:descriptor.profile,action:'ACCESS',origin:descriptor.origin,pairingId:descriptor.pairingId,devicePublicKey:descriptor.devicePublicKey,challengeId:h('private-access'),nonce:h('private-access-nonce'),expiresAt:Date.now()+15000});
    if(action==='reviews'){assert.deepEqual(request.draft.statement,statement);return response({consent});}
    assert.equal(action,'private-operations');posts++;wirePacket=structuredClone(request.witness);
    for(const key of ['"rho"','"key_x"','"key_y"','"secret"','"inputs"'])assert.equal(init.body.includes(key),false,'HOST_PRIVATE_D27_NO_CLEAR_WITNESS');
    assert.equal(init.body.includes(note.secret),false);assert.equal(init.body.includes(note.rho),false);assert.equal(request.signature,signatureFor(consent));
    const opened=openPrivateProofJobV1(recipient,request.witness);derivation=deriveOriginalDeviceDepositIntentJobV2(opened,{name:'deposit_intent'});
    assert.deepEqual(opened.inputs,prepared.inputs);wipePrivateProofInputsV1(opened.inputs);
    const fields=Object.fromEntries(['jobId','depositJobId','rootId','noteRevision','recipient','statement','path','witnessSHA256'].map(k=>[k,consent[k]]));
    return response({profile:descriptor.profile,descriptor,jobId:consent.jobId,mode:'deposit_intent',stage:'PROVED',consentFields:{...fields,proofSHA256:h('inert-proof-port'),publicInputsSHA256:h(JSON.stringify(prepared.publicInputs))},observation:null,errorCode:null});
  }});
  try{
    const access=await client.challenge(),draft={action:'PROVE_D27',jobId:null,rootId:consent.rootId,noteRevision:1,recipient:consent.recipient,statement,path:null,witnessSHA256};
    const reviewed=await client.review(access,signatureFor(access),draft),signed=signatureFor(reviewed);signatures.set(consent,signed);
    const row=await client.submit(reviewed,signed,witness);assert.equal(sdk.readDeviceExternalFlatRowV1(row),row);assert.throws(()=>sdk.readDeviceExternalFlatRowV1(structuredClone(row)));
    assert.equal(posts,1);await assert.rejects(client.submit(reviewed,signed,witness));assert.equal(posts,1);
    assert.deepEqual(derivation,{profile:'ORIGINAL_DEVICE_D27_PRIVATE_DERIVATION_V2',jobId:consent.jobId,commitment:statement.output,nullifier:nullifier(statement.scope,statement.output,note.secret).toString('hex'),consentSHA256:h(P.externalFlatPermissionMessageV1(consent)),witnessSHA256});
    assert.throws(()=>openPrivateProofJobV1(recipient,wirePacket),/ONE_HANDOFF/);
    assert.throws(()=>deriveOriginalDeviceDepositIntentJobV2({inputs:{profile:'DEVICE_D27_PRIVATE_WITNESS_INPUT_V2',consent,signature:signed,witness}},{name:'deposit_intent'}));
    for(const alter of [c=>c.privateProof.transcriptSHA256=h('foreign-transcript'),c=>c.privateProof.recipient.jobId='foreign-recipient-job']){const changed=structuredClone(consent);alter(changed);await assert.rejects(sealOriginalDeviceDepositIntentWitnessV2(changed,signed,witness));}
    const other=createPrivateProofRecipientV1({relation:'deposit_intent',role:'owner',jobId:'private-recipient-job'});assert.throws(()=>openPrivateProofJobV1(other,wirePacket),/INVALID_ENCRYPTED_JOB/);
    const corruptRecipient=createPrivateProofRecipientV1({relation:'deposit_intent',role:'owner',jobId:'private-corrupt-job'}),corruptConsent=makeConsent(readPrivateProofRecipientV1(corruptRecipient));
    const packet=await sealOriginalDeviceDepositIntentWitnessV2(corruptConsent,signatureFor(corruptConsent),witness),copy=structuredClone(packet);copy.tag=Buffer.alloc(16).toString('base64');
    assert.throws(()=>openPrivateProofJobV1(corruptRecipient,copy),/INVALID_ENCRYPTED_JOB/);assert.throws(()=>openPrivateProofJobV1(corruptRecipient,packet),/ONE_HANDOFF/);
    // An encrypted packet is not permission: the original recipient also
    // verifies the registered device PoP before deriving circuit inputs.
    const badSignerRecipient=createPrivateProofRecipientV1({relation:'deposit_intent',role:'owner',jobId:'private-wrong-signer'}),badSignerConsent=makeConsent(readPrivateProofRecipientV1(badSignerRecipient));
    const wrongSignature=signature(owner,P.externalFlatPermissionMessageV1(badSignerConsent)).toString('hex');
    const wrongPacket=await sealOriginalDeviceDepositIntentWitnessV2(badSignerConsent,wrongSignature,witness),wrongOpened=openPrivateProofJobV1(badSignerRecipient,wrongPacket);
    try{assert.throws(()=>deriveOriginalDeviceDepositIntentJobV2(wrongOpened,{name:'deposit_intent'}),/PW_PRIVATE_D27_DEVICE_SIGNATURE/);}
    finally{wipePrivateProofInputsV1(wrongOpened.inputs);}
    client.close();assert.throws(()=>sdk.readDeviceExternalFlatRowV1(row));
  }finally{client.close();P.externalFlatWipeV1(witness);wipePrivateProofInputsV1(note);}
});

test('HOST private original26/39 SDK hides openings and same recipient validates original PC23 tuple/path/signatures', {timeout:20000}, async t=>{
 // Original mobile transport/crypto/PC23 derivation. Response rows below are
 // explicit inert ports; this case creates no proof, pool credit or payment.
  const physical=(a,b)=>{const first=new URL(a,import.meta.url);return existsSync(first)?first:new URL(b,import.meta.url);};
  const sdkURL=physical('../../../../apps/mobile/src/api/device-external-flat-note-api-v1.mjs','../../../../../apps/mobile/src/api/device-external-flat-note-api-v1.mjs'),cryptoURL=new URL('./device-private-proof-transit-v2.mjs',sdkURL);
  const graphSdkURL=new URL('./device-external-flat-graph-api-v1.mjs',sdkURL);
  const {registerHooks}=await import('node:module');
  const oracle=`import{createHash,randomBytes,createCipheriv}from'node:crypto';
    export const CryptoDigestAlgorithm={SHA256:'SHA256'};
    export const getRandomBytesAsync=async n=>new Uint8Array(randomBytes(n));
    export const digest=async(_,b)=>new Uint8Array(createHash('sha256').update(new Uint8Array(b)).digest()).buffer;
    export const AESEncryptionKey={import:async b=>({bytes:new Uint8Array(b)})};
    export const aesEncryptAsync=async(b,k,o)=>{const cipher=createCipheriv('aes-256-gcm',k.bytes,o.nonce.bytes);cipher.setAAD(o.additionalData);
      const encrypted=Buffer.concat([cipher.update(b),cipher.final()]),all=Buffer.concat([Buffer.from(o.nonce.bytes),encrypted,cipher.getAuthTag()]);
      k.bytes.fill(0);encrypted.fill(0);return{combined:async encoding=>{const result=all.toString(encoding);all.fill(0);return result;}};};`;
  const hook=registerHooks({resolve(specifier,context,next){if(specifier==='expo-crypto'&&[sdkURL.href,graphSdkURL.href,cryptoURL.href].includes(context.parentURL))return{url:'data:text/javascript,'+encodeURIComponent(oracle),shortCircuit:true};return next(specifier,context);}});t.after(()=>hook.deregister());

 const P=await import(physical('../../../mobile-protocol/src/device-external-flat-note-v1.mjs','../../../mobile-protocol/src/device-external-flat-note-v1.mjs'));
 const {deriveOriginalDeviceWalletNoteJobV3}=await import(physical('../../src/jobs/private-device-wallet-note-input-v3.mjs','./private-device-wallet-note-input-v3.mjs'));
 const {sealOriginalDeviceWalletNoteWitnessV3,sealOriginalDeviceGraphOutputWitnessV3}=await import(cryptoURL),sdk=await import(sdkURL),graphSdk=await import(graphSdkURL),Graph=await import(physical('../../../mobile-protocol/src/device-external-flat-graph-v1.mjs','../../../mobile-protocol/src/device-external-flat-graph-v1.mjs'));
 const {freshKey,signature,nullifier}=await import(physical('../../../engine/src/notes/private-note-encoding.mjs','../../../omnichain-product/src/private-note-encoding.mjs'));
 const {balanceCommitment,walletDepositInput,walletWithdrawInput}=await import(physical('../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs','../../../omnichain-product/src/private-wallet-note-encoding.mjs'));
 const {PrivateNoteTree}=await import(physical('../../../engine/src/notes/private-note-tree.mjs','../../../omnichain-product/src/private-note-tree.mjs'));
 const h=b=>createHash('sha256').update(b).digest('hex'),device=freshKey(),owner=freshKey();
 for(const [mode,profile,role] of [['deposit_balance',P.DEVICE_EXTERNAL_FLAT_NOTE_V1,null],['withdraw_balance',P.DEVICE_EXTERNAL_FLAT_NOTE_V1,null],['withdraw_balance',P.DEVICE_EXTERNAL_FLAT_SHARE_V1,null],['withdraw_balance',P.DEVICE_EXTERNAL_FLAT_NOTE_V1,'change'],['withdraw_balance',P.DEVICE_EXTERNAL_FLAT_NOTE_V1,'recovery']]){
  const label=mode+profile+(role??''),descriptor=P.normalizeExternalFlatDescriptorV1({profile,origin:'https://localhost:9443',pairingId:h(label+'pair'),devicePublicKey:'04'+device.x.toString('hex')+device.y.toString('hex'),lifetime:h(label+'life'),
   poolTerms:Object.fromEntries(['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace'].map(k=>[k,h(label+k).slice(0,['pool','asset','hub'].includes(k)?40:64)])),assetMetadata:{kind:'ERC20',symbol:'NOTE',decimals:6}});
  const note={type:4,rho:Buffer.from(h(label+'rho'),'hex'),...owner,value:'20',secret:Buffer.from(h(label+'secret'),'hex')};
  const scope=descriptor.poolTerms.scope,policy=descriptor.poolTerms.policy,cm=balanceCommitment(scope,policy,note).toString('hex'),nf=nullifier(scope,cm,note.secret).toString('hex'),tree=new PrivateNoteTree(['0x'+cm]),originalPath=tree.path(0),recipient='90'.repeat(20),path={root:originalPath.root.slice(2),index:0,leaf:cm,siblings:originalPath.siblings.map(s=>s.slice(2))};
  const deposit=mode==='deposit_balance',statement=deposit?{scope,policy,epoch:'10',amount:note.value,output:cm}:{scope,policy,epoch:'10',root:path.root,nullifier:nf,amount:note.value,recipient,commitment:cm};
  const witness=deposit?walletDepositInput({scope,policy,epoch:'10',note}):walletWithdrawInput({scope,policy,epoch:'10',note,path:originalPath,recipient});
  const bytes=P.externalFlatWitnessBytesV1(mode,witness),witnessSHA256=h(bytes);bytes.fill(0);
  const make=ready=>{const c={profile,action:deposit?'PROVE_D26':'PROVE_W39',descriptor,challengeId:h(label+'challenge'),nonce:h(label+'nonce'),expiresAt:Date.now()+15000,jobId:h(label+'job'),depositJobId:deposit?h(label+'job'):h(label+'parent'),rootId:h(label+'root'),noteRevision:1,recipient,statement,path:deposit?null:path,witnessSHA256,proofSHA256:null,publicInputsSHA256:null,observed:{blockNumber:'1',blockHash:h(label+'head'),timestamp:'6000'},openingDisclosure:P.DEVICE_EXTERNAL_FLAT_OPENING_V1,
   privateProof:{profile:P.DEVICE_EXTERNAL_FLAT_PRIVATE_WALLET_V3,recipient:ready,noteRole:role,transcriptSHA256:'1'.repeat(64)}};c.privateProof.transcriptSHA256=h(P.externalFlatPrivateWalletTranscriptBytesV3(c));return role?Graph.normalizeExternalFlatGraphOutputConsentV1({profile:Graph.DEVICE_EXTERNAL_FLAT_GRAPH_OUTPUT_V1,noteRole:role,consent:c}):P.normalizeExternalFlatConsentV1(c);};
  const own=createPrivateProofRecipientV1({relation:mode,role:'owner',jobId:'private-wallet-recipient'}),consent=make(readPrivateProofRecipientV1(own));
  const inner=role?consent.consent:consent,message=c=>c.profile===Graph.DEVICE_EXTERNAL_FLAT_GRAPH_OUTPUT_V1?Graph.externalFlatGraphOutputPermissionMessageV1(c):P.externalFlatPermissionMessageV1(c),seal=role?sealOriginalDeviceGraphOutputWitnessV3:sealOriginalDeviceWalletNoteWitnessV3,sign=c=>signature(device,message(c)).toString('hex');let posts=0,packet,derived;
  const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}}),client=(role?graphSdk.createDeviceExternalFlatGraphApiV1:sdk.createDeviceExternalFlatNoteApiV1)({descriptor,fetchImpl:async(url,init)=>{
   const action=new URL(url).pathname.split('/').at(-1),request=JSON.parse(init.body);assert.equal(url.includes('/external-flat-share/'),profile===P.DEVICE_EXTERNAL_FLAT_SHARE_V1);
   if(action==='challenges')return response({profile,action:'ACCESS',origin:descriptor.origin,pairingId:descriptor.pairingId,devicePublicKey:descriptor.devicePublicKey,challengeId:h(label+'access'),nonce:h(label+'accessNonce'),expiresAt:Date.now()+15000});
   if(action==='reviews'||action==='output-reviews')return response(role?consent:{consent});assert.equal(action,role?'private-output-operations':'private-operations');posts++;packet=structuredClone(request.witness);
   assert.ok(Buffer.byteLength(init.body)<=16384);for(const key of ['"rho"','"key_x"','"secret"','"signature":['])assert.equal(init.body.includes(key),false);assert.equal(init.body.includes(note.secret.toString('hex')),false);
   const opened=openPrivateProofJobV1(own,request.witness);try{derived=deriveOriginalDeviceWalletNoteJobV3(opened,mode);assert.deepEqual(opened.inputs,witness);assert.deepEqual(opened.expectedPublicInputs,P.externalFlatWalletPublicInputsV3(mode,statement));}finally{wipePrivateProofInputsV1(opened.inputs);}
   const fields=Object.fromEntries(['jobId','depositJobId','rootId','noteRevision','recipient','statement','path','witnessSHA256'].map(k=>[k,inner[k]])),row={profile,descriptor,jobId:inner.jobId,mode,stage:'PROVED',consentFields:{...fields,proofSHA256:h(label+'inertProof'),publicInputsSHA256:h(JSON.stringify(P.externalFlatWalletPublicInputsV3(mode,statement)))},observation:null,errorCode:null};return response(role?{profile:Graph.DEVICE_EXTERNAL_FLAT_GRAPH_OUTPUT_V1,noteRole:role,row}:row);
  }});
  try{
   const access=await client.challenge(),fields={action:inner.action,jobId:deposit?null:inner.jobId,rootId:inner.rootId,noteRevision:1,recipient,statement,path:deposit?null:path,witnessSHA256},draft=role?{profile:Graph.DEVICE_EXTERNAL_FLAT_GRAPH_OUTPUT_V1,noteRole:role,draft:fields}:fields,review=await (role?client.outputReview:client.review)(access,sign(access),draft),submit=role?client.outputSubmit:client.submit,row=await submit(review,sign(review),witness),readRow=role?graphSdk.readDeviceExternalFlatGraphOutputRowV1:sdk.readDeviceExternalFlatRowV1;
   assert.equal(readRow(row),row);assert.throws(()=>readRow(structuredClone(row)));assert.equal(derived.commitment,cm);assert.equal(derived.nullifier,nf);assert.equal(derived.consentSHA256,h(message(consent)));assert.equal(posts,1);await assert.rejects(submit(review,sign(review),witness));assert.equal(posts,1);assert.throws(()=>openPrivateProofJobV1(own,packet),/ONE_HANDOFF/);
   assert.throws(()=>deriveOriginalDeviceWalletNoteJobV3({inputs:{profile:'DEVICE_WALLET_NOTE_PRIVATE_WITNESS_INPUT_V3',consent,signature:sign(consent),witness}},mode),/ORIGINAL_RECIPIENT/);
   assert.equal(derived.noteRole,role);const changed=structuredClone(consent),changedInner=role?changed.consent:changed;changedInner.recipient='91'.repeat(20);if(!deposit)changedInner.statement.recipient=changedInner.recipient;await assert.rejects(seal(changed,sign(consent),witness));if(role){const switched=structuredClone(consent);switched.noteRole=role==='change'?'recovery':'change';await assert.rejects(seal(switched,sign(consent),witness));}
   const wrong=createPrivateProofRecipientV1({relation:mode,role:'owner',jobId:'private-wallet-wrong-signer'}),wrongConsent=make(readPrivateProofRecipientV1(wrong)),bad=await seal(wrongConsent,signature(owner,message(wrongConsent)).toString('hex'),witness),opened=openPrivateProofJobV1(wrong,bad);try{assert.throws(()=>deriveOriginalDeviceWalletNoteJobV3(opened,mode),/DEVICE_SIGNATURE/);}finally{wipePrivateProofInputsV1(opened.inputs);}
   const corrupt=createPrivateProofRecipientV1({relation:mode,role:'owner',jobId:'private-wallet-corrupt'}),corruptConsent=make(readPrivateProofRecipientV1(corrupt)),good=await seal(corruptConsent,sign(corruptConsent),witness),badTag=structuredClone(good);badTag.tag=Buffer.alloc(16).toString('base64');assert.throws(()=>openPrivateProofJobV1(corrupt,badTag),/INVALID_ENCRYPTED_JOB/);assert.throws(()=>openPrivateProofJobV1(corrupt,good),/ONE_HANDOFF/);
   client.close();assert.throws(()=>readRow(row));
  }finally{client.close();P.externalFlatWipeV1(witness);note.rho.fill(0);note.secret.fill(0);}
 }
});
