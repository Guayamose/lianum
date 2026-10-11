/** Fixed private storage worker. The child owns the derived key and live store
 * checkpoint. The parent retains only the bootstrap password and chain roles.
 * Restarting this child does not restart native authorities or spending keys. */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { types } from 'node:util';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { createClaimRecordStore, openClaimRecordStore, CLAIM_RECORD_STORE_LIMITS } from '@lianum/engine/storage/records';

const WORKER = fileURLToPath(import.meta.url);
const PROTOCOL = 'LIANUM_CLAIM_STORE_PRIVATE_IPC_V1';
const MAX_MESSAGE = CLAIM_RECORD_STORE_LIMITS.logicalBytes + 128 * 1024;
const TIMEOUT = 60_000;
const failure = code => Object.assign(new Error(code), { code });
const safeCode = error => {
  const value = error?.code ?? error?.message;
  return typeof value === 'string' && /^(?:CLAIM_STORE|VAULT)_[A-Z0-9_]+$/.exec(value)?.[0] === value
    ? value : 'CLAIM_STORE_WORKER_FAILED';
};
/** Capture the store's restricted JSON semantics before Node's JSON IPC can
 * invoke toJSON/getters or normalize NaN, -0, holes and undefined. Framing has
 * separate small headroom; logical records retain the exact V3 aggregate cap.
 * This deliberately does not change or raise the golden single-object limit. */
function capture(value, maximum = MAX_MESSAGE, maxNodes = CLAIM_RECORD_STORE_LIMITS.logicalNodes + 8192,
  maxDepth = CLAIM_RECORD_STORE_LIMITS.depth + 4) {
  const ancestors = new Set(); let bytes = 0, nodes = 0;
  const account = text => {
    bytes += Buffer.byteLength(text, 'utf8');
    assert.ok(bytes <= maximum, 'CLAIM_STORE_IPC_SIZE'); return text;
  };
  const string = value => {
    assert.ok(value.isWellFormed() && Buffer.byteLength(value, 'utf8') <= CLAIM_RECORD_STORE_LIMITS.objectPlaintextBytes,
      'CLAIM_STORE_IPC_JSON_STRING');
    return JSON.stringify(value);
  };
  const visit = (item, depth) => {
    assert.ok(++nodes <= maxNodes && depth <= maxDepth, 'CLAIM_STORE_IPC_JSON_COMPLEXITY');
    if (item === null) return account('null');
    if (typeof item === 'boolean') return account(String(item));
    if (typeof item === 'string') return account(string(item));
    if (typeof item === 'number') {
      assert.ok(Number.isSafeInteger(item) && !Object.is(item, -0), 'CLAIM_STORE_IPC_JSON_INTEGER');
      return account(String(item));
    }
    assert.ok(typeof item === 'object' && !types.isProxy(item), 'CLAIM_STORE_IPC_JSON_VALUE');
    assert.ok(!ancestors.has(item), 'CLAIM_STORE_IPC_JSON_CYCLE'); ancestors.add(item);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(item), keys = Reflect.ownKeys(descriptors);
      assert.ok(keys.every(key => typeof key === 'string'), 'CLAIM_STORE_IPC_JSON_SYMBOL');
      if (Array.isArray(item)) {
        assert.ok(Object.getPrototypeOf(item) === Array.prototype && item.length <= maxNodes && keys.length === item.length + 1,
          'CLAIM_STORE_IPC_JSON_ARRAY');
        account('[]'); const parts = [];
        for (let index = 0; index < item.length; index++) {
          const descriptor = descriptors[String(index)];
          assert.ok(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 'CLAIM_STORE_IPC_JSON_ARRAY_ELEMENT');
          if (index) account(','); parts.push(visit(descriptor.value, depth + 1));
        }
        return `[${parts.join(',')}]`;
      }
      assert.ok([Object.prototype, null].includes(Object.getPrototypeOf(item)), 'CLAIM_STORE_IPC_JSON_OBJECT');
      account('{}'); const parts = [];
      for (const key of keys.sort()) {
        const descriptor = descriptors[key], quoted = string(key);
        assert.ok(descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'CLAIM_STORE_IPC_JSON_PROPERTY');
        if (parts.length) account(','); account(`${quoted}:`);
        parts.push(`${quoted}:${visit(descriptor.value, depth + 1)}`);
      }
      return `{${parts.join(',')}}`;
    } finally { ancestors.delete(item); }
  };
  return JSON.parse(visit(value, 0));
}
const bounded = value => capture(value);
const logical = value => capture(value, CLAIM_RECORD_STORE_LIMITS.logicalBytes,
  CLAIM_RECORD_STORE_LIMITS.logicalNodes, CLAIM_RECORD_STORE_LIMITS.depth);

