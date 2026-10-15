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
import {FLAT} from '@lianum/proofs/catalog';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const generated=fileURLToPath(import.meta.url).endsWith('/wallet-platform/modules/global-state/device-external-flat-local-operator-v1.test.mjs');
const backendURL=new URL(generated?'../operations/local/device-external-flat-local-operator-v1.mjs':'../../../src/operations/local/device-external-flat-local-operator-v1.mjs',import.meta.url);
const appURL=pathToFileURL(join(resolve(FLAT,'../../..'),'scripts/development/profiles/run-device-external-flat-local-v1.mjs'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
test('HOST original local ERC20 entry retains startup acquisition; cancels publication and drains owned originals, or preserves uncertain lock',{timeout:10000},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'device-external-entry-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const backend=await readFile(backendURL,'utf8'),caller=await readFile(appURL,'utf8');
  const marker='export function createOriginalDeviceExternalFlatLocalOperatorV1(input){';assert.equal(backend.split(marker).length,2);
  const constructor=backend.slice(backend.indexOf(marker)).replaceAll('export function','function');
  const interfaceBind=backend.slice(backend.indexOf('function localSingleProtocolBind(origin){'),backend.indexOf('const fresh=',backend.indexOf('function localSingleProtocolBind(origin){')));
  const privateDirectory=interfaceBind+'\n'+backend.slice(backend.indexOf('async function physicalDirectory(path){'),backend.indexOf('async function sourceReview(){'));
  const runtimeFactoryGate=deferred(),runtimeStarted=deferred(),tlsCloseGate=deferred(),tlsCloseStarted=deferred();
  const events=[];const allowances=new Map();let currentOperatorBindings=0,bindFailure=false,missingStopReceipt=false,tlsClosing=false,routerQuota=500n;
  const inertRuntime={metadata:{chainId:'31337',evmGenesis:'0x'+'01'.repeat(32)},lifecycle:[],async block(){return{number:'1'};},
    async close(options){assert.deepEqual(options,{removeScratch:false});events.push('runtime-close');
      if(!missingStopReceipt)this.lifecycle.push({event:'stopped-owned-process',stopped:true,forced:false,pid:2147483646,scratchRemoved:false});
      return{stopped:true}; // deliberately insufficient without the original lifecycle receipt
    }};
  const asset={metadata:{symbol:'PALT',decimals:6},async allowance(_,target){return allowances.get(target)??0n;},async balance(){return 1000n;}};
  const official={second:{address:'0x'+'20'.repeat(20),receipt:{transactionHash:'0x'+'21'.repeat(32)},code:'0x56'},first:{address:'0x'+'02'.repeat(20),receipt:{transactionHash:'0x'+'03'.repeat(32)},code:'0x12'},vault:{address:'0x'+'04'.repeat(20),receipt:{transactionHash:'0x'+'05'.repeat(32)},code:'0x34'},
    async read(contract,method){return[method==='symbol'?asset.metadata.symbol:6];},async send(contract,method,args){assert.equal(method,'approve');assert.equal(contract,this.first);assert.equal(events.includes('account-created'),true);assert.equal(events.includes('target-created'),true);assert.equal(events.includes('tls-created'),true);assert.equal(args[1],multiRouters.some(r=>r.address===args[0])?100n:args[0]===uniswapRouter.address?routerQuota:500n);allowances.set(args[0],args[1]);events.push('exact-approve');}};
  let originalAccount;const registry=Object.freeze({}),authority=Object.freeze({});
  const ports={assert,constants,open,lstat:async path=>path==='/proc/2147483646'?Promise.reject(Object.assign(Error('EXPLICIT_INERT_PID_ABSENT'),{code:'ENOENT'})):lstat(path),realpath,unlink,join,local:directory,process,
    ROOT:directory,sourceOperatorsV2:new WeakMap(),FLAT:directory,legacyLocal:directory,blueLocal:directory,multiFourLocal:join(directory,'four'),aaveLocal:join(directory,'aave'),uniswapLocal:join(directory,'uniswap'),randomUUID,createHash,mkdir,NATIVE_VALUE_DEV_RELEASE_V5:{hostSourceClosureSHA256:'06'.repeat(32)},
    createWrappedPrivateLifetimeRegistryV1:async()=>{events.push('registry-created');return registry;},createDeviceExternalFlatRecoveryAuthorityV1:async()=>{events.push('issuer-created');return authority;},closeWrappedPrivateLifetimeRegistryV1:async()=>{events.push('registry-close');return{closed:true};},closeDeviceExternalFlatRecoveryAuthorityV1:async()=>{events.push('issuer-close');return{closed:true};},
    configuration:(input,requireSolverQuota=false)=>{assert.ok(!requireSolverQuota||Object.hasOwn(input,'solverMaximumInputAtomic'),'DEVICE_EXTERNAL_LOCAL_SOURCE_EXACT_SOLVER_QUOTA');return structuredClone(input);},exact:(v,names)=>{assert.ok(v&&!types.isProxy(v));assert.deepEqual(Reflect.ownKeys(v).sort(),[...names].sort());},types,sourceReview:async()=>{events.push('source-review');},fresh:()=>'06'.repeat(32),bare:v=>v.slice(2),
    createOwnedDeviceExternalFlatReceiverV1:async()=>{currentOperatorBindings=0;events.push('runtime-start');runtimeStarted.resolve();await runtimeFactoryGate.promise;return inertRuntime;},
    createOfficialProtocolFixture:async runtime=>{assert.equal(runtime,inertRuntime);asset.metadata.symbol='PALT';events.push('official-setup');return official;},assertOfficialProtocolFixture:()=>{},
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
  const multiRouters=Object.freeze(Array.from({length:4},(_,slot)=>Object.freeze({address:'0x'+String(31+slot).repeat(20)}))),multiObserver=Object.freeze({profile:'EXPLICIT_INERT_FOUR_ORIGINAL_READERS'});
  ports.createOwnedMetaMorphoGraphDeliveryBatchV4=async input=>{assert.equal(allowances.size,0);assert.equal(input.count,4);assert.equal(input.runtime,inertRuntime);assert.equal(input.protocolFixture,official);events.push('four-original-routers');return multiObserver;};ports.readOriginalMetaMorphoGraphBatchRoutersV4=(observer,input)=>{assert.equal(observer,multiObserver);assert.equal(input.runtime,inertRuntime);return multiRouters;};
  ports.createOriginalRetainedDeviceExternalFlatMultiGraphServiceV4=async input=>{assert.equal(allowances.size,0);assert.equal(input.account,originalAccount);assert.equal(input.deliveries.length,4);assert.deepEqual(input.deliveries.map(v=>v.dependsOn),[[],['device-external-share-0'],['device-external-share-0'],['device-external-share-1','device-external-share-2']]);assert.deepEqual(input.deliveries.map(v=>[v.maximumInput,v.shareAmount,v.payoutAmount]),Array.from({length:4},()=>['100','100','100']));assert.equal(events.includes('registry-created'),true);assert.equal(events.includes('issuer-created'),true);assert.equal(input.registry,registry);assert.equal(input.recoveryAuthority,authority);assert.equal(input.protocols,official);assert.equal(currentOperatorBindings,4);events.push('target-created','tls-created');return{descriptor:{profile:'EXPLICIT_INERT_HOST_SOURCE'},targetDescriptors:input.deliveries.map((v,slot)=>({profile:'EXPLICIT_INERT_HOST_TARGET',origin:v.origin,slot})),url:input.deliveries[0].origin,async close(){events.push('four-tls-close');return{closed:true,ownedSocketsRemaining:0,originalKeeperDrained:true};}};};
  const aaveFixture={...official},aaveRouter=Object.freeze({address:'0x'+'19'.repeat(20)}),aaveObserver=Object.freeze({});let aaveSelected=false;
  ports.createOfficialAaveFixtureV1=async runtime=>{assert.equal(runtime,inertRuntime);assert.equal(allowances.size,0);asset.metadata.symbol='USDC';events.push('aave-original-fixture');aaveSelected=true;return aaveFixture;};ports.assertOfficialAaveFixtureV1=(runtime,value)=>{assert.equal(runtime,inertRuntime);assert.equal(value,aaveFixture);};
  const metaRouter=ports.createOwnedPrivateExternalRouterV1;ports.createOwnedPrivateExternalRouterV1=async input=>{if(input.protocolKind==='AAVE_V3_STATIC_EXACT_SHARE_MINT'){assert.equal(input.protocolFixture,aaveFixture);assert.equal(allowances.size,0);events.push('aave-original-router');return aaveRouter;}return metaRouter(input);};
  ports.createOwnedAaveStaticGraphDeliveryObserverV1=async input=>{assert.equal(input.protocolFixture,aaveFixture);assert.equal(input.router,aaveRouter);assert.equal(input.runtime,inertRuntime);events.push('aave-original-observer');return aaveObserver;};
  const originalGraph=ports.createOriginalRetainedDeviceExternalFlatSourceGraphServiceV1;ports.createOriginalRetainedDeviceAaveStaticGraphServiceV1=async input=>{assert.equal(input.protocols,aaveFixture);assert.equal(input.router,aaveRouter);assert.equal(input.deliveryObserver,aaveObserver);assert.equal(input.account,originalAccount);assert.equal(allowances.size,0);assert.equal(currentOperatorBindings,4);events.push('aave-before-allowance');return originalGraph({...input,protocols:official});};
  const uniswapRouter=Object.freeze({address:'0x'+'22'.repeat(20)}),uniswapObserver=Object.freeze({});const selectedRouter=ports.createOwnedPrivateExternalRouterV1;
  ports.createOwnedPrivateExternalRouterV1=async input=>{if(input.protocolKind==='UNISWAP_V3_EXACT_OUTPUT_SINGLE'){assert.equal(input.protocolFixture,official);assert.equal(allowances.size,0);events.push('uniswap-original-router');return uniswapRouter;}return selectedRouter(input);};
  ports.createOwnedUniswapGraphDeliveryObserverV1=async input=>{assert.equal(input.protocolFixture,official);assert.equal(input.router,uniswapRouter);assert.equal(input.runtime,inertRuntime);assert.equal(allowances.size,0);events.push('uniswap-original-observer');return uniswapObserver;};
  ports.createOriginalRetainedDeviceUniswapGraphServiceV1=async input=>{assert.equal(input.protocols,official);assert.equal(input.router,uniswapRouter);assert.equal(input.deliveryObserver,uniswapObserver);assert.equal(input.account,originalAccount);assert.equal(allowances.size,0);assert.equal(currentOperatorBindings,4);events.push('uniswap-before-allowance');return originalGraph(input);};
  ports.createOwnedDeviceExternalFlatSourceReceiverV2=ports.createOwnedDeviceExternalFlatReceiverV1;
  ports.reserveOriginalDeviceGraphSourceBirthV3=async(uniswap,pub)=>{assert.equal(uniswap,true);assert.equal(pub,'04'+'12'.repeat(64));assert.equal(allowances.size,0);events.push('paired-source-birth-before-runtime');};
  ports.createOriginalRetainedDeviceUniswapGraphSourceServiceV3=async input=>{assert.equal(input.maximumSolverInput,'200');assert.equal(allowances.size,0);events.push('source-exact-quota-before-allowance');return ports.createOriginalRetainedDeviceUniswapGraphServiceV1(input);};
  const {create,createMulti,createAave,createUniswap,createSourceUniswap}=await new AsyncFunction(...Object.keys(ports),privateDirectory+constructor+'\nreturn{create:createOriginalDeviceExternalFlatLocalOperatorV1,createMulti:createOriginalDeviceMetaFourLocalOperatorV1,createAave:createOriginalDeviceAaveStaticLocalOperatorV1,createUniswap:createOriginalDeviceUniswapLocalOperatorV1,createSourceUniswap:input=>localOperator(input,false,false,false,false,true,true,3)};')(...Object.values(ports));
  const config={origin:'https://localhost:9447',devicePublicKey:'04'+'12'.repeat(64),depositAmountAtomic:'500',tls:{certificate:'EXPLICIT_INERT_CERT',privateKey:'EXPLICIT_INERT_TLS_KEY'}};
  const configPath=join(directory,'operator.json');await writeFile(configPath,JSON.stringify(config),{mode:0o600});
  const fakeProcess=new EventEmitter();Object.assign(fakeProcess,{execPath:fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node',appURL)),execArgv:['--max-old-space-size=384'],env:{},getuid:()=>process.getuid(),stdout:{write:value=>events.push(...value.trim().split('\n'))},stderr:{write:value=>events.push(value.trim())}});fakeProcess.argv=[fakeProcess.execPath,fileURLToPath(appURL)];
  const start=caller.indexOf('async function run(){'),end=caller.indexOf('\nawait run();',start);assert.ok(start>=0&&end>start);
  let body=caller.slice(start,end).replaceAll('import.meta.url','appURL');
  const originalImport="await import('@lianum/backend/operations/local/device-external-flat-local-operator-v1')";assert.equal(body.split(originalImport).length,2);body=body.replace(originalImport,'inertOriginal');
  const helpers=caller.slice(caller.indexOf('async function privateConfiguration(path){'),start);
  const cliPorts={assert,constants,open,lstat,realpath:async path=>path===fileURLToPath(appURL)?path:realpath(path),dirname,join,fileURLToPath,URL,Buffer,appURL:appURL.href,process:fakeProcess,
    createHash,X509Certificate:class InertPublicCertificate{constructor(value){assert.equal(value,'EXPLICIT_INERT_CERT');this.raw=Buffer.from('EXPLICIT_INERT_PUBLIC_CERTIFICATE_DER');}},
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
  // either allowance, publishes DATA descriptors and installs original ordered capture.
  await mkdir(ports.multiFourLocal,{mode:0o700});events.length=0;allowances.clear();inertRuntime.lifecycle=[];
  const fourConfig={...config,targetOrigins:[0,1,2,3].map(i=>'https://localhost:'+(9447+i))},four=await createMulti(fourConfig);
  assert.equal(four.profile,'DEVICE_EXTERNAL_FLAT_MULTI_GRAPH_V4');assert.equal(four.targetDescriptors.length,4);assert.equal(four.automaticFunding,false);assert.equal(four.orderedCaptureAvailable,true);assert.equal(typeof four.capture,'function');assert.equal(four.abruptRecoveryEstablished,false);assert.equal(events.indexOf('tls-created')<events.indexOf('exact-approve'),true);
  assert.equal(events.filter(v=>v==='exact-approve').length,5);for(const r of multiRouters)assert.equal(allowances.get(r.address),100n);assert.deepEqual(four.deliveries.map(v=>v.origin),fourConfig.targetOrigins);await four.close();assert.equal(events.indexOf('four-tls-close')<events.indexOf('runtime-close'),true);await assert.rejects(lstat(join(ports.multiFourLocal,'active.lock')),{code:'ENOENT'});
  await assert.rejects(createMulti({...fourConfig,targetOrigins:[...fourConfig.targetOrigins.slice(0,3),fourConfig.origin]}));await assert.rejects(createMulti({...fourConfig,depositAmountAtomic:'501'}));
  // The original CLI selects only --meta-four before birth and publishes four
  // separate pairing descriptors; it never creates a proof or funds a note.
  const fourConfigPath=join(ports.multiFourLocal,'operator.json');await writeFile(fourConfigPath,JSON.stringify(fourConfig),{mode:0o600});let publishedFour;
  Object.assign(cliPorts.inertOriginal,{originalDeviceMetaFourLocalConfigurationPathV1:()=>fourConfigPath,async createOriginalDeviceMetaFourLocalOperatorV1(input){publishedFour=await createMulti(input);return publishedFour;}});
  fakeProcess.argv=[fakeProcess.execPath,fileURLToPath(appURL),'--meta-four'];events.length=0;allowances.clear();inertRuntime.lifecycle=[];await run();assert.equal(events.includes('ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_READY'),true);
  for(let slot=0;slot<4;slot++){const file=join(ports.multiFourLocal,'paired-share-slot-'+slot+'.json');assert.deepEqual(JSON.parse(await readFile(file,'utf8')),publishedFour.targetDescriptors[slot]);assert.equal((await lstat(file)).mode&0o777,0o600);}
  const packetPath=join(ports.multiFourLocal,'paired-meta-four.json'),packet=JSON.parse(await readFile(packetPath,'utf8'));assert.equal((await lstat(packetPath)).mode&0o777,0o600);assert.deepEqual(packet,{profile:'DEVICE_EXTERNAL_FLAT_META_FOUR_PAIRING_V1',source:publishedFour.descriptor,targets:publishedFour.targetDescriptors,deliveries:publishedFour.deliveries});assert.equal(events.filter(v=>v==='exact-approve').length,5);
  assert.deepEqual(JSON.parse(await readFile(join(ports.multiFourLocal,'paired-descriptor.json'),'utf8')),publishedFour.descriptor);await assert.rejects(lstat(join(ports.multiFourLocal,'paired-share-descriptor.json')),{code:'ENOENT'});await publishedFour.close();await assert.rejects(lstat(join(ports.multiFourLocal,'active.lock')),{code:'ENOENT'});
  // Fixed Aave selection uses the existing private device producers and SAME
  // native bindings before either exact infrastructure allowance. No funding
  // or Linux note custodian exists in these explicit inert ports.
  await mkdir(ports.aaveLocal,{mode:0o700});events.length=0;allowances.clear();inertRuntime.lifecycle=[];
  const aave=await createAave(config);assert.equal(aaveSelected,true);assert.equal(aave.profile,'AAVE_STATIC_PRIVATE_SHARE_MINT_V1');assert.equal(aave.automaticFunding,false);assert.equal(aave.orderedCaptureAvailable,true);assert.equal(events.indexOf('aave-before-allowance')<events.indexOf('exact-approve'),true);assert.equal(events.filter(v=>v==='exact-approve').length,2);await aave.close();await assert.rejects(lstat(join(ports.aaveLocal,'active.lock')),{code:'ENOENT'});
  const aaveConfigPath=join(ports.aaveLocal,'operator.json');await writeFile(aaveConfigPath,JSON.stringify(config),{mode:0o600});let publishedAave;
  Object.assign(cliPorts.inertOriginal,{originalDeviceAaveStaticLocalConfigurationPathV1:()=>aaveConfigPath,async createOriginalDeviceAaveStaticLocalOperatorV1(input){publishedAave=await createAave(input);return publishedAave;}});
  fakeProcess.argv=[fakeProcess.execPath,fileURLToPath(appURL),'--aave-static'];events.length=0;allowances.clear();inertRuntime.lifecycle=[];await run();assert.equal(events.includes('ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_READY'),true);const aavePacket=join(ports.aaveLocal,'paired-aave-static.json');assert.equal((await lstat(aavePacket)).mode&0o777,0o600);assert.deepEqual(JSON.parse(await readFile(aavePacket,'utf8')),{profile:'DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1',source:publishedAave.descriptor,target:publishedAave.targetDescriptor});assert.equal(events.filter(v=>v==='exact-approve').length,2);await publishedAave.close();
  // Fixed exact-output Uniswap actors and independent output asset exist
  // before either infrastructure allowance; no receipt, proof or funding is manufactured.
  await mkdir(ports.uniswapLocal,{mode:0o700});events.length=0;allowances.clear();inertRuntime.lifecycle=[];
  const uniswap=await createUniswap(config);assert.equal(uniswap.profile,'UNISWAP_PRIVATE_OUTPUT_NOTE_V1');assert.equal(uniswap.automaticFunding,false);assert.equal(uniswap.orderedCaptureAvailable,true);assert.equal(events.indexOf('uniswap-before-allowance')<events.indexOf('exact-approve'),true);assert.equal(events.filter(v=>v==='exact-approve').length,2);await uniswap.close();await assert.rejects(lstat(join(ports.uniswapLocal,'active.lock')),{code:'ENOENT'});
  const uniswapConfigPath=join(ports.uniswapLocal,'operator.json');await writeFile(uniswapConfigPath,JSON.stringify(config),{mode:0o600});let publishedUniswap;
  Object.assign(cliPorts.inertOriginal,{originalDeviceUniswapLocalConfigurationPathV1:()=>uniswapConfigPath,async createOriginalDeviceUniswapLocalOperatorV1(input){publishedUniswap=await createUniswap(input);return publishedUniswap;}});
  fakeProcess.argv=[fakeProcess.execPath,fileURLToPath(appURL),'--uniswap-v3'];events.length=0;allowances.clear();inertRuntime.lifecycle=[];await run();assert.equal(events.includes('ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_READY'),true);const uniswapPacket=join(ports.uniswapLocal,'paired-uniswap-v3.json');assert.equal((await lstat(uniswapPacket)).mode&0o777,0o600);assert.deepEqual(JSON.parse(await readFile(uniswapPacket,'utf8')),{profile:'DEVICE_EXTERNAL_FLAT_UNISWAP_PAIRING_V1',source:publishedUniswap.descriptor,target:publishedUniswap.targetDescriptor});assert.equal(events.filter(v=>v==='exact-approve').length,2);await publishedUniswap.close();
  // The original source constructor must separate the deposit approval from
  // its SAME route quota before FUND. Old allowance500 covered route200 but
  // violates the original SOLVER_EXACT_APPROVAL equality. No late approve.
  events.length=0;allowances.clear();inertRuntime.lifecycle=[];routerQuota=200n;
  await assert.rejects(createSourceUniswap(config),/DEVICE_EXTERNAL_LOCAL_SOURCE_EXACT_SOLVER_QUOTA/);
  assert.equal(events.length,0);assert.equal(allowances.size,0);
  const sourceConfig={...config,solverMaximumInputAtomic:'200'},source=await createSourceUniswap(sourceConfig);
  assert.equal(source.automaticFunding,false);assert.equal(source.sourceObservationImplemented,true);
  assert.equal(allowances.get('0x'+'11'.repeat(20)),500n);assert.equal(allowances.get(uniswapRouter.address),200n);
  assert.equal(events.filter(v=>v==='exact-approve').length,2);
  assert.ok(events.indexOf('paired-source-birth-before-runtime')<events.indexOf('runtime-start'));
  assert.ok(events.indexOf('source-exact-quota-before-allowance')<events.indexOf('exact-approve'));
  const {validateDeviceGraphPreparationTermsV1}=await import('../../../src/operations/local/device-graph-preparation-terms-v1.mjs');
  const {prepareOriginalDeviceExternalFlatGraphWorkspaceV1}=await import('../../../src/operations/local/device-external-flat-source-graph-service-v1.mjs');
  let preparings=0;const workspace=Object.freeze({}),bridge=Object.freeze({}),ws={bridge,preparing:false,poisoned:false,multi:null,originalAave:false,originalBlue:false,maximumSolverInput:'200',prepared:null};
  const guard=async(w,b,terms)=>{assert.equal(w,workspace);const q=validateDeviceGraphPreparationTermsV1(ws,b,terms);preparings++;return q;};
  await assert.rejects(prepareOriginalDeviceExternalFlatGraphWorkspaceV1(workspace,bridge,{}),/DEVICE_EXTERNAL_GRAPH_WORKSPACE/);
  const terms={assetAmount:'100',shareAmount:'100',payoutAmount:'100',validFrom:'1',settleBefore:'1000'};
  await assert.rejects(guard(workspace,bridge,terms),/DEVICE_EXTERNAL_GRAPH_EXACT_SOLVER_ALLOWANCE/);assert.equal(preparings,0);
  assert.equal((await guard(workspace,bridge,{...terms,assetAmount:'200'})).assetAmount,'200');assert.equal(preparings,1);
  await assert.rejects(guard(workspace,bridge,{...terms,assetAmount:'500'}),/DEVICE_EXTERNAL_GRAPH_EXPLICIT_SOLVER_ALLOWANCE/);assert.equal(preparings,1);
  const approvalsBeforeClose=events.filter(v=>v==='exact-approve').length;await source.close();assert.equal(events.filter(v=>v==='exact-approve').length,approvalsBeforeClose);
  routerQuota=500n;
  // Failure before listener publication still closes the actual acquired
  // account/runtime and never treats close()'s status as a stop receipt.
  events.length=0;bindFailure=true;missingStopReceipt=true;allowances.clear();inertRuntime.lifecycle=[];
  await assert.rejects(create(config),error=>error instanceof AggregateError&&error.message==='DEVICE_EXTERNAL_LOCAL_START_CLEANUP_UNCONFIRMED');
  assert.equal((await lstat(join(directory,'active.lock'))).isFile(),true);
  assert.equal(events.includes('ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_READY'),false);
});



// Original constructor body: these boundary ports cannot issue an account,
// provider, proof or transaction. Existing product lifecycle above exercises
// real private files, actual CLI and the SAME before-allowance sequencing.



// Actual financial caller method; all capabilities below are explicitly inert
// HOST references. This proves fixed before-funding composition/lifecycle only.
test('HOST original Aave financial caller preserves private factories and drains a cancelled before-funding acquisition',async()=>{
 const root=resolve(FLAT,'../../..'),hostPath=generated?join(FLAT,'flat-wallet/integration/device-external-flat-erc20-host-vault-v1.mjs'):join(root,'tests/integration/wallet/native/device-external-flat-erc20-host-vault-v1.mjs'),source=await readFile(hostPath,'utf8');
 const start=source.indexOf('   startAaveGraph('),end=source.indexOf('   startRetained(',start);assert.ok(start>=0&&end>start);const method=source.slice(start,end).trim().replace(/,$/,'');
 const runtime=Object.freeze({}),system=Object.freeze({}),quorum=Object.freeze({}),router=Object.freeze({}),deliveryObserver=Object.freeze({}),rule=Object.freeze({}),rulePath=Object.freeze({}),registry=Object.freeze({}),authority=Object.freeze({}),protocols=Object.freeze({}),account=Object.freeze({}),targetAccount=Object.freeze({}),descriptor=Object.freeze({id:'EXPLICIT_INERT_SOURCE'}),targetDescriptor=Object.freeze({id:'EXPLICIT_INERT_SHARE'}),events=[],state={closed:false};let gated=false;
 const held=deferred(),service=Object.freeze({descriptor,targetDescriptor,async close(){events.push('same-service-closed');return{closed:true};}}),vault=Object.freeze({}),sdk=Object.freeze({createDeviceExternalFlatNoteApiV1:q=>{assert.ok(q.descriptor===descriptor||q.descriptor===targetDescriptor);events.push('note-sdk');return Object.freeze({});}}),graphSdk=Object.freeze({createDeviceExternalFlatGraphApiV1:q=>{assert.equal(q.descriptor,descriptor);events.push('graph-sdk');return Object.freeze({});}}),blueSdk=Object.freeze({createDeviceAaveStaticRedemptionApiV1:q=>{assert.equal(q.descriptor,targetDescriptor);events.push('aave-sdk');return Object.freeze({});}});
 const ports={assert,live:()=>assert.equal(state.closed,false),starting:null,originalAave:false,origin:'EXPLICIT_INERT_ORIGIN',devicePublicKey:'EXPLICIT_INERT_PUBLIC',graphAccounts:null,service:null,state,graphRetained:false,originalDescriptor:null,originalShareDescriptor:null,targetVault:null,client:null,targetClient:null,graphClient:null,aaveClient:null,sdk,graphSdk,blueSdk,fetchFixed:()=>{throw Error('HOST_NO_HTTP');},certificate:'EXPLICIT_INERT_CERTIFICATE',readFileSync:()=> 'EXPLICIT_INERT_TLS',keyPath:'EXPLICIT_INERT_PATH',vaultURL:'EXPLICIT_INERT_VAULT',
  async createOriginalDeviceExternalFlatPrivateNoteAuthorityV3(q){assert.equal(q.runtime,runtime);assert.equal(q.system,system);assert.equal(q.poolIndex,0);events.push('source-before-fund');return account;},
  async createOriginalDeviceExternalFlatPrivateShareNoteAuthorityV3(q){assert.equal(q.runtime,runtime);assert.equal(q.system,system);assert.equal(q.deliveryObserver,deliveryObserver);assert.equal(q.poolIndex,1);events.push('share-before-fund');return targetAccount;},
  async createOriginalRetainedDeviceAaveStaticGraphServiceV1(q){for(const [k,v]of Object.entries({account,targetAccount,runtime,system,quorum,router,deliveryObserver,rule,rulePath,registry,recoveryAuthority:authority,protocols}))assert.equal(q[k],v,k);assert.equal(q.maximumSolverInput,'100');events.push('aave-original-service-before-fund');if(gated)await held.promise;return service;},
  async hostVaultImport(path){assert.equal(path,'EXPLICIT_INERT_VAULT');return{async createDeviceExternalFlatRoutedNoteVaultV1(value){assert.equal(value,targetDescriptor);events.push('same-share-vault');return vault;}};}};
 assert.equal(method.includes('await import(vaultURL)'),true);const body=method.replace('(await import(vaultURL))','(await hostVaultImport(vaultURL))');const make=()=>new AsyncFunction(...Object.keys(ports),'return{'+body+'};')(...Object.values(ports)),args=[runtime,system,quorum,router,deliveryObserver,rule,rulePath,registry,authority,protocols];
 let caller=await make();assert.throws(()=>caller.startAaveGraph(...args.slice(0,9)));assert.equal(events.length,0);const born=await caller.startAaveGraph(...args);assert.equal(born.account,account);assert.equal(born.targetAccount,targetAccount);assert.equal(born.service,service);assert.equal(born.targetVault,vault);assert.deepEqual(events,['source-before-fund','share-before-fund','aave-original-service-before-fund','same-share-vault','note-sdk','note-sdk','graph-sdk','aave-sdk']);
 caller=await make();events.length=0;gated=true;const pending=caller.startAaveGraph(...args);await new Promise(resolve=>setImmediate(resolve));state.closed=true;held.resolve();await assert.rejects(pending,/DEVICE_EXTERNAL_FLAT_HOST_CLOSED/);assert.deepEqual(events,['source-before-fund','share-before-fund','aave-original-service-before-fund','same-service-closed']);
});



test('HOST original Uniswap financial caller preserves private factories and drains a cancelled before-funding acquisition',async()=>{
 const root=resolve(FLAT,'../../..'),hostPath=generated?join(FLAT,'flat-wallet/integration/device-external-flat-erc20-host-vault-v1.mjs'):join(root,'tests/integration/wallet/native/device-external-flat-erc20-host-vault-v1.mjs'),source=await readFile(hostPath,'utf8');
 const start=source.indexOf('   startUniswapGraph('),end=source.indexOf('   startRetained(',start);assert.ok(start>=0&&end>start);const method=source.slice(start,end).trim().replace(/,$/,'');
 const runtime=Object.freeze({}),system=Object.freeze({}),quorum=Object.freeze({}),router=Object.freeze({}),deliveryObserver=Object.freeze({}),rule=Object.freeze({}),rulePath=Object.freeze({}),registry=Object.freeze({}),authority=Object.freeze({}),protocols=Object.freeze({}),account=Object.freeze({}),targetAccount=Object.freeze({}),descriptor=Object.freeze({id:'EXPLICIT_INERT_SOURCE'}),targetDescriptor=Object.freeze({id:'EXPLICIT_INERT_SHARE'}),events=[],state={closed:false};let gated=false;
 const held=deferred(),service=Object.freeze({descriptor,targetDescriptor,async close(){events.push('same-service-closed');return{closed:true};}}),vault=Object.freeze({}),sdk=Object.freeze({createDeviceExternalFlatNoteApiV1:q=>{assert.ok(q.descriptor===descriptor||q.descriptor===targetDescriptor);events.push('note-sdk');return Object.freeze({});}}),graphSdk=Object.freeze({createDeviceExternalFlatGraphApiV1:q=>{assert.equal(q.descriptor,descriptor);events.push('graph-sdk');return Object.freeze({});}}),blueSdk=Object.freeze({createDeviceAaveStaticRedemptionApiV1:q=>{assert.equal(q.descriptor,targetDescriptor);events.push('aave-sdk');return Object.freeze({});}});
 const ports={assert,live:()=>assert.equal(state.closed,false),starting:null,originalAave:false,origin:'EXPLICIT_INERT_ORIGIN',devicePublicKey:'EXPLICIT_INERT_PUBLIC',graphAccounts:null,service:null,state,graphRetained:false,originalDescriptor:null,originalShareDescriptor:null,targetVault:null,client:null,targetClient:null,graphClient:null,aaveClient:null,sdk,graphSdk,blueSdk,fetchFixed:()=>{throw Error('HOST_NO_HTTP');},certificate:'EXPLICIT_INERT_CERTIFICATE',readFileSync:()=> 'EXPLICIT_INERT_TLS',keyPath:'EXPLICIT_INERT_PATH',vaultURL:'EXPLICIT_INERT_VAULT',
  async createOriginalDeviceExternalFlatPrivateNoteAuthorityV3(q){assert.equal(q.runtime,runtime);assert.equal(q.system,system);assert.equal(q.poolIndex,0);events.push('source-before-fund');return account;},
  async createOriginalDeviceExternalFlatPrivateShareNoteAuthorityV3(q){assert.equal(q.runtime,runtime);assert.equal(q.system,system);assert.equal(q.deliveryObserver,deliveryObserver);assert.equal(q.poolIndex,1);events.push('share-before-fund');return targetAccount;},
  async createOriginalRetainedDeviceUniswapGraphServiceV1(q){for(const [k,v]of Object.entries({account,targetAccount,runtime,system,quorum,router,deliveryObserver,rule,rulePath,registry,recoveryAuthority:authority,protocols}))assert.equal(q[k],v,k);assert.equal(q.maximumSolverInput,'200');events.push('uniswap-original-service-before-fund');if(gated)await held.promise;return service;},
  async hostVaultImport(path){assert.equal(path,'EXPLICIT_INERT_VAULT');return{async createDeviceExternalFlatRoutedNoteVaultV1(value){assert.equal(value,targetDescriptor);events.push('same-share-vault');return vault;}};}};
 assert.equal(method.includes('await import(vaultURL)'),true);const body=method.replace('(await import(vaultURL))','(await hostVaultImport(vaultURL))');const make=()=>new AsyncFunction(...Object.keys(ports),'return{'+body+'};')(...Object.values(ports)),args=[runtime,system,quorum,router,deliveryObserver,rule,rulePath,registry,authority,protocols];
 let caller=await make();assert.throws(()=>caller.startUniswapGraph(...args.slice(0,9)));assert.equal(events.length,0);const born=await caller.startUniswapGraph(...args);assert.equal(born.account,account);assert.equal(born.targetAccount,targetAccount);assert.equal(born.service,service);assert.equal(born.targetVault,vault);assert.deepEqual(events,['source-before-fund','share-before-fund','uniswap-original-service-before-fund','same-share-vault','note-sdk','note-sdk','graph-sdk']);
 caller=await make();events.length=0;gated=true;const pending=caller.startUniswapGraph(...args);await new Promise(resolve=>setImmediate(resolve));state.closed=true;held.resolve();await assert.rejects(pending,/DEVICE_EXTERNAL_FLAT_HOST_CLOSED/);assert.deepEqual(events,['source-before-fund','share-before-fund','uniswap-original-service-before-fund','same-service-closed']);
});
