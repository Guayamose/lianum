/** Private owned-runtime transport plumbing, not an application RPC capability.
 * There is deliberately no endpoint, key, signer, retry, cache or deduplication
 * option. Only the runtime supplies its fixed-loopback HTTP closure. Every
 * invocation retains its own request, deadline, ID and response.
 */
import assert from 'node:assert/strict';

export const OWNED_EVM_READ_BATCH_LIMITS = Object.freeze({
  // Six independent actor/pool readers can each issue 130 × 3 evidence reads.
  maxQueued: 4096, maxQueuedBytes: 8_388_608, maxBatchSize: 32, maxInflightRequests: 128, maxInflightBatches: 4,
  maxRequestBytes: 524_288, maxBatchBytes: 1_048_576,
  maxResponseBytes: 2_097_152, maxBufferedResponseBytes: 8_388_608, timeoutMs: 30_000,
});
const LIMIT = OWNED_EVM_READ_BATCH_LIMITS;
const reads = new Set(['eth_getCode', 'eth_call', 'eth_getBalance', 'eth_getBlockByNumber', 'eth_chainId', 'eth_accounts']);
const failure = reason => new Error('OWNED_EVM_READ_BATCH_' + reason);
const check = (condition, reason) => { if (!condition) throw failure(reason); };
const freeze = value => {
  if (value && typeof value === 'object') { for (const entry of Object.values(value)) freeze(entry); Object.freeze(value); }
  return value;
};
function copyJson(value, depth = 0, budget = { bytes: 0, nodes: 0 }) {
  check(depth <= 16 && ++budget.nodes <= 4096, 'REQUEST_STRUCTURE');
  if (typeof value === 'string') { budget.bytes += Buffer.byteLength(value); check(budget.bytes <= LIMIT.maxRequestBytes, 'REQUEST_BYTES'); return value; }
  if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  check(value && typeof value === 'object' && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype), 'REQUEST_STRUCTURE');
  const result = Array.isArray(value) ? [] : {};
  const keys = Reflect.ownKeys(value).filter(key => !(Array.isArray(value) && key === 'length'));
  if (Array.isArray(value)) check(keys.length === value.length && keys.every((key, i) => key === String(i)), 'REQUEST_STRUCTURE');
  for (const key of keys) {
    check(typeof key === 'string', 'REQUEST_STRUCTURE');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, 'REQUEST_STRUCTURE');
    budget.bytes += Buffer.byteLength(key); check(budget.bytes <= LIMIT.maxRequestBytes, 'REQUEST_BYTES');
    Object.defineProperty(result, key, { value: copyJson(descriptor.value, depth + 1, budget), enumerable: true });
  }
  return Object.freeze(result);
}

/** Internal dependency only: the owned runtime holds the returned controller
 * in its constructor closure. It never exposes this factory or controller on
 * the runtime/application interface. Limits and method allowlist are fixed. */
