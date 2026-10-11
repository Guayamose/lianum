/** NEW stateless USDC6 validation library. Original BTC/SOL library, token,
 * compiler dependencies, circuits, keys and accepted artifacts stay untouched. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {ROOT} from '@lianum/proofs/catalog';
import {regular,hash} from '@lianum/proofs/tooling/tooling';
import {compileSoliditySources} from '@lianum/proofs/tooling/solidity-compiler';
import {GENERIC_COMPILER_PIN} from '@lianum/engine/execution/local/local-deployment';
import {loadNativeSplClaimV1RetainedContracts} from './native-spl-claim-v1-compilation.mjs';
export const NATIVE_SPL_CLAIM_VALIDATION_SOURCE_V1='native-claims/NativeSplClaimValidationV1.sol';
export const NATIVE_SPL_CLAIM_VALIDATION_NAME_V1='NativeSplClaimValidationV1';
export function nativeSplClaimValidationCompilationSourcesV1(){
 assert.equal(arguments.length,0,'SPL_VALIDATION_SOURCE_NO_OPTIONS');
 const original=loadNativeSplClaimV1RetainedContracts(),path=NATIVE_SPL_CLAIM_VALIDATION_SOURCE_V1,bytes=regular(join(ROOT,'contracts',path));
 return {...original.sourceMap,[path]:{content:bytes.toString('utf8'),sha256:hash(bytes)}};
}
const inputFor=(sources,settings)=>({language:'Solidity',sources:Object.fromEntries(Object.keys(sources).sort().map(name=>[name,{content:sources[name].content}])),settings});
export function compileNativeSplClaimValidationV1(){
 assert.equal(arguments.length,0,'SPL_VALIDATION_COMPILER_NO_OPTIONS');const sources=nativeSplClaimValidationCompilationSourcesV1();
 const compiled=compileSoliditySources(sources,{profile:'standard'}),artifact=compiled.contracts[NATIVE_SPL_CLAIM_VALIDATION_SOURCE_V1][NATIVE_SPL_CLAIM_VALIDATION_NAME_V1];
 const build={compiler:compiled.compiler,compilerPin:compiled.compiler,settings:compiled.settings,sourceASTs:compiled.sourceASTs,
  inputSHA256:hash(JSON.stringify(inputFor(sources,compiled.settings))),sourceRecords:compiled.sources.map(({name,bytes,sha256})=>({path:name,bytes,sha256})),
  artifacts:{nativeSplClaimValidation:{...artifact,sourceName:NATIVE_SPL_CLAIM_VALIDATION_SOURCE_V1,contractName:NATIVE_SPL_CLAIM_VALIDATION_NAME_V1}}};
 assertNativeSplClaimValidationCompilationArtifactsV1(build);return build;
}
export function assertNativeSplClaimValidationCompilationArtifactsV1(build){
 assert.equal(arguments.length,1);const original=loadNativeSplClaimV1RetainedContracts(),sources=nativeSplClaimValidationCompilationSourcesV1();
 assert.deepEqual(build.compiler,GENERIC_COMPILER_PIN);assert.deepEqual(build.compilerPin,GENERIC_COMPILER_PIN);assert.deepEqual(build.settings,original.compilation.settings);
 assert.equal(build.inputSHA256,hash(JSON.stringify(inputFor(sources,build.settings))),'SPL_VALIDATION_EXACT_COMPILER_INPUT');
 assert.deepEqual(build.sourceRecords,Object.keys(sources).sort().map(path=>({path,bytes:Buffer.byteLength(sources[path].content),sha256:sources[path].sha256})));
 assert.deepEqual(Object.keys(build.sourceASTs).sort(),Object.keys(sources).sort());assert.deepEqual(Object.keys(build.artifacts),['nativeSplClaimValidation']);
 const a=build.artifacts.nativeSplClaimValidation,old=original.artifacts.nativeClaimValidation;
 assert.equal(a.sourceName,NATIVE_SPL_CLAIM_VALIDATION_SOURCE_V1);assert.equal(a.contractName,NATIVE_SPL_CLAIM_VALIDATION_NAME_V1);
 assert.deepEqual(a.abi,old.abi,'SPL_VALIDATION_ORIGINAL_ABI');assert.deepEqual(a.evm.methodIdentifiers,old.evm.methodIdentifiers,'SPL_VALIDATION_ORIGINAL_SELECTORS');
 assert.deepEqual(a.evm.deployedBytecode.immutableReferences,{});assert.ok(build.sourceASTs[a.sourceName]);
 for(const [code,limit]of[[a.evm.bytecode.object,49152],[a.evm.deployedBytecode.object,24576]]){
  assert.equal(typeof code,'string');assert.ok(code.length>0&&code.length%2===0&&code.length/2<=limit,'SPL_VALIDATION_EVM_SIZE');
 }
 const links=new Set();for(const refs of[a.evm.bytecode.linkReferences,a.evm.deployedBytecode.linkReferences])
  for(const[source,names]of Object.entries(refs))for(const[name,items]of Object.entries(names)){
   links.add(source+':'+name);assert.ok(items.length>0);for(const item of items)assert.equal(item.length,20);
  }
 assert.deepEqual([...links].sort(),['FlatHubCodec.sol:FlatHubCodec','crypto/Poseidon2Domains.sol:Poseidon2Domains','native-claims/NativeClaimCodec.sol:NativeClaimCodec'].sort(),'SPL_VALIDATION_FIXED_LIBRARY_LINKS');
 return true;
}
