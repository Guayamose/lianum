/** Fixed private-file discipline shared by the SOURCE journal and recovery. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {lstat,realpath,open,rename,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
const MAX_RECORD=64*1024*1024;
/** @param {string} path */
export async function privateDirectory(path){const s=await lstat(path);assert.ok(process.getuid,'NATIVE_SOURCE_PRIVATE_DIRECTORY');assert.ok(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o777)===0o700&&await realpath(path)===path,'NATIVE_SOURCE_PRIVATE_DIRECTORY');}
/** @param {string} path */
export async function syncDirectory(path){const f=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await f.sync();}finally{await f.close();}}
/** @param {string} path @param {number} maximum */
export async function readPrivate(path,maximum){
 await privateDirectory(resolve(path,'..'));const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{const a=await f.stat();assert.ok(process.getuid,'NATIVE_SOURCE_PRIVATE_FILE');assert.ok(a.isFile()&&a.nlink===1&&a.uid===process.getuid()&&(a.mode&0o777)===0o600&&a.size>0&&a.size<=maximum,'NATIVE_SOURCE_PRIVATE_FILE');
  bytes=Buffer.alloc(a.size+1);let offset=0;while(offset<bytes.length){const n=(await f.read(bytes,offset,bytes.length-offset,offset)).bytesRead;if(!n)break;offset+=n;}
  const b=await f.stat(),named=await lstat(path);for(const k of /** @type {const} */ (['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs']))assert.ok(a[k]===b[k]&&a[k]===named[k],'NATIVE_SOURCE_FILE_CHANGED');
  assert.equal(named.isSymbolicLink(),false);assert.equal(offset,a.size,'NATIVE_SOURCE_FILE_BOUND');return Buffer.from(bytes.subarray(0,offset));
 }finally{bytes?.fill(0);await f.close();}
}
/** @param {string} path @param {Uint8Array} bytes */
export async function exclusive(path,bytes){const f=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}await syncDirectory(resolve(path,'..'));}
/** @param {string} path @param {Uint8Array} bytes */
export async function replace(path,bytes){const temporary=path+'.next-'+randomBytes(16).toString('hex');let published=false;
 try{await exclusive(temporary,bytes);await rename(temporary,path);published=true;await syncDirectory(resolve(path,'..'));const actual=await readPrivate(path,MAX_RECORD);try{assert.deepEqual(actual,bytes,'NATIVE_SOURCE_SNAPSHOT_READBACK');}finally{actual.fill(0);}}
 finally{if(!published)try{await unlink(temporary);}catch(e){if(!e||typeof e!=='object'||!('code'in e)||e.code!=='ENOENT')throw e;}}
}
