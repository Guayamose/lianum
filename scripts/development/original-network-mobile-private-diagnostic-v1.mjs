/** Private fixed CLI first error, before original cleanup. No error message,
 * payload, owner/root/native wire or raw stack is stored or printed. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {privateOwnedNetworkMobileFirstErrorV1} from '../../tests/integration/wallet/native/native-device-economic-private-error-v1.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const PARSER={path:"tests/integration/wallet/native/native-device-economic-private-error-v1.mjs",sha256:"5059190aa698d6bfcabcdb0511d23bb88e33006dcdf74413e8a7cfa7346aca84",bytes:37856};
const NETWORKS=Object.freeze({"BSC714":{"entry":"apps/platform/src/run-original-bsc-private-native-mobile-v3.mjs","directory":".local/original-bsc714-mobile-v3"},"ARB42161":{"entry":"apps/platform/src/run-original-arbitrum-private-native-mobile-v1.mjs","directory":".local/original-arbitrum-mobile-v1"},"BASE8453":{"entry":"apps/platform/src/run-original-base-private-native-mobile-v1.mjs","directory":".local/original-base-mobile-v1"},"TRON":{"entry":"apps/platform/src/run-original-tron-private-native-mobile-v1.mjs","directory":".local/original-tron-mobile-v1"}});
const FIELDS=['dev','ino','uid','gid','mode','nlink','size','mtimeMs','ctimeMs'];
let first=false;
async function assertParser() {
 const path=join(root,PARSER.path);assert.equal(await realpath(path),path,'NATIVE_ECONOMIC_DIAGNOSTIC_SOURCE');
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try {const before=await fd.stat();assert(before.isFile()&&before.nlink===1&&before.uid===process.getuid()
   &&(before.mode&0o777)===0o644&&before.size===PARSER.bytes,'NATIVE_ECONOMIC_DIAGNOSTIC_SOURCE');
  bytes=Buffer.alloc(PARSER.bytes+1);let count=0;while(count<bytes.length){const row=await fd.read(bytes,count,bytes.length-count,count);if(!row.bytesRead)break;count+=row.bytesRead;}
  assert.equal(count,PARSER.bytes);assert.equal(createHash('sha256').update(bytes.subarray(0,count)).digest('hex'),PARSER.sha256,'NATIVE_ECONOMIC_DIAGNOSTIC_SOURCE');
  for(const after of[await fd.stat(),await lstat(path)])for(const field of FIELDS)assert.equal(after[field],before[field],'NATIVE_ECONOMIC_DIAGNOSTIC_SOURCE');
 }finally{bytes?.fill(0);await fd.close();}
}
export async function retainOriginalNetworkMobileFirstErrorV1(network,error) {
 assert.equal(arguments.length,2,'NATIVE_ECONOMIC_FIRST_ERROR_ARITY');
 const selected=typeof network==='string'&&Object.hasOwn(NETWORKS,network)?NETWORKS[network]:null;
 assert(selected&&!first,'NATIVE_ECONOMIC_FIXED_FIRST_ERROR');first=true;
 assert.equal(process.execPath,join(root,'.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'),'NATIVE_ECONOMIC_FIXED_DIAGNOSTIC_PROCESS');
 assert.deepEqual(process.argv,[process.execPath,join(root,selected.entry)],'NATIVE_ECONOMIC_FIXED_DIAGNOSTIC_PROCESS');
 assert.deepEqual(process.execArgv,['--max-old-space-size=384'],'NATIVE_ECONOMIC_FIXED_DIAGNOSTIC_PROCESS');
 assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
 await assertParser();const directory=join(root,selected.directory),before=await lstat(directory);
 assert(before.isDirectory()&&!before.isSymbolicLink()&&before.uid===process.getuid()&&(before.mode&0o777)===0o700
  &&await realpath(directory)===directory,'NATIVE_ECONOMIC_DIAGNOSTIC_DIRECTORY');
 const parent=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 let fd,bytes;try {
  for(const field of ['dev','ino','uid','gid','mode'])assert.equal((await parent.stat())[field],before[field],'NATIVE_ECONOMIC_DIAGNOSTIC_DIRECTORY');
  const value=privateOwnedNetworkMobileFirstErrorV1(error,network);bytes=Buffer.from(JSON.stringify(value)+'\n');
  assert(bytes.length<=65536,'NATIVE_ECONOMIC_DIAGNOSTIC_BOUND');
  const path=join(directory,'first-error-private-'+randomUUID()+'.json');
  fd=await open(path,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  await fd.writeFile(bytes);await fd.sync();await parent.sync();
  const file=await fd.stat();assert(file.isFile()&&file.nlink===1&&file.uid===process.getuid()&&(file.mode&0o777)===0o600&&file.size===bytes.length,'NATIVE_ECONOMIC_DIAGNOSTIC_FILE');
  const readback=Buffer.alloc(bytes.length+1);try {let count=0;while(count<readback.length){const row=await fd.read(readback,count,readback.length-count,count);if(!row.bytesRead)break;count+=row.bytesRead;}
   assert.equal(count,bytes.length);assert.deepEqual(readback.subarray(0,count),bytes,'NATIVE_ECONOMIC_DIAGNOSTIC_READBACK');
  }finally{readback.fill(0);}
  for(const after of[await fd.stat(),await lstat(path)])for(const field of FIELDS)assert.equal(after[field],file[field],'NATIVE_ECONOMIC_DIAGNOSTIC_FILE');
  for(const after of[await parent.stat(),await lstat(directory)])for(const field of ['dev','ino','uid','gid','mode'])assert.equal(after[field],before[field],'NATIVE_ECONOMIC_DIAGNOSTIC_DIRECTORY');
  assert.equal(await realpath(directory),directory,'NATIVE_ECONOMIC_DIAGNOSTIC_DIRECTORY');
  return Object.freeze({retained:true,privateOnly:true});
 }finally{bytes?.fill(0);try{await fd?.close();}finally{await parent.close();}}
}
