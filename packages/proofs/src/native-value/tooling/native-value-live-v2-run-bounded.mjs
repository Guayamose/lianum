/** Fixed private native-value V2 proof supervisor. No CLI, generic callback or key override. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, realpathSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, LIMITS } from '../../catalog.mjs';
import { resources, resourceFailure, regular, hash, assertID } from '../../tooling/tooling.mjs';
import { NATIVE_VALUE_LIVE_V2_SPEC, NATIVE_VALUE_LIVE_V2_LOCAL, validateNativeValueLiveV2Job } from '../metadata/native-value-live-v2-profile.mjs';
import { GLOBAL_PROOF_LOCK, NV2_WORKER, NV2_ROLE_PROCESS, json, readJSON, outputDirectory, writeNew, replace, runtimePins } from './native-value-live-v2-tooling.mjs';
import { loadNativeValueLiveArtifacts } from '../metadata/native-value-live-v2-artifacts.mjs';
import { exactRecord } from '../../../../backend/src/execution/encoding/commitments.mjs';
import { cloneInput } from '../../../../backend/src/execution/account/preparation/readiness-inputs.mjs';
export async function runNativeValueLiveV2Proof(raw){
 assert.equal(realpathSync(process.argv[1]),NV2_ROLE_PROCESS,'NV2_JOB_FIXED_ROLE_PARENT');assert.deepEqual(process.argv.slice(2),[NATIVE_VALUE_LIVE_V2_SPEC.name]);
 assert.deepEqual(process.execArgv,[]);assert.ok(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH);
 const request=cloneInput(raw);exactRecord(request,['relation','role','jobId','inputs','expectedPublicInputs']);
 assert.equal(request.relation,NATIVE_VALUE_LIVE_V2_SPEC.name);assert.equal(request.role,'local');assertID(request.jobId);
 await loadNativeValueLiveArtifacts();
 const began=performance.now(),runId=randomUUID(),attempt=outputDirectory(join(NATIVE_VALUE_LIVE_V2_LOCAL,'attempts',runId));
 const report={format:'NV2_SCOPED_PROOF_RESOURCES_V1',profile:'LIANUM_DYNAMIC_NATIVE_VALUE_ADMISSION_V2',relation:NATIVE_VALUE_LIVE_V2_SPEC.name,mode:'prove-dyadic21',runId,jobId:request.jobId,phase:'preflight',limits:LIMITS,hostLimitsChanged:false,
  failures:[],failure:null,samples:0,peakWorkerRSS:0,minimumAvailableRAM:Number.MAX_SAFE_INTEGER,minimumFreeDisk:Number.MAX_SAFE_INTEGER,outputBytes:0,rawOutputRetained:false};
 const save=()=>replace(join(attempt,'resources.json'),report);
 let child,interval,timeout,killTimer,closed=false,stopping=false,lockOwned=false,resolveClosed,payload;
 const completion=new Promise(resolve=>{resolveClosed=resolve;});
 const stop=code=>{if(stopping||closed)return;stopping=true;report.failure??=code;report.failures.push(code);save();if(child?.pid){child.kill('SIGTERM');killTimer=setTimeout(()=>{if(!closed)child.kill('SIGKILL');},LIMITS.killGraceMilliseconds);}};
 const sample=()=>{if(closed)return;try{const current=resources(child?.pid);report.samples++;report.latestResources=current;report.peakWorkerRSS=Math.max(report.peakWorkerRSS,current.workerRSS);report.minimumAvailableRAM=Math.min(report.minimumAvailableRAM,current.availableRAM);report.minimumFreeDisk=Math.min(report.minimumFreeDisk,current.freeDisk);const failure=resourceFailure(current);if(failure){report.failedResourceSample=current;stop(failure);}save();}catch{stop('NV2_JOB_RESOURCE_MONITOR_FAILED');}};
 const terminate=()=>stop('NV2_JOB_OWNER_STOPPED'),onExit=()=>{if(child?.pid&&!closed)child.kill('SIGKILL');};
 try{
  save();assert.equal(resourceFailure(resources()),null,'NV2_JOB_INITIAL_RESOURCE_FLOOR');
  // Shared one-heavy-job lock is claimed exclusively, never overwritten or
  // treated as stale. All journals/artifacts use the distinct native-value V2 directory.
  assert.equal(realpathSync(join(ROOT,'.local/proof-workers')),join(ROOT,'.local/proof-workers'));
  writeFileSync(GLOBAL_PROOF_LOCK,json({pid:process.pid,relation:NATIVE_VALUE_LIVE_V2_SPEC.name,mode:'prove-dyadic21',runId,jobId:request.jobId}),{flag:'wx',mode:0o600});lockOwned=true;
  writeNew(join(NATIVE_VALUE_LIVE_V2_LOCAL,'job-claims',request.jobId+'.json'),{runId,jobId:request.jobId,relation:NATIVE_VALUE_LIVE_V2_SPEC.name});
  const artifacts=await loadNativeValueLiveArtifacts();const job=validateNativeValueLiveV2Job(artifacts.program.abi,request.inputs,request.expectedPublicInputs);
  request.inputs=undefined;payload={type:'flat-proof-inputs',relation:NATIVE_VALUE_LIVE_V2_SPEC.name,role:'local',jobId:request.jobId,inputs:job.inputs,expectedPublicInputs:job.expectedPublicInputs};
  const pins=await runtimePins();writeNew(join(attempt,'runtime-pins.json'),pins);report.runtimePinsSHA256=hash(json(pins));
  child=spawn(process.execPath,[NV2_WORKER,runId,request.jobId],{cwd:ROOT,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},serialization:'json',stdio:['ignore','pipe','pipe','ipc']});
  child.once('close',(code,signal)=>{closed=true;clearInterval(interval);clearTimeout(timeout);clearTimeout(killTimer);report.exitCode=code;report.signal=signal;if(code!==0||signal!==null){report.failure??='NV2_JOB_WORKER_EXIT';report.failures.push('NV2_JOB_WORKER_EXIT');}resolveClosed();});
  child.once('error',()=>stop('NV2_JOB_SPAWN_FAILED'));child.once('spawn',()=>{report.workerPID=child.pid;report.phase='running';sample();});
  let sent=false;child.on('message',message=>{try{exactRecord(message,['type','relation','role','jobId']);assert.equal(message.type,'flat-proof-input-ready');assert.equal(message.relation,NATIVE_VALUE_LIVE_V2_SPEC.name);assert.equal(message.role,'local');assert.equal(message.jobId,request.jobId);assert.equal(sent,false);sent=true;child.send(payload,error=>{if(error)stop('NV2_JOB_IPC_SEND_FAILED');});payload=undefined;}catch{stop('NV2_JOB_IPC_PROTOCOL_FAILED');}});
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{report.outputBytes+=bytes.length;if(report.outputBytes>LIMITS.outputBytes)stop('NV2_JOB_OUTPUT_LIMIT');});
  process.once('SIGTERM',terminate);process.once('SIGINT',terminate);process.once('exit',onExit);
  interval=setInterval(sample,LIMITS.sampleMilliseconds);const remaining=LIMITS.phaseTimeoutMilliseconds-(performance.now()-began);assert.ok(remaining>0,'NV2_JOB_PREFLIGHT_TIMEOUT');timeout=setTimeout(()=>stop('NV2_JOB_TOTAL_TIMEOUT'),remaining);
  await completion;const result=readJSON(join(attempt,'result.json'));assert.equal(sent,true);assert.equal(result.phase,'completed');assert.equal(result.runId,runId);assert.equal(result.jobId,request.jobId);
  assert.deepEqual(await runtimePins(),pins,'NV2_JOB_RUNTIME_CHANGED');assert.deepEqual(report.failures,[]);assert.equal(resourceFailure(resources()),null,'NV2_JOB_FINAL_RESOURCE_FLOOR');report.phase='completed';
 }catch(error){report.phase='failed';report.failure??=String(error.message).match(/\b(?:NV2|NATIVE_VALUE|PW)_[A-Z0-9_]+\b/)?.[0]??'NV2_JOB_FAILED';if(child?.pid&&!closed){stop('NV2_JOB_SUPERVISOR_FAILED');await completion;}}
 finally{
  payload=undefined;request.inputs=undefined;clearInterval(interval);clearTimeout(timeout);clearTimeout(killTimer);process.removeListener('SIGTERM',terminate);process.removeListener('SIGINT',terminate);process.removeListener('exit',onExit);
  for(const stream of child?.stdio??[])stream?.destroy();report.lockPreserved=lockOwned;report.finalResources=resources();
  const finalFailure=resourceFailure(report.finalResources);
  if(finalFailure){report.phase='failed';report.failure??=finalFailure;report.failures.push(finalFailure);}
  if(lockOwned&&report.phase==='completed'){const lock=readJSON(GLOBAL_PROOF_LOCK);assert.equal(lock.pid,process.pid);assert.equal(lock.runId,runId);report.lockPreserved=false;save();unlinkSync(GLOBAL_PROOF_LOCK);}else save();
 }
 return Object.freeze({relation:NATIVE_VALUE_LIVE_V2_SPEC.name,mode:'prove-dyadic21',runId,jobId:request.jobId,phase:report.phase,errorCode:report.failure});
}
