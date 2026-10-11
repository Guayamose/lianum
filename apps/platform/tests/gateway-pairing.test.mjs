import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat, writeFile, rename, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishNewGatewayPair, readPrivateGatewayRecord, verifyRetainedGatewayPair } from '../src/gateway-pairing.mjs';

const service = Object.freeze({ profile: 'ORIGINAL_DEVICE_CLOUD_LOCAL_GATEWAY_V1',
  descriptor: Object.freeze({ origin: 'https://wallet.test', devicePublicKey: 'test-public-only' }) });
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'lianum-gateway-pair-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
test('ordered reopen preserves the required descriptor instead of failing EEXIST or replacing it', async t => {
  const directory = await fixture(t), path = join(directory, 'paired-descriptor.json');
  await publishNewGatewayPair(directory, service);
  const retained = await readPrivateGatewayRecord(directory, 'paired-descriptor.json');
  const before = await stat(path), bytes = await readFile(path);
  await verifyRetainedGatewayPair(directory, retained, service);
  await verifyRetainedGatewayPair(directory, retained, service);
  const after = await stat(path);
  for (const key of ['ino', 'size', 'mtimeMs', 'ctimeMs', 'mode']) assert.equal(before[key], after[key]);
  assert.deepEqual(await readFile(path), bytes);
  // NEW mode must still reject an existing original pairing.
  await assert.rejects(publishNewGatewayPair(directory, service), { code: 'EEXIST' });
});
test('reopen rejects changed descriptors, matching-byte replacement and symbolic aliases', async t => {
  const directory = await fixture(t), path = join(directory, 'paired-descriptor.json');
  await publishNewGatewayPair(directory, service);
  const retained = await readPrivateGatewayRecord(directory, 'paired-descriptor.json');
  await assert.rejects(verifyRetainedGatewayPair(directory, retained, { ...service, descriptor: { ...service.descriptor, origin: 'https://other.test' } }), /PAIR_MISMATCH/);
  const bytes = await readFile(path), replacement = join(directory, 'replacement.json');
  await writeFile(replacement, bytes, { mode: 0o600 }); await rename(replacement, path);
  await assert.rejects(verifyRetainedGatewayPair(directory, retained, service), /PAIR_CHANGED/);
  await rename(path, replacement); await symlink(replacement, path);
  await assert.rejects(readPrivateGatewayRecord(directory, 'paired-descriptor.json'));
  assert.deepEqual(await readFile(replacement), bytes);
});
test('private metadata requires the existing owner and restricted directory and file modes', async t => {
  const directory = await fixture(t), publicDirectory = join(directory, 'public');
  await mkdir(publicDirectory, { mode: 0o755 });
  await assert.rejects(readPrivateGatewayRecord(publicDirectory, 'operator.json'), /PRIVATE_DIRECTORY/);
  await writeFile(join(directory, 'operator.json'), '{}\n', { mode: 0o644 });
  await assert.rejects(readPrivateGatewayRecord(directory, 'operator.json'), /PRIVATE_FILE/);
  await assert.rejects(readPrivateGatewayRecord(directory, '../outside'), /GATEWAY_FILE/);
});
