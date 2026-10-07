import { inspectWrappedInstallationSourcesV2 } from '../../../../../../tests/integration/deployments/wrapped/wrapped-installation-source-inspector-v2.mjs';
import { claimBitcoinPayoutBroadcastFrame } from '../../../claims/payouts/bitcoin-payout-broadcast.mjs';
/** One owned synthetic attester identity, two separately validated domains.
 * The token and key never leave this module's factory/constructor call path.
 * Exported bridge operations require that original private token; they cannot
 * import keys, return keys, sign caller-selected bytes, or mint a token. */
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { signature } from '../../../../../engine/src/notes/private-note-encoding.mjs';
import { checkpointAuthorizationFrame, revocationFrame }
  from '../../../../../engine/src/evidence/native-hub-messages.mjs';
import { exactRecord } from '../../../execution/encoding/commitments.mjs';
import { frozenInput } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { createNativeFactsSigner, createNativeClaimFactsSigner } from '../../../chains/shared/dispatch/native-facts-peer.mjs';
import { encodeFlatNativeHealth } from '../../../chains/shared/health/native-health.mjs';
import { claimBackingFrame, claimIngressAuthorizationFrame, claimPayoutAuthorizationFrame,
  claimPayoutBroadcastFrame } from '../../../claims/authorization/permits.mjs';
import { encodeNativeClaimFacts } from '../../../chains/shared/dispatch/native-receipt-binding.mjs';
import { nonceIngressBroadcastFrame } from '../../../claims/ingress/ingress-v3-host.mjs';
import { createScopedClaimOperator, consumeWrappedClaimOperatorKeyLeaseV4, consumeWrappedClaimPayoutFactsKeyLeaseV4 } from '../../../claims/wrapped/operations/wrapped-operators-v1.mjs';
import { createScopedWrappedClaimGraphOperatorV1, consumeWrappedGraphOperatorKeyLeaseV4 } from './wrapped-claim-graph-operators-v1.mjs';
import { consumeWrappedClaimOperatorConstructionV1 } from './wrapped-claim-operator-bootstrap-v1.mjs';
import { encodeNativeValueHealth } from '../../../chains/shared/health/native-value-health-v2.mjs';
import { encodeFacts } from '../../../chains/shared/transfers/generic-native-value-v2.mjs';
import { checkpointAuthorizationFrame as graphCheckpointFrame } from '../../recovery/native-value-checkpoint-v4.mjs';

// Host lifecycle version only: certificate/domain codecs and evidence bounds do not change.
export const COMBINED_OPERATOR_AUDIT_BOUNDARY_PROFILE = 'OWNED_WRAPPED_SHARED_KEY_FULL_HISTORY_BOUNDARIES_V1';
const recoveryHandles = new WeakMap();
const custody = new WeakMap(), graphSourceLeasesV4 = new WeakMap(), graphNativeQuiescenceV4 = new WeakMap();
const claimSourceLeasesV4 = new WeakMap(), claimNativeQuiescenceV4 = new WeakMap();
function original(token) {
  assert.ok(custody.has(token), 'COMBINED_OPERATOR_PRIVATE_CUSTODY_REQUIRED');
  return custody.get(token);
}
export function assertCombinedOperatorLive(token) {
  const state = original(token);
  assert.ok(!state.closed && !state.poisoned && !state.recovering, 'COMBINED_OPERATOR_CLOSED_OR_POISONED');
  try { inspectWrappedInstallationSourcesV2(); } catch (error) { state.poisoned = true; state.key = undefined; throw error; }
}
/** A matching claim quorum may reserve idle branches across its complete final
 * round. No unrelated operation or reservation is accepted as quiescent. */
