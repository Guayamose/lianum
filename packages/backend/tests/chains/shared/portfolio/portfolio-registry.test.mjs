import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortfolioRegistry, normalizePortfolioRequest, PORTFOLIO_CHAINS } from '../../../../src/chains/shared/portfolio/portfolio-registry.mjs';
import { createEvmObservationAdapter } from '../../../../src/chains/evm/observations/evm-observation-adapter.mjs';

const address = '0x' + '12'.repeat(20);
test('registry has fixed chain/native query allowlist and explicit unconfigured unknowns', async () => {
  const registry = createPortfolioRegistry({ adapters: [] });
  assert.deepEqual(registry.listChains().map(item => item.chain), ['ethereum', 'base', 'arbitrum', 'bnb', 'bsc-local', 'solana', 'bitcoin', 'tron']);
  assert.ok(registry.listChains().every(item => item.configured === false && item.network === null));
  const result = await registry.observe({ chain: 'ethereum', address, query: 'native-balance' });
  assert.equal(result.status, 'unknown'); assert.equal(result.reason, 'ADAPTER_NOT_CONFIGURED');
  assert.equal(result.balanceAtomic, null); assert.equal(result.network, null); assert.equal(result.creditEligible, false);
  for (const input of [{ chain: '__proto__', address, query: 'native-balance' },
    { chain: 'ethereum', address, query: 'eth_call' }, { chain: 'ethereum', address, query: 'native-balance', endpoint: 'bad' }]) {
    await assert.rejects(registry.observe(input));
  }
});

test('registry snapshots bootstrap registrations and rejects fake/duplicate capabilities', () => {
  const adapter = createEvmObservationAdapter({ chain: 'ethereum', genesisHash: '0x' + '11'.repeat(32), transport() {} });
  const configured = [adapter], registry = createPortfolioRegistry({ adapters: configured });
  configured.length = 0;
  assert.equal(registry.listChains()[0].configured, true);
  assert.throws(() => createPortfolioRegistry({ adapters: [{ descriptor: adapter.descriptor, observe() {} }] }));
  assert.throws(() => createPortfolioRegistry({ adapters: [adapter, adapter] }));
  assert.throws(() => createPortfolioRegistry({ adapters: [], transport() {} }));
  assert.ok(Object.isFrozen(PORTFOLIO_CHAINS.ethereum));
});

test('request validation does not execute accessors or proxy traps', () => {
  let executed = false;
  assert.throws(() => normalizePortfolioRequest({ chain: 'ethereum', query: 'native-balance',
    get address() { executed = true; return address; } }));
  assert.throws(() => normalizePortfolioRequest(new Proxy({}, { ownKeys() { executed = true; return []; } })));
  assert.equal(executed, false);
});
