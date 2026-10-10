/** New local device ERC20 realm only. Fixed original factories own runtime,
 * token, pool, account and TLS. Operator input is public pairing identity,
 * TLS infrastructure and an explicit exact token allowance, never custody. */
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,createPrivateKey,X509Certificate,createPublicKey} from 'node:crypto';
import {constants} from 'node:fs';
import {open,lstat,realpath,unlink,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {isIP} from 'node:net';
import {types} from 'node:util';
import {ROOT,FLAT} from '../../../../proofs/src/catalog.mjs';
import {normalizeMobileOrigin} from '../../../../mobile-protocol/src/authorization.mjs';
import {externalFlatUintV1} from '../../../../mobile-protocol/src/device-external-flat-note-v1.mjs';
import {derivePrivateAssetIdentity} from '../../../../engine/src/notes/private-asset-runtime.mjs';
import {nativeAdmissionRulesTree} from '../../../../engine/src/execution/native/dispatch/native-admission.mjs';
import {createOwnedDeviceExternalFlatReceiverV1} from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {createOwnedPoolAsset} from '../../chains/shared/contracts/owned-pool-asset.mjs';
import {evmRuntimeCodeHash} from '../../chains/evm/contracts/evm-code-hash.mjs';
import {createOfficialAaveFixtureV1,assertOfficialAaveFixtureV1} from '../../../tests/fixtures/operations/deployments/system/official-aave-fixture-v1.mjs';
import {createOfficialProtocolFixture,assertOfficialProtocolFixture} from '../../../tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs';
import {createLocalFlatOperator,createFlatOperatorQuorum} from '../operators/claims/native-operators.mjs';
import {deployFlatSystem,assertOwnedFlatSystem} from '../deployments/system/deploy-system.mjs';
import {createOriginalDeviceExternalFlatPrivateNoteAuthorityV3,createOriginalDeviceExternalFlatPrivateShareNoteAuthorityV3} from '../../accounts/authority/device-external-flat-note-authority-v1.mjs';
import {createOriginalRetainedDeviceAaveStaticGraphServiceV1,createOriginalDeviceExternalFlatMultiGraphServiceV4,createOriginalRetainedDeviceMorphoBluePositionGraphServiceV1,createOriginalRetainedDeviceExternalFlatSourceGraphServiceV1,captureOriginalDeviceExternalFlatGraphServiceV1,reopenOriginalDeviceExternalFlatGraphServiceV1} from './device-external-flat-source-graph-service-v1.mjs';
import {createOwnedPrivateExternalRouterV1,createOwnedPrivateMorphoBluePositionRouterV1} from '../deployments/defi/deploy-private-external-router-v1.mjs';
import {createOwnedAaveStaticGraphDeliveryObserverV1,createOwnedMetaMorphoGraphDeliveryObserverV1,createOwnedMorphoBluePositionGraphDeliveryObserverV1} from '../../chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs';
import {createWrappedPrivateLifetimeRegistryV1,closeWrappedPrivateLifetimeRegistryV1} from '../../claims/wrapped/recovery/wrapped-private-lifetime-registry-v1.mjs';
import {createDeviceExternalFlatRecoveryAuthorityV1,openDeviceExternalFlatRecoveryAuthorityV1,closeDeviceExternalFlatRecoveryAuthorityV1} from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import {NATIVE_VALUE_DEV_RELEASE_V5} from '../releases/native-value/native-value-dev-release-v5.mjs';
import {loadNativeValueDevDeploymentArtifactsV5} from '../deployments/native-value/native-value-deployment-artifacts-v2.mjs';

import {createOwnedOriginalMorphoBluePositionV1} from '../deployments/defi/deploy-morpho-blue-position-v1.mjs';
const legacyLocal=join(ROOT,'.local/original-device-external-flat-local-v1'),blueLocal=join(ROOT,'.local/original-device-morpho-blue-position-v1');
const multiFourLocal=join(ROOT,'.local/original-device-external-flat-meta-four-local-v1'),aaveLocal=join(ROOT,'.local/original-device-aave-static-local-v1');
const fresh=()=>randomBytes(32).toString('hex'),bare=v=>v.slice(2);
const callerPin=Object.freeze({path:'apps/platform/src/run-device-external-flat-local-v1.mjs',bytes:6876,sha256:'1376d01292b0ac97f4a70f7a8983b156c7724cb738599f4c8c46b9dee0a9e34c'});
function exact(value,names){
  assert.ok(value&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype
    &&Reflect.ownKeys(value).length===names.length&&names.every(k=>{const d=Object.getOwnPropertyDescriptor(value,k);return d?.enumerable&&Object.hasOwn(d,'value');}),'DEVICE_EXTERNAL_LOCAL_CONFIGURATION');
}
function configuration(input){
  exact(input,['origin','devicePublicKey','tls','depositAmountAtomic']);exact(input.tls,['certificate','privateKey']);
  const selected={origin:input.origin,devicePublicKey:input.devicePublicKey,depositAmountAtomic:input.depositAmountAtomic,
    tls:{certificate:input.tls.certificate,privateKey:input.tls.privateKey}};
  normalizeMobileOrigin(selected.origin);externalFlatUintV1(selected.depositAmountAtomic);
  assert.ok(BigInt(selected.depositAmountAtomic)>0n&&typeof selected.devicePublicKey==='string'
    &&/^04[0-9a-f]{128}$/.exec(selected.devicePublicKey)?.[0]===selected.devicePublicKey,'DEVICE_EXTERNAL_LOCAL_CONFIGURATION');
  createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(selected.devicePublicKey.slice(2,66),'hex').toString('base64url'),y:Buffer.from(selected.devicePublicKey.slice(66),'hex').toString('base64url')}});
  assert.ok(typeof selected.tls.certificate==='string'&&Buffer.byteLength(selected.tls.certificate)<=65536
    &&typeof selected.tls.privateKey==='string'&&Buffer.byteLength(selected.tls.privateKey)<=16384,'DEVICE_EXTERNAL_LOCAL_CONFIGURATION');
  const certificate=new X509Certificate(selected.tls.certificate),key=createPrivateKey(selected.tls.privateKey),hostname=new URL(selected.origin).hostname.replace(/^\[|\]$/g,'');
  assert.ok(!certificate.ca&&certificate.checkPrivateKey(key)
    &&(isIP(hostname)?certificate.checkIP(hostname)===hostname:certificate.checkHost(hostname,{subject:'never',wildcards:false})===hostname)
    &&Date.now()>=certificate.validFromDate.getTime()&&Date.now()<certificate.validToDate.getTime(),'DEVICE_EXTERNAL_LOCAL_TLS_IDENTITY');
  return selected;
}
async function physicalDirectory(path){
  const s=await lstat(path);assert.ok(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()
    &&(s.mode&0o777)===0o700&&await realpath(path)===path,'DEVICE_EXTERNAL_LOCAL_PRIVATE_DIRECTORY');
}
/** Four public pairing origins and the original allowance are selected before
 * any runtime or account exists. DAG, quotas and protocol are fixed here. */
