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
import {ROOT,FLAT} from '@lianum/proofs/catalog';
import {normalizeMobileOrigin} from '@lianum/mobile-protocol';
import {externalFlatUintV1} from '@lianum/mobile-protocol/device/source-note-v1';
import {derivePrivateAssetIdentity} from '@lianum/engine/notes/private-asset-runtime';
import {nativeAdmissionRulesTree} from '@lianum/engine/execution/native/dispatch/native-admission';
import {createOwnedDeviceExternalFlatReceiverV1} from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {createOwnedPoolAsset} from '../../chains/shared/contracts/owned-pool-asset.mjs';
import {evmRuntimeCodeHash} from '../../chains/evm/contracts/evm-code-hash.mjs';
import {createOfficialProtocolFixture,assertOfficialProtocolFixture} from '../deployments/defi/official-protocol-fixture-v3.mjs';
import {createLocalFlatOperator} from '../operators/claims/native-operators.mjs';
import {deployFlatSystem,assertOwnedFlatSystem} from '../deployments/system/deploy-system.mjs';
import {installOriginalRetainedDeviceExternalFlatNoteServiceV1,captureOriginalDeviceExternalFlatOrderedServiceV1,reopenOriginalDeviceExternalFlatObservationServiceV1} from './device-external-flat-ordered-observation-service-v1.mjs';
import {createOriginalRetainedDeviceExternalFlatNoteAuthorityV1} from '../../accounts/authority/device-external-flat-note-authority-v1.mjs';
import {createWrappedPrivateLifetimeRegistryV1,closeWrappedPrivateLifetimeRegistryV1} from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import {createDeviceExternalFlatRecoveryAuthorityV1,openDeviceExternalFlatRecoveryAuthorityV1,closeDeviceExternalFlatRecoveryAuthorityV1} from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import {NATIVE_VALUE_DEV_RELEASE_V5} from '../releases/native-value/native-value-dev-release-v5.mjs';
import {loadNativeValueDevDeploymentArtifactsV5} from '../deployments/native-value/native-value-deployment-artifacts-v2.mjs';

