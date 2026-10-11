/** Fresh Solidity build of pinned official wrapper + local bounded contracts.
 * No circuit, proving key, historical receipt or compiler input is replaced. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sourcePath } from '@lianum/environment';
import { GENERIC_COMPILER_PIN,loadOriginalSolidityCompilerV1 } from '@lianum/engine/execution/local/solidity-compiler-v1';
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
  const compiler = loadOriginalSolidityCompilerV1(), version = compiler.version;
  const settings = {optimizer: {enabled: true, runs: 200}, evmVersion: 'cancun',
    outputSelection: {'*': {'*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'], '': ['ast']}}};
  const input = {language: 'Solidity', sources, settings}, inputRaw = JSON.stringify(input);
  let output;
  output = JSON.parse(compiler.compile(inputRaw));
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
