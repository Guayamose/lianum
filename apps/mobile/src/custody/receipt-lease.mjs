/** Revocable, one-use consent to read the admission of one retained permission.
 * It never consumes a backend authorization or starts an economic action. */
import { normalizeMobileAuthorization, normalizeMobileOrigin, normalizeMobileReceiptRequest,
  validateMobileReceiptReview } from '@lianum/mobile-protocol';

const fail = code => { throw new Error(code); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createMobileReceiptLease({ readContext, allowInsecureLocalhost = false, now = Date.now } = {}) {
  if (typeof readContext !== 'function' || typeof now !== 'function') fail('MOBILE_REVIEW_CONFIGURATION');
  const tickets = new WeakMap();
  const leases = new WeakMap();
  let epoch = 0;
  let current = null;
  const opaque = () => Object.freeze(Object.defineProperty(Object.create(null), 'toJSON', {
    value() { fail('MOBILE_REVIEW_NOT_SERIALIZABLE'); },
  }));

  function context() {
    const raw = readContext();
    if (!raw || raw.foreground !== true) fail('MOBILE_REVIEW_STALE');
    const origin = normalizeMobileOrigin(raw.origin, { allowInsecureLocalhost });
    const authorization = normalizeMobileAuthorization(raw.authorization, { allowInsecureLocalhost });
    if (authorization.challenge.origin !== origin
      || authorization.challenge.ownerPublicKey !== raw.ownerPublicKey) fail('MOBILE_REVIEW_CHANGED');
    return { origin, ownerPublicKey: raw.ownerPublicKey, authorization };
  }
  function check(row) {
    if (row.epoch !== epoch || !same(context(), row.scope)) fail('MOBILE_REVIEW_CHANGED');
    validateMobileReceiptReview(row.review, { origin: row.scope.origin,
      ownerPublicKey: row.scope.ownerPublicKey, now: now(), allowInsecureLocalhost });
  }
  function invalidate() {
    epoch++;
    current = null;
  }
  return Object.freeze({
    invalidate,
    begin() {
      invalidate();
      const ticket = opaque();
      tickets.set(ticket, { epoch, scope: context() });
      return ticket;
    },
    finish(ticket, raw) {
      const original = tickets.get(ticket);
      tickets.delete(ticket);
      if (!original || original.epoch !== epoch) fail('MOBILE_REVIEW_INACTIVE');
      if (!same(context(), original.scope)) fail('MOBILE_REVIEW_CHANGED');
      const review = validateMobileReceiptReview(raw, { origin: original.scope.origin,
        ownerPublicKey: original.scope.ownerPublicKey, now: now(), allowInsecureLocalhost });
      if (!same(review.authorization, original.scope.authorization)) fail('MOBILE_REVIEW_CHANGED');
      const lease = opaque();
      current = { epoch, scope: original.scope, review, phase: 'OPEN' };
      leases.set(lease, current);
      return Object.freeze({ lease, review });
    },
    async query(lease, { sign, post, retain }) {
      if (![sign, post, retain].every(value => typeof value === 'function')) fail('MOBILE_REVIEW_CONFIGURATION');
      const row = leases.get(lease);
      if (!row || row !== current || row.phase !== 'OPEN') fail('MOBILE_REVIEW_INACTIVE');
      try {
        check(row);
        row.phase = 'SIGNING';
        const signature = await sign(row.review);
        if (row !== current || row.phase !== 'SIGNING') fail('MOBILE_REVIEW_INACTIVE');
        check(row);
        const request = normalizeMobileReceiptRequest({ ...row.review, signature }, { allowInsecureLocalhost });
        // Consume before the first read POST. An old Alert callback cannot
        // cause a second signature, query or protected storage update.
        row.phase = 'CONSUMED';
        current = null;
        const receipt = await post(request);
        check(row);
        await retain(row.review.authorization, receipt);
        check(row);
        return receipt;
      } finally {
        if (row.phase !== 'CONSUMED') row.phase = 'INVALID';
        if (current === row) current = null;
      }
    },
  });
}
