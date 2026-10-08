/** Public metadata fixtures only. These tests execute no proof job and cannot
 * provide a branded controller/client or accepted cryptographic proof. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PROFILE, SETTINGS, LIMITS } from '../../../../packages/proofs/src/catalog.mjs';
import { assertRoleProofReceiptRecords, assertWithdrawalProofTelemetry } from './development-native-claim-proof-evidence.mjs';
const runId = '11111111-1111-4111-8111-111111111111', jobId = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333', proofSHA256 = 'a'.repeat(64), publicInputsSHA256 = 'b'.repeat(64);
function roleReceipt(relation) {
  const v3 = relation === 'native_claim_ingress_v3', role = v3 ? 'claim_ingress' : relation === 'deposit_intent' ? 'owner' : 'claim_discharge';
  const profile = v3 ? 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3' : PROFILE;
  const words = v3 ? 51 : relation === 'deposit_intent' ? 27 : 42;
  const sourceVersion = v3 ? '65d4737a5da725dc9b73998f240c02346ae50db1731a652feb55071f2ed0d555'
    : relation === 'native_claim_discharge' ? '7ddd3be0eaddf7bc08840d6fa0660ee6e6596108e35c9c1ac83ca4f76f468ea5' : 'c'.repeat(64);
  const keySHA256 = v3 ? '11682686c16db1276738b60ad906560a58ddf18183acf7ec5fb40f99474d8f6f'
    : relation === 'native_claim_discharge' ? '0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83' : 'd'.repeat(64);
  return { relation, runId, jobId, proofSHA256, publicInputsSHA256, manifestSHA256: 'e'.repeat(64), resultSHA256: 'f'.repeat(64), resourcesSHA256: '1'.repeat(64),
    manifest: { format: v3 ? 'V3_SCOPED_PUBLIC_PROOF_V1' : 'FLAT_WALLET_PUBLIC_PROOF_V1', profile, relation, role, runId, jobId,
      sourceVersion, keySHA256, publicWords: words, settings: SETTINGS, selfVerified: true, proofSHA256, publicInputsSHA256,
      ...(!v3 ? { target: 'evm' } : {}) },
    result: { format: v3 ? 'V3_SCOPED_PROOF_RESULT_V1' : 'FLAT_WALLET_WORKER_ATTEMPT_V1', profile, relation, role, runId, jobId,
      sourceVersion, keySHA256, settings: SETTINGS, limits: LIMITS, mode: 'prove', phase: 'completed', selfVerified: true,
      ...(v3 ? { backendDestroyed: true, keyGenerated: false, keyRecomputed: false, witnessPersisted: false, proofGenerated: true, proofSHA256 }
        : { target: 'evm', publicWords: words, proofGenerated: true, proofSHA256, publicInputsSHA256 }) },
    resources: { format: v3 ? 'V3_SCOPED_PROOF_RESOURCES_V1' : 'FLAT_WALLET_EXTERNAL_RESOURCE_REPORT_V1', profile, relation, runId, jobId,
      limits: LIMITS, mode: 'prove', phase: 'completed', exitCode: 0, signal: null, failure: null, failures: [], lockPreserved: false, hostLimitsChanged: false } };
}
test('CI51/CO42/D27 join original successful receipts and reject a completed proof with failed resources', () => {
  for (const relation of ['deposit_intent', 'native_claim_ingress_v3', 'native_claim_discharge']) {
    assert.equal(assertRoleProofReceiptRecords(roleReceipt(relation)).resourceReceiptCompleted, true);
    for (const mutate of [value => { value.resources.phase='failed'; }, value => { value.resources.exitCode=1; },
      value => { value.resources.failure='CLEANUP_FAILED'; }, value => { value.resources.lockPreserved=true; },
      value => { value.resources.hostLimitsChanged=true; }, value => { value.result.cleanupErrorCode='CLEANUP_FAILED'; },
      value => { value.result.phase='failed'; }, value => { value.resources.failures=['FINAL_RESOURCE_FLOOR']; }]) {
      const value=structuredClone(roleReceipt(relation)); mutate(value); assert.throws(()=>assertRoleProofReceiptRecords(value));
    }
  }
  const cleanup=roleReceipt('native_claim_ingress_v3'); cleanup.result.backendDestroyed=false;
  assert.throws(()=>assertRoleProofReceiptRecords(cleanup),/DEVELOPMENT_CLAIM_RECEIPT_BACKEND_CLEANUP/);
});
test('receipt identities, target, role, original settings and original native keys cannot be substituted', () => {
  for (const relation of ['deposit_intent','native_claim_ingress_v3','native_claim_discharge']) {
    for (const mutate of [value=>{value.manifest.runId=other;},value=>{value.result.jobId=other;},value=>{value.resources.runId=other;},
      value=>{value.manifest.role='owner-replacement';},value=>{value.manifest.settings={...SETTINGS,disableZk:true};},
      value=>{value.result.settings={...SETTINGS,oracleHashType:'poseidon'};},value=>{value.manifest.proofSHA256='0'.repeat(64);},
      value=>{value.resources.limits={...LIMITS,workerRSS:LIMITS.workerRSS*2};}]) {
      const value=structuredClone(roleReceipt(relation)); mutate(value); assert.throws(()=>assertRoleProofReceiptRecords(value));
    }
  }
  for (const relation of ['deposit_intent','native_claim_discharge']) {
    for (const mutate of [value=>{value.result.proofGenerated=false;},value=>{value.result.proofSHA256='0'.repeat(64);},value=>{value.result.publicInputsSHA256='0'.repeat(64);}]) {
      const value=roleReceipt(relation);mutate(value);assert.throws(()=>assertRoleProofReceiptRecords(value));
    }
  }
  const target=roleReceipt('native_claim_discharge'); target.manifest.target='recursive'; assert.throws(()=>assertRoleProofReceiptRecords(target));
  for (const relation of ['native_claim_ingress_v3','native_claim_discharge']) {
    const value=roleReceipt(relation); value.manifest.keySHA256=value.result.keySHA256='0'.repeat(64); assert.throws(()=>assertRoleProofReceiptRecords(value));
  }
});
function telemetry() {
  const metrics={ classification:'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY',id:runId,mode:'withdraw_balance',operation:'prove',purpose:'owner',
    phase:'completed',acceptedResult:true,exit:{code:0,signal:null},keySHA256:'c'.repeat(64),zeroKnowledgeEnabled:true,
    worker:{verified:true,keySHA256:'c'.repeat(64),proofSHA256,publicInputsSHA256,publicInputCount:39,zeroKnowledgeEnabled:true} };
  return {returnedMetrics:metrics,storedMetrics:structuredClone(metrics),proofSHA256,publicInputsSHA256,telemetrySHA256:'d'.repeat(64)};
}
test('W39 retains its actual public telemetry format and rejects unsuccessful, swapped or unbound output', () => {
  assert.equal(assertWithdrawalProofTelemetry(telemetry()).resourceReceiptCompleted,true);
  for (const mutate of [value=>{value.storedMetrics.id=other;},value=>{value.returnedMetrics.acceptedResult=value.storedMetrics.acceptedResult=false;},
    value=>{value.returnedMetrics.exit=value.storedMetrics.exit={code:1,signal:null};},value=>{value.proofSHA256='0'.repeat(64);},
    value=>{value.publicInputsSHA256='0'.repeat(64);},value=>{value.returnedMetrics.worker.verified=value.storedMetrics.worker.verified=false;},
    value=>{value.returnedMetrics.failureCode=value.storedMetrics.failureCode='PAEG_PROOF_LOCK_RELEASE';},
    value=>{value.returnedMetrics.zeroKnowledgeEnabled=value.storedMetrics.zeroKnowledgeEnabled=false;},
    value=>{value.returnedMetrics.worker.zeroKnowledgeEnabled=value.storedMetrics.worker.zeroKnowledgeEnabled=false;}]) {
    const value=telemetry();mutate(value);assert.throws(()=>assertWithdrawalProofTelemetry(value));
  }
});
