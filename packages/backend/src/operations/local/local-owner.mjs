/** Private IPC facade for the fixed local, fake-fund owner fixture.
 * This is not a wallet server or a generic signing/proving endpoint. The child
 * owns all signing keys and note openings. A0 packages returned by init() remain
 * PRIVATE recursive proof inputs; never log, persist, or publish them.
 */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PROOF_PROJECT_ROOT, encodeProofMessage, decodeProofMessage, encodePrivateProof,
  decodePrivateProof, wipePrivate,
} from '@lianum/proofs/execution/proof-worker';
import { verifyPrivateNotePath } from '@lianum/engine/notes/private-note-tree';

export const GENERIC_OWNER_PROTOCOL = 'LIANUM_SYNTHETIC_GENERIC_OWNER_V1';
export const OWNER_MAX_REQUEST_BYTES = 8192;
const workerFile = fileURLToPath(new URL('../../../../../scripts/engine/proofs/generic-owner-worker.mjs', import.meta.url));
const INIT_FIELDS = ['scope', 'policy', 'asset', 'epoch', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore', 'recipient'];
const MAX_LOG_BYTES = 65536;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const ERROR_PATTERN = /^PAEG_(?:OWNER|PROOF)_[A-Z_]+$/;

export const ownerError = code => Object.assign(new Error(code), { code });
export function ownerNeed(condition, code) { if (!condition) throw ownerError(code); }
export function ownerExact(value, keys) {
  ownerNeed(value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), 'PAEG_OWNER_EXACT_FIELDS');
}
export function ownerHash(value, width = 32, allowZero = false) {
  ownerNeed(typeof value === 'string' && new RegExp(`^(?:0x)?[0-9a-f]{${width * 2}}$`).test(value), 'PAEG_OWNER_HASH');
  const hex = value.replace(/^0x/, '');
  ownerNeed(allowZero || hex !== '0'.repeat(width * 2), 'PAEG_OWNER_ZERO_HASH');
  return hex;
}
export function ownerUint(value) {
  ownerNeed(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)
    && value.length <= 20 && BigInt(value) < (1n << 64n), 'PAEG_OWNER_INTEGER');
  return value;
}
export function normalizeOwnerInit(input) {
  ownerExact(input, INIT_FIELDS);
  const result = Object.fromEntries(['scope', 'policy', 'asset'].map(key => [key, ownerHash(input[key])]));
  for (const key of ['epoch', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore']) result[key] = ownerUint(input[key]);
  result.recipient = ownerHash(input.recipient, 20);
  ownerNeed(BigInt(result.fundingNotBefore) < BigInt(result.fundingValidUntil)
    && BigInt(result.fundingValidUntil) <= BigInt(result.settleBefore), 'PAEG_OWNER_DEADLINES');
  return result;
}
export function normalizeOwnerWithdrawal(input) {
  ownerExact(input, ['recoveryIndex', 'path', 'epoch']);
  ownerNeed(input.recoveryIndex === 0 || input.recoveryIndex === 1, 'PAEG_OWNER_RECOVERY_INDEX');
  const epoch = ownerUint(input.epoch), path = input.path;
  ownerExact(path, ['index', 'leaf', 'root', 'siblings']);
  ownerNeed(Number.isInteger(path.index) && path.index >= 0 && path.index < 64, 'PAEG_OWNER_LEAF_INDEX');
  ownerNeed(Array.isArray(path.siblings) && path.siblings.length === 6, 'PAEG_OWNER_PATH_DEPTH');
  const normalizedPath = {
    index: path.index, leaf: ownerHash(path.leaf), root: ownerHash(path.root),
    siblings: path.siblings.map(value => ownerHash(value, 32, true)),
  };
  ownerNeed(verifyPrivateNotePath(normalizedPath), 'PAEG_OWNER_MEMBERSHIP');
  return { recoveryIndex: input.recoveryIndex, epoch, path: normalizedPath };
}

function publicError(error) {
  return ownerError(ERROR_PATTERN.test(error?.code ?? '') ? error.code : 'PAEG_OWNER_PROTOCOL');
}
function decodeProof(mode, encoded) {
  const decoded = decodePrivateProof(mode, encoded);
  try {
    // Also enforce 139/458/115 canonical arrays before handing a private A0
    // capability to the coordinator. No opaque child object is trusted here.
    return decodePrivateProof(mode, encodePrivateProof(mode, decoded));
  } finally { wipePrivate(decoded); }
}
function decodeResult(operation, value) {
  if (operation === 'init') {
    ownerExact(value, ['deposit', 'fundingCommitment', 'intents', 'metrics']);
    ownerNeed(Array.isArray(value.intents) && value.intents.length === 2, 'PAEG_OWNER_INTENTS');
    return {
      deposit: decodeProof('deposit_balance', value.deposit),
      fundingCommitment: ownerHash(value.fundingCommitment),
      intents: value.intents.map(intent => {
        ownerExact(intent, ['authorization', 'admissionTag', 'reserveCommitment', 'changeCommitment', 'recoveryCommitment', 'settleBefore', 'graphShape']);
        return {
          authorization: decodeProof('authorization', intent.authorization),
          ...Object.fromEntries(['admissionTag', 'reserveCommitment', 'changeCommitment', 'recoveryCommitment'].map(key => [key, ownerHash(intent[key])])),
          settleBefore: ownerUint(intent.settleBefore), graphShape: structuredClone(intent.graphShape),
        };
      }), metrics: structuredClone(value.metrics),
    };
  }
  if (operation === 'withdraw') {
    ownerExact(value, ['proofPackage', 'metrics']);
    return { ...decodeProof('withdraw_balance', value.proofPackage), metrics: structuredClone(value.metrics) };
  }
  ownerExact(value, ['closed']);
  ownerNeed(value.closed === true, 'PAEG_OWNER_CLOSE');
  return { closed: true };
}

/** No configuration is accepted: fixed worker, cwd, environment and capability.
 * close() resolves only after the OS reports that this owned child has closed.
 * The owner stays alive for recovery withdrawals; init does not mean offline.
 */
export function createGenericOwnerProcess() {
  ownerNeed(arguments.length === 0, 'PAEG_OWNER_NO_CONFIGURATION');
  let child, pending, readyResolve, readyReject, exitResolve, readyTimer, killTimer, closeTimer;
  let requestId = 0, initialized = false, initializing = false, closed = false, failure;
  const withdrawn = new Set();
  const report = {
    classification: 'SYNTHETIC_OWNER_PROCESS_PUBLIC_LIFECYCLE_ONLY',
    phase: 'not-started', started: false, exited: false, requests: [],
    logs: { stdoutBytes: 0, stderrBytes: 0 },
  };
  const exited = new Promise(resolve => { exitResolve = resolve; });
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  ready.catch(() => {});
  function fail(error) {
    failure ??= publicError(error);
    report.failureCode = failure.code;
    if (!report.exited) report.phase = 'stopping-after-failure';
    readyReject(failure);
    if (pending) { clearTimeout(pending.timer); pending.reject(failure); pending = null; }
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      killTimer ??= setTimeout(() => {
        if (!report.exited && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, 10000);
    }
  }
  function start() {
    if (child) return ready;
    ownerNeed(!closed, 'PAEG_OWNER_CLOSED');
    report.startedAt = new Date().toISOString(); report.phase = 'starting';
    try {
      child = fork(workerFile, [], {
        cwd: PROOF_PROJECT_ROOT, execArgv: [], serialization: 'advanced',
        env: { LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
    } catch {
      fail(ownerError('PAEG_OWNER_SPAWN')); exitResolve(structuredClone(report)); return ready;
    }
    report.started = true; report.pid = child.pid;
    child.once('error', () => fail(ownerError('PAEG_OWNER_SPAWN')));
    child.once('close', (code, signal) => {
      clearTimeout(readyTimer); clearTimeout(killTimer); clearTimeout(closeTimer);
      report.exited = true; report.exit = { code, signal }; report.completedAt = new Date().toISOString();
      if (!closed || pending || code !== 0) fail(ownerError('PAEG_OWNER_CHILD_EXIT'));
      report.phase = failure ? 'failed' : 'closed';
      for (const stream of child.stdio) stream?.destroy();
      exitResolve(structuredClone(report));
    });
    for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
      stream.on('data', bytes => {
        report.logs[name + 'Bytes'] += bytes.length; bytes.fill(0);
        if (report.logs.stdoutBytes + report.logs.stderrBytes > MAX_LOG_BYTES) fail(ownerError('PAEG_OWNER_LOG_LIMIT'));
      });
      stream.on('error', () => fail(ownerError('PAEG_OWNER_IO')));
    }
    let readySeen = false;
    child.on('message', bytes => {
      let message;
      try {
        ownerNeed(bytes instanceof Uint8Array && bytes.length <= MAX_RESPONSE_BYTES, 'PAEG_OWNER_MESSAGE_LIMIT');
        message = decodeProofMessage(bytes);
        if (failure) return;
        if (message.event === 'ready') {
          ownerExact(message, ['event', 'protocol']);
          ownerNeed(!readySeen && message.protocol === GENERIC_OWNER_PROTOCOL, 'PAEG_OWNER_PROTOCOL');
          readySeen = true; clearTimeout(readyTimer); report.phase = 'ready'; readyResolve();
        } else if (message.event === 'failure') {
          ownerExact(message, ['event', 'id', 'code']);
          ownerNeed(pending && message.id === pending.id && ERROR_PATTERN.test(message.code), 'PAEG_OWNER_PROTOCOL');
          fail(ownerError(message.code));
        } else {
          ownerExact(message, ['event', 'id', 'result']);
          ownerNeed(readySeen && message.event === 'result' && pending && message.id === pending.id, 'PAEG_OWNER_PROTOCOL');
          const result = decodeResult(pending.operation, message.result);
          const current = pending; pending = null; clearTimeout(current.timer);
          report.requests.push({ operation: current.operation, completedAt: new Date().toISOString() });
          report.phase = current.operation === 'close' ? 'awaiting-child-exit' : 'ready';
          current.resolve(result);
        }
      } catch (error) { fail(error); }
      finally { wipePrivate(message); }
    });
    readyTimer = setTimeout(() => fail(ownerError('PAEG_OWNER_START_TIMEOUT')), 30000);
    return ready;
  }
  async function request(operation, input) {
    await start();
    ownerNeed(!failure && !report.exited && !pending, 'PAEG_OWNER_BUSY_OR_CLOSED');
    const bytes = encodeProofMessage({ protocol: GENERIC_OWNER_PROTOCOL, id: ++requestId, operation, input });
    ownerNeed(bytes.length <= OWNER_MAX_REQUEST_BYTES, 'PAEG_OWNER_MESSAGE_LIMIT');
    report.phase = operation;
    const response = new Promise((resolve, reject) => {
      pending = { id: requestId, operation, resolve, reject,
        timer: setTimeout(() => fail(ownerError('PAEG_OWNER_OPERATION_TIMEOUT')),
          operation === 'init' ? 50 * 60 * 1000 : operation === 'withdraw' ? 17 * 60 * 1000 : 20000),
      };
    });
    try {
      child.send(bytes, error => { bytes.fill(0); if (error) fail(ownerError('PAEG_OWNER_IO')); });
    } catch (error) { bytes.fill(0); fail(error); }
    return response;
  }
  return Object.freeze({
    async init(input) {
      ownerNeed(!closed && !initialized && !initializing, 'PAEG_OWNER_INIT_ONCE');
      const normalized = normalizeOwnerInit(input); initializing = true;
      try { const result = await request('init', normalized); initialized = true; return result; }
      finally { initializing = false; }
    },
    async withdraw(input) {
      ownerNeed(initialized && !closed && !pending, 'PAEG_OWNER_NOT_READY');
      const normalized = normalizeOwnerWithdrawal(input);
      ownerNeed(!withdrawn.has(normalized.recoveryIndex), 'PAEG_OWNER_WITHDRAW_ONCE');
      const result = await request('withdraw', normalized); withdrawn.add(normalized.recoveryIndex); return result;
    },
    report: () => structuredClone(report),
    async close() {
      if (!child) { closed = true; return { closed: true, exited: true, started: false }; }
      if (!closed) {
        closed = true;
        closeTimer = setTimeout(() => fail(ownerError('PAEG_OWNER_CLOSE_TIMEOUT')), 20000);
        if (!failure && !pending && !report.exited) {
          try { await request('close', null); } catch (error) { fail(error); }
        } else if (!report.exited) fail(ownerError('PAEG_OWNER_CANCELLED'));
      }
      const lifecycle = await exited;
      clearTimeout(closeTimer);
      return { closed: true, exited: lifecycle.exited, exit: lifecycle.exit, metrics: lifecycle };
    },
  });
}
