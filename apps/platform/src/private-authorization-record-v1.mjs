/** SQL receives bounded, keyed commitments, never the mobile owner or terms.
 * The API still sees the original signed message; this is storage separation,
 * not anonymity against the API, public chain or colluding operators. */
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
const CHALLENGE = 'LIANUM_PLATFORM_PRIVATE_CHALLENGE_V1';
const RESPONSE = 'LIANUM_PLATFORM_PRIVATE_RESPONSE_V1';
export const PLATFORM_PRIVACY_KEY_MARKER = Object.freeze({ owner: 'LIANUM_PLATFORM_PRIVACY_KEY_V1', request: 'KEY' });
const fail = () => { throw Object.assign(new Error('MOBILE_PRIVATE_RECORD_INVALID'), { code: 'MOBILE_PRIVATE_RECORD_INVALID' }); };
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(name => JSON.stringify(name) + ':' + canonical(value[name])).join(',') + '}';
const legacyDigest = value => createHash('sha256').update(canonical(value)).digest('hex');
const equal = (a, b) => typeof a === 'string' && /^[0-9a-f]{64}$/.test(a)
  && typeof b === 'string' && /^[0-9a-f]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
const exact = (value, fields) => value && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).sort().join(',') === [...fields].sort().join(',');
const termsOf = challenge => { const { action, ...terms } = challenge.intent; return terms; };

export function createPrivateAuthorizationRecordCodecV1(privacyKey) {
  if (typeof privacyKey !== 'string' || !/^[0-9a-f]{64}$/.test(privacyKey))
    throw Object.assign(new Error('MOBILE_PRIVACY_KEY_REQUIRED'), { code: 'MOBILE_PRIVACY_KEY_REQUIRED' });
  const key = Buffer.from(privacyKey, 'hex'); let closed = false;
  const mac = (domain, value) => {
    if (closed) fail();
    return createHmac('sha256', key).update('LIANUM_PLATFORM_PRIVATE_AUTHORIZATION_V1\n' + domain + '\n' + canonical(value)).digest('hex');
  };
  const encodeResponse = response => {
    if (!exact(response, ['status', 'requestId', 'operationState', 'retryAllowed'])
      || response.retryAllowed !== false || typeof response.requestId !== 'string'
      || !({ UNKNOWN: 'UNKNOWN', ACCEPTED: 'ADMITTED', REJECTED: 'REJECTED' }[response.status] === response.operationState)) fail();
    return { format: RESPONSE, status: response.status, operationState: response.operationState, retryAllowed: false };
  };
  return Object.freeze({
    keyPin: mac('key-pin', PLATFORM_PRIVACY_KEY_MARKER),
    challenge(challenge) { return { format: CHALLENGE, commitment: mac('challenge', challenge) }; },
    matchesChallenge(record, challenge) {
      if (record?.format === CHALLENGE) return exact(record, ['format', 'commitment']) && equal(record.commitment, mac('challenge', challenge));
      // Historical challenges stay byte-for-byte in their original rows. New
      // records never use this format and no migration deletes consumed rows.
      return record?.profile === 'LIANUM_MOBILE_AUTHORIZATION_V1' && equal(legacyDigest(record), legacyDigest(challenge));
    },
    terms(challenge) { return mac('terms', termsOf(challenge)); },
    matchesTerms(value, challenge) { return equal(value, mac('terms', termsOf(challenge))) || equal(value, legacyDigest(termsOf(challenge))); },
    operation(challenge) {
      // Scope identity to this request; different requests have different SQL
      // identities. HMAC prevents a public-owner dictionary attack on SQL.
      return { owner: mac('operation-owner', [challenge.ownerPublicKey, challenge.intent.requestId]),
        request: mac('request', challenge.intent.requestId) };
    },
    response: encodeResponse,
    readResponse(record, challenge) {
      if (record?.format === RESPONSE) {
        if (!exact(record, ['format', 'status', 'operationState', 'retryAllowed'])) fail();
        const restored = { status: record.status, requestId: challenge.intent.requestId,
          operationState: record.operationState, retryAllowed: record.retryAllowed };
        encodeResponse(restored); return restored;
      }
      encodeResponse(record);
      if (record.requestId !== challenge.intent.requestId) fail();
      return { ...record };
    },
    close() { if (!closed) { closed = true; key.fill(0); } },
  });
}
