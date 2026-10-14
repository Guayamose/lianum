export type DevicePagedSourceRecoveryViewV4=Readonly<{
 profile:'DEVICE_PAGED_SOURCE_RECOVERY_VIEW_V4';current:false;canOperate:false;
 pairingId:string;walletRootId:string;sourceRevision:string;graphId:string|null;
 phase:'BUILDING'|'SIGNING'|'PREPARED'|'RESERVED'|'FULFILLED'|'RECOVERED';
 nodes:string|null;pages:string|null;consultedAt:number;connectionDeadline:number;
 authorizationDeadline:number|null;authorizationRevoked:boolean|null;pendingChannelIntent:boolean;
}>;
export function readDevicePagedSourceRecoveryViewV4(profile:string,signal:AbortSignal):Promise<DevicePagedSourceRecoveryViewV4>;