const local=join(ROOT,'.local/original-device-external-flat-ordered-local-v1');
const fresh=()=>randomBytes(32).toString('hex'),bare=v=>v.slice(2);
const callerPin=Object.freeze({path:'apps/platform/src/run-device-external-flat-ordered-local-v1.mjs',bytes:4944,sha256:'eaba6f701180641ff13f32ef6d25f3e2137643349cf0c5ea775c4b880d896b08'});
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
async function sourceReview(){
  assert.ok(NATIVE_VALUE_DEV_RELEASE_V5!==null&&NATIVE_VALUE_DEV_RELEASE_V5.sourceFiles.some(row=>row.path==='wallet-platform/modules/operations/local/device-external-flat-ordered-local-operator-v1.mjs'),'DEVICE_EXTERNAL_LOCAL_SOURCE_REVIEW_REQUIRED');
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

const PROFILE='DEVICE_EXTERNAL_FLAT_ORDERED_OBSERVATION_RECOVERY_V1';
const recoveryPath=join(local,'ordered-recovery.json');
const sourceHash=()=>{assert.match(NATIVE_VALUE_DEV_RELEASE_V5.hostSourceClosureSHA256,/^[0-9a-f]{64}$/);return NATIVE_VALUE_DEV_RELEASE_V5.hostSourceClosureSHA256;};
const configHash=value=>createHash('sha256').update(JSON.stringify({origin:value.origin,devicePublicKey:value.devicePublicKey,depositAmountAtomic:value.depositAmountAtomic})).digest('hex');
async function privateRecord(path,maximum){await physicalDirectory(local);const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{const before=await fd.stat();assert.ok(before.isFile()&&before.uid===process.getuid()&&before.nlink===1&&(before.mode&0o777)===0o600&&before.size>0&&before.size<=maximum);bytes=Buffer.alloc(maximum+1);const count=(await fd.read(bytes,0,bytes.length,0)).bytesRead,after=await fd.stat(),named=await lstat(path);for(const key of ['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs'])assert.ok(before[key]===after[key]&&before[key]===named[key]);assert.ok(!named.isSymbolicLink()&&count===before.size);return JSON.parse(bytes.subarray(0,count).toString('utf8'));}finally{bytes?.fill(0);await fd.close();}}
async function publishCapture(value){const bytes=Buffer.from(JSON.stringify(value)+'\n');assert.ok(bytes.length<=8192);const fd=await open(recoveryPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await fd.writeFile(bytes);await fd.sync();}finally{bytes.fill(0);await fd.close();}const parent=await open(local,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await parent.sync();}finally{await parent.close();}}
export function originalDeviceExternalFlatOrderedLocalConfigurationPathV1(){assert.equal(arguments.length,0);return join(local,'operator.json');}
export function createOriginalDeviceExternalFlatOrderedLocalOperatorV1(input){assert.equal(arguments.length,1);return localOperator(input,false);}
export function openOriginalDeviceExternalFlatOrderedLocalOperatorV1(input){assert.equal(arguments.length,1);return localOperator(input,true);}
async function localOperator(input,reopening){
 const selected=configuration(input);await sourceReview();await physicalDirectory(local);
 const lockPath=join(local,'active.lock'),lock=await open(lockPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600),lockBefore=await lock.stat();
 let runtime,registry,authority,service,account,runtimeStarted=false,serviceStarted=false,closing,captureWork,stopped=false,completedCapture=false;const operators=[];
 async function releaseLock(){const named=await lstat(lockPath),current=await lock.stat();for(const key of ['dev','ino','uid','mode','nlink'])assert.ok(lockBefore[key]===current[key]&&lockBefore[key]===named[key]);assert.ok(!named.isSymbolicLink()&&current.nlink===1);await unlink(lockPath);await lock.close();}
 async function stoppedRuntime(){if(!runtimeStarted)return true;assert.ok(runtime,'DEVICE_EXTERNAL_LOCAL_ACQUISITION_UNCONFIRMED');const receipts=runtime.lifecycle.filter(r=>r.event==='stopped-owned-process');assert.ok(receipts.length===1&&receipts[0].stopped===true&&receipts[0].forced===false&&Number.isSafeInteger(receipts[0].pid)&&receipts[0].pid>1,'DEVICE_EXTERNAL_LOCAL_RUNTIME_STOP_UNCONFIRMED');assert.equal(receipts[0].scratchRemoved,false);try{await lstat('/proc/'+receipts[0].pid);assert.fail('DEVICE_EXTERNAL_LOCAL_RUNTIME_STILL_PRESENT');}catch(error){if(error.code!=='ENOENT')throw error;}return true;}
 function close(){assert.equal(arguments.length,0);return closing??=(async()=>{const errors=[];if(captureWork)await captureWork.catch(()=>{});const stop=async work=>{try{await work();}catch(error){errors.push(error);}};
  if(service)await stop(async()=>{const result=await service.close();assert.equal(result.closed,true);});else{if(account)await stop(()=>account.close());if(registry)await stop(()=>closeWrappedPrivateLifetimeRegistryV1(registry));if(runtime)await stop(()=>runtime.close({removeScratch:false}));if(authority)await stop(()=>closeDeviceExternalFlatRecoveryAuthorityV1(authority));}
  for(const operator of operators)await stop(()=>operator.close());await stop(stoppedRuntime);if(serviceStarted&&!service||runtimeStarted&&!runtime)errors.push(Error('DEVICE_EXTERNAL_LOCAL_ACQUISITION_UNCONFIRMED'));selected.tls=null;
  if(errors.length){await lock.close();throw new AggregateError(errors,'DEVICE_EXTERNAL_LOCAL_CLOSE_UNCONFIRMED',{cause:errors[0]});}if(!stopped){await releaseLock();stopped=true;}return{closed:true,originalResourcesStopped:true,originalScratchRetained:true,observationOnly:reopening,orderedCaptureCompleted:completedCapture};})();}
 try{await lock.writeFile(JSON.stringify({format:'ORIGINAL_DEVICE_EXTERNAL_FLAT_ORDERED_LOCAL_LOCK_V1',pid:process.pid})+'\n');await lock.sync();let identity;
  if(reopening){const saved=await privateRecord(recoveryPath,8192);exact(saved,['profile','identity','checkpoint','descriptorSHA256','configurationSHA256']);assert.equal(saved.profile,PROFILE);exact(saved.identity,['directory','runId','sourceSHA256','deadlineMs']);exact(saved.checkpoint,['revision','commitment']);assert.equal(saved.identity.sourceSHA256,sourceHash());assert.equal(saved.configurationSHA256,configHash(selected));identity=saved.identity;authority=await openDeviceExternalFlatRecoveryAuthorityV1(identity,saved.checkpoint);
   serviceStarted=true;service=await reopenOriginalDeviceExternalFlatObservationServiceV1({recoveryAuthority:authority,tls:selected.tls,host:'0.0.0.0'});assert.equal(service.observationOnly,true);assert.equal(createHash('sha256').update(JSON.stringify(service.descriptor)).digest('hex'),saved.descriptorSHA256);runtime=service.runtime;runtimeStarted=true;
  }else{const runId=randomUUID(),directory=join(FLAT,'.local/device-external-flat-ordered-observation-v1','attempt-'+runId,'private-audit');await mkdir(directory,{recursive:true,mode:0o700});await physicalDirectory(directory);identity={directory,runId,sourceSHA256:sourceHash(),deadlineMs:Date.now()+90*60*1000};
   runtimeStarted=true;runtime=await createOwnedDeviceExternalFlatReceiverV1();registry=await createWrappedPrivateLifetimeRegistryV1({runtime,...identity});authority=await createDeviceExternalFlatRecoveryAuthorityV1(identity);
    const official=await createOfficialProtocolFixture(runtime);assertOfficialProtocolFixture(runtime,official);
    const capabilities=[];
    for(const contract of [official.first,official.vault])capabilities.push(await createOwnedPoolAsset({runtime,
      deployment:{address:contract.address,transactionHash:contract.receipt.transactionHash,expectedCode:contract.code,codeHash:evmRuntimeCodeHash(contract.code)},
      symbol:(await official.read(contract,'symbol'))[0],decimals:Number((await official.read(contract,'decimals'))[0]),kind:'ERC20'}));
    assert.ok(capabilities[0].metadata.symbol==='USDC'&&capabilities[0].metadata.decimals===6,'DEVICE_EXTERNAL_LOCAL_FIXED_USDC');
    const shareIdentity=derivePrivateAssetIdentity(runtime.metadata.chainId,official.vault.address,evmRuntimeCodeHash(official.vault.code)).slice(2);
    const rules=nativeAdmissionRulesTree([{family:'3',genesis:bare(runtime.metadata.evmGenesis),asset:shareIdentity,finalityKind:'3',minimumConfirmations:'1',maximumEvidenceLifetime:'86400',maximumClockSkew:'30'}]);
    for(let signerIndex=0;signerIndex<4;signerIndex++)operators.push(createLocalFlatOperator({signerIndex}));
    const system=await deployFlatSystem(runtime,{deploymentDomain:'0x'+fresh(),registryEpoch:'1',rulesRoot:'0x'+rules.root,
      attesterKeys:operators.map(operator=>operator.publicKey),pools:capabilities.map(assetCapability=>({assetCapability,policy:'0x'+fresh(),deploymentDomain:'0x'+fresh()}))});
    assertOwnedFlatSystem(runtime,system);assert.equal(system.bootstrap.poolsUnfunded,true);assert.equal(system.bootstrap.constructorStorageMatched,true);
    assert.equal(system.bootstrap.completeRuntimesMatched,true);assert.equal(Object.keys(system.verifiers).length,12);
    for(const operator of operators){assert.equal(operator.status().bound,false);assert.equal(operator.status().certifiedInventoryCount,0);await operator.close();assert.equal(operator.status().closed,true);}

   account=await createOriginalRetainedDeviceExternalFlatNoteAuthorityV1({runtime,system,recoveryAuthority:authority,poolIndex:0,origin:selected.origin,devicePublicKey:selected.devicePublicKey});
   const pool=system.pools[0],asset=pool.assetCapability,amount=BigInt(selected.depositAmountAtomic),before=await runtime.block();assert.equal(await asset.allowance(system.sender,pool.address,before.number),0n);assert.ok(await asset.balance(system.sender,before.number)>=amount);await official.send(official.first,'approve',[pool.address,amount]);const after=await runtime.block();assert.equal(await asset.allowance(system.sender,pool.address,after.number),amount,'DEVICE_EXTERNAL_LOCAL_EXACT_ALLOWANCE');
   serviceStarted=true;service=await installOriginalRetainedDeviceExternalFlatNoteServiceV1({runtime,system,registry,recoveryAuthority:authority,account,poolIndex:0,origin:selected.origin,devicePublicKey:selected.devicePublicKey,tls:selected.tls,host:'0.0.0.0'});
  }
  function capture(){assert.equal(arguments.length,0);assert.ok(!reopening&&!closing&&!captureWork,'DEVICE_EXTERNAL_LOCAL_ORIGINAL_CAPTURE_ONLY');captureWork=(async()=>{const result=await captureOriginalDeviceExternalFlatOrderedServiceV1(service);assert.equal(result.profile,PROFILE);assert.equal(result.originalResourcesStopped,true);await stoppedRuntime();await publishCapture({profile:PROFILE,identity,checkpoint:result.checkpoint,descriptorSHA256:createHash('sha256').update(JSON.stringify(service.descriptor)).digest('hex'),configurationSHA256:configHash(selected)});completedCapture=true;return{captured:true,originalResourcesStopped:true,observationContinuationOnly:true};})();return captureWork;}
  return Object.freeze({descriptor:service.descriptor,url:service.url,localFakeValues:true,automaticFunding:false,observationOnly:reopening,orderedCaptureAvailable:!reopening,capture,close});
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'DEVICE_EXTERNAL_LOCAL_START_CLEANUP_UNCONFIRMED',{cause:error});}throw error;}
}
