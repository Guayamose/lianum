/** Bounded ABI serialization for the pinned claim contracts. This module
 * grants no proof, deployment, signing, receipt or state-observation authority.
 * All offsets are relative to the tuple/array that contains them. */
import assert from 'node:assert/strict';
import { exactRecord, fixedArray } from '../../execution/encoding/commitments.mjs';
import { publicKeccak256 } from '../../../../engine/src/cohorts/private-cohort-public-native.mjs';

const MAX_BYTES = 2 * 1024 * 1024;
const word = value => BigInt(value).toString(16).padStart(64, '0');

export function claimABIType(input) {
  return input.type.startsWith('tuple')
    ? '(' + input.components.map(claimABIType).join(',') + ')' + input.type.slice(5)
    : input.type;
}
function arrayType(input) {
  const match = /^(.*)\[([0-9]*)\]$/.exec(input.type);
  return match && { child: { ...input, type: match[1] },
    length: match[2] === '' ? null : Number(match[2]) };
}
function isDynamic(input) {
  const array = arrayType(input);
  if (array) return array.length === null || isDynamic(array.child);
  if (input.type === 'tuple') return input.components.some(isDynamic);
  return input.type === 'bytes';
}
function integer(value, bits) {
  assert.ok(typeof value === 'string' && value.length <= 78
    && /^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value, 'CLAIM_ABI_UINT');
  const result = BigInt(value);
  assert.ok(result < 1n << BigInt(bits), 'CLAIM_ABI_UINT_RANGE');
  return result;
}
function bytes(value, length) {
  assert.ok(typeof value === 'string' && value.length <= 2 + MAX_BYTES * 2
    && /^0x(?:[0-9a-f]{2})*$/.exec(value)?.[0] === value, 'CLAIM_ABI_BYTES');
  const raw = value.slice(2);
  if (length !== undefined) assert.equal(raw.length, length * 2, 'CLAIM_ABI_BYTES_WIDTH');
  return raw;
}
function sequence(inputs, values, depth) {
  assert.ok(depth < 16, 'CLAIM_ABI_NESTING');
  fixedArray(values, inputs.length);
  const parts = inputs.map((input, index) => ({ dynamic: isDynamic(input),
    data: encodeValue(input, values[index], depth + 1) }));
  let offset = parts.reduce((n, part) => n + (part.dynamic ? 32 : part.data.length / 2), 0);
  const head = [], tail = [];
  for (const part of parts) {
    if (part.dynamic) { head.push(word(offset)); tail.push(part.data); offset += part.data.length / 2; }
    else head.push(part.data);
  }
  assert.ok(offset <= MAX_BYTES, 'CLAIM_ABI_SIZE');
  return head.join('') + tail.join('');
}
function encodeValue(input, value, depth) {
  const array = arrayType(input);
  if (array) {
    assert.ok(Array.isArray(value) && value.length <= 128, 'CLAIM_ABI_ARRAY_BOUND');
    fixedArray(value, array.length ?? value.length);
    const body = sequence(value.map(() => array.child), value, depth);
    return (array.length === null ? word(value.length) : '') + body;
  }
  if (input.type === 'tuple') {
    exactRecord(value, input.components.map(field => field.name));
    return sequence(input.components, input.components.map(field => value[field.name]), depth);
  }
  if (input.type === 'bytes') {
    const raw = bytes(value), size = raw.length / 2;
    return word(size) + raw.padEnd(Math.ceil(size / 32) * 64, '0');
  }
  if (input.type === 'address') return bytes(value, 20).padStart(64, '0');
  if (input.type === 'bool') { assert.equal(typeof value, 'boolean', 'CLAIM_ABI_BOOL'); return word(value ? 1 : 0); }
  const fixed = /^bytes([1-9]|[12][0-9]|3[0-2])$/.exec(input.type);
  if (fixed) return bytes(value, Number(fixed[1])).padEnd(64, '0');
  const uint = /^uint(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)$/.exec(input.type);
  assert.ok(uint, 'CLAIM_ABI_UNSUPPORTED_TYPE');
  return word(integer(value, Number(uint[1])));
}
export function encodeClaimABI(inputs, values) {
  assert.ok(Array.isArray(inputs) && inputs.length <= 128, 'CLAIM_ABI_SCHEMA_BOUND');
  return '0x' + sequence(inputs, values, 0);
}
export function encodeClaimCall(artifact, signature, values = []) {
  const methods = artifact.abi.filter(item => item.type === 'function'
    && item.name + '(' + item.inputs.map(claimABIType).join(',') + ')' === signature);
  assert.equal(methods.length, 1, 'CLAIM_ABI_PINNED_METHOD');
  const selector = publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex');
  assert.equal(artifact.evm.methodIdentifiers[signature], selector, 'CLAIM_ABI_SELECTOR');
  return '0x' + selector + encodeClaimABI(methods[0].inputs, values).slice(2);
}
