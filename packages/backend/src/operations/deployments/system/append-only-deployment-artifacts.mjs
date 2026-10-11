/** Read-only exact candidate-2 loader. No caller paths, artifacts, brands or
 * trust callbacks. Loading this module does not load keys or start anything. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readFileSync, lstatSync } from 'node:fs';
import { ROOT } from '@lianum/proofs/catalog';
import { GENERIC_COMPILER_PIN } from '@lianum/engine/execution/local/local-deployment';
import { APPEND_ONLY_BUILD_PIN } from './append-only-deployment-plan.mjs';
import { loadFlatVerifierArtifacts } from './deployment-artifacts.mjs';
const RAW = '8d7c19bdd8c52df50eb527a3f0edf80e4e6071c89ed4ec1b94eeef70299c6c02';
const INPUT = 'b97bd0b4b2f300197f7865d469d2e6cf5ef153c2adc6e1dc21ab6943e0df7a1d';
const DIRECTORY = join(ROOT, '../../drafts/append-only-pool-v2-compile');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function read(path, expected) {
  const stat = lstatSync(path); assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'APPEND_ONLY_REGULAR_FILE');
  const bytes = readFileSync(path); assert.equal(sha(bytes), expected, 'APPEND_ONLY_EXACT_FILE_PIN'); return bytes;
}
/** Exact emitted artifact, every source and AST, compiler, setting, ABI, link
 * and immutable offset are authenticated before returning inert public data. */
export function loadAppendOnlyLedgerArtifacts() {
  assert.equal(arguments.length, 0, 'APPEND_ONLY_NO_LOADER_ARGUMENTS');
  const compilation = JSON.parse(read(join(DIRECTORY, 'runs/candidate-2/compiled.json'), RAW));
  const input = JSON.parse(read(join(DIRECTORY, 'runs/candidate-2/standard-input.json'), INPUT));
  assert.equal(compilation.classification, 'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE');
  assert.equal(compilation.profile, 'standard'); assert.deepEqual(compilation.compiler, GENERIC_COMPILER_PIN);
  assert.equal(sha(canonical(compilation.settings)), APPEND_ONLY_BUILD_PIN.settingsSHA256);
  assert.deepEqual(input.settings, compilation.settings);
  const names = Object.keys(APPEND_ONLY_BUILD_PIN.sources), sourceMap = {};
  assert.deepEqual(Object.keys(input.sources).sort(), [...names].sort());
  assert.deepEqual(Object.keys(compilation.sourceASTs).sort(), [...names].sort());
  assert.deepEqual(compilation.sources.map(row => row.name).sort(), [...names].sort());
  for (const name of names) {
    const [hash, astHash] = APPEND_ONLY_BUILD_PIN.sources[name];
    const bytes = read(join(ROOT, 'contracts', name), hash), content = bytes.toString('utf8');
    assert.deepEqual(input.sources[name], { content });
    assert.deepEqual(compilation.sources.find(row => row.name === name), { name, sha256: hash, bytes: bytes.length });
    assert.equal(sha(canonical(compilation.sourceASTs[name])), astHash);
    sourceMap[name] = { content, sha256: hash };
  }
  const artifacts = {}, immutableNames = {};
  for (const [role, [source, name, hash]] of Object.entries(APPEND_ONLY_BUILD_PIN.artifacts)) {
    const artifact = compilation.contracts[source]?.[name]; assert.equal(sha(canonical(artifact)), hash);
    artifacts[role] = artifact;
    const definition = compilation.sourceASTs[source].nodes.find(node => node.nodeType === 'ContractDefinition' && node.name === name);
    assert.equal(definition.contractKind, ['hub', 'pool'].includes(role) ? 'contract' : 'library');
    immutableNames[role] = Object.fromEntries(definition.nodes.filter(node => node.nodeType === 'VariableDeclaration'
      && node.mutability === 'immutable').map(node => [node.id, node.name]));
    assert.deepEqual(Object.keys(artifact.evm.deployedBytecode.immutableReferences).sort(), Object.keys(immutableNames[role]).sort());
    assert.ok(artifact.evm.deployedBytecode.object.length / 2 <= 24576, 'APPEND_ONLY_RUNTIME_LIMIT');
    assert.ok(artifact.evm.bytecode.object.length / 2 + (role === 'hub' ? 1536 : role === 'pool' ? 1120 : 0) <= 49152,
      'APPEND_ONLY_INITCODE_LIMIT');
  }
  assert.equal(artifacts.hub.evm.deployedBytecode.object.length / 2, 24415);
  assert.equal(artifacts.pool.evm.deployedBytecode.object.length / 2, 22577);
  assert.equal(artifacts.poolRegistryCodec.evm.deployedBytecode.object.length / 2, 5979);
  return freeze({ compilation, sourceMap, artifacts, immutableNames });
}
/** Reuses original twelve exact retained verifiers only; no fresh native-value
 * I relation, key generation, legacy V1 ledger alias or runtime capability. */
export async function loadAppendOnlyDeploymentArtifacts() {
  assert.equal(arguments.length, 0, 'APPEND_ONLY_NO_LOADER_ARGUMENTS');
  const ledger = loadAppendOnlyLedgerArtifacts(), retained = await loadFlatVerifierArtifacts();
  return freeze({ ledger, verifiers: retained.verifiers, provenance: {
    ...retained.provenance, ledgerAttempt: APPEND_ONLY_BUILD_PIN.attempt, ledgerCompiledSHA256: RAW,
    standardInputSHA256: INPUT, ledgerProfile: 'LIANUM_FLAT_APPEND_ONLY_POOLS_V2',
    poolBytecodeEquivalenceProven: false, completeRuntimeObserved: false,
    sourceManifestSHA256: sha(canonical(APPEND_ONLY_BUILD_PIN)),
    keyManifestSHA256: sha(canonical(Object.entries(retained.verifiers).map(([role, verifier]) => ({ role, lineage: verifier.lineage })))),
    nativeValueProfileCompatible: false } });
}
