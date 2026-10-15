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
const PARSER=Object.freeze({"path":"tests/integration/wallet/native/native-device-economic-private-error-v1.mjs","bytes":37923,"sha256":"5c61007e0f31dbd1aed361b97e0f575e3c1f6dbc253d58088da4ab977eebb513"});
const NETWORKS=Object.freeze({"BSC714":{"entry":"scripts/development/profiles/run-original-bsc-private-native-mobile-v3.mjs","directory":".local/original-bsc714-mobile-v3"},"ARB42161":{"entry":"scripts/development/profiles/run-original-arbitrum-private-native-mobile-v1.mjs","directory":".local/original-arbitrum-mobile-v1"},"BASE8453":{"entry":"scripts/development/profiles/run-original-base-private-native-mobile-v1.mjs","directory":".local/original-base-mobile-v1"},"TRON":{"entry":"scripts/development/profiles/run-original-tron-private-native-mobile-v1.mjs","directory":".local/original-tron-mobile-v1"}});
const FIELDS=['dev','ino','uid','gid','mode','nlink','size','mtimeMs','ctimeMs'];
let first=false,closeFirst=false,firstDurable=false;
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
async function retainOriginalNetworkMobileErrorV1(network,error,cleanup) {
 const selected=typeof network==='string'&&Object.hasOwn(NETWORKS,network)?NETWORKS[network]:null;
 assert(selected&&!(cleanup?closeFirst:first),'NATIVE_ECONOMIC_FIXED_FIRST_ERROR');if(cleanup)closeFirst=true;else first=true;
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
  const original=privateOwnedNetworkMobileFirstErrorV1(error,network),value=cleanup?{schema:'ORIGINAL_NETWORK_MOBILE_CLOSE_ERROR_PRIVATE_V1',network,diagnostic:original.diagnostic}:original;bytes=Buffer.from(JSON.stringify(value)+'\n');
  assert(bytes.length<=65536,'NATIVE_ECONOMIC_DIAGNOSTIC_BOUND');
  const path=join(directory,(cleanup?'close-error-private-':'first-error-private-')+randomUUID()+'.json');
  fd=await open(path,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  await fd.writeFile(bytes);await fd.sync();await parent.sync();
  const file=await fd.stat();assert(file.isFile()&&file.nlink===1&&file.uid===process.getuid()&&(file.mode&0o777)===0o600&&file.size===bytes.length,'NATIVE_ECONOMIC_DIAGNOSTIC_FILE');
  const readback=Buffer.alloc(bytes.length+1);try {let count=0;while(count<readback.length){const row=await fd.read(readback,count,readback.length-count,count);if(!row.bytesRead)break;count+=row.bytesRead;}
   assert.equal(count,bytes.length);assert.deepEqual(readback.subarray(0,count),bytes,'NATIVE_ECONOMIC_DIAGNOSTIC_READBACK');
  }finally{readback.fill(0);}
  for(const after of[await fd.stat(),await lstat(path)])for(const field of FIELDS)assert.equal(after[field],file[field],'NATIVE_ECONOMIC_DIAGNOSTIC_FILE');
  for(const after of[await parent.stat(),await lstat(directory)])for(const field of ['dev','ino','uid','gid','mode'])assert.equal(after[field],before[field],'NATIVE_ECONOMIC_DIAGNOSTIC_DIRECTORY');
  assert.equal(await realpath(directory),directory,'NATIVE_ECONOMIC_DIAGNOSTIC_DIRECTORY');
  if(!cleanup)firstDurable=true;
  return Object.freeze({retained:true,privateOnly:true});
 }finally{bytes?.fill(0);try{await fd?.close();}finally{await parent.close();}}
}

export async function retainOriginalNetworkMobileFirstErrorV1(network,error) {
 assert.equal(arguments.length,2,'NATIVE_ECONOMIC_FIRST_ERROR_ARITY');return retainOriginalNetworkMobileErrorV1(network,error,false);
}
export async function retainOriginalNetworkMobileCloseErrorV1(network,error) {
 assert.equal(arguments.length,2,'NATIVE_ECONOMIC_FIRST_ERROR_ARITY');return retainOriginalNetworkMobileErrorV1(network,error,true);
}

/** Private diagnostic completion only; not a runtime or cleanup capability. */
export function originalNetworkMobileFirstErrorRetainedV1() {
 assert.equal(arguments.length,0,'NATIVE_ECONOMIC_FIRST_ERROR_ARITY');return firstDurable;
}
