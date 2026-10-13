export type DevicePagedOperationProgressV3={stage:string;completed:string;total:string;currentNodeId:string|null};
export type DevicePagedOperationActivityV3=DevicePagedOperationProgressV3&{state:'running'|'observing'|'complete'|'pending'|'adverse'|'stopped';action:string|null};
export type DevicePagedOperationResultV3=DevicePagedOperationProgressV3&{type:'complete'|'pending'|'adverse';phase?:'FULFILLED'|'RECOVERED'};
/** The command port signs fresh permissions and accepts authentic SDK status
 * in custody before returning private reply copies. FUTURE/EXPIRED responses
 * trigger at most two OBSERVE_GRAPH calls in one run, followed by a new plan;
 * failed actions are never replayed. A supplied original SDK classifier can
 * identify a lost operations reply and use the same two-observation budget.
 * The classifier is DATA only; authentic status, liveness and authorization
 * remain enforced by the command port. Unclassified errors propagate. */
export function runDevicePagedOperationV3(input:{command:(action:string,command:unknown)=>Promise<any>;onProgress?:(progress:DevicePagedOperationProgressV3)=>void|Promise<void>;onActivity?:(activity:DevicePagedOperationActivityV3)=>void|Promise<void>;isUnconfirmedReply?:(error:unknown)=>boolean;signal?:AbortSignal;maxCommands?:number;nativePendingPolling?:{maximumWaitMs:number;intervalMs:number;assertCurrent:()=>void}}):Promise<DevicePagedOperationResultV3>;

/** Polling is off by default. The optional managed APP scope check is not an
 * authority. Known native delivery IDs/hashes are pinned; each poll observes
 * and replans through the original ports. Chain-time pending returns at once.
 * Total monotonic polling budget is capped at 60000ms; an in-flight original
 * request is drained under its own transport timeout, never left as loose work. */
