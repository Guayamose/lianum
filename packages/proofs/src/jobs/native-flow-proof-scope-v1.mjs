/** Fixed diagnostic proof scope over the existing original supervisor lock,
 * process ancestry and worker result. No new admission IPC, file registry,
 * callback, caller path, profile or permission token is accepted. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from '../catalog.mjs';
import {projectRoot,isCompatibilityModule} from '@lianum/environment';
import { nativeProcStatV1, readNativeFlowRegularV1 } from '../host/process-files.mjs';
import { CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1, assertBeginPayoutAuditReleaseV1 }
  from './begin-payout-audit-policy-v1.mjs';
// These are process identity labels, not module loads. Historical supervisors
// keep their original layout; source/candidate launches use current owners.
const executionPath=(source,legacy)=>isCompatibilityModule(import.meta.url)?join(ROOT,legacy):join(projectRoot,source);
const ENTRY = executionPath('tests/integration/claims/payouts/run-native-claim-begin-payout-audit-v1.mjs','integration/run-native-claim-begin-payout-audit-v1.mjs');
const WORKER = executionPath('tests/integration/claims/lifecycle/native-claim-flow.mjs','integration/native-claim-flow.mjs');
const OWNER = executionPath('packages/backend/src/custody/processes/flat-owner-process.mjs','mobile-core/flat-owner-process.mjs');
const LEGACY = executionPath('packages/proofs/src/execution/proof-worker.mjs','../../omnichain-product/src/paeg/proof-worker.mjs');
const LOCAL = join(ROOT, '.local/native-claim-begin-payout-audit-v1'), LOCK = join(LOCAL, 'active.lock');
const PREFIX = Object.freeze(['deposit_intent', 'native_claim_ingress_v3', 'withdraw_balance']);
const STAGES = Object.freeze(['preposition-owner-native-claim-1', 'prove-and-issue-original-native-claim-1',
  'exit-original-claim-note-and-redeem-native-1']);
const admitted = new Set();
const same = (a, b) => a && b && a.pid === b.pid && a.startTimeTicks === b.startTimeTicks;
const argvFor = pid => readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
function originalScope() {
  if (process.platform !== 'linux') { assert.equal(existsSync(LOCK), false, 'CLAIM_BEGIN_PROOF_LINUX_SCOPE'); return null; }
  const chain = []; let pid = process.pid, supervisor = null;
  for (let depth = 0; pid > 0 && depth < 64; depth++) {
    const identity = nativeProcStatV1(pid); assert.ok(identity && !['Z', 'X'].includes(identity.state), 'CLAIM_BEGIN_PROOF_LIVE_ANCESTRY');
    const argv = argvFor(pid), script = typeof argv[1] === 'string' && argv[1].endsWith('.mjs')
      ? resolve(realpathSync(`/proc/${pid}/cwd`), argv[1]) : null;
    chain.push({ ...identity, argv, script });
    if (script === ENTRY) { supervisor = chain.at(-1); break; }
    if (identity.ppid === 0) { pid = 0; break; }
    assert.ok(identity.ppid !== pid, 'CLAIM_BEGIN_PROOF_ANCESTRY_CYCLE'); pid = identity.ppid;
  }
  if (!supervisor) {
    assert.equal(pid, 0, 'CLAIM_BEGIN_PROOF_ANCESTRY_BOUND');
    assert.equal(existsSync(LOCK), false, 'CLAIM_BEGIN_PROOF_FOREIGN_ACTIVE_LIFETIME'); return null;
  }
  assertBeginPayoutAuditReleaseV1();
  assert.equal(supervisor.argv.length, 2);
  assert.equal(realpathSync(`/proc/${supervisor.pid}/exe`), realpathSync(process.execPath), 'CLAIM_BEGIN_PROOF_ORIGINAL_NODE');
  assert.equal(realpathSync(ENTRY), ENTRY, 'CLAIM_BEGIN_PROOF_PINNED_ENTRY');
  const main = chain.at(-2), current = chain[0];
  assert.ok(main && main.ppid === supervisor.pid && main.pgrp === main.pid && main.session === main.pid,
    'CLAIM_BEGIN_PROOF_ORIGINAL_MAIN_WORKER');
  assert.equal(main.argv.length, 2); assert.equal(main.script, WORKER);
  for (const row of [main, current]) assert.equal(realpathSync(`/proc/${row.pid}/exe`), realpathSync(process.execPath), 'CLAIM_BEGIN_PROOF_ORIGINAL_NODE');
  for (const row of chain.slice(0, -1)) assert.ok(row.pgrp === main.pid && row.session === main.pid, 'CLAIM_BEGIN_PROOF_OWNED_GROUP');
  const lock = JSON.parse(readNativeFlowRegularV1(LOCK, 4096));
  assert.equal(lock.format, 'LIANUM_SOL_BEGIN_PAYOUT_AUDIT_LOCK_V1');
  assert.equal(lock.pid, supervisor.pid); assert.equal(lock.supervisorStartTimeTicks, supervisor.startTimeTicks);
  assert.match(lock.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt, '.local/native-claim-begin-payout-audit-v1/attempt-' + lock.runId);
  const attempt = join(LOCAL, 'attempt-' + lock.runId);
  const result = JSON.parse(readNativeFlowRegularV1(join(attempt, 'result.json')));
  assert.equal(result.format, 'LIANUM_SOL_BEGIN_PAYOUT_BACKING_AUDIT_RESULT_V1');
  assert.equal(result.profile, CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1); assert.equal(result.runId, lock.runId);
  assert.equal(result.supervisor?.supervisorPID, supervisor.pid); assert.equal(result.supervisor?.workerPID, main.pid);
  assert.equal(result.success, false, 'CLAIM_BEGIN_PROOF_TERMINAL_LIFETIME');
  assert.ok(same(nativeProcStatV1(supervisor.pid), supervisor) && same(nativeProcStatV1(main.pid), main)
    && same(nativeProcStatV1(current.pid), current), 'CLAIM_BEGIN_PROOF_PID_CHANGED');
  return { current, parent: chain[1], main, result, runId: lock.runId, attempt };
}
function originalPrefix(scope, index) {
  assert.equal(scope.result.phase, STAGES[index], 'CLAIM_BEGIN_PROOF_EXACT_STAGE');
  assert.ok(Array.isArray(scope.result.proofs), 'CLAIM_BEGIN_PROOF_ORIGINAL_PREFIX');
  assert.deepEqual(scope.result.proofs.map(row => row.relation), PREFIX.slice(0, index), 'CLAIM_BEGIN_PROOF_ORIGINAL_PREFIX');
}
function once(scope, relation) {
  const key = scope.runId + ':' + relation;
  assert.ok(!admitted.has(key), 'CLAIM_BEGIN_PROOF_ONE_ORIGINAL_LAUNCH');
  admitted.add(key); // Failure never releases this original job right.
}
export function assertBeginPayoutAuditRoleLaunchV1(role, relation) {
  assert.equal(arguments.length, 2, 'CLAIM_BEGIN_PROOF_NO_OPTIONS'); const scope = originalScope(); if (!scope) return false;
  const index = relation === 'deposit_intent' && role === 'owner' ? 0
    : relation === 'native_claim_ingress_v3' && role === 'claim_ingress' ? 1 : -1;
  assert.ok(index >= 0, 'CLAIM_BEGIN_PROOF_FORBIDDEN_RELATION'); originalPrefix(scope, index);
  if (index === 0) {
    assert.equal(scope.current.script, OWNER); assert.deepEqual(scope.current.argv.slice(2), ['--flat-owner-child']);
    assert.equal(scope.current.ppid, scope.main.pid, 'CLAIM_BEGIN_PROOF_ORIGINAL_OWNER_PARENT');
    assert.equal(realpathSync(`/proc/${process.pid}/cwd`), join(scope.attempt, 'private-audit/owner-asset-1'), 'CLAIM_BEGIN_PROOF_ORIGINAL_SOL_OWNER');
  } else assert.equal(scope.current.pid, scope.main.pid, 'CLAIM_BEGIN_PROOF_ORIGINAL_CLAIM_CALLER');
  once(scope, relation); return true;
}
/** Guard the original role entries before private intake, including direct
 * entry invocation that did not pass through the parent role-client facade. */
