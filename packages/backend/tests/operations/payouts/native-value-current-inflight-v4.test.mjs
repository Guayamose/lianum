/** Execute the original private pending-check body over inert reader/round ports.
 * These four races establish no native, signer, deployment or financial authority.
 * No production export, fake successful current-view certificate, key or proof.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
let source;
try { source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/operations/operators/native-value/native-value-operators-v4.mjs'), 'utf8'); }
catch (error) {
  // ./dev maps this existing domain directory to the same runtime ops folder.
  assert.equal(error.code, 'ENOENT');
  source = readFileSync(new URL('./native-value-operators-v4.mjs', import.meta.url), 'utf8');
}
const begin = source.indexOf('async function assertRoundCurrent('), end = source.indexOf('\nconst copy =', begin);
assert.ok(begin >= 0 && end > begin);
const originalPrivateBody = source.slice(begin, end);
function fixture(assertCurrent) {
  const rounds = new WeakSet(), checks = new WeakMap(), reader = Object.freeze({ assertCurrent });
  const run = Function('assert', 'rounds', 'roundCurrentChecks', originalPrivateBody + '\nreturn assertRoundCurrent;')(assert, rounds, checks);
  const view = Object.freeze({ inertPublicHead: 'same-block-only' });
  const round = () => {
    const shared = Object.freeze({ view, token: Object.freeze({}) });
    const state = { reader, view, pending: null }; rounds.add(shared); checks.set(shared, state);
    return { shared, state, close() { checks.delete(shared); rounds.delete(shared); } };
  };
  return { run, reader, view, round };
}
function barrier() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('overlapping three callers drain one full pending check with individual continuation', async () => {
  const entered = barrier(), release = barrier(); let reads = 0; const after = [];
  const f = fixture(async view => { assert.equal(view, f.view); reads++; entered.resolve(); await release.promise; });
  const r = f.round();
  const calls = [0, 1, 2].map(i => f.run(r.shared, f.reader, f.view).then(() => after.push(i)));
  await entered.promise;
  assert.equal(reads, 1); assert.deepEqual(after, []); assert.ok(r.state.pending);
  release.resolve(); await Promise.all(calls);
  assert.deepEqual(after.sort(), [0, 1, 2]); assert.equal(r.state.pending, null); r.close();
});

test('copied round/view and revoked round reject before original reader work', async () => {
  let reads = 0; const f = fixture(async () => { reads++; }); const r = f.round();
  await assert.rejects(f.run(Object.freeze({ ...r.shared }), f.reader, f.view), /PRIVATE_CURRENT_ROUND_REQUIRED/);
  await assert.rejects(f.run(r.shared, f.reader, Object.freeze({ ...f.view })), /PRIVATE_CURRENT_ROUND_REQUIRED/);
  r.close();
  await assert.rejects(f.run(r.shared, f.reader, f.view), /PRIVATE_CURRENT_ROUND_REQUIRED/);
  assert.equal(reads, 0); assert.equal(r.state.pending, null);
});

test('a full-check rejection reaches all callers unchanged and drains before round closes', async () => {
  const entered = barrier(), release = barrier(), original = Error('INERT_FULL_CURRENT_CHECK_REJECTED'); let reads = 0;
  const f = fixture(async () => { reads++; entered.resolve(); await release.promise; throw original; }); const r = f.round();
  const calls = [0, 1, 2].map(() => f.run(r.shared, f.reader, f.view));
  const drained = Promise.allSettled(calls); await entered.promise; release.resolve();
  const outcomes = await drained;
  assert.equal(reads, 1); assert.ok(outcomes.every(row => row.status === 'rejected' && row.reason === original));
  assert.equal(r.state.pending, null); r.close();
  await assert.rejects(f.run(r.shared, f.reader, f.view), /PRIVATE_CURRENT_ROUND_REQUIRED/);
});

test('settled phase is never cached and next phase rechecks an adverse head', async () => {
  let reads = 0, adverse = false; const rejection = Error('INERT_HEAD_CHANGED_BETWEEN_PHASES');
  const f = fixture(async () => { reads++; if (adverse) throw rejection; }); const r = f.round();
  await f.run(r.shared, f.reader, f.view); assert.equal(reads, 1); assert.equal(r.state.pending, null);
  adverse = true;
  await assert.rejects(f.run(r.shared, f.reader, f.view), error => error === rejection);
  assert.equal(reads, 2); assert.equal(r.state.pending, null); r.close();
  // Another genuine fixture round owns a new pending slot, never old completion.
  adverse = false; const next = f.round(), distinct = f.round();
  await Promise.all([f.run(next.shared, f.reader, f.view), f.run(distinct.shared, f.reader, f.view)]);
  assert.equal(reads, 4); assert.equal(next.state.pending, null); assert.equal(distinct.state.pending, null);
  next.close(); distinct.close();
});


/** HOST storage defect only. Execute the original audit/unchanged/save bodies
 * against the real encrypted V3 store. Native observation, binding validation
 * and current-view ports below are explicit inert data fixtures; no key, native
 * runtime, consensus, proof or financial acceptance is created. */
