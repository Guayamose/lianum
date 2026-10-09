/** Fixed local ERC20 operator entry. Infrastructure input carries no note,
 * account, proof, witness or user signing key. No operation runs at startup. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

async function privateConfiguration(path){
  const parent=dirname(path),directory=await lstat(parent);
  assert.ok(directory.isDirectory()&&!directory.isSymbolicLink()&&directory.uid===process.getuid()
    &&(directory.mode&0o777)===0o700&&await realpath(parent)===parent,'DEVICE_EXTERNAL_LOCAL_PRIVATE_DIRECTORY');
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
  try{
    const before=await handle.stat();
    assert.ok(before.isFile()&&before.uid===process.getuid()&&(before.mode&0o777)===0o600
      &&before.nlink===1&&before.size>0&&before.size<=32768,'DEVICE_EXTERNAL_LOCAL_PRIVATE_CONFIGURATION');
    bytes=Buffer.alloc(32769);const count=(await handle.read(bytes,0,bytes.length,0)).bytesRead;
    const after=await handle.stat(),named=await lstat(path);
    for(const key of ['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs'])
      assert.ok(before[key]===after[key]&&before[key]===named[key],'DEVICE_EXTERNAL_LOCAL_CONFIGURATION_CHANGED');
    assert.ok(!named.isSymbolicLink()&&count===before.size,'DEVICE_EXTERNAL_LOCAL_CONFIGURATION_CHANGED');
    return JSON.parse(bytes.subarray(0,count).toString('utf8'));
  }finally{bytes?.fill(0);await handle.close();}
}
async function publishDescriptor(path,value){
  const handle=await open(join(dirname(path),'paired-descriptor.json'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();}finally{await handle.close();}
  const parent=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await parent.sync();}finally{await parent.close();}
}
async function run(){
 const entry=fileURLToPath(import.meta.url),observing=process.argv.length===3&&process.argv[2]==='--open-observation';
 assert.equal(process.execPath,fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node',import.meta.url)),'DEVICE_EXTERNAL_LOCAL_PINNED_NODE');assert.deepEqual(process.argv,observing?[process.execPath,entry,'--open-observation']:[process.execPath,entry],'DEVICE_EXTERNAL_LOCAL_FIXED_ENTRY');assert.equal(await realpath(entry),entry);assert.deepEqual(process.execArgv,['--max-old-space-size=384']);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
 let acquisition,service,requested=false,shutdownWork;
 function shutdown(){requested=true;return shutdownWork??=(async()=>{if(acquisition)service=await acquisition;if(!service)return;let primary;
  if(!observing){try{const capture=await service.capture();assert.ok(capture.captured&&capture.originalResourcesStopped&&capture.observationContinuationOnly);}catch(error){primary=error;}}
  try{const result=await service.close();assert.ok(result.closed&&result.originalResourcesStopped&&result.originalScratchRetained);}catch(error){if(primary)throw new AggregateError([primary,error],'DEVICE_EXTERNAL_LOCAL_ORDERED_CLOSE_FAILED',{cause:primary});throw error;}if(primary)throw primary;
 })();}
 const onSignal=()=>{void shutdown().catch(()=>{process.exitCode=1;process.stderr.write('DEVICE_EXTERNAL_LOCAL_ORDERED_CLOSE_UNCONFIRMED\n');});};process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
 try{const original=await import(new URL('../../../.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/operations/local/device-external-flat-ordered-local-operator-v1.mjs',import.meta.url)),path=original.originalDeviceExternalFlatOrderedLocalConfigurationPathV1(),config=await privateConfiguration(path);if(requested){config.tls=null;return;}
  acquisition=observing?original.openOriginalDeviceExternalFlatOrderedLocalOperatorV1(config):original.createOriginalDeviceExternalFlatOrderedLocalOperatorV1(config);acquisition.catch(()=>{});config.tls=null;service=await acquisition;
  if(requested)await shutdown();else{if(observing){const prior=await privateConfiguration(join(dirname(path),'paired-descriptor.json'));assert.equal(JSON.stringify(prior),JSON.stringify(service.descriptor),'DEVICE_EXTERNAL_LOCAL_REOPENED_DESCRIPTOR');}else await publishDescriptor(path,service.descriptor);if(requested)await shutdown();else process.stdout.write(observing?'ORIGINAL_DEVICE_EXTERNAL_FLAT_OBSERVATION_READY\n':'ORIGINAL_DEVICE_EXTERNAL_FLAT_ORDERED_LOCAL_READY\n');}
 }catch{process.exitCode=1;try{await shutdown();}catch{process.stderr.write('DEVICE_EXTERNAL_LOCAL_ORDERED_CLOSE_UNCONFIRMED\n');}process.stderr.write('DEVICE_EXTERNAL_LOCAL_ORDERED_START_OR_CLOSE_FAILED\n');}
}
await run();
