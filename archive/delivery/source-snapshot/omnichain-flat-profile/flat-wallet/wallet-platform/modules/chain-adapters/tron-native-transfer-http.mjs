/** Dedicated fixed read-only SolidityNode reader. The holdings transport's
 * allowlist is unchanged. No full-node fallback, broadcast, cookies or keys. */
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { types } from 'node:util';
import { fields, need, hash32, ObservationError } from './portfolio-registry.mjs';
import { normalizeTronInteger } from './tron-observation-adapter.mjs';
import { createTronHttpObservationTransport, parseObservationJson } from './observation-http-transport.mjs';
import { createTronNativeTransferObserver } from './tron-native-transfer-observer.mjs';
const exact = (raw, required, optional = []) => fields(raw, required, optional, true);
const fail = suffix => new ObservationError('TRON_TRANSFER_HTTP_' + suffix);
const matches = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
const P = '/walletsolidity/';
export function createTronNativeTransferHttpReader(raw) {
  const selected = exact(raw, ['endpoint', 'nativeId'], ['timeoutMs', 'maxResponseBytes']);
  need(typeof selected.nativeId === 'string' && selected.nativeId.length === 64, 'TRON_TRANSFER_HTTP_ORIGINAL_ID');
  hash32(selected.nativeId, false);
  // Reuse strict canonical origin, TLS and resource-limit validation, no I/O.
  createTronHttpObservationTransport(Object.fromEntries(Object.entries(selected).filter(([key]) => key !== 'nativeId')));
  const endpoint = selected.endpoint, nativeId = selected.nativeId;
  const timeoutMs = selected.timeoutMs ?? 10000, maximum = selected.maxResponseBytes ?? 8 * 1024 * 1024;
  let inFlight = 0;
  return Object.freeze(async (path, rawBody, rawOptions) => {
    let payload;
    if (path === P + 'getnowblock') { exact(rawBody, []); payload = '{}'; }
    else if (path === P + 'getblockbynum') {
      const body = exact(rawBody, ['num']);
      need(typeof body.num === 'string' && normalizeTronInteger(body.num) === body.num, 'TRON_TRANSFER_HTTP_HEIGHT');
      // Validated canonical decimal inserted as a JSON NUMBER, not converted
      // through JS Number. java-tron's int64 NumMessage receives exact bytes.
      payload = '{"num":' + body.num + '}';
    } else {
      need(path === P + 'gettransactionbyid' || path === P + 'gettransactioninfobyid', 'TRON_TRANSFER_HTTP_METHOD');
      const body = exact(rawBody, ['value']); need(body.value === nativeId, 'TRON_TRANSFER_HTTP_ORIGINAL_ID');
      payload = JSON.stringify({ value: nativeId });
    }
    const { signal } = exact(rawOptions, ['signal']);
    need(signal instanceof AbortSignal && !types.isProxy(signal), 'TRON_TRANSFER_HTTP_SIGNAL');
    need(!Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get.call(signal), 'TRON_TRANSFER_HTTP_ABORTED');
    need(inFlight < 2, 'TRON_TRANSFER_HTTP_BUSY'); inFlight++;
    const response = await new Promise((resolve, reject) => {
      let request, incoming, timer, done = false, bytes = 0; const chunks = [];
      const finish = (error, value) => {
        if (done) return; done = true; inFlight--; clearTimeout(timer); signal.removeEventListener('abort', abort); chunks.length = 0;
        if (error) { reject(error); incoming?.destroy(); request?.destroy(); } else resolve(value);
      };
      const abort = () => finish(fail('ABORTED')); signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      timer = setTimeout(() => finish(fail('TIMEOUT')), timeoutMs);
      try {
        const target = new URL(endpoint); target.pathname = path;
        request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, { method: 'POST', agent: false, maxHeaderSize: 8192,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'identity', 'Content-Length': Buffer.byteLength(payload) } }, res => {
          incoming = res; if (done) { res.destroy(); return; }
          res.on('error', () => finish(fail('NETWORK'))); res.on('aborted', () => finish(fail('INCOMPLETE')));
          res.on('close', () => { if (!done) finish(fail('INCOMPLETE')); });
          if (res.statusCode !== 200) return finish(fail('STATUS'));
          const length = res.headers['content-length'];
          if (!matches(res.headers['content-type'], /^application\/json(?:;\s*charset=utf-8)?$/i)
            || res.headers['content-encoding'] !== undefined && res.headers['content-encoding'] !== 'identity') return finish(fail('RESPONSE_TYPE'));
          if (length !== undefined && (!matches(length, /^(?:0|[1-9][0-9]*)$/) || BigInt(length) > BigInt(maximum))) return finish(fail('RESPONSE_LIMIT'));
          res.on('data', chunk => {
            if (done) return; bytes += chunk.length;
            if (bytes > maximum) return finish(fail('RESPONSE_LIMIT')); chunks.push(chunk);
          });
          res.on('end', () => {
            if (done) return;
            if (!res.complete || length !== undefined && BigInt(length) !== BigInt(bytes)) return finish(fail('INCOMPLETE'));
            try { finish(null, parseObservationJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)), { numericTokens: true })); }
            catch { finish(fail('JSON')); }
          });
        });
        request.on('error', () => finish(fail('NETWORK'))); request.end(payload);
      } catch { finish(fail('NETWORK')); }
    });
    fields(response, []);
    need(!Object.hasOwn(response, 'Error') && !Object.hasOwn(response, 'error'), 'TRON_TRANSFER_HTTP_RPC_RESPONSE');
    return response;
  });
}
export function createHttpTronNativeTransferObserver(raw) {
  const selected = exact(raw, ['chain', 'genesisHash', 'endpoint', 'original'], ['now', 'freshness', 'timeoutMs', 'maxResponseBytes']);
  const original = exact(selected.original, ['nativeWire', 'expected'], ['inclusion']);
  const expected = fields(original.expected, ['nativeId']);
  const transport = createTronNativeTransferHttpReader({ endpoint: selected.endpoint, nativeId: expected.nativeId,
    ...Object.fromEntries(['timeoutMs', 'maxResponseBytes'].filter(key => selected[key] !== undefined).map(key => [key, selected[key]])) });
  return createTronNativeTransferObserver({ chain: selected.chain, genesisHash: selected.genesisHash, original, transport,
    ...Object.fromEntries(['now', 'freshness'].filter(key => selected[key] !== undefined).map(key => [key, selected[key]])) });
}
