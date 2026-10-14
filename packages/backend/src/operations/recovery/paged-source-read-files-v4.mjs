/** Bounded protected reads. Locators and returned DATA do not issue authority. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
export async function assertPagedSourceReadDirectoryV4(path){
 assert.ok(typeof path==='string'&&path===resolve(path)&&path.length<4096&&!path.includes('\0'),'PAGED_SOURCE_READ_DIRECTORY');const stat=await lstat(path);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()&&(stat.mode&0o777)===0o700&&await realpath(path)===path,'PAGED_SOURCE_READ_PRIVATE_DIRECTORY');
}
export async function readPagedSourcePrivateBytesV4(path,maximum){
 await assertPagedSourceReadDirectoryV4(dirname(path));const before=await lstat(path,{bigint:true});assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.uid===BigInt(process.getuid())&&(before.mode&0o777n)===0o600n&&before.size>0n&&before.size<=BigInt(maximum),'PAGED_SOURCE_READ_PRIVATE_FILE');const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{const held=await file.stat({bigint:true});for(const key of ['dev','ino','uid','mode','nlink','size','mtimeNs','ctimeNs'])assert.equal(held[key],before[key],'PAGED_SOURCE_READ_FILE_CHANGED');bytes=await file.readFile();const after=await lstat(path,{bigint:true}),end=await file.stat({bigint:true});for(const key of ['dev','ino','uid','mode','nlink','size','mtimeNs','ctimeNs']){assert.equal(after[key],before[key],'PAGED_SOURCE_READ_FILE_CHANGED');assert.equal(end[key],before[key],'PAGED_SOURCE_READ_FILE_CHANGED');}assert.equal(bytes.length,Number(before.size));return bytes;}catch(error){bytes?.fill(0);throw error;}finally{await file.close();}
}
export async function readPagedSourcePrivateJSONV4(path,maximum){const bytes=await readPagedSourcePrivateBytesV4(path,maximum);try{return{data:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),sha256:createHash('sha256').update(bytes).digest('hex')};}finally{bytes.fill(0);}}
export async function hashPagedSourcePrivateFileV4(path,maximum){const bytes=await readPagedSourcePrivateBytesV4(path,maximum);try{return createHash('sha256').update(bytes).digest('hex');}finally{bytes.fill(0);}}
