/** Boundary tests with an explicit fake keeper. No chain, proof, native node,
 * encrypted vault or acceptance result is represented by this fixture. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createFlatAccountSession, flatAccountErrorCode, FLAT_ACCOUNT_ADMISSION_LIMIT } from './flat-account-session.mjs';
import { startFlatAccountHttp, FLAT_ACCOUNT_BODY_LIMIT } from './flat-account-http.mjs';

const assetId = 'a'.repeat(64), ownerOperationRef = 'b'.repeat(64);
const preparation = (requestId = 'request_0001', kind = 'GRAPH') => ({ requestId, kind, assetId, ownerOperationRef });
const failure = code => Object.assign(new Error(code), { code });
const clone = value => structuredClone(value);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fakeKeeper() {
  const rows = new Map(), calls = [];
  let revision = 0, available = true, closed = false, active = 0, maximumActive = 0;
  let block = null, lostResponse = false, writeFailure = false, sends = 0, recoveries = 0;
  async function exclusive(name, work) {
    calls.push(name); active++; maximumActive = Math.max(active, maximumActive);
    assert.equal(active, 1, 'Boundary must serialize every keeper call');
    try { if (closed) throw failure('JOURNAL_AUTHORITY_UNAVAILABLE'); return await work(); }
    finally { active--; }
  }
  function usable() { if (!available) throw failure('JOURNAL_STORAGE_UNAVAILABLE'); }
  function write() {
    if (writeFailure) { writeFailure = false; available = false; throw failure('JOURNAL_STORAGE_UNAVAILABLE'); }
    revision++;
  }
  function original(id) {
    usable();
    if (!rows.has(id)) throw failure('JOURNAL_REQUEST_UNKNOWN');
    return rows.get(id);
  }
  const keeper = Object.freeze({
    prepare: input => exclusive('prepare', async () => {
      usable();
      if (block) { const gate = block; block = null; await gate; }
      const old = rows.get(input.requestId);
      if (old) {
        if (JSON.stringify(old.request) !== JSON.stringify(input)) throw failure('JOURNAL_REQUEST_CONFLICT');
        return clone(old);
      }
      if ([...rows.values()].some(row => row.request.ownerOperationRef === input.ownerOperationRef))
        throw failure('JOURNAL_REFERENCE_ALREADY_BOUND');
      write();
      const row = { request: clone(input), state: 'PREPARED', errorCode: null,
        address: 'PRIVATE_ADDRESS', amount: '900001', graph: { secret: 'PRIVATE_GRAPH' } };
      rows.set(input.requestId, row); return clone(row);
    }),
    execute: id => exclusive('execute', async () => {
      const row = original(id);
      if (row.state === 'CONFIRMED') return clone(row);
      if (row.state !== 'PREPARED') throw failure('JOURNAL_RECONCILE_ORIGINAL_REQUEST');
      write(); sends++;
      if (lostResponse) {
        lostResponse = false; row.state = 'UNKNOWN'; row.errorCode = 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED';
        throw failure('JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
      }
      row.state = 'CONFIRMED'; return clone(row);
    }),
    reconcile: id => exclusive('reconcile', async () => {
      const row = original(id);
      if (row.state !== 'CONFIRMED') {
        if (!['UNKNOWN', 'RECOVERING'].includes(row.state)) throw failure('JOURNAL_NOT_SUBMITTED');
        write(); row.state = 'CONFIRMED'; row.errorCode = null;
      }
      return clone(row);
    }),
    recover: id => exclusive('recover', async () => {
      const row = original(id);
      if (row.request.kind !== 'GRAPH') throw failure('JOURNAL_RECOVERY_GRAPH_REQUIRED');
      if (row.state !== 'CONFIRMED') {
        if (!['UNKNOWN', 'RECOVERING'].includes(row.state)) throw failure('JOURNAL_NOT_SUBMITTED');
        write(); recoveries++; row.state = 'CONFIRMED'; row.errorCode = null;
      }
      return clone(row);
    }),
    snapshot: () => exclusive('snapshot', async () => ({ version: 1, revision, storageAvailable: available,
      accountId: 'PRIVATE_ACCOUNT', assets: [{ assetId, amount: '900001', address: 'PRIVATE_ADDRESS' }],
      privateGraph: 'PRIVATE_GRAPH', requests: [...rows.values()].map(row => ({
        requestId: row.request.requestId, assetId, kind: row.request.kind, state: row.state, errorCode: row.errorCode,
        ownerOperationRef, amount: row.amount, graph: row.graph })) })),
    restartCoordinator: () => exclusive('restartCoordinator', async () => { available = true; return { restarted: true }; }),
    close: () => exclusive('close', async () => { closed = true; return { closed: true }; }),
  });
  const ownerHandoff = Object.freeze({ ownerView: async () => ({ version: 1,
    assets: [{ assetId, amount: '900001', address: 'PRIVATE_ADDRESS' }] }) });
  return { keeper, ownerHandoff, calls,
    blockNextPrepare: promise => { block = promise; },
    loseNextResponse: () => { lostResponse = true; },
    failNextWrite: () => { writeFailure = true; },
    stats: () => ({ sends, recoveries, maximumActive, closed }),
  };
}

async function fixture(t, http = false) {
  const fake = fakeKeeper();
  const session = await createFlatAccountSession({ keeper: fake.keeper, ownerHandoff: fake.ownerHandoff });
  const server = http ? await startFlatAccountHttp({ session }) : null;
  t.after(async () => { if (server) await server.close(); else await session.close(); });
  return { ...fake, session, server };
}
async function post(f, action, input, overrides = {}) {
  return fetch(`${f.server.origin}/api/flat-account/${action}`, { method: 'POST',
    headers: { Origin: f.server.origin, 'Content-Type': 'application/json',
      'x-flat-account-token': f.server.clientAccess.token, ...overrides }, body: JSON.stringify(input) });
}
async function rawStatus(origin, { method = 'GET', path = '/api/flat-account/snapshot', headers, data } = {}) {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: url.hostname, port: url.port, method, path, headers }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    req.on('error', reject); req.end(data);
  });
}

test('private bootstrap takes existing capabilities and rejects executable field substitutions', async () => {
  const f = fakeKeeper();
  for (const input of [{ keeper: f.keeper }, { keeper: f.keeper, ownerHandoff: f.ownerHandoff, runtime: {} },
    { keeper: 'serialized-keeper', ownerHandoff: f.ownerHandoff },
    { keeper: f.keeper, ownerHandoff: { ownerView: 'serialized-method' } }])
    await assert.rejects(createFlatAccountSession(input), /FLAT_ACCOUNT_/);
  let accessed = false;
  const input = { ownerHandoff: f.ownerHandoff };
  Object.defineProperty(input, 'keeper', { get() { accessed = true; return f.keeper; } });
  await assert.rejects(createFlatAccountSession(input), /BOOTSTRAP_FIELDS/);
  assert.equal(accessed, false);
  await assert.rejects(startFlatAccountHttp({ session: { submit() {} } }), /ORIGINAL_SESSION_REQUIRED/);
});

test('every duplicate and conflicting preparation reaches the original keeper', async t => {
  const f = await fixture(t);
  f.session.prepare(preparation()); await f.session.idle();
  f.session.prepare(preparation()); await f.session.idle();
  f.session.prepare({ ...preparation(), assetId: 'c'.repeat(64) });
  let snapshot = await f.session.idle();
  assert.equal(snapshot.admissions.at(-1).errorCode, 'JOURNAL_REQUEST_CONFLICT');
  assert.equal(f.calls.filter(name => name === 'prepare').length, 3);
  f.session.prepare(preparation('request_0002'));
  snapshot = await f.session.idle();
  assert.equal(snapshot.admissions.at(-1).errorCode, 'JOURNAL_REFERENCE_ALREADY_BOUND');
  assert.equal(snapshot.requests.length, 1);
});

test('admission is asynchronous, request data is captured, and mutation/read access is serial', async t => {
  const f = await fixture(t), gate = defer();
  f.blockNextPrepare(gate.promise);
  const request = preparation(), admitted = f.session.prepare(request);
  request.assetId = 'c'.repeat(64);
  f.session.execute(request.requestId);
  await new Promise(resolve => setImmediate(resolve));
  const during = await f.session.snapshot();
  assert.equal(admitted.admitted, true); assert.equal(during.busy, true);
  assert.equal(during.queued, 1); assert.equal(during.observation, 'STALE');
  await assert.rejects(f.session.ownerView(), /OWNER_VIEW_BUSY/);
  gate.resolve();
  const result = await f.session.idle();
  assert.equal(result.requests[0].state, 'CONFIRMED');
  assert.equal(f.stats().maximumActive, 1); assert.equal(f.stats().sends, 1);
  f.session.prepare(preparation()); await f.session.idle();
  assert.equal((await f.session.snapshot()).admissions.at(-1).state, 'SUCCEEDED');
});

test('lost execute response stays unresolved; retry cannot send, original-ID reconciliation can finish', async t => {
  const f = await fixture(t);
  f.session.prepare(preparation()); await f.session.idle();
  f.loseNextResponse(); f.session.execute('request_0001');
  let snapshot = await f.session.idle();
  assert.equal(snapshot.requests[0].state, 'UNKNOWN');
  assert.equal(snapshot.admissions.at(-1).errorCode, 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  f.session.execute('request_0001'); snapshot = await f.session.idle();
  assert.equal(snapshot.admissions.at(-1).errorCode, 'JOURNAL_RECONCILE_ORIGINAL_REQUEST');
  assert.equal(f.stats().sends, 1);
  f.session.reconcile('request_0001'); snapshot = await f.session.idle();
  assert.equal(snapshot.requests[0].state, 'CONFIRMED'); assert.equal(f.stats().sends, 1);
});

test('write failure blocks queued mutations and is repaired only by original coordinator restart', async t => {
  const f = await fixture(t);
  f.failNextWrite(); f.session.prepare(preparation()); f.session.execute('request_0001');
  let snapshot = await f.session.idle();
  assert.equal(snapshot.phase, 'UNAVAILABLE'); assert.equal(snapshot.storageAvailable, false);
  assert.equal(f.calls.includes('execute'), false);
  assert.throws(() => f.session.prepare(preparation()), /KEEPER_UNAVAILABLE/);
  f.session.restartCoordinator(); snapshot = await f.session.idle();
  assert.equal(snapshot.phase, 'READY');
  f.session.prepare(preparation()); await f.session.idle();
  f.loseNextResponse(); f.session.execute('request_0001'); await f.session.idle();
  f.session.restartCoordinator(); await f.session.idle();
  f.session.recover('request_0001'); snapshot = await f.session.idle();
  assert.equal(snapshot.requests[0].state, 'CONFIRMED'); assert.equal(f.stats().recoveries, 1);
  f.session.recover('request_0001'); await f.session.idle();
  assert.equal(f.stats().recoveries, 1);
});

test('public view is a whitelist, and keeper loss cannot manufacture a new lifetime', async t => {
  const f = await fixture(t);
  f.session.prepare(preparation()); await f.session.idle();
  f.session.execute('request_0001'); await f.session.idle();
  const snapshot = await f.session.snapshot();
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE_|900001|assetId|ownerOperationRef|graph|address|amount/);
  assert.match(JSON.stringify(await f.session.ownerView()), /900001/);
  f.session.keeperUnavailable();
  const unavailable = await f.session.snapshot();
  assert.equal(unavailable.phase, 'UNAVAILABLE'); assert.equal(unavailable.available, false);
  assert.equal(unavailable.observation, 'STALE'); assert.equal(unavailable.capabilities.coordinatorRestart, false);
  assert.throws(() => f.session.restartCoordinator(), /KEEPER_UNAVAILABLE/);
  await assert.rejects(f.session.ownerView(), /KEEPER_UNAVAILABLE/);
  // Parent owns cleanup after loss; the wrapper cannot replace the capability.
  await f.keeper.close();
});

test('input fields and queue budget are bounded without accepting URLs, graphs or replacement identities', async t => {
  const f = await fixture(t), gate = defer();
  for (const extra of ['runtime', 'verifier', 'authority', 'rootKey', 'graph', 'url', 'path', 'amount'])
    assert.throws(() => f.session.prepare({ ...preparation(), [extra]: 'forbidden' }), /REQUEST_FIELDS/);
  assert.throws(() => f.session.submit('execute', { requestId: 'request_0001', ownerOperationRef }), /REQUEST_FIELDS/);
  assert.throws(() => f.session.submit('restartCoordinator', { requestId: 'new_lifetime' }), /REQUEST_FIELDS/);
  assert.throws(() => f.session.prepare({ ...preparation(), kind: 'PAYMENT' }), /REQUEST/);
  f.blockNextPrepare(gate.promise);
  for (let index = 0; index < FLAT_ACCOUNT_ADMISSION_LIMIT; index++) f.session.prepare(preparation());
  assert.throws(() => f.session.prepare(preparation()), /ADMISSION_BUSY/);
  gate.resolve(); await f.session.idle();
});

test('canonical request fields and public error codes reject trailing LF and CR', async t => {
  const f = await fixture(t);
  for (const ending of ['\n', '\r', '\r\n']) {
    for (const field of ['requestId', 'assetId', 'ownerOperationRef']) {
      const request = preparation(); request[field] += ending;
      assert.throws(() => f.session.prepare(request), /FLAT_ACCOUNT_REQUEST/);
    }
    for (const action of ['execute', 'reconcile', 'recover'])
      assert.throws(() => f.session[action](`request_0001${ending}`), /FLAT_ACCOUNT_REQUEST/);
    assert.equal(flatAccountErrorCode({ code: `JOURNAL_STORAGE_UNAVAILABLE${ending}` }), 'FLAT_ACCOUNT_OPERATION_FAILED');
    assert.equal(flatAccountErrorCode({ message: `FLAT_ACCOUNT_REQUEST${ending}` }), 'FLAT_ACCOUNT_OPERATION_FAILED');
  }
  assert.equal(f.calls.filter(name => name !== 'snapshot').length, 0);
});

test('fixed HTTP routes admit original-ID lifecycle and expose no keeper mutation payload', async t => {
  const f = await fixture(t, true);
  for (const [action, input] of [['prepare', preparation()], ['execute', { requestId: 'request_0001' }],
    ['restart', {}], ['execute', { requestId: 'request_0001' }]]) {
    const response = await post(f, action, input);
    assert.equal(response.status, 202);
    const accepted = await response.json();
    assert.deepEqual(Object.keys(accepted).sort(), ['action', 'admitted', 'requestId', 'sequence', 'version']);
    await f.session.idle();
  }
  const response = await fetch(`${f.server.origin}/api/flat-account/snapshot`);
  assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const text = await response.text();
  assert.match(text, /CONFIRMED/); assert.doesNotMatch(text, /PRIVATE_|900001|assetId|ownerOperationRef/);
  assert.equal(f.stats().sends, 1);
});

test('private owner route requires its separate token plus exact same origin', async t => {
  const f = await fixture(t, true), url = `${f.server.origin}/api/flat-account/owner`;
  for (const headers of [{}, { Origin: f.server.origin, 'x-flat-owner-token': f.server.clientAccess.token },
    { 'x-flat-owner-token': f.server.ownerAccess.token },
    { Origin: 'http://example.invalid', 'x-flat-owner-token': f.server.ownerAccess.token }])
    assert.equal((await fetch(url, { headers })).status, 403);
  const response = await fetch(url, { headers: { Origin: f.server.origin, 'x-flat-owner-token': f.server.ownerAccess.token } });
  assert.equal(response.status, 200); assert.match(await response.text(), /900001/);
  assert.equal((await post(f, 'prepare', preparation(), { 'x-flat-account-token': f.server.ownerAccess.token })).status, 403);
});

test('HTTP refuses hostile origins, Host, content types, unknown routes, bodies and field smuggling', async t => {
  const f = await fixture(t, true);
  assert.equal((await post(f, 'prepare', preparation(), { Origin: 'null' })).status, 403);
  assert.equal(await rawStatus(f.server.origin, { headers: { Host: 'example.invalid' } }), 403);
  assert.equal((await post(f, 'prepare', preparation(), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post(f, 'prepare', preparation(), { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post(f, 'prepare', { ...preparation(), runtime: 'http://example.invalid' })).status, 400);
  assert.equal((await post(f, 'prepare', { data: 'x'.repeat(FLAT_ACCOUNT_BODY_LIMIT) })).status, 413);
  for (const suffix of ['snapshot?path=/tmp/private', 'snapshot/', 'owner?token=x', '../flat-account/snapshot?x=1', 'bootstrap'])
    assert.equal((await fetch(`${f.server.origin}/api/flat-account/${suffix}`)).status, 404);
  assert.equal((await fetch(`${f.server.origin}/api/flat-account/prepare`, { method: 'OPTIONS' })).status, 404);
  assert.equal(f.calls.filter(name => name === 'prepare').length, 0);
});

test('HTTP rejects duplicate security headers', async t => {
  const f = await fixture(t, true), url = new URL(f.server.origin);
  const status = await rawStatus(f.server.origin, {
    headers: ['Host', url.host, 'Origin', f.server.origin, 'Origin', f.server.origin] });
  assert.equal(status, 403);
});

test('HTTP enforces chunked body limit, rejects malformed JSON and GET bodies', async t => {
  const f = await fixture(t, true);
  const headers = { Origin: f.server.origin, 'Content-Type': 'application/json',
    'x-flat-account-token': f.server.clientAccess.token, 'Transfer-Encoding': 'chunked' };
  assert.equal(await rawStatus(f.server.origin, { method: 'POST', path: '/api/flat-account/prepare',
    headers, data: JSON.stringify({ padding: 'x'.repeat(FLAT_ACCOUNT_BODY_LIMIT) }) }), 413);
  assert.equal(await rawStatus(f.server.origin, { method: 'POST', path: '/api/flat-account/prepare',
    headers, data: '{invalid' }), 400);
  assert.equal(await rawStatus(f.server.origin, { headers: { 'Content-Length': '1' }, data: 'x' }), 400);
  assert.equal(f.calls.filter(name => name === 'prepare').length, 0);
});

test('shutdown remains possible with every admission slot occupied', async t => {
  const f = await fixture(t), gate = defer();
  f.blockNextPrepare(gate.promise);
  for (let index = 0; index < FLAT_ACCOUNT_ADMISSION_LIMIT; index++) f.session.prepare(preparation());
  const closed = f.session.close();
  assert.throws(() => f.session.prepare(preparation()), /KEEPER_UNAVAILABLE/);
  gate.resolve();
  assert.equal((await closed).phase, 'CLOSED');
  assert.equal(f.calls.filter(name => name === 'close').length, 1);
});

test('an in-flight observation or private view cannot restore a lost keeper', async () => {
  const fake = fakeKeeper(), snapshotGate = defer(), ownerGate = defer();
  let blockSnapshot = false, blockOwner = false;
  const keeper = Object.freeze({ ...fake.keeper, snapshot: async () => {
    const result = await fake.keeper.snapshot();
    if (blockSnapshot) await snapshotGate.promise;
    return result;
  } });
  const ownerHandoff = Object.freeze({ ownerView: async () => {
    if (blockOwner) await ownerGate.promise;
    return fake.ownerHandoff.ownerView();
  } });
  const session = await createFlatAccountSession({ keeper, ownerHandoff });
  blockSnapshot = true;
  const snapshot = session.snapshot();
  await new Promise(resolve => setImmediate(resolve));
  session.keeperUnavailable(); snapshotGate.resolve();
  assert.equal((await snapshot).phase, 'UNAVAILABLE');
  blockSnapshot = false;
  const other = await createFlatAccountSession({ keeper, ownerHandoff });
  blockOwner = true;
  const ownerView = other.ownerView();
  await new Promise(resolve => setImmediate(resolve));
  other.keeperUnavailable(); ownerGate.resolve();
  await assert.rejects(ownerView, /KEEPER_UNAVAILABLE/);
  await fake.keeper.close();
});

test('explicit close drains already admitted work, closes original keeper once and blocks further admission', async t => {
  const f = await fixture(t);
  f.session.prepare(preparation()); f.session.execute('request_0001');
  const result = await f.session.close();
  assert.equal(result.phase, 'CLOSED'); assert.equal(f.stats().closed, true);
  assert.equal(f.stats().sends, 1); assert.equal(result.available, false);
  assert.throws(() => f.session.execute('request_0001'), /KEEPER_UNAVAILABLE/);
  await f.session.close(); assert.equal(f.calls.filter(name => name === 'close').length, 1);
});
