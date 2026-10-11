/** Private state consent for one original account/pool. A validated frame is
 * public data, never account, pairing or observation authority. Diagnostic V2
 * signatures have different message domains and cannot grant this read. */
import { normalizeOriginalAccountAccessV2, normalizeOriginalAccountReviewV2,
  normalizeOriginalAccountBindingV2 } from './original-account-review-contract-v2.mjs';
/** @typedef {import('./original-account-review-v2.mjs').OriginalAccountAccessV2} OriginalAccountAccessV2 */
/** @typedef {import('./original-account-review-v2.mjs').OriginalAccountReviewV2} OriginalAccountReviewV2 */
/** @typedef {import('./original-account-private-state-v1.mjs').OriginalPrivateStateAccessV1} OriginalPrivateStateAccessV1 */
/** @typedef {import('./original-account-private-state-v1.mjs').OriginalPrivateStateReviewV1} OriginalPrivateStateReviewV1 */
/** @typedef {import('./original-account-private-state-v1.mjs').OriginalPrivateStateObservationV1} OriginalPrivateStateObservationV1 */
export const PRIVATE_STATE_SCOPE_V1 = 'READ_ORIGINAL_ACCOUNT_POOL_BALANCE_ONLY';
export const PRIVATE_STATE_ACCESS_V1 = 'LIANUM_ORIGINAL_PRIVATE_STATE_ACCESS_V1';
export const PRIVATE_STATE_REVIEW_V1 = 'LIANUM_ORIGINAL_PRIVATE_STATE_REVIEW_V1';
export const PRIVATE_STATE_OBSERVATION_V1 = 'LIANUM_ORIGINAL_PRIVATE_STATE_OBSERVATION_V1';
/** @returns {never} */
const fail = () => { throw Object.assign(new Error('MOBILE_PRIVATE_STATE_INVALID'), { code: 'MOBILE_PRIVATE_STATE_INVALID' }); };
/** @type {(value: unknown) => asserts value} */
const need = value => { if (!value) fail(); };
/** @template T @param {T} value @returns {Readonly<T>} */
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
/** @param {unknown} raw @param {readonly string[]} fields @returns {Record<string, unknown>} */
function exact(raw, fields) {
  need(typeof raw === 'object' && raw !== null && Object.getPrototypeOf(raw) === Object.prototype);
  const names = Reflect.ownKeys(raw);
  need(names.length === fields.length && names.every(name => fields.some(field => field === name)));
  return Object.fromEntries(fields.map(name => { const row = Object.getOwnPropertyDescriptor(raw, name);
    need(row?.enumerable && Object.hasOwn(row, 'value')); return [name, row.value]; }));
}
/** @param {unknown} left @param {unknown} right */
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
/** @param {unknown} raw @returns {raw is string} */
const uint = raw => typeof raw === 'string' && /^(0|[1-9][0-9]{0,77})$/.exec(raw)?.[0] === raw && BigInt(raw) < (1n << 256n);
/** @param {unknown} raw @returns {raw is string} */
const hex = raw => typeof raw === 'string' && /^[0-9a-f]{64}$/.exec(raw)?.[0] === raw;
/** @template {string} T @param {unknown} value @param {readonly T[]} choices @returns {value is T} */
const oneOf = (value, choices) => choices.some(choice => choice === value);
/** @template {string} K @param {unknown} raw @param {readonly K[]} fields @returns {Record<K, string>} */
function amounts(raw, fields) {
  const values = exact(raw, fields);
  return /** @type {Record<K, string>} */ (Object.fromEntries(fields.map(key => {
    const amount = values[key]; need(uint(amount)); return [key, amount];
  })));
}
/** @template {string} P @template {'challenge' | 'review'} K
 * @template {OriginalAccountAccessV2 | OriginalAccountReviewV2} V
 * @param {unknown} raw @param {P} profile @param {K} field @param {(raw: unknown) => V} normalize */
function normalizeEnvelope(raw, profile, field, normalize) {
  const value = exact(raw, ['version', 'profile', 'scope', field]);
  need(value.version === 1 && value.profile === profile && value.scope === PRIVATE_STATE_SCOPE_V1);
  const normalized = normalize(value[field]); need(normalized.action === 'read');
  const content = /** @type {Record<K, V>} */ ({[field]: normalized});
  const header = /** @type {const} */ ({version: 1, profile, scope: PRIVATE_STATE_SCOPE_V1});
  return freeze(Object.assign(value, header, content));
}
/** @param {unknown} challenge @returns {OriginalPrivateStateAccessV1} */
export const privateStateAccessFrameV1 = challenge => normalizePrivateStateAccessV1({ version: 1,
  profile: PRIVATE_STATE_ACCESS_V1, scope: PRIVATE_STATE_SCOPE_V1, challenge });
/** @param {unknown} review @returns {OriginalPrivateStateReviewV1} */
export const privateStateReviewFrameV1 = review => normalizePrivateStateReviewV1({ version: 1,
  profile: PRIVATE_STATE_REVIEW_V1, scope: PRIVATE_STATE_SCOPE_V1, review });
/** @param {unknown} raw @returns {OriginalPrivateStateAccessV1} */
export const normalizePrivateStateAccessV1 = raw => normalizeEnvelope(raw, PRIVATE_STATE_ACCESS_V1,
  'challenge', normalizeOriginalAccountAccessV2);
