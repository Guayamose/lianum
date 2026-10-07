import {solanaPublicKey} from './observation-addresses.mjs';
import {bitcoinWatchPolicy} from '../../bitcoin/observations/bitcoin-observation-adapter.mjs';
/** Trusted-bootstrap fixed read transports. No signing, sending, redirects,
 * retries, cookies, credentials or public-request endpoint selection. */
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { randomBytes } from 'node:crypto';
import { types } from 'node:util';
import { fields, need, hash32, rpcQuantity, normalizeTronAddress, ObservationError }
  from '../portfolio/portfolio-registry.mjs';

const MAX_DEPTH = 64, MAX_NODES = 500000, MAX_IN_FLIGHT = 8;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const exact = (value, required, optional = []) => fields(value, required, optional, true);
const matches = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
const fail = suffix => new ObservationError('RPC_TRANSPORT_' + suffix);

/** JSON grammar with duplicate-key rejection and bounded nesting. Numeric
 * tokens are retained before JS conversion in Tron mode, including int64 values
 * beyond 2^53. No eval, lossy JSON.parse/re-stringify, or prototype assignment. */
export function parseObservationJson(text, { numericTokens = false } = {}) {
  need(typeof text === 'string' && Buffer.byteLength(text) <= MAX_RESPONSE_BYTES, 'RPC_TRANSPORT_JSON_LIMIT');
  let index = 0, nodes = 0;
  const invalid = () => { throw fail('JSON_INVALID'); };
  const space = () => { while (index < text.length && /[\x20\x09\x0a\x0d]/.test(text[index])) index++; };
  function string() {
    const start = index++;
    while (index < text.length) {
      const character = text[index++];
      if (character === '"') {
        try { return JSON.parse(text.slice(start, index)); } catch { invalid(); }
      }
      if (character === '\\') index++;
    }
    invalid();
  }
  function value(depth) {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw fail('JSON_LIMIT');
    space(); const first = text[index];
    if (first === '"') return string();
    if (first === '{' || first === '[') {
      const object = first === '{', output = object ? {} : [], keys = new Set();
      const end = object ? '}' : ']'; index++; space();
      if (text[index] === end) { index++; return output; }
      while (index < text.length) {
        space(); let key;
        if (object) {
          if (text[index] !== '"') invalid(); key = string();
          if (keys.has(key)) throw fail('JSON_DUPLICATE_KEY'); keys.add(key);
          space(); if (text[index++] !== ':') invalid();
        }
        const item = value(depth + 1);
        if (object) Object.defineProperty(output, key, { value: item, enumerable: true, configurable: true, writable: true });
        else output.push(item);
        space(); const next = text[index++];
        if (next === end) return output;
        if (next !== ',') invalid();
      }
      invalid();
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(literal, index)) { index += literal.length; return result; }
    }
    // Sticky matching avoids copying the remaining document per numeric token.
    const number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
    number.lastIndex = index; const match = number.exec(text); if (!match) invalid();
    index = number.lastIndex;
    if (numericTokens) return match[0];
    const parsed = Number(match[0]);
    if (!Number.isFinite(parsed) || Number.isInteger(parsed) && !Number.isSafeInteger(parsed))
      throw fail('UNSAFE_JSON_NUMBER');
    return parsed;
  }
  const parsed = value(0); space(); if (index !== text.length) invalid(); return parsed;
}

