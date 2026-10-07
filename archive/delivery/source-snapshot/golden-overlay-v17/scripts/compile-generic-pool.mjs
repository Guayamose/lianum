/** Compile the new ledger with the separately pinned official solc-js build. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const toolRoot = join(root, 'tools/solidity-js');
const lock = JSON.parse(readFileSync(join(toolRoot, 'package-lock.json')));
const lockedCompiler = lock.packages['node_modules/solc'];
assert.equal(lockedCompiler.version, '0.8.37', 'SOLC_JS_VERSION_PIN');
assert.equal(lockedCompiler.resolved, 'https://registry.npmjs.org/solc/-/solc-0.8.37.tgz', 'SOLC_JS_ORIGIN');
assert.equal(lockedCompiler.integrity,
  'sha512-ieUYdPDRGNKMsZpCfi9tY64Q+ASoL8tyhLuvf9cFiqDs+6ijlx8Wn2CRi0N71AlCvRx0V092rlUYu3b3PuxWlA==',
  'SOLC_JS_INTEGRITY_PIN');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const require = createRequire(join(toolRoot, 'package.json'));
const solc = require('solc');
assert.equal(solc.version(), '0.8.37+commit.f401782d.Emscripten.clang', 'SOLC_JS_BUILD');
const sourceName = 'contracts/PrivateGenericAssetNotePool.sol';
const source = readFileSync(join(root, sourceName), 'utf8');
const settings = {
  optimizer: { enabled: true, runs: 200 },
  viaIR: true,
  evmVersion: 'cancun',
  metadata: { bytecodeHash: 'none' },
  outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.methodIdentifiers'] } },
};
const input = { language: 'Solidity', sources: { [sourceName]: { content: source } }, settings };
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter(error => error.severity === 'error');
assert.equal(errors.length, 0, errors.map(error => error.formattedMessage).join('\n'));
const artifact = output.contracts[sourceName].PrivateGenericAssetNotePool;
assert.ok(artifact.evm.deployedBytecode.object.length > 0, 'GENERIC_POOL_EMPTY_ARTIFACT');
const directory = join(root, '.local/development/generic-pool');
mkdirSync(directory, { recursive: true });
const report = {
  classification: 'ACTUAL_SOLIDITY_SOURCE_COMPILATION_NOT_PROOF_OR_DEPLOYMENT',
  completedAt: new Date().toISOString(),
  sourceSHA256: sha(source),
  node: process.version,
  compiler: {
    version: solc.version(),
    distribution: 'official solc-js npm package; distinct from the unavailable Linux binary',
    packageIntegrity: lockedCompiler.integrity,
    lockSHA256: sha(readFileSync(join(toolRoot, 'package-lock.json'))),
    soljsonSHA256: sha(readFileSync(join(toolRoot, 'node_modules/solc/soljson.js'))),
  },
  settings,
  creationBytes: artifact.evm.bytecode.object.length / 2,
  runtimeBytes: artifact.evm.deployedBytecode.object.length / 2,
  runtimeSHA256: sha(Buffer.from(artifact.evm.deployedBytecode.object, 'hex')),
  warnings: (output.errors ?? []).filter(error => error.severity !== 'error').map(error => error.formattedMessage),
  deployed: false,
  actualProofsVerified: false,
};
writeFileSync(join(directory, 'artifact.json'), JSON.stringify(artifact, null, 2) + '\n');
writeFileSync(join(directory, 'compile.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ phase: 'compiled', runtimeBytes: report.runtimeBytes, warnings: report.warnings, report: join(directory, 'compile.json') }));
