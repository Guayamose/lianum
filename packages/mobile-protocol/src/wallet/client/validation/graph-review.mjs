/** Validate public graph review payloads. Parsed labels never confer authority. */
import { record, accountDigest, atomic, validId } from './values.mjs';
import { OWNER_GRAPH_PROFILES, validateOwnerGraphReview } from '../../contracts/owner-graph-review-v1.mjs';

const graphFields = ['version', 'profile', 'requestId', 'kind', 'ownerOperationRef', 'assetId', 'asset',
  'routeProfile', 'family', 'chainId', 'genesis', 'router', 'vault', 'solver', 'sourcePool', 'targetPool',
  'sourceAssetIdentity', 'targetAssetIdentity', 'targetCommitment', 'descriptorCommitment', 'solverUnderlyingAmount',
  'deliveredShares', 'executionFrom', 'executionUntil', 'settleBefore', 'payoutCommitment', 'deliveryLossClause',
  'envelope', 'fundingNotBefore', 'fundingValidUntil', 'identitySHA256', 'sourceAmount', 'reservedAmount',
  'changeAmount', 'changeRecipient', 'recoveryRecipient', 'originalAccountLifetime', 'observation',
  'solverOwnLiquidity', 'settlementEstablished', 'recovery'];

const nativeGraphFields = ['version', 'profile', 'requestId', 'kind', 'ownerOperationRef', 'assetId', 'asset',
  'routeProfile', 'family', 'chainId', 'genesis', 'sourcePool', 'sourceAssetIdentity', 'nativeAsset', 'solver', 'recipient',
  'nativeAmount', 'executionFrom', 'executionUntil', 'settleBefore', 'payoutCommitment', 'deliveryRiskCommitment',
  'deliveryLossClause', 'creditEligible', 'privateSpendableAtomic', 'publicNetwork', 'envelope', 'fundingNotBefore',
  'fundingValidUntil', 'identitySHA256', 'sourceAmount', 'reservedAmount', 'changeAmount', 'changeRecipient',
  'recoveryRecipient', 'originalAccountLifetime', 'observation', 'solverOwnLiquidity', 'settlementEstablished', 'recovery'];

// Presentation validation only. Authority comes from the original server-side
// native WeakMaps and its exact one-use handoff, never these parsed labels.
function validNativeValueGraphReview(value) {
  const wrapped = value?.profile === 'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V1';
  if (wrapped) {
    const b = value.wrappedBinding;
    if (!record(b) || Object.keys(b).sort().join(',') !== ['profile', 'accountIdentitySHA256', 'runtimeIdentitySHA256', 'systemProfile',
      'hub', 'claimAuthority', 'registryCommitment', 'claimDomain', 'processIdentitySHA256', 'processGeneration', 'head', 'economicIntentSHA256'].sort().join(',')
      || b.profile !== 'WRAPPED_WALLET_ORIGINAL_CONSENT_BINDING_V1' || b.systemProfile !== 'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1'
      || !['accountIdentitySHA256', 'runtimeIdentitySHA256', 'registryCommitment', 'claimDomain', 'processIdentitySHA256', 'economicIntentSHA256'].every(k => accountDigest(b[k]))
      || !['hub', 'claimAuthority'].every(k => typeof b[k] === 'string' && /^0x[0-9a-f]{40}$/.exec(b[k])?.[0] === b[k] && b[k] !== '0x' + '0'.repeat(40))
      || !Number.isSafeInteger(b.processGeneration) || b.processGeneration < 1 || !record(b.head)
      || Object.keys(b.head).sort().join(',') !== 'hash,number,timestamp' || !accountDigest(b.head.hash)
      || !['number', 'timestamp'].every(k => atomic(b.head[k]) !== null)) return false;
  }
  if (!record(value) || Object.keys(value).sort().join(',') !== [...nativeGraphFields, ...(wrapped ? ['wrappedBinding'] : [])].sort().join(',')
    || value.version !== 1 || (!wrapped && value.profile !== 'ORIGINAL_MANUAL_NATIVE_VALUE_GRAPH_REVIEW_V2')
    || value.routeProfile !== (wrapped ? 'OWNED_LOCAL_WRAPPED_CLAIM_NATIVE_GRAPH_V1' : 'OWNED_LOCAL_NATIVE_VALUE_GRAPH_V2') || value.kind !== 'GRAPH' || !validId(value.requestId)
    || !record(value.asset) || Object.keys(value.asset).sort().join(',') !== 'assetId,decimals,symbol'
    || value.asset.assetId !== value.assetId || typeof value.asset.symbol !== 'string'
    || /^[A-Z0-9]{2,12}$/.exec(value.asset.symbol)?.[0] !== value.asset.symbol || !Number.isInteger(value.asset.decimals)
    || value.asset.decimals < 0 || value.asset.decimals > 18 || value.creditEligible !== false
    || value.privateSpendableAtomic !== null || value.publicNetwork !== false
    || value.observation !== 'ORIGINAL_AUTHORIZED_TERMS_ONLY' || value.solverOwnLiquidity !== true
    || value.settlementEstablished !== false || value.recovery !== 'PRIVATE_ORIGINAL_CUTOFF_ONLY'
    || typeof value.deliveryLossClause !== 'string' || value.deliveryLossClause.length === 0 || value.deliveryLossClause.length > 300) return false;
  const evm = value.family === '3';
  if (!(evm ? ['1', '8453', '42161', '56'].includes(value.chainId) : value.family === '4' && value.chainId === null)) return false;
  for (const key of ['ownerOperationRef', 'assetId', 'genesis', 'sourceAssetIdentity', 'nativeAsset', 'payoutCommitment',
    'deliveryRiskCommitment', 'envelope', 'identitySHA256', 'originalAccountLifetime']) if (!accountDigest(value[key])) return false;
  if (typeof value.sourcePool !== 'string' || /^0x[0-9a-f]{40}$/.exec(value.sourcePool)?.[0] !== value.sourcePool) return false;
  for (const key of ['changeRecipient', 'recoveryRecipient'])
    if (typeof value[key] !== 'string' || /^[0-9a-f]{40}$/.exec(value[key])?.[0] !== value[key]) return false;
  const endpoint = evm ? /^0x[0-9a-f]{40}$/ : /^41[0-9a-f]{40}$/;
  if (['solver', 'recipient'].some(key => typeof value[key] !== 'string' || endpoint.exec(value[key])?.[0] !== value[key])
    || value.solver === value.recipient) return false;
  for (const key of ['nativeAmount', 'executionFrom', 'executionUntil', 'settleBefore', 'fundingNotBefore',
    'fundingValidUntil', 'sourceAmount', 'reservedAmount', 'changeAmount'])
    if (atomic(value[key]) === null || BigInt(value[key]) >= (1n << 128n)) return false;
  return BigInt(value.nativeAmount) > 0n && (evm || BigInt(value.nativeAmount) < (1n << 63n))
    && BigInt(value.sourceAmount) === BigInt(value.reservedAmount) + BigInt(value.changeAmount)
    && BigInt(value.reservedAmount) > 0n && BigInt(value.executionFrom) < BigInt(value.executionUntil)
    && BigInt(value.executionUntil) <= BigInt(value.settleBefore) && BigInt(value.fundingNotBefore) < BigInt(value.fundingValidUntil);
}

