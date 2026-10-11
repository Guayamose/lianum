// @ts-check
/** Canonical claim numbers and raw SHA-256 digests. No protocol issuer or
 * signature verification dependencies belong in these byte-only primitives. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
/** @param {unknown} value @param {number} [bits] @returns {bigint} */
export function claimUint(value,bits=64){
 assert.equal(typeof value,'string','CLAIM_DECIMAL_STRING');
 assert.ok(typeof value==='string','CLAIM_DECIMAL_STRING');
 assert.ok(value.length>0&&value.length<=78&&/^(0|[1-9][0-9]*)$/.test(value),'CLAIM_CANONICAL_UINT');
 const result=BigInt(value);assert.equal(result.toString(),value,'CLAIM_CANONICAL_UINT');
 assert.ok(result<(1n<<BigInt(bits)),'CLAIM_UINT_RANGE');return result;
}
/** @param {string | NodeJS.ArrayBufferView} bytes @returns {string} */
export const claimHash=bytes=>createHash('sha256').update(bytes).digest('hex');
