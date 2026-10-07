import assert from 'node:assert/strict';
import { Barretenberg, BackendType, UltraHonkVerifierBackend } from '@aztec/bb.js';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRetainedInventory, validateRetainedChecks } from './retained-inventory.mjs';
import { parseStrictJSON } from './strict-json.mjs';

// Preflight every required case/file before initializing the real backend.
// Current verification writes a new record, never historical M7 evidence.
const root = fileURLToPath(new URL('.', import.meta.url));
const evidence = resolve(process.argv[2] ?? resolve(root, '../../evidence'));
const output = resolve(process.argv[3] ?? resolve(root, '.local/retained-verification-current.json'));
const { blobs, childInputs, outerInputs, wrongInputs } = loadRetainedInventory(evidence);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const crsDir = resolve(root, '.local/crs/131072');
const crs = parseStrictJSON(readFileSync(resolve(crsDir, 'provenance.json'), 'utf8'));
for (const entry of crs.records) assert.equal(sha(readFileSync(resolve(crsDir, entry.file))), entry.sha256);
globalThis.fetch = async () => { throw new Error('Retained proof verification is offline'); };
const result = { classification: 'STRICT_FRESH_PROCESS_REAL_M7_REVERIFICATION_NOT_PC5', privateWitnessLoaded: false, proofsGenerated: 0, checks: [], crsPoints: 131072, expectedCheckCount: 8 };
const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
try {
  await api.srsInitSrs({ pointsBuf: readFileSync(resolve(crsDir, 'bn254_g1_compressed.dat')), numPoints: 131072, g2Point: readFileSync(resolve(crsDir, 'bn254_g2.dat')) });
  const verifier = new UltraHonkVerifierBackend(api);
  const check = async (name, proof, publicInputs, verificationKey, verifierTarget) => {
    const verified = await verifier.verifyProof({ proof, publicInputs, verificationKey }, { verifierTarget });
    result.checks.push({ name, verified, proofSHA256: sha(proof), publicInputCount: publicInputs.length });
  };
  for (const index of [0, 1]) await check(`retained-child-${index}`, blobs.child[`branch-${index}-proof.bin`], childInputs[index], blobs.child['verification-key.bin'], 'noir-recursive');
  await check('retained-outer', blobs.outer['proof.bin'], outerInputs, blobs.outer['verification-key.bin'], 'evm');
  const changed = [...outerInputs]; changed[0] = '0x' + (BigInt(changed[0]) + 1n).toString(16).padStart(64, '0');
  await check('changed-outer-public-input', blobs.outer['proof.bin'], changed, blobs.outer['verification-key.bin'], 'evm');
  for (const name of ['substitutedChildProof', 'changedPrivateChildStatement']) await check('retained-invalid-' + name, blobs.outer[name + '-invalid-proof.bin'], outerInputs, blobs.outer['verification-key.bin'], 'evm');
  await check('retained-unapproved-child-control', blobs.wrong['unapproved-child-proof.bin'], childInputs[0], blobs.child['wrong-verification-key.bin'], 'noir-recursive');
  await check('retained-invalid-unapproved-child', blobs.wrong['unapproved-child-invalid-outer-proof.bin'], wrongInputs, blobs.outer['verification-key.bin'], 'evm');
  validateRetainedChecks(result.checks);
  result.completedCheckCount = result.checks.length;
  result.resourceUsage = process.resourceUsage();
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { await api.destroy(); }
