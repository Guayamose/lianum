import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicStartupProgressV10,PUBLIC_STARTUP_STEPS_V10} from '../src/public/startup-progress-v10.mjs';
test('progress counts unique known milestones and measured throughput without inventing an RPC total or ETA',()=>{
 let time=0;const progress=createPublicStartupProgressV10(()=>time);progress.complete('ROOT_RETENTION');progress.complete('ROOT_RETENTION');progress.complete('unknown');
 time=60000;const sample=progress.snapshot({rpcCalls:300});assert.equal(sample.completedMilestones,1);assert.equal(sample.totalMilestones,21);assert.equal(sample.rpcCallsPerSecond,5);assert.equal(sample.remainingSeconds,null);assert.equal(sample.remainingRpcCalls,null);assert.equal(sample.secondsSinceMilestone,60);
 time=120000;progress.complete('RECEIVER');assert.equal(progress.snapshot({rpcCalls:600}).secondsSinceMilestone,0);
 PUBLIC_STARTUP_STEPS_V10.forEach(step=>progress.complete(step));const done=progress.snapshot({rpcCalls:600});assert.deepEqual(done.remainingMilestones,[]);assert.equal(done.remainingSeconds,0);assert.equal(done.estimateStatus,'COMPLETE');
});
