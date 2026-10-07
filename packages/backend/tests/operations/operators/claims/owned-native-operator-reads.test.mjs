/** Host-only ownership and exclusive-read fixtures; no native process or RPC. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const owned = new WeakSet();
for (const [file, name] of [['bitcoin', 'assertOwnedBitcoinRuntime'], ['solana', 'assertOwnedSolanaRuntime']])
  mock.module(new URL('../chain-adapters/owned-' + file + '-runtime.mjs', import.meta.url).href,
    { exports: { ...(file === 'solana' ? { SOLANA_NONCE_INGRESS_PROFILE: 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3' } : {}), [name](native) { assert.ok(owned.has(native), 'TEST_ORIGINAL_NATIVE_REQUIRED'); } } });
const { createOwnedOperatorNativeReads, quiesceOwnedOperatorNativeReads, assertOwnedOperatorNativeReadsQuiescent, releaseOwnedOperatorNativeReadQuiescence } = await import('../../../../src/operations/operators/claims/owned-native-operator-reads.mjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function node(family = '2') {
  const events = [], state = { active: false, closed: false, count: 0, before: null, sends: 0 };
  const close = () => { state.closed = true; };
  async function read(scope, request) {
    assert.equal(state.active, false, 'TEST_NATIVE_READ_BUSY'); assert.equal(state.closed, false, 'TEST_NATIVE_CLOSED');
    state.active = true; const count = ++state.count; events.push({ scope, request, count });
    try { await state.before?.(count); return Object.freeze({ count, scope, request }); }
    finally { state.active = false; }
  }
  const facade = scope => {
    const native = Object.freeze({ close,
      inventory: () => read(scope + '-inventory'),
      factReader() { return Object.freeze({ observe: request => read(scope + '-observation', request) }); },
      send() { state.sends++; },
    });
    owned.add(native); return { native, reads: createOwnedOperatorNativeReads({ native, family }) };
  };
  return { custody: facade('custody'), graph: facade('graph'), state, events };
}

test('same-node custody and graph reads are fresh distinct FIFO operations across both method types', async () => {
  const f = node(), gate = deferred(), entered = deferred();
  f.state.before = async count => { if (count === 1) { entered.resolve(); await gate.promise; } };
  const first = f.custody.reads.inventory(); await entered.promise;
  const request = { nativeId: 'original' };
  const second = f.graph.reads.factReader({}).observe(request);
  request.nativeId = 'changed-after-enqueue';
  const third = f.custody.reads.factReader({}).observe({ nativeId: 'another' });
  assert.equal(f.state.count, 1); gate.resolve();
  const results = await Promise.all([first, second, third]);
  assert.deepEqual(results.map(row => row.count), [1, 2, 3]);
  assert.deepEqual(f.events.map(row => row.scope), ['custody-inventory', 'graph-observation', 'custody-observation']);
  assert.equal(results[1].request.nativeId, 'original'); assert.ok(Object.isFrozen(results[1].request));
  assert.notEqual(results[1], results[2]); assert.equal(f.state.active, false); assert.equal(f.state.sends, 0);
  assert.deepEqual(Object.keys(f.custody.reads), ['factReader', 'assertPreparedPayout', 'inventory']);
});

test('one read rejection is preserved exactly and does not cancel, retry or reuse its queued sibling', async () => {
  const f = node('1'), original = new Error('TEST_ORIGINAL_FAILURE');
  f.state.before = count => { if (count === 1) throw original; };
  const results = await Promise.allSettled([f.custody.reads.inventory(), f.graph.reads.factReader({}).observe({ nativeId: 'fresh' })]);
  assert.equal(results[0].status, 'rejected'); assert.equal(results[0].reason, original);
  assert.equal(results[1].status, 'fulfilled'); assert.equal(results[1].value.count, 2);
  assert.equal(f.state.count, 2); assert.equal(f.state.active, false);
});

test('independent original nodes do not share a queue', async () => {
  const a = node(), b = node(), entered = deferred(), gate = deferred();
  a.state.before = async () => { entered.resolve(); await gate.promise; };
  const pending = a.custody.reads.inventory(); await entered.promise;
  const independent = await b.custody.reads.inventory();
  assert.equal(independent.count, 1); assert.equal(a.state.active, true);
  gate.resolve(); await pending;
});

test('the queue includes at most eight running or pending read operations and drains before reuse', async () => {
  const f = node(), gate = deferred(), entered = deferred();
  f.state.before = async count => { if (count === 1) { entered.resolve(); await gate.promise; } };
  const reads = [f.custody.reads.inventory()]; await entered.promise;
  for (let i = 1; i < 8; i++) reads.push(f.graph.reads.inventory());
  assert.throws(() => f.custody.reads.inventory(), /OPERATOR_NATIVE_READ_QUEUE_FULL/);
  assert.equal(f.state.count, 1); gate.resolve();
  assert.deepEqual((await Promise.all(reads)).map(row => row.count), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal((await f.custody.reads.inventory()).count, 9);
});

test('external native close or write fences remain authoritative for queued original reads', async () => {
  const f = node(), gate = deferred(), entered = deferred();
  f.state.before = async count => { if (count === 1) { entered.resolve(); await gate.promise; } };
  const first = f.custody.reads.inventory(); await entered.promise;
  const second = f.graph.reads.inventory(); const settled = Promise.allSettled([first, second]);
  f.graph.native.close(); gate.resolve();
  const results = await settled;
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
  assert.match(results[1].reason.message, /TEST_NATIVE_CLOSED/); assert.equal(f.state.count, 1);
});

test('copies, proxies and forged close identities cannot create scheduling authority', () => {
  const f = node(); let reads = 0;
  for (const native of [{ ...f.graph.native }, new Proxy(f.graph.native, { get() { reads++; throw Error('UNEXPECTED'); } }),
    { get close() { reads++; throw Error('UNEXPECTED'); } }])
    assert.throws(() => createOwnedOperatorNativeReads({ native, family: '2' }), /TEST_ORIGINAL_NATIVE_REQUIRED/);
  assert.equal(reads, 0);
  assert.throws(() => createOwnedOperatorNativeReads({ native: f.graph.native, family: '3' }), /OPERATOR_NATIVE_READ_FAMILY/);
  assert.throws(() => f.graph.reads.inventory({ inject: true }), /OPERATOR_NATIVE_INVENTORY_NO_INPUT/);
});

test('payout preparations share the exact node FIFO with fresh graph observations and custody inventory', async () => {
  for (const family of ['1', '2']) for (const route of ['redeem', 'refund']) {
    const originalPrepared = Object.freeze({ intent: Object.freeze({ value: 'original' }) });
    let active = false, context = 0, reads = 0, sends = 0;
    const events = [], gate = deferred(), entered = deferred(), close = () => {};
    async function originalRead(kind, prepared) {
      assert.equal(active, false, 'TEST_COLLISION'); active = true; events.push(kind);
      try { if (++reads === 1) { entered.resolve(); await gate.promise; }
        if (kind === 'prepared') { assert.deepEqual(prepared, originalPrepared); assert.notEqual(prepared, originalPrepared); context++; }
      } finally { active = false; }
    }
    const custody = Object.freeze({ close, adapter(options) {
      assert.deepEqual(options, { asset: 'asset', route });
      return Object.freeze({ assertPrepared: value => originalRead('prepared', value), transfer() { sends++; } });
    }, inventory: () => originalRead('inventory'), factReader: () => ({ observe: () => originalRead('claim-observation') }) });
    const graph = Object.freeze({ close, factReader: () => ({ observe: () => originalRead('graph-observation') }) });
    owned.add(custody); owned.add(graph);
    const c = createOwnedOperatorNativeReads({ native: custody, family }), g = createOwnedOperatorNativeReads({ native: graph, family });
    const request = { asset: 'asset', route, prepared: structuredClone(originalPrepared) };
    const first = c.assertPreparedPayout(request); await entered.promise;
    const rest = [g.factReader({}).observe({ id: 1 }), c.inventory(), c.assertPreparedPayout(request)];
    request.prepared.intent.value = 'altered'; request.route = 'deposit';
    gate.resolve(); await Promise.all([first, ...rest]);
    assert.deepEqual(events, ['prepared', 'graph-observation', 'inventory', 'prepared']);
    assert.equal(context, 2); assert.equal(sends, 0); assert.equal(active, false);
    for (const route of ['deposit', 'graph', '', null])
      assert.throws(() => c.assertPreparedPayout({ asset: 'asset', route, prepared: originalPrepared }), /OPERATOR_PAYOUT_PREPARED_ROUTE/);
    assert.throws(() => c.assertPreparedPayout({ asset: 'asset', route: 'refund', prepared: originalPrepared, adapter: {} }));
  }
});


test('V4 quiescence drains earlier reads and holds later reads through a synchronous fixed key/return continuation', async () => {
  const f = node(), entered = deferred(), gate = deferred();
  f.state.before = async count => { if (count === 1) { entered.resolve(); await gate.promise; } };
  const first = f.custody.reads.inventory(); await entered.promise;
  const awaitingFence = quiesceOwnedOperatorNativeReads([f.custody.reads, f.graph.reads]);
  const later = f.graph.reads.inventory(); gate.resolve(); await first;
  const fence = await awaitingFence;
  assert.equal(f.state.count, 1); assert.equal(f.state.active, false);
  assertOwnedOperatorNativeReadsQuiescent(fence);
  releaseOwnedOperatorNativeReadQuiescence(fence);
  // Queue progress cannot interleave with this final synchronous stack.
  assertOwnedOperatorNativeReadsQuiescent(fence);
  await later; assert.equal(f.state.count, 2);
  assert.throws(() => assertOwnedOperatorNativeReadsQuiescent(fence), /GENERATION_CHANGED/);
  await f.custody.reads.inventory();
  assert.throws(() => assertOwnedOperatorNativeReadsQuiescent(fence), /GENERATION_CHANGED/);
});

test('V4 quiescence multi-node acquisition uses one physical order and accepts no copied reader/token', async () => {
  const a = node('1'), b = node('2');
  const one = quiesceOwnedOperatorNativeReads([a.custody.reads, b.custody.reads]);
  const two = quiesceOwnedOperatorNativeReads([b.graph.reads, a.graph.reads]);
  const first = await one; assertOwnedOperatorNativeReadsQuiescent(first);
  releaseOwnedOperatorNativeReadQuiescence(first);
  const second = await two; assertOwnedOperatorNativeReadsQuiescent(second);
  assert.throws(() => assertOwnedOperatorNativeReadsQuiescent(first), /GENERATION_CHANGED/);
  releaseOwnedOperatorNativeReadQuiescence(second);
  await assert.rejects(quiesceOwnedOperatorNativeReads([{ ...a.custody.reads }]), /ORIGINAL_READER_REQUIRED/);
  assert.throws(() => assertOwnedOperatorNativeReadsQuiescent({}), /PRIVATE_QUIESCENCE_REQUIRED/);
  assert.equal(a.state.count + b.state.count, 0, 'quiescence itself creates no native observation');
});

test('V4 quiescence never cancels or hides the earlier read failure', async () => {
  const f = node(), original = Error('TEST_FAIL_RETAINED');
  f.state.before = () => { throw original; };
  const failed = f.custody.reads.inventory(), rejection = assert.rejects(failed, error => error === original);
  const fence = await quiesceOwnedOperatorNativeReads([f.graph.reads]); await rejection;
  assertOwnedOperatorNativeReadsQuiescent(fence); releaseOwnedOperatorNativeReadQuiescence(fence);
  assert.equal(f.state.count, 1);
});
