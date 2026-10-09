/** Ordered SAME-device/source-note continuation. No constructor, capture or
 * record supplied over HTTP can issue authority. The producer is retained
 * before funding; the new process can only ACCESS/STATUS/OBSERVE original jobs. */
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {externalFlatExactV1} from '../../../../mobile-protocol/src/device-external-flat-note-v1.mjs';
import {assertOwnedDeviceExternalFlatReceiverV1} from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {assertOwnedFlatSystem} from '../deployments/system/deploy-system.mjs';
import {createOriginalRetainedDeviceExternalFlatNoteAuthorityV1,assertOriginalDeviceExternalFlatNoteAuthorityV1,assertOriginalRetainedDeviceExternalFlatNoteAuthorityV1,assertOriginalRetainedDeviceExternalFlatNoteAuthorityContextV1} from '../../accounts/authority/device-external-flat-note-authority-v1.mjs';
import {createOriginalDeviceExternalFlatTlsServerV1,quiesceOriginalRetainedDeviceExternalFlatTlsServerV1} from '../../api/mobile/device-external-flat-note-http-v1.mjs';
import {assertWrappedPrivateLifetimeRegistryRuntimeV1,assertWrappedPrivateLifetimeAttemptV1,closeWrappedPrivateLifetimeRegistryV1} from '../../claims/wrapped/recovery/wrapped-private-lifetime-registry-v1.mjs';
import {assertDeviceExternalFlatRecoveryAuthorityV1,retainDeviceExternalFlatAccountRecoveryV1,retainDeviceExternalFlatSystemRecoveryV1,retainDeviceExternalFlatLifetimeRecoveryV1,retainDeviceExternalFlatReceiverRuntimeV1,finishDeviceExternalFlatRecoveryCaptureV1,reopenDeviceExternalFlatReceiverRuntimeV1,reopenDeviceExternalFlatLifetimeRecoveryV1,reopenDeviceExternalFlatSystemRecoveryV1,reopenDeviceExternalFlatAccountRecoveryV1,closeDeviceExternalFlatRecoveryAuthorityV1} from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
const services=new WeakMap(),PROFILE='DEVICE_EXTERNAL_FLAT_ORDERED_OBSERVATION_RECOVERY_V1';
function exact(value,keys){assert.ok(value&&!types.isProxy(value));return externalFlatExactV1(value,keys);}
/** Same owned continuation only; never a public record or HTTP capability. */
export function readOriginalDeviceExternalFlatObservationContextV1(original){
 assert.equal(arguments.length,1);const s=services.get(original);assert.ok(s&&!s.closed&&s.reopened,'DEVICE_EXTERNAL_FLAT_ORIGINAL_OBSERVATION_SERVICE');assertOwnedDeviceExternalFlatReceiverV1(s.runtime);assertOwnedFlatSystem(s.runtime,s.system);assertOriginalDeviceExternalFlatNoteAuthorityV1(s.account);return Object.freeze({runtime:s.runtime,system:s.system,account:s.account});
}
function service(state){const result=Object.freeze({runtime:state.runtime,account:state.account,descriptor:state.account.descriptor,url:state.listener.url,observationOnly:state.reopened,
 close(){assert.equal(arguments.length,0);state.closed=true;if(!state.closing)state.closing=(async()=>{if(state.captureWork)await state.captureWork.catch(()=>{});const errors=[],receipts={};
  for(const [name,work]of [['listener',()=>state.listener.close()],['registry',()=>state.registryClosed?{closed:true}:closeWrappedPrivateLifetimeRegistryV1(state.registry)],['receiver',()=>state.runtimeClosed?{closed:true}:state.runtime.close()],['issuer',()=>state.issuerClosed?{closed:true}:closeDeviceExternalFlatRecoveryAuthorityV1(state.authority)]]){try{receipts[name]=await work();if(name==='registry')state.registryClosed=true;if(name==='receiver')state.runtimeClosed=true;if(name==='issuer')state.issuerClosed=true;}catch(error){errors.push(error);}}
  if(errors.length)throw new AggregateError(errors,'DEVICE_EXTERNAL_FLAT_ORDERED_CLOSE_UNCONFIRMED',{cause:errors[0]});return{closed:true,originalJobsRetained:true,observationOnly:state.reopened,receipts};})();return state.closing;}});services.set(result,state);return result;}
export async function createOriginalRetainedDeviceExternalFlatNoteServiceV1(input){
 assert.equal(arguments.length,1);const v=exact(input,['runtime','system','registry','recoveryAuthority','poolIndex','origin','devicePublicKey','tls','host']);
 assertOwnedDeviceExternalFlatReceiverV1(v.runtime);assertOwnedFlatSystem(v.runtime,v.system);const identity=assertDeviceExternalFlatRecoveryAuthorityV1(v.recoveryAuthority);assert.equal(identity.profile,PROFILE);assertWrappedPrivateLifetimeRegistryRuntimeV1(v.registry,v.runtime);assertWrappedPrivateLifetimeAttemptV1(v.runtime,identity);
 const account=await createOriginalRetainedDeviceExternalFlatNoteAuthorityV1(Object.fromEntries(['runtime','system','poolIndex','origin','devicePublicKey','recoveryAuthority'].map(k=>[k,v[k]])));return installOriginalRetainedDeviceExternalFlatNoteServiceV1({...v,account});
}
/** The local caller prepares allowance between original account birth and TLS.
 * Only that account's SAME runtime/System/issuer context can install it. */
