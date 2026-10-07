/** Solidified TRX display reads. Address 0x41 is an encoding prefix, NOT a
 * network discriminator; a separately pinned genesis is mandatory. */
import { fields, need, hash32, unsignedDecimal, normalizeTronAddress,
  observationBootstrap, definePortfolioAdapter } from '../../shared/portfolio/portfolio-registry.mjs';

/** java-tron JSON int64 fields must arrive as exact decimal strings or safe
 * integers. A trusted HTTP transport needs lossless JSON for larger values. */
export function normalizeTronInteger(value) {
  if (typeof value === 'number') {
    need(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0), 'UNSAFE_RPC_INTEGER');
    value = String(value);
  }
  return unsignedDecimal(value, 63).toString();
}
export function normalizeTronBlock(raw, genesis = false) {
  const value = fields(raw, ['blockID', 'block_header']);
  const { raw_data: data } = fields(value.block_header, ['raw_data']);
  const header = fields(data, genesis ? [] : ['number', 'timestamp', 'parentHash'],
    genesis ? ['number', 'timestamp', 'parentHash'] : []);
  const height = normalizeTronInteger(header.number === undefined && genesis ? 0 : header.number);
  const timestampMs = normalizeTronInteger(header.timestamp === undefined && genesis ? 0 : header.timestamp);
  hash32(value.blockID, false);
  // java-tron BlockId encodes the height in its leading eight bytes.
  need(BigInt('0x' + value.blockID.slice(0, 16)).toString() === height, 'BLOCK_HEIGHT_MISMATCH');
  const parentHash = header.parentHash === undefined && genesis ? '0'.repeat(64) : header.parentHash;
  need(typeof parentHash === 'string' && /^[0-9a-f]{64}$/.test(parentHash), 'INVALID_PARENT_HASH');
  return Object.freeze({ height, hash: value.blockID, parentHash, timestampMs });
}
export function normalizeTronAccount(raw, address) {
  const account = fields(raw, [], ['address', 'balance', 'Error', 'error']);
  need(account.Error === undefined && account.error === undefined, 'RPC_ACCOUNT_ERROR');
  need(account.address !== undefined, 'ACCOUNT_UNKNOWN');
  need(normalizeTronAddress(account.address) === address, 'ACCOUNT_ADDRESS_MISMATCH');
  // Omitted protobuf fields/empty responses never silently become a zero.
  need(account.balance !== undefined, 'BALANCE_UNKNOWN');
  return normalizeTronInteger(account.balance);
}
const sameBlock = (left, right) => Object.keys(left).every(key => left[key] === right[key]);

export function createTronObservationAdapter(raw) {
  const config = observationBootstrap(raw, 'tron');
  return definePortfolioAdapter(config, async ({ request, call }) => {
    const checkGenesis = async () => {
      const genesis = normalizeTronBlock(await call('/walletsolidity/getblockbynum', { num: 0 }), true);
      need(genesis.height === '0' && genesis.hash === config.genesisHash, 'GENESIS_MISMATCH');
    };
    await checkGenesis();
    const block = normalizeTronBlock(await call('/walletsolidity/getnowblock', {}));
    const balanceAtomic = normalizeTronAccount(await call('/walletsolidity/getaccount',
      { address: request.address, visible: false }), request.address);
    const repeated = normalizeTronBlock(await call('/walletsolidity/getnowblock', {}));
    need(BigInt(repeated.height) >= BigInt(block.height), 'FINALITY_REGRESSED', 'reorged');
    if (repeated.height === block.height) need(sameBlock(block, repeated), 'BLOCK_CHANGED', 'reorged');
    // GetAccount cannot pin a historical block. Advancing context is unknown,
    // never mislabelled as an atomic balance observation at either height.
    need(repeated.height === block.height, 'SOLIDIFIED_CONTEXT_CHANGED');
    await checkGenesis();
    return { block, balanceAtomic };
  });
}
