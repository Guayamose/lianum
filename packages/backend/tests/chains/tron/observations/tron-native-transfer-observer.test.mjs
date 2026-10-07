import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createTronNativeTransferObserver as create, assertTronNativeTransferObserver as brand,
  assertTronNativeTransferObservation as observationBrand } from '../../../../src/chains/tron/observations/tron-native-transfer-observer.mjs';
import { fixture, block, blockId, NOW, WIRE } from '../../../fixtures/chains/tron/transfers/tron-native-transfer-fixture.mjs';
const flags = ['currentFinalityVerified', 'independentConsensusVerified', 'accountPermissionVerified', 'taposVerified',
  'expirationVerified', 'creditEligible', 'graphAdmissionEligible', 'deliveryVerified', 'recipientRetainedValueVerified'];
function limits(value) { for (const key of flags) assert.equal(value[key], false, key); assert.equal(value.privateSpendableAtomic, null); }
function safe(value) { const encoded = JSON.stringify(value); assert.doesNotMatch(encoded, /nativeWire|raw_data|signature|transport|endpoint|receipt|transactionSHA256/); limits(value); }

test('retained exact original binds read-only Tron observation and sanitized immutable shared identity', async () => {
  const f = fixture(), observer = create(f.config), before = observer.status();
  brand(observer); assert.equal(f.calls.length, 0); assert.equal(before.status, 'unobserved'); safe(before);
  assert.equal(before.nonce, null); assert.equal(before.transactionType, 'TransferContract');
  assert.equal(before.value, '1250001'); assert.equal(before.asset.symbol, 'TRX'); assert.equal(before.asset.decimals, 6);
  assert.equal(before.networkId, `tron/genesis:${f.genesisHash}`); assert.equal(before.finalitySource, 'rpc-solidified');
  const result = await observer.observe(f.query); observationBrand(result, observer);
  assert.equal(result.status, 'observed'); assert.equal(result.evidence.inclusion.transactionIndex, '1');
  assert.equal(result.evidence.receipt.feeSun, '9007199254740993'); assert.equal(result.nativeWire, WIRE); limits(result);
  assert.equal(result.evidence.rpcSolidifiedDepth, '3'); assert.equal(result.validUntilMs, String(NOW + 30000));
  assert.equal(f.calls.length, 12); assert.equal(observer.status().status, 'observed'); safe(observer.status());
  assert.equal(before.status, 'unobserved'); assert.ok(Object.isFrozen(before.asset)); assert.ok(Object.isFrozen(result.evidence.inclusion));
  assert.throws(() => brand({ ...observer })); assert.throws(() => brand(new Proxy(observer, {})));
  assert.throws(() => observationBrand({ ...result }, observer)); assert.throws(() => observationBrand(result, create(f.config)));
  assert.throws(() => observer.status(undefined)); assert.throws(() => observer.originalIdentity({}));
});

test('private configuration snapshots and strict query reject retargeting or hostile records before I/O', async () => {
  const f = fixture(), observer = create(f.config); let touched = 0;
  f.original.expected.amountSun = '2'; f.original.nativeWire = '00';
  const getter = {}; Object.defineProperty(getter, 'nativeId', { enumerable: true, get() { touched++; return f.query.nativeId; } });
  for (const query of [{ nativeId: 'a'.repeat(64) }, { ...f.query, endpoint: 'https://bad.example/' }, getter,
    Object.create(f.query), new Proxy(f.query, {})]) await assert.rejects(observer.observe(query));
  assert.equal(f.calls.length, 0); assert.equal(touched, 0);
  assert.equal((await observer.observe(f.query)).status, 'observed');
  for (const config of [{ ...fixture().config, signer: () => {} }, { ...fixture().config, chain: 'ethereum' },
    { ...fixture().config, genesisHash: '41' + '0'.repeat(40) },
    { ...fixture().config, genesisHash: fixture().genesisHash + '\n' }, new Proxy(fixture().config, {})]) assert.throws(() => create(config));
});

test('missing, pruned or incomplete SolidityNode history stays unknown, never inferred failed or expired', async () => {
  for (const [tx, info] of [[{}, {}], [{}, 'keep'], ['keep', {}]]) {
    const f = fixture(), observer = create(f.config);
    assert.equal((await observer.observe(f.query)).status, 'observed');
    if (tx !== 'keep') f.state.transaction = tx;
    if (info !== 'keep') f.state.info = info;
    f.state.now += 9999999;
    const result = await observer.observe(f.query);
    assert.equal(result.status, 'unknown'); assert.equal(result.validUntilMs, null); assert.equal(result.evidence, null);
    assert.equal(observer.status().status, 'unknown'); assert.equal(observer.status().validUntilMs, null);
  }
});

test('same native ID with changed raw bytes, signatures, missing or failed success fields cannot pass', async () => {
  const mutations = [f => f.state.transaction.raw_data_hex += '00', f => f.state.transaction.txID = 'd'.repeat(64),
    f => f.state.transaction.signature[0] = 'a'.repeat(130), f => f.state.transaction.signature.push(f.state.transaction.signature[0]),
    f => f.state.transaction.ret = [], f => f.state.transaction.ret = [{}], f => f.state.transaction.ret[0].contractRet = 'REVERT',
    f => f.state.transaction.ret[0].ret = 'FAILED', f => f.state.info.result = 'FAILED', f => f.state.info.result = 'SUCCESS',
    f => f.state.info.receipt.result = 'OUT_OF_ENERGY', f => f.state.info.id = 'a'.repeat(64),
    f => f.state.info.blockNumber = Number.MAX_SAFE_INTEGER + 1, f => f.state.info.fee = '9e3',
    f => f.state.info.fee = '1\n', f => f.state.info.blockNumber = '10\n',
    f => f.state.included.transactions[1].signature = ['a'.repeat(130)]];
  for (const mutate of mutations) { const f = fixture(); mutate(f); const result = await create(f.config).observe(f.query);
    assert.notEqual(result.status, 'observed'); assert.equal(result.evidence, null); limits(result); }
  const f = fixture(); delete f.state.info.fee;
  assert.equal((await create(f.config).observe(f.query)).evidence.receipt.feeSun, null);
});

