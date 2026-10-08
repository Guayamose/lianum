/** Native TLS transport for the original device U/S account. A quote handle is
 * local provenance from this fixed response, never a backend approval. The
 * account still validates its own retained quote, proof and canonical ledger. */
import * as Crypto from 'expo-crypto';
import { createOriginalAccountApiV2, type OriginalAccountDescriptorV2 } from './original-account-api-v2.mjs';
import { originalAccountAccessMessageV2, normalizeOriginalAccountAccessV2 } from '@lianum/mobile-protocol/original-account-v2';
import { normalizeDeviceReservationQuoteV1, normalizeDeviceReservationStatusV1,
  deviceReservationConsentMessageV1, validateDeviceReservationConsentFreshV1,
  type DeviceReservationConsentV1 } from '../../../../packages/mobile-protocol/src/device-reservation-consent-v1.mjs';
type Quote = ReturnType<typeof normalizeDeviceReservationQuoteV1>;
type Status = ReturnType<typeof normalizeDeviceReservationStatusV1>;
export type DeviceReservationInclusionV1 = Readonly<{ status: Status;
  origin: string; pairingId: string; devicePublicKey: string;
  pool: string; poolTerms: DeviceReservationConsentV1['poolTerms'];
  observedAt: number; expiresAt: number; mobileCanonicalRpcVerification: false }>;
const inclusions = new WeakMap<object, { live(): void; value: DeviceReservationInclusionV1 }>();
const quotes = new WeakMap<object, { live(): void; value: Quote }>();
function bad(): never { throw new Error('MOBILE_DEVICE_RESERVATION_RESPONSE_INVALID'); }
function exact(raw: unknown, names: string[]): Record<string, unknown> {
  if (!raw || Object.getPrototypeOf(raw) !== Object.prototype || Reflect.ownKeys(raw).length !== names.length
    || !names.every(name => Object.hasOwn(Object.getOwnPropertyDescriptor(raw, name) ?? {}, 'value'))) bad();
  return raw as Record<string, unknown>;
}
async function sha(bytes: Uint8Array): Promise<string> {
  const owned = new Uint8Array(bytes.byteLength); owned.set(bytes);
  try { return Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, owned.buffer)),
    value => value.toString(16).padStart(2, '0')).join(''); }
  finally { owned.fill(0); }
}
/** Same SHA ledger tree as the original wallet observer. No Poseidon reduction
 * and no balance is inferred from inclusion alone: an output can be spent later. */
