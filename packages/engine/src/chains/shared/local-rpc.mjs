import http from 'node:http';
import { randomUUID } from 'node:crypto';

const METHODS = Object.freeze({
  ethereum: new Set(['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getBalance', 'eth_getTransactionReceipt']),
  bitcoin: new Set(['getblockchaininfo', 'getblockhash', 'getblockheader', 'getrawtransaction', 'gettxout']),
  solana: new Set(['getGenesisHash', 'getVersion', 'getSlot', 'getBalance', 'getSignatureStatuses', 'getTransaction']),
});

export class LocalRpcError extends Error {
  constructor(code) { super(code); this.name = 'LocalRpcError'; this.code = code; }
}

// Restrict the raw string BEFORE URL normalization: reject alternate numeric IPs,
// DNS names, userinfo, backslashes, query strings, fragments and proxy paths.
export function parseLocalEndpoint(endpoint) {
  if (typeof endpoint !== 'string') throw new LocalRpcError('ENDPOINT_NOT_LITERAL_LOOPBACK');
  const match = /^http:\/\/(127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})\/?$/.exec(endpoint);
  if (!match || Number(match[2]) > 65535) throw new LocalRpcError('ENDPOINT_NOT_LITERAL_LOOPBACK');
  return Object.freeze({ hostname: match[1] === '[::1]' ? '::1' : match[1], port: Number(match[2]), path: '/' });
}

function boundedInteger(value, low, high, name) {
  if (!Number.isSafeInteger(value) || value < low || value > high) throw new LocalRpcError(name);
  return value;
}

export class LocalReadOnlyRpc {
  #endpoint; #family; #timeout; #maxBytes;
  constructor(endpoint, { family, timeoutMs = 2500, maxResponseBytes = 262144 } = {}) {
    this.#endpoint = parseLocalEndpoint(endpoint);
    if (!Object.hasOwn(METHODS, family)) throw new LocalRpcError('UNSUPPORTED_CHAIN_FAMILY');
    this.#family = family;
    this.#timeout = boundedInteger(timeoutMs, 10, 10000, 'INVALID_TIMEOUT');
    this.#maxBytes = boundedInteger(maxResponseBytes, 128, 2097152, 'INVALID_RESPONSE_LIMIT');
  }

  async call(method, params = []) {
    if (!METHODS[this.#family].has(method)) throw new LocalRpcError('METHOD_NOT_READ_ONLY_ALLOWLIST');
    if (!Array.isArray(params)) throw new LocalRpcError('INVALID_PARAMS');
    const id = randomUUID();
    let body;
    try { body = JSON.stringify({ jsonrpc: '2.0', id, method, params }); }
    catch { throw new LocalRpcError('INVALID_PARAMS'); }
    if (Buffer.byteLength(body) > 32768) throw new LocalRpcError('REQUEST_TOO_LARGE');
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve(value);
      };
      const req = http.request({
        ...this.#endpoint, method: 'POST', agent: false,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Accept: 'application/json' },
        // No custom headers/authentication, proxy environment, cookies, or DNS.
        lookup: (_name, _options, callback) => callback(new LocalRpcError('DNS_DISABLED')),
      }, res => {
        const fail = code => { finish(new LocalRpcError(code)); res.destroy(); req.destroy(); };
        if (res.statusCode !== 200) return fail(res.statusCode >= 300 && res.statusCode < 400 ? 'REDIRECT_REJECTED' : 'HTTP_ERROR');
        if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') return fail('ENCODING_REJECTED');
        if (res.headers['content-length'] && Number(res.headers['content-length']) > this.#maxBytes) return fail('RESPONSE_TOO_LARGE');
        const chunks = [];
        let size = 0;
        res.on('data', chunk => {
          size += chunk.length;
          if (size > this.#maxBytes) return fail('RESPONSE_TOO_LARGE');
          chunks.push(chunk);
        });
        res.on('error', () => finish(new LocalRpcError('RESPONSE_INTERRUPTED')));
        res.on('end', () => {
          if (settled) return;
          let data;
          try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
          catch { return finish(new LocalRpcError('INVALID_JSON')); }
          if (!data || Array.isArray(data) || typeof data !== 'object' || data.jsonrpc !== '2.0' || data.id !== id)
            return finish(new LocalRpcError('INVALID_RPC_ENVELOPE'));
          if (data.error !== undefined && data.error !== null) return finish(new LocalRpcError('RPC_REMOTE_ERROR'));
          if (!Object.hasOwn(data, 'result')) return finish(new LocalRpcError('INVALID_RPC_ENVELOPE'));
          finish(null, data.result);
        });
      });
      timer = setTimeout(() => { finish(new LocalRpcError('RPC_TIMEOUT')); req.destroy(); }, this.#timeout);
      req.on('error', () => finish(new LocalRpcError('RPC_CONNECTION_FAILED')));
      req.end(body);
    });
  }
}

const HEX_QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]*)$/;
const HEX_HASH = /^0x[0-9a-f]{64}$/;
const BASE58_HASH = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const PUBLIC_SOLANA_GENESIS = new Set([
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY',
]);

