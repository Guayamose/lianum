import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { PrivateOperationStore, MAX_OPERATIONS, MAX_REQUESTS, MAX_FILE_BYTES } from '../../src/payments/private-operation-store.mjs';

const initial = () => ({ version: 1, revision: 0, operations: [], requests: [] });
const ioError = () => Object.assign(new Error('synthetic filesystem failure'), { code: 'EIO' });

async function setup(t) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'private-operation-store-test-'));
  t.after(async () => { await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, store: new PrivateOperationStore(join(directory, 'journal')) };
}

async function onlyCommitted(store) {
  assert.deepEqual(await fs.readdir(store.directory), ['private-operations.json']);
}

test('create, copy-isolated reads/updates, reload and terminal retention', async (t) => {
  const { store } = await setup(t);
  const created = await store.initialize();
  assert.deepEqual(created, initial());
  created.operations.push({ id: 'caller-only' });
  assert.deepEqual(await store.read(), initial());
  const operations = [{ id: 'operation-1', state: 'paid', reference: 'public-summary-only' }];
  const requests = [{ id: 'request-1', operationId: 'operation-1', action: 'execute' }];
  let transformInput;
  const committed = await store.update(0, (record) => {
    transformInput = record;
    return { ...record, operations, requests };
  });
  assert.deepEqual(committed, { version: 1, revision: 1, operations, requests });
  operations[0].state = 'caller-mutation';
  requests.length = 0;
  transformInput.revision = 999;
  committed.operations.length = 0;
  const fresh = new PrivateOperationStore(store.directory);
  const retained = await fresh.initialize();
  assert.equal(retained.revision, 1);
  assert.equal(retained.operations[0].state, 'paid');
  assert.equal(retained.requests[0].id, 'request-1');
  retained.operations[0].state = 'read-mutation';
  assert.equal((await fresh.read()).operations[0].state, 'paid');
  await onlyCommitted(store);
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(store.path)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(store.directory)).mode & 0o777, 0o700);
  }
});

test('revision CAS skips stale transforms and rejects forged or exhausted revisions', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  await store.update(0, (record) => record);
  let called = false;
  await assert.rejects(store.update(0, () => { called = true; return initial(); }), { code: 'PRIVATE_STORE_CONFLICT' });
  assert.equal(called, false);
  for (const revision of [-1, 0.2, Number.MAX_SAFE_INTEGER + 1, '1', undefined]) {
    await assert.rejects(store.update(revision, (record) => record), { code: 'PRIVATE_STORE_REVISION' });
  }
  await assert.rejects(store.update(1, (record) => ({ ...record, revision: 99 })), { code: 'PRIVATE_STORE_REVISION' });
  assert.equal((await store.read()).revision, 1);
  await fs.writeFile(store.path, JSON.stringify({ ...initial(), revision: Number.MAX_SAFE_INTEGER }));
  await assert.rejects(store.update(Number.MAX_SAFE_INTEGER, (record) => record), { code: 'PRIVATE_STORE_REVISION_LIMIT' });
  await onlyCommitted(store);
});

test('throwing, asynchronous, nonordinary and mutating invalid transforms preserve committed bytes', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  const original = await fs.readFile(store.path, 'utf8');
  let getterCalls = 0;
  const transforms = [
    (record) => { record.operations.push({ id: 'uncommitted' }); throw new Error('failure'); },
    async (record) => record,
    () => Promise.resolve(initial()),
    () => Promise.reject(new Error('consumed rejection')),
    () => undefined,
    () => ({ ...initial(), operations: [1.5] }),
    () => ({ ...initial(), operations: [NaN] }),
    () => ({ ...initial(), operations: [new Date()] }),
    () => ({ ...initial(), operations: new Array(1) }),
    () => ({ ...initial(), operations: [new Proxy({}, {})] }),
    () => ({ ...initial(), operations: [{ get value() { getterCalls++; return 'no'; } }] }),
    () => { const cycle = {}; cycle.self = cycle; return { ...initial(), operations: [cycle] }; },
  ];
  for (const transform of transforms) {
    await assert.rejects(store.update(0, transform), (error) => {
      assert.match(error.code, /^PRIVATE_STORE_/);
      assert.match(error.message, /^PRIVATE_STORE_/);
      return true;
    });
    assert.equal(await fs.readFile(store.path, 'utf8'), original);
    await onlyCommitted(store);
  }
  assert.equal(getterCalls, 0);
  assert.equal((await store.update(0, (record) => record)).revision, 1);
});