export function assertCombinedOperatorIdle(token, quorumPermit = null) {
  assertCombinedOperatorLive(token); const state = original(token);
  assert.equal(state.active, null, 'COMBINED_OPERATOR_OPERATION_IN_FLIGHT');
  assert.equal(state.auditPermit, null, 'COMBINED_OPERATOR_OPERATION_IN_FLIGHT');
  assert.ok(state.reservation === null || state.reservation.scope === 'claim'
    && state.reservation.permit === quorumPermit, 'WRAPPED_QUORUM_EXCLUSIVE_KEY');
  for (const branch of state.branches.values())
    assert.equal(branch.operationBusyV4(), false, 'COMBINED_OPERATOR_OPERATION_IN_FLIGHT');
}
export function combinedOperatorStatus(token) {
  const state = original(token); return Object.freeze({closed:state.closed,poisoned:state.poisoned,
    busy:state.active!==null || [...state.branches.values()].some(branch=>branch.busy()),reserved:state.reservation!==null});
}
export function acquireCombinedOperatorCustody(token, scope, signerIndex) {
  assertCombinedOperatorLive(token); const state = original(token);
  assert.ok(['claim', 'graph'].includes(scope) && !state.acquired.has(scope), 'COMBINED_OPERATOR_SCOPE_ONCE');
  assert.equal(signerIndex, state.signerIndex, 'COMBINED_OPERATOR_SIGNER_INDEX');
  state.acquired.add(scope); return state.publicKey;
}
export function registerCombinedOperatorBranch(token, scope, branch) {
  const state = original(token);
  assert.ok(state.acquired.has(scope) && !state.branches.has(scope), 'COMBINED_OPERATOR_BRANCH_ONCE');
  state.branches.set(scope, branch);
}
export function poisonCombinedOperator(token) {
  const state = original(token); state.poisoned = true; state.key = undefined;
}
export function closeCombinedOperator(token) {
  const state = original(token);
  for (const branch of state.branches.values()) assert.ok(!branch.busy(), 'COMBINED_OPERATOR_BUSY');
  if (state.closed) return;
  state.closed = true; state.key = undefined;
  for (const branch of state.branches.values()) branch.close();
}
export function assertCombinedGraphBinding(token, binding) {
  assertCombinedOperatorLive(token);
  const claim = original(token).branches.get('claim');
  assert.ok(claim, 'COMBINED_OPERATOR_CLAIM_REQUIRED');
  claim.assertGraphBinding(binding);
}
export async function assertCombinedClaimCoverage(token, binding, head) {
  assertCombinedGraphBinding(token, binding);
  await reciprocalAudit(token, 'claim', head);
  assertCombinedOperatorLive(token);
}
export async function assertCombinedGraphCoverage(token, head) {
  assertCombinedOperatorLive(token);
  const graph = original(token).branches.get('graph');
  assert.ok(graph, 'COMBINED_OPERATOR_GRAPH_REQUIRED');
  // Coverage callbacks audit only their own branch. They never sign or call
  // back through the reciprocal gate, so the fixed bounded scans cannot recurse.
  await reciprocalAudit(token, 'graph', head);
  assertCombinedOperatorLive(token);
}

/** A fixed original reciprocal audit issues this private source fence. Its
 * producer captured inside GRAPH serial completion; a later no-native/EVM-only
 * audit cannot be adopted as if it were the claim's original coverage. */
export async function assertCombinedGraphCoverageV4(token, head) {
  assertCombinedOperatorLive(token); const graph = original(token).branches.get('graph');
  assert.ok(graph && typeof graph.assertCoverageV4 === 'function', 'COMBINED_GRAPH_V4_SOURCE_REQUIRED');
  const ticket = await reciprocalAudit(token, 'graph', head, true), snapshot = graph.coverageStateV4(ticket);
  const lease = Object.freeze(Object.create(null)); graphSourceLeasesV4.set(lease, { token, graph, snapshot });
  assertCombinedGraphSourceCurrentV4(token, lease); return lease;
}
export function assertCombinedGraphSourceCurrentV4(token, lease) {
  const state = graphSourceLeasesV4.get(lease);
  assert.ok(state && state.token === token && original(token).branches.get('graph') === state.graph, 'COMBINED_GRAPH_PRIVATE_SOURCE_REQUIRED');
  assertCombinedOperatorLive(token);
  assert.equal(state.graph.busy(), false, 'COMBINED_GRAPH_OPERATION_IN_FLIGHT');
  assert.deepEqual(state.graph.sourceStateV4(), state.snapshot, 'COMBINED_GRAPH_SOURCE_CHANGED');
}

