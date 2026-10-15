import assert from 'node:assert/strict';
import {currentProofLibrariesV1,currentProbePathsV1} from './current-run-paths-v1.mjs';
const {Noir, Barretenberg, BackendType, UltraHonkBackend, UltraHonkVerifierBackend, deflattenFields}=await currentProofLibrariesV1();
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireConstraintFailure } from '../validation/expected-constraint-failure.mjs';

const paths=currentProbePathsV1(process.argv[3]);
const root=paths.source;
const out = paths.outer;
mkdirSync(out, { recursive: true });
const hash = b => createHash('sha256').update(b).digest('hex');
const program = JSON.parse(readFileSync(resolve(paths.compiled, 'recursive_join.json')));
const input = JSON.parse(readFileSync(paths.recursiveInput));
const crsDir = resolve(paths.crs,'2097152');
const crs = JSON.parse(readFileSync(resolve(crsDir, 'provenance.json')));
for (const item of crs.records) assert.equal(hash(readFileSync(resolve(crsDir, item.file))), item.sha256);
const settings = { verifierTarget: 'evm' }; // Keccak + ZK, not legacy keccak:true.
const maximumPages = Number(process.argv[2] ?? 32768);
assert.ok([32768, 65536].includes(maximumPages));
globalThis.fetch = async () => { throw new Error('Recursive proving/verifying must be offline'); };
const reportPath = resolve(out, `attempt-${maximumPages}.json`);
const report = { classification: 'REAL_RECURSIVE_PROVER_ATTEMPT_NOT_PC5', backend: 'Wasm', threads: 1, maximumMiB: maximumPages / 16, outerVerifierTarget: settings.verifierTarget, innerVerifierTarget: 'noir-recursive', innerProofType: 6, sourceSHA256: hash(readFileSync(resolve(root, 'circuits/recursive_join/src/main.nr'))), pinnedKeySourceSHA256: hash(readFileSync(resolve(root, 'circuits/recursive_join/src/approved_vk.nr'))), compiledCircuitSHA256: hash(Buffer.from(program.bytecode, 'base64')), crsProvenance: '../m7-crs-2097152.json', phase: 'initializing', proofGenerated: false, outerVerified: false, negativeCases: [], artifacts: {} };
const persist = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
const phase = name => { report.phase = name; persist(); console.log(JSON.stringify({ phase: name, rss: process.memoryUsage().rss })); };
const save = (name, bytes) => { writeFileSync(resolve(out, name), bytes); report.artifacts[name] = { bytes: bytes.length, sha256: hash(bytes) }; persist(); };
let api;
const started = performance.now();
try {
  persist();
  api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true, memory: { initial: 37, maximum: maximumPages } });
  phase('real-bn254-srs-initialization');
  await api.srsInitSrs({ pointsBuf: readFileSync(resolve(crsDir, 'bn254_g1_compressed.dat')), numPoints: 2097152, g2Point: readFileSync(resolve(crsDir, 'bn254_g2.dat')) });
  const noir = new Noir(program);
  const backend = new UltraHonkBackend(program.bytecode, api);
  const verifier = new UltraHonkVerifierBackend(api);
  phase('witness-generation-not-verification');
  const witnessStart = performance.now();
  const { witness } = await noir.execute(input);
  report.witnessMilliseconds = performance.now() - witnessStart;
  phase('outer-verification-key-generation');
  const keyStart = performance.now();
  const vk = await backend.getVerificationKey(settings);
  report.keyMilliseconds = performance.now() - keyStart;
  save('verification-key.bin', vk);
  phase('outer-proof-generation');
  const proofStart = performance.now();
  const proof = await backend.generateProof(witness, settings);
  report.proofMilliseconds = performance.now() - proofStart;
  report.proofGenerated = true;
  phase('outer-real-verification');
  const verifyStart = performance.now();
  report.outerVerified = await verifier.verifyProof({ ...proof, verificationKey: vk }, settings);
  report.verificationMilliseconds = performance.now() - verifyStart;
  assert.equal(report.outerVerified, true, 'Actual outer verifier rejected valid recursive proof');
  assert.equal(BigInt(proof.publicInputs[0]), BigInt(input.joined));
  report.outerPublicInputs = proof.publicInputs;
  report.outerProofBytes = proof.proof.length;
  save('proof.bin', proof.proof);
  save('public-inputs.json', Buffer.from(JSON.stringify(proof.publicInputs, null, 2) + '\n'));
  save('circuit.json', Buffer.from(JSON.stringify({ noir_version: program.noir_version, abi: program.abi, bytecode: program.bytecode })));
  const wrongPublic = [...proof.publicInputs]; wrongPublic[0] = '0x' + (BigInt(wrongPublic[0]) + 1n).toString(16).padStart(64, '0');
  assert.equal(await verifier.verifyProof({ ...proof, publicInputs: wrongPublic, verificationKey: vk }, settings), false);
  report.negativeCases.push({ name: 'changedOuterPublicInput', rejected: true, stage: 'actual-outer-verifier' });
  persist();

  for (const [name, mutate] of [
    ['substitutedChildProof', bad => { bad.proof_b = [...bad.proof_a]; }],
    ['changedPrivateChildStatement', bad => { bad.inputs_a[3] = (BigInt(bad.inputs_a[3]) + 1n).toString(); }],
  ]) {
    phase(name);
    const bad = structuredClone(input); mutate(bad);
    let witnessProduced = false, candidateProduced = false, candidateVerified = false, rejectedAt = '';
    try {
      const badWitness = await noir.execute(bad); witnessProduced = true;
      const candidate = await backend.generateProof(badWitness.witness, settings); candidateProduced = true;
      candidateVerified = await verifier.verifyProof({ ...candidate, verificationKey: vk }, settings);
      rejectedAt = 'actual-outer-verifier';
      if (!candidateVerified) save(name + '-invalid-proof.bin', candidate.proof);
    } catch (error) {
      rejectedAt = witnessProduced ? 'actual-prover' : 'witness-execution';
      report.lastNegativeError = {name:error?.name==='AssertionError'?'AssertionError':'Error',code:'ORIGINAL_NEGATIVE_PROOF_EXCEPTION'};
    }
    assert.equal(candidateVerified, false, 'Recursive proof accepted invalid child');
    assert.equal(witnessProduced, true, 'This test must reach actual backend, not merely witness validation');
    assert.equal(candidateProduced, true, 'A prover/resource exception is inconclusive, not a verifier rejection');
    assert.equal(rejectedAt, 'actual-outer-verifier', 'A backend exception cannot pass this negative check');
    report.negativeCases.push({ name, witnessProduced, candidateProduced, candidateVerified, rejectedAt });
    persist();
  }
  phase('wrong-approved-vk');
  const wrongKeyInput = structuredClone(input);
  wrongKeyInput.vk = deflattenFields(readFileSync(resolve(paths.child,'wrong-verification-key.bin')));
  const cause = await requireConstraintFailure(() => noir.execute(wrongKeyInput));
  report.negativeCases.push({ name: 'wrongApprovedVk', rejected: true, cause, stage: 'witness-execution of complete key equality, not a backend-verification result' });
  phase('completed');
} catch (error) {
  report.failure = {phase:report.phase,name:error?.name==='AssertionError'?'AssertionError':'Error',code:'M7_ORIGINAL_PROOF_FAILED'};
  report.phase = 'failed';
  console.error(JSON.stringify(report.failure));
  process.exitCode = 1;
} finally {
  report.totalMilliseconds = performance.now() - started;
  report.processResourceUsage = process.resourceUsage();
  report.processMemoryUsage = process.memoryUsage();
  persist();
  if (api) await api.destroy();
  console.log(JSON.stringify({ phase: report.phase, proofGenerated: report.proofGenerated, outerVerified: report.outerVerified, peakRSSKiB: report.processResourceUsage.maxRSS, milliseconds: report.totalMilliseconds }));
}
