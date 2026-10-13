/** Read scheduling DATA only; no fresh status or authority is issued. */
export function createDevicePagedReadRetryV3():Readonly<{
 available():boolean;
 exhausted():boolean;
 failed(error:unknown):boolean;
 reset():void;
}>;
