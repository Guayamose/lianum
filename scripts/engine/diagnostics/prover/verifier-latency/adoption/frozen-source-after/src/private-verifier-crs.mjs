/** Verification-only CRS for the pinned official bb.js 5.2.0 verifier.
 * The official verifier requests get_crs(1): canonical uncompressed G1 plus
 * the original G2. Callers MUST still verify the complete proving CRS files
 * and provenance. Proving and its self-verification keep their full CRS.
 * Source: AztecProtocol/aztec-packages commit
 * 49a592109ec4f18d79212b43d621891aaf36f7b6, srs/factories/crs_factory.hpp.
 * No request/environment selector, alternate pin, backend reuse or fallback.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const PRIVATE_VERIFIER_CRS = Object.freeze({
  profile: 'PINNED_BN254_VERIFIER_ONLY_V1',
  officialBarretenbergVersion: '5.2.0',
  officialSourceCommit: '49a592109ec4f18d79212b43d621891aaf36f7b6',
  numPoints: 1,
  g1Encoding: 'uncompressed-big-endian-x-y',
  g1Bytes: 64,
  g1SHA256: 'd6ba9329f8932c12192b37849f772104d20048f76434a3290512d9d814e4116f',
  g2Bytes: 128,
  g2SHA256: '01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f',
  fullCRSIntegrityRequired: true,
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** generator is the official BN254_G1_GENERATOR export, never proof input. */
export async function initializePrivateVerifierCRS(api, generator, originalG2) {
  assert.ok(generator?.x instanceof Uint8Array && generator?.y instanceof Uint8Array, 'PC18_VERIFIER_G1_BYTES');
  assert.equal(generator.x.length, 32, 'PC18_VERIFIER_G1_SIZE');
  assert.equal(generator.y.length, 32, 'PC18_VERIFIER_G1_SIZE');
  assert.ok(originalG2 instanceof Uint8Array, 'PC18_VERIFIER_G2_BYTES');
  assert.equal(originalG2.length, PRIVATE_VERIFIER_CRS.g2Bytes, 'PC18_VERIFIER_G2_SIZE');
  const pointsBuf = Buffer.concat([generator.x, generator.y]), g2Point = Buffer.from(originalG2);
  try {
    assert.equal(hash(pointsBuf), PRIVATE_VERIFIER_CRS.g1SHA256, 'PC18_VERIFIER_G1_PIN');
    assert.equal(hash(g2Point), PRIVATE_VERIFIER_CRS.g2SHA256, 'PC18_VERIFIER_G2_PIN');
    await api.srsInitSrs({pointsBuf, numPoints: PRIVATE_VERIFIER_CRS.numPoints, g2Point});
    return PRIVATE_VERIFIER_CRS;
  } finally {
    pointsBuf.fill(0); g2Point.fill(0);
  }
}
