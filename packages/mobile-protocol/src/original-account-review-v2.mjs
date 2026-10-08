/** Controller permission V2. It never signs a note/frame, authorizes execution,
 * adopts an account, or turns journal state into an economic observation. */
import { normalizeMobileOrigin } from './authorization.mjs';
export const ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2 = 'LIANUM_ORIGINAL_ACCOUNT_ACCESS_V2';
export const ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2 = 'LIANUM_ORIGINAL_ACCOUNT_REVIEW_V2';
export const ORIGINAL_ACCOUNT_REVIEW_TTL_MS = 60_000;
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (value, code) => { if (!value) fail(code); };
const match = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
const hex = (value, length = 64) => match(value, new RegExp('^[0-9a-f]{' + length + '}$'));
const uint = (value, positive = false) => match(value, /^(0|[1-9][0-9]{0,19})$/)
  && BigInt(value) < (1n << 64n) && (!positive || BigInt(value) > 0n);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function exact(raw, fields) {
  need(raw && Object.getPrototypeOf(raw) === Object.prototype, 'MOBILE_ORIGINAL_EXACT_FIELDS');
  const keys = Reflect.ownKeys(raw);
  need(keys.length === fields.length && keys.every(key => fields.includes(key)), 'MOBILE_ORIGINAL_EXACT_FIELDS');
  return Object.fromEntries(fields.map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    need(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 'MOBILE_ORIGINAL_DATA_FIELDS');
    return [key, descriptor.value];
  }));
}
const deviceKey = value => need(match(value, /^04[0-9a-f]{128}$/), 'MOBILE_ORIGINAL_PUBLIC_KEY');
const action = value => need(['read', 'reconcile'].includes(value), 'MOBILE_ORIGINAL_ACTION');
function envelope(raw, profile, fields, options) {
  const value = exact(raw, fields);
  need(value.version === 2 && value.profile === profile, 'MOBILE_ORIGINAL_PROFILE');
  normalizeMobileOrigin(value.origin, options);
  for (const key of ['pairingId', 'challengeId', 'nonce']) need(hex(value[key]), 'MOBILE_ORIGINAL_NONCE');
  need(new Set([value.pairingId, value.challengeId, value.nonce]).size === 3, 'MOBILE_ORIGINAL_NONCE');
  need(Number.isSafeInteger(value.expiresAt) && value.expiresAt > 0, 'MOBILE_ORIGINAL_EXPIRY');
  deviceKey(value.devicePublicKey); action(value.action); return value;
}
/** Public selectors/nonce only. No account, request, review or private terms. */
export function normalizeOriginalAccountAccessV2(raw, options = {}) {
  return freeze(envelope(raw, ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2,
    ['version', 'profile', 'origin', 'pairingId', 'challengeId', 'nonce', 'expiresAt', 'devicePublicKey', 'action'], options));
}
export function normalizeOriginalAccountBindingV2(raw) {
  const binding = exact(raw, ['accountIdentitySHA256', 'originalAccountLifetime', 'generationId', 'requestId', 'kind',
    'ownerOperationRef', 'assetId', 'ownerIdentitySHA256', 'keyScopeSHA256', 'processIdentitySHA256',
    'originalProcessGeneration', 'observedProcessGeneration', 'originalReviewSHA256', 'termsSHA256',
    'requestBindingSHA256', 'assetBindingSHA256', 'journalRevision', 'requestState', 'authorityStage',
    'submission', 'asset', 'amountAtomic', 'recipient', 'role', 'custody', 'publicNetwork', 'mobileNoteCustody', 'economicObservation']);
  for (const key of ['accountIdentitySHA256', 'originalAccountLifetime', 'generationId', 'ownerOperationRef', 'assetId',
    'ownerIdentitySHA256', 'keyScopeSHA256', 'processIdentitySHA256', 'originalReviewSHA256', 'termsSHA256',
    'requestBindingSHA256', 'assetBindingSHA256']) need(hex(binding[key]), 'MOBILE_ORIGINAL_BINDING');
  need(match(binding.requestId, /^[A-Za-z0-9_-]{8,100}$/) && ['TOP_UP', 'EXIT'].includes(binding.kind), 'MOBILE_ORIGINAL_REQUEST');
  need(Number.isSafeInteger(binding.originalProcessGeneration) && binding.originalProcessGeneration > 0
    && Number.isSafeInteger(binding.observedProcessGeneration) && binding.observedProcessGeneration >= binding.originalProcessGeneration,
  'MOBILE_ORIGINAL_GENERATION');
  need(Number.isSafeInteger(binding.journalRevision) && binding.journalRevision >= 0, 'MOBILE_ORIGINAL_JOURNAL');
  need(['PREPARED', 'UNKNOWN', 'CONFIRMED'].includes(binding.requestState)
    && ['READY', 'UNKNOWN', 'CONFIRMED'].includes(binding.authorityStage), 'MOBILE_ORIGINAL_STAGE');
  if (binding.submission !== null) {
    binding.submission = exact(binding.submission, ['transactionHash', 'calldataSHA256', 'dispatchLatched']);
    need(hex(binding.submission.transactionHash) && hex(binding.submission.calldataSHA256)
      && binding.submission.dispatchLatched === true, 'MOBILE_ORIGINAL_SUBMISSION');
  }
  binding.asset = exact(binding.asset, ['chainId', 'genesis', 'pool', 'kind', 'token', 'symbol', 'decimals']);
  need(uint(binding.asset.chainId, true) && hex(binding.asset.genesis) && hex(binding.asset.pool, 40)
    && ['NATIVE', 'ERC20'].includes(binding.asset.kind) && hex(binding.asset.token, 40)
    && match(binding.asset.symbol, /^[A-Z0-9]{2,12}$/) && Number.isInteger(binding.asset.decimals)
    && binding.asset.decimals >= 0 && binding.asset.decimals <= 18, 'MOBILE_ORIGINAL_ASSET');
  need(uint(binding.amountAtomic, true) && hex(binding.recipient, 40) && binding.recipient !== '0'.repeat(40), 'MOBILE_ORIGINAL_TERMS');
  need(binding.kind === 'TOP_UP' ? binding.role === null : ['source', 'change', 'recovery'].includes(binding.role), 'MOBILE_ORIGINAL_ROLE');
  need(binding.custody === 'LINUX_ORIGINAL_OWNER_CUSTODY' && binding.publicNetwork === false
    && binding.mobileNoteCustody === false && binding.economicObservation === false, 'MOBILE_ORIGINAL_SCOPE');
  return freeze(binding);
}
export function normalizeOriginalAccountReviewV2(raw, options = {}) {
  const value = envelope(raw, ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2,
    ['version', 'profile', 'origin', 'pairingId', 'challengeId', 'nonce', 'expiresAt', 'devicePublicKey', 'action', 'bootstrapChallengeId', 'binding'], options);
  need(hex(value.bootstrapChallengeId) && ![value.challengeId, value.nonce].includes(value.bootstrapChallengeId), 'MOBILE_ORIGINAL_NONCE');
  value.binding = normalizeOriginalAccountBindingV2(value.binding);
  if (value.action === 'reconcile') need(value.binding.submission !== null
    && ['UNKNOWN', 'CONFIRMED'].includes(value.binding.requestState)
    && ['UNKNOWN', 'CONFIRMED'].includes(value.binding.authorityStage), 'MOBILE_ORIGINAL_RECONCILE_NOT_STARTED');
  return freeze(value);
}
export function validateOriginalAccountFreshV2(value, now = Date.now()) {
  need(Number.isSafeInteger(now) && value.expiresAt > now
    && value.expiresAt <= now + ORIGINAL_ACCOUNT_REVIEW_TTL_MS, 'MOBILE_ORIGINAL_EXPIRED'); return value;
}
function message(value) {
  const text = value.profile + '\n' + JSON.stringify(value);
  need(text.length <= 4096 && /^[\x20-\x7e\n]*$/.test(text), 'MOBILE_ORIGINAL_MESSAGE_SIZE');
  return Uint8Array.from(text, character => character.charCodeAt(0));
}
export const originalAccountAccessMessageV2 = (raw, options = {}) => message(normalizeOriginalAccountAccessV2(raw, options));
export const originalAccountReviewMessageV2 = (raw, options = {}) => message(normalizeOriginalAccountReviewV2(raw, options));
export function normalizeOriginalAccountSignatureV2(value) {
  need(hex(value, 128), 'MOBILE_ORIGINAL_SIGNATURE_ENCODING');
  const r = BigInt('0x' + value.slice(0, 64)), s = BigInt('0x' + value.slice(64));
  need(r > 0n && r < ORDER && s > 0n && s <= ORDER / 2n, 'MOBILE_ORIGINAL_SIGNATURE_NONCANONICAL'); return value;
}

// Separate consent domains; existing V2 diagnostics remain unchanged.
export * from './original-account-private-state-v1.mjs';
