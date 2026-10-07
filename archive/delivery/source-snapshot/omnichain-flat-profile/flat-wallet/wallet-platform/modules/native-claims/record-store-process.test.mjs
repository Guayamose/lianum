/** Real storage-worker replacement; synthetic records, no chain authorities. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';
let failNextSpawn = false, forkCalls = 0;
mock.module('node:child_process', { exports: {
  ...Object.fromEntries(Object.entries(childProcess).filter(([name]) => name !== 'default')),
  fork(...args) {
    forkCalls++;
    if (!failNextSpawn) return childProcess.fork(...args);
    failNextSpawn = false;
    const child = new EventEmitter();
    child.kill = () => false;
    child.send = () => {};
    // Node permits spawn error -> close with no exit event. Production must
    // reject and finish cleanup for exactly this lifecycle too.
    queueMicrotask(() => { child.emit('error', Object.assign(Error('test spawn failure'), { code: 'EAGAIN' })); child.emit('close', -1, null); });
    return child;
  },
} });
const { startClaimRecordStoreProcess } = await import('./record-store-process.mjs');

const password = 'synthetic private storage worker test password';
async function fixture(work) {
  const directory = await mkdtemp(join(tmpdir(), 'claim-worker-'));
  const options = { path: join(directory, 'journal.v3'), password,
    identity: { profile: 'SYNTHETIC_PROCESS_TEST', genesis: '11'.repeat(32) } };
  const children = [];
  const start = async (mode, initialData) => {
    const child = await startClaimRecordStoreProcess({ mode, options,
      ...(mode === 'create' ? { initialData } : {}) });
    children.push(child); return child;
  };
  try { await work({ start, options }); }
  finally { for (const child of children) await child.close(); await rm(directory, { recursive: true, force: true }); }
}

test('a new OS process reopens the exact acknowledged large record and requires reconciliation', () => fixture(async ({ start }) => {
  const body = 'synthetic-proof-material-'.repeat(5000);
  const initial = { deposits: Array.from({ length: 16 }, (_, index) => ({ index, body })), effects: [] };
  const first = await start('create', initial), firstPID = first.status().processId;
  assert.equal((await first.recovery()).requiresExternalEffectReconciliation, false);
  const record = await first.read();
  const committed = await first.update(record.revision, { ...record.data, effects: [{ originalId: 'only-effect', state: 'UNKNOWN' }] });
  await first.close(); assert.equal(first.status().available, false);
  const next = await start('open');
  assert.notEqual(next.status().processId, firstPID);
  assert.deepEqual(await next.read(), committed);
  const recovery = await next.recovery();
  assert.equal(recovery.openedFromDisk, true);
  assert.equal(recovery.requiresExternalEffectReconciliation, true);
  assert.equal(recovery.nativeNodeRestart, false);
}));

test('unexpected idle worker exit preserves the committed record without fabricating a completed effect', () => fixture(async ({ start }) => {
  const first = await start('create', { admission: { state: 'RUNNING', originalId: 'retained-wire' } });
  const committed = await first.read();
  // This exact PID belongs to this test's child. No process discovery or broad
  // signal is used, and no write/lock is active when the child is stopped.
  process.kill(first.status().processId, 'SIGKILL');
  await first.close();
  const next = await start('open');
  assert.deepEqual(await next.read(), committed);
  assert.equal((await next.read()).data.admission.state, 'RUNNING');
}));

test('a stale CAS poisons the process facade and a fresh worker preserves newer durable data', () => fixture(async ({ start }) => {
  const first = await start('create', { original: 1 });
  const before = await first.read(); const after = await first.update(before.revision, { original: 2 });
  await assert.rejects(first.update(before.revision, { original: 3 }), /VAULT_CONFLICT/);
  assert.equal(first.status().uncertain, true); await first.close();
  const next = await start('open'); assert.deepEqual(await next.read(), after);
}));

test('the worker does not reopen under a substituted identity', () => fixture(async ({ start, options }) => {
  const first = await start('create', { retained: 'private-history' }); await first.close();
  await assert.rejects(startClaimRecordStoreProcess({ mode: 'open',
    options: { ...options, identity: { ...options.identity, genesis: '22'.repeat(32) } } }), /CLAIM_STORE_/);
  const next = await start('open'); assert.equal((await next.read()).data.retained, 'private-history');
}));

test('startup rejects noncanonical input before spawning without invoking getters or toJSON', () => fixture(async ({ options }) => {
  let getters = 0, serializers = 0, proxyTraps = 0;
  const getter = Object.defineProperty({}, 'value', { enumerable: true, get() { getters++; return 1; } });
  const serializer = { toJSON() { serializers++; return { normalized: true }; } };
  const proxy = new Proxy({}, { ownKeys() { proxyTraps++; return []; }, get() { proxyTraps++; return 1; } });
  const invalid = [NaN, Infinity, -0, undefined, { lost: undefined }, [undefined], new Array(1), getter, serializer, proxy, new Date(), 1n];
  const before = forkCalls;
  for (const value of invalid) {
    await assert.rejects(startClaimRecordStoreProcess({ mode: 'create', options, initialData: value }), /CLAIM_STORE_IPC_JSON_/);
    await assert.rejects(startClaimRecordStoreProcess({ mode: 'open', options: { ...options, identity: value } }), /CLAIM_STORE_IPC_JSON_/);
  }
  const startupGetter = { mode: 'create', options, get initialData() { getters++; return {}; } };
  await assert.rejects(startClaimRecordStoreProcess(startupGetter), /CLAIM_STORE_IPC_JSON_PROPERTY/);
  await assert.rejects(startClaimRecordStoreProcess(new Proxy({}, { ownKeys() { proxyTraps++; return []; } })), /CLAIM_STORE_IPC_JSON_VALUE/);
  assert.equal(forkCalls, before); assert.equal(getters, 0); assert.equal(serializers, 0); assert.equal(proxyTraps, 0);
}));

test('invalid updates fail before IPC and leave the real worker and acknowledged state usable', () => fixture(async ({ start }) => {
  const child = await start('create', { retained: 'unchanged', nested: { n: 1 } });
  const before = await child.read(); let getters = 0, serializers = 0;
  const cycle = {}; cycle.self = cycle;
  const invalid = [NaN, Infinity, -Infinity, -0, 1.25, undefined, '\ud800', { lost: undefined }, [undefined], new Array(1),
    new Date(), 1n, cycle, new Proxy({}, {}), { [Symbol('secret')]: 1 }, Object.assign([], { extra: 1 }),
    Object.defineProperty({}, 'hidden', { value: 1 }),
    { get secret() { getters++; return 1; } }, { toJSON() { serializers++; return { changed: true }; } }];
  for (const data of invalid) assert.throws(() => child.update(before.revision, data), /CLAIM_STORE_IPC_JSON_/);
  assert.equal(getters, 0); assert.equal(serializers, 0);
  assert.equal(child.status().available, true); assert.equal(child.status().uncertain, false);
  assert.deepEqual(await child.read(), before);
  assert.equal((await child.update(before.revision, { retained: 'valid after rejections' })).revision, before.revision + 1);
}));

test('logical and identity byte/node/depth limits apply before JSON IPC framing', () => fixture(async ({ start, options }) => {
  const before = forkCalls;
  await assert.rejects(startClaimRecordStoreProcess({ mode: 'open', options: { ...options, identity: 'i'.repeat(70 * 1024) } }), /CLAIM_STORE_IPC_SIZE/);
  await assert.rejects(startClaimRecordStoreProcess({ mode: 'open', options: { ...options, identity: Array(4096).fill(null) } }), /CLAIM_STORE_IPC_JSON_COMPLEXITY/);
  assert.equal(forkCalls, before);
  const child = await start('create', { preserved: true });
  assert.throws(() => child.update(0, Array(500_000).fill(null)), /CLAIM_STORE_IPC_JSON_COMPLEXITY/);
  assert.throws(() => child.update(0, Array(40).fill('x'.repeat(900_000))), /CLAIM_STORE_IPC_SIZE/);
  let deep = null; for (let index = 0; index < 65; index++) deep = { child: deep };
  assert.throws(() => child.update(0, deep), /CLAIM_STORE_IPC_JSON_COMPLEXITY/);
  assert.deepEqual((await child.read()).data, { preserved: true });
}));

test('canonical capture keeps detached values and ordinary __proto__ fields across private IPC', () => fixture(async ({ start }) => {
  const initial = JSON.parse('{"__proto__":{"safe":true},"nested":{"n":1}}');
  const starting = start('create', initial); initial.nested.n = 999;
  const child = await starting; assert.equal((await child.read()).data.nested.n, 1);
  const next = Object.create(null); next.__proto__ = { safe: true }; next.nested = { n: 2 };
  const updating = child.update(0, next); next.nested.n = 888;
  const committed = await updating;
  assert.deepEqual(committed.data, JSON.parse('{"__proto__":{"safe":true},"nested":{"n":2}}'));
  assert.deepEqual(await child.read(), committed);
}));

test('spawn error followed by close without exit rejects startup and finishes cleanup', { timeout: 5000 }, () => fixture(async ({ options }) => {
  failNextSpawn = true;
  await assert.rejects(startClaimRecordStoreProcess({ mode: 'create', options, initialData: {} }), /CLAIM_STORE_WORKER_SPAWN_FAILED/);
  assert.equal(failNextSpawn, false);
}));

test('invalid expected revisions do not consume an IPC sequence or poison the next valid request', () => fixture(async ({ start }) => {
  const child = await start('create', { n: 0 });
  for (const revision of [undefined, NaN, Infinity, -0, -1, 1.5, '0', {}, new Proxy({}, {})])
    assert.throws(() => child.update(revision, { n: 1 }), /CLAIM_STORE_EXPECTED_REVISION/);
  assert.equal(child.status().available, true); assert.equal((await child.read()).revision, 0);
  assert.equal((await child.update(0, { n: 1 })).revision, 1);
  assert.deepEqual((await child.read()).data, { n: 1 });
}));

test('concurrent close callers all await the real storage child exit', () => fixture(async ({ start }) => {
  const child = await start('create', { retained: 'close lifecycle' }), pid = child.status().processId;
  assert.equal(child.status().exited, false);
  const first = child.close(), second = child.close();
  assert.equal(first, second, 'concurrent stop callers share one close operation');
  await second;
  assert.equal(child.status().exited, true); assert.equal(child.status().available, false);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  assert.deepEqual(await first, await child.close());
}));
