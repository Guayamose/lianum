import type {DeviceDepositConsentV1,DeviceDepositWitnessV1} from './device-deposit-consent-v1.mjs';
export const DEVICE_NATIVE_PRIVATE_DEPOSIT_V2:'LIANUM_DEVICE_ORIGINAL_D26_PRIVATE_V2';
export const DEVICE_NATIVE_PRIVATE_PROOF_V2:'ORIGINAL_NATIVE_DEVICE_D26_PRIVATE_TRANSIT_V2';
export type NativePrivateDepositConsentV2=Readonly<Omit<DeviceDepositConsentV1,'version'|'profile'|'openingDisclosure'>&{
 version:2;profile:typeof DEVICE_NATIVE_PRIVATE_DEPOSIT_V2;
 openingDisclosure:'ENCRYPTED_D26_OPENING_TO_ORIGINAL_NATIVE_RECIPIENT'|null;
 privateProof:Readonly<{profile:typeof DEVICE_NATIVE_PRIVATE_PROOF_V2;recipient:Readonly<{type:'flat-private-proof-input-ready';
 profile:'ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1';relation:'deposit_balance';role:'owner';jobId:string;recipientPublicKey:string}>;transcriptSHA256:string}>|null}>;
export type DeviceDepositConsentEitherV2=DeviceDepositConsentV1|NativePrivateDepositConsentV2;
export function normalizeNativePrivateDepositConsentV2(raw:unknown):NativePrivateDepositConsentV2;
export function normalizeDeviceDepositConsentEitherV2(raw:unknown):DeviceDepositConsentEitherV2;
export function validateDeviceDepositConsentEitherFreshV2(raw:unknown,now?:number):DeviceDepositConsentEitherV2;
export function deviceDepositConsentEitherMessageV2(raw:unknown):Uint8Array;
export function nativePrivateDepositTranscriptBytesV2(raw:unknown):Uint8Array;
export function nativePrivateDepositPublicInputsV2(raw:unknown):string[];
export {normalizeDeviceDepositWitnessV1,deviceDepositWitnessBytesV1} from './device-deposit-consent-v1.mjs';
