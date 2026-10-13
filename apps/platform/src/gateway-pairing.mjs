/** Local pairing is retained metadata, never economic authority. Reopening
 * verifies it again after startup and never rewrites or recreates it. */
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { lstat, realpath, open } from 'node:fs/promises';
import { join } from 'node:path';

const fields = ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'];
export async function readPrivateGatewayRecord(directory, name) {
  assert.ok(['operator.json', 'paired-descriptor.json', 'startup.json'].includes(name), 'PLATFORM_ORIGINAL_GATEWAY_FILE');
  const parent = await lstat(directory);
  assert.ok(parent.isDirectory() && !parent.isSymbolicLink() && parent.uid === process.getuid()
    && (parent.mode & 0o777) === 0o700 && await realpath(directory) === directory, 'PLATFORM_ORIGINAL_GATEWAY_PRIVATE_DIRECTORY');
  const path = join(directory, name), handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const before = await handle.stat();
    assert.ok(before.isFile() && before.nlink === 1 && before.uid === process.getuid()
      && (before.mode & 0o777) === 0o600 && before.size > 0 && before.size <= 32768, 'PLATFORM_ORIGINAL_GATEWAY_PRIVATE_FILE');
    bytes = Buffer.alloc(32769);
    const count = (await handle.read(bytes, 0, bytes.length, 0)).bytesRead;
    const after = await handle.stat(), named = await lstat(path);
    for (const field of fields) { assert.equal(before[field], after[field]); assert.equal(before[field], named[field]); }
    assert.equal(named.isSymbolicLink(), false); assert.equal(count, before.size);
    return { value: JSON.parse(bytes.subarray(0, count).toString('utf8')),
      identity: Object.fromEntries(fields.map(field => [field, before[field]])) };
  } finally { bytes?.fill(0); await handle.close(); }
}

function pairing(service) {
  return { profile: service.profile, descriptor: service.descriptor, localTransport: 'LOOPBACK_HTTP_TO_ORIGINAL_TLS',
    automaticFunding: false, durableOriginalAdmission: true, privateD26AndW39Intake: true,
    privateUOpeningIntake: true, nativeRecipientToWorkerEncrypted: true, cloudDeploymentEstablished: false };
}
export async function publishNewGatewayPair(directory, service) {
  const bytes = Buffer.from(JSON.stringify(pairing(service)) + '\n');
  const handle = await open(join(directory, 'paired-descriptor.json'), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { bytes.fill(0); await handle.close(); }
  const parent = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await parent.sync(); } finally { await parent.close(); }
}
export async function verifyRetainedGatewayPair(directory, retained, service) {
  const current = await readPrivateGatewayRecord(directory, 'paired-descriptor.json');
  assert.deepEqual(current.identity, retained.identity, 'PLATFORM_ORIGINAL_GATEWAY_PAIR_CHANGED');
  assert.deepEqual(current.value, retained.value, 'PLATFORM_ORIGINAL_GATEWAY_PAIR_CHANGED');
  assert.deepEqual(current.value, pairing(service), 'PLATFORM_ORIGINAL_GATEWAY_PAIR_MISMATCH');
  return current.value;
}
