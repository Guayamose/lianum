/** One composition of the existing original operator, SQL admission, owner,
 * keeper and workers. The economic factories stay together in the same PID. */
import assert from 'node:assert/strict';
import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlatformPool } from './database-pool.mjs';
import { readPlatformPrivacyKeyV1 } from './privacy-key-v1.mjs';
import { startPlatformOriginalDeviceCloudLocalGatewayV1, reopenPlatformOriginalDeviceCloudLocalGatewayV1 } from './original-device-cloud-local-gateway-v1.mjs';
import { readPrivateGatewayRecord, publishNewGatewayPair, verifyRetainedGatewayPair } from './gateway-pairing.mjs';
import { platformDiagnostic } from './diagnostics.mjs';

const directory = fileURLToPath(new URL('../../../.internal/runtime/omnichain-flat-profile/flat-wallet/.local/original-device-cloud-local-v1', import.meta.url));
export async function runOriginalGatewayProfile(profile) {
  assert.ok(arguments.length === 1 && ['original-native-new', 'original-native-reopen'].includes(profile), 'PLATFORM_PROFILE_INVALID');
  const reopening = profile === 'original-native-reopen';
  assert.equal(process.execPath, fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node', import.meta.url)));
  assert.deepEqual(process.execArgv, ['--max-old-space-size=384']);
  assert.equal(process.env.NODE_OPTIONS, undefined); assert.equal(process.env.NODE_PATH, undefined);
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0');
  const entry = await realpath(process.argv[1]);
  const common = fileURLToPath(new URL('./entry.mjs', import.meta.url));
  const historical = fileURLToPath(new URL(reopening ? './run-original-device-cloud-local-reopen-v1.mjs' : './run-original-device-cloud-local-v1.mjs', import.meta.url));
  assert.equal(entry, process.argv[1], 'PLATFORM_ENTRY_ALIAS');
  assert.ok((entry === common && process.argv.length === 3 && process.argv[2] === profile)
    || (entry === historical && process.argv.length === 2), 'PLATFORM_ENTRY_INVALID');
  const port = process.env.PORT ?? '8080';
  assert.ok(/^[1-9][0-9]{0,4}$/.test(port) && Number(port) <= 65535, 'PLATFORM_PORT_INVALID');
  const { value: config } = await readPrivateGatewayRecord(directory, 'operator.json');
  assert.deepEqual(Object.keys(config).sort(), ['devicePublicKey', 'origin', 'tls']);
  assert.deepEqual(Object.keys(config.tls).sort(), ['certificate', 'privateKey']);
  let retained;
  if (reopening) {
    retained = await readPrivateGatewayRecord(directory, 'paired-descriptor.json');
    assert.equal(retained.value.profile, 'ORIGINAL_DEVICE_CLOUD_LOCAL_GATEWAY_V1');
    assert.equal(retained.value.descriptor.origin, config.origin);
    assert.equal(retained.value.descriptor.devicePublicKey, config.devicePublicKey);
  } else {
    await lstat(join(directory, 'paired-descriptor.json')).then(() => { throw Error('PLATFORM_ORIGINAL_GATEWAY_ALREADY_PAIRED'); }, error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  assert.ok(process.env.DATABASE_URL, 'PLATFORM_ORIGINAL_GATEWAY_SQL_REQUIRED');
  const privacyKey = readPlatformPrivacyKeyV1();
  let acquisition, service, pool, closing, closed = false, captureRequested = false;
  function close() {
    closed = true;
    return closing ??= (async () => {
      let failure;
      try {
        if (acquisition) service = await acquisition;
        if (service) {
          if (captureRequested) {
            const value = await service.capture();
            assert.ok(value.closed && value.originalResourcesStopped && value.plannedCaptureForNewProcess, 'PLATFORM_ORIGINAL_GATEWAY_CAPTURE_UNCONFIRMED');
            process.stdout.write('ORIGINAL_DEVICE_LOCAL_TRANSPORT_CAPTURE_READY\n');
          } else await service.close();
        }
      } catch (error) { failure = error; }
      try { await pool?.end(); } catch (error) { failure ??= error; }
      if (failure) throw failure;
      platformDiagnostic('SERVICE_STOPPED');
    })();
  }
  function stop() { void close().catch(() => { process.exitCode = 1; platformDiagnostic('SERVICE_CLOSE_FAILED'); }); }
  function capture() { if (!closed) captureRequested = true; stop(); }
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  if (!reopening) process.once('SIGUSR2', capture);
  try {
    pool = createPlatformPool(process.env.DATABASE_URL);
    acquisition = (reopening ? reopenPlatformOriginalDeviceCloudLocalGatewayV1 : startPlatformOriginalDeviceCloudLocalGatewayV1)({ ...config, pool, privacyKey, port: Number(port) });
    acquisition.catch(() => {}); config.tls = null;
    service = await acquisition;
    if (reopening) {
      assert.equal(service.originalOrderedReopen, true); assert.equal(service.readReconcileWithdrawalOnly, true);
    }
    if (closed) await close();
    else {
      if (reopening) await verifyRetainedGatewayPair(directory, retained, service);
      else await publishNewGatewayPair(directory, service);
      if (closed) await close();
      else { platformDiagnostic('SERVICE_STARTED'); process.stdout.write(reopening ? 'ORIGINAL_DEVICE_LOCAL_TRANSPORT_REOPEN_READY\n' : 'ORIGINAL_DEVICE_LOCAL_TRANSPORT_READY\n'); }
    }
    return Object.freeze({ close, port: service.port });
  } catch (error) {
    try { await close(); } catch { platformDiagnostic('SERVICE_CLOSE_FAILED'); }
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); process.removeListener('SIGUSR2', capture);
    throw error;
  }
}
