import {normalizeDevicePagedDescriptorV3} from './device-paged-owner-v3.mjs';
export const DEVICE_PAGED_SOURCE_CONTINUATION_V4:'DEVICE_PAGED_SOURCE_CONTINUATION_V4';
export const DEVICE_PAGED_SOURCE_CONTINUATION_COMMAND_V4:'READ_SOURCE_CONTINUATION_V4';
export type DevicePagedSourceContinuationDataV4=Readonly<{
 profile:typeof DEVICE_PAGED_SOURCE_CONTINUATION_V4;
 predecessor:Readonly<{pairingId:string;sourceId:string;walletRootId:string;sourceRevision:string}>;
 descriptor:ReturnType<typeof normalizeDevicePagedDescriptorV3>;walletRootId:string;sourceRevision:string;status:'EMPTY';
}>;
export function normalizeDevicePagedSourceContinuationDataV4(raw:unknown,previousDescriptor:unknown):DevicePagedSourceContinuationDataV4;
export function devicePagedSourceIdentityV4(previousDescriptor:unknown,rawScope:Readonly<{rootId:string;revision:number;commitment:string;nullifier:string;graphId:string|null}>):string;
