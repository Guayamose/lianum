/** Pure original guard/diagnostic HOST. No Anvil, authority, keys, proof or effect. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertOwnedEvmRecoveryStateDumpV1,ownedEvmRecoveryStateBoundFailureV1} from '../../../../src/chains/evm/runtime/owned-evm-recovery-state-bound-v1.mjs';

function failure(value){try{assertOwnedEvmRecoveryStateDumpV1(value);}catch(error){return error;}assert.fail('HOST expected original bound rejection');}
const fields=['schema','type','characterLength','maximumCharacters','withinCharacterBound','hexPrefix','positiveEvenByteLength','lowerHexEncoding'].sort();
test('original state bound keeps its cause, fixed cap and numeric private diagnostics',()=>{
 assertOwnedEvmRecoveryStateDumpV1('0x00');assertOwnedEvmRecoveryStateDumpV1('0xdeadbeef');
 for(const value of [null,undefined,false,123,1n,Symbol('HOST_PRIVATE_SYMBOL'),()=>{}]){
  const error=failure(value),view=ownedEvmRecoveryStateBoundFailureV1(error);
  assert.equal(error.code,'ERR_ASSERTION');assert.deepEqual(Object.keys(view).sort(),fields);
  assert.equal(view.characterLength,null);assert.equal(view.hexPrefix,null);assert.equal(view.lowerHexEncoding,null);
  assert.equal(view.maximumCharacters,33554432);assert.ok(Object.isFrozen(view));
 }
 for(const [value,expected] of [
  ['0x',{hexPrefix:true,positiveEvenByteLength:false,lowerHexEncoding:null}],
  ['0x0',{hexPrefix:true,positiveEvenByteLength:false,lowerHexEncoding:null}],
  ['0xGG',{hexPrefix:true,positiveEvenByteLength:true,lowerHexEncoding:false}],
  ['0Xaa',{hexPrefix:false,positiveEvenByteLength:true,lowerHexEncoding:null}],
  ['HOST_PRIVATE_BYTES',{hexPrefix:false,positiveEvenByteLength:true,lowerHexEncoding:null}],
 ]){
  const error=failure(value),view=ownedEvmRecoveryStateBoundFailureV1(error);
  assert.equal(error.code,'ERR_ASSERTION');assert.equal(view.type,'STRING');assert.equal(view.characterLength,value.length);
  assert.equal(view.withinCharacterBound,true);for(const [key,want]of Object.entries(expected))assert.equal(view[key],want);
  assert.ok(!JSON.stringify(view).includes(value));
 }
 // A large but valid hex fixture can expose the pair-regex engine limit. This
 // checks preservation against the unchanged literal, never financial acceptance.
 for(const length of [1048576,4194304,33554432]){
  const value='0x'+'aa'.repeat((length-2)/2);let originalError=null,newError=null;
  try{assert.ok(typeof value==='string'&&value.length<=32*1024*1024&&/^0x(?:[0-9a-f]{2})+$/.test(value),'EVM_RECOVERY_STATE_BOUND');}catch(error){originalError=error;}
  try{assertOwnedEvmRecoveryStateDumpV1(value);}catch(error){newError=error;}
  assert.equal(Boolean(newError),Boolean(originalError));
  if(newError){const view=ownedEvmRecoveryStateBoundFailureV1(newError);assert.equal(view.characterLength,length);
   assert.equal(view.withinCharacterBound,true);assert.equal(view.positiveEvenByteLength,true);assert.equal(view.lowerHexEncoding,true);
   assert.equal(newError.name,originalError.name);assert.equal(newError.code,originalError.code);
  }
 }
 const oversized='0x'+'aa'.repeat(16777216),view=ownedEvmRecoveryStateBoundFailureV1(failure(oversized));
 assert.equal(view.characterLength,33554434);assert.equal(view.withinCharacterBound,false);assert.equal(view.lowerHexEncoding,null);
});

test('original state bound diagnostic rejects copied, opaque and hostile errors without traps',()=>{
 let invoked=0;
 const value=new Proxy({raw:'HOST_PRIVATE_VALUE'},{get(){invoked++;throw Error('HOST_GETTER');},ownKeys(){invoked++;throw Error('HOST_KEYS');}});
 const error=failure(value);assert.equal(ownedEvmRecoveryStateBoundFailureV1(error).type,'OBJECT');assert.equal(invoked,0);
 assert.equal(ownedEvmRecoveryStateBoundFailureV1({...error}),null);assert.equal(ownedEvmRecoveryStateBoundFailureV1(value),null);
 const accessor=Object.defineProperty({},'cause',{get(){invoked++;throw Error('HOST_CAUSE_GETTER');}});
 assert.equal(ownedEvmRecoveryStateBoundFailureV1(accessor),null);assert.equal(invoked,0);
 const wrapped=new Error('HOST_PRIVATE_MESSAGE',{cause:error});
 assert.deepEqual(ownedEvmRecoveryStateBoundFailureV1(wrapped),ownedEvmRecoveryStateBoundFailureV1(error));
 const nativeWrapper={data:{cause:error}};assert.deepEqual(ownedEvmRecoveryStateBoundFailureV1(nativeWrapper),ownedEvmRecoveryStateBoundFailureV1(error));
 const cycle={};cycle.cause=cycle;assert.equal(ownedEvmRecoveryStateBoundFailureV1(cycle),null);
 const view=ownedEvmRecoveryStateBoundFailureV1(wrapped);assert.ok(!JSON.stringify(view).includes('HOST_PRIVATE'));
 assert.throws(()=>{view.type='STRING';});assert.equal(ownedEvmRecoveryStateBoundFailureV1(error).type,'OBJECT');
 assert.throws(()=>ownedEvmRecoveryStateBoundFailureV1(error,'HOST_EXTRA'),{code:'ERR_ASSERTION'});
});
