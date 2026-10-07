export function bytesToHex(value: Uint8Array): string;
export function privateKeyFromHex(value: string): Uint8Array;
export function devicePublicKey(privateKey: Uint8Array): string;
export function signDeviceMessage(privateKey: Uint8Array, message: Uint8Array): string;
