/** Pure encoding for the controller's eight fixed gateway transitions. Host
 * commitments are bare hex; Solidity bytes are prefixed only at this boundary.
 * This converter grants no call, signing, observation or proof capability. */
import assert from 'node:assert/strict';
import { exactRecord, fixedArray } from '@lianum/components/encoding/commitments';
import { claimABIType, encodeClaimCall } from '@lianum/engine/claims/abi';
export const CONTROLLER_CLAIM_METHODS = Object.freeze(['preposition', 'renewIntent', 'reserveSignedEffect', 'issue',
  'voidDeposit', 'requestRedemption', 'beginPayout', 'discharge']);
function convert(input, value) {
  const array = /^(.*)\[([0-9]*)\]$/.exec(input.type);
  if (array) { assert.ok(Array.isArray(value)); fixedArray(value, array[2] === '' ? value.length : Number(array[2]));
    return value.map(v => convert({ ...input, type: array[1] }, v)); }
  if (input.type === 'tuple') { exactRecord(value, input.components.map(v => v.name));
    return Object.fromEntries(input.components.map(v => [v.name, convert(v, value[v.name])])); }
  if (/^(bytes([1-9]|[12][0-9]|3[0-2])?|address)$/.test(input.type)) {
    assert.equal(typeof value, 'string'); const raw = value.startsWith('0x') ? value.slice(2) : value;
    assert.match(raw, /^(?:[0-9a-f]{2})*$/, 'CLAIM_CALL_CANONICAL_HEX');
    const width = input.type === 'address' ? 20 : input.type === 'bytes' ? null : Number(input.type.slice(5));
    if (width !== null) assert.equal(raw.length, width * 2, 'CLAIM_CALL_HEX_WIDTH'); return '0x' + raw;
  }
  if (input.type.startsWith('uint') && typeof value === 'number') {
    assert.ok(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)); return String(value);
  }
  return value;
}
export function encodeControllerClaimCall(artifact, method, args) {
  assert.ok(CONTROLLER_CLAIM_METHODS.includes(method), 'CLAIM_FIXED_EVM_METHOD');
  const methods = artifact.abi.filter(v => v.type === 'function' && v.name === method); assert.equal(methods.length, 1);
  const input = methods[0]; fixedArray(args, input.inputs.length);
  const signature = method + '(' + input.inputs.map(claimABIType).join(',') + ')';
  return encodeClaimCall(artifact, signature, input.inputs.map((v, i) => convert(v, args[i])));
}
