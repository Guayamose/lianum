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
