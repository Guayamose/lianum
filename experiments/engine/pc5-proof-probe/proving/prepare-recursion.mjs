import assert from 'node:assert/strict';
import { Barretenberg, BackendType, UltraHonkVerifierBackend, deflattenFields, fieldsToStrings, BN254_FR_MODULUS } from '@aztec/bb.js';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('.', import.meta.url));
const out = resolve(root, '../../evidence/m7-proof-probe');
const hash = b => createHash('sha256').update(b).digest('hex');
globalThis.fetch = async () => { throw new Error('Recursive preparation is offline'); };
const results = JSON.parse(readFileSync(resolve(out, 'results.json')));
for (const [name, record] of Object.entries(results.artifacts)) assert.equal(hash(readFileSync(resolve(out, name))), record.sha256);
const crsDir = resolve(root, '.local/crs/131072');
const provenance = JSON.parse(readFileSync(resolve(crsDir, 'provenance.json')));
for (const record of provenance.records) assert.equal(hash(readFileSync(resolve(crsDir, record.file))), record.sha256);
const program = JSON.parse(readFileSync(resolve(out, 'circuit.json')));
const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
try {
  await api.srsInitSrs({ pointsBuf: readFileSync(resolve(crsDir, 'bn254_g1_compressed.dat')), numPoints: 131072, g2Point: readFileSync(resolve(crsDir, 'bn254_g2.dat')) });
  const key = await api.circuitComputeVk({ circuit: { name: 'arithmetic_sha256', bytecode: gunzipSync(Buffer.from(program.bytecode, 'base64')), verificationKey: new Uint8Array() }, settings: { ipaAccumulation: false, oracleHashType: 'poseidon2', disableZk: false, optimizedSolidityVerifier: false } });
  assert.equal(hash(key.bytes), results.artifacts['verification-key.bin'].sha256);
  const { fields } = await api.vkAsFields({ verificationKey: key.bytes });
  const keyFields = fieldsToStrings(fields);
  assert.equal(keyFields.length, 115);
  assert.deepEqual(keyFields.map(BigInt), deflattenFields(key.bytes).map(BigInt));
  const keyHash = BigInt('0x' + Buffer.from(key.hash).toString('hex')).toString();
  const proofFields = [], publicInputs = [];
  const verifier = new UltraHonkVerifierBackend(api);
  for (const branch of [0, 1]) {
    const proof = readFileSync(resolve(out, `branch-${branch}-proof.bin`));
    const inputs = JSON.parse(readFileSync(resolve(out, `branch-${branch}-public-inputs.json`)));
    assert.equal(await verifier.verifyProof({ proof, publicInputs: inputs, verificationKey: key.bytes }, { verifierTarget: 'noir-recursive' }), true);
    const asFields = deflattenFields(proof);
    assert.equal(asFields.length, 458);
    for (const value of [...asFields, ...inputs, ...keyFields]) assert.ok(BigInt(value) >= 0n && BigInt(value) < BigInt(BN254_FR_MODULUS));
    proofFields.push(asFields); publicInputs.push(inputs);
  }
  // Same well-formed proof substituted under another statement: actual verifier
  // rejection rather than a malformed point or host-side digest check.
  const substitutedAccepted = await verifier.verifyProof({ proof: readFileSync(resolve(out, 'branch-0-proof.bin')), publicInputs: publicInputs[1], verificationKey: key.bytes }, { verifierTarget: 'noir-recursive' });
  assert.equal(substitutedAccepted, false);
  writeFileSync(resolve(root, 'circuits/recursive_join/src/approved_vk.nr'), `// Generated from the verified pinned arithmetic_sha256 circuit.\n// Complete key equality is constrained; key_hash is not solver-selected.\npub global APPROVED_VK: [Field; 115] = [\n${keyFields.map(v => '    ' + v).join(',\n')}\n];\npub global APPROVED_VK_HASH: Field = ${keyHash};\n`);
  const input = { vk: keyFields, proof_a: proofFields[0], inputs_a: publicInputs[0], proof_b: proofFields[1], inputs_b: publicInputs[1], joined: (BigInt(publicInputs[0][0]) + BigInt(publicInputs[1][0])).toString() };
  writeFileSync(resolve(root, '.local/recursive-input.json'), JSON.stringify(input));
  const report = { classification: 'REAL_CHILD_PROOF_REVERIFICATION_AND_PINNED_FIELD_SERIALIZATION_NOT_OUTER_PROOF', verificationKeySHA256: hash(key.bytes), verificationKeyHashField: keyHash, keyFields: keyFields.length, proofFields: proofFields.map(p => p.length), innerPublicInputCounts: publicInputs.map(p => p.length), officialProofDecoder: '@aztec/bb.js deflattenFields', officialKeyDecoder: 'api.vkAsFields; compared with serialized key fields', everyFieldCanonical: true, childrenReverified: 2, substitutedWellFormedChildRejected: !substitutedAccepted, approvedVkSourceSHA256: hash(readFileSync(resolve(root, 'circuits/recursive_join/src/approved_vk.nr'))) };
  writeFileSync(resolve(out, 'recursive-preparation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await api.destroy(); }
