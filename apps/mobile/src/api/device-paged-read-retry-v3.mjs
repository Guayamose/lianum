/** Bounded feedback policy for a fresh read. No command, permission or effect
 * is retained here. Each caller retry must start the original read again. */
const recoverable=new Set(['MOBILE_PAGED_SERVICE_UNAVAILABLE','MOBILE_PAGED_GRAPH_SERVICE_UNAVAILABLE','MOBILE_PAGED_CLOCK_FUTURE','MOBILE_PAGED_CLOCK_EXPIRED','MOBILE_PAGED_GRAPH_STATUS_FUTURE','MOBILE_PAGED_GRAPH_STATUS_EXPIRED']);
function recognized(error){
 if(!(error instanceof Error))return false;
 for(const name of ['code','message']){const value=Object.getOwnPropertyDescriptor(error,name)?.value;if(typeof value==='string'&&recoverable.has(value))return true;}
 return false;
}
export function createDevicePagedReadRetryV3(){
 let retries=0,started=null,next=0,last=-1,stopped=false;
 function now(){const value=performance.now();if(!Number.isFinite(value)||value<0||value<last){stopped=true;return null;}last=value;return value;}
 return Object.freeze({
  available(){const value=now();if(value===null||stopped)return false;if(started!==null&&value-started>=120000){stopped=true;return false;}return value>=next;},
  exhausted(){return stopped;},
  failed(error){const value=now();if(value===null||stopped||!recognized(error)){stopped=true;return false;}started??=value;if(retries===3||value-started>=120000){stopped=true;return false;}retries++;next=value+12000;return true;},
  reset(){retries=0;started=null;next=0;last=-1;stopped=false;},
 });
}
