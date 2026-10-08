/** Synthetic public receipt metadata only; never a branded client or proof. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PROFILE, SETTINGS, LIMITS, CATALOG } from '../../../../packages/proofs/src/catalog.mjs';
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
