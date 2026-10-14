/** Lossless Paged snapshot DATA. The ORIGINAL private factory selects it after
 * admission. Compressed bytes, their declared length and digest remain inside
 * the same owned/sealed private record; no runtime or recovery grant is issued.
 * Generic records and small historical Paged records remain unchanged. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {PAGED_RUNTIME_CAPACITY_V3} from './paged-runtime-capacity-v3.mjs';
export const PAGED_RUNTIME_HISTORY_LIMITS_V3=Object.freeze({plainBytes:512*1024,decodedBytes:32*1024*1024,compressedBytes:8*1024*1024});
const limits=PAGED_RUNTIME_HISTORY_LIMITS_V3,profile='OWNED_PAGED_EVM_RETAINED_HISTORY_V3',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function plain(value){const active=new WeakSet(),todo=[{value,depth:0,exit:false}];let nodes=0;while(todo.length){const row=todo.pop(),v=row.value;assert.ok(++nodes<=1000000&&row.depth<=64,'PAGED_RUNTIME_HISTORY_COMPLEXITY');if(v===null||typeof v==='string'||typeof v==='boolean')continue;if(typeof v==='number'){assert.ok(Number.isFinite(v)&&!Object.is(v,-0));continue;}assert.ok(v&&typeof v==='object'&&!types.isProxy(v),'PAGED_RUNTIME_HISTORY_DATA');if(row.exit){active.delete(v);continue;}assert.ok(!active.has(v),'PAGED_RUNTIME_HISTORY_CYCLE');active.add(v);todo.push({...row,exit:true});assert.equal(Object.getPrototypeOf(v),Array.isArray(v)?Array.prototype:Object.prototype);const props=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(props);if(Array.isArray(v)){assert.equal(keys.length,v.length+1);for(let i=0;i<v.length;i++)assert.ok(Object.hasOwn(props,String(i))&&props[String(i)].enumerable&&Object.hasOwn(props[String(i)],'value'),'PAGED_RUNTIME_HISTORY_DENSE_ARRAY');}for(const k of keys){assert.equal(typeof k,'string');const d=props[k];assert.ok(Object.hasOwn(d,'value'),'PAGED_RUNTIME_HISTORY_ACCESSOR');if(Array.isArray(v)&&k==='length')continue;assert.ok(d.enumerable&&k!=='toJSON','PAGED_RUNTIME_HISTORY_DATA');todo.push({value:d.value,depth:row.depth+1,exit:false});}}}
function lists(record){assert.ok(Array.isArray(record.transactions)&&record.transactions.length<=PAGED_RUNTIME_CAPACITY_V3.transactions&&Array.isArray(record.receipts)&&record.receipts.length<=PAGED_RUNTIME_CAPACITY_V3.transactions,'PAGED_RUNTIME_HISTORY_COLLECTION_BOUND');}
export function encodePagedRuntimeHistoryV3(record){
 assert.equal(arguments.length,1);plain(record);lists(record);
 const byRow=new Map(),transactions=record.transactions;transactions.forEach((row,i)=>{const key=JSON.stringify(row);if(!byRow.has(key))byRow.set(key,i);});
 const receiptIndexes=record.receipts.map(row=>{const i=byRow.get(JSON.stringify(row));assert.ok(i!==undefined,'PAGED_RUNTIME_HISTORY_RECEIPT_JOIN');return i;}),bytes=Buffer.from(JSON.stringify({transactions,receiptIndexes}));let compressed;
 try{assert.ok(bytes.length<=limits.decodedBytes,'PAGED_RUNTIME_HISTORY_DECODED_BOUND');if(bytes.length<=limits.plainBytes)return record;compressed=deflateRawSync(bytes,{level:6});assert.ok(compressed.length<=limits.compressedBytes,'PAGED_RUNTIME_HISTORY_COMPRESSED_BOUND');
  return {...record,transactions:{profile,encoding:'DEFLATE_RAW',length:bytes.length,sha256:sha(bytes),data:compressed.toString('base64')},receipts:[]};
 }finally{bytes.fill(0);compressed?.fill(0);}
}
export function decodePagedRuntimeHistoryV3(record){
 assert.equal(arguments.length,1);plain(record);if(Array.isArray(record.transactions)){lists(record);return record;}
 const raw=record.transactions;assert.ok(raw&&Object.getPrototypeOf(raw)===Object.prototype);assert.deepEqual(Object.keys(raw).sort(),['data','encoding','length','profile','sha256']);assert.equal(raw.profile,profile);assert.equal(raw.encoding,'DEFLATE_RAW');assert.ok(Array.isArray(record.receipts)&&record.receipts.length===0,'PAGED_RUNTIME_HISTORY_RECEIPT_JOIN');assert.ok(Number.isSafeInteger(raw.length)&&raw.length>limits.plainBytes&&raw.length<=limits.decodedBytes,'PAGED_RUNTIME_HISTORY_DECODED_BOUND');assert.match(raw.sha256,/^[0-9a-f]{64}$/);assert.ok(typeof raw.data==='string'&&raw.data.length<=4*Math.ceil(limits.compressedBytes/3),'PAGED_RUNTIME_HISTORY_COMPRESSED_BOUND');
 const compressed=Buffer.from(raw.data,'base64');let bytes;
 try{assert.equal(compressed.toString('base64'),raw.data,'PAGED_RUNTIME_HISTORY_BASE64');assert.ok(compressed.length<=limits.compressedBytes,'PAGED_RUNTIME_HISTORY_COMPRESSED_BOUND');const expanded=inflateRawSync(compressed,{maxOutputLength:limits.decodedBytes,info:true});bytes=expanded.buffer;assert.equal(expanded.engine.bytesWritten,compressed.length,'PAGED_RUNTIME_HISTORY_TRAILING_BYTES');assert.equal(bytes.length,raw.length,'PAGED_RUNTIME_HISTORY_LENGTH');assert.equal(sha(bytes),raw.sha256,'PAGED_RUNTIME_HISTORY_DIGEST');const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));plain(data);assert.deepEqual(Object.keys(data).sort(),['receiptIndexes','transactions']);assert.ok(Array.isArray(data.receiptIndexes)&&data.receiptIndexes.length<=PAGED_RUNTIME_CAPACITY_V3.transactions,'PAGED_RUNTIME_HISTORY_COLLECTION_BOUND');const result={...record,transactions:data.transactions,receipts:data.receiptIndexes.map(i=>{assert.ok(Number.isSafeInteger(i)&&i>=0&&i<data.transactions.length,'PAGED_RUNTIME_HISTORY_RECEIPT_JOIN');return data.transactions[i];})};lists(result);return result;
 }finally{compressed.fill(0);bytes?.fill(0);}
}