test('HOST original native audit avoids key-order-only AEAD commits and keeps every fresh check', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { isDeepStrictEqual } = await import('node:util');
  const moduleURL = (canonical, mapped) => {
    const candidate = new URL(canonical, import.meta.url);
    try { readFileSync(candidate); return candidate; }
    catch (error) { assert.equal(error.code, 'ENOENT'); const fallback = new URL(mapped, import.meta.url); readFileSync(fallback); return fallback; }
  };
  const storeModule = await import(moduleURL('../../../src/claims/storage/segmented-record-store.mjs', '../native-claims/segmented-record-store.mjs').href);
  const readiness = await import(moduleURL('../../../src/execution/account/preparation/readiness-inputs.mjs', '../paeg/readiness-inputs.mjs').href);
  const commitments = await import(moduleURL('../../../src/execution/encoding/commitments.mjs', '../paeg/commitments.mjs').href);
  const inventorySource = readFileSync(moduleURL('../../../src/operations/operators/native-value/native-value-inventory-v4.mjs', './native-value-inventory-v4.mjs'), 'utf8');
  const watermarkLine = inventorySource.split('\n').filter(line => line.startsWith('export const nativeValueWatermark = '));
  assert.equal(watermarkLine.length, 1);
  const watermark = Function(watermarkLine[0].replace('export ', '') + '\nreturn nativeValueWatermark;')();
  const unchangedAt = source.indexOf('  async function unchanged() {'), saveEnd = source.indexOf('  async function current() {', unchangedAt);
  const auditAt = source.indexOf('  async function auditAll('), auditEnd = source.indexOf('  async function coverage(', auditAt);
  assert.ok(unchangedAt >= 0 && saveEnd > unchangedAt && auditAt >= 0 && auditEnd > auditAt);
  const bodies = source.slice(unchangedAt, saveEnd) + source.slice(auditAt, auditEnd);
  const blockId = 'a'.repeat(64), nativeId = 'b'.repeat(64), gid = 'c'.repeat(64);
  const initial = { lastClock: '1000', inventories: [{ profileCommitment: 'd'.repeat(64), entries: [{
    original: { nativeId, facts: { nativeGid: gid } }, watermark: watermark({ finalizedBlockId: blockId, finalizedBlockHeight: '5' }),
    status: 'live', reason: null, lastCheckedAt: '1000', pending: null, history: [],
  }] }], authorizations: [], checkpoints: [] };
  const directory = await mkdtemp(join(tmpdir(), 'native-audit-order-host-'));
  const store = await storeModule.createClaimRecordStore({ path: join(directory, 'journal'), password: 'HOST original audit private password',
    identity: { purpose: 'INERT_NATIVE_AUDIT_KEY_ORDER_HOST' } }, initial);
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  const durable = await store.read();
  // This is the actual canonical AEAD readback order that broke the original
  // JSON-text comparison. The value produced by the original watermark is equal.
  const reordered = readiness.cloneInput(durable.data);
  reordered.inventories[0].entries[0].watermark = watermark({ finalizedBlockId: blockId, finalizedBlockHeight: '5' });
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(durable.data));
  assert.deepEqual(reordered, durable.data);
  const control = { reads: 0, commits: 0, currents: 0, observations: 0, height: '5', failure: null, status: 'live', poisoned: false };
  const resources = { store: {
    async load() { control.reads++; const row = await store.read(); return { revision: String(row.revision), state: row.data }; },
    async commit(input) { control.commits++; const row = await store.update(Number(input.expectedRevision), prior => {
      assert.deepEqual(prior, live.read().state); return input.nextState;
    }); return { revision: String(row.revision), state: row.data }; },
  } };
  const ports = { assert, isDeepStrictEqual, copy: readiness.cloneInput, freeze: readiness.frozenInput,
    equal: (a, b) => assert.deepEqual(a, b), exactRecord: commitments.exactRecord, inputUint: readiness.inputUint,
    validateNativeValueOperatorInventory(state) { // Inert prevalidated inventory port: never grants a typed native observation.
      assert.deepEqual(Object.keys(state).sort(), ['authorizations', 'checkpoints', 'inventories', 'lastClock']); return state;
    }, nativeValueWatermark: watermark, MAX_CERTIFICATES_PER_ORIGINAL: 64,
    bound: { resources, binding: Object.freeze({ inert: true }) },
    active: { view: { head: { timestamp: '1000' } } }, record: { revision: String(durable.revision), state: durable.data },
    owned() { assert.equal(control.poisoned, false); }, poison() { control.poisoned = true; },
    timedStore: async (_kind, work) => work(), current: async () => { control.currents++; },
    observe: async () => { control.observations++; if (control.failure) throw control.failure; return {
      status: control.status, reason: control.status === 'live' ? null : 'INERT_ORIGINAL_SOURCE_UNKNOWN', observed: true, nativeReadCount: '1', sourceStatus: control.status === 'live' ? 'observed' : 'unverified',
      original: { facts: { finalizedBlockId: blockId, finalizedBlockHeight: control.height } },
    }; },
  };
  const names = Object.keys(ports);
  const live = Function(...names, bodies + '\nreturn {audit:auditAll, read:()=>record};')(...names.map(name => ports[name]));
  await live.audit(); await live.audit();
  assert.deepEqual({ reads: control.reads, currents: control.currents, observations: control.observations, commits: control.commits },
    { reads: 4, currents: 4, observations: 2, commits: 0 });
  assert.equal((await store.read()).revision, durable.revision);
  // A genuinely new watermark still gets the original durable CAS/readback.
  control.height = '6'; await live.audit();
  assert.equal(control.commits, 1); assert.equal((await store.read()).revision, durable.revision + 1);
  assert.equal(live.read().state.inventories[0].entries[0].watermark.blockHeight, '6');
  await live.audit(); assert.equal(control.commits, 1); assert.equal(control.observations, 4);
  // A later original-source failure is re-observed and cannot be hidden by a
  // previously equal state. It propagates unchanged without a new commit.
  control.status = 'unknown'; const unavailable = await live.audit();
  assert.equal(unavailable.blockers.length, 1); assert.equal(control.commits, 2);
  assert.equal(live.read().state.inventories[0].entries[0].status, 'unknown');
  const original = Error('INERT_ORIGINAL_SOURCE_FAILED'); control.failure = original;
  await assert.rejects(live.audit(), error => error === original);
  assert.equal(control.observations, 6); assert.equal(control.commits, 2);
  assert.equal((await store.read()).revision, durable.revision + 2);
});
