/** Fixed public rebuild supervisor. Never starts nodes or handles real witnesses. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { nativeProcStatV1 } from '../../../tests/integration/native/native-flow-owned-files-v1.mjs';
import { catalog, tools, DIRECTORY, STEPS, parse, write, replace, fingerprint, co42Artifacts }
  from '../../../packages/backend/src/proving/native-ingress/tooling/native-claims-build-common.mjs';
assert.equal(process.argv.length,2,'NATIVE_REBUILD_FIXED_INVOCATION');
assert.deepEqual(process.execArgv,[]);assert.ok(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH);
const env={PATH:'/usr/bin:/bin',LANG:'C.UTF-8'};
const lockPath=join(catalog.LOCAL,'active.lock');
const worker=join(catalog.ROOT,'proof-workers/native-claims-build-worker.mjs');
async function rebuildCO42(mode) {
  const result=await new Promise((resolve,reject)=>{
    const child=spawn('/usr/bin/python3',[join(catalog.ROOT,'proof-workers/native-claims-parent-death.py'),mode],
      {cwd:catalog.ROOT,env,stdio:['ignore','pipe','pipe']});
    let output='',bytes=0,identity,stopped;
    const signal=()=>{
      if(!identity)return;
      const current=nativeProcStatV1(child.pid);
      if(current&&current.ppid===process.pid&&current.startTimeTicks===identity.startTimeTicks)
        child.kill('SIGTERM');
    };
    const terminate=()=>{stopped??='NATIVE_REBUILD_OWNER_STOPPED';signal();};
    const onExit=()=>signal();
    process.once('SIGTERM',terminate);process.once('SIGINT',terminate);process.once('exit',onExit);
    child.once('spawn',()=>{identity=nativeProcStatV1(child.pid);
      if(stopped)signal();});
    const cleanup=()=>{process.removeListener('SIGTERM',terminate);process.removeListener('SIGINT',terminate);process.removeListener('exit',onExit);};
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
      bytes+=chunk.length;if(bytes>catalog.LIMITS.outputBytes){stopped??='NATIVE_REBUILD_OUTPUT_LIMIT';signal();return;}
      if(stream===child.stdout)output+=chunk.toString('utf8');
    });
    child.once('error',error=>{cleanup();reject(error);});
    child.once('close',(code,signal)=>{cleanup();try{assert.equal(stopped,undefined,stopped);assert.equal(code,0,'NATIVE_REBUILD_CO42_PHASE_FAILED');assert.equal(signal,null);resolve(JSON.parse(output));}catch(error){reject(error);}});
  });
  assert.equal(result.phase,'completed');
  process.stdout.write(JSON.stringify({relation:'native_claim_discharge',mode,...result})+'\n');
}
async function supervise(step) {
  const began=performance.now(),runId=randomUUID(),attempt=join(DIRECTORY,'attempts',runId);
  mkdirSync(attempt,{recursive:true,mode:0o700});
  let child,closed=false,owned=false,interval,timeout,killTimer,resolveClosed;
  const completion=new Promise(resolve=>{resolveClosed=resolve;});
  const report={format:'LIANUM_DEVELOPMENT_NATIVE_CLAIMS_RESOURCE_REPORT_V1',step,runId,
    phase:'preflight',limits:catalog.LIMITS,failures:[],failure:null,hostLimitsChanged:false,
    samples:0,peakWorkerRSS:0,minimumAvailableRAM:Number.MAX_SAFE_INTEGER,
    minimumFreeDisk:Number.MAX_SAFE_INTEGER,outputBytes:0,rawOutputRetained:false};
  const save=()=>replace(join(attempt,'resources.json'),report);
  let stopping=false;
  const stop=code=>{
    if(stopping||closed)return;stopping=true;report.failure??=code;report.failures.push(code);save();
    if(child?.pid){child.kill('SIGTERM');killTimer=setTimeout(()=>{if(!closed)child.kill('SIGKILL');},catalog.LIMITS.killGraceMilliseconds);}
  };
  const sample=()=>{
    if(closed)return;
    try { const current=tools.resources(child?.pid);report.samples++;report.latestResources=current;
      report.peakWorkerRSS=Math.max(report.peakWorkerRSS,current.workerRSS);
      report.minimumAvailableRAM=Math.min(report.minimumAvailableRAM,current.availableRAM);
      report.minimumFreeDisk=Math.min(report.minimumFreeDisk,current.freeDisk);
      const failure=tools.resourceFailure(current);if(failure){report.failedResourceSample=current;stop(failure);}else save();
    }catch{stop('NATIVE_REBUILD_RESOURCE_MONITOR_FAILED');}
  };
  const terminate=()=>stop('NATIVE_REBUILD_OWNER_STOPPED');
  const onExit=()=>{if(child?.pid&&!closed)child.kill('SIGKILL');};
  try {
    save();assert.equal(tools.resourceFailure(tools.resources()),null,'NATIVE_REBUILD_INITIAL_RESOURCE_FLOOR');
    writeFileSync(lockPath,tools.jsonBytes({pid:process.pid,relation:'development_native_claims_v1',mode:step,runId}),{flag:'wx',mode:0o600});owned=true;
    const pins=await fingerprint();write(join(attempt,'pins.json'),pins);
    report.pinsSHA256=tools.hash(tools.regular(join(attempt,'pins.json')));
    child=spawn(process.execPath,[worker,step,runId],{cwd:catalog.ROOT,env,serialization:'json',stdio:['ignore','pipe','pipe','ipc']});
    child.once('close',(code,signal)=>{closed=true;clearInterval(interval);clearTimeout(timeout);clearTimeout(killTimer);
      report.exitCode=code;report.signal=signal;
      if(code!==0||signal!==null){report.failure??='NATIVE_REBUILD_WORKER_EXIT';report.failures.push('NATIVE_REBUILD_WORKER_EXIT');}resolveClosed();});
    child.once('error',()=>stop('NATIVE_REBUILD_SPAWN_FAILED'));child.once('spawn',()=>{report.workerPID=child.pid;report.phase='running';sample();});
    for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{report.outputBytes+=bytes.length;if(report.outputBytes>catalog.LIMITS.outputBytes)stop('NATIVE_REBUILD_OUTPUT_LIMIT');});
    process.once('SIGTERM',terminate);process.once('SIGINT',terminate);process.once('exit',onExit);
    interval=setInterval(sample,catalog.LIMITS.sampleMilliseconds);
    const remaining=catalog.LIMITS.phaseTimeoutMilliseconds-(performance.now()-began);assert.ok(remaining>0);
    timeout=setTimeout(()=>stop('NATIVE_REBUILD_TOTAL_TIMEOUT'),remaining);
    await completion;const result=parse(join(attempt,'result.json'));
    assert.equal(result.phase,'completed',result.errorCode??'NATIVE_REBUILD_RESULT_FAILED');assert.equal(result.runId,runId);
    assert.deepEqual(await fingerprint(),pins,'NATIVE_REBUILD_RUNTIME_CHANGED');
    assert.deepEqual(report.failures,[]);report.phase='completed';
  }catch(error){report.phase='failed';report.failure??=String(error.message).match(/(?:NATIVE_REBUILD_|PW_)[A-Z0-9_]+/)?.[0]??'NATIVE_REBUILD_FAILED';if(child?.pid&&!closed){stop('NATIVE_REBUILD_SUPERVISOR_FAILED');await completion;}}
  finally {
    clearInterval(interval);clearTimeout(timeout);clearTimeout(killTimer);
    process.removeListener('SIGTERM',terminate);process.removeListener('SIGINT',terminate);process.removeListener('exit',onExit);
    for(const stream of child?.stdio??[])stream?.destroy();
    report.lockPreserved=owned;report.finalResources=tools.resources();report.elapsedMilliseconds=performance.now()-began;
    const failure=tools.resourceFailure(report.finalResources);if(failure){report.phase='failed';report.failure??=failure;report.failures.push(failure);}
    if(owned&&report.phase==='completed') {
      const lock=parse(lockPath);assert.equal(lock.pid,process.pid);assert.equal(lock.runId,runId);
      report.lockPreserved=false;save();unlinkSync(lockPath);
    }else save();
  }
  process.stdout.write(JSON.stringify({step,runId,phase:report.phase,errorCode:report.failure,peakWorkerRSS:report.peakWorkerRSS})+'\n');
  assert.equal(report.phase,'completed','NATIVE_REBUILD_PHASE_FAILED');
}
await fingerprint();
for(const mode of ['compile','stats','prepare-key'])await rebuildCO42(mode);
await co42Artifacts();
for(const step of STEPS)await supervise(step);
process.stdout.write(JSON.stringify({directory:DIRECTORY,manifestSHA256:tools.hash(tools.regular(join(DIRECTORY,'manifest.json'))),
  historicalReportsRecreated:false,nativeNodesStarted:false,proofGenerated:false})+'\n');
