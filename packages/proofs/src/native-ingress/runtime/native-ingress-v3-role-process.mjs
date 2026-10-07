import { assertBeginPayoutAuditRoleProcessV1 } from '../../jobs/native-flow-proof-scope-v1.mjs';
/** One fixed V3 claim-ingress role; only its branded client owns the IPC job. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { NATIVE_INGRESS_V3_SPEC } from '../metadata/native-ingress-v3-profile.mjs';
import { V3_ROLE_PROCESS, receiveNativeIngressV3Job } from '../tooling/native-ingress-v3-tooling.mjs';
import { runNativeIngressV3Proof } from '../tooling/native-ingress-v3-run-bounded.mjs';
assert.equal(process.argv.length,3);assert.equal(realpathSync(process.argv[1]),V3_ROLE_PROCESS);
assert.equal(process.argv[2],NATIVE_INGRESS_V3_SPEC.name);assert.deepEqual(process.execArgv,[]);
assert.ok(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH);assert.equal(typeof process.send,'function');assert.ok(process.connected);
assertBeginPayoutAuditRoleProcessV1(NATIVE_INGRESS_V3_SPEC.name);
const jobId=randomUUID();let job,finished=false;
const disconnect=()=>{if(!finished)process.kill(process.pid,'SIGTERM');};process.once('disconnect',disconnect);
try{
 job=await receiveNativeIngressV3Job(jobId);
 const status=await runNativeIngressV3Proof({relation:NATIVE_INGRESS_V3_SPEC.name,role:'claim_ingress',jobId,...job});job=undefined;
 if(status.phase!=='completed')process.exitCode=1;finished=true;process.stdout.write(JSON.stringify(status)+'\n');
}catch{job=undefined;finished=true;process.exitCode=1;process.stdout.write(JSON.stringify({relation:NATIVE_INGRESS_V3_SPEC.name,role:'claim_ingress',jobId,phase:'failed',errorCode:'V3_ROLE_JOB_FAILED'})+'\n');}
finally{finished=true;process.removeListener('disconnect',disconnect);if(process.connected)process.disconnect();}
