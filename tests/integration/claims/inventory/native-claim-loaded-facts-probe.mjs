/** Fixed factual probe on one genuinely issued claim. This is not graph
 * admission or settlement: there is no provider, reservation or graph proof.
 * Importing starts no native runtime, compiler or prover. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { assertOwnedFlatOperatorQuorum } from '../../../../packages/backend/src/operations/operators/claims/native-operators.mjs';
import { validateSolanaBindingTransaction } from '../../../../packages/backend/src/chains/shared/dispatch/native-receipt-binding.mjs';
import { freshFixtureId, writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';

const probes = new WeakSet();
export const LOADED_FACTS_PROFILE = 'SOLANA_LOADED_POST_DELIVERY_FACTS_PROBE';
export function assertLoadedFactsProofBoundary(relations, phase) {
  assert.ok(['issued', 'redeemed'].includes(phase), 'CLAIM_LOADED_FACTS_PROOF_PHASE');
  assert.deepEqual(relations, ['deposit_intent', 'native_claim_ingress',
    ...(phase === 'redeemed' ? ['withdraw_balance', 'native_claim_discharge'] : [])],
  'CLAIM_LOADED_FACTS_PROOF_BOUNDARY');
}

export async function probeLoadedPostDeliveryFacts({ fixture, controller, proofRelations, privateDirectory, stage, audit }) {
  assertLoadedFactsProofBoundary(proofRelations, 'issued');
  const { runtime, system, graphSolana: native, graphQuorum: quorum } = fixture;
  assertOwnedFlatOperatorQuorum(quorum, { runtime, system, nativeRuntime: native, family: '2' });
  assert.ok(!probes.has(fixture), 'CLAIM_LOADED_FACTS_ONE_PROBE');
  const counts = () => [fixture.bitcoin, fixture.solana, fixture.graphBitcoin, native].map(value => value.transfers.length);
  assert.deepEqual(counts(), [0, 1, 0, 0], 'CLAIM_LOADED_FACTS_INITIAL_EFFECTS');
  const deposit = fixture.solana.transfers[0];
  assert.equal(deposit.route, 'deposit'); assert.equal(deposit.phase, 'OBSERVED_FINALIZED');
  assert.equal(deposit.broadcastAttempts, 1); assert.equal(deposit.intent.lamports, '3000000');
  assert.equal(fixture.operators.length, 4); assert.equal(fixture.graphOperators.length, 4);
  for (let index = 0; index < 4; index++) {
    assert.deepEqual(fixture.operators[index].publicKey, fixture.graphOperators[index].publicKey);
    assert.deepEqual(fixture.graphOperators[index].publicKey, system.registry.keys[index]);
    assert.equal(fixture.graphOperators[index].status().certifiedInventoryCount, 0);
  }
  const inventoryCounts = () => fixture.graphOperators.map(operator => operator.status().certifiedInventoryCount);
  const beforeClaims = await fixture.observer.read(), evmCount = runtime.transactions.length;
  function loaded(view) {
    assert.equal(view.gateways.length, 2);
    assert.deepEqual(view.gateways.map(value => value.wrapperSupply), ['0', '3000000']);
    assert.deepEqual(view.gateways.map(value => value.intentCount), ['0', '1']);
    for (const gateway of view.gateways) {
      for (const key of ['pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees', 'ticketCount'])
        assert.equal(gateway[key], '0', 'CLAIM_LOADED_FACTS_UNEXPECTED_LIABILITY');
      assert.equal(gateway.activePayout, '0'.repeat(64));
    }
    assert.equal(view.gateways[1].intents[0].state, '2');
    assert.equal(view.gateways[1].intents[0].amount, '3000000');
  }
  loaded(beforeClaims); await fixture.observer.assertCurrent(beforeClaims);
  // This original controller read requires its retained private reservation
  // binding, not just a funded native account or a caller-described identity.
  // Each combined graph signer also re-audits its own original claim binding.
  const claimReceipt = await controller.privateNativeReceipt({ operationId: beforeClaims.gateways[1].intents[0].id });
  assert.equal(claimReceipt.family, '2'); assert.equal(claimReceipt.nativeId, deposit.nativeId);
  assert.equal(claimReceipt.transactionSHA256, deposit.transactionSHA256); assert.equal(claimReceipt.broadcastAttempts, 1);
  writeFixturePrivate(join(privateDirectory, 'loaded-facts-retained-claim-binding.json'), claimReceipt);
  const beforeCustody = await fixture.solana.inventory();
  const beforeBalances = [await native.balance(native.solver), await native.balance(native.recipients[0]),
    await native.balance(native.recipients[1])];
  const rule = fixture.rules[1]; assert.equal(rule.family, '2');
  const adapter = native.adapter({ asset: rule.asset, recipientIndex: 0 });
  assert.equal(adapter.binding.genesis, rule.genesis); assert.equal(adapter.binding.asset, rule.asset);
  assert.equal(adapter.binding.sourceEndpoint, native.solverHex.slice(2));
  assert.ok(!Object.values(fixture.solana.roles).some(role => role.endpoint === adapter.binding.sourceEndpoint),
    'CLAIM_LOADED_FACTS_SOLVER_IS_CUSTODY');
  const wireKeyCommitment = freshFixtureId();
  let preparedCopy, signed;
  const retain = (name, value) => writeFixturePrivate(join(privateDirectory, 'loaded-facts-' + name + '.json'), value);
  probes.add(fixture);
  await stage('loaded-facts-send-one-original-solver-transfer');
  let submitted;
  try {
    submitted = await adapter.transfer({ amount: '1000000', wireKeyCommitment }, {
      async beforeSign(prepared) {
        assert.equal(prepared.intent.lamports, '1000000');
        assert.equal(prepared.intent.wireKeyCommitment, wireKeyCommitment);
        assert.equal(prepared.intent.sourcePublicKey, adapter.binding.sourceEndpoint);
        assert.equal(prepared.intent.recipientPublicKey, adapter.binding.destinationEndpoint);
        await adapter.assertPrepared(prepared); preparedCopy = structuredClone(prepared);
      },
      async onSigned(payload) {
        const decoded = validateSolanaBindingTransaction(payload.nativeWire, preparedCopy.intent);
        signed = { nativeWire: payload.nativeWire, nativeId: decoded.signatureHex,
          transactionSHA256: decoded.transactionSHA256, prepared: preparedCopy };
        retain('signed-before-broadcast', signed);
      },
    });
  } catch (error) {
    // Reconcile only an uncertain reply for this original identity. No retry,
    // replacement signature or second transfer is permitted by the probe.
    if (error.message !== 'SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE' || !signed
      || error.nativeId !== signed.nativeId) throw error;
    submitted = signed;
  }
  assert.equal(submitted.nativeId, signed.nativeId); assert.equal(submitted.transactionSHA256, signed.transactionSHA256);
  const observation = await native.observe(signed.nativeId);
  assert.equal(observation.status, 'observed', 'CLAIM_LOADED_FACTS_ORIGINAL_NOT_FINALIZED');
  assert.equal(observation.nativeId, signed.nativeId); assert.equal(observation.nativeWire, signed.nativeWire);
  const record = native.transfers[0];
  assert.equal(record.nativeId, signed.nativeId); assert.equal(record.nativeWire, signed.nativeWire);
  assert.equal(record.transactionSHA256, signed.transactionSHA256); assert.deepEqual(record.intent, preparedCopy.intent);
  assert.equal(record.phase, 'OBSERVED_FINALIZED'); assert.equal(record.broadcastAttempts, 1);
  assert.equal(record.observation.nativeId, signed.nativeId); assert.equal(record.observation.nativeWire, signed.nativeWire);
  assert.deepEqual(counts(), [0, 1, 0, 1]); retain('original-finalized', record); await audit();
  const unchangedEffects = () => {
    assert.deepEqual(counts(), [0, 1, 0, 1], 'CLAIM_LOADED_FACTS_NATIVE_EFFECT');
    assert.equal(runtime.transactions.length, evmCount, 'CLAIM_LOADED_FACTS_EVM_EFFECT');
  };
  unchangedEffects();

  await stage('loaded-facts-genuine-quorum-once');
  const facts = await quorum.facts({ family: '2', recipientIndex: '0', nativeId: signed.nativeId, wireKeyCommitment });
  assert.equal(facts.certificates.length, 3); assert.deepEqual(facts.head, beforeClaims.head, 'CLAIM_LOADED_FACTS_HEAD_CHANGED');
  assert.deepEqual(inventoryCounts(), [1, 1, 1, 0], 'CLAIM_LOADED_FACTS_RETAINED_INVENTORY');
  unchangedEffects();
  retain('genuine-quorum', facts); await audit();
  await stage('loaded-facts-health-and-checkpoint-with-retained-fact');
  const health = await quorum.health({ poolIndex: 1 });
  retain('health', health);
  assert.deepEqual(health.head, facts.head, 'CLAIM_LOADED_FACTS_HEAD_CHANGED');
  assert.deepEqual(inventoryCounts(), [1, 1, 1, 0], 'CLAIM_LOADED_FACTS_RETAINED_INVENTORY');
  unchangedEffects();
  const checkpoint = await quorum.checkpoint({ poolIndex: 1, requestId: freshFixtureId() });
  retain('checkpoint', checkpoint);
  assert.deepEqual(checkpoint.head, facts.head, 'CLAIM_LOADED_FACTS_HEAD_CHANGED');
  assert.deepEqual(inventoryCounts(), [1, 1, 1, 0], 'CLAIM_LOADED_FACTS_RETAINED_INVENTORY');
  unchangedEffects();
  const afterClaims = await fixture.observer.read(); loaded(afterClaims);
  assert.deepEqual(afterClaims.head, facts.head, 'CLAIM_LOADED_FACTS_HEAD_CHANGED');
  assert.deepEqual(afterClaims.gateways, beforeClaims.gateways);
  await fixture.observer.assertCurrent(afterClaims);
  const afterCustody = await fixture.solana.inventory();
  assert.deepEqual(afterCustody.accounts, beforeCustody.accounts);
  assert.deepEqual(afterCustody.feeAudit, beforeCustody.feeAudit);
  const afterBalances = [await native.balance(native.solver), await native.balance(native.recipients[0]),
    await native.balance(native.recipients[1])];
  assert.equal(BigInt(beforeBalances[0]) - BigInt(afterBalances[0]), 1000000n + BigInt(record.observation.feeLamports));
  assert.equal(BigInt(afterBalances[1]) - BigInt(beforeBalances[1]), 1000000n);
  assert.equal(afterBalances[2], beforeBalances[2]);
  assert.deepEqual(counts(), [0, 1, 0, 1]);
  // Reobservation legitimately advances finalized-slot context. Preserve the
  // original effect identity rather than requiring an old native observation.
  const retained = native.transfers[0];
  for (const key of ['nativeId', 'nativeWire', 'transactionSHA256', 'intent', 'phase', 'broadcastAttempts'])
    assert.deepEqual(retained[key], record[key], 'CLAIM_LOADED_FACTS_ORIGINAL_CHANGED');
  assert.equal(retained.observation.nativeId, signed.nativeId);
  assert.equal(retained.observation.nativeWire, signed.nativeWire);
  unchangedEffects();
  retain('unchanged-claim-backing', { beforeClaims, afterClaims, beforeCustody, afterCustody, beforeBalances, afterBalances });
  await audit();
  return { scope: 'LOADED_POST_DELIVERY_FACTS_ONLY', success: false, factualChecksPassed: true,
    issuedClaimAmount: '3000000', retainedOriginalClaimBinding: true, solverNativeAmount: '1000000', solverSeparateLiquidity: true,
    originalFinalizedOnce: true, factsCalls: 1, retainedGraphFactPerSigner: 1,
    health: true, checkpoint: true, sameEvmHead: true, custodyUnchanged: true,
    noAttestationTransactionSubmitted: true, providerProofs: false, graphSettlement: false,
    fullNativeGraphAcceptance: false, ownerClaimFullyRedeemed: false };
}
