/** Public, bounded mobile permission framing. No keys, I/O, proof authority or
 * private balances are created by this module. The backend must separately
 * consume the original challenge durably and enforce the operation's scope. */
export const MOBILE_AUTHORIZATION_PROFILE = 'LIANUM_MOBILE_AUTHORIZATION_V1';
export const MOBILE_CHALLENGE_TTL_MS = 300_000;
export const MOBILE_CHAINS = Object.freeze(['ethereum', 'base', 'arbitrum', 'bnb', 'solana', 'bitcoin', 'tron']);
export const MOBILE_ACTIONS = Object.freeze(['prepare', 'execute', 'reconcile', 'recover']);
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (condition, code) => { if (!condition) fail(code); };
const match = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
function record(value, names) {
  need(value && Object.getPrototypeOf(value) === Object.prototype, 'MOBILE_EXACT_FIELDS');
  const keys = Reflect.ownKeys(value);
  need(keys.length === names.length && keys.every(key => names.includes(key)), 'MOBILE_EXACT_FIELDS');
  const result = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    need(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 'MOBILE_DATA_FIELDS');
    result[name] = descriptor.value;
  }
  return result;
}
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
function atomic(value, positive = false) {
  need(match(value, /^(0|[1-9][0-9]{0,19})$/), 'MOBILE_ATOMIC_ENCODING');
  need(BigInt(value) < (1n << 64n) && (!positive || BigInt(value) > 0n), 'MOBILE_ATOMIC_RANGE');
  return value;
}
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
export function normalizeMobileIntent(raw) {
  const intent = record(raw, ['requestId', 'action', 'kind', 'chain', 'assetId', 'amountAtomic', 'recipient', 'maxFeeAtomic']);
  need(match(intent.requestId, /^[A-Za-z0-9_-]{16,64}$/), 'MOBILE_REQUEST_ID_INVALID');
  need(MOBILE_ACTIONS.includes(intent.action), 'MOBILE_ACTION_INVALID');
  need(['TOP_UP', 'EXIT'].includes(intent.kind), 'MOBILE_KIND_INVALID');
  need(MOBILE_CHAINS.includes(intent.chain), 'MOBILE_CHAIN_INVALID');
  need(match(intent.assetId, /^[0-9a-f]{64}$/), 'MOBILE_ASSET_ID_INVALID');
  atomic(intent.amountAtomic, true); atomic(intent.maxFeeAtomic);
  // Destination syntax, native identity and original operation equality remain
  // the chain/backend adapter's responsibility. This only bounds signed bytes.
  need(match(intent.recipient, /^[A-Za-z0-9._:-]{1,128}$/), 'MOBILE_RECIPIENT_INVALID');
  return freeze(intent);
}
export function normalizeMobileChallenge(raw, options = {}) {
  const challenge = record(raw, ['version', 'profile', 'origin', 'challengeId', 'nonce', 'expiresAt', 'ownerPublicKey', 'intent']);
  need(challenge.version === 1 && challenge.profile === MOBILE_AUTHORIZATION_PROFILE, 'MOBILE_CHALLENGE_PROFILE');
  normalizeMobileOrigin(challenge.origin, options);
  need(match(challenge.challengeId, /^[0-9a-f]{64}$/) && match(challenge.nonce, /^[0-9a-f]{64}$/), 'MOBILE_CHALLENGE_ID_INVALID');
  need(Number.isSafeInteger(challenge.expiresAt) && challenge.expiresAt > 0, 'MOBILE_EXPIRY_INVALID');
  need(match(challenge.ownerPublicKey, /^04[0-9a-f]{128}$/), 'MOBILE_PUBLIC_KEY_INVALID');
  challenge.intent = normalizeMobileIntent(challenge.intent);
  return freeze(challenge);
}
export function validateMobileChallenge(raw, { origin, ownerPublicKey, now = Date.now(), allowInsecureLocalhost = false } = {}) {
  const challenge = normalizeMobileChallenge(raw, { allowInsecureLocalhost });
  need(challenge.origin === normalizeMobileOrigin(origin, { allowInsecureLocalhost }), 'MOBILE_ORIGIN_BINDING');
  need(challenge.ownerPublicKey === ownerPublicKey, 'MOBILE_OWNER_BINDING');
  need(Number.isSafeInteger(now) && challenge.expiresAt > now
    && challenge.expiresAt <= now + MOBILE_CHALLENGE_TTL_MS, 'MOBILE_CHALLENGE_EXPIRED');
  return challenge;
}
export function mobileAuthorizationMessage(raw, options = {}) {
  const challenge = normalizeMobileChallenge(raw, options);
  const text = MOBILE_AUTHORIZATION_PROFILE + '\n' + JSON.stringify(challenge);
  // Every permitted field is ASCII. Avoid Node/Buffer dependencies in Hermes.
  return Uint8Array.from(text, character => character.charCodeAt(0));
}
export function normalizeMobileAuthorization(raw, options = {}) {
  const authorization = record(raw, ['challenge', 'signature']);
  authorization.challenge = normalizeMobileChallenge(authorization.challenge, options);
  need(match(authorization.signature, /^[0-9a-f]{128}$/), 'MOBILE_SIGNATURE_ENCODING');
  const r = BigInt('0x' + authorization.signature.slice(0, 64));
  const s = BigInt('0x' + authorization.signature.slice(64));
  need(r > 0n && r < ORDER && s > 0n && s <= ORDER / 2n, 'MOBILE_SIGNATURE_NONCANONICAL');
  return freeze(authorization);
}
