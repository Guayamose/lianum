export function createDevicePagedGraphReplyRecipientV3(jobId:string,signal?:AbortSignal):Promise<any>;
export function closeDevicePagedGraphReplyRecipientV3(handle:unknown):void;
export function sealDevicePagedGraphCommandV3(consent:unknown,signature:string,command:unknown,signal?:AbortSignal):Promise<any>;
export function openDevicePagedGraphReplyV3(handle:unknown,consent:unknown,frame:unknown,signal?:AbortSignal):Promise<any>;

export function openDevicePagedSourceRenewalReplyV4(handle:unknown,descriptor:unknown,challenge:unknown,frame:unknown,signal?:AbortSignal):Promise<any>;
