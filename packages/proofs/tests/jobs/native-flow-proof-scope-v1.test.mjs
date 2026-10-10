/** Actual guard source with synthetic /proc/lock/result ports. No filesystem
 * state, proof process, native runtime, key, compiler or network is created. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { classifyBeginPayoutAuditProofProcessV1, beginPayoutAuditProcessFailureV1 } from '../../src/jobs/native-flow-proof-scope-v1.mjs';
import { ROOT, GOLDEN } from '../../src/catalog.mjs';
const source = readFileSync(new URL('../../src/jobs/native-flow-proof-scope-v1.mjs', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('const ENTRY =')).replaceAll('export ', '');
const profile = 'SOLANA_LOADED_BEGIN_PAYOUT_BACKING_AUDIT_STOP_V1', runId = '11111111-1111-4111-8111-111111111111';
const STAGES = ['preposition-owner-native-claim-1', 'prove-and-issue-original-native-claim-1', 'exit-original-claim-note-and-redeem-native-1'];
const PREFIX = ['deposit_intent', 'native_claim_ingress_v3', 'withdraw_balance'];
function fixture(index = 0, actor = index === 0 ? 'owner' : 'main') {
  const entry = join(ROOT, 'integration/run-native-claim-begin-payout-audit-v1.mjs');
  const local = join(ROOT, '.local/native-claim-begin-payout-audit-v1');
  const attempt = join(local, 'attempt-' + runId), calls = [];
  const stat = (pid, ppid, group = 20) => ({ pid, ppid, pgrp: group, session: group, state: 'S', startTimeTicks: String(pid * 10) });
  const rows = new Map([[1, { ...stat(1, 0, 1), argv: ['/init'], cwd: '/' }],
    [10, { ...stat(10, 1, 10), argv: ['/node', 'integration/run-native-claim-begin-payout-audit-v1.mjs'], cwd: ROOT }],
    [20, { ...stat(20, 10), argv: ['/node', join(ROOT, 'integration/native-claim-flow.mjs')], cwd: ROOT }],
    [30, { ...stat(30, 20), argv: ['/node', join(ROOT, 'mobile-core/flat-owner-process.mjs'), '--flat-owner-child'], cwd: join(attempt, 'private-audit/owner-asset-1') }],
    [40, { ...stat(40, 20), argv: ['/node', join(GOLDEN, 'src/paeg/proof-worker.mjs'), 'withdraw_balance'], cwd: GOLDEN }]]);
  const c = { active: true, released: true, rows, calls, result: { format: 'LIANUM_SOL_BEGIN_PAYOUT_BACKING_AUDIT_RESULT_V1',
    profile, runId, success: false, supervisor: { supervisorPID: 10, workerPID: 20 }, phase: STAGES[index],
    proofs: PREFIX.slice(0, index).map(relation => ({ relation })) }, lock: { format: 'LIANUM_SOL_BEGIN_PAYOUT_AUDIT_LOCK_V1',
    pid: 10, supervisorStartTimeTicks: '100', runId, attempt: '.local/native-claim-begin-payout-audit-v1/attempt-' + runId } };
  const env = { assert, join, resolve, ROOT, GOLDEN, CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1: profile,
    process: { platform: 'linux', pid: actor === 'owner' ? 30 : actor === 'child' ? 40 : 20, execPath: '/node' },
    existsSync: path => { assert.equal(path, join(local, 'active.lock')); return c.active; },
    nativeProcStatV1: pid => { const row = rows.get(pid); return row && { ...row }; },
    readFileSync: path => { const pid = Number(/^\/proc\/(\d+)\/cmdline$/.exec(path)?.[1]); assert.ok(rows.has(pid)); return rows.get(pid).argv.join('\0') + '\0'; },
    realpathSync: path => {
      const match = /^\/proc\/(\d+)\/(cwd|exe)$/.exec(path);
      return match ? match[2] === 'cwd' ? rows.get(Number(match[1])).cwd : '/node' : path;
    },
    readNativeFlowRegularV1: path => {
      assert.ok(c.active, 'SYNTHETIC_MISSING_ORIGINAL_LOCK');
      if (path === join(local, 'active.lock')) return JSON.stringify(c.lock);
      assert.equal(path, join(attempt, 'result.json')); return JSON.stringify(c.result);
    },
    assertBeginPayoutAuditReleaseV1() { assert.equal(c.released, true, 'SYNTHETIC_CLOSED_RELEASE'); },
  };
  c.api = vm.runInThisContext('(function({' + Object.keys(env).join(',') + '}) {' + body
    + '; return { assertBeginPayoutAuditRoleLaunchV1, assertBeginPayoutAuditLegacyLaunchV1, assertBeginPayoutAuditLegacyJobV1 }; })')(env);
  return c;
}

test('fixed actual-source launch guards admit only original D27, CI51 and W39 at their existing prefix/stage', () => {
  for (const index of [0, 1]) {
    const c = fixture(index); assert.equal(c.api.assertBeginPayoutAuditRoleLaunchV1(index ? 'claim_ingress' : 'owner', PREFIX[index]), true);
    assert.throws(() => c.api.assertBeginPayoutAuditRoleLaunchV1(index ? 'claim_ingress' : 'owner', PREFIX[index]), /ONE_ORIGINAL_LAUNCH/);
  }
  const c = fixture(2); assert.equal(c.api.assertBeginPayoutAuditLegacyLaunchV1('owner', 'prove', 'withdraw_balance'), true);
  assert.throws(() => c.api.assertBeginPayoutAuditLegacyLaunchV1('owner', 'prove', 'withdraw_balance'), /ONE_ORIGINAL_LAUNCH/);
});

test('CO42, other flat/V2 roles, other golden relations and verification refuse before a spawn/fork port', () => {
  let launches = 0;
  for (const [role, relation] of [['claim_discharge', 'native_claim_discharge'], ['owner', 'authorization'],
    ['claim_ingress', 'native_claim_ingress'], ['reservation', 'reservation'], ['owner', 'native_claim_ingress_v3']]) {
    const c = fixture(1); assert.throws(() => { c.api.assertBeginPayoutAuditRoleLaunchV1(role, relation); launches++; }, /FORBIDDEN_RELATION/);
  }
  for (const [purpose, operation, mode] of [['owner', 'prove', 'authorization'], ['coordinator', 'prove', 'refund'],
    ['owner', 'verify', 'withdraw_balance'], ['owner', 'prove', 'deposit_balance']]) {
    const c = fixture(2); assert.throws(() => { c.api.assertBeginPayoutAuditLegacyLaunchV1(purpose, operation, mode); launches++; });
  }
  assert.equal(launches, 0);
});

test('stage, prefix, owner cwd, caller, lifetime, PID identity, group and missing lock all fail closed', () => {
  for (const change of [c => c.result.phase = STAGES[1], c => c.result.proofs.push({ relation: 'deposit_intent' }),
    c => c.rows.get(30).cwd += '-other', c => c.lock.supervisorStartTimeTicks = '999',
    c => c.result.runId = 'other', c => c.result.supervisor.workerPID = 99,
    c => c.rows.get(30).pgrp = 99, c => c.active = false, c => c.released = false, c => c.result.success = true]) {
    const c = fixture(); change(c); assert.throws(() => c.api.assertBeginPayoutAuditRoleLaunchV1('owner', 'deposit_intent'));
  }
  assert.throws(() => fixture(0, 'main').api.assertBeginPayoutAuditRoleLaunchV1('owner', 'deposit_intent'));
  assert.throws(() => fixture(1, 'owner').api.assertBeginPayoutAuditRoleLaunchV1('claim_ingress', 'native_claim_ingress_v3'));
});

test('ordinary profiles keep original launch semantics; an unrelated caller cannot borrow an active diagnostic lock', () => {
  const c = fixture(1); c.rows.get(10).argv[1] = join(ROOT, 'integration/run-native-claim-loaded-v3-flow.mjs');
  assert.throws(() => c.api.assertBeginPayoutAuditRoleLaunchV1('claim_discharge', 'native_claim_discharge'), /FOREIGN_ACTIVE_LIFETIME/);
  c.active = false; assert.equal(c.api.assertBeginPayoutAuditRoleLaunchV1('claim_discharge', 'native_claim_discharge'), false);
  assert.equal(c.api.assertBeginPayoutAuditLegacyLaunchV1('owner', 'verify', 'withdraw_balance'), false);
});

test('golden worker descriptive relation must match its actual private IPC job and original main parent', () => {
  const c = fixture(2, 'child'); c.api.assertBeginPayoutAuditLegacyJobV1('owner', 'prove', 'withdraw_balance');
  assert.throws(() => c.api.assertBeginPayoutAuditLegacyJobV1('owner', 'prove', 'authorization'), /FORBIDDEN_RELATION/);
  assert.throws(() => c.api.assertBeginPayoutAuditLegacyJobV1('owner', 'verify', 'withdraw_balance'), /FORBIDDEN_OPERATION/);
  c.rows.get(40).argv = ['/node', join(GOLDEN, 'src/paeg/proof-worker.mjs')];
  assert.throws(() => c.api.assertBeginPayoutAuditLegacyJobV1('owner', 'prove', 'withdraw_balance'));
});

function processes() {
  const argv = [
    ['/node', join(ROOT, 'proof-workers/role-process.mjs'), 'deposit_intent'],
    ['/node', join(ROOT, 'proof-workers/worker.mjs'), 'deposit_intent', 'prove', 'run'],
    ['/node', join(ROOT, 'proof-workers/native-ingress-v3-role-process.mjs'), 'native_claim_ingress_v3'],
    ['/node', join(ROOT, 'proof-workers/native-ingress-v3-worker.mjs'), 'run', 'job'],
    ['/node', join(GOLDEN, 'src/paeg/proof-worker.mjs'), 'withdraw_balance'],
  ];
  return argv.map((args, i) => ({ pid: i + 100, startTimeTicks: String(i + 1), ...classifyBeginPayoutAuditProofProcessV1(args) }));
}
test('supervisor retains bounded relation labels and rejects unexpected/missing/repeated proof processes', () => {
  const p = processes(); assert.equal(beginPayoutAuditProcessFailureV1(p, true), null);
  assert.equal(beginPayoutAuditProcessFailureV1(p.slice(0, 2)), null);
  assert.match(beginPayoutAuditProcessFailureV1(p.slice(0, 2), true), /PREFIX_INCOMPLETE/);
  assert.match(beginPayoutAuditProcessFailureV1([...p, { ...p[0], pid: 999 }]), /REPEATED_PROCESS/);
  for (const argv of [['/node', join(ROOT, 'proof-workers/role-process.mjs'), 'native_claim_discharge'],
    ['/node', join(ROOT, 'proof-workers/worker.mjs'), 'deposit_intent', 'prepare-key', 'run'],
    ['/node', join(GOLDEN, 'src/paeg/proof-worker.mjs')], ['/node', join(ROOT, 'proof-workers/role-process.mjs'), 'private unexpected string']]) {
    const bad = classifyBeginPayoutAuditProofProcessV1(argv);
    assert.match(beginPayoutAuditProcessFailureV1([...p, { ...bad, pid: 900, startTimeTicks: '9' }]), /FORBIDDEN_PROCESS/);
    assert.ok(!JSON.stringify(bad).includes('private unexpected string'));
  }
});

test('the real launch sites call guard before spawn/fork and the child guard before execute; supervisor checks live and terminal histories', () => {
  const role = readFileSync(new URL('../../src/jobs/role-client.mjs', import.meta.url), 'utf8');
  assert.ok(role.indexOf('assertBeginPayoutAuditRoleLaunchV1(role, spec.name);') < role.indexOf('child = spawn(process.execPath'));
  const legacy = readFileSync(new URL('../../../engine/src/execution/proofs/proof-process.mjs', import.meta.url), 'utf8');
  assert.ok(legacy.indexOf('assertBeginPayoutAuditLegacyLaunchV1(purpose, operation, mode)') < legacy.indexOf('child = fork(workerFile'));
  assert.match(legacy, /fork\(workerFile, beginAuditProof \? \['withdraw_balance'\] : \[\]/);
  const child = readFileSync(new URL('../../../engine/src/execution/proofs/proof-worker.mjs', import.meta.url), 'utf8');
  assert.ok(child.indexOf('assertBeginPayoutAuditLegacyJobV1(request.purpose, request.operation, request.mode);') < child.indexOf('const result = await execute(request, phase);'));
  const supervisor = readFileSync(new URL('../../../../tests/integration/native/native-flow-supervisor.mjs', import.meta.url), 'utf8');
  assert.match(supervisor, /beginPayoutAuditProcessFailureV1\(\[\.\.\.history\.values\(\)\]\)/);
  assert.match(supervisor, /beginPayoutAuditProcessFailureV1\(\[\.\.\.history\.values\(\)\], true\)/);
  assert.match(supervisor, /proofRelation: established\.proofRelation, proofOperation: established\.proofOperation/);
});

test('shared original PID parser and exited proof labels preserve immutable process identity', async () => {
  const { parseNativeProcStat, nativeExitedProcessClassification } = await import('../../../../tests/integration/native/native-flow-supervisor.mjs');
  const fields = ['S', '20', '30', '30', ...Array(15).fill('0'), '1234', '0', '0'];
  const parsed = parseNativeProcStat(40, '40 (name with ) parentheses) ' + fields.join(' '));
  assert.deepEqual(parsed, { pid: 40, ppid: 20, pgrp: 30, session: 30, state: 'S', startTimeTicks: '1234' });
  const prior = { ...parsed, ...processes()[4], pgrp: 30, session: 30 }, dead = { ...prior, state: 'Z' };
  const kept = nativeExitedProcessClassification(dead, prior);
  assert.equal(kept.proofRelation, 'withdraw_balance'); assert.equal(kept.proofOperation, 'prove');
  assert.equal(kept.proofWorker, true);
  assert.deepEqual(nativeExitedProcessClassification(dead, { ...prior, startTimeTicks: 'changed' }), { role: 'owned-descendant', proofWorker: false });
});

test('shared original supervisor still enforces one heavy backend and unchanged per-worker floors', async () => {
  const { nativeProofProcessResources, nativeResourceFailure, NATIVE_FLOW_LIMITS } = await import('../../../../tests/integration/native/native-flow-supervisor.mjs');
  const main = { pid: 1, state: 'S', role: 'main-worker', proofWorker: false, rssBytes: 1 };
  const role = { pid: 2, state: 'S', role: 'native-ingress-v3-proof-role', proofWorker: false, rssBytes: 2 };
  const backend = { pid: 3, state: 'S', role: 'native-ingress-v3-proof-worker', proofWorker: true, rssBytes: 3 };
  const sample = { availableRAMBytes: 2684354560, freeDiskBytes: 5368709120, mainWorkerRSSBytes: 1, supervisorRSSBytes: 1 };
  assert.equal(NATIVE_FLOW_LIMITS.maximumProofOrMainRSSBytes, 3221225472);
  assert.equal(NATIVE_FLOW_LIMITS.totalMilliseconds, 90 * 60 * 1000);
  assert.equal(nativeResourceFailure({ ...sample, ...nativeProofProcessResources([main, role, backend]) }), null);
  assert.equal(nativeResourceFailure({ ...sample, ...nativeProofProcessResources([main, role, backend, { ...backend, pid: 4 }]) }), 'NATIVE_MULTIPLE_HEAVY_PROOF_WORKERS');
  assert.equal(nativeResourceFailure({ ...sample, ...nativeProofProcessResources([main, role, { ...backend, rssBytes: 3221225473 }]) }), 'NATIVE_PROOF_WORKER_RSS_LIMIT');
});


test('fixed native U coordinator and its authentic BB child consume one heavy slot and one combined 3GiB budget',async()=>{
  const {classifyAuthorizationNativeProcessV1,AUTHORIZATION_NATIVE_BINARY_V1}=await import('../../src/jobs/authorization-native-execution-v1.mjs');
  const {nativeProofProcessResources,nativeResourceFailure,nativeWalletUnfundedProcessFailure}=await import('../../../../tests/integration/native/native-flow-supervisor.mjs');
  const argv=[process.execPath,join(ROOT,'proof-workers/worker.mjs'),'authorization','prove',runId];
  const parent={pid:202,argv},childArgv=[AUTHORIZATION_NATIVE_BINARY_V1,'msgpack','run','--input','/tmp/bb-202-0-0.sock'];
  const coordinator={pid:202,ppid:101,state:'S',rssBytes:128,...classifyAuthorizationNativeProcessV1(argv,process.execPath,null)};
  const backend={pid:303,ppid:202,state:'S',rssBytes:3221225472-128,...classifyAuthorizationNativeProcessV1(childArgv,AUTHORIZATION_NATIVE_BINARY_V1,parent)};
  assert.equal(coordinator.proofWorker,false);assert.equal(backend.proofWorker,true);
  assert.equal(classifyAuthorizationNativeProcessV1(['/other-child'],'/other-child',{pid:303,argv:childArgv}).proofWorker,true);
  assert.equal(classifyAuthorizationNativeProcessV1(argv,'/other-executable',null),null);
  for(const changed of [ {...parent,argv:[...argv.slice(0,2),'reservation',...argv.slice(3)]}, {...parent,pid:999} ])
    assert.throws(()=>classifyAuthorizationNativeProcessV1(childArgv,AUTHORIZATION_NATIVE_BINARY_V1,changed));
  assert.throws(()=>classifyAuthorizationNativeProcessV1([...childArgv,'--other'],AUTHORIZATION_NATIVE_BINARY_V1,parent));
  const host={availableRAMBytes:2684354560,freeDiskBytes:5368709120,mainWorkerRSSBytes:1,supervisorRSSBytes:1};
  assert.equal(nativeResourceFailure({...host,...nativeProofProcessResources([coordinator,backend])}),null);
  assert.equal(nativeResourceFailure({...host,...nativeProofProcessResources([coordinator,{...backend,rssBytes:backend.rssBytes+1}])}),'NATIVE_PROOF_WORKER_RSS_LIMIT');
  assert.equal(nativeResourceFailure({...host,...nativeProofProcessResources([coordinator,{...backend,rssBytes:64},{...backend,pid:304,rssBytes:64}])}),'NATIVE_MULTIPLE_HEAVY_PROOF_WORKERS');
  assert.equal(nativeResourceFailure({...host,...nativeProofProcessResources([coordinator,{...backend,state:'Z',liveThreadCount:1,rssBytes:backend.rssBytes+1}])}),'NATIVE_PROOF_WORKER_RSS_LIMIT');
  for(const rows of[[coordinator],[backend],[coordinator,backend]])
    assert.equal(nativeWalletUnfundedProcessFailure(rows),'NATIVE_WALLET_UNFUNDED_PROOF_FORBIDDEN');
});
