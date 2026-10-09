import {decodeOwnedExternalDefiStateV3} from './owned-external-defi-receiver-state-v3.mjs';
/** Private file transport for an unchanged original Anvil recovery snapshot.
 * It changes neither server request limits nor chain data. The captured gzip
 * remains intact; the CLI receives its exact decoded JSON bytes in a0600 file.
 */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const MAX_CAPTURE_HEX=32*1024*1024,MAX_JSON=128*1024*1024,INLINE_HEX=1024*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function capturedBytes(value){
 assert.ok(typeof value==='string'&&value.length>2&&value.length<=MAX_CAPTURE_HEX
   &&/^0x(?:[0-9a-f]{2})+$/.test(value),'EVM_RECOVERY_ORIGINAL_DUMP_ENCODING');
 return Buffer.from(value.slice(2),'hex');
}
export function shouldUseOwnedEvmStateFileV1(value){
 assert.ok(typeof value==='string'&&value.length<=MAX_CAPTURE_HEX,'EVM_RECOVERY_ORIGINAL_DUMP_BOUND');
 return value.length>INLINE_HEX;
}
export function decodeOwnedEvmStateFileV1(value){
 const original=capturedBytes(value);
 const decoded=original[0]===0x1f&&original[1]===0x8b
   ?gunzipSync(original,{maxOutputLength:MAX_JSON}):original;
 assert.ok(decoded.length>0&&decoded.length<=MAX_JSON,'EVM_RECOVERY_DECODED_STATE_BOUND');
 const state=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));
 assert.ok(state&&typeof state==='object'&&!Array.isArray(state),'EVM_RECOVERY_STATE_JSON_OBJECT');
 assert.deepEqual(Object.keys(state).sort(),['accounts','best_block_number','block','blocks','historical_states','transactions']);
 assert.ok(state.block&&typeof state.block==='object'&&!Array.isArray(state.block));
 assert.ok(state.accounts&&typeof state.accounts==='object'&&!Array.isArray(state.accounts));
 assert.ok(Array.isArray(state.blocks)&&Array.isArray(state.transactions)&&Array.isArray(state.historical_states));
 assert.ok(Number.isSafeInteger(state.best_block_number)&&state.best_block_number>=0,'EVM_RECOVERY_STATE_HEIGHT');
 // Return the original decoded bytes, never JSON.stringify(state): numeric
 // encodings, account data, receipts and historical snapshots stay unchanged.
 return {bytes:decoded,originalSHA256:sha(original),sha256:sha(decoded)};
}
export async function assertOwnedEvmStateFileV1(pin){
 assert.deepEqual(Object.keys(pin).sort(),['bytes','originalSHA256','path','sha256']);
 const before=await lstat(pin.path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1);
 assert.equal(before.mode&0o777,0o600);assert.equal(before.size,pin.bytes);
 const file=await open(pin.path,constants.O_RDONLY|constants.O_NOFOLLOW),hash=createHash('sha256');
 let length=0;
 try{
  const actual=await file.stat();for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(actual[key],before[key]);
  const buffer=Buffer.alloc(256*1024);
  for(;;){const {bytesRead}=await file.read(buffer,0,buffer.length,null);if(!bytesRead)break;length+=bytesRead;assert.ok(length<=MAX_JSON);hash.update(buffer.subarray(0,bytesRead));}
  const after=await file.stat();for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(after[key],before[key]);
 }finally{await file.close();}
 const named=await lstat(pin.path);assert.ok(named.isFile()&&!named.isSymbolicLink()&&named.nlink===1);assert.equal(named.mode&0o777,0o600);
 for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(named[key],before[key],'EVM_RECOVERY_PRIVATE_STATE_PATH_CHANGED');
 assert.equal(length,pin.bytes);assert.equal(hash.digest('hex'),pin.sha256,'EVM_RECOVERY_PRIVATE_STATE_CHANGED');
}
export async function writeOwnedEvmStateFileV1(input){return writeDecodedStateFile(input,decodeOwnedEvmStateFileV1);}
export async function writeOwnedExternalDefiStateFileV3(input){return writeDecodedStateFile(input,decodeOwnedExternalDefiStateV3);}
async function writeDecodedStateFile({cwd,suffix,stateDump},decode){
 assert.ok(typeof suffix==='string'&&/^[1-9][0-9]?(?:-repair-[1-9][0-9]?)?$/.test(suffix),'EVM_RECOVERY_FILE_GENERATION');
 assert.equal(await realpath(cwd),cwd);const directory=await lstat(cwd);
 assert.ok(directory.isDirectory()&&!directory.isSymbolicLink()&&(directory.mode&0o777)===0o700,'EVM_RECOVERY_PRIVATE_STATE_DIRECTORY');
 const decoded=decode(stateDump),path=join(cwd,'reopen-state-'+suffix+'.json');
 const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await file.writeFile(decoded.bytes);await file.sync();}finally{await file.close();}
 const parent=await open(cwd,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{const actual=await parent.stat();assert.equal(actual.dev,directory.dev);assert.equal(actual.ino,directory.ino);await parent.sync();}finally{await parent.close();}
 const pin=Object.freeze({path,bytes:decoded.bytes.length,sha256:decoded.sha256,originalSHA256:decoded.originalSHA256});
 await assertOwnedEvmStateFileV1(pin);return pin;
}
