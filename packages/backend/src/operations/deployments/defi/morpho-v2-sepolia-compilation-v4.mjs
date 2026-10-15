/** Fresh fixed public adapter artifacts. Compiler/source checks issue DATA only,
 * never a signer, deployment, protocol fixture or private-output capability. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {GENERIC_COMPILER_PIN,loadOriginalSolidityCompilerV1} from '@lianum/engine/execution/local/solidity-compiler-v1';
const sha=value=>createHash('sha256').update(value).digest('hex');
export function compileFixedMorphoV2SepoliaAdaptersV4(){
 assert.equal(arguments.length,0);
 const names={delivery:['contracts/wallet/defi/PrivateMorphoVaultV2DeliverySepoliaV4.sol','PrivateMorphoVaultV2DeliverySepoliaV4'],exit:['contracts/wallet/defi/BoundedMorphoVaultV2ExitSepoliaV4.sol','BoundedMorphoVaultV2ExitSepoliaV4']};
 const sources=Object.fromEntries(Object.values(names).map(([name])=>[name,{content:readFileSync(new URL('../../../../../../'+name,import.meta.url),'utf8')}]));
 const settings={optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode','evm.deployedBytecode','evm.methodIdentifiers'],'':['ast']}}};
 const input={language:'Solidity',sources,settings},raw=JSON.stringify(input),compiler=loadOriginalSolidityCompilerV1(),output=JSON.parse(compiler.compile(raw));
 assert.deepEqual((output.errors??[]).filter(row=>row.severity==='error'),[],'MORPHO_V2_SEPOLIA_NEW_COMPILATION');
 const artifacts=Object.fromEntries(Object.entries(names).map(([role,[file,name]])=>{const artifact=output.contracts[file][name];assert.ok(artifact.evm.bytecode.object.length>0&&artifact.evm.deployedBytecode.object.length/2<=24576,'MORPHO_V2_SEPOLIA_ADAPTER_SIZE');return[role,artifact];}));
 return{profile:'NEW_MORPHO_V2_SEPOLIA_ADAPTER_COMPILATION_V4',compiler:compiler.version,compilerPin:{...GENERIC_COMPILER_PIN},settings,names,artifacts,
  sourceRecords:Object.entries(sources).map(([path,{content}])=>({path,bytes:Buffer.byteLength(content),sha256:sha(content)})),sourceASTs:Object.fromEntries(Object.keys(sources).map(name=>[name,output.sources[name].ast])),
  inputSHA256:sha(raw),outputSHA256:sha(JSON.stringify({artifacts,sourceASTs:output.sources})),financialAuthority:false,publicDeployment:false,privateProofAcceptance:false};
}
