import {sha as canonicalJournalSHA} from '../../../../packages/engine/src/execution/accounts/generic-account-journal.mjs';
import {retainedExternalVaultWalletContextV1} from '../../../../packages/backend/src/accounts/recovery/external-defi-retained-vault-wallet-v1.mjs';
import {ownedPrivateVaultExitBinding,retainedOwnedPrivateVaultExitContextV1} from '../../../../packages/backend/src/defi/withdrawals/private-vault-exit.mjs';
import {externalVaultExitLifetimeContextV1,markExternalVaultExitCapturedV1} from '../../chains/evm/external-defi-vault-exit-lifetime-v1.mjs';
import {externalDefiVaultExitSourcePinsV1} from '../../chains/evm/external-defi-vault-exit-source-pins-v1.mjs';
import {commitExternalVaultExitCatalogueTransitionV1} from '../../chains/evm/external-defi-vault-exit-policy-v1.mjs';
import {hash} from '../../../../packages/proofs/src/tooling/tooling.mjs';
import {retainExternalDefiVaultCatalogueRecoveryV1,retainExternalDefiOwnersRecoveryV1,retainExternalDefiVaultExitSystemRecoveryV1,retainWrappedPrivateLifetimeRecoveryV1,retainExternalDefiReceiverRuntimeV2,finishWrappedRecoveryCaptureV1,closeWrappedRecoveryAuthorityV1} from '../../../../packages/backend/src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
/** Fixed planned F capture and original successor. The caller is the PRIVATE
 * original fixture, not HTTP/SQL. No device root/opening/key is serialized over
 * IPC; economic actions remain fresh signed HTTPS requests to original bridges. */
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {readFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {nativeValueOriginalRecoverySourceV1} from '../../../../packages/backend/src/operations/deployments/native-value/native-value-system-v2.mjs';
import {createNativeEconomicRecoveryAuthorityV1,createNativeEconomicNoteRecoveryAuthorityV1,closeNativeEconomicRecoveryAuthorityV1} from '../../../../packages/backend/src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import {captureNativeValueEconomicRecoveryV1} from '../../../../packages/backend/src/operations/recovery/native-value-economic-recovery-v1.mjs';
import {assertNativeLiveArmedRecoveryCaptureV1} from '../../../../packages/backend/src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import {captureNativeValueLiveArmedRecoveryV1} from '../../../../packages/backend/src/operations/recovery/native-value-economic-recovery-v1.mjs';
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
 const WORKER=join(ROOT,context.devicePrivateNative?'integration/run-native-value-private-durable-note-successor-v2.mjs':context.deviceDurableSQL?'integration/run-native-value-durable-economic-note-successor-v1.mjs':nativeNote?'integration/native-device-economic-note-successor-worker-v1.mjs':'integration/native-device-economic-successor-worker-v1.mjs');
 const {runtime,nativeRuntime,bootstrap,system,owner,account,nativeExecution,joined,actor,originalTransport,originalPrepared,economicLifetime}=context;
 assert.equal(economicLifetime.captured,false);assert.equal(realpathSync(process.argv[1]),join(ROOT,context.devicePrivateNative?'integration/native-value-private-durable-note-flow-v2.mjs':context.deviceDurableSQL?'integration/paired-native-note-flow-v2.mjs':nativeNote?'integration/native-value-economic-note-recovery-flow-v1.mjs':'integration/native-value-economic-recovery-flow-v1.mjs'));
 const sourceSHA256=nativeValueOriginalRecoverySourceV1(runtime,system),identity={directory:context.privateDirectory,runId:context.runId,sourceSHA256,deadlineMs:context.deadlineMs};
 assert.equal(identity.directory,join(ROOT,context.devicePrivateNative?'.local/native-value-private-durable-note-recovery-v2':context.deviceDurableSQL?'.local/native-value-durable-economic-note-recovery-v1':nativeNote?'.local/native-value-economic-note-recovery-v1':'.local/native-value-economic-recovery-v1','attempt-'+identity.runId,'private-audit'));
 // The recipient child is an original invoice producer, not an issuer section.
 // Stop it explicitly before capture while preserving its original invoice.
 const recipient=await originalPrepared.recipient.close();assert.equal(recipient.exited,true);assert.deepEqual(recipient.exit,{code:0,signal:null});
 context.result.cleanup.closedDeviceRecipient=true;
 if(context.originalWalletApplication){const closed=await context.originalWalletApplication.close();assert.equal(closed.listenerClosed,true);context.result.cleanup.closedWalletListener=true;}
 const before={process:originalBirth(process.pid),receiver:runtime.processStatus(),native:nativeRuntime.processStatus(),owner:owner.report(),proofCount:context.result.proofs.length,
   receiverWireCount:runtime.transactions.length,nativeWireCount:nativeRuntime.transactions.length};
 if(context.deviceDurableSQL){economicLifetime.durableSqlBefore=await context.durableInfrastructure.snapshot();assert.equal(economicLifetime.durableSqlBefore.length,4);context.result.durableOriginalAdmission.beforeCaptureEffectRows=economicLifetime.durableSqlBefore.length;}
 const authority=await (nativeNote?createNativeEconomicNoteRecoveryAuthorityV1:createNativeEconomicRecoveryAuthorityV1)(identity);
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
 economicLifetime.captured=true;const oldTransport=await originalTransport.close();if(context.deviceDurableSQL)context.durableInstalled.dispatch.close();
 assert.equal(oldTransport.closed,true);assert.equal(oldTransport.ownedSocketsRemaining,0);assert.equal(oldTransport.originalDiagnosticsInFlight,0);
 assert.equal(runtime.processStatus().stopped,true);assert.equal(nativeRuntime.processStatus().stopped,true);assert.equal(owner.report().childExited,true);
 assert.equal(originalPrepared.custody.report().closed,true);context.result.cleanup.closedDeviceProvider=true;
 const stoppedOriginals={receiver:runtime.processStatus(),native:nativeRuntime.processStatus(),owner:owner.report(),transport:oldTransport};
 return launchCapturedOriginalSuccessor(context,{WORKER,identity,checkpoint,before,stoppedOriginals,sourceSHA256,nativeNote,external:false});
}
export async function captureAndLaunchNativeDeviceLiveArmedShortSuccessorV1(context){
 assert.equal(arguments.length,1);assert.equal(context.deviceLiveArmed,true);context.active();assert.equal(realpathSync(process.argv[1]),join(ROOT,'integration/native-value-live-armed-short-restart-flow-v1.mjs'));
 const {runtime,nativeRuntime,bootstrap,system,owner,account,nativeExecution,joined,actor,originalTransport,originalPrepared,economicLifetime,liveProducer,liveClocks,liveRecoveryAuthority}=context;
 assert.equal(economicLifetime.captured,false);const admitted=assertNativeLiveArmedRecoveryCaptureV1(liveRecoveryAuthority),identity={...admitted};delete identity.profile;
 assert.equal(identity.directory,context.privateDirectory);assert.equal(identity.runId,context.runId);const sourceSHA256=nativeValueOriginalRecoverySourceV1(runtime,system);assert.equal(identity.sourceSHA256,sourceSHA256);
 const recipient=await originalPrepared.recipient.close();assert.equal(recipient.exited,true);assert.deepEqual(recipient.exit,{code:0,signal:null});context.result.cleanup.closedDeviceRecipient=true;
 const listener=await context.originalWalletApplication.close();assert.equal(listener.listenerClosed,true);context.result.cleanup.closedWalletListener=true;
 const before={process:originalBirth(process.pid),receiver:runtime.processStatus(),native:nativeRuntime.processStatus(),owner:owner.report(),proofCount:context.result.proofs.length,receiverWireCount:runtime.transactions.length,nativeWireCount:nativeRuntime.transactions.length};
 const checkpoint=await captureNativeValueLiveArmedRecoveryV1(liveRecoveryAuthority,{runtime,nativeRuntime,bootstrap,system,providerCustody:originalPrepared.custody,owner,nativeExecution,account,session:joined.session,actor,transport:originalTransport,executionBridge:context.executionBridge,clock:liveClocks.clock,liveProducer});
 economicLifetime.captured=true;const oldTransport=await originalTransport.close();assert.ok(oldTransport.closed&&oldTransport.ownedSocketsRemaining===0&&oldTransport.originalDiagnosticsInFlight===0);
 for(const value of [runtime,nativeRuntime])assert.equal(value.processStatus().stopped,true);assert.equal(owner.report().childExited,true);assert.equal(originalPrepared.custody.report().closed,true);context.result.cleanup.closedDeviceProvider=true;
 const stoppedOriginals={receiver:runtime.processStatus(),native:nativeRuntime.processStatus(),owner:owner.report(),transport:oldTransport};
 return launchCapturedOriginalSuccessor(context,{WORKER:join(ROOT,'integration/native-device-live-armed-short-successor-v1.mjs'),identity,checkpoint,before,stoppedOriginals,sourceSHA256,liveArmed:true,external:false});
}
async function launchCapturedOriginalSuccessor(context,{WORKER,identity,checkpoint,before,stoppedOriginals,sourceSHA256,nativeNote,external,liveArmed=false}){
 const economicLifetime=external?context.externalLifetime:context.economicLifetime;
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
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(packet.sequence);reject(Error('NATIVE_ECONOMIC_SUCCESSOR_ORIGINAL_DEADLINE'));if(child.connected)child.disconnect();},Math.max(1,(liveArmed?Math.min(identity.deadlineMs,context.deadlineMs):identity.deadlineMs)-Date.now()));
   pending.set(packet.sequence,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
   child.send(packet,error=>{if(error){const p=pending.get(packet.sequence);pending.delete(packet.sequence);p?.reject(error);}});});}
 async function close(){if(!closeReply){closeReply=(async()=>{let reply;try{if(!closed&&child.connected)reply=await request('CLOSE');}
   catch(error){if(child.connected)child.disconnect();throw error;}
   // The original child disconnects AFTER its send callback. A local parent
   // disconnect can suppress Node24's IPC EOF close count, leaving the same
   // ChildProcess.close Promise unsettled despite its real process exit.
   const observed=await completion;assert.deepEqual(observed,{code:0,signal:null});assert.deepEqual(exitEvent,observed);
   assert.equal(reply?.closed,true);assert.equal(reply.originalBackendStopped,true);assert.equal(reply.processId,child.pid);
   assert.equal(reply.listenerClosed,true);assert.equal(reply.ownedSocketsRemaining,0);return{...reply,exit:observed,close:observed,originalChildProcessClosed:true};})();closeReply.catch(()=>{});}return closeReply;}
 economicLifetime.closeSuccessor=close;
 try{
  const opened=await request('OPEN',{identity,checkpoint,...(context.deviceDurableSQL?{sqlInfrastructureIdentity:context.durableInfrastructure.identity}:{}),...(external?{expected:context.expected}:{} ),...(liveArmed?{controlDeadlineMs:context.deadlineMs}:{})});firstBirth=external?externalBirth(child.pid):originalBirth(child.pid);
  assert.equal(firstBirth.ppid,process.pid);assert.equal(firstBirth.pgrp,before.process.pgrp);assert.equal(firstBirth.session,before.process.session);
  assert.notEqual(firstBirth.pid,before.process.pid);assert.equal(opened.receipt.processId,child.pid);assert.equal(opened.receipt.originalProcessLifetimeDifferent,true);
  assert.equal(opened.receipt.originalSectionsStoppedBeforeCheckpoint,true);assert.equal(opened.receipt.issuerClosed,true);assert.equal(opened.receipt.sourceSHA256,sourceSHA256);
  if(external){
    assert.equal(opened.receiverWireCount,context.expected.actualWireCountBefore);assert.equal(opened.variant,context.expected.variant);assert.deepEqual(firstBirth.uid,before.process.uid);
    const report={profile:'ORIGINAL_RETAINED_OFFICIAL_VAULT_EXIT_BACKEND_V1',sourceSHA256,checkpoint,originalProcess:before.process,successorProcess:firstBirth,originalSectionsStoppedBeforeReopen:true,newBackendPID:true,bornBeforeFunding:true,variant:context.expected.variant,originalGraphRecoveryEstablished:false,abruptCrashRecoveryEstablished:false,parentProcessExitEstablished:false,before,stoppedOriginals,receipt:opened.receipt};
    return Object.freeze({audit:()=>request('AUDIT'),close,processId:child.pid,report});
  }
  if(context.deviceDurableSQL){assert.equal(opened.durableInfrastructureVerifiedBeforeIssuerOpen,true);assert.equal(opened.durableEffectRows,4);const after=await context.durableInfrastructure.snapshot();assert.deepEqual(after,economicLifetime.durableSqlBefore);Object.assign(context.result.durableOriginalAdmission,{afterReopenEffectRows:after.length,sameSqlRowsAcrossReopen:true,sameInfrastructureAfterReopen:true,originalSqlKeyVerifiedBeforeIssuerOpen:true});}
  assert.deepEqual(opened.descriptor,context.descriptor);assert.equal(opened.rootId,context.result.deviceCustody.sameRoot);
  assert.equal(opened.parentJobId,context.result.deviceReservation.jobId);assert.equal(opened.depositJobId,context.depositJobId);
  const report={profile:liveArmed?'ORIGINAL_PLANNED_NATIVE_DEVICE_ARMED_SHORT_RESTART_V1':'ORIGINAL_PLANNED_NATIVE_DEVICE_RESTART_V1',sourceSHA256,checkpoint,originalProcess:before.process,successorProcess:firstBirth,
    originalSectionsStoppedBeforeReopen:true,parentDeviceVaultRetained:true,parentProcessExitEstablished:false,abruptCrashRecoveryEstablished:false,
    before,stoppedOriginals,receipt:opened.receipt,originalProofsBeforeRestart:context.result.proofs.length,oldDeliveryTransactions:before.nativeWireCount};
  context.result.deviceEconomicRestart=report;context.save();
  return Object.freeze({wait:()=>request('WAIT'),audit:()=>request('AUDIT'),close,processId:child.pid,report});
 }catch(error){if(child.connected)child.disconnect();try{await completion;}catch{}throw error;}
}

