/** Fixed fresh LOCAL financial acceptance: mobile software custody stays in
 * this PID while the complete Paged backend stops and reopens in a new PID. */
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { open, lstat, realpath, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { assertOriginalPagedNativeFinancialSourceV3 } from '@lianum/backend/operations/local/funded-paged-native-source-v3';
import { PAEG_PAGED_ARTIFACT_DIRECTORY_V3, loadFundedPagedGraphArtifactsV3 } from '@lianum/proofs/tooling/original-paged-artifacts-v3';
import { openOriginalPagedBackendProcessV3 } from './device-paged-backend-client-v3.mjs';
import { openOriginalPagedMobileHostV3 } from './device-paged-mobile-host-v3.mjs';
import { runOriginalPagedThreeNetworkColdOperationV3 } from './device-paged-three-network-cold-operation-v3.mjs';

const root = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], fileURLToPath(import.meta.url));
assert.equal(await realpath(process.argv[1]), process.argv[1]);
assert.equal(process.execPath, join(root, '.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'));
assert.deepEqual(process.execArgv, ['--max-old-space-size=384']);
assert.equal(process.env.NODE_OPTIONS, undefined); assert.equal(process.env.NODE_PATH, undefined);
const generation = assertOriginalPagedNativeFinancialSourceV3();
const infrastructurePath = join(root, '.local/device-paged-continuity-v3/config.json');
const file = await open(infrastructurePath, constants.O_RDONLY | constants.O_NOFOLLOW);
let bytes, infrastructure;
try {
  const stat = await file.stat(); assert.ok(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid()
    && (stat.mode & 0o777) === 0o600 && stat.size > 0 && stat.size <= 32768);
  const parent = await lstat(dirname(infrastructurePath)); assert.ok(parent.isDirectory()
    && parent.uid === process.getuid() && (parent.mode & 0o777) === 0o700);
  bytes = await file.readFile(); infrastructure = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const after = await file.stat(); for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) assert.equal(stat[key], after[key]);
} finally { bytes?.fill(0); await file.close(); }
assert.deepEqual(Object.keys(infrastructure).sort(), ['deploymentDomain', 'host', 'origin', 'policy', 'tls']);
assert.deepEqual(Object.keys(infrastructure.tls).sort(), ['cert', 'key']); assert.equal(infrastructure.host, '127.0.0.1');
const directory = join(root, '.local/device-paged-cold-v3'); await mkdir(directory, { recursive: true, mode: 0o700 });
assert.equal(await realpath(directory), directory);
const attempt = join(directory, 'attempt-' + randomUUID()); await mkdir(attempt, { mode: 0o700 });
await mkdir(join(attempt, 'authority'), { mode: 0o700 });
const sha = value => createHash('sha256').update(value).digest('hex');
const manifestSHA256 = sha(await readFile(join(PAEG_PAGED_ARTIFACT_DIRECTORY_V3, 'manifest.json')));
const consumerSHA256 = sha(await readFile(join(PAEG_PAGED_ARTIFACT_DIRECTORY_V3, 'consumer.json')));
loadFundedPagedGraphArtifactsV3(manifestSHA256);
let host, hostAcquisition, backend, backendAcquisition, runWork, preFundingReopen = null, result = null, error = null, closure = null, closing, stopping = false;
const signals = [];
const metadata = cause => ({ name: cause?.name ?? 'Error',
  code: /^[A-Z][A-Z0-9_]{3,100}$/.test(cause?.code ?? '') ? cause.code
    : /^[A-Z][A-Z0-9_]{3,100}$/.test(cause?.message ?? '') ? cause.message : null,
  originalFailure: cause?.originalFailure ?? null,
  frames: String(cause?.stack ?? '').split('\n').filter(row => /^\s+at /.test(row)).slice(0, 6).map(row => row.trim()),
});
function close() {
  stopping = true; return closing ??= (async () => {
    // Construction may still be in flight when a signal reaches this owner.
    // Retain and close its result before recording that resources stopped.
    const acquired = await Promise.allSettled([hostAcquisition, backendAcquisition]);
    if (acquired[0].status === 'fulfilled') host ??= acquired[0].value;
    if (acquired[1].status === 'fulfilled') backend ??= acquired[1].value;
    await runWork?.catch(() => {});
    const stopped = await Promise.allSettled([backend?.close(), host?.close()]);
    closure = { backendExited: !!backend && stopped[0].status === 'fulfilled', hostClosed: !!host && stopped[1].status === 'fulfilled',
      errors: stopped.filter(row => row.status === 'rejected').map(row => metadata(row.reason)) };
  })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  signals.push(signal); void close().finally(() => { process.exitCode = 1; });
});
try {
  assert.ok(!stopping, 'PAGED_COLD_START_CANCELLED');hostAcquisition = openOriginalPagedMobileHostV3(attempt);
  host = await hostAcquisition; assert.ok(!stopping);
  const config = { deployment: { minimumDepositAtomic: '1', manifestSHA256, consumerSHA256, deploymentDomain: '0x'+randomBytes(32).toString('hex'), policy: '0x'+randomBytes(32).toString('hex') },
    journal: { path: join(attempt, 'authority/account.aead'), password: randomBytes(32).toString('hex') },
    nativeDirectory: join(attempt, 'provider'), origin: 'https://127.0.0.1:7448',
    devicePublicKey: host.devicePublicKey, tls: infrastructure.tls, host: '127.0.0.1' };
  const configPath = join(attempt, 'operator.json'), output = await open(configPath, 'wx', 0o600);
  try { await output.writeFile(JSON.stringify(config)); await output.sync(); } finally { await output.close(); }
  config.journal.password = null; config.tls = null;
  assert.ok(!stopping, 'PAGED_COLD_START_CANCELLED');backendAcquisition = openOriginalPagedBackendProcessV3(configPath);
  backend = await backendAcquisition; assert.ok(!stopping);
  // Authenticate the complete four-ledger empty reopening before generating
  // any deposit/graph proof. A shutdown failure spends no economic proof work.
  preFundingReopen = await backend.restart(); assert.ok(!stopping);
  process.stdout.write('PAGED_EMPTY_BACKEND_REOPEN_CONFIRMED\n');
  runWork = runOriginalPagedThreeNetworkColdOperationV3(backend, host, infrastructure.tls); result = await runWork; assert.ok(!stopping);
} catch (cause) { error = metadata(cause); process.exitCode = 1; }
finally {
  await close(); infrastructure.tls = null;
  const report = { profile: 'ORIGINAL_PAGED_THREE_NETWORK_NEW_PROCESS_ACCEPTANCE_V3',
    sourceGeneration: generation.generationSHA256 ?? generation.generation ?? null,
    result, error, closure, signals, preFundingReopen, backendHistory: backend?.history() ?? [],
    originalResourcesClosed: !!backend && closure.backendExited && closure.hostClosed && closure.errors.length === 0,
    publicNetwork: false, physicalPhone: false, independentOperators: false };
  const output = await open(join(attempt, 'result.json'), 'wx', 0o600);
  try { await output.writeFile(JSON.stringify(report)); await output.sync(); } finally { await output.close(); }
  const accepted = result !== null && error === null && report.originalResourcesClosed && signals.length === 0;
  if (!accepted) process.exitCode = 1;
  process.stdout.write(accepted ? 'PAGED_NEW_PROCESS_OPERATION_COMPLETED\n' : 'PAGED_NEW_PROCESS_OPERATION_REJECTED\n');
}
