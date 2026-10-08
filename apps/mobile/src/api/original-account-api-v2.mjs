/** Explicitly paired diagnostic transport. Descriptor selectors are checked on
 * every response; possession of those public fields never supplies authority.
 * No dispatch, proof, balance projection or automatic retry lives here. */
import { normalizeMobileOrigin } from '@lianum/mobile-protocol';
import { normalizeOriginalAccountAccessV2, normalizeOriginalAccountReviewV2,
  normalizeOriginalAccountBindingV2, normalizeOriginalAccountSignatureV2,
  validateOriginalAccountFreshV2 } from '@lianum/mobile-protocol/original-account-v2';
const MAX_RESPONSE = 16 * 1024;
const fail = code => { throw new Error(code); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function exact(value, names) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === names.length && keys.every(key => names.includes(key))
    && names.every(name => Object.hasOwn(Object.getOwnPropertyDescriptor(value, name) ?? {}, 'value'));
}
export function normalizeOriginalAccountServiceV2(value) {
  if (!exact(value, ['version', 'profile', 'connection', 'privatePortfolio', 'economicObservation',
    'noteCustodyOnDevice', 'nativeEffectsEstablished', 'actions'])
    || value.version !== 2 || value.profile !== 'PAIRED_ORIGINAL_ACCOUNT_SERVICE_V2'
    || value.connection !== 'PAIRED' || value.privatePortfolio !== null || value.economicObservation !== null
    || value.noteCustodyOnDevice !== false || value.nativeEffectsEstablished !== false
    || !exact(value.actions, ['read', 'reconcile']) || value.actions.read !== true || value.actions.reconcile !== true) {
    fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
  }
  return Object.freeze({ ...value, actions: Object.freeze({ ...value.actions }) });
}
export function createOriginalAccountApiV2({ descriptor, fetchImpl = globalThis.fetch } = {}) {
  if (!exact(descriptor, ['origin', 'pairingId', 'devicePublicKey']) || typeof fetchImpl !== 'function'
    || typeof descriptor.pairingId !== 'string' || !/^[0-9a-f]{64}$/.test(descriptor.pairingId)
    || typeof descriptor.devicePublicKey !== 'string' || !/^04[0-9a-f]{128}$/.test(descriptor.devicePublicKey)) {
    fail('MOBILE_ORIGINAL_DESCRIPTOR_INVALID');
  }
  const original = Object.freeze({ origin: normalizeMobileOrigin(descriptor.origin),
    pairingId: descriptor.pairingId, devicePublicKey: descriptor.devicePublicKey });
  function scope(value) {
    if (Object.keys(original).some(name => value[name] !== original[name])) fail('MOBILE_REVIEW_CHANGED');
    return validateOriginalAccountFreshV2(value);
  }
  async function request(path, payload) {
    const target = original.origin + '/v2/mobile/original-account/' + path;
    const controller = new AbortController();
    let timeout, reader;
    try {
      const deadline = new Promise((_resolve, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(new Error('MOBILE_SERVICE_UNAVAILABLE')); }, 15_000);
      });
      const work = (async () => {
        const response = await fetchImpl(target, { method: payload === undefined ? 'GET' : 'POST',
          headers: { Accept: 'application/json', Origin: original.origin,
            ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
          credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal });
        if (controller.signal.aborted) fail('MOBILE_SERVICE_UNAVAILABLE');
        if (response.redirected || response.url && response.url !== target) fail('MOBILE_RESPONSE_ORIGIN');
        const type = response.headers.get('content-type') ?? '', length = response.headers.get('content-length');
        if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type)
          || length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > MAX_RESPONSE)) {
          fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
        }
        if (!response.ok) fail('MOBILE_SERVICE_UNAVAILABLE');
        if (!response.body || typeof response.body.getReader !== 'function') fail('MOBILE_ORIGINAL_STREAM_REQUIRED');
        reader = response.body.getReader();
        const data = new Uint8Array(MAX_RESPONSE); let size = 0;
        while (true) {
          const chunk = await reader.read();
          if (controller.signal.aborted) fail('MOBILE_SERVICE_UNAVAILABLE');
          if (chunk.done) break;
          if (!(chunk.value instanceof Uint8Array) || size + chunk.value.byteLength > MAX_RESPONSE) {
            fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
          }
          data.set(chunk.value, size); size += chunk.value.byteLength;
        }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0, size)));
      })();
      return await Promise.race([work, deadline]);
    } finally {
      clearTimeout(timeout); controller.abort();
      // Stops only this client's response stream, never the original keeper
      // action. Do not await an untrusted stream's cancellation implementation.
      if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
  }
  return Object.freeze({
    descriptor: original,
    async state() { return normalizeOriginalAccountServiceV2(await request('state')); },
    async challenge(action) {
      if (!['read', 'reconcile'].includes(action)) fail('MOBILE_ORIGINAL_ACTION');
      const raw = await request('challenges', { action });
      if (!exact(raw, ['challenge'])) fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
      const value = scope(normalizeOriginalAccountAccessV2(raw.challenge));
      if (value.action !== action) fail('MOBILE_REVIEW_CHANGED'); return value;
    },
    async openReview(raw) {
      if (!exact(raw, ['challenge', 'signature'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
      const challenge = scope(normalizeOriginalAccountAccessV2(raw.challenge));
      const signature = normalizeOriginalAccountSignatureV2(raw.signature);
      const value = await request('reviews', { challenge, signature });
      if (!exact(value, ['review'])) fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
      const review = scope(normalizeOriginalAccountReviewV2(value.review));
      if (review.action !== challenge.action || review.bootstrapChallengeId !== challenge.challengeId) {
        fail('MOBILE_REVIEW_CHANGED');
      }
      return review;
    },
    async submit(raw) {
      if (!exact(raw, ['review', 'signature'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
      const review = scope(normalizeOriginalAccountReviewV2(raw.review));
      const signature = normalizeOriginalAccountSignatureV2(raw.signature);
      const value = await request('diagnostics', { review, signature });
      if (!exact(value, ['version', 'profile', 'action', 'binding', 'admission', 'privatePortfolio',
        'economicObservation', 'noteCustodyOnDevice', 'nativeEffectsEstablished'])
        || value.version !== 2 || value.profile !== 'PAIRED_ORIGINAL_ACCOUNT_DIAGNOSTIC_V2'
        || value.action !== review.action || value.privatePortfolio !== null || value.economicObservation !== null
        || value.noteCustodyOnDevice !== false || value.nativeEffectsEstablished !== false) {
        fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
      }
      const binding = normalizeOriginalAccountBindingV2(value.binding), mutable = new Set([
        'observedProcessGeneration', 'journalRevision', 'requestState', 'authorityStage', 'submission',
      ]);
      const requestStates = ['PREPARED', 'UNKNOWN', 'CONFIRMED'], authorityStates = ['READY', 'UNKNOWN', 'CONFIRMED'];
      if (Object.keys(review.binding).some(name => !mutable.has(name) && !same(binding[name], review.binding[name]))
        || binding.journalRevision < review.binding.journalRevision
        || binding.observedProcessGeneration < review.binding.observedProcessGeneration
        || requestStates.indexOf(binding.requestState) < requestStates.indexOf(review.binding.requestState)
        || authorityStates.indexOf(binding.authorityStage) < authorityStates.indexOf(review.binding.authorityStage)
        || review.binding.submission !== null && !same(binding.submission, review.binding.submission)) {
        fail('MOBILE_REVIEW_CHANGED');
      }
      let admission = null;
      if (review.action === 'reconcile') {
        const row = value.admission;
        if (!exact(row, ['version', 'admitted', 'sequence', 'action', 'requestId', 'state', 'errorCode'])
          || row.version !== 1 || row.admitted !== true || !Number.isSafeInteger(row.sequence)
          || row.sequence < 1 || row.action !== 'reconcile' || row.requestId !== review.binding.requestId
          || !['SUCCEEDED', 'FAILED'].includes(row.state)
          || !(row.state === 'SUCCEEDED' ? row.errorCode === null
            : typeof row.errorCode === 'string' && /^[A-Z][A-Z0-9_]{0,95}$/.test(row.errorCode))) {
          fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
        }
        admission = Object.freeze({ ...row });
      } else if (value.admission !== null) fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
      return Object.freeze({ ...value, binding, admission });
    },
  });
}
