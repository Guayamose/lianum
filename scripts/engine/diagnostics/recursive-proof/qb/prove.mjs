import assert from 'node:assert/strict';
import { Noir } from '@noir-lang/noir_js';
import { Barretenberg, BackendType, UltraHonkBackend, UltraHonkVerifierBackend } from '@aztec/bb.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { H, publicInputs, witness } from './wire.mjs';
import { requireVerifierRejection } from '../validation/verifier-negative.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const local = resolve(root, '../.local/qb'), owner = resolve(local, 'owner');
const out = resolve(root, '../../../evidence/m8-qb-proof'); mkdirSync(out, { recursive: true });
const program = JSON.parse(readFileSync(resolve(local, 'circuit.json')));
const crsDir = resolve(root, '../.local/crs/131072');
const crs = JSON.parse(readFileSync(resolve(crsDir, 'provenance.json')));
for (const r of crs.records) assert.equal(H(readFileSync(resolve(crsDir, r.file))).toString('hex'), r.sha256);
const settings = { verifierTarget: 'noir-recursive' };
globalThis.fetch = async () => { throw new Error('Application subrelation proving is offline'); };
const report = { classification: 'REAL_SELECTED_BRANCH_QUOTE_BINDING_SUBRELATION_NOT_AUTHORIZATION_OR_FULFILLMENT', backend: 'Wasm', threads: 1, wasmMaximumMiB: 2048, mode: settings.verifierTarget, zeroKnowledge: true, noNewPackages: true, crsPoints: 131072, phase: 'initializing', cases: [], artifacts: {} };
const persist = () => writeFileSync(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
const save = (name, bytes) => { writeFileSync(resolve(out, name), bytes); report.artifacts[name] = { bytes: bytes.length, sha256: H(bytes).toString('hex') }; persist(); };
const phase = name => { report.phase = name; persist(); console.log(JSON.stringify({ phase: name })); };
const start = performance.now(); let api;
try {
  api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
  await api.srsInitSrs({ pointsBuf: readFileSync(resolve(crsDir, 'bn254_g1_compressed.dat')), numPoints: 131072, g2Point: readFileSync(resolve(crsDir, 'bn254_g2.dat')) });
  const backend = new UltraHonkBackend(program.bytecode, api), verifier = new UltraHonkVerifierBackend(api), noir = new Noir(program);
  phase('verification-key'); const keyStart = performance.now(); const vk = await backend.getVerificationKey(settings); report.keyMilliseconds = performance.now() - keyStart;
  save('verification-key.bin', vk); save('circuit.json', Buffer.from(JSON.stringify({ noir_version: program.noir_version, abi: program.abi, bytecode: program.bytecode })));
  for (const branch of [0, 1]) {
    phase('branch-' + branch);
    const statement = readFileSync(resolve(owner, `statement-${branch}.bin`));
    const input = witness(readFileSync(resolve(owner, 'menu.bin')), readFileSync(resolve(owner, `legS-${branch}.bin`)), readFileSync(resolve(owner, `legB-${branch}.bin`)), readFileSync(resolve(owner, 'result-salt.bin')), statement);
    const witnessStart = performance.now(); const solved = await noir.execute(input); const witnessMilliseconds = performance.now() - witnessStart;
    const proofStart = performance.now(); const proof = await backend.generateProof(solved.witness, settings); const proofMilliseconds = performance.now() - proofStart;
    assert.deepEqual(proof.publicInputs, publicInputs(statement)); assert.equal(proof.publicInputs.length, 161);
    const verifyStart = performance.now(); const verified = await verifier.verifyProof({ ...proof, verificationKey: vk }, settings); const verificationMilliseconds = performance.now() - verifyStart; assert.equal(verified, true);
    const mutations = {};
    for (const [name, index] of [['scope', 0], ['session', 32], ['branch', 64], ['menuBinding', 65], ['SConstraint', 97], ['BConstraint', 129]]) {
      const changed = [...proof.publicInputs]; changed[index] = '0x' + (BigInt(changed[index]) ^ 1n).toString(16).padStart(64, '0');
      mutations[name] = await requireVerifierRejection(() => verifier.verifyProof({ ...proof, publicInputs: changed, verificationKey: vk }, settings));
    }
    const replayVerifies = await verifier.verifyProof({ ...proof, verificationKey: vk }, settings); assert.equal(replayVerifies, true);
    save(`branch-${branch}-proof.bin`, proof.proof); save(`branch-${branch}-statement.bin`, statement);
    save(`branch-${branch}-public-inputs.json`, Buffer.from(JSON.stringify(proof.publicInputs, null, 2) + '\n'));
    report.cases.push({ branch, verified, replayVerifies, replayMeaning: 'No authority/effect-consumption state is implemented', witnessMilliseconds, proofMilliseconds, verificationMilliseconds, proofBytes: proof.proof.length, publicInputCount: proof.publicInputs.length, mutations }); persist();
    console.log(JSON.stringify({ branch, verified, proofMilliseconds, proofBytes: proof.proof.length }));
  }
  report.crossBranchSubstitution = await requireVerifierRejection(() => verifier.verifyProof({ proof: readFileSync(resolve(out, 'branch-0-proof.bin')), publicInputs: JSON.parse(readFileSync(resolve(out, 'branch-1-public-inputs.json'))), verificationKey: vk }, settings));
  phase('completed');
} catch (error) { report.failure = { phase: report.phase, message: error.message }; report.phase = 'failed'; process.exitCode = 1; console.error(JSON.stringify(report.failure)); }
finally { report.totalMilliseconds = performance.now() - start; report.resourceUsage = process.resourceUsage(); persist(); if (api) await api.destroy(); console.log(JSON.stringify({ phase: report.phase, generatedValidProofs: report.cases.length, totalMilliseconds: report.totalMilliseconds, peakRSSKiB: report.resourceUsage.maxRSS })); }
