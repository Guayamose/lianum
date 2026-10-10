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
async function publishDescriptor(path,value,name){
  assert.ok(name==='paired-descriptor.json'||name==='paired-share-descriptor.json'||['paired-share-slot-0.json','paired-share-slot-1.json','paired-share-slot-2.json','paired-share-slot-3.json'].includes(name),'DEVICE_EXTERNAL_LOCAL_FIXED_DESCRIPTOR_FILE');
  const handle=await open(join(dirname(path),name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();}finally{await handle.close();}
  const parent=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await parent.sync();}finally{await parent.close();}
}
async function run(){
  const entry=fileURLToPath(import.meta.url);
  assert.equal(process.execPath,fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node',import.meta.url)),'DEVICE_EXTERNAL_LOCAL_PINNED_NODE');
  const originalMultiFour=process.argv[2]==='--meta-four',originalBlue=process.argv[2]==='--morpho-blue-position',reopening=originalBlue?process.argv[3]==='--open-observation':process.argv[2]==='--open-observation';assert.deepEqual(process.argv,[process.execPath,entry,...(originalMultiFour?['--meta-four']:originalBlue?['--morpho-blue-position']:[]),...(reopening?['--open-observation']:[])],'DEVICE_EXTERNAL_LOCAL_FIXED_ENTRY');
  assert.equal(await realpath(entry),entry,'DEVICE_EXTERNAL_LOCAL_ENTRY_ALIAS');
  assert.deepEqual(process.execArgv,['--max-old-space-size=384'],'DEVICE_EXTERNAL_LOCAL_FIXED_HEAP');
  assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
  let acquisition,service,closeRequested=false,closing;
  function close(){
    closeRequested=true; // publication/admission fence before any await
    return closing??=(async()=>{
      if(acquisition)service=await acquisition;
      if(service){const result=await service.close();assert.ok(result.closed&&result.originalResourcesStopped&&result.originalScratchRetained,'DEVICE_EXTERNAL_LOCAL_CLOSE_UNCONFIRMED');}
    })();
  }
  const onSignal=()=>{void close().catch(()=>{process.exitCode=1;process.stderr.write('DEVICE_EXTERNAL_LOCAL_CLOSE_UNCONFIRMED\n');});};
  process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);process.once('SIGUSR1',()=>{void(async()=>{assert.equal(originalMultiFour,false,'DEVICE_EXTERNAL_LOCAL_FOUR_CAPTURE_UNAVAILABLE');closeRequested=true;if(acquisition)service=await acquisition;assert.ok(service&&!reopening,'DEVICE_EXTERNAL_LOCAL_ORIGINAL_CAPTURE_ONLY');await service.capture();await close();})().catch(()=>{process.exitCode=1;process.stderr.write('DEVICE_EXTERNAL_LOCAL_CAPTURE_OR_CLOSE_FAILED\n');});});
  try{
    const original=await import(new URL('../../../.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/operations/local/device-external-flat-local-operator-v1.mjs',import.meta.url));
    const path=(originalMultiFour?original.originalDeviceMetaFourLocalConfigurationPathV1:originalBlue?original.originalDeviceMorphoBluePositionLocalConfigurationPathV1:original.originalDeviceExternalFlatLocalConfigurationPathV1)(),config=await privateConfiguration(path);
    if(closeRequested){config.tls=null;return;}
    acquisition=(originalMultiFour?original.createOriginalDeviceMetaFourLocalOperatorV1:originalBlue?(reopening?original.openOriginalDeviceMorphoBluePositionLocalOperatorV1:original.createOriginalDeviceMorphoBluePositionLocalOperatorV1):reopening?original.openOriginalDeviceExternalFlatLocalOperatorV1:original.createOriginalDeviceExternalFlatLocalOperatorV1)(config);acquisition.catch(()=>{});
    config.tls=null;service=await acquisition;
    if(closeRequested)await close();
    else{if(!reopening)await publishDescriptor(path,service.descriptor,'paired-descriptor.json');if(!closeRequested&&!reopening){if(originalMultiFour){assert.equal(service.targetDescriptors.length,4);for(let slot=0;slot<4&&!closeRequested;slot++)await publishDescriptor(path,service.targetDescriptors[slot],'paired-share-slot-'+slot+'.json');}else await publishDescriptor(path,service.targetDescriptor,'paired-share-descriptor.json');}if(closeRequested)await close();else process.stdout.write('ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_READY\n');}
  }catch{
    process.exitCode=1;
    try{await close();}catch{process.stderr.write('DEVICE_EXTERNAL_LOCAL_CLOSE_UNCONFIRMED\n');}
    process.stderr.write('DEVICE_EXTERNAL_LOCAL_START_OR_CLOSE_FAILED\n');
  }
}
await run();
