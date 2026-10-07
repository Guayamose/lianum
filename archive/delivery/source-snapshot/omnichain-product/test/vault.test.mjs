import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Vault } from '../src/vault.mjs';
import { encryptJson } from '../src/privacy.mjs';

const password = 'synthetic-vault-test-password';

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'paeg-vault-test-'));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const path = join(directory, 'synthetic.vault.json');
  return { directory, path, vault: new Vault(path) };
}

test('vault encrypts data at rest, preserves revisions and rejects duplicate create', async (t) => {
  const { vault, path, directory } = await setup(t);
  const initial = { marker: 'PRIVATE_SYNTHETIC_STRATEGY_739', available: '1000', reserved: '0' };
  assert.deepEqual(await vault.create(initial, password), { revision: 0, data: initial });
  assert.deepEqual(await vault.read(password), { revision: 0, data: initial });
  assert.equal((await readFile(path, 'utf8')).includes(initial.marker), false);
  await assert.rejects(vault.create({ overwrite: true }, password), { code: 'VAULT_EXISTS' });
  const updated = await vault.update(password, 0, (data) => ({ ...data, available: '700', reserved: '300' }));
  assert.equal(updated.revision, 1);
  assert.equal(updated.data.reserved, '300');
  assert.deepEqual(await new Vault(path).read(password), updated);
  assert.deepEqual(await readdir(directory), ['synthetic.vault.json']);
});

test('revision CAS prevents stale writes and skips their transform', async (t) => {
  const { vault } = await setup(t);
  await vault.create({ n: 0 }, password);
  await vault.update(password, 0, (data) => ({ n: data.n + 1 }));
  let called = false;
  await assert.rejects(vault.update(password, 0, () => { called = true; return { n: 99 }; }), { code: 'VAULT_CONFLICT' });
  assert.equal(called, false);
  assert.deepEqual(await vault.read(password), { revision: 1, data: { n: 1 } });
  for (const revision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
    await assert.rejects(vault.update(password, revision, () => ({})), /revision/);
  }
});

test('concurrent cooperative writers admit exactly one update at a revision', async (t) => {
  const { vault, path, directory } = await setup(t);
  await vault.create({ count: 0 }, password);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () =>
    new Vault(path).update(password, 0, (data) => ({ count: data.count + 1 }))));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  for (const result of results.filter((result) => result.status === 'rejected')) {
    assert.ok(['VAULT_LOCKED', 'VAULT_CONFLICT'].includes(result.reason.code));
  }
  assert.deepEqual(await vault.read(password), { revision: 1, data: { count: 1 } });
  assert.deepEqual(await readdir(directory), ['synthetic.vault.json']);
});

test('exclusive lock serializes writers across independent Node processes', async (t) => {
  const { vault, path } = await setup(t);
  await vault.create({ count: 0 }, password);
  const moduleUrl = new URL('../src/vault.mjs', import.meta.url).href;
  const script = `import { Vault } from ${JSON.stringify(moduleUrl)};
    try {
      await new Vault(process.argv[1]).update(process.argv[2], 0, d => ({count:d.count+1}));
      process.stdout.write('committed');
    } catch (error) { process.stdout.write(error.code || error.name); process.exitCode=2; }`;
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, path, password], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: fileURLToPath(new URL('..', import.meta.url)),
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  const results = await Promise.all([run(), run()]);
  assert.equal(results.filter((r) => r.code === 0 && r.stdout === 'committed').length, 1, JSON.stringify(results));
  const rejected = results.find((r) => r.code !== 0);
  assert.ok(['VAULT_LOCKED', 'VAULT_CONFLICT'].includes(rejected.stdout), JSON.stringify(results));
  assert.equal(results.every((r) => r.stderr === ''), true);
  assert.deepEqual(await vault.read(password), { revision: 1, data: { count: 1 } });
});

test('wrong password, ciphertext tampering and invalid encrypted records fail closed', async (t) => {
  const { vault, path, directory } = await setup(t);
  await vault.create({ marker: 'SECRET_ONLY_IN_MEMORY' }, password);
  const original = await readFile(path, 'utf8');
  await assert.rejects(vault.read('wrong-synthetic-password'), /authentication/);
  await assert.rejects(vault.update('wrong-synthetic-password', 0, () => ({})), /authentication/);
  assert.deepEqual(await readdir(directory), ['synthetic.vault.json']);
  const tampered = JSON.parse(original);
  tampered.cipher.tag = '00'.repeat(16);
  await writeFile(path, JSON.stringify(tampered));
  await assert.rejects(vault.read(password), /authentication/);
  for (const invalid of [{ revision: -1, data: {} }, { revision: 0 }, { revision: 0, data: {}, extra: true }, []]) {
    await writeFile(path, JSON.stringify(encryptJson(invalid, password)));
    await assert.rejects(vault.read(password), { code: 'VAULT_RECORD' });
  }
  await writeFile(path, original);
  assert.equal((await vault.read(password)).data.marker, 'SECRET_ONLY_IN_MEMORY');
});

