/** V3 host-storage conformance. No native nodes, proof runs, or timings. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { canonical } from '../../../../../omnichain-product/src/privacy.mjs';

const named = module => Object.fromEntries(Object.entries(module).filter(([name]) => name !== 'default'));
const secrets = new Set(), derivations = [], events = [];
let injected;
function event(kind, path) {
  events.push({ kind, path: String(path) });
  if (injected && injected.kind === kind && injected.matches(String(path))) {
    injected = undefined; throw new Error(`TEST_INTERRUPTION_${kind}`);
  }
}
mock.module('node:crypto', { exports: { ...named(crypto),
  scryptSync(...args) { const key = crypto.scryptSync(...args); derivations.push(key); secrets.add(key); return key; },
  createHmac(algorithm, key, ...rest) { if (Buffer.isBuffer(key)) secrets.add(key); return crypto.createHmac(algorithm, key, ...rest); },
  createCipheriv(algorithm, key, ...rest) { secrets.add(key); return crypto.createCipheriv(algorithm, key, ...rest); },
} });
mock.module('node:fs/promises', { exports: { ...named(fs),
  async open(path, flags, mode) {
    event(`open:${flags}`, path);
    const handle = await fs.open(path, flags, mode);
    return { read: handle.read.bind(handle), stat: handle.stat.bind(handle),
      async writeFile(...args) { event('write', path); return handle.writeFile(...args); },
      async sync() { event('sync', path); return handle.sync(); },
      async close() { event('close', path); return handle.close(); },
    };
  },
  async rename(from, to) { event('rename', to); await fs.rename(from, to); event('renamed', to); },
} });
const { createClaimRecordStore, openClaimRecordStore, CLAIM_RECORD_STORE_LIMITS: LIMIT } = await import('./segmented-record-store.mjs');
const password = 'synthetic V3 record-store password 01234567890123456789';
async function fixture(data = { history: [], inventories: {}, profile: 'TEST_V3' }) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'claim-v3-'));
  const options = { path: join(directory, 'records'), password, identity: { role: 'operator', system: 'owned-synthetic-test' } };
  const store = await createClaimRecordStore(options, data);
  return { directory, options, store, async cleanup() { injected = undefined; store.close(); await fs.rm(directory, { recursive: true, force: true }); } };
}
async function objectFiles(f) { return (await fs.readdir(join(f.options.path, 'objects'))).filter(name => name.endsWith('.json')).sort(); }
async function objectBytes(f) {
  return new Map(await Promise.all((await objectFiles(f)).map(async name => [name, await fs.readFile(join(f.options.path, 'objects', name), 'utf8')])));
}
async function changeEnvelope(path, change) {
  const value = JSON.parse(await fs.readFile(path, 'utf8')); change(value); await fs.writeFile(path, JSON.stringify(value));
}
const isWiped = key => key.every(byte => byte === 0);

test('multi-MiB logical state reconstructs exactly while every encrypted object remains bounded and reused', async () => {
  const body = { signedWire: 'SYNTHETIC_PRIVATE_WIRE_'.repeat(9000), inventory: { total: 12345, sources: ['a', 'b'] } };
  const data = { profile: 'TEST_V3', history: Array.from({ length: 24 }, (_, index) => ({ index, body })), inventories: { identicalBody: body }, observations: [] };
  assert.ok(Buffer.byteLength(JSON.stringify(data)) > 4 * 1024 * 1024);
  const f = await fixture(data);
  try {
    const first = await f.store.read(); assert.equal(first.revision, 0); assert.deepEqual(first.data, data);
    const before = await objectBytes(f);
    for (const serialized of before.values()) {
      const envelope = JSON.parse(serialized);
      assert.ok(Buffer.byteLength(serialized) <= LIMIT.envelopeBytes);
      assert.ok(Buffer.from(envelope.ciphertext, 'base64url').length <= LIMIT.objectPlaintextBytes);
      assert.ok(!serialized.includes('SYNTHETIC_PRIVATE_WIRE'));
    }
    const storedBytes = [...before.values()].reduce((total, text) => total + Buffer.byteLength(text), 0);
    assert.ok(storedBytes < 1024 * 1024, 'repeated private body is stored once, not once per historical reference');
    const next = await f.store.update(0, current => { current.observations.push({ height: 99, adverse: true }); return current; });
    const after = await objectBytes(f);
    for (const [name, bytes] of before) assert.equal(after.get(name), bytes, 'unchanged immutable bodies are byte-for-byte reused');
    assert.ok(after.size - before.size <= 3, 'one new observation needs only its leaf and changed array/root');
    assert.notEqual(next.commitment, first.commitment);
    f.store.close(); const reopened = await openClaimRecordStore(f.options);
    try { assert.deepEqual(await reopened.read(), next); assert.equal(reopened.recovery().requiresExternalEffectReconciliation, true); }
    finally { reopened.close(); }
  } finally { await f.cleanup(); }
});

test('wide arrays/maps page structurally and preserve every field including __proto__ keys', async () => {
  const entries = Array.from({ length: 1300 }, (_, index) => [String(index).padStart(5, '0'), { quantity: index }]);
  const data = { items: entries.map(([, value]) => value), snapshots: Object.fromEntries(entries), ...JSON.parse('{"__proto__":{"safe":true}}') };
  const f = await fixture(data);
  try { assert.deepEqual((await f.store.read()).data, data); f.store.close(); const open = await openClaimRecordStore(f.options); try { assert.deepEqual((await open.read()).data, data); } finally { open.close(); } }
  finally { await f.cleanup(); }
});

test('one KDF per session, independent store salts, opaque frozen methods and best-effort key wiping', async () => {
  const before = derivations.length, startSecrets = new Set(secrets), a = await fixture(), b = await fixture();
  try {
    assert.equal(derivations.length, before + 2); assert.ok(derivations.slice(before).every(isWiped), 'master keys wiped immediately after domain derivation');
    const headerA = JSON.parse(await fs.readFile(join(a.options.path, 'header.json'))), headerB = JSON.parse(await fs.readFile(join(b.options.path, 'header.json')));
    assert.notEqual(headerA.store, headerB.store); assert.notEqual(headerA.kdf.salt, headerB.kdf.salt);
    assert.equal(Object.getPrototypeOf(a.store), null); assert.ok(Object.isFrozen(a.store)); assert.deepEqual(Object.keys(a.store), []);
    assert.deepEqual(Object.getOwnPropertyNames(a.store).sort(), ['close', 'read', 'recovery', 'toJSON', 'update']);
    assert.throws(() => JSON.stringify(a.store), /NOT_SERIALIZABLE/);
    await a.store.read(); await a.store.update(0, data => ({ ...data, secret: 'private' })); await a.store.read();
    assert.equal(derivations.length, before + 2);
    a.store.close(); const reopened = await openClaimRecordStore(a.options); assert.equal(derivations.length, before + 3); reopened.close();
    b.store.close(); assert.ok([...secrets].filter(key => !startSecrets.has(key)).every(isWiped));
    await assert.rejects(a.store.read(), /CLOSED_OR_UNCERTAIN/); assert.throws(() => a.store.recovery(), /CLOSED_OR_UNCERTAIN/);
  } finally { await a.cleanup(); await b.cleanup(); }
});

test('wrong password, identity, legacy path and existing path never adopt existing state', async () => {
  const f = await fixture();
  try {
    f.store.close();
    await assert.rejects(openClaimRecordStore({ ...f.options, password: 'wrong password' }), /authentication failed/);
    await assert.rejects(openClaimRecordStore({ ...f.options, identity: { role: 'other', system: 'owned-synthetic-test' } }), /authentication failed/);
    await assert.rejects(createClaimRecordStore(f.options, {}), error => error.code === 'VAULT_EXISTS');
    const legacyPath = join(f.directory, 'legacy.vault'); await fs.writeFile(legacyPath, '{"version":1}');
    await assert.rejects(openClaimRecordStore({ ...f.options, path: legacyPath }), /UNSAFE_DIRECTORY/);
    assert.equal(await fs.readFile(legacyPath, 'utf8'), '{"version":1}');
  } finally { await f.cleanup(); }
});

test('CAS, synchronous-only transforms, detached results, busy session and cooperative stale locks', async () => {
  const f = await fixture({ n: 0 });
  try {
    const second = await openClaimRecordStore(f.options);
    try {
      const pending = f.store.update(0, data => ({ n: data.n + 1 }));
      await assert.rejects(f.store.read(), /BUSY/); assert.throws(() => f.store.close(), /BUSY/); await pending;
      await assert.rejects(second.update(0, () => ({ n: 9 })), error => error.code === 'VAULT_CONFLICT');
      await assert.rejects(f.store.update(1, async () => ({ n: 2 })), /synchronous/);
      await assert.rejects(f.store.update(1, () => Promise.reject(Error('consumed rejection'))), /synchronous JSON/);
      await assert.rejects(f.store.update(1, () => { throw Error('transform rejected'); }), /transform rejected/);
      const read = await f.store.read(); read.data.n = 50; assert.equal((await f.store.read()).data.n, 1);
      await fs.writeFile(`${f.options.path}.lock`, JSON.stringify({ pid: 999999999, token: 'stale lock' }));
      await assert.rejects(f.store.read(), error => error.code === 'VAULT_LOCKED');
      assert.match(await fs.readFile(`${f.options.path}.lock`, 'utf8'), /stale lock/);
      await fs.unlink(`${f.options.path}.lock`); assert.equal((await f.store.read()).revision, 1);
    } finally { second.close(); }
  } finally { await f.cleanup(); }
});

test('strict canonical semantics reject dangerous or lossy input without committing', async () => {
  const invalid = [undefined, -0, 1.25, NaN, Infinity, 1n, '\ud800', new Date(), new Proxy({}, {}),
    { n: undefined }, { n: () => 1 }, { get n() { throw Error('getter invoked'); } }, Object.assign([], { extra: 1 }), new Array(2),
    Object.defineProperty({}, 'hidden', { value: 1 }), { [Symbol('x')]: 1 }];
  const cycle = {}; cycle.self = cycle; invalid.push(cycle);
  const f = await fixture({ n: 0 });
  try {
    for (const value of invalid) await assert.rejects(f.store.update(0, () => value), error => !error.message.includes('getter invoked'));
    await assert.rejects(f.store.update(0, () => ({ text: 'x'.repeat(LIMIT.objectPlaintextBytes + 1) })), /JSON_STRING/);
    await assert.rejects(f.store.update(0, () => Array.from({ length: 40 }, () => 'x'.repeat(900000))), /BYTE_LIMIT/);
    assert.deepEqual((await f.store.read()).data, { n: 0 });
    const acceptable = JSON.parse('{"array":[null,true,false,1,"unicode λ"],"__proto__":{"n":1}}');
    assert.equal(canonical((await f.store.update(0, () => acceptable)).data), canonical(acceptable));
  } finally { await f.cleanup(); }
});

for (const mode of ['missing', 'swapped', 'tampered', 'symlink', 'oversized', 'extra-field', 'wrong-kind', 'wrong-id', 'newline-iv']) {
  test(`current object ${mode} is read from disk and fails closed`, async () => {
    const f = await fixture({ n: 0, another: 'body' });
    try {
      const files = await objectFiles(f), selected = join(f.options.path, 'objects', files[0]);
      if (mode === 'missing') await fs.unlink(selected);
      else if (mode === 'swapped') await fs.copyFile(join(f.options.path, 'objects', files[1]), selected);
      else if (mode === 'symlink') { const copy = join(f.directory, 'saved'); await fs.rename(selected, copy); await fs.symlink(copy, selected); }
      else if (mode === 'oversized') await fs.writeFile(selected, 'x'.repeat(LIMIT.envelopeBytes + 1));
      else await changeEnvelope(selected, value => {
        if (mode === 'extra-field') value.extra = true;
        if (mode === 'wrong-kind') value.kind = 'commit';
        if (mode === 'wrong-id') value.id = '00'.repeat(32);
        if (mode === 'newline-iv') value.iv += '\n';
        if (mode === 'tampered') value.ciphertext = (value.ciphertext[0] === 'A' ? 'B' : 'A') + value.ciphertext.slice(1);
      });
      await assert.rejects(f.store.read()); await assert.rejects(f.store.read(), /CLOSED_OR_UNCERTAIN/);
      f.store.close(); await assert.rejects(openClaimRecordStore(f.options));
    } finally { await f.cleanup(); }
  });
}

test('cross-store same-password object substitution fails its store/identity domain', async () => {
  const a = await fixture({ n: 0 }), b = await fixture({ n: 0 });
  try {
    const aFile = (await objectFiles(a))[0], bFile = (await objectFiles(b))[0];
    await fs.copyFile(join(b.options.path, 'objects', bFile), join(a.options.path, 'objects', aFile));
    await assert.rejects(a.store.read(), /ENVELOPE_DOMAIN/);
  } finally { await a.cleanup(); await b.cleanup(); }
});

test('reopen audits retained obsolete objects although ordinary reads focus on current root', async () => {
  const f = await fixture({ old: 'historical body' });
  try {
    const before = await objectBytes(f); await f.store.update(0, () => ({ new: 'current body' }));
    const obsolete = [...before.keys()][0];
    await changeEnvelope(join(f.options.path, 'objects', obsolete), value => { value.tag = '00'.repeat(16); });
    assert.deepEqual((await f.store.read()).data, { new: 'current body' });
    f.store.close(); await assert.rejects(openClaimRecordStore(f.options), /authentication failed/);
  } finally { await f.cleanup(); }
});

const boundaries = [
  { label: 'object temporary fsync', kind: 'sync', matches: path => path.includes('/objects/') && path.includes('.tmp-'), revision: 0 },
  { label: 'object directory fsync', kind: 'sync', matches: path => path.endsWith('/objects'), revision: 0 },
  { label: 'commit temporary fsync', kind: 'sync', matches: path => path.includes('/commits/0000000001.json.tmp-'), revision: 0 },
  { label: 'commit rename', kind: 'rename', matches: path => path.endsWith('/commits/0000000001.json'), revision: 0 },
  { label: 'commit directory fsync', kind: 'sync', matches: path => path.endsWith('/commits'), revision: 1, recovered: true },
  { label: 'HEAD rename', kind: 'rename', matches: path => path.endsWith('/HEAD'), revision: 1, recovered: true },
  { label: 'HEAD renamed before directory fsync', kind: 'renamed', matches: path => path.endsWith('/HEAD'), revision: 1, recovered: true },
  { label: 'ACK rename', kind: 'rename', matches: path => path.endsWith('/ACK'), revision: 1, recovered: true },
  { label: 'ACK renamed before directory fsync', kind: 'renamed', matches: path => path.endsWith('/ACK'), revision: 1, recovered: false },
];
for (const boundary of boundaries) test(`interruption at ${boundary.label} recovers only durable complete storage`, async () => {
  const f = await fixture({ n: 0 });
  try {
    injected = boundary; await assert.rejects(f.store.update(0, () => ({ n: 1 })), /TEST_INTERRUPTION/);
    assert.equal(injected, undefined, 'fault boundary was reached');
    await assert.rejects(f.store.read(), /CLOSED_OR_UNCERTAIN/); f.store.close();
    const opened = await openClaimRecordStore(f.options);
    try {
      assert.equal((await opened.read()).revision, boundary.revision);
      assert.equal((await opened.read()).data.n, boundary.revision);
      assert.equal(opened.recovery().recoveredUnacknowledgedCommit, boundary.recovered ?? false);
      assert.equal(opened.recovery().requiresExternalEffectReconciliation, true);
      await opened.update(boundary.revision, value => ({ ...value, reconciledStorageTest: true }));
    } finally { opened.close(); }
  } finally { await f.cleanup(); }
});

test('temp fsync precedes atomic rename and parent-directory fsync; readback precedes HEAD/ACK', async () => {
  const f = await fixture({ n: 0 });
  try {
    events.length = 0; await f.store.update(0, () => ({ n: 1 }));
    const target = join(f.options.path, 'commits', '0000000001.json');
    const temporarySync = events.findIndex(item => item.kind === 'sync' && item.path.startsWith(`${target}.tmp-`));
    const commitRename = events.findIndex(item => item.kind === 'rename' && item.path === target);
    const commitDirectorySync = events.findIndex((item, index) => index > commitRename && item.kind === 'sync' && item.path === dirname(target));
    const readback = events.findIndex((item, index) => index > commitDirectorySync && item.kind === 'open:r' && item.path === target);
    const head = events.findIndex(item => item.kind === 'rename' && item.path.endsWith('/HEAD'));
    const ack = events.findIndex(item => item.kind === 'rename' && item.path.endsWith('/ACK'));
    assert.ok(temporarySync >= 0 && temporarySync < commitRename && commitRename < commitDirectorySync && commitDirectorySync < readback && readback < head && head < ack);
  } finally { await f.cleanup(); }
});

for (const mode of ['stale-head', 'missing-head', 'missing-ack', 'missing-commit', 'commit-gap', 'swapped-commit', 'bad-ack']) {
  test(`reopen refuses ${mode} instead of selecting ambiguous state`, async () => {
    const f = await fixture({ n: 0 });
    try {
      const oldHead = await fs.readFile(join(f.options.path, 'HEAD'));
      await f.store.update(0, () => ({ n: 1 })); f.store.close();
      if (mode === 'stale-head') await fs.writeFile(join(f.options.path, 'HEAD'), oldHead);
      if (mode === 'missing-head') await fs.unlink(join(f.options.path, 'HEAD'));
      if (mode === 'missing-ack') await fs.unlink(join(f.options.path, 'ACK'));
      if (mode === 'missing-commit') await fs.unlink(join(f.options.path, 'commits', '0000000001.json'));
      if (mode === 'commit-gap') await fs.rename(join(f.options.path, 'commits', '0000000001.json'), join(f.options.path, 'commits', '0000000002.json'));
      if (mode === 'swapped-commit') await fs.copyFile(join(f.options.path, 'commits', '0000000000.json'), join(f.options.path, 'commits', '0000000001.json'));
      if (mode === 'bad-ack') await changeEnvelope(join(f.options.path, 'ACK'), value => { value.tag = '00'.repeat(16); });
      await assert.rejects(openClaimRecordStore(f.options));
    } finally { await f.cleanup(); }
  });
}

test('live checkpoint detects coordinated old directory restore; new session cannot claim that guarantee', async () => {
  const f = await fixture({ n: 0 }), backup = join(f.directory, 'saved-v0');
  try {
    await fs.cp(f.options.path, backup, { recursive: true }); await f.store.update(0, () => ({ n: 1 }));
    await fs.rm(f.options.path, { recursive: true }); await fs.cp(backup, f.options.path, { recursive: true });
    await assert.rejects(f.store.read(), /ROLLBACK_OR_REPLACEMENT/); f.store.close();
    const reopened = await openClaimRecordStore(f.options);
    try { assert.equal((await reopened.read()).revision, 0); assert.equal(reopened.recovery().requiresExternalEffectReconciliation, true); }
    finally { reopened.close(); }
  } finally { await f.cleanup(); }
});

test('orphan encrypted temp is never adopted and stale lock survives failed open', async () => {
  const f = await fixture({ n: 0 });
  try {
    f.store.close(); await fs.writeFile(join(f.options.path, 'commits', `0000000001.json.tmp-${'a'.repeat(32)}`), 'uncommitted ciphertext');
    const reopened = await openClaimRecordStore(f.options); assert.equal((await reopened.read()).revision, 0); reopened.close();
    await fs.writeFile(`${f.options.path}.lock`, '{"pid":0,"token":"administrator required"}');
    await assert.rejects(openClaimRecordStore(f.options), error => error.code === 'VAULT_LOCKED');
    assert.match(await fs.readFile(`${f.options.path}.lock`, 'utf8'), /administrator required/);
    await fs.unlink(`${f.options.path}.lock`);
  } finally { await f.cleanup(); }
});

for (const rejection of ['CAS', 'transform', 'canonical']) test(`observing a newer revision before ${rejection} failure still advances rollback checkpoint`, async () => {
  const f = await fixture({ n: 0 }), backup = join(f.directory, 'saved-v0');
  try {
    await fs.cp(f.options.path, backup, { recursive: true });
    const writer = await openClaimRecordStore(f.options);
    try { await writer.update(0, () => ({ n: 1 })); } finally { writer.close(); }
    if (rejection === 'CAS') await assert.rejects(f.store.update(0, value => value), error => error.code === 'VAULT_CONFLICT');
    if (rejection === 'transform') await assert.rejects(f.store.update(1, () => { throw Error('caller failure'); }), /caller failure/);
    if (rejection === 'canonical') await assert.rejects(f.store.update(1, () => ({ bad: undefined })), /JSON_VALUE/);
    await fs.rm(f.options.path, { recursive: true }); await fs.cp(backup, f.options.path, { recursive: true });
    await assert.rejects(f.store.read(), /ROLLBACK_OR_REPLACEMENT/);
  } finally { await f.cleanup(); }
});

test('retained commit temps count toward capacity before any new object or commit is written', async () => {
  const f = await fixture({ n: 0 });
  try {
    // Files are empty uncommitted placeholders: 4095 temps plus one committed
    // manifest reach the directory cap without creating a large data fixture.
    const directory = join(f.options.path, 'commits');
    for (let index = 0; index < LIMIT.retainedCommits - 1; index++)
      await fs.writeFile(join(directory, `orphan.tmp-${index.toString(16).padStart(32, '0')}`), '');
    const before = await objectFiles(f);
    await assert.rejects(f.store.update(0, () => ({ n: 1 })), /COMMIT_LIMIT/);
    assert.deepEqual(await objectFiles(f), before);
    assert.equal((await f.store.read()).revision, 0);
  } finally { await f.cleanup(); }
});

test('root-level orphan temps have a count cap and reject new writes before mutation', async () => {
  const f = await fixture({ n: 0 });
  try {
    const count = (await fs.readdir(f.options.path)).length;
    for (let index = count; index < LIMIT.retainedRootEntries; index++)
      await fs.writeFile(join(f.options.path, `HEAD.tmp-${index.toString(16).padStart(32, '0')}`), '');
    const before = await objectFiles(f);
    await assert.rejects(f.store.update(0, () => ({ n: 1 })), /ROOT_COUNT/);
    assert.deepEqual(await objectFiles(f), before); assert.equal((await f.store.read()).revision, 0);
    f.store.close(); const opened = await openClaimRecordStore(f.options); opened.close();
  } finally { await f.cleanup(); }
});

for (const marker of ['HEAD', 'ACK']) test(`interrupted initial ${marker} publication reopens the complete first commit as uncertain storage`, async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'claim-v3-first-'));
  const options = { path: join(directory, 'records'), password, identity: { role: 'initial-crash' } };
  try {
    injected = { kind: 'rename', matches: path => path.endsWith(`/${marker}`) };
    await assert.rejects(createClaimRecordStore(options, { n: 0 }), /TEST_INTERRUPTION/);
    const store = await openClaimRecordStore(options);
    try { assert.equal((await store.read()).revision, 0); assert.equal(store.recovery().recoveredUnacknowledgedCommit, true); }
    finally { store.close(); }
  } finally { injected = undefined; await fs.rm(directory, { recursive: true, force: true }); }
});

test('recovery marker repair preflights retained ciphertext bytes before writing either marker', async () => {
  const f = await fixture({ n: 0 });
  try {
    injected = { kind: 'rename', matches: path => path.endsWith('/HEAD') };
    await assert.rejects(f.store.update(0, () => ({ n: 1 })), /TEST_INTERRUPTION/); f.store.close();
    const head = await fs.readFile(join(f.options.path, 'HEAD')), ack = await fs.readFile(join(f.options.path, 'ACK'));
    let bytes = 0;
    for (const base of [f.options.path, join(f.options.path, 'objects'), join(f.options.path, 'commits')])
      for (const name of await fs.readdir(base)) { const stat = await fs.lstat(join(base, name)); if (stat.isFile()) bytes += stat.size; }
    let remaining = LIMIT.retainedFileBytes - bytes - 1024, index = 0;
    while (remaining > 0) {
      const size = Math.min(remaining, LIMIT.envelopeBytes);
      const path = join(f.options.path, 'objects', `orphan.tmp-${(index++).toString(16).padStart(32, '0')}`);
      await fs.writeFile(path, ''); await fs.truncate(path, size); // sparse ciphertext placeholders, never adopted/read
      remaining -= size;
    }
    events.length = 0; await assert.rejects(openClaimRecordStore(f.options), /RETAINED_BYTES/);
    assert.ok(!events.some(item => item.kind === 'rename' && (item.path.endsWith('/HEAD') || item.path.endsWith('/ACK'))));
    assert.deepEqual(await fs.readFile(join(f.options.path, 'HEAD')), head); assert.deepEqual(await fs.readFile(join(f.options.path, 'ACK')), ack);
  } finally { await f.cleanup(); }
});