/** Fixed original GRAPH branch resources, never caller-selected handles. */
export function captureCombinedGraphNativeStateV4(token) {
  assert.equal(arguments.length, 1, 'WRAPPED_V4_NO_CALLER_OPTIONS');
  assertCombinedOperatorLive(token); const graph = original(token).branches.get('graph');
  assert.ok(graph, 'WRAPPED_GRAPH_ORIGINAL_BRANCH_REQUIRED'); return graph.nativeStateV4();
}
export async function quiesceCombinedGraphNativeV4(token) {
  assert.equal(arguments.length, 1, 'WRAPPED_V4_NO_CALLER_OPTIONS');
  assertCombinedOperatorLive(token); const graph = original(token).branches.get('graph');
  assert.ok(graph, 'WRAPPED_GRAPH_ORIGINAL_BRANCH_REQUIRED'); const lease = await graph.quiesceNativeV4();
  const wrapped = Object.freeze(Object.create(null)); graphNativeQuiescenceV4.set(wrapped, { token, graph, lease });
  try { assertCombinedGraphNativeQuiescenceV4(token, wrapped); return wrapped; }
  catch (cause) { graph.releaseNativeQuiescenceV4(lease); throw cause; }
}
function originalGraphNativeQuiescence(token, wrapped) {
  const state = graphNativeQuiescenceV4.get(wrapped);
  assert.ok(state && state.token === token && original(token).branches.get('graph') === state.graph,
    'WRAPPED_GRAPH_PRIVATE_NATIVE_QUIESCENCE_REQUIRED'); return state;
}
export function assertCombinedGraphNativeQuiescenceV4(token, wrapped) {
  assert.equal(arguments.length, 2, 'WRAPPED_V4_NO_CALLER_OPTIONS');
  const state = originalGraphNativeQuiescence(token, wrapped); assertCombinedOperatorLive(token);
  state.graph.assertNativeQuiescenceV4(state.lease);
}
export function releaseCombinedGraphNativeQuiescenceV4(token, wrapped) {
  assert.equal(arguments.length, 2, 'WRAPPED_V4_NO_CALLER_OPTIONS');
  const state = originalGraphNativeQuiescence(token, wrapped); state.graph.releaseNativeQuiescenceV4(state.lease);
}

/** Reverse source leases come only from the original claim serial producer.
 * Independent sibling native reads may advance monotonically; the final key
 * or original-result lease separately pins one exact physical snapshot. */
export async function assertCombinedClaimCoverageV4(token, binding, head) {
  assertCombinedGraphBinding(token, binding); const claim = original(token).branches.get('claim');
  const ticket = await reciprocalAudit(token, 'claim', head, true), snapshot = claim.coverageStateV4(ticket);
  const lease = Object.freeze(Object.create(null)); claimSourceLeasesV4.set(lease, { token, claim, snapshot });
  // Physical projection is checked only after the caller has drained all
  // independently queued sibling reads and acquired its fixed quiescence.
  return lease;
}
export function assertCombinedClaimSourceCurrentV4(token, lease) {
  const state = claimSourceLeasesV4.get(lease);
  assert.ok(state && state.token === token && original(token).branches.get('claim') === state.claim, 'COMBINED_CLAIM_PRIVATE_SOURCE_REQUIRED');
  assertCombinedOperatorLive(token); assert.equal(state.claim.busy(), false, 'COMBINED_CLAIM_OPERATION_IN_FLIGHT');
  state.claim.assertSourceCurrentV4(state.snapshot);
}
export function captureCombinedClaimNativeStateV4(token) {
  assert.equal(arguments.length, 1, 'WRAPPED_V4_NO_CALLER_OPTIONS'); assertCombinedOperatorLive(token);
  return original(token).branches.get('claim').nativeStateV4();
}
export async function quiesceCombinedClaimNativeV4(token) {
  assert.equal(arguments.length, 1, 'WRAPPED_V4_NO_CALLER_OPTIONS'); assertCombinedOperatorLive(token);
  const claim = original(token).branches.get('claim'), lease = await claim.quiesceNativeV4();
  const wrapped = Object.freeze(Object.create(null)); claimNativeQuiescenceV4.set(wrapped, { token, claim, lease });
  try { assertCombinedClaimNativeQuiescenceV4(token, wrapped); return wrapped; }
  catch (cause) { claim.releaseNativeQuiescenceV4(lease); throw cause; }
}
function originalClaimNativeQuiescence(token, wrapped) {
  const state = claimNativeQuiescenceV4.get(wrapped);
  assert.ok(state && state.token === token && original(token).branches.get('claim') === state.claim, 'WRAPPED_CLAIM_PRIVATE_NATIVE_QUIESCENCE_REQUIRED'); return state;
}
export function assertCombinedClaimNativeQuiescenceV4(token, wrapped) {
  assert.equal(arguments.length, 2, 'WRAPPED_V4_NO_CALLER_OPTIONS'); assertCombinedOperatorLive(token);
  const state = originalClaimNativeQuiescence(token, wrapped); state.claim.assertNativeQuiescenceV4(state.lease);
}
export function releaseCombinedClaimNativeQuiescenceV4(token, wrapped) {
  assert.equal(arguments.length, 2, 'WRAPPED_V4_NO_CALLER_OPTIONS');
  const state = originalClaimNativeQuiescence(token, wrapped); state.claim.releaseNativeQuiescenceV4(state.lease);
}
export function assertCombinedGraphOperatorIdleV4(token, quorumPermit = null) {
  assertCombinedOperatorLive(token); const state = original(token);
  assert.equal(state.active, null, 'COMBINED_OPERATOR_OPERATION_IN_FLIGHT');
  assert.equal(state.auditPermit, null, 'COMBINED_OPERATOR_OPERATION_IN_FLIGHT');
  assert.ok(state.reservation === null || state.reservation.scope === 'graph' && state.reservation.permit === quorumPermit, 'WRAPPED_QUORUM_EXCLUSIVE_KEY');
  for (const branch of state.branches.values()) assert.equal(branch.operationBusyV4(), false, 'COMBINED_OPERATOR_OPERATION_IN_FLIGHT');
}

