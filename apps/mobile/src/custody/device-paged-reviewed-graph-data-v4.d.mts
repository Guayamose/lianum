/** Deterministic review DATA; no note/proof/accepted-state authority. */
export type DevicePagedReviewedGraphDataV4={statement:Record<string,string>;nodes:Array<{id:string;ordinal:string;nodeDigest:string;node:Record<string,string>;pageIndex:string}>};
export function deriveDevicePagedReviewedGraphDataV4(descriptor:any,seed:any,pages:any[]):DevicePagedReviewedGraphDataV4;
export function devicePagedReviewedGraphFrameV4(tag:string,parts:Uint8Array[]):Uint8Array;
export function devicePagedReviewedGraphHashV4(tag:string,parts:Uint8Array[]):string;
export function devicePagedReviewedNativeHashV4(tag:string,parts:Uint8Array[]):string;
export function devicePagedReviewedActionCommitmentV4(raw:unknown):string;
export function devicePagedReviewedNoteNullifierV4(scope:string,cm:string,secret:string):string;
