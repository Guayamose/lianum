/** Fixed native Expo TLS transport; no caller fetch/executor/observer callback.
 * This brand authenticates this client's consent-bound service observation.
 * Chain authority remains the original backend reader/observer, never this DTO.
 * No full proof/root/private key crosses this boundary. */
import * as Crypto from 'expo-crypto';
import { createOriginalAccountApiV2 } from './original-account-api-v2.mjs';
import { validateDeviceDepositConsentEitherFreshV2 as validateDeviceDepositConsentFreshV1, deviceDepositConsentEitherMessageV2 as deviceDepositConsentMessageV1, type DeviceDepositConsentEitherV2 as DeviceDepositConsentV1 }
  from '../../../../packages/mobile-protocol/src/device-native-private-deposit-v2.mjs';
const observations = new WeakMap<object, { live(): void; value: DeviceDepositInclusionV1 }>();
export type DeviceDepositInclusionV1 = Readonly<{ version: 1; profile: 'ORIGINAL_DEVICE_D26_INCLUSION_V1';
  jobId: string; rootId: string; commitment: string; amount: string; assetId: string; pool: string;
  scope: string; policy: string; genesis: string; domainCommitment: string; proofSHA256: string;
  publicInputsSHA256: string; transactionHash: string; calldataSHA256: string; receiptBlockHash: string;
  head: { number: string; hash: string; timestamp: string }; path: { root: string; index: number; leaf: string; siblings: string[] };
  nullifier: string; observedAt: number; expiresAt: number; nativeEffectsEstablished: true;
  mobileKeyCustody: true; backendOpeningDisclosure: 'ONE_D26_OPENING'; mobileCanonicalRpcVerification: false }>;
function bad(): never { throw new Error('MOBILE_DEVICE_DEPOSIT_RESPONSE_INVALID'); }
function exact(raw: unknown, fields: string[]): Record<string, unknown> {
  if (!raw || Object.getPrototypeOf(raw) !== Object.prototype || Reflect.ownKeys(raw).length !== fields.length
    || !fields.every(field => Object.hasOwn(Object.getOwnPropertyDescriptor(raw, field) ?? {}, 'value'))) bad();
  return raw as Record<string, unknown>;
}
const hex = (raw: unknown, width = 64): string => {
  if (typeof raw !== 'string' || !new RegExp('^[0-9a-f]{' + width + '}$').test(raw)) bad(); return raw;
};
const uint = (raw: unknown): string => {
  if (typeof raw !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(raw) || BigInt(raw) >= (1n << 64n)) bad(); return raw;
};
async function sha(bytes: Uint8Array): Promise<string> {
  const owned = new Uint8Array(bytes.byteLength); owned.set(bytes);
  try { return Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, owned)),
    value => value.toString(16).padStart(2, '0')).join(''); }
  finally { owned.fill(0); }
}
function bytes(hex: string): Uint8Array { return Uint8Array.from(hex.match(/../g)!, value => parseInt(value, 16)); }
async function inclusion(raw: unknown, consent: DeviceDepositConsentV1): Promise<DeviceDepositInclusionV1> {
  const row = exact(raw, ['version', 'profile', 'jobId', 'rootId', 'commitment', 'amount', 'assetId', 'pool', 'scope', 'policy',
    'genesis', 'domainCommitment', 'proofSHA256', 'publicInputsSHA256', 'transactionHash', 'calldataSHA256',
    'receiptBlockHash', 'head', 'path', 'nullifier', 'observedAt', 'expiresAt', 'nativeEffectsEstablished',
    'mobileKeyCustody', 'backendOpeningDisclosure', 'mobileCanonicalRpcVerification']);
  if (row.version !== 1 || row.profile !== 'ORIGINAL_DEVICE_D26_INCLUSION_V1' || row.nativeEffectsEstablished !== true
    || row.mobileKeyCustody !== true || row.backendOpeningDisclosure !== 'ONE_D26_OPENING'
    || row.mobileCanonicalRpcVerification !== false) bad();
  for (const key of ['jobId', 'rootId', 'commitment', 'assetId', 'scope', 'policy', 'genesis', 'domainCommitment',
    'proofSHA256', 'publicInputsSHA256', 'transactionHash', 'calldataSHA256', 'receiptBlockHash', 'nullifier']) hex(row[key]);
  hex(row.pool, 40); uint(row.amount);
  if (row.jobId !== consent.jobId || row.rootId !== consent.rootId || row.commitment !== consent.statement.output
    || row.amount !== consent.statement.amount || row.scope !== consent.statement.scope || row.policy !== consent.statement.policy
    || row.assetId !== consent.binding.assetId || row.pool !== consent.binding.asset.pool || row.genesis !== consent.binding.asset.genesis
    || row.domainCommitment !== consent.poolTerms.domainCommitment || row.proofSHA256 !== consent.proofSHA256
    || row.publicInputsSHA256 !== consent.publicInputsSHA256) bad();
  const head = exact(row.head, ['number', 'hash', 'timestamp']); uint(head.number); uint(head.timestamp); hex(head.hash);
  const path = exact(row.path, ['root', 'index', 'leaf', 'siblings']); hex(path.root); hex(path.leaf);
  if (!Number.isInteger(path.index) || Number(path.index) < 0 || Number(path.index) >= 64
    || path.leaf !== row.commitment || !Array.isArray(path.siblings) || path.siblings.length !== 6) bad();
  let root = String(path.leaf), position = Number(path.index);
  for (const sibling of path.siblings) {
    hex(sibling); const pair = position & 1 ? String(sibling) + root : root + String(sibling);
    const message = new Uint8Array(65); message[0] = 1; message.set(bytes(pair), 1);
    root = await sha(message); position >>= 1;
  }
  if (root !== path.root) bad();
  const now = Date.now();
  if (!Number.isSafeInteger(row.observedAt) || Number(row.observedAt) > now || now - Number(row.observedAt) >= 15_000
    || !Number.isSafeInteger(row.expiresAt) || Number(row.expiresAt) <= now
    || Number(row.expiresAt) !== Number(row.observedAt) + 15_000) bad();
  return Object.freeze({ ...row, head: Object.freeze({ ...head }), path: Object.freeze({ ...path,
    siblings: Object.freeze([...path.siblings]) }) }) as unknown as DeviceDepositInclusionV1;
}
/** Paired descriptor comes from explicit operator bootstrap. No device root,
 * note key, runtime URL, callbacks or observer objects can be supplied. */
