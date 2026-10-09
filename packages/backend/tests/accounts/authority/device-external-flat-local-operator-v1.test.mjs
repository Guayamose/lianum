/** HOST lifecycle regression, not a financial/bootstrap acceptance. The exact
 * caller/constructor bodies run with real private files and explicit inert
 * runtime/token/system/account/TLS ports. No process, key or proof is created. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {mkdtemp,writeFile,readFile,open,lstat,realpath,unlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
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
  const marker='export async function createOriginalDeviceExternalFlatLocalOperatorV1(input){';assert.equal(backend.split(marker).length,2);
  const constructor=backend.slice(backend.indexOf(marker)).replace('export async function','async function');
  const privateDirectory=backend.slice(backend.indexOf('async function physicalDirectory(path){'),backend.indexOf('async function sourceReview(){'));
  const runtimeFactoryGate=deferred(),runtimeStarted=deferred(),tlsCloseGate=deferred(),tlsCloseStarted=deferred();
  const events=[];let allowance=0n,bindFailure=false,missingStopReceipt=false,tlsClosing=false;
  const inertRuntime={metadata:{chainId:'31337',evmGenesis:'0x'+'01'.repeat(32)},lifecycle:[],async block(){return{number:'1'};},
    async close(options){assert.deepEqual(options,{removeScratch:false});events.push('runtime-close');
      if(!missingStopReceipt)this.lifecycle.push({event:'stopped-owned-process',stopped:true,forced:false,pid:2147483646,scratchRemoved:false});
      return{stopped:true}; // deliberately insufficient without the original lifecycle receipt
    }};
  const asset={metadata:{symbol:'USDC',decimals:6},async allowance(){return allowance;},async balance(){return 1000n;}};
  const official={first:{address:'0x'+'02'.repeat(20),receipt:{transactionHash:'0x'+'03'.repeat(32)},code:'0x12'},vault:{address:'0x'+'04'.repeat(20),receipt:{transactionHash:'0x'+'05'.repeat(32)},code:'0x34'},
    async read(contract,method){return[method==='symbol'?'USDC':6];},async send(contract,method,args){assert.equal(method,'approve');assert.equal(contract,this.first);assert.equal(events.includes('account-created'),true);assert.equal(events.includes('tls-created'),false);assert.equal(args[1],500n);allowance=args[1];events.push('exact-approve');}};
  let originalAccount;
  const ports={assert,constants,open,lstat:async path=>path==='/proc/2147483646'?Promise.reject(Object.assign(Error('EXPLICIT_INERT_PID_ABSENT'),{code:'ENOENT'})):lstat(path),realpath,unlink,join,local:directory,process,
    configuration:input=>structuredClone(input),sourceReview:async()=>{events.push('source-review');},fresh:()=>'06'.repeat(32),bare:v=>v.slice(2),
    createOwnedNativeEconomicReceiverV2:async()=>{events.push('runtime-start');runtimeStarted.resolve();await runtimeFactoryGate.promise;return inertRuntime;},
    createOfficialProtocolFixture:async runtime=>{assert.equal(runtime,inertRuntime);events.push('official-setup');return official;},assertOfficialProtocolFixture:()=>{},
    createOwnedPoolAsset:async()=>asset,evmRuntimeCodeHash:()=>'0x'+'07'.repeat(32),derivePrivateAssetIdentity:()=>'0x'+'08'.repeat(32),nativeAdmissionRulesTree:()=>({root:'09'.repeat(32)}),
    createLocalFlatOperator:({signerIndex})=>{let closed=false;return{publicKey:'actor'+signerIndex,status:()=>({bound:false,certifiedInventoryCount:0,closed}),async close(){closed=true;}};},
    deployFlatSystem:async(runtime,input)=>{assert.equal(runtime,inertRuntime);return{sender:'0x'+'10'.repeat(20),pools:[{address:'0x'+'11'.repeat(20),assetCapability:asset}],bootstrap:{poolsUnfunded:true,constructorStorageMatched:true,completeRuntimesMatched:true},verifiers:Object.fromEntries(Array.from({length:12},(_,i)=>[i,{}]))};},assertOwnedFlatSystem:()=>{},
    createOriginalDeviceExternalFlatNoteAuthorityV1:async input=>{assert.equal(input.devicePublicKey,'04'+'12'.repeat(64));assert.equal(allowance,0n);events.push('account-created');originalAccount={async close(){events.push('account-close');return{closed:true,inFlight:0};}};return originalAccount;},
    createOriginalDeviceExternalFlatTlsServerV1:async input=>{assert.equal(input.account,originalAccount);assert.equal(allowance,500n);events.push('tls-created');if(bindFailure)throw Error('EXPLICIT_INERT_BIND_FAILURE');return{descriptor:{profile:'EXPLICIT_INERT_HOST_DESCRIPTOR'},url:input.origin,
      async close(){events.push('tls-close');tlsClosing=true;tlsCloseStarted.resolve();await tlsCloseGate.promise;return{closed:true,ownedSocketsRemaining:0,originalOperationsInFlight:0};}};},
  };
  const create=await new AsyncFunction(...Object.keys(ports),privateDirectory+constructor+'\nreturn createOriginalDeviceExternalFlatLocalOperatorV1;')(...Object.values(ports));
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
  assert.equal(events.indexOf('account-created')<events.indexOf('exact-approve'),true);assert.equal(events.indexOf('exact-approve')<events.indexOf('tls-created'),true);
  assert.equal(events.indexOf('tls-close')<events.indexOf('runtime-close'),true);assert.equal(fakeProcess.exitCode,undefined);
  await assert.rejects(lstat(join(directory,'paired-descriptor.json')),{code:'ENOENT'});await assert.rejects(lstat(join(directory,'active.lock')),{code:'ENOENT'});
  // Failure before listener publication still closes the actual acquired
  // account/runtime and never treats close()'s status as a stop receipt.
  bindFailure=true;missingStopReceipt=true;allowance=0n;inertRuntime.lifecycle=[];
  await assert.rejects(create(config),error=>error instanceof AggregateError&&error.message==='DEVICE_EXTERNAL_LOCAL_START_CLEANUP_UNCONFIRMED');
  assert.equal((await lstat(join(directory,'active.lock'))).isFile(),true);
  assert.equal(events.includes('ORIGINAL_DEVICE_EXTERNAL_FLAT_LOCAL_READY'),false);
});
