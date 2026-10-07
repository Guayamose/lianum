/** Private, read-only asset capability for a golden owned local EVM. Expected
 * bytes come from the trusted fixture bootstrap, never a request or observer.
 * Importing or creating this module starts no runtime and sends no transaction. */
import assert from 'node:assert/strict';
import { assertLocalEvm } from './local-evm-ownership.mjs';
import { predictNativeCreateAddress } from '../../../../../omnichain-product/src/paeg/native-deployment.mjs';
import { publicKeccak256 } from '../../../../../omnichain-product/src/private-cohort-public-native.mjs';
import { evmRuntimeCodeHash } from './evm-code-hash.mjs';
import { exactRecord } from '../paeg/commitments.mjs';

// Preserve every started read through rejection; no caller may begin cleanup
// while a sibling RPC or nested reconstruction still belongs to this read.
async function drainReadPromises(reads) {
  let failed = false, firstError;
  const results = await Promise.allSettled(reads.map(read => Promise.resolve(read).catch(error => {
    if (!failed) { failed = true; firstError = error; } throw error;
  })));
  if (failed) throw firstError;
  return results.map(result => result.value);
}

const ZERO_ADDRESS = '0x' + '00'.repeat(20), ZERO_HASH = '0x' + '00'.repeat(32);
const owned = new WeakMap();
const keccak = evmRuntimeCodeHash;
const selector = signature => publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex');
const selectors = Object.freeze(Object.fromEntries(['symbol()', 'decimals()', 'totalSupply()', 'balanceOf(address)', 'allowance(address,address)']
  .map(signature => [signature, selector(signature)])));
