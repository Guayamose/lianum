/** Real original local C compiler only; no proof, node or deployment. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {GENERIC_COMPILER_PIN,loadOriginalSolidityCompilerV1} from '@lianum/engine/execution/local/solidity-compiler-v1';
import {GENERIC_COMPILER_PIN as legacyPin} from '@lianum/engine/execution/local/local-deployment';

test('the original compiler pin keeps one identity across both public entries',()=>{
 assert.equal(legacyPin,GENERIC_COMPILER_PIN);
 assert.equal(Object.isFrozen(GENERIC_COMPILER_PIN),true);
 assert.throws(()=>loadOriginalSolidityCompilerV1({}),/GENERIC_SOLC_FIXED_RESOURCES/);
});

test('the pinned compiler resets after invalid input and accepts only its fixed C API',()=>{
 const compiler=loadOriginalSolidityCompilerV1();
 assert.equal(compiler.version,GENERIC_COMPILER_PIN.version);
 assert.throws(()=>compiler.compile('{}',()=>{}),/GENERIC_SOLC_STANDARD_JSON/);
 assert.throws(()=>compiler.compile({}),/GENERIC_SOLC_STANDARD_JSON/);
 const invalid=JSON.parse(compiler.compile('{not JSON'));
 assert.ok(invalid.errors.some(row=>row.severity==='error'));
 const input={language:'Solidity',sources:{'Host.sol':{content:'pragma solidity ^0.8.37; contract Host { function value() external pure returns(uint256){ return 7; } }'}},settings:{outputSelection:{'*':{'*':['abi']}}}};
 for(let i=0;i<2;i++){
  const actual=JSON.parse(compiler.compile(JSON.stringify(input)));
  assert.deepEqual((actual.errors??[]).filter(row=>row.severity==='error'),[]);
  assert.equal(actual.contracts['Host.sol'].Host.abi[0].name,'value');
 }
});
