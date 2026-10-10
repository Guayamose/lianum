export function bytesToHex(value: Uint8Array): string;
export function privateKeyFromHex(value: string): Uint8Array;
export function devicePublicKey(privateKey: Uint8Array): string;
export function signDeviceMessage(privateKey: Uint8Array, message: Uint8Array): string;
export function signNativePrivateDeviceConsentV2(privateKey: Uint8Array, consent: unknown): string;

export function signDeviceRootNativeClaimPermissionV2(privateKey:Uint8Array,permission:unknown):string;

export function signDeviceRootNativeClaimExitPermissionV3(privateKey:Uint8Array,permission:unknown):string;
