/** Fixed paired TLS transport. Local root/note keys never enter this API.
 * One original consent permits one POST; lost replies remain observation-only. */
import * as Crypto from 'expo-crypto';
import { DEVICE_EXTERNAL_FLAT_SHARE_V1, normalizeExternalFlatDescriptorV1, normalizeExternalFlatAccessV1,
  normalizeExternalFlatConsentV1, normalizeExternalFlatRowV1, normalizeExternalFlatStatusV1,
  normalizeExternalFlatSignatureV1, externalFlatExactV1, externalFlatWitnessV1,
  externalFlatWitnessBytesV1, externalFlatWipeV1, externalFlatPrivateProofTranscriptBytesV2, externalFlatPrivateWalletTranscriptBytesV3, DEVICE_EXTERNAL_FLAT_PRIVATE_WALLET_V3, validateExternalFlatFreshV1 }
  from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
const rows = new WeakMap(), statuses = new WeakMap(), quotes = new WeakMap();
const fail = () => { throw Error('MOBILE_EXTERNAL_FLAT_RESPONSE_REJECTED'); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fields = ['action', 'jobId', 'rootId', 'noteRevision', 'recipient', 'statement', 'path', 'witnessSHA256'];
function snapshot(raw) {
  let nodes = 0, size = 0;
  function copy(value, depth) {
    if (++nodes > 4096 || depth > 16) fail();
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') { if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) fail(); return value; }
    if (typeof value === 'string') { size += value.length; if (size > 65536) fail(); return value; }
    if (!value || typeof value !== 'object') fail();
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) fail();
    const out = array ? [] : {};
    for (const name of Reflect.ownKeys(value)) {
      if (array && name === 'length') continue;
      const d = Object.getOwnPropertyDescriptor(value, name);
      if (typeof name !== 'string' || !d?.enumerable || !Object.hasOwn(d, 'value')) fail();
      Object.defineProperty(out, name, { value: copy(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    if (array && (out.length !== value.length || Reflect.ownKeys(value).length !== value.length + 1)) fail();
    return out;
  }
  return copy(raw, 0);
}
async function digest(bytes) {
  const owned = new Uint8Array(bytes.length); owned.set(bytes);
  try { return Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, owned.buffer)), b => b.toString(16).padStart(2, '0')).join(''); }
  finally { owned.fill(0); }
}
function freshStatus(value) {
  const now = Date.now();
  if (!Number.isSafeInteger(value.observedAt) || !Number.isSafeInteger(value.expiresAt)
    || value.observedAt > now || value.expiresAt !== value.observedAt + 15000 || value.expiresAt <= now) fail();
}
export function createDeviceExternalFlatNoteApiV1({ descriptor, fetchImpl = globalThis.fetch } = {}) {
  const original = normalizeExternalFlatDescriptorV1(descriptor);
  if (typeof fetchImpl !== 'function') fail();
  let closed = false;
  const accesses = new WeakMap(), consents = new WeakMap(), controllers = new Set();
  function live() { if (closed) fail(); }
  function accessScope(value) {
    live(); validateExternalFlatFreshV1(value);
    for (const name of ['origin', 'pairingId', 'devicePublicKey']) if (value[name] !== original[name]) fail();
  }
  function consentScope(value, fresh = true) {
    live(); if (!same(value.descriptor, original)) fail();
    if (fresh) validateExternalFlatFreshV1(value);
  }
  async function post(path, payload, proofResponse = false) {
    live(); const target = original.origin + (original.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1?'/v1/mobile/external-flat-share/':'/v1/mobile/external-flat/') + path;
    const body = JSON.stringify(payload);
    if (new TextEncoder().encode(body).byteLength > (path==='private-operations'?16384:8192)) fail();
    const controller = new AbortController(); controllers.add(controller);
    let timer, reader, bytes;
    const stop = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(Error('MOBILE_EXTERNAL_FLAT_REQUEST_CLOSED')), { once: true });
    });
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(Error('MOBILE_EXTERNAL_FLAT_REQUEST_TIMEOUT'));
    }, proofResponse ? 900000 : 15000); });
    const work = (async () => {
      const response = await fetchImpl(target, { method: 'POST', headers: { Accept: 'application/json', Origin: original.origin,
        'Content-Type': 'application/json' }, body, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal });
      live();
      if (controller.signal.aborted || !response.ok || response.redirected || response.url && response.url !== target
        || /^application\/json(?:;\s*charset=utf-8)?$/i.exec(response.headers.get('content-type') ?? '')?.[0] !== response.headers.get('content-type')) fail();
      const length = response.headers.get('content-length');
      if (length !== null && (/^(0|[1-9][0-9]{0,5})$/.exec(length)?.[0] !== length || Number(length) > 65536)) fail();
      if (!response.body || typeof response.body.getReader !== 'function') fail();
      reader = response.body.getReader(); bytes = new Uint8Array(65536); let used = 0;
      try {
        for (;;) {
          const part = await reader.read(); live(); if (controller.signal.aborted) fail();
          if (part.done) break;
          if (!(part.value instanceof Uint8Array) || used + part.value.byteLength > bytes.length) fail();
          bytes.set(part.value, used); used += part.value.byteLength;
        }
        if (length !== null && used !== Number(length)) fail();
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, used)));
      } finally { bytes.fill(0); }
    })();
    try { return await Promise.race([work, stop, timeout]); }
    finally {
      clearTimeout(timer); controller.abort(); controllers.delete(controller);
      if (reader) { void reader.cancel().catch(() => {}); try { reader.releaseLock(); } catch {} }
    }
  }
  function originalRow(raw, consent = null) {
    live(); const value = normalizeExternalFlatRowV1(raw);
    if (!same(value.descriptor, original)) fail();
    if (consent) {
      const mode = consent.action.endsWith('D27') ? 'deposit_intent' : consent.action.endsWith('D26') ? 'deposit_balance' : 'withdraw_balance';
      if (value.jobId !== consent.jobId || value.mode !== mode) fail();
      for (const name of ['jobId', 'depositJobId', 'rootId', 'noteRevision', 'recipient', 'statement', 'path', 'witnessSHA256'])
        if (!same(value.consentFields[name], consent[name])) fail();
      if (!consent.action.startsWith('PROVE_')) for (const name of ['proofSHA256', 'publicInputsSHA256'])
        if (value.consentFields[name] !== consent[name]) fail();
    }
    rows.set(value, { live, descriptor: original }); return value;
  }
  const client = Object.freeze({ descriptor: original,
    async challenge() {
      if (arguments.length !== 0) fail();
      const value = normalizeExternalFlatAccessV1(await post('challenges', {})); accessScope(value);
      accesses.set(value, { consumed: false }); return value;
    },
    async review(access, signature, rawDraft) {
      if (arguments.length !== 3) fail();
      const entry = accesses.get(access); if (!entry || entry.consumed) fail(); accessScope(access);
      signature = normalizeExternalFlatSignatureV1(signature);
      const draft = externalFlatExactV1(snapshot(rawDraft), fields); entry.consumed = true;
      const response = externalFlatExactV1(await post('reviews', { access, signature, draft }), ['consent']);
      const value = normalizeExternalFlatConsentV1(response.consent); consentScope(value);
      for (const name of ['action', 'rootId', 'noteRevision', 'recipient']) if (value[name] !== draft[name]) fail();
      if (draft.action === 'QUOTE_W39') { if (value.depositJobId !== draft.jobId) fail(); }
      else {
        if (draft.jobId !== null && value.jobId !== draft.jobId) fail();
        for (const name of ['statement', 'path', 'witnessSHA256']) if (!same(value[name], draft[name])) fail();
      }
      if(value.privateProof){if(await digest(value.privateProof.profile===DEVICE_EXTERNAL_FLAT_PRIVATE_WALLET_V3?externalFlatPrivateWalletTranscriptBytesV3(value):externalFlatPrivateProofTranscriptBytesV2(value))!==value.privateProof.transcriptSHA256)fail();consentScope(value);}
      consents.set(value, { consumed: false }); return value;
    },
    async submit(consent, signature, rawWitness = null) {
      if (arguments.length !== 3) fail();
      const entry = consents.get(consent); if (!entry || entry.consumed) fail(); consentScope(consent);
      signature = normalizeExternalFlatSignatureV1(signature);
      let witness = null, bytes;
      try {
        if (consent.action.startsWith('PROVE_')) {
          witness = externalFlatWitnessV1(consent.action === 'PROVE_D27' ? 'deposit_intent' : consent.action === 'PROVE_D26' ? 'deposit_balance' : 'withdraw_balance', rawWitness);
          bytes = externalFlatWitnessBytesV1(consent.action === 'PROVE_D27' ? 'deposit_intent' : consent.action === 'PROVE_D26' ? 'deposit_balance' : 'withdraw_balance', witness);
          if (await digest(bytes) !== consent.witnessSHA256) fail();
        } else if (rawWitness !== null) fail();
        let wireWitness=witness;if(consent.privateProof){const crypto=await import('./device-private-proof-transit-v2.mjs');consentScope(consent);wireWitness=await (consent.privateProof.profile===DEVICE_EXTERNAL_FLAT_PRIVATE_WALLET_V3?crypto.sealOriginalDeviceWalletNoteWitnessV3:crypto.sealOriginalDeviceDepositIntentWitnessV2)(consent,signature,witness);}
        consentScope(consent); entry.consumed = true;
        const response = await post(consent.privateProof?'private-operations':'operations', { consent, signature, witness:wireWitness }, consent.action === 'PROVE_D26' || consent.action === 'PROVE_D27' || consent.action === 'PROVE_W39'); live();
        if (consent.action === 'QUOTE_W39') {
          const value = normalizeExternalFlatConsentV1(externalFlatExactV1(response, ['quote']).quote);
          consentScope(value); if (!same(value, consent)) fail(); quotes.set(value, { live, descriptor: original });
          return Object.freeze({ quote: value });
        }
        // Admission consumed a fresh permission BEFORE the worker started.
        // A completed proof can outlive that permission; no effect reuses it.
        return originalRow(response, consent);
      } finally { bytes?.fill(0); externalFlatWipeV1(witness); }
    },
    async status(access, signature) {
      if (arguments.length !== 2) fail();
      const entry = accesses.get(access); if (!entry || entry.consumed) fail(); accessScope(access);
      signature = normalizeExternalFlatSignatureV1(signature); entry.consumed = true;
      const parsed = normalizeExternalFlatStatusV1(await post('status', { access, signature })); live();
      if (!same(parsed.descriptor, original)) fail(); freshStatus(parsed);
      const value = Object.freeze({ ...parsed, jobs: Object.freeze(parsed.jobs.map(row => originalRow(row))) });
      statuses.set(value, { live, descriptor: original }); return value;
    },
    close() { if (arguments.length !== 0) fail(); closed = true; for (const controller of controllers) controller.abort(); return { closed: true }; },
  });
  return client;
}
/** Only fixed TLS responses issue these local handles. Copies cannot credit
 * the mobile Vault or invent an original path, quote or funding confirmation. */
export function readDeviceExternalFlatRowV1(value) {
  const entry = rows.get(value); if (!entry) fail(); entry.live(); return value;
}
export function readDeviceExternalFlatStatusV1(value) {
  const entry = statuses.get(value); if (!entry) fail(); entry.live(); freshStatus(value); return value;
}
export function readDeviceExternalFlatQuoteV1(value) {
  const entry = quotes.get(value); if (!entry) fail(); entry.live(); validateExternalFlatFreshV1(value); return value;
}