function multiFourConfiguration(input){
  exact(input,['origin','devicePublicKey','tls','depositAmountAtomic','targetOrigins']);
  const selected=configuration(Object.fromEntries(['origin','devicePublicKey','tls','depositAmountAtomic'].map(k=>[k,input[k]])));
  assert.equal(selected.depositAmountAtomic,'500','DEVICE_EXTERNAL_LOCAL_FOUR_FIXED_ALLOWANCE');
  const raw=input.targetOrigins;assert.ok(!types.isProxy(raw)&&Array.isArray(raw)&&Object.getPrototypeOf(raw)===Array.prototype&&raw.length===4&&Reflect.ownKeys(raw).length===5,'DEVICE_EXTERNAL_LOCAL_FOUR_ORIGINS');
  const targetOrigins=Array.from({length:4},(_,i)=>{const p=Object.getOwnPropertyDescriptor(raw,String(i));assert.ok(p?.enumerable&&Object.hasOwn(p,'value'),'DEVICE_EXTERNAL_LOCAL_FOUR_ORIGINS');const origin=p.value;configuration({...selected,origin});return origin;});
  assert.equal(targetOrigins[0],selected.origin,'DEVICE_EXTERNAL_LOCAL_FOUR_PRIMARY_ORIGIN');assert.equal(new Set(targetOrigins).size,4,'DEVICE_EXTERNAL_LOCAL_FOUR_ORIGINS');
  return {...selected,targetOrigins:Object.freeze(targetOrigins)};
}
function fixedMultiFourDeliveries(selected){return Object.freeze(selected.targetOrigins.map((origin,slot)=>Object.freeze({id:'device-external-share-'+slot,
  dependsOn:Object.freeze([[],['device-external-share-0'],['device-external-share-0'],['device-external-share-1','device-external-share-2']][slot]),origin,maximumInput:'100',shareAmount:'100',payoutAmount:'100'})));}
