/** PC17 local process adapter. No networking, native adapter, proofs or key export.
 * fd 3: one trusted bootstrap JSON document, then EOF (contains vault password)
 * fd 4: recipient-local approval JSON lines, distinct from owner requests
 * stdin: owner requests; stdout: bounded JSON replies; stderr: no secret logging
 * Whoever controls both bootstrap and the OS can impersonate the local operator.
 */
import { createReadStream } from 'node:fs';
import { Socket } from 'node:net';
import { canonical } from '../crypto/privacy.mjs';
import { createRecipientCustody, recoverRecipientCustody } from './private-recipient-custody.mjs';

const MAX_BYTES = 32 * 1024;
const codeFor = error => /^RECIPIENT_[A-Z_]+$|^VAULT_[A-Z_]+$/.test(error?.code || '') ? error.code : 'RECIPIENT_REJECTED';
function need(ok, code = 'RECIPIENT_IPC_INPUT') { if (!ok) throw Object.assign(new Error(code), { code }); }
function exact(o, fields) {
  canonical(o);
  need(o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === fields.length && fields.every(k => Object.hasOwn(o, k)));
}
const reply = value => new Promise((resolve, reject) => process.stdout.write(`${JSON.stringify(value)}\n`, error => error ? reject(error) : resolve()));

async function main() {
  const bootstrapStream = createReadStream(null, { fd: 3, autoClose: true });
  const encoded = Buffer.alloc(MAX_BYTES);
  let byteLength = 0, boot;
  try {
    for await (const chunk of bootstrapStream) {
      need(byteLength + chunk.length <= MAX_BYTES);
      chunk.copy(encoded, byteLength);
      byteLength += chunk.length;
    }
    // A read boundary can split any UTF-8 sequence. Decode the bounded complete
    // byte document once; reject malformed UTF-8 instead of changing secrets.
    boot = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(encoded.subarray(0, byteLength)));
  } finally {
    encoded.fill(0); // Parsed JS strings still have no zeroization guarantee.
  }
  exact(boot, ['mode', 'path', 'password', 'expectedTerms', 'withdrawalRecipient']);
  need(boot.mode === 'create' || boot.mode === 'recover');
  const { mode, ...cfg } = boot;
  const custody = await (mode === 'create' ? createRecipientCustody(cfg) : recoverRecipientCustody(cfg));
  boot.password = ''; cfg.password = ''; // Not a zeroization guarantee.
  // Spawn's inherited pipe is a Unix socket. Use cancellable event-loop IO;
  // fs.createReadStream can leave a blocking worker read alive during shutdown.
  const operator = new Socket({ fd: 4, readable: true, writable: false });
  let queue = Promise.resolve(), stopping = false;
  function cleanup() {
    if (stopping) return;
    stopping = true;
    custody.close(); operator.destroy(); process.stdin.destroy();
  }
  function receive(line, channel) {
    queue = queue.then(async () => {
      if (stopping) return;
      let id = null;
      try {
        const request = JSON.parse(line);
        exact(request, ['id', 'operation', 'input']);
        need(typeof request.id === 'string' && /^[a-zA-Z0-9_-]{1,48}$/.test(request.id));
        id = request.id;
        let value;
        if (channel === 'operator') {
          need(request.operation === 'acknowledgeCompensation', 'RECIPIENT_OPERATION_DENIED');
          value = await custody.acknowledgeCompensation(request.input);
        } else {
          switch (request.operation) {
            case 'reviewCompensation': need(request.input === null); value = custody.reviewCompensation(); break;
            case 'invoice': value = custody.invoice(request.input); break;
            case 'assertNativeExposureAcknowledged': value = custody.assertNativeExposureAcknowledged(request.input); break;
            case 'authorizeWithdrawal': value = custody.authorizeWithdrawal(request.input); break;
            case 'shutdown': need(request.input === null); value = { closed: true }; break;
            default: need(false, 'RECIPIENT_OPERATION_DENIED');
          }
        }
        await reply({ id, channel, ok: true, value });
        if (channel === 'owner' && request.operation === 'shutdown') cleanup();
      } catch (error) { await reply({ id, channel, ok: false, code: codeFor(error) }); }
    }).catch(() => { cleanup(); process.exitCode = 1; });
  }
  function input(stream, channel) {
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      if (stopping) return;
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop();
      if (Buffer.byteLength(pending) > MAX_BYTES || lines.some(line => Buffer.byteLength(line) > MAX_BYTES)) {
        queue = queue.then(async () => { await reply({ id: null, channel, ok: false, code: 'RECIPIENT_IPC_SIZE' }); cleanup(); });
        stream.pause(); return;
      }
      for (const line of lines) receive(line, channel);
    });
    stream.on('error', () => { queue = queue.then(cleanup); });
    if (channel === 'owner') stream.on('end', () => { queue = queue.then(cleanup); });
  }
  input(process.stdin, 'owner'); input(operator, 'operator');
  await reply({ event: 'ready', role: boot.expectedTerms.role, review: custody.reviewCompensation() });
}

main().catch(async error => {
  await reply({ event: 'startupRejected', code: codeFor(error) }).catch(() => {});
  process.exitCode = 1;
});
