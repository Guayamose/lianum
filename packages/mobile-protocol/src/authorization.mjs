/** Public, bounded mobile permission framing. No keys, I/O, proof authority or
 * private balances are created by this module. The backend must separately
 * consume the original challenge durably and enforce the operation's scope. */
/** @typedef {import('./authorization.mjs').OriginOptions} OriginOptions */
/** @typedef {import('./authorization.mjs').MobileIntent} MobileIntent */
/** @typedef {import('./authorization.mjs').MobileChallenge} MobileChallenge */
/** @typedef {import('./authorization.mjs').MobileAuthorization} MobileAuthorization */
/** @typedef {import('./authorization.mjs').MobileReceiptReview} MobileReceiptReview */
/** @typedef {import('./authorization.mjs').MobileReceiptRequest} MobileReceiptRequest */
/** @typedef {OriginOptions & {origin?: string, ownerPublicKey?: string, now?: number}} BindingOptions */
export const MOBILE_AUTHORIZATION_PROFILE = 'LIANUM_MOBILE_AUTHORIZATION_V1';
export const MOBILE_CHALLENGE_TTL_MS = 300_000;
export const MOBILE_AUTHORIZATION_RECEIPT_PROFILE = 'LIANUM_MOBILE_AUTHORIZATION_RECEIPT_V1';
export const MOBILE_RECEIPT_TTL_MS = 60_000;
/** @type {readonly import('./authorization.mjs').MobileChain[]} */
export const MOBILE_CHAINS = Object.freeze(['ethereum', 'base', 'arbitrum', 'bnb', 'solana', 'bitcoin', 'tron']);
/** @type {readonly import('./authorization.mjs').MobileAction[]} */
export const MOBILE_ACTIONS = Object.freeze(['prepare', 'execute', 'reconcile', 'recover']);
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
/** @param {string} code @returns {never} */
const fail = code => { throw Object.assign(new Error(code), { code }); };
/** @type {(condition: unknown, code: string) => asserts condition} */
const need = (condition, code) => { if (!condition) fail(code); };
/** @param {unknown} value @param {RegExp} pattern @returns {value is string} */
const match = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
/** @template {string} T @param {unknown} value @param {readonly T[]} choices @returns {value is T} */
const oneOf = (value, choices) => choices.some(choice => choice === value);
/** @param {unknown} value @param {readonly string[]} names @returns {Record<string, unknown>} */
function record(value, names) {
  need(typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype, 'MOBILE_EXACT_FIELDS');
  const keys = Reflect.ownKeys(value);
  need(keys.length === names.length && keys.every(key => names.some(name => name === key)), 'MOBILE_EXACT_FIELDS');
  /** @type {Record<string, unknown>} */
  const result = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    need(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 'MOBILE_DATA_FIELDS');
    result[name] = descriptor.value;
  }
  return result;
}
/** @template T @param {T} value @returns {Readonly<T>} */
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
/** @param {unknown} value @param {boolean} positive @returns {string} */
function atomic(value, positive = false) {
  need(match(value, /^(0|[1-9][0-9]{0,19})$/), 'MOBILE_ATOMIC_ENCODING');
  need(BigInt(value) < (1n << 64n) && (!positive || BigInt(value) > 0n), 'MOBILE_ATOMIC_RANGE');
  return value;
}
/** @param {unknown} value @param {OriginOptions} [options] @returns {string} */
export function normalizeMobileOrigin(value, { allowInsecureLocalhost = false } = {}) {
  need(typeof value === 'string' && value.length <= 256, 'MOBILE_ORIGIN_INVALID');
  let parsed;
  try { parsed = new URL(value); } catch { fail('MOBILE_ORIGIN_INVALID'); }
  need(parsed.origin === value && !parsed.username && !parsed.password
    && parsed.pathname === '/' && !parsed.search && !parsed.hash, 'MOBILE_ORIGIN_INVALID');
  need(parsed.protocol === 'https:' || allowInsecureLocalhost && parsed.protocol === 'http:'
    && ['127.0.0.1', 'localhost'].includes(parsed.hostname) && parsed.port !== '', 'MOBILE_ORIGIN_INVALID');
  return value;
}
/** @param {unknown} raw @returns {MobileIntent} */
export function normalizeMobileIntent(raw) {
  const intent = record(raw, ['requestId', 'action', 'kind', 'chain', 'assetId', 'amountAtomic', 'recipient', 'maxFeeAtomic']);
  need(match(intent.requestId, /^[A-Za-z0-9_-]{16,64}$/), 'MOBILE_REQUEST_ID_INVALID');
  need(oneOf(intent.action, MOBILE_ACTIONS), 'MOBILE_ACTION_INVALID');
  need(oneOf(intent.kind, /** @type {const} */ (['TOP_UP', 'EXIT'])), 'MOBILE_KIND_INVALID');
  need(oneOf(intent.chain, MOBILE_CHAINS), 'MOBILE_CHAIN_INVALID');
  need(match(intent.assetId, /^[0-9a-f]{64}$/), 'MOBILE_ASSET_ID_INVALID');
  const amountAtomic = atomic(intent.amountAtomic, true), maxFeeAtomic = atomic(intent.maxFeeAtomic);
  // Destination syntax, native identity and original operation equality remain
  // the chain/backend adapter's responsibility. This only bounds signed bytes.
  need(match(intent.recipient, /^[A-Za-z0-9._:-]{1,128}$/), 'MOBILE_RECIPIENT_INVALID');
  return freeze(Object.assign(intent, {requestId: intent.requestId, action: intent.action, kind: intent.kind,
    chain: intent.chain, assetId: intent.assetId, amountAtomic, recipient: intent.recipient, maxFeeAtomic}));
}
/** @param {unknown} raw @param {OriginOptions} [options] @returns {MobileChallenge} */
export function normalizeMobileChallenge(raw, options = {}) {
  const challenge = record(raw, ['version', 'profile', 'origin', 'challengeId', 'nonce', 'expiresAt', 'ownerPublicKey', 'intent']);
  need(challenge.version === 1 && challenge.profile === MOBILE_AUTHORIZATION_PROFILE, 'MOBILE_CHALLENGE_PROFILE');
  const origin = normalizeMobileOrigin(challenge.origin, options);
  need(match(challenge.challengeId, /^[0-9a-f]{64}$/) && match(challenge.nonce, /^[0-9a-f]{64}$/), 'MOBILE_CHALLENGE_ID_INVALID');
  need(typeof challenge.expiresAt === 'number' && Number.isSafeInteger(challenge.expiresAt) && challenge.expiresAt > 0, 'MOBILE_EXPIRY_INVALID');
  need(match(challenge.ownerPublicKey, /^04[0-9a-f]{128}$/), 'MOBILE_PUBLIC_KEY_INVALID');
  const intent = normalizeMobileIntent(challenge.intent);
  /** @type {MobileChallenge} */
  const validated = {version: challenge.version, profile: challenge.profile, origin,
    challengeId: challenge.challengeId, nonce: challenge.nonce, expiresAt: challenge.expiresAt,
    ownerPublicKey: challenge.ownerPublicKey, intent};
  return freeze(Object.assign(challenge, validated));
}
/** @param {unknown} raw @param {BindingOptions} [options] @returns {MobileChallenge} */
export function validateMobileChallenge(raw, { origin, ownerPublicKey, now = Date.now(), allowInsecureLocalhost = false } = {}) {
  const challenge = normalizeMobileChallenge(raw, { allowInsecureLocalhost });
  need(challenge.origin === normalizeMobileOrigin(origin, { allowInsecureLocalhost }), 'MOBILE_ORIGIN_BINDING');
  need(challenge.ownerPublicKey === ownerPublicKey, 'MOBILE_OWNER_BINDING');
  need(Number.isSafeInteger(now) && challenge.expiresAt > now
    && challenge.expiresAt <= now + MOBILE_CHALLENGE_TTL_MS, 'MOBILE_CHALLENGE_EXPIRED');
  return challenge;
}
/** @param {unknown} raw @param {OriginOptions} [options] @returns {Uint8Array} */
export function mobileAuthorizationMessage(raw, options = {}) {
  const challenge = normalizeMobileChallenge(raw, options);
  const text = MOBILE_AUTHORIZATION_PROFILE + '\n' + JSON.stringify(challenge);
  // Every permitted field is ASCII. Avoid Node/Buffer dependencies in Hermes.
  return Uint8Array.from(text, character => character.charCodeAt(0));
}
/** @param {unknown} raw @param {OriginOptions} [options] @returns {MobileAuthorization} */
export function normalizeMobileAuthorization(raw, options = {}) {
  const authorization = record(raw, ['challenge', 'signature']);
  const challenge = normalizeMobileChallenge(authorization.challenge, options);
  const signature = normalizeSignature(authorization.signature);
  return freeze(Object.assign(authorization, {challenge, signature}));
}
/** @param {unknown} value @returns {string} */
function normalizeSignature(value) {
  need(match(value, /^[0-9a-f]{128}$/), 'MOBILE_SIGNATURE_ENCODING');
  const r = BigInt('0x' + value.slice(0, 64));
  const s = BigInt('0x' + value.slice(64));
  need(r > 0n && r < ORDER && s > 0n && s <= ORDER / 2n, 'MOBILE_SIGNATURE_NONCANONICAL');
  return value;
}
/** Fresh permission to read one original admission receipt. An expired original
 * authorization is retained verbatim; this framing cannot authorize an effect. */
