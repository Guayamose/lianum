/** Fixed-command resource watchdog for the reusable generic account fixture.
 * No caller executable, RPC, shell, time or resource override exists. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, statfsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PRIVATE_RESOURCE_POLICY,
  PRIVATE_RESOURCE_FLOORS,
  PRIVATE_PROOF_WORKER_RSS_LIMIT,
} from '@lianum/components/resources/private-resource-policy';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const recoveryCase = args.length === 2 && args[1] === '--case=partial-recovery';
assert.deepEqual(args, ['--authorized-local-generic-balance-account',
  ...(recoveryCase ? ['--case=partial-recovery'] : [])], 'GENERIC_ACCOUNT_FIXED_LOCAL_ARGUMENTS');
const mode = 'run', relation = 'generic-balance-account';
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
  classification: 'BOUNDED_OWNED_GENERIC_BALANCE_ACCOUNT_PROCESS',
  mode,
  relation,
  case: recoveryCase ? 'partial-recovery' : 'two-settlements',
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
  timeoutMilliseconds: 4 * 60 * 60 * 1000,
  hostLimitsChanged: false,
};
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
save();

const childArguments = [root + 'scripts/integration-generic-balance-account.mjs', '--authorized-local-generic-balance-account'];
if (recoveryCase) childArguments.push('--case=partial-recovery');
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
  if (closed || failure !== null) return;
  failure = code;
  child.kill('SIGTERM');
  killTimer ??= setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, 45000);
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
      report.failedResourceSample ??= current;
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
    if (outputBytes > 4 * 1024 * 1024) stop('DEVELOPMENT_OUTPUT_LIMIT');
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
