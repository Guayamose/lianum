/** Offline compiler seam for owned integration sources, not a public service. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { GENERIC_COMPILER_PIN } from '../../../engine/src/execution/local/local-deployment.mjs';
import { legacyDataRoot } from '@lianum/environment';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export function compileSoliditySources(sourceMap, { profile = 'standard' } = {}) {
  assert.ok(['standard', 'ledger-size', 'verifier'].includes(profile), 'SOLIDITY_FIXED_PROFILE');
  assert.ok(sourceMap && Object.getPrototypeOf(sourceMap) === Object.prototype);
  const names = Object.keys(sourceMap).sort();
  assert.ok(names.length > 0 && names.length <= 64, 'SOLIDITY_SOURCE_COUNT');
  const sources = {}, records = [];
  for (const name of names) {
    assert.match(name, /^[A-Za-z0-9_/-]+\.sol$/);
    assert.ok(!name.startsWith('/') && !name.split('/').includes('..'), 'SOLIDITY_SOURCE_NAME');
    const record = sourceMap[name];
    assert.deepEqual(Object.keys(record).sort(), ['content', 'sha256']);
    assert.equal(typeof record.content, 'string');
    assert.equal(sha(record.content), record.sha256, 'SOLIDITY_SOURCE_PIN');
    sources[name] = { content: record.content };
    records.push({ name, sha256: record.sha256, bytes: Buffer.byteLength(record.content) });
  }
  const tools = realpathSync(join(legacyDataRoot('engine'), 'tools/solidity-js'));
  const lock = readFileSync(join(tools, 'package-lock.json'));
  assert.equal(sha(lock), GENERIC_COMPILER_PIN.lockSHA256, 'SOLIDITY_LOCK_PIN');
  const dependency = JSON.parse(lock).packages['node_modules/solc'];
  assert.equal(dependency.version, GENERIC_COMPILER_PIN.packageVersion);
  assert.equal(dependency.resolved, GENERIC_COMPILER_PIN.resolved);
  assert.equal(dependency.integrity, GENERIC_COMPILER_PIN.integrity);
  const modulePath = realpathSync(join(tools, 'node_modules/solc/soljson.js'));
  assert.ok(modulePath.startsWith(tools + sep));
  assert.equal(sha(readFileSync(modulePath)), GENERIC_COMPILER_PIN.soljsonSHA256, 'SOLIDITY_MODULE_PIN');
  const compiler = createRequire(join(tools, 'package.json'))(modulePath);
  assert.equal(compiler.cwrap('solidity_version', 'string', [])(), GENERIC_COMPILER_PIN.version);
  const compile = compiler.cwrap('solidity_compile', 'string', ['string', 'number', 'number']);
  const reset = compiler.cwrap('solidity_reset', null, []);
  // The linked ledger pair is deployment-size constrained. This fixed profile
  // trades runtime gas for bytecode size; it changes no EVM limit or predicate.
  const settings = { optimizer: { enabled: true, runs: profile === 'standard' ? 200 : 1 }, viaIR: profile !== 'verifier',
    evmVersion: 'cancun', metadata: { bytecodeHash: 'none' },
    outputSelection: { '*': { '': ['ast'], '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.linkReferences',
      'evm.deployedBytecode.object', 'evm.deployedBytecode.linkReferences',
      'evm.deployedBytecode.immutableReferences', 'evm.methodIdentifiers'] } } };
  let output;
  const started = performance.now();
  try { output = JSON.parse(compile(JSON.stringify({ language: 'Solidity', sources, settings }), 0, 0)); }
  finally { reset(); }
  const errors = (output.errors ?? []).filter(item => item.severity === 'error');
  if (errors.length) {
    const error = new Error('SOLIDITY_COMPILATION_FAILED'); error.compilerErrors = errors; throw error;
  }
  for (const name of Object.keys(output.contracts ?? {})) assert.ok(names.includes(name), 'UNSUPPLIED_SOLIDITY_SOURCE');
  return { classification: 'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE', profile,
    contracts: output.contracts, sources: records,
    sourceASTs: Object.fromEntries(Object.entries(output.sources).map(([name, source]) => [name, source.ast])),
    settings, compiler: GENERIC_COMPILER_PIN,
    milliseconds: performance.now() - started,
    warnings: (output.errors ?? []).filter(item => item.severity !== 'error') };
}
