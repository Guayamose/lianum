/** One diagnostic pass over the already pinned artifact. No witness, CRS,
 * key generation, proof, compiler or native backend is used. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { ROOT, LIMITS, SETTINGS, loadCompiled, loadPinned, hash, regular,
  resourceModuleURL, resources, resourceFailure } from '../../packages/components/src/component-tooling.mjs';

const script = fileURLToPath(import.meta.url);
const outputRoot = join(ROOT, 'evidence', 'gate-attribution');
const programPin = '9c436279ccc3dba77fc6f6fd3b76ed2adf33b793e83b3c2fc9c23382d28a1026';
const manifestPin = '1523ff7a320ee126a1e9e6d3201c4920a9bc288817d8caf022174cc8d04aeb42';
const save = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
assert.equal(process.execArgv.length, 0);
assert.ok(!process.env.NODE_OPTIONS);

if (process.argv[2] === '--worker') {
  assert.equal(process.argv.length, 4);
  assert.ok(!process.env.NODE_PATH);
  assert.equal(realpathSync(`/proc/${process.ppid}/exe`), realpathSync(process.execPath));
  const parentArgs = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parentArgs.length, 2);
  assert.equal(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parentArgs[1]), script);
  const output = process.argv[3];
  assert.equal(output, join(outputRoot, `attempt-${process.ppid}`));
  globalThis.fetch = async () => { throw Error('GATE_ATTRIBUTION_OFFLINE_REQUIRED'); };
  const began = performance.now();
  const compiled = loadCompiled();
  assert.equal(compiled.manifestSHA256, manifestPin);
  assert.equal(compiled.manifest.programSHA256, programPin);
  const helper = await import(resourceModuleURL);
  const toolchain = helper.verifyToolchain();
  const bb = await loadPinned('@aztec/bb.js');
  let api;
  try {
    api = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm,
      threads: 1, skipSrsInit: true, memory: { initial: 37, maximum: LIMITS.maximumPages } });
    const beganStats = performance.now();
    const stats = await api.circuitStats({
      circuit: { name: 'node-component', bytecode: gunzipSync(compiled.compressed), verificationKey: new Uint8Array() },
      includeGatesPerOpcode: true, settings: SETTINGS,
    });
    const statsMilliseconds = performance.now() - beganStats;
    assert.equal(stats.numGates, 916744);
    assert.equal(stats.numGatesDyadic, 1048576);
    assert.equal(stats.numAcirOpcodes, 377978);
    assert.equal(stats.gatesPerOpcode.length, stats.numAcirOpcodes);
    for (const count of stats.gatesPerOpcode) assert.ok(Number.isSafeInteger(count) && count >= 0);
    assert.equal(loadCompiled().manifestSHA256, manifestPin);
    assert.deepEqual(helper.verifyToolchain(), toolchain);
    save(join(output, 'stats.json'), stats);
    save(join(output, 'result.json'), { classification: 'UNCHANGED_ARTIFACT_GATE_ATTRIBUTION_ONLY',
      completedAt: new Date().toISOString(), programSHA256: programPin,
      compiledManifestSHA256: manifestPin, scriptSHA256: hash(regular(script)),
      toolchain, settings: SETTINGS, statsMilliseconds,
      totalMillisecondsBeforeTeardown: performance.now() - began,
      proofGenerated: false, keyGenerated: false, recompiled: false,
      witnessExecuted: false, crsInitialized: false, nativeBackendUsed: false,
      statsSHA256: hash(regular(join(output, 'stats.json'))) });
  } finally {
    if (api) await api.destroy();
  }
} else {
  assert.equal(process.argv.length, 2);
  mkdirSync(outputRoot, { recursive: true });
  const output = join(outputRoot, `attempt-${process.pid}`);
  mkdirSync(output); // Existing attempts are never overwritten or retried.
  const report = { startedAt: new Date().toISOString(), limits: LIMITS,
    phase: 'running', samples: 0, peakWorkerRSS: 0,
    minimumAvailableRAM: Number.MAX_SAFE_INTEGER, minimumFreeDisk: Number.MAX_SAFE_INTEGER,
    failures: [], outputBytes: 0, scriptSHA256: hash(regular(script)) };
  const initial = resources();
  assert.equal(resourceFailure(initial), null);
  report.initialResources = initial;
  const child = spawn(process.execPath, [script, '--worker', output], {
    cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const began = performance.now();
  let killTimer, stopping = false;
  const stop = reason => {
    if (stopping) return;
    stopping = true; report.failures.push(reason); child.kill('SIGTERM');
    killTimer = setTimeout(() => child.kill('SIGKILL'), LIMITS.killGraceMilliseconds);
  };
  const sample = () => {
    try {
      const value = resources(child.pid); report.samples++;
      report.peakWorkerRSS = Math.max(report.peakWorkerRSS, value.workerRSS);
      report.minimumAvailableRAM = Math.min(report.minimumAvailableRAM, value.availableRAM);
      report.minimumFreeDisk = Math.min(report.minimumFreeDisk, value.freeDisk);
      const failure = resourceFailure(value); if (failure) stop(failure);
      if (performance.now() - began > LIMITS.phaseTimeoutMilliseconds) stop('TIMEOUT');
    } catch (error) { stop(String(error.message)); }
  };
  let log = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    report.outputBytes += chunk.length;
    if (report.outputBytes > LIMITS.outputBytes) stop('OUTPUT_LIMIT');
    else log += chunk.toString();
  });
  const interval = setInterval(sample, LIMITS.sampleMilliseconds); sample();
  const exit = await new Promise(resolveExit => {
    child.once('error', error => { report.failures.push(String(error.message)); resolveExit({ code: null, signal: 'SPAWN_ERROR' }); });
    child.once('close', (code, signal) => resolveExit({ code, signal }));
  });
  clearInterval(interval); clearTimeout(killTimer);
  report.exit = exit; report.elapsedMilliseconds = performance.now() - began;
  report.finalResources = resources(); report.completedAt = new Date().toISOString();
  report.phase = exit.code === 0 && !report.failures.length ? 'completed' : 'failed';
  save(join(output, 'resources.json'), report);
  writeFileSync(join(output, 'worker.log'), log, { flag: 'wx' });
  console.log(JSON.stringify({ output, phase: report.phase, elapsedMilliseconds: report.elapsedMilliseconds }));
  if (report.phase !== 'completed') process.exitCode = 1;
}
