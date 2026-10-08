/** Fixed private local product caller. No HTTP or argv supplies an account,
 * runtime, source path, executor, user key or economic callback. Configuration
 * contains only origin/device public key/operator TLS. Descriptor stays 0600.
 * One original acquired service is drained on close; no startup/send retry. */
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { open, lstat, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPlatformOriginalDeviceLocalOperatorV1, platformOriginalDeviceLocalConfigurationPathV1 }
  from './original-device-local-operator-v1.mjs';
assert.ok(process.execPath === fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node', import.meta.url)),
  'PLATFORM_ORIGINAL_LOCAL_PINNED_NODE');
assert.ok(process.env.NODE_OPTIONS === undefined, 'PLATFORM_ORIGINAL_LOCAL_NO_NODE_OPTIONS');
assert.ok(process.env.NODE_PATH === undefined, 'PLATFORM_ORIGINAL_LOCAL_NO_NODE_PATH');
assert.equal(process.argv.length, 2, 'PLATFORM_ORIGINAL_LOCAL_FIXED_ENTRY');
assert.ok(process.execArgv.length === 1 && process.execArgv[0] === '--max-old-space-size=384', 'PLATFORM_ORIGINAL_LOCAL_FIXED_HEAP');
let acquisition, service, closeRequested = false, closing;
function close() {
  closeRequested = true; // fence publication before first await, even during startup
  return closing ??= (async () => {
    if (acquisition) service = await acquisition;
    if (service) {
      const result = await service.close();
      assert.equal(result.closed, true); assert.equal(result.originalResourcesStopped, true);
    }
  })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void close().catch(() => { process.stderr.write('PLATFORM_ORIGINAL_LOCAL_CLOSE_UNCONFIRMED\n'); process.exitCode = 1; });
});
let handle, bytes;
try {
  const path = await platformOriginalDeviceLocalConfigurationPathV1(), directory = dirname(path);
  const dir = await lstat(directory);
  assert.ok(dir.isDirectory() && !dir.isSymbolicLink() && dir.uid === process.getuid() && (dir.mode & 0o077) === 0);
  assert.equal(await realpath(directory), directory);
  handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const before = await handle.stat();
  assert.ok(before.isFile() && before.uid === process.getuid() && (before.mode & 0o077) === 0
    && before.nlink === 1 && before.size > 0 && before.size <= 32768, 'PLATFORM_ORIGINAL_LOCAL_PRIVATE_CONFIG');
  bytes = await handle.readFile(); const after = await handle.stat(), named = await lstat(path);
  for (const field of ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'])
    assert.ok(before[field] === after[field] && before[field] === named[field], 'PLATFORM_ORIGINAL_LOCAL_CONFIG_CHANGED');
  assert.equal(named.isSymbolicLink(), false); assert.equal(bytes.length, before.size);
  const config = JSON.parse(bytes.toString('utf8')); bytes.fill(0); bytes = null;
  await handle.close(); handle = null;
  if (!closeRequested) {
    acquisition = startPlatformOriginalDeviceLocalOperatorV1(config); acquisition.catch(() => {});
    config.tls = null; // the constructor snapshots its bounded configuration synchronously
    service = await acquisition;
    if (closeRequested) await close();
    else {
      const destination = await open(join(directory, 'paired-descriptor.json'), 'wx', 0o600);
      try {
        await destination.writeFile(JSON.stringify({ version: 1, profile: service.profile, origin: service.origin,
          descriptor: service.descriptor, localFakeValues: true, automaticFunding: false, cloudAuthority: false }) + '\n');
        await destination.sync();
      } finally { await destination.close(); }
      if (closeRequested) await close();
      else process.stdout.write('ORIGINAL_LOCAL_DEVICE_SERVICE_READY\n');
    }
  }
} catch {
  process.exitCode = 1;
  try { await close(); } catch { process.stderr.write('PLATFORM_ORIGINAL_LOCAL_CLOSE_UNCONFIRMED\n'); }
  process.stderr.write('PLATFORM_ORIGINAL_LOCAL_START_OR_CLOSE_FAILED\n');
} finally { bytes?.fill(0); await handle?.close(); }
