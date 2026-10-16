import type {ExternalFlatDescriptor} from './device-external-flat-note-v1.mjs';
export const DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7:'DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7';
export type DeviceSepoliaDefiConnectionV7=Readonly<{
  format:typeof DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7;descriptor:ExternalFlatDescriptor;
  transport:Readonly<{type:'ANDROID_PINNED_TLS_V1';certificatePEM:string;certificateSHA256:string}>;
  protocol:'AAVE_STATIC'|'MORPHO_V2';underlying:Readonly<{symbol:'USDC';decimals:6;address:string}>;
  terms:Readonly<{shareWithdrawalRecipient:string;underlyingReceiver:string|null;maximumInputAtomic:string;minimumAssetsAtomic:string}>;
  paegSource?:Readonly<{descriptor:import('./device-paged-owner-v3.mjs').DevicePagedDescriptorV3;preparation:ReturnType<typeof import('./device-paged-graph-v3.mjs').normalizeDevicePagedNativePreparationV3>}>;
}>;
export function normalizeDeviceSepoliaDefiConnectionV7(raw:unknown):DeviceSepoliaDefiConnectionV7;
