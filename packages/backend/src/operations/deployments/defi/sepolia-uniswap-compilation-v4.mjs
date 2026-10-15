/** Fresh fixed adapter compilation only. This factory emits DATA/artifacts,
 * never an Original Flat system, D27, deployment or financial capability. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {GENERIC_COMPILER_PIN,loadOriginalSolidityCompilerV1} from '@lianum/engine/execution/local/solidity-compiler-v1';
const sha=v=>createHash('sha256').update(v).digest('hex');
export function compileFixedSepoliaUniswapDeliveryV4(){
 assert.equal(arguments.length,0);const name='contracts/wallet/defi/PrivateSepoliaUniswapDeliveryV4.sol',content=readFileSync(new URL('../../../../../../'+name,import.meta.url),'utf8');
 const settings={optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode','evm.deployedBytecode'],'':['ast']}}},input={language:'Solidity',sources:{[name]:{content}},settings},compiler=loadOriginalSolidityCompilerV1(),raw=JSON.stringify(input),output=JSON.parse(compiler.compile(raw));
 assert.deepEqual((output.errors??[]).filter(row=>row.severity==='error'),[],'SEPOLIA_UNISWAP_NEW_COMPILATION');
 const artifact=output.contracts[name].PrivateSepoliaUniswapDeliveryV4;assert.ok(artifact.evm.bytecode.object.length>0&&artifact.evm.deployedBytecode.object.length/2<=24576,'SEPOLIA_UNISWAP_CREATION');
 return {profile:'NEW_SEPOLIA_UNISWAP_ROUTER02_PRIVATE_OUTPUT_COMPILATION_V4',compiler:compiler.version,compilerPin:{...GENERIC_COMPILER_PIN},settings,sourceRecords:[{path:name,bytes:Buffer.byteLength(content),sha256:sha(content)}],inputSHA256:sha(raw),outputSHA256:sha(JSON.stringify({artifact,ast:output.sources[name].ast})),artifact,ast:output.sources[name].ast,financialAuthority:false,publicDeployment:false,privateProofAcceptance:false};
}
