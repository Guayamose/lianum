/** Portable SHA256 + lowS P1363 signatures compatible with the existing owner
 * codecs. The private key argument stays on the device; never serialize it in
 * an API request. Production entropy comes from Expo's async native RNG. */
import { secp256k1 } from '@noble/curves/secp256k1.js';
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
  const signed = secp256k1.sign(message, privateKey, { prehash: true, lowS: true });
  if (!secp256k1.verify(signed, message, secp256k1.getPublicKey(privateKey), { prehash: true, lowS: true }))
    throw new Error('MOBILE_SIGNATURE_INVALID');
  return bytesToHex(signed);
}
