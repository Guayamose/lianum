/** Display validation only. Parsed data never establishes native owner authority. */
export const NATIVE_NOTE_REVIEW_PROFILE = 'ORIGINAL_MANUAL_NATIVE_VALUE_NOTE_REVIEW_V1';
export const NATIVE_NOTE_HANDOFF_PROFILE = 'ORIGINAL_NATIVE_VALUE_NOTE_HANDOFF_V1';
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype
  && Object.keys(v).sort().join(',') === [...keys].sort().join(',');
const digest = v => typeof v === 'string' && /^[0-9a-f]{64}$/.exec(v)?.[0] === v;
const address = v => typeof v === 'string' && /^[0-9a-f]{40}$/.exec(v)?.[0] === v;
const uint = v => typeof v === 'string' && /^(0|[1-9][0-9]{0,19})$/.exec(v)?.[0] === v && BigInt(v) < (1n << 64n);
const id = v => typeof v === 'string' && /^[A-Za-z0-9_-]{8,100}$/.exec(v)?.[0] === v;
export function validNativeNoteReview(v) {
  if (!exact(v, ['version', 'profile', 'requestId', 'kind', 'ownerOperationRef', 'assetId', 'asset',
    'originalAccountLifetime', 'generationId', 'identitySHA256', 'accountIdentitySHA256', 'terms', 'termsSHA256',
    'actionBodySHA256', 'publicNetwork', 'observation', 'settlementEstablished'])
    || v.version !== 1 || v.profile !== NATIVE_NOTE_REVIEW_PROFILE || !['TOP_UP', 'EXIT'].includes(v.kind)
    || !id(v.requestId) || v.publicNetwork !== false || v.settlementEstablished !== false
    || v.observation !== 'ORIGINAL_OWNER_LOCAL_NOTE_TERMS_ONLY') return false;
  for (const k of ['ownerOperationRef', 'assetId', 'originalAccountLifetime', 'generationId', 'identitySHA256',
    'accountIdentitySHA256', 'termsSHA256']) if (!digest(v[k])) return false;
  if (v.generationId !== v.accountIdentitySHA256 || !exact(v.asset, ['assetId', 'symbol', 'decimals'])
    || v.asset.assetId !== v.assetId || typeof v.asset.symbol !== 'string'
    || /^[A-Z0-9]{2,12}$/.exec(v.asset.symbol)?.[0] !== v.asset.symbol
    || !Number.isInteger(v.asset.decimals) || v.asset.decimals < 0 || v.asset.decimals > 18
    || !exact(v.actionBodySHA256, ['accountPrepare', 'accountExecute', 'accountReconcile'])
    || !Object.values(v.actionBodySHA256).every(digest)) return false;
  const t = v.terms;
  if (!exact(t, ['version', 'profile', 'processIdentitySHA256', 'processGeneration', 'keyScopeSHA256',
    'originalAccountLifetime', 'generationId', 'request', 'kind', 'ownerKind', 'ownerIdentitySHA256',
    'accountIdentitySHA256', 'asset', 'epoch', 'amount', 'recipient', 'role', 'noteStatus', 'observed', 'effect',
    'fundingApproval', 'registration', 'spending']) || t.version !== 1 || t.profile !== 'NATIVE_VALUE_OWNER_NOTE_REVIEW_V1'
    || !exact(t.request, ['requestId', 'kind', 'ownerOperationRef', 'assetId'])
    || !Object.keys(t.request).every(k => t.request[k] === v[k]) || t.kind !== v.kind
    || t.ownerIdentitySHA256 !== v.identitySHA256 || t.accountIdentitySHA256 !== v.accountIdentitySHA256
    || t.originalAccountLifetime !== v.originalAccountLifetime || t.generationId !== v.generationId
    || !digest(t.processIdentitySHA256) || !digest(t.keyScopeSHA256)
    || !Number.isSafeInteger(t.processGeneration) || t.processGeneration < 1
    || !uint(t.amount) || t.amount === '0' || !uint(t.epoch) || !address(t.recipient) || t.recipient === '0'.repeat(40)
    || !exact(t.observed, ['blockHash', 'timestamp']) || !digest(t.observed.blockHash) || !uint(t.observed.timestamp)
    || String(BigInt(t.observed.timestamp) / 600n) !== t.epoch) return false;
  if (!exact(t.asset, ['assetId', 'kind', 'symbol', 'decimals', 'chainId', 'genesis', 'pool', 'scope', 'policy',
    'token', 'codeHash', 'assetIdentity', 'custody', 'trust'])
    || !['NATIVE', 'ERC20'].includes(t.asset.kind) || t.asset.assetId !== v.assetId
    || t.asset.symbol !== v.asset.symbol || t.asset.decimals !== v.asset.decimals
    || !uint(t.asset.chainId) || t.asset.chainId === '0' || !address(t.asset.pool) || t.asset.pool === t.recipient
    || !address(t.asset.token) || !['assetId', 'genesis', 'scope', 'policy', 'codeHash', 'assetIdentity'].every(k => digest(t.asset[k]))
    || t.asset.custody !== 'ONCHAIN_NOTE_POOL' || t.asset.trust !== 'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER') return false;
  const deposit = t.kind === 'TOP_UP';
  return (deposit ? t.role === null && t.noteStatus === null && t.ownerKind === 'deposit'
    : ['source', 'change', 'recovery'].includes(t.role) && t.ownerKind === 'withdraw_' + t.role
      && ['AVAILABLE', 'LOCKED'].includes(t.noteStatus))
    && t.effect === (deposit ? 'CREATE_ORIGINAL_PRIVATE_DEPOSIT_PREPARATION' : 'LOCK_ORIGINAL_NOTE_FOR_FULL_WITHDRAWAL_PREPARATION')
    && t.fundingApproval === 'EXISTING_EXACT_TOKEN_ALLOWANCE_REQUIRED_WHEN_APPLICABLE'
    && t.registration === 'ORIGINAL_NATIVE_VALUE_AUTHORITY_OWNER_LOCAL_NOTE_PREPARATION'
    && t.spending === 'SEPARATE_ACCOUNT_PREPARE_AND_EXECUTE_REVIEW_REQUIRED';
}
