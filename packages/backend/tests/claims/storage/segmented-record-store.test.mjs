/** V3 host-storage conformance. No native nodes, proof runs, or timings. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { canonical } from '../../../../engine/src/crypto/privacy.mjs';

const named = module => Object.fromEntries(Object.entries(module).filter(([name]) => name !== 'default'));
const secrets = new Set(), derivations = [], events = [];
let injected, metadataProbe, ciphertextProbe;
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
  async lstat(path, ...args) {
    event('lstat', path);
    const probe = metadataProbe, name = String(path);
    if (!probe || !name.startsWith(probe.path + '/') || !name.includes('/objects/') && !name.includes('/commits/'))
      return fs.lstat(path, ...args);
    probe.active++; probe.calls++; probe.peak = Math.max(probe.peak, probe.active);
    if (probe.active === 8) probe.started.resolve();
    try {
      if (probe.fail === name) { probe.fail = null; throw Error('HOST_METADATA_READ_FAILURE'); }
      await probe.gate.promise; return await fs.lstat(path, ...args);
    } finally { probe.active--; }
  },
  async open(path, flags, mode) {
    event(`open:${flags}`, path);
    const handle = await fs.open(path, flags, mode);
    const probe = ciphertextProbe, name = String(path);
    const object = probe && flags === 'r' && name.startsWith(probe.path + '/objects/');
    const visit = object ? (probe.counts.get(name) ?? 0) + 1 : 0;
    if (object) probe.counts.set(name, visit);
    let active = false, rootMutation = false;
    return { async read(...args) {
        if (object && visit === 2 && name === probe.root && !rootMutation) {
          rootMutation = true; await probe.mutateRoot?.();
        }
        if (object && (probe.firstPass ? visit === 1 : visit > 1) && name !== probe.root && !active) {
          active = true; probe.active++; probe.admitted++; probe.peak = Math.max(probe.peak, probe.active);
          if (probe.admitted === 8) probe.started.resolve();
          if (name === probe.fail || probe.failOnAdmission === probe.admitted) { probe.failed = true; throw probe.ioError; }
          await probe.gate.promise;
        }
        return handle.read(...args);
      }, stat: handle.stat.bind(handle),
      async writeFile(...args) { event('write', path); return handle.writeFile(...args); },
      async sync() { event('sync', path); return handle.sync(); },
      async close() {
        event('close', path);
        try { return await handle.close(); } finally { if (active) { active = false; probe.active--; } }
      },
    };
  },
  async rename(from, to) { event('rename', to); await fs.rename(from, to); event('renamed', to); },
} });
const { createClaimRecordStore, openClaimRecordStore, CLAIM_RECORD_STORE_LIMITS: LIMIT } = await import('../../../src/claims/storage/segmented-record-store.mjs');
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


// Exercise the real encrypted store and original CAS/lock/readback path. The
// ports delay only metadata IO; no state, plaintext, key or clock is fabricated.
test('fresh bounded scan IO preserves complete ciphertext reads, commitments and original CAS', async () => {
  const f = await fixture({ n: 0, retained: 'same-original-body' }); let other;
  try {
    for (let n = 1; n <= 9; n++) await f.store.update(n - 1, data => ({ ...data, n }));
    const expected = await f.store.read();
    const probe = { path: f.options.path, active: 0, calls: 0, peak: 0,
      started: Promise.withResolvers(), gate: Promise.withResolvers() }; metadataProbe = probe;
    const pending = f.store.read(); await probe.started.promise;
    assert.equal(probe.active, 8); assert.equal(probe.peak, 8);
    assert.ok((await fs.lstat(f.options.path + '.lock')).isFile(), 'original cooperative lock remains held while IO is pending');
    probe.gate.resolve(); assert.deepEqual(await pending, expected); assert.equal(probe.active, 0);
    const firstCalls = probe.calls; assert.ok(firstCalls > 8);
    events.length = 0; assert.deepEqual(await f.store.read(), expected);
    assert.equal(probe.calls, firstCalls * 2, 'every layout entry is read fresh again');
    assert.equal(probe.peak, 8);
    const commitReads = events.filter(row => row.kind === 'open:r' && row.path.includes('/commits/') && row.path.endsWith('.json'));
    assert.equal(commitReads.length, 10, 'all original revisions are freshly authenticated');
    metadataProbe = null;
    other = await openClaimRecordStore(f.options);
    const next = await other.update(9, data => ({ ...data, n: 10 }));
    await assert.rejects(f.store.update(9, () => ({ n: 999 })), error => error.code === 'VAULT_CONFLICT');
    assert.deepEqual(await f.store.read(), next); assert.notEqual(next.commitment, expected.commitment);
    other.close(); other = null;
    // Genuine ciphertext tampering after a successful scan remains adverse;
    // the prior authenticated record/commitment never becomes a read cache.
    const commit = join(f.options.path, 'commits', '0000000010.json');
    await changeEnvelope(commit, value => { value.tag = '00'.repeat(16); });
    await assert.rejects(f.store.read(), error => error.code === 'CLAIM_STORE_AUTHENTICATION');
    await assert.rejects(f.store.read(), error => error.code === 'CLAIM_STORE_CLOSED_OR_UNCERTAIN');
  } finally { metadataProbe = null; other?.close(); await f.cleanup(); }
});

test('failed fresh scan drains admitted IO before releasing the original lock and poisons reads', async () => {
  const f = await fixture({ n: 0, body: 'synthetic original' });
  try {
    for (let n = 1; n <= 3; n++) await f.store.update(n - 1, data => ({ ...data, n }));
    const files = await objectFiles(f);
    const probe = { path: f.options.path, active: 0, calls: 0, peak: 0,
      fail: join(f.options.path, 'objects', files[0]), started: Promise.withResolvers(), gate: Promise.withResolvers() };
    metadataProbe = probe; events.length = 0;
    let settled = false;
    const pending = f.store.read(); pending.then(() => { settled = true; }, () => { settled = true; });
    await probe.started.promise;
    assert.equal(settled, false); assert.equal(probe.active, 8); assert.equal(probe.peak, 8);
    assert.ok((await fs.lstat(f.options.path + '.lock')).isFile());
    probe.gate.resolve(); await assert.rejects(pending, /HOST_METADATA_READ_FAILURE/);
    assert.equal(probe.active, 0); assert.equal(probe.peak, 8);
    await assert.rejects(fs.lstat(f.options.path + '.lock'), error => error.code === 'ENOENT');
    assert.ok(!events.some(row => row.kind === 'rename'), 'a failed read never writes state or markers');
    await assert.rejects(f.store.read(), error => error.code === 'CLAIM_STORE_CLOSED_OR_UNCERTAIN');
  } finally { metadataProbe = null; await f.cleanup(); }
});


// Deliberately corrupt only public synthetic fixture storage. Authenticated
// schema/predecessor rejection must precede a later independent read failure.
async function corruptFirstCommitPrevious(f) {
  const header = JSON.parse(await fs.readFile(join(f.options.path, 'header.json'), 'utf8'));
  const path = join(f.options.path, 'commits', '0000000000.json');
  const envelope = JSON.parse(await fs.readFile(path, 'utf8'));
  const master = crypto.scryptSync(f.options.password, Buffer.from(header.kdf.salt, 'hex'), 32,
    { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const key = crypto.createHmac('sha256', master).update('LIANUM_CLAIM_RECORD_STORE_V3/aes-256-gcm').digest(); master.fill(0);
  const aad = () => Buffer.from(canonical({ header, identity: canonical(f.options.identity), kind: envelope.kind, id: envelope.id, iv: envelope.iv }));
  let partial, plaintext, rewritten;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'), { authTagLength: 16 });
    decipher.setAAD(aad()); decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    partial = decipher.update(Buffer.from(envelope.ciphertext, 'base64url')); plaintext = Buffer.concat([partial, decipher.final()]);
    const commit = JSON.parse(plaintext.toString('utf8')); commit.previous = '00'.repeat(32);
    rewritten = Buffer.from(canonical(commit)); envelope.iv = crypto.randomBytes(12).toString('hex');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'), { authTagLength: 16 }); cipher.setAAD(aad());
    envelope.ciphertext = Buffer.concat([cipher.update(rewritten), cipher.final()]).toString('base64url'); envelope.tag = cipher.getAuthTag().toString('hex');
    await fs.writeFile(path, JSON.stringify(envelope));
  } finally { key.fill(0); partial?.fill(0); plaintext?.fill(0); rewritten?.fill(0); }
}
test('fresh scan reports the first original validation failure after draining later IO errors', async t => {
  await t.test('earlier authenticated predecessor mismatch precedes later commit read failure', async () => {
    const f = await fixture({ n: 0 });
    try {
      await f.store.update(0, () => ({ n: 1 })); await corruptFirstCommitPrevious(f);
      injected = { kind: 'open:r', matches: path => path.endsWith('/commits/0000000001.json') };
      await assert.rejects(f.store.read(), error => error.code === 'CLAIM_STORE_COMMIT_CHAIN');
      assert.equal(injected, undefined, 'later read was admitted and drained before rejection');
      await assert.rejects(f.store.read(), error => error.code === 'CLAIM_STORE_CLOSED_OR_UNCERTAIN');
    } finally { await f.cleanup(); }
  });
  await t.test('earlier retained byte overflow precedes later metadata read failure', async () => {
    const f = await fixture({ n: 0 });
    try {
      // Sparse inert orphan temps exercise only original retained-byte checks;
      // they are never interpreted as ciphertext, state or recovery artifacts.
      const objects = join(f.options.path, 'objects');
      for (let index = 0; index < LIMIT.retainedFileBytes / LIMIT.envelopeBytes; index++) {
        const path = join(objects, `orphan.tmp-${index.toString(16).padStart(32, '0')}`);
        await fs.writeFile(path, ''); await fs.truncate(path, LIMIT.envelopeBytes);
      }
      injected = { kind: 'lstat', matches: path => path.endsWith('/commits/0000000000.json') };
      await assert.rejects(f.store.read(), error => error.code === 'CLAIM_STORE_RETAINED_BYTES');
      assert.equal(injected, undefined, 'later metadata read was drained without replacing the earlier cause');
      await assert.rejects(f.store.read(), error => error.code === 'CLAIM_STORE_CLOSED_OR_UNCERTAIN');
    } finally { await f.cleanup(); }
  });
});


// Actual encrypted store reads: no node, clock, authority or record substitutes.
// Buffer geometry changes neither the key lifetime nor fresh AEAD/CAS checks.
test('tiny encrypted cells allocate to their FD size while every original read remains fresh and authenticated', async () => {
  const f = await fixture({ n: 0, body: 'small original encrypted cell' });
  const expected = await f.store.read(), beforeKDF = derivations.length, allocations = [];
  const actualAlloc = Buffer.alloc;
  const spy = mock.method(Buffer, 'alloc', (size, ...rest) => {
    const buffer = actualAlloc(size, ...rest); allocations.push({ size, buffer }); return buffer;
  });
  try {
    events.length = 0;
    assert.deepEqual(await f.store.read(), expected);
    const firstReads = events.filter(row => row.kind === 'open:r').length;
    events.length = 0;
    assert.deepEqual(await f.store.read(), expected);
    assert.equal(events.filter(row => row.kind === 'open:r').length, firstReads);
    assert.equal(derivations.length, beforeKDF, 'read never reopens or derives a replacement key');
    assert.ok(allocations.length > 1 && allocations.every(row => row.size <= 4096), 'tiny cells never reserve the complete envelope bound');
    assert.ok(allocations.every(row => isWiped(row.buffer)), 'all successful read buffers wiped before return');
    spy.mock.restore();
    await changeEnvelope(join(f.options.path, 'commits', '0000000000.json'), value => { value.tag = '00'.repeat(16); });
    await assert.rejects(f.store.read(), error => error.code === 'CLAIM_STORE_AUTHENTICATION');
    await assert.rejects(f.store.read(), error => error.code === 'CLAIM_STORE_CLOSED_OR_UNCERTAIN');
  } finally { spy.mock.restore(); await f.cleanup(); }
});

test('original bounded read follows FD growth through EOF or max+1 and wipes buffers on overflow or IO failure', async () => {
  // Inspect the canonical implementation, not its compatibility reexport.
  const text = await fs.readFile(new URL('../../../../engine/src/storage/segmented-record-store.mjs', import.meta.url), 'utf8');
  const a = text.indexOf('async function boundedRead('), b = text.indexOf('async function syncDirectory(', a);
  assert.ok(a >= 0 && b > a);
  const body = text.slice(a, b), directory = await fs.mkdtemp(join(tmpdir(), 'claim-v3-growth-'));
  async function run({ suffix, maximum, failRead = false, initial = 'x' }) {
    const path = join(directory, crypto.randomBytes(8).toString('hex'));
    await fs.writeFile(path, initial);
    const allocations = [], ioError = Error('HOST_CONTROLLED_READ_FAILURE'); let reads = 0, closed = 0, eof = false;
    const ports = { LIMIT, check: (ok, code) => { if (!ok) throw Object.assign(Error(code), { code }); },
      Buffer: { alloc(size) { const value = Buffer.alloc(size); allocations.push(value); return value; } },
      lstat: fs.lstat,
      async open(selected, flags) {
        assert.equal(selected, path); assert.equal(flags, 'r'); const handle = await fs.open(selected, flags);
        return { async stat() {
          const stat = await handle.stat();
          // Physical append after the original FD stat; size is not an EOF grant.
          if (suffix) await fs.appendFile(path, suffix); return stat;
        }, async read(...args) {
          if (failRead && reads === 1) throw ioError;
          reads++; const result = await handle.read(...args); if (result.bytesRead === 0) eof = true; return result;
        }, async close() { await handle.close(); closed++; } };
      } };
    const actual = vm.runInThisContext('(function({Buffer,LIMIT,check,lstat,open}){' + body + ';return boundedRead;})')(ports);
    let value, error; try { value = await actual(path, maximum); } catch (cause) { error = cause; }
    assert.equal(closed, 1); assert.ok(allocations.every(isWiped));
    assert.ok(allocations.every(buffer => buffer.length <= maximum + 1));
    return { value, error, ioError, reads, eof, allocations };
  }
  try {
    const suffix = 'é'.repeat(40_000);
    const grown = await run({ suffix, maximum: 100_000 });
    assert.equal(grown.value, 'x' + suffix); assert.equal(grown.error, undefined); assert.equal(grown.eof, true);
    assert.ok(grown.allocations.length > 1 && grown.allocations[0].length === 4096);
    const exact = await run({ suffix: 'y'.repeat(98_303), maximum: 98_304 });
    assert.equal(exact.value.length, 98_304); assert.equal(exact.eof, true);
    const overflow = await run({ suffix: 'z'.repeat(128), maximum: 128 });
    assert.equal(overflow.error.code, 'CLAIM_STORE_FILE_SIZE'); assert.equal(overflow.value, undefined);
    const failed = await run({ suffix: 'k'.repeat(8_000), maximum: 10_000, failRead: true });
    assert.equal(failed.error, failed.ioError); assert.equal(failed.value, undefined); assert.ok(failed.allocations.length > 1);
    const before = await run({ initial: 'a'.repeat(129), maximum: 128 });
    assert.equal(before.error.code, 'CLAIM_STORE_FILE_SIZE'); assert.equal(before.allocations.length, 0); assert.equal(before.reads, 0);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});


test('HOST original reconstruction overlaps only authenticated-parent ciphertext reads with one global bound and ordered drained rejection', async () => {
  // Real encrypted store, actual DFS/AEAD/CAS/FD/lock. Only already-existing
  // filesystem HOST ports delay reads or corrupt synthetic fixture ciphertext.
  const data = Object.fromEntries(Array.from({ length: 12 }, (_, index) =>
    [String(index).padStart(2, '0'), Array.from({ length: 20 }, (_, item) => index * 100 + item)]));
  const f = await fixture(data);
  const objectReads = () => events.filter(row => row.kind === 'open:r' && row.path.startsWith(f.options.path + '/objects/'));
  const counts = rows => {
    const result = new Map(); for (const row of rows) result.set(row.path, (result.get(row.path) ?? 0) + 1);
    return [...result].sort(([a], [b]) => a.localeCompare(b));
  };
  try {
    events.length = 0; const expected = await f.store.read(), baseline = objectReads();
    const probe = { path: f.options.path, root: baseline[0].path, counts: new Map(), active: 0, admitted: 0, peak: 0,
      started: Promise.withResolvers(), gate: Promise.withResolvers() };
    ciphertextProbe = probe; events.length = 0; const beforeKDF = derivations.length;
    let settled = false; const pending = f.store.read();
    pending.then(() => { settled = true; }, () => { settled = true; });
    await probe.started.promise;
    assert.equal(settled, false); assert.equal(probe.active, 8); assert.equal(probe.peak, 8);
    assert.ok((await fs.lstat(f.options.path + '.lock')).isFile());
    assert.throws(() => f.store.close(), error => error.code === 'CLAIM_STORE_BUSY');
    await assert.rejects(f.store.update(0, () => ({ replaced: true })), error => error.code === 'CLAIM_STORE_BUSY');
    probe.gate.resolve(); assert.deepEqual(await pending, expected);
    assert.equal(probe.active, 0); assert.equal(probe.peak, 8, 'nested DFS never starts another eight-read group above the global allowance');
    assert.deepEqual(counts(objectReads()), counts(baseline), 'every original ciphertext is reread once at the same DFS visit count');
    assert.equal(derivations.length, beforeKDF); assert.ok(!events.some(row => row.kind === 'rename'));
    ciphertextProbe = null;
    events.length = 0; assert.deepEqual(await f.store.read(), expected);
    assert.deepEqual(counts(objectReads()), counts(baseline), 'no outcomes survive into the next original scan');
  } finally { ciphertextProbe?.gate.resolve(); ciphertextProbe = null; await f.cleanup(); }

  const bad = await fixture(Object.fromEntries(Array.from({ length: 12 }, (_, index) => [String(index).padStart(2, '0'), index])));
  try {
    events.length = 0; await bad.store.read();
    const baseline = events.filter(row => row.kind === 'open:r' && row.path.startsWith(bad.options.path + '/objects/'));
    const probe = { path: bad.options.path, root: baseline[0].path, counts: new Map(), active: 0, admitted: 0, peak: 0,
      fail: baseline[3].path, ioError: Error('HOST_LATER_CIPHERTEXT_IO_FAILURE'),
      started: Promise.withResolvers(), gate: Promise.withResolvers(),
      // The complete graph walk has passed. Adverse fixture mutation before
      // the fresh reconstruction read must beat a later sibling read failure.
      mutateRoot: () => changeEnvelope(baseline[1].path, value => { value.tag = '00'.repeat(16); }) };
    ciphertextProbe = probe; events.length = 0; let settled = false;
    const pending = bad.store.read(); pending.then(() => { settled = true; }, () => { settled = true; });
    await probe.started.promise; assert.equal(settled, false);
    assert.ok((await fs.lstat(bad.options.path + '.lock')).isFile());
    probe.gate.resolve(); await assert.rejects(pending, error => error.code === 'CLAIM_STORE_AUTHENTICATION');
    assert.equal(probe.failed, true); assert.equal(probe.active, 0); assert.ok(probe.peak <= 8);
    assert.ok(!events.some(row => row.kind === 'rename'));
    await assert.rejects(fs.lstat(bad.options.path + '.lock'), error => error.code === 'ENOENT');
    await assert.rejects(bad.store.read(), error => error.code === 'CLAIM_STORE_CLOSED_OR_UNCERTAIN');
  } finally { ciphertextProbe?.gate.resolve(); ciphertextProbe = null; await bad.cleanup(); }
});


test('HOST original verification overlaps only fresh owned ciphertext and preserves global reservations, DFS authentication and drained error order', async () => {
  // Original encrypted store and real filesystem ports. Root child 07 is also
  // reached from child 00: its reserved ciphertext must be consumed once when
  // DFS reaches it, never read again from the later sibling position.
  const data = Object.fromEntries(Array.from({ length: 12 }, (_, index) =>
    [String(index).padStart(2, '0'), index === 7 ? 'shared original leaf'
      : Array.from({ length: 20 }, (_, item) => index === 0 && item === 0 ? 'shared original leaf' : index * 100 + item)]));
  const counts = rows => {
    const result = new Map(); for (const row of rows) result.set(row.path, (result.get(row.path) ?? 0) + 1);
    return [...result].sort(([a], [b]) => a.localeCompare(b));
  };
  const objectReads = f => events.filter(row => row.kind === 'open:r' && row.path.startsWith(f.options.path + '/objects/'));
  const f = await fixture(data); let reopened;
  try {
    events.length = 0; const expected = await f.store.read(), baseline = objectReads(f), root = baseline[0].path;
    const reconstructionStart = baseline.findIndex((row, index) => index > 0 && row.path === root);
    assert.ok(reconstructionStart > 8);
    const verificationReads = baseline.slice(0, reconstructionStart);
    assert.equal(verificationReads.length, (await objectFiles(f)).length, 'shared DAG nodes are authenticated once in the original first pass');
    assert.equal(new Set(verificationReads.map(row => row.path)).size, verificationReads.length);
    const probe = { path: f.options.path, root, firstPass: true, counts: new Map(), active: 0, admitted: 0, peak: 0,
      started: Promise.withResolvers(), gate: Promise.withResolvers() };
    ciphertextProbe = probe; events.length = 0; const beforeKDF = derivations.length;
    let settled = false; const pending = f.store.read();
    pending.then(() => { settled = true; }, () => { settled = true; });
    await probe.started.promise;
    assert.equal(settled, false); assert.equal(probe.active, 8); assert.equal(probe.peak, 8);
    assert.ok((await fs.lstat(f.options.path + '.lock')).isFile());
    assert.throws(() => f.store.close(), error => error.code === 'CLAIM_STORE_BUSY');
    await assert.rejects(f.store.update(0, () => ({ replaced: true })), error => error.code === 'CLAIM_STORE_BUSY');
    probe.gate.resolve(); assert.deepEqual(await pending, expected);
    assert.equal(probe.active, 0); assert.equal(probe.peak, 8);
    assert.deepEqual(counts(objectReads(f)), counts(baseline), 'prefetch introduces no second read or missing original ciphertext visit');
    assert.equal(derivations.length, beforeKDF); assert.ok(!events.some(row => row.kind === 'rename'));
    ciphertextProbe = null; events.length = 0;
    assert.deepEqual(await f.store.read(), expected); assert.deepEqual(counts(objectReads(f)), counts(baseline));
    f.store.close(); events.length = 0; reopened = await openClaimRecordStore(f.options);
    assert.deepEqual(await reopened.read(), expected);
    assert.ok(!events.some(row => row.kind === 'rename'), 'acknowledged original history/root validation does not write or adopt a replacement');
  } finally { ciphertextProbe?.gate.resolve(); ciphertextProbe = null; reopened?.close(); await f.cleanup(); }

  const bad = await fixture(data);
  try {
    events.length = 0; await bad.store.read(); const baseline = objectReads(bad);
    await changeEnvelope(baseline[1].path, value => { value.tag = '00'.repeat(16); });
    const probe = { path: bad.options.path, root: baseline[0].path, firstPass: true, counts: new Map(), active: 0, admitted: 0, peak: 0,
      failOnAdmission: 4, ioError: Error('HOST_LATER_VERIFY_READ_FAILURE'), started: Promise.withResolvers(), gate: Promise.withResolvers() };
    ciphertextProbe = probe; events.length = 0; let settled = false;
    const pending = bad.store.read(); pending.then(() => { settled = true; }, () => { settled = true; });
    await probe.started.promise; assert.equal(settled, false); assert.ok((await fs.lstat(bad.options.path + '.lock')).isFile());
    probe.gate.resolve(); await assert.rejects(pending, error => error.code === 'CLAIM_STORE_AUTHENTICATION');
    assert.equal(probe.failed, true); assert.equal(probe.active, 0); assert.ok(probe.peak <= 8);
    assert.ok(!events.some(row => row.kind === 'rename'));
    await assert.rejects(fs.lstat(bad.options.path + '.lock'), error => error.code === 'ENOENT');
    await assert.rejects(bad.store.read(), error => error.code === 'CLAIM_STORE_CLOSED_OR_UNCERTAIN');
  } finally { ciphertextProbe?.gate.resolve(); ciphertextProbe = null; await bad.cleanup(); }
});
