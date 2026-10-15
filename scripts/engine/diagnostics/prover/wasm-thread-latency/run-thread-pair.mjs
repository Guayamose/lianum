/** Exactly two fresh-process proofs, one reciprocal verifier, metrics only. No chain/native backend. */
import assert from 'node:assert/strict';
import {fork,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {root,project,spec,limits,floors,hash,filePin,guard,resources,verifyPins,cacheLineage,safeError} from './common.mjs';
import {readDerivedCache} from '../crs-cache-latency/cache-files.mjs';
throw Error('WT_PAUSED_BY_USER_NOT_EXECUTED_PREPARATION_INCOMPLETE');
assert.equal(process.argv.length,3,'WT_FIXED_ARGUMENTS');
assert.equal(process.argv[2],'--parent-approved-one-pair','WT_PARENT_COORDINATION_REQUIRED');
assert.equal(process.platform,'linux','WT_LINUX_ONLY');assert.equal(process.arch,'x64','WT_X64_ONLY');
const manifestSHA256=filePin(join(root,'pins.json')).sha256;
const checked=verifyPins(manifestSHA256),cache=checked.manifest.cache;
const lineage=cacheLineage(cache.sourceManifestSHA256,checked.toolchain,checked.crsIntegrity);
const cacheReference=readDerivedCache(join(project,cache.directory),cache.derivationSHA256,lineage,false).reference;
assert.equal(cacheReference.cache.sha256,cache.sha256,'WT_CACHE_PIN');
const report={classification:'ONE_IDENTICAL_SYNTHETIC_BTC_V2_WASM_THREAD_PROOF_PAIR_NOT_WALLET_ACCEPTANCE',startedAt:new Date().toISOString(),phase:'starting',mode:spec.mode,target:spec.target,publicInputCount:spec.publicInputCount,maximumPages:spec.maximumPages,
 serialOrder:[1,4],exactlyTwoNewProofs:true,finalReciprocalVerifierOnly:true,coldProcessesNotColdFilesystemCache:true,zeroKnowledgeEnabled:true,emptyProvingVKUnchanged:true,
 privateInputWitnessAndRawProofPersistence:false,newChainOrNativeBackendAction:false,hostSettingsChanged:false,productionSourceChanged:false,
 manifestSHA256,cache:cacheReference,floors,limits,results:[],limitations:'One ordered pair is directional evidence, not a statistical latency distribution. CPU quota is unknown; affinity is not dedicated capacity. Shared WASM memory avoids per-thread heap replication but does not promise flat RSS.',
 before:guard(),cpu:{affinityAvailableProcessors:Number(execFileSync('nproc',[],{encoding:'utf8'}).trim()),cpusAllowedList:/Cpus_allowed_list:\s*([^\n]+)/.exec(readFileSync('/proc/self/status','utf8'))?.[1],quotaInformationRead:false,dedicatedCoresClaimed:false}};
const runDirectory=mkdtempSync(join(root,'run-'));const reportPath=join(runDirectory,'comparison.json');
const save=()=>writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
report.sourcePins=Object.fromEntries(['common.mjs','synthetic-input.mjs','one-thread-child.mjs','run-thread-pair.mjs','pins.json','PROPOSAL.md','preflight.mjs'].map(p=>[p,filePin(join(root,p))]));save();
let cancelled=false,stopActive;
const cancel=()=>{cancelled=true;stopActive?.('WT_SUPERVISOR_STOP');};
process.on('SIGINT',cancel);process.on('SIGTERM',cancel);
function ownedProcesses(group,requireRoot=false){
 const found=[];
 for(const name of readdirSync('/proc')){
  if(!/^\d+$/.test(name))continue;
  try{
   const text=readFileSync('/proc/'+name+'/stat','utf8'),tail=text.slice(text.lastIndexOf(')')+2).split(' ');
   if(Number(tail[2])!==group)continue;
   const status=readFileSync('/proc/'+name+'/status','utf8');
   const p={pid:Number(name),parent:Number(tail[1]),startTime:tail[19],state:tail[0],rssBytes:Number(/VmRSS:\s+(\d+)/.exec(status)?.[1]??0)*1024,hwmBytes:Number(/VmHWM:\s+(\d+)/.exec(status)?.[1]??0)*1024,statusThreads:Number(/Threads:\s+(\d+)/.exec(status)?.[1]??0),taskCount:0,pssBytes:0};
   if(p.state!=='Z'){
    p.taskCount=readdirSync('/proc/'+name+'/task').filter(x=>/^\d+$/.test(x)).length;
    const rollup=readFileSync('/proc/'+name+'/smaps_rollup','utf8'),pss=/^Pss:\s+(\d+)\s+kB/m.exec(rollup);assert.ok(pss,'WT_PSS_REQUIRED');p.pssBytes=Number(pss[1])*1024;
   }
   found.push(p);
  }catch(error){if(requireRoot&&Number(name)===group)throw error;}
 }
 if(requireRoot)assert.ok(found.some(p=>p.pid===group),'WT_ROOT_MISSING');return found;
}
async function run(role,threads,crossProof){
 assert.equal(cancelled,false,'WT_CANCELLED');guard();
 for(const [file,pin]of Object.entries(report.sourcePins))filePin(join(root,file),pin);
 const started=performance.now(),samples=[],identities=new Map();let result,failure,phase='child-startup',rootExited=false,stopping=false,killTimer,firstMessageMilliseconds,primaryObservedMilliseconds;
 const child=fork(join(root,'one-thread-child.mjs'),[],{cwd:project,execArgv:['--max-old-space-size=512'],serialization:'advanced',detached:true,stdio:['ignore','pipe','pipe','ipc'],env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8',WT_SUPERVISED:'btc-v2-one-pair-v1',WT_ROLE:role}});
 child.once('exit',()=>{rootExited=true;});
 try{for(const p of ownedProcesses(child.pid))identities.set(p.pid+':'+p.startTime,{pid:p.pid,parent:p.parent,startTime:p.startTime});}catch{}
 function signalOwned(signal){
  if(!rootExited)try{child.kill(signal);}catch{}
  let members=[];try{members=ownedProcesses(child.pid);}catch{failure??='WT_MONITOR_READ';}
  for(const p of members)if(identities.has(p.pid+':'+p.startTime))try{process.kill(p.pid,signal);}catch{}
 }
 function stop(code){failure??=code;if(stopping)return;stopping=true;signalOwned('SIGTERM');killTimer=setTimeout(()=>signalOwned('SIGKILL'),limits.terminateGraceMilliseconds);}
 function sample(){try{
  const members=ownedProcesses(child.pid,!rootExited),host=resources();for(const p of members)identities.set(p.pid+':'+p.startTime,{pid:p.pid,parent:p.parent,startTime:p.startTime});
  const row={elapsedMilliseconds:performance.now()-started,phase,availableRAM:host.availableRAM,freeDisk:host.freeDisk,supervisorRSSBytes:host.rss,ownedProcessCount:members.filter(p=>p.state!=='Z').length,
   ownedRSSSumBytes:members.reduce((n,p)=>n+p.rssBytes,0),ownedPSSSumBytes:members.reduce((n,p)=>n+p.pssBytes,0),ownedTaskCount:members.reduce((n,p)=>n+p.taskCount,0),statusThreadCount:members.reduce((n,p)=>n+p.statusThreads,0),childHWMBytes:Math.max(0,...members.filter(p=>p.pid===child.pid).map(p=>p.hwmBytes))};
  samples.push(row);if(host.availableRAM<floors.availableRAM||host.freeDisk<floors.freeDisk)stop('WT_EXTERNAL_RESOURCE_FLOOR');
 }catch{stop('WT_MONITOR_READ');}}
 let interval,timeout,outputBytes=0;const killOnExit=()=>signalOwned('SIGKILL');process.once('exit',killOnExit);stopActive=stop;
 try{
  interval=setInterval(sample,limits.sampleMilliseconds);timeout=setTimeout(()=>stop('WT_EXTERNAL_TIMEOUT'),role==='prove'?limits.armMilliseconds:limits.verificationMilliseconds);sample();
  for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{outputBytes+=b.length;if(outputBytes>1024*1024)stop('WT_CHILD_OUTPUT_LIMIT');});
  child.on('message',message=>{
   firstMessageMilliseconds??=performance.now()-started;
   if(message.type==='phase'){phase=message.phase;sample();console.log(JSON.stringify({role,threads,phase}));}
   else if(message.type==='primary'){primaryObservedMilliseconds=performance.now()-started;console.log(JSON.stringify({role,threads,verified:message.metrics.verified,generateProofMilliseconds:message.metrics.timingsMilliseconds.generateProof,throughPrimaryMilliseconds:message.metrics.timingsMilliseconds.throughPrimaryVerification}));}
   else if(message.type==='result'){if(result)stop('WT_DUPLICATE_RESULT');else result=message;}
   else stop('WT_CHILD_PROTOCOL');
  });
  child.once('error',()=>stop('WT_CHILD_SPAWN'));
  const completion=new Promise(resolve=>child.once('close',(exitCode,signal)=>resolve({exitCode,signal})));
  child.send({role,threads,manifestSHA256,crossProof},error=>{if(error)stop('WT_CHILD_SEND');});
  const exit=await completion;clearTimeout(timeout);const closedMilliseconds=performance.now()-started,cleanupStart=performance.now();
  let remaining=ownedProcesses(child.pid);
  while(remaining.some(p=>p.state!=='Z')&&performance.now()-cleanupStart<limits.terminateGraceMilliseconds){await new Promise(r=>setTimeout(r,100));remaining=ownedProcesses(child.pid);}
  if(remaining.some(p=>p.state!=='Z')){stop('WT_CLEANUP_REQUIRED');signalOwned('SIGKILL');await new Promise(r=>setTimeout(r,100));remaining=ownedProcesses(child.pid);}
  sample();clearInterval(interval);clearTimeout(killTimer);
  const sampleMax=key=>Math.max(0,...samples.map(s=>s[key]));
  const final={...(result?.metrics??{role,threads,phase:'failed',failedPhase:phase}),sampling:{intervalMilliseconds:limits.sampleMilliseconds,sampleCount:samples.length,
   maximumObservedGapMilliseconds:Math.max(0,...samples.slice(1).map((s,i)=>s.elapsedMilliseconds-samples[i].elapsedMilliseconds)),
   minimumAvailableRAM:Math.min(...samples.map(s=>s.availableRAM)),minimumFreeDisk:Math.min(...samples.map(s=>s.freeDisk)),peakOwnedRSSSumBytes:sampleMax('ownedRSSSumBytes'),peakOwnedPSSSumBytes:sampleMax('ownedPSSSumBytes'),peakOwnedTaskCount:sampleMax('ownedTaskCount'),peakChildHWMBytes:sampleMax('childHWMBytes'),peakSupervisorRSSBytes:sampleMax('supervisorRSSBytes'),ownedIdentities:[...identities.values()],samples,
   limitations:'250ms samples may miss peaks or brief floor dips; process maxRSS and VmHWM additionally retained. PSS counts proportional shared mappings; task counts include Node/V8/libuv and WASM workers, not only proving threads.'},
   external:{...exit,failure,firstMessageMilliseconds,primaryObservedMilliseconds,childLifetimeMilliseconds:closedMilliseconds,postChildCleanupMilliseconds:performance.now()-cleanupStart,ownedLiveProcessesRemaining:remaining.filter(p=>p.state!=='Z').length,ownedZombieProcessesRemaining:remaining.filter(p=>p.state==='Z').length,discardedOutputBytes:outputBytes}};
  report.results.push(final);save();
  assert.equal(failure,undefined,'WT_SUPERVISION_FAILED');assert.equal(exit.exitCode,0,'WT_CHILD_FAILED');assert.equal(exit.signal,null,'WT_CHILD_SIGNAL');assert.equal(final.phase,'completed','WT_CHILD_INCOMPLETE');assert.equal(final.verified,true,'WT_NOT_VERIFIED');
  assert.equal(final.external.ownedLiveProcessesRemaining,0,'WT_CLEANUP');assert.equal(final.external.ownedZombieProcessesRemaining,0,'WT_ZOMBIE_CLEANUP');
  assert.equal(final.startup.effectiveThreads,threads,'WT_EFFECTIVE_THREADS');
  if(role==='prove'){
   assert.equal(final.retainedAAndJVerified,true,'WT_CHILD_BINDINGS');assert.equal(final.newProofGenerated,true,'WT_PROOF_REQUIRED');assert.equal(final.maximumPages,65536,'WT_EXACT_CAPACITY');
   assert.deepEqual(Object.keys(final.cryptographicRejections).sort(),['differentPinnedSameTargetVK','mutatedProof','mutatedPublicInput'],'WT_NEGATIVE_NAMES');assert.ok(Object.values(final.cryptographicRejections).every(x=>x.rejected&&x.validAfterward),'WT_NEGATIVE_RECOVERY');
   assert.equal(hash(result.proof.proof),final.proofSHA256,'WT_RESULT_PROOF_HASH');
  }else{assert.equal(final.newProofGenerated,false,'WT_NO_THIRD_PROOF');assert.equal(final.noWitnessReconstructed,true,'WT_NO_THIRD_WITNESS');}
  return result;
 }finally{clearInterval(interval);clearTimeout(timeout);clearTimeout(killTimer);if(!rootExited)signalOwned('SIGKILL');process.removeListener('exit',killOnExit);stopActive=undefined;}
}
let one,four;
try{
 report.phase='one-thread';save();one=await run('prove',1);
 report.phase='four-threads';save();four=await run('prove',4,one.proof);
 assert.equal(one.metrics.ephemeralInputSHA256,four.metrics.ephemeralInputSHA256,'WT_SAME_INPUT');assert.equal(one.metrics.ephemeralWitnessSHA256,four.metrics.ephemeralWitnessSHA256,'WT_SAME_WITNESS');assert.deepEqual(one.proof.publicInputs,four.proof.publicInputs,'WT_SAME_PUBLIC_INPUTS');
 assert.equal(four.metrics.crossProofSHA256,one.metrics.proofSHA256,'WT_FORWARD_CROSS_HASH');assert.equal(four.metrics.crossProofVerified,true,'WT_FORWARD_CROSS_VERIFY');
 report.phase='reciprocal-verification';save();const reciprocal=await run('verify-only',1,four.proof);
 assert.equal(reciprocal.metrics.crossProofSHA256,four.metrics.proofSHA256,'WT_RECIPROCAL_HASH');assert.equal(reciprocal.metrics.crossProofVerified,true,'WT_RECIPROCAL_VERIFY');
 report.sameInputAndWitness=true;report.sameCompletePublicInputs=true;report.bidirectionalCrossVerification=true;
 report.comparison={fourOverOneGenerateProof:four.metrics.timingsMilliseconds.generateProof/one.metrics.timingsMilliseconds.generateProof,
  fourOverOneThroughPrimaryVerification:four.metrics.timingsMilliseconds.throughPrimaryVerification/one.metrics.timingsMilliseconds.throughPrimaryVerification,
  generateProofSavedMilliseconds:one.metrics.timingsMilliseconds.generateProof-four.metrics.timingsMilliseconds.generateProof,
  provingTaskCountObserved:{one:report.results[0].sampling.peakOwnedTaskCount,four:report.results[1].sampling.peakOwnedTaskCount},oneOrderedPairOnly:true};
 report.phase='completed';
}catch(error){report.failedPhase=report.phase;report.phase='failed';report.failure=safeError(error);process.exitCode=1;}
finally{one?.proof?.proof?.fill(0);four?.proof?.proof?.fill(0);if(one?.proof?.publicInputs)one.proof.publicInputs.fill('0');if(four?.proof?.publicInputs)four.proof.publicInputs.fill('0');report.completedAt=new Date().toISOString();report.after=resources();save();process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);console.log(JSON.stringify({report:reportPath,phase:report.phase,comparison:report.comparison,sha256:hash(readFileSync(reportPath))}));}
