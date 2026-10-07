/** Bounded private recipient IPC. Bootstrap travels over fd3, never argv/env.
 * Owner requests cannot change pinned terms, destination, or request arbitrary
 * signatures. This trusted-host process boundary is not an OS security sandbox.
 */
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canonical } from '../../../crypto/privacy.mjs';
import { createNativeRecipientCustody, recoverNativeRecipientCustody, NATIVE_RECIPIENT_PROFILE } from './native-recipient-custody.mjs';

const MAX_BYTES = 64 * 1024;
const ERROR_PATTERN = /^(?:PAEG_RECIPIENT|VAULT)_[A-Z_]+$/;
const problem = code => Object.assign(new Error(code), { code });
const need = (ok, code = 'PAEG_RECIPIENT_IPC_INPUT') => { if (!ok) throw problem(code); };
const ownedRecipientProcesses = new WeakSet();
export function assertOwnedNativeRecipientProcess(recipient) {
  need(ownedRecipientProcesses.has(recipient), 'PAEG_RECIPIENT_OWNED_PROCESS_CAPABILITY');
}
const codeFor = error => ERROR_PATTERN.test(error?.code || '') ? error.code : 'PAEG_RECIPIENT_REJECTED';
function exact(value, fields) {
  canonical(value);
  need(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)));
}
function bootstrap(input) {
  exact(input, ['mode', 'path', 'password', 'expectedTerms', 'withdrawalRecipient']);
  need(input.mode === 'create' || input.mode === 'recover');
  return JSON.parse(canonical(input));
}
const reply = value => new Promise((resolve, reject) => process.stdout.write(JSON.stringify(value) + '\n', error => error ? reject(error) : resolve()));

async function worker() {
  const stream = createReadStream(null, { fd: 3, autoClose: true }), buffer = Buffer.alloc(MAX_BYTES);
  let length = 0, boot, custody;
  try {
    for await (const chunk of stream) {
      need(length + chunk.length <= MAX_BYTES, 'PAEG_RECIPIENT_IPC_SIZE');
      chunk.copy(buffer, length); length += chunk.length;
    }
    boot = bootstrap(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))));
  } finally { buffer.fill(0); }
  const { mode, ...cfg } = boot;
  custody = await (mode === 'create' ? createNativeRecipientCustody(cfg) : recoverNativeRecipientCustody(cfg));
  boot.password = ''; cfg.password = ''; // No JavaScript secret-zeroization claim.
  let queue = Promise.resolve(), stopping = false, pending = '';
  function cleanup() {
    if (stopping) return;
    stopping = true; custody.close(); process.stdin.destroy();
  }
  function receive(line) {
    queue = queue.then(async () => {
      if (stopping) return;
      let id = null;
      try {
        const request = JSON.parse(line);
        exact(request, ['id', 'operation', 'input']);
        need(Number.isSafeInteger(request.id) && request.id > 0); id = request.id;
        let value;
        switch (request.operation) {
          case 'offer': need(request.input === null); value = custody.offer(); break;
          case 'acceptedQuote': need(request.input === null); value = custody.acceptedQuote(); break;
          case 'withdrawalStatus': need(request.input === null); value = custody.withdrawalStatus(); break;
          case 'acceptInvoice': value = await custody.acceptInvoice(request.input); break;
          case 'authorizeWithdrawal': value = await custody.authorizeWithdrawal(request.input); break;
          case 'close': need(request.input === null); value = { closed: true }; break;
          default: need(false, 'PAEG_RECIPIENT_OPERATION_DENIED');
        }
        await reply({ id, ok: true, value });
        if (request.operation === 'close') cleanup();
      } catch (error) { await reply({ id, ok: false, code: codeFor(error) }); }
    }).catch(() => { cleanup(); process.exitCode = 1; });
  }
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (stopping) return;
    pending += chunk;
    const lines = pending.split('\n'); pending = lines.pop();
    if (Buffer.byteLength(pending) > MAX_BYTES || lines.some(line => Buffer.byteLength(line) > MAX_BYTES)) {
      process.stdin.pause();
      queue = queue.then(async () => { await reply({ id: null, ok: false, code: 'PAEG_RECIPIENT_IPC_SIZE' }); cleanup(); });
      return;
    }
    for (const line of lines) receive(line);
  });
  process.stdin.on('end', () => { queue = queue.then(cleanup); });
  process.stdin.on('error', () => { queue = queue.then(cleanup); });
  await reply({ event: 'ready', profile: NATIVE_RECIPIENT_PROFILE });
}

/** Fixed child entry point; no caller script, environment, or signing callback.
 * Failed/uncertain replies must be reconciled with mode:'recover'. Exact invoice
 * and withdrawal retries return the retained signature/witness after restart.
 * close() waits for the actual OS process exit, not just an IPC acknowledgement.
 */
