/** One explicit official pinned compilation of the new claim dependency closure.
 * No node, prover, deployment, mock verifier or compiler setting search. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { compileSoliditySources } from '../../../packages/proofs/src/tooling/solidity-compiler.mjs';

assert.equal(process.argv.length, 2, 'CLAIM_CONTRACT_FIXED_INVOCATION');
const root = fileURLToPath(new URL('../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const names = ['native-claims/NativeClaimTypes.sol', 'native-claims/NativeClaimVerifierSet.sol',
  'native-claims/NativeClaimInterfaces.sol', 'native-claims/NativeClaimCodec.sol',
  'native-claims/NativeClaimToken.sol', 'native-claims/NativeClaimAuthority.sol',
  'native-claims/NativeClaimGateway.sol', 'native-claims/NativeClaimValidation.sol', 'FlatVerifierSet.sol', 'FlatHubCodec.sol',
  'crypto/Poseidon2.sol', 'crypto/Poseidon2Domains.sol'];
const sources = Object.fromEntries(names.map(name => {
  const content = readFileSync(join(root, 'contracts', name), 'utf8');
  return [name, { content, sha256: sha(content) }];
}));
const runId = randomUUID(), output = join(root, '.local/native-claims-contracts', runId);
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'source-snapshot.json'), JSON.stringify(sources, null, 2) + '\n', { flag: 'wx' });
const report = { runId, startedAt: new Date().toISOString(), phase: 'compiling',
  classification: 'NATIVE_CLAIM_CONTRACT_COMPILATION_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE',
  nativeNodesStarted: false, proofGenerated: false, deployed: false,
  sourceSnapshotSHA256: sha(readFileSync(join(output, 'source-snapshot.json'))) };
const save = () => writeFileSync(join(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
save();
try {
  const compiled = compileSoliditySources(sources, { profile: 'standard' });
  writeFileSync(join(output, 'compiled.json'), JSON.stringify(compiled, null, 2) + '\n', { flag: 'wx' });
  report.compiledSHA256 = sha(readFileSync(join(output, 'compiled.json')));
  report.compiler = compiled.compiler; report.profile = compiled.profile; report.settings = compiled.settings;
  report.settingsSHA256 = sha(JSON.stringify(compiled.settings)); report.sources = compiled.sources;
  report.milliseconds = compiled.milliseconds; report.warnings = compiled.warnings;
  report.contracts = [];
  for (const [source, contracts] of Object.entries(compiled.contracts)) for (const [name, artifact] of Object.entries(contracts)) {
    if (!artifact.evm.bytecode.object) continue;
    const constructorBytes = name === 'NativeClaimGateway' ? 1536 : name === 'NativeClaimAuthority' ? 288 : name === 'NativeClaimToken' ? 64 : 0;
    report.contracts.push({ source, name, sourceSHA256: sources[source].sha256,
      sourceASTSHA256: sha(JSON.stringify(compiled.sourceASTs[source])), artifactSHA256: sha(JSON.stringify(artifact)),
      abiSHA256: sha(JSON.stringify(artifact.abi)), runtimeBytes: artifact.evm.deployedBytecode.object.length / 2,
      creationBytes: artifact.evm.bytecode.object.length / 2, constructorBytes,
      initcodeBytesAtProfileBound: artifact.evm.bytecode.object.length / 2 + constructorBytes,
      runtimeHexTemplateSHA256: sha(artifact.evm.deployedBytecode.object),
      creationHexTemplateSHA256: sha(artifact.evm.bytecode.object),
      creationLinkReferences: artifact.evm.bytecode.linkReferences,
      runtimeLinkReferences: artifact.evm.deployedBytecode.linkReferences,
      immutableReferences: artifact.evm.deployedBytecode.immutableReferences });
  }
  report.compilationCompleted = true;
  report.eip170Passed = report.contracts.every(item => item.runtimeBytes <= 24576);
  report.eip3860Passed = report.contracts.every(item => item.initcodeBytesAtProfileBound <= 49152);
  report.phase = report.eip170Passed && report.eip3860Passed ? 'completed' : 'code-size-blocked';
  for (const name of names) assert.equal(sha(readFileSync(join(root, 'contracts', name))), sources[name].sha256,
    'CLAIM_CONTRACT_SOURCE_CHANGED');
  report.sourceUnchanged = true;
  if (!report.eip170Passed || !report.eip3860Passed) process.exitCode = 1;
} catch (error) {
  report.phase = 'failed'; report.error = error.message;
  if (error.compilerErrors) report.compilerErrors = error.compilerErrors;
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString(); save();
  console.log(JSON.stringify({ output, phase: report.phase,
    contracts: report.contracts?.map(({ name, runtimeBytes, creationBytes, constructorBytes }) => ({ name, runtimeBytes, creationBytes, constructorBytes })),
    error: report.error, compilerErrors: report.compilerErrors?.map(item => item.formattedMessage) }));
}
