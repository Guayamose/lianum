export function createDevicePagedGraphApiV3(input:{descriptor:unknown;fetchImpl:typeof fetch}):{descriptor:any;isUnconfirmedReply(error:unknown):boolean;pairing():Promise<any>;challenge(action:string,graphId:string,jobId:string,rootId:string,revision:number,command:unknown):Promise<any>;submit(consent:unknown,signature:string,command:unknown):Promise<any>;close():Promise<void>};
export function readDevicePagedGraphConsentV3(raw:unknown):any;
export function readDevicePagedGraphStatusV3(raw:unknown):any;
export function readDevicePagedGraphReplyV3(raw:unknown):any;

export function readDevicePagedGraphReplyConsentV3(raw:unknown):any;

export function readDevicePagedSourceContinuationV4(raw:unknown):import('../../../../packages/mobile-protocol/src/device-paged-source-continuation-v4.mjs').DevicePagedSourceContinuationDataV4;
export function readDevicePagedSourceSuccessorContinuationV35(raw:unknown,provision:unknown):import('../../../../packages/mobile-protocol/src/device-paged-source-continuation-v4.mjs').DevicePagedSourceContinuationDataV4;

export function readDevicePagedGraphPairingV3(raw:unknown):any;

export function readDevicePagedGraphApiV3(api:unknown):any;

export function readDevicePagedBeginRetirementV47(raw:unknown):any;
