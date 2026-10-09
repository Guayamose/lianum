/** Private diagnostic only: enum/code and existing fixed-root source locations.
 * Never exports a message, comparison values, function names or error payloads. */
import assert, {AssertionError} from 'node:assert';
import {types} from 'node:util';
import {lstatSync,realpathSync} from 'node:fs';
import {join,relative,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,FLAT,GOLDEN} from '../../../../packages/proofs/src/catalog.mjs';
const CODE=/^(?:ERR|FLAT|CLAIM|NATIVE_CLAIM|COMBINED_OPERATOR|OPERATOR_NATIVE|SOLANA|BITCOIN|LOCAL_EVM|ROLE_CLIENT|PW|VAULT|NATIVE|COMMITMENT)_[A-Z0-9_]{1,100}$/;
// These exact SDK labels carry no response, permission or comparison values.
// Accept no arbitrary message, even if it resembles a diagnostic code.
const MOBILE_CODES=new Set(['MOBILE_ORIGINAL_EXPIRED','MOBILE_REVIEW_CHANGED',
 'MOBILE_ORIGINAL_RESPONSE_INVALID','MOBILE_SERVICE_UNAVAILABLE',
 'MOBILE_ORIGINAL_STREAM_REQUIRED','MOBILE_RESPONSE_ORIGIN']);
const TYPES=new Map([[AssertionError.prototype,'ASSERTION_ERROR'],[TypeError.prototype,'TYPE_ERROR'],[RangeError.prototype,'RANGE_ERROR'],[Error.prototype,'ERROR'],[AggregateError.prototype,'AGGREGATE_ERROR']]);
const ROOTS=Object.freeze([['flat-wallet',ROOT],['golden',GOLDEN],['mobile-protocol',join(FLAT,'mobile-protocol')]]);
// Node24 V8 exposes stack through an intrinsic getter even after assignment.
// Only that captured getter is callable; no custom stack formatter/accessor is.
const ORIGINAL_ERROR=Error,ERROR_PARENT=Object.getPrototypeOf(Error);
const NATIVE_STACK_GETTER=Object.getOwnPropertyDescriptor(new Error(),'stack')?.get;
const ORIGINAL_PREPARE=Object.getOwnPropertyDescriptor(Error,'prepareStackTrace');
const PROTOTYPE_CHAINS=new Map([...TYPES.keys()].map(start=>{
 const chain=[];for(let value=start;value!==null;value=Object.getPrototypeOf(value))chain.push(value);
 return[start,chain];
}));
const PROTOTYPE_PROPERTIES=new Map([...new Set([...PROTOTYPE_CHAINS.values()].flat())].map(value=>[value,Object.getOwnPropertyDescriptors(value)]));
function sameDescriptor(a,b){
 if(!a||!b)return a===b;
 return Reflect.ownKeys(a).length===Reflect.ownKeys(b).length
  &&Reflect.ownKeys(a).every(key=>Object.hasOwn(b,key)&&a[key]===b[key]);
}
function originalFormatting(){
 if(Error!==ORIGINAL_ERROR||Object.getPrototypeOf(ORIGINAL_ERROR)!==ERROR_PARENT)return false;
 // The fixed authenticated child loads this module before user work. Retain
 // Node's original data-function reference, never authorize one by its name.
 if(ORIGINAL_PREPARE&&(!Object.hasOwn(ORIGINAL_PREPARE,'value')
   ||(ORIGINAL_PREPARE.value!==undefined&&typeof ORIGINAL_PREPARE.value!=='function')))return false;
 if(!sameDescriptor(Object.getOwnPropertyDescriptor(ORIGINAL_ERROR,'prepareStackTrace'),ORIGINAL_PREPARE))return false;
 for(let value=ERROR_PARENT;value!==null;value=Object.getPrototypeOf(value))
  if(types.isProxy(value)||Object.getOwnPropertyDescriptor(value,'prepareStackTrace'))return false;
 return true;
}
function stackText(error){
 const chain=PROTOTYPE_CHAINS.get(Object.getPrototypeOf(error));if(!chain||!originalFormatting())return undefined;
 let current=Object.getPrototypeOf(error);
 for(const prototype of chain){
  if(current!==prototype||types.isProxy(current))return undefined;
  const saved=PROTOTYPE_PROPERTIES.get(prototype),actual=Object.getOwnPropertyDescriptors(prototype),keys=Reflect.ownKeys(saved);
  if(keys.length!==Reflect.ownKeys(actual).length||keys.some(key=>!Object.hasOwn(actual,key)||!sameDescriptor(saved[key],actual[key])))return undefined;
  current=Object.getPrototypeOf(current);
 }
 if(current!==null)return undefined;
 // V8's default formatting may read name/message; accept data strings only.
 for(const key of['name','message']){
  let descriptor=Object.getOwnPropertyDescriptor(error,key);
  for(const prototype of chain){if(descriptor)break;descriptor=Object.getOwnPropertyDescriptor(prototype,key);}
  if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='string')return undefined;
 }
 const descriptor=Object.getOwnPropertyDescriptor(error,'stack');if(!descriptor)return undefined;
 if(Object.hasOwn(descriptor,'value'))return typeof descriptor.value==='string'?descriptor.value:undefined;
 if(typeof NATIVE_STACK_GETTER!=='function'||descriptor.get!==NATIVE_STACK_GETTER)return undefined;
 try{return Reflect.apply(NATIVE_STACK_GETTER,error,[]);}catch{return undefined;}
}