const word = value => BigInt(value).toString(16).padStart(64, '0');
function address(value) {
  assert.ok(typeof value === 'string' && value.length === 42 && /^0x[0-9a-f]{40}$/.test(value), 'OWNED_POOL_ASSET_ADDRESS'); return value;
}
function digest(value) {
  assert.ok(typeof value === 'string' && value.length === 66 && /^0x[0-9a-f]{64}$/.test(value), 'OWNED_POOL_ASSET_DIGEST'); return value;
}
function quantity(value) {
  assert.ok(typeof value === 'string' && value.length <= 66 && /^0x(0|[1-9a-f][0-9a-f]*)$/.test(value),
    'OWNED_POOL_ASSET_BLOCK_NUMBER');
  assert.equal('0x' + BigInt(value).toString(16), value, 'OWNED_POOL_ASSET_BLOCK_NUMBER'); return value;
}
function uintWord(raw) {
  assert.ok(typeof raw === 'string' && raw.length === 66 && /^0x[0-9a-f]{64}$/.test(raw), 'OWNED_POOL_ASSET_ABI_WORD'); return BigInt(raw);
}
function symbolEncoding(symbol) {
  assert.ok(typeof symbol === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,15}$/.exec(symbol)?.[0] === symbol, 'OWNED_POOL_ASSET_SYMBOL');
  return '0x' + word(32) + word(symbol.length) + Buffer.from(symbol, 'ascii').toString('hex').padEnd(64, '0');
}
function pins(deployment) {
  exactRecord(deployment, ['address', 'transactionHash', 'expectedCode', 'codeHash']);
  address(deployment.address); assert.notEqual(deployment.address, ZERO_ADDRESS, 'OWNED_POOL_ASSET_NONZERO_ADDRESS');
  digest(deployment.transactionHash); digest(deployment.codeHash);
  assert.ok(typeof deployment.expectedCode === 'string' && deployment.expectedCode.length <= 2 + 24576 * 2
    && /^0x(?:[0-9a-f]{2})+$/.test(deployment.expectedCode), 'OWNED_POOL_ASSET_RUNTIME_CODE');
  assert.equal(Buffer.from(deployment.expectedCode.slice(2), 'hex').toString('hex'), deployment.expectedCode.slice(2),
    'OWNED_POOL_ASSET_RUNTIME_CODE');
  assert.equal(keccak(deployment.expectedCode), deployment.codeHash, 'OWNED_POOL_ASSET_EXPECTED_HASH');
  return Object.freeze({ ...deployment });
}
async function genesis(runtime, expected) {
  await assertLocalEvm(runtime);
  assert.equal(runtime.metadata.chainId, '31337', 'OWNED_POOL_ASSET_LOCAL_CHAIN');
  const header = await runtime.block('0x0');
  assert.equal(header.number, '0x0', 'OWNED_POOL_ASSET_GENESIS_BLOCK');
  digest(header.hash); assert.equal(header.hash, runtime.metadata.evmGenesis, 'OWNED_POOL_ASSET_GENESIS_METADATA');
  if (expected !== undefined) assert.equal(header.hash, expected, 'OWNED_POOL_ASSET_GENESIS_CHANGED');
  await runtime.assertCanonical(header); return header.hash;
}
async function codeAt(runtime, deployment, at) {
  const actual = await runtime.code(deployment.address, at);
  assert.equal(actual, deployment.expectedCode, 'OWNED_POOL_ASSET_CODE_CHANGED');
  assert.equal(keccak(actual), deployment.codeHash, 'OWNED_POOL_ASSET_CODE_HASH');
}
async function originalCreation(runtime, deployment) {
  const entries = runtime.transactions.filter(entry => entry.transactionHash === deployment.transactionHash);
  assert.equal(entries.length, 1, 'OWNED_POOL_ASSET_ORIGINAL_CREATION');
  const entry = entries[0];
  assert.equal(entry.phase, 'mined', 'OWNED_POOL_ASSET_MINED_CREATION');
  assert.equal(entry.request.to, undefined, 'OWNED_POOL_ASSET_CREATE_REQUIRED');
  assert.ok(runtime.accounts.includes(address(entry.request.from)), 'OWNED_POOL_ASSET_OWNED_SENDER');
  const [transaction, receipt] = await Promise.all([
    runtime.transaction(deployment.transactionHash), runtime.receipt(deployment.transactionHash),
  ]);
  assert.ok(transaction && receipt, 'OWNED_POOL_ASSET_CREATION_RECEIPT');
  assert.equal(receipt.status, '0x1', 'OWNED_POOL_ASSET_CREATION_REVERTED');
  assert.equal(receipt.transactionHash, deployment.transactionHash, 'OWNED_POOL_ASSET_RECEIPT_HASH');
  assert.equal(receipt.contractAddress, deployment.address, 'OWNED_POOL_ASSET_CREATED_ADDRESS');
  assert.deepEqual(entry.receipt, receipt, 'OWNED_POOL_ASSET_ORIGINAL_RECEIPT');
  assert.equal(transaction.hash, deployment.transactionHash, 'OWNED_POOL_ASSET_TRANSACTION_HASH');
  assert.equal(transaction.to, null, 'OWNED_POOL_ASSET_CREATE_REQUIRED');
  assert.equal(transaction.from, entry.request.from, 'OWNED_POOL_ASSET_CREATION_SENDER');
  assert.equal(transaction.input, entry.request.data, 'OWNED_POOL_ASSET_CREATION_INPUT');
  assert.equal(quantity(transaction.nonce), quantity(entry.senderNonce), 'OWNED_POOL_ASSET_CREATION_NONCE');
  assert.equal(predictNativeCreateAddress(transaction.from, BigInt(transaction.nonce)), deployment.address,
    'OWNED_POOL_ASSET_CREATE_ADDRESS');
  assert.equal(BigInt(transaction.value), 0n, 'OWNED_POOL_ASSET_NO_CREATION_VALUE');
  assert.equal(BigInt(entry.request.value ?? '0x0'), 0n, 'OWNED_POOL_ASSET_NO_CREATION_VALUE');
  assert.equal(transaction.blockNumber, receipt.blockNumber, 'OWNED_POOL_ASSET_CREATION_BLOCK');
  assert.equal(transaction.blockHash, receipt.blockHash, 'OWNED_POOL_ASSET_CREATION_BLOCK_HASH');
  await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
  await codeAt(runtime, deployment, receipt.blockNumber);
  assert.equal(await runtime.keccak(deployment.expectedCode), deployment.codeHash, 'OWNED_POOL_ASSET_INDEPENDENT_HASH');
  return Object.freeze({ blockNumber: quantity(receipt.blockNumber), blockHash: digest(receipt.blockHash) });
}

/** Exact identity only; metadata, copies and parser results do not confer it. */
export function assertOwnedPoolAsset(runtime, capability) {
  assert.ok(owned.has(capability) && owned.get(capability).runtime === runtime, 'OWNED_POOL_ASSET_CAPABILITY_REQUIRED');
}

