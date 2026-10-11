import {integrationTask} from '../../runners/task-catalog.mjs';
/** Actual CI51/CO42 key-to-Solidity lineage. No legacy verifier is rebuilt,
 * and this job generates no key, witness, proof, deployment or native effect. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, LOCAL, relation } from '@lianum/proofs/catalog';
import { assertID, regular, hash, writeJSON, writeNew, replaceJSON, resourceModuleURL,
  circuitIdentity, versionDirectory, loadCompiled, loadPrepared } from '@lianum/proofs/tooling/tooling';
import { compileSoliditySources } from '@lianum/proofs/tooling/solidity-compiler';
import { integrationSourcePins } from '../../runners/source-pins.mjs';
import { deriveGenericVerifierImmutables } from '@lianum/engine/execution/local/local-deployment';

assert.equal(process.argv.length, 3, 'VERIFIER_FIXED_ARGS');
assert.deepEqual(process.execArgv, [], 'VERIFIER_NO_EXEC_OPTIONS');
assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH'], 'VERIFIER_CLEAN_ENV');
const runId = assertID(process.argv[2]), attempt = join(LOCAL, 'claim-verifier-compilation', runId);
const parentArgs = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
assert.equal(parentArgs.length, 2, 'VERIFIER_PARENT_ARGS');
assert.equal(realpathSync(`/proc/${process.ppid}/exe`), realpathSync(process.execPath), 'VERIFIER_PARENT_EXE');
assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parentArgs[1])),
  integrationTask('claim-verifiers').entry, 'VERIFIER_PARENT_SCRIPT');
assert.equal(realpathSync(process.argv[1]), integrationTask('claim-verifiers').worker, 'VERIFIER_WORKER_SCRIPT');
const lock = JSON.parse(regular(join(LOCAL, 'claim-verifier-compilation.lock')));
assert.equal(lock.runId, runId); assert.equal(lock.pid, process.ppid);
const supervisor = JSON.parse(regular(join(attempt, 'resources.json')));
assert.deepEqual(integrationSourcePins('claim-verifiers'), supervisor.sourcePins, 'VERIFIER_SOURCE_FREEZE');
const result = { format: 'FLAT_NATIVE_CLAIM_VERIFIER_COMPILATION_V1', runId, phase: 'loading',
  classification: 'ACTUAL_KEY_SOURCES_COMPILED_NOT_DEPLOYED_OR_PROOF_ACCEPTED',
  sourcePins: supervisor.sourcePins, contracts: [],
  keyGenerated: false, proofGenerated: false, nativeNodesStarted: false };
const save = () => replaceJSON(join(attempt, 'result.json'), result);
function immutableNames(ast) {
  const names = {};
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.nodeType === 'VariableDeclaration' && value.mutability === 'immutable') names[value.id] = value.name;
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === 'object') visit(child);
    }
  }
  visit(ast); return names;
}
try {
  save();
  const helpers = await import(resourceModuleURL);
  const toolchain = helpers.verifyToolchain(), crs = helpers.verifyCRS();
  result.toolchain = toolchain; result.crs = crs;
  for (const name of ['native_claim_ingress', 'native_claim_discharge']) {
    result.phase = 'compiling-' + name; save();
    const spec = relation(name), identity = circuitIdentity(spec, toolchain);
    const sourceVersion = hash(JSON.stringify(identity));
    const context = { spec, toolchain, identity, sourceVersion, directory: versionDirectory(spec, sourceVersion) };
    const program = await loadCompiled(context), prepared = await loadPrepared(context, program, crs);
    const filename = name + '.sol', content = prepared.solidity.toString('utf8');
    const source = { content, sha256: hash(prepared.solidity) };
    writeNew(join(attempt, name, filename), content);
    const compiled = compileSoliditySources({ [filename]: source }, { profile: 'verifier' });
    const ast = compiled.sourceASTs[filename], contracts = compiled.contracts[filename];
    const artifact = contracts.HonkVerifier; assert.ok(artifact, 'VERIFIER_HONK_REQUIRED');
    const methods = artifact.abi.filter(item => item.type === 'function');
    assert.equal(methods.length, 1, 'VERIFIER_METHOD_COUNT');
    assert.equal(methods[0].name, 'verify'); assert.equal(methods[0].stateMutability, 'view');
    assert.deepEqual(methods[0].inputs.map(item => item.type), ['bytes', 'bytes32[]']);
    assert.deepEqual(methods[0].outputs.map(item => item.type), ['bool']);
    const values = deriveGenericVerifierImmutables(ast, spec.publicWords);
    assert.equal(BigInt(values.$VK_HASH), BigInt(prepared.manifest.keyHashField), 'VERIFIER_ACTUAL_VK_HASH');
    const summaries = Object.entries(contracts).map(([contractName, item]) => ({ name: contractName,
      runtimeBytes: item.evm.deployedBytecode.object.length / 2,
      creationBytes: item.evm.bytecode.object.length / 2,
      runtimeHexTemplateSHA256: hash(item.evm.deployedBytecode.object), links: item.evm.bytecode.linkReferences }));
    assert.ok(summaries.every(item => item.runtimeBytes <= 24576 && item.creationBytes <= 49152), 'VERIFIER_EVM_SIZE');
    writeJSON(join(attempt, name, 'compiled.json'), compiled);
    const row = { relation: name, source: filename, publicWords: spec.publicWords,
      sourceSHA256: source.sha256, compiler: compiled.compiler, settings: compiled.settings,
      immutableNames: immutableNames(ast), immutableValues: values, artifacts: summaries,
      compiledSHA256: hash(regular(join(attempt, name, 'compiled.json'))),
      lineage: { sourceVersion, compiledManifestSHA256: program.manifestSHA256,
        keyManifestSHA256: prepared.manifestSHA256, keySHA256: hash(prepared.key),
        soliditySHA256: hash(prepared.solidity), keyBytes: prepared.key.length,
        keyHashField: prepared.manifest.keyHashField } };
    writeJSON(join(attempt, name, 'manifest.json'), row); result.contracts.push(row); save();
    assert.deepEqual(circuitIdentity(spec, helpers.verifyToolchain()), identity, 'VERIFIER_CIRCUIT_CHANGED');
  }
  assert.deepEqual(integrationSourcePins('claim-verifiers'), result.sourcePins, 'VERIFIER_SOURCE_CHANGED');
  assert.deepEqual(helpers.verifyCRS(), crs, 'VERIFIER_CRS_CHANGED');
  result.phase = 'completed';
} catch (error) {
  result.phase = 'failed';
  result.errorCode = String(error.message).match(/\b(?:VERIFIER|SOLIDITY|PW|GENERIC)_[A-Z0-9_]+\b/)?.[0]
    ?? 'VERIFIER_COMPILATION_FAILED';
  if (error.compilerErrors) result.compilerErrors = error.compilerErrors.map(item => ({
    type: item.type, severity: item.severity, code: item.errorCode, message: item.formattedMessage }));
  process.exitCode = 1;
} finally { result.resourceUsage = process.resourceUsage(); save(); }
