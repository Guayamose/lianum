/** One fixed native-value V2 native-value admission role; only its branded client owns the IPC job. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { NATIVE_VALUE_LIVE_V2_SPEC } from '../metadata/native-value-live-v2-profile.mjs';
import { NV2_ROLE_PROCESS, receiveNativeValueLiveV2Job } from '../tooling/native-value-live-v2-tooling.mjs';
import { runNativeValueLiveV2Proof } from '../tooling/native-value-live-v2-run-bounded.mjs';
assert.equal(process.argv.length,3);assert.equal(realpathSync(process.argv[1]),NV2_ROLE_PROCESS);
assert.equal(process.argv[2],NATIVE_VALUE_LIVE_V2_SPEC.name);assert.deepEqual(process.execArgv,[]);
assert.ok(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH);assert.equal(typeof process.send,'function');assert.ok(process.connected);
const jobId=randomUUID();let job,finished=false;
const disconnect=()=>{if(!finished)process.kill(process.pid,'SIGTERM');};process.once('disconnect',disconnect);
try{
 job=await receiveNativeValueLiveV2Job(jobId);
 const status=await runNativeValueLiveV2Proof({relation:NATIVE_VALUE_LIVE_V2_SPEC.name,role:'local',jobId,...job});job=undefined;
 if(status.phase!=='completed')process.exitCode=1;finished=true;process.stdout.write(JSON.stringify(status)+'\n');
}catch{job=undefined;finished=true;process.exitCode=1;process.stdout.write(JSON.stringify({relation:NATIVE_VALUE_LIVE_V2_SPEC.name,role:'local',jobId,phase:'failed',errorCode:'NV2_ROLE_JOB_FAILED'})+'\n');}
finally{finished=true;process.removeListener('disconnect',disconnect);if(process.connected)process.disconnect();}
