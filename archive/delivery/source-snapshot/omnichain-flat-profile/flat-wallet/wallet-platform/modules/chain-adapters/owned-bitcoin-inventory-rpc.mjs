/** Internal fixed gettxout transport for the exact owned regtest daemon.
 * No RPC-method, wallet, host, credential or signing capability is returned.
 * Every call sends a distinct request, including repeated outpoints. No retries,
 * result sharing, redirects, proxy environment, or persistent connections. */
import { request } from 'node:http';

export const BITCOIN_INVENTORY_RPC_LIMITS = Object.freeze({ concurrent: 4, timeoutMs: 15_000,
  maximumResponseBytes: 4 * 1024 * 1024, maximumHeaderBytes: 16 * 1024 });
const fail = code => new Error(`BITCOIN_INVENTORY_RPC_${code}`);
const validOutput = value => value === null || (value && !Array.isArray(value) && typeof value === 'object'
  && typeof value.bestblock === 'string' && /^[0-9a-f]{64}$/.test(value.bestblock)
  && Number.isSafeInteger(value.confirmations) && value.confirmations >= 0 && !Object.is(value.confirmations, -0)
  && typeof value.coinbase === 'boolean' && typeof value.value === 'number' && Number.isFinite(value.value)
  && value.value >= 0 && !Object.is(value.value, -0) && value.value <= 21_000_000
  && typeof value.scriptPubKey?.hex === 'string' && /^(?:[0-9a-f]{2})*$/.test(value.scriptPubKey.hex)
  && value.scriptPubKey.hex.length <= 20_000);

export function createOwnedBitcoinInventoryReader(port, password) {
  if (arguments.length !== 2 || !Number.isInteger(port) || port < 1 || port > 65535
    || typeof password !== 'string' || !/^[0-9a-f]{64}$/.test(password)) throw fail('CONFIG');
  const active = new Set();
  let closed = false, sequence = 0n, closePromise;
  async function getTxOut(txid, vout) {
    if (closed) throw fail('CLOSED');
    if (arguments.length !== 2 || typeof txid !== 'string' || !/^[0-9a-f]{64}$/.test(txid)
      || !Number.isSafeInteger(vout) || Object.is(vout, -0) || vout < 0 || vout > 0xffffffff) throw fail('OUTPOINT');
    if (active.size >= BITCOIN_INVENTORY_RPC_LIMITS.concurrent) throw fail('BUSY');
    const id = (++sequence).toString();
    const body = JSON.stringify({ jsonrpc: '2.0', id, method: 'gettxout', params: [txid, vout, true] });
    let req, response, timer, outcome, settled = false, resolveDone;
    const done = new Promise(resolve => { resolveDone = resolve; });
    const entry = { done, cancel: () => rejectRead('CLOSED') };
    active.add(entry);
    let resolveRead, rejectReadPromise;
    const result = new Promise((resolve, reject) => { resolveRead = resolve; rejectReadPromise = reject; });
    function finish() {
      if (settled) return;
      settled = true; clearTimeout(timer); active.delete(entry);
      if (!outcome) outcome = { error: fail('TRANSPORT') };
      if (outcome.error) rejectReadPromise(outcome.error); else resolveRead(outcome.value);
      resolveDone();
    }
    function rejectRead(code) {
      if (settled) return;
      // Never retain raw transport errors, response bodies or authentication in
      // failures. Destroy the request before its close event releases the read.
      if (!outcome?.error) outcome = { error: fail(code) };
      response?.destroy(); req?.destroy();
      if (!req) finish();
    }
    timer = setTimeout(() => rejectRead('DEADLINE'), BITCOIN_INVENTORY_RPC_LIMITS.timeoutMs);
    try {
      req = request({ protocol: 'http:', hostname: '127.0.0.1', port, path: '/', method: 'POST',
        agent: false, auth: `synthetic-generic:${password}`, maxHeaderSize: BITCOIN_INVENTORY_RPC_LIMITS.maximumHeaderBytes,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Connection: 'close' } }, res => {
        response = res;
        if (settled || outcome?.error) { res.destroy(); return; }
        res.on('error', () => rejectRead('TRANSPORT'));
        res.on('aborted', () => rejectRead('TRANSPORT'));
        res.on('close', () => { if (!res.complete) rejectRead('TRANSPORT'); });
        if (res.statusCode !== 200) { rejectRead('HTTP'); return; }
        const length = res.headers['content-length'];
        if (length !== undefined && (!/^(0|[1-9][0-9]*)$/.test(length)
          || BigInt(length) > BigInt(BITCOIN_INVENTORY_RPC_LIMITS.maximumResponseBytes))) { rejectRead('SIZE'); return; }
        const chunks = []; let bytes = 0;
        res.on('data', chunk => {
          if (outcome?.error) return;
          bytes += chunk.length;
          if (bytes > BITCOIN_INVENTORY_RPC_LIMITS.maximumResponseBytes) { rejectRead('SIZE'); return; }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (outcome?.error) return;
          try {
            const value = JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
            if (!value || Array.isArray(value) || typeof value !== 'object' || value.jsonrpc !== '2.0'
              || value.id !== id || !Object.hasOwn(value, 'result') || Object.hasOwn(value, 'error')
              || !validOutput(value.result)) {
              rejectRead('REPLY'); return;
            }
            outcome = { value: value.result };
          } catch { rejectRead('REPLY'); }
        });
      });
      req.on('error', () => rejectRead('TRANSPORT'));
      // An inventory failure cannot release the exclusive runtime fence while
      // this request is still active. Close also drains these exact operations.
      req.on('close', finish);
      req.end(body);
    } catch { rejectRead('TRANSPORT'); }
    return result;
  }
  function close() {
    if (closePromise) return closePromise;
    closed = true;
    const started = [...active];
    closePromise = Promise.all(started.map(entry => entry.done)).then(() => undefined);
    for (const entry of started) entry.cancel();
    return closePromise;
  }
  return Object.freeze({ getTxOut, close });
}
