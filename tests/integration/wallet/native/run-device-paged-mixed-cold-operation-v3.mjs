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
import { openOriginalPagedMixedBackendProcessV3 } from './device-paged-mixed-backend-client-v3.mjs';
import { openOriginalPagedMobileHostV3 } from './device-paged-mobile-host-v3.mjs';
import { runOriginalPagedMixedColdOperationV3 } from './device-paged-three-network-operation-v3.mjs';
import {createOriginalPagedMixedLocalTlsV3} from './device-paged-financial-local-tls-v3.mjs';

const root = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
assert.equal(fileURLToPath(import.meta.url),join(root,'tests/integration/wallet/native/run-device-paged-mixed-cold-operation-v3.mjs'));
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], fileURLToPath(import.meta.url));
assert.equal(await realpath(process.argv[1]), process.argv[1]);
assert.equal(process.execPath, join(root, '.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'));
assert.deepEqual(process.execArgv, ['--max-old-space-size=384']);
assert.equal(process.env.NODE_OPTIONS, undefined); assert.equal(process.env.NODE_PATH, undefined);
const generation = assertOriginalPagedNativeFinancialSourceV3();
let infrastructure={tls:null};
const directory = join(root, '.local/device-paged-mixed-v3'); await mkdir(directory, { recursive: true, mode: 0o700 });
assert.equal(await realpath(directory), directory);
const attempt = join(directory, 'attempt-' + randomUUID()); await mkdir(attempt, { mode: 0o700 });
infrastructure.tls=await createOriginalPagedMixedLocalTlsV3(attempt);
await mkdir(join(attempt, 'authority'), { mode: 0o700 });
const sha = value => createHash('sha256').update(value).digest('hex');
const manifestSHA256 = sha(await readFile(join(PAEG_PAGED_ARTIFACT_DIRECTORY_V3, 'manifest.json')));
const consumerSHA256 = sha(await readFile(join(PAEG_PAGED_ARTIFACT_DIRECTORY_V3, 'consumer.json')));
loadFundedPagedGraphArtifactsV3(manifestSHA256);
let host, hostAcquisition, backend, backendAcquisition, runWork, result = null, error = null, closure = null, closing, stopping = false;
const signals = [];
function originalFailureData(value){
 if(!value)return null;assert.deepEqual(Reflect.ownKeys(value).sort(),['name','code','rpcCode','stateBound','frames'].sort());assert.ok(['Error','AssertionError','TypeError','RangeError','SyntaxError','ReferenceError','URIError','EvalError','AggregateError'].includes(value.name));assert.ok(value.code===null||/^[A-Z][A-Z0-9_]{3,100}$/.test(value.code));assert.ok(value.rpcCode===null||/^-?\d{1,8}$/.test(value.rpcCode));assert.ok(Array.isArray(value.frames)&&value.frames.length<=6&&value.frames.every(row=>typeof row==='string'&&row.length<=2048&&/^at (?:[A-Za-z0-9_.$<>[\] -]+ \()?((?:file:\/\/)?\/[A-Za-z0-9_./-]+\.(?:mjs|cjs|js|ts)):[1-9][0-9]{0,8}:[1-9][0-9]{0,8}\)?$/.test(row)));if(value.stateBound!==null){assert.ok(JSON.stringify(value.stateBound).length<=2048);assert.ok(Object.entries(value.stateBound).every(([key,v])=>key==='schema'?['OWNED_EVM_RECOVERY_STATE_BOUND_DIAGNOSTIC_V1','OWNED_PAGED_HUB_EVM_STATE_BOUND_DIAGNOSTIC_V3'].includes(v):key==='type'?['NULL','STRING','UNDEFINED','BOOLEAN','NUMBER','BIGINT','SYMBOL','FUNCTION','OBJECT'].includes(v):v===null||typeof v==='boolean'||Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff));}return structuredClone(value);
}
const metadata = cause => ({ name: cause?.name ?? 'Error',
  code: /^[A-Z][A-Z0-9_]{3,100}$/.test(cause?.code ?? '') ? cause.code
    : /^[A-Z][A-Z0-9_]{3,100}$/.test(cause?.message ?? '') ? cause.message : null,
  originalFailure: originalFailureData(cause?.originalFailure),
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
    nativeDirectory: join(attempt, 'provider'), origin: 'https://127.0.0.1:7454',
    devicePublicKey: host.devicePublicKey, tls: infrastructure.tls, host: '127.0.0.1' };
  const configPath = join(attempt, 'operator.json'), output = await open(configPath, 'wx', 0o600);
  try { await output.writeFile(JSON.stringify(config)); await output.sync(); } finally { await output.close(); }
  config.journal.password = null; config.tls = null;
  assert.ok(!stopping, 'PAGED_COLD_START_CANCELLED');backendAcquisition = openOriginalPagedMixedBackendProcessV3(configPath);
  backend = await backendAcquisition; assert.ok(!stopping);
  runWork = runOriginalPagedMixedColdOperationV3(backend, host, infrastructure.tls); result = await runWork; assert.ok(!stopping);
} catch (cause) { error = metadata(cause); process.exitCode = 1; }
finally {
  await close(); infrastructure.tls = null;
  const report = { profile: 'ORIGINAL_PAGED_MIXED_UNISWAP_THREE_NETWORK_NEW_PROCESS_ACCEPTANCE_V3',
    sourceGeneration: generation.generationSHA256 ?? generation.generation ?? null,
    result, error, closure, signals, backendHistory: backend?.history() ?? [],
    originalResourcesClosed: !!backend && closure.backendExited && closure.hostClosed && closure.errors.length === 0,
    publicNetwork: false, physicalPhone: false, independentOperators: false };
  const output = await open(join(attempt, 'result.json'), 'wx', 0o600);
  try { await output.writeFile(JSON.stringify(report)); await output.sync(); } finally { await output.close(); }
  const accepted = result !== null && error === null && report.originalResourcesClosed && signals.length === 0;
  if (!accepted) process.exitCode = 1;
  process.stdout.write(accepted ? 'PAGED_MIXED_NEW_PROCESS_OPERATION_COMPLETED\n' : 'PAGED_MIXED_NEW_PROCESS_OPERATION_REJECTED\n');
}
