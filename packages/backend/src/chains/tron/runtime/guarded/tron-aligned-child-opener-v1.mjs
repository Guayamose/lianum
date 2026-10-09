/** Common fixed aligned opener extracted from the accepted candidate. The two
 * private profiles select only local lifetime; caller data selects neither.
 * Python, Java, source gates and the complete binary closure stay unchanged. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, readlink, realpath, writeFile, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../../../../../../proofs/src/catalog.mjs';
import { projectRoot } from '../../../../../../engine/src/chains/shared/runtime-harness.mjs';
import { PRIVATE_RESOURCE_FLOORS } from '../../../../../../engine/src/crypto/private-resource-policy.mjs';
import { TRON_UPSTREAM } from '../../transfers/owned-tron-node-driver.mjs';
import { createTronPrivateLogCapture } from './tron-private-log-capture-v1.mjs';
import { captureTronCandidateDiskLogs } from './tron-private-disk-log-capture-v1.mjs';
import { captureTronAlignedRocksDbNativeAudit } from './tron-aligned-native-audit-v1.mjs';
import { createTronProductHostGuardV1 } from './tron-product-host-scope-v1.mjs';
import { inspectOwnedTronAlignedCandidateMaterialV1, inspectOwnedTronReviewedMaterialV1 } from './tron-reviewed-material-v1.mjs';
import { assertOwnedTronProductReleaseV1 } from './tron-product-release-v1.mjs';
import { inspectOwnedTronFirstErrorPrivateMaterialV3 } from './tron-first-error-private-material-v3.mjs';
const RUNTIME = join(projectRoot, '.local/owned-tron-native-value-v1');
const HELPER = join(ROOT, 'integration/chains/tron/fixtures/aligned-rocksdb-v1/launch.py');
const CANDIDATE = Object.freeze({ helper: HELPER, milliseconds: 300_000 });
const PRODUCT = Object.freeze({ helper: HELPER, milliseconds: 90 * 60 * 1000 });
const FIRST_ERROR_PRODUCT = Object.freeze({ helper: join(ROOT, 'integration/chains/tron/fixtures/first-error-private-v3/launch.py'), milliseconds: 90 * 60 * 1000 });
const productChildren = new WeakMap();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const safeCode = error => String(error?.message ?? '').match(/\bTRON_(?:CANDIDATE|ALIGNED|PRODUCT)_[A-Z0-9_]+\b/)?.[0] ?? 'TRON_PRODUCT_ASSERTION_OR_IO_FAILED';
const absent = error => ['ENOENT', 'ESRCH'].includes(error.code);
async function grace(exited, milliseconds) {
  let timer; try { await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function regular(path) {
  assert.equal(await realpath(path), path, 'TRON_CANDIDATE_NO_SYMLINK'); const stat = await lstat(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'TRON_CANDIDATE_REGULAR_FILE'); return readFile(path);
}
async function privateWrite(path, value) {
  await writeFile(path, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value), { mode: 0o600, flag: 'wx' });
}
async function assertOwnedTronPrivateDirectory(directory) {
  assert.equal(await realpath(directory), directory, 'TRON_PRODUCT_PRIVATE_DIRECTORY_SYMLINK');
  const stat = await lstat(directory);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 0o7777) === 0o700,
    'TRON_PRODUCT_PRIVATE_DIRECTORY');
}
// Fresh independent /proc/filesystem reads only, with a private fixed cap.
// Every job drains before original-order validation or failure; no sampled
// identity, FD, socket, resource or prior successful audit is reused.
async function freshTronOriginalProcessReadsV1(reads){
  const outcomes=new Array(reads.length);let next=0;
  async function worker(){while(next<reads.length){const i=next++;try{outcomes[i]={ok:true,value:await reads[i]()};}catch(error){outcomes[i]={ok:false,error};}}}
  await Promise.allSettled(Array.from({length:Math.min(8,reads.length)},()=>worker()));return outcomes;
}
function originalTronProcessReadV1(outcome){if(!outcome.ok)throw outcome.error;return outcome.value;}
async function hostResources() {
  const reads=await freshTronOriginalProcessReadsV1([()=>readFile('/proc/meminfo','utf8'),()=>statfs(projectRoot,{bigint:true})]);
  const available = /^MemAvailable:\s+([0-9]+) kB$/m.exec(originalTronProcessReadV1(reads[0]));
  assert.ok(available, 'TRON_CANDIDATE_MEMAVAILABLE_UNREADABLE'); const disk = originalTronProcessReadV1(reads[1]);
  const sample = { availableRAM: Number(available[1]) * 1024, freeDisk: Number(disk.bavail * disk.bsize) };
  assert.ok(sample.availableRAM >= PRIVATE_RESOURCE_FLOORS.availableRAM, 'TRON_CANDIDATE_MEMAVAILABLE_FLOOR');
  assert.ok(sample.freeDisk >= PRIVATE_RESOURCE_FLOORS.freeDisk, 'TRON_CANDIDATE_DISK_FLOOR'); return sample;
}
function bindTronCandidateChildCancellation(signal, failPending, closeOwned) {
  let cleanupPromise;
  const abort = () => { failPending(signal.reason); cleanupPromise ??= Promise.resolve().then(closeOwned); void cleanupPromise.catch(() => {}); };
  signal.addEventListener('abort', abort); if (signal.aborted) abort();
  return () => signal.removeEventListener('abort', abort);
}
async function proc(pid) {
  let text; try { text = await readFile('/proc/' + pid + '/stat', 'utf8'); } catch (error) { if (absent(error)) return null; throw error; }
  const end = text.lastIndexOf(') '), fields = text.slice(end + 2).split(/\s+/);
  assert.ok(text.startsWith(pid + ' (') && end > 0 && /^[0-9]+$/.test(fields[19]), 'TRON_CANDIDATE_PROCESS_STAT');
  return { pid, parent: Number(fields[1]), start: fields[19], state: fields[0], rss: Number(fields[21]) * 4096 };
}
async function alignedProc(pid) {
  const first = await proc(pid); if (first === null) return null;
  const base = '/proc/' + pid;
  const reads=await freshTronOriginalProcessReadsV1([()=>readFile(base+'/stat','utf8'),()=>readFile(base+'/status','utf8'),()=>lstat(base),()=>readlink(base+'/exe')]);
  const text = originalTronProcessReadV1(reads[0]), fields = text.slice(text.lastIndexOf(') ') + 2).split(/\s+/);
  const status = originalTronProcessReadV1(reads[1]);
  const uids = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status);
  assert.ok(uids, 'TRON_ALIGNED_STARTUP_UID4_REQUIRED');
  const row = { ...first, group: Number(fields[2]), session: Number(fields[3]),
    uid: originalTronProcessReadV1(reads[2]).uid, uids: uids.slice(1).map(Number), executable: originalTronProcessReadV1(reads[3]) };
  const after = await proc(pid);
  assert.ok(after && after.start === first.start && after.parent === first.parent, 'TRON_ALIGNED_STARTUP_BIRTH_CHANGED');
  assert.equal(fields[19], first.start); assert.equal(Number(fields[1]), first.parent);
  return row;
}

function assertTronAlignedRocksDbStartupIdentity(owner, first, second) {
  assert.equal(arguments.length, 3, 'TRON_ALIGNED_STARTUP_IDENTITY_ARITY');
  assert.ok(owner && first && second, 'TRON_ALIGNED_ORIGINAL_BIRTH_REQUIRED');
  for (const row of [owner, first, second]) {
    assert.ok(Number.isSafeInteger(row.pid) && row.pid > 1);
    assert.equal(row.uid, process.getuid()); assert.deepEqual(row.uids, Array(4).fill(process.getuid()));
    assert.match(row.start, /^[0-9]+$/); assert.ok(!['Z', 'X'].includes(row.state));
  }
  for (const key of ['pid', 'parent', 'start', 'group', 'session', 'uid', 'executable'])
    assert.equal(first[key], second[key], 'TRON_ALIGNED_STARTUP_IDENTITY_CHANGED');
  assert.equal(first.parent, owner.pid); assert.equal(first.group, owner.group); assert.equal(first.session, owner.session);
  assert.match(first.executable, /^\/usr\/bin\/python3(?:\.[0-9]+)?$/, 'TRON_ALIGNED_STARTUP_MUST_BE_ORIGINAL_PYTHON');
  return true; // Metadata only; the private harness additionally owns the actual ChildProcess.
}

async function startAlignedChild(directory, audit, signal, profile, hostGuard) {
  assert.ok(profile === CANDIDATE || profile === PRODUCT || profile === FIRST_ERROR_PRODUCT, 'TRON_PRODUCT_FIXED_OPENER_PROFILE');
  await assertOwnedTronPrivateDirectory(directory); await assertOwnedTronPrivateDirectory(audit);
  assert.ok(signal instanceof AbortSignal); if (signal.aborted) throw signal.reason;
  const helper = profile.helper;
  // No inherited socket descriptors; Python closes every FD above stdio before
  // exec. Complete binary/native closure was authenticated before spawning.
  const child = spawn('/usr/bin/python3', [helper, directory], { cwd: directory,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let original; const handle = {}; let lastHostGuard = 0;
  let exit, closeReceipt, resolveExit, resolveClose; const closedOriginal = new Promise(resolve => resolveClose = resolve); const exited = new Promise(resolve => resolveExit = resolve);
  child.once('exit', (code, signal) => { exit = { code, signal }; resolveExit(exit); });
  child.once('close', (code, signal) => { closeReceipt = { code, signal }; resolveClose(closeReceipt); });
  let buffer = '', pending, resolveReady, rejectReady, closed = false, failure, closePromise, releaseCancellation;
  const rawStdout = createTronPrivateLogCapture(), stderr = createTronPrivateLogCapture();
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  void ready.catch(() => {}); // Early birth failures retain cleanup without unhandled readiness rejection.
  const fail = error => { failure ??= error; pending?.reject(error); pending = null; rejectReady(error); };
  child.once('error', () => fail(Error('TRON_CANDIDATE_CHILD_EXEC_FAILED')));
  child.once('exit', () => { if (!closed) fail(Error('TRON_CANDIDATE_CHILD_EXITED')); });
  child.stderr.on('data', bytes => { if (stderr.append(bytes)) fail(Error('TRON_CANDIDATE_PRIVATE_LOG_BOUND')); });
  child.stdout.on('data', bytes => {
    const truncated = rawStdout.append(bytes);
    // Product stdout carries the checked protocol. Its diagnostic tee retains
    // the same bounded prefix; truncation cannot replace protocol validation.
    if (truncated && !(readySeen && (profile === PRODUCT || profile === FIRST_ERROR_PRODUCT)))
      return fail(Error('TRON_CANDIDATE_PRIVATE_LOG_BOUND'));
    if (failure) return; // Keep the bounded diagnostic prefix; protocol work has already failed.
    buffer += bytes.toString('utf8'); if (buffer.length > 65536) return fail(Error('TRON_CANDIDATE_PROTOCOL_BOUND'));
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); let result;
      try { result = JSON.parse(line); } catch { return fail(Error('TRON_CANDIDATE_PROTOCOL_JSON')); }
      if (resolveReady && result.kind === 'ready') { resolveReady(result); resolveReady = null; }
      else if (pending) { const p = pending; pending = null; result.error ? p.reject(Error('TRON_CANDIDATE_DRIVER_REJECTED_OR_UNKNOWN')) : p.resolve(result); }
      else return fail(Error('TRON_CANDIDATE_UNSOLICITED_RESPONSE'));
    }
  });
  const started = Date.now(); let sampled = false, checkRunning, readySeen = false, alignedJavaIdentity, alignedJavaArgv;
  let alignedGrantSent = false;
  async function identity({ terminal = false } = {}) {
    const row = await alignedProc(child.pid); if (!row) { assert.ok(terminal && exit, 'TRON_CANDIDATE_CHILD_DISAPPEARED'); return null; }
    assert.ok(original, 'TRON_CANDIDATE_BIRTH_UNAUTHENTICATED');

      for (const key of ['group', 'session', 'uid']) assert.equal(row[key], original[key], 'TRON_ALIGNED_LIVE_IDENTITY_CHANGED');
      assert.deepEqual(row.uids, Array(4).fill(process.getuid()), 'TRON_ALIGNED_LIVE_UID4_CHANGED');

    assert.equal(row.start, original.start, 'TRON_CANDIDATE_PID_REPLACED'); assert.equal(row.parent, process.pid, 'TRON_CANDIDATE_CHILD_REPARENTED');
    const executableReads = readySeen && (profile === PRODUCT || profile === FIRST_ERROR_PRODUCT)
      ? await freshTronOriginalProcessReadsV1([()=>readlink('/proc/'+child.pid+'/exe'),()=>readFile('/proc/'+child.pid+'/cmdline')]) : null;
    const executable = executableReads ? originalTronProcessReadV1(executableReads[0]) : await readlink('/proc/' + child.pid + '/exe');

      if (executable === join(RUNTIME, 'jdk8/bin/java')) {
        assert.equal(alignedGrantSent, true, 'TRON_ALIGNED_JAVA_BEFORE_ORIGINAL_GRANT');
        const observedArgv = (executableReads ? originalTronProcessReadV1(executableReads[1]) : await readFile('/proc/' + child.pid + '/cmdline')).toString('utf8').split('\0').filter(Boolean);
        const expectedArgv = [join(RUNTIME, 'jdk8/bin/java'), '-Xms256m', '-Xmx1536m', '-XX:ActiveProcessorCount=2', '-Djava.net.preferIPv4Stack=true',
          '-Djava.io.tmpdir=' + join(directory, 'jni-tmp'), '-cp',
          join(directory, 'reviewed-new-driver-classes') + ':' + join(directory, 'reviewed-original-classes') + ':' + join(RUNTIME, 'FullNode-offline.jar'), 'OwnedTronNativeDriver'];
        assert.deepEqual(observedArgv, expectedArgv, 'TRON_ALIGNED_EXACT_ORIGINAL_JAVA_ARGV');
        const after = await alignedProc(child.pid);
        for (const key of ['pid', 'parent', 'start', 'group', 'session', 'uid', 'executable'])
          assert.equal(after?.[key], row[key], 'TRON_ALIGNED_JAVA_TRANSITION_IDENTITY_CHANGED');
        assert.deepEqual(after.uids, original.uids);
        alignedJavaIdentity ??= { ...after }; alignedJavaArgv ??= observedArgv;
      } else {
        assert.equal(alignedJavaIdentity, undefined, 'TRON_ALIGNED_JAVA_TRANSITION_REVERSED');
        assert.equal(executable, original.executable, 'TRON_ALIGNED_STARTUP_EXECUTABLE_CHANGED');
      }

    if (readySeen) assert.equal(executable, join(RUNTIME, 'jdk8/bin/java'), 'TRON_CANDIDATE_JAVA_IDENTITY');
    else assert.ok(executable === join(RUNTIME, 'jdk8/bin/java') || /^\/usr\/bin\/python3(?:\.[0-9]+)?$/.test(executable), 'TRON_CANDIDATE_STARTUP_IDENTITY');
    assert.ok(row.rss <= 2147483648, 'TRON_CANDIDATE_CHILD_RSS_LIMIT'); return { ...row, executable };
  }
  async function auditNative() {
    if (signal.aborted) throw signal.reason;
    if (hostGuard && Date.now()-lastHostGuard >= 250) { hostGuard.assertActive(); lastHostGuard=Date.now(); }
    assert.ok(!failure && !exit, 'TRON_CANDIDATE_ORIGINAL_LIVE_CHILD'); const row = await identity();
    // All reads are fresh after identity. Drain before the original ordered
    // checks; the resource outcome is consumed only after every FD/socket.
    const nativeReads = readySeen && (profile === PRODUCT || profile === FIRST_ERROR_PRODUCT) && row.executable === join(RUNTIME, 'jdk8/bin/java')
      ? await freshTronOriginalProcessReadsV1([()=>readFile('/proc/'+child.pid+'/status','utf8'),()=>readFile('/proc/'+child.pid+'/net/unix','utf8'),
        ()=>readdir('/proc/'+child.pid+'/fd'),()=>hostResources()]) : null;
    const status = nativeReads ? originalTronProcessReadV1(nativeReads[0]) : await readFile('/proc/' + child.pid + '/status', 'utf8');
    // The same original PID hashes its fixed binaries in Python before arming
    // the filter. Java must never run during that unarmed startup interval.
    if (row.executable === join(RUNTIME, 'jdk8/bin/java')) {
      assert.match(status, /^NoNewPrivs:\s+1$/m); assert.match(status, /^Seccomp:\s+2$/m);
    } else assert.equal(readySeen, false, 'TRON_CANDIDATE_UNGUARDED_JAVA');
    if (row.executable === join(RUNTIME, 'jdk8/bin/java')) {
      const unix = (nativeReads ? originalTronProcessReadV1(nativeReads[1]) : await readFile('/proc/' + child.pid + '/net/unix', 'utf8')).trim().split('\n').slice(1)
        .map(line => line.trim().split(/\s+/));
      const names=nativeReads ? originalTronProcessReadV1(nativeReads[2]) : await readdir('/proc/'+child.pid+'/fd');
      const descriptors=await freshTronOriginalProcessReadsV1(names.map(name=>async()=>{
        try{return await readlink('/proc/'+child.pid+'/fd/'+name);}catch(error){if(absent(error))return null;throw error;}
      }));
      for(let i=0;i<names.length;i++){
        const descriptor=originalTronProcessReadV1(descriptors[i]);if(descriptor===null)continue;
        const socket = /^socket:\[([0-9]+)\]$/.exec(descriptor);
        if (!socket) continue;
        // JDK8 FileDispatcher owns an anonymous AF_UNIX pair. The filter
        // denies socket() and every network socketpair before Java executes.
        const entries = unix.filter(fields => fields[6] === socket[1]);
        assert.equal(entries.length, 1, 'TRON_CANDIDATE_NETWORK_SOCKET_FOUND');
        assert.equal(entries[0].length, 7, 'TRON_CANDIDATE_NAMED_SOCKET_FOUND');
      }
    }
    if (nativeReads) originalTronProcessReadV1(nativeReads[3]); else await hostResources();
    assert.ok(Date.now() - started < profile.milliseconds, 'TRON_PRODUCT_FIXED_FUNCTIONAL_DEADLINE'); sampled = true;
  }
  let interval;
  function beginPolling() {
    interval = setInterval(() => { checkRunning ??= auditNative().catch(fail).finally(() => { checkRunning = null; }); }, 250);
    interval.unref();
  }
  async function command(kind, args = []) {
    assert.ok(['HEALTH', 'PREPARE', 'CURRENT', 'ARMKEY', 'ARMSEND', 'SIGN', 'BROADCAST', 'OBSERVE', 'SOURCEBLOCK', 'SOURCESOLID', 'SOURCETX', 'SOURCEINFO', 'SOURCEREPLAY', 'CLOSE'].includes(kind));
    for (const value of args) assert.ok(typeof value === 'string' && /^[0-9a-f]+$/.test(value) && value.length <= 2048);
    assert.equal(pending, undefined, 'TRON_CANDIDATE_COMMAND_BUSY'); if (failure) throw failure;
    await auditNative(); let timeout;
    try { return await Promise.race([new Promise((resolve, reject) => { pending = { resolve, reject }; child.stdin.write([kind, ...args].join('\t') + '\n'); }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('TRON_CANDIDATE_COMMAND_OUTCOME_UNKNOWN')), 10000); })]);
    } catch (error) { fail(error); throw error; } finally { clearTimeout(timeout); pending = undefined; }
  }
  function close() { return closePromise ??= closeOriginal(); }
  async function closeOriginal() {
    if (closed) throw Error('TRON_CANDIDATE_DUPLICATE_INTERNAL_CLOSE'); clearInterval(interval); if (checkRunning) await checkRunning; closed = true;
    try { if (original && !failure && !exit) await command('CLOSE'); } catch { /* Never resend any economic command. */ }
    child.stdin.end(); let forced = false;
    try {
      if (!original) {
        // EOF rejects in the fixed Python gate before Java. Unknown identity
        // never authorizes numeric signalling, a CLOSE command, or acceptance.
        if (!closeReceipt) await grace(closedOriginal, 2500);
        assert.ok(closeReceipt, 'TRON_ALIGNED_UNAUTHENTICATED_STARTUP_CLOSE_UNKNOWN');
        if (Number.isSafeInteger(child.pid)) {
          assert.ok(exit, 'TRON_ALIGNED_UNAUTHENTICATED_STARTUP_EXIT_UNKNOWN');
          assert.equal(await proc(child.pid), null, 'TRON_ALIGNED_UNAUTHENTICATED_CHILD_STILL_PRESENT');
        }
        const errLog = stderr.snapshot(), outLog = rawStdout.snapshot();
        await privateWrite(join(audit, 'stderr-private.log'), errLog.bytes);
        await privateWrite(join(audit, 'stdout-private.log'), outLog.bytes);
        return { stopped: true, exitCode: closeReceipt.code, signal: closeReceipt.signal, forced: false,
          originalChildSpawned: Number.isSafeInteger(child.pid), exitObserved: Boolean(exit), closeObserved: true, startupAuthenticated: false, nativeOrderlyExit: false, sampledResourceFloorsHeld: false,
          privateStreamCapture: { stdout: outLog.metadata, stderr: errLog.metadata } };
      }
      if (!exit) await grace(exited, 30000);
      if (!exit) { await identity(); child.kill('SIGTERM'); await grace(exited, 5000); }
      if (!exit) { await identity(); forced = true; child.kill('SIGKILL'); await grace(exited, 5000); }
      assert.ok(exit, 'TRON_CANDIDATE_EXIT_UNKNOWN'); assert.equal(await proc(child.pid), null, 'TRON_CANDIDATE_CHILD_STILL_PRESENT');
      const errLog = stderr.snapshot(), outLog = rawStdout.snapshot();
      await privateWrite(join(audit, 'stderr-private.log'), errLog.bytes);
      await privateWrite(join(audit, 'stdout-private.log'), outLog.bytes);
      let nativeFatalTrace = null;
      const fatalPath = join(directory, 'hs_err_pid' + child.pid + '.log');
      try {
        const fatalStat = await lstat(fatalPath);
        assert.ok(fatalStat.isFile() && !fatalStat.isSymbolicLink() && fatalStat.uid === process.getuid(), 'TRON_CANDIDATE_FATAL_TRACE_ORIGINAL_FILE');
        assert.ok(fatalStat.size <= 16 * 1024 * 1024, 'TRON_CANDIDATE_FATAL_TRACE_BOUND');
        const fatalBytes = await regular(fatalPath);
        await privateWrite(join(audit, 'jvm-fatal-private.log'), fatalBytes);
        nativeFatalTrace = { retainedPrivate: true, bytes: fatalBytes.length, sha256: sha(fatalBytes) };
      } catch (error) { if (!absent(error)) throw error; }
      const privateDiskLogCapture = await captureTronCandidateDiskLogs(directory, audit);
      return { stopped: true, exitCode: exit.code, signal: exit.signal, forced,
        nativeOrderlyExit: exit.code === 0 && exit.signal === null && !forced, sampledResourceFloorsHeld: sampled,
        nativeFatalTrace, privateDiskLogCapture, privateStreamCapture: { stdout: outLog.metadata, stderr: errLog.metadata } };
    } finally { releaseCancellation?.(); child.stdin.destroy(); }
  }
  releaseCancellation = bindTronCandidateChildCancellation(signal, fail, close);
  let timeout;
  try {

      const owner = await alignedProc(process.pid), first = await alignedProc(child.pid), second = await alignedProc(child.pid);
      assertTronAlignedRocksDbStartupIdentity(owner, first, second);
      assert.ok(!signal.aborted && !failure && !exit && !closed, 'TRON_ALIGNED_STARTUP_CANCELLED');
      original = second;
      if (profile === PRODUCT || profile === FIRST_ERROR_PRODUCT) { productChildren.set(handle,{original:structuredClone(original),closed:()=>closed}); hostGuard.bindOriginalChild(handle); }
      alignedGrantSent = true;
      child.stdin.write(Buffer.from('G')); // One private grant, before any original command.

    beginPolling();
    const hello = await Promise.race([ready, new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('TRON_CANDIDATE_STARTUP_TIMEOUT')), 120000); })]);
    readySeen = true; await auditNative(); assert.equal(hello.metadata.classification, 'LOCAL_SYNTHETIC_TRON_JAVA_TRON_CONSENSUS');
    assert.equal(hello.metadata.upstreamCommit, TRON_UPSTREAM.commit); assert.match(hello.metadata.genesis, /^0000000000000000[0-9a-f]{48}$/);
    let alignedNativeAudit;

      alignedNativeAudit = await captureTronAlignedRocksDbNativeAudit(directory, await identity());
      await privateWrite(join(audit, 'jni-maps-ready-private.log'), alignedNativeAudit.maps);
      await privateWrite(join(audit, 'original-aligned-rocksdb-ready-audit.json'), alignedNativeAudit.evidence);

    Object.assign(handle, { hello, command, auditNative, close,
      assertAlive() { if (signal.aborted) throw signal.reason; assert.ok(original && !closed && !failure && !exit && child.exitCode === null && child.signalCode === null, 'OWNED_TRON_ORIGINAL_PROCESS_REQUIRED'); }, alignedNativeAudit: alignedNativeAudit?.evidence ?? null,
      alignedStartupIdentityEvidence: {
        format: 'LIANUM_TRON_ALIGNED_PYTHON_JAVA_TRANSITION_V1', pythonBirth: original, javaFirstObservation: alignedJavaIdentity,
        grantOctet: 'G', authorizedExecTransitions: 1, originalJavaArgv: alignedJavaArgv },
      async captureAlignedNativeAudit() {
        assert.ok(profile === CANDIDATE || profile === PRODUCT || profile === FIRST_ERROR_PRODUCT); await auditNative();
        return captureTronAlignedRocksDbNativeAudit(directory, await identity());
      } });
    return handle;
  } catch (error) {

      try { error.childCleanup = await close(); }
      catch (cleanupError) {
        error.childCleanup = { stopped: false, startupAuthenticated: false, nativeOrderlyExit: false };
        error.childCleanupErrorCode = safeCode(cleanupError);
      }
      throw error; // Preserve original capture/admission failure even when cleanup is uncertain.

  } finally { clearTimeout(timeout); }
}
export async function startOwnedTronAlignedCandidateChildV1(directory, audit, signal) {
  assert.equal(arguments.length, 3, 'TRON_PRODUCT_CANDIDATE_OPENER_ARITY');
  await inspectOwnedTronAlignedCandidateMaterialV1();
  return startAlignedChild(directory, audit, signal, CANDIDATE);
}
export async function startOwnedTronAlignedProductChildV1(directory, audit, signal) {
  assert.equal(arguments.length, 3, 'TRON_PRODUCT_OPENER_ARITY'); assertOwnedTronProductReleaseV1();
  const hostGuard=createTronProductHostGuardV1(), material=await inspectOwnedTronReviewedMaterialV1(); hostGuard.assertActive();
  const child=await startAlignedChild(directory,audit,signal,PRODUCT,hostGuard);
  return Object.assign(child,{material,originalHostScope:hostGuard.evidence});
}

/** Metadata from the actual private product opener; a plain object cannot bind
 * a host exception. No ChildProcess, signal target or raw command is exposed. */
export function readOriginalTronProductChildBirthV1(handle) {
 assert.equal(arguments.length,1); const value=productChildren.get(handle);
 assert.ok(value,'TRON_PRODUCT_ORIGINAL_OPENER_REQUIRED'); assert.equal(value.closed(),false,'TRON_PRODUCT_OPENER_CLOSED');
 return structuredClone(value.original);
}

/** Fixed safe-diagnostic derivative, separately activated after its real v4
 * build. The original v2 candidate/product factories remain unchanged. */
export async function startOwnedTronFirstErrorPrivateProductChildV3(directory, audit, signal) {
  assert.equal(arguments.length, 3, 'TRON_FIRST_ERROR_OPENER_NO_OPTIONS');
  assertOwnedTronProductReleaseV1();
  const hostGuard = createTronProductHostGuardV1();
  const material = await inspectOwnedTronFirstErrorPrivateMaterialV3(); hostGuard.assertActive();
  const child = await startAlignedChild(directory, audit, signal, FIRST_ERROR_PRODUCT, hostGuard);
  return Object.assign(child, { material, originalHostScope: hostGuard.evidence });
}
