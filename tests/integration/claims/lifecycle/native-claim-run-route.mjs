/** Fixed supervisor routes. No request supplies a directory or worker path. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT } from '@lianum/proofs/catalog';

export const NATIVE_CLAIM_RUN_ROUTES = Object.freeze({
  beginPayoutAuditV1: Object.freeze({ entry: join(ROOT, 'integration/run-native-claim-begin-payout-audit-v1.mjs'),
    local: '.local/native-claim-begin-payout-audit-v1' }),
  loadedV3: Object.freeze({ entry: join(ROOT, 'integration/run-native-claim-loaded-v3-flow.mjs'),
    local: '.local/native-claim-loaded-v3-flow' }),
  graphV3: Object.freeze({ entry: join(ROOT, 'integration/run-native-claim-graph-v3-flow.mjs'),
    local: '.local/native-claim-graph-v3-flow' }),
  ingressV3ProductionPreflight: Object.freeze({ entry: join(ROOT, 'integration/run-native-ingress-v3-production-preflight.mjs'),
    local: '.local/native-ingress-v3-production-preflight' }),
  ingressV3Preflight: Object.freeze({ entry: join(ROOT, 'integration/run-native-ingress-v3-preflight.mjs'),
    local: '.local/native-ingress-v3-preflight' }),
  legacy: Object.freeze({ entry: join(ROOT, 'integration/run-native-claim-flow.mjs'),
    local: '.local/native-claim-flow' }),
  graph: Object.freeze({ entry: join(ROOT, 'integration/run-native-claim-graph-flow.mjs'),
    local: '.local/native-claim-graph-flow' }),
  loadedFacts: Object.freeze({ entry: join(ROOT, 'integration/run-native-claim-loaded-facts-probe.mjs'),
    local: '.local/native-claim-loaded-facts-probe' }),
  unfundedHealth: Object.freeze({ entry: join(ROOT, 'integration/run-native-claim-unfunded-health.mjs'),
    local: '.local/native-claim-unfunded-health' }),
});

export function nativeClaimRunDirectory(parentEntry, profile) {
  const route = Object.values(NATIVE_CLAIM_RUN_ROUTES).find(value => value.entry === parentEntry);
  assert.ok(route, 'NATIVE_CLAIM_FIXED_SUPERVISOR_REQUIRED');
  if (route === NATIVE_CLAIM_RUN_ROUTES.beginPayoutAuditV1)
    assert.equal(profile, 'SOLANA_LOADED_BEGIN_PAYOUT_BACKING_AUDIT_STOP_V1', 'CLAIM_BEGIN_AUDIT_ROUTE_PROFILE');
  if (profile === 'SOLANA_LOADED_BEGIN_PAYOUT_BACKING_AUDIT_STOP_V1')
    assert.equal(route, NATIVE_CLAIM_RUN_ROUTES.beginPayoutAuditV1, 'CLAIM_BEGIN_AUDIT_ISOLATED_ROUTE');
  if (route === NATIVE_CLAIM_RUN_ROUTES.loadedV3)
    assert.equal(profile, 'SOLANA_LOADED_POST_DELIVERY_REDEMPTION_INGRESS_V3', 'CLAIM_LOADED_V3_ROUTE_PROFILE');
  if (profile === 'SOLANA_LOADED_POST_DELIVERY_REDEMPTION_INGRESS_V3')
    assert.equal(route, NATIVE_CLAIM_RUN_ROUTES.loadedV3, 'CLAIM_LOADED_V3_ISOLATED_ROUTE');
  if (route === NATIVE_CLAIM_RUN_ROUTES.graphV3)
    assert.equal(profile, 'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH_INGRESS_V3', 'CLAIM_GRAPH_V3_ROUTE_PROFILE');
  if (profile === 'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH_INGRESS_V3')
    assert.equal(route, NATIVE_CLAIM_RUN_ROUTES.graphV3, 'CLAIM_GRAPH_V3_ISOLATED_ROUTE');
  if (route === NATIVE_CLAIM_RUN_ROUTES.ingressV3ProductionPreflight)
    assert.equal(profile, 'LIANUM_NATIVE_INGRESS_V3_ZERO_DEPOSIT_PRODUCTION_PROOF_V1', 'V3_PRODUCTION_PREFLIGHT_ROUTE_PROFILE');
  if (profile === 'LIANUM_NATIVE_INGRESS_V3_ZERO_DEPOSIT_PRODUCTION_PROOF_V1')
    assert.equal(route, NATIVE_CLAIM_RUN_ROUTES.ingressV3ProductionPreflight, 'V3_PRODUCTION_PREFLIGHT_ISOLATED_ROUTE');
  if (route === NATIVE_CLAIM_RUN_ROUTES.ingressV3Preflight)
    assert.equal(profile, 'LIANUM_NATIVE_INGRESS_V3_EMPTY_UNSIGNED_PREFLIGHT_V1', 'V3_PREFLIGHT_ROUTE_PROFILE');
  if (profile === 'LIANUM_NATIVE_INGRESS_V3_EMPTY_UNSIGNED_PREFLIGHT_V1')
    assert.equal(route, NATIVE_CLAIM_RUN_ROUTES.ingressV3Preflight, 'V3_PREFLIGHT_ISOLATED_ROUTE');
  if (route === NATIVE_CLAIM_RUN_ROUTES.unfundedHealth)
    assert.equal(profile, 'SOLANA_UNFUNDED_POST_FACT_CLAIM_HEALTH_DIAGNOSTIC', 'NATIVE_UNFUNDED_ROUTE_PROFILE');
  if (profile === 'SOLANA_UNFUNDED_POST_FACT_CLAIM_HEALTH_DIAGNOSTIC')
    assert.equal(route, NATIVE_CLAIM_RUN_ROUTES.unfundedHealth, 'NATIVE_UNFUNDED_ISOLATED_ROUTE');
  if (route === NATIVE_CLAIM_RUN_ROUTES.graph)
    assert.equal(profile, 'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH', 'NATIVE_CLAIM_GRAPH_ROUTE_PROFILE');
  if (route === NATIVE_CLAIM_RUN_ROUTES.loadedFacts)
    assert.equal(profile, 'SOLANA_LOADED_POST_DELIVERY_FACTS_PROBE', 'NATIVE_CLAIM_LOADED_FACTS_ROUTE_PROFILE');
  if (profile === 'SOLANA_LOADED_POST_DELIVERY_FACTS_PROBE')
    assert.equal(route, NATIVE_CLAIM_RUN_ROUTES.loadedFacts, 'NATIVE_CLAIM_LOADED_FACTS_ISOLATED_ROUTE');
  return route.local;
}
