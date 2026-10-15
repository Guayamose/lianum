/** Fixed zero-argument original TRON private mobile product. Pairing admits
 * only infrastructure and the device public key; native fixture custody stays
 * on this laboratory backend. Entry never funds, proves or dispatches. */
import assert from 'node:assert/strict';
import {retainOriginalNetworkMobileFirstErrorV1} from '../original-network-mobile-private-diagnostic-v1.mjs';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(import.meta.url),root=new URL('../../../',import.meta.url);
assert.equal(process.execPath,fileURLToPath(new URL('.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node',root)),'TRON_MOBILE_PINNED_NODE');
assert.deepEqual(process.execArgv,['--max-old-space-size=384'],'TRON_MOBILE_FIXED_HEAP');
assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
assert.deepEqual(process.argv,[process.execPath,entry],'TRON_MOBILE_FIXED_ENTRY');assert.equal(await realpath(entry),entry);
const product=new URL('../owned-tron-private-native-mobile-v1.mjs',import.meta.url),productPath=fileURLToPath(product);
const productPin=Object.freeze({"path":"scripts/development/owned-tron-private-native-mobile-v1.mjs","bytes":15527,"sha256":"539db91c05c9e9f19a76e22aba7130ed28584a42bfba33ba080958622fc1a773"});
const productSHA256=productPin.sha256,productBytes=productPin.bytes;
const fields=['dev','ino','uid','gid','mode','nlink','size','mtimeMs','ctimeMs'];
async function originalProduct(){assert.equal(await realpath(productPath),productPath,'TRON_MOBILE_PRODUCT_ALIAS');
 const fd=await open(productPath,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;try{const before=await fd.stat();
 assert(before.isFile()&&before.nlink===1&&before.uid===process.getuid()&&(before.mode&0o777)===0o644&&before.size===productBytes,'TRON_MOBILE_PRODUCT_FILE');
 bytes=Buffer.alloc(productBytes+1);let count=0;while(count<bytes.length){const value=await fd.read(bytes,count,bytes.length-count,count);if(!value.bytesRead)break;count+=value.bytesRead;}
 assert.equal(count,productBytes);for(const after of [await fd.stat(),await lstat(productPath)])for(const field of fields)assert.equal(after[field],before[field],'TRON_MOBILE_PRODUCT_CHANGED');
 assert.equal(createHash('sha256').update(bytes.subarray(0,count)).digest('hex'),productSHA256,'TRON_MOBILE_PRODUCT_PIN');
 const api=await import(product);for(const after of [await fd.stat(),await lstat(productPath)])for(const field of fields)assert.equal(after[field],before[field],'TRON_MOBILE_PRODUCT_CHANGED');return api;
 }finally{bytes?.fill(0);await fd.close();}}
async function privateFile(path,maximum){const parent=dirname(path),directory=await lstat(parent);assert(directory.isDirectory()&&!directory.isSymbolicLink()&&directory.uid===process.getuid()&&(directory.mode&0o777)===0o700&&await realpath(parent)===parent,'TRON_MOBILE_PRIVATE_DIRECTORY');
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;try{const before=await fd.stat();assert(before.isFile()&&before.nlink===1&&before.uid===process.getuid()&&(before.mode&0o777)===0o600&&before.size>0&&before.size<=maximum,'TRON_MOBILE_PRIVATE_FILE');
 bytes=Buffer.alloc(before.size+1);let count=0;while(count<bytes.length){const value=await fd.read(bytes,count,bytes.length-count,count);if(!value.bytesRead)break;count+=value.bytesRead;}
 assert.equal(count,before.size);for(const after of [await fd.stat(),await lstat(path)])for(const field of fields)assert.equal(after[field],before[field],'TRON_MOBILE_PRIVATE_FILE_CHANGED');return JSON.parse(bytes.subarray(0,count).toString('utf8'));
 }finally{bytes?.fill(0);await fd.close();}}
async function publish(path,service){const destination=join(dirname(path),'paired-tron-private-native-descriptor-v1.json');
 const value={version:1,profile:service.profile,origin:service.origin,descriptor:service.descriptor,nativeFamily:'4',privateNativeCreditEstablished:false,singleWitness:true,sameHostQuorum:true,publicNetwork:false,localFakeValues:true,custody:service.custody,nativeSelfCustody:false,independentOperators:false,automaticFunding:false,automaticNativeDelivery:false,plannedOriginalReopenEstablished:false,abruptCrashRecoveryEstablished:false,cloudAuthority:false};
 const fd=await open(destination,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await fd.writeFile(JSON.stringify(value)+'\n');await fd.sync();}finally{await fd.close();}
 const parent=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await parent.sync();}finally{await parent.close();}assert.deepEqual(await privateFile(destination,32768),value);}
let acquisition,service,closing,closeRequested=false;
function close(){closeRequested=true;return closing??=(async()=>{if(acquisition)service=await acquisition;if(service){const receipt=await service.close();assert(receipt.closed&&receipt.originalResourcesStopped,'TRON_MOBILE_CLOSE_UNCONFIRMED');}clearTimeout(originalTotalTimer);})();}
const originalTotalTimer=setTimeout(()=>{process.exitCode=1;void close().catch(()=>{process.stderr.write('TRON_MOBILE_CLOSE_UNCONFIRMED\n');});},5400000);originalTotalTimer.unref();
const stop=()=>{void close().catch(()=>{process.exitCode=1;process.stderr.write('TRON_MOBILE_CLOSE_UNCONFIRMED\n');});};process.once('SIGTERM',stop);process.once('SIGINT',stop);
try{const backend=await originalProduct(),path=backend.originalOwnedTronMobileConfigurationPathV1(),config=await privateFile(path,32768);
 if(!closeRequested){acquisition=backend.createOriginalOwnedTronPrivateNativeMobileV1(config);acquisition.catch(()=>{});config.tls=null;service=await acquisition;
 assert.equal(service.profile,'ORIGINAL_TRON_PRIVATE_NATIVE_MOBILE_V1');if(closeRequested)await close();else{await publish(path,service);if(closeRequested)await close();else process.stdout.write('TRON_PRIVATE_NATIVE_MOBILE_READY\n');}}
 else config.tls=null;
}catch(error){process.exitCode=1;try{await retainOriginalNetworkMobileFirstErrorV1('TRON',error);}catch{process.stderr.write('NATIVE_ECONOMIC_PRIVATE_DIAGNOSTIC_UNAVAILABLE\n');}try{await close();}catch{process.stderr.write('TRON_MOBILE_CLOSE_UNCONFIRMED\n');}process.stderr.write('TRON_MOBILE_START_FAILED\n');}
