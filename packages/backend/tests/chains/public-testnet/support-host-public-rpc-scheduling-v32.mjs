/** HOST-only scheduling for fixtures whose fetch is replaced completely.
 * No public RPC, chain observation or proof is supplied here. Real provider
 * pacing/429 behavior has its own scheduler regression; do not sleep for fake RPCs. */
import assert from 'node:assert/strict';
export function installHostPublicRpcSchedulingV32(mock){
 mock.module(new URL('../../../src/native-wallet/public-read-rpc-scheduler-v1.mjs',import.meta.url).href,{exports:{
  async waitPublicSepoliaReadTurnV1(_endpoint,signal,units=1){assert.ok(signal instanceof AbortSignal);assert.ok(Number.isInteger(units)&&units>=1&&units<=4);signal.throwIfAborted();},
  recordPublicSepoliaReadResponseV1(){},
  readPublicSepoliaSchedulerMetricsV25(){return Object.freeze({rpcQueuedAttemptsV25:0,rpcQueueCancelledV25:0,rpcQueueWaitMsV25:0,rpcQueueMaxWaitMsV25:0,rpcThrottleResponsesV25:0,rpcQueuePendingUnitsV25:0,rpcPacingIntervalMsV25:0,rpcCooldownRemainingMsV25:0});},
 }});
}
