/** Pure result/source and source-extracted worker checks. Synthetic ports only;
 * no process, native runtime, proof, artifact loader or signature runs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { BEGIN_PAYOUT_AUDIT_RESULT_V1, assertBeginPayoutAuditResultV1 } from './native-claim-begin-payout-audit-policy-v1.mjs';
import { CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1, assertBeginPayoutAuditReceiptV1 } from '@lianum/proofs/jobs/begin-payout-audit-policy-v1';
import { validateClaimLoadedV3Result } from '../inventory/native-claim-loaded-v3-policy.mjs';
import { CLAIM_GRAPH_V3_NATIVE_PROTOCOL } from '../graph/validation/native-claim-graph-v3-nonce-checks.mjs';
import { NATIVE_INGRESS_V3_RELATION, NATIVE_INGRESS_V3_SOURCE_VERSION, NATIVE_INGRESS_V3_KEY_SHA256 } from '@lianum/proofs/native-ingress/metadata/native-ingress-v3-profile';
import { NATIVE_CLAIM_RUN_ROUTES, nativeClaimRunDirectory } from '../lifecycle/native-claim-run-route.mjs';
const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const compile = (body, env) => vm.runInThisContext('(function({' + Object.keys(env).join(',') + '}) {' + body + '\n})')(env);
function receipt() { return { profile: CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1, method: 'BEGIN_PAYOUT', phase: 'BACKING_RETURNED_BEFORE_DISPATCH',
  limitMilliseconds: 30000, originalAuditGuardsPassed: true, selectedSignerCount: 3,
  originalAuthorizationSHA256: '11'.repeat(32), preparedSHA256: '22'.repeat(32), requestSHA256: '33'.repeat(32), originalHeadSHA256: '44'.repeat(32) }; }
function result() {
  return { format: BEGIN_PAYOUT_AUDIT_RESULT_V1, profile: CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1,
    boundaryReached: true, boundaryAccepted: true, completeRedemption: false, fullWalletAcceptance: false, fullNativeGraphAcceptance: false,
    independentOperators: false, nativeSelfCustody: false, localOnly: true, fakeFundsOnly: true, publicNetwork: false,
    ingressRelation: NATIVE_INGRESS_V3_RELATION, ingressSourceVersion: NATIVE_INGRESS_V3_SOURCE_VERSION, ingressKeySHA256: NATIVE_INGRESS_V3_KEY_SHA256,
    nativeProtocol: structuredClone(CLAIM_GRAPH_V3_NATIVE_PROTOCOL), payoutFinalSendProfile: 'OWNED_SOLANA_PAYOUT_AUTHORITY_LIFETIME_V2',
    acceptance: { allClaimLiabilitiesClosed: false, requestedNativeRedemptions: false, expiredOriginalSourceRefund: false },
    redemptions: [], selectedAssets: [1], proofs: ['deposit_intent', NATIVE_INGRESS_V3_RELATION, 'withdraw_balance'].map(relation => ({ relation,
      evidence: { sourceVersion: NATIVE_INGRESS_V3_SOURCE_VERSION, keySHA256: NATIVE_INGRESS_V3_KEY_SHA256, selfVerified: true } })),
    claimCollectionProfile: 'SAME_HOST_CLAIM_COMMON_HEAD_COLLECTION_V3', claimAuthorizationLifecycleProfile: 'CLAIM_AUTHORIZATION_LIFECYCLE_V4',
    redemptionAuthorization: { profile: 'CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V4', phase: 'CONSUMED_BEFORE_KEY',
      finalAuditWithinBudget: true, redemptionReceiptSucceeded: true, limitMilliseconds: 30000,
      originalAuthorizationSHA256: '55'.repeat(32), preparedSHA256: '66'.repeat(32) }, beginPayoutAudit: receipt(),
    auditTerminal: { beginPayoutRequests: 0, evmRequestsUnchanged: true, nativePayoutPresignReached: false,
      nativePayoutKeyAuthorityCreated: false, nativePayoutSigningReached: false, nativePayoutSendReached: false,
      custodySolTransfers: 1, custodyBtcTransfers: 0, graphSolTransfers: 1, graphBtcTransfers: 0, originalEffectsUnchanged: true,
      preparationUnwound: true, originalHeadUnchanged: true, pendingRedemptions: '3000000', reservedFees: '5000', wrapperSupply: '0',
      pendingRefunds: '0', heldUnissued: '0', activePayoutIsZero: true, solTicketState: '1', solIntentCount: '1', solTicketCount: '1', completedRedemptions: 0 },
    loadedFactsProbe: { factualChecksPassed: true, issuedClaimAmount: '3000000', solverNativeAmount: '1000000', retainedGraphFactPerSigner: 1,
      factsCalls: 1, solverSeparateLiquidity: true, originalFinalizedOnce: true, retainedOriginalClaimBinding: true, health: true,
      checkpoint: true, sameEvmHead: true, custodyUnchanged: true, noAttestationTransactionSubmitted: true,
      ownerClaimFullyRedeemed: false, providerProofs: false, graphSettlement: false, fullNativeGraphAcceptance: false },
    ownerStops: [{ assetIndex: 1, phase: 'after-source-exit-before-audit-redemption', ownerAbsent: true, childExited: true }],
    finalNativeInventoryCaptured: true, finalGraphBalancesReobserved: true };
}

test('scoped result accepts only the intentionally pending boundary and is rejected by full redemption validation', () => {
  const accepted = assertBeginPayoutAuditResultV1(result());
  assert.equal(accepted.boundaryAccepted, true); assert.equal(accepted.allClaimLiabilitiesClosed, false);
  assert.throws(() => validateClaimLoadedV3Result(result()), /RESULT_PROFILE/);
  for (const mutate of [r => r.completeRedemption = true, r => r.acceptance.allClaimLiabilitiesClosed = true,
    r => r.redemptions.push({ status: 'DISCHARGED' }), r => r.auditTerminal.pendingRedemptions = '0',
    r => r.auditTerminal.reservedFees = '0', r => r.auditTerminal.beginPayoutRequests = 1,
    r => r.auditTerminal.nativePayoutSigningReached = true, r => r.auditTerminal.custodySolTransfers = 2,
    r => r.proofs.push({ relation: 'native_claim_discharge' }), r => r.proofs[1].evidence.keySHA256 = '00'.repeat(32),
    r => r.beginPayoutAudit.limitMilliseconds = 60000, r => r.beginPayoutAudit.phase = 'INITIAL_ONLY',
    r => r.redemptionAuthorization.finalAuditWithinBudget = false, r => r.ownerStops[0].childExited = false,
    r => r.fullNativeGraphAcceptance = true, r => r.independentOperators = true]) {
    const changed = result(); mutate(changed); assert.throws(() => assertBeginPayoutAuditResultV1(changed));
  }
});

test('public stop projection refuses extra/private fields, getters, proxies and changed limit', () => {
  for (const value of [{ ...receipt(), privateWire: 'private' }, { ...receipt(), preparedSHA256: 'native-id' },
    Object.defineProperty(receipt(), 'phase', { get() { throw Error('must not invoke'); } }),
    new Proxy(receipt(), { get() { throw Error('must not invoke'); } })]) assert.throws(() => assertBeginPayoutAuditReceiptV1(value));
});

test('new profile has one exact isolated supervisor route and cannot select old full-flow routes', () => {
  const entry = NATIVE_CLAIM_RUN_ROUTES.beginPayoutAuditV1.entry;
  assert.equal(nativeClaimRunDirectory(entry, CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1), '.local/native-claim-begin-payout-audit-v1');
  for (const wrong of [entry + '/child', NATIVE_CLAIM_RUN_ROUTES.loadedV3.entry, '/tmp/arbitrary.mjs'])
    assert.throws(() => nativeClaimRunDirectory(wrong, CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1));
  assert.throws(() => nativeClaimRunDirectory(entry, 'SOLANA_LOADED_POST_DELIVERY_REDEMPTION_INGRESS_V3'));
  const supervisor = source('../../native/native-flow-supervisor.mjs'), worker = source('../lifecycle/native-claim-flow.mjs');
  assert.match(supervisor, /runNativeClaimBeginPayoutAuditSupervisorV1\(\) \{\s*assert\.equal\(arguments\.length, 0/);
  assert.match(supervisor, /nativeClaimBeginPayoutAuditV1\) scoped = assertBeginPayoutAuditResultV1\(result\)/);
  assert.match(worker, /if \(beginPayoutAuditProfile\) assertBeginPayoutAuditReleaseV1\(\);\s*else assert\.equal\(loadedV3Profile/);
  assert.match(source('../inventory/native-claim-loaded-v3-policy.mjs'), /CLAIM_LOADED_V3_REAL_RUN_DISABLED = true/);
});

const worker = source('../lifecycle/native-claim-flow.mjs');
const start = worker.lastIndexOf('        if (beginPayoutAuditProfile) {', worker.indexOf('          captureBeginPayoutAuditBeforeV1(fixture, controller);'));
const end = worker.indexOf('        let paid = await controller.payout', start);
assert.ok(start >= 0 && end > start); const stopBranch = worker.slice(start, end);
async function runBranch(failure = null, forged = false) {
  const trace = [], marker = new Error('PRIVATE_SYNTHETIC_STOP'), r = { sourcePins: { unchanged: true } };
  const env = { beginPayoutAuditProfile: true, fixture: {}, ticket: { ticketId: 'synthetic-ticket' }, result: r, privateDirectory: '/synthetic-only',
    controller: { async payout() { trace.push('payout'); throw failure ?? (forged ? new Error(marker.message) : marker); } },
    captureBeginPayoutAuditBeforeV1() { trace.push('before'); },
    isNativeClaimBeginPayoutAuditStopV1(controller, error) { return error === marker; },
    consumeNativeClaimBeginPayoutAuditStopV1(controller, error) { assert.equal(error, marker); trace.push('consume'); return receipt(); },
    captureBeginPayoutAuditTerminalV1: async () => ({ inventories: [], graphBalances: {}, public: {} }),
    writeFixturePrivate() { trace.push('private-evidence'); }, join: (...parts) => parts.join('/'), audit: async () => trace.push('audit'),
    assertBeginPayoutAuditResultV1() { trace.push('validate'); }, nativeClaimSourcePins: () => ({ unchanged: true }), assert,
    cleanup: async () => trace.push('cleanup'), fallthrough() { trace.push('FORBIDDEN_PAYOUT_OR_CO'); } };
  const run = compile('return async () => { try { ' + stopBranch + '; fallthrough(); } finally { await cleanup(); } };', env);
  try { await run(); return { trace, r }; } catch (error) { return { trace, r, error }; }
}

test('actual worker boundary returns through cleanup without falling through into payout or CO', async () => {
  const { trace, r, error } = await runBranch(); assert.equal(error, undefined);
  assert.equal(r.success, true); assert.equal(r.completeRedemption, false); assert.equal(r.boundaryAccepted, true);
  assert.equal(trace.at(-1), 'cleanup'); assert.ok(!trace.includes('FORBIDDEN_PAYOUT_OR_CO'));
});

test('actual worker preserves original earlier error identity/context and rejects a forged same-code stop', async () => {
  const failure = Object.assign(new Error('CLAIM_OPERATOR_AUDIT_TOO_OLD'), { auditBudget: { phase: 'after-graph-coverage' } });
  const failed = await runBranch(failure); assert.equal(failed.error, failure); assert.equal(failed.r.success, undefined);
  assert.deepEqual(failed.trace, ['before', 'payout', 'cleanup']);
  const forged = await runBranch(null, true); assert.ok(forged.error); assert.equal(forged.r.success, undefined);
  assert.deepEqual(forged.trace, ['before', 'payout', 'cleanup']);
});
