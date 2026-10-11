import { inspectWrappedInstallationSourcesV2 } from '@lianum/components/verification/wrapped-installation';
inspectWrappedInstallationSourcesV2();
const { wrappedClaimRelationV1 } = await import('@lianum/proofs/wrapped-claims/metadata/wrapped-claim-profile-v1');
const { WRAPPED_CLAIM_ROLE_PROCESS_V1, receiveWrappedClaimJobV1 } = await import('../tooling/wrapped-claim-tooling-v1.mjs');
const { loadWrappedClaimRoleProofArtifactsV1 } = await import('../../../operations/releases/wrapped/wrapped-claim-proof-artifacts-v1.mjs');
const { runWrappedClaimRoleProofV1 } = await import('../tooling/wrapped-claim-run-bounded-v1.mjs');
inspectWrappedInstallationSourcesV2();
/** A fresh one-job role process selected from exactly wrapped CI and CO. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';




assert.equal(process.argv.length,3);assert.equal(realpathSync(process.argv[1]),WRAPPED_CLAIM_ROLE_PROCESS_V1);
const role=process.argv[2],spec=wrappedClaimRelationV1(role);assert.deepEqual(process.execArgv,[]);
assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.PATH,'/usr/bin:/bin');assert.equal(process.env.LANG,'C.UTF-8');
assert.equal(typeof process.send,'function');assert.ok(process.connected);
const jobId=randomUUID();let job,finished=false;
const disconnect=()=>{if(!finished)process.kill(process.pid,'SIGTERM');};process.once('disconnect',disconnect);
try{
 const artifacts=await loadWrappedClaimRoleProofArtifactsV1(role);
 job=await receiveWrappedClaimJobV1(role,jobId,artifacts.program.abi);
 process.once('message',disconnect);
 const pending=runWrappedClaimRoleProofV1({relation:spec.name,role,jobId,...job});job.inputs=undefined;job=undefined;const status=await pending;
 if(status.phase!=='completed')process.exitCode=1;finished=true;process.stdout.write(JSON.stringify(status)+'\n');
}catch{job=undefined;finished=true;process.exitCode=1;process.stdout.write(JSON.stringify({relation:spec.name,role,jobId,phase:'failed',errorCode:'WRAPPED_ROLE_JOB_FAILED'})+'\n');}
finally{finished=true;process.removeListener('disconnect',disconnect);process.removeListener('message',disconnect);if(process.connected)process.disconnect();}
