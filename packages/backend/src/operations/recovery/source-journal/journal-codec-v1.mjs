/** Bounded SOURCE journal codec. It owns no authority, tokens or mutable
 * registry. The lifecycle supplies its fixed identity and private-file guards. */
import assert from 'node:assert/strict';
import {randomBytes,createHash,createHmac,createCipheriv,createDecipheriv} from 'node:crypto';
import {join} from 'node:path';
import {types} from 'node:util';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {exactRecord} from '@lianum/components/encoding/commitments';
const MAX_RECORD=64*1024*1024,SCHEMA='ORIGINAL_NATIVE_SOURCE_CAPSULE_V1';
/** @param {Uint8Array} bytes */
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
/** @param {unknown} value @returns {value is string} */
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.exec(value)?.[0]===value;
/** @typedef {{directory:string,[key:string]:unknown}} JournalIdentity */
/** @typedef {{revision:number,data:unknown}} JournalRecord */
/** @typedef {{schema:string,encoding:string,path:string,revision:number,bytes:number,sha256:string,
 * clearBytes:number,clearSHA256:string,packedBytes:number}} BodyIndex */
/** @typedef {{canonical(value:unknown):string,
 * validateIdentity:(value:unknown)=>asserts value is JournalIdentity,
 * readPrivate(path:string,maxBytes:number):Promise<Buffer>,replace(path:string,bytes:Buffer):Promise<void>}} JournalStorage */
