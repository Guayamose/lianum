/** Source-extracted private helper over synthetic state. Exercises the exact
 * production prepareOnce/prepareOriginal code and actual action codec without
 * fabricating an owned vault brand or launching RPC, proof, signer or node. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { exactRecord } from '../../../src/execution/encoding/commitments.mjs';
import { prepareVaultAction, encodeVaultCall, vaultActionCommitment } from '../../../src/defi/vaults/backed-vault.mjs';
const source = readFileSync(new URL('./owned-backed-vault.mjs', import.meta.url), 'utf8');
const start = source.indexOf('  async function prepareOriginal('), end = source.indexOf('  const adapter =', start);
assert.ok(start > 0 && end > start);
const original = source.slice(start, end);
const method = source.match(/    async prepareOnce\(request\) \{[\s\S]*?\n    \},/)?.[0]; assert.ok(method);
const requoteMethod = source.match(/    async requoteUnsubmitted\(request\) \{[\s\S]*?\n    \},/)?.[0]; assert.ok(requoteMethod);
const h = value => createHash('sha256').update('SYNTHETIC ONCE ' + value).digest('hex');
const id = { chainId: '31337', genesisHash: h('genesis'), domain: h('domain'), runtimeId: h('runtime'),
  asset: h('asset').slice(0, 40), vault: h('vault').slice(0, 40), assetCodeSHA256: h('asset-code'), vaultCodeSHA256: h('vault-code') };
const request = () => ({ reference: h('reference'), kind: 'redeem', amount: '100', minimumOutput: '99', deadline: '1250' });
function fixture() {
  const state = { record: { data: { operations: [] } }, reads: 0, nonces: 0, writes: 0, queued: null,
    view: { snapshot: { blockNumber: '10', blockHash: h('block'), blockTimestamp: '1000', totalAssets: '1000', totalShares: '1000' },
      senderAssets: '1000', senderShares: '1000', usedNonce: '0' } };
  const env = { assert, exactRecord, copy: structuredClone, id, sender: h('owner').slice(0, 40), receiver: h('owner').slice(0, 40),
    MAX_OPERATIONS: 32, sendUncertain: false,
    operation: reference => state.record.data.operations.find(row => row.reference === reference),
    update: async (reference, change) => { state.writes++; state.record.data.operations = state.record.data.operations.map(row =>
      row.reference === reference ? { ...row, ...structuredClone(change) } : row); }, fresh: () => h('nonce-' + ++state.nonces), prepareVaultAction, vaultActionCommitment, encodeVaultCall,
    readAt: async () => { state.reads++; return { view: structuredClone(state.view) }; },
    result: reference => structuredClone(state.record.data.operations.find(row => row.reference === reference)),
    write: async update => { state.writes++; state.record.data = update(structuredClone(state.record.data)); },
    hex: value => assert.match(value, /^[0-9a-f]{64}$/),
    exclusive: async work => state.queued ? state.queued.then(work) : work(),
  };
  Object.defineProperty(env, 'record', { get: () => state.record });
  const build = vm.runInThisContext('(function(env) { with(env) { ' + original + '\nreturn ({ ' + method + requoteMethod + ' }); } })');
  return { ...state, state, adapter: build(env), env };
}
test('same durable preparation key retains exactly the original action, quote, nonce and calldata after simulated lost reply', async () => {
  const f = fixture(), first = await f.adapter.prepareOnce(request());
  // The caller did not receive first; a later retry must not use this new head.
  f.state.view.snapshot.blockTimestamp = '5000'; f.state.view.senderShares = '0';
  const retry = await f.adapter.prepareOnce(request());
  assert.deepEqual(retry, first); assert.equal(f.state.reads, 1); assert.equal(f.state.nonces, 1); assert.equal(f.state.writes, 1);
  assert.equal(retry.calldata, encodeVaultCall(retry.action)); assert.equal(retry.commitment, vaultActionCommitment(retry.action));
});
test('same reference cannot replace kind, quantity, slippage or deadline', async () => {
  const f = fixture(); await f.adapter.prepareOnce(request());
  for (const patch of [{ kind: 'deposit' }, { amount: '99' }, { minimumOutput: '98' }, { deadline: '1251' }])
    await assert.rejects(f.adapter.prepareOnce({ ...request(), ...patch }), /PREPARATION_REBOUND/);
  assert.equal(f.state.writes, 1); assert.equal(f.state.nonces, 1);
});
test('request is snapshotted before awaiting keeper availability; exact input boundary rejects injection', async () => {
  const f = fixture(); let release; f.state.queued = new Promise(resolve => { release = resolve; });
  const input = request(), pending = f.adapter.prepareOnce(input); input.amount = '900'; release();
  assert.equal((await pending).action.amount, '100');
  await assert.rejects(f.adapter.prepareOnce({ ...request(), rpc: 'http://localhost:1' }), /EXACT_FIELDS/);
  const accessor = request(); Object.defineProperty(accessor, 'amount', { enumerable: true, get() { throw Error('GETTER'); } });
  await assert.rejects(f.adapter.prepareOnce(accessor), /DATA_FIELDS/);
});

test('manual expired redemption requote keeps original reference/nonce and archives the exact previous action', async () => {
  const f = fixture(), first = await f.adapter.prepareOnce(request());
  f.state.view.snapshot.blockTimestamp = '2000'; f.state.view.snapshot.blockNumber = '20';
  f.state.view.snapshot.totalAssets = '1100'; f.state.view.snapshot.blockHash = h('new-block');
  const quote = { reference: request().reference, minimumOutput: '105', deadline: '2250' };
  const refreshed = await f.adapter.requoteUnsubmitted(quote);
  assert.equal(refreshed.action.nonce, first.action.nonce); assert.equal(refreshed.reference, first.reference);
  assert.equal(refreshed.action.amount, '100'); assert.equal(refreshed.action.previewOutput, '109');
  assert.deepEqual(refreshed.quoteHistory, [{ action: first.action, commitment: first.commitment, calldata: first.calldata }]);
  const writes = f.state.writes; assert.deepEqual(await f.adapter.requoteUnsubmitted(quote), refreshed);
  assert.equal(f.state.writes, writes); assert.equal(f.state.nonces, 1);
});
test('requote cannot replace an attempted, observed, reverted, approved, uncertain or spent-nonce action', async () => {
  for (const mutate of [
    f => { f.state.record.data.operations[0].phase = 'EXECUTION_UNRESOLVED'; },
    f => { f.state.record.data.operations[0].phase = 'OBSERVED'; },
    f => { f.state.record.data.operations[0].phase = 'REVERTED'; },
    f => { f.state.record.data.operations[0].execution = { phase: 'ATTEMPTED' }; },
    f => { f.state.record.data.operations[0].approval = { phase: 'SKIPPED' }; },
    f => { f.env.sendUncertain = true; }, f => { f.state.record.data.sendBlocked = true; },
    f => { f.state.view.usedNonce = '1'; }, f => { f.state.view.senderShares = '99'; },
  ]) {
    const f = fixture(); await f.adapter.prepareOnce(request()); mutate(f);
    await assert.rejects(f.adapter.requoteUnsubmitted({ reference: request().reference, minimumOutput: '98', deadline: '1300' }));
    assert.equal(f.state.writes, 1); assert.equal(f.state.nonces, 1);
  }
});
test('requote history is bounded, and invalid slippage/deadlines leave the original untouched', async () => {
  const f = fixture(), first = await f.adapter.prepareOnce(request());
  for (const patch of [{ minimumOutput: '101', deadline: '1251' }, { minimumOutput: '99', deadline: '999' }])
    await assert.rejects(f.adapter.requoteUnsubmitted({ reference: first.reference, ...patch }));
  assert.equal(f.state.writes, 1);
  for (let i = 1; i <= 8; i++) await f.adapter.requoteUnsubmitted({ reference: first.reference, minimumOutput: '99', deadline: String(1250 + i) });
  await assert.rejects(f.adapter.requoteUnsubmitted({ reference: first.reference, minimumOutput: '99', deadline: '1260' }), /REQUOTE_CAPACITY/);
  assert.equal(f.state.nonces, 1); assert.equal(f.state.record.data.operations[0].quoteHistory.length, 8);
});
