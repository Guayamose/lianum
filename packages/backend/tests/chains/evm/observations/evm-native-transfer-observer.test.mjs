/** Host receipt/finality conformance only. No native nodes, signing, broadcasts,
 * funded balances, circuit execution or consensus proofs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvmNativeTransferObserver, evmNativeTransferNetwork, assertEvmNativeTransferObservation, assertEvmNativeTransferObserver } from '../../../../src/chains/evm/observations/evm-native-transfer-observer.mjs';
import { originalFixture, hash, quantity } from '../../../fixtures/chains/evm/transfers/evm-native-transfer-fixture.mjs';
import { nativeFactIdentity, nativeObservedEffectCommitment } from '@lianum/engine/native/native-receipt-binding';
const query = f => ({ nativeId: f.original.expected.nativeId });
const copy = value => structuredClone(value);

function observerFixture(chain = 'ethereum', type = 2, config = {}) {
  const f = originalFixture(chain, type); return { ...f, observer: createEvmNativeTransferObserver({ ...f.config, ...config }) };
}

test('all four network profiles observe the exact finalized original without private/delivery authority', async () => {
  const assets = [], identities = [];
  for (const chain of ['ethereum', 'base', 'arbitrum', 'bnb']) {
    const f = observerFixture(chain), result = await f.observer.observe(query(f));
    assert.equal(result.status, 'observed'); assert.equal(result.reason, null); assert.equal(result.nativeWire, f.original.nativeWire.slice(2));
    assert.equal(result.identity.amount, '9007199254740993'); assert.equal(result.identity.from, f.original.expected.from);
    assert.equal(result.evidence.inclusion.blockHeight, '10'); assert.equal(result.evidence.inclusion.transactionIndex, '1');
    assert.equal(result.evidence.rpcFinalizedDepth, '11'); assert.equal(result.validUntilMs, '1060000');
    assert.equal(result.creditEligible, false); assert.equal(result.privateSpendableAtomic, null); assert.equal(result.graphAdmissionEligible, false);
    assert.equal(result.deliveryVerified, false); assert.equal(result.recipientRetainedValueVerified, false);
    assert.equal(result.network.finality.independentConsensusVerified, false);
    assert.equal(result.network.finality.ethereumSettlement, ['base', 'arbitrum'].includes(chain) ? 'not-independently-verified' : 'not-applicable');
    assert.equal(result.network.finality.rollupExecutionProofVerified, false); assert.equal(result.network.finality.rollupWithdrawalSettlementVerified, false);
    assert.equal(result.identity.nativeGid, nativeFactIdentity({ family: '3', genesis: result.identity.genesis, asset: result.identity.asset,
      transactionId: result.identity.transactionId, effectIndex: '0' }));
    assert.equal(result.evidence.observedEffectCommitment, nativeObservedEffectCommitment({ family: '3', genesis: result.identity.genesis,
      asset: result.identity.asset, nativeGid: result.identity.nativeGid, blockId: result.evidence.inclusion.blockId, blockHeight: '10',
      transactionSHA256: result.identity.transactionSHA256, sourceCommitment: result.identity.sourceCommitment,
      destinationCommitment: result.identity.destinationCommitment, amount: result.identity.amount }));
    assertEvmNativeTransferObservation(result, f.observer);
    assert.throws(() => assertEvmNativeTransferObservation(copy(result), f.observer));
    assert.ok(Object.isFrozen(result.evidence.receipt)); assert.equal(f.calls.length, 14);
    assert.ok(f.calls.every(([method]) => ['eth_chainId', 'eth_getBlockByNumber', 'eth_getTransactionByHash', 'eth_getTransactionReceipt'].includes(method)));
    assert.ok(!JSON.stringify(result).includes('wireKeyCommitment'));
    assets.push(result.identity.asset); identities.push(result.identity.nativeGid);
  }
  assert.equal(new Set(assets).size, 4); assert.equal(new Set(identities).size, 4);
});

test('legacy and type-1 original receipt reconciliation uses the same observer', async () => {
  for (const type of [0, 1]) {
    const f = observerFixture('bnb', type), result = await f.observer.observe(query(f));
    assert.equal(result.status, 'observed'); assert.equal(result.identity.transactionType, String(type));
  }
});

test('transaction field substitutions, altered signatures and unbound receipt fields fail closed', async () => {
  const f = observerFixture(), pristineTx = copy(f.state.tx), pristineReceipt = copy(f.state.receipt);
  const cases = [
    () => { f.state.tx.hash = hash(999); }, () => { f.state.tx.chainId = '0x2'; },
    () => { f.state.tx.from = '0x' + '12'.repeat(20); }, () => { f.state.tx.to = '0x' + '56'.repeat(20); },
    () => { f.state.tx.value = '0x1'; }, () => { f.state.tx.input = '0x12'; }, () => { f.state.tx.nonce = '0x8'; },
    () => { f.state.tx.gas = '0x5208'; }, () => { f.state.tx.maxFeePerGas = '0x20'; },
    () => { f.state.tx.maxPriorityFeePerGas = '0x3'; }, () => { f.state.tx.type = '0x1'; },
    () => { f.state.tx.r = '0x1'; }, () => { f.state.tx.s = '0x2'; }, () => { f.state.tx.v = '0x1'; },
    () => { f.state.tx.yParity = '0x1'; }, () => { f.state.tx.accessList = [{ address: f.state.tx.to, storageKeys: [] }]; },
    () => { f.state.receipt.transactionHash = hash(888); }, () => { f.state.receipt.blockHash = hash(888); },
    () => { f.state.receipt.transactionIndex = '0x0'; }, () => { f.state.receipt.from = f.state.tx.to; },
    () => { f.state.receipt.type = '0x0'; }, () => { f.state.receipt.contractAddress = f.state.tx.to; },
    () => { f.state.receipt.status = '0x2'; }, () => { f.state.receipt.gasUsed = '0x100000'; },
    () => { f.state.receipt.cumulativeGasUsed = '0x1'; }, () => { f.state.receipt.effectiveGasPrice = '0x1'; },
    () => { f.state.receipt.logsBloom = '0x'; }, () => { f.state.tx.blockNumber = '0x00a'; },
  ];
  for (const mutate of cases) {
    f.state.tx = copy(pristineTx); f.state.receipt = copy(pristineReceipt); mutate();
    const result = await f.observer.observe(query(f));
    assert.notEqual(result.status, 'observed'); assert.equal(result.evidence, null); assert.equal(result.nativeWire, null);
    assert.equal(result.creditEligible, false);
  }
});

test('pending, absent, incomplete and reverted originals are distinct and never yield effect credit', async () => {
  const f = observerFixture(), tx = copy(f.state.tx), receipt = copy(f.state.receipt);
  f.state.tx = null; f.state.receipt = null;
  assert.equal((await f.observer.observe(query(f))).reason, 'EVM_TRANSFER_ORIGINAL_NOT_FOUND');
  f.state.tx = { ...tx, blockHash: null, blockNumber: null, transactionIndex: null };
  assert.equal((await f.observer.observe(query(f))).status, 'pending');
  f.state.receipt = receipt;
  assert.equal((await f.observer.observe(query(f))).reason, 'EVM_TRANSFER_INCOMPLETE_HISTORY');
  f.state.tx = tx; f.state.receipt = null;
  assert.equal((await f.observer.observe(query(f))).reason, 'EVM_TRANSFER_RECEIPT_MISSING');
  f.state.receipt = { ...receipt, status: '0x0' };
  const reverted = await f.observer.observe(query(f)); assert.equal(reverted.status, 'reverted');
  assert.equal(reverted.evidence.observedEffectCommitment, null); assert.equal(reverted.nativeWire, null); assert.equal(reverted.creditEligible, false);
});

test('canonical inclusion binds block hash, index, duplicate-free transaction list and re-reads', async () => {
  const f = observerFixture(), included = copy(f.state.included);
  for (const mutate of [
    () => { f.state.included.hash = hash(999); },
    () => { f.state.included.transactions = [f.state.tx.hash, hash(700)]; },
    () => { f.state.included.transactions.push(f.state.tx.hash); },
  ]) {
    f.state.included = copy(included); mutate();
    const result = await f.observer.observe(query(f)); assert.notEqual(result.status, 'observed'); assert.equal(result.evidence, null);
  }
  f.state.included = copy(included); let seen = 0;
  f.state.override = (method, params) => method === 'eth_getBlockByNumber' && params[0] === included.number && ++seen === 2
    ? { ...included, hash: hash(999) } : undefined;
  const changed = await f.observer.observe(query(f)); assert.equal(changed.status, 'reorged'); assert.equal(changed.evidence, null);
});

test('same original receipt is latched, restored after reopen and never silently reinterpreted', async () => {
  const f = observerFixture(), initial = await f.observer.observe(query(f)); assert.equal(initial.status, 'observed');
  const reopened = createEvmNativeTransferObserver({ ...f.config, original: { ...f.original, inclusion: initial.evidence.inclusion } });
  assert.equal((await reopened.observe(query(f))).status, 'observed');
  f.state.receipt.cumulativeGasUsed = '0xa411';
  for (const observer of [f.observer, reopened]) {
    const result = await observer.observe(query(f)); assert.equal(result.status, 'reorged'); assert.equal(result.reason, 'EVM_TRANSFER_ORIGINAL_INCLUSION_CHANGED');
    assert.equal(result.evidence, null); assert.equal(result.validUntilMs, null);
  }
  f.state.receipt = null;
  assert.equal((await reopened.observe(query(f))).status, 'unknown', 'missing history is not a proven reorg/reversion');
});

test('finalized RPC is mandatory: sequencer receipt, safe/latest, unsupported tag and depth cannot substitute', async () => {
  const f = observerFixture('arbitrum');
  f.state.finalized = { ...f.state.finalized, number: '0x9', timestamp: quantity(1009) };
  const pending = await f.observer.observe(query(f)); assert.equal(pending.reason, 'EVM_TRANSFER_NOT_FINALIZED'); assert.equal(pending.evidence, null);
  f.state.override = method => { if (method === 'eth_getBlockByNumber') throw new Error('private endpoint secret'); };
  const unavailable = await f.observer.observe(query(f)); assert.equal(unavailable.status, 'unknown'); assert.equal(unavailable.evidence, null);
  assert.ok(f.calls.filter(([method]) => method === 'eth_getBlockByNumber').every(([, params]) => !['latest', 'safe', 'pending'].includes(params[0])));
  assert.equal(JSON.stringify(unavailable).includes('secret'), false);
});

test('regressed, replaced and noncanonical finalized heads fail; coherent advance is allowed', async () => {
  for (const variant of ['regressed', 'replaced', 'old-reorg', 'advance']) {
    const f = observerFixture('base'), before = copy(f.state.finalized); let seen = 0;
    const advanced = { ...before, number: '0x15', hash: hash(1021), parentHash: before.hash, timestamp: quantity(1021) };
    f.state.headers.set('0x15', advanced);
    f.state.override = (method, params) => {
      if (method !== 'eth_getBlockByNumber') return;
      if (params[0] === 'finalized' && ++seen > 1) return variant === 'regressed' ? { ...before, number: '0x13' }
        : variant === 'replaced' ? { ...before, hash: hash(999) } : advanced;
      if (variant === 'old-reorg' && params[0] === before.number) return { ...before, hash: hash(998) };
    };
    const result = await f.observer.observe(query(f));
    assert.equal(result.status, variant === 'advance' ? 'observed' : 'reorged');
    if (variant === 'advance') assert.equal(result.evidence.rpcFinalizedDepth, '12'); else assert.equal(result.evidence, null);
  }
});

test('chain/genesis pins are checked before and after receipt reads; arbitrary asset identity is refused', async () => {
  const f = observerFixture();
  for (const atEnd of [false, true]) {
    let count = 0; f.state.override = method => method === 'eth_chainId' && ++count === (atEnd ? 2 : 1) ? '0x2' : undefined;
    assert.equal((await f.observer.observe(query(f))).reason, 'EVM_TRANSFER_CHAIN_ID_MISMATCH');
  }
  f.state.override = (method, params) => method === 'eth_getBlockByNumber' && params[0] === '0x0'
    ? { ...f.state.genesis, hash: hash(999) } : undefined;
  assert.equal((await f.observer.observe(query(f))).reason, 'EVM_TRANSFER_GENESIS_MISMATCH');
  assert.throws(() => createEvmNativeTransferObserver({ ...f.config, asset: '12'.repeat(32) }));
  const original = evmNativeTransferNetwork({ chain: 'ethereum', genesisHash: f.genesisHash });
  const fork = evmNativeTransferNetwork({ chain: 'ethereum', genesisHash: hash(999) });
  assert.notEqual(original.nativeAssetCommitment, fork.nativeAssetCommitment);
});

test('receipt event presence never implies retained native value or EOA/delegation assurance', async () => {
  const f = observerFixture();
  const log = { address: f.state.tx.to, topics: [hash(1)], data: '0x00', blockNumber: f.state.receipt.blockNumber,
    blockHash: f.state.receipt.blockHash, transactionHash: f.state.tx.hash, transactionIndex: '0x1', logIndex: '0x2', removed: false };
  f.state.receipt.logs = [log];
  const observed = await f.observer.observe(query(f));
  assert.equal(observed.status, 'observed'); assert.equal(observed.deliveryVerified, false); assert.equal(observed.recipientRetainedValueVerified, false);
  assert.ok(!f.calls.some(([method]) => method === 'eth_getCode'));
  f.state.receipt.logs[0].removed = true;
  assert.equal((await f.observer.observe(query(f))).reason, 'EVM_TRANSFER_RECEIPT_LOG');
});

test('stale/future heads, deadline and clock regression invalidate observations without last-good substitution', async () => {
  const f = originalFixture(); let now = 1030000;
  const observer = createEvmNativeTransferObserver({ ...f.config, now: () => now });
  assert.equal((await observer.observe(query(f))).status, 'observed');
  now = 2820000; const stale = await observer.observe(query(f)); assert.equal(stale.status, 'stale'); assert.equal(stale.evidence, null);
  now = 1000000; assert.equal((await observer.observe(query(f))).reason, 'FUTURE_BLOCK');
  let signal;
  const timeout = createEvmNativeTransferObserver({ ...f.config, freshness: { maxQueryMs: 5 },
    transport: (_method, _params, options) => { signal = options.signal; return new Promise(() => {}); } });
  const expired = await timeout.observe(query(f)); assert.equal(expired.reason, 'EVM_TRANSFER_QUERY_TIMEOUT'); assert.equal(signal.aborted, true);
  let ticks = 0; const regressed = createEvmNativeTransferObserver({ ...f.config, now: () => ++ticks === 1 ? 1030000 : 1029000 });
  assert.equal((await regressed.observe(query(f))).reason, 'EVM_TRANSFER_QUERY_TIMEOUT');
});

test('only original identity can be queried and calls cannot replace transport, policy or receipt', async () => {
  const f = observerFixture();
  for (const extra of [{ nativeId: '12'.repeat(32) }, { endpoint: 'https://bad.example/' }, { receipt: f.state.receipt },
    { transport() {} }, { maxQueryMs: 100000 }, { signedTransaction: f.original.nativeWire }])
    await assert.rejects(f.observer.observe({ ...query(f), ...extra }));
  let touched = false;
  await assert.rejects(f.observer.observe({ get nativeId() { touched = true; return f.original.expected.nativeId; } }));
  await assert.rejects(f.observer.observe(new Proxy({}, { getPrototypeOf() { touched = true; return Object.prototype; } })));
  assert.equal(touched, false); assert.equal(f.calls.length, 0);
});

test('configuration mutation, response accessors and concurrent query interleaving do not replace the original', async () => {
  const f = originalFixture(); let release, touched = false;
  const barrier = new Promise(resolve => { release = resolve; });
  const transport = f.config.transport; let calls = 0;
  const observer = createEvmNativeTransferObserver({ ...f.config, transport: async (...args) => {
    if (++calls === 1) await barrier; return transport(...args);
  } });
  const originalQuery = query(f), started = observer.observe(originalQuery);
  originalQuery.nativeId = '12'.repeat(32); f.config.original.expected.value = '1';
  assert.equal((await observer.observe(query(f))).reason, 'EVM_TRANSFER_BUSY'); release();
  assert.equal((await started).identity.amount, '9007199254740993');
  const clean = originalFixture();
  const poisoned = createEvmNativeTransferObserver({ ...clean.config, transport: async (method, params, opts) => {
    if (method === 'eth_getTransactionReceipt') return { ...clean.state.receipt,
      get status() { touched = true; return '0x1'; } };
    return clean.transport(method, params, opts);
  } });
  assert.equal((await poisoned.observe(query(clean))).status, 'unknown'); assert.equal(touched, false);
});


test('app boundary: only genuine observer capabilities pass the private bootstrap brand', () => {
  const f = observerFixture(); let touched = false;
  assert.doesNotThrow(() => assertEvmNativeTransferObserver(f.observer));
  for (const fake of [null, {}, { ...f.observer }, Object.create(f.observer),
    { originalIdentity() { touched = true; }, status() { touched = true; } },
    new Proxy(f.observer, { get() { touched = true; }, getPrototypeOf() { touched = true; } })])
    assert.throws(() => assertEvmNativeTransferObserver(fake), /EVM_TRANSFER_OBSERVER_PROVENANCE/);
  assert.equal(touched, false); assert.equal(f.calls.length, 0);
});

test('app boundary: immutable identity metadata is fixed, exact and contains no raw wire or RPC control', () => {
  const f = observerFixture('base'), original = f.observer.originalIdentity();
  assert.equal(original, f.observer.originalIdentity()); assert.equal(original.nativeId, f.original.expected.nativeId);
  assert.equal(original.chain, 'base'); assert.equal(original.chainId, '8453'); assert.equal(original.genesisHash, f.genesisHash);
  assert.equal(original.asset.id, f.observer.network.nativeAsset.id); assert.equal(original.asset.commitment, f.observer.network.nativeAssetCommitment);
  for (const name of ['from', 'to', 'value', 'nonce']) assert.equal(original[name], f.original.expected[name]);
  assert.equal(original.metadataOnly, true); assert.equal(original.currentFinalityVerified, false);
  assert.equal(original.creditEligible, false); assert.equal(original.graphAdmissionEligible, false);
  assert.equal(original.privateSpendableAtomic, null); assert.equal(original.deliveryVerified, false);
  assert.equal(original.recipientRetainedValueVerified, false);
  assert.throws(() => { original.nativeId = '11'.repeat(32); });
  assert.throws(() => { original.asset.commitment = '22'.repeat(32); });
  assert.throws(() => f.observer.originalIdentity({ nativeId: original.nativeId }));
  assert.equal(f.calls.length, 0);
  const serialized = JSON.stringify(original);
  for (const forbidden of ['nativeWire', 'transport', 'endpoint', 'signature', 'receipt', 'wireKeyCommitment'])
    assert.equal(serialized.includes(forbidden), false);
  assert.equal(serialized.includes(f.original.nativeWire.slice(2)), false);
});

test('app boundary: retained status projection is immutable metadata, never a fresh finality or raw-wire response', async () => {
  const f = observerFixture(), before = f.observer.status();
  assert.equal(before.status, 'unobserved'); assert.equal(before.observedAtMs, null); assert.equal(before.validUntilMs, null);
  assert.equal(before.source, 'retained-observation-metadata'); assert.equal(before.freshness, 'not-revalidated');
  assert.equal(f.calls.length, 0);
  const result = await f.observer.observe(query(f)), after = f.observer.status();
  assert.equal(after.status, 'observed'); assert.equal(after.observedAtMs, result.observedAtMs);
  assert.equal(after.validUntilMs, result.validUntilMs); assert.equal(after.currentFinalityVerified, false);
  assert.equal(after.metadataOnly, true); assert.equal(after.graphAdmissionEligible, false); assert.equal(after.creditEligible, false);
  assert.equal(before.status, 'unobserved'); assert.notEqual(before, after); assert.equal(after, f.observer.status());
  const readCount = f.calls.length; f.observer.status(); assert.equal(f.calls.length, readCount);
  assert.throws(() => { after.status = 'spendable'; }); assert.throws(() => { after.asset.id = 'fake'; });
  assert.throws(() => f.observer.status({ nativeId: query(f).nativeId }));
  for (const forbidden of ['nativeWire', 'receipt', 'logs', 'transport', 'endpoint', 'evidence'])
    assert.equal(Object.hasOwn(after, forbidden), false);
  assert.equal(JSON.stringify(after).includes(f.original.nativeWire.slice(2)), false);
  f.state.tx.hash = hash(999); await f.observer.observe(query(f)); const failed = f.observer.status();
  assert.equal(failed.status, 'unknown'); assert.equal(failed.validUntilMs, null);
  assert.equal(failed.nativeId, after.nativeId); assert.equal(failed.value, after.value);
  assert.equal(after.status, 'observed', 'previous metadata snapshots must remain immutable');
});
