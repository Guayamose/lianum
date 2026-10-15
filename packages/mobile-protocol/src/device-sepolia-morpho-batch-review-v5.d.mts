import type {DeviceSepoliaDefiReviewV4} from './device-sepolia-defi-review-v4.mjs';
export const DEVICE_SEPOLIA_MORPHO_BATCH_REVIEW_V5:'DEVICE_SEPOLIA_MORPHO_BATCH_REVIEW_V5';
export type DeviceSepoliaMorphoBatchReviewV5=Readonly<{profile:typeof DEVICE_SEPOLIA_MORPHO_BATCH_REVIEW_V5;reference:string;totalSharesAtomic:string;maximumNodes:number;maximumInputAtomic:string;notes:ReadonlyArray<Readonly<{id:string;review:DeviceSepoliaDefiReviewV4}>>}>;
export function normalizeDeviceSepoliaMorphoBatchReviewV5(raw:unknown):DeviceSepoliaMorphoBatchReviewV5;