/** Exactly one root operation owns this key. The only permitted nesting is
 * the other original branch's fixed, non-signing coverage entry at one head. */
export function enterWrappedOperatorBranchV1(token, scope, quorumPermit = null) {
  assertCombinedOperatorLive(token); const s = original(token);
  assert.ok(scope === 'claim' || scope === 'graph');
  const operation = Object.freeze(Object.create(null));
  if (s.active === null) {
    assert.ok(s.reservation === null || (s.reservation.scope === scope && s.reservation.permit === quorumPermit), 'WRAPPED_QUORUM_EXCLUSIVE_KEY');
    s.active = { operation, scope, started: performance.now(), audit: null }; }
  else {
    assert.equal(s.auditPermit, scope, 'WRAPPED_KEY_EXCLUSIVE_OPERATION');
    assert.equal(s.active.audit, null, 'WRAPPED_NONRECURSIVE_AUDIT');
    s.auditPermit = null; s.active.audit = { operation, scope };
  }
  return operation;
}
export function exitWrappedOperatorBranchV1(token, operation) {
  const s = original(token); assert.ok(s.active, 'WRAPPED_ORIGINAL_OPERATION_REQUIRED');
  if (s.active.audit?.operation === operation) { s.active.audit = null; return; }
  assert.equal(s.active.operation, operation, 'WRAPPED_ORIGINAL_OPERATION_REQUIRED');
  assert.equal(s.active.audit, null, 'WRAPPED_AUDIT_NOT_DRAINED');
  assert.equal(s.auditPermit, null, 'WRAPPED_AUDIT_NOT_ENTERED'); s.active = null;
}
const originalAuditFailures = new WeakMap();
/** Read-only diagnostic identity. No head, token, key, capability or authority. */
export function originalWrappedCombinedAuditFailureV1(error) {
  assert.equal(arguments.length, 1, 'WRAPPED_AUDIT_DIAGNOSTIC_NO_OPTIONS');
  return originalAuditFailures.get(error) ?? null;
}
function strictBudget(started, state = null, reciprocalScope = null) {
  const elapsed = performance.now() - started;
  try { assert.ok(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'WRAPPED_WHOLE_OPERATION_DEADLINE'); }
  catch (error) {
    if (state !== null) originalAuditFailures.set(error, Object.freeze({ schema: 'ORIGINAL_WRAPPED_COMBINED_AUDIT_DEADLINE_V1',
      phase: 'reciprocal-return', sourceScope: state.active.scope, reciprocalScope, signerIndex: state.signerIndex,
      elapsedMilliseconds: Number.isFinite(elapsed) ? Math.min(3_600_000, Math.max(0, Math.ceil(elapsed))) : 3_600_000,
      limitMilliseconds: 30_000, completed: false }));
    throw error;
  }
}
/** Only the original claim branch holds this custody identity. It starts this
 * clock immediately before its next COMPLETE independent claim/native/GRAPH
 * audit, never after a cheap EVM refresh or in a caller-selected callback. */
