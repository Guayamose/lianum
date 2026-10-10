/** HOST lifecycle regression, not a financial/bootstrap acceptance. The exact
 * caller/constructor bodies run with real private files and explicit inert
 * runtime/token/system/account/TLS ports. No process, key or proof is created. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {mkdtemp,writeFile,readFile,open,lstat,realpath,unlink,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {types} from 'node:util';
import {EventEmitter} from 'node:events';
import {FLAT} from '../../../../proofs/src/catalog.mjs';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const generated=fileURLToPath(import.meta.url).endsWith('/wallet-platform/modules/global-state/device-external-flat-local-operator-v1.test.mjs');
const backendURL=new URL(generated?'../operations/local/device-external-flat-local-operator-v1.mjs':'../../../src/operations/local/device-external-flat-local-operator-v1.mjs',import.meta.url);
const appURL=pathToFileURL(join(resolve(FLAT,'../../..'),'apps/platform/src/run-device-external-flat-local-v1.mjs'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
test('HOST original local ERC20 entry retains startup acquisition; cancels publication and drains owned originals, or preserves uncertain lock',{timeout:10000},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'device-external-entry-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const backend=await readFile(backendURL,'utf8'),caller=await readFile(appURL,'utf8');
  const marker='export function createOriginalDeviceExternalFlatLocalOperatorV1(input){';assert.equal(backend.split(marker).length,2);
  const constructor=backend.slice(backend.indexOf(marker)).replaceAll('export function','function');
  const privateDirectory=backend.slice(backend.indexOf('async function physicalDirectory(path){'),backend.indexOf('async function sourceReview(){'));
  const runtimeFactoryGate=deferred(),runtimeStarted=deferred(),tlsCloseGate=deferred(),tlsCloseStarted=deferred();
  const events=[];const allowances=new Map();let currentOperatorBindings=0,bindFailure=false,missingStopReceipt=false,tlsClosing=false;
  const inertRuntime={metadata:{chainId:'31337',evmGenesis:'0x'+'01'.repeat(32)},lifecycle:[],async block(){return{number:'1'};},
    async close(options){assert.deepEqual(options,{removeScratch:false});events.push('runtime-close');
      if(!missingStopReceipt)this.lifecycle.push({event:'stopped-owned-process',stopped:true,forced:false,pid:2147483646,scratchRemoved:false});
      return{stopped:true}; // deliberately insufficient without the original lifecycle receipt
    }};
  const asset={metadata:{symbol:'USDC',decimals:6},async allowance(_,target){return allowances.get(target)??0n;},async balance(){return 1000n;}};
  const official={first:{address:'0x'+'02'.repeat(20),receipt:{transactionHash:'0x'+'03'.repeat(32)},code:'0x12'},vault:{address:'0x'+'04'.repeat(20),receipt:{transactionHash:'0x'+'05'.repeat(32)},code:'0x34'},
    async read(contract,method){return[method==='symbol'?'USDC':6];},async send(contract,method,args){assert.equal(method,'approve');assert.equal(contract,this.first);assert.equal(events.includes('account-created'),true);assert.equal(events.includes('target-created'),true);assert.equal(events.includes('tls-created'),true);assert.equal(args[1],500n);allowances.set(args[0],args[1]);events.push('exact-approve');}};
  let originalAccount;
  const ports={assert,constants,open,lstat:async path=>path==='/proc/2147483646'?Promise.reject(Object.assign(Error('EXPLICIT_INERT_PID_ABSENT'),{code:'ENOENT'})):lstat(path),realpath,unlink,join,local:directory,process,
    FLAT:directory,legacyLocal:directory,blueLocal:directory,multiFourLocal:join(directory,'four'),aaveLocal:join(directory,'aave'),randomUUID,createHash,mkdir,NATIVE_VALUE_DEV_RELEASE_V5:{hostSourceClosureSHA256:'06'.repeat(32)},
    createWrappedPrivateLifetimeRegistryV1:async()=>{events.push('registry-created');return Object.freeze({});},createDeviceExternalFlatRecoveryAuthorityV1:async()=>{events.push('issuer-created');return Object.freeze({});},closeWrappedPrivateLifetimeRegistryV1:async()=>{events.push('registry-close');return{closed:true};},closeDeviceExternalFlatRecoveryAuthorityV1:async()=>{events.push('issuer-close');return{closed:true};},
    configuration:input=>structuredClone(input),exact:(v,names)=>{assert.ok(v&&!types.isProxy(v));assert.deepEqual(Reflect.ownKeys(v).sort(),[...names].sort());},types,sourceReview:async()=>{events.push('source-review');},fresh:()=>'06'.repeat(32),bare:v=>v.slice(2),
    createOwnedDeviceExternalFlatReceiverV1:async()=>{currentOperatorBindings=0;events.push('runtime-start');runtimeStarted.resolve();await runtimeFactoryGate.promise;return inertRuntime;},
    createOfficialProtocolFixture:async runtime=>{assert.equal(runtime,inertRuntime);events.push('official-setup');return official;},assertOfficialProtocolFixture:()=>{},
    createOwnedPoolAsset:async()=>asset,evmRuntimeCodeHash:()=>'0x'+'07'.repeat(32),derivePrivateAssetIdentity:()=>'0x'+'08'.repeat(32),nativeAdmissionRulesTree:()=>({root:'09'.repeat(32),paths:[{}]}),
    createLocalFlatOperator:({signerIndex})=>{let closed=false;return{publicKey:'actor'+signerIndex,status:()=>({bound:false,certifiedInventoryCount:0,closed}),async bind(input){assert.equal(input.runtime,inertRuntime);currentOperatorBindings++;events.push('operator-bound');},async close(){closed=true;events.push('operator-close');}};},
    deployFlatSystem:async(runtime,input)=>{assert.equal(runtime,inertRuntime);return{sender:'0x'+'10'.repeat(20),pools:[{address:'0x'+'11'.repeat(20),assetCapability:asset}],bootstrap:{poolsUnfunded:true,constructorStorageMatched:true,completeRuntimesMatched:true},verifiers:Object.fromEntries(Array.from({length:12},(_,i)=>[i,{}]))};},assertOwnedFlatSystem:()=>{},
    createOriginalDeviceExternalFlatNoteAuthorityV1:async input=>{assert.equal(input.devicePublicKey,'04'+'12'.repeat(64));assert.equal(allowances.size,0);events.push('account-created');originalAccount={async close(){events.push('account-close');return{closed:true,inFlight:0};}};return originalAccount;},
    createOwnedPrivateExternalRouterV1:async()=>({address:'0x'+'13'.repeat(20)}),createOwnedMetaMorphoGraphDeliveryObserverV1:async()=>Object.freeze({}),createFlatOperatorQuorum:input=>{assert.equal(input.operators.length,3);return Object.freeze({});},
    createOriginalDeviceExternalFlatShareNoteAuthorityV1:async input=>{assert.equal(input.poolIndex,1);assert.equal(allowances.size,0);events.push('target-created');return{async close(){events.push('target-close');return{closed:true,inFlight:0};}};},
    createOriginalRetainedDeviceExternalFlatSourceGraphServiceV1:async input=>{assert.equal(input.account,originalAccount);assert.equal(events.includes('registry-created'),true);assert.equal(events.includes('issuer-created'),true);assert.equal(input.protocols,official);assert.equal(allowances.size,0);assert.equal(currentOperatorBindings,4);events.push('tls-created');if(bindFailure)throw Error('EXPLICIT_INERT_BIND_FAILURE');return{descriptor:{profile:'EXPLICIT_INERT_HOST_DESCRIPTOR'},targetDescriptor:{profile:'EXPLICIT_INERT_HOST_SHARE_DESCRIPTOR'},url:config.origin,
      async close(){events.push('tls-close');tlsClosing=true;tlsCloseStarted.resolve();await tlsCloseGate.promise;return{closed:true,ownedSocketsRemaining:0,originalOperationsInFlight:0};}};},
  };
  ports.createOriginalDeviceExternalFlatPrivateNoteAuthorityV3=ports.createOriginalDeviceExternalFlatNoteAuthorityV1;
  ports.createOriginalDeviceExternalFlatPrivateShareNoteAuthorityV3=ports.createOriginalDeviceExternalFlatShareNoteAuthorityV1;
  ports.createOriginalDeviceExternalFlatMultiGraphServiceV4=async input=>{assert.equal(allowances.size,0);assert.equal(input.account,originalAccount);assert.equal(input.deliveries.length,4);assert.deepEqual(input.deliveries.map(v=>v.dependsOn),[[],['device-external-share-0'],['device-external-share-0'],['device-external-share-1','device-external-share-2']]);assert.deepEqual(input.deliveries.map(v=>[v.maximumInput,v.shareAmount,v.payoutAmount]),Array.from({length:4},()=>['100','100','100']));assert.equal(events.includes('registry-created'),false);assert.equal(events.includes('issuer-created'),false);assert.equal(currentOperatorBindings,4);events.push('target-created','tls-created');return{descriptor:{profile:'EXPLICIT_INERT_HOST_SOURCE'},targetDescriptors:input.deliveries.map((v,slot)=>({profile:'EXPLICIT_INERT_HOST_TARGET',origin:v.origin,slot})),url:input.deliveries[0].origin,async close(){events.push('four-tls-close');return{closed:true,ownedSocketsRemaining:0,originalKeeperDrained:true};}};};
  const aaveFixture={...official},aaveRouter=Object.freeze({address:'0x'+'19'.repeat(20)}),aaveObserver=Object.freeze({});let aaveSelected=false;
  ports.createOfficialAaveFixtureV1=async runtime=>{assert.equal(runtime,inertRuntime);assert.equal(allowances.size,0);events.push('aave-original-fixture');aaveSelected=true;return aaveFixture;};ports.assertOfficialAaveFixtureV1=(runtime,value)=>{assert.equal(runtime,inertRuntime);assert.equal(value,aaveFixture);};
  const metaRouter=ports.createOwnedPrivateExternalRouterV1;ports.createOwnedPrivateExternalRouterV1=async input=>{if(input.protocolKind==='AAVE_V3_STATIC_EXACT_SHARE_MINT'){assert.equal(input.protocolFixture,aaveFixture);assert.equal(allowances.size,0);events.push('aave-original-router');return aaveRouter;}return metaRouter(input);};
  ports.createOwnedAaveStaticGraphDeliveryObserverV1=async input=>{assert.equal(input.protocolFixture,aaveFixture);assert.equal(input.router,aaveRouter);assert.equal(input.runtime,inertRuntime);events.push('aave-original-observer');return aaveObserver;};
  const originalGraph=ports.createOriginalRetainedDeviceExternalFlatSourceGraphServiceV1;ports.createOriginalRetainedDeviceAaveStaticGraphServiceV1=async input=>{assert.equal(input.protocols,aaveFixture);assert.equal(input.router,aaveRouter);assert.equal(input.deliveryObserver,aaveObserver);assert.equal(input.account,originalAccount);assert.equal(allowances.size,0);assert.equal(currentOperatorBindings,4);events.push('aave-before-allowance');return originalGraph({...input,protocols:official});};
  const {create,createMulti,createAave}=await new AsyncFunction(...Object.keys(ports),privateDirectory+constructor+'\nreturn{create:createOriginalDeviceExternalFlatLocalOperatorV1,createMulti:createOriginalDeviceMetaFourLocalOperatorV1,createAave:createOriginalDeviceAaveStaticLocalOperatorV1};')(...Object.values(ports));
  const config={origin:'https://localhost:9447',devicePublicKey:'04'+'12'.repeat(64),depositAmountAtomic:'500',tls:{certificate:'EXPLICIT_INERT_CERT',privateKey:'EXPLICIT_INERT_TLS_KEY'}};
  const configPath=join(directory,'operator.json');await writeFile(configPath,JSON.stringify(config),{mode:0o600});
  const fakeProcess=new EventEmitter();Object.assign(fakeProcess,{execPath:fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node',appURL)),execArgv:['--max-old-space-size=384'],env:{},getuid:()=>process.getuid(),stdout:{write:value=>events.push(value.trim())},stderr:{write:value=>events.push(value.trim())}});fakeProcess.argv=[fakeProcess.execPath,fileURLToPath(appURL)];
  const start=caller.indexOf('async function run(){'),end=caller.indexOf('\nawait run();',start);assert.ok(start>=0&&end>start);
  let body=caller.slice(start,end).replaceAll('import.meta.url','appURL');
  const originalImport="await import(new URL('../../../.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/operations/local/device-external-flat-local-operator-v1.mjs',appURL))";assert.equal(body.split(originalImport).length,2);body=body.replace(originalImport,'inertOriginal');
  const helpers=caller.slice(caller.indexOf('async function privateConfiguration(path){'),start);
  const cliPorts={assert,constants,open,lstat,realpath:async path=>path===fileURLToPath(appURL)?path:realpath(path),dirname,join,fileURLToPath,URL,Buffer,appURL:appURL.href,process:fakeProcess,
    inertOriginal:{originalDeviceExternalFlatLocalConfigurationPathV1:()=>configPath,createOriginalDeviceExternalFlatLocalOperatorV1:create}};
  const run=await new AsyncFunction(...Object.keys(cliPorts),helpers+body+'\nreturn run;')(...Object.values(cliPorts));
  const running=run();await runtimeStarted.promise;fakeProcess.emit('SIGTERM');runtimeFactoryGate.resolve();
  await Promise.race([tlsCloseStarted.promise,running.then(()=>{throw Error('EXPLICIT_INERT_TLS_CLOSE_NOT_REACHED');})]);
  assert.equal(events.includes('runtime-close'),false); // runtime remains until TLS owns no work/socket
  assert.equal(events.includes('ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_READY'),false);tlsCloseGate.resolve();await running;
  assert.equal(events.filter(v=>v==='runtime-start').length,1);assert.equal(events.filter(v=>v==='runtime-close').length,1);
  assert.equal(events.indexOf('account-created')<events.indexOf('exact-approve'),true);assert.equal(events.indexOf('tls-created')<events.indexOf('exact-approve'),true);assert.equal(events.filter(v=>v==='exact-approve').length,2);assert.equal(events.indexOf('tls-close')<events.indexOf('target-close'),true);assert.equal(events.indexOf('target-close')<events.indexOf('account-close'),true);
  assert.equal(events.indexOf('tls-close')<events.indexOf('runtime-close'),true);assert.equal(fakeProcess.exitCode,undefined);
  await assert.rejects(lstat(join(directory,'paired-descriptor.json')),{code:'ENOENT'});await assert.rejects(lstat(join(directory,'active.lock')),{code:'ENOENT'});
  // Actual fixed product branch creates its four-target composition before
  // either allowance, publishes DATA descriptors and exposes no fake capture.
  await mkdir(ports.multiFourLocal,{mode:0o700});events.length=0;allowances.clear();inertRuntime.lifecycle=[];
  const fourConfig={...config,targetOrigins:[0,1,2,3].map(i=>'https://localhost:'+(9447+i))},four=await createMulti(fourConfig);
  assert.equal(four.profile,'DEVICE_EXTERNAL_FLAT_MULTI_GRAPH_V4');assert.equal(four.targetDescriptors.length,4);assert.equal(four.automaticFunding,false);assert.equal(four.orderedCaptureAvailable,false);assert.equal(four.capture,undefined);assert.equal(four.abruptRecoveryEstablished,false);assert.equal(events.indexOf('tls-created')<events.indexOf('exact-approve'),true);
  assert.equal(events.filter(v=>v==='exact-approve').length,2);assert.deepEqual(four.deliveries.map(v=>v.origin),fourConfig.targetOrigins);await four.close();assert.equal(events.indexOf('four-tls-close')<events.indexOf('runtime-close'),true);await assert.rejects(lstat(join(ports.multiFourLocal,'active.lock')),{code:'ENOENT'});
  await assert.rejects(createMulti({...fourConfig,targetOrigins:[...fourConfig.targetOrigins.slice(0,3),fourConfig.origin]}));await assert.rejects(createMulti({...fourConfig,depositAmountAtomic:'501'}));
  // The original CLI selects only --meta-four before birth and publishes four
  // separate pairing descriptors; it never creates a proof or funds a note.
  const fourConfigPath=join(ports.multiFourLocal,'operator.json');await writeFile(fourConfigPath,JSON.stringify(fourConfig),{mode:0o600});let publishedFour;
  Object.assign(cliPorts.inertOriginal,{originalDeviceMetaFourLocalConfigurationPathV1:()=>fourConfigPath,async createOriginalDeviceMetaFourLocalOperatorV1(input){publishedFour=await createMulti(input);return publishedFour;}});
  fakeProcess.argv=[fakeProcess.execPath,fileURLToPath(appURL),'--meta-four'];events.length=0;allowances.clear();inertRuntime.lifecycle=[];await run();assert.equal(events.includes('ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_READY'),true);
  for(let slot=0;slot<4;slot++){const file=join(ports.multiFourLocal,'paired-share-slot-'+slot+'.json');assert.deepEqual(JSON.parse(await readFile(file,'utf8')),publishedFour.targetDescriptors[slot]);assert.equal((await lstat(file)).mode&0o777,0o600);}
  const packetPath=join(ports.multiFourLocal,'paired-meta-four.json'),packet=JSON.parse(await readFile(packetPath,'utf8'));assert.equal((await lstat(packetPath)).mode&0o777,0o600);assert.deepEqual(packet,{profile:'DEVICE_EXTERNAL_FLAT_META_FOUR_PAIRING_V1',source:publishedFour.descriptor,targets:publishedFour.targetDescriptors,deliveries:publishedFour.deliveries});assert.equal(events.filter(v=>v==='exact-approve').length,2);
  assert.deepEqual(JSON.parse(await readFile(join(ports.multiFourLocal,'paired-descriptor.json'),'utf8')),publishedFour.descriptor);await assert.rejects(lstat(join(ports.multiFourLocal,'paired-share-descriptor.json')),{code:'ENOENT'});await publishedFour.close();await assert.rejects(lstat(join(ports.multiFourLocal,'active.lock')),{code:'ENOENT'});
  // Fixed Aave selection uses the existing private device producers and SAME
  // native bindings before either exact infrastructure allowance. No funding
  // or Linux note custodian exists in these explicit inert ports.
  await mkdir(ports.aaveLocal,{mode:0o700});events.length=0;allowances.clear();inertRuntime.lifecycle=[];
  const aave=await createAave(config);assert.equal(aaveSelected,true);assert.equal(aave.profile,'AAVE_STATIC_PRIVATE_SHARE_MINT_V1');assert.equal(aave.automaticFunding,false);assert.equal(aave.orderedCaptureAvailable,true);assert.equal(events.indexOf('aave-before-allowance')<events.indexOf('exact-approve'),true);assert.equal(events.filter(v=>v==='exact-approve').length,2);await aave.close();await assert.rejects(lstat(join(ports.aaveLocal,'active.lock')),{code:'ENOENT'});
  const aaveConfigPath=join(ports.aaveLocal,'operator.json');await writeFile(aaveConfigPath,JSON.stringify(config),{mode:0o600});let publishedAave;
  Object.assign(cliPorts.inertOriginal,{originalDeviceAaveStaticLocalConfigurationPathV1:()=>aaveConfigPath,async createOriginalDeviceAaveStaticLocalOperatorV1(input){publishedAave=await createAave(input);return publishedAave;}});
  fakeProcess.argv=[fakeProcess.execPath,fileURLToPath(appURL),'--aave-static'];events.length=0;allowances.clear();inertRuntime.lifecycle=[];await run();assert.equal(events.includes('ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_READY'),true);const aavePacket=join(ports.aaveLocal,'paired-aave-static.json');assert.equal((await lstat(aavePacket)).mode&0o777,0o600);assert.deepEqual(JSON.parse(await readFile(aavePacket,'utf8')),{profile:'DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1',source:publishedAave.descriptor,target:publishedAave.targetDescriptor});assert.equal(events.filter(v=>v==='exact-approve').length,2);await publishedAave.close();
  // Failure before listener publication still closes the actual acquired
  // account/runtime and never treats close()'s status as a stop receipt.
  events.length=0;bindFailure=true;missingStopReceipt=true;allowances.clear();inertRuntime.lifecycle=[];
  await assert.rejects(create(config),error=>error instanceof AggregateError&&error.message==='DEVICE_EXTERNAL_LOCAL_START_CLEANUP_UNCONFIRMED');
  assert.equal((await lstat(join(directory,'active.lock'))).isFile(),true);
  assert.equal(events.includes('ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_READY'),false);
});

test('HOST original Graph backend stores exact encrypted checkpoints and denies pending, substituted or copied recovery parts',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'device-external-graph-checkpoint-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const serviceURL=new URL(generated?'../operations/local/device-external-flat-source-graph-service-v1.mjs':'../../../src/operations/local/device-external-flat-source-graph-service-v1.mjs',import.meta.url),source=await readFile(serviceURL,'utf8');
 const vaultURL=new URL(generated?'../../../../../omnichain-product/src/vault.mjs':'../../../../engine/src/crypto/vault.mjs',import.meta.url),{Vault}=await import(vaultURL);
 const storageURL=new URL(generated?'../native-claims/segmented-record-store.mjs':'../../../src/claims/storage/segmented-record-store.mjs',import.meta.url),{canonicalClaimRecordDataV1}=await import(storageURL);
 const sha=v=>createHash('sha256').update(canonicalClaimRecordDataV1(v)).digest('hex'),password='07'.repeat(32),vault=new Vault(join(directory,'part.vault'));
 const confirmed={schema:'EXPLICIT_INERT_ORIGINAL_GRAPH_SEED',jobId:'01'.repeat(32),claim:{jobId:'01'.repeat(32)},submission:{dispatchLatched:true,transactionHash:null},withdrawals:[]};
 let record=await vault.create({schema:'DEVICE_EXTERNAL_FLAT_GRAPH_DURABLE_V1',confirmed,candidate:null},password),reads=0;
 const runtime=Object.freeze({}),handle=Object.freeze({}),identity={lifetime:'02'.repeat(32)},descriptor={slot:'wallet-graph-keeper-0',identity,stateSHA256:sha(record.data)};
 const checkedStart=source.indexOf('async function checkedPart('),checkedEnd=source.indexOf('function originalFile(',checkedStart);assert.ok(checkedStart>=0&&checkedEnd>checkedStart);
 const partStart=source.indexOf('function part('),partEnd=source.indexOf('const workspaces=',partStart);assert.ok(partStart>=0&&partEnd>partStart);
 const need=(v,c)=>assert.ok(v,c),exact=(v,keys)=>{assert.deepEqual(Object.keys(v).sort(),[...keys].sort());return v;};
 const ports={assert,types,need,exact,sha,readWrappedPrivateLifetimePartV1:async(r,name,id)=>{assert.equal(r,runtime);assert.equal(name,descriptor.slot);assert.deepEqual(id,identity);reads++;return{privateState:(await vault.read(password)).data,handle};},assertWrappedPrivateLifetimePartSealedV1:h=>assert.equal(h,handle)};
 const body=source.slice(checkedStart,checkedEnd)+source.slice(partStart,partEnd).replace('export function','function');
 const api=await new AsyncFunction(...Object.keys(ports),'const recoveryParts=new WeakMap();'+body+';return{checkedPart,part,consume:consumeOriginalDeviceExternalFlatGraphRecoveryPartV1};')(...Object.values(ports));
 assert.deepEqual(await api.checkedPart(runtime,descriptor,'DEVICE_EXTERNAL_FLAT_GRAPH_DURABLE_V1'),confirmed);assert.equal(reads,1);
 const token=api.part('bridge',{confirmed});assert.deepEqual(api.consume(token,'bridge'),{confirmed});assert.throws(()=>api.consume(token,'bridge'));assert.throws(()=>api.consume(Object.freeze({}),'bridge'));
 const other=api.part('execution',{confirmed});assert.throws(()=>api.consume(other,'bridge'));assert.deepEqual(api.consume(other,'execution'),{confirmed});
 const graphURL=new URL(generated?'device-external-flat-source-graph-v1.mjs':'../../../src/accounts/authority/device-external-flat-source-graph-v1.mjs',import.meta.url),graphSource=await readFile(graphURL,'utf8');
 const saveStart=graphSource.indexOf(' async function save(change){'),saveEnd=graphSource.indexOf(' const update=',saveStart);assert.ok(saveStart>=0&&saveEnd>saveStart);
 let failOriginalCAS=false;const events=[];
 class FaultVault extends Vault{async update(...args){events.push('original-cas');assert.notEqual((await vault.read(password)).data.candidate,null);if(failOriginalCAS)throw Object.assign(Error('EXPLICIT_INERT_CAS_FAILURE'),{code:'EIO'});return super.update(...args);}}
 const operationVault=new FaultVault(join(directory,'operations.vault'));let operation=await operationVault.create({jobId:confirmed.jobId,dispatchLatched:false},password);
 const writerPorts={initial:operation,assert,copy:structuredClone,password,vault:operationVault,physical:async()=>{},persistRecord:async(candidate,current)=>{events.push(candidate?'candidate':'confirmed');record=await vault.update(password,record.revision,d=>({...d,confirmed:structuredClone(current.data),candidate:candidate??null}));assert.deepEqual(await vault.read(password),record);}};
 const writer=await new AsyncFunction(...Object.keys(writerPorts),'let record=initial,poisoned=false;async function healthy(){assert.deepEqual(await vault.read(password),record);}async function persist(candidate=null){return persistRecord(candidate,record);}'+graphSource.slice(saveStart,saveEnd)+';return{save,current:()=>record,poisoned:()=>poisoned};')(...Object.values(writerPorts));
 await writer.save(d=>({...d,dispatchLatched:true}));operation=writer.current();assert.deepEqual(events,['candidate','original-cas','confirmed']);assert.equal(record.data.candidate,null);assert.equal(record.data.confirmed.dispatchLatched,true);
 failOriginalCAS=true;await assert.rejects(writer.save(d=>({...d,secondAdmission:true})),{code:'EIO'});assert.equal(writer.poisoned(),true);assert.equal((await operationVault.read(password)).data.secondAdmission,undefined);const pending={...descriptor,stateSHA256:sha(record.data)};
 await assert.rejects(api.checkedPart(runtime,pending,'DEVICE_EXTERNAL_FLAT_GRAPH_DURABLE_V1'),/DEVICE_EXTERNAL_GRAPH_PENDING_REOPEN_DENIED/);
 await assert.rejects(api.checkedPart(runtime,descriptor,'DEVICE_EXTERNAL_FLAT_GRAPH_DURABLE_V1'),/DEVICE_EXTERNAL_GRAPH_ORIGINAL_PRIVATE_CHECKPOINT/);
 assert.equal((await vault.read(password)).data.confirmed.dispatchLatched,true);assert.equal((await vault.read(password)).data.candidate.data.secondAdmission,true);
});

// Original constructor body: these boundary ports cannot issue an account,
// provider, proof or transaction. Existing product lifecycle above exercises
// real private files, actual CLI and the SAME before-allowance sequencing.
test('HOST original Aave mobile constructor rejects a funded, foreign or moving original source before service birth',async()=>{
 const source=await readFile(new URL(generated?'../operations/local/device-external-flat-source-graph-service-v1.mjs':'../../../src/operations/local/device-external-flat-source-graph-service-v1.mjs',import.meta.url),'utf8'),start=source.indexOf('export async function createOriginalRetainedDeviceAaveStaticGraphServiceV1(input){'),end=source.indexOf('\nasync function createService(',start);assert.ok(start>=0&&end>start);const body=source.slice(start,end).replace('export async function','async function');
 const runtime=Object.freeze({}),system=Object.freeze({}),observer=Object.freeze({}),authority=Object.freeze({}),protocols=Object.freeze({}),registry=Object.freeze({}),account=Object.freeze({}),targetAccount=Object.freeze({});let funded=-1,nullifier=-1,moved=false,births=0,reads=0,checks=0;
 const exact=(q,keys)=>{assert.ok(q&&!types.isProxy(q));assert.deepEqual(Reflect.ownKeys(q).sort(),[...keys].sort());return q;},need=(value,code)=>assert.ok(value,code);
 const ports={assert,exact,need,assertOwnedFlatSystem:(r,s)=>{assert.equal(r,runtime);assert.equal(s,system);},assertOwnedEvmGraphDeliveryObserverV1:(o,q)=>{assert.equal(o,observer);assert.equal(q.runtime,runtime);assert.equal(q.system,system);assert.equal(q.poolIndex,1);},isOwnedAaveStaticGraphDeliveryObserverV1:o=>o===observer,
  createFlatSystemStateReader:async q=>{assert.equal(q.runtime,runtime);return{async read(){reads++;return{head:{number:moved&&q.poolIndex===1?'2':'1'},ledger:{commitments:funded===q.poolIndex?['ORIGINAL_ALREADY_FUNDED']:[],nullifiers:nullifier===q.poolIndex?['ORIGINAL_ALREADY_SPENT']:[]}};},async assertCurrent(){checks++;}};},
  createService:async(q,r,blue,multi,aave)=>{births++;assert.equal(q.account,account);assert.equal(q.targetAccount,targetAccount);assert.equal(r.authority,authority);assert.equal(r.protocols,protocols);assert.equal(r.registry,registry);assert.equal(blue,false);assert.equal(multi,null);assert.equal(aave,true);return Object.freeze({profile:'EXPLICIT_INERT_ORIGINAL_AAVE_SERVICE'});}};
 const create=await new AsyncFunction(...Object.keys(ports),body+'\nreturn createOriginalRetainedDeviceAaveStaticGraphServiceV1;')(...Object.values(ports)),input={account,targetAccount,runtime,system,quorum:Object.freeze({}),router:Object.freeze({}),deliveryObserver:observer,rule:{},rulePath:{},maximumSolverInput:'500',tls:{},host:'EXPLICIT_INERT_HOST',recoveryAuthority:authority,registry,protocols};
 await create(input);assert.equal(births,1);assert.equal(reads,2);assert.equal(checks,4);
 for(const pool of [0,1]){funded=pool;await assert.rejects(create(input),/DEVICE_AAVE_GRAPH_BEFORE_FUNDING/);funded=-1;nullifier=pool;await assert.rejects(create(input),/DEVICE_AAVE_GRAPH_BEFORE_FUNDING/);nullifier=-1;}moved=true;await assert.rejects(create(input),/DEVICE_AAVE_GRAPH_SAME_BEFORE_FUND_HEAD/);moved=false;await assert.rejects(create({...input,deliveryObserver:{}}));await assert.rejects(create({...input,runtime:{}}));await assert.rejects(create({...input,callerSelectedProvider:{}}));assert.equal(births,1);
});
