/** Portable/original cross-conformance only: original Node constructors are
 * the independent byte oracle. No circuit/proof/native or mobile hardware. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { compileFundedGraph, ownerAuthorizationMessage, fundedAuthorizationWords, payoutInvoiceMessage }
  from '../../../packages/engine/src/execution/graph/funded-graph.mjs';
import { compileLocalFundedBalanceGraphV1, localFundedOwnerFrameV1, localFundedAuthorizationWordsV1,
  localFundedInvoiceFrameV1, normalizeLocalFundedProposalV1 }
  from '../src/custody/funded-balance-owner-codec-v1.mjs';
const hex = index => index.toString(16).padStart(64, '0');
function opening(index, value) {
  const key = createECDH('secp256k1'); key.setPrivateKey(Buffer.from(hex(index), 'hex'));
  const pub = key.getPublicKey().toString('hex');
  return { type: 4, rho: hex(index + 10), x: pub.slice(2, 66), y: pub.slice(66), value, secret: hex(index + 20) };
}
function fixture(count) {
  const max = ((1n << 64n) - 1n).toString(), budget = String(count * 30);
  return { scope: 'ff'.repeat(32), policy: '80'.repeat(32), asset: hex(99), operationId: hex(100), budget,
    fundingNotBefore: '0', fundingValidUntil: '600', settleBefore: max,
    reservationNonce: hex(101), reserveSecret: hex(102), graphNonce: hex(103),
    inputNote: opening(1, max), changeNote: opening(2, String(BigInt(max) - BigInt(budget))), recoveryNote: opening(3, budget),
    paddingSalts: [104, 105, 106, 107].map(hex),
    nodes: Array.from({ length: count }, (_, index) => ({ id: 'node_' + index, dependsOn: index ? ['node_' + (index - 1)] : [],
      chainDomain: hex(index + 110), evidencePolicy: hex(index + 120), actionCommitment: hex(index + 130),
      payout: { ...opening(index + 4, '30'), randomness: hex(index + 140) } })).map(node => {
        const { type, rho, ...payout } = node.payout; return { ...node, payout }; }).reverse() };
}
test('portable fixed balance graph matches every original H4/SHA statement, opening, quote and139words for all capacities', () => {
  for (let count = 1; count <= 4; count++) {
    const input = fixture(count), original = compileFundedGraph(input), portable = compileLocalFundedBalanceGraphV1(input);
    assert.deepEqual(portable, original);
    assert.deepEqual(Buffer.from(localFundedOwnerFrameV1(portable.authorizationStatement)), ownerAuthorizationMessage(original.authorizationStatement));
    assert.deepEqual(localFundedAuthorizationWordsV1(portable.authorizationStatement), fundedAuthorizationWords(original.authorizationStatement));
    assert.equal(localFundedAuthorizationWordsV1(portable.authorizationStatement).length, 139);
    portable.ownerWitness.graph.nodes.forEach((node, slot) => assert.deepEqual(
      Buffer.from(localFundedInvoiceFrameV1(portable.authorizationStatement, node, slot)),
      payoutInvoiceMessage(original.authorizationStatement, original.ownerWitness.graph.nodes[slot], slot)));
    assert.equal(Buffer.from(localFundedOwnerFrameV1(portable.authorizationStatement)).length <= 4096, true);
  }
});
test('portable preparation rejects changed conservation, cycles, duplicate payouts and source legacy types before any signing', () => {
  const input = fixture(2);
  for (const change of [value => { value.changeNote.value = '1'; }, value => { value.recoveryNote.value = '1'; },
    value => { value.nodes[1].dependsOn = [value.nodes[0].id]; }, value => { value.inputNote.type = 3; },
    value => { value.nodes[0].payout.value = '30\n'; }, value => { value.fundingValidUntil = '0'; }]) {
    const value = structuredClone(input); change(value); assert.throws(() => compileLocalFundedBalanceGraphV1(value));
  }
  const { reservationNonce, reserveSecret, graphNonce, inputNote, changeNote, recoveryNote, paddingSalts, ...proposal } = input;
  assert.equal(normalizeLocalFundedProposalV1(proposal).budget, input.budget);
  assert.throws(() => normalizeLocalFundedProposalV1({ ...proposal, inputNote }), /ENCODING/);
});

test('portable native quote action matches the original H4 V2 bytes, including u128 native amounts and exact windows', async () => {
  const { nativeTransferActionCommitment } = await import('../../../packages/engine/src/execution/native/dispatch/native-capsules.mjs');
  const { localNativeTransferActionCommitmentV1 } = await import('../src/custody/funded-balance-owner-codec-v1.mjs');
  const action = { chainDomain: hex(1), signerIdentity: hex(2), sourceCommitment: hex(3), destinationCommitment: hex(4),
    amount: ((1n << 128n) - 1n).toString(), custodyKind: 1, custodyCommitment: hex(5), executionFrom: '0',
    executionUntil: '600', settleBefore: '900', receiptKeyCommitment: hex(6), receiptRho: hex(7), deliveryRiskCommitment: hex(8), actionSalt: hex(9) };
  assert.equal(localNativeTransferActionCommitmentV1(action), nativeTransferActionCommitment(action));
  for (const changes of [{ amount: (1n << 128n).toString() }, { amount: '0' }, { executionUntil: '0' },
    { custodyKind: 2 }, { actionSalt: '00'.repeat(32) }, { privateKey: hex(10) }]) {
    assert.throws(() => localNativeTransferActionCommitmentV1({ ...action, ...changes }));
  }
});
