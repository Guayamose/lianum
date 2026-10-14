export const DEVICE_PAGED_AUTOMATION_V4:'DEVICE_PAGED_APPROVED_CONTINUATION_V4';
export type DevicePagedAutomationRequestV4=Readonly<{quoteRoot:string;maxCommands:number;expiresAt:number}>;
export type DevicePagedAutomationTermsV4=DevicePagedAutomationRequestV4 & Readonly<{profile:typeof DEVICE_PAGED_AUTOMATION_V4;descriptorSHA256:string;graphId:string;rootId:string;revision:number;authorizationRoot:string;reserveNullifier:string;budget:string;nodes:string;settleBefore:string}>;
export function normalizeDevicePagedAutomationRequestV4(raw:unknown):DevicePagedAutomationRequestV4;
export function normalizeDevicePagedAutomationTermsV4(raw:unknown):DevicePagedAutomationTermsV4;
export function devicePagedAutomationTermsMessageV4(raw:unknown):Uint8Array;
export function devicePagedAutomationQuoteRootV4(raw:unknown):string;
