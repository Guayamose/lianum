export const DEVICE_PAGED_PAYMENT_PAGE_SIZE_V3:64;
export const DEVICE_PAGED_PAYMENT_LIMIT_V3:256;
export const DEVICE_PAGED_PAYMENT_BUFFER_LIMIT_V3:256;
export function devicePagedPaymentPagesV3<T>(payments:readonly T[],options?:{maximumPayments?:number}):T[][];
export type DevicePagedPreparationStateV3={phase:string|null;beginPrepared:boolean;pending:boolean;pagePending:boolean;pagesMatch:boolean;savedPayments:number;draftPayments:number};
export function prepareDevicePagedPaymentListV3(options:{read:()=>Promise<DevicePagedPreparationStateV3>;begin:()=>Promise<unknown>;resumeBegin:()=>Promise<unknown>;append:()=>Promise<unknown>;seal:()=>Promise<unknown>;signal?:AbortSignal;onStage?:(stage:'begin'|'resume-begin'|'append'|'seal')=>void;maximumTransitions?:number}):Promise<{type:'ready'|'complete';phase:string}>;
