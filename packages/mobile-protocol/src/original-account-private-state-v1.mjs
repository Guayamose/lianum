/** Private state consent for one original account/pool. A validated frame is
 * public data, never account, pairing or observation authority. Diagnostic V2
 * signatures have different message domains and cannot grant this read. */
import { normalizeOriginalAccountAccessV2, normalizeOriginalAccountReviewV2,
  normalizeOriginalAccountBindingV2 } from './original-account-review-v2.mjs';
export const PRIVATE_STATE_SCOPE_V1 = 'READ_ORIGINAL_ACCOUNT_POOL_BALANCE_ONLY';
export const PRIVATE_STATE_ACCESS_V1 = 'LIANUM_ORIGINAL_PRIVATE_STATE_ACCESS_V1';
export const PRIVATE_STATE_REVIEW_V1 = 'LIANUM_ORIGINAL_PRIVATE_STATE_REVIEW_V1';
export const PRIVATE_STATE_OBSERVATION_V1 = 'LIANUM_ORIGINAL_PRIVATE_STATE_OBSERVATION_V1';
const fail = () => { throw Object.assign(new Error('MOBILE_PRIVATE_STATE_INVALID'), { code: 'MOBILE_PRIVATE_STATE_INVALID' }); };
const need = value => { if (!value) fail(); };
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function exact(raw, fields) {
  need(raw && Object.getPrototypeOf(raw) === Object.prototype);
  const names = Reflect.ownKeys(raw);
  need(names.length === fields.length && names.every(name => fields.includes(name)));
  return Object.fromEntries(fields.map(name => { const row = Object.getOwnPropertyDescriptor(raw, name);
    need(row?.enumerable && Object.hasOwn(row, 'value')); return [name, row.value]; }));
}
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const uint = raw => typeof raw === 'string' && /^(0|[1-9][0-9]{0,77})$/.exec(raw)?.[0] === raw && BigInt(raw) < (1n << 256n);
const hex = raw => typeof raw === 'string' && /^[0-9a-f]{64}$/.exec(raw)?.[0] === raw;
function normalizeEnvelope(raw, profile, field, normalize) {
  const value = exact(raw, ['version', 'profile', 'scope', field]);
  need(value.version === 1 && value.profile === profile && value.scope === PRIVATE_STATE_SCOPE_V1);
  value[field] = normalize(value[field]); need(value[field].action === 'read'); return freeze(value);
}
export const privateStateAccessFrameV1 = challenge => normalizePrivateStateAccessV1({ version: 1,
  profile: PRIVATE_STATE_ACCESS_V1, scope: PRIVATE_STATE_SCOPE_V1, challenge });
export const privateStateReviewFrameV1 = review => normalizePrivateStateReviewV1({ version: 1,
  profile: PRIVATE_STATE_REVIEW_V1, scope: PRIVATE_STATE_SCOPE_V1, review });
export const normalizePrivateStateAccessV1 = raw => normalizeEnvelope(raw, PRIVATE_STATE_ACCESS_V1,
  'challenge', normalizeOriginalAccountAccessV2);
export const normalizePrivateStateReviewV1 = raw => normalizeEnvelope(raw, PRIVATE_STATE_REVIEW_V1,
  'review', normalizeOriginalAccountReviewV2);
function message(value) {
  const text = value.profile + '\n' + JSON.stringify(value);
  need(text.length <= 4096 && /^[\x20-\x7e\n]*$/.exec(text)?.[0] === text);
  return Uint8Array.from(text, character => character.charCodeAt(0));
}
export const privateStateAccessMessageV1 = challenge => message(privateStateAccessFrameV1(challenge));
export const privateStateReviewMessageV1 = review => message(privateStateReviewFrameV1(review));
/** Shape/freshness only. The private actor obtains these values exclusively
 * from the genuine account.ownerView(), never this normalizer or SQL. */
export function normalizePrivateStateObservationV1(raw) {
  const value = exact(raw, ['version', 'profile', 'scope', 'binding', 'status', 'asset', 'observed',
    'balances', 'backing', 'request', 'custody', 'mobileNoteCustody', 'completePortfolio']);
  need(value.version === 1 && value.profile === PRIVATE_STATE_OBSERVATION_V1 && value.scope === PRIVATE_STATE_SCOPE_V1);
  value.binding = normalizeOriginalAccountBindingV2(value.binding);
  need(['LIVE', 'STALE', 'UNAVAILABLE'].includes(value.status));
  value.asset = exact(value.asset, ['assetId', 'chainId', 'genesis', 'pool', 'kind', 'token', 'symbol', 'decimals']);
  need(same(value.asset, { assetId: value.binding.assetId, ...value.binding.asset }));
  value.request = exact(value.request, ['requestId', 'kind', 'state', 'disposition']);
  need(value.request.requestId === value.binding.requestId && value.request.kind === value.binding.kind);
  need(['CONFIRMED', 'UNRESOLVED', 'STALE'].includes(value.request.state));
  need(value.request.state === 'CONFIRMED' ? value.request.disposition === 'APPLIED' : value.request.disposition === null);
  if (value.status === 'LIVE') {
    value.observed = exact(value.observed, ['observedAt', 'blockNumber', 'blockHash', 'timestamp']);
    need(Number.isSafeInteger(value.observed.observedAt) && value.observed.observedAt > 0
      && uint(value.observed.blockNumber) && hex(value.observed.blockHash) && uint(value.observed.timestamp));
    value.balances = exact(value.balances, ['available', 'reserved', 'recovery', 'locked']);
    need(Object.values(value.balances).every(uint));
    // recovery is provenance within existing available/locked value, never an
    // additional amount to add to available when presenting a balance.
    need(BigInt(value.balances.recovery) <= BigInt(value.balances.available) + BigInt(value.balances.locked));
    value.backing = exact(value.backing, ['held', 'liabilities', 'surplus', 'deficit']);
    need(Object.values(value.backing).every(uint) && value.backing.deficit === '0'
      && BigInt(value.backing.held) >= BigInt(value.backing.liabilities)
      && BigInt(value.backing.held) - BigInt(value.backing.liabilities) === BigInt(value.backing.surplus));
    need(value.request.state !== 'STALE');
    if (value.binding.requestState === 'CONFIRMED') need(value.request.state === 'CONFIRMED');
  } else need(value.observed === null && value.balances === null && value.backing === null
    && value.request.state !== 'CONFIRMED');
  need(value.custody === 'LINUX_ORIGINAL_OWNER_CUSTODY' && value.mobileNoteCustody === false && value.completePortfolio === false);
  return freeze(value);
}
export function validatePrivateStateFreshV1(value, now = Date.now()) {
  need(Number.isSafeInteger(now));
  if (value.status === 'LIVE') need(value.observed.observedAt <= now && now - value.observed.observedAt <= 15_000);
  return value;
}
