import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { mobileAuthorizationMessage, validateMobileChallenge, type MobileChallenge } from '@lianum/mobile-protocol';
import { bytesToHex, privateKeyFromHex, devicePublicKey, signDeviceMessage } from './signing.mjs';

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
