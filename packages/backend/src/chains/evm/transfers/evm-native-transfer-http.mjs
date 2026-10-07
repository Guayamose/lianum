/** Fixed read-only HTTP bridge for one retained original native transaction.
 * New isolated adapter during frozen graph acceptance; the original portfolio
 * transport's method allowlist is not widened. */
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { randomBytes } from 'node:crypto';
import { types } from 'node:util';
import { fields, need, hash32, ObservationError } from '../../shared/portfolio/portfolio-registry.mjs';
import { createEvmHttpObservationTransport, parseObservationJson } from '../../shared/observations/observation-http-transport.mjs';
import { createEvmNativeTransferObserver } from '../observations/evm-native-transfer-observer.mjs';
const exact = (raw, required, optional = []) => fields(raw, required, optional, true);
const fail = suffix => new ObservationError('EVM_TRANSFER_HTTP_' + suffix);
const matches = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;

export function createEvmNativeTransferHttpReader(raw) {
  const selected = exact(raw, ['endpoint', 'nativeId'], ['timeoutMs', 'maxResponseBytes']);
  hash32(selected.nativeId, false);
  const bootstrap = Object.fromEntries(Object.entries(selected).filter(([key]) => key !== 'nativeId'));
  // Reuse the existing strict canonical URL/TLS/limit validation and header reads.
  const headerRead = createEvmHttpObservationTransport(bootstrap);
  const endpoint = selected.endpoint, timeoutMs = selected.timeoutMs ?? 10000;
  const maxResponseBytes = selected.maxResponseBytes ?? 4 * 1024 * 1024;
  const expectedHash = '0x' + selected.nativeId; let inFlight = 0;
  return Object.freeze(async (method, params, rawOptions) => {
    if (method === 'eth_chainId' || method === 'eth_getBlockByNumber') return headerRead(method, params, rawOptions);
    need(method === 'eth_getTransactionByHash' || method === 'eth_getTransactionReceipt', 'EVM_TRANSFER_HTTP_METHOD');
    need(Array.isArray(params) && !types.isProxy(params) && Object.getPrototypeOf(params) === Array.prototype
      && params.length === 1 && Reflect.ownKeys(params).length === 2, 'EVM_TRANSFER_HTTP_PARAMS');
    const parameter = Object.getOwnPropertyDescriptor(params, '0');
    need(parameter?.enumerable && Object.hasOwn(parameter, 'value') && parameter.value === expectedHash, 'EVM_TRANSFER_HTTP_ORIGINAL_ID');
    const { signal } = exact(rawOptions, ['signal']);
    need(signal instanceof AbortSignal && !types.isProxy(signal), 'EVM_TRANSFER_HTTP_SIGNAL');
    need(!Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get.call(signal), 'EVM_TRANSFER_HTTP_ABORTED');
    need(inFlight < 2, 'EVM_TRANSFER_HTTP_BUSY'); inFlight++;
    const id = randomBytes(16).toString('hex'), body = JSON.stringify({ jsonrpc: '2.0', id, method, params: [expectedHash] });
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
        const target = new URL(endpoint);
        request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, { method: 'POST', agent: false, maxHeaderSize: 8192,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'identity', 'Content-Length': Buffer.byteLength(body) } }, res => {
          incoming = res; if (done) { res.destroy(); return; }
          res.on('error', () => finish(fail('NETWORK'))); res.on('aborted', () => finish(fail('INCOMPLETE')));
          res.on('close', () => { if (!done) finish(fail('INCOMPLETE')); });
          if (res.statusCode !== 200) return finish(fail('STATUS'));
          const length = res.headers['content-length'];
          if (!matches(res.headers['content-type'], /^application\/json(?:;\s*charset=utf-8)?$/i)
            || res.headers['content-encoding'] !== undefined && res.headers['content-encoding'] !== 'identity') return finish(fail('RESPONSE_TYPE'));
          if (length !== undefined && (!matches(length, /^(?:0|[1-9][0-9]*)$/) || BigInt(length) > BigInt(maxResponseBytes))) return finish(fail('RESPONSE_LIMIT'));
          res.on('data', chunk => {
            if (done) return; bytes += chunk.length;
            if (bytes > maxResponseBytes) return finish(fail('RESPONSE_LIMIT')); chunks.push(chunk);
          });
          res.on('end', () => {
            if (done) return;
            if (!res.complete || length !== undefined && BigInt(length) !== BigInt(bytes)) return finish(fail('INCOMPLETE'));
            try { finish(null, parseObservationJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); }
            catch { finish(fail('JSON')); }
          });
        });
        request.on('error', () => finish(fail('NETWORK'))); request.end(body);
      } catch { finish(fail('NETWORK')); }
    });
    const envelope = exact(response, ['jsonrpc', 'id'], ['result', 'error']);
    need(envelope.jsonrpc === '2.0' && envelope.id === id && Object.hasOwn(envelope, 'result') && !Object.hasOwn(envelope, 'error'),
      'EVM_TRANSFER_HTTP_RPC_RESPONSE');
    return envelope.result;
  });
}

export function createHttpEvmNativeTransferObserver(raw) {
  const selected = exact(raw, ['chain', 'genesisHash', 'endpoint', 'original'], ['now', 'freshness', 'timeoutMs', 'maxResponseBytes']);
  const original = fields(selected.original, ['nativeWire', 'expected'], ['inclusion'], true);
  const expected = fields(original.expected, ['nativeId', 'from', 'to', 'value', 'nonce'], [], true);
  const transport = createEvmNativeTransferHttpReader({ endpoint: selected.endpoint, nativeId: expected.nativeId,
    ...Object.fromEntries(['timeoutMs', 'maxResponseBytes'].filter(key => selected[key] !== undefined).map(key => [key, selected[key]])) });
  return createEvmNativeTransferObserver({ chain: selected.chain, genesisHash: selected.genesisHash, original, transport,
    ...Object.fromEntries(['now', 'freshness'].filter(key => selected[key] !== undefined).map(key => [key, selected[key]])) });
}
