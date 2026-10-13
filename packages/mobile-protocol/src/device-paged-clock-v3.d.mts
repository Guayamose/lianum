export function devicePagedNowV3():number;
export function devicePagedWallNowV3():number;
export function assertDevicePagedFrameElapsedV3(key:string,expiresAt:number,nowWall:number):void;
export function awaitDevicePagedIssuedTimeV3(issuedAt:number,signal?:AbortSignal):Promise<void>;
