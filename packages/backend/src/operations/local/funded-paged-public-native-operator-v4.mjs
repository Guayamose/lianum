/** One fixed PUBLIC product composition. Locators/configuration are operator
 * data, never substitutes for original runtime, deployment or journal tokens.
 * Controlled recovery retains the same source, protected keys and economics. */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {readOriginalPagedRemoteIngressBindingV4} from '../../api/mobile/paged-remote-ingress-binding-v4.mjs';
import {prepareOriginalDevicePagedSepoliaGraphOperatorV4,reopenOriginalDevicePagedSepoliaGraphOperatorV4,listenOriginalDevicePagedSepoliaGraphOperatorV4,quiesceOriginalDevicePagedSepoliaGraphOperatorV4,captureOriginalDevicePagedSepoliaGraphOperatorV4,readOriginalDevicePagedGraphExecutionContextV3} from './funded-graph-paged-device-graph-operator-v3.mjs';
import * as originalGraphOperatorOwner from './funded-graph-paged-device-graph-operator-v3.mjs';
import {createOriginalPagedPublicSupervisorRetentionV4,openOriginalPagedPublicSupervisorRetentionV4} from '../recovery/paged-runtime-recovery-authority-v3.mjs';
import {emitOriginalDevicePagedProviderRetentionV3} from '../../accounts/authority/device-paged-note-authority-v3.mjs';
import {assertOriginalPagedNativeFinancialSourceV3} from './funded-paged-native-source-v3.mjs';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
const owned=new WeakMap();
let nativeOwner,providerOwner;
async function owners(){nativeOwner??=await import('../../providers/paged-public-testnet-runtimes-v1.mjs');providerOwner??=await import('../../providers/funded-paged-native-provider-v3.mjs');return{native:nativeOwner,provider:providerOwner};}
const locators=['nativeDirectory','providerDirectory','supervisorDirectory','journal','devicePublicKey'];
const clone=value=>structuredClone(value),freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function configuration(raw,opening){
 P.pagedOwnerExactV3(raw,[...locators,...(opening?[]:['deployment','networkConfiguration','bootstrapApproval','sourcePolicy'])]);P.pagedOwnerExactV3(raw.journal,['path','password']);const data=clone(raw);
 for(const key of [...locators.filter(key=>key.endsWith('Directory'))])assert.ok(typeof data[key]==='string'&&data[key]===resolve(data[key])&&data[key].length<4096,'PAGED_PUBLIC_PRODUCT_PRIVATE_PATH');
 assert.equal(new Set([data.nativeDirectory,data.providerDirectory,data.supervisorDirectory]).size,3,'PAGED_PUBLIC_PRODUCT_PRIVATE_ALIAS');assert.ok(typeof data.journal.path==='string'&&data.journal.path===resolve(data.journal.path)&&data.journal.path.length<4096);assert.ok(typeof data.journal.password==='string'&&data.journal.password.length>=32&&data.journal.password.length<=4096);assert.match(data.devicePublicKey,/^04[0-9a-f]{128}$/);
 if(!opening){P.pagedOwnerExactV3(data.deployment,['manifestSHA256','consumerSHA256','deploymentDomain','policy','minimumDepositAtomic']);P.pagedOwnerExactV3(data.networkConfiguration,['networks']);P.pagedOwnerExactV3(data.bootstrapApproval,['maximumTotalFeeAtomic','expiresAt']);P.pagedOwnerExactV3(data.sourcePolicy,['maximumFeePerTransactionAtomic','maximumTotalFeeAtomic','maximumValuePerTransactionAtomic','maximumTotalValueAtomic','expiresAt']);assert.ok(Number.isSafeInteger(data.sourcePolicy.expiresAt)&&Date.now()<data.sourcePolicy.expiresAt&&data.sourcePolicy.expiresAt<=Date.now()+9*60*60*1000,'PAGED_PUBLIC_PRODUCT_NEW_SPONSOR_DEADLINE');}
 return data;
}
/** Explicit NEW server key initialization. Existing or partial keys reject and
 * are never silently replaced by startup, reopening or an HTTP request. */