export function beginWrappedClaimAuditRoundV4(token) {
  assert.equal(arguments.length, 1, 'WRAPPED_V4_NO_CALLER_OPTIONS');
  assertCombinedOperatorLive(token); const s = original(token);
  assert.ok(s.active && s.active.scope === 'claim' && s.active.audit === null && s.auditPermit === null,
    'WRAPPED_ORIGINAL_SIGNING_SCOPE_REQUIRED');
  s.active.started = performance.now(); return s.active.started;
}
/** The private original GRAPH branch calls this only immediately before a
 * complete reciprocal claim and GRAPH audit, never for a cheap refresh. */
export function beginWrappedGraphAuditRoundV4(token) {
  assert.equal(arguments.length, 1, 'WRAPPED_V4_NO_CALLER_OPTIONS'); assertCombinedOperatorLive(token);
  const s = original(token);
  assert.ok(s.active && s.active.scope === 'graph' && s.active.audit === null && s.auditPermit === null, 'WRAPPED_ORIGINAL_SIGNING_SCOPE_REQUIRED');
  s.active.started = performance.now(); return s.active.started;
}
function assertSigningScope(token, scope) {
  const s = original(token); assert.ok(s.active && s.active.scope === scope && s.active.audit === null && s.auditPermit === null,
    'WRAPPED_ORIGINAL_SIGNING_SCOPE_REQUIRED');
  strictBudget(s.active.started);
}
async function reciprocalAudit(token, scope, head, v4 = false) {
  assertCombinedOperatorLive(token); const s = original(token);
  assert.ok(s.active && s.active.scope !== scope && s.active.audit === null && s.auditPermit === null,
    'WRAPPED_NONRECURSIVE_INDEPENDENT_AUDIT');
  const branch = s.branches.get(scope); assert.ok(branch, 'WRAPPED_ORIGINAL_BRANCH_REQUIRED');
  s.auditPermit = scope;
  try { const result = await (v4 ? branch.assertCoverageV4(head) : branch.assertCoverage(head)); assertCombinedOperatorLive(token);
    strictBudget(s.active.started, s, scope); return result; }
  finally { s.auditPermit = null; assert.equal(s.active?.audit, null, 'WRAPPED_AUDIT_NOT_DRAINED'); }
}
export function wrappedOperatorKeyUsesV1(token) { return original(token).uses; }

// Only fixed domain codecs are accepted. Validation/current-state gates live
// in the original branded operators, which alone retain this private token.
export function signCombinedClaimAuthorization(token, kind, message) {
  assertCombinedOperatorLive(token); assertSigningScope(token, 'claim');
  const codec = kind === 'health' ? encodeFlatNativeHealth
    : ['backing', 'reservation'].includes(kind) ? claimBackingFrame
      : kind === 'presign-ingress' ? claimIngressAuthorizationFrame
        : kind === 'presign-payout' ? claimPayoutAuthorizationFrame
          : kind === 'broadcast-payout-v2' ? claimPayoutBroadcastFrame
            : kind === 'broadcast-bitcoin-payout-v1' ? claimBitcoinPayoutBroadcastFrame
            : kind === 'broadcast-ingress-v3' ? nonceIngressBroadcastFrame : null;
  assert.ok(codec, 'COMBINED_OPERATOR_CLAIM_SIGNING_DOMAIN');
  original(token).uses++; return signature(original(token).key, codec(message)).toString('hex');
}
/** V4 fixed domain key boundary. The opaque lease can only originate from
 * this same operator's complete original authorization audit. */
