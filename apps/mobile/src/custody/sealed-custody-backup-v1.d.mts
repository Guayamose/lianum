export type DeviceCustodyBackupBindingV1 = Readonly<{
  profile: 'DEVICE_IDENTITY_CUSTODY_V1' | 'DEVICE_EXTERNAL_FLAT_CUSTODY_V1';
  devicePublicKey: string;
  routeSHA256: string | null;
}>;
export const DEVICE_CUSTODY_BACKUP_MAX_CLEAR_BYTES_V1: 65536;
export const DEVICE_CUSTODY_BACKUP_MAX_SERIALIZED_BYTES_V1: 98304;
export function sealDeviceCustodyBackupV1(clearBytes: Uint8Array, passphrase: string, binding: DeviceCustodyBackupBindingV1, signal?: AbortSignal): Promise<string>;
export function unsealDeviceCustodyBackupV1(serialized: string, passphrase: string, expectedBinding: DeviceCustodyBackupBindingV1, signal?: AbortSignal): Promise<Uint8Array>;
