/** Synthetic public receipt metadata only; never a branded client or proof. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PROFILE, SETTINGS, LIMITS, CATALOG } from '../../../../packages/proofs/src/catalog.mjs';
import { PROVING_LIMITS, AUTHORIZATION_PROVING_LIMITS, AUTHORIZATION_TWELVE_PROVING_LIMITS, limitsForMode } from '../../../../packages/proofs/src/jobs/proving-execution.mjs';
import { DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS, assertBtcSolGraphProofReceipts, assertBtcSolRecipientWithdrawalTelemetry }
  from './development-btc-sol-graph-proof-evidence.mjs';
const runId='11111111-1111-4111-8111-111111111111',jobId='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333',proofSHA256='a'.repeat(64),publicInputsSHA256='b'.repeat(64);
function receipt(relation) {
  const spec=CATALOG[relation],sourceVersion='c'.repeat(64),keySHA256='d'.repeat(64);
  return {relation,runId,jobId,proofSHA256,publicInputsSHA256,manifestSHA256:'e'.repeat(64),resultSHA256:'f'.repeat(64),resourcesSHA256:'1'.repeat(64),
    manifest:{format:'FLAT_WALLET_PUBLIC_PROOF_V1',profile:PROFILE,relation,role:spec.role,runId,jobId,sourceVersion,keySHA256,
      publicWords:spec.publicWords,settings:SETTINGS,selfVerified:true,proofSHA256,publicInputsSHA256,target:'evm'},
    result:{format:'FLAT_WALLET_WORKER_ATTEMPT_V1',profile:PROFILE,relation,role:spec.role,runId,jobId,sourceVersion,keySHA256,
      publicWords:spec.publicWords,settings:SETTINGS,limits:LIMITS,selfVerified:true,proofGenerated:true,proofSHA256,publicInputsSHA256,
      target:'evm',mode:'prove',phase:'completed'},
    resources:{format:'FLAT_WALLET_EXTERNAL_RESOURCE_REPORT_V1',profile:PROFILE,relation,runId,jobId,limits:LIMITS,mode:'prove',phase:'completed',
      exitCode:0,signal:null,failure:null,failures:[],lockPreserved:false,hostLimitsChanged:false}};
}
function fourThreadReceipt(value) {
  const runtimePinsSHA256='2'.repeat(64),keyManifestSHA256='3'.repeat(64);
  Object.assign(value.manifest,{runtimePinsSHA256,keyManifestSHA256});
  Object.assign(value.result,{threads:4,limits:PROVING_LIMITS,runtimePinsSHA256,keyManifestSHA256,
    wasmThreadExecution:{threads:4,sharedMemory:true,oneOwnedProcess:true,originalPreparedKeyRequired:true},
    keyRecomputed:false,hostLimitsChanged:false});
  Object.assign(value.resources,{limits:PROVING_LIMITS,runtimePinsSHA256,peakWorkerRSS:PROVING_LIMITS.workerRSS});
  return value;
}
test('all seven graph relations join their original role/word-count/settings/result/resources schemas',()=>{
  for(const relation of DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS)
    assert.equal(assertBtcSolGraphProofReceipts(receipt(relation)).resourceReceiptCompleted,true);
  assert.throws(()=>assertBtcSolGraphProofReceipts(receipt('deposit_intent')),/DEVELOPMENT_CLAIM_RECEIPT_RELATION/);
});
test('swapped job identity, weakened ZK settings, missing proof bytes joins and failed cleanup cannot certify a graph proof',()=>{
  for(const relation of DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS) for(const mutate of [
    v=>{v.manifest.role='owner-substitute';},v=>{v.resources.jobId=other;},v=>{v.result.runId=other;},
    v=>{v.result.settings={...SETTINGS,disableZk:true};},v=>{v.manifest.publicWords++;},
    v=>{v.result.proofSHA256='0'.repeat(64);},v=>{v.result.publicInputsSHA256='0'.repeat(64);},
    v=>{v.resources.exitCode=1;},v=>{v.resources.signal='SIGTERM';},v=>{v.resources.failure='CLEANUP_FAILED';},
    v=>{v.resources.failures=['RESOURCE_LIMIT'];},v=>{v.resources.hostLimitsChanged=true;},v=>{v.result.cleanupErrorCode='CLEANUP_FAILED';}
  ]) {const value=receipt(relation);mutate(value);assert.throws(()=>assertBtcSolGraphProofReceipts(value));}
});
function telemetry() {
  const metrics={classification:'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY',id:runId,mode:'withdraw_balance',operation:'prove',purpose:'recipient',
    phase:'completed',acceptedResult:true,exit:{code:0,signal:null},keySHA256:'c'.repeat(64),zeroKnowledgeEnabled:true,
    worker:{verified:true,keySHA256:'c'.repeat(64),proofSHA256,publicInputsSHA256,publicInputCount:39,zeroKnowledgeEnabled:true}};
  return {returnedMetrics:metrics,storedMetrics:structuredClone(metrics),proofSHA256,publicInputsSHA256,telemetrySHA256:'d'.repeat(64)};
}
test('recipient W39 stays recipient and preserves exact returned/stored ZK telemetry and proof/input joins',()=>{
  assert.equal(assertBtcSolRecipientWithdrawalTelemetry(telemetry()).purpose,'recipient');
  for(const mutate of [v=>{v.returnedMetrics.purpose=v.storedMetrics.purpose='owner';},
    v=>{v.storedMetrics.id=other;},v=>{v.publicInputsSHA256='0'.repeat(64);},
    v=>{v.returnedMetrics.exit=v.storedMetrics.exit={code:1,signal:null};},
    v=>{v.returnedMetrics.worker.verified=v.storedMetrics.worker.verified=false;},
    v=>{v.returnedMetrics.worker.zeroKnowledgeEnabled=v.storedMetrics.worker.zeroKnowledgeEnabled=false;},
    v=>{v.returnedMetrics.failureCode=v.storedMetrics.failureCode='CLEANUP_FAILED';}
  ]) {const value=telemetry();mutate(value);assert.throws(()=>assertBtcSolRecipientWithdrawalTelemetry(value));}
});
test('all seven generic graph relations accept the fixed original-key shared-memory four-thread receipt',()=>{
  for(const relation of DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS) {
    const value=fourThreadReceipt(receipt(relation)),originalKey=value.manifest.keySHA256;
    const accepted=assertBtcSolGraphProofReceipts(value);
    assert.equal(accepted.resourceReceiptCompleted,true);assert.equal(accepted.keySHA256,originalKey);
  }
});
test('graph receipts reject unlisted threads, absent SAB/provenance, regenerated keys and RSS above the unchanged budget',()=>{
  for(const relation of DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS) {
    for(const threads of [2,3,5,9,15,17,32]) {
      const value=fourThreadReceipt(receipt(relation));value.result.threads=threads;
      value.result.limits=value.resources.limits={...PROVING_LIMITS,threads};
      value.result.wasmThreadExecution.threads=threads;
      assert.throws(()=>assertBtcSolGraphProofReceipts(value),/DEVELOPMENT_CLAIM_FIXED_THREADS/);
    }
    for(const [mutate,code] of [
    [value=>{value.result.wasmThreadExecution.sharedMemory=false;},/DEVELOPMENT_CLAIM_ACTUAL_THREAD_EXECUTION/],
    [value=>{delete value.result.wasmThreadExecution;},/DEVELOPMENT_CLAIM_ACTUAL_THREAD_EXECUTION/],
    [value=>{value.manifest.runtimePinsSHA256='0'.repeat(64);},/DEVELOPMENT_CLAIM_PROOF_THREAD_SOURCES/],
    [value=>{value.resources.runtimePinsSHA256='0'.repeat(64);},/DEVELOPMENT_CLAIM_GUARD_THREAD_SOURCES/],
    [value=>{value.manifest.keyManifestSHA256='0'.repeat(64);},/DEVELOPMENT_CLAIM_ORIGINAL_PREPARED_KEY/],
    [value=>{value.resources.peakWorkerRSS=PROVING_LIMITS.workerRSS+1;},/DEVELOPMENT_CLAIM_THREAD_RSS_LIMIT/],
    [value=>{value.result.keyRecomputed=true;},undefined],
    [value=>{value.result.hostLimitsChanged=true;},undefined],
    ]) {
      const value=fourThreadReceipt(receipt(relation));mutate(value);
      assert.throws(()=>assertBtcSolGraphProofReceipts(value),code);
    }
  }
});

test('only authorization accepts eight fixed threads with the same prepared-key, SAB and unchanged resource joins',()=>{
  const eightThreadReceipt=relation=>{
    const value=fourThreadReceipt(receipt(relation));
    value.result.threads=8;value.result.limits=value.resources.limits=AUTHORIZATION_PROVING_LIMITS;
    value.result.wasmThreadExecution.threads=8;return value;
  };
  const value=eightThreadReceipt('authorization'),originalKey=value.manifest.keySHA256;
  assert.equal(assertBtcSolGraphProofReceipts(value).keySHA256,originalKey);
  for(const relation of DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS.filter(name=>name!=='authorization'))
    assert.throws(()=>assertBtcSolGraphProofReceipts(eightThreadReceipt(relation)),/DEVELOPMENT_CLAIM_FIXED_THREADS/);
  for(const mutate of [
    v=>{v.result.wasmThreadExecution.threads=4;},v=>{v.result.wasmThreadExecution.sharedMemory=false;},
    v=>{v.manifest.runtimePinsSHA256='0'.repeat(64);},v=>{v.resources.runtimePinsSHA256='0'.repeat(64);},
    v=>{v.manifest.keyManifestSHA256='0'.repeat(64);},v=>{v.result.keyRecomputed=true;},
    v=>{v.resources.peakWorkerRSS=AUTHORIZATION_PROVING_LIMITS.workerRSS+1;},
  ]) {const rejected=eightThreadReceipt('authorization');mutate(rejected);assert.throws(()=>assertBtcSolGraphProofReceipts(rejected));}
});


test('authorization twelve retains the prepared key and exact SAB/source/RSS joins while other modes remain fixed',()=>{
  for(const mode of ['prove','prove-dyadic21']) assert.equal(limitsForMode(CATALOG.authorization,mode),AUTHORIZATION_TWELVE_PROVING_LIMITS);
  for(const mode of ['compile','stats','prepare-key','prepare-key-dyadic21','verify']) assert.equal(limitsForMode(CATALOG.authorization,mode),LIMITS);
  for(const relation of DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS.filter(name=>name!=='authorization'))
    assert.equal(limitsForMode(CATALOG[relation],'prove'),PROVING_LIMITS);
  const twelveThreadReceipt=relation=>{
    const value=fourThreadReceipt(receipt(relation));
    value.result.threads=12;value.result.limits=value.resources.limits=AUTHORIZATION_TWELVE_PROVING_LIMITS;
    value.result.wasmThreadExecution.threads=12;return value;
  };
  for (const threads of [11,13,16]) {
    const rejected=twelveThreadReceipt('authorization'); rejected.result.threads=threads;
    rejected.result.wasmThreadExecution.threads=threads;
    assert.throws(()=>assertBtcSolGraphProofReceipts(rejected));
  }
  const value=twelveThreadReceipt('authorization'),originalKey=value.manifest.keySHA256;
  assert.equal(assertBtcSolGraphProofReceipts(value).keySHA256,originalKey);
  for(const relation of DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS.filter(name=>name!=='authorization'))
    assert.throws(()=>assertBtcSolGraphProofReceipts(twelveThreadReceipt(relation)),/DEVELOPMENT_CLAIM_FIXED_THREADS/);
  for(const mutate of [
    v=>{v.result.wasmThreadExecution.threads=8;},v=>{v.result.wasmThreadExecution.sharedMemory=false;},
    v=>{v.resources.limits=AUTHORIZATION_PROVING_LIMITS;},
    v=>{v.manifest.runtimePinsSHA256='0'.repeat(64);},v=>{v.resources.runtimePinsSHA256='0'.repeat(64);},
    v=>{v.manifest.keyManifestSHA256='0'.repeat(64);},v=>{v.result.keyRecomputed=true;},
    v=>{v.resources.peakWorkerRSS=AUTHORIZATION_TWELVE_PROVING_LIMITS.workerRSS+1;},
  ]) {const rejected=twelveThreadReceipt('authorization');mutate(rejected);assert.throws(()=>assertBtcSolGraphProofReceipts(rejected));}
});
