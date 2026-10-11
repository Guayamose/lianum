/** New six-decimal SPL claim token, compiled separately with the original Solc.
 * NativeClaimToken, circuits, keys and their retained compilation stay intact. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, sep } from 'node:path';
import { ROOT } from '@lianum/proofs/catalog';
import { projectRoot } from '@lianum/engine/chains/shared/runtime-harness';
import { GENERIC_COMPILER_PIN } from '@lianum/engine/execution/local/local-deployment';
export const NATIVE_SPL_CLAIM_TOKEN_SOURCE_V1='native-claims/NativeSplClaimTokenV1.sol';
export const NATIVE_SPL_CLAIM_TOKEN_NAME_V1='NativeSplClaimTokenV1';
const sourceNames=['native-claims/NativeClaimToken.sol',NATIVE_SPL_CLAIM_TOKEN_SOURCE_V1];
const currentSources=()=>Object.fromEntries(sourceNames.map(name=>[name,{content:readFileSync(join(ROOT,'contracts',name),'utf8')}]));
export function compileNativeSplClaimTokenV1() {
  assert.equal(arguments.length, 0);
  const sources=currentSources();
  const sha = value => createHash('sha256').update(value).digest('hex');
  const tools = realpathSync(join(projectRoot,'tools/solidity-js'));
  const lock = readFileSync(join(tools,'package-lock.json'));
  assert.equal(sha(lock),GENERIC_COMPILER_PIN.lockSHA256,'SPL_TOKEN_SOLC_LOCK_PIN');
  const dependency = JSON.parse(lock).packages['node_modules/solc'];
  assert.equal(dependency.version,GENERIC_COMPILER_PIN.packageVersion);
  assert.equal(dependency.resolved,GENERIC_COMPILER_PIN.resolved);
  assert.equal(dependency.integrity,GENERIC_COMPILER_PIN.integrity);
  const modulePath = realpathSync(join(tools,'node_modules/solc/soljson.js'));
  assert.ok(modulePath.startsWith(tools+sep),'SPL_TOKEN_SOLC_MODULE_PATH');
  assert.equal(sha(readFileSync(modulePath)),GENERIC_COMPILER_PIN.soljsonSHA256,'SPL_TOKEN_SOLC_MODULE_PIN');
  const compiler = createRequire(join(tools,'package.json'))(modulePath);
  const version = compiler.cwrap('solidity_version','string',[])();
  assert.equal(version,GENERIC_COMPILER_PIN.version,'SPL_TOKEN_SOLC_VERSION_PIN');
  const compile = compiler.cwrap('solidity_compile','string',['string','number','number']);
  const reset = compiler.cwrap('solidity_reset',null,[]);
  const settings = {optimizer: {enabled: true, runs: 200}, evmVersion: 'cancun',
    outputSelection: {'*': {'*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'evm.methodIdentifiers'], '': ['ast']}}};
  const input = {language: 'Solidity', sources, settings}, inputRaw = JSON.stringify(input);
  let output;
  try { output = JSON.parse(compile(inputRaw,0,0)); } finally { reset(); }
  assert.deepEqual((output.errors ?? []).filter(row => row.severity === 'error'), [], 'SPL_TOKEN_NEW_SOLIDITY_COMPILATION');
  const artifact = (sourceName, contractName) => ({...output.contracts[sourceName][contractName], sourceName, contractName});
  return {compiler: version, compilerPin: {...GENERIC_COMPILER_PIN}, settings, sourceASTs: output.sources,
    inputSHA256: createHash('sha256').update(inputRaw).digest('hex'),
    sourceRecords: Object.entries(sources).sort(([a],[b]) => a.localeCompare(b)).map(([path, row]) =>
      ({path, bytes: Buffer.byteLength(row.content), sha256: createHash('sha256').update(row.content).digest('hex')})),
    artifacts: {nativeSplToken:artifact(NATIVE_SPL_CLAIM_TOKEN_SOURCE_V1,NATIVE_SPL_CLAIM_TOKEN_NAME_V1)}};
}

const names=['nativeSplToken'];
export function assertNativeSplClaimTokenCompilationArtifactsV1(build){
 assert.equal(build.compiler,GENERIC_COMPILER_PIN.version);assert.deepEqual(build.compilerPin,GENERIC_COMPILER_PIN);
 assert.deepEqual(build.settings,{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode','evm.deployedBytecode','evm.methodIdentifiers'],'':['ast']}}});
 assert.deepEqual(Object.keys(build.artifacts).sort(),names);assert.equal(build.sourceRecords.length,2);
 assert.match(build.inputSHA256,/^[0-9a-f]{64}$/);assert.equal(new Set(build.sourceRecords.map(row=>row.path)).size,2);
 assert.deepEqual(build.sourceRecords.map(row=>row.path),sourceNames);assert.equal(build.artifacts.nativeSplToken.sourceName,NATIVE_SPL_CLAIM_TOKEN_SOURCE_V1);assert.equal(build.artifacts.nativeSplToken.contractName,NATIVE_SPL_CLAIM_TOKEN_NAME_V1);
 for(const row of build.sourceRecords){assert.match(row.sha256,/^[0-9a-f]{64}$/);assert.ok(Number.isSafeInteger(row.bytes)&&row.bytes>0);}
 for(const artifact of Object.values(build.artifacts)){
  assert.ok(Array.isArray(artifact.abi));for(const [code,limit] of [[artifact.evm.bytecode.object,49152],[artifact.evm.deployedBytecode.object,24576]]){
   assert.match(code,/^[0-9a-f]+$/);assert.equal(code.length%2,0);assert.ok(code.length>0&&code.length/2<=limit,'SPL_TOKEN_COMPILATION_EVM_CODE_LIMIT');
  }
  assert.ok(build.sourceASTs[artifact.sourceName]?.ast,'SPL_TOKEN_COMPILATION_AST_REQUIRED');
 }
 const input={language:'Solidity',sources:currentSources(),settings:build.settings};assert.equal(build.inputSHA256,createHash('sha256').update(JSON.stringify(input)).digest('hex'),'SPL_TOKEN_EXACT_CURRENT_COMPILER_INPUT');
 assert.deepEqual(build.sourceRecords,Object.entries(input.sources).map(([path,row])=>({path,bytes:Buffer.byteLength(row.content),sha256:createHash('sha256').update(row.content).digest('hex')})));
 const a=build.artifacts.nativeSplToken;assert.deepEqual(a.abi.find(row=>row.type==='constructor').inputs.map(row=>row.type),['address']);assert.deepEqual(a.evm.deployedBytecode.immutableReferences,{});assert.deepEqual(a.evm.bytecode.linkReferences,{});
 for(const name of ['mintToGateway','burnForTicket','gateway','decimals','symbol','name','totalSupply','balanceOf','allowance'])assert.equal(a.abi.filter(row=>row.type==='function'&&row.name===name).length,1);
 return true;
}
