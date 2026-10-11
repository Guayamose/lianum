/** Fixed-head validation-library pin. A matching getter is data only; the
 * caller retains deployment, current-head, bytecode and observer ownership. */
import assert from 'node:assert/strict';

/**
 * @param {{nativeSplCustodyProfile?: boolean, libraries: {
 *   nativeClaimValidation: {codeHash: string}, nativeSplClaimValidation?: {codeHash: string}}}} claims
 * @param {number} index
 * @param {(expectedCodeHash: string) => Promise<void>} expect
 */
export async function assertNativeClaimValidationLibraryV1(claims,index,expect){
 const library=claims.nativeSplCustodyProfile===true&&index===1
  ?claims.libraries.nativeSplClaimValidation:claims.libraries.nativeClaimValidation;
 assert.ok(library,'CLAIM_STATE_VALIDATION_LIBRARY_REQUIRED');
 await expect(library.codeHash);
}