/** @param {unknown} raw @returns {OriginalPrivateStateReviewV1} */
export const normalizePrivateStateReviewV1 = raw => normalizeEnvelope(raw, PRIVATE_STATE_REVIEW_V1,
  'review', normalizeOriginalAccountReviewV2);
/** @param {OriginalPrivateStateAccessV1 | OriginalPrivateStateReviewV1} value */
function message(value) {
  const text = value.profile + '\n' + JSON.stringify(value);
  need(text.length <= 4096 && /^[\x20-\x7e\n]*$/.exec(text)?.[0] === text);
  return Uint8Array.from(text, character => character.charCodeAt(0));
}
/** @param {unknown} challenge @returns {Uint8Array} */
export const privateStateAccessMessageV1 = challenge => message(privateStateAccessFrameV1(challenge));
/** @param {unknown} review @returns {Uint8Array} */
export const privateStateReviewMessageV1 = review => message(privateStateReviewFrameV1(review));
/** Shape/freshness only. The private actor obtains these values exclusively
 * from the genuine account.ownerView(), never this normalizer or SQL. */
/** @param {unknown} raw @returns {OriginalPrivateStateObservationV1} */
export function normalizePrivateStateObservationV1(raw) {
  const value = exact(raw, ['version', 'profile', 'scope', 'binding', 'status', 'asset', 'observed',
    'balances', 'backing', 'request', 'custody', 'mobileNoteCustody', 'completePortfolio']);
  need(value.version === 1 && value.profile === PRIVATE_STATE_OBSERVATION_V1 && value.scope === PRIVATE_STATE_SCOPE_V1);
  const binding = normalizeOriginalAccountBindingV2(value.binding);
  need(oneOf(value.status, /** @type {const} */ (['LIVE', 'STALE', 'UNAVAILABLE'])));
  const asset = exact(value.asset, ['assetId', 'chainId', 'genesis', 'pool', 'kind', 'token', 'symbol', 'decimals']);
  need(same(asset, { assetId: binding.assetId, ...binding.asset }));
  const request = exact(value.request, ['requestId', 'kind', 'state', 'disposition']);
  need(request.requestId === binding.requestId && request.kind === binding.kind);
  need(oneOf(request.state, /** @type {const} */ (['CONFIRMED', 'UNRESOLVED', 'STALE'])));
  /** @type {'APPLIED' | null} */
  let disposition;
  if (request.state === 'CONFIRMED') { need(request.disposition === 'APPLIED'); disposition = request.disposition; }
  else { need(request.disposition === null); disposition = null; }
  /** @type {OriginalPrivateStateObservationV1['observed']} */
  let observed = null;
  /** @type {OriginalPrivateStateObservationV1['balances']} */
  let balances = null;
  /** @type {OriginalPrivateStateObservationV1['backing']} */
  let backing = null;
  if (value.status === 'LIVE') {
    const frame = exact(value.observed, ['observedAt', 'blockNumber', 'blockHash', 'timestamp']);
    need(typeof frame.observedAt === 'number' && Number.isSafeInteger(frame.observedAt) && frame.observedAt > 0
      && uint(frame.blockNumber) && hex(frame.blockHash) && uint(frame.timestamp));
    observed = {observedAt: frame.observedAt, blockNumber: frame.blockNumber, blockHash: frame.blockHash, timestamp: frame.timestamp};
    balances = amounts(value.balances, ['available', 'reserved', 'recovery', 'locked']);
    // recovery is provenance within existing available/locked value, never an
    // additional amount to add to available when presenting a balance.
    need(BigInt(balances.recovery) <= BigInt(balances.available) + BigInt(balances.locked));
    backing = amounts(value.backing, ['held', 'liabilities', 'surplus', 'deficit']);
    need(backing.deficit === '0'
      && BigInt(backing.held) >= BigInt(backing.liabilities)
      && BigInt(backing.held) - BigInt(backing.liabilities) === BigInt(backing.surplus));
    need(request.state !== 'STALE');
    if (binding.requestState === 'CONFIRMED') need(request.state === 'CONFIRMED');
  } else need(value.observed === null && value.balances === null && value.backing === null
    && request.state !== 'CONFIRMED');
  need(value.custody === 'LINUX_ORIGINAL_OWNER_CUSTODY' && value.mobileNoteCustody === false && value.completePortfolio === false);
  /** @type {OriginalPrivateStateObservationV1} */
  const validated = {version: value.version, profile: value.profile, scope: value.scope, binding,
    status: value.status, asset: {assetId: binding.assetId, ...binding.asset}, observed, balances, backing,
    request: {requestId: request.requestId, kind: binding.kind, state: request.state, disposition},
    custody: value.custody, mobileNoteCustody: value.mobileNoteCustody, completePortfolio: value.completePortfolio};
  return freeze(Object.assign(value, validated));
}
/** @param {OriginalPrivateStateObservationV1} value @param {number} [now] @returns {OriginalPrivateStateObservationV1} */
export function validatePrivateStateFreshV1(value, now = Date.now()) {
  need(Number.isSafeInteger(now));
  if (value.status === 'LIVE') { need(value.observed); need(value.observed.observedAt <= now && now - value.observed.observedAt <= 15_000); }
  return value;
}
