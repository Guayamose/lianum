/** Portable SHA256 + lowS P1363 signatures compatible with the existing owner
 * codecs. The private key argument stays on the device; never serialize it in
 * an API request. Production entropy comes from Expo's async native RNG. */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { DEVICE_NATIVE_PRIVATE_DEPOSIT_V2, validateDeviceDepositConsentEitherFreshV2,
  deviceDepositConsentEitherMessageV2 } from '../../../../packages/mobile-protocol/src/device-native-private-deposit-v2.mjs';
import { DEVICE_NATIVE_PRIVATE_EXIT_V2, validateDeviceExitConsentEitherFreshV2,
  deviceExitConsentEitherMessageV2 } from '../../../../packages/mobile-protocol/src/device-native-private-exit-v2.mjs';
import {DEVICE_NATIVE_PRIVATE_RESERVATION_V2,validateDeviceReservationConsentEitherFreshV2,deviceReservationConsentEitherMessageV2} from '../../../../packages/mobile-protocol/src/device-native-private-reservation-v2.mjs';
export const bytesToHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
export function privateKeyFromHex(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error('MOBILE_KEY_INVALID');
  const key = Uint8Array.from(value.match(/../g), byte => Number.parseInt(byte, 16));
  if (!secp256k1.utils.isValidSecretKey(key)) { key.fill(0); throw new Error('MOBILE_KEY_INVALID'); }
  return key;
}
export function devicePublicKey(privateKey) {
  return bytesToHex(secp256k1.getPublicKey(privateKey, false));
}
export function signDeviceMessage(privateKey, message) {
  if (!(message instanceof Uint8Array) || message.length === 0 || message.length > 4096)
    throw new Error('MOBILE_MESSAGE_INVALID');
  return signCheckedMessage(privateKey, message);
}
function signCheckedMessage(privateKey, message) {
  const signed = secp256k1.sign(message, privateKey, { prehash: true, lowS: true });
  if (!secp256k1.verify(signed, message, secp256k1.getPublicKey(privateKey), { prehash: true, lowS: true }))
    throw new Error('MOBILE_SIGNATURE_INVALID');
  return bytesToHex(signed);
}
/** Only canonical Native V2 D26/W39 consents use their original 8192-byte cap.
 * The legacy arbitrary-frame signer keeps its original 4096-byte boundary. */
export function signNativePrivateDeviceConsentV2(privateKey, raw) {
  const version = raw && Object.getOwnPropertyDescriptor(raw, 'version');
  const profile = raw && Object.getOwnPropertyDescriptor(raw, 'profile');
  if (!version || !Object.hasOwn(version, 'value') || version.value !== 2
    || !profile || !Object.hasOwn(profile, 'value')) throw new Error('MOBILE_NATIVE_PRIVATE_SIGNING_INVALID');
  const deposit = profile.value === DEVICE_NATIVE_PRIVATE_DEPOSIT_V2;
  const authorization=profile.value===DEVICE_NATIVE_PRIVATE_RESERVATION_V2;
  if (!deposit && !authorization && profile.value !== DEVICE_NATIVE_PRIVATE_EXIT_V2) throw new Error('MOBILE_NATIVE_PRIVATE_SIGNING_INVALID');
  const consent = (deposit ? validateDeviceDepositConsentEitherFreshV2 : authorization ? validateDeviceReservationConsentEitherFreshV2 : validateDeviceExitConsentEitherFreshV2)(raw);
  if (consent.devicePublicKey !== devicePublicKey(privateKey)) throw new Error('MOBILE_KEY_BINDING_CHANGED');
  let message;
  try {
    message = (deposit ? deviceDepositConsentEitherMessageV2 : authorization ? deviceReservationConsentEitherMessageV2 : deviceExitConsentEitherMessageV2)(consent);
    if (!(message instanceof Uint8Array) || message.length === 0 || message.length > 8192)
      throw new Error('MOBILE_MESSAGE_INVALID');
    return signCheckedMessage(privateKey, message);
  } finally { message?.fill(0); }
}
