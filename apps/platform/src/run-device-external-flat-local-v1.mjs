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
  assert.ok(name==='paired-descriptor.json'||name==='paired-share-descriptor.json'||name==='paired-meta-four.json'||name==='paired-aave-static.json'||name==='paired-uniswap-v3.json'||['paired-share-slot-0.json','paired-share-slot-1.json','paired-share-slot-2.json','paired-share-slot-3.json'].includes(name),'DEVICE_EXTERNAL_LOCAL_FIXED_DESCRIPTOR_FILE');
  const handle=await open(join(dirname(path),name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();}finally{await handle.close();}
  const parent=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await parent.sync();}finally{await parent.close();}
}
async function run(){
  const entry=fileURLToPath(import.meta.url);
  assert.equal(process.execPath,fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node',import.meta.url)),'DEVICE_EXTERNAL_LOCAL_PINNED_NODE');
  const sourceV3=process.argv.includes('--source-recovery-v3'),sourceV2=sourceV3||process.argv.includes('--source-recovery');
  const args=process.argv.slice(2).filter(v=>v!=='--source-recovery'&&v!=='--source-recovery-v3');
  const originalMultiFour=args[0]==='--meta-four',originalBlue=args[0]==='--morpho-blue-position',originalAave=args[0]==='--aave-static',originalUniswap=args[0]==='--uniswap-v3',reopening=originalMultiFour||originalBlue||originalAave||originalUniswap?args[1]==='--open-observation':args[0]==='--open-observation';assert.deepEqual(process.argv,[process.execPath,entry,...(originalMultiFour?['--meta-four']:originalBlue?['--morpho-blue-position']:originalAave?['--aave-static']:originalUniswap?['--uniswap-v3']:[]),...(sourceV2?[sourceV3?'--source-recovery-v3':'--source-recovery']:[]),...(reopening?['--open-observation']:[])],'DEVICE_EXTERNAL_LOCAL_FIXED_ENTRY');assert.ok(!sourceV2||!originalMultiFour&&!originalBlue&&(!originalAave||sourceV3),'DEVICE_EXTERNAL_LOCAL_FIXED_SOURCE');
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
  process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);process.once('SIGUSR1',()=>{void(async()=>{closeRequested=true;if(acquisition)service=await acquisition;assert.ok(service&&!reopening,'DEVICE_EXTERNAL_LOCAL_ORIGINAL_CAPTURE_ONLY');await service.capture();await close();})().catch(()=>{process.exitCode=1;process.stderr.write('DEVICE_EXTERNAL_LOCAL_CAPTURE_OR_CLOSE_FAILED\n');});});
  try{
    const original=await import(new URL('../../../.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/operations/local/device-external-flat-local-operator-v1.mjs',import.meta.url));
    const path=(originalMultiFour?original.originalDeviceMetaFourLocalConfigurationPathV1:originalBlue?original.originalDeviceMorphoBluePositionLocalConfigurationPathV1:originalAave?original.originalDeviceAaveStaticLocalConfigurationPathV1:originalUniswap?original.originalDeviceUniswapLocalConfigurationPathV1:original.originalDeviceExternalFlatLocalConfigurationPathV1)(),config=await privateConfiguration(path);
    if(closeRequested){config.tls=null;return;}
    acquisition=(sourceV2?(originalAave?(reopening?original.openOriginalDeviceAaveStaticSourceLocalOperatorV3:original.createOriginalDeviceAaveStaticSourceLocalOperatorV3):sourceV3?(originalUniswap?(reopening?original.openOriginalDeviceUniswapSourceLocalOperatorV3:original.createOriginalDeviceUniswapSourceLocalOperatorV3):(reopening?original.openOriginalDeviceExternalFlatSourceLocalOperatorV3:original.createOriginalDeviceExternalFlatSourceLocalOperatorV3)):originalUniswap?(reopening?original.openOriginalDeviceUniswapSourceLocalOperatorV2:original.createOriginalDeviceUniswapSourceLocalOperatorV2):(reopening?original.openOriginalDeviceExternalFlatSourceLocalOperatorV2:original.createOriginalDeviceExternalFlatSourceLocalOperatorV2)):originalMultiFour?(reopening?original.openOriginalDeviceMetaFourLocalOperatorV1:original.createOriginalDeviceMetaFourLocalOperatorV1):originalBlue?(reopening?original.openOriginalDeviceMorphoBluePositionLocalOperatorV1:original.createOriginalDeviceMorphoBluePositionLocalOperatorV1):originalAave?(reopening?original.openOriginalDeviceAaveStaticLocalOperatorV1:original.createOriginalDeviceAaveStaticLocalOperatorV1):originalUniswap?(reopening?original.openOriginalDeviceUniswapLocalOperatorV1:original.createOriginalDeviceUniswapLocalOperatorV1):reopening?original.openOriginalDeviceExternalFlatLocalOperatorV1:original.createOriginalDeviceExternalFlatLocalOperatorV1)(config);acquisition.catch(()=>{});
    config.tls=null;service=await acquisition;
    if(closeRequested)await close();
    else{if(!reopening)await publishDescriptor(path,service.descriptor,'paired-descriptor.json');if(!closeRequested&&!reopening){if(originalMultiFour){assert.equal(service.targetDescriptors.length,4);for(let slot=0;slot<4&&!closeRequested;slot++)await publishDescriptor(path,service.targetDescriptors[slot],'paired-share-slot-'+slot+'.json');if(!closeRequested)await publishDescriptor(path,{profile:'DEVICE_EXTERNAL_FLAT_META_FOUR_PAIRING_V1',source:service.descriptor,targets:service.targetDescriptors,deliveries:service.deliveries},'paired-meta-four.json');}else{await publishDescriptor(path,service.targetDescriptor,'paired-share-descriptor.json');if(originalAave&&!closeRequested)await publishDescriptor(path,{profile:'DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1',source:service.descriptor,target:service.targetDescriptor},'paired-aave-static.json');if(originalUniswap&&!closeRequested)await publishDescriptor(path,{profile:'DEVICE_EXTERNAL_FLAT_UNISWAP_PAIRING_V1',source:service.descriptor,target:service.targetDescriptor},'paired-uniswap-v3.json');}}if(closeRequested)await close();else process.stdout.write('ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_READY\n');}
  }catch{
    process.exitCode=1;
    try{await close();}catch{process.stderr.write('DEVICE_EXTERNAL_LOCAL_CLOSE_UNCONFIRMED\n');}
    process.stderr.write('DEVICE_EXTERNAL_LOCAL_START_OR_CLOSE_FAILED\n');
  }
}
await run();
