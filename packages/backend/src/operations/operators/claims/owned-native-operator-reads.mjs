/** Bounded fresh operator reads over original owned BTC/SOL capabilities.
 * A node's custody and graph facades share an immutable close identity and
 * exclusive observation/inventory flags and retained preparation context.
 * Serialize only these read methods;
 * never cache observations, retry failures, schedule sends or bypass fences. */
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { assertOwnedBitcoinRuntime } from '../../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import { assertOwnedSolanaRuntime, SOLANA_NONCE_INGRESS_PROFILE } from '../../../chains/solana/runtime/owned-solana-runtime.mjs';
import { exactRecord, fixedArray } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput } from '@lianum/components/plain-input';

const queues = new WeakMap(), readerQueues = new WeakMap(), quiescenceLeases = new WeakMap();
let queueIdentity = 0;
// Four registered operators, each with at most one pending read per branch.
const MAX_PENDING_READS = 8;

function queueFor(native, family) {
  assert.ok(family === '1' || family === '2', 'OPERATOR_NATIVE_READ_FAMILY');
  (family === '1' ? assertOwnedBitcoinRuntime : assertOwnedSolanaRuntime)(native);
  const close = Object.getOwnPropertyDescriptor(native, 'close');
  assert.ok(Object.isFrozen(native) && close && Object.hasOwn(close, 'value')
    && typeof close.value === 'function', 'OPERATOR_NATIVE_READ_NODE_IDENTITY');
  let queue = queues.get(close.value);
  if (!queue) {
    queue = { family, identity: queueIdentity++, pending: 0, active: 0, generation: 0n, holder: null, tail: Promise.resolve() }; queues.set(close.value, queue);
  }
  assert.equal(queue.family, family, 'OPERATOR_NATIVE_READ_NODE_FAMILY');
  return queue;
}

function readOne(queue, read) {
  assert.ok(queue.pending < MAX_PENDING_READS, 'OPERATOR_NATIVE_READ_QUEUE_FULL');
  queue.pending++;
  const result = queue.tail.then(async () => {
    assert.equal(queue.holder, null, 'OPERATOR_NATIVE_READ_QUIESCENCE_HELD');
    queue.active++; queue.generation++;
    try { return await read(); } finally { queue.active--; }
  }).finally(() => { queue.pending--; });
  // Drain a failed predecessor without replacing its own rejection or result.
  // Every next job still invokes its separate original owned read exactly once.
  queue.tail = result.then(() => {}, () => {});
  return result;
}

export function createOwnedOperatorNativeReads(input) {
  exactRecord(input, ['native', 'family']);
  const { native, family } = input, queue = queueFor(native, family);
  const readers = Object.freeze({
    factReader(options) {
      const reader = native.factReader(options);
      return Object.freeze({ observe(request) {
        const original = frozenInput(cloneInput(request));
        return readOne(queue, () => reader.observe(original));
      } });
    },
    ...(family === '2' && native.nonceIngressProfile === SOLANA_NONCE_INGRESS_PROFILE ? {
      assertPreparedIngress(request) {
        const original = frozenInput(cloneInput(request)); exactRecord(original, ['asset', 'prepared']);
        // The owned adapter compares this immutable snapshot to activePrepared,
        // then updates the context keyed by its original retained preparation.
        // Never substitute a caller adapter or make an independent context key.
        const adapter = native.adapter({ asset: original.asset, route: 'deposit' });
        assert.equal(typeof adapter.assertPrepared, 'function', 'OPERATOR_NONCE_INGRESS_PREPARED_READ_REQUIRED');
        return readOne(queue, () => adapter.assertPrepared(original.prepared));
      },
      observeReservedIngress(request) {
        const original = frozenInput(cloneInput(request)); exactRecord(original, ['asset', 'nativeId']);
        // queueFor already authenticates the original SOL runtime brand. This
        // is the fixed depositor route, never a caller-selected read adapter.
        const adapter = native.adapter({ asset: original.asset, route: 'deposit' });
        assert.equal(typeof adapter.observeReservedIngress, 'function', 'OPERATOR_NONCE_INGRESS_READ_REQUIRED');
        return readOne(queue, () => adapter.observeReservedIngress({ nativeId: original.nativeId }));
      },
    } : {}),
    assertPreparedPayout(request) {
      const original = frozenInput(cloneInput(request));
      exactRecord(original, ['asset', 'route', 'prepared']);
      assert.equal(typeof native.inventory, 'function', 'OPERATOR_PAYOUT_CUSTODY_REQUIRED');
      assert.ok(original.route === 'redeem' || original.route === 'refund', 'OPERATOR_PAYOUT_PREPARED_ROUTE');
      // Only the original branded custody facade chooses its fixed adapter.
      // This is an assertion, never a preparation/sign/send API. The runtime
      // must match activeRoute and activePrepared in its original read window.
      // SOL revalidation advances only the retained activePrepared context key;
      // the immutable caller snapshot cannot create a new context or authority.
      const adapter = native.adapter({ asset: original.asset, route: original.route });
      assert.equal(typeof adapter.assertPrepared, 'function', 'OPERATOR_PAYOUT_PREPARED_READ_REQUIRED');
      return readOne(queue, () => adapter.assertPrepared(original.prepared));
    },
    inventory() {
      assert.equal(arguments.length, 0, 'OPERATOR_NATIVE_INVENTORY_NO_INPUT');
      assert.equal(typeof native.inventory, 'function', 'OPERATOR_NATIVE_CUSTODY_INVENTORY_REQUIRED');
      return readOne(queue, () => native.inventory());
    },
  });
  readerQueues.set(readers, queue); return readers;
}


