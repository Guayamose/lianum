/** Synthetic ABI fixtures only, with no proof, signer, node or deployment authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeNativeClaimIssueCall, decodeNativeClaimIssueCall, NATIVE_CLAIM_ISSUE_SIGNATURE } from '../../../src/claims/protocol/issue-call.mjs';
import { CLAIM_BACKING_FIELDS } from '../../../src/claims/authorization/permits.mjs';
import { encodeClaimIngressInputs } from '../../../src/claims/protocol/framing.mjs';
import { encodeDepositIntentInputs } from '../../../src/execution/account/preparation/deposit-intent.mjs';

const h = label => createHash('sha256').update('synthetic issue calldata/' + label).digest('hex');
const p = value => '0x' + value;
const w = n => p(BigInt(n).toString(16).padStart(64, '0'));
function fixture() {
  const owner = { scope: h('scope'), policy: h('policy'), validFrom: '1', validUntil: '30', amount: '99', output: h('Q') };
  const ingress = { claimDomain: h('domain'), outputQ: owner.output, admissionN: h('N'), refundDestination: h('refund'),
    admissionRevocationState: '01' + h('revocation').slice(2), ingressReceiptLeaf: '01' + h('receipt').slice(2), amountQ: '99', evidenceFrom: '1', evidenceUntil: '30' };
  const signatures = [0, 1, 2].map(i => ({ signerIndex: String(i), v: '27', r: p(h('r' + i)), s: p(h('s' + i)) }));
  return { ownerProof: { proof: '0x' + 'a5'.repeat(33), inputs: encodeDepositIntentInputs(owner).map(w) },
    ingressProof: { proof: '0x5a', inputs: encodeClaimIngressInputs(ingress).map(w) },
    authorization: { permit: Object.fromEntries(CLAIM_BACKING_FIELDS.map(([name, type]) => [name, type === 'b32' ? p(h(name)) : '1'])),
      signatures, healthFrom: '1', healthUntil: '30', healthSignatures: structuredClone(signatures) } };
}
test('exact issue calldata roundtrips two dynamic proofs and the full backing/health authorization', () => {
  const input = fixture(), wire = encodeNativeClaimIssueCall(input), decoded = decodeNativeClaimIssueCall(wire);
  assert.deepEqual(decoded, input); assert.ok(Object.isFrozen(decoded.authorization.permit));
  assert.match(NATIVE_CLAIM_ISSUE_SIGNATURE, /^issue\(\(bytes,bytes32\[\]\),\(bytes,bytes32\[\]\),/);
});
test('issue calldata rejects alternative offsets, padding, widths, appended bytes and a different selector', () => {
  const wire = encodeNativeClaimIssueCall(fixture());
  const patch = (byte, replacement) => wire.slice(0, 10 + 2 * byte) + replacement.slice(2) + wire.slice(10 + 2 * (byte + 32));
  for (const changed of [wire + '00', wire + '\n', wire.toUpperCase(), '0x00000000' + wire.slice(10),
    patch(0, w(32)), patch(32, w(1472)), patch(1472, w(96)), patch(1472 + 64, w(0))])
    assert.throws(() => decodeNativeClaimIssueCall(changed));
  const input = fixture(); input.ownerProof.inputs.pop();
  assert.throws(() => decodeNativeClaimIssueCall(encodeNativeClaimIssueCall(input)), /WIDTH/);
  const malformed = fixture(); malformed.ownerProof.inputs[16] = w(1n << 64n);
  assert.throws(() => decodeNativeClaimIssueCall(encodeNativeClaimIssueCall(malformed)), /UINT_RANGE/);
});
