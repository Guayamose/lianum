import type { AESEncryptionKey } from 'expo-crypto';

export function decryptExpoAesBase64V1(
  serialized: string,
  key: AESEncryptionKey,
  options: Readonly<{ output: 'bytes'; additionalData: Uint8Array }>,
  maxSerializedBytes: number,
): Promise<Uint8Array>;
