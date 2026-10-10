/** Fixed Expo TLS W39 interface. DTOs/copies never supply local provenance or
 * backend authority. Original reader/observer remains the canonical verifier. */
import * as Crypto from 'expo-crypto';
import { createOriginalAccountApiV2, type OriginalAccountDescriptorV2 } from './original-account-api-v2.mjs';
import { originalAccountAccessMessageV2, normalizeOriginalAccountAccessV2 } from '@lianum/mobile-protocol/original-account-v2';
import { normalizeDeviceExitQuoteEitherV2 as normalizeDeviceExitQuoteV1,normalizeDeviceExitStatusEitherV2 as normalizeDeviceExitStatusV1,validateDeviceExitConsentEitherFreshV2 as validateDeviceExitConsentFreshV1,deviceExitConsentEitherMessageV2 as deviceExitConsentMessageV1,
  type DeviceExitQuoteEitherV2 as DeviceExitQuoteV1,type DeviceExitStatusEitherV2 as DeviceExitStatusV1,type DeviceExitConsentEitherV2 as DeviceExitConsentV1 } from '../../../../packages/mobile-protocol/src/device-native-private-exit-v2.mjs';
const quotes = new WeakMap<object, { live(): void; value: DeviceExitQuoteV1 }>();
const confirmations = new WeakMap<object, { live(): void; value: DeviceExitStatusV1; consent: DeviceExitConsentV1; expiresAt: number }>();
function bad(): never { throw Error('MOBILE_DEVICE_EXIT_RESPONSE_INVALID'); }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
async function sha(bytes: Uint8Array) {
  const owned = new Uint8Array(bytes.length); owned.set(bytes);
  try { return Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, owned.buffer)), b => b.toString(16).padStart(2, '0')).join(''); }
  finally { owned.fill(0); }
}
async function pathRoot(path: DeviceExitQuoteV1['path']) {
  let root = path.leaf, index = path.index;
  const bytes = (value: string) => Uint8Array.from(value.match(/../g)!, pair => parseInt(pair, 16));
  for (const sibling of path.siblings) { const frame = new Uint8Array(65); frame[0] = 1;
    frame.set(bytes(index & 1 ? sibling + root : root + sibling), 1);
    try { root = await sha(frame); } finally { frame.fill(0); } index >>= 1; }
  if (root !== path.root) bad();
}
export async function createDeviceOwnerExitApiV1(descriptor: OriginalAccountDescriptorV2) {
  if (descriptor.origin.length > 64) throw Error('MOBILE_LOCAL_ORIGIN_CAPACITY');
  const { fetch: nativeFetch } = await import('expo/fetch');
  const original = createOriginalAccountApiV2({ descriptor, fetchImpl: nativeFetch }); let closed = false;
  const live = () => { if (closed) throw Error('MOBILE_DEVICE_EXIT_CLIENT_CLOSED'); };
  return Object.freeze({ descriptor: original.descriptor,
    async access() { live(); const value = await original.challenge('read'); live(); return value; },
    async preparation(input: Parameters<typeof original.deviceExit.preparation>[0]) {
      live(); const access = normalizeOriginalAccountAccessV2(input.access), raw = await original.deviceExit.preparation(input); live();
      if (!raw || Object.getPrototypeOf(raw) !== Object.prototype || Reflect.ownKeys(raw).length !== 2
        || !Object.hasOwn(Object.getOwnPropertyDescriptor(raw, 'quote') ?? {}, 'value')
        || !Object.hasOwn(Object.getOwnPropertyDescriptor(raw, 'authorizationSHA256') ?? {}, 'value')) bad();
      const response = raw as { quote: unknown; authorizationSHA256: unknown }, frame = originalAccountAccessMessageV2(access);
      try { if (response.authorizationSHA256 !== await sha(frame)) bad(); } finally { frame.fill(0); }
      const value = normalizeDeviceExitQuoteV1(response.quote);
      for (const name of ['origin', 'pairingId', 'devicePublicKey'] as const) if (value[name] !== original.descriptor[name]) bad();
      for (const name of ['parentJobId', 'noteRole', 'rootId', 'noteRevision'] as const) if (value[name] !== input[name]) bad();
      if (value.statement.nullifier !== input.nullifier || value.statement.recipient !== input.recipient
        || value.expiresAt > access.expiresAt || value.expiresAt > Date.now() + 15_000) bad();
      await pathRoot(value.path); live(); if (Date.now() >= value.expiresAt) bad();
      const handle = Object.freeze(Object.create(null)); quotes.set(handle, { live, value }); return handle;
    },
    async challengeJob(input: Parameters<typeof original.deviceExit.challengeJob>[0]) { live(); const value = await original.deviceExit.challengeJob(input); live(); return value; },
    async challenge(action: 'WITHDRAW_W39' | 'OBSERVE_W39', input: Parameters<typeof original.deviceExit.challenge>[1]) {
      live(); const value = await original.deviceExit.challenge(action, input); live(); return value; },
    async submit(input: Parameters<typeof original.deviceExit.submit>[0]) {
      live(); const consent = validateDeviceExitConsentFreshV1(input.consent), value = normalizeDeviceExitStatusV1(await original.deviceExit.submit(input)); live();
      const frame = deviceExitConsentMessageV1(consent);
      try { if (value.authorizationSHA256 !== await sha(frame)) bad(); } finally { frame.fill(0); }
      if (value.jobId !== consent.jobId || !same(value.statement, consent.statement)) bad();
      for (const name of ['parentJobId', 'nativeBindingSHA256', 'quoteId', 'jobId', 'rootId', 'noteRevision', 'noteRole', 'witnessSHA256'] as const)
        if (value.consentFields[name] !== consent[name]) bad();
      if (consent.action !== 'PROVE_W39' && (value.consentFields.proofSHA256 !== consent.proofSHA256
        || value.consentFields.publicInputsSHA256 !== consent.publicInputsSHA256)) bad();
      if (value.stage === 'CONFIRMED') {
        if (consent.action === 'PROVE_W39' || value.errorCode !== null || value.observation?.domainCommitment !== consent.poolTerms.domainCommitment) bad();
        validateDeviceExitConsentFreshV1(consent); live(); confirmations.set(value, { live, value, consent, expiresAt: Math.min(consent.expiresAt, Date.now() + 15_000) });
      }
      return value;
    },
    close(){closed=true;original.deviceExit.close();},
  });
}
export function readDeviceExitQuoteV1(handle: object): DeviceExitQuoteV1 {
  const row = quotes.get(handle); if (!row) bad(); row.live(); if (Date.now() >= row.value.expiresAt) bad(); return row.value;
}
export function readDeviceExitConfirmationV1(response: object) {
  const row = confirmations.get(response); if (!row) bad(); row.live(); if (Date.now() >= row.expiresAt) bad();
  return Object.freeze({ status: row.value, consent: row.consent, expiresAt: row.expiresAt, mobileCanonicalRpcVerification: false as const });
}
