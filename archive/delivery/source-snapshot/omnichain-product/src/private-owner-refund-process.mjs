/** Recovery-only M21 signer on a trusted common host. fd3 contains the pinned
 * binding/path/password, then EOF. stdin/stdout belong only to the surviving
 * keeper, NEVER the public wallet/coordinator/assembler/producer channels.
 * No creation, key export, arbitrary signing, invoices, network or proof route.
 */
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonical } from './privacy.mjs';
import { recoverOwnerRefundCustody } from './private-owner-refund-custody.mjs';
import { createAssemblyFrameDecoder } from './private-assembly-actors.mjs';

const MAX_BYTES = 32 * 1024;
const OPERATIONS = ['opening', 'authorizeWithdrawal', 'shutdown'];
const error = code => Object.assign(new Error(code), { code });
const need = (ok, code = 'OWNER_REFUND_IPC_INPUT') => { if (!ok) throw error(code); };
const codeFor = e => /^(?:OWNER_REFUND|VAULT)_[A-Z_]+$/.test(e?.code ?? '') ? e.code : 'OWNER_REFUND_REJECTED';
function exact(value, fields) {
  canonical(value); need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(k => Object.hasOwn(value, k)));
}
function frame(value) { const text = canonical(value); need(Buffer.byteLength(text) <= MAX_BYTES, 'OWNER_REFUND_IPC_SIZE'); return Buffer.from(`${text}\n`); }
const reply = value => new Promise((resolve, reject) => process.stdout.write(frame(value), e => e ? reject(e) : resolve()));
export async function runOwnerRefundProcess() {
  const stream = createReadStream(null, { fd: 3, autoClose: true }), encoded = Buffer.alloc(MAX_BYTES);
  let size = 0, cfg;
  try {
    for await (const chunk of stream) { need(size + chunk.length <= MAX_BYTES, 'OWNER_REFUND_IPC_SIZE'); chunk.copy(encoded, size); size += chunk.length; chunk.fill(0); }
    cfg = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(encoded.subarray(0, size)));
  } finally { encoded.fill(0); }
  const custody = await recoverOwnerRefundCustody(cfg); cfg.password = '';
  let queue = Promise.resolve(), queued = 0, calls = 0, stopping = false;
  const cleanup = () => { if (stopping) return; stopping = true; custody.close(); decoder.close(); process.stdin.destroy(); };
  async function handle(request) {
    if (stopping) return; let id = null;
    try {
      exact(request, ['id', 'operation', 'input']); need(typeof request.id === 'string' && /^[a-zA-Z0-9_-]{1,48}$/.test(request.id)); id = request.id;
      need(OPERATIONS.includes(request.operation), 'OWNER_REFUND_OPERATION_DENIED'); need(++calls <= 4096, 'OWNER_REFUND_CALL_LIMIT');
      let value;
      if (request.operation === 'shutdown') { need(request.input === null); value = { closed: true }; }
      else {
        await custody.authenticate();
        if (request.operation === 'opening') { need(request.input === null); value = custody.opening(); }
        else value = custody.authorizeWithdrawal(request.input);
      }
      await reply({ id, ok: true, value }); if (request.operation === 'shutdown') cleanup();
    } catch (e) { await reply({ id, ok: false, code: codeFor(e) }); }
  }
  const decoder = createAssemblyFrameDecoder(request => {
    if (stopping) return;
    if (++queued > 16) { cleanup(); process.exitCode = 1; void reply({ id: null, ok: false, code: 'OWNER_REFUND_QUEUE_LIMIT' }).catch(() => {}); return; }
    queue = queue.then(() => handle(request)).catch(() => { cleanup(); process.exitCode = 1; }).finally(() => { queued--; });
  }, () => { queue = queue.then(async () => { await reply({ id: null, ok: false, code: 'OWNER_REFUND_IPC_INPUT' }); cleanup(); process.exitCode = 1; }).catch(cleanup); }, MAX_BYTES);
  process.stdin.on('data', chunk => decoder.push(chunk));
  process.stdin.on('end', () => { decoder.end(); queue = queue.then(cleanup); });
  process.stdin.on('error', () => { queue = queue.then(cleanup); });
  process.once('SIGTERM', cleanup);
  await reply({ event: 'ready', kind: 'owner-refund' });
}

/** Trusted keeper adapter. Only the fixed repository signer is launched;
 * credentials travel through fd3, never argv, environment or public messages. */
