import type {DevicePagedSourceRenewalChallengeDataV4,DevicePagedSourceRenewalReplyDataV4} from '@lianum/mobile-protocol/device/paged-source-renewal-v4';
export type OriginalSourceRenewalWireReplyV4=Readonly<{data:DevicePagedSourceRenewalReplyDataV4;challenge:DevicePagedSourceRenewalChallengeDataV4}>;
export function createDevicePagedSourceRenewalWireV4(raw:{sourceToken:object;transport:Readonly<{close:()=>Promise<void>}>;descriptor:any;guard:()=>Promise<void>}):Promise<any>;
export function readDevicePagedSourceRenewalWireChallengeV4(raw:unknown):Promise<Readonly<{descriptor:any;challenge:DevicePagedSourceRenewalChallengeDataV4}>>;
export function readDevicePagedSourceRenewalWireReplyV4(raw:unknown,sourceToken:object):Promise<OriginalSourceRenewalWireReplyV4>;
