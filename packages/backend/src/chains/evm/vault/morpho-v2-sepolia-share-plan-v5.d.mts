import type {DeviceSepoliaMorphoBatchReviewV5} from '@lianum/mobile-protocol/device/sepolia-morpho-batch-review-v5';
import type {DeviceSepoliaDefiSharePlanV4,DeviceSepoliaDefiShareNoteV4} from '@lianum/mobile-protocol/device/sepolia-defi-share-plan-v4';
export type OriginalMorphoSharePlanQuotesV5=Readonly<{profile:'ORIGINAL_MORPHO_V2_SEPOLIA_SHARE_PLAN_QUOTES_V5';plan:DeviceSepoliaDefiSharePlanV4;maximumNodes:number;networkId:string;genesis:string;shareAsset:string;underlying:string;underlyingDecimals:6;maximumInputAtomic:string;notes:ReadonlyArray<DeviceSepoliaDefiShareNoteV4&Readonly<{maximumInputAtomic:string;estimatedUnderlyingAtomic:string;head:Readonly<{number:string;hash:string;timestamp:string}>}>>;quoteIsAuthorization:false;originalCustodyPerNoteRequired:true;aggregateReviewRequired:true}>;
export function quoteOriginalMorphoV2SepoliaSharePlanV5(venue:object,input:{totalSharesAtomic:string;maximumNodes:number}):Promise<OriginalMorphoSharePlanQuotesV5>;
export function readOriginalMorphoV2SepoliaSharePlanQuotesV5(venue:object,data:OriginalMorphoSharePlanQuotesV5):OriginalMorphoSharePlanQuotesV5;

export function buildOriginalMorphoV2SepoliaShareBatchReviewV5(venue:object,data:OriginalMorphoSharePlanQuotesV5,input:{reference:string;notes:DeviceSepoliaMorphoBatchReviewV5['notes']}):DeviceSepoliaMorphoBatchReviewV5;
