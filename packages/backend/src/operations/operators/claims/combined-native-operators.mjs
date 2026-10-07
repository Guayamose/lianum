import { claimBitcoinPayoutBroadcastFrame } from '../../../claims/payouts/bitcoin-payout-broadcast.mjs';
/** One owned synthetic attester identity, two separately validated domains.
 * The token and key never leave this module's factory/constructor call path.
 * Exported bridge operations require that original private token; they cannot
 * import keys, return keys, sign caller-selected bytes, or mint a token. */
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
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
import { createScopedClaimOperator, consumeClaimOperatorKeyLeaseV4, consumeClaimPayoutFactsKeyLeaseV4 } from '../../../claims/operations/operators.mjs';
import { createScopedFlatOperator } from './native-operators.mjs';

// Host lifecycle version only: certificate/domain codecs and evidence bounds do not change.
export const COMBINED_OPERATOR_AUDIT_BOUNDARY_PROFILE = 'SAME_HOST_RECIPROCAL_AUDIT_BOUNDARIES_V3';
const custody = new WeakMap(), graphSourceLeasesV4 = new WeakMap();
function original(token) {
  assert.ok(custody.has(token), 'COMBINED_OPERATOR_PRIVATE_CUSTODY_REQUIRED');
  return custody.get(token);
}
export function assertCombinedOperatorLive(token) {
  const state = original(token);
  assert.ok(!state.closed && !state.poisoned, 'COMBINED_OPERATOR_CLOSED_OR_POISONED');
}
/** Original-lease consumption cannot overlap either branch of this same
 * physical attester, including a later GRAPH operation before its first RPC. */
export function assertCombinedOperatorIdle(token) {
  assertCombinedOperatorLive(token);
  for (const branch of original(token).branches.values())
    assert.equal(branch.busy(), false, 'COMBINED_OPERATOR_OPERATION_IN_FLIGHT');
}
export function combinedOperatorStatus(token) {
  const { closed, poisoned } = original(token); return Object.freeze({ closed, poisoned });
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
  await original(token).branches.get('claim').assertCoverage(head);
  assertCombinedOperatorLive(token);
}
export async function assertCombinedGraphCoverage(token, head) {
  assertCombinedOperatorLive(token);
  const graph = original(token).branches.get('graph');
  assert.ok(graph, 'COMBINED_OPERATOR_GRAPH_REQUIRED');
  // Coverage callbacks audit only their own branch. They never sign or call
  // back through the reciprocal gate, so the fixed bounded scans cannot recurse.
  await graph.assertCoverage(head);
  assertCombinedOperatorLive(token);
}

/** A fixed original reciprocal audit issues this private source fence. Its
 * producer captured inside GRAPH serial completion; a later no-native/EVM-only
 * audit cannot be adopted as if it were the claim's original coverage. */
export async function assertCombinedGraphCoverageV4(token, head) {
  assertCombinedOperatorLive(token); const graph = original(token).branches.get('graph');
  assert.ok(graph && typeof graph.assertCoverageV4 === 'function', 'COMBINED_GRAPH_V4_SOURCE_REQUIRED');
  const ticket = await graph.assertCoverageV4(head), snapshot = graph.coverageStateV4(ticket);
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

// Only fixed domain codecs are accepted. Validation/current-state gates live
// in the original branded operators, which alone retain this private token.
export function signCombinedClaimAuthorization(token, kind, message) {
  assertCombinedOperatorLive(token);
  const codec = kind === 'health' ? encodeFlatNativeHealth
    : ['backing', 'reservation'].includes(kind) ? claimBackingFrame
      : kind === 'presign-ingress' ? claimIngressAuthorizationFrame
        : kind === 'presign-payout' ? claimPayoutAuthorizationFrame
          : kind === 'broadcast-payout-v2' ? claimPayoutBroadcastFrame
            : kind === 'broadcast-bitcoin-payout-v1' ? claimBitcoinPayoutBroadcastFrame
            : kind === 'broadcast-ingress-v3' ? nonceIngressBroadcastFrame : null;
  assert.ok(codec, 'COMBINED_OPERATOR_CLAIM_SIGNING_DOMAIN');
  return signature(original(token).key, codec(message)).toString('hex');
}
/** V4 fixed domain key boundary. The opaque lease can only originate from
 * this same operator's complete original authorization audit. */
export function signCombinedClaimAuthorizationV4(token, kind, message, lease) {
  assertCombinedOperatorLive(token);
  assert.equal(original(token).branches.get('graph').busy(), false, 'COMBINED_OPERATOR_OPERATION_IN_FLIGHT');
  const codec = kind === 'health' ? encodeFlatNativeHealth
    : ['backing', 'reservation'].includes(kind) ? claimBackingFrame
      : kind === 'presign-payout' ? claimPayoutAuthorizationFrame
        : kind === 'broadcast-payout-v2' ? claimPayoutBroadcastFrame
          : kind === 'broadcast-bitcoin-payout-v1' ? claimBitcoinPayoutBroadcastFrame : null;
  assert.ok(codec, 'COMBINED_OPERATOR_V4_FIXED_DOMAIN');
  const frame = codec(message), key = original(token).key;
  consumeClaimOperatorKeyLeaseV4(lease, token, kind, message, frame);
  return signature(key, frame).toString('hex');
}
export function signCombinedGraphAuthorization(token, kind, message) {
  assertCombinedOperatorLive(token);
  const codec = kind === 'health' ? encodeFlatNativeHealth
    : kind === 'checkpoint' ? checkpointAuthorizationFrame : kind === 'revocation' ? revocationFrame : null;
  assert.ok(codec, 'COMBINED_OPERATOR_GRAPH_SIGNING_DOMAIN');
  return signature(original(token).key, codec(message)).toString('hex');
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
      consumeClaimPayoutFactsKeyLeaseV4(lease, token, facts, frame);
      return signature(key, frame).toString('hex');
    }
    // Synchronous notification closes post-key uncertainty through the branch's
    // final serial await as well as the peer's persistence and return checks.
    original(token).branches.get(scope).noteKeyUse();
    return signer.signFacts(facts);
  } });
}

/** Returns only the original claim and graph interfaces. Both registries must
 * pin this public key; neither bind replaces an already-registered identity. */
export function createCombinedLocalNativeOperator(input) {
  exactRecord(input, ['signerIndex']); const { signerIndex } = input;
  assert.ok(Number.isSafeInteger(signerIndex) && !Object.is(signerIndex, -0)
    && signerIndex >= 0 && signerIndex < 4, 'COMBINED_OPERATOR_INDEX');
  const key = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const jwk = createPublicKey(key.privateKey).export({ format: 'jwk' });
  const publicKey = frozenInput({ x: Buffer.from(jwk.x, 'base64url').toString('hex'),
    y: Buffer.from(jwk.y, 'base64url').toString('hex') });
  const token = Object.freeze(Object.create(null));
  custody.set(token, { key, publicKey, signerIndex, acquired: new Set(), branches: new Map(), closed: false, poisoned: false });
  try {
    const claim = createScopedClaimOperator(input, token), graph = createScopedFlatOperator(input, token);
    return Object.freeze(Object.defineProperty({ claim, graph }, 'auditBoundaryProfile',
      { value: COMBINED_OPERATOR_AUDIT_BOUNDARY_PROFILE, enumerable: false }));
  } catch (cause) { closeCombinedOperator(token); throw cause; }
}
