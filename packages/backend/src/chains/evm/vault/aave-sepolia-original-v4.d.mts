import type {OriginalReadonlyRuntime,OriginalAaveVenue,AaveReadonlyView,AaveShareQuote,Atomic,Hex,BlockTag} from '../../../defi/vaults/aave-sepolia-types-v4.d.mts';
export function createOriginalAaveSepoliaVenueV4(runtime:OriginalReadonlyRuntime):Promise<OriginalAaveVenue>;
export function assertOriginalAaveSepoliaVenueV4(runtime:OriginalReadonlyRuntime,venue:OriginalAaveVenue):void;
export function readOriginalAaveSepoliaVenueV4(venue:OriginalAaveVenue,tag?:BlockTag):Promise<AaveReadonlyView>;
export function quoteOriginalAaveSepoliaSharesV4(venue:OriginalAaveVenue,shares:Atomic):Promise<AaveShareQuote>;
export function readOriginalAaveSepoliaPublicPositionV4(venue:OriginalAaveVenue,holder:Hex,shares:Atomic,tag?:BlockTag):Promise<AaveReadonlyView>;
export function closeOriginalAaveSepoliaVenueV4(venue:OriginalAaveVenue):void;