export function signCombinedClaimAuthorizationV4(token, kind, message, lease) {
  assertCombinedOperatorLive(token); assertSigningScope(token, 'claim');
  assert.equal(original(token).branches.get('graph').busy(), false, 'COMBINED_OPERATOR_OPERATION_IN_FLIGHT');
  const codec = kind === 'health' ? encodeFlatNativeHealth
    : ['backing', 'reservation'].includes(kind) ? claimBackingFrame
      : kind === 'presign-payout' ? claimPayoutAuthorizationFrame
        : kind === 'broadcast-payout-v2' ? claimPayoutBroadcastFrame
          : kind === 'broadcast-bitcoin-payout-v1' ? claimBitcoinPayoutBroadcastFrame : null;
  assert.ok(codec, 'COMBINED_OPERATOR_V4_FIXED_DOMAIN');
  const frame = codec(message), key = original(token).key;
  consumeWrappedClaimOperatorKeyLeaseV4(lease, token, kind, message, frame);
  original(token).uses++; return signature(key, frame).toString('hex');
}
/** Fixed GRAPH codecs only. No assertion callback can authorize this key. */
export function signWrappedGraphAuthorizationV4(token, kind, message, policy, lease) {
  assertCombinedOperatorLive(token); assertSigningScope(token, 'graph');
  assert.equal(original(token).branches.get('claim').busy(), false, 'COMBINED_OPERATOR_OPERATION_IN_FLIGHT');
  let frame;
  if (kind === 'health') { assert.equal(policy, null); frame = encodeNativeValueHealth(message); }
  else if (kind === 'checkpoint') { assert.equal(policy, null); frame = graphCheckpointFrame(message); }
  else { assert.equal(kind, 'facts', 'WRAPPED_GRAPH_FIXED_SIGNING_DOMAIN'); frame = encodeFacts(message, policy); }
  const key = original(token).key;
  consumeWrappedGraphOperatorKeyLeaseV4(lease, token, kind, message, policy, frame);
  original(token).uses++; return signature(key, frame).toString('hex');
}
export function createCombinedFactsSigner(token, scope, policy) {
  assertCombinedOperatorLive(token);
  assert.ok(['claim', 'graph'].includes(scope), 'COMBINED_OPERATOR_FACTS_DOMAIN');
  const signer = (scope === 'claim' ? createNativeClaimFactsSigner : createNativeFactsSigner)({
    privateKey: original(token).key.privateKey, policy });
  return Object.freeze({ publicKey: signer.publicKey, async signFacts(facts) {
    assertCombinedOperatorLive(token);
    // This gate is retained by the original branch, never caller-supplied.
    // Recheck after the peer's durable pre-sign write at its same active head.
    const lease = await original(token).branches.get(scope).assertSigningCoverage(facts);
    assertCombinedOperatorLive(token);
    if (lease !== undefined) {
      assert.equal(scope, 'claim', 'COMBINED_V4_FACTS_CLAIM_ONLY');
      assert.equal(original(token).branches.get('graph').busy(), false, 'COMBINED_OPERATOR_OPERATION_IN_FLIGHT');
      const frame = encodeNativeClaimFacts(facts, policy), key = original(token).key;
      assertSigningScope(token, scope);
      consumeWrappedClaimPayoutFactsKeyLeaseV4(lease, token, facts, frame);
      original(token).uses++; return signature(key, frame).toString('hex');
    }
    // Synchronous notification closes post-key uncertainty through the branch's
    // final serial await as well as the peer's persistence and return checks.
    assertSigningScope(token, scope); original(token).uses++; original(token).branches.get(scope).noteKeyUse();
    return signer.signFacts(facts);
  } });
}

/** Returns only the original claim and graph interfaces. Both registries must
 * pin this public key; neither bind replaces an already-registered identity. */
export function createCombinedWrappedClaimOperatorV1(request) {
  assert.equal(arguments.length, 1, 'WRAPPED_OPERATOR_PRIVATE_CONSTRUCTION_ARITY');
  const input = consumeWrappedClaimOperatorConstructionV1(request), { signerIndex } = input;
  assert.ok(Number.isSafeInteger(signerIndex) && !Object.is(signerIndex, -0)
    && signerIndex >= 0 && signerIndex < 4, 'COMBINED_OPERATOR_INDEX');
  inspectWrappedInstallationSourcesV2();
  const saved = input.recovery ?? null;
  if (saved) {
    exactRecord(saved, ['schema', 'signerIndex', 'privateKey', 'publicKey', 'uses', 'claim', 'graph']);
    assert.equal(saved.schema, 'WRAPPED_COMBINED_PRIVATE_RECOVERY_V1');
    assert.equal(saved.signerIndex, signerIndex);
    exactRecord(saved.claim,['options','snapshot','keyUseEpoch','operationGeneration','originalPayoutFacts']);
    exactRecord(saved.graph,['uses','operationGeneration','record']);
    assert.ok(typeof saved.privateKey === 'string' && saved.privateKey.length < 4096);
    assert.ok(Number.isSafeInteger(saved.uses) && saved.uses >= 0);
  }
  const key = saved ? { privateKey: createPrivateKey(saved.privateKey) } : generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  assert.equal(key.privateKey.asymmetricKeyType, 'ec');
  assert.equal(key.privateKey.asymmetricKeyDetails.namedCurve, 'secp256k1');
  const jwk = createPublicKey(key.privateKey).export({ format: 'jwk' });
  const publicKey = frozenInput({ x: Buffer.from(jwk.x, 'base64url').toString('hex'),
    y: Buffer.from(jwk.y, 'base64url').toString('hex') });
  if (saved) assert.deepEqual(publicKey, saved.publicKey, 'WRAPPED_RECOVERY_ORIGINAL_SIGNER');
  const token = Object.freeze(Object.create(null));
  custody.set(token, { key, publicKey, signerIndex, acquired: new Set(), branches: new Map(), closed: false, poisoned: false, recovering:false, recovery:saved, recoveryScopes:new Set(), uses: saved?.uses ?? 0, active: null, auditPermit: null, reservation: null });
  try {
    const claim = createScopedClaimOperator({signerIndex}, token), graph = createScopedWrappedClaimGraphOperatorV1({signerIndex}, token);
    const result = Object.freeze(Object.defineProperty({ claim, graph }, 'auditBoundaryProfile',
      { value: COMBINED_OPERATOR_AUDIT_BOUNDARY_PROFILE, enumerable: false }));
    recoveryHandles.set(result, token); return result;
  } catch (cause) { closeCombinedOperator(token); throw cause; }
}