export async function createNativeRecipientProcess(input) {
  const boot = bootstrap(input), encoded = Buffer.from(canonical(boot));
  need(encoded.length <= MAX_BYTES, 'PAEG_RECIPIENT_IPC_SIZE');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker'], {
    env: { LANG: 'C.UTF-8' }, stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
  });
  boot.password = '';
  let count = 0, pending, buffer = '', failure, stopping = false, finished = false, timer;
  let resolveReady, rejectReady, resolveExit;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const exited = new Promise(resolve => { resolveExit = resolve; });
  const lifecycle = { profile: NATIVE_RECIPIENT_PROFILE, started: true, pid: child.pid, exited: false, completedRequests: 0 };
  function fail(error) {
    failure ??= problem(codeFor(error));
    clearTimeout(timer); rejectReady(failure);
    if (pending) { pending.reject(failure); pending = null; }
    if (!finished) {
      child.kill('SIGTERM');
      timer = setTimeout(() => { if (!finished) child.kill('SIGKILL'); }, 1000);
    }
  }
  child.once('error', () => fail(problem('PAEG_RECIPIENT_SPAWN')));
  child.once('close', (code, signal) => {
    finished = true; clearTimeout(timer); lifecycle.exited = true; lifecycle.exit = { code, signal };
    if (!stopping || pending || code !== 0) fail(problem('PAEG_RECIPIENT_CHILD_EXIT'));
    for (const stream of child.stdio) stream?.destroy();
    resolveExit(structuredClone(lifecycle));
  });
  child.stderr.on('data', bytes => { bytes.fill(0); fail(problem('PAEG_RECIPIENT_UNEXPECTED_LOG')); });
  for (const stream of [child.stdin, child.stdout, child.stderr, child.stdio[3]]) {
    stream.on('error', () => fail(problem('PAEG_RECIPIENT_IO')));
  }
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    try {
      buffer += chunk;
      const lines = buffer.split('\n'); buffer = lines.pop();
      need(Buffer.byteLength(buffer) <= MAX_BYTES && lines.every(line => Buffer.byteLength(line) <= MAX_BYTES), 'PAEG_RECIPIENT_IPC_SIZE');
      for (const line of lines) {
        const response = JSON.parse(line);
        if (response.event === 'ready') {
          exact(response, ['event', 'profile']);
          need(count === 0 && response.profile === NATIVE_RECIPIENT_PROFILE, 'PAEG_RECIPIENT_PROTOCOL');
          clearTimeout(timer); resolveReady();
        } else if (response.event === 'startupRejected') {
          exact(response, ['event', 'code']); fail(problem(response.code));
        } else {
          need(pending && response.id === pending.id, 'PAEG_RECIPIENT_PROTOCOL');
          exact(response, response.ok === true ? ['id', 'ok', 'value'] : ['id', 'ok', 'code']);
          need(response.ok === true || (response.ok === false && ERROR_PATTERN.test(response.code)), 'PAEG_RECIPIENT_PROTOCOL');
          const current = pending; pending = null; clearTimeout(timer);
          if (response.ok === true) { lifecycle.completedRequests++; current.resolve(response.value); }
          else current.reject(problem(response.code));
        }
      }
    } catch (error) { fail(error); }
  });
  timer = setTimeout(() => fail(problem('PAEG_RECIPIENT_START_TIMEOUT')), 15000);
  child.stdio[3].end(encoded, () => encoded.fill(0));
  async function request(operation, value) {
    need(!failure && !finished && !pending && (!stopping || operation === 'close'), 'PAEG_RECIPIENT_BUSY_OR_CLOSED');
    const message = Buffer.from(canonical({ id: ++count, operation, input: value }));
    need(message.length <= MAX_BYTES, 'PAEG_RECIPIENT_IPC_SIZE');
    const response = new Promise((resolve, reject) => { pending = { id: count, resolve, reject }; });
    timer = setTimeout(() => fail(problem('PAEG_RECIPIENT_REQUEST_TIMEOUT')), 15000);
    child.stdin.write(Buffer.concat([message, Buffer.from('\n')]), error => { message.fill(0); if (error) fail(problem('PAEG_RECIPIENT_IO')); });
    return response;
  }
  try { await ready; }
  catch (error) { await exited; throw error; }
  const recipient = Object.freeze({
    offer: () => request('offer', null),
    acceptInvoice: value => request('acceptInvoice', value),
    acceptedQuote: () => request('acceptedQuote', null),
    withdrawalStatus: () => request('withdrawalStatus', null),
    authorizeWithdrawal: value => request('authorizeWithdrawal', value),
    report: () => structuredClone(lifecycle),
    async close() {
      if (!stopping) {
        stopping = true;
        if (!failure && !finished && !pending) {
          try {
            await request('close', null);
            if (!finished) timer = setTimeout(() => fail(problem('PAEG_RECIPIENT_CLOSE_TIMEOUT')), 5000);
          }
          catch (error) { fail(error); }
        } else if (!finished) fail(problem('PAEG_RECIPIENT_CANCELLED'));
      }
      return exited;
    },
  });
  ownedRecipientProcesses.add(recipient);
  return recipient;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--worker') {
  worker().catch(async error => {
    await reply({ event: 'startupRejected', code: codeFor(error) }).catch(() => {});
    process.exitCode = 1;
  });
}
