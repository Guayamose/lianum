/** Controller permission V2. It never signs a note/frame, authorizes execution,
 * adopts an account, or turns journal state into an economic observation. */
import { normalizeMobileOrigin } from './authorization.mjs';
/** @typedef {import('./authorization.mjs').OriginOptions} OriginOptions */
/** @typedef {import('./original-account-review-v2.mjs').OriginalAccountBindingV2} OriginalAccountBindingV2 */
/** @typedef {import('./original-account-review-v2.mjs').OriginalAccountAccessV2} OriginalAccountAccessV2 */
/** @typedef {import('./original-account-review-v2.mjs').OriginalAccountReviewV2} OriginalAccountReviewV2 */
export const ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2 = 'LIANUM_ORIGINAL_ACCOUNT_ACCESS_V2';
export const ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2 = 'LIANUM_ORIGINAL_ACCOUNT_REVIEW_V2';
export const ORIGINAL_ACCOUNT_REVIEW_TTL_MS = 60_000;
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
/** @param {string} code @returns {never} */
const fail = code => { throw Object.assign(new Error(code), { code }); };
/** @type {(value: unknown, code: string) => asserts value} */
const need = (value, code) => { if (!value) fail(code); };
/** @param {unknown} value @param {RegExp} pattern @returns {value is string} */
const match = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
/** @param {unknown} value @param {number} [length] @returns {value is string} */
const hex = (value, length = 64) => match(value, new RegExp('^[0-9a-f]{' + length + '}$'));
/** @param {unknown} value @param {boolean} [positive] @returns {value is string} */
const uint = (value, positive = false) => match(value, /^(0|[1-9][0-9]{0,19})$/)
  && BigInt(value) < (1n << 64n) && (!positive || BigInt(value) > 0n);
