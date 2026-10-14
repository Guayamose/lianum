/** Lossless DATA transport inside the ORIGINAL encrypted Vault. This adapter
 * emits no provider, signing/restore grant or public source authority. Small
 * historical records stay byte-format compatible; only large Paged records
 * receive an authenticated compressed wrapper. The generic Vault is unchanged. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {Vault} from '@lianum/engine/crypto/vault';

export const PAGED_PROVIDER_STATE_LIMITS_V3=Object.freeze({decodedBytes:16*1024*1024,compressedBytes:512*1024,plainBytes:512*1024,nodes:1000000,depth:64});
const limits=PAGED_PROVIDER_STATE_LIMITS_V3,profile='ORIGINAL_PAGED_NATIVE_PROVIDER_COMPACT_DATA_V3',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Same canonical ordering/representation as crypto/privacy for old records,
 * with a Paged-specific bounded DATA budget rather than a larger generic grant. */
export function canonicalPagedProviderDataV3(value){
 let nodes=0,bytes=0;const active=new WeakSet();
 const text=s=>{bytes+=Buffer.byteLength(s);assert.ok(bytes<=limits.decodedBytes,'PAGED_PROVIDER_STATE_DECODED_BOUND');return s;};
 const visit=(v,depth)=>{
  assert.ok(++nodes<=limits.nodes&&depth<=limits.depth,'PAGED_PROVIDER_STATE_COMPLEXITY');
  if(v===null)return text('null');
  if(typeof v==='boolean')return text(String(v));
  if(typeof v==='number'){assert.ok(Number.isSafeInteger(v)&&!Object.is(v,-0),'PAGED_PROVIDER_STATE_NUMBER');return text(String(v));}
  if(typeof v==='string'){assert.ok(v.isWellFormed(),'PAGED_PROVIDER_STATE_STRING');return text(JSON.stringify(v));}
  assert.ok(v&&typeof v==='object'&&!types.isProxy(v)&&!active.has(v),'PAGED_PROVIDER_STATE_OBJECT');active.add(v);
  try{
   const d=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(d);assert.ok(keys.every(k=>typeof k==='string'),'PAGED_PROVIDER_STATE_KEYS');
   if(Array.isArray(v)){
    assert.equal(Object.getPrototypeOf(v),Array.prototype);assert.equal(keys.length,v.length+1,'PAGED_PROVIDER_STATE_DENSE_ARRAY');text('[]');
    return '['+Array.from({length:v.length},(_,i)=>{const p=d[String(i)];assert.ok(p&&Object.hasOwn(p,'value')&&p.enumerable,'PAGED_PROVIDER_STATE_DATA_PROPERTY');if(i)text(',');return visit(p.value,depth+1);}).join(',')+']';
   }
   assert.ok([Object.prototype,null].includes(Object.getPrototypeOf(v)),'PAGED_PROVIDER_STATE_PROTOTYPE');text('{}');
   return '{'+keys.sort().map((k,i)=>{const p=d[k];assert.ok(p.enumerable&&Object.hasOwn(p,'value'),'PAGED_PROVIDER_STATE_DATA_PROPERTY');assert.ok(k.isWellFormed(),'PAGED_PROVIDER_STATE_STRING');if(i)text(',');text(JSON.stringify(k)+':');return JSON.stringify(k)+':'+visit(p.value,depth+1);}).join(',')+'}';
  }finally{active.delete(v);}
 };return visit(value,0);
}
function encode(data){
 const serialized=canonicalPagedProviderDataV3(data),bytes=Buffer.from(serialized);let compressed;
 try{
  if(bytes.length<=limits.plainBytes)return JSON.parse(serialized);
  compressed=deflateRawSync(bytes,{level:6});assert.ok(compressed.length<=limits.compressedBytes,'PAGED_PROVIDER_STATE_COMPRESSED_BOUND');
  return {profile,encoding:'DEFLATE_RAW',length:bytes.length,sha256:sha(bytes),data:compressed.toString('base64')};
 }finally{bytes.fill(0);compressed?.fill(0);}
}
function decode(data){
 if(data?.profile!==profile)return data;
 assert.equal(Object.getPrototypeOf(data),Object.prototype);assert.deepEqual(Object.keys(data).sort(),['data','encoding','length','profile','sha256']);
 assert.equal(data.encoding,'DEFLATE_RAW');assert.ok(Number.isSafeInteger(data.length)&&data.length>limits.plainBytes&&data.length<=limits.decodedBytes,'PAGED_PROVIDER_STATE_DECODED_BOUND');assert.match(data.sha256,/^[0-9a-f]{64}$/);
 assert.ok(typeof data.data==='string'&&data.data.length<=4*Math.ceil(limits.compressedBytes/3),'PAGED_PROVIDER_STATE_COMPRESSED_BOUND');
 const compressed=Buffer.from(data.data,'base64');let bytes;
 try{
  assert.equal(compressed.toString('base64'),data.data,'PAGED_PROVIDER_STATE_BASE64');assert.ok(compressed.length<=limits.compressedBytes,'PAGED_PROVIDER_STATE_COMPRESSED_BOUND');
  const result=inflateRawSync(compressed,{maxOutputLength:limits.decodedBytes,info:true});bytes=result.buffer;assert.equal(result.engine.bytesWritten,compressed.length,'PAGED_PROVIDER_STATE_TRAILING_BYTES');
  assert.equal(bytes.length,data.length,'PAGED_PROVIDER_STATE_LENGTH');assert.equal(sha(bytes),data.sha256,'PAGED_PROVIDER_STATE_DIGEST');
  const decoded=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));assert.equal(canonicalPagedProviderDataV3(decoded),bytes.toString('utf8'),'PAGED_PROVIDER_STATE_CANONICAL');return decoded;
 }finally{compressed.fill(0);bytes?.fill(0);}
}
export function createPagedNativeProviderStateVaultV3(path){
 assert.equal(arguments.length,1);const vault=new Vault(path);
 const unwrap=record=>({revision:record.revision,data:decode(record.data)});
 return Object.freeze({path:vault.path,lockPath:vault.lockPath,
  async create(data,password){return unwrap(await vault.create(encode(data),password));},
  async read(password){return unwrap(await vault.read(password));},
  async update(password,revision,work){assert.equal(typeof work,'function');return unwrap(await vault.update(password,revision,data=>encode(work(decode(data)))));}
 });
}
