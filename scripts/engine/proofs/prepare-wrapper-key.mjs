/** Generate one actual EVM-targeted key and verifier for S66 or F51. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { verifyToolchain, verifyCRS, filePin, hash, CRS } from '../../../experiments/engine/private-core-proof/wallet-notes/resources.mjs';
import { validateOwnerPin } from '../../../experiments/engine/private-core-proof/generic-wrappers/pin-owner-key.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
assert.ok(['reserve', 'refund'].includes(mode), 'GENERIC_WRAPPER_MODE');
const wordCount = mode === 'reserve' ? 66 : 51;
const experiment = join(root, 'experiments/private-core-proof');
const directory = join(root, '.local/development/generic-wrappers', mode);
const prepared = join(directory, 'prepared');
mkdirSync(prepared, { recursive: true });
assert.equal(existsSync(join(prepared, mode + '.key.json')), false, 'GENERIC_WRAPPER_KEY_EXISTS');
const compiled = JSON.parse(readFileSync(join(directory, 'compiled-manifest.json')));
const programPath = join(directory, mode + '.json');
assert.equal(filePin(programPath).sha256, compiled.programSHA256, 'GENERIC_WRAPPER_COMPILED_PIN');
assert.equal(compiled.publicWords, wordCount, 'GENERIC_WRAPPER_ABI');
const program = JSON.parse(readFileSync(programPath));
const compressed = Buffer.from(program.bytecode, 'base64');
assert.equal(hash(compressed), compiled.bytecodeSHA256, 'GENERIC_WRAPPER_BYTECODE_PIN');
const sources = compiled.source.filter(record => /\.(nr|toml)$/.test(record.path));
const checkSources = () => { for (const source of sources) filePin(join(root, source.path), source); };
checkSources();
const ownerOptions = JSON.parse(readFileSync(join(root, '.local/development/generic-funding/owner-pin-options.json')));
const ownerPin = validateOwnerPin(ownerOptions);
const settings = {
  ipaAccumulation: false,
  oracleHashType: 'keccak',
  disableZk: false,
  optimizedSolidityVerifier: false,
};
const report = {
  classification: 'ACTUAL_GENERIC_WRAPPER_KEY_AND_SOLIDITY_GENERATION_NOT_PROOF',
  profile: 'LIANUM_PAEG_FUNDED_4_V1',
  mode,
  target: 'evm',
  publicInputWords: wordCount,
  startedAt: new Date().toISOString(),
  phase: 'checking-pins',
  node: process.version,
  sources,
  sourceTreeSHA256: hash(JSON.stringify(sources)),
  artifactSHA256: compiled.programSHA256,
  circuitSHA256: compiled.bytecodeSHA256,
  noirVersion: program.noir_version,
  bbVersion: '5.2.0',
  ownerVerificationKeySHA256: ownerPin.vkSHA256,
  ownerSourceTreeSHA256: ownerPin.sourceSHA256,
  settings,
  maximumPages: 32768,
  threads: 1,
  toolchain: verifyToolchain(),
  crs: verifyCRS(),
};
const reportPath = join(directory, 'key-attempt-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
save();
globalThis.fetch = async () => { throw new Error('GENERIC_WRAPPER_KEY_NETWORK_FORBIDDEN'); };
let api;
try {
  const require = createRequire(join(experiment, 'package.json'));
  const { Barretenberg, BackendType, UltraHonkBackend } = await import(pathToFileURL(require.resolve('@aztec/bb.js')));
  api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true,
    memory: { initial: 37, maximum: 32768 } });
  const circuit = { name: mode, bytecode: gunzipSync(compressed), verificationKey: new Uint8Array() };
  report.phase = 'checking-circuit-capacity';
  save();
  report.stats = await api.circuitStats({ circuit, includeGatesPerOpcode: false, settings });
  assert.ok(report.stats.numGatesDyadic <= 2097152, 'GENERIC_WRAPPER_EXISTING_CRS_TOO_SMALL');
  report.phase = 'initializing-pinned-crs';
  save();
  await api.srsInitSrs({ pointsBuf: readFileSync(CRS + 'bn254_g1_compressed.dat'), numPoints: 2097152,
    g2Point: readFileSync(CRS + 'bn254_g2.dat') });
  report.phase = 'generating-actual-key';
  save();
  const key = await api.circuitComputeVk({ circuit, settings });
  const bytes = Buffer.from(key.bytes);
  report.keySHA256 = hash(bytes);
  report.keyBytes = bytes.length;
  report.keyHashField = BigInt('0x' + Buffer.from(key.hash).toString('hex')).toString();
  report.phase = 'exporting-actual-verifier';
  save();
  const solidity = await new UltraHonkBackend(program.bytecode, api)
    .getSolidityVerifier(bytes, { verifierTarget: 'evm' });
  report.soliditySHA256 = hash(solidity);
  report.solidityBytes = Buffer.byteLength(solidity);
  checkSources();
  writeFileSync(join(prepared, mode + '.vk'), bytes, { flag: 'wx' });
  writeFileSync(join(prepared, mode + '.sol'), solidity, { flag: 'wx' });
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
    writeFileSync(join(prepared, mode + '.key.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  console.log(JSON.stringify({ phase: report.phase, report: reportPath, stats: report.stats, keySHA256: report.keySHA256, error: report.error }));
}