export async function installOriginalRetainedDeviceExternalFlatNoteServiceV1(input){
 assert.equal(arguments.length,1);const v=exact(input,['runtime','system','registry','recoveryAuthority','poolIndex','origin','devicePublicKey','tls','host','account']);assertWrappedPrivateLifetimeRegistryRuntimeV1(v.registry,v.runtime);const descriptor=assertOriginalRetainedDeviceExternalFlatNoteAuthorityContextV1(v.account,{runtime:v.runtime,system:v.system,recoveryAuthority:v.recoveryAuthority});assert.equal(descriptor.origin,v.origin);assert.equal(descriptor.devicePublicKey,v.devicePublicKey);assert.equal(descriptor.poolTerms.pool,v.system.pools[v.poolIndex].address.slice(2));let listener;
 try{listener=await createOriginalDeviceExternalFlatTlsServerV1({account:v.account,tls:v.tls,host:v.host});}catch(error){await v.account.close();throw error;}
 return service({runtime:v.runtime,system:v.system,registry:v.registry,authority:v.recoveryAuthority,account:v.account,listener,reopened:false,closed:false,closing:null,captureWork:null,registryClosed:false,runtimeClosed:false,issuerClosed:false});
}
export function captureOriginalDeviceExternalFlatOrderedServiceV1(original){
 assert.equal(arguments.length,1);const s=services.get(original);assert.ok(s&&!s.closed&&!s.reopened&&!s.captureWork,'DEVICE_EXTERNAL_FLAT_ORIGINAL_ORDERED_SERVICE');assertOriginalRetainedDeviceExternalFlatNoteAuthorityV1(s.account);assertDeviceExternalFlatRecoveryAuthorityV1(s.authority);
 // The listener stops admitting synchronously before any await. Its same
 // admitted requests drain before the original account's capture/credential
 // erasure. System, registry and receiver are retained only in that order.
 s.closed=true;const listenerDrain=quiesceOriginalRetainedDeviceExternalFlatTlsServerV1(s.listener,s.account);
 s.captureWork=(async()=>{const closed=await listenerDrain;assert.equal(closed.closed,true);assert.equal(closed.originalOperationsInFlight,0);assert.equal(closed.ownedSocketsRemaining,0);
  await retainDeviceExternalFlatAccountRecoveryV1(s.authority,s.account);await retainDeviceExternalFlatSystemRecoveryV1(s.authority,{runtime:s.runtime,system:s.system});await retainDeviceExternalFlatLifetimeRecoveryV1(s.authority,s.runtime);s.registryClosed=true;
  await retainDeviceExternalFlatReceiverRuntimeV1(s.authority,s.runtime);s.runtimeClosed=true;const checkpoint=await finishDeviceExternalFlatRecoveryCaptureV1(s.authority);s.issuerClosed=true;return Object.freeze({profile:PROFILE,checkpoint,originalResourcesStopped:true,observationContinuationOnly:true});})();return s.captureWork;
}
export async function reopenOriginalDeviceExternalFlatObservationServiceV1(input){
 assert.equal(arguments.length,1);const v=exact(input,['recoveryAuthority','tls','host']),identity=assertDeviceExternalFlatRecoveryAuthorityV1(v.recoveryAuthority);assert.equal(identity.profile,PROFILE);
 let runtime,registry,systemContext,account,listener;let issuerClosed=false;
 try{runtime=await reopenDeviceExternalFlatReceiverRuntimeV1(v.recoveryAuthority);assertOwnedDeviceExternalFlatReceiverV1(runtime);registry=await reopenDeviceExternalFlatLifetimeRecoveryV1(v.recoveryAuthority,runtime);assertWrappedPrivateLifetimeRegistryRuntimeV1(registry,runtime);
  systemContext=await reopenDeviceExternalFlatSystemRecoveryV1(v.recoveryAuthority,{runtime});assert.equal(systemContext.runtime,runtime);assert.equal(systemContext.observationOnly,true);const system=systemContext.system;assertOwnedFlatSystem(runtime,system);
  account=await reopenDeviceExternalFlatAccountRecoveryV1(v.recoveryAuthority,{runtime,system});await closeDeviceExternalFlatRecoveryAuthorityV1(v.recoveryAuthority);issuerClosed=true;listener=await createOriginalDeviceExternalFlatTlsServerV1({account,tls:v.tls,host:v.host});
  return service({runtime,system,registry,authority:v.recoveryAuthority,account,listener,reopened:true,closed:false,closing:null,captureWork:null,registryClosed:false,runtimeClosed:false,issuerClosed:true});
 }catch(error){const errors=[];for(const close of [()=>listener?listener.close():account?.close(),()=>systemContext?.close(),()=>registry&&closeWrappedPrivateLifetimeRegistryV1(registry),()=>runtime?.close(),()=>!issuerClosed&&closeDeviceExternalFlatRecoveryAuthorityV1(v.recoveryAuthority)]){try{await close();}catch(cleanup){errors.push(cleanup);}}
  if(errors.length)throw new AggregateError([error,...errors],'DEVICE_EXTERNAL_FLAT_ORDERED_OPEN_AND_CLOSE_FAILED',{cause:error});throw error;}
}
