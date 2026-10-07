/** Pure route/result/disabled-gate tests: no process, fixture, key or proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { CLAIM_LOADED_V3_REAL_RUN_DISABLED, CLAIM_LOADED_V3_PROFILE, CLAIM_LOADED_V3_SCOPE,
  assertLoadedV3ProofBoundary, captureLoadedV3RedemptionAudit, validateClaimLoadedV3Result } from './native-claim-loaded-v3-policy.mjs';
import { runNativeClaimLoadedV3Supervisor, validateNativeClaimLoadedV3Result } from './native-flow-supervisor.mjs';
import { NATIVE_CLAIM_RUN_ROUTES, nativeClaimRunDirectory } from './native-claim-run-route.mjs';
import { CLAIM_GRAPH_V3_PROFILE } from './native-claim-graph-v3-policy.mjs';
import { CLAIM_GRAPH_V3_NATIVE_PROTOCOL } from './native-claim-graph-v3-nonce-checks.mjs';
import { NATIVE_INGRESS_V3_RELATION, NATIVE_INGRESS_V3_SOURCE_VERSION, NATIVE_INGRESS_V3_KEY_SHA256 } from '../proof-workers/native-ingress-v3-profile.mjs';
const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const copy = v => structuredClone(v);
const relations = ['deposit_intent', NATIVE_INGRESS_V3_RELATION, 'withdraw_balance', 'native_claim_discharge'];
function auditRecord() {
  return { stage: 'REDEEM', method: 'requestRedemption', status: 'SUCCEEDED', receipt: { status: '0x1' },
    signed: { nativeId: 'synthetic-only-id', nativeWire: 'synthetic-only-wire' }, prepared: { synthetic: true },
    finalAudit: { profile: 'CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V4', phase: 'CONSUMED_BEFORE_KEY',
      limitMilliseconds: 30_000, auditElapsedMilliseconds: 29_999,
      originalAuthorizationSHA256: '11'.repeat(32), preparedSHA256: '22'.repeat(32) } };
}
function complete() {
  return { format: 'FLAT_WALLET_NATIVE_CLAIM_FLOW_RESULT_V1', profile: CLAIM_LOADED_V3_PROFILE,
    phase: 'completed', success: true, localOnly: true, fakeFundsOnly: true, publicNetwork: false,
    supervisor: { supervisorPID: 1, workerPID: 2 }, cleanup: { closedEvm: true, closedSolana: true, closedBitcoin: true },
    fullNativeGraphAcceptance: false, fullWalletAcceptance: false, selectedAssets: [1],
    claimAuthorizationLifecycleProfile: 'CLAIM_AUTHORIZATION_LIFECYCLE_V4',
    claimCollectionProfile: 'SAME_HOST_CLAIM_COMMON_HEAD_COLLECTION_V3', payoutFinalSendProfile: 'OWNED_SOLANA_PAYOUT_AUTHORITY_LIFETIME_V2',
    ingressRelation: NATIVE_INGRESS_V3_RELATION, ingressSourceVersion: NATIVE_INGRESS_V3_SOURCE_VERSION, ingressKeySHA256: NATIVE_INGRESS_V3_KEY_SHA256,
    proofs: relations.map(relation => ({ relation, evidence: { relation, sourceVersion: NATIVE_INGRESS_V3_SOURCE_VERSION,
      keySHA256: NATIVE_INGRESS_V3_KEY_SHA256, selfVerified: true } })), nativeProtocol: copy(CLAIM_GRAPH_V3_NATIVE_PROTOCOL),
    nonceInfrastructure: { profile: 'SYNTHETIC_DUAL_NONCE_INFRASTRUCTURE_NOT_USER_BACKING', bootstrapFinalized: true,
      bootstrapBroadcastOnce: true, independentBootstrapCount: 2, createInstruction: 0, initializeInstruction: 1,
      separatePayers: true, depositorAndEscrowAuthorities: true, claimAccountCount: 3, infrastructureAccountCount: 4,
      rentExcludedFromUserBacking: true, bootstrapFeeExcludedFromClaimFees: true, bootstrapExcludedFromClaimTransfers: true,
      depositorFeesSeparateFromEscrowReserve: true, nonceAdvancedWithObservedIngress: true, nonceAdvancedWithObservedPayout: true },
    loadedFactsProbe: { scope: CLAIM_LOADED_V3_SCOPE, success: true, factualChecksPassed: true, ownerClaimFullyRedeemed: true,
      originalFinalizedOnce: true, retainedOriginalClaimBinding: true, health: true, checkpoint: true, sameEvmHead: true,
      custodyUnchanged: true, solverSeparateLiquidity: true, noAttestationTransactionSubmitted: true,
      providerProofs: false, graphSettlement: false, fullNativeGraphAcceptance: false, issuedClaimAmount: '3000000',
      solverNativeAmount: '1000000', factsCalls: 1, retainedGraphFactPerSigner: 1 },
    acceptance: { requestedNativeAssetsIssued: true, ownerOfflineIssue: true, originalNotesCreditedOnce: true,
      coherentPrivateAccount: true, requestedNativeRedemptions: true, allClaimLiabilitiesClosed: true,
      nonceBootstrapFinalized: true, nonceInfrastructureExcluded: true, nonceIngressObserved: true,
      noncePayoutObserved: true, nonceAdvanceBoundToOriginal: true, expiredOriginalSourceRefund: false },
    redemptions: [{ assetIndex: 1, amount: '3000000', status: 'DISCHARGED', duplicateHadNoEffect: true }],
    nativeEffects: { bitcoin: 0, solana: 2, eachBroadcastOnce: true }, finalNativeInventoryCaptured: true, finalGraphBalancesReobserved: true,
    finalClaimState: [0, 1].map(i => ({ wrapperSupply: '0', pendingRedemptions: '0', pendingRefunds: '0',
      heldUnissued: '0', reservedFees: '0', intentCount: String(i), ticketCount: String(i) })),
    redemptionAuthorization: captureLoadedV3RedemptionAudit([auditRecord()]) };
}

test('loaded V3: only its new exact fixed entry/profile can select its fresh output directory', () => {
  assert.equal(nativeClaimRunDirectory(NATIVE_CLAIM_RUN_ROUTES.loadedV3.entry, CLAIM_LOADED_V3_PROFILE), '.local/native-claim-loaded-v3-flow');
  for (const route of Object.values(NATIVE_CLAIM_RUN_ROUTES).filter(route => route !== NATIVE_CLAIM_RUN_ROUTES.loadedV3))
    assert.throws(() => nativeClaimRunDirectory(route.entry, CLAIM_LOADED_V3_PROFILE));
  for (const profile of [CLAIM_GRAPH_V3_PROFILE, 'SOLANA_LOADED_POST_DELIVERY_FACTS_PROBE', 'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH'])
    assert.throws(() => nativeClaimRunDirectory(NATIVE_CLAIM_RUN_ROUTES.loadedV3.entry, profile), /ROUTE_PROFILE/);
});

test('loaded V3: disabled entry and supervisor cannot reach fixed-run creation or accept options', async () => {
  assert.equal(CLAIM_LOADED_V3_REAL_RUN_DISABLED, true);
  const text = source('./run-native-claim-loaded-v3-flow.mjs');
  assert.ok(text.indexOf('assert.equal(CLAIM_LOADED_V3_REAL_RUN_DISABLED, false') < text.indexOf('await import('));
  // Execute only its exact guard in a pure context, never spawn the entry.
  const guard = text.slice(text.indexOf('assert.equal('), text.indexOf('const { runNativeClaimLoadedV3Supervisor'));
  assert.throws(() => vm.runInNewContext(guard, { assert, CLAIM_LOADED_V3_REAL_RUN_DISABLED }), /REQUIRES_FROZEN_CHECKPOINT/);
  await assert.rejects(runNativeClaimLoadedV3Supervisor(), /REQUIRES_FROZEN_CHECKPOINT/);
  await assert.rejects(runNativeClaimLoadedV3Supervisor({ worker: '/tmp/other' }), /NO_SUPERVISOR_OPTIONS/);
});

test('loaded V3: V3 deployment/ingress is independent of full graph and legacy selector meanings stay fixed', () => {
  const text = source('./native-claim-flow.mjs');
  const body = text.slice(text.indexOf('const loadedV3Profile'), text.indexOf('const selectedAssets'));
  const choose = route => vm.runInNewContext(body + '; ({ ingressV3Profile, graphProfile, loadedFactsProfile, combinedProfile, nonceProfile, durableApiProfile, durableKeeperProfile, ACCEPTANCE_PROFILE })',
    { parentEntry: route.entry, NATIVE_CLAIM_RUN_ROUTES, CLAIM_LOADED_V3_PROFILE, CLAIM_GRAPH_V3_PROFILE, LOADED_FACTS_PROFILE: 'SOLANA_LOADED_POST_DELIVERY_FACTS_PROBE' });
  assert.deepEqual({ ...choose(NATIVE_CLAIM_RUN_ROUTES.loadedV3) }, { ingressV3Profile: true, graphProfile: false,
    loadedFactsProfile: true, combinedProfile: true, nonceProfile: true, durableApiProfile: false, durableKeeperProfile: true, ACCEPTANCE_PROFILE: CLAIM_LOADED_V3_PROFILE });
  assert.deepEqual({ ...choose(NATIVE_CLAIM_RUN_ROUTES.graphV3) }, { ingressV3Profile: true, graphProfile: true,
    loadedFactsProfile: false, combinedProfile: true, nonceProfile: true, durableApiProfile: true, durableKeeperProfile: true, ACCEPTANCE_PROFILE: CLAIM_GRAPH_V3_PROFILE });
  assert.deepEqual({ ...choose(NATIVE_CLAIM_RUN_ROUTES.loadedFacts) }, { ingressV3Profile: false, graphProfile: false,
    loadedFactsProfile: true, combinedProfile: true, nonceProfile: true, durableApiProfile: false, durableKeeperProfile: true, ACCEPTANCE_PROFILE: 'SOLANA_LOADED_POST_DELIVERY_FACTS_PROBE' });
  assert.match(text, /loadedV3Profile \? CLAIM_LOADED_V3_REAL_RUN_DISABLED/);
  assert.match(text, /if \(graphProfile \|\| loadedV3Profile\)/);
  assert.match(text, /if \(ingressV3Profile && graphProfile\) result.fullNativeGraphAcceptance/);
  assert.match(text, /const exitRole = graphProfile \? 'change' : 'source'/);
  assert.match(text, /loadedV3Profile \? checkClaimLoadedV3Transfers : checkClaimGraphV3Transfers/);
  assert.match(text, /captureLoadedV3RedemptionAudit\(retained.evm\)/);
});

test('loaded V3: exactly four proof relations, no legacy CI, full graph, duplicate or reorder', () => {
  assertLoadedV3ProofBoundary(relations.slice(0, 2), 'issued'); assertLoadedV3ProofBoundary(relations, 'redeemed');
  for (const values of [relations.toReversed(), relations.slice(0, 3), [...relations, 'settlement'],
    relations.with(1, 'native_claim_ingress'), [...relations, 'withdraw_balance'], ['authorization', ...relations]])
    assert.throws(() => assertLoadedV3ProofBoundary(values, 'redeemed'), /EXACT_PROOF_BOUNDARY/);
});

test('loaded V3: completed scoped result requires V3 evidence, actual final authorization use and closed native liabilities', () => {
  const result = complete(); assert.equal(validateClaimLoadedV3Result(result).allClaimLiabilitiesClosed, true);
  assert.equal(validateNativeClaimLoadedV3Result(result, 1, 2).originalAuthorizationFinalUseValidated, true);
  for (const change of [
    v => v.claimCollectionProfile = 'old', v => v.ingressRelation = 'native_claim_ingress', v => v.ingressSourceVersion = '00'.repeat(32),
    v => v.proofs[1].evidence.keySHA256 = '00'.repeat(32), v => v.proofs[1].evidence.selfVerified = false,
    v => v.loadedFactsProbe.factsCalls = 2, v => v.loadedFactsProbe.graphSettlement = true,
    v => v.loadedFactsProbe.ownerClaimFullyRedeemed = false, v => v.fullNativeGraphAcceptance = true, v => v.claimFundedGraph = {},
    v => v.nativeEffects.solana = 5, v => v.redemptions[0].amount = '1800000', v => v.nonceInfrastructure.nonceAdvancedWithObservedIngress = false,
    v => v.acceptance.allClaimLiabilitiesClosed = false, v => v.finalClaimState[1].wrapperSupply = '3000000',
    v => v.finalNativeInventoryCaptured = false, v => v.finalGraphBalancesReobserved = false,
    v => v.redemptionAuthorization.phase = 'REVALIDATED_BEFORE_FINAL_CHECKS', v => v.redemptionAuthorization.finalAuditWithinBudget = false,
    v => v.cleanup.closedSolana = false, v => v.supervisor.workerPID = 3,
  ]) { const changed = complete(); change(changed); assert.throws(() => validateNativeClaimLoadedV3Result(changed, 1, 2)); }
});

test('loaded V3: original journal projection requires exactly one included signed/prepared final-guard record', () => {
  const record = auditRecord(); assert.equal(captureLoadedV3RedemptionAudit([record]).finalAuditWithinBudget, true);
  assert.throws(() => captureLoadedV3RedemptionAudit([record, copy(record)]), /ONE_REDEMPTION_DISPATCH/);
  for (const change of [v => v.status = 'REJECTED_NO_KEY', v => v.receipt.status = '0x0', v => v.signed = null,
    v => v.prepared = null, v => v.finalAudit.phase = 'REVALIDATED_BEFORE_FINAL_CHECKS', v => v.finalAudit.auditElapsedMilliseconds = 30_000,
    v => v.finalAudit.limitMilliseconds = 60_000, v => v.finalAudit.preparedSHA256 = 'changed']) {
    const changed = auditRecord(); change(changed); assert.throws(() => captureLoadedV3RedemptionAudit([changed]));
  }
  const projected = captureLoadedV3RedemptionAudit([record]);
  assert.equal(projected.nativeWire, undefined); assert.equal(projected.auditElapsedMilliseconds, undefined);
});


test('loaded V3: success requires exact scheduling and post-fsync payout hook profiles', () => {
  for (const key of ['claimCollectionProfile', 'claimAuthorizationLifecycleProfile', 'payoutFinalSendProfile']) {
    const value = complete(); delete value[key]; assert.throws(() => validateClaimLoadedV3Result(value));
  }
});

test('loaded V3: rejects stale payout V1 profile before accepting V2 results',()=>{ const v=complete(); v.payoutFinalSendProfile='OWNED_SOLANA_PAYOUT_POST_FSYNC_V1'; assert.throws(()=>validateClaimLoadedV3Result(v)); });