export const ownerGraphProfiles = new Set(OWNER_GRAPH_PROFILES);

export function validGraphReview(value) {
  if (ownerGraphProfiles.has(value?.profile)) {
    try { validateOwnerGraphReview(value); return true; } catch { return false; }
  }
  if (['ORIGINAL_MANUAL_NATIVE_VALUE_GRAPH_REVIEW_V2', 'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V1'].includes(value?.profile)) return validNativeValueGraphReview(value);
  if (!record(value) || Object.keys(value).sort().join(',') !== [...graphFields].sort().join(',')
    || value.version !== 1 || value.profile !== 'ORIGINAL_MANUAL_EVM_GRAPH_REVIEW_V1'
    || value.routeProfile !== 'REGISTERED_LOCAL_EVM_VAULT_V1' || value.family !== '3' || value.chainId !== '31337'
    || value.kind !== 'GRAPH' || !validId(value.requestId) || !record(value.asset)
    || value.asset.assetId !== value.assetId || typeof value.asset.symbol !== 'string'
    || !/^[A-Z0-9]{2,12}$/.test(value.asset.symbol) || !Number.isInteger(value.asset.decimals)
    || value.asset.decimals < 0 || value.asset.decimals > 18
    || value.observation !== 'ORIGINAL_AUTHORIZED_TERMS_ONLY' || value.solverOwnLiquidity !== true
    || value.settlementEstablished !== false || value.recovery !== 'PRIVATE_ORIGINAL_CUTOFF_ONLY'
    || typeof value.deliveryLossClause !== 'string' || value.deliveryLossClause.length > 300) return false;
  for (const key of ['ownerOperationRef', 'assetId', 'genesis', 'sourceAssetIdentity', 'targetAssetIdentity', 'targetCommitment',
    'descriptorCommitment', 'payoutCommitment', 'envelope', 'identitySHA256', 'originalAccountLifetime']) if (!accountDigest(value[key])) return false;
  for (const key of ['router', 'vault', 'solver', 'sourcePool', 'targetPool', 'changeRecipient', 'recoveryRecipient'])
    if (typeof value[key] !== 'string' || /^[0-9a-f]{40}$/.exec(value[key])?.[0] !== value[key]) return false;
  for (const key of ['solverUnderlyingAmount', 'deliveredShares', 'executionFrom', 'executionUntil', 'settleBefore',
    'fundingNotBefore', 'fundingValidUntil', 'sourceAmount', 'reservedAmount', 'changeAmount'])
    if (atomic(value[key]) === null || BigInt(value[key]) >= (1n << 128n)) return false;
  return BigInt(value.sourceAmount) === BigInt(value.reservedAmount) + BigInt(value.changeAmount)
    && BigInt(value.solverUnderlyingAmount) > 0n && BigInt(value.deliveredShares) > 0n && BigInt(value.reservedAmount) > 0n
    && BigInt(value.executionFrom) < BigInt(value.executionUntil) && BigInt(value.executionUntil) <= BigInt(value.settleBefore)
    && BigInt(value.fundingNotBefore) < BigInt(value.fundingValidUntil);
}
