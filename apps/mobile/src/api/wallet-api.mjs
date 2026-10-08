import { normalizeMobileOrigin, normalizeMobileIntent, validateMobileChallenge,
  normalizeMobileAuthorization, MOBILE_ACTIONS } from '@lianum/mobile-protocol';
import { normalizeMobileReceiptRequest, validateMobileReceiptReview,
  MOBILE_AUTHORIZATION_RECEIPT_PROFILE } from '@lianum/mobile-protocol';

const MAX_RESPONSE = 16 * 1024;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, names) => plain(value) && Object.keys(value).length === names.length
  && names.every(name => Object.hasOwn(value, name));
function outcome(value, requestId) {
  if (!exact(value, ['status', 'requestId', 'operationState', 'retryAllowed'])
    || value.requestId !== requestId || value.retryAllowed !== false
    || !['ACCEPTED', 'UNKNOWN', 'REJECTED'].includes(value.status)
    || value.operationState !== ({ ACCEPTED: 'ADMITTED', UNKNOWN: 'UNKNOWN', REJECTED: 'REJECTED' })[value.status]) {
    fail('MOBILE_AUTHORIZATION_RESPONSE_INVALID');
  }
  return Object.freeze({ ...value });
}
export function normalizeMobileState(value) {
  if (!exact(value, ['version', 'connection', 'privatePortfolio', 'capabilities', 'notice'])
    || value.version !== 1 || !['DISCONNECTED', 'READY'].includes(value.connection)
    || value.privatePortfolio !== null || !exact(value.capabilities, MOBILE_ACTIONS)
    || MOBILE_ACTIONS.some(action => typeof value.capabilities[action] !== 'boolean')
    || value.connection === 'DISCONNECTED' && MOBILE_ACTIONS.some(action => value.capabilities[action])
    || typeof value.notice !== 'string' || value.notice.length > 1024) fail('MOBILE_STATE_INVALID');
  return Object.freeze({ ...value, capabilities: Object.freeze({ ...value.capabilities }) });
}
export function createMobileApi({ origin, fetchImpl = globalThis.fetch, allowInsecureLocalhost = false }) {
  const options = { allowInsecureLocalhost };
  const server = normalizeMobileOrigin(origin, options);
  if (typeof fetchImpl !== 'function') fail('MOBILE_TRANSPORT_UNAVAILABLE');
  async function request(path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const target = server + path;
      const response = await fetchImpl(target, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
      });
      if (response.redirected || response.url && response.url !== target) fail('MOBILE_RESPONSE_ORIGIN');
      const contentType = response.headers.get('content-type') ?? '';
      const size = response.headers.get('content-length');
      if (!contentType.startsWith('application/json') || size !== null
        && (!/^(0|[1-9][0-9]*)$/.test(size) || Number(size) > MAX_RESPONSE)) fail('MOBILE_RESPONSE_INVALID');
      const text = await response.text();
      if (text.length > MAX_RESPONSE) fail('MOBILE_RESPONSE_INVALID');
      const data = JSON.parse(text);
      if (!response.ok) fail('MOBILE_SERVICE_UNAVAILABLE');
      return data;
    } finally { clearTimeout(timeout); }
  }
  return Object.freeze({
    origin: server,
    async state() { return normalizeMobileState(await request('/v1/mobile/state')); },
    async challenge(ownerPublicKey, intent) {
      const original = normalizeMobileIntent(intent);
      const response = await request('/v1/mobile/challenges', { ownerPublicKey, intent: original });
      if (!exact(response, ['challenge'])) fail('MOBILE_CHALLENGE_RESPONSE_INVALID');
      const checked = validateMobileChallenge(response.challenge, { origin: server, ownerPublicKey, ...options });
      if (JSON.stringify(checked.intent) !== JSON.stringify(original)) fail('MOBILE_INTENT_SUBSTITUTION');
      return checked;
    },
    async submit(raw) {
      const authorization = normalizeMobileAuthorization(raw, options);
      validateMobileChallenge(authorization.challenge, { origin: server,
        ownerPublicKey: authorization.challenge.ownerPublicKey, ...options });
      const requestId = authorization.challenge.intent.requestId;
      try {
        const response = await request('/v1/mobile/authorizations', authorization);
        return outcome(response, requestId);
      } catch {
        // A dropped/invalid reply cannot establish that the action did not run.
        // Preserve its original requestId and never automatically repeat it.
        return Object.freeze({ status: 'UNKNOWN', requestId, operationState: 'UNKNOWN', retryAllowed: false });
      }
    },
    async receipt(raw) {
      const query = normalizeMobileReceiptRequest(raw, options);
      validateMobileReceiptReview({ authorization: query.authorization, nonce: query.nonce,
        expiresAt: query.expiresAt }, { origin: server,
        ownerPublicKey: query.authorization.challenge.ownerPublicKey, ...options });
      const original = query.authorization.challenge;
      const response = await request('/v1/mobile/authorization-receipts', query);
      if (!exact(response, ['version', 'profile', 'nonce', 'challengeId', 'action', 'authorization'])
        || response.version !== 1 || response.profile !== MOBILE_AUTHORIZATION_RECEIPT_PROFILE
        || response.nonce !== query.nonce || response.challengeId !== original.challengeId
        || response.action !== original.intent.action) fail('MOBILE_RECEIPT_RESPONSE_INVALID');
      // Failure/missing evidence throws, so the existing outbox is preserved.
      // An admission receipt can never establish an economic terminal state.
      return Object.freeze({ ...response, authorization: outcome(response.authorization, original.intent.requestId) });
    },
  });
}
