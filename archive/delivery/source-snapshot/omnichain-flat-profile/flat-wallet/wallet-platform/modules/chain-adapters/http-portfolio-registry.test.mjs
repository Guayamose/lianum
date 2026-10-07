/** End-to-end backend read integration over actual loopback HTTP. Every RPC
 * response is a synthetic fixture; no public-node/native acceptance implied. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHttpPortfolioRegistry } from './http-portfolio-registry.mjs';
import { PORTFOLIO_CHAINS } from './portfolio-registry.mjs';

const evmAddress = '0x' + '12'.repeat(20), tronAddress = '41' + '00'.repeat(20);
const tronBase58 = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const hash = n => '0x' + n.toString(16).padStart(64, '0');
const tronId = (height, suffix = '1') => BigInt(height).toString(16).padStart(16, '0') + suffix.repeat(48);
const chains = ['ethereum', 'base', 'arbitrum', 'bnb', 'tron'];
const evmGenesis = index => ({ number: '0x0', hash: hash(index + 1), parentHash: hash(0), timestamp: '0x0' });
const evmBlock = index => ({ number: '0x10', hash: hash(index + 16), parentHash: hash(index + 32), timestamp: '0x3e8' });
const tronBlock = height => ({ blockID: tronId(height), block_header: { raw_data:
  { number: height, timestamp: 1000000, parentHash: tronId(Math.max(0, height - 1)) } } });
const request = chain => ({ chain, address: chain === 'tron' ? tronBase58 : evmAddress, query: 'native-balance' });

async function fixture(t, override = () => undefined) {
  const calls = [];
  const server = createServer(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    const body = JSON.parse(Buffer.concat(parts).toString()), path = req.url;
    const call = { path, body }; calls.push(call);
    const custom = await override(call, calls); if (custom === 'hang') return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (custom !== undefined) { res.end(typeof custom === 'string' ? custom : JSON.stringify(custom)); return; }
    if (path.startsWith('/walletsolidity/')) {
      if (path.endsWith('/getaccount')) res.end('{"address":"' + tronAddress + '","balance":9007199254740993}');
      else res.end(JSON.stringify(tronBlock(path.endsWith('/getblockbynum') ? 0 : 16)));
      return;
    }
    const chain = path.slice(1), index = chains.indexOf(chain); let result;
    if (body.method === 'eth_chainId') result = '0x' + BigInt(PORTFOLIO_CHAINS[chain].chainId).toString(16);
    else if (body.method === 'eth_getBlockByNumber') result = body.params[0] === '0x0' ? evmGenesis(index) : evmBlock(index);
    else if (body.method === 'eth_getBalance') result = '0x20000000000001';
    else assert.fail('unexpected request');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const networks = chains.map((chain, index) => ({ chain, genesisHash: chain === 'tron' ? tronId(0) : evmGenesis(index).hash,
    endpoint: origin + (chain === 'tron' ? '/' : '/' + chain) }));
  return { origin, networks, calls };
}

test('one SDK/bootstrap capability reads five distinct native assets through actual HTTP adapters', async t => {
  const { networks, calls } = await fixture(t), registry = createHttpPortfolioRegistry({ networks, now: () => 1005000 });
  assert.deepEqual(Object.keys(registry), ['listChains', 'observe']);
  assert.ok(registry.listChains().every(item => item.configured));
  assert.equal(calls.length, 0, 'bootstrap must not cause network I/O');
  const results = await Promise.all(chains.map(chain => registry.observe(request(chain))));
  for (const [index, observed] of results.entries()) {
    assert.equal(observed.status, 'fresh'); assert.equal(observed.balanceAtomic, '9007199254740993');
    assert.equal(observed.chain, chains[index]); assert.equal(observed.network.genesisHash, networks[index].genesisHash);
    assert.equal(observed.creditEligible, false); assert.equal(observed.privateSpendableAtomic, null);
    assert.equal(observed.network.finality.independentConsensusVerified, false);
    assert.equal(observed.assurance, 'trusted-rpc-observation'); assert.ok(Object.isFrozen(observed));
    if (observed.chain === 'tron') assert.equal(observed.address, tronAddress);
  }
  assert.equal(new Set(results.map(result => result.network.nativeAsset.id)).size, 5);
  assert.equal(calls.length, 37);
  assert.equal(JSON.stringify(results).includes('127.0.0.1'), false);
  assert.equal(JSON.stringify(registry.listChains()).includes('endpoint'), false);
  for (const call of calls.filter(call => call.body.method === 'eth_getBalance'))
    assert.deepEqual(call.body.params[1], { blockHash: evmBlock(chains.indexOf(call.path.slice(1))).hash, requireCanonical: true });
});

test('unconfigured networks stay unknown and invalid runtime selection cannot create a connection', async t => {
  const { networks, calls } = await fixture(t), registry = createHttpPortfolioRegistry({ networks: [networks[1]], now: () => 1005000 });
  assert.equal(registry.listChains().filter(item => item.configured).length, 1);
  const missing = await registry.observe(request('tron'));
  assert.equal(missing.reason, 'ADAPTER_NOT_CONFIGURED'); assert.equal(missing.balanceAtomic, null);
  for (const extra of [{ endpoint: networks[0].endpoint }, { method: 'eth_sendRawTransaction' }, { chain: 'bitcoin' },
    { query: 'send' }, { genesisHash: networks[0].genesisHash }, { freshness: { maxBlockAgeMs: 86400000 } }])
    await assert.rejects(registry.observe({ ...request('base'), ...extra }));
  assert.equal(calls.length, 0);
  assert.equal((await registry.observe(request('base'))).status, 'fresh');
});

test('bootstrap snapshots every target and freshness policy before caller mutation', async t => {
  const { networks, calls } = await fixture(t);
  networks[0].freshness = { maxBlockAgeMs: 6000 };
  const registry = createHttpPortfolioRegistry({ networks, now: () => 1005000 });
  networks[0].chain = 'bnb'; networks[0].genesisHash = hash(999); networks[0].endpoint = 'https://bad.example/';
  networks[0].freshness.maxBlockAgeMs = 1; networks.length = 0;
  const input = request('ethereum'), pending = registry.observe(input); input.chain = 'bnb'; input.address = '0x' + 'ab'.repeat(20);
  const observed = await pending;
  assert.equal(observed.status, 'fresh'); assert.equal(observed.address, evmAddress); assert.equal(observed.validUntilMs, '1006000');
  assert.equal(registry.listChains().length, 5); assert.ok(calls.every(call => call.path === '/ethereum'));
});

test('network mismatch and unsupported EIP-1898 never fall back or reuse a previous balance', async t => {
  let phase = 'fresh';
  const { networks, calls } = await fixture(t, call => {
    if (phase === 'wrong-chain' && call.body.method === 'eth_chainId') return { jsonrpc: '2.0', id: call.body.id, result: '0x1' };
    if (phase === 'unsupported' && call.body.method === 'eth_getBalance')
      return { jsonrpc: '2.0', id: call.body.id, error: { code: -32602, message: 'unsupported blockHash selector' } };
  });
  const registry = createHttpPortfolioRegistry({ networks, now: () => 1005000 });
  assert.equal((await registry.observe(request('bnb'))).status, 'fresh');
  phase = 'wrong-chain';
  const wrong = await registry.observe(request('bnb')); assert.equal(wrong.reason, 'CHAIN_ID_MISMATCH'); assert.equal(wrong.balanceAtomic, null);
  phase = 'unsupported';
  const unsupported = await registry.observe(request('base'));
  assert.equal(unsupported.reason, 'RPC_UNAVAILABLE'); assert.equal(unsupported.balanceAtomic, null);
  assert.equal(unsupported.block, null); assert.equal(unsupported.validUntilMs, null);
  assert.ok(calls.filter(call => call.body.method === 'eth_getBalance').every(call => typeof call.body.params[1] === 'object'));
});

test('Tron missing balances stay unknown and advancing solidified bracket remains unknown', async t => {
  let phase = 'missing', nowBlocks = 0;
  const { networks } = await fixture(t, call => {
    if (phase === 'missing' && call.path.endsWith('/getaccount')) return { address: tronAddress };
    if (phase === 'advancing' && call.path.endsWith('/getnowblock')) return tronBlock(++nowBlocks === 1 ? 16 : 17);
  });
  const registry = createHttpPortfolioRegistry({ networks, now: () => 1005000 });
  const missing = await registry.observe(request('tron')); assert.equal(missing.reason, 'BALANCE_UNKNOWN'); assert.equal(missing.balanceAtomic, null);
  phase = 'advancing';
  const changed = await registry.observe(request('tron'));
  assert.equal(changed.reason, 'SOLIDIFIED_CONTEXT_CHANGED'); assert.equal(changed.balanceAtomic, null);
});

test('staleness and whole-query timeout stay enforced through the concrete networking path', async t => {
  const current = await fixture(t), stale = createHttpPortfolioRegistry({ networks: current.networks, now: () => 2800000 });
  for (const chain of ['base', 'tron']) {
    const observed = await stale.observe(request(chain)); assert.equal(observed.status, 'stale'); assert.equal(observed.balanceAtomic, null);
  }
  const hanging = await fixture(t, () => 'hang'); hanging.networks[0].freshness = { maxQueryMs: 20 };
  const bounded = createHttpPortfolioRegistry({ networks: [hanging.networks[0]], now: () => 1005000 });
  const observed = await bounded.observe(request('ethereum'));
  assert.equal(observed.reason, 'QUERY_TIMEOUT'); assert.equal(observed.balanceAtomic, null); assert.ok(hanging.calls.length <= 1, 'the timeout must not retry');
});

test('private bootstrap rejects duplicate/fake profiles, extra settings, array getters and proxies', async t => {
  const { networks, calls } = await fixture(t);
  for (const input of [{ networks: [networks[0], networks[0]] }, { networks: [{ ...networks[0], chain: '__proto__' }] },
    { networks: [{ ...networks[0], chain: 'solana' }] }, { networks: [{ ...networks[0], signer: {} }] },
    { networks, rpc() {} }, { networks, now: 0 }]) assert.throws(() => createHttpPortfolioRegistry(input));
  let touched = false;
  const array = []; Object.defineProperty(array, '0', { enumerable: true, get() { touched = true; return networks[0]; } });
  assert.throws(() => createHttpPortfolioRegistry({ networks: array }));
  assert.throws(() => createHttpPortfolioRegistry({ networks: new Proxy([], { get() { touched = true; } }) }));
  assert.equal(touched, false); assert.equal(calls.length, 0);
  assert.ok(createHttpPortfolioRegistry({ networks: [] }).listChains().every(item => !item.configured));
});
