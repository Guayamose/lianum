/** NEW public-target compilation of the existing exact minimum-deposit ledger.
 * No historical build/pin, circuit, verifier, key or LOCAL gate is replaced.
 * Parent Paged PUBLIC optimizer/prefix permits byte-checked shared libraries. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {sourcePath} from '@lianum/environment';
import {GENERIC_COMPILER_PIN,loadOriginalSolidityCompilerV1} from '@lianum/engine/execution/local/solidity-compiler-v1';
import {FLAT_MINIMUM_BUILD_PIN} from '../system/append-only-build-v3.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
let cached=null;
export function compileFixedSepoliaFlatMinimumLedgerV4(){
 assert.equal(arguments.length,0);const sources={},records=[];
 for(const [name,[expected]]of Object.entries(FLAT_MINIMUM_BUILD_PIN.sources)){
  const path='contracts/wallet/'+name,bytes=readFileSync(sourcePath(path));assert.equal(sha(bytes),expected,'PUBLIC_FLAT_ORIGINAL_SOURCE');sources[path]={content:bytes.toString('utf8')};records.push({name:path,bytes:bytes.length,sha256:expected});
 }
 const settings={optimizer:{enabled:true,runs:1},viaIR:true,evmVersion:'cancun',metadata:{bytecodeHash:'none'},outputSelection:{'*':{'':['ast'],'*':['abi','evm.bytecode.object','evm.bytecode.linkReferences','evm.deployedBytecode.object','evm.deployedBytecode.linkReferences','evm.deployedBytecode.immutableReferences','evm.methodIdentifiers']}}},raw=JSON.stringify({language:'Solidity',sources,settings}),inputSHA256=sha(raw);
 if(cached){assert.equal(cached.inputSHA256,inputSHA256,'PUBLIC_FLAT_COMPILATION_SOURCE_CHANGED');return cached;}
 const compiler=loadOriginalSolidityCompilerV1(),output=JSON.parse(compiler.compile(raw));assert.deepEqual((output.errors??[]).filter(e=>e.severity==='error'),[],'PUBLIC_FLAT_NEW_COMPILATION');
 const artifacts=Object.fromEntries(Object.entries(FLAT_MINIMUM_BUILD_PIN.artifacts).map(([role,[file,name]])=>[role,output.contracts['contracts/wallet/'+file][name]]));
 for(const artifact of Object.values(artifacts))assert.ok(artifact.evm.deployedBytecode.object.length/2>0&&artifact.evm.deployedBytecode.object.length/2<=24576,'PUBLIC_FLAT_EIP170');
 cached=freeze({profile:'NEW_SEPOLIA_FLAT_MINIMUM_TARGET_COMPILATION_V4',classification:'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE',compiler:{...GENERIC_COMPILER_PIN},settings,inputSHA256,outputSHA256:sha(JSON.stringify({contracts:output.contracts,sourceASTs:output.sources})),sources:records,sourceMap:Object.fromEntries(records.map(row=>[row.name,{...sources[row.name],sha256:row.sha256}])),contracts:output.contracts,sourceASTs:Object.fromEntries(Object.entries(output.sources).map(([name,source])=>[name,source.ast])),artifacts,financialAcceptance:false,publicDeployment:false,protectedSourcesChanged:false});return cached;
}
