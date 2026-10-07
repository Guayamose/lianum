/** Bounded private owner transport. No API action can select a child script,
 * endpoint, Vault file, identity, private key or arbitrary signing operation. */
import {canonical} from '../../crypto/privacy.mjs';

export const BALANCE_OWNER_PROTOCOL = 'LIANUM_GENERIC_BALANCE_OWNER_IPC_V3';
export const MAX_MESSAGE_BYTES = 1024 * 1024;
export const PUBLIC_METHODS = Object.freeze(['summary', 'projection']);
export const OWNER_METHODS = Object.freeze([
  'prepareFunding', 'prepareOperation', 'prepareNativeOperation', 'depositInput', 'invoiceRequests', 'nativeInvoiceRequests', 'nativeCapsuleInputs',
  'authorizeOperation', 'resumeAuthorization', 'renewFundingEpoch', 'ownerPlan',
  'prepareWithdrawal', 'withdrawalInput', 'renewWithdrawalEpoch',
  'privateBalance', 'bindSubmission', 'acknowledgeSubmitted', 'markUnknown', 'reconcile', 'reconcileRecovery',
]);
export const CONTROL_METHODS = Object.freeze(['authenticateCommittedWrite', 'resumePendingWrite', 'close']);
export const HOST_METHODS = Object.freeze(['readSnapshot', 'readTransaction', 'checkpoint']);
export const NO_INPUT_METHODS = Object.freeze(['summary', 'privateBalance', 'authenticateCommittedWrite', 'resumePendingWrite', 'close']);

export const problem = code => Object.assign(new Error(code), {code});
export function need(ok, code = 'BALANCE_OWNER_PROTOCOL') {
  if (!ok) throw problem(code);
}
export const clone = value => JSON.parse(canonical(value));
export function exact(value, fields) {
  canonical(value);
  need(value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === fields.length
    && fields.every(field => Object.hasOwn(value, field)), 'BALANCE_OWNER_FIELDS');
}
export function safeCode(error) {
  return /^(?:CUSTODY|VAULT|BALANCE_OWNER)_[A-Z0-9_]+$/.test(error?.code ?? '')
    ? error.code : 'BALANCE_OWNER_REJECTED';
}
export function methodPlane(method) {
  if (PUBLIC_METHODS.includes(method)) return 'public';
  if (OWNER_METHODS.includes(method)) return 'owner';
  if (CONTROL_METHODS.includes(method)) return 'control';
  throw problem('BALANCE_OWNER_METHOD_DENIED');
}
/** Recovery observations are permitted only for the current private command's
 * original query. The host cannot be used as a general transaction/RPC bridge. */
export function validateRecoveryObservationQuery(request, query, identitySHA256) {
  exact(request, ['ownerOperationRef', 'transactionHash', 'calldataSHA256']);
  exact(query, ['ownerOperationRef', 'transactionHash', 'calldataSHA256', 'identitySHA256']);
  need(/^[a-zA-Z0-9_-]{8,128}$/.test(request.ownerOperationRef)
    && /^[0-9a-f]{64}$/.test(request.transactionHash) && /^[0-9a-f]{64}$/.test(request.calldataSHA256),
    'BALANCE_OWNER_RECOVERY_QUERY');
  need(query.identitySHA256 === identitySHA256 && query.ownerOperationRef === request.ownerOperationRef
    && query.transactionHash === request.transactionHash && query.calldataSHA256 === request.calldataSHA256,
    'BALANCE_OWNER_RECOVERY_QUERY');
}

