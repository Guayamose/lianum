/** Bounded byte transport for the original durable Paged HUB only. These DATA
 * checks issue no runtime, token, signing capability or recovery authority. The
 * private EVM factory selects this codec after its original family admission. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {types} from 'node:util';
import {gunzipSync} from 'node:zlib';
import {assertOwnedEvmStateFileV1} from './owned-evm-state-file-v1.mjs';
import {assertOwnedRecoveryScratchV1} from '../../shared/runtime/owned-runtime-recovery-files-v1.mjs';

export const PAGED_HUB_EVM_STATE_LIMITS_V3=Object.freeze({encodedBytes:48*1024*1024,metadataBytes:16*1024*1024,recordBytes:64*1024*1024,decodedBytes:128*1024*1024,accounts:4096,blocks:4096,transactions:512,historicalStates:4096});
const limits=PAGED_HUB_EVM_STATE_LIMITS_V3,failures=new WeakMap(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fields=['schema','family','cwd','profile','runtimePin','processGeneration','originalProcessId','genesisHash','genesisHeader','accounts','head','accountState','stateDump','localCustodyCommitment','lastTimestamp','ingressMutationEpoch','uncertainMutation','uncertainSignedHash','transactions','receipts','lifecycle','sourceLineageCommitment'];
function own(value,key){if(!value||typeof value!=='object'||types.isProxy(value))return null;const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value')?d.value:null;}
function diagnostic(value,measure={}){
 const string=typeof value==='string',type=value===null?'NULL':string?'STRING':typeof value==='undefined'?'UNDEFINED':typeof value==='boolean'?'BOOLEAN':typeof value==='number'?'NUMBER':typeof value==='bigint'?'BIGINT':typeof value==='symbol'?'SYMBOL':typeof value==='function'?'FUNCTION':'OBJECT',characterLength=string?value.length:null;
 const encodedBytes=string?value.length+15:null,withinEncodedBound=string?encodedBytes<=limits.encodedBytes:null,hexPrefix=string?value.startsWith('0x'):null,positiveEvenByteLength=string?value.length>2&&(value.length-2)%2===0:null;
 let lowerHexEncoding=null;if(string&&withinEncodedBound&&hexPrefix&&positiveEvenByteLength){lowerHexEncoding=true;for(let i=2;i<value.length;i++){const c=value.charCodeAt(i);if(!(c>=48&&c<=57||c>=97&&c<=102)){lowerHexEncoding=false;break;}}}
 return Object.freeze({schema:'OWNED_PAGED_HUB_EVM_STATE_BOUND_DIAGNOSTIC_V3',type,characterLength,encodedBytes,maximumEncodedBytes:limits.encodedBytes,withinEncodedBound,hexPrefix,positiveEvenByteLength,lowerHexEncoding,gzipHeaderMagicAndMethod:string?value.startsWith('0x1f8b08'):null,metadataBytes:measure.metadataBytes??null,maximumMetadataBytes:limits.metadataBytes,recordBytes:measure.recordBytes??null,maximumRecordBytes:limits.recordBytes,decodedBytes:measure.decodedBytes??null,maximumDecodedBytes:limits.decodedBytes});
}
function guarded(value,measure,run){try{return run();}catch(error){try{failures.set(error,diagnostic(value,measure));}catch{}throw error;}}
export function ownedPagedHubEvmStateBoundFailureV3(error){assert.equal(arguments.length,1);for(let depth=0;depth<4;depth++){if(!error||typeof error!=='object'||types.isProxy(error))return null;const value=failures.get(error);if(value)return Object.freeze({...value});error=own(error,'cause')??own(own(error,'data'),'cause');}return null;}
function plainData(raw){const active=new WeakSet(),todo=[{value:raw,exit:false}];while(todo.length){const row=todo.pop(),value=row.value;if(value===null||typeof value==='string'||typeof value==='boolean')continue;if(typeof value==='number'){assert.ok(Number.isFinite(value)&&!Object.is(value,-0),'PAGED_HUB_STATE_DATA_NUMBER');continue;}assert.ok(typeof value==='object'&&!types.isProxy(value),'PAGED_HUB_STATE_DATA_OBJECT');if(row.exit){active.delete(value);continue;}assert.ok(!active.has(value),'PAGED_HUB_STATE_DATA_CYCLE');active.add(value);todo.push({value,exit:true});assert.equal(Object.getPrototypeOf(value),Array.isArray(value)?Array.prototype:Object.prototype,'PAGED_HUB_STATE_DATA_PROTOTYPE');for(const key of Reflect.ownKeys(value)){assert.equal(typeof key,'string','PAGED_HUB_STATE_DATA_SYMBOL');const d=Object.getOwnPropertyDescriptor(value,key);assert.ok(Object.hasOwn(d,'value'),'PAGED_HUB_STATE_DATA_ACCESSOR');if(Array.isArray(value)&&key==='length')continue;assert.ok(d.enumerable&&key!=='toJSON','PAGED_HUB_STATE_DATA_PROPERTY');todo.push({value:d.value,exit:false});}}}
function uint(value){assert.ok(typeof value==='string'&&/^(?:0x[0-9a-f]+|0|[1-9][0-9]*)$/.test(value)||typeof value==='number'&&Number.isSafeInteger(value)&&value>=0,'PAGED_HUB_STATE_UINT');return BigInt(value);}
function assertDump(value){assert.ok(typeof value==='string'&&value.length>2&&value.length+15<=limits.encodedBytes,'PAGED_HUB_STATE_ENCODED_BOUND');assert.ok(value.startsWith('0x')&&(value.length-2)%2===0,'PAGED_HUB_STATE_HEX_ENCODING');for(let i=2;i<value.length;i++){const c=value.charCodeAt(i);assert.ok(c>=48&&c<=57||c>=97&&c<=102,'PAGED_HUB_STATE_HEX_ENCODING');}assert.ok(value.startsWith('0x1f8b08'),'PAGED_HUB_STATE_ORIGINAL_GZIP');}
export function assertOwnedPagedHubEvmStateDumpV3(value){assert.equal(arguments.length,1);return guarded(value,{},()=>{assertDump(value);return true;});}
function decode(value,measure,record){
 assertDump(value);const original=Buffer.from(value.slice(2),'hex'),decoded=gunzipSync(original,{maxOutputLength:limits.decodedBytes});measure.decodedBytes=decoded.length;assert.ok(decoded.length>0&&decoded.length<=limits.decodedBytes,'PAGED_HUB_STATE_DECODED_BOUND');
 const state=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));assert.ok(state&&typeof state==='object'&&!Array.isArray(state),'PAGED_HUB_STATE_JSON_OBJECT');assert.deepEqual(Object.keys(state).sort(),['accounts','best_block_number','block','blocks','historical_states','transactions']);
 assert.ok(state.block&&typeof state.block==='object'&&!Array.isArray(state.block)&&state.accounts&&typeof state.accounts==='object'&&!Array.isArray(state.accounts),'PAGED_HUB_STATE_JSON_OBJECT');assert.ok(Number.isSafeInteger(state.best_block_number)&&state.best_block_number>=0,'PAGED_HUB_STATE_HEIGHT');assert.equal(uint(state.block.number),BigInt(state.best_block_number),'PAGED_HUB_STATE_HEIGHT');
 assert.ok(Object.keys(state.accounts).length<=limits.accounts,'PAGED_HUB_STATE_ACCOUNT_BOUND');for(const [name,max]of [['blocks',limits.blocks],['transactions',limits.transactions],['historical_states',limits.historicalStates]])assert.ok(Array.isArray(state[name])&&state[name].length<=max,'PAGED_HUB_STATE_COLLECTION_BOUND');
 if(record){
  assert.equal(BigInt(state.best_block_number),uint(record.head.number),'PAGED_HUB_STATE_RETAINED_HEAD');assert.equal(uint(state.block.timestamp),uint(record.head.timestamp),'PAGED_HUB_STATE_RETAINED_TIME');assert.equal(record.genesisHash,record.genesisHeader.hash,'PAGED_HUB_STATE_RETAINED_GENESIS');
  const matches=(header,expected)=>header&&typeof header==='object'&&!Array.isArray(header)&&Object.keys(header).every(key=>JSON.stringify(header[key])===JSON.stringify(expected[key]));
  assert.ok(state.blocks.some(row=>uint(row.header.number)===0n&&matches(row.header,record.genesisHeader)),'PAGED_HUB_STATE_RETAINED_GENESIS');assert.ok(state.blocks.some(row=>uint(row.header.number)===uint(record.head.number)&&matches(row.header,record.head)),'PAGED_HUB_STATE_RETAINED_HEAD');
  for(const row of record.accountState){const actual=state.accounts[row.address];assert.ok(actual,'PAGED_HUB_STATE_RETAINED_ACCOUNT');assert.equal(uint(actual.balance),uint(row.balance),'PAGED_HUB_STATE_RETAINED_BALANCE');assert.equal(uint(actual.nonce),uint(row.nonce),'PAGED_HUB_STATE_RETAINED_NONCE');assert.equal(actual.code,row.code,'PAGED_HUB_STATE_RETAINED_CODE');}
 }
 return{bytes:decoded,originalSHA256:sha(original),sha256:sha(decoded)};
}
export function decodeOwnedPagedHubEvmStateV3(value){assert.equal(arguments.length,1);const measure={};return guarded(value,measure,()=>decode(value,measure,null));}
export function assertOwnedPagedHubEvmPrivateRecordV3(value){
 assert.equal(arguments.length,1);const stateDump=own(value,'stateDump'),measure={};return guarded(stateDump,measure,()=>{
  plainData(value);assert.ok(value&&!Array.isArray(value),'PAGED_HUB_STATE_PRIVATE_RECORD');assert.deepEqual(Object.keys(value).sort(),[...fields].sort());assert.equal(value.schema,'OWNED_FIXED_EVM_PRIVATE_RECOVERY_V2');assert.equal(value.family,'receiver');assert.equal(value.profile,'PAEG_LOCAL_FAKE_CLOCK_V1');assert.equal(value.sourceLineageCommitment,null);
  assert.ok(Array.isArray(value.transactions)&&value.transactions.length<=limits.transactions&&Array.isArray(value.receipts)&&value.receipts.length<=limits.transactions,'PAGED_HUB_STATE_RETAINED_HISTORY_BOUND');assert.ok(Array.isArray(value.accounts)&&value.accounts.length===5&&new Set(value.accounts).size===5&&Array.isArray(value.accountState)&&value.accountState.length===value.accounts.length,'PAGED_HUB_STATE_RETAINED_ACCOUNTS');assert.ok(value.accountState.every((row,index)=>row.address===value.accounts[index]),'PAGED_HUB_STATE_RETAINED_ACCOUNTS');
  assertDump(stateDump);const {stateDump:ignored,...metadata}=value;measure.metadataBytes=Buffer.byteLength(JSON.stringify(metadata));measure.encodedBytes=stateDump.length+15;measure.recordBytes=measure.metadataBytes+measure.encodedBytes;
  assert.ok(measure.metadataBytes<=limits.metadataBytes,'PAGED_HUB_STATE_METADATA_BOUND');assert.ok(measure.recordBytes<=limits.recordBytes,'PAGED_HUB_STATE_RECORD_BOUND');
  const decoded=decode(stateDump,measure,value);return Object.freeze({metadataBytes:measure.metadataBytes,encodedBytes:measure.encodedBytes,recordBytes:measure.recordBytes,decodedBytes:decoded.bytes.length,originalSHA256:decoded.originalSHA256,decodedSHA256:decoded.sha256});
 });
}
export async function writeOwnedPagedHubEvmStateFileV3({cwd,suffix,stateDump}){
 assert.equal(arguments.length,1);assert.ok(typeof suffix==='string'&&/^[1-9][0-9]?$/.test(suffix),'PAGED_HUB_STATE_FILE_GENERATION');await assertOwnedRecoveryScratchV1(cwd,'flat-economic-receiver-v2-');const directory=await lstat(cwd);assert.equal(directory.uid,process.getuid(),'PAGED_HUB_STATE_FILE_OWNER');assert.equal(await realpath(cwd),cwd);assert.equal(directory.mode&0o777,0o700,'PAGED_HUB_STATE_FILE_DIRECTORY');
 const decoded=decodeOwnedPagedHubEvmStateV3(stateDump),path=join(cwd,'reopen-state-'+suffix+'.json'),file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await file.writeFile(decoded.bytes);await file.sync();}finally{await file.close();}
 const parent=await open(cwd,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{const actual=await parent.stat();assert.equal(actual.dev,directory.dev);assert.equal(actual.ino,directory.ino);await parent.sync();}finally{await parent.close();}
 const pin=Object.freeze({path,bytes:decoded.bytes.length,sha256:decoded.sha256,originalSHA256:decoded.originalSHA256});await assertOwnedEvmStateFileV1(pin);return pin;
}
