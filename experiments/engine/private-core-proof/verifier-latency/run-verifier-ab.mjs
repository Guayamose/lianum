/** Fixed, serial, cold-process verifier comparison. Execute only after parent coordination. */
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {root,project,hash,guard,resources,filePin,floors,limits,safeError} from './common.mjs';

assert.equal(process.argv.length,3,'VL_FIXED_ARGUMENTS');
assert.equal(process.argv[2],'--parent-coordinated-verification-only','VL_PARENT_COORDINATION_REQUIRED');
assert.equal(process.platform,'linux','VL_LINUX_ONLY');
assert.equal(process.arch,'x64','VL_X64_ONLY');
const serialOrder = [{mode:'fulfill',strategy:'full'},{mode:'fulfill',strategy:'minimal'},
  {mode:'authorization',strategy:'minimal'},{mode:'authorization',strategy:'full'}];
const report = {
  classification:'EXISTING_GENUINE_PROOF_VERIFIER_ONLY_SRS_AB_NOT_PROVING_OR_NATIVE_SETTLEMENT',
  startedAt:new Date().toISOString(),phase:'starting',serialOrder,results:[],floors,limits,
  onePairPerTarget:true,coldProcessNotColdFilesystemCache:true,threadsEach:1,maximumPages:32768,
  noNewProof:true,noNativeNodeOrChainAction:true,noWitnessRead:true,noPrivateTupleExport:true,
  backendSharingAcrossOwners:false,productionSourceChanged:false,hostLimitsChanged:false,
  sourcePinChecksAndFullCRSIntegrityRetainedForBoth:true,
};
const reportPath = join(root,'verification-ab-'+report.startedAt.replace(/[:.]/g,'-')+'.json');
const save = () => writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
report.sources = Object.fromEntries(['common.mjs','one-cold-verifier.mjs','run-verifier-ab.mjs','pins.json','PROVENANCE.md'].map(path => [path,filePin(join(root,path))]));
report.before = guard(); save();

function ownedProcesses(group) {
  const found = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync('/proc/'+name+'/stat','utf8'), tail = stat.slice(stat.lastIndexOf(')')+2).split(' ');
      if (Number(tail[2]) !== group) continue;
      const status = readFileSync('/proc/'+name+'/status','utf8');
      found.push({pid:Number(name),parent:Number(tail[1]),startTime:tail[19],state:tail[0],
        rssBytes:Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0)*1024,
        hwmBytes:Number(/VmHWM:\s+(\d+)/.exec(status)?.[1] ?? 0)*1024});
    } catch { /* A process may exit between enumeration and status read. */ }
  }
  return found;
}

