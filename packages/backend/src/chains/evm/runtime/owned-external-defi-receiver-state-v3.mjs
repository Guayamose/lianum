/** Fixed External5 snapshot format only. These byte/bound helpers confer no
 * runtime, token, signing, issuer or restore authority. The original private
 * factory and one-use External5 token select this format in the runtime. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {gunzipSync} from 'node:zlib';
export const EXTERNAL_DEFI_RECEIVER_CAPTURE_SCHEMA_V3='OWNED_EXTERNAL_DEFI_RECEIVER_CAPTURE_V3';
export const EXTERNAL_DEFI_RECEIVER_PRIVATE_SCHEMA_V3='OWNED_EXTERNAL_DEFI_RECEIVER_PRIVATE_RECOVERY_V3';
export const EXTERNAL_DEFI_RECEIVER_SECTION_SCHEMA_V3='EXTERNAL_ORIGINAL_RECEIVER_CAPTURE_V3';
const MAX_ENCODED=48*1024*1024,MAX_METADATA=16*1024*1024,MAX_RECORD=64*1024*1024,MAX_JSON=128*1024*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stateFields=['schema','family','cwd','profile','runtimePin','processGeneration','originalProcessId','genesisHash','genesisHeader','accounts','head','accountState','stateDump','localCustodyCommitment','lastTimestamp','ingressMutationEpoch','uncertainMutation','uncertainSignedHash','transactions','receipts','lifecycle','sourceLineageCommitment'];
function plainData(value){
 const active=new WeakSet(),todo=[{value,exit:false}];
 while(todo.length){const row=todo.pop(),v=row.value;
  if(v===null||typeof v==='string'||typeof v==='boolean')continue;
  if(typeof v==='number'){assert.ok(Number.isFinite(v)&&!Object.is(v,-0),'EXTERNAL_RECEIVER_V3_DATA_NUMBER');continue;}
  assert.ok(typeof v==='object'&&!types.isProxy(v),'EXTERNAL_RECEIVER_V3_DATA_OBJECT');
  if(row.exit){active.delete(v);continue;}
  assert.ok(!active.has(v),'EXTERNAL_RECEIVER_V3_DATA_CYCLE');active.add(v);todo.push({value:v,exit:true});
  assert.ok(Object.getPrototypeOf(v)===(Array.isArray(v)?Array.prototype:Object.prototype),'EXTERNAL_RECEIVER_V3_DATA_PROTOTYPE');
  const descriptors=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(descriptors);
  for(const key of keys){assert.equal(typeof key,'string','EXTERNAL_RECEIVER_V3_DATA_SYMBOL');const d=descriptors[key];
   assert.ok(Object.hasOwn(d,'value'),'EXTERNAL_RECEIVER_V3_DATA_ACCESSOR');
   if(Array.isArray(v)&&key==='length')continue;
   assert.ok(d.enumerable&&key!=='toJSON','EXTERNAL_RECEIVER_V3_DATA_PROPERTY');todo.push({value:d.value,exit:false});
  }
 }
}
/** The encoded field includes its comma/name/quotes. With metadata this is
 * EXACTLY the byte length of the full JSON record, regardless of key order. */
export function assertOwnedExternalDefiStateDumpV3(value){
 assert.equal(arguments.length,1);
 assert.ok(typeof value==='string'&&value.length>2&&value.length+15<=MAX_ENCODED,'EXTERNAL_RECEIVER_V3_ENCODED_BOUND');
 assert.ok(value.startsWith('0x')&&(value.length-2)%2===0,'EXTERNAL_RECEIVER_V3_HEX_ENCODING');
 for(let i=2;i<value.length;i++){const c=value.charCodeAt(i);assert.ok(c>=48&&c<=57||c>=97&&c<=102,'EXTERNAL_RECEIVER_V3_HEX_ENCODING');}
 assert.ok(value.startsWith('0x1f8b08'),'EXTERNAL_RECEIVER_V3_ORIGINAL_GZIP');return true;
}
export function decodeOwnedExternalDefiStateV3(value){
 assert.equal(arguments.length,1);assertOwnedExternalDefiStateDumpV3(value);
 const original=Buffer.from(value.slice(2),'hex'),decoded=gunzipSync(original,{maxOutputLength:MAX_JSON});
 assert.ok(decoded.length>0&&decoded.length<=MAX_JSON,'EXTERNAL_RECEIVER_V3_DECODED_BOUND');
 const state=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));
 assert.ok(state&&typeof state==='object'&&!Array.isArray(state),'EXTERNAL_RECEIVER_V3_STATE_JSON_OBJECT');
 assert.deepEqual(Object.keys(state).sort(),['accounts','best_block_number','block','blocks','historical_states','transactions']);
 assert.ok(state.block&&typeof state.block==='object'&&!Array.isArray(state.block));
 assert.ok(state.accounts&&typeof state.accounts==='object'&&!Array.isArray(state.accounts));
 assert.ok(Array.isArray(state.blocks)&&Array.isArray(state.transactions)&&Array.isArray(state.historical_states));
 assert.ok(Number.isSafeInteger(state.best_block_number)&&state.best_block_number>=0,'EXTERNAL_RECEIVER_V3_STATE_HEIGHT');
 return {bytes:decoded,originalSHA256:sha(original),sha256:sha(decoded)};
}
export function assertOwnedExternalDefiPrivateRecordV3(value){
 assert.equal(arguments.length,1);plainData(value);
 assert.ok(value&&!Array.isArray(value),'EXTERNAL_RECEIVER_V3_PRIVATE_RECORD');
 assert.deepEqual(Object.keys(value).sort(),[...stateFields].sort());
 assert.equal(value.schema,EXTERNAL_DEFI_RECEIVER_PRIVATE_SCHEMA_V3);assert.equal(value.family,'receiver');
 assert.equal(value.profile,'PAEG_LOCAL_FAKE_CLOCK_V1');assert.equal(value.sourceLineageCommitment,null);
 assert.ok(value.transactions.length<=512&&value.receipts.length<=512,'EXTERNAL_RECEIVER_V3_RETAINED_HISTORY_BOUND');
 assertOwnedExternalDefiStateDumpV3(value.stateDump);
 const {stateDump,...metadata}=value,metadataBytes=Buffer.byteLength(JSON.stringify(metadata)),encodedBytes=Buffer.byteLength(',"stateDump":'+JSON.stringify(stateDump));
 assert.ok(metadataBytes<=MAX_METADATA,'EXTERNAL_RECEIVER_V3_METADATA_BOUND');assert.ok(encodedBytes<=MAX_ENCODED,'EXTERNAL_RECEIVER_V3_ENCODED_BOUND');
 const recordBytes=Buffer.byteLength(JSON.stringify(value));assert.equal(recordBytes,metadataBytes+encodedBytes);
 assert.ok(recordBytes<=MAX_RECORD,'EXTERNAL_RECEIVER_V3_RECORD_BOUND');
 // The gzip/footer hint cannot authorize capture. Inflate with the REAL bound
 // and validate the original Anvil state schema before retention or key reopen.
 const decoded=decodeOwnedExternalDefiStateV3(stateDump);return Object.freeze({metadataBytes,encodedBytes,recordBytes,decodedBytes:decoded.bytes.length,originalSHA256:decoded.originalSHA256,decodedSHA256:decoded.sha256});
}
