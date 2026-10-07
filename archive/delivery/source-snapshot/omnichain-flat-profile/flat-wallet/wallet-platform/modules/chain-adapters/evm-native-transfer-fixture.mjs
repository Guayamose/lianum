/** Synthetic public mathematical signatures and RPC fixtures for bounded tests.
 * No private keys or signing: fixed r=Gx, s=1 recover a different public sender
 * for each declared payload. These are not transactions submitted to any chain. */
import { publicKeccak256 } from '../../../../../omnichain-product/src/private-cohort-public-native.mjs';
import { recoverSecp256k1Sender } from './owned-evm-v2-runtime.mjs';
import { PORTFOLIO_CHAINS } from './portfolio-registry.mjs';
const Gx = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
export const quantity = n => '0x' + BigInt(n).toString(16);
export const hash = n => '0x' + BigInt(n).toString(16).padStart(64, '0');
const bytes = n => { const value = BigInt(n); if (!value) return Buffer.alloc(0);
  const hex = value.toString(16); return Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex'); };
export function fixtureRlp(value) {
  const prefix = (size, base) => size < 56 ? Buffer.from([base + size]) : Buffer.concat([Buffer.from([base + 55 + bytes(size).length]), bytes(size)]);
  if (Array.isArray(value)) { const body = Buffer.concat(value.map(fixtureRlp)); return Buffer.concat([prefix(body.length, 192), body]); }
  return value.length === 1 && value[0] < 128 ? value : Buffer.concat([prefix(value.length, 128), value]);
}
export function originalFixture(chain = 'ethereum', type = 2, overrides = {}) {
  const expected = { chainId: PORTFOLIO_CHAINS[chain].chainId, nonce: '7', gasPrice: '20', maxFeePerGas: '30',
    maxPriorityFeePerGas: '2', gas: '100000', to: '0x' + '34'.repeat(20), value: '9007199254740993', data: '0x',
    accessList: [], ...overrides };
  const list = expected.accessList.map(entry => [Buffer.from(entry.address.slice(2), 'hex'), entry.storageKeys.map(key => Buffer.from(key.slice(2), 'hex'))]);
  const destination = Buffer.from(expected.to.slice(2), 'hex'), data = Buffer.from(expected.data.slice(2), 'hex');
  const fields = type === 0 ? [bytes(expected.nonce), bytes(expected.gasPrice), bytes(expected.gas), destination, bytes(expected.value), data]
    : type === 1 ? [bytes(expected.chainId), bytes(expected.nonce), bytes(expected.gasPrice), bytes(expected.gas), destination, bytes(expected.value), data, list]
      : [bytes(expected.chainId), bytes(expected.nonce), bytes(expected.maxPriorityFeePerGas), bytes(expected.maxFeePerGas), bytes(expected.gas), destination, bytes(expected.value), data, list];
  const v = type === 0 ? 35n + 2n * BigInt(expected.chainId) : 0n;
  const unsigned = type === 0 ? fixtureRlp([...fields, bytes(expected.chainId), Buffer.alloc(0), Buffer.alloc(0)])
    : Buffer.concat([Buffer.from([type]), fixtureRlp(fields)]);
  const signed = fixtureRlp([...fields, bytes(v), Buffer.from(Gx, 'hex'), Buffer.from([1])]);
  const wireBytes = type === 0 ? signed : Buffer.concat([Buffer.from([type]), signed]);
  const from = recoverSecp256k1Sender({ digest: publicKeccak256(unsigned).toString('hex'), r: Gx, s: '0'.repeat(63) + '1', parity: 0 });
  const transactionHash = '0x' + publicKeccak256(wireBytes).toString('hex');
  const original = { nativeWire: '0x' + wireBytes.toString('hex'), expected: {
    nativeId: transactionHash.slice(2), from, to: expected.to, value: expected.value, nonce: expected.nonce } };
  const genesisHash = hash(100 + ['ethereum', 'base', 'arbitrum', 'bnb'].indexOf(chain));
  const block = (height, identity = 1000 + height) => ({ number: quantity(height), hash: hash(identity), parentHash: hash(identity - 1),
    timestamp: quantity(height === 0 ? 0 : 1000 + height), transactions: height === 10 ? [hash(700), transactionHash, hash(701)] : [] });
  const genesis = { ...block(0), hash: genesisHash, parentHash: hash(0) }, included = block(10), finalized = block(20);
  const tx = { hash: transactionHash, type: quantity(type), chainId: quantity(expected.chainId), nonce: quantity(expected.nonce),
    from, to: expected.to, value: quantity(expected.value), gas: quantity(expected.gas), input: expected.data,
    gasPrice: quantity(expected.gasPrice), v: quantity(v), r: '0x' + Gx, s: '0x' + '0'.repeat(63) + '1',
    blockHash: included.hash, blockNumber: included.number, transactionIndex: '0x1',
    ...(type === 0 ? {} : { accessList: structuredClone(expected.accessList), yParity: '0x0' }),
    ...(type === 2 ? { maxFeePerGas: quantity(expected.maxFeePerGas), maxPriorityFeePerGas: quantity(expected.maxPriorityFeePerGas) } : {}) };
  const receipt = { transactionHash, blockHash: included.hash, blockNumber: included.number, transactionIndex: '0x1',
    from, to: expected.to, type: quantity(type), status: '0x1', gasUsed: '0x5208', cumulativeGasUsed: '0xa410',
    effectiveGasPrice: quantity(expected.gasPrice), contractAddress: null, logsBloom: '0x' + '00'.repeat(256), logs: [] };
  const calls = [], state = { tx, receipt, genesis, included, finalized, headers: new Map(), override: null };
  const transport = async (method, params, options) => {
    calls.push([method, structuredClone(params)]);
    if (!(options.signal instanceof AbortSignal)) throw new Error('fixture requires cancellation');
    const custom = await state.override?.(method, params, calls); if (custom !== undefined) return structuredClone(custom);
    if (method === 'eth_chainId') return quantity(expected.chainId);
    if (method === 'eth_getTransactionByHash') return structuredClone(state.tx);
    if (method === 'eth_getTransactionReceipt') return structuredClone(state.receipt);
    if (method === 'eth_getBlockByNumber') {
      if (params[0] === '0x0') return structuredClone(state.genesis);
      if (params[0] === 'finalized') return structuredClone(state.finalized);
      if (state.headers.has(params[0])) return structuredClone(state.headers.get(params[0]));
      if (params[0] === state.included.number) return structuredClone(state.included);
      if (params[0] === state.finalized.number) return structuredClone(state.finalized);
    }
    throw new Error('unexpected synthetic RPC method/selector');
  };
  return { original, expected, state, calls, transport, genesisHash,
    config: { chain, genesisHash, transport, original, now: () => 1030000 } };
}
