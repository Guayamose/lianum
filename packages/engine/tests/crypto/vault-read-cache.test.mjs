/** Actual AEAD/KDF and filesystem. Count decryptions rather than asserting a
 * machine-dependent time threshold; no real secrets or financial state. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, unlink, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const privacyURL = new URL('../../src/crypto/privacy.mjs', import.meta.url).href;
const privacy = await import(privacyURL);
let decryptions = 0;
mock.module(privacyURL, { exports: { ...privacy, decryptJsonAsync: async (...args) => {
  decryptions++;
  return privacy.decryptJsonAsync(...args);
} } });
const { Vault } = await import('../../src/crypto/vault.mjs');

test('repeated authenticated bytes avoid repeated KDFs but still read disk, bind password and isolate returned data', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vault-cached-host-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'vault'), vault = new Vault(path), password = 'synthetic-cache-password';
  await vault.create({ nested: { value: 1 } }, password);
  const original = await readFile(path);
  const before = decryptions, first = await vault.read(password);
  first.data.nested.value = 99;
  for (let i = 0; i < 12; i++) assert.deepEqual(await vault.read(password), { revision: 0, data: { nested: { value: 1 } } });
  assert.equal(decryptions - before, 1);
  await assert.rejects(vault.read('another-synthetic-password'), /authentication/);
  assert.deepEqual(await vault.read(password), { revision: 0, data: { nested: { value: 1 } } });
  // Another writer changes bytes at the same path; the existing instance must
  // observe that change even while its previous cache is still warm.
  await new Vault(path).update(password, 0, () => ({ nested: { value: 2 } }));
  assert.deepEqual(await vault.read(password), { revision: 1, data: { nested: { value: 2 } } });
  await assert.rejects(vault.update(password, 0, () => ({ bad: true })), { code: 'VAULT_CONFLICT' });
  const altered = JSON.parse(await readFile(path, 'utf8'));
  altered.cipher.tag = '00'.repeat(16);
  await writeFile(path, JSON.stringify(altered));
  await assert.rejects(vault.read(password), /authentication/);
  await writeFile(path, original);
  assert.equal((await vault.read(password)).revision, 0, 'a rollback is read, not hidden by a cached newer revision');
  await unlink(path);
  await assert.rejects(vault.read(password), { code: 'ENOENT' });
  const target = join(directory, 'other');
  await writeFile(target, original);
  await symlink(target, path);
  await assert.rejects(vault.read(password), { code: 'VAULT_UNSAFE_PATH' });
});

test('password MAC distinguishes invalid surrogate strings from a valid replacement character', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vault-cache-password-host-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const vault = new Vault(join(directory, 'vault'));
  await vault.create({ value: 1 }, 'synthetic-\ufffd-password');
  await vault.read('synthetic-\ufffd-password');
  await assert.rejects(vault.read('synthetic-\ud800-password'));
});

test('authenticated read cache expires at 30 seconds without extending on a hit', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vault-cache-ttl-host-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const vault = new Vault(join(directory, 'vault')), password = 'synthetic-expiry-password';
  await vault.create({ value: 1 }, password);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const before = decryptions;
  await vault.read(password);
  t.mock.timers.tick(20000);
  await vault.read(password);
  t.mock.timers.tick(9999);
  await vault.read(password);
  assert.equal(decryptions - before, 1);
  t.mock.timers.tick(1);
  await vault.read(password);
  assert.equal(decryptions - before, 2, 'hits cannot slide the original expiry');
  t.mock.timers.tick(30000);
  await vault.read(password);
  assert.equal(decryptions - before, 3, 'a new authenticated read has its own bounded expiry');
});
