/** Two separate, revocable consents: disclose the paired original review, then
 * read/reconcile that already-admitted request. Never changes the economic
 * outbox or establishes balances. Native signing stays in the device adapter. */
import { normalizeMobileOrigin } from '@lianum/mobile-protocol';
import { normalizeOriginalAccountAccessV2, normalizeOriginalAccountReviewV2,
  normalizeOriginalAccountSignatureV2, validateOriginalAccountFreshV2 }
  from '@lianum/mobile-protocol/original-account-v2';
const fail = code => { throw new Error(code); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function createOriginalAccountLeaseV2({ readContext, now = Date.now } = {}) {
  if (typeof readContext !== 'function' || typeof now !== 'function') fail('MOBILE_REVIEW_CONFIGURATION');
  const tickets = new WeakMap(), leases = new WeakMap();
  let epoch = 0, current = null;
  const opaque = () => Object.freeze(Object.defineProperty(Object.create(null), 'toJSON', {
    value() { fail('MOBILE_REVIEW_NOT_SERIALIZABLE'); },
  }));
  function context() {
    const raw = readContext();
    if (!raw || raw.foreground !== true || !['read', 'reconcile'].includes(raw.action)
      || typeof raw.pairingId !== 'string' || !/^[0-9a-f]{64}$/.test(raw.pairingId)
      || typeof raw.devicePublicKey !== 'string' || !/^04[0-9a-f]{128}$/.test(raw.devicePublicKey)) {
      fail('MOBILE_REVIEW_STALE');
    }
    return { origin: normalizeMobileOrigin(raw.origin), pairingId: raw.pairingId,
      devicePublicKey: raw.devicePublicKey, action: raw.action };
  }
  function scoped(value, scope) {
    if (!same(context(), scope) || Object.keys(scope).some(name => value[name] !== scope[name])) {
      fail('MOBILE_REVIEW_CHANGED');
    }
    validateOriginalAccountFreshV2(value, now());
    return value;
  }
  function invalidate() { epoch++; current = null; }
  function active(lease, phase) {
    const row = leases.get(lease);
    if (!row || row !== current || row.epoch !== epoch || row.phase !== phase) fail('MOBILE_REVIEW_INACTIVE');
    scoped(row.value, row.scope); return row;
  }
  function issue(value, scope, phase) {
    const lease = opaque();
    current = { epoch, scope, value, phase }; leases.set(lease, current);
    return Object.freeze({ lease, value });
  }
  async function perform(lease, phase, callbacks, finish) {
    if (typeof callbacks?.sign !== 'function' || typeof callbacks?.post !== 'function') {
      fail('MOBILE_REVIEW_CONFIGURATION');
    }
    const row = leases.get(lease);
    if (!row || row !== current || row.phase !== phase) fail('MOBILE_REVIEW_INACTIVE');
    try {
      active(lease, phase); row.phase = 'SIGNING';
      const signature = normalizeOriginalAccountSignatureV2(await callbacks.sign(row.value));
      active(lease, 'SIGNING');
      row.phase = 'CONSUMED'; current = null;
      // Consumption precedes the POST. A timeout/lost response cannot make an
      // old callback retryable, even when the original reconcile was admitted.
      const result = await callbacks.post(phase === 'ACCESS'
        ? { challenge: row.value, signature } : { review: row.value, signature });
      if (row.epoch !== epoch || !same(context(), row.scope)) fail('MOBILE_REVIEW_CHANGED');
      validateOriginalAccountFreshV2(row.value, now());
      return finish(row, result);
    } finally {
      if (row.phase !== 'CONSUMED') row.phase = 'INVALID';
      if (current === row) current = null;
    }
  }
  return Object.freeze({
    invalidate,
    begin() {
      invalidate(); const ticket = opaque(); tickets.set(ticket, { epoch, scope: context() }); return ticket;
    },
    finishAccess(ticket, raw) {
      const row = tickets.get(ticket); tickets.delete(ticket);
      if (!row || row.epoch !== epoch) fail('MOBILE_REVIEW_INACTIVE');
      return issue(scoped(normalizeOriginalAccountAccessV2(raw), row.scope), row.scope, 'ACCESS');
    },
    openReview(lease, callbacks) {
      return perform(lease, 'ACCESS', callbacks, (row, raw) => {
        const review = scoped(normalizeOriginalAccountReviewV2(raw), row.scope);
        if (review.bootstrapChallengeId !== row.value.challengeId) fail('MOBILE_REVIEW_CHANGED');
        return issue(review, row.scope, 'REVIEW');
      });
    },
    submit(lease, callbacks) {
      // Response normalization belongs to the paired API. This lease has no
      // callback that persists a balance, clears an outbox, or retries a grant.
      return perform(lease, 'REVIEW', callbacks, (_row, result) => result);
    },
  });
}
