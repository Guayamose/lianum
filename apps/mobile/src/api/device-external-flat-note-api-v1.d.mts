import type {ExternalFlatDescriptor,ExternalFlatAccess,ExternalFlatConsent,ExternalFlatDraft,ExternalFlatRow,ExternalFlatStatus} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
export type DeviceExternalFlatNoteApiV1=Readonly<{
 descriptor:ExternalFlatDescriptor;
 challenge():Promise<ExternalFlatAccess>;
 review(access:ExternalFlatAccess,signature:string,draft:ExternalFlatDraft):Promise<ExternalFlatConsent>;
 submit(consent:ExternalFlatConsent,signature:string,witness:unknown|null):Promise<ExternalFlatRow|Readonly<{quote:ExternalFlatConsent}>>;
 status(access:ExternalFlatAccess,signature:string):Promise<ExternalFlatStatus>;
 readStatus(sign:(access:ExternalFlatAccess)=>Promise<string>,signal:AbortSignal,assertCurrent:()=>void):Promise<ExternalFlatStatus>;
 close():{closed:true};
}>;
export function createDeviceExternalFlatNoteApiV1(input:{descriptor:ExternalFlatDescriptor;fetchImpl?:typeof globalThis.fetch}):DeviceExternalFlatNoteApiV1;
export function readDeviceExternalFlatRowV1(row:ExternalFlatRow):ExternalFlatRow;
export function readDeviceExternalFlatStatusV1(status:ExternalFlatStatus):ExternalFlatStatus;
export function readDeviceExternalFlatQuoteV1(quote:ExternalFlatConsent):ExternalFlatConsent;

export function readDeviceExternalFlatConsentV1(value:unknown):ExternalFlatConsent;

export function readDeviceExternalFlatUnsubmittedConsentV1(value:unknown):ExternalFlatConsent;

export function retireDeviceExternalFlatUnsubmittedConsentV1(value:unknown):void;

export function createDeviceSepoliaDefiSharesNoteApiV4(input:{descriptor:ExternalFlatDescriptor;fetchImpl?:typeof globalThis.fetch;sepoliaReviewReference?:string|null}):DeviceExternalFlatNoteApiV1;