export async function createDeviceOwnerDepositApiV1(descriptor: { origin: string; pairingId: string; devicePublicKey: string }) {
  if (descriptor.origin.length > 64) throw new Error('MOBILE_LOCAL_ORIGIN_CAPACITY');
  const { fetch: nativeFetch } = await import('expo/fetch');
  const original = createOriginalAccountApiV2({ descriptor, fetchImpl: nativeFetch });
  let closed = false;
  const live = () => { if (closed) throw new Error('MOBILE_DEVICE_DEPOSIT_CLIENT_CLOSED'); };
  return Object.freeze({ descriptor: original.descriptor,
    async access() { live(); const value = await original.challenge('read'); live(); return value; },
    async challengeJob(input: Parameters<typeof original.deviceDeposit.challengeJob>[0]) {
      live(); const value = await original.deviceDeposit.challengeJob(input); live(); return value;
    },
    async challenge(action: 'FUND_D26' | 'OBSERVE_D26', input: Parameters<typeof original.deviceDeposit.challenge>[1]) {
      live(); const value = await original.deviceDeposit.challenge(action, input); live(); return value;
    },
    async submit(input: Parameters<typeof original.deviceDeposit.submit>[0]) {
      live(); const consent = validateDeviceDepositConsentFreshV1(input.consent);
      const response: unknown = await original.deviceDeposit.submit(input); live();
      if (consent.action === 'PROVE_D26') {
        const row = exact(response, ['jobId', 'stage', 'consentFields', 'statement', 'observation', 'errorCode']);
        if (row.jobId !== consent.jobId || row.stage !== 'PROVED' || row.observation !== null || row.errorCode !== null) bad();
        return { state: 'PROVED' as const, jobId: consent.jobId, observation: null };
      }
      const row = exact(response, ['jobId', 'stage', 'consentFields', 'statement', 'observation', 'errorCode', 'authorizationSHA256']);
      if (row.jobId !== consent.jobId || row.authorizationSHA256 !== await sha(deviceDepositConsentMessageV1(consent))) bad();
      live();
      if (row.stage === 'FUNDING_UNKNOWN' && row.observation === null)
        return { state: 'UNKNOWN' as const, jobId: consent.jobId, observation: null };
      if (row.stage !== 'CONFIRMED' || row.errorCode !== null) bad();
      const value = await inclusion(row.observation, consent); live();
      const capability = Object.freeze(Object.create(null)); observations.set(capability, { live, value });
      return { state: 'CONFIRMED' as const, jobId: consent.jobId, observation: capability };
    },
    close() { closed = true; },
  });
}
/** A DTO/copy has no provenance. Only this client's completed fixed TLS POST,
 * response bindings and original inclusion path validation issue this handle. */
export function readDeviceDepositInclusionV1(capability: object): DeviceDepositInclusionV1 {
  const row = observations.get(capability); if (!row) bad(); row.live();
  if (Date.now() >= row.value.expiresAt) bad(); return row.value;
}
/** Read-only frozen projection after transport close, within the ORIGINAL
 * inclusion expiry. It cannot be applied to custody or used to spend. */
export function readDeviceDepositDisplayV1(capability: object): DeviceDepositInclusionV1 {
  const row = observations.get(capability); if (!row) bad(); const now = Date.now();
  if (!Number.isSafeInteger(now) || now < row.value.observedAt || now >= row.value.expiresAt) bad();
  return row.value;
}