export async function initializeOriginalPagedPublicNativeOperatorKeysV4(raw){
 assert.equal(arguments.length,1);P.pagedOwnerExactV3(raw,['nativeDirectory']);assert.equal(resolve(raw.nativeDirectory),raw.nativeDirectory);const K=await import('../../chains/public-testnet/key-store-v1.mjs');return K.initializePublicPagedServerKeysV1(join(raw.nativeDirectory,'keys'));
}
/** Optional cancellation is an actual AbortSignal, never financial authority. */
export async function startOriginalPagedPublicNativeOperatorV4(raw,ingress,signal){assert.ok(arguments.length===2||arguments.length===3);return openProduct(raw,ingress,false,signal);}
export async function reopenOriginalPagedPublicNativeOperatorV4(raw,ingress,signal){assert.ok(arguments.length===2||arguments.length===3);return openProduct(raw,ingress,true,signal);}
const originalAbortRead=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get,originalAbortAdd=EventTarget.prototype.addEventListener,originalAbortRemove=EventTarget.prototype.removeEventListener;
function originalSignal(signal){if(signal!==undefined){assert.ok(signal&&typeof signal==='object','PAGED_PUBLIC_PRODUCT_ABORT_SIGNAL');try{originalAbortRead.call(signal);}catch{assert.fail('PAGED_PUBLIC_PRODUCT_ABORT_SIGNAL');}}return signal;}
async function openProduct(raw,ingress,opening,signal){
 originalSignal(signal);
 const abortFailure=()=>Error('PAGED_PUBLIC_PRODUCT_START_ABORTED');let aborted=signal!==undefined&&originalAbortRead.call(signal);if(aborted)throw abortFailure();
 const input=configuration(raw,opening),transport=readOriginalPagedRemoteIngressBindingV4(ingress);let O;
 let native,provider,receiver,system,service,supervisor,product,captureResult,capturing,closing,phoneCreating=false,phoneWork=null,phoneAborted=false,closed=false,operatorPassword=input.journal.password;
 const privateSupervisor={directory:input.supervisorDirectory,password:input.journal.password};let abortReceiverClose=null,abortNativeClose=null;
 function abortAcquisition(){aborted=true;if(receiver&&!abortReceiverClose){try{abortReceiverClose=Promise.resolve(receiver.close());}catch(error){abortReceiverClose=Promise.reject(error);}abortReceiverClose.catch(()=>{});}else if(!receiver&&native&&!abortNativeClose){try{abortNativeClose=Promise.resolve(native.close());}catch(error){abortNativeClose=Promise.reject(error);}abortNativeClose.catch(()=>{});}}
 function acquired(){if(aborted||signal!==undefined&&originalAbortRead.call(signal)){abortAcquisition();throw abortFailure();}}
 if(signal!==undefined)originalAbortAdd.call(signal,'abort',abortAcquisition,{once:true});
 async function dispose(){const failures=[];let receiverClose=abortReceiverClose;if(receiver&&!receiverClose){try{receiverClose=Promise.resolve(receiver.close());}catch(error){receiverClose=Promise.reject(error);}receiverClose.catch(()=>{});}for(const resource of [service,provider])try{await resource?.close();}catch(error){failures.push(error);}try{await receiverClose;}catch(error){failures.push(error);}try{if(abortNativeClose)await abortNativeClose;else await native?.close();}catch(error){failures.push(error);}try{await supervisor?.close();}catch(error){failures.push(error);}operatorPassword=null;if(failures.length)throw new AggregateError(failures,'PAGED_PUBLIC_PRODUCT_CLOSE_FAILED');}
 async function capture(){
  if(captureResult)return captureResult;if(capturing)return capturing;assert.ok(!closed&&service&&provider&&native&&supervisor,'PAGED_PUBLIC_PRODUCT_CAPTURE_PHASE');
  return capturing=(async()=>{
   if(phoneWork)await phoneWork;closed=true;
   // Drain HTTP and pause the SAME approved worker before reading any ledger.
   await quiesceOriginalDevicePagedSepoliaGraphOperatorV4(service);
   const savedProvider=await O.provider.captureOriginalPagedNativeProviderV3(provider);
   // Graph capture closes its OWNER/account, while its receiver/system remain
   // alive for native Source policy/checkpoint capture and queue drainage.
   const graph=await captureOriginalDevicePagedSepoliaGraphOperatorV4(service);
   const savedNative=await O.native.captureOriginalPagedPublicTestnetRuntimesV4(native);
   await service.close();await provider.close();
   const checkpoint=await supervisor.capture({deployment:graph.deployment,authority:graph.authority,provider:savedProvider,native:savedNative,sourceLocation:{journalPath:input.journal.path}});await supervisor.close();
   operatorPassword=null;captureResult=freeze({closed:true,ownedServicesClosed:true,retainedOriginalState:true,externalChainsStopped:false,automaticRebroadcast:false,checkpoint});return captureResult;
  })();
 }
 async function addPhone(raw,signal){
  originalSignal(signal);const phoneFailure=()=>Error('PAGED_PUBLIC_PHONE_SOURCE_ABORTED');let canceled=signal!==undefined&&originalAbortRead.call(signal);if(canceled)throw phoneFailure();
  assert.ok(!closed&&!closing&&!capturing&&!phoneCreating&&service&&receiver&&system&&operatorPassword,'PAGED_PUBLIC_PHONE_SOURCE_PHASE');P.pagedOwnerExactV3(raw,['journalPath','devicePublicKey','minimumDepositAtomic']);assert.equal(raw.journalPath,resolve(raw.journalPath));assert.notEqual(raw.journalPath,input.journal.path,'PAGED_PUBLIC_PHONE_DISTINCT_JOURNAL');assert.notEqual(dirname(raw.journalPath),dirname(input.journal.path),'PAGED_PUBLIC_PHONE_DISTINCT_OWNER_JOURNAL');assert.match(raw.devicePublicKey,/^04[0-9a-f]{128}$/);assert.notEqual(raw.devicePublicKey,input.devicePublicKey,'PAGED_PUBLIC_PHONE_DISTINCT_IDENTITY');assert.ok(typeof raw.minimumDepositAtomic==='string'&&/^[1-9][0-9]*$/.test(raw.minimumDepositAtomic)&&BigInt(raw.minimumDepositAtomic)>=BigInt(system.minimumDepositAtomic)&&BigInt(raw.minimumDepositAtomic)<(1n<<64n),'PAGED_PUBLIC_PHONE_MINIMUM');
  const entries=originalGraphOperatorOwner.readOriginalDevicePagedIndependentSepoliaSourcesV4(service);if(entries.length===2){const phone=entries[1];assert.equal(phone.journalPath,raw.journalPath,'PAGED_PUBLIC_PHONE_ORIGINAL_LOCATION');assert.equal(phone.account.descriptor().devicePublicKey,raw.devicePublicKey,'PAGED_PUBLIC_PHONE_ORIGINAL_IDENTITY');assert.equal(phone.system.minimumDepositAtomic,raw.minimumDepositAtomic,'PAGED_PUBLIC_PHONE_ORIGINAL_MINIMUM');return readOriginalPagedPublicNativePhoneConnectionV4(product);}
  function abortPhone(){canceled=true;phoneAborted=true;closed=true;if(!abortReceiverClose){try{abortReceiverClose=Promise.resolve(receiver.close());}catch(error){abortReceiverClose=Promise.reject(error);}abortReceiverClose.catch(()=>{});}if(!abortNativeClose){try{abortNativeClose=Promise.resolve(native.close());}catch(error){abortNativeClose=Promise.reject(error);}abortNativeClose.catch(()=>{});}}
  function phoneAcquired(){if(canceled||signal!==undefined&&originalAbortRead.call(signal)){abortPhone();throw phoneFailure();}}
  if(signal!==undefined)originalAbortAdd.call(signal,'abort',abortPhone,{once:true});
  phoneCreating=true;return phoneWork=(async()=>{try{phoneAcquired();const kernel=await import('./funded-graph-paged-public-kernel-v4.mjs');phoneAcquired();const retained=kernel.retainOriginalFundedPagedGraphSepoliaDeploymentV4(receiver,system),configuration={...retained.configuration,minimumDepositAtomic:raw.minimumDepositAtomic};const child=await O.native.runOriginalPagedPublicSepoliaSuccessorV4(receiver,system,configuration);phoneAcquired();await originalGraphOperatorOwner.prepareOriginalDevicePagedIndependentSepoliaSourceV4(service,{journal:{path:raw.journalPath,password:operatorPassword},devicePublicKey:raw.devicePublicKey},child);phoneAcquired();return readOriginalPagedPublicNativePhoneConnectionV4(product);}catch(error){throw canceled?phoneFailure():error;}finally{if(signal!==undefined)originalAbortRemove.call(signal,'abort',abortPhone);phoneCreating=false;}})();
 }
 async function close(){if(closing)return closing;return closing=(async()=>{if(service&&provider&&native&&supervisor&&!closed){try{return await capture();}catch(error){try{await dispose();}catch{}throw error;}}closed=true;await dispose();return freeze({closed:true,ownedServicesClosed:true,externalChainsStopped:false,automaticRebroadcast:false,...(phoneAborted?{retainedOriginalState:false,coldReopenFenced:true,interruptedPhoneAcquisition:true}:{})});})();}
 try{
  acquired();O=await owners();acquired();assertOriginalPagedNativeFinancialSourceV3();
  if(opening){
   supervisor=await openOriginalPagedPublicSupervisorRetentionV4(privateSupervisor);acquired();const retainedDescriptor=supervisor.descriptor();assert.equal(retainedDescriptor.origin,transport.origin,'PAGED_PUBLIC_PRODUCT_REOPEN_ORIGIN');assert.equal(retainedDescriptor.devicePublicKey,input.devicePublicKey,'PAGED_PUBLIC_PRODUCT_REOPEN_IDENTITY');const sourceLocation=await supervisor.readSourceLocationV4();acquired();if(sourceLocation!==null)assert.equal(input.journal.path,sourceLocation.journalPath,'PAGED_PUBLIC_PRODUCT_REOPEN_SOURCE_LOCATION');
   const nativeToken=await supervisor.issueComponent('native');acquired();native=await O.native.reopenOriginalPagedPublicTestnetRuntimesV4({directory:input.nativeDirectory},nativeToken);acquired();
   const deploymentToken=await supervisor.issueComponent('deployment');acquired();const originalReceiver=await O.native.reopenOriginalPagedPublicSepoliaReceiverV4(native,deploymentToken);receiver=originalReceiver.runtime;system=originalReceiver.system;acquired();
   const providerToken=await supervisor.issueComponent('provider');acquired();provider=await O.provider.reopenOriginalPagedPublicNativeProviderV4({directory:input.providerDirectory,journalPassword:input.journal.password},providerToken,native);acquired();
   const authorityToken=await supervisor.issueComponent('authority');acquired();service=await reopenOriginalDevicePagedSepoliaGraphOperatorV4({journal:input.journal,devicePublicKey:input.devicePublicKey},provider,receiver,system,ingress,authorityToken);acquired();
   assert.deepEqual(service.descriptor,retainedDescriptor,'PAGED_PUBLIC_PRODUCT_SAME_SOURCE');await supervisor.complete();acquired();
  }else{
   native=await O.native.createOriginalPagedPublicTestnetRuntimesV1({directory:input.nativeDirectory,configuration:input.networkConfiguration});acquired();provider=await O.provider.createOriginalPagedPublicNativeProviderV4({directory:input.providerDirectory},native);acquired();
   receiver=await O.native.createOriginalPagedPublicSepoliaReceiverV4(native);acquired();const registry=provider.publicConfiguration;
   system=await O.native.runOriginalPagedPublicSepoliaPlanV4(receiver,{...input.deployment,registryEpoch:registry.registryEpoch,rulesRoot:registry.rulesRoot,attesterKeys:registry.attesterKeys},input.bootstrapApproval);acquired();
   const original=O.native.readOriginalPagedPublicRuntimeContextV1(native);await O.native.configureOriginalPagedPublicSepoliaSourceV4(receiver,{profile:'ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4',keysetId:native.metadata.keysetId,account:original.accounts[0].address,...input.sourcePolicy});acquired();
   service=await prepareOriginalDevicePagedSepoliaGraphOperatorV4({journal:input.journal,devicePublicKey:input.devicePublicKey},provider,receiver,system,ingress);acquired();
   const context=readOriginalDevicePagedGraphExecutionContextV3(service),seal=await emitOriginalDevicePagedProviderRetentionV3(context.account,provider,'SEAL');acquired();await O.provider.sealOriginalPagedNativeProviderRetentionV3(provider,seal);acquired();
   await mkdir(input.supervisorDirectory,{recursive:true,mode:0o700});acquired();supervisor=await createOriginalPagedPublicSupervisorRetentionV4(privateSupervisor,service.descriptor);acquired();
  }
  assertOriginalPagedNativeFinancialSourceV3();readOriginalPagedRemoteIngressBindingV4(ingress);await listenOriginalDevicePagedSepoliaGraphOperatorV4(service);acquired();
  const descriptor=service.descriptor;assert.equal(descriptor.origin,transport.origin);assert.equal(descriptor.devicePublicKey,input.devicePublicKey);
  product=Object.freeze({profile:'ORIGINAL_DEVICE_PAGED_PUBLIC_TESTNET_NATIVE_OPERATOR_V4',descriptor,origin:descriptor.origin,providerConfiguration:provider.publicConfiguration,reopenedOriginalState:opening,controlledColdReopenSupported:true,publicReceiver:true,automaticRebroadcast:false,close});owned.set(product,{service,provider,native,ingress,capture,addPhone,closed:()=>closed});return product;
 }catch(error){closed=true;try{await dispose();}catch{}throw aborted?abortFailure():error;}finally{if(signal!==undefined)originalAbortRemove.call(signal,'abort',abortAcquisition);input.journal.password=null;privateSupervisor.password=null;}
}
function current(product){const s=owned.get(product);assert.ok(s&&!s.closed(),'PAGED_PUBLIC_ORIGINAL_PRODUCT');readOriginalPagedRemoteIngressBindingV4(s.ingress);const context=readOriginalDevicePagedGraphExecutionContextV3(s.service);providerOwner.assertOriginalPagedNativeProviderV3(s.provider,context);nativeOwner.assertOriginalPagedPublicTestnetRuntimeV1(s.native);return s;}
export function readOriginalPagedPublicNativeConnectionV4(product){assert.equal(arguments.length,1);const s=current(product),tls=readOriginalPagedRemoteIngressBindingV4(s.ingress);return freeze({format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor:clone(product.descriptor),transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:tls.publicCertificatePEM,certificateSHA256:tls.publicCertificateSHA256}});}
export function readOriginalPagedPublicNativeExecutionContextV4(product){assert.equal(arguments.length,1);const s=current(product);return Object.freeze({...readOriginalDevicePagedGraphExecutionContextV3(s.service),provider:s.provider,nativeRuntime:s.native});}
export async function captureOriginalPagedPublicNativeOperatorV4(product){assert.equal(arguments.length,1);const s=owned.get(product);assert.ok(s,'PAGED_PUBLIC_ORIGINAL_PRODUCT');return s.capture();}