test('throwing, async and invalid transforms leave ciphertext/revision intact and release lock', async (t) => {
  const { vault, path, directory } = await setup(t);
  await vault.create({ count: 0 }, password);
  const before = await readFile(path, 'utf8');
  const transforms = [
    () => { throw new Error('synthetic transform failure'); },
    async () => ({ count: 1 }),
    () => Promise.resolve({ count: 1 }),
    () => Promise.reject(new Error('synthetic promise failure')),
    () => undefined,
    () => ({ bad: 1.2 }),
  ];
  for (const transform of transforms) {
    await assert.rejects(vault.update(password, 0, transform));
    assert.equal(await readFile(path, 'utf8'), before);
    assert.deepEqual(await readdir(directory), ['synthetic.vault.json']);
  }
  assert.equal((await vault.update(password, 0, () => ({ count: 1 }))).revision, 1);
});

test('stale crash lock fails closed and orphan encrypted temporary file is never adopted', async (t) => {
  const { vault, path, directory } = await setup(t);
  await vault.create({ committed: true }, password);
  const staleLock = `${path}.lock`;
  const orphan = `${path}.tmp-crash-fixture`;
  await writeFile(staleLock, JSON.stringify({ version: 1, pid: -1, token: 'stale-fixture' }));
  await writeFile(orphan, JSON.stringify(encryptJson({ revision: 9, data: { uncommitted: true } }, password)));
  await assert.rejects(vault.update(password, 0, () => ({})), { code: 'VAULT_LOCKED' });
  assert.deepEqual(await vault.read(password), { revision: 0, data: { committed: true } });
  assert.equal((await readdir(directory)).length, 3);
  // This test owns every writer and simulates explicit administrative recovery;
  // the Vault API never decides that an old PID or timestamp authorizes removal.
  await unlink(staleLock);
  assert.equal((await vault.update(password, 0, (data) => data)).revision, 1);
  assert.equal((await readFile(orphan, 'utf8')).includes('uncommitted'), false);
});

test('actual process termination during update preserves committed data and leaves a fail-closed lock', async (t) => {
  const { vault, path, directory } = await setup(t);
  await vault.create({ committed: 'before-process-termination' }, password);
  const moduleUrl = new URL('../src/vault.mjs', import.meta.url).href;
  const script = `import { Vault } from ${JSON.stringify(moduleUrl)};
    await new Vault(process.argv[1]).update(process.argv[2], 0, () => {
      process.kill(process.pid, 'SIGTERM');
      throw new Error('unreachable');
    });`;
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, path, password], {
      windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stderr }));
  });
  assert.ok(exit.code !== 0 || exit.signal === 'SIGTERM', JSON.stringify(exit));
  assert.deepEqual((await readdir(directory)).sort(), ['synthetic.vault.json', 'synthetic.vault.json.lock']);
  assert.deepEqual(await vault.read(password), { revision: 0, data: { committed: 'before-process-termination' } });
  await assert.rejects(vault.update(password, 0, () => ({})), { code: 'VAULT_LOCKED' });
});

test('oversized or non-file targets are rejected without loading arbitrary data', async (t) => {
  const { vault, path } = await setup(t);
  await writeFile(path, 'x'.repeat(2 * 1024 * 1024 + 1));
  await assert.rejects(vault.read(password), { code: 'VAULT_SIZE' });
  await unlink(path);
  await mkdir(path);
  await assert.rejects(vault.read(password), { code: 'VAULT_UNSAFE_PATH' });
  await assert.rejects(vault.create({}, password), { code: 'VAULT_EXISTS' });
});

test('failed replacement cleans this operation temporary file and lock', async (t) => {
  const { vault, directory } = await setup(t);
  await vault.create({ count: 0 }, password);
  // Controlled fault injection below the crypto/write boundary. No real funds,
  // production filesystem or externally supplied path is involved.
  const previous = Vault.prototype._write;
  Vault.prototype._write = async function (record, pass) {
    const target = this.path;
    await unlink(target);
    await mkdir(target);
    return previous.call(this, record, pass);
  };
  try {
    await assert.rejects(vault.update(password, 0, () => ({ count: 1 })));
    assert.deepEqual(await readdir(directory), ['synthetic.vault.json']);
  } finally { Vault.prototype._write = previous; }
});

test('authenticated old snapshots demonstrate the documented absence of rollback resistance', async (t) => {
  const { vault, path } = await setup(t);
  await vault.create({ count: 0 }, password);
  const old = await readFile(path);
  await vault.update(password, 0, () => ({ count: 1 }));
  await writeFile(path, old);
  // Authentication alone cannot detect a filesystem admin restoring old bytes.
  assert.deepEqual(await vault.read(password), { revision: 0, data: { count: 0 } });
});