async function sourceReview(){
  assert.ok(NATIVE_VALUE_DEV_RELEASE_V5!==null&&NATIVE_VALUE_DEV_RELEASE_V5.sourceFiles.some(row=>row.path==='wallet-platform/modules/operations/local/device-external-flat-local-operator-v1.mjs'),'DEVICE_EXTERNAL_LOCAL_SOURCE_REVIEW_REQUIRED');
  await loadNativeValueDevDeploymentArtifactsV5();
  const root=resolve(FLAT,'../../..');assert.equal(await realpath(root),root,'DEVICE_EXTERNAL_LOCAL_CALLER_ROOT');let path=root;
  for(const part of callerPin.path.split('/')){path=join(path,part);assert.equal((await lstat(path)).isSymbolicLink(),false,'DEVICE_EXTERNAL_LOCAL_CALLER_ALIAS');}
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const before=await handle.stat();assert.ok(before.isFile()&&before.nlink===1&&before.uid===process.getuid()&&before.size===callerPin.bytes,'DEVICE_EXTERNAL_LOCAL_CALLER_PIN');
    const bytes=await handle.readFile(),after=await handle.stat(),named=await lstat(path);
    for(const field of ['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs'])assert.ok(before[field]===after[field]&&before[field]===named[field],'DEVICE_EXTERNAL_LOCAL_CALLER_CHANGED');
    assert.equal(named.isSymbolicLink(),false);assert.equal(bytes.length,callerPin.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),callerPin.sha256,'DEVICE_EXTERNAL_LOCAL_CALLER_PIN');
  }finally{await handle.close();}
}
export function originalDeviceExternalFlatLocalConfigurationPathV1(){assert.equal(arguments.length,0);return join(legacyLocal,'operator.json');}
export function createOriginalDeviceExternalFlatLocalOperatorV1(input){assert.equal(arguments.length,1);return localOperator(input,false);}
export function openOriginalDeviceExternalFlatLocalOperatorV1(input){assert.equal(arguments.length,1);return localOperator(input,true);}
export function originalDeviceMorphoBluePositionLocalConfigurationPathV1(){assert.equal(arguments.length,0);return join(blueLocal,'operator.json');}
export function createOriginalDeviceMorphoBluePositionLocalOperatorV1(input){assert.equal(arguments.length,1);return localOperator(input,false,true);}
export function openOriginalDeviceMorphoBluePositionLocalOperatorV1(input){assert.equal(arguments.length,1);return localOperator(input,true,true);}
export function originalDeviceMetaFourLocalConfigurationPathV1(){assert.equal(arguments.length,0);return join(multiFourLocal,'operator.json');}
export function createOriginalDeviceMetaFourLocalOperatorV1(input){assert.equal(arguments.length,1);return localOperator(input,false,false,true);}
export function originalDeviceAaveStaticLocalConfigurationPathV1(){assert.equal(arguments.length,0);return join(aaveLocal,'operator.json');}
export function createOriginalDeviceAaveStaticLocalOperatorV1(input){assert.equal(arguments.length,1);return localOperator(input,false,false,false,true);}
export function openOriginalDeviceAaveStaticLocalOperatorV1(input){assert.equal(arguments.length,1);return localOperator(input,true,false,false,true);}
async function localOperator(input,reopening,originalBlue=false,originalMultiFour=false,originalAave=false){const local=originalMultiFour?multiFourLocal:originalBlue?blueLocal:originalAave?aaveLocal:legacyLocal;const selected=originalMultiFour?multiFourConfiguration(input):configuration(input); // detach before the first await
  await sourceReview();await physicalDirectory(local);
  const lockPath=join(local,'active.lock'),lock=await open(lockPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  let lockBefore;try{lockBefore=await lock.stat();}catch(error){await lock.close();throw error;}
  let runtime,account,targetAccount,listener,registry,authority,identity,captureWork,completedCapture=false,closing,runtimeStarted=false,accountStarted=false,targetStarted=false;
  const operators=[];
  async function releaseLock(){
    const named=await lstat(lockPath),current=await lock.stat();
    for(const field of ['dev','ino','uid','mode','nlink'])assert.ok(lockBefore[field]===current[field]&&lockBefore[field]===named[field],'DEVICE_EXTERNAL_LOCAL_LOCK_CHANGED');
    assert.ok(!named.isSymbolicLink()&&current.nlink===1,'DEVICE_EXTERNAL_LOCAL_LOCK_CHANGED');
    await unlink(lockPath);await lock.close();
  }
  function close(){
    assert.equal(arguments.length,0);return closing??=(async()=>{
      const failures=[];if(captureWork)await captureWork.catch(()=>{});const stop=async work=>{try{await work();}catch(error){failures.push(error);}};
      // TLS closes admission and account permissions synchronously, then drains
      // exactly the work already owned by those original objects.
      if(listener&&!completedCapture)await stop(async()=>{const result=await listener.close();assert.ok(result.closed&&result.ownedSocketsRemaining===0&&(originalMultiFour?result.originalKeeperDrained===true:result.originalOperationsInFlight===0),'DEVICE_EXTERNAL_LOCAL_TLS_CLOSE_UNCONFIRMED');});
      if(targetAccount)await stop(async()=>{const result=await targetAccount.close();assert.ok(result.closed&&result.inFlight===0,'DEVICE_EXTERNAL_LOCAL_ACCOUNT_CLOSE_UNCONFIRMED');});
      if(account)await stop(async()=>{const result=await account.close();assert.ok(result.closed&&result.inFlight===0,'DEVICE_EXTERNAL_LOCAL_ACCOUNT_CLOSE_UNCONFIRMED');});
      for(const operator of operators)await stop(async()=>{await operator.close();assert.equal(operator.status().closed,true);});
      if(registry&&!completedCapture)await stop(()=>closeWrappedPrivateLifetimeRegistryV1(registry));if(authority&&!completedCapture)await stop(()=>closeDeviceExternalFlatRecoveryAuthorityV1(authority));
      if(runtime)await stop(async()=>{
        await runtime.close({removeScratch:false});
        const receipt=runtime.lifecycle.filter(row=>row.event==='stopped-owned-process');
        assert.ok(receipt.length===1&&receipt[0].stopped===true&&receipt[0].forced===false
          &&Number.isSafeInteger(receipt[0].pid)&&receipt[0].pid>1,'DEVICE_EXTERNAL_LOCAL_RUNTIME_STOP_UNCONFIRMED');
        assert.equal(receipt[0].scratchRemoved,false,'DEVICE_EXTERNAL_LOCAL_SCRATCH_RETENTION');
        try{await lstat('/proc/'+receipt[0].pid);assert.fail('DEVICE_EXTERNAL_LOCAL_RUNTIME_STILL_PRESENT');}
        catch(error){if(error.code!=='ENOENT')throw error;}
      });
      if(runtimeStarted&&!runtime||accountStarted&&!account||targetStarted&&!targetAccount)failures.push(Error('DEVICE_EXTERNAL_LOCAL_ACQUISITION_UNCONFIRMED'));
      selected.tls=null;
      if(failures.length){await lock.close();throw new AggregateError(failures,'DEVICE_EXTERNAL_LOCAL_CLOSE_UNCONFIRMED');}
      await releaseLock();return Object.freeze({closed:true,originalResourcesStopped:true,originalScratchRetained:true,automaticFunding:false});
    })();
  }
  try{
    await lock.writeFile(JSON.stringify({format:'ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_LOCK_V1',pid:process.pid})+'\n');await lock.sync();
    if(reopening){const saved=await privateGraphRecovery(originalBlue,originalAave);exact(saved,['profile','identity','checkpoint','descriptorSHA256','targetDescriptorSHA256','configurationSHA256']);assert.equal(saved.profile,'DEVICE_EXTERNAL_FLAT_ORDERED_OBSERVATION_RECOVERY_V1');assert.equal(saved.configurationSHA256,configurationSHA(selected));assert.equal(saved.identity.sourceSHA256,sourceHash());authority=await openDeviceExternalFlatRecoveryAuthorityV1(saved.identity,saved.checkpoint);listener=await reopenOriginalDeviceExternalFlatGraphServiceV1({recoveryAuthority:authority,tls:selected.tls,host:'0.0.0.0'});assert.equal(listener.profile,originalBlue?'MORPHO_BLUE_PRIVATE_SUPPLY_V1':originalAave?'AAVE_STATIC_PRIVATE_SHARE_MINT_V1':'METAMORPHO_PRIVATE_SHARE_MINT_V1','DEVICE_EXTERNAL_LOCAL_ORIGINAL_PROFILE');runtime=listener.runtime;runtimeStarted=true;account=listener.account;targetAccount=listener.targetAccount;assert.equal(hashDescriptor(listener.descriptor),saved.descriptorSHA256);assert.equal(hashDescriptor(listener.targetDescriptor),saved.targetDescriptorSHA256);return Object.freeze({descriptor:listener.descriptor,targetDescriptor:listener.targetDescriptor,url:listener.url,localFakeValues:true,automaticFunding:false,originalScratchRetained:true,newProcessRecoveryEstablished:true,abruptRecoveryEstablished:false,observationOnly:true,close});}
    if(!originalMultiFour){const runId=randomUUID(),directory=join(FLAT,'.local/device-external-flat-ordered-observation-v1','attempt-'+runId,'private-audit');await mkdir(directory,{recursive:true,mode:0o700});await physicalDirectory(directory);identity={directory,runId,sourceSHA256:sourceHash(),deadlineMs:Date.now()+90*60*1000};}
    runtimeStarted=true;runtime=await createOwnedDeviceExternalFlatReceiverV1();if(!originalMultiFour){registry=await createWrappedPrivateLifetimeRegistryV1({runtime,...identity});authority=await createDeviceExternalFlatRecoveryAuthorityV1(identity);}
    const official=await(originalAave?createOfficialAaveFixtureV1:createOfficialProtocolFixture)(runtime);if(originalAave)assertOfficialAaveFixtureV1(runtime,official);else assertOfficialProtocolFixture(runtime,official);
    const position=originalBlue?await createOwnedOriginalMorphoBluePositionV1({runtime,protocolFixture:official}):null,share=originalBlue?position.contract:official.vault;
    const capabilities=[];
    for(const contract of [official.first,share])capabilities.push(await createOwnedPoolAsset({runtime,
      deployment:{address:contract.address,transactionHash:contract.receipt.transactionHash,expectedCode:contract.code,codeHash:evmRuntimeCodeHash(contract.code)},
      symbol:(await official.read(contract,'symbol'))[0],decimals:Number((await official.read(contract,'decimals'))[0]),kind:'ERC20'}));
    assert.ok(capabilities[0].metadata.symbol==='USDC'&&capabilities[0].metadata.decimals===6,'DEVICE_EXTERNAL_LOCAL_FIXED_USDC');
    const shareIdentity=derivePrivateAssetIdentity(runtime.metadata.chainId,share.address,evmRuntimeCodeHash(share.code)).slice(2);
    const rule={family:'3',genesis:bare(runtime.metadata.evmGenesis),asset:shareIdentity,finalityKind:'3',minimumConfirmations:'1',maximumEvidenceLifetime:'86400',maximumClockSkew:'30'},rules=nativeAdmissionRulesTree([rule]);
    for(let signerIndex=0;signerIndex<4;signerIndex++)operators.push(createLocalFlatOperator({signerIndex}));
    const system=await deployFlatSystem(runtime,{deploymentDomain:'0x'+fresh(),registryEpoch:'1',rulesRoot:'0x'+rules.root,
      attesterKeys:operators.map(operator=>operator.publicKey),pools:capabilities.map(assetCapability=>({assetCapability,policy:'0x'+fresh(),deploymentDomain:'0x'+fresh()}))});
    assertOwnedFlatSystem(runtime,system);assert.equal(system.bootstrap.poolsUnfunded,true);assert.equal(system.bootstrap.constructorStorageMatched,true);
    assert.equal(system.bootstrap.completeRuntimesMatched,true);assert.equal(Object.keys(system.verifiers).length,12);
    const router=originalBlue?await createOwnedPrivateMorphoBluePositionRouterV1({runtime,system,poolIndex:1,position}):await createOwnedPrivateExternalRouterV1({runtime,system,poolIndex:1,protocolFixture:official,protocolKind:originalAave?'AAVE_V3_STATIC_EXACT_SHARE_MINT':'METAMORPHO_V1_EXACT_SHARE_MINT'});
    const deliveryObserver=originalBlue?await createOwnedMorphoBluePositionGraphDeliveryObserverV1({runtime,system,poolIndex:1,router,position}):await(originalAave?createOwnedAaveStaticGraphDeliveryObserverV1:createOwnedMetaMorphoGraphDeliveryObserverV1)({runtime,system,poolIndex:1,router,protocolFixture:official});
    for(const operator of operators)await operator.bind({runtime,system,bitcoin:null,solana:null,evmDelivery:deliveryObserver,rules:[rule],rulePaths:rules.paths});
    const quorum=createFlatOperatorQuorum({operators:operators.slice(0,3)});
    accountStarted=true;account=await createOriginalDeviceExternalFlatPrivateNoteAuthorityV3({runtime,system,poolIndex:0,origin:selected.origin,devicePublicKey:selected.devicePublicKey});
    if(!originalMultiFour){targetStarted=true;targetAccount=await createOriginalDeviceExternalFlatPrivateShareNoteAuthorityV3({runtime,system,poolIndex:1,deliveryObserver,origin:selected.origin,devicePublicKey:selected.devicePublicKey});}
    // The SAME original realm exposes source, target and GRAPH namespaces.
    // No Linux source or target note owner is created. Both device custodians
    // and the actual graph keeper exist before any external token funding.
    listener=originalMultiFour?await createOriginalDeviceExternalFlatMultiGraphServiceV4({account,runtime,system,quorum,router,deliveryObserver,rule,rulePath:rules.paths[0],deliveries:fixedMultiFourDeliveries(selected),tls:selected.tls,host:'0.0.0.0'}):await (originalBlue?createOriginalRetainedDeviceMorphoBluePositionGraphServiceV1:originalAave?createOriginalRetainedDeviceAaveStaticGraphServiceV1:createOriginalRetainedDeviceExternalFlatSourceGraphServiceV1)({account,targetAccount,runtime,system,registry,recoveryAuthority:authority,protocols:official,quorum,router,deliveryObserver,rule,rulePath:rules.paths[0],maximumSolverInput:selected.depositAmountAtomic,tls:selected.tls,host:'0.0.0.0'});
    const pool=system.pools[0],asset=pool.assetCapability,amount=BigInt(selected.depositAmountAtomic);
    const before=await runtime.block();assert.equal(await asset.allowance(system.sender,pool.address,before.number),0n,'DEVICE_EXTERNAL_LOCAL_ALLOWANCE_NOT_FRESH');
    assert.ok(await asset.balance(system.sender,before.number)>=amount,'DEVICE_EXTERNAL_LOCAL_FAKE_BALANCE');
    await official.send(official.first,'approve',[pool.address,amount]); // explicit infrastructure preparation only
    const after=await runtime.block();assert.equal(await asset.allowance(system.sender,pool.address,after.number),amount,'DEVICE_EXTERNAL_LOCAL_EXACT_ALLOWANCE');
    assert.equal(await asset.allowance(system.sender,router.address,after.number),0n,'DEVICE_EXTERNAL_LOCAL_ALLOWANCE_NOT_FRESH');
    await official.send(official.first,'approve',[router.address,amount]);
    const graphApproval=await runtime.block();assert.equal(await asset.allowance(system.sender,router.address,graphApproval.number),amount,'DEVICE_EXTERNAL_LOCAL_EXACT_ALLOWANCE');
    if(originalMultiFour){assert.equal(listener.targetDescriptors.length,4);return Object.freeze({profile:'DEVICE_EXTERNAL_FLAT_MULTI_GRAPH_V4',descriptor:listener.descriptor,targetDescriptors:listener.targetDescriptors,url:listener.url,deliveries:fixedMultiFourDeliveries(selected),localFakeValues:true,automaticFunding:false,originalScratchRetained:true,newProcessRecoveryEstablished:false,abruptRecoveryEstablished:false,orderedCaptureAvailable:false,close});}
    return Object.freeze({descriptor:listener.descriptor,targetDescriptor:listener.targetDescriptor,url:listener.url,localFakeValues:true,automaticFunding:false,
      originalScratchRetained:true,newProcessRecoveryEstablished:false,...(originalBlue?{profile:'MORPHO_BLUE_PRIVATE_SUPPLY_V1'}:originalAave?{profile:'AAVE_STATIC_PRIVATE_SHARE_MINT_V1'}:{}),orderedCaptureAvailable:true,capture(){assert.equal(arguments.length,0);assert.ok(!closing&&!captureWork,'DEVICE_EXTERNAL_LOCAL_ORIGINAL_CAPTURE_ONLY');return captureWork=(async()=>{const result=await captureOriginalDeviceExternalFlatGraphServiceV1(listener);assert.ok(result.originalResourcesStopped&&result.observationOnly);await publishGraphRecovery({profile:result.profile,identity,checkpoint:result.checkpoint,descriptorSHA256:hashDescriptor(listener.descriptor),targetDescriptorSHA256:hashDescriptor(listener.targetDescriptor),configurationSHA256:configurationSHA(selected)},originalBlue,originalAave);completedCapture=true;return result;})();},close});
  }catch(error){
    try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'DEVICE_EXTERNAL_LOCAL_START_CLEANUP_UNCONFIRMED',{cause:error});}
    throw error;
  }
}

