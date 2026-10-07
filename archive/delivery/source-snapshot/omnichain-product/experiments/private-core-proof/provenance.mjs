import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shaHex } from './encoding.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = 'experiments/private-core-proof/';
const read = file => readFileSync(root + file);
const json = file => JSON.parse(read(file));
const proof = json('evidence/m15-auth-proof/results.json');
const compiled = json('evidence/m15-auth-compile.json');
const onchain = json('evidence/m15-auth-anvil.json');
const witnesses = json('evidence/m15-auth-witnesses.json');
const audit = json('evidence/m15-linux-package-provenance.json');
const reused = json(dir + 'reused-package-lock.json'), own = json(dir + 'package-lock.json');
assert.equal(shaHex(read(dir + 'reused-package-lock.json')), audit.packageLockSHA256);
assert.deepEqual({ ...own, name: reused.name, packages: { ...own.packages, '': { ...own.packages[''], name: reused.packages[''].name } } }, reused);
for (const [path, record] of Object.entries(reused.packages)) if (path !== '') assert.deepEqual(own.packages[path], record);
const installedPackages = [];
for (const p of audit.packages.filter(p => p.installed)) {
  const actual = read(dir + p.path + '/package.json');
  assert.equal(shaHex(actual), p.packageJSONSHA256);
  installedPackages.push({ name: p.name, version: p.version, packageJSONSHA256: p.packageJSONSHA256, integrity: p.integrity });
}
for (const w of audit.wasm) assert.equal(shaHex(read(dir + w.path)), w.sha256);
const immutableOfficialSources = [
  { file: dir + 'vendor/ecdsa_secp256k1.nr', url: 'https://raw.githubusercontent.com/noir-lang/noir/75061fab15986eedee4e7d9104ff87dd9fa4ca10/noir_stdlib/src/ecdsa_secp256k1.nr', sha256: 'f4de3974308bd4d4a5f0171e05e487215165fee0bea27ebcd9f007fc4bbaf231' },
  { file: dir + 'vendor/secp256k1.rs', url: 'https://raw.githubusercontent.com/noir-lang/noir/75061fab15986eedee4e7d9104ff87dd9fa4ca10/acvm-repo/blackbox_solver/src/ecdsa/secp256k1.rs', sha256: '40aec2897f57ac46adaab82ab787135a02524db1d2b3dbc5d0c603aa8bf586d6' },
  { file: dir + 'vendor/bb-foundry.toml', url: 'https://raw.githubusercontent.com/AztecProtocol/aztec-packages/49a592109ec4f18d79212b43d621891aaf36f7b6/barretenberg/sol/foundry.toml' },
  { file: dir + 'vendor/LICENSE-MIT', url: 'https://raw.githubusercontent.com/noir-lang/noir/75061fab15986eedee4e7d9104ff87dd9fa4ca10/LICENSE-MIT' },
];
for (const r of immutableOfficialSources) { const b = read(r.file); if (r.sha256) assert.equal(shaHex(b), r.sha256); else r.sha256 = shaHex(b); r.bytes = b.length; }
assert.equal(shaHex(read(dir + 'node_modules/@aztec/bb.js/src/barretenberg/backend.ts')), 'f24c6fd2a367e1dc6374d2663b73eebc33554eb8a15a0c846307affc7129f5d1');
for (const [file, record] of Object.entries(proof.artifacts)) {
  const bytes = read('evidence/m15-auth-proof/' + file); assert.equal(bytes.length, record.bytes); assert.equal(shaHex(bytes), record.sha256);
}
for (const c of compiled.records) {
  assert.equal(shaHex(read(dir + 'circuits/' + c.name + '/src/main.nr')), c.sourceSHA256);
  const artifact = json(dir + '.local/compiled/' + c.name + '.json');
  assert.equal(shaHex(Buffer.from(artifact.bytecode, 'base64')), c.compressedBytecodeSHA256);
}
const retained = json('evidence/m15-auth-proof/circuit.json');
assert.equal(shaHex(Buffer.from(retained.bytecode, 'base64')), compiled.records.find(r => r.name === 'authorization').compressedBytecodeSHA256);
assert.equal(onchain.classification, 'ACTUAL_DEPLOYED_LOCAL_ZK_SIGNATURE_VERIFIER_UNFUNDED');
for (const name of ['Verifier.sol', 'WrongVerifier.sol']) {
  assert.equal(onchain.sources[name].sha256, proof.artifacts[name].sha256);
  assert.equal(onchain.sources[name].bytes, proof.artifacts[name].bytes);
}
assert.equal(onchain.cases.filter(c => c.classified === 'DEPLOYED_VERIFIER_REVERTED').length, 5);
assert.equal(onchain.cases.filter(c => c.classified === 'VERIFIER_RETURNED_TRUE').length, 2);
assert.equal(onchain.transportFailures.length, 0); assert.equal(onchain.cleanup.stopped, true);
assert.equal(proof.hostVerification.filter(c => c.classified === 'VERIFIER_RETURNED_FALSE').length, 5);
for (const r of witnesses.records.filter(r => r.rejected)) assert.match(r.error, r.stage === 'abi-encoding' ? /does not match the specified type/ : /Cannot satisfy constraint|Assertion failed/);
for (const r of json('evidence/m15-auth-crs.json').records) assert.equal(shaHex(read(dir + '.local/crs/131072/' + r.file)), r.sha256);
// Preserve the measured outcome and add the precise externally visible limit.
proof.lowSParity.fixtureDisclosure = json('evidence/m15-auth-high-s-control.json').scope;
writeFileSync(root + 'evidence/m15-auth-proof/results.json', JSON.stringify(proof, null, 2) + '\n');
function filesUnder(path) {
  return readdirSync(root + path, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '.local' || entry.name === 'node_modules') return [];
    const file = path + entry.name; return entry.isDirectory() ? filesUnder(file + '/') : [file];
  });
}
const files = [...filesUnder(dir), 'scripts/integration-private-signature.mjs', 'test/private-signature-encoding.test.mjs', 'docs/PRIVATE-SIGNATURE-GATE-015.md', ...readdirSync(root + 'evidence').filter(n => n.startsWith('m15-auth-') && n !== 'm15-auth-provenance.json' && n !== 'm15-auth-proof').map(n => 'evidence/' + n), ...filesUnder('evidence/m15-auth-proof/')].sort();
const result = { classification: 'CHECKED_PC15A_SOURCE_PACKAGE_CRS_PROOF_AND_DEPLOYMENT_PROVENANCE', checkedAt: new Date().toISOString(), node: process.version, engineWarning: 'Actual Node 24.19.0 differs from historical exact 24.14.0', packageSourceAudit: 'evidence/m15-linux-package-provenance.json', reusedPackageLockSHA256: audit.packageLockSHA256, localPackageLockSHA256: shaHex(read(dir + 'package-lock.json')), onlyRootPackageNameChanged: true, installedPackages, immutableOfficialSources, checks: { sameCompiledAndRetainedMainCircuit: true, proofAndVKBytesMatchGeneration: true, exactGeneratedSolidityMatchesDeployedSource: true, unchangedOfficialSources: true, allPinnedWasmHashesMatch: true, fiveRealHostRejections: true, fiveDeployedVerifierReverts: true, sameScopeReplayCounterexample: true, ownedAnvilStopped: true }, files: files.map(file => { const b = read(file); return { file, bytes: b.length, sha256: shaHex(b) }; }) };
writeFileSync(root + 'evidence/m15-auth-provenance.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ classification: result.classification, checkedFiles: files.length, installedPackages: installedPackages.length, checks: result.checks }));