export function reserveWrappedOperatorV1(token, scope, permit) {
  assertCombinedOperatorLive(token);const s=original(token);
  assert.ok(s.active===null&&s.reservation===null&&permit&&typeof permit==='object','WRAPPED_QUORUM_RESERVATION_BUSY');
  s.reservation={scope,permit};
}
export function releaseWrappedOperatorV1(token, scope, permit) {
  const s=original(token);assert.ok(s.active===null&&s.auditPermit===null,'WRAPPED_QUORUM_TASKS_NOT_DRAINED');
  assert.ok(s.reservation?.scope===scope&&s.reservation.permit===permit,'WRAPPED_QUORUM_ORIGINAL_RESERVATION');s.reservation=null;
}

/** Private local recovery payload. Caller must possess the original combined
 * construction handle, never a signer index or caller-supplied key. The parent
 * seals this payload locally; it must never enter diagnostics or public exports. */
export async function captureCombinedWrappedClaimOperatorRecoveryV1(handle) {
  assert.equal(arguments.length, 1);
  const token = recoveryHandles.get(handle);
  assert.ok(token, 'WRAPPED_ORIGINAL_COMBINED_RECOVERY_HANDLE');
  const state = original(token);
  assert.ok(state.recovering&&!state.closed&&!state.poisoned,'WRAPPED_RECOVERY_FENCED_REQUIRED');
  const claim=await state.branches.get('claim').captureRecovery();
  const graph=state.branches.get('graph').captureRecovery();
  return { schema: 'WRAPPED_COMBINED_PRIVATE_RECOVERY_V1', signerIndex: state.signerIndex,
    privateKey: state.key.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKey: { ...state.publicKey }, uses: state.uses, claim, graph };
}

export function fenceCombinedWrappedClaimOperatorRecoveryV1(handle) {
  assert.equal(arguments.length,1);const token=recoveryHandles.get(handle);
  assert.ok(token,'WRAPPED_ORIGINAL_COMBINED_RECOVERY_HANDLE');assertCombinedOperatorIdle(token);
  original(token).recovering=true;
}
export function consumeCombinedBranchRecoveryV1(token,scope) {
  assertCombinedOperatorLive(token);const state=original(token);
  assert.ok(['claim','graph'].includes(scope)&&!state.recoveryScopes.has(scope),'WRAPPED_RECOVERY_SCOPE_ONCE');
  state.recoveryScopes.add(scope);return state.recovery?.[scope]??null;
}

/** Preservation only. This snapshot cannot mint a restart or signing token. */
export function snapshotCombinedWrappedClaimInitializationV1(handle) {
  assert.equal(arguments.length, 1);
  const token = recoveryHandles.get(handle);
  assert.ok(token, 'WRAPPED_ORIGINAL_COMBINED_RECOVERY_HANDLE');
  assertCombinedOperatorIdle(token);
  const state = original(token);
  return {
    schema: 'WRAPPED_COMBINED_PRIVATE_INITIAL_CREDENTIALS_V1',
    signerIndex: state.signerIndex,
    privateKey: state.key.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKey: { ...state.publicKey },
    claimStore: state.branches.get('claim').initializationCredentials(),
  };
}