/** Private bootstrap, never exposed as an HTTP factory. No worker path,
 * executable, environment, RPC endpoint or shell command is caller-selectable. */
export async function startClaimRecordStoreProcess(input) {
  const startup = bounded(input);
  exactRecord(startup, ['mode', 'options', ...(Object.hasOwn(startup, 'initialData') ? ['initialData'] : [])]);
  assert.ok(['create', 'open'].includes(startup.mode), 'CLAIM_STORE_WORKER_MODE');
  assert.equal(Object.hasOwn(startup, 'initialData'), startup.mode === 'create');
  exactRecord(startup.options, ['path', 'password', 'identity']);
  startup.options.identity = capture(startup.options.identity, 64 * 1024, 4096, CLAIM_RECORD_STORE_LIMITS.depth);
  if (startup.mode === 'create') startup.initialData = logical(startup.initialData);
  let child, closePromise, pending = null, sequence = 0, closed = false, exited = false, fault = null;
  const nonce = randomBytes(32).toString('hex');
  child = fork(WORKER, ['--claim-record-worker'], {
    execArgv: ['--max-old-space-size=384'], env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    serialization: 'json', stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  // 'close' follows either 'exit' or a spawn 'error'. Some spawn failures never
  // emit 'exit', so waiting only for exit would hang startup cleanup forever.
  const completion = new Promise(resolve => child.once('close', (code, signal) => {
    exited = true;
    if (pending) { clearTimeout(pending.timer); pending.reject(failure('CLAIM_STORE_WORKER_EXIT_UNCERTAIN')); pending = null; }
    resolve({ code, signal });
  }));
  function poison(code) {
    fault ??= code;
    if (pending) { clearTimeout(pending.timer); pending.reject(failure(code)); pending = null; }
    if (!exited) child.kill('SIGTERM');
  }
  child.once('error', () => poison('CLAIM_STORE_WORKER_SPAWN_FAILED'));
  child.on('message', raw => {
    try {
      const message = bounded(raw);
      exactRecord(message, ['protocol', 'nonce', 'sequence', 'ok', ...(message.ok ? ['result'] : ['error'])]);
      assert.equal(message.protocol, PROTOCOL); assert.equal(message.nonce, nonce);
      assert.ok(pending && message.sequence === pending.sequence, 'CLAIM_STORE_IPC_RESPONSE_ORDER');
      const request = pending; pending = null; clearTimeout(request.timer);
      if (message.ok) request.resolve(message.result);
      else { fault = safeCode({ code: message.error }); request.reject(failure(fault)); }
    } catch { poison('CLAIM_STORE_IPC_INVALID_RESPONSE'); }
  });
  function request(action, body) {
    assert.ok(!closed && !exited && !fault, fault ?? 'CLAIM_STORE_WORKER_UNAVAILABLE');
    assert.equal(pending, null, 'CLAIM_STORE_WORKER_BUSY');
    const nextSequence = sequence + 1;
    const message = bounded({ protocol: PROTOCOL, nonce, sequence: nextSequence, action, body });
    sequence = nextSequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => poison('CLAIM_STORE_WORKER_TIMEOUT_UNCERTAIN'), TIMEOUT);
      pending = { sequence, resolve, reject, timer };
      child.send(message, error => { if (error) poison('CLAIM_STORE_IPC_SEND_UNCERTAIN'); });
    });
  }
  function stop() {
    return closePromise ??= (async () => {
      if (!exited && !fault && !pending) {
        try { await request('close', {}); } catch {}
      }
      closed = true;
      if (!exited) child.kill('SIGTERM');
      const force = setTimeout(() => { if (!exited) child.kill('SIGKILL'); }, 2000);
      try { return await completion; } finally { clearTimeout(force); }
    })();
  }
  try { await request('initialize', startup); }
  catch (error) { await stop(); throw error; }
  finally { startup.options.password = undefined; startup.initialData = undefined; }
  return Object.freeze({
    read: () => request('read', {}),
    update: (expectedRevision, data) => {
      assert.ok(Number.isSafeInteger(expectedRevision) && expectedRevision >= 0 && !Object.is(expectedRevision, -0),
        'CLAIM_STORE_EXPECTED_REVISION');
      return request('update', { expectedRevision, data: logical(data) });
    },
    recovery: () => request('recovery', {}),
    status: () => Object.freeze({ processId: child.pid, exited, available: !closed && !exited && !fault, uncertain: Boolean(fault) || exited && !closed }),
    close: stop,
    toJSON() { throw failure('CLAIM_STORE_PROCESS_NOT_SERIALIZABLE'); },
  });
}

