export type DeviceCustodyBackupBindingV1 = Readonly<{
  profile: 'DEVICE_IDENTITY_CUSTODY_V1' | 'DEVICE_EXTERNAL_FLAT_CUSTODY_V1' | 'DEVICE_PAGED_NOTE_CUSTODY_V3' | 'DEVICE_WALLET_RECOVERY_MANIFEST_V1';
  devicePublicKey: string;
  routeSHA256: string | null;
}> | Readonly<{ profile: 'DEVICE_NATIVE_ROOT_NOTE_CUSTODY_V1'; rootId: string }>;
export const DEVICE_CUSTODY_BACKUP_MAX_CLEAR_BYTES_V1: 65536;
export const DEVICE_CUSTODY_BACKUP_MAX_SERIALIZED_BYTES_V1: 98304;
export const DEVICE_NATIVE_ROOT_NOTE_BACKUP_MAX_CLEAR_BYTES_V1: 99328;
export const DEVICE_NATIVE_ROOT_NOTE_BACKUP_MAX_SERIALIZED_BYTES_V1: 135168;
export function sealDeviceCustodyBackupV1(clearBytes: Uint8Array, passphrase: string, binding: DeviceCustodyBackupBindingV1, signal?: AbortSignal): Promise<string>;
export function unsealDeviceCustodyBackupV1(serialized: string, passphrase: string, expectedBinding: DeviceCustodyBackupBindingV1, signal?: AbortSignal): Promise<Uint8Array>;
