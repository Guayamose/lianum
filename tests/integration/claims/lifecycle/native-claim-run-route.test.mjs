/** Static/host checks only; no native node or proof worker is started. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NATIVE_CLAIM_RUN_ROUTES, nativeClaimRunDirectory } from './native-claim-run-route.mjs';

test('only the two fixed original supervisor paths select retained run directories', () => {
  assert.equal(nativeClaimRunDirectory(NATIVE_CLAIM_RUN_ROUTES.legacy.entry, 'SOLANA_NONCE_DURABLE_API_RESTART'),
    '.local/native-claim-flow');
  assert.equal(nativeClaimRunDirectory(NATIVE_CLAIM_RUN_ROUTES.graph.entry, 'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH'),
    '.local/native-claim-graph-flow');
  for (const path of ['/tmp/worker.mjs', NATIVE_CLAIM_RUN_ROUTES.graph.entry + '/child', undefined])
    assert.throws(() => nativeClaimRunDirectory(path, 'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH'), /FIXED_SUPERVISOR/);
  assert.throws(() => nativeClaimRunDirectory(NATIVE_CLAIM_RUN_ROUTES.graph.entry, 'SOLANA_NONCE_DURABLE_API_RESTART'),
    /GRAPH_ROUTE_PROFILE/);
});

test('genuine graph checkpoint and health preflight precedes owner, deposit and proof creation', () => {
  const source = readFileSync(new URL('./native-claim-flow.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('save(); fixture = await'));
  const preflight = body.indexOf("stage('preflight-genuine-graph-attestation-before-funds')");
  assert.ok(preflight > 0);
  for (const later of ['const initialNative', 'controllerKeeper = await', "for (const role of ['claim_ingress'", "stage('preposition-owner-native-claim-"])
    assert.ok(body.indexOf(later) > preflight, later);
  const check = body.slice(preflight, body.indexOf('const initialNative'));
  assert.match(check, /fixture\.graphQuorum\.checkpoint/); assert.match(check, /fixture\.graphQuorum\.health/);
  assert.match(check, /assert\.equal\(fixture\.owners\.length, 0\)/);
  assert.match(check, /assert\.equal\(result\.proofs\.length, 0\)/);
  assert.match(check, /assert\.equal\(native\.transfers\.length, 0\)/);
  assert.doesNotMatch(check, /runtime\.send/);
});

test('bounded graph deadline diagnostics survive both account and run audit projections', () => {
  const flow = readFileSync(new URL('./native-claim-flow.mjs', import.meta.url), 'utf8');
  const account = readFileSync(new URL('../../../../packages/backend/src/accounts/authority/flat-account-authority.mjs', import.meta.url), 'utf8');
  const unresolved = account.slice(account.indexOf('async function unresolved'), account.indexOf('/** Read the already retained original outcome'));
  assert.match(unresolved, /errorAuditBudget: diagnostic\.auditBudget/);
  assert.match(unresolved, /auditBudget: diagnostic\.auditBudget/);
  const audit = flow.slice(flow.indexOf('async function audit('), flow.indexOf('if (fixture?.runtime)'));
  assert.match(audit, /privateFailureDiagnostic\([\s\S]*auditBudget: event\.auditBudget/);
  assert.match(audit, /failureDiagnostics\.length < 8/);
  assert.match(flow, /if \(diagnostic\.auditBudget\) result\.errorAuditBudget = diagnostic\.auditBudget/);
});
