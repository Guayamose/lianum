import test from 'node:test';
import assert from 'node:assert/strict';
import {aaveCompilationProcessFailureV1,assertAaveCompilationArtifactsV1} from './aave-compilation-policy-v1.mjs';
import {GENERIC_COMPILER_PIN} from '../../../../packages/engine/src/execution/local/local-deployment.mjs';
test('compilation-only rejects every non-main process including exited proof/native history',()=>{
 assert.equal(aaveCompilationProcessFailureV1([{role:'main-worker',proofWorker:false,state:'R'}]),null);
 for(const row of [{role:'main-worker',proofWorker:true,state:'Z'},{role:'owned-anvil',proofWorker:false,state:'X'},{role:'owned-descendant',proofWorker:false,state:'S'}])
  assert.equal(aaveCompilationProcessFailureV1([{role:'main-worker',proofWorker:false},row]),'AAVE_COMPILATION_UNEXPECTED_CHILD');
});
test('compilation metadata requires original compiler, exact source inventory and EVM code limits',()=>{
 // Synthetic compiler metadata only; this does not compile/deploy or establish financial authority.
 const artifacts=Object.fromEntries(['BoundedAaveStaticExit','LocalAaveFlashYield','PrivateAaveStaticDelivery','StaticATokenLM'].map(name=>[name,{sourceName:name+'.sol',abi:[],evm:{bytecode:{object:'6000'},deployedBytecode:{object:'6000'}}}]));
 const value={compiler:GENERIC_COMPILER_PIN.version,compilerPin:{...GENERIC_COMPILER_PIN},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode','evm.deployedBytecode'],'':['ast']}}},
  artifacts,sourceASTs:Object.fromEntries(Object.keys(artifacts).map(name=>[name+'.sol',{ast:{nodeType:'SourceUnit'}}])),inputSHA256:'1'.repeat(64),sourceRecords:Array.from({length:35},(_,n)=>({path:n+'.sol',bytes:1,sha256:'2'.repeat(64)}))};
 assert.equal(assertAaveCompilationArtifactsV1(value),true);
 for(const mutate of [x=>x.compilerPin.soljsonSHA256='0'.repeat(64),x=>x.sourceRecords.pop(),x=>x.sourceRecords[1].path=x.sourceRecords[0].path,x=>x.artifacts.StaticATokenLM.evm.deployedBytecode.object='60'.repeat(24577)]){
  const bad=structuredClone(value);mutate(bad);assert.throws(()=>assertAaveCompilationArtifactsV1(bad));
 }
});