/** @param {JournalStorage} storage */
export function createNativeSourceJournalCodecV1(storage){
 assert.equal(arguments.length,1);exactRecord(storage,['canonical','validateIdentity','readPrivate','replace']);
 const {canonical,readPrivate,replace}=storage;
 /** @type {JournalStorage['validateIdentity']} */
 const validateIdentity=storage.validateIdentity;
 for(const method of [canonical,validateIdentity,readPrivate,replace])assert.equal(typeof method,'function');
// Deployment sections contain all original contracts. Keep the generic Vault
// limits intact and encode only this private SOURCE journal losslessly.
const JOURNAL_CODEC='ORIGINAL_NATIVE_SOURCE_PRIVATE_JOURNAL_CODEC_V1';
/** @param {unknown} value @returns {string} */
function sourceJSON(value){
 let nodes=0,bytes=0;const ancestors=new Set();
 /** @param {string} text */
 const account=text=>{bytes+=Buffer.byteLength(text);assert.ok(bytes<=MAX_RECORD,'NATIVE_SOURCE_JOURNAL_CLEAR_CAPACITY');return text;};
 /** @param {unknown} item @param {number} depth @returns {string} */
 const visit=(item,depth)=>{assert.ok(++nodes<=100000&&depth<=64,'NATIVE_SOURCE_JOURNAL_COMPLEXITY');
  if(item===null||typeof item!=='object')return account(canonical(item));
  assert.ok(!types.isProxy(item)&&!ancestors.has(item),'NATIVE_SOURCE_JOURNAL_DATA');ancestors.add(item);
  try{const descriptors=Object.getOwnPropertyDescriptors(item),keys=Reflect.ownKeys(descriptors);assert.ok(keys.every(k=>typeof k==='string'),'NATIVE_SOURCE_JOURNAL_DATA');
   if(Array.isArray(item)){assert.ok(Object.getPrototypeOf(item)===Array.prototype&&item.length<=100000&&keys.length===item.length+1,'NATIVE_SOURCE_JOURNAL_DATA');account('[]');const parts=[];
    for(let i=0;i<item.length;i++){const d=descriptors[String(i)];assert.ok(d&&Object.hasOwn(d,'value')&&d.enumerable,'NATIVE_SOURCE_JOURNAL_DATA');if(i)account(',');parts.push(visit(d.value,depth+1));}return '['+parts.join(',')+']';}
   assert.ok(Object.getPrototypeOf(item)===Object.prototype||Object.getPrototypeOf(item)===null,'NATIVE_SOURCE_JOURNAL_DATA');account('{}');const parts=[];
   for(const k of keys.sort()){assert.ok(typeof k==='string','NATIVE_SOURCE_JOURNAL_DATA');const d=descriptors[k];assert.ok(d.enumerable&&Object.hasOwn(d,'value'),'NATIVE_SOURCE_JOURNAL_DATA');if(parts.length)account(',');const name=account(canonical(k)+':');parts.push(name+visit(d.value,depth+1));}return '{'+parts.join(',')+'}';
  }finally{ancestors.delete(item);}
 };return visit(value,0);
}
/** @param {unknown} value @returns {unknown} */
const dataCopy=value=>JSON.parse(sourceJSON(value));
// Only the small confirmed index is stored in the generic Vault. The body
// stays under the original private SOURCE bound, in two fixed AEAD slots.
const JOURNAL_BODY='ORIGINAL_NATIVE_SOURCE_PRIVATE_JOURNAL_BODY_V1';
const JOURNAL_BODY_MAGIC=Buffer.from('LIANUM_NATIVE_SOURCE_JOURNAL_BODY_V1\0');
const JOURNAL_BODY_OVERHEAD=JOURNAL_BODY_MAGIC.length+12+16;
/** @param {unknown} password */
function journalBodyKey(password){assert.ok(hex(password),'NATIVE_SOURCE_JOURNAL_ORIGINAL_KEY');const secret=Buffer.from(password,'hex');
 try{return createHmac('sha256',secret).update('LIANUM_NATIVE_SOURCE_JOURNAL_BODY_V1').digest();}finally{secret.fill(0);}}
/** @param {JournalIdentity} identity @param {Omit<BodyIndex,'sha256'>} index */
function journalBodyAAD(identity,index){const {schema,encoding,path,revision,bytes,clearBytes,clearSHA256,packedBytes}=index;
 return Buffer.from(canonical({identity,schema,encoding,path,revision,bytes,clearBytes,clearSHA256,packedBytes}));}
/** @param {unknown} index @param {number} revision @returns {asserts index is BodyIndex} */
function validateJournalBodyIndex(index,revision){exactRecord(index,['schema','encoding','path','revision','bytes','sha256','clearBytes','clearSHA256','packedBytes']);
 assert.ok(index.schema===JOURNAL_BODY&&index.encoding==='DEFLATE_RAW'&&typeof index.path==='string'&&['source-body-0.aead','source-body-1.aead'].includes(index.path),'NATIVE_SOURCE_JOURNAL_BODY_INDEX');
 assert.ok(typeof index.revision==='number'&&Number.isSafeInteger(index.revision)&&index.revision>=0&&index.revision===revision,'NATIVE_SOURCE_JOURNAL_BODY_REVISION');
 assert.ok(typeof index.bytes==='number'&&Number.isSafeInteger(index.bytes)&&index.bytes>JOURNAL_BODY_OVERHEAD&&index.bytes<=MAX_RECORD&&hex(index.sha256)&&typeof index.clearBytes==='number'&&Number.isSafeInteger(index.clearBytes)&&index.clearBytes>0&&index.clearBytes<=MAX_RECORD&&hex(index.clearSHA256)&&typeof index.packedBytes==='number'&&Number.isSafeInteger(index.packedBytes)&&index.packedBytes===index.bytes-JOURNAL_BODY_OVERHEAD,'NATIVE_SOURCE_JOURNAL_BODY_BOUND');canonical(index);}
/** @param {unknown} data @returns {unknown} */
function decodeJournal(data){if(data&&typeof data==='object'&&'schema' in data&&data.schema===SCHEMA)return data;exactRecord(data,['schema','encoding','clearBytes','clearSHA256','packed']);
 assert.ok(data.schema===JOURNAL_CODEC&&data.encoding==='DEFLATE_RAW'&&typeof data.clearBytes==='number'&&Number.isSafeInteger(data.clearBytes)&&data.clearBytes>0&&data.clearBytes<=MAX_RECORD&&hex(data.clearSHA256)&&typeof data.packed==='string'&&data.packed.length<=1024*1024,'NATIVE_SOURCE_JOURNAL_CODEC');
 const packed=Buffer.from(data.packed,'base64');let clear;try{assert.equal(packed.toString('base64'),data.packed,'NATIVE_SOURCE_JOURNAL_CODEC');clear=inflateRawSync(packed,{maxOutputLength:data.clearBytes});assert.ok(clear.length===data.clearBytes&&hash(clear)===data.clearSHA256,'NATIVE_SOURCE_JOURNAL_CLEAR_PIN');
  const value=JSON.parse(clear.toString('utf8'));assert.equal(sourceJSON(value),clear.toString('utf8'),'NATIVE_SOURCE_JOURNAL_CANONICAL');return value;
 }finally{packed.fill(0);clear?.fill(0);}}
/** @param {JournalRecord} record @param {unknown} identity @param {unknown} password */
async function decodeRecord(record,identity,password){if(!record.data||typeof record.data!=='object'||!('schema' in record.data)||record.data.schema!==JOURNAL_BODY)return {...record,data:decodeJournal(record.data)};
 validateIdentity(identity);const index=record.data;validateJournalBodyIndex(index,record.revision);const bytes=await readPrivate(join(identity.directory,index.path),MAX_RECORD);let key,packed,clear;
 try{assert.equal(bytes.length,index.bytes,'NATIVE_SOURCE_JOURNAL_BODY_BYTES');assert.equal(hash(bytes),index.sha256,'NATIVE_SOURCE_JOURNAL_BODY_BYTES');
  assert.ok(bytes.subarray(0,JOURNAL_BODY_MAGIC.length).equals(JOURNAL_BODY_MAGIC),'NATIVE_SOURCE_JOURNAL_BODY_FRAME');key=journalBodyKey(password);
  const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(JOURNAL_BODY_MAGIC.length,JOURNAL_BODY_MAGIC.length+12));decipher.setAAD(journalBodyAAD(identity,index));decipher.setAuthTag(bytes.subarray(JOURNAL_BODY_MAGIC.length+12,JOURNAL_BODY_OVERHEAD));
  packed=Buffer.concat([decipher.update(bytes.subarray(JOURNAL_BODY_OVERHEAD)),decipher.final()]);assert.equal(packed.length,index.packedBytes,'NATIVE_SOURCE_JOURNAL_BODY_BOUND');
  clear=inflateRawSync(packed,{maxOutputLength:index.clearBytes});assert.ok(clear.length===index.clearBytes&&hash(clear)===index.clearSHA256,'NATIVE_SOURCE_JOURNAL_CLEAR_PIN');
  const value=JSON.parse(clear.toString('utf8'));assert.equal(sourceJSON(value),clear.toString('utf8'),'NATIVE_SOURCE_JOURNAL_CANONICAL');assert.deepEqual(value.identity,identity,'NATIVE_SOURCE_JOURNAL_BODY_IDENTITY');return {...record,data:value};
 }finally{bytes.fill(0);key?.fill(0);packed?.fill(0);clear?.fill(0);}}