export function assertBeginPayoutAuditRoleProcessV1(relation) {
  assert.equal(arguments.length, 1, 'CLAIM_BEGIN_PROOF_NO_OPTIONS'); const scope = originalScope(); if (!scope) return false;
  const index = relation === PREFIX[0] ? 0 : relation === PREFIX[1] ? 1 : -1;
  assert.ok(index >= 0, 'CLAIM_BEGIN_PROOF_FORBIDDEN_RELATION'); originalPrefix(scope, index);
  assert.equal(scope.current.script, index === 0 ? executionPath('packages/proofs/src/jobs/role-process.mjs','proof-workers/role-process.mjs') : executionPath('packages/backend/src/proving/native-ingress/runtime/native-ingress-v3-role-process.mjs','proof-workers/native-ingress-v3-role-process.mjs'));
  assert.deepEqual(scope.current.argv.slice(2), [relation]);
  if (index === 0) {
    const parent = scope.parent;
    assert.ok(parent && scope.current.ppid === parent.pid && parent.ppid === scope.main.pid, 'CLAIM_BEGIN_PROOF_ORIGINAL_OWNER_PARENT');
    assert.equal(parent.script, OWNER); assert.deepEqual(parent.argv.slice(2), ['--flat-owner-child']);
    assert.equal(realpathSync(`/proc/${parent.pid}/cwd`), join(scope.attempt, 'private-audit/owner-asset-1'), 'CLAIM_BEGIN_PROOF_ORIGINAL_SOL_OWNER');
    assert.equal(realpathSync(`/proc/${parent.pid}/exe`), realpathSync(process.execPath), 'CLAIM_BEGIN_PROOF_ORIGINAL_NODE');
    assert.ok(same(nativeProcStatV1(parent.pid), parent), 'CLAIM_BEGIN_PROOF_PID_CHANGED');
  } else assert.equal(scope.current.ppid, scope.main.pid, 'CLAIM_BEGIN_PROOF_ORIGINAL_CLAIM_CALLER');
  once(scope, relation); return true;
}
/** The fixed diagnostic never uses the generic compile/key/verify CLI. */
export function assertBeginPayoutAuditGenericCliV1() {
  assert.equal(arguments.length, 0, 'CLAIM_BEGIN_PROOF_NO_OPTIONS');
  assert.equal(originalScope(), null, 'CLAIM_BEGIN_PROOF_GENERIC_CLI_FORBIDDEN');
}
export function assertBeginPayoutAuditLegacyLaunchV1(purpose, operation, mode) {
  assert.equal(arguments.length, 3, 'CLAIM_BEGIN_PROOF_NO_OPTIONS'); const scope = originalScope(); if (!scope) return false;
  assert.equal(purpose, 'owner', 'CLAIM_BEGIN_PROOF_LEGACY_PURPOSE');
  assert.equal(operation, 'prove', 'CLAIM_BEGIN_PROOF_FORBIDDEN_OPERATION');
  assert.equal(mode, 'withdraw_balance', 'CLAIM_BEGIN_PROOF_FORBIDDEN_RELATION'); originalPrefix(scope, 2);
  assert.equal(scope.current.pid, scope.main.pid, 'CLAIM_BEGIN_PROOF_ORIGINAL_EXIT_CALLER'); once(scope, mode); return true;
}
/** Child-side check binds the public argv label to its actual private IPC job.
 * The label is descriptive; it cannot select another mode or grant permission. */
