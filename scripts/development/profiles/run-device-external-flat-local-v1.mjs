/** Fixed local ERC20 operator entry. Infrastructure input carries no note,
 * account, proof, witness or user signing key. No operation runs at startup. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {createHash,X509Certificate} from 'node:crypto';
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
  assert.ok(name==='paired-connection.json'||name==='paired-descriptor.json'||name==='paired-share-descriptor.json'||name==='paired-meta-four.json'||name==='paired-aave-static.json'||name==='paired-uniswap-v3.json'||name==='paired-metamorpho-underlying.json'||['paired-share-slot-0.json','paired-share-slot-1.json','paired-share-slot-2.json','paired-share-slot-3.json'].includes(name),'DEVICE_EXTERNAL_LOCAL_FIXED_DESCRIPTOR_FILE');
  const bytes=Buffer.from(JSON.stringify(value)+'\n');if(name==='paired-connection.json')assert.ok(bytes.length>0&&bytes.length<=32768,'DEVICE_DEFI_PUBLIC_CONNECTION_BOUND');
  const handle=await open(join(dirname(path),name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await handle.writeFile(bytes);await handle.sync();}finally{bytes.fill(0);await handle.close();}
  const parent=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await parent.sync();}finally{await parent.close();}
}
async function run(){
  const entry=fileURLToPath(import.meta.url);
  assert.equal(process.execPath,fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node',import.meta.url)),'DEVICE_EXTERNAL_LOCAL_PINNED_NODE');
  const sourceV3=process.argv.includes('--source-recovery-v3'),sourceV2=sourceV3||process.argv.includes('--source-recovery');
  const args=process.argv.slice(2).filter(v=>v!=='--source-recovery'&&v!=='--source-recovery-v3');
  const originalMeta=args[0]==='--metamorpho-underlying'||args[0]==='--meta-four-underlying',originalMultiFour=args[0]==='--meta-four'||args[0]==='--meta-four-underlying',originalBlue=args[0]==='--morpho-blue-position',originalAave=args[0]==='--aave-static',originalUniswap=args[0]==='--uniswap-v3',reopening=originalMeta||originalMultiFour||originalBlue||originalAave||originalUniswap?args[1]==='--open-observation':args[0]==='--open-observation';assert.deepEqual(process.argv,[process.execPath,entry,...(originalMeta?[originalMultiFour?'--meta-four-underlying':'--metamorpho-underlying']:originalMultiFour?['--meta-four']:originalBlue?['--morpho-blue-position']:originalAave?['--aave-static']:originalUniswap?['--uniswap-v3']:[]),...(sourceV2?[sourceV3?'--source-recovery-v3':'--source-recovery']:[]),...(reopening?['--open-observation']:[])],'DEVICE_EXTERNAL_LOCAL_FIXED_ENTRY');assert.ok(!sourceV2||!originalMeta&&!originalMultiFour&&!originalBlue&&(!originalAave||sourceV3),'DEVICE_EXTERNAL_LOCAL_FIXED_SOURCE');
  assert.equal(await realpath(entry),entry,'DEVICE_EXTERNAL_LOCAL_ENTRY_ALIAS');
  assert.deepEqual(process.execArgv,['--max-old-space-size=384'],'DEVICE_EXTERNAL_LOCAL_FIXED_HEAP');
  assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
  let acquisition,service,closeRequested=false,closing;const setupAbort=new AbortController();
  function close(){
    closeRequested=true;setupAbort.abort(); // publication/admission fence before any await
    return closing??=(async()=>{
      if(acquisition)service=await acquisition;
      if(service){const result=await service.close();assert.ok(result.closed&&result.originalResourcesStopped&&result.originalScratchRetained,'DEVICE_EXTERNAL_LOCAL_CLOSE_UNCONFIRMED');}
    })();
  }
  const onSignal=()=>{void close().catch(()=>{process.exitCode=1;process.stderr.write('DEVICE_EXTERNAL_LOCAL_CLOSE_UNCONFIRMED\n');});};
  process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);process.once('SIGUSR1',()=>{void(async()=>{closeRequested=true;if(acquisition)service=await acquisition;assert.ok(service&&!reopening,'DEVICE_EXTERNAL_LOCAL_ORIGINAL_CAPTURE_ONLY');await service.capture();await close();})().catch(()=>{process.exitCode=1;process.stderr.write('DEVICE_EXTERNAL_LOCAL_CAPTURE_OR_CLOSE_FAILED\n');});});
  try{
    const original=await import('@lianum/backend/operations/local/device-external-flat-local-operator-v1');
    const path=(originalMeta?(originalMultiFour?original.originalDeviceMetaMorphoFourUnderlyingConfigurationPathV2:original.originalDeviceMetaMorphoUnderlyingConfigurationPathV2):originalMultiFour?original.originalDeviceMetaFourLocalConfigurationPathV1:originalBlue?original.originalDeviceMorphoBluePositionLocalConfigurationPathV1:originalAave?original.originalDeviceAaveStaticLocalConfigurationPathV1:originalUniswap?original.originalDeviceUniswapLocalConfigurationPathV1:original.originalDeviceExternalFlatLocalConfigurationPathV1)();
    const publicConnection=!originalMultiFour&&(originalMeta||originalAave||originalUniswap),kind=originalUniswap?'UNISWAP':originalAave?'AAVE':'METAMORPHO';
    if(publicConnection&&!reopening){
      await lstat(path).catch(async error=>{if(error.code!=='ENOENT')throw error;const {configureMissingOriginalDeviceDefiLocalV1}=await import('../../../services/paeg-engine/src/bootstrap/device-defi-local-setup-v1.mjs');await configureMissingOriginalDeviceDefiLocalV1(path,kind,sourceV3,setupAbort.signal);});
      for(const name of ['paired-descriptor.json','paired-share-descriptor.json','paired-connection.json','graph-recovery.json','active.lock'])await lstat(join(dirname(path),name)).then(()=>{throw Error('DEVICE_DEFI_RETAINED_STATE_REQUIRES_ORIGINAL_RECOVERY');},error=>{if(error.code!=='ENOENT')throw error;});
    }
    if(closeRequested)return;const config=await privateConfiguration(path),certificatePEM=config.tls.certificate;
    if(closeRequested){config.tls=null;return;}
    acquisition=(originalMeta?(originalMultiFour?(reopening?original.openOriginalDeviceMetaMorphoFourUnderlyingLocalOperatorV2:original.createOriginalDeviceMetaMorphoFourUnderlyingLocalOperatorV2):(reopening?original.openOriginalDeviceMetaMorphoUnderlyingLocalOperatorV2:original.createOriginalDeviceMetaMorphoUnderlyingLocalOperatorV2)):sourceV2?(originalAave?(reopening?original.openOriginalDeviceAaveStaticSourceLocalOperatorV3:original.createOriginalDeviceAaveStaticSourceLocalOperatorV3):sourceV3?(originalUniswap?(reopening?original.openOriginalDeviceUniswapSourceLocalOperatorV3:original.createOriginalDeviceUniswapSourceLocalOperatorV3):(reopening?original.openOriginalDeviceExternalFlatSourceLocalOperatorV3:original.createOriginalDeviceExternalFlatSourceLocalOperatorV3)):originalUniswap?(reopening?original.openOriginalDeviceUniswapSourceLocalOperatorV2:original.createOriginalDeviceUniswapSourceLocalOperatorV2):(reopening?original.openOriginalDeviceExternalFlatSourceLocalOperatorV2:original.createOriginalDeviceExternalFlatSourceLocalOperatorV2)):originalMultiFour?(reopening?original.openOriginalDeviceMetaFourLocalOperatorV1:original.createOriginalDeviceMetaFourLocalOperatorV1):originalBlue?(reopening?original.openOriginalDeviceMorphoBluePositionLocalOperatorV1:original.createOriginalDeviceMorphoBluePositionLocalOperatorV1):originalAave?(reopening?original.openOriginalDeviceAaveStaticLocalOperatorV1:original.createOriginalDeviceAaveStaticLocalOperatorV1):originalUniswap?(reopening?original.openOriginalDeviceUniswapLocalOperatorV1:original.createOriginalDeviceUniswapLocalOperatorV1):reopening?original.openOriginalDeviceExternalFlatLocalOperatorV1:original.createOriginalDeviceExternalFlatLocalOperatorV1)(config);acquisition.catch(()=>{});
    config.tls=null;service=await acquisition;
    if(closeRequested)await close();
    else{if(!reopening)await publishDescriptor(path,service.descriptor,'paired-descriptor.json');if(!closeRequested&&!reopening){if(originalMultiFour){assert.equal(service.targetDescriptors.length,4);for(let slot=0;slot<4&&!closeRequested;slot++)await publishDescriptor(path,service.targetDescriptors[slot],'paired-share-slot-'+slot+'.json');if(!closeRequested)await publishDescriptor(path,{profile:originalMeta?'DEVICE_EXTERNAL_FLAT_META_FOUR_UNDERLYING_PAIRING_V2':'DEVICE_EXTERNAL_FLAT_META_FOUR_PAIRING_V1',...(originalMeta?{redemptionRecipient:service.redemptionRecipient}:{}),source:service.descriptor,targets:service.targetDescriptors,deliveries:service.deliveries},'paired-meta-four.json');}else{await publishDescriptor(path,service.targetDescriptor,'paired-share-descriptor.json');if(originalMeta&&!closeRequested)await publishDescriptor(path,{profile:'DEVICE_EXTERNAL_FLAT_METAMORPHO_UNDERLYING_PAIRING_V2',source:service.descriptor,target:service.targetDescriptor,redemptionRecipient:service.redemptionRecipient},'paired-metamorpho-underlying.json');if(originalAave&&!closeRequested)await publishDescriptor(path,{profile:'DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1',source:service.descriptor,target:service.targetDescriptor},'paired-aave-static.json');if(originalUniswap&&!closeRequested)await publishDescriptor(path,{profile:'DEVICE_EXTERNAL_FLAT_UNISWAP_PAIRING_V1',source:service.descriptor,target:service.targetDescriptor},'paired-uniswap-v3.json');}}if(!closeRequested&&publicConnection&&!reopening){
      const pairing={profile:originalMeta?'DEVICE_EXTERNAL_FLAT_METAMORPHO_UNDERLYING_PAIRING_V2':originalAave?'DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1':'DEVICE_EXTERNAL_FLAT_UNISWAP_PAIRING_V1',source:service.descriptor,target:service.targetDescriptor,...(originalMeta?{redemptionRecipient:service.redemptionRecipient}:{})};
      const certificate=new X509Certificate(certificatePEM);await publishDescriptor(path,{format:'DEVICE_EXTERNAL_FLAT_CONNECTION_V1',pairing,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM,certificateSHA256:createHash('sha256').update(certificate.raw).digest('hex')}},'paired-connection.json');
    }if(closeRequested)await close();else process.stdout.write('ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_READY\n'+(publicConnection&&!reopening?'Conexión pública para importar en DeFi: '+join(dirname(path),'paired-connection.json')+'\n':''));}
  }catch(error){
    if(error?.message==='DEVICE_DEFI_RETAINED_STATE_REQUIRES_ORIGINAL_RECOVERY')process.stderr.write('DEVICE_DEFI_RETAINED_STATE_REQUIRES_ORIGINAL_RECOVERY: existing pairing and state are preserved; use the original observation/recovery entry, not a new product.\n');
    if(error?.message==='DEVICE_DEFI_SETUP_RETAINED_DIRECTORY')process.stderr.write('DEVICE_DEFI_SETUP_RETAINED_DIRECTORY: existing setup is preserved; private configuration is never replaced automatically.\n');
    process.exitCode=1;
    try{await close();}catch{process.stderr.write('DEVICE_EXTERNAL_LOCAL_CLOSE_UNCONFIRMED\n');}
    process.stderr.write('DEVICE_EXTERNAL_LOCAL_START_OR_CLOSE_FAILED\n');
  }
}
await run();
