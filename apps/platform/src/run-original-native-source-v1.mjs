/** Fixed original SOURCE create/open entry. Only operator TLS and one public
 * device key are read. --open-source never creates/funds/replays a realm. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(import.meta.url),root=new URL('../../../',import.meta.url);
const product=new URL('../../../packages/backend/src/operations/recovery/native-original-source-local-operator-v1.mjs',import.meta.url);
assert.equal(process.execPath,fileURLToPath(new URL('.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node',root)));
assert.deepEqual(process.execArgv,['--max-old-space-size=384']);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
assert.equal(process.argv[1],entry);assert.equal(await realpath(entry),entry);assert.ok(process.argv.length===2||process.argv.length===3&&process.argv[2]==='--open-source');
const reopened=process.argv.length===3;let acquisition,service,closeRequested=false,closing;
async function privateFile(path){const directory=dirname(path),parent=await lstat(directory);assert.ok(parent.isDirectory()&&!parent.isSymbolicLink()&&parent.uid===process.getuid()&&(parent.mode&0o777)===0o700&&await realpath(directory)===directory);
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;try{const before=await fd.stat();assert.ok(before.isFile()&&before.nlink===1&&before.uid===process.getuid()&&(before.mode&0o777)===0o600&&before.size>0&&before.size<=32768);
 bytes=Buffer.alloc(32769);const n=(await fd.read(bytes,0,bytes.length,0)).bytesRead,after=await fd.stat(),named=await lstat(path);for(const k of ['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs'])assert.ok(before[k]===after[k]&&before[k]===named[k]);assert.equal(named.isSymbolicLink(),false);assert.equal(n,before.size);return JSON.parse(bytes.subarray(0,n).toString('utf8'));
 }finally{bytes?.fill(0);await fd.close();}}
function close(){closeRequested=true;return closing??=(async()=>{if(acquisition)service=await acquisition;if(!service)return;const result=await service.close();assert.ok(result.closed&&result.originalResourcesStopped);})();}
const stop=()=>{void close().catch(()=>{process.stderr.write('ORIGINAL_SOURCE_CLOSE_UNCONFIRMED\n');process.exitCode=1;});};process.once('SIGINT',stop);process.once('SIGTERM',stop);
try{const backend=await import(product),path=backend.originalNativeSourceLocalConfigurationPathV1(),config=await privateFile(path);
 if(!closeRequested){acquisition=(reopened?backend.reopenOriginalNativeSourceLocalOperatorV1:backend.createOriginalNativeSourceLocalOperatorV1)(config);acquisition.catch(()=>{});config.tls=null;service=await acquisition;
  if(closeRequested)await close();else if(service.phase==='UNKNOWN'){process.stdout.write('ORIGINAL_SOURCE_PENDING_UNKNOWN\n');await close();}
  else{const destination=join(dirname(path),'paired-descriptor.json'),value={version:1,profile:service.profile,origin:service.origin,descriptor:service.descriptor,localFakeValues:true,automaticFunding:false,cloudAuthority:false};
   if(reopened)assert.deepEqual(await privateFile(destination),value);else{const fd=await open(destination,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await fd.writeFile(JSON.stringify(value)+'\n');await fd.sync();}finally{await fd.close();}const parent=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await parent.sync();}finally{await parent.close();}assert.deepEqual(await privateFile(destination),value);}
   if(closeRequested)await close();else process.stdout.write('ORIGINAL_SOURCE_SERVICE_READY\n');}}else config.tls=null;
}catch{process.exitCode=1;try{await close();}catch{process.stderr.write('ORIGINAL_SOURCE_CLOSE_UNCONFIRMED\n');}process.stderr.write('ORIGINAL_SOURCE_START_OR_OPEN_FAILED\n');}