function config(raw, family) {
  const selected = exact(raw, ['endpoint'], ['timeoutMs', 'maxResponseBytes']);
  need(typeof selected.endpoint === 'string' && selected.endpoint.length <= 2048
    && selected.endpoint.trim() === selected.endpoint, 'RPC_TRANSPORT_ENDPOINT');
  let endpoint;
  try { endpoint = new URL(selected.endpoint); } catch { throw fail('ENDPOINT'); }
  // HTTPS for nonlocal deployment. Plain HTTP exists only for explicit local
  // endpoints. Node's request primitive neither honors proxy env vars nor follows
  // redirects, and its default TLS certificate checks are left intact.
  need(endpoint.username === '' && endpoint.password === '' && endpoint.search === '' && endpoint.hash === ''
    && (endpoint.protocol === 'https:' || endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1')
    && (family !== 'tron' || endpoint.pathname === '/') && endpoint.href === selected.endpoint,
  'RPC_TRANSPORT_ENDPOINT');
  const timeoutMs = selected.timeoutMs ?? 10000;
  const maxResponseBytes = selected.maxResponseBytes ?? (family === 'tron' ? 8 : 4) * 1024 * 1024;
  need(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60000, 'RPC_TRANSPORT_TIMEOUT');
  need(Number.isSafeInteger(maxResponseBytes) && maxResponseBytes >= 1024 && maxResponseBytes <= MAX_RESPONSE_BYTES,
    'RPC_TRANSPORT_RESPONSE_LIMIT');
  return Object.freeze({ endpoint: endpoint.href, timeoutMs, maxResponseBytes });
}

function tuple(raw, length) {
  need(Array.isArray(raw) && !types.isProxy(raw) && Object.getPrototypeOf(raw) === Array.prototype,
    'RPC_TRANSPORT_PARAMS');
  const lengthDescriptor = Object.getOwnPropertyDescriptor(raw, 'length');
  need(lengthDescriptor?.value === length && Reflect.ownKeys(raw).length === length + 1, 'RPC_TRANSPORT_PARAMS');
  return Array.from({ length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(raw, String(index));
    need(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'RPC_TRANSPORT_PARAMS');
    return descriptor.value;
  });
}
function evmRequest(method, raw) {
  if (method === 'eth_chainId') return tuple(raw, 0);
  if (method === 'eth_getBlockByNumber') {
    const [tag, full] = tuple(raw, 2);
    if (tag !== 'finalized') rpcQuantity(tag, 64);
    need(full === false, 'RPC_TRANSPORT_PARAMS'); return [tag, false];
  }
  if (method === 'eth_getBalance'||method==='eth_getCode') {
    const [address, rawSelector] = tuple(raw, 2), selector = exact(rawSelector, ['blockHash', 'requireCanonical']);
    need(matches(address, /^0x[0-9a-f]{40}$/), 'RPC_TRANSPORT_PARAMS'); hash32(selector.blockHash);
    need(selector.requireCanonical === true, 'RPC_TRANSPORT_PARAMS');
    return [address, { blockHash: selector.blockHash, requireCanonical: true }];
  }
  if(method==='eth_call'){
    const [rawCall,rawSelector]=tuple(raw,2),call=exact(rawCall,['to','data']),selector=exact(rawSelector,['blockHash','requireCanonical']);
    need(matches(call.to,/^0x[0-9a-f]{40}$/)&&matches(call.data,/^0x70a082310{24}[0-9a-f]{40}$/),'RPC_TRANSPORT_PARAMS');hash32(selector.blockHash);need(selector.requireCanonical===true,'RPC_TRANSPORT_PARAMS');
    return [{to:call.to,data:call.data},{blockHash:selector.blockHash,requireCanonical:true}];
  }
  throw fail('METHOD_FORBIDDEN');
}
function tronRequest(path, raw) {
  if (path === '/walletsolidity/getnowblock') return exact(raw, []);
  if (path === '/walletsolidity/getblockbynum') {
    const body = exact(raw, ['num']); need(body.num === 0 && !Object.is(body.num, -0), 'RPC_TRANSPORT_PARAMS'); return body;
  }
  if (path === '/walletsolidity/getaccount') {
    const body = exact(raw, ['address', 'visible']);
    need(normalizeTronAddress(body.address) === body.address && body.visible === false, 'RPC_TRANSPORT_PARAMS'); return body;
  }
  throw fail('METHOD_FORBIDDEN');
}
function signalOf(raw) {
  const { signal } = exact(raw, ['signal']);
  need(signal instanceof AbortSignal && !types.isProxy(signal), 'RPC_TRANSPORT_ABORT_SIGNAL');
  // Invoking the built-in getter also rejects a forged AbortSignal prototype.
  const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get.call(signal);
  need(!aborted, 'RPC_TRANSPORT_ABORTED'); return signal;
}

function httpTransport(selected) {
  let inFlight = 0;
  return function post(path, body, signal, numericTokens) {
    if (inFlight >= MAX_IN_FLIGHT) return Promise.reject(fail('BUSY'));
    const target = new URL(selected.endpoint);
    if (path !== null) target.pathname = path;
    const payload = JSON.stringify(body); inFlight++;
    return new Promise((resolve, reject) => {
      let request, response, timer, settled = false, bytes = 0;
      const chunks = [];
      const finish = (error, result) => {
        if (settled) return; settled = true; inFlight--; clearTimeout(timer);
        signal.removeEventListener('abort', abort); chunks.length = 0;
        if (error) { reject(error); response?.destroy(); request?.destroy(); } else resolve(result);
      };
      const abort = () => finish(fail('ABORTED'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      timer = setTimeout(() => finish(fail('TIMEOUT')), selected.timeoutMs);
      try {
        request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, {
          method: 'POST', agent: false, maxHeaderSize: 8192,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json',
            'Accept-Encoding': 'identity', 'Content-Length': Buffer.byteLength(payload) },
        }, incoming => {
          response = incoming;
          if (settled) { response.destroy(); return; }
          response.on('error', () => finish(fail('NETWORK')));
          response.on('aborted', () => finish(fail('INCOMPLETE')));
          response.on('close', () => { if (!settled) finish(fail('INCOMPLETE')); });
          if (response.statusCode !== 200) return finish(fail('HTTP_STATUS'));
          const headers = response.headers, length = headers['content-length'];
          if (!matches(headers['content-type'], /^application\/json(?:;\s*charset=utf-8)?$/i)
            || headers['content-encoding'] !== undefined && headers['content-encoding'] !== 'identity')
            return finish(fail('RESPONSE_TYPE'));
          if (length !== undefined && (!matches(length, /^(?:0|[1-9][0-9]*)$/)
            || BigInt(length) > BigInt(selected.maxResponseBytes))) return finish(fail('RESPONSE_LIMIT'));
          response.on('data', chunk => {
            if (settled) return; bytes += chunk.length;
            if (bytes > selected.maxResponseBytes) return finish(fail('RESPONSE_LIMIT')); chunks.push(chunk);
          });
          response.on('end', () => {
            if (settled) return;
            if (!response.complete || length !== undefined && BigInt(length) !== BigInt(bytes)) return finish(fail('INCOMPLETE'));
            try {
              const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
              const parsed = parseObservationJson(text, { numericTokens }); finish(null, parsed);
            } catch { finish(fail('JSON_INVALID')); }
          });
        });
        request.on('error', () => finish(fail('NETWORK'))); request.end(payload);
      } catch { finish(fail('NETWORK')); }
    });
  };
}

export function createEvmHttpObservationTransport(raw) {
  const selected = config(raw, 'evm'), post = httpTransport(selected);
  return Object.freeze(async (method, params, options) => {
    const checked = evmRequest(method, params), signal = signalOf(options), id = randomBytes(16).toString('hex');
    const response = exact(await post(null, { jsonrpc: '2.0', id, method, params: checked }, signal, false),
      ['jsonrpc', 'id'], ['result', 'error']);
    need(response.jsonrpc === '2.0' && response.id === id, 'RPC_TRANSPORT_RESPONSE_ID');
    need(Object.hasOwn(response, 'result') && !Object.hasOwn(response, 'error'), 'RPC_TRANSPORT_RPC_ERROR');
    return response.result;
  });
}
export function createTronHttpObservationTransport(raw) {
  const selected = config(raw, 'tron'), post = httpTransport(selected);
  return Object.freeze(async (path, body, options) => {
    const checked = tronRequest(path, body), signal = signalOf(options);
    const response = await post(path, checked, signal, true);
    fields(response, []); // A JSON object is mandatory, including for empty accounts.
    need(!Object.hasOwn(response, 'Error') && !Object.hasOwn(response, 'error'), 'RPC_TRANSPORT_RPC_ERROR');
    return response;
  });
}

function solanaRequest(method, raw) {
  if (method === 'getGenesisHash') return tuple(raw,0);
  if (method === 'getSlot') {const [options]=tuple(raw,1);const p=exact(options,['commitment']);need(p.commitment==='finalized','RPC_TRANSPORT_PARAMS');return [p];}
  if (method === 'getBalance') {
    const [address,options]=tuple(raw,2),p=exact(options,['commitment','minContextSlot']);
    solanaPublicKey(address);need(p.commitment==='finalized'&&Number.isSafeInteger(p.minContextSlot)&&p.minContextSlot>=0,'RPC_TRANSPORT_PARAMS');return [address,p];
  }
  if (method === 'getBlock') {
    const [slot,options]=tuple(raw,2),p=exact(options,['commitment','transactionDetails','rewards','maxSupportedTransactionVersion']);
    need(Number.isSafeInteger(slot)&&slot>=0&&p.commitment==='finalized'&&p.transactionDetails==='none'&&p.rewards===false&&p.maxSupportedTransactionVersion===0,'RPC_TRANSPORT_PARAMS');return [slot,p];
  }
  throw fail('METHOD_FORBIDDEN');
}
function bitcoinRequest(method,raw,addresses) {
  if (['getbestblockhash','getblockchaininfo','getwalletinfo','listlockunspent'].includes(method)) return tuple(raw,0);
  if (method==='getblockhash') {const [height]=tuple(raw,1);need(height===0&&!Object.is(height,-0),'RPC_TRANSPORT_PARAMS');return [0];}
  if (method==='getblockheader') {const [hash,verbose]=tuple(raw,2);hash32(hash,false);need(verbose===true,'RPC_TRANSPORT_PARAMS');return [hash,true];}
  if (method==='getaddressinfo') {const [address]=tuple(raw,1);need(addresses.includes(address),'RPC_TRANSPORT_PARAMS');return [address];}
  if (method==='listunspent') {
    const [min,max,rawAddresses,unsafe,options]=tuple(raw,5),[address]=tuple(rawAddresses,1),p=exact(options,['maximumCount','include_immature_coinbase']);
    need(min===0&&!Object.is(min,-0)&&max===9999999&&addresses.includes(address)&&unsafe===true&&p.maximumCount===257&&p.include_immature_coinbase===false,'RPC_TRANSPORT_PARAMS');
    return [0,9999999,[address],true,p];
  }
  throw fail('METHOD_FORBIDDEN');
}
function fixedNumericRpc(raw,family,validate) {
  const selected=config(raw,family),post=httpTransport(selected);
  return Object.freeze(async(method,params,options)=>{
    const checked=validate(method,params),signal=signalOf(options),id=randomBytes(16).toString('hex');
    const response=exact(await post(null,{jsonrpc:'2.0',id,method,params:checked},signal,true),['jsonrpc','id'],['result','error']);
    need(response.jsonrpc==='2.0'&&response.id===id,'RPC_TRANSPORT_RESPONSE_ID');
    need(Object.hasOwn(response,'result')&&(!Object.hasOwn(response,'error')||family==='bitcoin'&&response.error===null),'RPC_TRANSPORT_RPC_ERROR');
    return response.result;
  });
}
export function createSolanaHttpObservationTransport(raw) {return fixedNumericRpc(raw,'solana',solanaRequest);}
export function createBitcoinHttpObservationTransport(raw) {
  const {watch,...options}=exact(raw,['endpoint','watch'],['timeoutMs','maxResponseBytes']);
  const policy=bitcoinWatchPolicy(watch);
  return fixedNumericRpc(options,'bitcoin',(method,params)=>bitcoinRequest(method,params,policy.addresses));
}