test('transform output is snapshotted before persistence yields to queued mutations', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  const committed = await store.update(0, (record) => {
    record.operations = [{ id: 'snapshot', state: 'cancelled' }];
    record.requests = [{ id: 'keep-request' }];
    queueMicrotask(() => { record.operations[0].state = 'late-mutation'; record.requests.length = 0; });
    return record;
  });
  assert.equal(committed.operations[0].state, 'cancelled');
  assert.equal(committed.requests.length, 1);
  assert.deepEqual(await store.read(), committed);
});

test('concurrent initializers never reset committed data or adopt orphan temporaries', async (t) => {
  const { store } = await setup(t);
  const results = await Promise.allSettled(Array.from({ length: 8 }, () =>
    new PrivateOperationStore(store.directory).initialize()));
  assert.ok(results.some((result) => result.status === 'fulfilled'));
  for (const rejected of results.filter((result) => result.status === 'rejected')) {
    assert.equal(rejected.reason.code, 'PRIVATE_STORE_LOCKED');
  }
  assert.deepEqual(await store.read(), initial());
  await store.update(0, (record) => ({ ...record, operations: [{ id: 'retained', state: 'cancelled' }] }));
  const orphanPath = `${store.path}.tmp-orphan-fixture`;
  const orphan = JSON.stringify({ ...initial(), revision: 99, operations: [{ id: 'orphan' }] });
  await fs.writeFile(orphanPath, orphan);
  assert.equal((await new PrivateOperationStore(store.directory).initialize()).operations[0].id, 'retained');
  assert.equal(await fs.readFile(orphanPath, 'utf8'), orphan);
});

test('concurrent cooperative writers commit exactly once at a revision', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  const results = await Promise.allSettled(Array.from({ length: 12 }, () =>
    new PrivateOperationStore(store.directory).update(0, (record) => ({ ...record, operations: [{ id: 'winner' }] }))));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  for (const rejected of results.filter((result) => result.status === 'rejected')) {
    assert.ok(['PRIVATE_STORE_LOCKED', 'PRIVATE_STORE_CONFLICT'].includes(rejected.reason.code), rejected.reason.stack);
  }
  assert.equal((await store.read()).revision, 1);
  await onlyCommitted(store);
});

test('independent Node processes respect the same exclusive lock and revision CAS', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  const moduleUrl = new URL('../../src/payments/private-operation-store.mjs', import.meta.url).href;
  const script = `import { PrivateOperationStore } from ${JSON.stringify(moduleUrl)};
    try {
      await new PrivateOperationStore(process.argv[1]).update(0, r => ({...r, operations:[{id:'winner'}]}));
      process.stdout.write('committed');
    } catch (error) { process.stdout.write(error.code || error.name); process.exitCode=2; }`;
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, store.directory], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  const results = await Promise.all([run(), run()]);
  assert.equal(results.filter((result) => result.stdout === 'committed' && result.code === 0).length, 1, JSON.stringify(results));
  assert.ok(results.some((result) => ['PRIVATE_STORE_LOCKED', 'PRIVATE_STORE_CONFLICT'].includes(result.stdout)), JSON.stringify(results));
  assert.ok(results.every((result) => result.stderr === ''), JSON.stringify(results));
  assert.equal((await store.read()).revision, 1);
  await onlyCommitted(store);
});

test('stale and malformed locks are preserved and never bypassed', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  for (const lock of ['{"version":1,"pid":-1,"token":"stale"}', 'truncated-lock']) {
    await fs.writeFile(store.lockPath, lock);
    await assert.rejects(store.initialize(), { code: 'PRIVATE_STORE_LOCKED' });
    await assert.rejects(store.update(0, (record) => record), { code: 'PRIVATE_STORE_LOCKED' });
    assert.equal(await fs.readFile(store.lockPath, 'utf8'), lock);
    assert.deepEqual(await store.read(), initial());
  }
});