const externalBirth=pid=>{const value=originalBirth(pid),status=readFileSync(`/proc/${pid}/status`,'utf8'),match=/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status);assert.ok(match);return{...value,uid:match.slice(1).map(Number)};};
/** Finite caller over the branded before-effects wallet and original External5.
 * Incoming HTTP/DTOs can neither select this child nor supply captured state. */
export async function captureAndLaunchExternalDefiVaultExitSuccessorV1(context){
 assert.equal(arguments.length,1);assert.equal(context.externalDefiVaultExitRecovery,true);assert.equal(realpathSync(process.argv[1]),join(ROOT,'integration/evm-vault-flow.mjs'));context.active();
 const wallet=retainedExternalVaultWalletContextV1(context.wallet),life=externalVaultExitLifetimeContextV1(context.fixture.recoveryLifetime);
 assert.equal(wallet.vaultNotes,true,'EXTERNAL_VAULT_ORIGINAL_NOTE_LIFECYCLE_REQUIRED');
 assert.equal(wallet.runtime,life.runtime);assert.equal(wallet.runtime,context.fixture.runtime);assert.equal(wallet.system,context.fixture.system);assert.equal(wallet.protocolFixture,context.fixture.officialProtocol);assert.equal(wallet.owners[0],context.fixture.sourceOwner);assert.equal(wallet.owners[1],context.fixture.targetOwner);assert.equal(context.privateDirectory,life.identity.directory);
 const sourceSHA256=hash(JSON.stringify(externalDefiVaultExitSourcePinsV1()));assert.equal(sourceSHA256,life.identity.sourceSHA256);
 const receipt=await wallet.service.originalReceipt('vault_exit_1'),exit=retainedOwnedPrivateVaultExitContextV1(wallet.service);
 assert.equal(ownedPrivateVaultExitBinding(wallet.runtime,wallet.service).vault,wallet.vault);
 const snapshot=await wallet.catalogue.keeper.snapshot();assert.deepEqual(snapshot.requests.map(row=>row.requestId),['vault_top_up','vault_exit_0','vault_exit_1']);assert.deepEqual(snapshot.requests.map(row=>row.state),['CONFIRMED','CONFIRMED','CONFIRMED']);
 const before={process:externalBirth(process.pid),receiver:wallet.runtime.processStatus(),owners:wallet.owners.map(owner=>owner.report()),receiverWireCount:wallet.runtime.transactions.length};
 const catalogueTransition=commitExternalVaultExitCatalogueTransitionV1(wallet.catalogue.status());
 const expected={variant:wallet.variant,actualWireCountBefore:before.receiverWireCount,catalogueIdentitySHA256:catalogueTransition.beforeSHA256,catalogueRecoveredIdentitySHA256:catalogueTransition.afterSHA256,receiptSHA256:canonicalJournalSHA(receipt),redemptionReferenceSHA256:canonicalJournalSHA(receipt.reference),exitIdentitySHA256:canonicalJournalSHA(exit.identity)};
 // Each fixed writer owns/fences its originals; credentials never enter IPC.
 // The receiver is last, after all original readers/owners have stopped.
 let checkpoint;
 try{
  await retainExternalDefiVaultCatalogueRecoveryV1(life.authority,{catalogue:wallet.catalogue,services:[wallet.service]});
  await retainExternalDefiOwnersRecoveryV1(life.authority,{owners:wallet.owners});
  await retainExternalDefiVaultExitSystemRecoveryV1(life.authority,{runtime:wallet.runtime,system:wallet.system});
  await retainWrappedPrivateLifetimeRecoveryV1(life.authority,wallet.runtime);
  await retainExternalDefiReceiverRuntimeV2(life.authority,wallet.runtime);
  checkpoint=await finishWrappedRecoveryCaptureV1(life.authority);
 }catch(error){try{await closeWrappedRecoveryAuthorityV1(life.authority);}catch(cleanup){throw new AggregateError([error,cleanup],'EXTERNAL_VAULT_CAPTURE_ISSUER_CLOSE_FAILED',{cause:error});}throw error;}
 assert.equal(wallet.runtime.processStatus().stopped,true);for(const owner of wallet.owners){const row=owner.report();assert.equal(row.childExited,true);assert.deepEqual(row.exit,{code:0,signal:null});}
 const stoppedOriginals={receiver:wallet.runtime.processStatus(),owners:wallet.owners.map(owner=>owner.report())};
 markExternalVaultExitCapturedV1(context.fixture.recoveryLifetime);
 return launchCapturedOriginalSuccessor({...context,expected,externalLifetime:{}},{WORKER:join(ROOT,'integration/external-defi-vault-exit-successor-v1.mjs'),identity:life.identity,checkpoint,before,stoppedOriginals,sourceSHA256,external:true});
}