export function launchOwnerRefundProcess(config, { startupTimeoutMs = 30000, requestTimeoutMs = 30000, forceAfterMs = 5000 } = {}) {
  // Shorter bounded intervals are a trusted host-test seam, never wire input.
  for (const [value, maximum] of [[startupTimeoutMs, 30000], [requestTimeoutMs, 30000], [forceAfterMs, 5000]]) need(Number.isSafeInteger(value) && value > 0 && value <= maximum, 'OWNER_REFUND_TIMEOUT_BOUND');
  const bootstrap = Buffer.from(canonical(config)); need(bootstrap.length <= MAX_BYTES, 'OWNER_REFUND_IPC_SIZE');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], { stdio: ['pipe', 'pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8' } });
  let readyResolve, readyReject, exitResolve, serial = 0, closed = false, stopping = false, readySeen = false;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const exited = new Promise(resolve => { exitResolve = resolve; });
  const pending = new Map(); let killTimer;
  ready.catch(() => {}); // stop-before-ready still owns and reaps this child.
  const failPending = e => { readyReject(e); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(e); } pending.clear(); };
  const force = code => {
    if (closed) return; stopping = true; failPending(error(code)); child.kill('SIGTERM');
    killTimer ??= setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, forceAfterMs);
  };
  const startupTimer = setTimeout(() => force('OWNER_REFUND_STARTUP_TIMEOUT'), startupTimeoutMs);
  const decoder = createAssemblyFrameDecoder(value => {
    try {
      if (value.event === 'ready') { exact(value, ['event', 'kind']); need(value.kind === 'owner-refund' && !readySeen); readySeen = true; clearTimeout(startupTimer); readyResolve(value); return; }
      if (value.event === 'startupRejected') { exact(value, ['event', 'code']); need(typeof value.code === 'string'); clearTimeout(startupTimer); force(codeFor({ code: value.code })); return; }
      need(typeof value.id === 'string' && pending.has(value.id)); const p = pending.get(value.id);
      if (value.ok === true) { exact(value, ['id', 'ok', 'value']); pending.delete(value.id); clearTimeout(p.timer); p.resolve(value.value); }
      else { exact(value, ['id', 'ok', 'code']); need(value.ok === false && typeof value.code === 'string'); pending.delete(value.id); clearTimeout(p.timer); p.reject(error(codeFor({ code: value.code }))); }
    } catch { force('OWNER_REFUND_PROTOCOL'); }
  }, () => force('OWNER_REFUND_PROTOCOL'), MAX_BYTES);
  child.stdout.on('data', chunk => decoder.push(chunk)); child.stdout.on('end', () => decoder.end()); child.stderr.resume();
  child.stdin.on('error', () => force('OWNER_REFUND_PROCESS_IO')); child.stdio[3].on('error', () => force('OWNER_REFUND_PROCESS_IO'));
  child.once('error', () => force('OWNER_REFUND_PROCESS_SPAWN'));
  child.once('close', (code, signal) => { closed = true; clearTimeout(startupTimer); clearTimeout(killTimer); decoder.close(); failPending(error('OWNER_REFUND_PROCESS_EXITED')); for (const s of child.stdio) s?.destroy(); exitResolve({ code, signal }); });
  child.stdio[3].end(bootstrap, () => bootstrap.fill(0));
  async function request(operation, input = null) {
    need(OPERATIONS.includes(operation), 'OWNER_REFUND_OPERATION_DENIED'); need(!closed && !stopping, 'OWNER_REFUND_PROCESS_EXITED'); await ready;
    need(!closed && !stopping, 'OWNER_REFUND_PROCESS_EXITED'); need(pending.size < 16, 'OWNER_REFUND_QUEUE_LIMIT');
    const id = `refund_${++serial}`, encoded = frame({ id, operation, input });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => force('OWNER_REFUND_REQUEST_TIMEOUT'), requestTimeoutMs);
      pending.set(id, { resolve, reject, timer }); child.stdin.write(encoded, e => { encoded.fill(0); if (e) force('OWNER_REFUND_PROCESS_IO'); });
    });
  }
  return Object.freeze({ pid: child.pid, ready, exited, request,
    async stop() {
      if (closed || stopping) return exited;
      // Arm before awaiting ready/request. Even SIGSTOP cannot block cleanup.
      killTimer ??= setTimeout(() => { if (!closed) { stopping = true; child.kill('SIGKILL'); } }, forceAfterMs);
      try { await request('shutdown'); } catch { if (!closed) child.kill('SIGTERM'); }
      stopping = true; child.stdin.end(); return exited;
    },
    async terminate() { force('OWNER_REFUND_PROCESS_TERMINATED'); return exited; },
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) runOwnerRefundProcess().catch(async e => { await reply({ event: 'startupRejected', code: codeFor(e) }).catch(() => {}); process.exitCode = 1; });
