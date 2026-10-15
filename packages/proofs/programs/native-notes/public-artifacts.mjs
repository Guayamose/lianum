// Deliberately accepts only public artifacts. Never write the private circuit input.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function savePublicNoteProofArtifacts(directory, { proof, publicInputs }) {
  assert.ok(proof instanceof Uint8Array, 'PUBLIC_PROOF_BYTES');
  assert.ok(Array.isArray(publicInputs) && publicInputs.every(x => typeof x === 'string' && /^0x[0-9a-f]{64}$/i.test(x)), 'PUBLIC_PROOF_INPUTS');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'proof.bin'), proof);
  writeFileSync(join(directory, 'public-inputs.json'), JSON.stringify(publicInputs));
}