test('trusted block membership is exact and duplicate IDs or mismatched heights/times fail closed', async () => {
  for (const mutate of [f => f.state.included.transactions.push(f.state.included.transactions[1]),
    f => f.state.solid.block_header.raw_data.number = '12\n',
    f => f.state.included.transactions.splice(1), f => f.state.included.blockID = blockId(11),
    f => f.state.info.blockTimeStamp = String(NOW - 9999), f => f.state.included.transactions = Array(2),
    f => f.state.included.transactions[1] = new Proxy(f.state.included.transactions[1], {})]) {
    const f = fixture(); mutate(f); const result = await create(f.config).observe(f.query); assert.notEqual(result.status, 'observed');
  }
});

test('genesis checked before and after original reads; 41 address prefix is never network identity', async () => {
  for (const late of [false, true]) {
    const f = fixture(); let count = 0;
    f.state.read = (path, body, value) => path.endsWith('getblockbynum') && String(body.num) === '0' && (++count > 1 || !late)
      ? { blockID: blockId(0, '2'), block_header: { raw_data: {} } } : value;
    const result = await create(f.config).observe(f.query);
    assert.equal(result.reason, 'TRON_TRANSFER_GENESIS_MISMATCH'); assert.equal(result.status, 'unknown');
  }
});

test('latched original inclusion and normalized status receipt cannot be replaced or silently reopened', async () => {
  const f = fixture(), observer = create(f.config), first = await observer.observe(f.query);
  const reopened = create({ ...f.config, original: { ...f.original, inclusion: first.evidence.inclusion } });
  assert.equal((await reopened.observe(f.query)).status, 'observed');
  f.state.info.fee = '1';
  for (const reader of [observer, reopened]) assert.equal((await reader.observe(f.query)).reason, 'TRON_TRANSFER_ORIGINAL_INCLUSION_CHANGED');
  f.state.info.fee = '9007199254740993'; f.state.included.blockID = blockId(10, 'c');
  assert.equal((await observer.observe(f.query)).status, 'reorged');
  f.state.included.blockID = blockId(10); assert.equal((await observer.observe(f.query)).status, 'observed');
  assert.throws(() => create({ ...f.config, original: { ...f.original, inclusion: { ...first.evidence.inclusion, transactionIndex: '00' } } }));
});

test('rereads detect changing receipts, inclusion order and displaced/regressed solidified heads', async () => {
  for (const scenario of ['receipt', 'index', 'head', 'regression', 'canonical']) {
    const f = fixture(); let txInfo = 0, blockReads = 0, heads = 0;
    f.state.read = (path, body, value) => {
      if (scenario === 'receipt' && path.endsWith('gettransactioninfobyid') && ++txInfo === 2) return { ...value, fee: '1' };
      if (scenario === 'index' && path.endsWith('getblockbynum') && String(body.num) === '10' && ++blockReads === 2)
        return { ...value, transactions: [...value.transactions].reverse() };
      if (path.endsWith('getnowblock') && ++heads === 2) {
        if (scenario === 'head') return block(12, NOW, 'c');
        if (scenario === 'regression') return block(11, NOW);
      }
      if (scenario === 'canonical' && path.endsWith('getblockbynum') && String(body.num) === '12') return block(12, NOW, 'c');
      return value;
    };
    assert.equal((await create(f.config).observe(f.query)).status, 'reorged', scenario);
  }
});

test('advancing solidified context is allowed only with unchanged original and canonical old/new head', async () => {
  const f = fixture(); let heads = 0;
  f.state.extraBlocks.set('13', block(13, NOW + 1000));
  f.state.read = (path, _body, value) => path.endsWith('getnowblock') && ++heads === 2 ? block(13, NOW + 1000) : value;
  const result = await create(f.config).observe(f.query); assert.equal(result.status, 'observed'); assert.equal(result.evidence.rpcSolidifiedDepth, '4');
});

test('future, stale and not-yet-solidified-at-start results have no evidence or private credit', async () => {
  for (const [change, status] of [[f => f.state.now += 1800000, 'stale'], [f => f.state.now -= 6000, 'unknown'],
    [f => { f.state.solid = block(9, NOW); }, 'pending']]) {
    const f = fixture(); change(f); const result = await create(f.config).observe(f.query);
    assert.equal(result.status, status); assert.equal(result.evidence, null); assert.equal(result.validUntilMs, null); limits(result);
  }
});

test('whole-query timeout, busy reads and late completion never latch an incomplete inclusion', async () => {
  const f = fixture(); let release, entered;
  const gate = new Promise(resolve => release = resolve), begin = new Promise(resolve => entered = resolve);
  f.state.read = async (path, _body, value) => { if (path.endsWith('gettransactionbyid')) { entered(); await gate; } return value; };
  const observer = create({ ...f.config, freshness: { maxQueryMs: 20 } });
  const first = observer.observe(f.query); await begin;
  assert.equal((await observer.observe(f.query)).reason, 'TRON_TRANSFER_BUSY');
  assert.equal((await first).reason, 'TRON_TRANSFER_QUERY_TIMEOUT'); release(); await delay(0);
  assert.equal(observer.status().status, 'unknown');
  f.state.read = null; f.state.included.blockID = blockId(10, 'c');
  assert.equal((await observer.observe(f.query)).status, 'observed');
});