export async function inspectEthereumLocal(rpc, { expectedChainId = '0x7a69', expectedGenesisHash } = {}) {
  if (!HEX_QUANTITY.test(expectedChainId) || ['0x1', '0xa', '0x38', '0x89', '0x2105', '0xa4b1'].includes(expectedChainId))
    throw new LocalRpcError('LOCAL_EVM_POLICY_REQUIRED');
  if (typeof expectedGenesisHash !== 'string' || !HEX_HASH.test(expectedGenesisHash))
    throw new LocalRpcError('PINNED_LOCAL_GENESIS_REQUIRED');
  const chainId = await rpc.call('eth_chainId');
  if (chainId !== expectedChainId) throw new LocalRpcError('WRONG_EVM_CHAIN');
  const block = await rpc.call('eth_getBlockByNumber', ['0x0', false]);
  if (block?.hash !== expectedGenesisHash) throw new LocalRpcError('WRONG_EVM_GENESIS');
  const height = await rpc.call('eth_blockNumber');
  if (typeof height !== 'string' || !HEX_QUANTITY.test(height)) throw new LocalRpcError('INVALID_EVM_HEIGHT');
  return Object.freeze({ family: 'ethereum', environment: 'local', chainId, genesisHash: block.hash, blockNumber: BigInt(height).toString(), assurance: 'trusted-local-rpc-observation' });
}

export async function inspectBitcoinRegtest(rpc) {
  const info = await rpc.call('getblockchaininfo');
  if (info?.chain !== 'regtest') throw new LocalRpcError('BITCOIN_REGTEST_REQUIRED');
  if (!Number.isSafeInteger(info.blocks) || info.blocks < 0 || !/^[0-9a-f]{64}$/.test(info.bestblockhash))
    throw new LocalRpcError('INVALID_BITCOIN_INFO');
  // Identity check only: an untrusted localhost service can lie about this value.
  return Object.freeze({ family: 'bitcoin', environment: 'regtest', blocks: info.blocks, bestBlockHash: info.bestblockhash, assurance: 'trusted-local-rpc-observation' });
}

export async function inspectSolanaLocal(rpc, { expectedGenesisHash } = {}) {
  if (typeof expectedGenesisHash !== 'string' || !BASE58_HASH.test(expectedGenesisHash) || PUBLIC_SOLANA_GENESIS.has(expectedGenesisHash))
    throw new LocalRpcError('PINNED_LOCAL_GENESIS_REQUIRED');
  const genesis = await rpc.call('getGenesisHash');
  if (genesis !== expectedGenesisHash) throw new LocalRpcError('WRONG_SOLANA_GENESIS');
  const slot = await rpc.call('getSlot', [{ commitment: 'finalized' }]);
  if (!Number.isSafeInteger(slot) || slot < 0) throw new LocalRpcError('INVALID_SOLANA_SLOT');
  return Object.freeze({ family: 'solana', environment: 'local', genesisHash: genesis, finalizedSlot: slot, assurance: 'trusted-local-rpc-observation' });
}
