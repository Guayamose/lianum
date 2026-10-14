export const DEVICE_PAGED_CHANNEL_LEASE_V4:'DEVICE_PAGED_ORIGINAL_CHANNEL_LEASE_V4';
export const DEVICE_PAGED_CHANNEL_LEASE_ACCESS_V4:'READ_RECOVER_EXISTING_TERMS';
export const DEVICE_PAGED_CHANNEL_LEASE_MAX_MS_V4:number;
export type DevicePagedChannelSourceBindingDataV4=Readonly<{descriptorSHA256:string;pairingId:string;devicePublicKey:string}>;
export type DevicePagedChannelSourceLineageDataV4=Readonly<{walletRootId:string;sourceRevision:string;sourceId:string|null}>;
/** Data only. This type contains no live or signing capability. */
export type DevicePagedChannelLeaseDataV4=Readonly<{
 profile:typeof DEVICE_PAGED_CHANNEL_LEASE_V4;
 sourceBinding:DevicePagedChannelSourceBindingDataV4;
 source:DevicePagedChannelSourceLineageDataV4|null;
 intentId:string;leaseId:string;generation:string;predecessorLeaseId:string|null;
 issuedAt:number;expiresAt:number;access:typeof DEVICE_PAGED_CHANNEL_LEASE_ACCESS_V4;
}>;
export function devicePagedChannelSourceBindingDataV4(rawDescriptor:unknown):DevicePagedChannelSourceBindingDataV4;
export function normalizeDevicePagedChannelLeaseDataV4(raw:unknown,rawDescriptor:unknown):DevicePagedChannelLeaseDataV4;
export function normalizeDevicePagedChannelLeaseTransitionDataV4(previousRaw:unknown|null,nextRaw:unknown,rawDescriptor:unknown):DevicePagedChannelLeaseDataV4;