test('changed lock token and replaced lock inode are preserved without committing', async (t) => {
  for (const replace of [false, true]) {
    const { store } = await setup(t);
    await store.initialize();
    const foreign = JSON.stringify({ version: 1, pid: process.pid, token: 'foreign-lock' });
    await assert.rejects(store.update(0, (record) => {
      if (replace) unlinkSync(store.lockPath);
      writeFileSync(store.lockPath, foreign);
      return { ...record, operations: [{ id: 'must-not-commit' }] };
    }), { code: 'PRIVATE_STORE_LOCK_OWNERSHIP' });
    assert.equal(await fs.readFile(store.lockPath, 'utf8'), foreign);
    assert.deepEqual(await store.read(), initial());
    assert.deepEqual((await fs.readdir(store.directory)).sort(), ['private-operations.json', 'private-operations.json.lock']);
  }
});

test('operation and idempotency limits reject entire writes without silently evicting records', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  const committed = await store.update(0, (record) => ({
    ...record,
    operations: Array.from({ length: MAX_OPERATIONS }, (_, id) => ({ id: `operation-${id}`, state: 'paid' })),
    requests: Array.from({ length: MAX_REQUESTS }, (_, id) => ({ id: `request-${id}` })),
  }));
  await assert.rejects(store.update(1, (record) => ({ ...record, operations: [...record.operations, { id: 'overflow' }] })), { code: 'PRIVATE_STORE_OPERATIONS_LIMIT' });
  await assert.rejects(store.update(1, (record) => ({ ...record, requests: [...record.requests, { id: 'overflow' }] })), { code: 'PRIVATE_STORE_REQUESTS_LIMIT' });
  assert.deepEqual(await new PrivateOperationStore(store.directory).read(), committed);
  await onlyCommitted(store);
});

test('byte limit is enforced before replacement and when reading on-disk files', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  await assert.rejects(store.update(0, (record) => ({ ...record, operations: [{ summary: 'x'.repeat(MAX_FILE_BYTES) }] })), { code: 'PRIVATE_STORE_SIZE' });
  assert.deepEqual(await store.read(), initial());
  await onlyCommitted(store);
  await fs.writeFile(store.path, ' '.repeat(MAX_FILE_BYTES + 1));
  await assert.rejects(store.read(), { code: 'PRIVATE_STORE_SIZE' });
  await assert.rejects(store.initialize(), { code: 'PRIVATE_STORE_SIZE' });
  assert.equal((await fs.stat(store.path)).size, MAX_FILE_BYTES + 1);
});

test('exact byte boundary is accepted and multibyte strings are measured as UTF-8 bytes', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  const overhead = Buffer.byteLength(JSON.stringify({ ...initial(), revision: 1, operations: [{ summary: '' }] }));
  const summary = 'x'.repeat(MAX_FILE_BYTES - overhead);
  await store.update(0, (record) => ({ ...record, operations: [{ summary }] }));
  assert.equal((await fs.stat(store.path)).size, MAX_FILE_BYTES);
  assert.equal((await new PrivateOperationStore(store.directory).read()).operations[0].summary, summary);
  await assert.rejects(store.update(1, (record) => ({ ...record, operations: [{ summary: `${summary.slice(0, -1)}é` }] })), { code: 'PRIVATE_STORE_SIZE' });
  assert.equal((await store.read()).revision, 1);
  await onlyCommitted(store);
});

test('a lock released just after exclusive-open conflict remains an ordinary lock conflict', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  const open = fs.open;
  const mock = t.mock.method(fs, 'open', async (path, ...args) => {
    if (path === store.lockPath && args[0] === 'wx') throw Object.assign(new Error('synthetic released-lock race'), { code: 'EEXIST' });
    return open(path, ...args);
  });
  try { await assert.rejects(store.update(0, (record) => record), { code: 'PRIVATE_STORE_LOCKED' }); }
  finally { mock.mock.restore(); }
  assert.deepEqual(await store.read(), initial());
  await onlyCommitted(store);
});

