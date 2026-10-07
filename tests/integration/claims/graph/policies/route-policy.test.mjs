/** Pure route/result/source contracts; launcher is tested only while disabled. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CLAIM_GRAPH_V3_REAL_RUN_DISABLED, CLAIM_GRAPH_V3_PROFILE, CLAIM_GRAPH_V3_PROOF_COUNTS,
  validateClaimGraphV3Result } from '../validation/native-claim-graph-v3-policy.mjs';
import { NATIVE_CLAIM_RUN_ROUTES, nativeClaimRunDirectory } from '../../lifecycle/native-claim-run-route.mjs';
import { CLAIM_GRAPH_V3_NATIVE_PROTOCOL } from '../validation/native-claim-graph-v3-nonce-checks.mjs';
import { NATIVE_INGRESS_V3_RELATION, NATIVE_INGRESS_V3_SOURCE_VERSION, NATIVE_INGRESS_V3_KEY_SHA256 }
  from '../../../../../packages/proofs/src/native-ingress/metadata/native-ingress-v3-profile.mjs';
const text = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const baselineFixture = text('native-claim-graph-artifacts.test.mjs');
const source = baselineFixture.slice(baselineFixture.indexOf('function completeResult()'), baselineFixture.indexOf("test('fixed graph profile"));
// Extract only the existing public synthetic result fixture; no production
// source or external data is evaluated, and no proof/native object is created.
const completeResult = Function('CLAIM_GRAPH_PROFILE', source + ';return completeResult;')('SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH');
function completed() {
  const value = completeResult(); value.profile = CLAIM_GRAPH_V3_PROFILE; value.fullNativeGraphAcceptance = true;
  value.ingressRelation = NATIVE_INGRESS_V3_RELATION; value.ingressSourceVersion = NATIVE_INGRESS_V3_SOURCE_VERSION; value.ingressKeySHA256 = NATIVE_INGRESS_V3_KEY_SHA256;
  value.acceptance.nonceIngressObserved = true; value.nativeProtocol = structuredClone(CLAIM_GRAPH_V3_NATIVE_PROTOCOL);
  value.nonceInfrastructure = { profile: 'SYNTHETIC_DUAL_NONCE_INFRASTRUCTURE_NOT_USER_BACKING', bootstrapFinalized: true,
    bootstrapBroadcastOnce: true, independentBootstrapCount: 2, createInstruction: 0, initializeInstruction: 1,
    separatePayers: true, depositorAndEscrowAuthorities: true, claimAccountCount: 3, infrastructureAccountCount: 4,
    rentExcludedFromUserBacking: true, bootstrapFeeExcludedFromClaimFees: true, bootstrapExcludedFromClaimTransfers: true,
    depositorFeesSeparateFromEscrowReserve: true, nonceAdvancedWithObservedIngress: true, nonceAdvancedWithObservedPayout: true };
  value.proofs = Object.entries(CLAIM_GRAPH_V3_PROOF_COUNTS).flatMap(([relation, n]) => Array.from({ length: n }, () => ({ relation,
    evidence: { relation, sourceVersion: NATIVE_INGRESS_V3_SOURCE_VERSION, keySHA256: NATIVE_INGRESS_V3_KEY_SHA256, selfVerified: true } })));
  value.claimFundedGraph.solverPayoutReplay = { status: 'REJECTED_WITHOUT_SECOND_PAYOUT', actualReason: 'ASSET_INSUFFICIENT_BACKING',
    exactOriginalProofAndNullifier: true, originalNullifierRemainsSpent: true, claimTokenPoolNativeAccountingUnchanged: true,
    protocolStateAndHistoryUnchanged: true, logs: 0, additionalTransactions: 1, senderNonceIncrease: 1, nativePrincipalTransferred: '0', gasFeePaid: true };
  return value;
}
test('only fixed V3 route selects isolated fresh outputs and old identities remain unchanged', () => {
  assert.equal(CLAIM_GRAPH_V3_REAL_RUN_DISABLED, true);
  assert.equal(nativeClaimRunDirectory(NATIVE_CLAIM_RUN_ROUTES.graphV3.entry, CLAIM_GRAPH_V3_PROFILE), '.local/native-claim-graph-v3-flow');
  assert.equal(nativeClaimRunDirectory(NATIVE_CLAIM_RUN_ROUTES.graph.entry, 'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH'), '.local/native-claim-graph-flow');
  for (const route of Object.values(NATIVE_CLAIM_RUN_ROUTES).filter(r => r !== NATIVE_CLAIM_RUN_ROUTES.graphV3))
    assert.throws(() => nativeClaimRunDirectory(route.entry, CLAIM_GRAPH_V3_PROFILE), /ISOLATED_ROUTE/);
  assert.throws(() => nativeClaimRunDirectory(NATIVE_CLAIM_RUN_ROUTES.graphV3.entry, 'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH'), /ROUTE_PROFILE/);
});
test('disabled launcher fails before importing supervisor or creating native state', () => {
  const source = text('run-native-claim-graph-v3-flow.mjs');
  assert.ok(source.indexOf('assert.equal(CLAIM_GRAPH_V3_REAL_RUN_DISABLED, false') < source.indexOf('await import('));
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../run-native-claim-graph-v3-flow.mjs', import.meta.url))], { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 1); assert.match(r.stderr, /CLAIM_GRAPH_V3_REQUIRES_FROZEN_CHECKPOINT_AND_EXPLICIT_LAUNCH/);
});
test('complete result requires genuine new CI identity, all 19 proof packets, full economics, replay and cleanup', () => {
  const value = completed(); assert.equal(validateClaimGraphV3Result(value).fullNativeGraphAcceptance, true);
  assert.equal(value.proofs.length, 19); assert.equal(value.proofs.filter(p => p.relation === 'node').length, 4);
  for (const change of [
    x => x.ingressKeySHA256 = '0'.repeat(64), x => x.ingressSourceVersion = '0'.repeat(64),
    x => x.proofs.find(p => p.relation === NATIVE_INGRESS_V3_RELATION).relation = 'native_claim_ingress',
    x => x.proofs.find(p => p.relation === NATIVE_INGRESS_V3_RELATION).evidence.sourceVersion = '0'.repeat(64),
    x => x.proofs.pop(), x => x.nativeProtocol.ingressWireBindingVersion = '1',
    x => x.nonceInfrastructure.infrastructureAccountCount = 2, x => x.nonceInfrastructure.nonceAdvancedWithObservedIngress = false,
    x => x.claimFundedGraph.solverPayoutReplay.claimTokenPoolNativeAccountingUnchanged = false,
    x => x.claimFundedGraph.solverPayoutReplay.actualReason = 'UNRELATED_FAILURE',
    x => x.fullNativeGraphAcceptance = false, x => x.fullWalletAcceptance = true,
    x => x.expiredDepositRefund.originalTicketDischarged = false, x => x.cleanup.application.keeper.exitObserved = false,
  ]) { const changed = completed(); change(changed); assert.throws(() => validateClaimGraphV3Result(changed)); }
});
test('shared campaign preserves postmint-before-U/S, original post-S execution and independent solver liquidity', () => {
  const flow = text('native-claim-flow.mjs'), factory = text('owned-native-claim-fixture.mjs'), checker = text('check-native-claim-artifacts.mjs');
  assert.match(flow, /const REAL_NATIVE_RUN_DISABLED = true/); assert.match(flow, /parentEntry === NATIVE_CLAIM_RUN_ROUTES.graphV3.entry/);
  assert.match(factory, /ingressV3 \? createNativeClaimIngressV3Bootstrap : createNativeClaimBootstrap/);
  assert.ok(flow.indexOf("stage('preflight-funded-claim-graph-before-u-s')") > flow.indexOf('result.acceptance.originalNotesCreditedOnce = true'));
  assert.ok(flow.indexOf("stage('preflight-funded-claim-graph-before-u-s')") < flow.indexOf('graphExecution = await createFlatNativeExecution'));
  assert.match(flow, /bitcoin: fixture.graphBitcoin, solana: fixture.graphSolana, quorum: fixture.graphQuorum/);
  assert.match(flow, /ownerStoppedBeforeGraphNative, true/);
  assert.match(flow, /nativeClaimSourcePins\(\), result.sourcePins/);
  assert.match(checker, /ingressV3Profile \? join\(directory, 'artifact-check.json'\)/);
  assert.match(checker, /checkClaimGraphV3Bootstrap/); assert.match(checker, /checkClaimGraphV3Transfers/);
  assert.match(checker, /assertClaimGraphPayoutReplay\(evidence\)/);
  assert.match(flow, /local: NATIVE_INGRESS_V3_LOCAL, relations: \[NATIVE_INGRESS_V3_RELATION\]/);
  assert.match(flow, /manifest.sourceVersion, NATIVE_INGRESS_V3_SOURCE_VERSION/);
});