async function childMain() {
  assert.equal(process.argv.length, 3);
  assert.equal(typeof process.send, 'function');
  let store, nonce, sequence = 0, busy = false, failed = false;
  process.on('message', async raw => {
    let message;
    try {
      assert.ok(!busy && !failed, 'CLAIM_STORE_WORKER_BUSY'); busy = true;
      message = bounded(raw);
      exactRecord(message, ['protocol', 'nonce', 'sequence', 'action', 'body']);
      assert.equal(message.protocol, PROTOCOL);
      assert.ok(typeof message.nonce === 'string' && message.nonce.length === 64);
      nonce ??= message.nonce; assert.equal(message.nonce, nonce); assert.equal(message.sequence, ++sequence);
      let result;
      if (message.action === 'initialize') {
        assert.ok(!store && sequence === 1, 'CLAIM_STORE_WORKER_ALREADY_INITIALIZED');
        const body = message.body;
        exactRecord(body, ['mode', 'options', ...(body.mode === 'create' ? ['initialData'] : [])]);
        assert.ok(['create', 'open'].includes(body.mode));
        try { store = body.mode === 'create' ? await createClaimRecordStore(body.options, body.initialData)
          : await openClaimRecordStore(body.options); }
        finally { body.options.password = undefined; body.initialData = undefined; }
        result = store.recovery();
      } else {
        assert.ok(store, 'CLAIM_STORE_WORKER_NOT_INITIALIZED');
        exactRecord(message.body, message.action === 'update' ? ['expectedRevision', 'data'] : []);
        if (message.action === 'read') result = await store.read();
        else if (message.action === 'update') result = await store.update(message.body.expectedRevision, () => message.body.data);
        else if (message.action === 'recovery') result = store.recovery();
        else if (message.action === 'close') { store.close(); result = { closed: true }; }
        else throw failure('CLAIM_STORE_WORKER_ACTION');
      }
      const response = bounded({ protocol: PROTOCOL, nonce, sequence, ok: true, result });
      await new Promise((resolve, reject) => process.send(response, error => error ? reject(error) : resolve()));
      if (message.action === 'close') process.disconnect();
    } catch (error) {
      failed = true;
      if (message && process.connected) process.send({ protocol: PROTOCOL, nonce: message.nonce,
        sequence: message.sequence, ok: false, error: safeCode(error) });
    } finally { busy = false; }
  });
  process.once('disconnect', () => { try { store?.close(); } catch {} process.exit(0); });
}
if (process.argv[1] === WORKER && process.argv[2] === '--claim-record-worker') await childMain();
