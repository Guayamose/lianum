import { assertBeginPayoutAuditRoleProcessV1 } from './native-flow-proof-scope-v1.mjs';
/** Fresh scoped proof role. Start only through an owned private IPC channel.
 * One job enters, one public result leaves; no witness/key store or RPC access.
 * The owner role belongs in the owner's execution boundary, not a coordinator. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import { relation } from '../catalog.mjs';
import {runBoundedProof,preparePrivateProofJobV1,wipePrivateProofInputsV1,sealPrivateProofJobV1,deriveOriginalDeviceDepositIntentJobV2,deriveOriginalDeviceAuthorizationJobV2} from './run-bounded.mjs';

assert.equal(process.argv.length, 3, 'PW_ROLE_FIXED_ARGUMENTS');
assert.equal(process.execArgv.length, 0, 'PW_NO_EXECUTABLE_OPTIONS');
assert.ok(!process.env.NODE_OPTIONS && !process.env.NODE_PATH, 'PW_ROLE_NO_INJECTION');
assert.equal(typeof process.send, 'function', 'PW_ROLE_PRIVATE_IPC_REQUIRED');
assert.ok(process.connected, 'PW_ROLE_PRIVATE_IPC_CLOSED');
const spec = relation(process.argv[2]);
assertBeginPayoutAuditRoleProcessV1(spec.name);
const jobId = randomUUID();
let received, privateDeviceDerivation=null,privateGraphDerivation=null, finished = false;
const parentDisconnected = () => {
  if (!finished) process.kill(process.pid, 'SIGTERM');
};
process.once('disconnect', parentDisconnected);
try {
  received = await preparePrivateProofJobV1({ relation: spec.name, role: spec.role, jobId });
  privateDeviceDerivation=deriveOriginalDeviceDepositIntentJobV2(received,spec);
  if(!privateDeviceDerivation)privateGraphDerivation=await deriveOriginalDeviceAuthorizationJobV2(received,spec);
  // Keep the control channel until completion: an abruptly lost owner
  // terminates this role and its bounded child instead of orphaning a prover.
  // U's compiled, measured domain is 2^21; this fixed process profile does not
  // change a host setting. No caller can choose a numeric memory/thread limit.
  const result = await runBoundedProof({ relation: spec.name, role: spec.role, jobId,
    profile: spec.name === 'authorization' ? 'dyadic21' : 'standard',
    inputs: received.inputs, expectedPublicInputs: received.expectedPublicInputs, authorization: received.authorization });
  if(privateGraphDerivation&&result.phase==='completed'){const packet=sealPrivateProofJobV1(privateGraphDerivation.resultRecipient,{inputs:privateGraphDerivation.derivation,expectedPublicInputs:received.expectedPublicInputs,authorization:received.authorization});await new Promise((resolve,reject)=>process.send({type:'flat-private-owner-result-v2',packet},error=>error?reject(error):resolve()));wipePrivateProofInputsV1(privateGraphDerivation.derivation);privateGraphDerivation=null;}
  wipePrivateProofInputsV1(received?.inputs); received = undefined;
  if (result.phase !== 'completed') process.exitCode = 1;
  finished = true;
  process.stdout.write(JSON.stringify(privateDeviceDerivation?{...result,privateDeviceDerivation}:result) + '\n');
} catch {
  // Do not echo received values or a library's private assertion diagnostics.
  wipePrivateProofInputsV1(received?.inputs); received = undefined; process.exitCode = 1;
  finished = true;
  process.stdout.write(JSON.stringify({ relation: spec.name, role: spec.role,
    jobId, phase: 'failed', errorCode: 'PW_ROLE_JOB_FAILED' }) + '\n');
}

finally {
  wipePrivateProofInputsV1(privateGraphDerivation?.derivation);privateGraphDerivation=null;
  wipePrivateProofInputsV1(received?.inputs); received = undefined;
  finished = true;
  process.removeListener('disconnect', parentDisconnected);
  if (process.connected) process.disconnect();
}
