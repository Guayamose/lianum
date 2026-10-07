/** Fixed, serial, cold-process full public CRS cache comparison. Execute only after parent coordination. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {validateRunDirectory,readDerivedCache} from './cache-files.mjs';
import {readFileSync,writeFileSync,readdirSync,mkdtempSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {root,project,hash,guard,resources,filePin,floors,limits,safeError} from './common.mjs';

assert.equal(process.argv.length,3,'CC_FIXED_ARGUMENTS');
assert.equal(process.argv[2],'--parent-approved-public-crs-only','CC_PARENT_COORDINATION_REQUIRED');
assert.equal(process.platform,'linux','CC_LINUX_ONLY');
assert.equal(process.arch,'x64','CC_X64_ONLY');
const serialOrder = ['compressed','cached-uncompressed'];
const runDirectory = mkdtempSync(join(root,'run-'));
chmodSync(runDirectory,0o700); validateRunDirectory(runDirectory);
let derivationSHA256 = '-', cancelled = false, stopActive;
const manifestSHA256 = filePin(join(root,'pins.json')).sha256;
const report = {
  classification:'ONE_PUBLIC_FULL_PROVING_CRS_COMPRESSED_VS_DERIVED_UNCOMPRESSED_INIT_PAIR_NO_PROVING_NO_CHAIN',
  startedAt:new Date().toISOString(),phase:'starting',serialOrder,results:[],floors,limits,
  onePairOnly:true,mode:'fulfill',target:'evm',coldProcessNotColdFilesystemCache:true,threadsEach:1,maximumPages:32768,
  noNewProof:true,noNativeNodeOrChainAction:true,noWitnessRead:true,noPrivateTupleExport:true,
  backendSharingAcrossOwners:false,productionSourceChanged:false,hostLimitsChanged:false,
  sourcePinChecksAndFullCRSIntegrityRetainedForBoth:true,
  originalArtifactsUnchanged:true,runDirectory,manifestSHA256,noBackendTransportOrSocketAction:true,
};
const reportPath = join(runDirectory,'comparison.json');
const save = () => writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
report.sources = Object.fromEntries(['common.mjs','cache-files.mjs','one-cold-crs-init.mjs','run-crs-cache-ab.mjs','pins.json','PROPOSAL.md'].map(path => [path,filePin(join(root,path))]));
report.before = guard(); save();

function ownedProcesses(group,requireRoot=false) {
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
    } catch (error) {
      if (requireRoot && Number(name) === group) throw error;
      // Other processes may exit between enumeration and status read.
    }
  }
  if (requireRoot) assert.ok(found.some(member=>member.pid===group),'CC_MONITOR_ROOT_MISSING');
  return found;
}

async function run(strategy) {
  assert.equal(cancelled,false,'CC_RUN_CANCELLED');
  const mode = 'fulfill';
  guard();
  for (const [path,pin] of Object.entries(report.sources)) filePin(join(root,path),pin);
  const started = performance.now(), samples = [], identities = new Map();
  let result, failure, phase = 'child-startup', firstMessageMilliseconds, primaryObservedMilliseconds, killTimer, stopping = false;
  const child = spawn(process.execPath,['--max-old-space-size=512',join(root,'one-cold-crs-init.mjs'),strategy,runDirectory,derivationSHA256,manifestSHA256],{cwd:project,detached:true,
    stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8',CC_SUPERVISED:'public-crs-only-v1'}});
  let rootExited = false;
  child.once('exit',() => { rootExited = true; });
  // Capture the root identity before any host-resource read. The ChildProcess handle
  // remains the fail-closed direct-child termination path if /proc is unreadable.
  try { for (const member of ownedProcesses(child.pid)) identities.set(member.pid+':'+member.startTime,member); } catch {}
  function signalOwned(signal) {
    if (!rootExited) try { child.kill(signal); } catch {}
    let members = [];
    try { members = ownedProcesses(child.pid); } catch { failure ??= 'CC_MONITOR_READ'; }
    for (const member of members) {
      // A dedicated process group and recorded PID/start-time pairs exclude unrelated work.
      if (identities.has(member.pid+':'+member.startTime)) {
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
      const members = ownedProcesses(child.pid,!rootExited);
      for (const p of members) identities.set(p.pid+':'+p.startTime,{pid:p.pid,parent:p.parent,startTime:p.startTime});
      const host = resources();
      const row = {elapsedMilliseconds:performance.now()-started,phase,availableRAM:host.availableRAM,freeDisk:host.freeDisk,
        supervisorRSSBytes:host.rss,childRSSBytes:members.filter(p=>p.pid===child.pid).reduce((n,p)=>n+p.rssBytes,0),
        childHWMBytes:Math.max(0,...members.filter(p=>p.pid===child.pid).map(p=>p.hwmBytes)),
        ownedRSSSumBytes:members.reduce((n,p)=>n+p.rssBytes,0),ownedLiveProcesses:members.filter(p=>p.state!=='Z').length};
      samples.push(row);
      if (host.availableRAM < floors.availableRAM || host.freeDisk < floors.freeDisk) stop('CC_EXTERNAL_RESOURCE_FLOOR');
      if (row.ownedRSSSumBytes > limits.ownedRSSCeilingBytes) stop('CC_OWNED_RSS_CEILING');
    } catch { stop('CC_MONITOR_READ'); }
  }
  let interval, timeout;
  const killOnExit = () => signalOwned('SIGKILL');
  process.once('exit',killOnExit); stopActive = stop;
  try {
  interval = setInterval(sample,limits.sampleMilliseconds);
  timeout = setTimeout(() => stop('CC_EXTERNAL_TIMEOUT'),limits.childTimeoutMilliseconds);
  sample();
  let outputBytes = 0, pending = '';
  child.stderr.on('data',bytes => { outputBytes += bytes.length; if (outputBytes > 1024*1024) stop('CC_CHILD_LOG_LIMIT'); });
  function messageReceived(message) {
    firstMessageMilliseconds ??= performance.now()-started;
    if (message.type === 'phase') { phase = message.phase; sample(); }
    if (message.type === 'primary') {
      primaryObservedMilliseconds = performance.now()-started;
      console.log(JSON.stringify({mode,strategy,primaryVerified:message.metrics.verified,
        apiMilliseconds:message.metrics.timingsMilliseconds.apiConstruction,
        crsMilliseconds:message.metrics.timingsMilliseconds.crsInitialization,
        verificationMilliseconds:message.metrics.timingsMilliseconds.genuineVerification}));
    }
    if (message.type === 'result') {
      if (result) stop('CC_DUPLICATE_RESULT');
      result = message.metrics;
    }
  }
  child.stdout.on('data',bytes => {
    outputBytes += bytes.length;
    if (outputBytes > 1024*1024) { stop('CC_CHILD_LOG_LIMIT'); return; }
    pending += bytes.toString('utf8');
    let end;
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0,end); pending = pending.slice(end+1);
      try { messageReceived(JSON.parse(line)); } catch { stop('CC_CHILD_PROTOCOL'); }
    }
  });
  child.once('error',() => stop('CC_CHILD_SPAWN'));
  const exit = await new Promise(resolve => child.once('close',(exitCode,signal)=>resolve({exitCode,signal})));
  const closedMilliseconds = performance.now()-started, cleanupStart = performance.now();
  clearTimeout(timeout);
  let remaining = ownedProcesses(child.pid);
  while (remaining.some(p=>p.state!=='Z') && performance.now()-cleanupStart < limits.terminateGraceMilliseconds) {
    await new Promise(resolve=>setTimeout(resolve,100)); remaining = ownedProcesses(child.pid);
  }
  if (remaining.some(p=>p.state!=='Z')) {
    stop('CC_OWNED_CLEANUP_REQUIRED'); signalOwned('SIGKILL');
    await new Promise(resolve=>setTimeout(resolve,100)); remaining = ownedProcesses(child.pid);
  }
  sample(); clearInterval(interval); clearTimeout(killTimer);
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
  assert.equal(failure,undefined,'CC_SUPERVISION_FAILED');
  assert.equal(exit.exitCode,0,'CC_CHILD_FAILED'); assert.equal(exit.signal,null,'CC_CHILD_SIGNAL');
  assert.equal(result?.phase,'completed','CC_VERIFIER_CHECKS_FAILED');
  assert.equal(final.external.ownedLiveProcessesRemaining,0,'CC_OWNED_CLEANUP');
  assert.equal(final.external.ownedZombieProcessesRemaining,0,'CC_OWNED_ZOMBIE_CLEANUP');
  assert.equal(result.verified,true,'CC_PRIMARY_NOT_VERIFIED');
  assert.deepEqual(Object.keys(result.cryptographicRejections).sort(),['differentPinnedSameTargetVK','mutatedProof','mutatedPublicInput'],'CC_NEGATIVE_NAMES');
  assert.ok(Object.values(result.cryptographicRejections).every(v=>v.rejected && v.validAfterward),'CC_NEGATIVE_COVERAGE');
  return final;
  } finally {
    clearInterval(interval); clearTimeout(timeout); clearTimeout(killTimer);
    // Even an unreadable /proc or post-close monitoring exception cannot strand
    // the direct child or leave the watchdog/exit hook registered.
    signalOwned('SIGKILL');
    process.removeListener('exit',killOnExit); stopActive = undefined;
  }
}

const cancel = reason => { cancelled = true; if (stopActive) stopActive(reason); };
const onSignal = () => cancel('CC_SUPERVISOR_STOP');
process.on('SIGTERM',onSignal); process.on('SIGINT',onSignal);
const overallTimeout = setTimeout(() => cancel('CC_OVERALL_TIMEOUT'),limits.overallTimeoutMilliseconds);
const hardOverallTimeout = setTimeout(() => {
  cancel('CC_HARD_OVERALL_TIMEOUT');
  report.failedPhase = report.phase; report.phase = 'failed'; report.failure = {code:'CC_HARD_OVERALL_TIMEOUT'};
  report.completedAt = new Date().toISOString(); report.cleanupConfirmed = false; save();
  process.exit(124); // Active run's exit hook kills only its recorded owned PIDs. Never launch a replacement.
},limits.hardOverallTimeoutMilliseconds);
try {
  report.phase = 'compressed'; save();
  const compressed = await run('compressed');
  derivationSHA256 = compressed.derivedCache.derivationSHA256;
  // Trust the exact successful compressed arm's returned digest, not a filename or self-claimed cache hash.
  const derived = readDerivedCache(runDirectory,derivationSHA256,undefined,false);
  assert.deepEqual(derived.reference,compressed.derivedCache,'CC_PARENT_DERIVATION_MATCH');
  assert.equal(derived.record.sourceLineage.manifestSHA256,manifestSHA256,'CC_PARENT_MANIFEST_LINEAGE');
  assert.deepEqual(derived.record.sourceLineage.crsIntegrity,compressed.crsIntegrity,'CC_PARENT_CRS_LINEAGE');
  report.derivedCache = derived.reference; save();
  report.phase = 'cached-uncompressed'; save();
  const cached = await run('cached-uncompressed');
  assert.deepEqual(compressed.pins,cached.pins,'CC_AB_INPUT_OR_PIN_MISMATCH');
  assert.deepEqual(compressed.crsIntegrity,cached.crsIntegrity,'CC_AB_CRS_INTEGRITY_MISMATCH');
  assert.deepEqual(compressed.derivedCache,cached.derivedCache,'CC_AB_DERIVED_CACHE_MISMATCH');
  assert.equal(compressed.returnedUncompressedBytes,134217728,'CC_COMPRESSED_RESPONSE');
  assert.equal(cached.returnedUncompressedBytes,0,'CC_CACHE_FAST_PATH_RESPONSE');
  readDerivedCache(runDirectory,derivationSHA256,derived.record.sourceLineage,false);
  const a = compressed.timingsMilliseconds, b = cached.timingsMilliseconds;
  report.comparison = {
    crsInitializationCompressedMilliseconds:a.crsInitialization,
    crsInitializationUncompressedMilliseconds:b.crsInitialization,
    crsInitializationCompressedOverUncompressed:a.crsInitialization/b.crsInitialization,
    crsInitializationSavedMilliseconds:a.crsInitialization-b.crsInitialization,
    fullPinAndBufferAndInitCompressedMilliseconds:a.sourcePinChecks+a.completeCapabilityAndArtifactChecks+a.crsBufferPreparation+a.crsInitialization,
    fullPinAndBufferAndInitUncompressedMilliseconds:b.sourcePinChecks+b.completeCapabilityAndArtifactChecks+b.crsBufferPreparation+b.crsInitialization,
    compressedOneTimeCacheValidationPersistenceMilliseconds:a.cacheValidationAndPersistence,
    primaryWorkerCompressedMilliseconds:a.throughPrimaryVerification,
    primaryWorkerUncompressedMilliseconds:b.throughPrimaryVerification,
    primaryObservedCompressedMilliseconds:compressed.external.primaryObservedMilliseconds,
    primaryObservedUncompressedMilliseconds:cached.external.primaryObservedMilliseconds,
    completeColdLifetimeCompressedMilliseconds:compressed.external.childLifetimeMilliseconds,
    completeColdLifetimeUncompressedMilliseconds:cached.external.childLifetimeMilliseconds,
    peakChildRSSCompressedBytes:compressed.sampling.peakChildRSSBytes,
    peakChildRSSUncompressedBytes:cached.sampling.peakChildRSSBytes,
    onePairOnly:true,noStatisticalOrProofGenerationOrEndToEndPaymentClaim:true,
    noProvingEquivalenceClaim:'Verification exercises genuine proof binding, not every cached proving point; full cache lineage/hash validation is mandatory. A proof-generation adoption gate is separate and unexecuted.',
  };
  assert.equal(cancelled,false,'CC_RUN_CANCELLED');
  report.phase = 'completed';
} catch (error) { report.failedPhase = report.phase; report.phase = 'failed'; report.failure = safeError(error); process.exitCode = 1; }
finally {
  clearTimeout(overallTimeout); clearTimeout(hardOverallTimeout); process.removeListener('SIGTERM',onSignal); process.removeListener('SIGINT',onSignal);
  report.completedAt = new Date().toISOString(); report.after = resources();
  report.originalSourcePinsStillMatch = true;
  try { filePin(join(root,'pins.json'),{sha256:manifestSHA256}); }
  catch { report.originalSourcePinsStillMatch = false; report.phase = 'failed'; process.exitCode = 1; }
  try { for (const [path,pin] of Object.entries(JSON.parse(readFileSync(join(root,'pins.json'))).files)) filePin(join(project,path),pin); }
  catch { report.originalSourcePinsStillMatch = false; report.phase = 'failed'; process.exitCode = 1; }
  // Incomplete generated files remain quarantined in this one-run directory for review; never reused or promoted.
  report.cachePromotion = 'none'; report.incompleteCachePolicy = 'quarantined-no-reuse-no-overwrite';
  save();
  console.log(JSON.stringify({report:reportPath,phase:report.phase,comparison:report.comparison,sha256:hash(readFileSync(reportPath))}));
}
