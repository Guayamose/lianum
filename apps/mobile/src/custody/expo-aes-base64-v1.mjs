/** Fixed Expo AES boundary: Android fromCombined accepts bytes, not base64.
 * Persisted envelopes stay byte-for-byte unchanged. Only the transient decoded
 * ciphertext is wiped here; the caller owns the returned plaintext. */
import * as Crypto from 'expo-crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const maximumEncodedBytes = 4 * Math.ceil((2 * 1024 * 1024 + 28) / 3);
const fail = code => { throw Error(code); };

function decode(serialized, maximum) {
  if (!Number.isSafeInteger(maximum) || maximum < 40 || maximum > maximumEncodedBytes
    || typeof serialized !== 'string' || serialized.length < 40 || serialized.length > maximum
    || serialized.length % 4 !== 0
    || /^[A-Za-z0-9+/]*={0,2}$/.exec(serialized)?.[0] !== serialized)
    fail('MOBILE_CUSTODY_AES_BASE64');
  const padding = serialized.endsWith('==') ? 2 : serialized.endsWith('=') ? 1 : 0;
  if ((padding === 2 && (alphabet.indexOf(serialized.at(-3)) & 15) !== 0)
    || (padding === 1 && (alphabet.indexOf(serialized.at(-2)) & 3) !== 0))
    fail('MOBILE_CUSTODY_AES_BASE64');
  const length = serialized.length / 4 * 3 - padding;
  if (length < 28) fail('MOBILE_CUSTODY_AES_BASE64');
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (let i = 0; i < serialized.length; i += 4) {
    const a = alphabet.indexOf(serialized[i]), b = alphabet.indexOf(serialized[i + 1]);
    const c = serialized[i + 2] === '=' ? 0 : alphabet.indexOf(serialized[i + 2]);
    const d = serialized[i + 3] === '=' ? 0 : alphabet.indexOf(serialized[i + 3]);
    const value = (a << 18) | (b << 12) | (c << 6) | d;
    bytes[offset++] = value >>> 16;
    if (offset < length) bytes[offset++] = value >>> 8;
    if (offset < length) bytes[offset++] = value;
  }
  return bytes;
}

export async function decryptExpoAesBase64V1(serialized, key, options, maxSerializedBytes) {
  if (arguments.length !== 4 || options?.output !== 'bytes'
    || !(options.additionalData instanceof Uint8Array))
    fail('MOBILE_CUSTODY_AES_DECRYPT');
  const combined = decode(serialized, maxSerializedBytes);
  try {
    const sealed = Crypto.AESSealedData.fromCombined(combined, { ivLength: 12, tagLength: 16 });
    const clear = await Crypto.aesDecryptAsync(sealed, key, options);
    if (!(clear instanceof Uint8Array)) fail('MOBILE_CUSTODY_AES_DECRYPT');
    return clear;
  } catch {
    fail('MOBILE_CUSTODY_AES_DECRYPT');
  } finally {
    combined.fill(0);
  }
}
