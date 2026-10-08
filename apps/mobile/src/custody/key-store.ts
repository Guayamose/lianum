import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { mobileAuthorizationMessage, validateMobileChallenge, mobileReceiptMessage,
  validateMobileReceiptReview, type MobileChallenge, type MobileReceiptReview } from '@lianum/mobile-protocol';
import { normalizeOriginalAccountAccessV2, normalizeOriginalAccountReviewV2,
  validateOriginalAccountFreshV2, originalAccountAccessMessageV2, originalAccountReviewMessageV2 }
  from '@lianum/mobile-protocol/original-account-v2';
import { privateStateAccessMessageV1, privateStateReviewMessageV1 }
  from '@lianum/mobile-protocol/original-account-v2';
import { bytesToHex, privateKeyFromHex, devicePublicKey, signDeviceMessage } from './signing.mjs';
import { validateDeviceDepositConsentFreshV1, deviceDepositConsentMessageV1 }
  from '../../../../packages/mobile-protocol/src/device-deposit-consent-v1.mjs';

import { validateDeviceReservationConsentFreshV1, deviceReservationConsentMessageV1 }
  from '../../../../packages/mobile-protocol/src/device-reservation-consent-v1.mjs';

const PRIVATE_KEY = 'lianum.owner.secp256k1.v1';
const PUBLIC_KEY = 'lianum.owner.public.v1';
const privateOptions: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'org.lianum.wallet.owner.authenticated.v1',
  authenticationPrompt: 'Confirma esta autorización de Lianum',
};
const publicOptions: SecureStore.SecureStoreOptions = { keychainService: 'org.lianum.wallet.owner.public.v1' };
async function assertProtectedStorage() {
  if (!['ios', 'android'].includes(Platform.OS) || !await SecureStore.isAvailableAsync()
    || !SecureStore.canUseBiometricAuthentication()
    || !await LocalAuthentication.hasHardwareAsync() || !await LocalAuthentication.isEnrolledAsync())
    throw new Error('MOBILE_PROTECTED_STORAGE_UNAVAILABLE');
}
export async function readDevicePublicKey(): Promise<string | null> {
  await assertProtectedStorage();
  const value = await SecureStore.getItemAsync(PUBLIC_KEY, publicOptions);
  if (value !== null && !/^04[0-9a-f]{128}$/.test(value)) throw new Error('MOBILE_PUBLIC_KEY_INVALID');
  return value;
}
export async function createDeviceIdentity(): Promise<string> {
  await assertProtectedStorage();
  const approval = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Crear o recuperar tu identidad local de Lianum',
    cancelLabel: 'Cancelar', disableDeviceFallback: true, biometricsSecurityLevel: 'strong',
  });
  if (!approval.success) throw new Error('MOBILE_AUTHENTICATION_CANCELLED');
  // Never silently replace an existing private key when its public metadata is
  // missing. Read/repair the original first; invalidated storage requires the
  // user to follow the documented recovery path, not automatic key rotation.
  let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, privateOptions);
  const publicMetadata = await SecureStore.getItemAsync(PUBLIC_KEY, publicOptions);
  if (retained === null && publicMetadata !== null) throw new Error('MOBILE_KEY_RECOVERY_REQUIRED');
  let privateKey: Uint8Array | undefined;
  try {
    if (retained !== null) privateKey = privateKeyFromHex(retained);
    else {
      for (let attempt = 0; attempt < 16; attempt++) {
        const entropy = await Crypto.getRandomBytesAsync(32);
        try { privateKey = privateKeyFromHex(bytesToHex(entropy)); break; }
        catch { /* Zero/out-of-range draws are rejected, never weakened. */ }
        finally { entropy.fill(0); }
      }
      if (!privateKey) throw new Error('MOBILE_ENTROPY_FAILED');
      await SecureStore.setItemAsync(PRIVATE_KEY, bytesToHex(privateKey), privateOptions);
    }
    const publicKey = devicePublicKey(privateKey);
    if (publicMetadata !== null && publicMetadata !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    await SecureStore.setItemAsync(PUBLIC_KEY, publicKey, publicOptions);
    return publicKey;
  } finally { privateKey?.fill(0); retained = null; }
}
export async function signReviewedChallenge(challenge: MobileChallenge, expectedOrigin: string,
  allowInsecureLocalhost = false): Promise<string> {
  await assertProtectedStorage();
  const publicKey = await readDevicePublicKey();
  if (publicKey === null) throw new Error('MOBILE_KEY_REQUIRED');
  const checked = validateMobileChallenge(challenge, { origin: expectedOrigin, ownerPublicKey: publicKey, allowInsecureLocalhost });
  let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, privateOptions);
  if (retained === null) throw new Error('MOBILE_KEY_RECOVERY_REQUIRED');
  const privateKey = privateKeyFromHex(retained);
  try {
    if (devicePublicKey(privateKey) !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    // Authentication may take time: reject an expired permission after the
    // protected read as well, before any signature or network transmission.
    validateMobileChallenge(checked, { origin: expectedOrigin, ownerPublicKey: publicKey, allowInsecureLocalhost });
    return signDeviceMessage(privateKey, mobileAuthorizationMessage(checked, { allowInsecureLocalhost }));
  } finally { privateKey.fill(0); retained = null; }
}
export async function signReviewedReceipt(review: MobileReceiptReview, expectedOrigin: string,
  allowInsecureLocalhost = false): Promise<string> {
  await assertProtectedStorage();
  const publicKey = await readDevicePublicKey();
  if (publicKey === null) throw new Error('MOBILE_KEY_REQUIRED');
  const checked = validateMobileReceiptReview(review, {
    origin: expectedOrigin, ownerPublicKey: publicKey, allowInsecureLocalhost,
  });
  let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, {
    ...privateOptions, authenticationPrompt: 'Consultar el permiso original de Lianum',
  });
  if (retained === null) throw new Error('MOBILE_KEY_RECOVERY_REQUIRED');
  const privateKey = privateKeyFromHex(retained);
  try {
    if (devicePublicKey(privateKey) !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    validateMobileReceiptReview(checked, { origin: expectedOrigin, ownerPublicKey: publicKey, allowInsecureLocalhost });
    return signDeviceMessage(privateKey, mobileReceiptMessage(checked, { allowInsecureLocalhost }));
  } finally { privateKey.fill(0); retained = null; }
}
type OriginalAccessV2 = ReturnType<typeof normalizeOriginalAccountAccessV2>;
type OriginalReviewV2 = ReturnType<typeof normalizeOriginalAccountReviewV2>;
// Only these two reviewed domains are exposed. This helper stays private:
// protected storage never offers a general arbitrary-message signing API.
async function signOriginalAccountPermissionV2(raw: OriginalAccessV2 | OriginalReviewV2,
  expectedOrigin: string, expectedPairingId: string, phase: 'access' | 'review',
  purpose: 'diagnostic' | 'private-state' = 'diagnostic'): Promise<string> {
  await assertProtectedStorage();
  const publicKey = await readDevicePublicKey();
  if (publicKey === null) throw new Error('MOBILE_KEY_REQUIRED');
  const checked = phase === 'access' ? normalizeOriginalAccountAccessV2(raw) : normalizeOriginalAccountReviewV2(raw);
  const current = () => {
    if (checked.origin !== expectedOrigin || checked.pairingId !== expectedPairingId
      || checked.devicePublicKey !== publicKey) throw new Error('MOBILE_REVIEW_CHANGED');
    validateOriginalAccountFreshV2(checked);
  };
  current();
  if (purpose === 'private-state' && checked.action !== 'read') throw new Error('MOBILE_PRIVATE_STATE_INVALID');
  let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, {
    ...privateOptions, authenticationPrompt: purpose === 'private-state'
      ? phase === 'access' ? 'Mostrar qué cuenta y pool podrán revelar su saldo privado'
        : 'Leer el saldo privado actual de esta cuenta y este pool; sin enviar fondos'
      : phase === 'access' ? 'Mostrar la revisión privada de tu cuenta original'
        : 'Consultar o reconciliar esta petición original',
  });
  if (retained === null) throw new Error('MOBILE_KEY_RECOVERY_REQUIRED');
  const privateKey = privateKeyFromHex(retained);
  try {
    if (devicePublicKey(privateKey) !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    if (await readDevicePublicKey() !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    current();
    const message = purpose === 'private-state'
      ? phase === 'access' ? privateStateAccessMessageV1(checked) : privateStateReviewMessageV1(checked)
      : checked.profile === 'LIANUM_ORIGINAL_ACCOUNT_ACCESS_V2' ? originalAccountAccessMessageV2(checked)
        : originalAccountReviewMessageV2(checked);
    return signDeviceMessage(privateKey, message);
  } finally { privateKey.fill(0); retained = null; }
}
export function signOriginalAccountAccessV2(value: OriginalAccessV2, origin: string, pairingId: string): Promise<string> {
  return signOriginalAccountPermissionV2(value, origin, pairingId, 'access');
}
export function signOriginalAccountReviewV2(value: OriginalReviewV2, origin: string, pairingId: string): Promise<string> {
  return signOriginalAccountPermissionV2(value, origin, pairingId, 'review');
}

/** Explicit protected signing for account/pool balance disclosure. These
 * signatures cannot be used for diagnostic/reconcile or native note spending. */
export function signOriginalPrivateStateAccessV1(value: OriginalAccessV2, origin: string, pairingId: string): Promise<string> {
  return signOriginalAccountPermissionV2(value, origin, pairingId, 'access', 'private-state');
}
export function signOriginalPrivateStateReviewV1(value: OriginalReviewV2, origin: string, pairingId: string): Promise<string> {
  return signOriginalAccountPermissionV2(value, origin, pairingId, 'review', 'private-state');
}
/** Only these fixed D26 domains, never an arbitrary-message signing callback.
 * This is the device transport identity; the circuit verifies the separate
 * note key/signature hidden in its opening. */
export async function signDeviceDepositConsentV1(raw: Parameters<typeof validateDeviceDepositConsentFreshV1>[0],
  expectedOrigin: string, expectedPairingId: string): Promise<string> {
  await assertProtectedStorage(); const publicKey = await readDevicePublicKey();
  if (publicKey === null) throw new Error('MOBILE_KEY_REQUIRED');
  const value = validateDeviceDepositConsentFreshV1(raw);
  const current = () => { validateDeviceDepositConsentFreshV1(value);
    if (value.origin !== expectedOrigin || value.pairingId !== expectedPairingId || value.devicePublicKey !== publicKey)
      throw new Error('MOBILE_REVIEW_CHANGED'); };
  current(); let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, { ...privateOptions,
    authenticationPrompt: value.action === 'PROVE_D26'
      ? 'Revelar únicamente la apertura de esta nota al worker D26; conserva la raíz y la clave en el teléfono'
      : value.action === 'FUND_D26' ? 'Financiar una sola vez esta nota de ' + value.statement.amount + ' unidades'
        : 'Consultar el envío original de esta nota; no reenviar ni generar otra prueba' });
  if (retained === null) throw new Error('MOBILE_KEY_RECOVERY_REQUIRED');
  const key = privateKeyFromHex(retained);
  try {
    if (devicePublicKey(key) !== publicKey || await readDevicePublicKey() !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    current(); return signDeviceMessage(key, deviceDepositConsentMessageV1(value));
  } finally { key.fill(0); retained = null; }
}

/** Fixed U/S consent domains. The transport identity signs the original
 * opening-disclosure/job statement; the distinct source note key signs H4.
 * Neither protected key is serialized into a proof job. */
export async function signDeviceReservationConsentV1(raw: Parameters<typeof validateDeviceReservationConsentFreshV1>[0],
  expectedOrigin: string, expectedPairingId: string): Promise<string> {
  await assertProtectedStorage(); const publicKey = await readDevicePublicKey();
  if (publicKey === null) throw new Error('MOBILE_KEY_REQUIRED');
  const value = validateDeviceReservationConsentFreshV1(raw);
  const current = () => { validateDeviceReservationConsentFreshV1(value);
    if (value.origin !== expectedOrigin || value.pairingId !== expectedPairingId || value.devicePublicKey !== publicKey)
      throw new Error('MOBILE_REVIEW_CHANGED'); };
  current(); let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, { ...privateOptions,
    authenticationPrompt: value.action === 'PROVE_U'
      ? 'Revelar sólo las aperturas de este grafo al worker U; ninguna raíz ni clave privada'
      : value.action === 'RESERVE_S' ? 'Reservar una sola vez esta nota; cambio y recuperación ya están cifrados'
        : 'Consultar esta reserva original; no repetir la prueba ni el envío' });
  if (retained === null) throw new Error('MOBILE_KEY_RECOVERY_REQUIRED');
  const key = privateKeyFromHex(retained); let message: Uint8Array | null = null;
  try {
    if (devicePublicKey(key) !== publicKey || await readDevicePublicKey() !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    current(); message = deviceReservationConsentMessageV1(value);
    return signDeviceMessage(key, message);
  } finally { message?.fill(0); key.fill(0); retained = null; }
}
