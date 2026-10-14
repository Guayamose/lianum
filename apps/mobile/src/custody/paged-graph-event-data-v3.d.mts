export const PAGED_GRAPH_EVENT_DATA_LIMITS_V3:Readonly<{bytes:number;nodes:number;depth:number;chunkBytes:number}>;
export function internPagedGraphEventDataV3(event:any,previous:any|null):any;
export function packPagedGraphEventDataV3(event:any,previous:any|null,hash:(bytes:Uint8Array)=>string):any;
export function expandPagedGraphEventDataV3(value:any,previous:any|null,hash:(bytes:Uint8Array)=>string):any;
export function encodePagedGraphEventChunkV3(value:Uint8Array):string;
export function decodePagedGraphEventChunkV3(value:string):Uint8Array;
export function measurePagedGraphProjectionDataV3(value:unknown,maximum:number):number;
export function internPagedGraphHistoryDataV3(events:any[],hash:(bytes:Uint8Array)=>string):any[];
export function createPagedGraphHistoryDataInternerV3(hash:(bytes:Uint8Array)=>string):Readonly<{readonly retainedBytes:number;copy(value:any):any;clear():void}>;