function sequence(value) {
  need(Number.isSafeInteger(value) && value > 0, 'BALANCE_OWNER_SEQUENCE');
}
export function envelope(message) {
  need(message?.protocol === BALANCE_OWNER_PROTOCOL, 'BALANCE_OWNER_PROTOCOL');
  need(typeof message.session === 'string' && /^[0-9a-f]{64}$/.test(message.session), 'BALANCE_OWNER_SESSION');
  const base = ['protocol', 'session', 'type'];
  switch (message.type) {
    case 'boot':
      exact(message, [...base, 'mode', 'config']);
      need(['create', 'recover', 'recoverAbsent'].includes(message.mode), 'BALANCE_OWNER_BOOT_MODE');
      exact(message.config, ['path', 'password', 'identity', 'poolArtifact', 'create', 'checkpoint']);
      need(message.config.create === (message.mode === 'create'), 'BALANCE_OWNER_BOOT_MODE');
      break;
    case 'request':
      exact(message, [...base, 'id', 'plane', 'method', 'input']); sequence(message.id);
      need(message.plane === methodPlane(message.method), 'BALANCE_OWNER_PLANE');
      if (NO_INPUT_METHODS.includes(message.method)) need(message.input === null, 'BALANCE_OWNER_INPUT');
      break;
    case 'result':
      exact(message, [...base, 'id', 'ok', message.ok ? 'result' : 'code']); sequence(message.id);
      need(typeof message.ok === 'boolean', 'BALANCE_OWNER_RESULT');
      if (!message.ok) need(safeCode({code: message.code}) === message.code, 'BALANCE_OWNER_ERROR_CODE');
      break;
    case 'hostRequest':
      exact(message, [...base, 'sequence', 'method', 'input']); sequence(message.sequence);
      need(HOST_METHODS.includes(message.method), 'BALANCE_OWNER_HOST_METHOD');
      if (message.method === 'readSnapshot') need(message.input === null, 'BALANCE_OWNER_HOST_INPUT');
      if (message.method === 'readTransaction') exact(message.input,
        ['ownerOperationRef', 'transactionHash', 'identitySHA256', 'calldataSHA256']);
      break;
    case 'hostReply':
      exact(message, [...base, 'sequence', 'ok', message.ok ? 'result' : 'code']); sequence(message.sequence);
      need(typeof message.ok === 'boolean', 'BALANCE_OWNER_RESULT');
      if (!message.ok) need(safeCode({code: message.code}) === message.code, 'BALANCE_OWNER_ERROR_CODE');
      break;
    case 'ready':
      exact(message, [...base, 'summary', 'recovery']);
      break;
    case 'startupFailure':
      exact(message, [...base, 'code']);
      need(safeCode({code: message.code}) === message.code, 'BALANCE_OWNER_ERROR_CODE');
      break;
    default: throw problem('BALANCE_OWNER_MESSAGE_TYPE');
  }
  return message;
}

export function encode(message) {
  envelope(message);
  const body = Buffer.from(canonical(message), 'utf8');
  need(body.length > 0 && body.length <= MAX_MESSAGE_BYTES, 'BALANCE_OWNER_MESSAGE_LIMIT');
  const frame = Buffer.allocUnsafe(body.length + 4);
  frame.writeUInt32BE(body.length, 0); body.copy(frame, 4); body.fill(0);
  return frame;
}

/** Four-byte length is checked BEFORE allocating a body. No unbounded line
 * accumulation or JSON deserialization of an unbounded IPC payload. */
export function createFrameReader(onMessage) {
  let header = Buffer.alloc(4), headerBytes = 0, body = null, bodyBytes = 0, stopped = false;
  return Object.freeze({
    push(chunk) {
      need(!stopped && chunk instanceof Uint8Array, 'BALANCE_OWNER_STREAM');
      const bytes = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      let cursor = 0;
      while (cursor < bytes.length) {
        if (body === null) {
          const count = Math.min(4 - headerBytes, bytes.length - cursor);
          bytes.copy(header, headerBytes, cursor, cursor + count);
          headerBytes += count; cursor += count;
          if (headerBytes !== 4) continue;
          const length = header.readUInt32BE(0);
          need(length > 0 && length <= MAX_MESSAGE_BYTES, 'BALANCE_OWNER_MESSAGE_LIMIT');
          body = Buffer.allocUnsafe(length); bodyBytes = 0;
        }
        const count = Math.min(body.length - bodyBytes, bytes.length - cursor);
        bytes.copy(body, bodyBytes, cursor, cursor + count); bodyBytes += count; cursor += count;
        if (bodyBytes === body.length) {
          const complete = body; body = null; headerBytes = 0;
          try {
            const message = envelope(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(complete)));
            onMessage(message);
          } finally { complete.fill(0); }
        }
      }
    },
    end() { need(body === null && headerBytes === 0, 'BALANCE_OWNER_TRUNCATED_FRAME'); },
    close() { stopped = true; header.fill(0); body?.fill(0); body = null; },
  });
}

export async function writeFrame(stream, message) {
  const bytes = encode(message);
  return new Promise((resolve, reject) => stream.write(bytes, error => {
    bytes.fill(0); error ? reject(problem('BALANCE_OWNER_IO')) : resolve();
  }));
}
