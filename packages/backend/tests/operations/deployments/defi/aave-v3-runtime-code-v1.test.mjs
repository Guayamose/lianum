import test from 'node:test';
import assert from 'node:assert/strict';
import {linkAaveCreationCodeV1,expectedAaveRuntimeCodeV1} from '../../../../src/operations/deployments/defi/aave-v3-runtime-code-v1.mjs';
const holder='0x'+'12'.repeat(20),placeholder='__$'+'1'.repeat(34)+'$__';
const artifact={sourceName:'contracts/X.sol',contractName:'X',evm:{
  bytecode:{object:'60'+placeholder+'00',linkReferences:{'contracts/L.sol':{L:[{start:1,length:20}]}}},
  deployedBytecode:{object:'00'.repeat(64),linkReferences:{},immutableReferences:{7:[{start:0,length:32}]}}}};
const ast={'contracts/X.sol':{ast:{nodes:[{nodeType:'ContractDefinition',name:'X',contractKind:'contract',nodes:[
  {nodeType:'VariableDeclaration',id:7,name:'target',mutability:'immutable'}]}]}}};
test('original link offsets and AST immutable are patched with exact address/word bytes',()=>{
  assert.equal(linkAaveCreationCodeV1(artifact,{L:holder}),'0x60'+holder.slice(2)+'00');
  assert.equal(expectedAaveRuntimeCodeV1(artifact,ast,{}, {target:holder}),'0x'+'0'.repeat(24)+holder.slice(2)+'0'.repeat(64));
});
test('missing library, out of range immutable and EIP170 runtime are rejected',()=>{
  assert.throws(()=>linkAaveCreationCodeV1(artifact,{}),/AAVE_LIBRARY_MISSING/);
  const bad=structuredClone(artifact);bad.evm.deployedBytecode.immutableReferences[7][0].start=64;
  assert.throws(()=>expectedAaveRuntimeCodeV1(bad,ast,{}, {target:holder}));
  bad.evm.deployedBytecode={object:'00'.repeat(24577),linkReferences:{},immutableReferences:{}};
  assert.throws(()=>expectedAaveRuntimeCodeV1(bad,{}, {},{}),/AAVE_EIP170_RUNTIME_LIMIT/);
});
