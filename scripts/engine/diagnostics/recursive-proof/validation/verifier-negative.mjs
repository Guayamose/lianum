import assert from 'node:assert/strict';

export async function requireVerifierRejection(operation, { allowPinnedPointDecoderError = false } = {}) {
  let accepted;
  try { accepted = await operation(); }
  catch (error) {
    if (allowPinnedPointDecoderError && error instanceof Error && error.message === 'Deserialized point is not on the curve') {
      return { accepted: false, rejection: 'verifier-threw:Deserialized point is not on the curve', stage: 'malformed-point-decoder' };
    }
    throw error; // Allocation, transport, backend and unrelated errors fail the run.
  }
  assert.equal(accepted, false, 'Expected actual verifier false');
  return { accepted: false, rejection: 'verifier-returned-false', stage: 'actual-verifier' };
}
