/** New bounded Morpho Blue position profile. Original official Blue bytecode
 * is supplied by the original fixture; this compiles only the new local sources.
 * No circuit, proving key, historical receipt or compiler input is replaced. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sourcePath } from '@lianum/environment';
import { GENERIC_COMPILER_PIN,loadOriginalSolidityCompilerV1 } from '@lianum/engine/execution/local/solidity-compiler-v1';
export function compileOriginalMorphoBluePositionContractsV1() {
  assert.equal(arguments.length, 0);
  const sources = {};
  const currentContracts = {
    'OriginalMorphoBluePositionV1.sol': sourcePath('contracts/wallet/defi/OriginalMorphoBluePositionV1.sol'),
    'PrivateMorphoBluePositionDeliveryV1.sol': sourcePath('contracts/wallet/defi/PrivateMorphoBluePositionDeliveryV1.sol'),
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
  assert.deepEqual((output.errors ?? []).filter(row => row.severity === 'error'), [], 'BLUE_POSITION_SOLIDITY_COMPILATION');
  const artifact = name => ({...output.contracts['contracts/defi/' + name + '.sol'][name],
    sourceName: 'contracts/defi/' + name + '.sol', contractName: name});
  return {profile:'MORPHO_BLUE_PRIVATE_SUPPLY_V1',compiler:version,compilerPin:{...GENERIC_COMPILER_PIN},
    settings,sourceASTs:output.sources,inputSHA256:sha(inputRaw),
    sourceRecords:Object.entries(sources).sort(([a],[b])=>a.localeCompare(b)).map(([path,row])=>
      ({path,bytes:Buffer.byteLength(row.content),sha256:sha(row.content)})),
    artifacts:{OriginalMorphoBluePositionV1:artifact('OriginalMorphoBluePositionV1'),
      PrivateMorphoBluePositionDeliveryV1:artifact('PrivateMorphoBluePositionDeliveryV1')}};
}
