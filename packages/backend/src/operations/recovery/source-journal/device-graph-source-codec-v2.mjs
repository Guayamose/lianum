/** AEAD framing for the original fixed GRAPH SOURCE journal. This codec
 * owns no capability and cannot create, reopen, or admit any SOURCE activity. */
import assert from 'node:assert/strict';
import {createHash,createHmac,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {exactRecord} from '@lianum/components/encoding/commitments';
const MAX=64*1024*1024,MAGIC=Buffer.from('LIANUM_DEVICE_GRAPH_SOURCE_V2\0'),OVERHEAD=MAGIC.length+28;
/** @param {Uint8Array} bytes */
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** @template T @param {T} value @returns {T} */
const clone=value=>structuredClone(value);
/** @param {unknown} value @returns {value is string} */
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
/** @typedef {{schema:string,path:string,generation:number,bytes:number,sha256:string,clearSHA256:string,head:unknown}} BodyPin */
/** @typedef {{identity:unknown,pairing?:unknown,runtime:{state:{head:unknown,[key:string]:unknown},[key:string]:unknown},[key:string]:unknown}} SourceBody */
/** @typedef {{password:string,profile:string,identity:unknown,protocol:string,version:2|3,pairing:unknown,directory:string,record:{data:{generation:number,confirmed:BodyPin|null}}}} SourceContext */
/** @typedef {{read:(path:string,max:number)=>Promise<Buffer>,canonical:(value:unknown)=>string}} BodyReader */
/** @param {unknown} value @returns {asserts value is Record<string,unknown>} */
function record(value){assert.ok(value!==null&&typeof value==='object'&&!Array.isArray(value));}
/** @param {unknown} value @returns {asserts value is SourceBody} */
function assertBody(value){record(value);record(value.runtime);record(value.runtime.state);assert.ok(Object.hasOwn(value,'identity')&&Object.hasOwn(value.runtime.state,'head'));}
/** @param {unknown} value @returns {asserts value is BodyPin} */
function assertPin(value){record(value);assert.ok(typeof value.schema==='string'&&typeof value.path==='string'&&typeof value.generation==='number'&&Number.isSafeInteger(value.generation)&&typeof value.bytes==='number'&&Number.isSafeInteger(value.bytes)&&typeof value.sha256==='string'&&typeof value.clearSHA256==='string'&&Object.hasOwn(value,'head'));}
/** @param {SourceContext} s */
function key(s){const raw=Buffer.from(s.password,'hex');try{return createHmac('sha256',raw).update(s.profile).digest();}finally{raw.fill(0);}}
/** @param {SourceContext} s @param {BodyPin} pin @param {(value:unknown)=>string} canonical */
function aad(s,pin,canonical){const {schema,path,generation,bytes,clearSHA256,head}=pin;return Buffer.from(canonical({identity:s.identity,protocol:s.protocol,...(s.version===3?{pairing:s.pairing}:{}),schema,path,generation,bytes,clearSHA256,head}));}
/** @param {SourceContext} s @param {unknown} pin @param {BodyReader} ports @returns {Promise<SourceBody>} */
export async function readDeviceGraphSourceBodyV2(s,pin,{read,canonical}){assertPin(pin);exactRecord(pin,['schema','path','generation','bytes','sha256','clearSHA256','head']);assert.ok(pin.schema===s.profile&&pin.generation===s.record.data.generation&&['source-0.aead','source-1.aead'].includes(pin.path)&&Number.isSafeInteger(pin.bytes)&&pin.bytes>OVERHEAD&&pin.bytes<=MAX&&hex(pin.sha256)&&hex(pin.clearSHA256));const bytes=await read(join(s.directory,pin.path),MAX);let k,partial,clear;try{assert.ok(bytes.length===pin.bytes&&sha(bytes)===pin.sha256&&bytes.subarray(0,MAGIC.length).equals(MAGIC),'DEVICE_GRAPH_SOURCE_BODY_PIN');k=key(s);const d=createDecipheriv('aes-256-gcm',k,bytes.subarray(MAGIC.length,MAGIC.length+12));d.setAAD(aad(s,pin,canonical));d.setAuthTag(bytes.subarray(MAGIC.length+12,OVERHEAD));partial=d.update(bytes.subarray(OVERHEAD));clear=Buffer.concat([partial,d.final()]);assert.equal(sha(clear),pin.clearSHA256);const value=JSON.parse(clear.toString());assertBody(value);assert.deepEqual(value.identity,s.identity);if(s.version===3)assert.deepEqual(value.pairing,s.pairing,'DEVICE_GRAPH_SOURCE_PAIRED_BINDING');assert.deepEqual(value.runtime.state.head,pin.head);return value;}finally{bytes.fill(0);k?.fill(0);partial?.fill(0);clear?.fill(0);}}
/** @param {SourceContext} s @param {SourceBody} value @param {BodyReader & {replace:(path:string,bytes:Buffer)=>Promise<unknown>}} ports @returns {Promise<BodyPin>} */
export async function publishDeviceGraphSourceBodyV2(s,value,{read,replace,canonical}){assertBody(value);const clear=Buffer.from(JSON.stringify(value));let k,iv,encrypted,bytes;try{assert.ok(clear.length>0&&clear.length<=MAX-OVERHEAD,'DEVICE_GRAPH_SOURCE_CLEAR_BOUND');const previous=s.record.data.confirmed,path=previous?.path==='source-0.aead'?'source-1.aead':'source-0.aead',pin={schema:s.profile,path,generation:s.record.data.generation,bytes:clear.length+OVERHEAD,sha256:'',clearSHA256:sha(clear),head:clone(value.runtime.state.head)};k=key(s);iv=randomBytes(12);const c=createCipheriv('aes-256-gcm',k,iv);c.setAAD(aad(s,pin,canonical));encrypted=Buffer.concat([c.update(clear),c.final()]);bytes=Buffer.concat([MAGIC,iv,c.getAuthTag(),encrypted]);pin.sha256=sha(bytes);await replace(join(s.directory,path),bytes);assert.deepEqual(await readDeviceGraphSourceBodyV2(s,pin,{read,canonical}),value,'DEVICE_GRAPH_SOURCE_BODY_READBACK');return pin;}finally{clear.fill(0);k?.fill(0);iv?.fill(0);encrypted?.fill(0);bytes?.fill(0);}}