/** @param {{read(password:string):Promise<JournalRecord>}} vault @param {string} password @param {unknown} identity */
const readJournal=async(vault,password,identity)=>decodeRecord(await vault.read(password),identity,password);
/** @param {unknown} data @param {unknown} identity @param {unknown} password @param {number} revision @param {unknown} previous */
async function encodeJournal(data,identity,password,revision,previous){validateIdentity(identity);const clear=Buffer.from(sourceJSON(data));let packed,key,iv,ciphertext,bytes;
 try{assert.ok(data&&typeof data==='object'&&'identity' in data,'NATIVE_SOURCE_JOURNAL_BODY_IDENTITY');assert.deepEqual(data.identity,identity,'NATIVE_SOURCE_JOURNAL_BODY_IDENTITY');packed=deflateRawSync(clear);assert.ok(packed.length>0&&packed.length<=MAX_RECORD-JOURNAL_BODY_OVERHEAD,'NATIVE_SOURCE_JOURNAL_BODY_BOUND');
  const path=previous&&typeof previous==='object'&&'schema' in previous&&previous.schema===JOURNAL_BODY&&'path' in previous&&previous.path==='source-body-0.aead'?'source-body-1.aead':'source-body-0.aead';
  const index={schema:JOURNAL_BODY,encoding:'DEFLATE_RAW',path,revision,bytes:packed.length+JOURNAL_BODY_OVERHEAD,sha256:'',clearBytes:clear.length,clearSHA256:hash(clear),packedBytes:packed.length};
  key=journalBodyKey(password);iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(journalBodyAAD(identity,index));ciphertext=Buffer.concat([cipher.update(packed),cipher.final()]);bytes=Buffer.concat([JOURNAL_BODY_MAGIC,iv,cipher.getAuthTag(),ciphertext]);index.sha256=hash(bytes);validateJournalBodyIndex(index,revision);
  await replace(join(identity.directory,path),bytes);const prepared=await decodeRecord({revision,data:index},identity,password);assert.deepEqual(prepared.data,data,'NATIVE_SOURCE_JOURNAL_BODY_READBACK');return index;
 }finally{clear.fill(0);packed?.fill(0);key?.fill(0);iv?.fill(0);ciphertext?.fill(0);bytes?.fill(0);}}
return Object.freeze({sourceJSON,dataCopy,decodeRecord,readJournal,encodeJournal});
}
