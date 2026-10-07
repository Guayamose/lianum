/** Explicit synthetic RPC/capability fixtures only. These tests start no EVM,
 * compiler, prover or native runtime and establish no real deployment result.
 * Run: node --experimental-test-module-mocks --test owned-pool-asset.test.mjs */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { publicKeccak256 } from '../../../../../engine/src/cohorts/private-cohort-public-native.mjs';
import { predictNativeCreateAddress } from '../../../../../engine/src/execution/native/dispatch/native-deployment.mjs';
import { assertOwnedPoolAsset as actualBrand, createOwnedPoolAsset as actualFactory,
  createNativePoolAsset as actualNativeFactory } from '../../../../src/chains/shared/contracts/owned-pool-asset.mjs';

const runtimes = new WeakSet();
mock.module(new URL('./local-evm-ownership.mjs', import.meta.url).href, { exports: {
  async assertLocalEvm(runtime) { assert.ok(runtimes.has(runtime), 'TEST_ONLY_RUNTIME_CAPABILITY'); },
} });
const { createOwnedPoolAsset, createNativePoolAsset, assertOwnedPoolAsset } = await import('../../../../src/chains/shared/contracts/owned-pool-asset.mjs?synthetic-fixture-only');
const prefixed = value => '0x' + value;
const word = value => BigInt(value).toString(16).padStart(64, '0');
const hash = value => '0x' + value.repeat(64);
const keccak = code => prefixed(publicKeccak256(Buffer.from(code.slice(2), 'hex')).toString('hex'));
const selector = signature => prefixed(publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex'));
const symbolRaw = symbol => prefixed(word(32) + word(symbol.length) + Buffer.from(symbol).toString('hex').padEnd(64, '0'));
const owner = '0x' + '11'.repeat(20), spender = '0x' + '22'.repeat(20);
const deploymentAddress = predictNativeCreateAddress(owner, 0n);

function fixture({ symbol = 'PALT', decimals = 6 } = {}) {
  const deployment = { address: deploymentAddress, transactionHash: hash('4'), expectedCode: '0x60006000', codeHash: keccak('0x60006000') };
  const receipt = { transactionHash: deployment.transactionHash, contractAddress: deploymentAddress, status: '0x1', blockNumber: '0x1', blockHash: hash('1') };
  const entry = { transactionHash: deployment.transactionHash, phase: 'mined', senderNonce: '0x0',
    request: { from: owner, data: '0x6001' }, receipt };
  const transaction = { hash: deployment.transactionHash, to: null, from: owner, input: entry.request.data,
    nonce: '0x0', value: '0x0', blockNumber: receipt.blockNumber, blockHash: receipt.blockHash };
  const state = { symbol, decimals, genesis: hash('a'), code: deployment.expectedCode, balance: 9n,
    supply: 100n, allowance: 7n, native: 3n, historicalBalance: 4n, rejectCanonical: false, callResult: null };
  const reads = [];
  const headers = { '0x0': { number: '0x0', hash: hash('a') }, '0x1': { number: '0x1', hash: hash('1') },
    '0x2': { number: '0x2', hash: hash('2') } };
  const runtime = { accounts: [owner], metadata: { chainId: '31337', evmGenesis: hash('a') }, transactions: [entry],
    async block(at = 'latest') { reads.push(['block', at]); return { ...headers[at === 'latest' ? '0x2' : at],
      ...(at === '0x0' ? { hash: state.genesis } : {}) }; },
    async assertCanonical(header) { assert.equal(state.rejectCanonical, false, 'TEST_CANONICAL_CHANGED');
      assert.equal(header.hash ?? header.blockHash, headers[header.number ?? header.blockNumber].hash, 'TEST_CANONICAL_HASH'); },
    async transaction(hash) { assert.equal(hash, deployment.transactionHash); return transaction; },
    async receipt(hash) { assert.equal(hash, deployment.transactionHash); return receipt; },
    async checkReceipt(value) { assert.deepEqual(value, receipt); },
    async code(target, at) { reads.push(['code', target, at]); assert.equal(target, deploymentAddress); return state.code; },
    async keccak(code) { return keccak(code); },
    async balance(holder, at) { reads.push(['nativeBalance', holder, at]); return state.native; },
    async call(request, at) {
      assert.equal(request.to, deploymentAddress); assert.deepEqual(Object.keys(request).sort(), ['data', 'to']);
      reads.push(['call', request.data, at]);
      if (state.callResult !== null) return state.callResult;
      const signature = Object.keys({ 'symbol()': 1, 'decimals()': 1, 'totalSupply()': 1,
        'balanceOf(address)': 1, 'allowance(address,address)': 1 }).find(key => request.data.startsWith(selector(key)));
      if (signature === 'symbol()') return symbolRaw(state.symbol);
      if (signature === 'decimals()') return prefixed(word(state.decimals));
      if (signature === 'totalSupply()') return prefixed(word(state.supply));
      if (signature === 'balanceOf(address)') {
        assert.equal(request.data.length, 10 + 64); return prefixed(word(at === '0x1' ? state.historicalBalance : state.balance));
      }
      if (signature === 'allowance(address,address)') {
        assert.equal(request.data, selector(signature) + word(owner) + word(spender)); return prefixed(word(state.allowance));
      }
      throw new Error('TEST_UNEXPECTED_CALL');
    },
  };
  runtimes.add(runtime);
  return { runtime, deployment, receipt, entry, transaction, state, reads,
    input: { runtime, deployment, symbol, decimals, kind: 'ERC20' } };
}

test('actual runtime brand rejects synthetic claims; synthetic issued brands cannot cross module or runtime', async () => {
  const f = fixture();
  await assert.rejects(actualFactory(f.input), /LOCAL_EVM_OWNED_CAPABILITY_REQUIRED/);
  await assert.rejects(actualNativeFactory({ runtime: f.runtime }), /LOCAL_EVM_OWNED_CAPABILITY_REQUIRED/);
  const asset = await createOwnedPoolAsset(f.input);
  assertOwnedPoolAsset(f.runtime, asset);
  for (const candidate of [undefined, {}, { ...asset }, asset.metadata])
    assert.throws(() => assertOwnedPoolAsset(f.runtime, candidate), /CAPABILITY_REQUIRED/);
  assert.throws(() => assertOwnedPoolAsset(fixture().runtime, asset), /CAPABILITY_REQUIRED/);
  assert.throws(() => actualBrand(f.runtime, asset), /CAPABILITY_REQUIRED/);
});

test('ERC20 capability returns sanitized pinned historical reads, fixed allowance and no signer', async () => {
  const f = fixture(), asset = await createOwnedPoolAsset(f.input);
  assert.deepEqual(asset.metadata, { kind: 'ERC20', address: deploymentAddress, codeHash: f.deployment.codeHash,
    symbol: 'PALT', decimals: 6, chainId: '31337', genesisHash: hash('a') });
  assert.ok(Object.isFrozen(asset) && Object.isFrozen(asset.metadata));
  assert.deepEqual(Object.keys(asset).sort(), ['allowance', 'balance', 'metadata', 'read']);
  f.reads.length = 0;
  const read = await asset.read({ holder: owner, blockNumber: '0x1' });
  assert.equal(read.balance, '4'); assert.equal(read.totalSupply, '100'); assert.equal(read.blockHash, hash('1'));
  assert.equal(read.blockNumber, '0x1'); assert.equal(read.holder, owner); assert.equal(read.metadata, asset.metadata);
  assert.ok(Object.isFrozen(read));
  assert.ok(f.reads.filter(item => ['call', 'code'].includes(item[0])).every(item => item[2] === '0x1'));
  assert.equal(await asset.balance(owner), 9n); assert.equal(await asset.allowance(owner, spender, '0x1'), 7n);
  f.input.symbol = 'EVIL'; f.deployment.expectedCode = '0x1234';
  assert.equal((await asset.read({ holder: owner, blockNumber: '0x2' })).metadata.symbol, 'PALT');
});

test('unfunded vault shares stay ERC20, and native factory preserves fake ETH semantics', async () => {
  const f = fixture({ symbol: 'BLTV' }); f.state.balance = 0n; f.state.historicalBalance = 0n; f.state.supply = 0n;
  const shares = await createOwnedPoolAsset(f.input);
  assert.equal(shares.metadata.kind, 'ERC20'); assert.equal(await shares.balance(owner), 0n);
  const native = await createNativePoolAsset({ runtime: f.runtime });
  assert.deepEqual(native.metadata, { kind: 'NATIVE', address: '0x' + '00'.repeat(20), codeHash: hash('0'),
    symbol: 'ETH', decimals: 18, chainId: '31337', genesisHash: hash('a') });
  const read = await native.read({ holder: owner, blockNumber: '0x1' });
  assert.equal(read.balance, '3'); assert.equal(read.totalSupply, null); assert.equal(await native.balance(owner), 3n);
  await assert.rejects(native.allowance(owner, spender), /ERC20_ALLOWANCE_ONLY/);
});

test('owned creation verifies original sender, nonce, address, status, input, receipt and exact code', async () => {
  const cases = [
    [f => { f.runtime.transactions = []; }, /ORIGINAL_CREATION/],
    [f => { f.entry.phase = 'broadcast'; }, /MINED_CREATION/],
    [f => { f.entry.request.to = spender; }, /CREATE_REQUIRED/],
    [f => { f.transaction.to = spender; }, /CREATE_REQUIRED/],
    [f => { f.transaction.from = spender; }, /CREATION_SENDER/],
    [f => { f.transaction.nonce = '0x1'; }, /CREATION_NONCE/],
    [f => { f.transaction.input = '0x6002'; }, /CREATION_INPUT/],
    [f => { f.transaction.value = '0x1'; }, /NO_CREATION_VALUE/],
    [f => { f.receipt.status = '0x0'; }, /CREATION_REVERTED/],
    [f => { f.receipt.contractAddress = spender; }, /CREATED_ADDRESS/],
    [f => { f.state.code = '0x6001'; }, /CODE_CHANGED/],
    [f => { f.deployment.codeHash = hash('f'); }, /EXPECTED_HASH/],
    [f => { f.entry.senderNonce = f.transaction.nonce = '0x1'; }, /CREATE_ADDRESS/],
    [f => { f.state.symbol = 'WRONG'; }, /SYMBOL_CHANGED/],
    [f => { f.state.decimals = 18; }, /DECIMALS_CHANGED/],
  ];
  for (const [mutate, pattern] of cases) { const f = fixture(); mutate(f); await assert.rejects(createOwnedPoolAsset(f.input), pattern); }
});

test('each historical read rejects changed genesis, code, metadata, ABI, backing or canonical block', async () => {
  const cases = [
    [f => { f.state.genesis = hash('b'); }, /GENESIS_METADATA/],
    [f => { f.runtime.metadata.chainId = '1'; }, /LOCAL_CHAIN/],
    [f => { f.state.code = '0x6001'; }, /CODE_CHANGED/],
    [f => { f.state.symbol = 'OTHER'; }, /SYMBOL_CHANGED/],
    [f => { f.state.decimals = 18; }, /DECIMALS_CHANGED/],
    [f => { f.state.callResult = '0x'; }, /SYMBOL_CHANGED/],
    [f => { f.state.balance = 101n; }, /BALANCE_SUPPLY/],
    [f => { f.state.rejectCanonical = true; }, /CANONICAL_CHANGED/],
  ];
  for (const [mutate, pattern] of cases) {
    const f = fixture(), asset = await createOwnedPoolAsset(f.input); mutate(f);
    await assert.rejects(asset.read({ holder: owner, blockNumber: '0x2' }), pattern);
  }
});

test('factory/query reject endpoint, observation, label, getter and pre-creation overrides', async () => {
  const f = fixture();
  for (const extra of [{ rpcUrl: 'http://example.invalid' }, { observation: {} }, { symbolGetter: () => 'PALT' }])
    await assert.rejects(createOwnedPoolAsset({ ...f.input, ...extra }), /EXACT_FIELDS/);
  for (const symbol of ['BTC', 'SOL', 'ETH', '<script>', 'PALT\n'])
    await assert.rejects(createOwnedPoolAsset({ ...f.input, symbol }), /SYMBOL/);
  for (const kind of ['NATIVE', 'vault-share', 'self-custody'])
    await assert.rejects(createOwnedPoolAsset({ ...f.input, kind }), /CONTRACT_KIND/);
  const asset = await createOwnedPoolAsset(f.input);
  await assert.rejects(asset.read({ holder: owner, blockNumber: '0x0' }), /BEFORE_CREATION/);
  for (const blockNumber of ['pending', '1', '0x01', 1, null])
    await assert.rejects(asset.read({ holder: owner, blockNumber }), /BLOCK_NUMBER/);
  await assert.rejects(asset.read({ holder: owner, blockNumber: '0x1', balance: '999' }), /EXACT_FIELDS/);
  await assert.rejects(asset.balance('0x11'), /ADDRESS/);
});

test('canonical string framing rejects trailing line terminators in every public hex or symbol input', async () => {
  for (const suffix of ['\n', '\r', '\r\n', '\u2028', '\u2029']) {
    for (const field of ['address', 'transactionHash', 'expectedCode', 'codeHash']) {
      const f = fixture(); f.deployment[field] += suffix;
      await assert.rejects(createOwnedPoolAsset(f.input), /ADDRESS|DIGEST|RUNTIME_CODE/);
    }
    const f = fixture();
    await assert.rejects(createOwnedPoolAsset({ ...f.input, symbol: f.input.symbol + suffix }), /SYMBOL/);
    const asset = await createOwnedPoolAsset(f.input);
    await assert.rejects(asset.read({ holder: owner + suffix, blockNumber: '0x1' }), /ADDRESS/);
    await assert.rejects(asset.read({ holder: owner, blockNumber: '0x1' + suffix }), /BLOCK_NUMBER/);
    await assert.rejects(asset.allowance(owner, spender + suffix), /ADDRESS/);
    const call = f.runtime.call;
    f.runtime.call = async (request, at) => {
      const result = await call(request, at);
      return request.data.startsWith(selector('decimals()')) ? result + suffix : result;
    };
    await assert.rejects(asset.balance(owner), /ABI_WORD/);
  }
});
