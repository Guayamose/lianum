/** Host gate orchestration only; no node, proof, native transfer or RPC. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preflightFundedClaimGraph } from './native-claim-graph-preflight.mjs';
const relations = ['deposit_intent', 'native_claim_ingress'];
function fixture() {
  const events = [], head = { number: '60', hash: '12'.repeat(32), timestamp: '1000' };
  const view = { head, gateways: ['0', '3000000'].map(wrapperSupply => ({ wrapperSupply,
    pendingRedemptions: '0', pendingRefunds: '0', heldUnissued: '0', activePayout: '0'.repeat(64) })) };
  const f = { events, view, runtime: { transactions: [{}] }, bitcoin: { transfers: [] },
    solana: { transfers: [{ route: 'deposit', phase: 'OBSERVED_FINALIZED', intent: { lamports: '3000000' } }] },
    graphBitcoin: { transfers: [] }, graphSolana: { transfers: [] },
    observer: { read: async () => view, async assertCurrent(value) { assert.equal(value, view); events.push('current'); } },
    graphQuorum: { async checkpoint(request) {
      assert.equal(request.poolIndex, 1); assert.match(request.requestId, /^[0-9a-f]{64}$/);
      events.push('checkpoint'); return { head: structuredClone(head) };
    }, async health(request) { assert.deepEqual(request, { poolIndex: 1 }); events.push('health'); return { head: structuredClone(head) }; } } };
  return f;
}

test('funded gate checks original liability and registered attestations without extra effect', async () => {
  const f = fixture(), value = await preflightFundedClaimGraph(f, relations);
  assert.deepEqual(f.events, ['checkpoint', 'health', 'current']);
  assert.deepEqual(value, { checkpoint: true, health: true, issuedClaimAmount: '3000000',
    beforeGraphProofs: true, custodyTransfers: 1, graphTransfers: 0,
    originalFinalizedDepositOnly: true, noCheckpointTransactionSubmitted: true });
});

test('funded gate rejects changed liability, prior graph effects and late proof boundaries', async () => {
  for (const mutate of [f => { f.view.gateways[1].wrapperSupply = '0'; },
    f => { f.view.gateways[1].heldUnissued = '3000000'; },
    f => { f.graphSolana.transfers.push({}); },
    f => { f.solana.transfers[0].phase = 'SIGNED_NOT_BROADCAST'; }]) {
    const f = fixture(); mutate(f); await assert.rejects(preflightFundedClaimGraph(f, relations));
    assert.deepEqual(f.events, []);
  }
  await assert.rejects(preflightFundedClaimGraph(fixture(), [...relations, 'authorization']), /PROOF_BOUNDARY/);
});

test('funded gate propagates original signing failures and rejects changing heads or effects', async () => {
  const error = new Error('FLAT_OPERATOR_AUDIT_TOO_OLD'), f = fixture();
  f.graphQuorum.checkpoint = async () => { throw error; };
  await assert.rejects(preflightFundedClaimGraph(f, relations), value => value === error);
  for (const mutate of [f => { f.graphQuorum.health = async () => ({ head: { ...f.view.head, number: '61' } }); },
    f => { f.graphQuorum.health = async () => { f.runtime.transactions.push({}); return { head: f.view.head }; }; },
    f => { f.observer.assertCurrent = async () => { throw error; }; }]) {
    const changed = fixture(); mutate(changed); await assert.rejects(preflightFundedClaimGraph(changed, relations));
  }
});

test('funded preflight follows issuance and precedes graph execution and U/S preparation', () => {
  const source = readFileSync(new URL('./native-claim-flow.mjs', import.meta.url), 'utf8');
  const gate = source.indexOf("stage('preflight-funded-claim-graph-before-u-s')");
  assert.ok(gate > source.indexOf('result.acceptance.originalNotesCreditedOnce = true'));
  assert.ok(gate < source.indexOf('graphExecution = await createFlatNativeExecution'));
  assert.ok(gate < source.indexOf('graphCase = await runNativeClaimGraphCase'));
});
