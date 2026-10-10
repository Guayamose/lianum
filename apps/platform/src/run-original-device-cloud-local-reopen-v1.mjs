/** Separate zero-argument ordered continuation of the same original gateway. Private infrastructure only; never an executor
 * DTO, caller-selected upstream, migrated realm or automatic funded account. */
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { open, lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reopenPlatformOriginalDeviceCloudLocalGatewayV1 } from './original-device-cloud-local-gateway-v1.mjs';
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
    automaticFunding: false, durableOriginalAdmission: true, privateD26AndW39Intake: true,
    privateUOpeningIntake: true, nativeRecipientToWorkerEncrypted: true, cloudDeploymentEstablished: false,
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
    try { if (acquisition) service = await acquisition; if(service)await service.close(); }
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
  const originalPath=join(directory,'paired-descriptor.json'),originalHandle=await open(originalPath,constants.O_RDONLY|constants.O_NOFOLLOW);let original;
  try{const stat=await originalHandle.stat();assert.ok(stat.isFile()&&stat.nlink===1&&stat.uid===process.getuid()&&(stat.mode&0o777)===0o600&&stat.size>0&&stat.size<=16384,'PLATFORM_ORIGINAL_GATEWAY_PAIR_REQUIRED');
   const bytes=Buffer.alloc(16385);try{const count=(await originalHandle.read(bytes,0,bytes.length,0)).bytesRead,after=await originalHandle.stat(),named=await lstat(originalPath);
    for(const field of ['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs'])assert.ok(stat[field]===after[field]&&stat[field]===named[field],'PLATFORM_ORIGINAL_GATEWAY_PAIR_CHANGED');
    assert.equal(named.isSymbolicLink(),false);assert.equal(count,stat.size);original=JSON.parse(bytes.subarray(0,count).toString('utf8'));
   }finally{bytes.fill(0);}}finally{await originalHandle.close();}
  assert.equal(original.profile,'ORIGINAL_DEVICE_CLOUD_LOCAL_GATEWAY_V1');assert.equal(original.descriptor.origin,config.origin);assert.equal(original.descriptor.devicePublicKey,config.devicePublicKey);
  assert.ok(process.env.DATABASE_URL, 'PLATFORM_ORIGINAL_GATEWAY_SQL_REQUIRED');
  if (!closed) {
    pool = createPlatformPool(process.env.DATABASE_URL);
    acquisition = reopenPlatformOriginalDeviceCloudLocalGatewayV1({ ...config, pool,
      privacyKey: readPlatformPrivacyKeyV1(), port: Number(configuredPort) });
    acquisition.catch(() => {}); config.tls = null;
    service = await acquisition;
    assert.deepEqual(service.descriptor,original.descriptor);assert.equal(service.originalOrderedReopen,true);assert.equal(service.readReconcileWithdrawalOnly,true);
    if (closed) await close();
    else { await publish(service); if (closed) await close(); else process.stdout.write('ORIGINAL_DEVICE_LOCAL_TRANSPORT_REOPEN_READY\n'); }
  } else config.tls = null;
} catch {
  process.exitCode = 1;
  try { await close(); } catch { process.stderr.write('PLATFORM_ORIGINAL_GATEWAY_CLOSE_UNCONFIRMED\n'); }
  process.stderr.write('PLATFORM_ORIGINAL_GATEWAY_START_FAILED\n');
}
