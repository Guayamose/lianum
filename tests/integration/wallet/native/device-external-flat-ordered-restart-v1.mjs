/** Private fixed handoff: original four-section capture, then a new child.
 * IPC carries only the original public identity/checkpoint and audit joins.
 * The device Vault, note opening and signing keys remain in the parent. */
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {join} from 'node:path';
import {realpathSync,readFileSync} from 'node:fs';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {nativeProcStatV1} from '../../native/native-flow-owned-files-v1.mjs';
import {assertOwnedDeviceExternalFlatReceiverV1} from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
const WORKER=join(ROOT,'integration/device-external-flat-ordered-successor-v1.mjs');
const birth=pid=>{const value=nativeProcStatV1(pid);assert.ok(value);const match=/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(readFileSync('/proc/'+pid+'/status','utf8'));assert.ok(match);return{...value,uid:match.slice(1).map(Number)};};
export function captureAndLaunchOriginalDeviceExternalFlatObservationV1(context){assert.equal(arguments.length,1);return captureAndLaunch(context,false);}
export function captureAndLaunchOriginalDeviceExternalFlatGraphObservationV1(context){assert.equal(arguments.length,1);return captureAndLaunch(context,true);}
export function captureAndLaunchOriginalDeviceMorphoBlueGraphObservationV1(context){assert.equal(arguments.length,1);return captureAndLaunch(context,true,true);}
export function captureAndLaunchOriginalDeviceMetaFourGraphObservationV4(context){assert.equal(arguments.length,1);return captureAndLaunch(context,true,false,true);}
async function captureAndLaunch(context,graph,blue=false,multi=false){assert.equal(realpathSync(process.argv[1]),join(ROOT,'integration/device-external-flat-erc20-flow-v1.mjs'));
 const parent=readFileSync('/proc/'+process.ppid+'/cmdline','utf8').split('\0').filter(Boolean);assert.deepEqual(parent,[process.execPath,join(ROOT,'integration/'+(multi?'run-device-external-flat-meta-four-deliveries-v1.mjs':blue?'run-device-morpho-blue-private-position-v1.mjs':graph?'run-device-external-flat-source-graph-v1.mjs':'run-device-external-flat-erc20-v1.mjs'))]);
 context.active();assertOwnedDeviceExternalFlatReceiverV1(context.runtime);const originalProcess=birth(process.pid);
 const originalReceiver=context.runtime.processStatus(),capture=await(graph?context.host.captureGraphRetained():context.host.captureRetained());
 assert.equal(capture.profile,'DEVICE_EXTERNAL_FLAT_ORDERED_OBSERVATION_RECOVERY_V1');assert.equal(capture.originalResourcesStopped,true);assert.equal(capture.observationContinuationOnly,true);
 const stopped=context.runtime.processStatus();assert.equal(stopped.stopped,true);assert.equal(stopped.exitObserved,true);assert.equal(stopped.exitCode,0);assert.equal(stopped.signal,null);assert.equal(nativeProcStatV1(stopped.pid),null);
 const child=fork(WORKER,[],{execPath:process.execPath,execArgv:[],cwd:ROOT,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},serialization:'json',stdio:['ignore','inherit','inherit','ipc']});
 const pending=new Map();let sequence=0,closed=null,exitEvent=null,closing;
 const completion=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{exitEvent={code,signal};});child.once('close',(code,signal)=>{closed={code,signal};for(const request of pending.values())request.reject(Error('DEVICE_EXTERNAL_FLAT_SUCCESSOR_CLOSED'));pending.clear();resolve(closed);});});completion.catch(()=>{});
 child.on('message',packet=>{try{assert.ok(Buffer.byteLength(JSON.stringify(packet))<=2*1024*1024);const request=pending.get(packet.sequence);assert.ok(request);pending.delete(packet.sequence);
   if(packet.ok===true)request.resolve(packet.value);else{assert.equal(packet.ok,false);assert.equal(/^[A-Z][A-Z0-9_]{0,95}$/.exec(packet.errorCode)?.[0],packet.errorCode);request.reject(Object.assign(Error(packet.errorCode),{code:packet.errorCode}));}}
  catch(error){for(const request of pending.values())request.reject(error);pending.clear();if(child.connected)child.disconnect();}});
 const request=(action,extra={})=>{context.active();assert.equal(closed,null);assert.equal(child.connected,true);const packet={sequence:++sequence,action,...extra};assert.ok(Buffer.byteLength(JSON.stringify(packet))<=8192);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(packet.sequence);reject(Error('DEVICE_EXTERNAL_FLAT_SUCCESSOR_DEADLINE'));if(child.connected)child.disconnect();},Math.max(1,context.identity.deadlineMs-Date.now()));
   pending.set(packet.sequence,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});child.send(packet,error=>{if(error){const active=pending.get(packet.sequence);pending.delete(packet.sequence);active?.reject(error);}});});};
 const close=()=>closing??=(async()=>{let reply,primary;try{if(!closed&&child.connected)reply=await request('CLOSE');}catch(error){primary=error;if(child.connected)child.disconnect();}
  // Keep the child's original IPC EOF. Local disconnect after a successful
  // reply can suppress Node's actual ChildProcess.close event.
  let observed;try{observed=await completion;}catch(error){if(primary)throw new AggregateError([primary,error],'DEVICE_EXTERNAL_FLAT_SUCCESSOR_CLOSE_FAILED',{cause:primary});throw error;}if(primary)throw primary;assert.deepEqual(observed,{code:0,signal:null});assert.deepEqual(exitEvent,observed);assert.equal(reply?.closed,true);assert.equal(reply.originalBackendStopped,true);assert.equal(reply.processId,child.pid);
  return{...reply,exit:observed,close:observed,originalChildProcessClosed:true};})();
 context.lifetime.closeSuccessor=close;
 try{const opened=await request('OPEN',{identity:context.identity,checkpoint:capture.checkpoint,expected:context.expected});const successorProcess=birth(child.pid);assert.equal(successorProcess.ppid,process.pid);assert.equal(successorProcess.pgrp,originalProcess.pgrp);assert.equal(successorProcess.session,originalProcess.session);assert.notEqual(successorProcess.pid,originalProcess.pid);assert.deepEqual(successorProcess.uid,originalProcess.uid);
  assert.deepEqual(opened.descriptor,context.descriptor);if(multi)assert.deepEqual(opened.targetDescriptors,context.targetDescriptors);else if(graph)assert.deepEqual(opened.targetDescriptor,context.targetDescriptor);assert.equal(opened.observationOnly,true);assert.equal(opened.processId,child.pid);assert.equal(opened.sourceSHA256,context.identity.sourceSHA256);assert.equal(opened.wireCount,context.expected.wireCount);assert.equal(opened.receiptCount,context.expected.receiptCount);
  return Object.freeze({descriptor:opened.descriptor,...(graph?{targetDescriptor:opened.targetDescriptor}:{}),...(multi?{targetDescriptors:opened.targetDescriptors}:{}),processId:child.pid,audit:()=>request('AUDIT'),close,report:{profile:capture.profile,checkpoint:capture.checkpoint,originalProcess,successorProcess,originalReceiver,stoppedOriginalReceiver:stopped,originalSectionsStoppedBeforeReopen:true,observationOnly:true,parentDeviceVaultRetained:true,parentProcessExitEstablished:false,abruptCrashRecoveryEstablished:false,sourceSHA256:context.identity.sourceSHA256}});
 }catch(error){if(child.connected)child.disconnect();try{await completion;}catch{}throw error;}
}