async function readAt(binding, holder, blockNumber) {
  const { runtime, deployment, metadata, creation } = binding;
  address(holder); if (blockNumber !== 'latest') quantity(blockNumber);
  await genesis(runtime, metadata.genesisHash);
  const header = await runtime.block(blockNumber), at = quantity(header.number); digest(header.hash);
  if (blockNumber !== 'latest') assert.equal(at, blockNumber, 'OWNED_POOL_ASSET_REQUESTED_BLOCK');
  let balance, totalSupply = null;
  if (deployment) {
    assert.ok(BigInt(at) >= BigInt(creation.blockNumber), 'OWNED_POOL_ASSET_BEFORE_CREATION');
    await runtime.assertCanonical(creation);
    await codeAt(runtime, deployment, at);
    const call = (signature, args = '') => runtime.call({ to: deployment.address, data: '0x' + selectors[signature] + args }, at);
    const [symbol, decimals, supply, held] = await drainReadPromises([
      call('symbol()'), call('decimals()'), call('totalSupply()'), call('balanceOf(address)', word(holder)),
    ]);
    assert.equal(symbol, symbolEncoding(metadata.symbol), 'OWNED_POOL_ASSET_SYMBOL_CHANGED');
    assert.equal(uintWord(decimals), BigInt(metadata.decimals), 'OWNED_POOL_ASSET_DECIMALS_CHANGED');
    totalSupply = uintWord(supply); balance = uintWord(held);
    assert.ok(balance <= totalSupply, 'OWNED_POOL_ASSET_BALANCE_SUPPLY');
    totalSupply = totalSupply.toString();
  } else {
    balance = await runtime.balance(holder, at);
    assert.ok(typeof balance === 'bigint' && balance >= 0n && balance < 1n << 256n, 'OWNED_POOL_ASSET_NATIVE_BALANCE');
  }
  await runtime.assertCanonical(header);
  return Object.freeze({ metadata, holder, balance: balance.toString(), totalSupply, blockNumber: at, blockHash: header.hash });
}
function issue(binding) {
  const capability = Object.freeze({ metadata: binding.metadata,
    async read(query) {
      exactRecord(query, ['holder', 'blockNumber']);
      return readAt(binding, query.holder, query.blockNumber);
    },
    async balance(holder, block = 'latest') { return BigInt((await readAt(binding, holder, block)).balance); },
    async allowance(holder, spender, block = 'latest') {
      assert.ok(binding.deployment, 'OWNED_POOL_ASSET_ERC20_ALLOWANCE_ONLY'); address(holder); address(spender);
      const observed = await readAt(binding, holder, block);
      const raw = await binding.runtime.call({ to: binding.deployment.address,
        data: '0x' + selectors['allowance(address,address)'] + word(holder) + word(spender) }, observed.blockNumber);
      const result = uintWord(raw);
      await binding.runtime.assertCanonical(observed); return result;
    },
  });
  owned.set(capability, binding); return capability;
}

/** The trusted bootstrap must derive expectedCode from its fixed fixture build.
 * This authenticates original deployment and reads, not source provenance,
 * issuer honesty, vault backing or public-chain finality. */
export async function createOwnedPoolAsset(input) {
  assert.equal(arguments.length, 1, 'OWNED_POOL_ASSET_BOOTSTRAP_ARGUMENTS');
  exactRecord(input, ['runtime', 'deployment', 'symbol', 'decimals', 'kind']);
  const { runtime, symbol, decimals, kind } = input;
  assert.equal(kind, 'ERC20', 'OWNED_POOL_ASSET_CONTRACT_KIND'); symbolEncoding(symbol);
  assert.ok(!['BTC', 'SOL', 'ETH'].includes(symbol.toUpperCase()), 'OWNED_POOL_ASSET_NATIVE_SYMBOL');
  assert.ok(Number.isSafeInteger(decimals) && !Object.is(decimals, -0) && decimals >= 0 && decimals <= 255,
    'OWNED_POOL_ASSET_DECIMALS');
  const deployment = pins(input.deployment), genesisHash = await genesis(runtime);
  const creation = await originalCreation(runtime, deployment);
  const metadata = Object.freeze({ kind, address: deployment.address, codeHash: deployment.codeHash,
    symbol, decimals, chainId: '31337', genesisHash });
  const binding = { runtime, deployment, metadata, creation };
  await readAt(binding, runtime.accounts[0], creation.blockNumber);
  await readAt(binding, runtime.accounts[0], 'latest');
  return issue(binding);
}

/** Native fake ETH is a distinct fixed profile, never a token label override. */
export async function createNativePoolAsset(input) {
  assert.equal(arguments.length, 1, 'OWNED_POOL_ASSET_BOOTSTRAP_ARGUMENTS'); exactRecord(input, ['runtime']);
  const runtime = input.runtime, genesisHash = await genesis(runtime);
  const metadata = Object.freeze({ kind: 'NATIVE', address: ZERO_ADDRESS, codeHash: ZERO_HASH,
    symbol: 'ETH', decimals: 18, chainId: '31337', genesisHash });
  const binding = { runtime, metadata };
  await readAt(binding, runtime.accounts[0], 'latest'); return issue(binding);
}
