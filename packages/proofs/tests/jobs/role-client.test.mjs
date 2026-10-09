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
