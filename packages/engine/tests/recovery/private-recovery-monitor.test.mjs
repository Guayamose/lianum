/** Executes the exact small monitor branch, never imports/runs the native case. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../../../scripts/engine/integration/recovery/integration-private-payout-recovery.mjs',import.meta.url),'utf8');
const begin=source.indexOf('  // Evaluate a repeated recovery result'),end=source.indexOf("  if(['COMPLETED','FAILED','INTERRUPTED']",begin);
assert.ok(begin>=0&&end>begin);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const branch=new AsyncFunction('assert','operation','initialRequested','calls',`
 let recoveryRequested=initialRequested,headers;const operationId=operation.id,report={},app={};
 const randomUUID=()=> 'test-request',save=async()=>{},connect=async()=>({});
 const post=async body=>{calls.push(body);return {body:{cancel:async()=>{}},json:async()=>({replayed:true,operation:{id:operationId,lastRecoveryRequestId:body.requestId}})};};
 ${source.slice(begin,end)}
 return {recoveryRequested,report};
`);
const retained=()=>({id:'test-operation',phase:'RECOVERABLE',allowedActions:['recover'],recoveryState:'AVAILABLE',cleanupState:'RETAINED',settlementState:'PAYOUT_NOTES_ISSUED',ownerState:'EXIT_CONFIRMED',engineState:'STOPPED',payouts:{sol:{state:'ISSUED'},btc:{state:'ISSUED'}},exposure:{sol:'OBSERVED',btc:'OBSERVED'}});
test('first recoverable snapshot accepts recovery without treating its stale snapshot as a repeated failure',async()=>{const calls=[];const result=await branch(assert,retained(),false,calls);assert.equal(result.recoveryRequested,true);assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(result.report.recoverySameRequestDeduplicated,true);});
test('a later recoverable result fails the case without automatically requesting another worker',async()=>{const calls=[];await assert.rejects(branch(assert,retained(),true,calls),/PRIVATE_RECOVERY_ATTEMPT_NOT_COMPLETED/);assert.equal(calls.length,0);});
test('an active recovery snapshot remains read-only',async()=>{const calls=[];await branch(assert,{...retained(),phase:'RECOVERING',allowedActions:[]},true,calls);assert.equal(calls.length,0);});
