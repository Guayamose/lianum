/** Compile the fixed contract pair once per explicit invocation. No deployment. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { compileSoliditySources } from '../../../packages/proofs/src/tooling/solidity-compiler.mjs';

assert.equal(process.argv.length, 2, 'FLAT_CONTRACT_FIXED_INVOCATION');
const root = fileURLToPath(new URL('../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const names = ['PrivateFlatAssetNotePool.sol', 'PrivateFlatReceiptHub.sol', 'FlatVerifierSet.sol',
  'crypto/Poseidon2.sol', 'crypto/Poseidon2Domains.sol', 'FlatHubCodec.sol'];
const sources = Object.fromEntries(names.map(name => {
  const content = readFileSync(join(root, 'contracts', name), 'utf8');
  return [name, { content, sha256: sha(content) }];
}));
const runId = randomUUID();
const output = join(root, '.local/contracts', runId);
mkdirSync(output, { recursive: true });
const report = { runId, startedAt: new Date().toISOString(), phase: 'compiling',
  classification: 'CONTRACT_PAIR_COMPILATION_ONLY', deployed: false, source: sources };
const save = () => writeFileSync(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
save();
try {
  const result = compileSoliditySources(sources, { profile: 'standard' });
  writeFileSync(join(output, 'compiled.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  report.sources = result.sources;
  delete report.source;
  report.compiler = result.compiler; report.profile = result.profile; report.settings = result.settings;
  report.milliseconds = result.milliseconds;
  report.contracts = [];
  for (const [source, name] of [['PrivateFlatAssetNotePool.sol', 'PrivateFlatAssetNotePool'],
    ['PrivateFlatReceiptHub.sol', 'PrivateFlatReceiptHub'],
    ['crypto/Poseidon2Domains.sol', 'Poseidon2Domains'], ['FlatHubCodec.sol', 'FlatHubCodec']]) {
    const contract = result.contracts[source][name];
    report.contracts.push({ source, name, runtimeBytes: contract.evm.deployedBytecode.object.length / 2,
      creationBytes: contract.evm.bytecode.object.length / 2,
      runtimeHexTemplateSHA256: sha(contract.evm.deployedBytecode.object),
      hasExternalLinks: Object.keys(contract.evm.bytecode.linkReferences).length > 0 });
  }
  report.compilationCompleted = true;
  report.eip170Passed = report.contracts.every(item => item.runtimeBytes <= 24576);
  report.eip3860Passed = report.contracts.every(item => item.creationBytes <= 49152);
  report.phase = report.eip170Passed && report.eip3860Passed ? 'completed' : 'code-size-blocked';
  report.compiledSHA256 = sha(readFileSync(join(output, 'compiled.json')));
  for (const name of names) assert.equal(sha(readFileSync(join(root, 'contracts', name))), sources[name].sha256,
    'FLAT_CONTRACT_SOURCE_CHANGED');
  report.sourceUnchanged = true;
  if (!report.eip170Passed || !report.eip3860Passed) process.exitCode = 1;
} catch (error) {
  report.phase = 'failed'; report.error = error.message;
  if (error.compilerErrors) report.compilerErrors = error.compilerErrors;
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString(); save();
  console.log(JSON.stringify({ output, phase: report.phase, contracts: report.contracts,
    error: report.error, compilerErrors: report.compilerErrors?.map(item => item.formattedMessage) }));
}