export function assertBeginPayoutAuditLegacyJobV1(purpose, operation, mode) {
  assert.equal(arguments.length, 3, 'CLAIM_BEGIN_PROOF_NO_OPTIONS'); const scope = originalScope(); if (!scope) return;
  assert.equal(purpose, 'owner', 'CLAIM_BEGIN_PROOF_LEGACY_PURPOSE');
  assert.equal(scope.current.script, LEGACY); assert.deepEqual(scope.current.argv.slice(2), ['withdraw_balance']);
  assert.equal(scope.current.ppid, scope.main.pid); originalPrefix(scope, 2);
  assert.equal(operation, 'prove', 'CLAIM_BEGIN_PROOF_FORBIDDEN_OPERATION');
  assert.equal(mode, 'withdraw_balance', 'CLAIM_BEGIN_PROOF_FORBIDDEN_RELATION');
}
const label = relation => PREFIX.includes(relation) ? relation : relation === 'native_claim_discharge' ? 'native_claim_discharge' : 'FORBIDDEN';
export function classifyBeginPayoutAuditProofProcessV1(argv) {
  const script = argv[1], value = (role, proofWorker, relation, good) => ({ role, proofWorker,
    proofRelation: good ? label(relation) : 'FORBIDDEN', proofOperation: good ? 'prove' : 'FORBIDDEN' });
  if (script === executionPath('packages/proofs/src/jobs/role-process.mjs','proof-workers/role-process.mjs')) return value('flat-proof-role', false, argv[2], argv.length === 3);
  if (script === executionPath('packages/proofs/src/jobs/worker.mjs','proof-workers/worker.mjs')) return value('flat-proof-worker', true, argv[2], argv.length === 5 && argv[3] === 'prove');
  if (script === executionPath('packages/backend/src/proving/native-ingress/runtime/native-ingress-v3-role-process.mjs','proof-workers/native-ingress-v3-role-process.mjs'))
    return value('native-ingress-v3-proof-role', false, argv[2], argv.length === 3 && argv[2] === PREFIX[1]);
  if (script === executionPath('packages/backend/src/proving/native-ingress/runtime/native-ingress-v3-worker.mjs','proof-workers/native-ingress-v3-worker.mjs'))
    return value('native-ingress-v3-proof-worker', true, PREFIX[1], argv.length === 4);
  if (script === LEGACY) return value('golden-note-proof-worker', true, argv[2], argv.length === 3 && argv[2] === PREFIX[2]);
  if (argv.length === 4 && argv[1] === '--max-old-space-size=384'
    && argv[2] === executionPath('packages/backend/src/claims/storage/record-store-process.mjs','wallet-platform/modules/native-claims/record-store-process.mjs') && argv[3] === '--claim-record-worker')
    return { role: 'claim-record-keeper', proofWorker: false };
  return null;
}
export function beginPayoutAuditProcessFailureV1(processes, completed = false) {
  const allowed = new Set(['main-worker', 'evm-runtime', 'bitcoin-runtime', 'bitcoin-local-cli', 'solana-runtime',
    'solana-local-keygen', 'flat-owner-role', 'claim-record-keeper', 'exited-member']);
  const expected = new Map([['flat-proof-role:deposit_intent', false], ['flat-proof-worker:deposit_intent', true],
    ['native-ingress-v3-proof-role:native_claim_ingress_v3', false], ['native-ingress-v3-proof-worker:native_claim_ingress_v3', true],
    ['golden-note-proof-worker:withdraw_balance', true]]), seen = new Map();
  for (const row of processes) {
    if (allowed.has(row.role) && row.proofWorker === false && row.proofRelation === undefined) continue;
    const key = row.role + ':' + row.proofRelation;
    if (!expected.has(key) || row.proofWorker !== expected.get(key) || row.proofOperation !== 'prove') return 'CLAIM_BEGIN_PROOF_FORBIDDEN_PROCESS';
    const identities = seen.get(key) ?? new Set(); identities.add(row.pid + ':' + row.startTimeTicks); seen.set(key, identities);
    if (identities.size > 1) return 'CLAIM_BEGIN_PROOF_REPEATED_PROCESS';
  }
  if (completed && [...expected.keys()].some(key => seen.get(key)?.size !== 1)) return 'CLAIM_BEGIN_PROOF_PROCESS_PREFIX_INCOMPLETE';
  return null;
}
