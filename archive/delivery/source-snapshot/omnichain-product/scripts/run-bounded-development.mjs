/** External resource watchdog for the one generic-graph development check. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, statfsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PRIVATE_RESOURCE_POLICY,
  PRIVATE_RESOURCE_FLOORS,
  PRIVATE_PROOF_WORKER_RSS_LIMIT,
} from '../src/private-resource-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
const relation = process.argv[3] ?? 'graph-opening';
const completedReport = process.argv[4];
if (completedReport) assert.match(completedReport, /^[a-z0-9-]+\.json$/i, 'DEVELOPMENT_PRIOR_REPORT_NAME');
const nativeRelations = ['capsule','dependency','ready','node','admission','aggregate_pair','aggregate_all','fulfill'].map(name => 'native-' + name);
assert.ok(['graph-opening', 'owner-authorization', 'generic-reserve', 'generic-refund', 'generic-pool', 'generic-native-system', ...nativeRelations].includes(relation), 'DEVELOPMENT_RELATION');
assert.ok(['compile', 'witnesses', 'negative-witnesses', 'remaining-negative-witnesses', 'prepare-key'].includes(mode), 'DEVELOPMENT_MODE');
assert.ok(relation !== 'generic-pool' || mode === 'compile', 'GENERIC_POOL_COMPILE_ONLY');
assert.ok(relation !== 'generic-native-system' || mode === 'compile', 'NATIVE_SYSTEM_COMPILE_ONLY');
assert.ok(!relation.startsWith('native-') || ['compile','prepare-key'].includes(mode) || (relation === 'native-dependency' && mode === 'witnesses'), 'NATIVE_DEVELOPMENT_MODE');
assert.ok(mode !== 'prepare-key' || ['owner-authorization','generic-reserve','generic-refund',...nativeRelations].includes(relation), 'GENERIC_KEY_RELATION');
const directory = root + '.local/development/';
mkdirSync(directory, { recursive: true });
const startedAt = new Date().toISOString();
const reportPath = directory + startedAt.replace(/[:.]/g, '-') + '-' + relation + '-' + mode + '.json';

function resources(pid) {
  const memory = readFileSync('/proc/meminfo', 'utf8');
  const disk = statfsSync(root);
  let workerRSS = 0;
  if (pid) {
    try {
      const status = readFileSync(`/proc/${pid}/status`, 'utf8');
      workerRSS = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0) * 1024;
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
    }
  }
  return {
    availableRAM: Number(/MemAvailable:\s+(\d+)/.exec(memory)[1]) * 1024,
    freeDisk: disk.bavail * disk.bsize,
    workerRSS,
  };
}

function resourceFailure(sample) {
  if (sample.availableRAM < PRIVATE_RESOURCE_FLOORS.availableRAM) return 'AVAILABLE_RAM_FLOOR';
  if (sample.freeDisk < PRIVATE_RESOURCE_FLOORS.freeDisk) return 'DISK_FLOOR';
  if (sample.workerRSS > PRIVATE_PROOF_WORKER_RSS_LIMIT) return 'WORKER_RSS_LIMIT';
  return null;
}

const initial = resources();
assert.equal(resourceFailure(initial), null, 'DEVELOPMENT_START_RESOURCE_GUARD');
const report = {
  classification: 'BOUNDED_PRIVATE_WALLET_DEVELOPMENT_PROCESS',
  mode,
  relation,
  node: process.version,
  legacyPackageEngine: '24.14.0',
  nodeEngineDiffersFromLegacy: process.version !== 'v24.14.0',
  startedAt,
  phase: 'starting',
  resourcePolicy: PRIVATE_RESOURCE_POLICY,
  minimumAvailableRAM: initial.availableRAM,
  minimumFreeDisk: initial.freeDisk,
  peakWorkerRSS: 0,
  samples: 0,
  timeoutMilliseconds: 600000,
  hostLimitsChanged: false,
};
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
save();

const childArguments = mode === 'prepare-key'
  ? (relation.startsWith('native-') ? [root + 'scripts/prepare-native-key.mjs', relation.slice('native-'.length)]
    : relation === 'owner-authorization' ? [root + 'scripts/prepare-owner-key.mjs']
    : [root + 'scripts/prepare-wrapper-key.mjs', relation === 'generic-reserve' ? 'reserve' : 'refund'])
  : relation.startsWith('native-')
  ? [root + 'scripts/check-generic-native.mjs', mode, relation.slice('native-'.length)]
  : relation === 'generic-pool'
  ? [root + 'scripts/compile-generic-pool.mjs']
  : relation === 'generic-native-system'
  ? [root + 'scripts/check-native-system.mjs']
  : [root + 'scripts/check-generic-graph.mjs', mode, relation, ...(completedReport ? [completedReport] : [])];
const child = spawn(process.execPath, childArguments, {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { PATH: process.env.PATH, LANG: 'C.UTF-8' },
});
let closed = false;
let failure = null;
let killTimer;
let outputBytes = 0;
function stop(code) {
  if (closed) return;
  failure ??= code;
  child.kill('SIGTERM');
  killTimer ??= setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, 5000);
}
function sample() {
  try {
    const current = resources(child.pid);
    report.minimumAvailableRAM = Math.min(report.minimumAvailableRAM, current.availableRAM);
    report.minimumFreeDisk = Math.min(report.minimumFreeDisk, current.freeDisk);
    report.peakWorkerRSS = Math.max(report.peakWorkerRSS, current.workerRSS);
    report.samples += 1;
    report.latestResources = current;
    const reason = resourceFailure(current);
    if (reason) {
      report.failedResourceSample = current;
      stop(reason);
    }
    save();
  } catch {
    stop('RESOURCE_MONITOR_OR_REPORT_WRITE_FAILURE');
  }
}
const onExit = () => { if (!closed) child.kill('SIGKILL'); };
const onSignal = () => stop('PARENT_STOPPING');
process.once('exit', onExit);
process.once('SIGTERM', onSignal);
process.once('SIGINT', onSignal);
const interval = setInterval(sample, PRIVATE_RESOURCE_POLICY.externalSampleMilliseconds);
const timeout = setTimeout(() => stop('DEVELOPMENT_TIMEOUT'), report.timeoutMilliseconds);
for (const [stream, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
  stream.on('data', data => {
    outputBytes += data.length;
    if (outputBytes > 1024 * 1024) stop('DEVELOPMENT_OUTPUT_LIMIT');
    else destination.write(data);
  });
}
child.once('error', () => stop('DEVELOPMENT_SPAWN_FAILURE'));
sample();
await new Promise(resolve => child.once('close', (code, signal) => {
  closed = true;
  clearInterval(interval);
  clearTimeout(timeout);
  clearTimeout(killTimer);
  process.removeListener('exit', onExit);
  process.removeListener('SIGTERM', onSignal);
  process.removeListener('SIGINT', onSignal);
  report.phase = code === 0 && failure === null ? 'completed' : 'failed';
  report.failure = failure;
  report.exitCode = code;
  report.signal = signal;
  report.completedAt = new Date().toISOString();
  report.finalResources = resources();
  save();
  for (const stream of child.stdio) stream?.destroy();
  if (report.phase !== 'completed') process.exitCode = 1;
  resolve();
}));
console.log(JSON.stringify({ report: reportPath, phase: report.phase, failure }));
