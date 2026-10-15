import type {ExternalFlatDescriptor} from './device-external-flat-note-v1.mjs';
export type DeviceSepoliaDefiReviewV4={profile:'DEVICE_SEPOLIA_DEFI_REVIEW_V4';protocol:'AAVE_STATIC'|'MORPHO_V2';action:'INVEST'|'REDEEM';descriptor:ExternalFlatDescriptor;rootId:string;noteRevision:number;reference:string;shares:string;maximumInputAtomic:string|null;minimumAssetsAtomic:string|null;underlyingReceiver:string;shareWithdrawalRecipient:string;validFrom:string;validUntil:string;receiptCommitment:string|null};
export type DeviceSepoliaDefiReviewChallengeV4={profile:'DEVICE_SEPOLIA_DEFI_REVIEW_CHALLENGE_V4';review:DeviceSepoliaDefiReviewV4;challengeId:string;nonce:string;expiresAt:number};
export const DEVICE_SEPOLIA_DEFI_REVIEW_V4:'DEVICE_SEPOLIA_DEFI_REVIEW_V4';
export const DEVICE_SEPOLIA_DEFI_REVIEW_CHALLENGE_V4:'DEVICE_SEPOLIA_DEFI_REVIEW_CHALLENGE_V4';
export function normalizeDeviceSepoliaDefiReviewV4(raw:unknown):DeviceSepoliaDefiReviewV4;
export function normalizeDeviceSepoliaDefiReviewChallengeV4(raw:unknown):DeviceSepoliaDefiReviewChallengeV4;
export function validateDeviceSepoliaDefiReviewFreshV4(raw:unknown,now?:number):DeviceSepoliaDefiReviewChallengeV4;
export function deviceSepoliaDefiReviewPermissionMessageV4(raw:unknown):Uint8Array;
