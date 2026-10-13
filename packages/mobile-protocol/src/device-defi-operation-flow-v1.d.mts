import type {ExternalFlatDescriptor,ExternalFlatStatus,ExternalFlatAction} from './device-external-flat-note-v1.mjs';
import type {ExternalFlatGraphAction} from './device-external-flat-graph-v1.mjs';
export const DEVICE_DEFI_OPERATION_FLOW_V1:'DEVICE_DEFI_OPERATION_FLOW_V1';
export const DEVICE_DEFI_CAPABILITIES_V1:readonly Readonly<{protocol:string;operation:string;relationFamily:'EXTERNAL_FLAT';nativePagedAdmission:false;privateDestination:boolean;redemption:boolean}>[];
export type DeviceDefiOperationDecisionV1=Readonly<{profile:typeof DEVICE_DEFI_OPERATION_FLOW_V1;relationFamily:'EXTERNAL_FLAT';nativePagedAdmission:false;kind:'REFRESH'|'GRAPH_ACTION'|'NOTE_ACTION'|'OUTPUT_ACTION'|'OPEN_SOURCE'|'OPEN_DESTINATION'|'SETTLED'|'PREPARE_DEPOSIT'|'PREPARE_GRAPH'|'PREPARE_WITHDRAWAL'|'PREPARE_OUTPUT_WITHDRAWAL';label:string;phase:string;action:ExternalFlatAction|ExternalFlatGraphAction|null;noteRole:'change'|'recovery'|null}>;
export function deviceDefiAmountToAtomicV1(text:string,decimals:number):string;
export function deviceDefiAmountFromAtomicV1(amount:string,decimals:number):string;
export function deviceDefiReceptionWindowV1(observedTimestamp:string,durationSeconds:number):Readonly<{validFrom:string;validUntil:string;settleBefore:string}>;
export function nextDeviceDefiOperationV1(input:{descriptor:ExternalFlatDescriptor;noteStatus?:ExternalFlatStatus|null;graphStatus?:any;goal?:'CONVERT'|'WITHDRAW';role?:'SOURCE'|'DESTINATION'|'NOTE';hasDestination?:boolean;destinationAuthorized?:boolean;notePending?:{jobId:string;action:ExternalFlatAction}|null;graphPending?:string|null;outputPending?:{noteRole:string;jobId:string;action:string}[];now?:number}):DeviceDefiOperationDecisionV1;
