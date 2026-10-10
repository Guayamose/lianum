/** Zero-argument local ingress. Private infrastructure only; never an executor
 * DTO, caller-selected upstream, migrated realm or automatic funded account. */
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { open, lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPlatformOriginalDeviceCloudLocalGatewayV1 } from './original-device-cloud-local-gateway-v1.mjs';
import { createPlatformPool } from './database-pool.mjs';
import { readPlatformPrivacyKeyV1 } from './privacy-key-v1.mjs';

const entry = fileURLToPath(import.meta.url);
const directory = fileURLToPath(new URL('../../../.internal/runtime/omnichain-flat-profile/flat-wallet/.local/original-device-cloud-local-v1', import.meta.url));
async function privateConfiguration() {
  const stat = await lstat(directory);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === process.getuid()
    && (stat.mode & 0o777) === 0o700 && await realpath(directory) === directory, 'PLATFORM_ORIGINAL_GATEWAY_PRIVATE_DIRECTORY');
  const handle = await open(join(directory, 'operator.json'), constants.O_RDONLY | constants.O_NOFOLLOW); let bytes;
  try {
    const before = await handle.stat();
    assert.ok(before.isFile() && before.nlink === 1 && before.uid === process.getuid()
      && (before.mode & 0o777) === 0o600 && before.size > 0 && before.size <= 32768, 'PLATFORM_ORIGINAL_GATEWAY_PRIVATE_FILE');
    bytes = Buffer.alloc(32769); const count = (await handle.read(bytes, 0, bytes.length, 0)).bytesRead;
    const after = await handle.stat(), named = await lstat(join(directory, 'operator.json'));
    for (const field of ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'])
      assert.equal(before[field], after[field]);
    for (const field of ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'])
      assert.equal(before[field], named[field]);
    assert.equal(named.isSymbolicLink(), false); assert.equal(count, before.size);
    const value = JSON.parse(bytes.subarray(0, count).toString('utf8'));
    assert.deepEqual(Object.keys(value).sort(), ['devicePublicKey', 'origin', 'tls']);
    assert.deepEqual(Object.keys(value.tls).sort(), ['certificate', 'privateKey']);
    return value;
  } finally { bytes?.fill(0); await handle.close(); }
}
async function publish(service) {
  const destination = join(directory, 'paired-descriptor.json'), value = Buffer.from(JSON.stringify({
    profile: service.profile, descriptor: service.descriptor, localTransport: 'LOOPBACK_HTTP_TO_ORIGINAL_TLS',
    automaticFunding: false, cloudDeploymentEstablished: false,
  }) + '\n');
  const handle = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(value); await handle.sync(); }
  finally { value.fill(0); await handle.close(); }
  const parent = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await parent.sync(); } finally { await parent.close(); }
}
assert.equal(process.execPath, fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node', import.meta.url)));
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], entry); assert.equal(await realpath(entry), entry);
assert.deepEqual(process.execArgv, ['--max-old-space-size=384']);
assert.equal(process.env.NODE_OPTIONS, undefined); assert.equal(process.env.NODE_PATH, undefined);
assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0');
const configuredPort = process.env.PORT ?? '8080';
assert.ok(/^[1-9][0-9]{0,4}$/.test(configuredPort) && Number(configuredPort) <= 65535);
let acquisition, service, pool, closed = false, closing;
function close() {
  closed = true;
  return closing ??= (async () => {
    let failure;
    try { if (acquisition) service = await acquisition; if (service) await service.close(); }
    catch (error) { failure = error; }
    try { await pool?.end(); } catch (error) { failure ??= error; }
    if (failure) throw failure;
  })();
}
function stop() { void close().catch(() => { process.exitCode = 1; process.stderr.write('PLATFORM_ORIGINAL_GATEWAY_CLOSE_UNCONFIRMED\n'); }); }
process.once('SIGINT', stop); process.once('SIGTERM', stop);
try {
  const config = await privateConfiguration();
  // A previous pairing requires its own original recovery path. This new-realm
  // entry never silently replaces it or recreates funded resources.
  await lstat(join(directory, 'paired-descriptor.json')).then(() => { throw Error('PLATFORM_ORIGINAL_GATEWAY_ALREADY_PAIRED'); }, error => {
    if (error.code !== 'ENOENT') throw error;
  });
  assert.ok(process.env.DATABASE_URL, 'PLATFORM_ORIGINAL_GATEWAY_SQL_REQUIRED');
  if (!closed) {
    pool = createPlatformPool(process.env.DATABASE_URL);
    acquisition = startPlatformOriginalDeviceCloudLocalGatewayV1({ ...config, pool,
      privacyKey: readPlatformPrivacyKeyV1(), port: Number(configuredPort) });
    acquisition.catch(() => {}); config.tls = null;
    service = await acquisition;
    if (closed) await close();
    else { await publish(service); if (closed) await close(); else process.stdout.write('ORIGINAL_DEVICE_LOCAL_TRANSPORT_READY\n'); }
  } else config.tls = null;
} catch {
  process.exitCode = 1;
  try { await close(); } catch { process.stderr.write('PLATFORM_ORIGINAL_GATEWAY_CLOSE_UNCONFIRMED\n'); }
  process.stderr.write('PLATFORM_ORIGINAL_GATEWAY_START_FAILED\n');
}
