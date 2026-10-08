/** Fresh Solidity build of pinned official wrapper + local bounded contracts.
 * No circuit, proving key, historical receipt or compiler input is replaced. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT } from '../../../../../proofs/src/catalog.mjs';
import { projectRoot } from '../../../../../engine/src/chains/shared/runtime-harness.mjs';
import { loadOfficialAaveWrapperSourcesV1 } from './aave-v3-official-material-v1.mjs';
export function compileAaveDevelopmentContractsV1() {
  assert.equal(arguments.length, 0);
  const sources = loadOfficialAaveWrapperSourcesV1();
  for (const name of ['BoundedMetaMorphoExit.sol', 'BoundedAaveStaticExit.sol', 'LocalAaveFlashYield.sol', 'PrivateAaveStaticDelivery.sol'])
    sources['contracts/defi/' + name] = {content: readFileSync(join(ROOT, 'contracts/defi', name), 'utf8')};
  const require = createRequire(join(projectRoot, 'tools/solidity-js/package.json')), solc = require('solc');
  assert.match(solc.version(), /^0\.8\.37\+commit\.f401782d/);
  const settings = {optimizer: {enabled: true, runs: 200}, evmVersion: 'cancun',
    outputSelection: {'*': {'*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'], '': ['ast']}}};
  const input = {language: 'Solidity', sources, settings}, inputRaw = JSON.stringify(input);
  const output = JSON.parse(solc.compile(inputRaw));
  assert.deepEqual((output.errors ?? []).filter(row => row.severity === 'error'), [], 'AAVE_NEW_SOLIDITY_COMPILATION');
  const artifact = (sourceName, contractName) => ({...output.contracts[sourceName][contractName], sourceName, contractName});
  return {compiler: solc.version(), settings, sourceASTs: output.sources,
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
