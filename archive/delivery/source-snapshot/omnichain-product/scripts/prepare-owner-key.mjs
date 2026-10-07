/** One actual A0 recursive verification key. No wallet witness or proof is used. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { verifyToolchain, verifyCRS, filePin, hash, CRS } from '../experiments/private-core-proof/wallet-notes/resources.mjs';
import {
  sourceManifest, sourceTreeHash, assertOwnerArtifact,
} from '../experiments/private-core-proof/generic-wrappers/pin-owner-key.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const experiment = join(root, 'experiments/private-core-proof');
const ownerPackage = 'experiments/private-core-proof/generic-funding/circuits/authorization';
const directory = join(root, '.local/development/generic-funding');
const prepared = join(directory, 'prepared');
mkdirSync(prepared, { recursive: true });
assert.equal(existsSync(join(prepared, 'authorization.key.json')), false, 'A0_KEY_ALREADY_PREPARED');
const programPath = join(directory, 'authorization.json');
const compiled = JSON.parse(readFileSync(join(directory, 'compiled-manifest.json')));
assert.equal(filePin(programPath).sha256, compiled.programSHA256, 'A0_COMPILED_FILE_PIN');
const program = JSON.parse(readFileSync(programPath));
const compressed = assertOwnerArtifact(program);
assert.equal(hash(compressed), compiled.bytecodeSHA256, 'A0_BYTECODE_PIN');
const sources = sourceManifest(root, ownerPackage);
const expectedSources = compiled.source.filter(record => /\.(nr|toml)$/.test(record.path));
assert.deepEqual(sources.files.map(({ path, sha256 }) => ({ path, sha256 })).sort((a, b) => a.path.localeCompare(b.path)),
  expectedSources.sort((a, b) => a.path.localeCompare(b.path)), 'A0_SOURCE_CHANGED_AFTER_COMPILE');
const settings = {
  ipaAccumulation: false,
  oracleHashType: 'poseidon2',
  disableZk: false,
  optimizedSolidityVerifier: false,
};
const report = {
  format: 'LIANUM_PAEG_A0_KEY_PROVENANCE_V1',
  classification: 'ACTUAL_OFFICIAL_VERIFICATION_KEY_GENERATION_NOT_PROOF',
  profile: 'LIANUM_PAEG_FUNDED_4_V1',
  mode: 'authorization',
  target: 'noir-recursive',
  publicInputWords: 139,
  startedAt: new Date().toISOString(),
  phase: 'checking-pins',
  node: process.version,
  sources,
  sourceTreeSHA256: sourceTreeHash(sources),
  artifactSHA256: filePin(programPath).sha256,
  circuitSHA256: hash(compressed),
  noirVersion: program.noir_version,
  bbVersion: '5.2.0',
  verifierSHA256: filePin(join(experiment, 'generic-wrappers/lib/src/bb_proof_verification.nr')).sha256,
  settings,
  maximumPages: 32768,
  threads: 1,
  toolchain: verifyToolchain(),
  crs: verifyCRS(),
};
const reportPath = join(directory, 'key-attempt-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
save();
globalThis.fetch = async () => { throw new Error('A0_KEY_NETWORK_FORBIDDEN'); };
let api;
try {
  const require = createRequire(join(experiment, 'package.json'));
  const { Barretenberg, BackendType, fieldsToStrings, deflattenFields } =
    await import(pathToFileURL(require.resolve('@aztec/bb.js')));
  api = await Barretenberg.new({
    backend: BackendType.Wasm,
    threads: 1,
    skipSrsInit: true,
    memory: { initial: 37, maximum: 32768 },
  });
  const circuit = { name: 'authorization', bytecode: gunzipSync(compressed), verificationKey: new Uint8Array() };
  report.phase = 'checking-circuit-capacity';
  save();
  report.stats = await api.circuitStats({ circuit, includeGatesPerOpcode: false, settings });
  assert.ok(report.stats.numGatesDyadic <= 2097152, 'A0_EXISTING_CRS_TOO_SMALL');
  report.phase = 'initializing-pinned-crs';
  save();
  await api.srsInitSrs({
    pointsBuf: readFileSync(CRS + 'bn254_g1_compressed.dat'),
    numPoints: 2097152,
    g2Point: readFileSync(CRS + 'bn254_g2.dat'),
  });
  report.phase = 'generating-actual-key';
  save();
  const key = await api.circuitComputeVk({ circuit, settings });
  const bytes = Buffer.from(key.bytes);
  const fields = fieldsToStrings((await api.vkAsFields({ verificationKey: bytes })).fields);
  assert.equal(fields.length, 115, 'A0_VK_FIELD_COUNT');
  assert.deepEqual(fields.map(BigInt), deflattenFields(bytes).map(BigInt), 'A0_VK_FIELD_BYTES');
  report.keyFields = fields.length;
  report.keyBytes = bytes.length;
  report.keySHA256 = hash(bytes);
  report.keyHashField = BigInt('0x' + Buffer.from(key.hash).toString('hex')).toString();
  report.keyDecoder = 'api.vkAsFields';
  report.keyFieldsComparedToSerialized = true;
  assert.equal(sourceTreeHash(sourceManifest(root, ownerPackage)), report.sourceTreeSHA256, 'A0_SOURCE_CHANGED_DURING_KEY');
  writeFileSync(join(prepared, 'authorization.vk'), bytes, { flag: 'wx' });
  writeFileSync(join(prepared, 'authorization.fields.json'), JSON.stringify(fields) + '\n', { flag: 'wx' });
  report.phase = 'completed';
} catch (error) {
  report.failedPhase = report.phase;
  report.phase = 'failed';
  report.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  if (api) await api.destroy();
  report.completedAt = new Date().toISOString();
  report.resourceUsage = process.resourceUsage();
  save();
  if (report.phase === 'completed') {
    writeFileSync(join(prepared, 'authorization.key.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  console.log(JSON.stringify({ phase: report.phase, report: reportPath, stats: report.stats, keySHA256: report.keySHA256, error: report.error }));
}
