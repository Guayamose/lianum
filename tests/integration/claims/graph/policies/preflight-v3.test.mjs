/** V3 postmint boundary under explicit mock observations/signing only. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
mock.module('../../../../../packages/backend/src/claims/ingress/ingress-v3-host.mjs', {
  exports: { assertNonceIngressDeployment: claims => { assert.equal(claims.originalV3, true, 'TEST_ORIGINAL_V3'); return true; } },
});
const { preflightFundedClaimGraphV3 } = await import('../validation/native-claim-graph-preflight.mjs');
function fixture() {
  const events = [], head = { number: '60', hash: '12'.repeat(32), timestamp: '1000' };
  const view = { head, gateways: ['0', '3000000'].map(wrapperSupply => ({ wrapperSupply,
    pendingRedemptions: '0', pendingRefunds: '0', heldUnissued: '0', activePayout: '0'.repeat(64) })) };
  return { events, view, runtime: { transactions: [{}] }, claims: { originalV3: true }, bitcoin: { transfers: [] },
    solana: { transfers: [{ route: 'deposit', phase: 'OBSERVED_FINALIZED', intent: { lamports: '3000000' } }] },
    graphBitcoin: { transfers: [] }, graphSolana: { transfers: [] },
    observer: { read: async () => view, assertCurrent: async v => { assert.equal(v, view); events.push('current'); } },
    graphQuorum: { checkpoint: async () => { events.push('checkpoint'); return { head: structuredClone(head) }; },
      health: async () => { events.push('health'); return { head: structuredClone(head) }; } } };
}
test('V3 funded inventory gate runs checkpoint and health after D27/new-CI only', async () => {
  const f = fixture(), result = await preflightFundedClaimGraphV3(f, ['deposit_intent', 'native_claim_ingress_v3']);
  assert.deepEqual(f.events, ['checkpoint', 'health', 'current']); assert.equal(result.beforeGraphProofs, true);
  assert.equal(result.originalFinalizedDepositOnly, true); assert.equal(result.noCheckpointTransactionSubmitted, true);
});
test('legacy/missing/extra proof and forged deployment fail before funded attestation', async () => {
  for (const proofs of [['deposit_intent', 'native_claim_ingress'], ['deposit_intent'],
    ['deposit_intent', 'native_claim_ingress_v3', 'authorization']]) {
    const f = fixture(); await assert.rejects(preflightFundedClaimGraphV3(f, proofs), /PROOF_BOUNDARY/); assert.deepEqual(f.events, []);
  }
  const f = fixture(); f.claims.originalV3 = false;
  await assert.rejects(preflightFundedClaimGraphV3(f, ['deposit_intent', 'native_claim_ingress_v3']), /TEST_ORIGINAL_V3/);
});
test('changed postmint inventory and original thirty-second failures remain fatal', async () => {
  const proofs = ['deposit_intent', 'native_claim_ingress_v3'];
  for (const change of [f => f.view.gateways[1].wrapperSupply = '0', f => f.view.gateways[1].pendingRedemptions = '1',
    f => f.graphSolana.transfers.push({}), f => f.solana.transfers[0].phase = 'BROADCAST_UNKNOWN']) {
    const f = fixture(); change(f); await assert.rejects(preflightFundedClaimGraphV3(f, proofs)); assert.deepEqual(f.events, []);
  }
  const error = new Error('FLAT_OPERATOR_AUDIT_TOO_OLD'), f = fixture(); f.graphQuorum.checkpoint = async () => { throw error; };
  await assert.rejects(preflightFundedClaimGraphV3(f, proofs), actual => actual === error);
});
