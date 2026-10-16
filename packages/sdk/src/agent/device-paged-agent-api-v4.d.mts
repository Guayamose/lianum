import type {DevicePagedAgentReadGrantAnyV5,DevicePagedSignedAgentReadGrantAnyV5} from '@lianum/mobile-protocol/device/paged-agent-read-lifetime-v5';
import type {DevicePagedSignedAgentProposalV4,DevicePagedSignedAgentReadGrantV4,DevicePagedAgentProgressAnyV5 as DevicePagedAgentProgressV4} from '@lianum/mobile-protocol/device/paged-agent-v4';
export function createDevicePagedAgentNativeProposalV4(key:Uint8Array,descriptor:unknown,terms:unknown,nodes:unknown):DevicePagedSignedAgentProposalV4;
export function verifyDevicePagedAgentNativeProposalV4(raw:unknown):DevicePagedSignedAgentProposalV4;
export function verifyDevicePagedAgentReadGrantV4(raw:unknown,descriptor:unknown):DevicePagedSignedAgentReadGrantAnyV5;
export type DevicePagedAgentObservationV4=Readonly<{grantId:string;readsUsed:number;progress:DevicePagedAgentProgressV4}>;
export function createDevicePagedAgentApiV4(input:{descriptor:unknown;agentKey:Uint8Array;grant:unknown;fetchImpl:typeof fetch}):Readonly<{descriptor:any;readerPublicKey:string;grant:DevicePagedSignedAgentReadGrantAnyV5;observe():Promise<DevicePagedAgentObservationV4>;snapshot():null|Readonly<{grantId:string;readsUsed:number;progress:Omit<DevicePagedAgentProgressV4,'current'>&{current:boolean};financialPermission:false}>;revoke():Promise<Readonly<{profile:'DEVICE_PAGED_AGENT_READ_REVOKED_V4';grantId:string;revoked:true}>>;close():void}>;
export function readDevicePagedAgentObservationV4(raw:unknown):DevicePagedAgentObservationV4;
