export function devicePagedNowV3():number;
export function devicePagedWallNowV3():number;
export function assertDevicePagedFrameElapsedV3(key:string,expiresAt:number,nowWall:number):void;
export function awaitDevicePagedIssuedTimeV3(issuedAt:number,signal?:AbortSignal):Promise<void>;

export const DEVICE_OPERATION_CONSENT_MS_V41:3600000,DEVICE_OPERATION_OBSERVATION_MS_V41:120000,DEVICE_OPERATION_REQUEST_MS_V41:1800000;
export function assertDevicePagedFrameElapsedV41(key:string,expiresAt:number,nowWall:number,issuedAt:number,kind:'CONSENT'|'OBSERVATION'):void;

export const DEVICE_OPERATION_REVIEW_MS_V46:3600000,DEVICE_OPERATION_EXECUTION_MS_V46:28800000,DEVICE_OPERATION_IDLE_MS_V46:3600000;
export const DEVICE_PLAN_RESERVATION_MINUTES_V46:360,DEVICE_PLAN_EXECUTION_MINUTES_V46:480;
