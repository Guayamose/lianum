/** Fixed Expo native AEAD implementation for the private mobile branches.
 * The platform-neutral account SDK loads this dependency only for V2 proofs. */
export { getRandomBytesAsync, AESEncryptionKey, aesEncryptAsync } from 'expo-crypto';
