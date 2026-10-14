/** Read-only exact NEW minimum-deposit V3 loader. No caller paths, artifacts, brands or
 * trust callbacks. Loading this module does not load keys or start anything. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join,resolve } from 'node:path';
import {projectRoot} from '@lianum/environment';
import {constants,openSync,closeSync,fstatSync,readFileSync,lstatSync,realpathSync} from 'node:fs';
import { ROOT } from '@lianum/proofs/catalog';
import { GENERIC_COMPILER_PIN } from '@lianum/engine/execution/local/local-deployment';
import {FLAT_MINIMUM_BUILD_PIN,FLAT_MINIMUM_ARTIFACT_FILES,FLAT_MINIMUM_RUNTIME_BYTES,FLAT_MINIMUM_PROFILE} from './append-only-build-v3.mjs';
const DIRECTORY=join(ROOT,'.local/development-flat-minimum/v3');
const RAW=FLAT_MINIMUM_ARTIFACT_FILES['compiled.json'].sha256,INPUT=FLAT_MINIMUM_ARTIFACT_FILES['standard-input.json'].sha256;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function read(path, expected) {
  assert.equal(realpathSync(path),resolve(path),'FLAT_MINIMUM_ARTIFACT_ALIAS');
  const descriptor=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=fstatSync(descriptor);assert.ok(before.isFile()&&before.nlink===1&&before.size<=32*1024*1024,'FLAT_MINIMUM_ARTIFACT_FILE');
    const bytes=readFileSync(descriptor);
    for(const after of [fstatSync(descriptor),lstatSync(path)])for(const field of ['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs'])assert.equal(after[field],before[field],'FLAT_MINIMUM_ARTIFACT_CHANGED');
    assert.equal(sha(bytes),expected,'APPEND_ONLY_EXACT_FILE_PIN');return bytes;
  }finally{closeSync(descriptor);}
}
/** Exact emitted artifact, every source and AST, compiler, setting, ABI, link
 * and immutable offset are authenticated before returning inert public data. */
export function loadMinimumDepositLedgerArtifacts() {
  assert.equal(arguments.length, 0, 'APPEND_ONLY_NO_LOADER_ARGUMENTS');
  const publication=JSON.parse(read(join(DIRECTORY,'manifest.json'),FLAT_MINIMUM_ARTIFACT_FILES['manifest.json'].sha256));
  assert.equal(publication.schema,'LIANUM_FLAT_MINIMUM_BUILD_V3');assert.deepEqual(publication.buildPin,FLAT_MINIMUM_BUILD_PIN);
  assert.equal(publication.compiled,true);for(const field of ['deployed','proofGenerated','financialAcceptance'])assert.equal(publication[field],false);
  for(const name of ['compiled.json','standard-input.json'])assert.deepEqual(publication.files[name],FLAT_MINIMUM_ARTIFACT_FILES[name]);
  const compilation = JSON.parse(read(join(DIRECTORY, 'compiled.json'), RAW));
  const input = JSON.parse(read(join(DIRECTORY, 'standard-input.json'), INPUT));
  assert.equal(compilation.classification, 'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE');
  assert.equal(compilation.profile, 'standard'); assert.deepEqual(compilation.compiler, GENERIC_COMPILER_PIN);
  assert.equal(sha(canonical(compilation.settings)), FLAT_MINIMUM_BUILD_PIN.settingsSHA256);
  assert.deepEqual(input.settings, compilation.settings);
  const names = Object.keys(FLAT_MINIMUM_BUILD_PIN.sources), sourceMap = {};
  assert.deepEqual(Object.keys(input.sources).sort(), [...names].sort());
  assert.deepEqual(Object.keys(compilation.sourceASTs).sort(), [...names].sort());
  assert.deepEqual(compilation.sources.map(row => row.name).sort(), [...names].sort());
  for (const name of names) {
    const [hash, astHash] = FLAT_MINIMUM_BUILD_PIN.sources[name];
    const bytes = read(join(projectRoot, 'contracts/wallet', name), hash), content = bytes.toString('utf8');
    assert.deepEqual(input.sources[name], { content });
    assert.deepEqual(compilation.sources.find(row => row.name === name), { name, sha256: hash, bytes: bytes.length });
    assert.equal(sha(canonical(compilation.sourceASTs[name])), astHash);
    sourceMap[name] = { content, sha256: hash };
  }
  const artifacts = {}, immutableNames = {};
  for (const [role, [source, name, hash]] of Object.entries(FLAT_MINIMUM_BUILD_PIN.artifacts)) {
    const artifact = compilation.contracts[source]?.[name]; assert.equal(sha(canonical(artifact)), hash);
    artifacts[role] = artifact;
    const definition = compilation.sourceASTs[source].nodes.find(node => node.nodeType === 'ContractDefinition' && node.name === name);
    assert.equal(definition.contractKind, ['hub', 'pool'].includes(role) ? 'contract' : 'library');
    immutableNames[role] = Object.fromEntries(definition.nodes.filter(node => node.nodeType === 'VariableDeclaration'
      && node.mutability === 'immutable').map(node => [node.id, node.name]));
    assert.deepEqual(Object.keys(artifact.evm.deployedBytecode.immutableReferences).sort(), Object.keys(immutableNames[role]).sort());
    assert.ok(artifact.evm.deployedBytecode.object.length / 2 <= 24576, 'APPEND_ONLY_RUNTIME_LIMIT');
    assert.ok(artifact.evm.bytecode.object.length / 2 + (role === 'hub' ? 1536 : role === 'pool' ? 1152 : 0) <= 49152,
      'APPEND_ONLY_INITCODE_LIMIT');
  }
  for(const [role,bytes]of Object.entries(FLAT_MINIMUM_RUNTIME_BYTES))assert.equal(artifacts[role].evm.deployedBytecode.object.length/2,bytes);
  return freeze({ compilation, sourceMap, artifacts, immutableNames });
}
/** Reuses original twelve exact retained verifiers only; no fresh native-value
 * I relation, key generation, legacy V1 ledger alias or runtime capability. */
export async function loadMinimumDepositDeploymentArtifacts() {
  assert.equal(arguments.length, 0, 'APPEND_ONLY_NO_LOADER_ARGUMENTS');
  const ledger = loadMinimumDepositLedgerArtifacts(), {loadFlatVerifierArtifacts}=await import('./deployment-artifacts.mjs'),retained=await loadFlatVerifierArtifacts();
  return freeze({ ledger, verifiers: retained.verifiers, provenance: {
    ...retained.provenance, minimumDepositRequired:true, ledgerAttempt: FLAT_MINIMUM_BUILD_PIN.attempt, ledgerCompiledSHA256: RAW,
    standardInputSHA256: INPUT, ledgerProfile: FLAT_MINIMUM_PROFILE,
    poolBytecodeEquivalenceProven: false, completeRuntimeObserved: false,
    sourceManifestSHA256: sha(canonical(FLAT_MINIMUM_BUILD_PIN)),
    keyManifestSHA256: sha(canonical(Object.entries(retained.verifiers).map(([role, verifier]) => ({ role, lineage: verifier.lineage })))),
    nativeValueProfileCompatible: false } });
}