const graphRecoveryPath=(originalBlue,originalAave=false)=>join(originalBlue?blueLocal:originalAave?aaveLocal:legacyLocal,'graph-recovery.json');
const hashDescriptor=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const configurationSHA=value=>hashDescriptor({origin:value.origin,devicePublicKey:value.devicePublicKey,depositAmountAtomic:value.depositAmountAtomic});
const sourceHash=()=>{assert.match(NATIVE_VALUE_DEV_RELEASE_V5.hostSourceClosureSHA256,/^[0-9a-f]{64}$/);return NATIVE_VALUE_DEV_RELEASE_V5.hostSourceClosureSHA256;};
async function privateGraphRecovery(originalBlue=false,originalAave=false){const path=graphRecoveryPath(originalBlue,originalAave),fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;try{const before=await fd.stat();assert.ok(before.isFile()&&before.nlink===1&&before.uid===process.getuid()&&(before.mode&0o777)===0o600&&before.size>0&&before.size<=8192);bytes=Buffer.alloc(8193);const count=(await fd.read(bytes,0,bytes.length,0)).bytesRead,after=await fd.stat(),named=await lstat(path);for(const key of ['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs'])assert.equal(before[key],after[key]),assert.equal(before[key],named[key]);assert.ok(!named.isSymbolicLink()&&count===before.size);return JSON.parse(bytes.subarray(0,count).toString('utf8'));}finally{bytes?.fill(0);await fd.close();}}
async function publishGraphRecovery(value,originalBlue=false,originalAave=false){const path=graphRecoveryPath(originalBlue,originalAave);const bytes=Buffer.from(JSON.stringify(value)+'\n');assert.ok(bytes.length<=8192);const fd=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await fd.writeFile(bytes);await fd.sync();}finally{bytes.fill(0);await fd.close();}const parent=await open(originalBlue?blueLocal:originalAave?aaveLocal:legacyLocal,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await parent.sync();}finally{await parent.close();}}