/** The operator may allocate the one independent PHONE pool. Its key stays on
 * Android; only the original public point and a protected local locator enter.
 * An actual AbortSignal cancels acquisition only. Interrupting successor
 * finality closes the shared originals and leaves ACTIVE recovery fenced:
 * close() reports retainedOriginalState:false, never a fabricated capture. */
export async function createOriginalPagedPublicNativePhoneSourceV4(product,input,signal){assert.ok(arguments.length===2||arguments.length===3);originalSignal(signal);if(signal!==undefined&&originalAbortRead.call(signal))throw Error('PAGED_PUBLIC_PHONE_SOURCE_ABORTED');return current(product).addPhone(input,signal);}
export function readOriginalPagedPublicNativePhoneConnectionV4(product){assert.equal(arguments.length,1);const s=current(product),sources=originalGraphOperatorOwner.readOriginalDevicePagedIndependentSepoliaSourcesV4(s.service);if(sources.length===1)return null;assert.equal(sources.length,2,'PAGED_PUBLIC_PHONE_SOURCE_BOUND');const tls=readOriginalPagedRemoteIngressBindingV4(s.ingress);return freeze({format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor:clone(sources[1].account.descriptor()),transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:tls.publicCertificatePEM,certificateSHA256:tls.publicCertificateSHA256}});}
