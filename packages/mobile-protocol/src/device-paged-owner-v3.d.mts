export const DEVICE_PAGED_OWNER_V3:string,DEVICE_PAGED_CUSTODY_V3:string,DEVICE_PAGED_GRAPH_V3:string,DEVICE_PAGED_SPARSE_V3:string;
export {devicePagedNowV3,devicePagedWallNowV3,assertDevicePagedFrameElapsedV3,awaitDevicePagedIssuedTimeV3} from './device-paged-clock-v3.mjs';
export function normalizeDevicePagedDescriptorV3(raw:unknown):any;
export function assertDevicePagedGraphDeadlineV3(raw:unknown,settleBefore:string):void;
export function normalizeDevicePagedConsentV3(raw:unknown):any;
export function validateDevicePagedConsentFreshV3(raw:unknown,now?:number):any;
export function normalizeDevicePagedDraftV3(raw:unknown):any;
export function normalizeDevicePagedPublicInputsV3(mode:string,raw:unknown):readonly string[];
export function normalizeDevicePagedRowV3(raw:unknown):any;
export function normalizeDevicePagedStatusV3(raw:unknown):any;
export function validateDevicePagedStatusFreshV3(raw:unknown,now?:number):any;
export function devicePagedPermissionMessageV3(raw:unknown):Uint8Array;
export function pagedOwnerExactV3(raw:unknown,keys:string[]):any;
export function pagedOwnerHexV3(raw:unknown,zero?:boolean):string;
export function pagedOwnerUintV3(raw:unknown,zero?:boolean):string;
export function pagedOwnerWipeV3(value:unknown):void;

export function devicePagedWordsHexV3(raw:readonly string[],offset:number,length?:number):string;
export const DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8:'PAGED_DEVICE_NOTE_EPOCH_REPROOF_REQUIRED';
export const DEVICE_PAGED_NOTE_EPOCH_PROOF_V8:'DEVICE_PAGED_NOTE_EPOCH_PROOF_V8';
export function devicePagedNoteEpochProofBasenameV8(mode:string,witnessSHA256:string):string;
export function assertDevicePagedNoteEpochRetryTermsV8(previous:unknown,draft:unknown):any;

/** Bounded detached DATA; this snapshot carries no original authority. */
export function snapshotDevicePagedWitnessV3(input:unknown):any;
