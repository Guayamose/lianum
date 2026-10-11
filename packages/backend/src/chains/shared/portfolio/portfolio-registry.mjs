import {solanaPublicKey, bitcoinWatchAddress} from '../observations/observation-addresses.mjs';
import {ObservationError, need} from '../observations/observation-errors.mjs';
export {ObservationError, need} from '../observations/observation-errors.mjs';
/** Read-only display observations. These capabilities cannot authorize a credit,
 * spend, mint, bridge receipt or native-consensus claim. Construct privately. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';

export const PORTFOLIO_SCHEMA = 'flat-portfolio-observation/1';
export const PORTFOLIO_CHAINS = freeze({
  ethereum: { family: 'evm', chainId: '1', symbol: 'ETH', decimals: 18, layer: 'l1' },
  base: { family: 'evm', chainId: '8453', symbol: 'ETH', decimals: 18, layer: 'l2' },
  arbitrum: { family: 'evm', chainId: '42161', symbol: 'ETH', decimals: 18, layer: 'l2' },
  bnb: { family: 'evm', chainId: '56', symbol: 'BNB', decimals: 18, layer: 'l1' },
  'bsc-local': { family: 'evm', chainId: '714', symbol: 'labBNB', decimals: 18, layer: 'l1' },
  solana: { family: 'solana', chainId: null, symbol: 'SOL', decimals: 9, layer: 'l1' },
  bitcoin: { family: 'bitcoin', chainId: null, symbol: 'BTC', decimals: 8, layer: 'l1' },
  tron: { family: 'tron', chainId: null, symbol: 'TRX', decimals: 6, layer: 'l1' },
});
const adapters = new WeakMap();
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
/** Select own data fields without invoking response getters or traversing large
 * unrelated block/transaction payloads. Extras are permitted only for RPC data. */
export function fields(value, required, optional = [], exact = false) {
  need(value && typeof value === 'object' && !types.isProxy(value)
    && Object.getPrototypeOf(value) === Object.prototype, 'INVALID_RECORD');
  const allowed = [...required, ...optional], result = {};
  if (exact) need(Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.includes(key)), 'UNEXPECTED_FIELD');
  for (const key of allowed) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) { need(!required.includes(key), 'MISSING_FIELD'); continue; }
    need(descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'INVALID_DATA_FIELD');
    result[key] = descriptor.value;
  }
  return result;
}
export function unsignedDecimal(value, bits = 256) {
  need(typeof value === 'string' && value.length <= 78 && /^(0|[1-9][0-9]*)$/.test(value), 'INVALID_INTEGER');
  const number = BigInt(value); need(number < (1n << BigInt(bits)), 'INTEGER_RANGE'); return number;
}
export function rpcQuantity(value, bits = 256) {
  need(typeof value === 'string' && value.length <= 66 && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value), 'INVALID_QUANTITY');
  const number = BigInt(value); need(number < (1n << BigInt(bits)), 'INTEGER_RANGE'); return number;
}
export function hash32(value, prefixed = true) {
  need(typeof value === 'string' && (prefixed ? /^0x[0-9a-f]{64}$/ : /^[0-9a-f]{64}$/).test(value), 'INVALID_HASH');
  need(!/^0+$/.test(prefixed ? value.slice(2) : value), 'ZERO_HASH'); return value;
}
export function safeMilliseconds(value) {
  need(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0), 'INVALID_CLOCK'); return value;
}
const checksum = bytes => createHash('sha256').update(createHash('sha256').update(bytes).digest()).digest().subarray(0, 4);
function encodeBase58(bytes) {
  let number = BigInt('0x' + bytes.toString('hex')), text = '';
  while (number) { text = BASE58[Number(number % 58n)] + text; number /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; text = '1' + text; }
  return text;
}
export function normalizeTronAddress(value) {
  need(typeof value === 'string', 'INVALID_ADDRESS');
  if (/^41[0-9a-f]{40}$/.test(value)) return value;
  need(/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value), 'INVALID_ADDRESS');
  let number = 0n;
  for (const character of value) number = number * 58n + BigInt(BASE58.indexOf(character));
  const hex = number.toString(16), bytes = Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex');
  need(bytes.length === 25 && bytes[0] === 0x41 && encodeBase58(bytes) === value, 'INVALID_ADDRESS');
  need(bytes.subarray(21).equals(checksum(bytes.subarray(0, 21))), 'INVALID_ADDRESS_CHECKSUM');
  return bytes.subarray(0, 21).toString('hex');
}
export function normalizePortfolioRequest(raw, expectedChain) {
  const value = fields(raw, ['chain', 'address', 'query'], [], true);
  need(typeof value.chain === 'string' && Object.hasOwn(PORTFOLIO_CHAINS, value.chain), 'UNSUPPORTED_CHAIN');
  need(expectedChain === undefined || expectedChain === value.chain, 'WRONG_ADAPTER_CHAIN');
  need(value.query === 'native-balance', 'UNSUPPORTED_QUERY');
  if (value.chain === 'tron') value.address = normalizeTronAddress(value.address);
  else if (value.chain === 'solana') value.address = solanaPublicKey(value.address);
  else if (value.chain === 'bitcoin') value.address = bitcoinWatchAddress(value.address);
  else need(typeof value.address === 'string' && /^0x[0-9a-f]{40}$/.test(value.address), 'INVALID_ADDRESS');
  return freeze(value);
}

