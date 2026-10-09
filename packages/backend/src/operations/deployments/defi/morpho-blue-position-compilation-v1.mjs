/** New bounded Morpho Blue position profile. Original official Blue bytecode
 * is supplied by the original fixture; this compiles only the new local sources.
 * No circuit, proving key, historical receipt or compiler input is replaced. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, sep } from 'node:path';
import { ROOT } from '../../../../../proofs/src/catalog.mjs';
import { projectRoot } from '../../../../../engine/src/chains/shared/runtime-harness.mjs';
import { GENERIC_COMPILER_PIN } from '../../../../../engine/src/execution/local/local-deployment.mjs';
export function compileOriginalMorphoBluePositionContractsV1() {
  assert.equal(arguments.length, 0);
  const sources = {};
  for (const name of ['OriginalMorphoBluePositionV1.sol', 'PrivateMorphoBluePositionDeliveryV1.sol'])
    sources['contracts/defi/' + name] = {content: readFileSync(join(ROOT, 'contracts/defi', name), 'utf8')};
  const sha = value => createHash('sha256').update(value).digest('hex');
  const tools = realpathSync(join(projectRoot,'tools/solidity-js'));
  const lock = readFileSync(join(tools,'package-lock.json'));
  assert.equal(sha(lock),GENERIC_COMPILER_PIN.lockSHA256,'BLUE_POSITION_SOLC_LOCK_PIN');
  const dependency = JSON.parse(lock).packages['node_modules/solc'];
  assert.equal(dependency.version,GENERIC_COMPILER_PIN.packageVersion);
  assert.equal(dependency.resolved,GENERIC_COMPILER_PIN.resolved);
  assert.equal(dependency.integrity,GENERIC_COMPILER_PIN.integrity);
  const modulePath = realpathSync(join(tools,'node_modules/solc/soljson.js'));
  assert.ok(modulePath.startsWith(tools+sep),'BLUE_POSITION_SOLC_MODULE_PATH');
  assert.equal(sha(readFileSync(modulePath)),GENERIC_COMPILER_PIN.soljsonSHA256,'BLUE_POSITION_SOLC_MODULE_PIN');
  const compiler = createRequire(join(tools,'package.json'))(modulePath);
  const version = compiler.cwrap('solidity_version','string',[])();
  assert.equal(version,GENERIC_COMPILER_PIN.version,'BLUE_POSITION_SOLC_VERSION_PIN');
  const compile = compiler.cwrap('solidity_compile','string',['string','number','number']);
  const reset = compiler.cwrap('solidity_reset',null,[]);
  const settings = {optimizer: {enabled: true, runs: 200}, evmVersion: 'cancun',
    outputSelection: {'*': {'*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'], '': ['ast']}}};
  const input = {language: 'Solidity', sources, settings}, inputRaw = JSON.stringify(input);
  let output;
  try { output = JSON.parse(compile(inputRaw,0,0)); } finally { reset(); }
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
