/** Validate retained public transfer metadata; never infer settlement or credit. */
import { record, digest, atomic } from './values.mjs';

const transferNetworks = Object.freeze({ ethereum: ['1', 'ETH'], base: ['8453', 'ETH'], arbitrum: ['42161', 'ETH'], bnb: ['56', 'BNB'], tron: [null, 'TRX'] });

const transferStatusKeys = ['schema', 'nativeId', 'chain', 'family', 'chainId', 'genesisHash', 'networkId', 'asset', 'from', 'to',
  'value', 'nonce', 'transactionType', 'metadataOnly', 'currentFinalityVerified', 'creditEligible', 'privateSpendableAtomic',
  'graphAdmissionEligible', 'deliveryVerified', 'recipientRetainedValueVerified', 'source', 'freshness', 'status', 'reason', 'observedAtMs', 'validUntilMs'];

const exactKeys = (value, keys) => record(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');

const transferCode = value => value === null || typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,120}$/.exec(value)?.[0] === value;

const evmAddress = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/.exec(value)?.[0] === value;

const tronAddress = value => typeof value === 'string' && /^41[0-9a-f]{40}$/.exec(value)?.[0] === value;

const tronStatusKeys = [...transferStatusKeys, 'finalitySource', 'independentConsensusVerified',
  'accountPermissionVerified', 'taposVerified', 'expirationVerified'];

export function validTransferSection(value) {
  if (!exactKeys(value, ['profile', 'observation', 'rows']) || !['FIXED_ORIGINAL_EVM_TRANSFERS_V1', 'FIXED_ORIGINAL_NATIVE_TRANSFERS_V2'].includes(value.profile)
    || value.observation !== 'TRUSTED_RPC_RETAINED_TRANSFER_METADATA_ONLY' || !Array.isArray(value.rows) || value.rows.length > 8) return false;
  const identities = new Set();
  for (const row of value.rows) {
    if (!exactKeys(row, ['ownerAddress', 'direction', 'refreshStatus', 'errorCode', 'status'])
      || !['REFRESHED', 'BLOCKED', 'FAILED'].includes(row.refreshStatus) || !transferCode(row.errorCode)) return false;
    const item = row.status, spec = Object.hasOwn(transferNetworks, item?.chain) ? transferNetworks[item.chain] : null;
    const tron = item?.chain === 'tron', address = tron ? tronAddress : evmAddress;
    if (!exactKeys(item, tron ? tronStatusKeys : transferStatusKeys) || !spec
      || item.schema !== `flat-${tron ? 'tron' : 'evm'}-original-transfer-status/1`
      || !digest(item.nativeId) || item.family !== (tron ? 'tron' : 'evm') || item.chainId !== spec[0]
      || (tron ? !digest(item.genesisHash) : typeof item.genesisHash !== 'string' || !item.genesisHash.startsWith('0x') || !digest(item.genesisHash.slice(2)))
      || item.networkId !== `${tron ? 'tron' : `eip155:${item.chainId}`}/genesis:${item.genesisHash}`
      || !address(row.ownerAddress) || !address(item.from) || !address(item.to) || atomic(item.value) === null
      || (tron ? item.nonce !== null || item.transactionType !== 'TransferContract'
        || BigInt(item.value) <= 0n || BigInt(item.value) >= (1n << 63n) || item.from === item.to
        || value.profile !== 'FIXED_ORIGINAL_NATIVE_TRANSFERS_V2' || item.finalitySource !== 'rpc-solidified'
        || item.independentConsensusVerified !== false || item.accountPermissionVerified !== false
        || item.taposVerified !== false || item.expirationVerified !== false
        : atomic(item.nonce) === null || !['0', '1', '2'].includes(item.transactionType))
      || !exactKeys(item.asset, ['id', 'kind', 'symbol', 'decimals', 'commitment'])
      || item.asset.id !== `${item.networkId}/native` || item.asset.kind !== 'native' || item.asset.symbol !== spec[1]
      || item.asset.decimals !== (tron ? 6 : 18) || !digest(item.asset.commitment)
      || item.metadataOnly !== true || item.currentFinalityVerified !== false || item.creditEligible !== false
      || item.privateSpendableAtomic !== null || item.graphAdmissionEligible !== false || item.deliveryVerified !== false
      || item.recipientRetainedValueVerified !== false || item.source !== 'retained-observation-metadata' || item.freshness !== 'not-revalidated'
      || !['unobserved', 'observed', 'pending', 'reverted', 'unknown', 'reorged', 'stale'].includes(item.status) || !transferCode(item.reason)
      || [item.observedAtMs, item.validUntilMs].some(value => value !== null && (atomic(value) === null || BigInt(value) >= (1n << 64n)))) return false;
    const direction = item.from === row.ownerAddress ? item.to === row.ownerAddress ? 'self' : 'outgoing'
      : item.to === row.ownerAddress ? 'incoming' : null;
    if (!direction || row.direction !== direction) return false;
    if (row.refreshStatus !== 'REFRESHED' && (item.status !== (row.refreshStatus === 'BLOCKED' ? 'stale' : 'unknown')
      || row.errorCode === null || item.reason !== row.errorCode || item.validUntilMs !== null)) return false;
    const identity = `${item.networkId}/${item.nativeId}`;
    if (identities.has(identity)) return false;
    identities.add(identity);
  }
  return true;
}
