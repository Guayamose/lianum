/** Exact gateway issue ABI only. Byte parsing grants no proof or receipt authority. */
import assert from 'node:assert/strict';
import { publicKeccak256 } from '../cohorts/private-cohort-public-native.mjs';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { decodeDepositIntentInputs } from '../execution/inputs/deposit-intent.mjs';
import { decodeClaimIngressInputs } from './framing.mjs';
import { CLAIM_BACKING_FIELDS } from './permits.mjs';
import { claimABIType, encodeClaimABI } from './abi.mjs';

const proof = name => ({ name, type: 'tuple', components: [{ name: 'proof', type: 'bytes' }, { name: 'inputs', type: 'bytes32[]' }] });
const signature = name => ({ name, type: 'tuple[3]', components: [
  { name: 'signerIndex', type: 'uint8' }, { name: 'v', type: 'uint8' }, { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' }] });
const schema = [proof('ownerProof'), proof('ingressProof'), { name: 'authorization', type: 'tuple', components: [
  { name: 'permit', type: 'tuple', components: CLAIM_BACKING_FIELDS.map(([name, type]) => ({ name, type: type === 'b32' ? 'bytes32' : 'uint' + type.slice(1) })) },
  signature('signatures'), { name: 'healthFrom', type: 'uint64' }, { name: 'healthUntil', type: 'uint64' }, signature('healthSignatures'),
] }];
export const NATIVE_CLAIM_ISSUE_SIGNATURE = 'issue(' + schema.map(claimABIType).join(',') + ')';
export const NATIVE_CLAIM_ISSUE_SELECTOR = publicKeccak256(Buffer.from(NATIVE_CLAIM_ISSUE_SIGNATURE)).subarray(0, 4).toString('hex');
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

export function encodeNativeClaimIssueCall(input) {
  exactRecord(input, ['ownerProof', 'ingressProof', 'authorization']);
  return '0x' + NATIVE_CLAIM_ISSUE_SELECTOR + encodeClaimABI(schema, [input.ownerProof, input.ingressProof, input.authorization]).slice(2);
}

export function decodeNativeClaimIssueCall(calldata) {
  assert.ok(typeof calldata === 'string' && calldata.length <= 2 * 1024 * 1024 + 10
    && /^0x(?:[0-9a-f]{2})+$/.exec(calldata)?.[0] === calldata, 'CLAIM_ISSUE_CALLDATA');
  assert.equal(calldata.slice(2, 10), NATIVE_CLAIM_ISSUE_SELECTOR, 'CLAIM_ISSUE_SELECTOR');
  const body = calldata.slice(10);
  const word = offset => {
    assert.ok(Number.isSafeInteger(offset) && offset >= 0 && (offset + 32) * 2 <= body.length, 'CLAIM_ISSUE_WORD_BOUND');
    return '0x' + body.slice(offset * 2, (offset + 32) * 2);
  };
  const size = offset => {
    const value = BigInt(word(offset)); assert.ok(value <= 1024n * 1024n, 'CLAIM_ISSUE_OFFSET_BOUND'); return Number(value);
  };
  let cursor = 64;
  const scalar = type => {
    const value = word(cursor); cursor += 32;
    if (type === 'b32') return value;
    const n = BigInt(value); assert.ok(n < 1n << BigInt(type.slice(1)), 'CLAIM_ISSUE_UINT'); return n.toString();
  };
  const signatures = () => Array.from({ length: 3 }, () => ({ signerIndex: scalar('u8'), v: scalar('u8'), r: scalar('b32'), s: scalar('b32') }));
  const authorization = { permit: Object.fromEntries(CLAIM_BACKING_FIELDS.map(([name, type]) => [name, scalar(type)])),
    signatures: signatures(), healthFrom: scalar('u64'), healthUntil: scalar('u64'), healthSignatures: signatures() };
  const tuple = (at, count) => {
    assert.equal(size(at), 64, 'CLAIM_ISSUE_PROOF_OFFSET');
    const length = size(at + 64); assert.ok(length > 0 && length <= 65536, 'CLAIM_ISSUE_PROOF_BOUND');
    const padded = Math.ceil(length / 32) * 32, inputOffset = 96 + padded;
    assert.equal(size(at + 32), inputOffset, 'CLAIM_ISSUE_INPUT_OFFSET');
    assert.equal(size(at + inputOffset), count, 'CLAIM_ISSUE_INPUT_WIDTH');
    const inputs = Array.from({ length: count }, (_, i) => word(at + inputOffset + 32 + 32 * i));
    const proof = '0x' + body.slice((at + 96) * 2, (at + 96 + length) * 2);
    assert.equal(body.slice((at + 96 + length) * 2, (at + inputOffset) * 2), '0'.repeat((padded - length) * 2), 'CLAIM_ISSUE_PROOF_PADDING');
    return { value: { proof, inputs }, end: at + inputOffset + 32 + 32 * count };
  };
  assert.equal(size(0), cursor, 'CLAIM_ISSUE_OWNER_OFFSET');
  const owner = tuple(cursor, 27);
  assert.equal(size(32), owner.end, 'CLAIM_ISSUE_INGRESS_OFFSET');
  const ingress = tuple(owner.end, 51);
  assert.equal(ingress.end * 2, body.length, 'CLAIM_ISSUE_TRAILING_BYTES');
  const result = { ownerProof: owner.value, ingressProof: ingress.value, authorization };
  decodeDepositIntentInputs(result.ownerProof.inputs.map(value => BigInt(value).toString()));
  decodeClaimIngressInputs(result.ingressProof.inputs.map(value => BigInt(value).toString()));
  assert.equal(encodeNativeClaimIssueCall(result), calldata, 'CLAIM_ISSUE_CANONICAL_ABI');
  return freeze(result);
}
