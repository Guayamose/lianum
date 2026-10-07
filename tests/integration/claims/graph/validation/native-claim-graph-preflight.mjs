/** Fixed funded-fixture gate before spending U/S proof work. It signs only
 * registered checkpoint/health domains and submits no EVM/native effect. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { assertNonceIngressDeployment } from '../../../../../packages/backend/src/claims/ingress/ingress-v3-host.mjs';

export async function preflightFundedClaimGraph(fixture, proofRelations) {
  return preflight(fixture, proofRelations, 'native_claim_ingress');
}
export async function preflightFundedClaimGraphV3(fixture, proofRelations) {
  assert.equal(assertNonceIngressDeployment(fixture.claims), true, 'CLAIM_GRAPH_V3_DEPLOYMENT_REQUIRED');
  return preflight(fixture, proofRelations, 'native_claim_ingress_v3');
}
async function preflight(fixture, proofRelations, ingressRelation) {
  assert.deepEqual(proofRelations, ['deposit_intent', ingressRelation], 'CLAIM_GRAPH_PREFLIGHT_PROOF_BOUNDARY');
  const { runtime, observer, graphQuorum } = fixture;
  const transactions = runtime.transactions.length;
  const counts = () => [fixture.bitcoin, fixture.solana, fixture.graphBitcoin, fixture.graphSolana]
    .map(native => native.transfers.length);
  assert.deepEqual(counts(), [0, 1, 0, 0], 'CLAIM_GRAPH_PREFLIGHT_ORIGINAL_EFFECTS_ONLY');
  assert.equal(fixture.solana.transfers[0].route, 'deposit');
  assert.equal(fixture.solana.transfers[0].phase, 'OBSERVED_FINALIZED');
  assert.equal(fixture.solana.transfers[0].intent.lamports, '3000000');
  const view = await observer.read();
  assert.equal(view.gateways.length, 2);
  assert.deepEqual(view.gateways.map(gateway => gateway.wrapperSupply), ['0', '3000000']);
  for (const gateway of view.gateways) {
    for (const key of ['pendingRedemptions', 'pendingRefunds', 'heldUnissued']) assert.equal(gateway[key], '0');
    assert.equal(gateway.activePayout, '0'.repeat(64));
  }
  const checkpoint = await graphQuorum.checkpoint({ poolIndex: 1, requestId: randomBytes(32).toString('hex') });
  const health = await graphQuorum.health({ poolIndex: 1 });
  assert.deepEqual(checkpoint.head, view.head, 'CLAIM_GRAPH_PREFLIGHT_HEAD_CHANGED');
  assert.deepEqual(health.head, view.head, 'CLAIM_GRAPH_PREFLIGHT_HEAD_CHANGED');
  await observer.assertCurrent(view);
  assert.deepEqual(counts(), [0, 1, 0, 0], 'CLAIM_GRAPH_PREFLIGHT_ADDED_EFFECT');
  assert.equal(runtime.transactions.length, transactions, 'CLAIM_GRAPH_PREFLIGHT_ADDED_TRANSACTION');
  return { checkpoint: true, health: true, issuedClaimAmount: '3000000',
    beforeGraphProofs: true, custodyTransfers: 1, graphTransfers: 0,
    originalFinalizedDepositOnly: true, noCheckpointTransactionSubmitted: true };
}
