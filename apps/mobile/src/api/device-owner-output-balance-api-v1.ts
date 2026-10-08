/** Explicit one-use original READ. The private handle records a fresh response
 * from this TLS client; it cannot authorize a proof, send or W39 withdrawal. */
import * as Crypto from 'expo-crypto';
import { createOriginalAccountApiV2, type OriginalAccountDescriptorV2 } from './original-account-api-v2.mjs';
import { normalizeOriginalAccountAccessV2, originalAccountAccessMessageV2 } from '@lianum/mobile-protocol/original-account-v2';
import { validateDeviceOutputBalanceFreshV1, type DeviceOutputBalanceV1, type DeviceOutputBalancePathV1 }
  from '../../../../packages/mobile-protocol/src/device-output-balance-v1.mjs';
const observations = new WeakMap<object, { live(): void; value: DeviceOutputBalanceV1 }>();
function bad(): never { throw Error('MOBILE_DEVICE_OUTPUT_BALANCE_RESPONSE_INVALID'); }
async function sha(bytes: Uint8Array) {
  const owned = new Uint8Array(bytes.length); owned.set(bytes);
  try { return Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, owned.buffer)), byte => byte.toString(16).padStart(2, '0')).join(''); }
  finally { owned.fill(0); }
}
async function verifyPath(path: DeviceOutputBalancePathV1) {
  const bytes = (value: string) => Uint8Array.from(value.match(/../g)!, pair => Number.parseInt(pair, 16));
  let root = path.leaf, index = path.index;
  for (const sibling of path.siblings) { const frame = new Uint8Array(65); frame[0] = 1;
    frame.set(bytes(index & 1 ? sibling + root : root + sibling), 1);
    try { root = await sha(frame); } finally { frame.fill(0); } index >>= 1; }
  if (root !== path.root) bad();
}
export async function createDeviceOwnerOutputBalanceApiV1(descriptor: OriginalAccountDescriptorV2) {
  if (descriptor.origin.length > 64) throw Error('MOBILE_LOCAL_ORIGIN_CAPACITY');
  const { fetch: nativeFetch } = await import('expo/fetch');
  const original = createOriginalAccountApiV2({ descriptor, fetchImpl: nativeFetch }); let closed = false, generation = 0;
  const live = () => { if (closed) throw Error('MOBILE_DEVICE_OUTPUT_BALANCE_CLIENT_CLOSED'); };
  return Object.freeze({ descriptor: original.descriptor,
    async access() { live(); const value = await original.challenge('read'); live(); return value; },
    async observe(input: Parameters<typeof original.deviceExecution.outputBalances>[0]) {
      live(); const attempt = ++generation, access = normalizeOriginalAccountAccessV2(input.access);
      const value = validateDeviceOutputBalanceFreshV1(await original.deviceExecution.outputBalances(input)); live();
      const frame = originalAccountAccessMessageV2(access);
      try { if (value.authorizationSHA256 !== await sha(frame)) bad(); } finally { frame.fill(0); }
      for (const name of ['origin', 'pairingId', 'devicePublicKey'] as const) if (value[name] !== original.descriptor[name]) bad();
      for (const name of ['parentJobId', 'rootId', 'noteRevision'] as const) if (value[name] !== input[name]) bad();
      if (value.change.nullifier !== input.changeNullifier || value.recovery.nullifier !== input.recoveryNullifier
        || value.expiresAt > access.expiresAt || value.expiresAt > Date.now() + 15_000) bad();
      if (!value.change.path) bad(); await verifyPath(value.change.path);
      if (value.recovery.path) await verifyPath(value.recovery.path);
      live(); if (generation !== attempt) bad(); validateDeviceOutputBalanceFreshV1(value);
      const handle = Object.freeze(Object.create(null));
      observations.set(handle, { live() { live(); if (generation !== attempt) bad(); }, value }); return handle;
    },
    close() { closed = true; },
  });
}
export function readDeviceOutputBalanceV1(handle: object): DeviceOutputBalanceV1 {
  const row = observations.get(handle); if (!row) bad(); row.live(); validateDeviceOutputBalanceFreshV1(row.value); return row.value;
}
