/** Fresh Solidity build of pinned official wrapper + local bounded contracts.
 * No circuit, proving key, historical receipt or compiler input is replaced. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, sep } from 'node:path';
import { sourcePath, resourcePath } from '@lianum/environment';
import { GENERIC_COMPILER_PIN } from '@lianum/engine/execution/local/local-deployment';
import { loadOfficialAaveWrapperSourcesV1 } from './aave-v3-official-material-v1.mjs';
export function compileAaveDevelopmentContractsV1() {
  assert.equal(arguments.length, 0);
  const sources = loadOfficialAaveWrapperSourcesV1();
  const currentContracts = {
    'BoundedMetaMorphoExit.sol': sourcePath('contracts/wallet/defi/BoundedMetaMorphoExit.sol'),
    'BoundedAaveStaticExit.sol': sourcePath('contracts/wallet/defi/BoundedAaveStaticExit.sol'),
    'LocalAaveFlashYield.sol': sourcePath('contracts/wallet/defi/LocalAaveFlashYield.sol'),
    'PrivateAaveStaticDelivery.sol': sourcePath('contracts/wallet/defi/PrivateAaveStaticDelivery.sol'),
  };
  for (const [name,path] of Object.entries(currentContracts))
    sources['contracts/defi/' + name] = {content: readFileSync(path, 'utf8')};
  const sha = value => createHash('sha256').update(value).digest('hex');
  const tools = realpathSync(resourcePath('engine','tools/solidity-js'));
  const lock = readFileSync(join(tools,'package-lock.json'));
  assert.equal(sha(lock),GENERIC_COMPILER_PIN.lockSHA256,'AAVE_SOLC_LOCK_PIN');
  const dependency = JSON.parse(lock).packages['node_modules/solc'];
  assert.equal(dependency.version,GENERIC_COMPILER_PIN.packageVersion);
  assert.equal(dependency.resolved,GENERIC_COMPILER_PIN.resolved);
  assert.equal(dependency.integrity,GENERIC_COMPILER_PIN.integrity);
  const modulePath = realpathSync(join(tools,'node_modules/solc/soljson.js'));
  assert.ok(modulePath.startsWith(tools+sep),'AAVE_SOLC_MODULE_PATH');
  assert.equal(sha(readFileSync(modulePath)),GENERIC_COMPILER_PIN.soljsonSHA256,'AAVE_SOLC_MODULE_PIN');
  const compiler = createRequire(join(tools,'package.json'))(modulePath);
  const version = compiler.cwrap('solidity_version','string',[])();
  assert.equal(version,GENERIC_COMPILER_PIN.version,'AAVE_SOLC_VERSION_PIN');
  const compile = compiler.cwrap('solidity_compile','string',['string','number','number']);
  const reset = compiler.cwrap('solidity_reset',null,[]);
  const settings = {optimizer: {enabled: true, runs: 200}, evmVersion: 'cancun',
    outputSelection: {'*': {'*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'], '': ['ast']}}};
  const input = {language: 'Solidity', sources, settings}, inputRaw = JSON.stringify(input);
  let output;
  try { output = JSON.parse(compile(inputRaw,0,0)); } finally { reset(); }
  assert.deepEqual((output.errors ?? []).filter(row => row.severity === 'error'), [], 'AAVE_NEW_SOLIDITY_COMPILATION');
  const artifact = (sourceName, contractName) => ({...output.contracts[sourceName][contractName], sourceName, contractName});
  return {compiler: version, compilerPin: {...GENERIC_COMPILER_PIN}, settings, sourceASTs: output.sources,
    inputSHA256: createHash('sha256').update(inputRaw).digest('hex'),
    sourceRecords: Object.entries(sources).sort(([a],[b]) => a.localeCompare(b)).map(([path, row]) =>
      ({path, bytes: Buffer.byteLength(row.content), sha256: createHash('sha256').update(row.content).digest('hex')})),
    artifacts: {
      StaticATokenLM: artifact('static-a-token-v3/src/StaticATokenLM.sol', 'StaticATokenLM'),
      BoundedAaveStaticExit: artifact('contracts/defi/BoundedAaveStaticExit.sol', 'BoundedAaveStaticExit'),
      LocalAaveFlashYield: artifact('contracts/defi/LocalAaveFlashYield.sol', 'LocalAaveFlashYield'),
      PrivateAaveStaticDelivery: artifact('contracts/defi/PrivateAaveStaticDelivery.sol', 'PrivateAaveStaticDelivery'),
    }};
}
