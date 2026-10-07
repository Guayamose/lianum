import { inspectWrappedInstallationSourcesV2 } from '../../../../../tests/integration/deployments/wrapped/wrapped-installation-source-inspector-v2.mjs';
/** Fixed wrapped proof supervisor. No CLI, generic callback or key override. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, realpathSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, LIMITS } from '../../catalog.mjs';
import { resources, resourceFailure, regular, hash, assertID } from '../../tooling/tooling.mjs';
import { wrappedClaimRelationV1, validateWrappedClaimJobV1, WRAPPED_CLAIM_PROFILE_V1 } from '../metadata/wrapped-claim-profile-v1.mjs';
import { WRAPPED_CLAIM_GLOBAL_LOCK_V1 as GLOBAL_PROOF_LOCK, WRAPPED_CLAIM_WORKER_V1 as WORKER, WRAPPED_CLAIM_ROLE_PROCESS_V1 as ROLE_PROCESS, WRAPPED_CLAIM_LOCAL_V1 as LOCAL, json, readJSON, outputDirectory, writeNew, replace, wrappedClaimRuntimePinsV1 } from './wrapped-claim-tooling-v1.mjs';
import { loadWrappedClaimRoleProofArtifactsV1 } from '../../../../backend/src/operations/releases/wrapped/wrapped-claim-proof-artifacts-v1.mjs';
import { exactRecord } from '../../../../backend/src/execution/encoding/commitments.mjs';
import { cloneInput } from '../../../../backend/src/execution/account/preparation/readiness-inputs.mjs';
export async function runWrappedClaimRoleProofV1(raw){
 inspectWrappedInstallationSourcesV2();
 assert.equal(arguments.length,1,'WRAPPED_JOB_EXACT_REQUEST');const role=process.argv[2],spec=wrappedClaimRelationV1(role);
 assert.equal(realpathSync(process.argv[1]),ROLE_PROCESS,'WRAPPED_JOB_FIXED_ROLE_PARENT');assert.deepEqual(process.argv.slice(2),[role]);
 assert.deepEqual(process.execArgv,[]);assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.PATH,'/usr/bin:/bin');assert.equal(process.env.LANG,'C.UTF-8');
 const request=cloneInput(raw);exactRecord(request,['relation','role','jobId','inputs','expectedPublicInputs']);
 assert.equal(request.relation,spec.name);assert.equal(request.role,role);assertID(request.jobId);
 await loadWrappedClaimRoleProofArtifactsV1(role);
 const began=performance.now(),runId=randomUUID(),attempt=outputDirectory(join(LOCAL,'attempts',runId));
 const report={format:'WRAPPED_SCOPED_PROOF_RESOURCES_V1',profile:WRAPPED_CLAIM_PROFILE_V1,relation:spec.name,role,mode:'prove-wrapped-v1',runId,jobId:request.jobId,phase:'preflight',limits:LIMITS,hostLimitsChanged:false,
  failures:[],failure:null,samples:0,peakWorkerRSS:0,minimumAvailableRAM:Number.MAX_SAFE_INTEGER,minimumFreeDisk:Number.MAX_SAFE_INTEGER,outputBytes:0,rawOutputRetained:false};
 const save=()=>replace(join(attempt,'resources.json'),report);
 let child,interval,timeout,killTimer,closed=false,stopping=false,lockOwned=false,resolveClosed,payload;
 const completion=new Promise(resolve=>{resolveClosed=resolve;});
 const stop=code=>{if(stopping||closed)return;stopping=true;report.failure??=code;report.failures.push(code);save();if(child?.pid){child.kill('SIGTERM');killTimer=setTimeout(()=>{if(!closed)child.kill('SIGKILL');},LIMITS.killGraceMilliseconds);}};
 const sample=()=>{if(closed)return;try{inspectWrappedInstallationSourcesV2();const current=resources(child?.pid);report.samples++;report.latestResources=current;report.peakWorkerRSS=Math.max(report.peakWorkerRSS,current.workerRSS);report.minimumAvailableRAM=Math.min(report.minimumAvailableRAM,current.availableRAM);report.minimumFreeDisk=Math.min(report.minimumFreeDisk,current.freeDisk);const failure=resourceFailure(current);if(failure){report.failedResourceSample=current;stop(failure);}save();}catch{stop('WRAPPED_JOB_RESOURCE_MONITOR_FAILED');}};
 const terminate=()=>stop('WRAPPED_JOB_OWNER_STOPPED'),onExit=()=>{if(child?.pid&&!closed)child.kill('SIGKILL');};
 try{
  save();assert.equal(resourceFailure(resources()),null,'WRAPPED_JOB_INITIAL_RESOURCE_FLOOR');
  // Shared one-heavy-job lock is claimed exclusively, never overwritten or
  // treated as stale. All journals/artifacts use the distinct wrapped V1 directory.
  assert.equal(realpathSync(join(ROOT,'.local/proof-workers')),join(ROOT,'.local/proof-workers'));
  writeFileSync(GLOBAL_PROOF_LOCK,json({pid:process.pid,relation:spec.name,role,mode:'prove-wrapped-v1',runId,jobId:request.jobId}),{flag:'wx',mode:0o600});lockOwned=true;
  writeNew(join(LOCAL,'job-claims',role,request.jobId+'.json'),{runId,jobId:request.jobId,relation:spec.name});
  const artifacts=await loadWrappedClaimRoleProofArtifactsV1(role);const job=validateWrappedClaimJobV1(role,artifacts.program.abi,{relation:request.relation,inputs:request.inputs,expectedPublicInputs:request.expectedPublicInputs});
  request.inputs=undefined;payload={type:'wrapped-claim-proof-inputs-v1',relation:spec.name,role,jobId:request.jobId,inputs:job.inputs,expectedPublicInputs:job.expectedPublicInputs};job.inputs=undefined;
  const pins=await wrappedClaimRuntimePinsV1(role);writeNew(join(attempt,'runtime-pins.json'),pins);report.runtimePinsSHA256=hash(json(pins));
  inspectWrappedInstallationSourcesV2();child=spawn(process.execPath,[WORKER,role,runId,request.jobId],{cwd:ROOT,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},serialization:'json',stdio:['ignore','pipe','pipe','ipc']});
  child.once('close',(code,signal)=>{closed=true;clearInterval(interval);clearTimeout(timeout);clearTimeout(killTimer);report.exitCode=code;report.signal=signal;if(code!==0||signal!==null){report.failure??='WRAPPED_JOB_WORKER_EXIT';report.failures.push('WRAPPED_JOB_WORKER_EXIT');}resolveClosed();});
  child.once('error',()=>stop('WRAPPED_JOB_SPAWN_FAILED'));child.once('spawn',()=>{report.workerPID=child.pid;report.phase='running';sample();});
  let sent=false;child.on('message',message=>{try{exactRecord(message,['type','relation','role','jobId']);assert.equal(message.type,'wrapped-claim-proof-input-ready-v1');assert.equal(message.relation,spec.name);assert.equal(message.role,role);assert.equal(message.jobId,request.jobId);assert.equal(sent,false);sent=true;child.send(payload,error=>{if(error)stop('WRAPPED_JOB_IPC_SEND_FAILED');});payload=undefined;}catch{stop('WRAPPED_JOB_IPC_PROTOCOL_FAILED');}});
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{report.outputBytes+=bytes.length;if(report.outputBytes>LIMITS.outputBytes)stop('WRAPPED_JOB_OUTPUT_LIMIT');});
  process.once('SIGTERM',terminate);process.once('SIGINT',terminate);process.once('exit',onExit);
  interval=setInterval(sample,LIMITS.sampleMilliseconds);const remaining=LIMITS.phaseTimeoutMilliseconds-(performance.now()-began);assert.ok(remaining>0,'WRAPPED_JOB_PREFLIGHT_TIMEOUT');timeout=setTimeout(()=>stop('WRAPPED_JOB_TOTAL_TIMEOUT'),remaining);
  await completion;const result=readJSON(join(attempt,'result.json'));assert.equal(sent,true);assert.equal(result.phase,'completed');assert.equal(result.runId,runId);assert.equal(result.jobId,request.jobId);
  assert.deepEqual(await wrappedClaimRuntimePinsV1(role),pins,'WRAPPED_JOB_RUNTIME_CHANGED');assert.deepEqual(report.failures,[]);assert.equal(resourceFailure(resources()),null,'WRAPPED_JOB_FINAL_RESOURCE_FLOOR');report.phase='completed';
 }catch(error){report.phase='failed';report.failure??=String(error.message).match(/\b(?:WRAPPED|PW)_[A-Z0-9_]+\b/)?.[0]??'WRAPPED_JOB_FAILED';if(child?.pid&&!closed){stop('WRAPPED_JOB_SUPERVISOR_FAILED');await completion;}}
 finally{
  payload=undefined;request.inputs=undefined;clearInterval(interval);clearTimeout(timeout);clearTimeout(killTimer);process.removeListener('SIGTERM',terminate);process.removeListener('SIGINT',terminate);process.removeListener('exit',onExit);
  for(const stream of child?.stdio??[])stream?.destroy();report.lockPreserved=lockOwned;report.finalResources=resources();
  const finalFailure=resourceFailure(report.finalResources);
  if(finalFailure){report.phase='failed';report.failure??=finalFailure;report.failures.push(finalFailure);}
  if(lockOwned&&report.phase==='completed'){try{inspectWrappedInstallationSourcesV2();}catch(error){report.phase='failed';report.failure='WRAPPED_INSTALLATION_SOURCE_CHANGED';report.failures.push(report.failure);}}
  if(lockOwned&&report.phase==='completed'){const lock=readJSON(GLOBAL_PROOF_LOCK);assert.equal(lock.pid,process.pid);assert.equal(lock.runId,runId);assert.equal(lock.jobId,request.jobId);assert.equal(lock.relation,spec.name);assert.equal(lock.role,role);report.lockPreserved=false;save();unlinkSync(GLOBAL_PROOF_LOCK);}else save();
 }
 return Object.freeze({relation:spec.name,role,mode:'prove-wrapped-v1',runId,jobId:request.jobId,phase:report.phase,errorCode:report.failure});
}
