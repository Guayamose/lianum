/** Explicit, offline, fixed-source compilation only. Importing is inert. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath,pathToFileURL } from 'node:url';
import {resourceRoot} from '@lianum/environment';
import { resolve } from 'node:path';
import { compileSoliditySources } from '../../../packages/proofs/src/tooling/solidity-compiler.mjs';

const root = pathToFileURL(resourceRoot('wallet')+'/');
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
const digest = value => sha(canonical(value));
const sources = [
  { source: 'PrivateAssetTestToken.sol', contract: 'PrivateAssetTestToken', role: 'token',
    path: new URL('../../omnichain-product/contracts/PrivateAssetTestToken.sol', root),
    sha256: '397538dba08caa692165e93036804c2045fb646e7edbd719899036912853461e' },
  { source: 'BackedTestVault.sol', contract: 'BackedTestVault', role: 'vault',
    path: new URL('contracts/fixtures/BackedTestVault.sol', root),
    sha256: '2627227a5fc58103eb90a2e2a92bbfe4505feb7feb2d6fef83ee09cb566cad5e' },
];
function regular(path) {
  const stat = lstatSync(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 4_000_000, 'BACKED_PREPARE_REGULAR_FILE');
  return readFileSync(path);
}

export function prepareBackedAssetArtifacts() {
  assert.equal(arguments.length, 0, 'BACKED_PREPARE_NO_OPTIONS');
  const directory = new URL('.local/backed-assets/v1/', root);
  assert.ok(!existsSync(directory), 'BACKED_PREPARE_OUTPUT_ALREADY_EXISTS');
  const sourceMap = Object.fromEntries(sources.map(item => {
    const bytes = regular(item.path); assert.equal(sha(bytes), item.sha256, 'BACKED_PREPARE_SOURCE_PIN');
    return [item.source, { content: bytes.toString('utf8'), sha256: item.sha256 }];
  }));
  // One compiler call: its existing official package, lock and soljson hashes
  // are checked by this fixed seam. No install, imports callback or network.
  const result = compileSoliditySources(sourceMap, { profile: 'standard' });
  const { milliseconds, warnings, ...compilation } = result;
  const artifactRecords = Object.fromEntries(sources.map(item => {
    assert.equal(sha(regular(item.path)), item.sha256, 'BACKED_PREPARE_SOURCE_CHANGED');
    const ast = compilation.sourceASTs[item.source];
    const matches = ast.nodes.filter(node => node.nodeType === 'ContractDefinition' && node.name === item.contract);
    assert.equal(matches.length, 1); assert.equal(matches[0].contractKind, 'contract');
    const immutableNames = Object.fromEntries(matches[0].nodes.filter(node => node.nodeType === 'VariableDeclaration'
      && node.mutability === 'immutable').map(node => [node.id, node.name]));
    const artifact = compilation.contracts[item.source][item.contract];
    assert.deepEqual(artifact.evm.bytecode.linkReferences, {});
    assert.deepEqual(artifact.evm.deployedBytecode.linkReferences, {});
    const creation = artifact.evm.bytecode.object, runtime = artifact.evm.deployedBytecode.object;
    assert.match(creation, /^(?:[0-9a-f]{2})+$/); assert.match(runtime, /^(?:[0-9a-f]{2})+$/);
    const constructorBytes = item.role === 'token' ? 32 : 160;
    assert.ok(creation.length / 2 + constructorBytes <= 49_152, 'BACKED_PREPARE_EIP3860');
    assert.ok(runtime.length / 2 <= 24_576, 'BACKED_PREPARE_EIP170');
    return [item.role, { source: item.source, contract: item.contract, sourceSHA256: item.sha256,
      sourceASTSHA256: digest(ast), artifactSHA256: digest(artifact), abiSHA256: digest(artifact.abi),
      creationSHA256: sha(Buffer.from(creation, 'hex')), runtimeTemplateSHA256: sha(Buffer.from(runtime, 'hex')),
      creationBytes: creation.length / 2, runtimeBytes: runtime.length / 2, immutableNames,
      immutableReferences: artifact.evm.deployedBytecode.immutableReferences }];
  }));
  const compiledBytes = JSON.stringify(compilation, null, 2) + '\n';
  const manifest = { format: 'FIXED_BACKED_ASSETS_BUILD_V1',
    classification: 'COMPILED_FIXED_LOCAL_FIXTURES_NOT_DEPLOYED_OR_PROOF_ACCEPTED',
    compiler: compilation.compiler, settings: compilation.settings, settingsSHA256: digest(compilation.settings),
    compiledSHA256: sha(compiledBytes), artifacts: artifactRecords, nativeNodesStarted: false, proofGenerated: false };
  mkdirSync(directory, { recursive: true });
  writeFileSync(new URL('compiled.json', directory), compiledBytes, { flag: 'wx' });
  writeFileSync(new URL('manifest.json', directory), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return { directory: fileURLToPath(directory), manifest, milliseconds, warningCount: warnings.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'BACKED_PREPARE_FIXED_INVOCATION');
  const report = prepareBackedAssetArtifacts();
  console.log(JSON.stringify(report, null, 2));
}
