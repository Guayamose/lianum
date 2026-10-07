/** Reconstructed host regression suite. No native process or timing campaign. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBitcoinInventoryOutputs, BITCOIN_INVENTORY_READ_CONCURRENCY } from '../../../../src/chains/bitcoin/transfers/owned-bitcoin-inventory-reads.mjs';
const coins = count => Array.from({ length: count }, (_, index) => ({ txid: index.toString(16).padStart(64, '0'), vout: index }));
const tick = () => new Promise(resolve => setImmediate(resolve));

test('202 fresh outpoint reads keep distinct results and at most four active readers', async () => {
  let active = 0, peak = 0; const calls = [], input = coins(202);
  const result = await readBitcoinInventoryOutputs(input, async (method, params) => {
    assert.equal(method, 'gettxout'); assert.equal(params[2], true); assert.ok(Object.isFrozen(params));
    active++; peak = Math.max(peak, active); calls.push(params); await tick(); active--;
    return params[1] === 3 ? null : { marker: params[1] };
  });
  assert.equal(BITCOIN_INVENTORY_READ_CONCURRENCY, 4); assert.equal(peak, 4); assert.equal(active, 0);
  assert.equal(calls.length, 202); assert.equal(new Set(calls.map(row => row[0] + ':' + row[1])).size, 202);
  assert.deepEqual(result, input.map(row => row.vout === 3 ? null : { marker: row.vout }));
});

test('queued inputs are immutable snapshots and duplicate outpoints are never coalesced', async () => {
  const input = coins(8); input[7] = { ...input[0] }; let release;
  const barrier = new Promise(resolve => { release = resolve; }), calls = [];
  const pending = readBitcoinInventoryOutputs(input, async (_method, params) => {
    const invocation = calls.length; calls.push(params); if (invocation < 4) await barrier;
    return { invocation, outpoint: [...params] };
  });
  input[6].txid = 'ff'.repeat(32); input[6].vout = 99; release(); const result = await pending;
  assert.equal(result[6].outpoint[0], '6'.padStart(64, '0')); assert.equal(result[6].outpoint[1], 6);
  assert.notEqual(result[0].invocation, result[7].invocation); assert.notEqual(result[0], result[7]);
  let fresh = 0; await readBitcoinInventoryOutputs(coins(8), async () => { fresh++; return null; }); assert.equal(fresh, 8);
});

test('first failure drains started work and stops scheduling before the caller can release its fence', async () => {
  const original = new Error('BITCOIN_OWNED_RPC_FAILED'); let release, active = 0, started = 0, finished = false;
  const barrier = new Promise(resolve => { release = resolve; });
  const pending = readBitcoinInventoryOutputs(coins(202), async (_method, params) => {
    started++; active++;
    try { if (params[1] === 1) { await tick(); throw original; } await barrier; return null; }
    finally { active--; }
  });
  pending.then(() => { finished = true; }, () => { finished = true; }); await tick(); await tick();
  assert.equal(started, 4); assert.equal(finished, false); assert.equal(active, 3);
  release(); await assert.rejects(pending, error => error === original);
  assert.equal(active, 0); assert.equal(started, 4); assert.equal(finished, true);
});

test('invalid and accessor outpoints reject before RPC; empty inventories do not read', async () => {
  let calls = 0; const rpc = async () => { calls++; return null; };
  for (const input of [[{ txid: 'invalid', vout: 0 }], [{ txid: '00'.repeat(32), vout: -0 }],
    [{ txid: '00'.repeat(32), vout: 0x100000000 }],
    [Object.defineProperty({ vout: 0 }, 'txid', { get() { throw Error('must not invoke'); } })],
    Object.defineProperty([null], '0', { get() { throw Error('must not invoke'); } }),
    new Proxy([], { get() { throw Error('must not invoke'); } })]) await assert.rejects(readBitcoinInventoryOutputs(input, rpc));
  assert.deepEqual(await readBitcoinInventoryOutputs([], rpc), []); assert.equal(calls, 0);
});

test('runtime retains original fence, per-output checks and before/after tip checks', () => {
  const source = readFileSync(new URL('./owned-bitcoin-runtime.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function inventory()');
  const inventory = source.slice(start, source.indexOf('const runtime = Object.freeze', start));
  const batch = inventory.indexOf('await readBitcoinInventoryOutputs(selectedCoins, inventoryRpc)');
  assert.ok(batch > inventory.indexOf('inventoryBusy = true'));
  assert.ok(batch > inventory.indexOf('const before = await health()'));
  assert.ok(batch < inventory.indexOf('const after = await health()'));
  assert.ok(batch < inventory.indexOf('finally { inventoryBusy = false'));
  for (const text of ['output.bestblock === before.tip', 'output.scriptPubKey.hex === account.endpoint',
    'bitcoinSatoshiFromAmount(output.value) === bitcoinSatoshiFromAmount(coin.amount)', 'before.tip === after.tip']) assert.ok(inventory.includes(text));
});