async function run({mode,strategy}) {
  guard();
  const started = performance.now(), samples = [], identities = new Map();
  let result, failure, phase = 'child-startup', firstMessageMilliseconds, primaryObservedMilliseconds, killTimer, stopping = false;
  const child = fork(join(root,'one-cold-verifier.mjs'),[mode,strategy],{cwd:project,detached:true,
    execArgv:[],stdio:['ignore','pipe','pipe','ipc'],env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'}});
  function signalOwned(signal) {
    for (const member of ownedProcesses(child.pid)) {
      // A dedicated process group and recorded PID/start-time pairs exclude unrelated work.
      if (member.pid === child.pid || identities.has(member.pid+':'+member.startTime)) {
        try { process.kill(member.pid,signal); } catch { /* Exit raced with signal. */ }
      }
    }
  }
  function stop(code) {
    failure ??= code;
    if (stopping) return;
    stopping = true; signalOwned('SIGTERM');
    killTimer = setTimeout(() => signalOwned('SIGKILL'),limits.terminateGraceMilliseconds);
  }
  function sample() {
    try {
      const host = resources(), members = ownedProcesses(child.pid);
      for (const p of members) identities.set(p.pid+':'+p.startTime,{pid:p.pid,parent:p.parent,startTime:p.startTime});
      const row = {elapsedMilliseconds:performance.now()-started,phase,availableRAM:host.availableRAM,freeDisk:host.freeDisk,
        supervisorRSSBytes:host.rss,childRSSBytes:members.filter(p=>p.pid===child.pid).reduce((n,p)=>n+p.rssBytes,0),
        childHWMBytes:Math.max(0,...members.filter(p=>p.pid===child.pid).map(p=>p.hwmBytes)),
        ownedRSSSumBytes:members.reduce((n,p)=>n+p.rssBytes,0),ownedLiveProcesses:members.filter(p=>p.state!=='Z').length};
      samples.push(row);
      if (host.availableRAM < floors.availableRAM || host.freeDisk < floors.freeDisk) stop('VL_EXTERNAL_RESOURCE_FLOOR');
    } catch { stop('VL_MONITOR_READ'); }
  }
  const interval = setInterval(sample,limits.sampleMilliseconds), timeout = setTimeout(() => stop('VL_EXTERNAL_TIMEOUT'),limits.childTimeoutMilliseconds);
  sample();
  const killOnExit = () => signalOwned('SIGKILL'), onSignal = () => stop('VL_SUPERVISOR_STOP');
  process.once('exit',killOnExit); process.once('SIGTERM',onSignal); process.once('SIGINT',onSignal);
  let outputBytes = 0;
  for (const stream of [child.stdout,child.stderr]) stream.on('data',bytes => { outputBytes += bytes.length; if (outputBytes > 1024*1024) stop('VL_CHILD_LOG_LIMIT'); });
  child.on('message',message => {
    firstMessageMilliseconds ??= performance.now()-started;
    if (message.type === 'phase') { phase = message.phase; sample(); }
    if (message.type === 'primary') {
      primaryObservedMilliseconds = performance.now()-started;
      // This channel contains only sanitized timings, hashes, counts and resource measurements.
      console.log(JSON.stringify({mode,strategy,primaryVerified:message.metrics.verified,
        apiMilliseconds:message.metrics.timingsMilliseconds.apiConstruction,
        crsMilliseconds:message.metrics.timingsMilliseconds.crsInitialization,
        verificationMilliseconds:message.metrics.timingsMilliseconds.genuineVerification}));
    }
    if (message.type === 'result') result = message.metrics;
  });
  child.once('error',() => stop('VL_CHILD_SPAWN'));
  const exit = await new Promise(resolve => child.once('close',(exitCode,signal)=>resolve({exitCode,signal})));
  const closedMilliseconds = performance.now()-started, cleanupStart = performance.now();
  clearTimeout(timeout); clearTimeout(killTimer);
  let remaining = ownedProcesses(child.pid);
  while (remaining.some(p=>p.state!=='Z') && performance.now()-cleanupStart < limits.terminateGraceMilliseconds) {
    await new Promise(resolve=>setTimeout(resolve,100)); remaining = ownedProcesses(child.pid);
  }
  if (remaining.some(p=>p.state!=='Z')) {
    stop('VL_OWNED_CLEANUP_REQUIRED'); signalOwned('SIGKILL');
    await new Promise(resolve=>setTimeout(resolve,100)); remaining = ownedProcesses(child.pid);
  }
  sample(); clearInterval(interval); clearTimeout(killTimer);
  process.removeListener('exit',killOnExit); process.removeListener('SIGTERM',onSignal); process.removeListener('SIGINT',onSignal);
  const sampling = {
    intervalMilliseconds:limits.sampleMilliseconds,sampleCount:samples.length,
    firstSampleMilliseconds:samples[0]?.elapsedMilliseconds,lastSampleMilliseconds:samples.at(-1)?.elapsedMilliseconds,
    maximumObservedGapMilliseconds:Math.max(0,...samples.slice(1).map((s,i)=>s.elapsedMilliseconds-samples[i].elapsedMilliseconds)),
    minimumAvailableRAM:Math.min(...samples.map(s=>s.availableRAM)),minimumFreeDisk:Math.min(...samples.map(s=>s.freeDisk)),
    peakChildRSSBytes:Math.max(...samples.map(s=>s.childRSSBytes)),peakSampledChildHWMBytes:Math.max(...samples.map(s=>s.childHWMBytes)),
    peakOwnedRSSSumBytes:Math.max(...samples.map(s=>s.ownedRSSSumBytes)),peakSupervisorRSSBytes:Math.max(...samples.map(s=>s.supervisorRSSBytes)),
    ownedIdentities:[...identities.values()],samples,
    limitations:'250ms host sampling can miss transient floor dips; process maxRSS/VmHWM captures per-process high-water marks. RSS sums can double-count shared pages. Host availability includes unrelated activity.',
  };
  const final = {...(result ?? {mode,strategy,phase:'failed',failedPhase:phase}),sampling,external:{...exit,
    failure,firstMessageMilliseconds,primaryObservedMilliseconds,childLifetimeMilliseconds:closedMilliseconds,
    totalIncludingPostChildCleanupMilliseconds:performance.now()-started,postChildCleanupMilliseconds:performance.now()-cleanupStart,
    ownedLiveProcessesRemaining:remaining.filter(p=>p.state!=='Z').length,
    ownedZombieProcessesRemaining:remaining.filter(p=>p.state==='Z').length,discardedOutputBytes:outputBytes}};
  report.results.push(final); save();
  assert.equal(failure,undefined,'VL_SUPERVISION_FAILED');
  assert.equal(exit.exitCode,0,'VL_CHILD_FAILED'); assert.equal(exit.signal,null,'VL_CHILD_SIGNAL');
  assert.equal(result?.phase,'completed','VL_VERIFIER_CHECKS_FAILED');
  assert.equal(final.external.ownedLiveProcessesRemaining,0,'VL_OWNED_CLEANUP');
  assert.equal(final.external.ownedZombieProcessesRemaining,0,'VL_OWNED_ZOMBIE_CLEANUP');
  assert.equal(result.verified,true,'VL_PRIMARY_NOT_VERIFIED');
  assert.ok(Object.values(result.cryptographicRejections).every(v=>v.rejected && v.validAfterward),'VL_NEGATIVE_COVERAGE');
  return final;
}

try {
  for (const item of serialOrder) { report.phase = item.mode+'-'+item.strategy; save(); await run(item); }
  report.comparisons = {};
  for (const mode of ['fulfill','authorization']) {
    const full = report.results.find(r=>r.mode===mode&&r.strategy==='full'), minimal = report.results.find(r=>r.mode===mode&&r.strategy==='minimal');
    assert.deepEqual(full.pins,minimal.pins,'VL_AB_INPUT_OR_PIN_MISMATCH');
    assert.deepEqual(full.crsIntegrity,minimal.crsIntegrity,'VL_AB_CRS_INTEGRITY_MISMATCH');
    report.comparisons[mode] = {
      crsInitializationFullOverMinimal:full.timingsMilliseconds.crsInitialization/minimal.timingsMilliseconds.crsInitialization,
      primaryWorkerFullOverMinimal:full.timingsMilliseconds.throughPrimaryVerification/minimal.timingsMilliseconds.throughPrimaryVerification,
      primaryObservedFullOverMinimal:full.external.primaryObservedMilliseconds/minimal.external.primaryObservedMilliseconds,
      completeColdLifetimeFullOverMinimal:full.external.childLifetimeMilliseconds/minimal.external.childLifetimeMilliseconds,
      peakChildRSSFullMinusMinimal:full.sampling.peakChildRSSBytes-minimal.sampling.peakChildRSSBytes,
      onePairOnly:true,noStatisticalOrEndToEndPaymentClaim:true,
    };
  }
  report.phase = 'completed';
} catch (error) { report.failedPhase = report.phase; report.phase = 'failed'; report.failure = safeError(error); process.exitCode = 1; }
finally {
  report.completedAt = new Date().toISOString(); report.after = resources(); save();
  console.log(JSON.stringify({report:reportPath,phase:report.phase,comparisons:report.comparisons,sha256:hash(readFileSync(reportPath))}));
}
