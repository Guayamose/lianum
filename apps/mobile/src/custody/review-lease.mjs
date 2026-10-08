/** One in-memory consent lease for the currently displayed native review.
 * A signature or a stored permission does not establish an economic outcome. */
import {
  normalizeMobileIntent,
  normalizeMobileOrigin,
  normalizeMobileAuthorization,
  validateMobileChallenge,
} from '@lianum/mobile-protocol';

const fail = code => { throw new Error(code); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createMobileReviewLease({
  readContext,
  allowInsecureLocalhost = false,
  now = Date.now,
  maxStateAgeMs = 30_000,
} = {}) {
  if (typeof readContext !== 'function' || typeof now !== 'function'
    || !Number.isInteger(maxStateAgeMs) || maxStateAgeMs < 1 || maxStateAgeMs > 30_000) {
    fail('MOBILE_REVIEW_CONFIGURATION');
  }

  const tickets = new WeakMap();
  const leases = new WeakMap();
  let epoch = 0;
  let current = null;

  const opaque = () => Object.freeze(Object.defineProperty(Object.create(null), 'toJSON', {
    value() { fail('MOBILE_REVIEW_NOT_SERIALIZABLE'); },
  }));

  function context() {
    const raw = readContext();
    const clock = now();
    if (!raw || raw.foreground !== true || raw.stale !== false || raw.connection !== 'READY'
      || !Number.isSafeInteger(clock) || !Number.isSafeInteger(raw.observedAt)
      || raw.observedAt > clock || clock - raw.observedAt > maxStateAgeMs) {
      fail('MOBILE_REVIEW_STALE');
    }

    const intent = normalizeMobileIntent(raw.intent);
    const origin = normalizeMobileOrigin(raw.origin, { allowInsecureLocalhost });
    if (typeof raw.ownerPublicKey !== 'string' || !/^04[0-9a-f]{128}$/.test(raw.ownerPublicKey)
      || raw.capabilities?.[intent.action] !== true) {
      fail('MOBILE_REVIEW_STALE');
    }
    return { origin, ownerPublicKey: raw.ownerPublicKey, intent };
  }

  function checkScope(scope) {
    if (!same(context(), scope)) fail('MOBILE_REVIEW_CHANGED');
  }

  function active(lease, phase) {
    const row = leases.get(lease);
    if (!row || row !== current || row.epoch !== epoch || row.phase !== phase) {
      fail('MOBILE_REVIEW_INACTIVE');
    }
    checkScope(row.scope);
    validateMobileChallenge(row.challenge, {
      origin: row.scope.origin,
      ownerPublicKey: row.scope.ownerPublicKey,
      now: now(),
      allowInsecureLocalhost,
    });
    return row;
  }

  function invalidate() {
    epoch++;
    current = null;
  }

  return Object.freeze({
    invalidate,

    begin() {
      invalidate();
      const scope = context();
      const ticket = opaque();
      tickets.set(ticket, { epoch, scope });
      return ticket;
    },

    finish(ticket, raw) {
      const original = tickets.get(ticket);
      tickets.delete(ticket);
      if (!original || original.epoch !== epoch) fail('MOBILE_REVIEW_INACTIVE');
      checkScope(original.scope);

      const challenge = validateMobileChallenge(raw, {
        origin: original.scope.origin,
        ownerPublicKey: original.scope.ownerPublicKey,
        now: now(),
        allowInsecureLocalhost,
      });
      if (!same(challenge.intent, original.scope.intent)) fail('MOBILE_REVIEW_CHANGED');

      const lease = opaque();
      current = { epoch, scope: original.scope, challenge, phase: 'OPEN' };
      leases.set(lease, current);
      return Object.freeze({ lease, challenge });
    },

    async submit(lease, { sign, retain, post }) {
      if (![sign, retain, post].every(value => typeof value === 'function')) {
        fail('MOBILE_REVIEW_CONFIGURATION');
      }
      const row = leases.get(lease);
      // An attempted callback with stale context burns this review as well.
      // A concurrent callback must not invalidate the first one's signing.
      if (!row || row.phase !== 'OPEN') fail('MOBILE_REVIEW_INACTIVE');
      try {
        active(lease, 'OPEN');
        row.phase = 'SIGNING';
        // A second Alert callback cannot enter signing while this one awaits
        // biometrics. Lifecycle changes revoke the same private epoch.
        const signature = await sign(row.challenge);
        active(lease, 'SIGNING');
        const authorization = normalizeMobileAuthorization({ challenge: row.challenge, signature }, { allowInsecureLocalhost });
        await retain(authorization);
        active(lease, 'SIGNING');
        // Retention can itself prompt for protected storage. Recheck after that
        // await, then consume before the first POST: no callback can resend it.
        row.phase = 'CONSUMED';
        current = null;
        const result = await post(authorization);
        return Object.freeze({ authorization, result });
      } finally {
        if (row.phase !== 'CONSUMED') row.phase = 'INVALID';
        if (current === row) current = null;
      }
    },
  });
}