/** Trusted bootstrap only: transport and clock must never come from a public
 * request. The deadline covers the whole query, and aborts cooperative I/O. */
export function observationBootstrap(raw, family) {
  const value = fields(raw, ['chain', 'genesisHash', 'transport'], ['now', 'freshness'], true);
  need(Object.hasOwn(PORTFOLIO_CHAINS, value.chain) && PORTFOLIO_CHAINS[value.chain].family === family, 'UNSUPPORTED_CHAIN');
  if (family === 'solana') {solanaPublicKey(value.genesisHash);need(value.genesisHash!=='1'.repeat(32),'ZERO_HASH');}
  else hash32(value.genesisHash, family === 'evm'); need(typeof value.transport === 'function', 'INVALID_TRANSPORT');
  const now = value.now ?? Date.now; need(typeof now === 'function', 'INVALID_CLOCK');
  const policy = value.freshness === undefined ? {} : fields(value.freshness, [], ['maxBlockAgeMs', 'maxQueryMs', 'maxFutureSkewMs'], true);
  const freshness = { maxBlockAgeMs: policy.maxBlockAgeMs ?? 1800000,
    maxQueryMs: policy.maxQueryMs ?? 10000, maxFutureSkewMs: policy.maxFutureSkewMs ?? 5000 };
  for (const [key, number] of Object.entries(freshness)) {
    safeMilliseconds(number); need(number <= (key === 'maxQueryMs' ? 60000 : 86400000)
      && (key === 'maxFutureSkewMs' || number > 0), 'INVALID_FRESHNESS');
  }
  return Object.freeze({ ...value, now, freshness: freeze(freshness), descriptor: describeNetwork(value.chain, value.genesisHash) });
}
export function describeNetwork(chain, genesisHash) {
  const spec = PORTFOLIO_CHAINS[chain];
  const networkId = `${spec.family === 'evm' ? `eip155:${spec.chainId}` : spec.family}/genesis:${genesisHash}`;
  return freeze({ chain, family: spec.family, chainId: spec.chainId, genesisHash, networkId,
    nativeAsset: { id: `${networkId}/native`, kind: 'native', symbol: spec.symbol, decimals: spec.decimals },
    finality: { source: ['evm','solana'].includes(spec.family) ? 'rpc-finalized' : spec.family === 'bitcoin' ? 'rpc-confirmation-policy' : 'rpc-solidified',
      independentConsensusVerified: false,
      ethereumSettlement: spec.layer === 'l2' ? 'not-independently-verified' : 'not-applicable' } });
}
export function checkFreshBlock(block, now, freshness) {
  const timestamp = unsignedDecimal(block.timestampMs, 64), current = BigInt(safeMilliseconds(now));
  need(timestamp <= current + BigInt(freshness.maxFutureSkewMs), 'FUTURE_BLOCK');
  need(current < timestamp + BigInt(freshness.maxBlockAgeMs), 'BLOCK_STALE', 'stale');
}
function result(descriptor, request, at, status, reason, observed, freshness) {
  return freeze({ schema: PORTFOLIO_SCHEMA, chain: request.chain, address: request.address, query: request.query,
    network: descriptor, status, reason, observedAtMs: String(at),
    validUntilMs: status === 'fresh' ? (BigInt(observed.block.timestampMs) + BigInt(freshness.maxBlockAgeMs)).toString() : null,
    balanceAtomic: status === 'fresh' ? observed.balanceAtomic : null,
    block: status === 'fresh' ? observed.block : null,
    assurance: 'trusted-rpc-observation', creditEligible: false, privateSpendableAtomic: null,
    ...(request.chain === 'bitcoin' ? { pendingBalanceAtomic: status === 'fresh' ? observed.pendingBalanceAtomic : null, balanceScope: 'MATURE_WATCH_WALLET_UTXOS', coverage: descriptor?'BOOTSTRAP_DECLARED':'UNAVAILABLE', minimumConfirmations: descriptor?.finality.minimumConfirmations ?? null } : {}) });
}
/** Internal construction helper; expose only the returned observe/list capability
 * to callers. A module import is not a sandbox against hostile in-process code. */
