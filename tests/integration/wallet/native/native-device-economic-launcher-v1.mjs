/** Fixed planned F capture and original successor. The caller is the PRIVATE
 * original fixture, not HTTP/SQL. No device root/opening/key is serialized over
 * IPC; economic actions remain fresh signed HTTPS requests to original bridges. */
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {readFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {nativeValueOriginalRecoverySourceV1} from '../../../../packages/backend/src/operations/deployments/native-value/native-value-system-v2.mjs';
import {createNativeEconomicRecoveryAuthorityV1,closeNativeEconomicRecoveryAuthorityV1} from '../../../../packages/backend/src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import {captureNativeValueEconomicRecoveryV1} from '../../../../packages/backend/src/operations/recovery/native-value-economic-recovery-v1.mjs';
const MAXIMUM_IPC_BYTES=2*1024*1024;
const originalBirth=pid=>{const bytes=readFileSync(`/proc/${pid}/stat`,'utf8'),fields=bytes.slice(bytes.lastIndexOf(')')+2).trim().split(/\s+/);
 assert.match(fields[19],/^[0-9]+$/);return{pid,ppid:Number(fields[1]),pgrp:Number(fields[2]),session:Number(fields[3]),startTimeTicks:fields[19]};};
export async function captureAndLaunchNativeDeviceEconomicSuccessorV1(context){
 assert.equal(arguments.length,1);assert.notEqual(context.deviceEconomicNativeNotes,true);return captureOriginalSuccessor(context,false);
}
export async function captureAndLaunchNativeDeviceNoteEconomicSuccessorV1(context){
 assert.equal(arguments.length,1);assert.equal(context.deviceEconomicNativeNotes,true);return captureOriginalSuccessor(context,true);
}
async function captureOriginalSuccessor(context,nativeNote){
 assert.equal(context.deviceEconomicRecovery,true);context.active();
 const WORKER=join(ROOT,nativeNote?'integration/native-device-economic-note-successor-worker-v1.mjs':'integration/native-device-economic-successor-worker-v1.mjs');
 const {runtime,nativeRuntime,bootstrap,system,owner,account,nativeExecution,joined,actor,originalTransport,originalPrepared,economicLifetime}=context;
 assert.equal(economicLifetime.captured,false);assert.equal(realpathSync(process.argv[1]),join(ROOT,nativeNote?'integration/native-value-economic-note-recovery-flow-v1.mjs':'integration/native-value-economic-recovery-flow-v1.mjs'));
 const sourceSHA256=nativeValueOriginalRecoverySourceV1(runtime,system),identity={directory:context.privateDirectory,runId:context.runId,sourceSHA256,deadlineMs:context.deadlineMs};
 assert.equal(identity.directory,join(ROOT,nativeNote?'.local/native-value-economic-note-recovery-v1':'.local/native-value-economic-recovery-v1','attempt-'+identity.runId,'private-audit'));
 // The recipient child is an original invoice producer, not an issuer section.
 // Stop it explicitly before capture while preserving its original invoice.
 const recipient=await originalPrepared.recipient.close();assert.equal(recipient.exited,true);assert.deepEqual(recipient.exit,{code:0,signal:null});
 context.result.cleanup.closedDeviceRecipient=true;
 if(context.originalWalletApplication){const closed=await context.originalWalletApplication.close();assert.equal(closed.listenerClosed,true);context.result.cleanup.closedWalletListener=true;}
 const before={process:originalBirth(process.pid),receiver:runtime.processStatus(),native:nativeRuntime.processStatus(),owner:owner.report(),proofCount:context.result.proofs.length,
   receiverWireCount:runtime.transactions.length,nativeWireCount:nativeRuntime.transactions.length};
 const authority=await createNativeEconomicRecoveryAuthorityV1(identity);
 // This fixed coordinator fences every original before its first await and
 // returns only after all ten original sections are stopped, sealed and closed.
 let checkpoint;
 try{checkpoint=await captureNativeValueEconomicRecoveryV1(authority,{runtime,nativeRuntime,bootstrap,system,
   providerCustody:originalPrepared.custody,owner,nativeExecution,account,session:joined.session,actor,transport:originalTransport});}
 catch(error){
   try{await closeNativeEconomicRecoveryAuthorityV1(authority);}
   catch(cleanup){throw new AggregateError([error,cleanup],'NATIVE_ECONOMIC_CAPTURE_ISSUER_CLOSE_FAILED',{cause:error});}
   throw error;
 }
 economicLifetime.captured=true;const oldTransport=await originalTransport.close();
 assert.equal(oldTransport.closed,true);assert.equal(oldTransport.ownedSocketsRemaining,0);assert.equal(oldTransport.originalDiagnosticsInFlight,0);
 assert.equal(runtime.processStatus().stopped,true);assert.equal(nativeRuntime.processStatus().stopped,true);assert.equal(owner.report().childExited,true);
 assert.equal(originalPrepared.custody.report().closed,true);context.result.cleanup.closedDeviceProvider=true;
 const stoppedOriginals={receiver:runtime.processStatus(),native:nativeRuntime.processStatus(),owner:owner.report(),transport:oldTransport};
 const child=fork(WORKER,[],{execPath:process.execPath,execArgv:[],cwd:ROOT,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},
   serialization:'json',stdio:['ignore','inherit','inherit','ipc']});
 const pending=new Map();let sequence=0,closed=null,closeReply,exitEvent,firstBirth;
 const completion=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{exitEvent={code,signal};});
  child.once('close',(code,signal)=>{closed={code,signal};for(const p of pending.values())p.reject(Error('NATIVE_ECONOMIC_SUCCESSOR_CLOSED_BEFORE_REPLY'));pending.clear();resolve({code,signal});});});
 completion.catch(()=>{});
 child.on('message',packet=>{try{assert.ok(Buffer.byteLength(JSON.stringify(packet))<=MAXIMUM_IPC_BYTES);const p=pending.get(packet.sequence);
   assert.ok(p,'NATIVE_ECONOMIC_SUCCESSOR_UNEXPECTED_REPLY');pending.delete(packet.sequence);if(packet.ok===true)p.resolve(packet.value);
   else{assert.equal(packet.ok,false);assert.match(packet.errorCode,/^[A-Z][A-Z0-9_]{0,95}$/);p.reject(Error(packet.errorCode));}}
  catch(error){for(const p of pending.values())p.reject(error);pending.clear();if(child.connected)child.disconnect();}});
 function request(action,extra={}){context.active();assert.equal(closed,null);assert.equal(child.connected,true);
  const packet={sequence:++sequence,action,...extra};assert.ok(Buffer.byteLength(JSON.stringify(packet))<=8192);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(packet.sequence);reject(Error('NATIVE_ECONOMIC_SUCCESSOR_ORIGINAL_DEADLINE'));if(child.connected)child.disconnect();},Math.max(1,identity.deadlineMs-Date.now()));
   pending.set(packet.sequence,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
   child.send(packet,error=>{if(error){const p=pending.get(packet.sequence);pending.delete(packet.sequence);p?.reject(error);}});});}
 async function close(){if(!closeReply){closeReply=(async()=>{let reply;try{if(!closed&&child.connected)reply=await request('CLOSE');}
   finally{if(child.connected)child.disconnect();}
   const observed=await completion;assert.deepEqual(observed,{code:0,signal:null});assert.deepEqual(exitEvent,observed);
   assert.equal(reply?.closed,true);assert.equal(reply.originalBackendStopped,true);assert.equal(reply.processId,child.pid);
   assert.equal(reply.listenerClosed,true);assert.equal(reply.ownedSocketsRemaining,0);return{...reply,exit:observed,close:observed,originalChildProcessClosed:true};})();closeReply.catch(()=>{});}return closeReply;}
 economicLifetime.closeSuccessor=close;
 try{
  const opened=await request('OPEN',{identity,checkpoint});firstBirth=originalBirth(child.pid);
  assert.equal(firstBirth.ppid,process.pid);assert.equal(firstBirth.pgrp,before.process.pgrp);assert.equal(firstBirth.session,before.process.session);
  assert.notEqual(firstBirth.pid,before.process.pid);assert.equal(opened.receipt.processId,child.pid);assert.equal(opened.receipt.originalProcessLifetimeDifferent,true);
  assert.equal(opened.receipt.originalSectionsStoppedBeforeCheckpoint,true);assert.equal(opened.receipt.issuerClosed,true);assert.equal(opened.receipt.sourceSHA256,sourceSHA256);
  assert.deepEqual(opened.descriptor,context.descriptor);assert.equal(opened.rootId,context.result.deviceCustody.sameRoot);
  assert.equal(opened.parentJobId,context.result.deviceReservation.jobId);assert.equal(opened.depositJobId,context.depositJobId);
  const report={profile:'ORIGINAL_PLANNED_NATIVE_DEVICE_RESTART_V1',sourceSHA256,checkpoint,originalProcess:before.process,successorProcess:firstBirth,
    originalSectionsStoppedBeforeReopen:true,parentDeviceVaultRetained:true,parentProcessExitEstablished:false,abruptCrashRecoveryEstablished:false,
    before,stoppedOriginals,receipt:opened.receipt,originalProofsBeforeRestart:context.result.proofs.length,oldDeliveryTransactions:before.nativeWireCount};
  context.result.deviceEconomicRestart=report;context.save();
  return Object.freeze({wait:()=>request('WAIT'),audit:()=>request('AUDIT'),close,processId:child.pid,report});
 }catch(error){if(child.connected)child.disconnect();try{await completion;}catch{}throw error;}
}
