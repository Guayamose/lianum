/** Ethereum, Base, Arbitrum One and BNB native balance reads. Never signs,
 * forwards caller RPC, verifies consensus or grants private spending power. */
import { PORTFOLIO_CHAINS, fields, need, hash32, rpcQuantity,
  observationBootstrap, definePortfolioAdapter } from '../../shared/portfolio/portfolio-registry.mjs';

export function normalizeEvmBlock(raw) {
  const value = fields(raw, ['number', 'hash', 'parentHash', 'timestamp']);
  const height = rpcQuantity(value.number, 64), timestamp = rpcQuantity(value.timestamp, 64);
  hash32(value.hash);
  // The genesis parent is all zero, unlike actual block identities.
  need(typeof value.parentHash === 'string' && /^0x[0-9a-f]{64}$/.test(value.parentHash), 'INVALID_PARENT_HASH');
  need(timestamp * 1000n < (1n << 64n), 'INTEGER_RANGE');
  return Object.freeze({ height: height.toString(), hash: value.hash, parentHash: value.parentHash,
    timestampMs: (timestamp * 1000n).toString() });
}
const sameBlock = (left, right) => Object.keys(left).every(key => left[key] === right[key]);

export function createEvmObservationAdapter(raw) {
  const config = observationBootstrap(raw, 'evm'), spec = PORTFOLIO_CHAINS[config.chain];
  return definePortfolioAdapter(config, async ({ request, call }) => {
    const checkNetwork = async () => {
      need(rpcQuantity(await call('eth_chainId', []), 64).toString() === spec.chainId, 'CHAIN_ID_MISMATCH');
      const genesis = normalizeEvmBlock(await call('eth_getBlockByNumber', ['0x0', false]));
      need(genesis.height === '0' && genesis.hash === config.genesisHash, 'GENESIS_MISMATCH');
    };
    await checkNetwork();
    const block = normalizeEvmBlock(await call('eth_getBlockByNumber', ['finalized', false]));
    // No fallback to a number, latest, pending, safe, or unpinned balance read.
    const balanceAtomic = rpcQuantity(await call('eth_getBalance', [request.address,
      { blockHash: block.hash, requireCanonical: true }])).toString();
    const repeated = normalizeEvmBlock(await call('eth_getBlockByNumber', ['0x' + BigInt(block.height).toString(16), false]));
    need(sameBlock(block, repeated), 'BLOCK_CHANGED', 'reorged');
    const finalized = normalizeEvmBlock(await call('eth_getBlockByNumber', ['finalized', false]));
    need(BigInt(finalized.height) >= BigInt(block.height), 'FINALITY_REGRESSED', 'reorged');
    if (finalized.height === block.height) need(sameBlock(block, finalized), 'BLOCK_CHANGED', 'reorged');
    await checkNetwork();
    return { block, balanceAtomic };
  });
}