/** A coordination fence, never a native observation or signing authority.
 * Only original factory reader handles select physical queues. Acquire in one
 * private global order, drain earlier jobs, and hold later jobs through the
 * caller's short synchronous key/return continuation. No callback is accepted. */
export async function quiesceOwnedOperatorNativeReads(readers) {
  assert.equal(arguments.length, 1, 'OPERATOR_NATIVE_QUIESCENCE_NO_OPTIONS');
  assert.ok(Array.isArray(readers) && !types.isProxy(readers), 'OPERATOR_NATIVE_QUIESCENCE_READERS');
  assert.ok(readers.length > 0 && readers.length <= 8, 'OPERATOR_NATIVE_QUIESCENCE_READERS'); fixedArray(readers, readers.length);
  const selected = [...new Set(readers.map(reader => {
    const queue = readerQueues.get(reader); assert.ok(queue, 'OPERATOR_NATIVE_ORIGINAL_READER_REQUIRED'); return queue;
  }))].sort((a, b) => a.identity - b.identity);
  const token = Object.freeze(Object.create(null)), state = { queues: [], released: false };
  quiescenceLeases.set(token, state);
  try {
    for (const queue of selected) {
      assert.ok(queue.pending < MAX_PENDING_READS, 'OPERATOR_NATIVE_READ_QUEUE_FULL'); queue.pending++;
      let release; const held = new Promise(resolve => { release = resolve; });
      const acquired = queue.tail.then(() => {
        assert.equal(queue.active, 0, 'OPERATOR_NATIVE_READ_NOT_IDLE');
        assert.equal(queue.holder, null, 'OPERATOR_NATIVE_QUIESCENCE_CONFLICT');
        queue.holder = token; queue.generation++;
        state.queues.push({ queue, generation: queue.generation, release });
      });
      // This hold drains in FIFO order just like a read, without invoking any
      // native API or forgiving a previous job's own failure.
      queue.tail = acquired.then(() => held).finally(() => { queue.pending--; }).then(() => {}, () => {});
      await acquired;
    }
    assertOwnedOperatorNativeReadsQuiescent(token); return token;
  } catch (cause) { releaseOwnedOperatorNativeReadQuiescence(token); throw cause; }
}
export function assertOwnedOperatorNativeReadsQuiescent(token) {
  assert.equal(arguments.length, 1, 'OPERATOR_NATIVE_QUIESCENCE_NO_OPTIONS');
  const state = quiescenceLeases.get(token); assert.ok(state, 'OPERATOR_NATIVE_PRIVATE_QUIESCENCE_REQUIRED');
  for (const { queue, generation } of state.queues) {
    assert.equal(queue.active, 0, 'OPERATOR_NATIVE_READ_NOT_IDLE');
    assert.equal(queue.generation, generation, 'OPERATOR_NATIVE_READ_GENERATION_CHANGED');
    assert.equal(queue.holder, state.released ? null : token, 'OPERATOR_NATIVE_QUIESCENCE_CHANGED');
  }
}
export function releaseOwnedOperatorNativeReadQuiescence(token) {
  const state = quiescenceLeases.get(token); assert.ok(state, 'OPERATOR_NATIVE_PRIVATE_QUIESCENCE_REQUIRED');
  if (state.released) return;
  state.released = true;
  for (const { queue, release } of state.queues) {
    assert.equal(queue.holder, token, 'OPERATOR_NATIVE_QUIESCENCE_CHANGED'); queue.holder = null; release();
  }
}
