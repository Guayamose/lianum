/** Host-only framing/lifecycle fixtures. No endpoint, process, compiler, proof,
 * key, signer or chain is used. These do not establish native RPC acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnedEvmReadBatch, OWNED_EVM_READ_BATCH_LIMITS as L } from './owned-evm-read-batch.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = values => new Response(JSON.stringify(values));
const reply = (requests, value = '0x1') => requests.map((request, i) => ({ jsonrpc: '2.0', id: request.id,
  result: typeof value === 'function' ? value(request, i) : value }));
function fixture(handler = requests => response(reply(requests))) {
  const calls = []; let live = true, checks = 0;
  const batch = createOwnedEvmReadBatch({ assertAlive() { checks++; assert.ok(live, 'PROCESS_DEAD'); },
    postBatch(body, signal) { const requests = JSON.parse(body); calls.push({ requests, body, signal }); return handler(requests, signal, calls); } });
  return { batch, calls, get checks() { return checks; }, kill() { live = false; } };
}
const allRejected = async (promises, pattern) => {
  const results = await Promise.allSettled(promises);
  for (const result of results) { assert.equal(result.status, 'rejected'); if (pattern) assert.match(result.reason.message, pattern); }
  return results;
};

test('concurrent duplicate reads have distinct IDs and independent differing reordered responses; completed values never cache', async () => {
  const f = fixture(requests => response(reply(requests, (_r, i) => ({ raw: i === 0 ? '0x6000' : '0x6001' })).reverse()));
  try {
    const params = ['0x' + '11'.repeat(20), '0xa'];
    const [a, b] = await Promise.all([f.batch.read('eth_getCode', params), f.batch.read('eth_getCode', params)]);
    assert.equal(f.calls.length, 1); assert.deepEqual(a, { raw: '0x6000' }); assert.deepEqual(b, { raw: '0x6001' });
    assert.notEqual(a, b); a.raw = 'caller changed'; assert.equal(b.raw, '0x6001');
    const requests = f.calls[0].requests; assert.equal(requests.length, 2);
    assert.notEqual(requests[0].id, requests[1].id); assert.deepEqual(requests[0].params, requests[1].params);
    await f.batch.read('eth_getCode', params); assert.equal(f.calls.length, 2);
    assert.notEqual(f.calls[1].requests[0].id, requests[0].id); assert.ok(f.checks >= 6);
  } finally { f.batch.close(); }
});

test('request data is copied before queueing; mutation cannot alter method, calldata or head', async () => {
  const f = fixture(), params = [{ to: '0x1234', data: '0xabcd' }, '0xa'];
  try {
    const pending = f.batch.read('eth_call', params); params[0].data = '0xffff'; params[1] = 'latest'; params.push('injected');
    await pending; assert.deepEqual(f.calls[0].requests[0].params, [{ to: '0x1234', data: '0xabcd' }, '0xa']);
    let invoked = false; const malicious = { get data() { invoked = true; return '0x'; } };
    await assert.rejects(f.batch.read('eth_call', [malicious]), /REQUEST_STRUCTURE/); assert.equal(invoked, false);
    for (const bad of [[undefined], [NaN], [new Date()], [() => {}]]) await assert.rejects(f.batch.read('eth_call', bad), /REQUEST_STRUCTURE/);
  } finally { f.batch.close(); }
});

test('strict allowlist never transports signing, sending, mining, mutation or unlisted reads', async () => {
  const f = fixture();
  try {
    for (const method of ['eth_signTransaction', 'eth_sendRawTransaction', 'eth_sendTransaction', 'eth_sign', 'personal_sign',
      'evm_mine', 'evm_setNextBlockTimestamp', 'anvil_setCode', 'eth_getTransactionCount', 'eth_estimateGas', 'web3_sha3', '__proto__']) {
      assert.equal(f.batch.supports(method), false); await assert.rejects(f.batch.read(method, []), /METHOD_NOT_ALLOWED/);
    }
    assert.equal(f.calls.length, 0);
    const methods = ['eth_getCode', 'eth_call', 'eth_getBalance', 'eth_getBlockByNumber', 'eth_chainId', 'eth_accounts'];
    await Promise.all(methods.map(method => f.batch.read(method))); assert.deepEqual(f.calls[0].requests.map(r => r.method), methods);
    assert.throws(() => createOwnedEvmReadBatch({ assertAlive() {}, postBatch() {}, endpoint: 'http://unowned' }), /FIXED_OPTIONS/);
  } finally { f.batch.close(); }
});

for (const [name, corrupt] of [
  ['missing', xs => xs.slice(1)], ['extra', xs => [...xs, { ...xs[0], id: 'unknown' }]],
  ['duplicate', xs => [xs[0], xs[0]]], ['unknown', xs => [xs[0], { ...xs[1], id: 'unknown' }]],
  ['wrong-type ID', xs => [xs[0], { ...xs[1], id: 2 }]], ['wrong protocol', xs => [xs[0], { ...xs[1], jsonrpc: '1.0' }]],
  ['both result/error', xs => [xs[0], { ...xs[1], error: { code: -1, message: 'bad' } }]],
  ['neither result/error', xs => [xs[0], { jsonrpc: '2.0', id: xs[1].id }]],
  ['malformed error', xs => [xs[0], { jsonrpc: '2.0', id: xs[1].id, error: { code: '1', message: 'bad' } }]],
  ['extra envelope field', xs => [xs[0], { ...xs[1], extra: true }]], ['nonarray', xs => xs[0]],
  ['null item', xs => [xs[0], null]],
]) test('entire batch rejects before any delivery for ' + name, async () => {
  const f = fixture(requests => response(corrupt(reply(requests)))); let delivered = 0;
  try {
    const pending = [f.batch.read('eth_chainId'), f.batch.read('eth_accounts')].map(p => p.then(v => { delivered++; return v; }));
    await allRejected(pending, /RESPONSE_/); assert.equal(delivered, 0); assert.equal(f.calls.length, 1);
  } finally { f.batch.close(); }
});

test('valid per-item remote error rejects its own read and preserves rpcCode without losing siblings', async () => {
  const f = fixture(requests => response([{ jsonrpc: '2.0', id: requests[1].id, error: { code: -32000, message: 'revert', data: '0x1234' } },
    { jsonrpc: '2.0', id: requests[0].id, result: null }]));
  try {
    const values = await Promise.allSettled([f.batch.read('eth_call', ['first']), f.batch.read('eth_call', ['second'])]);
    assert.deepEqual(values[0], { status: 'fulfilled', value: null }); assert.equal(values[1].status, 'rejected');
    assert.equal(values[1].reason.message, 'OWNED_RPC_REMOTE_ERROR'); assert.equal(values[1].reason.rpcCode, -32000);
    assert.equal(f.calls.length, 1);
  } finally { f.batch.close(); }
});

test('queue, batch size and in-flight bounds drain FIFO without dropping or coalescing logical reads', async () => {
  const releases = [];
  const f = fixture(requests => new Promise(resolve => releases.push(() => resolve(response(reply(requests))))));
  try {
    // Full bounded historical fan-out: 3 actors × 2 readers × 130 records × 3 calls.
    const count = 3 * 2 * 130 * 3;
    const pending = Array.from({ length: count }, (_, i) => f.batch.read('eth_call', [String(i)]));
    await tick(); assert.equal(f.calls.length, L.maxInflightBatches);
    assert.equal(f.calls.reduce((sum, call) => sum + call.requests.length, 0), L.maxInflightRequests);
    while (f.calls.reduce((sum, call) => sum + call.requests.length, 0) < count || releases.length) {
      releases.splice(0).forEach(release => release()); await tick();
    }
    assert.equal((await Promise.all(pending)).length, count);
    const all = f.calls.flatMap(call => call.requests);
    assert.deepEqual(all.map(r => r.params[0]), Array.from({ length: count }, (_, i) => String(i)));
    assert.equal(new Set(all.map(r => r.id)).size, count);
    assert.ok(f.calls.every(call => call.requests.length <= L.maxBatchSize && Buffer.byteLength(call.body) <= L.maxBatchBytes));
  } finally { f.batch.close(); }
});

test('queue count, total queued wire bytes and individual request bytes fail before transport', async () => {
  const f = fixture(() => new Promise(() => {}));
  const pending = Array.from({ length: L.maxQueued }, () => f.batch.read('eth_chainId'));
  const checked = allRejected(pending, /CLOSED/);
  await assert.rejects(f.batch.read('eth_chainId'), /QUEUE_FULL/); f.batch.close(); await checked;
  const g = fixture(() => new Promise(() => {}));
  const large = 'a'.repeat(L.maxRequestBytes - 1024), wide = Array.from({ length: 16 }, () => g.batch.read('eth_call', [large]));
  const wideChecked = allRejected(wide, /CLOSED/);
  await assert.rejects(g.batch.read('eth_call', [large]), /QUEUE_BYTES/);
  await assert.rejects(g.batch.read('eth_call', ['a'.repeat(L.maxRequestBytes)]), /REQUEST_BYTES/);
  g.batch.close(); await wideChecked;
});

test('large requests split envelopes by wire bytes as well as item count', async () => {
  const f = fixture();
  try {
    const data = 'a'.repeat(400_000);
    await Promise.all(Array.from({ length: 5 }, () => f.batch.read('eth_call', [data])));
    assert.deepEqual(f.calls.map(call => call.requests.length), [2, 2, 1]);
    assert.ok(f.calls.every(call => Buffer.byteLength(call.body) <= L.maxBatchBytes));
  } finally { f.batch.close(); }
});

for (const mode of ['declared', 'streamed', 'invalid-utf8', 'invalid-json', 'http', 'fetch-abort', 'missing-body'])
  test('fail closed without retry/fallback for ' + mode + ' response failure', async () => {
    let cancelled = false;
    const f = fixture(() => {
      if (mode === 'declared') return new Response('[]', { headers: { 'content-length': String(L.maxResponseBytes + 1) } });
      if (mode === 'streamed') return new Response(new ReadableStream({ start(c) {
        c.enqueue(new Uint8Array(L.maxResponseBytes)); c.enqueue(new Uint8Array(1));
      }, cancel() { cancelled = true; } }));
      if (mode === 'invalid-utf8') return new Response(new Uint8Array([0xff]));
      if (mode === 'invalid-json') return new Response('{');
      if (mode === 'http') return new Response('[]', { status: 500 });
      if (mode === 'fetch-abort') throw new DOMException('fake abort', 'AbortError');
      return { ok: true, headers: new Headers(), body: null };
    });
    try { await assert.rejects(f.batch.read('eth_chainId')); assert.equal(f.calls.length, 1);
      assert.equal(f.calls[0].signal.aborted, true); if (mode === 'streamed') assert.equal(cancelled, true);
    } finally { f.batch.close(); }
  });

test('30s deadlines include queue time and abort all timed-out fetches, with no retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let now = 0;
  t.mock.method(performance, 'now', () => now);
  const f = fixture(() => new Promise(() => {}));
  try {
    const pending = Array.from({ length: L.maxInflightRequests + 3 }, () => f.batch.read('eth_chainId'));
    const checked = allRejected(pending, /TIMEOUT/);
    await tick(); assert.equal(f.calls.length, L.maxInflightBatches);
    now = L.timeoutMs; t.mock.timers.tick(L.timeoutMs); await checked; await tick();
    assert.equal(f.calls.length, L.maxInflightBatches); assert.ok(f.calls.every(call => call.signal.aborted));
  } finally { f.batch.close(); }
});

test('monotonic deadline is checked again after response even before a timer callback executes', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const f = fixture(requests => { now = L.timeoutMs; return response(reply(requests)); });
  try { await assert.rejects(f.batch.read('eth_chainId'), /TIMEOUT/); assert.equal(f.calls.length, 1); }
  finally { f.batch.close(); }
});

test('close rejects queued/in-flight reads promptly, aborts transport and discards late success', async () => {
  const releases = []; let lateCancelled = 0;
  const f = fixture(requests => new Promise(resolve => releases.push(() => resolve({ ok: true,
    headers: new Headers(), body: new ReadableStream({ cancel() { lateCancelled++; } }) }))));
  const pending = Array.from({ length: L.maxInflightRequests + 4 }, () => f.batch.read('eth_chainId'));
  const checked = allRejected(pending, /CLOSED/);
  await tick(); f.batch.close(); f.batch.close(); await checked;
  assert.ok(f.calls.every(call => call.signal.aborted));
  releases.forEach(release => release()); await tick(); assert.equal(lateCancelled, L.maxInflightBatches);
  await assert.rejects(f.batch.read('eth_chainId'), /CLOSED/); assert.equal(f.calls.length, L.maxInflightBatches);
});

test('close before scheduled flush sends nothing, and process loss before/after transport rejects fresh reads', async () => {
  const f = fixture(), pending = f.batch.read('eth_chainId'); const checked = allRejected([pending], /CLOSED/);
  f.batch.close(); await checked; assert.equal(f.calls.length, 0);
  const g = fixture(); const queued = g.batch.read('eth_chainId'); const lost = allRejected([queued], /PROCESS_DEAD/);
  g.kill(); await lost; assert.equal(g.calls.length, 0);
  const h = fixture(requests => { h.kill(); return response(reply(requests)); });
  try { await assert.rejects(h.batch.read('eth_chainId'), /PROCESS_DEAD/); assert.equal(h.calls.length, 1); }
  finally { h.batch.close(); }
});

test('same-head raw code/configuration/reservation contradictions still reach independent caller comparisons', async () => {
  for (const [method, params, label] of [
    ['eth_getCode', ['0x1234', '0xa'], 'FLAT_STATE_CODE_CHANGED'],
    ['eth_call', [{ to: '0x1234', data: '0xconfig' }, '0xa'], 'FLAT_STATE_VERIFIER_CONFIGURATION'],
    ['eth_call', [{ to: '0x1234', data: '0xreservation' }, '0xa'], 'FLAT_STATE_RESERVATION_CHANGED'],
  ]) {
    const f = fixture(requests => response(reply(requests, (_r, i) => i ? '0x6001' : '0x6000').reverse()));
    try {
      const compare = async () => {
        const raw = await Promise.all([f.batch.read(method, params), f.batch.read(method, params)]);
        assert.equal(raw[1], raw[0], label);
      };
      await assert.rejects(compare(), new RegExp(label)); assert.equal(f.calls[0].requests.length, 2);
      assert.deepEqual(f.calls[0].requests[0].params, f.calls[0].requests[1].params);
    } finally { f.batch.close(); }
  }
});


test('non-Error transport rejection is normalized and settles all requests immediately', async () => {
  for (const reason of [null, undefined, false, 'bad']) {
    const f = fixture(() => Promise.reject(reason));
    try { await allRejected([f.batch.read('eth_chainId'), f.batch.read('eth_accounts')], /TRANSPORT_FAILURE/); }
    finally { f.batch.close(); }
  }
});

test('streaming across four bounded responses never starts a fifth envelope until capacity is released', async () => {
  const controllers = [];
  const f = fixture(requests => new Response(new ReadableStream({ start(controller) {
    controllers.push({ controller, requests });
    // Keep just under each response cap, as a valid unfinished JSON string.
    const prefix = '[{"jsonrpc":"2.0","id":' + JSON.stringify(requests[0].id) + ',"result":"';
    controller.enqueue(Buffer.from(prefix + 'a'.repeat(L.maxResponseBytes - Buffer.byteLength(prefix) - 4)));
  } })));
  const pending = [];
  try {
    // Separate event-loop turns deliberately create four one-item envelopes.
    for (let i = 0; i < L.maxInflightBatches; i++) { pending.push(f.batch.read('eth_call')); await tick(); }
    const overflow = f.batch.read('eth_chainId'); pending.push(overflow);
    const checked = allRejected(pending, /CLOSED/);
    await tick(); assert.equal(f.calls.length, L.maxInflightBatches);
    assert.equal(controllers.length * L.maxResponseBytes, L.maxBufferedResponseBytes);
    f.batch.close(); await checked; assert.ok(f.calls.every(call => call.signal.aborted));
  } finally { f.batch.close(); }
});
