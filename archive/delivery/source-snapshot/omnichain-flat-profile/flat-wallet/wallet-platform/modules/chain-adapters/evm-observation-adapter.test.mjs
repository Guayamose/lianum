/** Synthetic transport fixtures only. No chain, endpoint, key, funds or proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvmObservationAdapter, normalizeEvmBlock } from './evm-observation-adapter.mjs';
import { PORTFOLIO_CHAINS } from './portfolio-registry.mjs';

const hash = byte => '0x' + byte.repeat(64), address = '0x' + '12'.repeat(20);
const genesis = { number: '0x0', hash: hash('1'), parentHash: hash('0'), timestamp: '0x0' };
const block = { number: '0xa', hash: hash('2'), parentHash: hash('3'), timestamp: '0x3e8' };
const request = chain => ({ chain, address, query: 'native-balance' });
function fixture(chain = 'ethereum', override = () => undefined, extra = {}) {
  const calls = [];
  const transport = async (method, params, options) => {
    calls.push([method, structuredClone(params)]);
    assert.equal(options.signal instanceof AbortSignal, true);
    const custom = await override(method, params, calls);
    if (custom !== undefined) return custom;
    if (method === 'eth_chainId') return '0x' + BigInt(PORTFOLIO_CHAINS[chain].chainId).toString(16);
    if (method === 'eth_getBalance') return '0x20000000000001';
    if (method === 'eth_getBlockByNumber') return structuredClone(params[0] === '0x0' ? genesis : block);
    assert.fail('unexpected RPC method');
  };
  const config = { chain, genesisHash: genesis.hash, transport, now: () => 1005000, ...extra };
  return { calls, config, adapter: createEvmObservationAdapter(config) };
}

test('four EVM identities preserve exact balance and make no independent finality or credit claim', async () => {
  const assetIds = [];
  for (const chain of ['ethereum', 'base', 'arbitrum', 'bnb']) {
    const { adapter, calls } = fixture(chain), result = await adapter.observe(request(chain));
    assert.equal(result.status, 'fresh'); assert.equal(result.balanceAtomic, '9007199254740993');
    assert.equal(result.network.genesisHash, genesis.hash);
    assert.equal(result.network.chainId, PORTFOLIO_CHAINS[chain].chainId);
    assert.equal(result.network.finality.independentConsensusVerified, false);
    assert.equal(result.network.finality.ethereumSettlement,
      ['base', 'arbitrum'].includes(chain) ? 'not-independently-verified' : 'not-applicable');
    assert.equal(result.assurance, 'trusted-rpc-observation'); assert.equal(result.creditEligible, false);
    assert.equal(result.privateSpendableAtomic, null); assert.equal(result.validUntilMs, '2800000');
    assert.deepEqual(calls.find(([method]) => method === 'eth_getBalance'),
      ['eth_getBalance', [address, { blockHash: block.hash, requireCanonical: true }]]);
    assert.equal(calls.length, 8); assert.ok(Object.isFrozen(result.network.nativeAsset));
    assetIds.push(result.network.nativeAsset.id);
  }
  assert.equal(new Set(assetIds).size, 4);
});

test('chain/genesis mismatches, missing state, malformed quantities and RPC failures return no balance', async () => {
  const cases = [
    (method) => method === 'eth_chainId' ? '0x2' : undefined,
    (method, params) => method === 'eth_getBlockByNumber' && params[0] === '0x0' ? { ...genesis, hash: hash('f') } : undefined,
    (method) => method === 'eth_getBalance' ? null : undefined,
    (method) => method === 'eth_getBalance' ? '0x00' : undefined,
    (method) => method === 'eth_getBalance' ? '0x' + 'f'.repeat(65) : undefined,
    (method) => method === 'eth_getBalance' ? 0 : undefined,
    (method) => method === 'eth_getBalance' ? { result: '0x1' } : undefined,
    (method, params) => method === 'eth_getBlockByNumber' && params[0] === 'finalized' ? null : undefined,
    (method) => { if (method === 'eth_getBalance') throw new Error('unsupported EIP-1898; secret URL'); },
  ];
  for (const override of cases) {
    const { adapter, calls } = fixture('ethereum', override), result = await adapter.observe(request('ethereum'));
    assert.equal(result.status, 'unknown'); assert.equal(result.balanceAtomic, null); assert.equal(result.block, null);
    assert.equal(result.validUntilMs, null); assert.equal(result.creditEligible, false);
    assert.equal(JSON.stringify(result).includes('secret URL'), false);
    assert.ok(calls.every(([method, params]) => method !== 'eth_getBalance' || typeof params[1] === 'object'));
  }
});

test('canonical block changes and regressed finality are reorged; stale/future timestamps never credit', async () => {
  const changes = [
    (method, params) => method === 'eth_getBlockByNumber' && params[0] === '0xa' ? { ...block, hash: hash('4') } : undefined,
    (method, params, calls) => method === 'eth_getBlockByNumber' && params[0] === 'finalized' && calls.length > 3
      ? { ...block, number: '0x9' } : undefined,
  ];
  for (const override of changes) {
    const result = await fixture('ethereum', override).adapter.observe(request('ethereum'));
    assert.equal(result.status, 'reorged'); assert.equal(result.balanceAtomic, null);
  }
  for (const [now, status, reason] of [[2800000, 'stale', 'BLOCK_STALE'], [900000, 'unknown', 'FUTURE_BLOCK']]) {
    const result = await fixture('ethereum', undefined, { now: () => now }).adapter.observe(request('ethereum'));
    assert.equal(result.status, status); assert.equal(result.reason, reason); assert.equal(result.balanceAtomic, null);
  }
});

test('public RPC/options/signer injection and malformed addresses fail before transport', async () => {
  const { adapter, calls } = fixture();
  for (const extra of [{ url: 'https://bad' }, { method: 'eth_sendRawTransaction' }, { signer: {} },
    { query: 'token-balance' }, { chain: 'base' }, { address: address.toUpperCase() }, { address: '0x12' }]) {
    await assert.rejects(adapter.observe({ ...request('ethereum'), ...extra }));
  }
  assert.equal(calls.length, 0);
  assert.throws(() => createEvmObservationAdapter({ ...fixture().config, endpoint: 'forbidden' }));
});

test('request/config mutation across await cannot change the observation target or freshness', async () => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const freshness = { maxBlockAgeMs: 6000 };
  const { adapter, calls, config } = fixture('ethereum', async (_method, _params, seen) => {
    if (seen.length === 1) await wait;
  }, { freshness });
  const input = request('ethereum'), promise = adapter.observe(input);
  input.address = '0x' + 'ff'.repeat(20); input.chain = 'base';
  config.genesisHash = hash('f'); freshness.maxBlockAgeMs = 1; release();
  const result = await promise;
  assert.equal(result.status, 'fresh'); assert.equal(result.address, address);
  assert.equal(result.validUntilMs, '1006000'); assert.equal(calls.find(call => call[0] === 'eth_getBalance')[1][0], address);
});

test('query timeout is bounded and cooperative transport is aborted', async () => {
  let signal;
  const adapter = createEvmObservationAdapter({ chain: 'ethereum', genesisHash: genesis.hash,
    transport: (_method, _params, options) => { signal = options.signal; return new Promise(() => {}); },
    now: () => 1005000, freshness: { maxQueryMs: 5 } });
  const result = await adapter.observe(request('ethereum'));
  assert.equal(result.status, 'unknown'); assert.equal(result.reason, 'QUERY_TIMEOUT');
  assert.equal(result.balanceAtomic, null); assert.equal(signal.aborted, true);
});

test('response accessors/proxies are rejected without running them', () => {
  let touched = false;
  assert.throws(() => normalizeEvmBlock({ ...block, get timestamp() { touched = true; return '0x3e8'; } }));
  assert.throws(() => normalizeEvmBlock(new Proxy(block, { getPrototypeOf() { touched = true; return Object.prototype; } })));
  assert.equal(touched, false);
});