export function createOwnedEvmReadBatch({ assertAlive, postBatch, ...extra }) {
  assert.deepEqual(Object.keys(extra), [], 'OWNED_EVM_READ_BATCH_FIXED_OPTIONS');
  assert.equal(typeof assertAlive, 'function'); assert.equal(typeof postBatch, 'function');
  let closed = false, scheduled = false, nextId = 0n, inflightRequests = 0, bufferedBytes = 0, queuedBytes = 0;
  const queue = [], active = new Set();
  const alive = () => { check(!closed, 'CLOSED'); assertAlive(); };
  const settle = (entry, error, result) => {
    if (entry.settled) return;
    entry.settled = true; clearTimeout(entry.timer);
    if (error) entry.reject(error); else entry.resolve(result);
  };
  const schedule = () => {
    if (closed || scheduled || queue.length === 0) return;
    scheduled = true; queueMicrotask(() => { scheduled = false; flush(); });
  };
  const cancelBody = response => { try { Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch {} };
  const finish = (batch, error, results) => {
    if (batch.finished) return;
    if (results === undefined && !(error instanceof Error)) error = failure('TRANSPORT_FAILURE');
    batch.finished = true;
    if (error) batch.controller.abort(error);
    for (const entry of batch.entries) settle(entry, error ?? results.get(entry.request.id).error, results?.get(entry.request.id).result);
    active.delete(batch); inflightRequests -= batch.entries.length;
    bufferedBytes -= batch.bufferedBytes; batch.bufferedBytes = 0;
    schedule();
  };
  const liveBatch = batch => {
    alive(); check(!batch.finished && !batch.controller.signal.aborted, 'ABORTED');
    check(batch.entries.every(entry => performance.now() < entry.deadline), 'TIMEOUT');
  };
  // Racing the private transport also settles callers when a faulty test/mock
  // ignores AbortSignal. A late response is discarded and its body cancelled.
  const abortable = (promise, signal, onLate = () => {}) => new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason ?? failure('ABORTED')); };
    if (signal.aborted) { abort(); Promise.resolve(promise).then(onLate, () => {}); return; }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) onLate(value); else resolve(value);
    }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
  const responseValues = (value, entries) => {
    check(Array.isArray(value) && value.length === entries.length, 'RESPONSE_COUNT');
    const ids = new Set(entries.map(entry => entry.request.id)), results = new Map();
    for (const item of value) {
      check(item && typeof item === 'object' && !Array.isArray(item) && item.jsonrpc === '2.0', 'RESPONSE_ENVELOPE');
      check(typeof item.id === 'string' && ids.has(item.id) && !results.has(item.id), 'RESPONSE_ID');
      const hasResult = Object.hasOwn(item, 'result'), hasError = Object.hasOwn(item, 'error');
      check(hasResult !== hasError && Object.keys(item).length === 3, 'RESPONSE_ENVELOPE');
      if (hasError) {
        const rpc = item.error;
        check(rpc && typeof rpc === 'object' && !Array.isArray(rpc) && Number.isSafeInteger(rpc.code)
          && typeof rpc.message === 'string' && Object.keys(rpc).every(key => ['code', 'message', 'data'].includes(key)), 'RESPONSE_ERROR');
        const error = new Error('OWNED_RPC_REMOTE_ERROR'); error.rpcCode = rpc.code;
        // Preserve bounded raw revert bytes from the genuine loopback response.
        // Never copy provider prose/objects or infer a selector from a message.
        if (typeof rpc.data === 'string' && rpc.data.length <= 262146
          && /^0x(?:[0-9a-f]{2})*$/i.test(rpc.data)) error.rpcData = rpc.data.toLowerCase();
        results.set(item.id, { error });
      } else results.set(item.id, { result: item.result });
    }
    check(results.size === ids.size, 'RESPONSE_ID'); return results;
  };
  const run = async batch => {
    let reader, response;
    try {
      liveBatch(batch);
      response = await abortable(postBatch(batch.body, batch.controller.signal), batch.controller.signal, cancelBody);
      liveBatch(batch); check(response?.ok === true, 'HTTP_ERROR');
      const length = response.headers?.get('content-length');
      if (length !== null && length !== undefined) check(/^(?:0|[1-9][0-9]*)$/.test(length)
        && Number(length) <= LIMIT.maxResponseBytes, 'RESPONSE_BYTES');
      check(response.body && typeof response.body.getReader === 'function', 'RESPONSE_BODY');
      reader = response.body.getReader(); const chunks = [];
      while (true) {
        const { done, value } = await abortable(reader.read(), batch.controller.signal);
        liveBatch(batch); if (done) break;
        check(value instanceof Uint8Array, 'RESPONSE_BODY');
        check(batch.bufferedBytes + value.byteLength <= LIMIT.maxResponseBytes
          && bufferedBytes + value.byteLength <= LIMIT.maxBufferedResponseBytes, 'RESPONSE_BYTES');
        const chunk = Buffer.from(value); chunks.push(chunk);
        batch.bufferedBytes += chunk.byteLength; bufferedBytes += chunk.byteLength;
      }
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, batch.bufferedBytes));
      const results = responseValues(JSON.parse(raw), batch.entries);
      // Validate the complete response bijection before fulfilling even one
      // caller, then re-check ownership/liveness/deadlines after body parsing.
      liveBatch(batch); finish(batch, null, results);
    } catch (error) { finish(batch, error); }
    finally {
      if (reader) { try { Promise.resolve(reader.cancel()).catch(() => {}); reader.releaseLock(); } catch {} }
      else cancelBody(response);
    }
  };
  function flush() {
    if (closed) return;
    try { alive(); } catch (error) { close(error); return; }
    while (queue.length && active.size < LIMIT.maxInflightBatches && inflightRequests < LIMIT.maxInflightRequests) {
      const entries = []; let bytes = 2;
      while (queue.length && entries.length < LIMIT.maxBatchSize && entries.length + inflightRequests < LIMIT.maxInflightRequests) {
        const entry = queue[0];
        if (performance.now() >= entry.deadline) { queue.shift(); queuedBytes -= entry.bytes; settle(entry, failure('TIMEOUT')); continue; }
        const next = entry.bytes + (entries.length ? 1 : 0);
        if (bytes + next > LIMIT.maxBatchBytes) break;
        queue.shift(); queuedBytes -= entry.bytes; entries.push(entry); bytes += next;
      }
      if (!entries.length) break;
      const batch = { entries, body: '[' + entries.map(entry => entry.raw).join(',') + ']', controller: new AbortController(), bufferedBytes: 0, finished: false };
      active.add(batch); inflightRequests += entries.length;
      for (const entry of entries) entry.batch = batch;
      void run(batch);
    }
  }
  function close(error = failure('CLOSED')) {
    if (closed) return; closed = true;
    if (!(error instanceof Error)) error = failure('TRANSPORT_FAILURE');
    for (const entry of queue.splice(0)) settle(entry, error); queuedBytes = 0;
    for (const batch of [...active]) finish(batch, error);
  }
  const read = async (method, params = []) => {
    alive(); check(reads.has(method), 'METHOD_NOT_ALLOWED');
    check(queue.length < LIMIT.maxQueued, 'QUEUE_FULL');
    const deadline = performance.now() + LIMIT.timeoutMs;
    check(Array.isArray(params), 'REQUEST_PARAMS');
    const request = freeze({ jsonrpc: '2.0', id: 'owned-read-' + (++nextId), method, params: copyJson(params) });
    const raw = JSON.stringify(request), bytes = Buffer.byteLength(raw); check(bytes <= LIMIT.maxRequestBytes, 'REQUEST_BYTES');
    check(queuedBytes + bytes <= LIMIT.maxQueuedBytes, 'QUEUE_BYTES');
    alive(); check(performance.now() < deadline, 'TIMEOUT');
    return new Promise((resolve, reject) => {
      const entry = { request, raw, bytes, deadline, resolve, reject, settled: false, batch: null, timer: null };
      entry.timer = setTimeout(() => {
        if (entry.settled) return;
        if (entry.batch) finish(entry.batch, failure('TIMEOUT'));
        else { const index = queue.indexOf(entry); if (index !== -1) { queue.splice(index, 1); queuedBytes -= entry.bytes; } settle(entry, failure('TIMEOUT')); schedule(); }
      }, Math.max(0, deadline - performance.now()));
      queue.push(entry); queuedBytes += bytes; schedule();
    });
  };
  return Object.freeze({ supports: method => reads.has(method), read, close });
}
