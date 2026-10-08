/** Two separately fixed operator entries share infrastructure IO and shutdown.
 * No backend/realm selector or operation appears in argv, HTTP or config. */
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { open, lstat, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPlatformOriginalDeviceLocalOperatorV1, reopenPlatformOriginalDeviceLocalOperatorV1,
  platformOriginalDeviceLocalConfigurationPathV1 } from './original-device-local-operator-v1.mjs';
async function privateFile(path, maximum) {
  const directory = dirname(path), dir = await lstat(directory);
  assert.ok(dir.isDirectory() && !dir.isSymbolicLink() && dir.uid === process.getuid()
    && (dir.mode & 0o077) === 0 && await realpath(directory) === directory, 'PLATFORM_ORIGINAL_LOCAL_PRIVATE_DIRECTORY');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); let bytes;
  try {
    const before = await handle.stat();
    assert.ok(before.isFile() && before.uid === process.getuid() && (before.mode & 0o777) === 0o600
      && before.nlink === 1 && before.size > 0 && before.size <= maximum, 'PLATFORM_ORIGINAL_LOCAL_PRIVATE_FILE');
    bytes = Buffer.alloc(maximum + 1); const count = (await handle.read(bytes, 0, bytes.length, 0)).bytesRead;
    const after = await handle.stat(), named = await lstat(path);
    for (const field of ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'])
      assert.ok(before[field] === after[field] && before[field] === named[field], 'PLATFORM_ORIGINAL_LOCAL_FILE_CHANGED');
    assert.equal(named.isSymbolicLink(), false); assert.equal(count, before.size);
    return JSON.parse(bytes.subarray(0, count).toString('utf8'));
  } finally { bytes?.fill(0); await handle.close(); }
}
async function publishDescriptor(directory, service, reopened) {
  const destination = join(directory, 'paired-descriptor.json'), value = { version: 1, profile: service.profile,
    origin: service.origin, descriptor: service.descriptor, localFakeValues: true, automaticFunding: false, cloudAuthority: false };
  if (reopened) {
    assert.deepEqual(await privateFile(destination, 16384), value, 'PLATFORM_ORIGINAL_LOCAL_ORIGINAL_DESCRIPTOR_CHANGED');
    return; // the same pairing: no descriptor replacement or refreshed grant
  }
  const handle = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  const parent = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await parent.sync(); } finally { await parent.close(); }
  assert.deepEqual(await privateFile(destination, 16384), value);
}
export function runPlatformOriginalDeviceLocalCallerV1() {
  assert.equal(arguments.length, 0); return run(false);
}
export function runPlatformRecoveredDeviceLocalCallerV1() {
  assert.equal(arguments.length, 0); return run(true);
}
async function run(reopened) {
  const entry = fileURLToPath(new URL(reopened ? './run-original-device-local-reopen-v1.mjs' : './run-original-device-local-v1.mjs', import.meta.url));
  assert.equal(process.execPath, fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node', import.meta.url)), 'PLATFORM_ORIGINAL_LOCAL_PINNED_NODE');
  assert.equal(process.argv.length, 2, 'PLATFORM_ORIGINAL_LOCAL_FIXED_ENTRY'); assert.equal(process.argv[1], entry);
  assert.equal(await realpath(entry), entry);
  assert.equal(process.env.NODE_OPTIONS, undefined); assert.equal(process.env.NODE_PATH, undefined);
  assert.deepEqual(process.execArgv, ['--max-old-space-size=384'], 'PLATFORM_ORIGINAL_LOCAL_FIXED_HEAP');
  let acquisition, service, closeRequested = false, captureRequested = false, closing;
  function close() {
    closeRequested = true; // synchronous startup/publication fence
    return closing ??= (async () => {
      if (acquisition) service = await acquisition;
      if (!service) return;
      if (captureRequested) {
        try {
          assert.equal(reopened, false, 'PLATFORM_ORIGINAL_LOCAL_REOPEN_ONE_USE');
          const result = await service.capture(); // reads fixed selector synchronously, then fences originals
          assert.ok(result.closed && result.originalResourcesStopped && result.plannedCaptureForNewProcess);
          process.stdout.write('ORIGINAL_LOCAL_DEVICE_ORDERED_CAPTURE_READY\n'); return;
        } catch (error) {
          try { await service.close(); } catch (failure) {
            throw new AggregateError([error, failure], 'PLATFORM_ORIGINAL_LOCAL_CAPTURE_CLOSE_UNCONFIRMED', { cause: error });
          }
          throw error;
        }
      }
      const result = await service.close(); assert.ok(result.closed && result.originalResourcesStopped);
    })();
  }
  const normal = () => { void close().catch(() => { process.stderr.write('PLATFORM_ORIGINAL_LOCAL_CLOSE_UNCONFIRMED\n'); process.exitCode = 1; }); };
  const capture = () => { if (!closeRequested) captureRequested = true; normal(); };
  process.once('SIGINT', normal); process.once('SIGTERM', normal); process.once('SIGUSR2', capture);
  try {
    const path = await platformOriginalDeviceLocalConfigurationPathV1(), config = await privateFile(path, 32768);
    if (!closeRequested) {
      acquisition = (reopened ? reopenPlatformOriginalDeviceLocalOperatorV1 : startPlatformOriginalDeviceLocalOperatorV1)(config);
      acquisition.catch(() => {}); config.tls = null; service = await acquisition;
      if (closeRequested) await close();
      else {
        await publishDescriptor(dirname(path), service, reopened);
        if (closeRequested) await close(); else process.stdout.write('ORIGINAL_LOCAL_DEVICE_SERVICE_READY\n');
      }
    } else config.tls = null;
  } catch {
    process.exitCode = 1;
    try { await close(); } catch { process.stderr.write('PLATFORM_ORIGINAL_LOCAL_CLOSE_UNCONFIRMED\n'); }
    process.stderr.write('PLATFORM_ORIGINAL_LOCAL_START_CAPTURE_OR_CLOSE_FAILED\n');
  }
}
