/** Fixed Paged operator. Birth and cold opening authenticate original private
 * state before listening; no request can select a runtime, provider or account. */
import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {networkInterfaces} from 'node:os';
import {isIP} from 'node:net';
import {createOwnedLocalEvmV2,createOwnedPagedHubDurableEvmV3,reopenOwnedPagedHubEvmV3,captureOwnedPagedEvmRecoveryV3} from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {assertFundedPagedLocalDeploymentArtifactsV3,deployOriginalFundedPagedGraphWalletV3,reopenOriginalFundedPagedGraphWalletV3,retainOriginalFundedPagedGraphDeploymentV3,closeOriginalFundedPagedGraphDeploymentV3} from './funded-graph-paged-deployment-v3.mjs';
import {createOriginalDevicePagedGraphNoteAuthorityV3,reopenOriginalDevicePagedGraphNoteAuthorityV3,captureOriginalDevicePagedGraphAuthorityV3,assertOriginalDevicePagedGraphNoteAuthorityV3} from '../../accounts/authority/device-paged-note-authority-v3.mjs';
import {assertOriginalDevicePagedGraphSourceV3} from './funded-graph-paged-device-graph-source-v3.mjs';
import {createDevicePagedPlatformApplicationV3} from '../../api/mobile/device-paged-platform-application-v3.mjs';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
const owned=new WeakMap();
function assignedPrivateIPv4(value){if(isIP(value)!==4)return false;const [a,b]=value.split('.').map(Number);if(!(a===10||a===172&&b>=16&&b<=31||a===192&&b===168))return false;return Object.values(networkInterfaces()).some(rows=>(rows??[]).some(row=>row.family==='IPv4'&&!row.internal&&row.address===value));}
export async function startOriginalDevicePagedGraphLocalOperatorV3(raw){assert.equal(arguments.length,1);return createOriginalGraphOperator(raw,null,null);}
export async function startOriginalDevicePagedNativeGraphLocalOperatorV3(raw,provider){assert.equal(arguments.length,2);const {readOriginalPagedNativeProviderRuntimeV3}=await import('../../providers/funded-paged-native-provider-v3.mjs');readOriginalPagedNativeProviderRuntimeV3(provider);return createOriginalGraphOperator(raw,provider,null);}
export async function prepareOriginalDevicePagedNativeGraphLocalOperatorV3(raw,provider){assert.equal(arguments.length,2);return createOriginalGraphOperator(raw,provider,null,true);}
export async function reopenOriginalDevicePagedNativeGraphLocalOperatorV3(raw,provider,tokens){assert.equal(arguments.length,3);P.pagedOwnerExactV3(tokens,['receiver','deployment','authority']);return createOriginalGraphOperator(raw,provider,tokens,true);}
export async function prepareOriginalDevicePagedDurableNativeGraphLocalOperatorV3(raw,provider){assert.equal(arguments.length,2);return createOriginalGraphOperator(raw,provider,null,true,true);}
async function createOriginalGraphOperator(raw,provider,tokens,deferListen=false,durable=false){
 P.pagedOwnerExactV3(raw,['deployment','journal','origin','devicePublicKey','tls','host']);P.pagedOwnerExactV3(raw.tls,['key','cert']);const config=structuredClone(raw),u=new URL(config.origin);
 assert.ok((['127.0.0.1','::1'].includes(config.host)||assignedPrivateIPv4(config.host)&&u.hostname===config.host)&&u.origin===config.origin&&u.protocol==='https:'&&u.port);assertOriginalDevicePagedGraphSourceV3();assertFundedPagedLocalDeploymentArtifactsV3(config.deployment.manifestSHA256,config.deployment.consumerSHA256);
 let runtime,system,account,server,application,closing,fencing,captureResult,systemClosed=false,fenced=false,listened=false;
 const sockets=new Set(),operations=new Set();
 function fence(){return fencing??=(async()=>{fenced=true;application?.close();const stopped=server?new Promise(resolve=>server.close(resolve)):Promise.resolve(),drained=[...sockets].map(socket=>new Promise(resolve=>{socket.once('close',resolve);socket.destroy();}));await Promise.allSettled([...operations]);await stopped;await Promise.all(drained);assert.equal(sockets.size,0,'PAGED_GRAPH_OPERATOR_SOCKET_DRAIN');})();}
 function close(){return closing??=(async()=>{const errors=[];try{await fence();}catch(error){errors.push(error);}try{await account?.close();}catch(error){errors.push(error);}try{if(system&&!systemClosed){closeOriginalFundedPagedGraphDeploymentV3(runtime,system);systemClosed=true;}}catch(error){errors.push(error);}try{await runtime?.close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'PAGED_GRAPH_OPERATOR_CLOSE_FAILED');return Object.freeze({closed:true,ownedSocketsRemaining:sockets.size,originalResourcesStopped:true,automaticFunding:false});})();}
 async function capture(){
  assert.ok(durable||tokens,'PAGED_GRAPH_COLD_CAPTURE_UNSUPPORTED');
  if(captureResult)return structuredClone(captureResult);assert.ok(!closing,'PAGED_GRAPH_OPERATOR_CAPTURE_CLOSED');
  await fence();assertOriginalDevicePagedGraphNoteAuthorityV3(account,runtime,system);
  const deployment=retainOriginalFundedPagedGraphDeploymentV3(runtime,system),authority=await captureOriginalDevicePagedGraphAuthorityV3(account);
  await account.close();const receiver=await captureOwnedPagedEvmRecoveryV3(runtime);closeOriginalFundedPagedGraphDeploymentV3(runtime,system);systemClosed=true;captureResult={deployment,authority,receiver};return structuredClone(captureResult);
 }
 try{
  if(tokens){runtime=await reopenOwnedPagedHubEvmV3(tokens.receiver);system=await reopenOriginalFundedPagedGraphWalletV3(runtime,tokens.deployment);account=await reopenOriginalDevicePagedGraphNoteAuthorityV3(runtime,system,{journal:config.journal,origin:config.origin,devicePublicKey:config.devicePublicKey},tokens.authority);}
  else{runtime=await (durable?createOwnedPagedHubDurableEvmV3():createOwnedLocalEvmV2());system=await deployOriginalFundedPagedGraphWalletV3(runtime,config.deployment);account=await createOriginalDevicePagedGraphNoteAuthorityV3(runtime,system,{journal:config.journal,origin:config.origin,devicePublicKey:config.devicePublicKey});}
  assertOriginalDevicePagedGraphNoteAuthorityV3(account,runtime,system);assertOriginalDevicePagedGraphSourceV3();const descriptor=account.descriptor();assert.equal(descriptor.origin,config.origin);assert.equal(descriptor.devicePublicKey,config.devicePublicKey);
  async function listen(){assert.ok(!fenced&&!listened&&server,'PAGED_GRAPH_OPERATOR_LISTENER_PHASE');assertOriginalDevicePagedGraphNoteAuthorityV3(account,runtime,system);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(u.port),config.host,resolve);});const address=server.address();assert.ok(address&&typeof address==='object'&&address.port===Number(u.port));listened=true;}
  const service=Object.freeze({profile:provider?'ORIGINAL_DEVICE_PAGED_PRIVATE_NATIVE_GRAPH_OPERATOR_V3':'ORIGINAL_DEVICE_PAGED_PRIVATE_GRAPH_OPERATOR_V3',descriptor,origin:descriptor.origin,close});owned.set(service,{runtime,system,account,isClosed:()=>fenced,capture,listen,fence});
  let providerGuard=null;if(provider){const {bindOriginalPagedNativeProviderV3,assertOriginalPagedNativeProviderV3}=await import('../../providers/funded-paged-native-provider-v3.mjs');await bindOriginalPagedNativeProviderV3(provider,service);providerGuard=()=>assertOriginalPagedNativeProviderV3(provider,{runtime,system,account});}
  const isLive=()=>{if(fenced)return false;assertOriginalDevicePagedGraphNoteAuthorityV3(account,runtime,system);providerGuard?.();return true;};
  const nativePreparation=provider?{family:'EVM',chainDomain:provider.publicConfiguration.chainDomain,evidencePolicy:provider.publicConfiguration.evidencePolicy,networks:provider.publicConfiguration.networks,...(provider.publicConfiguration.uniswap?{uniswap:provider.publicConfiguration.uniswap}:{})}:null;
  application=createDevicePagedPlatformApplicationV3({descriptor,nativePreparation,isLive,async dispatch(method,args){assert.ok(['challenge','submit','graphChallenge','graphSubmit'].includes(method));assert.ok(isLive());const result=await account[method](...args);assert.ok(isLive());return result;}});assert.ok(!fenced);
  server=createServer({key:config.tls.key,cert:config.tls.cert,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'},(request,response)=>{const work=(async()=>{assert.ok(!fenced);await application.handler(request,response);})();operations.add(work);work.catch(()=>{if(!response.headersSent&&!response.destroyed)response.writeHead(403,{'content-type':'application/json','cache-control':'no-store'});if(!response.destroyed)response.end('{"error":"PAGED_GRAPH_OPERATION_REJECTED"}');}).finally(()=>operations.delete(work));});
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));if(fenced)socket.destroy();});server.headersTimeout=15000;server.requestTimeout=900000;
  if(!deferListen)await listen();return service;
 }catch(error){await close();throw error;}finally{config.tls=null;config.journal.password=null;}
}
export function assertOriginalDevicePagedGraphLocalOperatorV3(service){const original=owned.get(service);assert.ok(original&&!original.isClosed());assertOriginalDevicePagedGraphNoteAuthorityV3(original.account,original.runtime,original.system);return service;}
export function readOriginalDevicePagedGraphExecutionContextV3(service){assert.equal(arguments.length,1);assertOriginalDevicePagedGraphLocalOperatorV3(service);const s=owned.get(service);return Object.freeze({runtime:s.runtime,system:s.system,account:s.account});}
export async function captureOriginalDevicePagedGraphLocalOperatorV3(service){assert.equal(arguments.length,1);const original=owned.get(service);assert.ok(original,'PAGED_GRAPH_ORIGINAL_SERVICE');return original.capture();}
/** Fixed product capture fence. It drains the SAME original listener without
 * closing OWNER/runtime, so the mixed target can be fenced before snapshots. */
export async function fenceOriginalDevicePagedGraphLocalOperatorV3(service){assert.equal(arguments.length,1);const original=owned.get(service);assert.ok(original,'PAGED_GRAPH_ORIGINAL_SERVICE');return original.fence();}
export async function listenOriginalDevicePagedGraphLocalOperatorV3(service){assert.equal(arguments.length,1);assertOriginalDevicePagedGraphLocalOperatorV3(service);return owned.get(service).listen();}