async function verifyPath(path: NonNullable<Status['observation']>['changePath']) {
  const bytes = (value: string) => Uint8Array.from(value.match(/../g)!, pair => parseInt(pair, 16));
  let root = path.leaf, index = path.index;
  for (const sibling of path.siblings) {
    const frame = new Uint8Array(65); frame[0] = 1;
    frame.set(bytes(index & 1 ? sibling + root : root + sibling), 1);
    try { root = await sha(frame); } finally { frame.fill(0); }
    index >>= 1;
  }
  if (root !== path.root) bad();
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export async function createDeviceOwnerReservationApiV1(descriptor: OriginalAccountDescriptorV2) {
  if (descriptor.origin.length > 64) throw new Error('MOBILE_LOCAL_ORIGIN_CAPACITY');
  const { fetch: nativeFetch } = await import('expo/fetch');
  const original = createOriginalAccountApiV2({ descriptor, fetchImpl: nativeFetch });
  let closed = false;
  const live = () => { if (closed) throw new Error('MOBILE_DEVICE_RESERVATION_CLIENT_CLOSED'); };
  return Object.freeze({ descriptor: original.descriptor,
    async access() { live(); const value = await original.challenge('read'); live(); return value; },
    async preparation(input: Parameters<typeof original.deviceReservation.preparation>[0]) {
      live(); const access = normalizeOriginalAccountAccessV2(input.access);
      const raw = exact(await original.deviceReservation.preparation(input), ['quote', 'authorizationSHA256']); live();
      const frame = originalAccountAccessMessageV2(access);
      try { if (raw.authorizationSHA256 !== await sha(frame)) bad(); } finally { frame.fill(0); }
      live(); const value = normalizeDeviceReservationQuoteV1(raw.quote);
      if (value.origin !== original.descriptor.origin || value.pairingId !== original.descriptor.pairingId
        || value.devicePublicKey !== original.descriptor.devicePublicKey || value.rootId !== input.rootId
        || value.depositJobId !== input.depositJobId || value.expiresAt > access.expiresAt
        || value.expiresAt > Date.now() + 15_000) bad();
      if (Date.now() >= value.expiresAt) bad();
      const handle = Object.freeze(Object.create(null)); quotes.set(handle, { live, value });
      return handle;
    },
    async challengeJob(input: Parameters<typeof original.deviceReservation.challengeJob>[0]) {
      live(); const value = await original.deviceReservation.challengeJob(input); live(); return value;
    },
    async challenge(action: 'RESERVE_S' | 'OBSERVE_S', input: Parameters<typeof original.deviceReservation.challenge>[1]) {
      live(); const value = await original.deviceReservation.challenge(action, input); live(); return value;
    },
    async submit(input: Parameters<typeof original.deviceReservation.submit>[0]) {
      live(); const consent = validateDeviceReservationConsentFreshV1(input.consent);
      const value = normalizeDeviceReservationStatusV1(await original.deviceReservation.submit(input)); live();
      const frame = deviceReservationConsentMessageV1(consent);
      try { if (value.authorizationSHA256 !== await sha(frame)) bad(); } finally { frame.fill(0); }
      live();
      if (value.jobId !== consent.jobId || !same(value.statement, consent.statement)
        || value.consentFields.depositJobId !== consent.depositJobId || value.consentFields.quoteId !== consent.quoteId
        || !same(value.consentFields.custody, consent.custody) || value.consentFields.witnessSHA256 !== consent.witnessSHA256) bad();
      if (consent.action !== 'PROVE_U' && (value.consentFields.proofSHA256 !== consent.proofSHA256
        || value.consentFields.publicInputsSHA256 !== consent.publicInputsSHA256)) bad();
      if (value.stage === 'RESERVED') {
        const observed = value.observation!;
        if (consent.action === 'PROVE_U' || value.errorCode !== null
          || observed.domainCommitment !== consent.poolTerms.domainCommitment
          || observed.changePath.root !== observed.reservePath.root
          || observed.changePath.index === observed.reservePath.index
          || BigInt(observed.blockNumber) > BigInt(observed.currentHead.blockNumber)
          || BigInt(observed.timestamp) > BigInt(observed.currentHead.timestamp)
          || BigInt(observed.currentHead.blockNumber) < BigInt(consent.observed.blockNumber)
          || BigInt(observed.currentHead.timestamp) < BigInt(consent.observed.timestamp)) bad();
        if (observed.blockNumber === observed.currentHead.blockNumber && observed.blockHash !== observed.currentHead.blockHash) bad();
        if (observed.currentHead.blockNumber === consent.observed.blockNumber
          && observed.currentHead.blockHash !== consent.observed.blockHash) bad();
        await verifyPath(observed.changePath); await verifyPath(observed.reservePath); live();
        validateDeviceReservationConsentFreshV1(consent);
        const observedAt = Date.now();
        inclusions.set(value, { live, value: Object.freeze({ status: value,
          origin: consent.origin, pairingId: consent.pairingId, devicePublicKey: consent.devicePublicKey,
          pool: consent.binding.asset.pool, poolTerms: consent.poolTerms,
          observedAt, expiresAt: Math.min(consent.expiresAt, observedAt + 15_000),
          mobileCanonicalRpcVerification: false as const }) });
      }
      // The exact completed response is privately retained. Copies/JSON have no
      // local provenance. PROVED/UNKNOWN never issue an inclusion or a balance.
      return value;
    },
    close() { closed = true; },
  });
}
/** DTOs/copies cannot replace this completed fixed native HTTPS response. Its
 * 15-second TTL and original client lifetime are checked on every use. */
export function readDeviceReservationQuoteV1(handle: object): Quote {
  const row = quotes.get(handle); if (!row) bad(); row.live();
  if (Date.now() >= row.value.expiresAt) bad(); return row.value;
}

/** Only the original consent-bound fixed TLS response, with both verified SHA
 * paths, can be applied locally. This is service provenance; it neither issues
 * a backend capability nor independently verifies the canonical chain by RPC. */
export function readDeviceReservationInclusionV1(response: object): DeviceReservationInclusionV1 {
  const row = inclusions.get(response); if (!row) bad(); row.live();
  if (Date.now() >= row.value.expiresAt) bad(); return row.value;
}