/** @template T @param {T} value @returns {Readonly<T>} */
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
/** @param {unknown} raw @param {readonly string[]} fields @returns {Record<string, unknown>} */
function exact(raw, fields) {
  need(typeof raw === 'object' && raw !== null && Object.getPrototypeOf(raw) === Object.prototype, 'MOBILE_ORIGINAL_EXACT_FIELDS');
  const keys = Reflect.ownKeys(raw);
  need(keys.length === fields.length && keys.every(key => fields.some(field => field === key)), 'MOBILE_ORIGINAL_EXACT_FIELDS');
  return Object.fromEntries(fields.map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    need(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 'MOBILE_ORIGINAL_DATA_FIELDS');
    return [key, descriptor.value];
  }));
}
/** @template {string} T @param {unknown} value @param {readonly T[]} choices @returns {value is T} */
const oneOf = (value, choices) => choices.some(choice => choice === value);
/** @template {string} K @param {Record<string, unknown>} value @param {readonly K[]} fields @param {string} code @returns {Record<K, string>} */
function digests(value, fields, code) {
  return /** @type {Record<K, string>} */ (Object.fromEntries(fields.map(key => {
    const digest = value[key]; need(hex(digest), code); return [key, digest];
  })));
}
/** @template {string} P @param {unknown} raw @param {P} profile @param {readonly string[]} fields @param {OriginOptions} options */
function envelope(raw, profile, fields, options) {
  const value = exact(raw, fields);
  need(value.version === 2 && value.profile === profile, 'MOBILE_ORIGINAL_PROFILE');
  const origin = normalizeMobileOrigin(value.origin, options);
  const identities = digests(value, ['pairingId', 'challengeId', 'nonce'], 'MOBILE_ORIGINAL_NONCE');
  need(new Set([value.pairingId, value.challengeId, value.nonce]).size === 3, 'MOBILE_ORIGINAL_NONCE');
  need(typeof value.expiresAt === 'number' && Number.isSafeInteger(value.expiresAt) && value.expiresAt > 0, 'MOBILE_ORIGINAL_EXPIRY');
  need(match(value.devicePublicKey, /^04[0-9a-f]{128}$/), 'MOBILE_ORIGINAL_PUBLIC_KEY');
  need(oneOf(value.action, /** @type {const} */ (['read', 'reconcile'])), 'MOBILE_ORIGINAL_ACTION');
  return Object.assign(value, identities, {version: /** @type {const} */ (2), profile, origin,
    expiresAt: value.expiresAt, devicePublicKey: value.devicePublicKey, action: value.action});
}
/** Public selectors/nonce only. No account, request, review or private terms. */
/** @param {unknown} raw @param {OriginOptions} [options] @returns {OriginalAccountAccessV2} */
export function normalizeOriginalAccountAccessV2(raw, options = {}) {
  return freeze(envelope(raw, ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2,
    ['version', 'profile', 'origin', 'pairingId', 'challengeId', 'nonce', 'expiresAt', 'devicePublicKey', 'action'], options));
}
/** @param {unknown} raw @returns {OriginalAccountBindingV2} */
export function normalizeOriginalAccountBindingV2(raw) {
  const binding = exact(raw, ['accountIdentitySHA256', 'originalAccountLifetime', 'generationId', 'requestId', 'kind',
    'ownerOperationRef', 'assetId', 'ownerIdentitySHA256', 'keyScopeSHA256', 'processIdentitySHA256',
    'originalProcessGeneration', 'observedProcessGeneration', 'originalReviewSHA256', 'termsSHA256',
    'requestBindingSHA256', 'assetBindingSHA256', 'journalRevision', 'requestState', 'authorityStage',
    'submission', 'asset', 'amountAtomic', 'recipient', 'role', 'custody', 'publicNetwork', 'mobileNoteCustody', 'economicObservation']);
  const identities = digests(binding, ['accountIdentitySHA256', 'originalAccountLifetime', 'generationId', 'ownerOperationRef', 'assetId',
    'ownerIdentitySHA256', 'keyScopeSHA256', 'processIdentitySHA256', 'originalReviewSHA256', 'termsSHA256',
    'requestBindingSHA256', 'assetBindingSHA256'], 'MOBILE_ORIGINAL_BINDING');
  need(match(binding.requestId, /^[A-Za-z0-9_-]{8,100}$/) && oneOf(binding.kind, /** @type {const} */ (['TOP_UP', 'EXIT'])), 'MOBILE_ORIGINAL_REQUEST');
  need(typeof binding.originalProcessGeneration === 'number' && Number.isSafeInteger(binding.originalProcessGeneration) && binding.originalProcessGeneration > 0
    && typeof binding.observedProcessGeneration === 'number' && Number.isSafeInteger(binding.observedProcessGeneration) && binding.observedProcessGeneration >= binding.originalProcessGeneration,
  'MOBILE_ORIGINAL_GENERATION');
  need(typeof binding.journalRevision === 'number' && Number.isSafeInteger(binding.journalRevision) && binding.journalRevision >= 0, 'MOBILE_ORIGINAL_JOURNAL');
  need(oneOf(binding.requestState, /** @type {const} */ (['PREPARED', 'UNKNOWN', 'CONFIRMED']))
    && oneOf(binding.authorityStage, /** @type {const} */ (['READY', 'UNKNOWN', 'CONFIRMED'])), 'MOBILE_ORIGINAL_STAGE');
  /** @type {OriginalAccountBindingV2['submission']} */
  let submission = null;
  if (binding.submission !== null) {
    const frame = exact(binding.submission, ['transactionHash', 'calldataSHA256', 'dispatchLatched']);
    need(hex(frame.transactionHash) && hex(frame.calldataSHA256)
      && frame.dispatchLatched === true, 'MOBILE_ORIGINAL_SUBMISSION');
    submission = {transactionHash: frame.transactionHash, calldataSHA256: frame.calldataSHA256, dispatchLatched: frame.dispatchLatched};
  }
  const asset = exact(binding.asset, ['chainId', 'genesis', 'pool', 'kind', 'token', 'symbol', 'decimals']);
  need(uint(asset.chainId, true) && hex(asset.genesis) && hex(asset.pool, 40)
    && oneOf(asset.kind, /** @type {const} */ (['NATIVE', 'ERC20'])) && hex(asset.token, 40)
    && match(asset.symbol, /^[A-Z0-9]{2,12}$/) && typeof asset.decimals === 'number' && Number.isInteger(asset.decimals)
    && asset.decimals >= 0 && asset.decimals <= 18, 'MOBILE_ORIGINAL_ASSET');
  need(uint(binding.amountAtomic, true) && hex(binding.recipient, 40) && binding.recipient !== '0'.repeat(40), 'MOBILE_ORIGINAL_TERMS');
  /** @type {OriginalAccountBindingV2['role']} */
  let role;
  if (binding.kind === 'TOP_UP') { need(binding.role === null, 'MOBILE_ORIGINAL_ROLE'); role = null; }
  else { need(oneOf(binding.role, /** @type {const} */ (['source', 'change', 'recovery'])), 'MOBILE_ORIGINAL_ROLE'); role = binding.role; }
  need(binding.custody === 'LINUX_ORIGINAL_OWNER_CUSTODY' && binding.publicNetwork === false
    && binding.mobileNoteCustody === false && binding.economicObservation === false, 'MOBILE_ORIGINAL_SCOPE');
  /** @type {OriginalAccountBindingV2} */
  const validated = {...identities, requestId: binding.requestId, kind: binding.kind,
    originalProcessGeneration: binding.originalProcessGeneration, observedProcessGeneration: binding.observedProcessGeneration,
    journalRevision: binding.journalRevision, requestState: binding.requestState, authorityStage: binding.authorityStage,
    submission, asset: {chainId: asset.chainId, genesis: asset.genesis, pool: asset.pool, kind: asset.kind,
      token: asset.token, symbol: asset.symbol, decimals: asset.decimals}, amountAtomic: binding.amountAtomic,
    recipient: binding.recipient, role, custody: binding.custody, publicNetwork: binding.publicNetwork,
    mobileNoteCustody: binding.mobileNoteCustody, economicObservation: binding.economicObservation};
  // Assign into the exact-field record to retain the original signed JSON order.
  return freeze(Object.assign(binding, validated));
}
/** @param {unknown} raw @param {OriginOptions} [options] @returns {OriginalAccountReviewV2} */
export function normalizeOriginalAccountReviewV2(raw, options = {}) {
  const value = envelope(raw, ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2,
    ['version', 'profile', 'origin', 'pairingId', 'challengeId', 'nonce', 'expiresAt', 'devicePublicKey', 'action', 'bootstrapChallengeId', 'binding'], options);
  need(hex(value.bootstrapChallengeId) && ![value.challengeId, value.nonce].includes(value.bootstrapChallengeId), 'MOBILE_ORIGINAL_NONCE');
  const binding = normalizeOriginalAccountBindingV2(value.binding);
  if (value.action === 'reconcile') need(binding.submission !== null
    && ['UNKNOWN', 'CONFIRMED'].includes(binding.requestState)
    && ['UNKNOWN', 'CONFIRMED'].includes(binding.authorityStage), 'MOBILE_ORIGINAL_RECONCILE_NOT_STARTED');
  return freeze(Object.assign(value, {bootstrapChallengeId: value.bootstrapChallengeId, binding}));
}
/** @template {OriginalAccountAccessV2 | OriginalAccountReviewV2} T @param {T} value @param {number} [now] @returns {T} */
export function validateOriginalAccountFreshV2(value, now = Date.now()) {
  need(Number.isSafeInteger(now) && value.expiresAt > now
    && value.expiresAt <= now + ORIGINAL_ACCOUNT_REVIEW_TTL_MS, 'MOBILE_ORIGINAL_EXPIRED'); return value;
}
/** @param {OriginalAccountAccessV2 | OriginalAccountReviewV2} value @returns {Uint8Array} */
function message(value) {
  const text = value.profile + '\n' + JSON.stringify(value);
  need(text.length <= 4096 && /^[\x20-\x7e\n]*$/.test(text), 'MOBILE_ORIGINAL_MESSAGE_SIZE');
  return Uint8Array.from(text, character => character.charCodeAt(0));
}
/** @param {unknown} raw @param {OriginOptions} [options] */
export const originalAccountAccessMessageV2 = (raw, options = {}) => message(normalizeOriginalAccountAccessV2(raw, options));
/** @param {unknown} raw @param {OriginOptions} [options] */
export const originalAccountReviewMessageV2 = (raw, options = {}) => message(normalizeOriginalAccountReviewV2(raw, options));
/** @param {unknown} value @returns {string} */
export function normalizeOriginalAccountSignatureV2(value) {
  need(hex(value, 128), 'MOBILE_ORIGINAL_SIGNATURE_ENCODING');
  const r = BigInt('0x' + value.slice(0, 64)), s = BigInt('0x' + value.slice(64));
  need(r > 0n && r < ORDER && s > 0n && s <= ORDER / 2n, 'MOBILE_ORIGINAL_SIGNATURE_NONCANONICAL'); return value;
}
