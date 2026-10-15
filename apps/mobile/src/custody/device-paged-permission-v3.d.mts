import type {DevicePagedAgentReadGrantAnyV5,DevicePagedSignedAgentReadGrantAnyV5} from '@lianum/mobile-protocol/device/paged-agent-read-lifetime-v5';
import type {DevicePagedAgentReadGrantV4,DevicePagedSignedAgentReadGrantV4} from '@lianum/mobile-protocol/device/paged-agent-v4';
export const DEVICE_PAGED_EXECUTION_MAX_MS_V3:number;
export function signDevicePagedConsentV3(key:Uint8Array,raw:unknown):string;
export function signDevicePagedGraphConsentV3(key:Uint8Array,consent:unknown):string;
export type DevicePagedGraphExecutionBindingV3={descriptor:any;rootId:string;graphId:string;authorizationRoot:string;reserveNullifier:string;budget:string;settleBefore:string;deadlineMs:number;agentReadGrant?:DevicePagedAgentReadGrantAnyV5;automation?:Readonly<{quoteRoot:string;maxCommands:number;expiresAt:number}>};
export function createDevicePagedGraphExecutionSessionV3(key:Uint8Array,binding:DevicePagedGraphExecutionBindingV3,current:()=>void,onAuthorized?:()=>void):object;
export function readDevicePagedGraphExecutionSessionV3(session:object):DevicePagedGraphExecutionBindingV3;
export function signDevicePagedGraphSessionConsentV3(session:object,consent:unknown,command?:unknown):string;
export function closeDevicePagedGraphExecutionSessionV3(session:object):void;

export function signDevicePagedGraphAgentReadGrantV4(session:object):DevicePagedSignedAgentReadGrantAnyV5;
