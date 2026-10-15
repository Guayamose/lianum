import type {OriginalReadonlyRuntime,OriginalMorphoV2Venue,MorphoV2ReadonlyView,MorphoV2ShareQuote,Atomic,Hex,BlockTag} from '../../../defi/vaults/morpho-v2-sepolia-types-v4.d.mts';
export function createOriginalMorphoV2SepoliaVenueV4(runtime:OriginalReadonlyRuntime):Promise<OriginalMorphoV2Venue>;
export function assertOriginalMorphoV2SepoliaVenueV4(runtime:OriginalReadonlyRuntime,venue:OriginalMorphoV2Venue):void;
export function readOriginalMorphoV2SepoliaVenueV4(venue:OriginalMorphoV2Venue,tag?:BlockTag):Promise<MorphoV2ReadonlyView>;
export function quoteOriginalMorphoV2SepoliaSharesV4(venue:OriginalMorphoV2Venue,shares:Atomic):Promise<MorphoV2ShareQuote>;
export function readOriginalMorphoV2SepoliaPublicPositionV4(venue:OriginalMorphoV2Venue,holder:Hex,shares:Atomic,tag?:BlockTag):Promise<MorphoV2ReadonlyView>;
export function closeOriginalMorphoV2SepoliaVenueV4(venue:OriginalMorphoV2Venue):void;