test('malformed, truncated, invalid root and invalid UTF-8 journals are never reset', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  const invalid = [
    '', '{"version":1', 'null', '[]', '{}',
    ...[
      { ...initial(), version: 2 }, { ...initial(), revision: -1 },
      { ...initial(), revision: 1.1 }, { ...initial(), revision: Number.MAX_SAFE_INTEGER + 1 },
      { ...initial(), operations: {} }, { ...initial(), requests: null },
      { ...initial(), extra: true }, { version: 1, revision: 0, operations: [] },
    ].map(JSON.stringify),
    Buffer.from([0xff, 0xfe]),
  ];
  for (const content of invalid) {
    await fs.writeFile(store.path, content);
    const bytes = await fs.readFile(store.path);
    await assert.rejects(store.read(), { code: 'PRIVATE_STORE_RECORD' });
    await assert.rejects(store.initialize(), { code: 'PRIVATE_STORE_RECORD' });
    assert.deepEqual(await fs.readFile(store.path), bytes);
    await onlyCommitted(store);
  }
});

test('invalid paths, symlinked directories/ancestors/targets/locks and hardlinks fail closed', async (t) => {
  for (const path of ['', null, 1, 'bad\0path']) {
    assert.throws(() => new PrivateOperationStore(path), { code: 'PRIVATE_STORE_UNSAFE_PATH' });
  }
  const { store, directory } = await setup(t);
  await store.initialize();
  const linkedDirectory = join(directory, 'linked-directory');
  await fs.symlink(store.directory, linkedDirectory, 'dir');
  await assert.rejects(new PrivateOperationStore(linkedDirectory).initialize(), { code: 'PRIVATE_STORE_UNSAFE_PATH' });
  await assert.rejects(new PrivateOperationStore(join(linkedDirectory, 'nested')).initialize(), { code: 'PRIVATE_STORE_UNSAFE_PATH' });
  const target = join(directory, 'external-within-test.json');
  const original = await fs.readFile(store.path);
  await fs.writeFile(target, original);
  await fs.unlink(store.path);
  await fs.symlink(target, store.path);
  await assert.rejects(store.read(), { code: 'PRIVATE_STORE_UNSAFE_PATH' });
  await assert.rejects(store.initialize(), { code: 'PRIVATE_STORE_UNSAFE_PATH' });
  assert.deepEqual(await fs.readFile(target), original);
  await fs.unlink(store.path);
  await fs.mkdir(store.path);
  await assert.rejects(store.read(), { code: 'PRIVATE_STORE_UNSAFE_PATH' });
  await fs.rmdir(store.path);
  await fs.link(target, store.path);
  await assert.rejects(store.read(), { code: 'PRIVATE_STORE_UNSAFE_PATH' });
  await fs.unlink(store.path);
  await fs.writeFile(store.path, original);
  await fs.symlink(target, store.lockPath);
  await assert.rejects(store.update(0, (record) => record), { code: 'PRIVATE_STORE_UNSAFE_PATH' });
  assert.equal((await fs.lstat(store.lockPath)).isSymbolicLink(), true);
  assert.deepEqual(await fs.readFile(target), original);
});

test('partial temporary write and pre-rename fsync failures preserve committed data and clean only owned files', async (t) => {
  for (const stage of ['write', 'sync']) {
    const { store } = await setup(t);
    await store.initialize();
    const original = await fs.readFile(store.path);
    const orphanPath = `${store.path}.tmp-retained-fixture`;
    await fs.writeFile(orphanPath, 'uncommitted orphan');
    const open = fs.open;
    const mock = t.mock.method(fs, 'open', async (path, ...args) => {
      const handle = await open(path, ...args);
      if (String(path).startsWith(`${store.path}.tmp-`) && path !== orphanPath) {
        if (stage === 'write') {
          const write = handle.writeFile.bind(handle);
          t.mock.method(handle, 'writeFile', async () => { await write('partial'); throw ioError(); });
        } else t.mock.method(handle, 'sync', async () => { throw ioError(); });
      }
      return handle;
    });
    try {
      await assert.rejects(store.update(0, (record) => ({ ...record, operations: [{ id: 'never-committed' }] })), { code: 'PRIVATE_STORE_IO' });
    } finally { mock.mock.restore(); }
    assert.deepEqual(await fs.readFile(store.path), original);
    assert.deepEqual(await new PrivateOperationStore(store.directory).read(), initial());
    assert.equal(await fs.readFile(orphanPath, 'utf8'), 'uncommitted orphan');
    assert.deepEqual((await fs.readdir(store.directory)).sort(), ['private-operations.json', 'private-operations.json.tmp-retained-fixture']);
    assert.equal((await store.update(0, (record) => record)).revision, 1);
  }
});

