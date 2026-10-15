import assert from 'node:assert/strict';
import { Barretenberg, BackendType, UltraHonkBackend, UltraHonkVerifierBackend } from '@aztec/bb.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shaHex } from './encoding.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
assert.equal(process.argv[2], '--resource-hold-released', 'Explicit parent resource release required before heavy proving');
globalThis.fetch = async () => { throw new Error('PC15_PROVING_MUST_BE_OFFLINE'); };
const output = root + '../../evidence/m15-auth-proof/'; mkdirSync(output, { recursive: true });
const settings = { verifierTarget: 'evm' };
const load = name => JSON.parse(readFileSync(root + '.local/compiled/' + name + '.json'));
const program = load('authorization'), crsPath = root + '.local/crs/131072/';
const crs = JSON.parse(readFileSync(crsPath + 'provenance.json'));
for (const r of crs.records) { const b = readFileSync(crsPath + r.file); assert.equal(b.length, r.bytes); assert.equal(shaHex(b), r.sha256); }
const result = { classification: 'REAL_LOCAL_ZK_AUTHORIZATION_SIGNATURE_CAPABILITY_UNFUNDED', startedAt: new Date().toISOString(), node: process.version, noirVersion: program.noir_version, bbVersion: '5.2.0', backend: 'Wasm', threads: 1, wasmMaximumMiB: 2048, verifierTarget: 'evm', zeroKnowledgeEnabled: true, crsProvenance: '../m15-auth-crs.json', packageProvenance: '../m15-linux-package-provenance.json', reusedPackageLockSHA256: shaHex(readFileSync(root + 'reused-package-lock.json')), artifacts: {}, hostVerification: [], scopeLimit: 'Hidden signature relation only. Public signer commitment is not bound to a funded note. No native fulfillment, funds, settlement, private wallet or metadata unlinkability.' };
const save = (name, bytes) => { const b = typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes); writeFileSync(output + name, b); result.artifacts[name] = { bytes: b.length, sha256: shaHex(b) }; };
const checkpoint = () => writeFileSync(output + 'results.json', JSON.stringify(result, null, 2) + '\n');
const started = performance.now();
const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true, memory: { initial: 37, maximum: 32768 }, logger: console.log });
try {
  await api.srsInitSrs({ pointsBuf: readFileSync(crsPath + 'bn254_g1_compressed.dat'), numPoints: 131072, g2Point: readFileSync(crsPath + 'bn254_g2.dat') });
  result.realBn254SrsInitialized = true;
  const backend = new UltraHonkBackend(program.bytecode, api), verifier = new UltraHonkVerifierBackend(api);
  let t = performance.now(); const vk = await backend.getVerificationKey(settings); result.verificationKeyMilliseconds = performance.now() - t;
  save('verification-key.bin', vk);
  save('Verifier.sol', await backend.getSolidityVerifier(vk, settings));
  save('circuit.json', JSON.stringify(program));
  save('main.nr', readFileSync(root + 'circuits/authorization/src/main.nr'));
  save('synthetic-fixture.json', readFileSync(root + '.local/fixture.json'));
  checkpoint();
  const witness = readFileSync(root + '.local/authorization.witness.gz');
  t = performance.now(); const proof = await backend.generateProof(witness, settings); result.provingMilliseconds = performance.now() - t;
  const fixture = JSON.parse(readFileSync(root + '.local/fixture.json')).input;
  const expected = [...fixture.scope, ...fixture.owner_commitment, ...fixture.graph_commitment].map(BigInt);
  assert.deepEqual(proof.publicInputs.map(BigInt), expected);
  save('proof.bin', proof.proof); save('public-inputs.json', JSON.stringify(proof.publicInputs, null, 2) + '\n');
  result.proofBytes = proof.proof.length; result.publicInputCount = proof.publicInputs.length;
  t = performance.now(); const valid = await verifier.verifyProof({ ...proof, verificationKey: vk }, settings);
  assert.equal(valid, true); result.hostVerification.push({ name: 'positive', returned: true, milliseconds: performance.now() - t }); checkpoint();
  console.log(JSON.stringify({ stage: 'real-ZK-proof-host-verified', proofBytes: result.proofBytes, provingMilliseconds: result.provingMilliseconds, resourceUsage: process.resourceUsage() }));
  const wrong = new UltraHonkBackend(load('wrong_key').bytecode, api), wrongVK = await wrong.getVerificationKey(settings);
  assert.notEqual(shaHex(vk), shaHex(wrongVK));
  save('wrong-verification-key.bin', wrongVK); save('WrongVerifier.sol', await wrong.getSolidityVerifier(wrongVK, settings));
  const changed = [...proof.publicInputs]; changed[16] = '0x' + (BigInt(changed[16]) ^ 1n).toString(16).padStart(64, '0');
  const cross = [...proof.publicInputs]; cross[0] = '0x' + (BigInt(cross[0]) ^ 1n).toString(16).padStart(64, '0');
  const reversed = [...proof.publicInputs.slice(0, 16), ...proof.publicInputs.slice(16).reverse()];
  // Change a canonical field word, retaining the exact proof length and encoding.
  const altered = Uint8Array.from(proof.proof); altered[31] ^= 1;
  const candidates = [
    ['changedPublicCommitment', { ...proof, publicInputs: changed, verificationKey: vk }],
    ['crossDomainPublicScope', { ...proof, publicInputs: cross, verificationKey: vk }],
    ['wrongDigestWordOrder', { ...proof, publicInputs: reversed, verificationKey: vk }],
    ['alteredProof', { ...proof, proof: altered, verificationKey: vk }],
    ['wrongVerificationKey', { ...proof, verificationKey: wrongVK }],
  ];
  for (const [name, candidate] of candidates) {
    const start = performance.now(); let returned, error;
    try { returned = await verifier.verifyProof(candidate, settings); } catch (e) { error = String(e.message); }
    // Only actual verifier false is counted here. An exception is separately
    // retained as a blocker instead of treating arbitrary infrastructure as rejection.
    result.hostVerification.push({ name, returned: returned ?? null, error: error ?? null, classified: returned === false ? 'VERIFIER_RETURNED_FALSE' : 'UNCLASSIFIED_EXCEPTION_OR_ACCEPTANCE', milliseconds: performance.now() - start });
    checkpoint(); assert.equal(returned, false, `${name}: must be a real verifier false; exception: ${error}`);
  }
  // A second actual proof checks backend/witness parity for canonical low-S:
  // the pinned signature vector's high-S counterpart has public expected=false.
  const vectorBackend = new UltraHonkBackend(load('official_vector').bytecode, api);
  const vectorVK = await vectorBackend.getVerificationKey(settings);
  t = performance.now(); const highProof = await vectorBackend.generateProof(readFileSync(root + '.local/official-high-s-false.witness.gz'), settings);
  assert.deepEqual(highProof.publicInputs.map(BigInt), [0n]);
  const parityVerified = await verifier.verifyProof({ ...highProof, verificationKey: vectorVK }, settings);
  assert.equal(parityVerified, true);
  const invalidExpected = await verifier.verifyProof({ ...highProof, publicInputs: ['0x' + '0'.repeat(63) + '1'], verificationKey: vectorVK }, settings);
  assert.equal(invalidExpected, false);
  save('high-s-false-proof.bin', highProof.proof); save('vector-verification-key.bin', vectorVK);
  result.lowSParity = { witnessSignatureValidity: false, provenSignatureValidity: false, proofVerified: parityVerified, changedExpectedTrueRejected: invalidExpected === false, milliseconds: performance.now() - t, proofBytes: highProof.proof.length, scope: 'Local proof generated from retained official high-S fixture. Only expected=false is public; the vector is not externally bound by this control circuit. Not arbitrary ECDSA equivalence, universal parity, or a malicious-witness audit.' };
  result.completedAt = new Date().toISOString(); result.totalMilliseconds = performance.now() - started;
  result.resourceUsage = process.resourceUsage(); result.memoryUsage = process.memoryUsage(); checkpoint();
  console.log(JSON.stringify({ stage: 'proof-and-host-negatives-complete', lowSParity: result.lowSParity, resourceUsage: result.resourceUsage }));
} catch (error) { result.failure = { message: String(error.message), stage: 'proof-or-host-verification', resourceUsage: process.resourceUsage() }; checkpoint(); throw error; }
finally { await api.destroy(); }
