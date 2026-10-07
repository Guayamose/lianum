import assert from 'node:assert/strict';
import { Noir } from '@noir-lang/noir_js';
import { Barretenberg, BackendType, UltraHonkBackend, UltraHonkVerifierBackend } from '@aztec/bb.js';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireVerifierRejection } from './verifier-negative.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const out = resolve(root, '../../evidence/m7-proof-probe');
mkdirSync(out, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const settings = { verifierTarget: 'noir-recursive' };
globalThis.fetch = async () => { throw new Error('Proving/verifying must be offline'); };
const program = JSON.parse(readFileSync(resolve(root, '.local/compiled/arithmetic_sha256.json')));
const wrongProgram = JSON.parse(readFileSync(resolve(root, '.local/compiled/wrong_key.json')));
const crsDir = resolve(root, '.local/crs/131072');
const crs = JSON.parse(readFileSync(resolve(crsDir, 'provenance.json')));
for (const record of crs.records) {
  const bytes = readFileSync(resolve(crsDir, record.file));
  assert.equal(bytes.length, record.bytes);
  assert.equal(hash(bytes), record.sha256);
}
const started = performance.now();
const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true, memory: { initial: 37, maximum: 32768 }, logger: m => console.log(m) });
const result = { classification: 'REAL_LOCAL_ZK_CAPABILITY_EXPERIMENT_NOT_PC5_FULFILLMENT', mode: settings.verifierTarget, zeroKnowledgeEnabledByPinnedBackend: true, backend: 'Wasm', threads: 1, wasmMaximumMiB: 2048, node: process.version, noirVersion: program.noir_version, bbVersion: '5.2.0', packageLockSHA256: hash(readFileSync(resolve(root, 'package-lock.json'))), crsProvenance: '../m7-crs-131072.json', cases: [], negativeWitnessChecks: [], artifacts: {} };
try {
  // Skip the automatic Chonk/Grumpkin initializer, then explicitly initialize
  // the real BN254 SRS needed by UltraHonk before any key/proof operation.
  // This is not proving with an omitted/fake SRS.
  await api.srsInitSrs({ pointsBuf: readFileSync(resolve(crsDir, 'bn254_g1_compressed.dat')), numPoints: 131072, g2Point: readFileSync(resolve(crsDir, 'bn254_g2.dat')) });
  result.realBn254SrsInitialized = true;
  const backend = new UltraHonkBackend(program.bytecode, api);
  const verifier = new UltraHonkVerifierBackend(api);
  const noir = new Noir(program);
  const vkStart = performance.now();
  const vk = await backend.getVerificationKey(settings);
  result.verificationKeyMilliseconds = performance.now() - vkStart;
  const wrongVK = await new UltraHonkBackend(wrongProgram.bytecode, api).getVerificationKey(settings);
  assert.notEqual(hash(vk), hash(wrongVK));
  function save(name, bytes) { writeFileSync(resolve(out, name), bytes); result.artifacts[name] = { bytes: bytes.length, sha256: hash(bytes) }; }
  save('verification-key.bin', vk);
  save('wrong-verification-key.bin', wrongVK);
  save('circuit.json', Buffer.from(JSON.stringify({ noir_version: program.noir_version, abi: program.abi, bytecode: program.bytecode })));
  for (const [index, S] of [3000000n, 3500000n].entries()) {
    // Deliberately public synthetic fixture inputs, never user secrets.
    const salt = Array.from({ length: 24 }, (_, i) => i + index * 32);
    const message = Buffer.alloc(32); message.writeBigUInt64BE(S); Buffer.from(salt).copy(message, 8);
    const digest = createHash('sha256').update(message).digest();
    const cost = (S + 9n) / 10n;
    const input = { s: S.toString(), salt, k: ((1000000n - 10000n - 15000n - cost) / 4n).toString(), payout_s: (cost + 10000n).toString(), payout_b: (1000000n - cost - 10000n).toString(), digest: Array.from({ length: 8 }, (_, i) => digest.readUInt32BE(i * 4)) };
    const witnessStart = performance.now();
    const { witness } = await noir.execute(input);
    const witnessMilliseconds = performance.now() - witnessStart;
    const proofStart = performance.now();
    const proof = await backend.generateProof(witness, settings);
    const proofMilliseconds = performance.now() - proofStart;
    assert.equal(proof.publicInputs.length, 11);
    const expected = [input.k, input.payout_s, input.payout_b, ...input.digest].map(BigInt);
    assert.deepEqual(proof.publicInputs.map(v => BigInt(v)), expected);
    const verifyStart = performance.now();
    const verified = await verifier.verifyProof({ ...proof, verificationKey: vk }, settings);
    const verificationMilliseconds = performance.now() - verifyStart;
    assert.equal(verified, true);
    const badInputs = [...proof.publicInputs]; badInputs[0] = '0x' + (BigInt(badInputs[0]) + 1n).toString(16).padStart(64, '0');
    const badProof = Uint8Array.from(proof.proof); badProof[badProof.length - 1] ^= 1;
    const mutations = {};
    for (const [name, candidate] of [
      ['changedPublicInput', { ...proof, publicInputs: badInputs, verificationKey: vk }],
      ['tamperedProof', { ...proof, proof: badProof, verificationKey: vk }],
      ['wrongVerificationKey', { ...proof, verificationKey: wrongVK }],
    ]) {
      mutations[name] = await requireVerifierRejection(() => verifier.verifyProof(candidate, settings), { allowPinnedPointDecoderError: name === 'tamperedProof' });
    }
    save(`branch-${index}-proof.bin`, proof.proof);
    save(`branch-${index}-public-inputs.json`, Buffer.from(JSON.stringify(proof.publicInputs, null, 2) + '\n'));
    const entry = { branch: index, syntheticS: S.toString(), hashOfSAndSyntheticSalt: digest.toString('hex'), witnessMilliseconds, proofMilliseconds, verificationMilliseconds, proofBytes: proof.proof.length, publicInputs: proof.publicInputs, verified, mutations };
    result.cases.push(entry);
    console.log(JSON.stringify({ branch: index, verified, proofBytes: proof.proof.length, proofMilliseconds, mutations }));
    for (const [name, badInput] of [ ['wrongK', { ...input, k: (BigInt(input.k) + 1n).toString() }], ['wrongDigest', { ...input, digest: [(input.digest[0] ^ 1) >>> 0, ...input.digest.slice(1)] }], ['nonMenuS', { ...input, s: '3000001' }] ]) {
      let rejected = false;
      try { await noir.execute(badInput); } catch { rejected = true; }
      assert.equal(rejected, true);
      result.negativeWitnessChecks.push({ branch: index, name, rejected, stage: 'witness-execution-only-not-proof-verification' });
    }
  }
  result.proofsGenerated = result.cases.length;
  result.actualVerifierRejections = result.cases.length * 3;
  result.totalMilliseconds = performance.now() - started;
  result.processResourceUsage = process.resourceUsage();
  result.processMemoryUsage = process.memoryUsage();
  result.scopeLimit = 'Two independent tiny arithmetic/fixed-32-byte SHA256 proofs; no recursion, owner authorization, VRF, HPKE, notes, authority or chain facts demonstrated here';
  writeFileSync(resolve(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ proofsGenerated: result.proofsGenerated, actualVerifierRejections: result.actualVerifierRejections, totalMilliseconds: result.totalMilliseconds, peakRSSKiB: result.processResourceUsage.maxRSS }));
} finally { await api.destroy(); }