test('failed lock initialization releases its own incomplete lock without changing the journal', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  const open = fs.open;
  const mock = t.mock.method(fs, 'open', async (path, ...args) => {
    const handle = await open(path, ...args);
    if (path === store.lockPath && args[0] === 'wx') {
      const write = handle.writeFile.bind(handle);
      t.mock.method(handle, 'writeFile', async () => { await write('partial-lock'); throw ioError(); });
    }
    return handle;
  });
  try { await assert.rejects(store.update(0, (record) => record), { code: 'PRIVATE_STORE_IO' }); }
  finally { mock.mock.restore(); }
  assert.deepEqual(await store.read(), initial());
  await onlyCommitted(store);
});

test('rename failure is explicitly uncertain and never adopts the temporary state', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  const mock = t.mock.method(fs, 'rename', async () => { throw ioError(); });
  try {
    await assert.rejects(store.update(0, (record) => ({ ...record, operations: [{ id: 'uncommitted' }] })), { code: 'PRIVATE_STORE_WRITE_UNCERTAIN' });
  } finally { mock.mock.restore(); }
  assert.deepEqual(await store.read(), initial());
  await onlyCommitted(store);
});

test('rename-success-then-error exposes uncertainty and fresh reads reveal committed revision', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  const rename = fs.rename;
  const mock = t.mock.method(fs, 'rename', async (...args) => { await rename(...args); throw ioError(); });
  try {
    await assert.rejects(store.update(0, (record) => ({ ...record, operations: [{ id: 'committed' }] })), { code: 'PRIVATE_STORE_WRITE_UNCERTAIN' });
  } finally { mock.mock.restore(); }
  assert.equal((await new PrivateOperationStore(store.directory).read()).operations[0].id, 'committed');
  assert.equal((await store.read()).revision, 1);
  await onlyCommitted(store);
});

test('post-rename directory fsync failure exposes uncertainty without hiding the committed record', { skip: process.platform === 'win32' }, async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  const open = fs.open;
  const mock = t.mock.method(fs, 'open', async (path, ...args) => {
    const handle = await open(path, ...args);
    if (path === store.directory) t.mock.method(handle, 'sync', async () => { throw ioError(); });
    return handle;
  });
  try {
    await assert.rejects(store.update(0, (record) => ({ ...record, operations: [{ id: 'committed' }] })), { code: 'PRIVATE_STORE_WRITE_UNCERTAIN' });
  } finally { mock.mock.restore(); }
  const retained = await new PrivateOperationStore(store.directory).read();
  assert.equal(retained.revision, 1);
  assert.equal(retained.operations[0].id, 'committed');
  await onlyCommitted(store);
});

test('post-rename lock cleanup failure exposes uncertainty and preserves the fail-closed lock', async (t) => {
  const { store } = await setup(t);
  await store.initialize();
  const unlink = fs.unlink;
  const mock = t.mock.method(fs, 'unlink', async (path) => {
    if (path === store.lockPath) throw ioError();
    return unlink(path);
  });
  try {
    await assert.rejects(store.update(0, (record) => ({ ...record, requests: [{ id: 'retained' }] })), { code: 'PRIVATE_STORE_WRITE_UNCERTAIN' });
  } finally { mock.mock.restore(); }
  assert.equal((await new PrivateOperationStore(store.directory).read()).requests[0].id, 'retained');
  await assert.rejects(store.update(1, (record) => record), { code: 'PRIVATE_STORE_LOCKED' });
  assert.equal((await fs.lstat(store.lockPath)).isFile(), true);
});
