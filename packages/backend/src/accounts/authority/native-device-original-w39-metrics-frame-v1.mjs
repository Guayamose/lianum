/** Exact public W39 telemetry inside the original encrypted account journal.
 * Timings retain their fractional values. This DATA frame grants no proof,
 * account, device, opening or runtime authority; raw telemetry is still joined
 * independently by the original financial acceptance reader. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {copy} from '../../../../engine/src/execution/accounts/generic-account-journal.mjs';
import {assertNativeEconomicNoteReceiptV1,NOTE_NATIVE_LINEAGE_V1}
  from '../../../../engine/src/execution/proofs/note-native-execution-v1.mjs';
import {assertNativePrivateEconomicNoteReceiptV3,PRIVATE_NOTE_NATIVE_PROFILE_V1}
  from '../../../../proofs/src/jobs/native-private-note-execution-v3.mjs';
import {PRIVATE_RESOURCE_POLICY} from '../../../../engine/src/crypto/private-resource-policy.mjs';
import {LIMITS} from '../../../../proofs/src/catalog.mjs';
const PROFILE='ORIGINAL_NATIVE_DEVICE_W39_PUBLIC_METRICS_FRAME_V1',MAX_BYTES=1024*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// This private telemetry codec is separate from the integer-only economic JSON
// codec. Descriptor checks run before stringify so no caller getter/toJSON runs.
function plainTelemetry(value){
  const active=new Set();let nodes=0;
  const visit=(item,depth,path=[])=>{
    assert.ok(++nodes<=100000&&depth<=64,'NATIVE_DEVICE_W39_METRICS_COMPLEXITY');
    if(item===null||typeof item==='boolean')return;
    if(typeof item==='string'){assert.ok(item.isWellFormed()&&Buffer.byteLength(item)<=MAX_BYTES,'NATIVE_DEVICE_W39_METRICS_STRING');return;}
    if(typeof item==='number'){assert.ok(Number.isFinite(item)&&Math.abs(item)<=Number.MAX_SAFE_INTEGER&&!Object.is(item,-0)
      &&(Number.isSafeInteger(item)||item>=0&&(path.length===1&&path[0]==='totalMilliseconds'
        ||path.length===2&&path[0]==='worker'&&['totalMilliseconds','witnessMilliseconds','proofMilliseconds','verificationMilliseconds','nativeCloseMilliseconds'].includes(path[1]))),
      'NATIVE_DEVICE_W39_METRICS_NUMBER');return;}
    assert.ok(item&&typeof item==='object'&&!types.isProxy(item)&&!active.has(item),'NATIVE_DEVICE_W39_METRICS_PLAIN');
    const descriptors=Object.getOwnPropertyDescriptors(item),keys=Reflect.ownKeys(descriptors);
    assert.ok(keys.every(key=>typeof key==='string'),'NATIVE_DEVICE_W39_METRICS_KEYS');
    active.add(item);try{
      if(Array.isArray(item)){
        assert.ok(Object.getPrototypeOf(item)===Array.prototype&&item.length<=100000&&keys.length===item.length+1,'NATIVE_DEVICE_W39_METRICS_ARRAY');
        for(let i=0;i<item.length;i++){const d=descriptors[String(i)];assert.ok(d&&d.enumerable&&Object.hasOwn(d,'value'),'NATIVE_DEVICE_W39_METRICS_ACCESSOR');visit(d.value,depth+1,[...path,String(i)]);}
      }else{
        assert.ok(Object.getPrototypeOf(item)===Object.prototype||Object.getPrototypeOf(item)===null,'NATIVE_DEVICE_W39_METRICS_OBJECT');
        for(const key of keys){const d=descriptors[key];assert.ok(key!=='toJSON'&&d.enumerable&&Object.hasOwn(d,'value'),'NATIVE_DEVICE_W39_METRICS_ACCESSOR');visit(key,depth+1);visit(d.value,depth+1,[...path,key]);}
      }
    }finally{active.delete(item);}
  };visit(value,0);
}
function validateOriginal(metrics,proof){
  const original=copy(proof);assert.deepEqual(Object.keys(original).sort(),['proof','publicInputs']);
  assert.ok(typeof original.proof==='string'&&/^(?:[0-9a-f]{2})+$/.exec(original.proof)?.[0]===original.proof);assert.ok(Array.isArray(original.publicInputs)&&original.publicInputs.length===39);
  for(const word of original.publicInputs)assert.ok(typeof word==='string'&&/^(?:0|[1-9][0-9]*)$/.exec(word)?.[0]===word
    &&word.length<=78&&BigInt(word)<21888242871839275222246405745257275088548364400416034343698204186575808495617n,
    'NATIVE_DEVICE_W39_METRICS_INPUT_ENCODING');
  const proofSHA256=sha(Buffer.from(original.proof,'hex')),publicInputsSHA256=sha(JSON.stringify(original.publicInputs));
  assert.equal(metrics.classification,'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY');
  assert.equal(metrics.mode,'withdraw_balance');assert.equal(metrics.operation,'prove');assert.equal(metrics.purpose,'owner');
  assert.equal(metrics.phase,'completed');assert.equal(metrics.acceptedResult,true);assert.deepEqual(metrics.exit,{code:0,signal:null});
  assert.equal(metrics.zeroKnowledgeEnabled,true);assert.equal(metrics.worker.verified,true);assert.equal(metrics.worker.zeroKnowledgeEnabled,true);
  for(const name of ['failureCode','telemetryWriteFailed','fallbackTelemetryWriteFailed'])assert.equal(metrics[name],undefined);
  assert.equal(metrics.worker.proofSHA256,proofSHA256,'NATIVE_DEVICE_W39_METRICS_PROOF_CHANGED');
  assert.equal(metrics.worker.publicInputsSHA256,publicInputsSHA256,'NATIVE_DEVICE_W39_METRICS_INPUTS_CHANGED');
  assert.equal(metrics.worker.publicInputCount,39);assert.equal(metrics.worker.proofBytes,original.proof.length/2);
  assert.ok(typeof metrics.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.exec(metrics.id)?.[0]===metrics.id);
  for(const [name,pin]of Object.entries(NOTE_NATIVE_LINEAGE_V1.withdraw_balance)){
    assert.equal(metrics[name],pin);assert.equal(metrics.worker[name],pin);
  }
  assert.deepEqual(metrics.policy,PRIVATE_RESOURCE_POLICY);
  assert.ok(Array.isArray(metrics.resourceSamples)&&metrics.resourceSamples.length>0);
  for(const sample of metrics.resourceSamples){
    assert.ok(Number.isSafeInteger(sample.availableRAM)&&sample.availableRAM>=PRIVATE_RESOURCE_POLICY.floors.availableRAM);
    assert.ok(Number.isSafeInteger(sample.freeDisk)&&sample.freeDisk>=PRIVATE_RESOURCE_POLICY.floors.freeDisk);
    assert.ok(Number.isSafeInteger(sample.workerRSS)&&sample.workerRSS>=0&&sample.workerRSS<=LIMITS.workerRSS);
  }
  const privateWorker=metrics.worker.nativeBackendExecution?.profile===PRIVATE_NOTE_NATIVE_PROFILE_V1;
  if(privateWorker){
    const intake=metrics.privateWorkerIntake,child=metrics.worker.privateWorkerIntake;
    assert.ok(intake&&child,'NATIVE_DEVICE_W39_PRIVATE_INTAKE_REQUIRED');
    assert.deepEqual(Object.keys(intake).sort(),['profile','recipientJobId','originalConsentBound','jobId','consentSHA256','witnessSHA256'].sort());
    assert.deepEqual(Object.keys(child).sort(),['profile','originalConsentBound','jobId','consentSHA256','witnessSHA256'].sort());
    assert.equal(intake.profile,'ORIGINAL_NATIVE_NOTE_PRIVATE_WORKER_INPUT_V3');assert.equal(intake.originalConsentBound,true);
    for(const name of ['recipientJobId','jobId'])assert.ok(typeof intake[name]==='string'
      &&/^[a-z0-9-]{8,100}$/.exec(intake[name])?.[0]===intake[name],'NATIVE_DEVICE_W39_PRIVATE_INTAKE_ENCODING');
    for(const name of ['consentSHA256','witnessSHA256'])assert.ok(typeof intake[name]==='string'
      &&/^[0-9a-f]{64}$/.exec(intake[name])?.[0]===intake[name],'NATIVE_DEVICE_W39_PRIVATE_INTAKE_ENCODING');
    for(const name of ['profile','originalConsentBound','jobId','consentSHA256','witnessSHA256'])
      assert.equal(child[name],intake[name],'NATIVE_DEVICE_W39_PRIVATE_INTAKE_CHANGED');
  }else{
    assert.equal(metrics.privateWorkerIntake,undefined,'NATIVE_DEVICE_W39_PRIVATE_PROFILE_MIXED');
    assert.equal(metrics.worker.privateWorkerIntake,undefined,'NATIVE_DEVICE_W39_PRIVATE_PROFILE_MIXED');
  }
  if(metrics.worker.nativeBackendExecution){
    assert.equal(metrics.lockPreserved,false);assert.equal(metrics.threads,12);
    assert.equal(metrics.maximumPages,null);assert.equal(metrics.preparedMaximumPages,32768);
    // Reuse the matching released Native12 close→independent Wasm1 validator.
    // This frame hash is only DATA integrity, never the raw telemetry file hash.
    (privateWorker?assertNativePrivateEconomicNoteReceiptV3:assertNativeEconomicNoteReceiptV1)
      ('withdraw_balance',metrics.worker,metrics);
  }else{
    // Historical Wasm rows remain historical; their numbers are never relabeled.
    assert.equal(metrics.threads,1);assert.equal(metrics.maximumPages,32768);
    assert.equal(metrics.worker.threads,1);assert.equal(metrics.worker.maximumPages,32768);
  }
}
export function captureNativeDeviceOriginalW39MetricsFrameV1(metrics,proof){
  assert.equal(arguments.length,2);plainTelemetry(metrics);validateOriginal(metrics,proof);
  const json=JSON.stringify(metrics);assert.ok(Buffer.byteLength(json)<=MAX_BYTES,'NATIVE_DEVICE_W39_METRICS_FRAME_SIZE');
  return Object.freeze({profile:PROFILE,json,sha256:sha(json)});
}
export function restoreNativeDeviceOriginalW39MetricsFrameV1(raw,proof){
  assert.equal(arguments.length,2);const frame=copy(raw);assert.deepEqual(Object.keys(frame).sort(),['json','profile','sha256']);
  assert.equal(frame.profile,PROFILE);assert.equal(typeof frame.json,'string');assert.ok(Buffer.byteLength(frame.json)<=MAX_BYTES,'NATIVE_DEVICE_W39_METRICS_FRAME_SIZE');
  assert.match(frame.sha256,/^[0-9a-f]{64}$/);assert.equal(sha(frame.json),frame.sha256,'NATIVE_DEVICE_W39_METRICS_FRAME_CHANGED');
  const metrics=JSON.parse(frame.json);plainTelemetry(metrics);
  assert.equal(JSON.stringify(metrics),frame.json,'NATIVE_DEVICE_W39_METRICS_FRAME_EXACT');
  validateOriginal(metrics,proof);return metrics;
}
