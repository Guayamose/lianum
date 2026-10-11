// @ts-check
/** Streaming content identity with same-file change detection; never grants authority. */
import assert from 'node:assert/strict';
import {openSync,readSync,closeSync,fstatSync} from 'node:fs';
import {createHash} from 'node:crypto';

/**
 * @param {import('node:fs').PathLike} path
 * @param {{sha256:string,bytes?:number}} [expected]
 * @returns {{bytes:number,sha256:string}}
 */
export function filePin(path,expected){
 const fd=openSync(path,'r'),buffer=Buffer.alloc(64*1024);
 try{
  const before=fstatSync(fd,{bigint:true}),hash=createHash('sha256');
  assert.ok(before.isFile());
  let bytes=0,count;
  while((count=readSync(fd,buffer,0,buffer.length,null))>0){
   bytes+=count;hash.update(buffer.subarray(0,count));
  }
  const after=fstatSync(fd,{bigint:true});
  assert.equal(before.size,after.size,'PC23_FILE_CHANGED');
  assert.equal(before.mtimeNs,after.mtimeNs,'PC23_FILE_CHANGED');
  const result={bytes,sha256:hash.digest('hex')};
  assert.equal(BigInt(bytes),before.size);
  if(expected){
   assert.equal(result.sha256,expected.sha256,'PC23_FILE_HASH');
   if(expected.bytes!==undefined)assert.equal(bytes,expected.bytes,'PC23_FILE_SIZE');
  }
  return result;
 }finally{buffer.fill(0);closeSync(fd);}
}
