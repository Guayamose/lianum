import assert from 'node:assert/strict';
import { Noir } from '@noir-lang/noir_js';
import { Barretenberg, BackendType, UltraHonkBackend, UltraHonkVerifierBackend, deflattenFields } from '@aztec/bb.js';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = resolve(root, '../../evidence/m7-recursive-probe');
const childDir = resolve(root, '../../evidence/m7-proof-probe');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { classification: 'REAL_RECURSIVE_UNAPPROVED_CHILD_CIRCUIT_CHECK_NOT_PC5', phase: 'initializing', outerRejected: false, artifacts: {} };
const persist = () => writeFileSync(resolve(output, 'wrong-key-child.json'), JSON.stringify(report, null, 2) + '\n');
const phase = name => { report.phase = name; persist(); console.log(JSON.stringify({ phase: name })); };
const save = (name, bytes) => { writeFileSync(resolve(output, name), bytes); report.artifacts[name] = { bytes: bytes.length, sha256: sha(bytes) }; persist(); };
const crsDir = resolve(root, '.local/crs/2097152');
const crs = JSON.parse(readFileSync(resolve(crsDir, 'provenance.json')));
for (const item of crs.records) assert.equal(sha(readFileSync(resolve(crsDir, item.file))), item.sha256);
globalThis.fetch = async () => { throw new Error('Recursive wrong-key check is offline'); };
const started = performance.now();
let api;
try {
  api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
  await api.srsInitSrs({ pointsBuf: readFileSync(resolve(crsDir, 'bn254_g1_compressed.dat')), numPoints: 2097152, g2Point: readFileSync(resolve(crsDir, 'bn254_g2.dat')) });
  const verifier = new UltraHonkVerifierBackend(api);
  const wrongProgram = JSON.parse(readFileSync(resolve(root, '.local/compiled/wrong_key.json')));
  const publicInputs = JSON.parse(readFileSync(resolve(childDir, 'branch-0-public-inputs.json')));
  const wrongWitness = await new Noir(wrongProgram).execute({ x: String(publicInputs.reduce((sum, n) => sum + BigInt(n), 0n)), k: publicInputs[0], payout_s: publicInputs[1], payout_b: publicInputs[2], digest: publicInputs.slice(3) });
  phase('valid-child-proof-under-unapproved-circuit');
  const childProof = await new UltraHonkBackend(wrongProgram.bytecode, api).generateProof(wrongWitness.witness, { verifierTarget: 'noir-recursive' });
  assert.deepEqual(childProof.publicInputs.map(BigInt), publicInputs.map(BigInt));
  const wrongVk = readFileSync(resolve(childDir, 'wrong-verification-key.bin'));
  assert.equal(await verifier.verifyProof({ ...childProof, verificationKey: wrongVk }, { verifierTarget: 'noir-recursive' }), true);
  assert.equal(await verifier.verifyProof({ ...childProof, verificationKey: readFileSync(resolve(childDir, 'verification-key.bin')) }, { verifierTarget: 'noir-recursive' }), false);
  report.unapprovedChildVerifiedUnderOwnKey = true;
  report.unapprovedChildRejectedUnderApprovedKey = true;
  save('unapproved-child-proof.bin', childProof.proof);
  const input = JSON.parse(readFileSync(resolve(root, '.local/recursive-input.json')));
  input.proof_a = deflattenFields(childProof.proof);
  assert.equal(input.proof_a.length, 458);
  // Keep the pinned approved key. A valid proof of a different relation cannot
  // stand in for the approved arithmetic/hash child, despite identical inputs.
  const program = JSON.parse(readFileSync(resolve(output, 'circuit.json')));
  const witness = await new Noir(program).execute(input);
  report.outerWitnessProduced = true;
  phase('outer-proof-with-unapproved-child');
  const proofStart = performance.now();
  const candidate = await new UltraHonkBackend(program.bytecode, api).generateProof(witness.witness, { verifierTarget: 'evm' });
  report.proofMilliseconds = performance.now() - proofStart;
  report.outerCandidateProduced = true;
  const accepted = await verifier.verifyProof({ ...candidate, verificationKey: readFileSync(resolve(output, 'verification-key.bin')) }, { verifierTarget: 'evm' });
  assert.equal(accepted, false, 'Unapproved circuit child was accepted by recursive verifier');
  report.outerRejected = true;
  report.rejectionStage = 'actual-outer-verifier-returned-false';
  save('unapproved-child-invalid-outer-proof.bin', candidate.proof);
  save('unapproved-child-outer-public-inputs.json', Buffer.from(JSON.stringify(candidate.publicInputs, null, 2) + '\n'));
  phase('completed');
} catch (error) {
  report.failure = { phase: report.phase, name: error.name, message: error.message };
  report.phase = 'failed';
  // An exception (including an allocation failure) is inconclusive. It must
  // never be counted as an actual outer-verifier rejection.
  process.exitCode = 1;
  console.error(JSON.stringify(report.failure));
} finally {
  report.totalMilliseconds = performance.now() - started;
  report.processResourceUsage = process.resourceUsage();
  persist();
  if (api) await api.destroy();
  console.log(JSON.stringify({ phase: report.phase, outerRejected: report.outerRejected, milliseconds: report.totalMilliseconds }));
}