function own(value,key){if(!value||typeof value!=='object'||types.isProxy(value))return undefined;return Object.getOwnPropertyDescriptor(value,key)?.value;}
function location(raw,line,column){
 try{
  const path=raw.startsWith('file://')?fileURLToPath(raw):raw;
  if(!isAbsolute(path)||resolve(path)!==path||!path.endsWith('.mjs'))return null;
  const selected=ROOTS.find(([,root])=>path.startsWith(root+'/'));if(!selected)return null;
  const name=relative(selected[1],path);
  if(/^[A-Za-z0-9_./-]+$/.exec(name)?.[0]!==name||name.split('/').some(part=>!part||part.startsWith('.'))||realpathSync(path)!==path)return null;
  const info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||info.size>1048576)return null;
  return Object.freeze({root:selected[0],path:name,line:Number(line),column:Number(column)});
 }catch{return null;}
}
export function privateNativeEconomicSuccessorFirstErrorV1(error){
 assert.equal(arguments.length,1,'NATIVE_ECONOMIC_FIRST_ERROR_ARITY');
 const native=!!error&&typeof error==='object'&&!types.isProxy(error)&&types.isNativeError(error);
 const errorType=native?(TYPES.get(Object.getPrototypeOf(error))??'OTHER_NATIVE_ERROR'):'THROWN_VALUE';
 const supplied=own(error,'code'),label=native?own(error,'message'):undefined;
 const errorCode=typeof supplied==='string'&&CODE.exec(supplied)?.[0]===supplied?supplied:
  MOBILE_CODES.has(label)?label:null;
 const stack=native?stackText(error):undefined,frames=[];
 if(typeof stack==='string')for(const row of stack.slice(0,65536).split('\n').slice(1,257)){
  const match=/^\s+at (?:[^()\r\n]* \()?((?:file:\/\/)?\/[^()\r\n?#]+\.mjs):([1-9][0-9]{0,8}):([1-9][0-9]{0,8})\)?$/.exec(row);
  if(!match)continue;const frame=location(match[1],match[2],match[3]);if(frame)frames.push(frame);if(frames.length===16)break;
 }
 return Object.freeze({format:'LIANUM_NATIVE_ECONOMIC_SUCCESSOR_FIRST_ERROR_PRIVATE_V1',errorType,errorCode,frames:Object.freeze(frames)});
}
