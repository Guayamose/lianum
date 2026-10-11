import { prepareNonceRoutes } from '../../chains/solana/host-send-checks.mjs';
/** Inactive integration preparation. Starts no runtime and creates no owner,
 * controller, proof, native signature or economic transfer. A future fixed
 * supervised worker supplies the original fresh V3 fixture after setup.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertOwnedLocalEvmV2 } from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { assertOwnedSolanaRuntime } from '../../../../packages/backend/src/chains/solana/runtime/owned-solana-runtime.mjs';
import { assertOwnedNativeClaimSystem } from '../../../../packages/backend/src/operations/deployments/claims/deploy-native-claims.mjs';
import { assertOwnedClaimObserver, ownedClaimObserverBindings } from '../../../../packages/backend/src/claims/operations/owned-state.mjs';
import { assertOwnedClaimOperatorQuorum } from '../../../../packages/backend/src/claims/operations/operators.mjs';
import { claimDomainCommitment } from '@lianum/engine/claims/framing';
import { claimEconomicInventory, auditClaimGateway, auditClaimNativeInventory } from '../../../../packages/backend/src/claims/operations/backing-audit.mjs';
import { ownedCustodyRoute } from '../../../../packages/backend/src/chains/shared/runtime/owned-native-custody.mjs';
import { encodeSolanaNonceBindingMessage, validateSolanaNonceBootstrapTransaction } from '../../../../packages/backend/src/chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { cloneInput as copy, frozenInput as freeze } from "@lianum/components/plain-input";
import { assertNonceIngressDeployment, auditDualNonceInventory, nonceForRoute } from '../../../../packages/backend/src/claims/ingress/ingress-v3-host.mjs';

import { PREFLIGHT_PROFILE, PRODUCTION_PREFLIGHT_PROFILE } from './native-ingress-v3-preflight-policy.mjs';
export { PREFLIGHT_PROFILE, PREFLIGHT_REAL_RUN_DISABLED } from './native-ingress-v3-preflight-policy.mjs';
import { verifyOwnedNativeClaimIngressV3PublicProof, verifyOwnedNativeClaimIngressV3ProductionProof } from '../../../../packages/backend/src/operations/deployments/claims/check-native-claim-ingress-v3-public-proof.mjs';
const probes = new WeakSet(), ZERO = '0'.repeat(64);
const hash = label => createHash('sha256').update(PREFLIGHT_PROFILE + '/' + label).digest('hex');
const routes = Object.freeze(['deposit', 'refund', 'redeem']);
function empty(view, configs) {
  assert.equal(view.gateways.length, configs.length, 'V3_PREFLIGHT_COMPLETE_GATEWAYS');
  assert.deepEqual(view.gateways.map(g => g.claimDomain), configs.map(claimDomainCommitment), 'V3_PREFLIGHT_REGISTERED_DOMAINS');
  for (const [i, g] of view.gateways.entries()) {
    auditClaimGateway(g, configs[i]);
    for (const field of ['wrapperSupply', 'intentCount', 'ticketCount', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees'])
      assert.equal(g[field], '0', 'V3_PREFLIGHT_NOT_EMPTY');
    assert.equal(g.activePayout, ZERO); assert.deepEqual(g.intents, []); assert.deepEqual(g.tickets, []);
  }
}
function bootstrapPins(native) {
  const pins = native.nonceInfrastructureByAuthority, records = native.nonceBootstrapByAuthority;
  assert.deepEqual(Object.keys(pins).sort(), ['depositor', 'escrow']);
  assert.deepEqual(Object.keys(records).sort(), ['depositor', 'escrow']);
  for (const role of ['depositor', 'escrow']) {
    const row = records[role], pin = pins[role];
    assert.equal(row.phase, 'OBSERVED_FINALIZED', 'V3_PREFLIGHT_BOOTSTRAP_NOT_FINALIZED');
    assert.equal(row.broadcastAttempts, 1, 'V3_PREFLIGHT_BOOTSTRAP_ONCE');
    assert.equal(row.intent.authorityPublicKey, native.roles[role].endpoint, 'V3_PREFLIGHT_BOOTSTRAP_AUTHORITY');
    const decoded = validateSolanaNonceBootstrapTransaction(row.nativeWire, row.intent);
    assert.equal(decoded.signatureHex, pin.bootstrapNativeId, 'V3_PREFLIGHT_BOOTSTRAP_SIGNATURE');
    assert.equal(decoded.transactionSHA256, pin.bootstrapTransactionSHA256, 'V3_PREFLIGHT_BOOTSTRAP_WIRE');
    assert.equal(row.nativeId, decoded.signatureHex); assert.equal(row.transactionSHA256, decoded.transactionSHA256);
    assert.equal(row.intent.nonceAccountPublicKey, pin.nonceAccountPublicKey); assert.equal(row.intent.payerPublicKey, pin.payerPublicKey);
    assert.equal(row.intent.rentLamports, pin.bootstrapRentLamports);
    assert.equal(row.preparedFee, pin.bootstrapFeeLamports); assert.equal(row.observation.feeLamports, pin.bootstrapFeeLamports);
  }
  return copy(records);
}

/** One fixed empty fixture only. throw-before-sign uses the existing owned
 * adapter callback boundary, not a new prepare/sign capability or fake permit.
 * The successful prebroadcast path is deliberately NOT claimed here.
 */
