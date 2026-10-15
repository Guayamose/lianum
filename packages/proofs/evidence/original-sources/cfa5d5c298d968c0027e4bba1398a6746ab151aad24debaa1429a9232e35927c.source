/** Fixed application watchdog budget, not an OS/network/security setting.
 * Measured PC18 R_BTC v2 peaks are below 2.7 GB RSS. Keep 2.5 GiB available
 * host RAM and a separate 3 GiB worker-RSS watchdog budget. Existing Wasm
 * page ceilings, one heavy job, 250 ms checks and disk reserve remain intact.
 * These are sampled abort thresholds, not instantaneous kernel limits. */
export const PRIVATE_RESOURCE_PROFILE='PC26_MEASURED_WORKER_BUDGET_V2';
export const PRIVATE_RESOURCE_FLOORS=Object.freeze({availableRAM:2684354560,freeDisk:5368709120});
export const PRIVATE_PROOF_WORKER_RSS_LIMIT=3221225472;
export const PRIVATE_RESOURCE_POLICY=Object.freeze({profile:PRIVATE_RESOURCE_PROFILE,floors:PRIVATE_RESOURCE_FLOORS,proofWorkerRSSLimit:PRIVATE_PROOF_WORKER_RSS_LIMIT,externalSampleMilliseconds:250,strictKernelLimit:false});
