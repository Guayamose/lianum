/** The original recovery encoding guard, with numeric private failure data.
 * A descriptor is never a runtime/recovery capability or a state snapshot. */
import assert from 'node:assert/strict';
import {types} from 'node:util';

const MAX_CAPTURE_CHARACTERS=32*1024*1024;
const failures=new WeakMap();
function describe(value){
 const type=value===null?'NULL':typeof value==='string'?'STRING':typeof value==='undefined'?'UNDEFINED'
  :typeof value==='boolean'?'BOOLEAN':typeof value==='number'?'NUMBER':typeof value==='bigint'?'BIGINT'
  :typeof value==='symbol'?'SYMBOL':typeof value==='function'?'FUNCTION':'OBJECT';
 const string=typeof value==='string',length=string?value.length:null;
 const withinCharacterBound=string?length<=MAX_CAPTURE_CHARACTERS:null;
 const hexPrefix=string?value.startsWith('0x'):null;
 const positiveEvenByteLength=string?length>2&&(length-2)%2===0:null;
 // This independent bounded encoding check reports only a boolean. It never
 // changes the original assertion or interprets/decodes captured state.
 let lowerHexEncoding=null;
 if(string&&withinCharacterBound&&hexPrefix&&positiveEvenByteLength){
  lowerHexEncoding=true;
  for(let index=2;index<length;index++){
   const code=value.charCodeAt(index);
   if(!(code>=48&&code<=57||code>=97&&code<=102)){lowerHexEncoding=false;break;}
  }
 }
 return Object.freeze({schema:'OWNED_EVM_RECOVERY_STATE_BOUND_DIAGNOSTIC_V1',type,
  characterLength:length,maximumCharacters:MAX_CAPTURE_CHARACTERS,withinCharacterBound,
  hexPrefix,positiveEvenByteLength,lowerHexEncoding});
}
export function assertOwnedEvmRecoveryStateDumpV1(value){
 assert.equal(arguments.length,1);
 try{
  // Keep the historical type/cap/regex short circuit byte-for-byte unchanged.
  assert.ok(typeof value==='string'&&value.length<=32*1024*1024&&/^0x(?:[0-9a-f]{2})+$/.test(value),'EVM_RECOVERY_STATE_BOUND');
 }catch(error){
  try{failures.set(error,describe(value));}catch{/* Diagnostics cannot replace the original guard failure. */}
  throw error;
 }
}
function own(value,key){
 if(!value||typeof value!=='object'||types.isProxy(value))return null;
 const descriptor=Object.getOwnPropertyDescriptor(value,key);
 return descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:null;
}
export function ownedEvmRecoveryStateBoundFailureV1(error){
 assert.equal(arguments.length,1);
 // Original wrappers may carry their error as cause or NativeError.data.cause.
 // No getters, proxy traps, arbitrary messages, stacks or blob fields are read.
 for(let depth=0;depth<4;depth++){
  if(!error||typeof error!=='object'||types.isProxy(error))return null;
  const value=failures.get(error);if(value)return Object.freeze({...value});
  error=own(error,'cause')??own(own(error,'data'),'cause');
 }
 return null;
}