export async function probeNativeIngressV3Proofless({ fixture }) { return probe({ fixture }, null); }
export async function probeNativeIngressV3ProductionProof({ fixture, productionBoundary }) {
  assert.equal(productionBoundary?.actualProductionRoleIPC, true);
  assert.equal(productionBoundary.proofsGenerated, 1); assert.equal(productionBoundary.witnessPersisted, false);
  return probe({ fixture }, productionBoundary);
}
async function probe({ fixture }, productionBoundary) {
  assert.ok(!probes.has(fixture), 'V3_PREFLIGHT_SINGLE_PASS');
  const { runtime, claims, observer, quorum, solana } = fixture;
  await assertOwnedLocalEvmV2(runtime); assertOwnedNativeClaimSystem(runtime, claims);
  assertOwnedClaimObserver(observer); assertOwnedClaimOperatorQuorum(quorum, observer); assertOwnedSolanaRuntime(solana);
  const bindings = ownedClaimObserverBindings(observer);
  assert.equal(bindings.runtime, runtime); assert.equal(bindings.system, claims);
  assert.equal(assertNonceIngressDeployment(claims), true, 'V3_PREFLIGHT_AUTHENTICATED_PROFILE');
  assert.ok(claims.configs.length >= 1 && claims.configs.length <= 2);
  const solIndexes = claims.configs.flatMap((c, i) => c.nativeFamily === '2' ? [i] : []);
  assert.equal(solIndexes.length, 1, 'V3_PREFLIGHT_ONE_SOL_DOMAIN'); const index = solIndexes[0], config = claims.configs[index];
  assert.equal(claims.nativeRuntimes[index], solana, 'V3_PREFLIGHT_OWNED_SOL_INSTANCE');
  assert.equal(fixture.owners.length, 0, 'V3_PREFLIGHT_NO_OWNER');
  const nativeViews = [...claims.nativeRuntimes, ...[fixture.graphBitcoin, fixture.graphSolana].filter(Boolean)];
  const noEffects = () => {
    assert.equal(fixture.owners.length, 0, 'V3_PREFLIGHT_NO_OWNER');
    for (const native of nativeViews) assert.deepEqual(native.transfers, [], 'V3_PREFLIGHT_NO_NATIVE_EFFECT');
  };
  noEffects(); probes.add(fixture);
  const evmCount = runtime.transactions.length, epoch = runtime.ingressSendState;
  assert.ok(epoch && !epoch.busy && !epoch.uncertain, 'V3_PREFLIGHT_EVM_AVAILABLE');
  const initial = await observer.read(); empty(initial, claims.configs); await observer.assertCurrent(initial);
  const retainedProof = productionBoundary === null
    ? await verifyOwnedNativeClaimIngressV3PublicProof({ runtime, claims })
    : await verifyOwnedNativeClaimIngressV3ProductionProof({ runtime, claims, proofResult: productionBoundary.proofResult });
  if (productionBoundary !== null) assert.equal(retainedProof.origin, 'fresh-production-role-proof');
  assert.equal(retainedProof.verified, true); assert.equal(retainedProof.transactionSubmitted, false);
  assert.equal(retainedProof.registeredDomainIssuance, false); assert.equal(retainedProof.nativeFinalityEstablished, false);
  const originalBootstraps = bootstrapPins(solana), originalInfrastructure = copy(solana.nonceInfrastructureByAuthority);
  const beforeInventories = [];
  for (const [i, native] of claims.nativeRuntimes.entries()) {
    const inventory = await native.inventory();
    const audit = claims.configs[i].nativeFamily === '2'
      ? auditDualNonceInventory(inventory, claims.configs[i], native.roles, native.nonceInfrastructureByAuthority)
      : auditClaimNativeInventory(inventory, claims.configs[i], native.roles);
    assert.equal(audit.nativePrincipalAvailable, '0', 'V3_PREFLIGHT_NO_USER_PRINCIPAL');
    beforeInventories.push(inventory);
  }
  const { preparedRoutes, preparedByRoute } = await prepareNonceRoutes({
    routes, solana, config, ownedCustodyRoute, nonceForRoute, hash,
    encodeSolanaNonceBindingMessage, copy, noEffects, runtime, epoch,
  });
  // This negative check reaches the new branded method, but no signed original
  // or canonical owner intent exists. It must stop at the original-binding gate.
  let negative;
  try { await quorum.authorizeIngressBroadcast({ claimDomain: claimDomainCommitment(config), intentId: hash('absent-intent'),
    prepared: preparedByRoute.deposit, wireSalt: hash('absent-wire-salt'), nativeId: hash('absent-signature-1') + hash('absent-signature-2') }); }
  catch (error) { negative = error; }
  assert.equal(negative?.message, 'CLAIM_INGRESS_BROADCAST_ORIGINAL_BINDING', 'V3_PREFLIGHT_MISSING_BINDING_MUST_REJECT');
  const health = [];
  for (const c of claims.configs) {
    const result = await quorum.health({ claimDomain: claimDomainCommitment(c), mode: 'ingress' }), original = JSON.stringify(result);
    assert.equal(await quorum.assertOriginalAuthorizationCurrent(result), undefined, 'V3_PREFLIGHT_HEALTH_ASSERT_ONLY');
    assert.equal(JSON.stringify(result), original, 'V3_PREFLIGHT_ORIGINAL_HEALTH_UNCHANGED');
    health.push({ originalHealthValidated: true });
  }
  const final = await observer.read(); empty(final, claims.configs); assert.deepEqual(final.head, initial.head);
  await observer.assertCurrent(initial); await observer.assertCurrent(final);
  for (const [i, native] of claims.nativeRuntimes.entries())
    assert.deepEqual(claimEconomicInventory(await native.inventory()), claimEconomicInventory(beforeInventories[i]), 'V3_PREFLIGHT_INVENTORY_CHANGED');
  noEffects(); assert.equal(runtime.transactions.length, evmCount, 'V3_PREFLIGHT_NO_EVM_TRANSACTIONS');
  assert.deepEqual(runtime.ingressSendState, epoch, 'V3_PREFLIGHT_EVM_MUTATED');
  assert.deepEqual(solana.nonceInfrastructureByAuthority, originalInfrastructure);
  assert.deepEqual(bootstrapPins(solana), originalBootstraps, 'V3_PREFLIGHT_BOOTSTRAP_CHANGED');
  return freeze({ profile: productionBoundary === null ? PREFLIGHT_PROFILE : PRODUCTION_PREFLIGHT_PROFILE, checksPassed: true,
    owners: 0, proofs: productionBoundary === null ? 0 : 1, userDeposits: 0,
    economicNativeSignatures: 0, economicNativeTransfers: 0, postSetupEvmTransactions: 0,
    independentNonceBootstraps: 2, completeClaimInventories: claims.configs.length, preparedRoutes,
    missingOriginalSignedBindingRejected: true, health, positiveIngressBroadcastAuthorization: false,
    deployedRetainedSyntheticProofVerified: productionBoundary === null, deployedProductionSyntheticProofVerified: productionBoundary !== null,
    registeredDomainIssuanceEstablished: false,
    nativeFinalityOrIssuanceAcceptance: false,
    limitation: 'Unsigned route preparation, empty-state health and missing-binding rejection only; positive reserved-ingress prebroadcast requires genuine D27/canonical reservation in a separate stage.' });
}
