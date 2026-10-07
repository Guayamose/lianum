/** Synthetic solidified-response fixtures; not real Tron network acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTronObservationAdapter, normalizeTronBlock, normalizeTronInteger } from '../../../../src/chains/tron/observations/tron-observation-adapter.mjs';
import { normalizeTronAddress } from '../../../../src/chains/shared/portfolio/portfolio-registry.mjs';

const address = '41' + '00'.repeat(20), base58 = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const id = (height, byte = '1') => BigInt(height).toString(16).padStart(16, '0') + byte.repeat(48);
const block = (height, byte) => ({ blockID: id(height, byte), block_header: {
  raw_data: { number: height, timestamp: 1000000, parentHash: id(Math.max(0, height - 1)) } } });
const request = { chain: 'tron', address, query: 'native-balance' };
function fixture(override = () => undefined, extra = {}) {
  const calls = [];
  const transport = async (path, body) => {
    calls.push([path, structuredClone(body)]);
    const custom = await override(path, body, calls); if (custom !== undefined) return custom;
    if (path === '/walletsolidity/getblockbynum') return block(0);
    if (path === '/walletsolidity/getnowblock') return block(10);
    if (path === '/walletsolidity/getaccount') return { address, balance: '9007199254740993' };
    assert.fail('unexpected HTTP path');
  };
  return { calls, adapter: createTronObservationAdapter({ chain: 'tron', genesisHash: id(0), transport,
    now: () => 1005000, ...extra }) };
}

test('solidified native TRX read binds genesis/address and preserves full int64 precision', async () => {
  const { adapter, calls } = fixture(), result = await adapter.observe({ ...request, address: base58 });
  assert.equal(result.status, 'fresh'); assert.equal(result.balanceAtomic, '9007199254740993');
  assert.equal(result.address, address); assert.equal(result.network.genesisHash, id(0));
  assert.equal(result.network.nativeAsset.decimals, 6); assert.equal(result.network.nativeAsset.symbol, 'TRX');
  assert.equal(result.network.finality.source, 'rpc-solidified'); assert.equal(result.creditEligible, false);
  assert.equal(result.privateSpendableAtomic, null); assert.equal(calls.length, 5);
  assert.deepEqual(calls[2], ['/walletsolidity/getaccount', { address, visible: false }]);
  assert.ok(calls.every(([path]) => path.startsWith('/walletsolidity/')));
});

test('prefix is not network identity; changed genesis and response address fail closed', async () => {
  for (const override of [
    path => path.endsWith('/getblockbynum') ? block(0, '2') : undefined,
    path => path.endsWith('/getaccount') ? { address: '41' + '11'.repeat(20), balance: '1' } : undefined,
    (path, _body, calls) => path.endsWith('/getblockbynum') && calls.length > 1 ? block(0, '2') : undefined,
  ]) {
    const result = await fixture(override).adapter.observe(request);
    assert.equal(result.status, 'unknown'); assert.equal(result.balanceAtomic, null);
  }
  assert.throws(() => createTronObservationAdapter({ chain: 'tron', transport() {} }));
});

test('missing balances, unactivated/unknown accounts and unsafe parsed integers never become zero', async () => {
  for (const account of [{}, { address }, { address, balance: null }, { Error: 'secret diagnostic' },
    { address, balance: Number.MAX_SAFE_INTEGER + 1 }, { address, balance: '-1' },
    { address, balance: '01' }, { address, balance: (1n << 63n).toString() }, { address, balance: -0 }]) {
    const result = await fixture(path => path.endsWith('/getaccount') ? account : undefined).adapter.observe(request);
    assert.equal(result.status, 'unknown'); assert.equal(result.balanceAtomic, null); assert.equal(result.block, null);
    assert.equal(JSON.stringify(result).includes('secret diagnostic'), false);
  }
  const zero = await fixture(path => path.endsWith('/getaccount') ? { address, balance: 0 } : undefined).adapter.observe(request);
  assert.equal(zero.status, 'fresh'); assert.equal(zero.balanceAtomic, '0');
  assert.equal(normalizeTronInteger('9223372036854775807'), '9223372036854775807');
});

test('changed/backwards solidified block is reorged; an advancing bracket is unknown', async () => {
  for (const [repeated, status, reason] of [
    [block(10, '2'), 'reorged', 'BLOCK_CHANGED'],
    [block(9), 'reorged', 'FINALITY_REGRESSED'],
    [block(11), 'unknown', 'SOLIDIFIED_CONTEXT_CHANGED'],
  ]) {
    const result = await fixture((path, _body, calls) => path.endsWith('/getnowblock') && calls.length > 2
      ? repeated : undefined).adapter.observe(request);
    assert.equal(result.status, status); assert.equal(result.reason, reason); assert.equal(result.balanceAtomic, null);
  }
  const stale = await fixture(undefined, { now: () => 2800000 }).adapter.observe(request);
  assert.equal(stale.status, 'stale'); assert.equal(stale.balanceAtomic, null);
});

test('Tron addresses require exact hex or canonical Base58Check; block IDs bind height', () => {
  assert.equal(normalizeTronAddress(base58), address); assert.equal(normalizeTronAddress(address), address);
  for (const bad of [base58.slice(0, -1) + 'c', '0x' + address, '42' + address.slice(2), address + '\n',
    '41' + 'AA'.repeat(20), 'T' + '1'.repeat(33)]) assert.throws(() => normalizeTronAddress(bad));
  assert.throws(() => normalizeTronBlock({ ...block(10), blockID: id(11) }));
  assert.equal(normalizeTronBlock({ blockID: id(0), block_header: { raw_data: {} } }, true).height, '0');
  assert.throws(() => normalizeTronBlock({ blockID: id(0), block_header: { raw_data: { number: null } } }, true));
  assert.throws(() => normalizeTronBlock({ blockID: id(0), block_header: { raw_data: {} } }));
});

test('Tron request cannot inject full-node path, method, signer, or alternate network', async () => {
  const { adapter, calls } = fixture();
  for (const extra of [{ path: '/wallet/broadcasttransaction' }, { transport() {} },
    { method: 'getaccount' }, { signer: {} }, { chain: 'ethereum' }, { genesisHash: id(0, '2') }]) {
    await assert.rejects(adapter.observe({ ...request, ...extra }));
  }
  assert.equal(calls.length, 0);
});
