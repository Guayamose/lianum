export const DEVICE_PAGED_EXECUTION_MAX_MS_V3:number;
export function signDevicePagedConsentV3(key:Uint8Array,raw:unknown):string;
export function signDevicePagedGraphConsentV3(key:Uint8Array,consent:unknown):string;
export type DevicePagedGraphExecutionBindingV3={descriptor:any;rootId:string;graphId:string;authorizationRoot:string;reserveNullifier:string;budget:string;settleBefore:string;deadlineMs:number};
export function createDevicePagedGraphExecutionSessionV3(key:Uint8Array,binding:DevicePagedGraphExecutionBindingV3,current:()=>void,onAuthorized?:()=>void):object;
export function readDevicePagedGraphExecutionSessionV3(session:object):DevicePagedGraphExecutionBindingV3;
export function signDevicePagedGraphSessionConsentV3(session:object,consent:unknown):string;
export function closeDevicePagedGraphExecutionSessionV3(session:object):void;