export function definePortfolioAdapter(config, read) {
  const capability = Object.freeze({ descriptor: config.descriptor,
    async observe(raw) {
      const request = normalizePortfolioRequest(raw, config.chain);
      const started = safeMilliseconds(config.now()), controller = new AbortController();
      let timer;
      const call = async (method, params) => {
        need(!controller.signal.aborted, 'QUERY_TIMEOUT');
        try { return await config.transport(method, freeze(params), { signal: controller.signal }); }
        catch { throw new ObservationError('RPC_UNAVAILABLE'); }
      };
      try {
        const observed = await Promise.race([
          read({ request, call }),
          new Promise((_, reject) => { timer = setTimeout(() => {
            controller.abort(); reject(new ObservationError('QUERY_TIMEOUT'));
          }, config.freshness.maxQueryMs); }),
        ]);
        const at = safeMilliseconds(config.now());
        need(at >= started, 'CLOCK_REGRESSED');
        need(at - started < config.freshness.maxQueryMs, 'QUERY_TIMEOUT');
        checkFreshBlock(observed.block, at, config.freshness);
        return result(config.descriptor, request, at, 'fresh', null, observed, config.freshness);
      } catch (error) {
        const at = safeMilliseconds(config.now());
        return result(config.descriptor, request, at,
          error instanceof ObservationError ? error.status : 'unknown',
          error instanceof ObservationError ? error.code : 'MALFORMED_RESPONSE');
      } finally { clearTimeout(timer); controller.abort(); }
    },
  });
  adapters.set(capability, config.descriptor); return capability;
}

/** Only bootstrap accepts adapters. Every runtime request is a fixed read. */
export function createPortfolioRegistry(raw) {
  const { adapters: configured } = fields(raw, ['adapters'], [], true);
  need(Array.isArray(configured) && !types.isProxy(configured) && configured.length <= 7, 'INVALID_ADAPTERS');
  const selected = new Map();
  for (const adapter of configured) {
    const descriptor = adapters.get(adapter); need(descriptor && !selected.has(descriptor.chain), 'INVALID_ADAPTER');
    selected.set(descriptor.chain, adapter);
  }
  return Object.freeze({
    listChains: () => freeze(Object.keys(PORTFOLIO_CHAINS).map(chain => ({ chain,
      configured: selected.has(chain), network: selected.get(chain)?.descriptor ?? null }))),
    async observe(rawRequest) {
      const request = normalizePortfolioRequest(rawRequest), adapter = selected.get(request.chain);
      return adapter ? adapter.observe(request) : result(null, request, Date.now(), 'unknown', 'ADAPTER_NOT_CONFIGURED');
    },
  });
}