/** @param {unknown} raw @param {OriginOptions} [options] @returns {MobileReceiptReview} */
export function normalizeMobileReceiptReview(raw, options = {}) {
  const review = record(raw, ['authorization', 'nonce', 'expiresAt']);
  const authorization = normalizeMobileAuthorization(review.authorization, options);
  need(match(review.nonce, /^[0-9a-f]{64}$/), 'MOBILE_RECEIPT_NONCE_INVALID');
  need(review.nonce !== authorization.challenge.nonce
    && review.nonce !== authorization.challenge.challengeId, 'MOBILE_RECEIPT_NONCE_INVALID');
  need(typeof review.expiresAt === 'number' && Number.isSafeInteger(review.expiresAt) && review.expiresAt > 0, 'MOBILE_RECEIPT_EXPIRY_INVALID');
  return freeze(Object.assign(review, {authorization, nonce: review.nonce, expiresAt: review.expiresAt}));
}
/** @param {unknown} raw @param {BindingOptions} options @returns {MobileReceiptReview} */
export function validateMobileReceiptReview(raw, { origin, ownerPublicKey, now = Date.now(), ...options }) {
  const review = normalizeMobileReceiptReview(raw, options);
  need(review.authorization.challenge.origin === normalizeMobileOrigin(origin, options), 'MOBILE_ORIGIN_BINDING');
  need(review.authorization.challenge.ownerPublicKey === ownerPublicKey, 'MOBILE_OWNER_BINDING');
  need(Number.isSafeInteger(now) && review.expiresAt > now
    && review.expiresAt <= now + MOBILE_RECEIPT_TTL_MS, 'MOBILE_RECEIPT_EXPIRED');
  return review;
}
/** @param {unknown} raw @param {OriginOptions} [options] @returns {Uint8Array} */
export function mobileReceiptMessage(raw, options = {}) {
  const review = normalizeMobileReceiptReview(raw, options);
  const text = MOBILE_AUTHORIZATION_RECEIPT_PROFILE + '\n' + JSON.stringify(review);
  return Uint8Array.from(text, character => character.charCodeAt(0));
}
/** @param {unknown} raw @param {OriginOptions} [options] @returns {MobileReceiptRequest} */
export function normalizeMobileReceiptRequest(raw, options = {}) {
  const request = record(raw, ['authorization', 'nonce', 'expiresAt', 'signature']);
  const review = normalizeMobileReceiptReview({ authorization: request.authorization,
    nonce: request.nonce, expiresAt: request.expiresAt }, options);
  return freeze({ ...review, signature: normalizeSignature(request.signature) });
}
