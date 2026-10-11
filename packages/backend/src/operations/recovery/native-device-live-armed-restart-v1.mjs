/** Ordered original ARMED continuation. This fixed producer is born before
 * D26; an authenticated same-journal arm survives a NEW process without a new
 * signature. UNKNOWN work only reconciles its original wire. Abrupt crash
 * recovery is not established. A captured completed F reopens for observation. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {mkdir,lstat,realpath,open} from 'node:fs/promises';
import {join} from 'node:path';
import {ROOT} from '@lianum/proofs/catalog';
import {exactRecord} from '@lianum/components/encoding/commitments';
import {NATIVE_VALUE_DEV_RELEASE_V5} from '../releases/native-value/native-value-dev-release-v5.mjs';
import {createNativeLiveArmedRecoveryAuthorityV1,openNativeLiveArmedRecoveryAuthorityV1,assertNativeLiveArmedRecoveryCaptureV1,
 reopenNativeLiveArmedFromAuthorityV1,closeNativeEconomicRecoveryAuthorityV1} from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import {assertOwnedNativeValueAccountAuthority,assertNativeLiveArmedAccountCaptureV1,retainOriginalNativeDeviceLiveArmedInstallationV1,consumeOriginalNativeDeviceLiveArmedInstallationV1} from '../../accounts/authority/native-value-account-authority-v2.mjs';
import {captureNativeValueLiveArmedRecoveryV1} from './native-value-economic-recovery-v1.mjs';
import {normalizeOriginalNativeDeviceLocalConfigurationV1} from './native-device-local-restart-v1.mjs';
import {reopenOriginalNativeDeviceLiveArmedObservedClocksV1} from './native-device-local-observed-clock-v1.mjs';
import {createOriginalNativeDeviceLiveRecoveryProducerV1} from './native-device-local-live-recovery-v1.mjs';
import {assertPairedOriginalAccountActorAccountV2} from '../../api/mobile/paired-original-account-actor-v2.mjs';
import {createDeviceOwnerDepositBridgeV1} from '../../accounts/authority/device-owner-deposit-bridge-v1.mjs';
import {createDeviceOwnerReservationBridgeV1} from '../../accounts/authority/device-owner-reservation-bridge-v1.mjs';
import {createDeviceOwnerExecutionBridgeV1} from '../../accounts/authority/device-owner-execution-bridge-v1.mjs';
import {createPairedDeviceAccountTlsServerV1} from '../../api/mobile/paired-original-account-http-v2.mjs';
import {readOriginalSessionWalletEconomicStateV1} from '../../api/accounts/flat-manual-graph-session.mjs';
const local=join(ROOT,'.local/original-device-live-armed-operator-v1'),locatorPath=join(local,'armed-checkpoint.json'),prepared=new WeakMap();
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
export function originalNativeDeviceLiveArmedConfigurationPathV1(){assert.equal(arguments.length,0);return join(local,'operator.json');}
async function privateDirectory(){const st=await lstat(local);assert.ok(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&(st.mode&0o777)===0o700&&await realpath(local)===local,'NATIVE_LIVE_ARMED_PRIVATE_DIRECTORY');}
async function privateRead(){await privateDirectory();const fd=await open(locatorPath,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{const before=await fd.stat();assert.ok(before.isFile()&&before.nlink===1&&before.uid===process.getuid()&&(before.mode&0o777)===0o600&&before.size>0&&before.size<=16384,'NATIVE_LIVE_ARMED_PRIVATE_LOCATOR');
  bytes=Buffer.alloc(16385);const n=(await fd.read(bytes,0,bytes.length,0)).bytesRead,after=await fd.stat(),named=await lstat(locatorPath);
  for(const k of ['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs'])assert.ok(before[k]===after[k]&&before[k]===named[k],'NATIVE_LIVE_ARMED_LOCATOR_CHANGED');
  assert.equal(named.isSymbolicLink(),false);assert.equal(n,before.size);return JSON.parse(bytes.subarray(0,n).toString('utf8'));
 }finally{bytes?.fill(0);await fd.close();}}
async function publish(value){await privateDirectory();const bytes=Buffer.from(JSON.stringify(value)+'\n');assert.ok(bytes.length<=16384);
 const fd=await open(locatorPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await fd.writeFile(bytes);await fd.sync();}finally{bytes.fill(0);await fd.close();}
 const dir=await open(local,constants.O_RDONLY|constants.O_DIRECTORY);try{await dir.sync();}finally{await dir.close();}assert.deepEqual(await privateRead(),value);}
export async function prepareOriginalNativeDeviceLiveArmedRestartV1(){
 assert.equal(arguments.length,0);await mkdir(local,{recursive:true,mode:0o700});await privateDirectory();
 try{await lstat(locatorPath);throw Error('NATIVE_LIVE_ARMED_CAPTURE_EXISTS_USE_ORIGINAL_OPEN');}catch(error){if(error.code!=='ENOENT')throw error;}
 assert.ok(NATIVE_VALUE_DEV_RELEASE_V5,'NATIVE_LIVE_ARMED_ORIGINAL_SOURCE_REQUIRED');const runId=randomUUID();
 const identity={directory:join(ROOT,'.local/native-value-live-armed-recovery-v1','attempt-'+runId,'private-audit'),runId,sourceSHA256:NATIVE_VALUE_DEV_RELEASE_V5.hostSourceClosureSHA256};
 await mkdir(identity.directory,{recursive:true,mode:0o700});const authority=await createNativeLiveArmedRecoveryAuthorityV1(identity),original=assertNativeLiveArmedRecoveryCaptureV1(authority);
 const token=Object.freeze(Object.create(null));prepared.set(token,{authority,identity:original,phase:'OPEN',input:null,installed:null,liveProducer:null,clocks:null,completion:null,close:null});return token;
}
export function originalNativeLiveArmedRestartAuthorityV1(token){assert.equal(arguments.length,1);const row=prepared.get(token);assert.ok(row&&row.phase==='OPEN'&&row.input===null,'NATIVE_LIVE_ARMED_ORIGINAL_PRODUCER');return row.authority;}
export function bindOriginalNativeDeviceLiveArmedRestartV1(token,input){
 assert.equal(arguments.length,2);exactRecord(input,['runtime','nativeRuntime','bootstrap','system','owner','nativeExecution','account','session','provider','installed','liveProducer','clocks']);
 const row=prepared.get(token);assert.ok(row&&row.phase==='OPEN'&&row.input===null,'NATIVE_LIVE_ARMED_ORIGINAL_PRODUCER');
 const {installed,liveProducer,clocks,...original}=input;exactRecord(installed,['transport','actor','depositBridge','reservationBridge','executionBridge','descriptor']);
 assert.equal(clocks.runtime,original.runtime);assert.equal(clocks.nativeRuntime,original.nativeRuntime);
 // Same account birth/issuer membership is checked by its capture producer
 // when the first durable ARM exists; binding here never supplies a job/arm DTO.
 row.input=Object.freeze({...original});row.installed=installed;row.liveProducer=liveProducer;row.clocks=clocks;
}
export function originalNativeDeviceLiveArmedCaptureStateV1(token){assert.equal(arguments.length,1);const row=prepared.get(token);assert.ok(row,'NATIVE_LIVE_ARMED_ORIGINAL_PRODUCER');return Object.freeze({phase:row.phase,completion:row.completion});}
export function closeOriginalNativeDeviceLiveArmedAuthorityV1(token){assert.equal(arguments.length,1);const row=prepared.get(token);assert.ok(row,'NATIVE_LIVE_ARMED_ORIGINAL_PRODUCER');return row.close??=closeNativeEconomicRecoveryAuthorityV1(row.authority);}
export function captureOriginalNativeDeviceLiveArmedRestartV1(token){
 assert.equal(arguments.length,1);const row=prepared.get(token);assert.ok(row&&row.input&&row.phase==='OPEN','NATIVE_LIVE_ARMED_ORIGINAL_PRODUCER');
 const arm=assertNativeLiveArmedAccountCaptureV1(row.input.account,row.authority);row.phase='CAPTURING';
 let operation;try{operation=captureNativeValueLiveArmedRecoveryV1(row.authority,{...Object.fromEntries(['runtime','nativeRuntime','bootstrap','system','owner','nativeExecution','account','session'].map(k=>[k,row.input[k]])),
  providerCustody:row.input.provider.custody,actor:row.installed.actor,transport:row.installed.transport,executionBridge:row.installed.executionBridge,clock:row.clocks.clock,liveProducer:row.liveProducer});}catch(error){operation=Promise.reject(error);}operation.catch(()=>{});
 row.completion=(async()=>{let done=false;try{const recipient=await row.input.provider.recipient.close();assert.equal(recipient.exited,true);assert.deepEqual(recipient.exit,{code:0,signal:null});
  const checkpoint=await operation;done=true;const transport=await row.installed.transport.close();assert.ok(transport.closed&&transport.listenerClosed&&transport.ownedSocketsRemaining===0&&transport.originalDiagnosticsInFlight===0);
  for(const runtime of [row.input.runtime,row.input.nativeRuntime])assert.ok(runtime.processStatus().stopped&&runtime.lifecycle.find(x=>x.event==='stopped-owned-process')?.forced===false,'NATIVE_LIVE_ARMED_STOP_UNCONFIRMED');
  assert.equal(row.input.owner.report().childExited,true);assert.equal(row.input.provider.custody.report().closed,true);
  const identity={...row.identity};delete identity.profile;await publish({schema:'ORIGINAL_NATIVE_LIVE_ARMED_CAPTURE_V1',identity,checkpoint:{...checkpoint},descriptor:{...row.installed.descriptor},arm:{...arm},capturedProcessId:process.pid});
  row.phase='CAPTURED';return Object.freeze({closed:true,originalResourcesStopped:true,plannedCaptureForNewProcess:true,originalArmRetained:true,abruptCrashRecoveryEstablished:false});
 }catch(error){let first=error;try{await operation;done=true;}catch(other){if(other!==error)first=new AggregateError([error,other],'NATIVE_LIVE_ARMED_CAPTURE_FAILED',{cause:error});}
  row.phase='FAILED';if(!done)try{await closeOriginalNativeDeviceLiveArmedAuthorityV1(token);}catch(cleanup){throw new AggregateError([first,cleanup],'NATIVE_LIVE_ARMED_CAPTURE_CLOSE_UNCONFIRMED',{cause:first});}throw first;}})();return row.completion;
}
export async function installOriginalNativeDeviceLiveArmedServiceV1(input,tls){
 assert.equal(arguments.length,2);exactRecord(input,['runtime','system','owner','account','nativeExecution','providerCustody','actor']);
 const {runtime,system,owner,account,nativeExecution,providerCustody,actor}=input;assertOwnedNativeValueAccountAuthority(account,{runtime,system,poolIndex:0,owner});
 assertPairedOriginalAccountActorAccountV2(actor,account);const cap=await retainOriginalNativeDeviceLiveArmedInstallationV1(account,actor,providerCustody),retained=consumeOriginalNativeDeviceLiveArmedInstallationV1(cap,account,actor);
 let depositBridge,reservationBridge,executionBridge,transport;try{
  depositBridge=await createDeviceOwnerDepositBridgeV1({actor,account,owner,runtime,system,poolIndex:0});
  reservationBridge=await createDeviceOwnerReservationBridgeV1({actor,account,owner,runtime,system,poolIndex:0,nativePreparation:retained.nativePreparation,invoiceSignatures:retained.invoiceSignatures});
  executionBridge=await createDeviceOwnerExecutionBridgeV1({account,reservationBridge,nativeExecution,providers:retained.providers,runtime,system,poolIndex:0});
  transport=await createPairedDeviceAccountTlsServerV1({depositBridge,reservationBridge,executionBridge,tls});
  return Object.freeze({transport,depositBridge,reservationBridge,executionBridge,descriptor:retained.descriptor,parentJobId:retained.parentJobId,armSHA256:retained.armSHA256,settleBefore:retained.settleBefore,state:retained.state});
 }catch(error){const errors=[];if(transport)try{await transport.close();}catch(e){errors.push(e);}for(const bridge of [executionBridge,reservationBridge,depositBridge])try{bridge?.close();}catch(e){errors.push(e);}
  if(errors.length)throw new AggregateError([error,...errors],'NATIVE_LIVE_ARMED_INSTALL_CLEANUP_FAILED',{cause:error});throw error;}}
export async function reopenOriginalNativeDeviceLiveArmedOperatorV1(input){
 assert.equal(arguments.length,1);const selected=normalizeOriginalNativeDeviceLocalConfigurationV1(input),product=await import('./native-device-source-review-v1.mjs');await product.assertOriginalNativeDeviceLocalSourceReviewV1();
 const locator=await privateRead();exactRecord(locator,['schema','identity','checkpoint','descriptor','arm','capturedProcessId']);assert.equal(locator.schema,'ORIGINAL_NATIVE_LIVE_ARMED_CAPTURE_V1');
 exactRecord(locator.identity,['directory','runId','sourceSHA256','deadlineMs']);exactRecord(locator.checkpoint,['revision','commitment']);exactRecord(locator.arm,['parentJobId','armSHA256','settleBefore','state']);
 assert.ok(hex(locator.arm.parentJobId)&&hex(locator.arm.armSHA256)&&['ARMED','FIRING','UNKNOWN','RECOVERED'].includes(locator.arm.state));
 assert.ok(Number.isSafeInteger(locator.capturedProcessId)&&locator.capturedProcessId>0&&locator.capturedProcessId!==process.pid,'NATIVE_LIVE_ARMED_NEW_PROCESS_REQUIRED');
 assert.equal(locator.descriptor.origin,selected.origin);assert.equal(locator.descriptor.devicePublicKey,selected.devicePublicKey);assert.ok(Date.now()<locator.identity.deadlineMs,'NATIVE_LIVE_ARMED_ORIGINAL_DEADLINE');
 let authority,originals,clocks,installed,producer,closing;
 function close(){assert.equal(arguments.length,0);return closing??=(async()=>{const errors=[];const timerStop=producer?.close(),httpStop=installed?.transport.close();timerStop?.catch(()=>{});httpStop?.catch(()=>{});
  for(const work of [()=>timerStop,()=>httpStop,()=>originals?.account.abort(),()=>originals?.session.close(),()=>originals?.account.close(),()=>originals?.nativeExecution.close(),()=>originals?.providerCustody.close(),()=>originals?.owner.close(),()=>originals?.bootstrap.close(),async()=>{if(clocks)return clocks.close();if(originals)for(const runtime of [originals.nativeRuntime,originals.runtime]){const stop=await runtime.close({removeScratch:false});assert.ok(stop.stopped&&runtime.lifecycle.find(x=>x.event==='stopped-owned-process')?.forced===false,'NATIVE_LIVE_ARMED_OPEN_CLOSE_UNCONFIRMED');}}])try{await work();}catch(e){errors.push(e);}
  if(authority&&!originals)try{await closeNativeEconomicRecoveryAuthorityV1(authority);}catch(e){errors.push(e);}selected.tls=null;
  if(errors.length)throw new AggregateError(errors,'NATIVE_LIVE_ARMED_OPEN_CLOSE_UNCONFIRMED');return Object.freeze({closed:true,originalResourcesStopped:true,retainedEncryptedJournals:true});})();}
 try{authority=await openNativeLiveArmedRecoveryAuthorityV1(locator.identity,locator.checkpoint);originals=await reopenNativeLiveArmedFromAuthorityV1(authority);
  clocks=reopenOriginalNativeDeviceLiveArmedObservedClocksV1(originals.account,{runtime:originals.runtime,nativeRuntime:originals.nativeRuntime});
  // Reuse only the original session-restored checkpoint; legacy has none.
  const economicState=readOriginalSessionWalletEconomicStateV1(originals.session);
  if(economicState!==null)await economicState.observe();
  installed=await installOriginalNativeDeviceLiveArmedServiceV1(Object.fromEntries(['runtime','system','owner','account','nativeExecution','providerCustody','actor'].map(key=>[key,originals[key]])),selected.tls);assert.deepEqual(installed.descriptor,locator.descriptor);assert.equal(installed.parentJobId,locator.arm.parentJobId);assert.equal(installed.armSHA256,locator.arm.armSHA256);assert.equal(installed.settleBefore,locator.arm.settleBefore);
  if(installed.state!=='RECOVERED')producer=createOriginalNativeDeviceLiveRecoveryProducerV1({account:originals.account,executionBridge:installed.executionBridge,runtime:originals.runtime,system:originals.system,nativeRuntime:originals.nativeRuntime,clock:clocks.clock});
  return Object.freeze({profile:'ORIGINAL_NATIVE_DEVICE_LIVE_ARMED_OPERATOR_V1',origin:installed.transport.url,descriptor:installed.descriptor,automaticFunding:false,automaticNativeDelivery:false,
   originalArmedContinuation:installed.state!=='RECOVERED',originalRecoveryObservation:installed.state==='RECOVERED',newArmPermissionAccepted:false,abruptCrashRecoveryEstablished:false,close});
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'NATIVE_LIVE_ARMED_OPEN_FAILED',{cause:error});}throw error;}
}
