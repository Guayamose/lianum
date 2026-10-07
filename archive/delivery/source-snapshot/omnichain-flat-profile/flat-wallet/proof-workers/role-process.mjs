import { assertBeginPayoutAuditRoleProcessV1 } from './native-flow-proof-scope-v1.mjs';
/** Fresh scoped proof role. Start only through an owned private IPC channel.
 * One job enters, one public result leaves; no witness/key store or RPC access.
 * The owner role belongs in the owner's execution boundary, not a coordinator. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { relation } from './catalog.mjs';
import { prepareJob } from './trusted-jobs.mjs';
import { runBoundedProof } from './run-bounded.mjs';

assert.equal(process.argv.length, 3, 'PW_ROLE_FIXED_ARGUMENTS');
assert.equal(process.execArgv.length, 0, 'PW_NO_EXECUTABLE_OPTIONS');
assert.ok(!process.env.NODE_OPTIONS && !process.env.NODE_PATH, 'PW_ROLE_NO_INJECTION');
assert.equal(typeof process.send, 'function', 'PW_ROLE_PRIVATE_IPC_REQUIRED');
assert.ok(process.connected, 'PW_ROLE_PRIVATE_IPC_CLOSED');
const spec = relation(process.argv[2]);
assertBeginPayoutAuditRoleProcessV1(spec.name);
const jobId = randomUUID();
let received, finished = false;
const parentDisconnected = () => {
  if (!finished) process.kill(process.pid, 'SIGTERM');
};
process.once('disconnect', parentDisconnected);
try {
  received = await prepareJob({ relation: spec.name, role: spec.role, jobId });
  // Keep the control channel until completion: an abruptly lost owner
  // terminates this role and its bounded child instead of orphaning a prover.
  // U's compiled, measured domain is 2^21; this fixed process profile does not
  // change a host setting. No caller can choose a numeric memory/thread limit.
  const result = await runBoundedProof({ relation: spec.name, role: spec.role, jobId,
    profile: spec.name === 'authorization' ? 'dyadic21' : 'standard',
    inputs: received.inputs, expectedPublicInputs: received.expectedPublicInputs });
  received = undefined;
  if (result.phase !== 'completed') process.exitCode = 1;
  finished = true;
  process.stdout.write(JSON.stringify(result) + '\n');
} catch {
  // Do not echo received values or a library's private assertion diagnostics.
  received = undefined; process.exitCode = 1;
  finished = true;
  process.stdout.write(JSON.stringify({ relation: spec.name, role: spec.role,
    jobId, phase: 'failed', errorCode: 'PW_ROLE_JOB_FAILED' }) + '\n');
}

finally {
  finished = true;
  process.removeListener('disconnect', parentDisconnected);
  if (process.connected) process.disconnect();
}
