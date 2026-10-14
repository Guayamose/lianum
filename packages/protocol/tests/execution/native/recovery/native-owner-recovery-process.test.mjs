/** HOST / PRIVATE-IPC FIXTURES ONLY. The mock chain is deliberately unbranded.
 * The production factory cannot accept it. No native chain or proof runs. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { Vault } from '../../../../../engine/src/crypto/vault.mjs';
import { setup, observation } from './native-owner-recovery-test-fixtures.mjs';
import { createGenericOwnerRecoveryProcess, assertOwnedGenericOwnerRecoveryProcess } from '../../../../../backend/src/execution/native/recovery/native-owner-recovery-process.mjs';
import { digest } from '../../../../../engine/src/crypto/privacy.mjs';
import { PROTOCOL, MAX_BYTES, encode, decode, copy, config, projectNativeObservation, requestFor, checkQuery, checkInitialized, checkAuthorization, view }
  from '../../../../../backend/src/execution/native/recovery/native-owner-recovery-protocol.mjs';

const worker = fileURLToPath(new URL('../../../../../backend/src/execution/native/recovery/native-owner-recovery-child.mjs', import.meta.url));
async function fixtureChild(t, fixture, { replyView = value => value, holdBridge = false,
  canonical = () => true, replyBridgeId = id => id } = {}) {
  // This is explicitly a raw protocol fixture, NOT a factory or an owned native
  // observation adapter. No production factory accepts the mock reader below.
  const child = fork(worker, [], { execArgv: [], env: { LANG: 'C.UTF-8' }, serialization: 'advanced',
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let readyResolve, readyReject, exitResolve, pending, lastId = 0, lastBridge = 0, latest, ended = false;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const exited = new Promise(resolve => { exitResolve = resolve; });
  const log = { reads: 0, checks: 0, stderrBytes: 0, stdoutBytes: 0 };
  function send(value) { const bytes = encode(value); child.send(bytes, () => bytes.fill(0)); }
  for (const [name, stream] of [['stderr', child.stderr], ['stdout', child.stdout]]) {
    stream.on('data', bytes => { log[name + 'Bytes'] += bytes.length; bytes.fill(0); });
  }
  child.once('error', error => { readyReject(error); pending?.reject(error); });
  child.once('close', (code, signal) => {
    ended = true; const error = Object.assign(new Error('FIXTURE_CHILD_EXIT'), { code: 'FIXTURE_CHILD_EXIT' });
    readyReject(error); if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = null; }
    exitResolve({ code, signal });
  });
  child.on('message', bytes => {
    try {
      const message = decode(bytes);
      assert.equal(message.protocol, PROTOCOL);
      if (message.kind === 'ready') readyResolve();
      else if (message.kind === 'bridge') {
        assert.equal(message.requestId, pending?.id); assert.equal(message.id, ++lastBridge);
        if (holdBridge) return;
        let value;
        if (message.operation === 'observe') {
          checkQuery(message.input, fixture.cfg.expectedBinding, pending.note);
          latest = { observationId: message.id, view: replyView(fixture.view()) }; log.reads++;
          value = latest;
        } else {
          assert.equal(message.operation, 'assertCanonical');
          assert.deepEqual(message.input, { observationId: latest.observationId }); log.checks++;
          value = { canonical: canonical(log.checks) };
        }
        send({ kind: 'bridgeResult', protocol: PROTOCOL, id: replyBridgeId(message.id), requestId: message.requestId, ok: true, value });
      } else if (message.kind === 'fatal') {
        readyReject(Object.assign(new Error(message.code), { code: message.code }));
        if (pending) { clearTimeout(pending.timer); pending.reject(Object.assign(new Error(message.code), { code: message.code })); pending = null; }
      } else {
        assert.equal(message.kind, 'result'); assert.equal(message.id, pending?.id);
        const current = pending; pending = null; clearTimeout(current.timer);
        if (message.ok) current.resolve(message.value);
        else current.reject(Object.assign(new Error(message.code), { code: message.code }));
      }
    } catch (error) { pending?.reject(error); readyReject(error); child.kill('SIGTERM'); }
  });
  function ask(operation, input = null) {
    assert.ok(!pending); assert.equal(ended, false);
    const id = ++lastId;
    return new Promise((resolve, reject) => {
      pending = { id, note: input?.note, resolve, reject,
        timer: setTimeout(() => { child.kill('SIGKILL'); reject(new Error('FIXTURE_TIMEOUT')); }, 20000) };
      send({ kind: 'request', protocol: PROTOCOL, id, operation, input });
    });
  }
  // Harness cleanup waits for actual OS exit, including failed/uncertain cases.
  t.after(async () => { if (!ended) child.kill('SIGTERM'); await exited; });
  await ready;
  const initial = await ask('initialize', fixture.cfg);
  checkInitialized(initial, fixture.cfg);
  return { child, initial, log, ask, exited,
    async close() { await ask('close'); return exited; } };
}

test('real factory rejects fake owned capabilities and every backend/observer override before spawn', async t => {
  const f = await setup(t);
  await assert.rejects(createGenericOwnerRecoveryProcess({ runtime: {}, system: {}, poolIndex: 0, custody: f.cfg }),
    { code: 'OWNER_RECOVERY_OWNED_SYSTEM_CAPABILITY' });
  for (const key of ['observer', 'rpc', 'env', 'executable', 'backend']) {
    await assert.rejects(createGenericOwnerRecoveryProcess({ runtime: {}, system: {}, poolIndex: 0, custody: f.cfg, [key]: {} }),
      { code: 'OWNER_RECOVERY_CONFIG' });
  }
  assert.throws(() => assertOwnedGenericOwnerRecoveryProcess({}), { code: 'OWNER_RECOVERY_OWNED_PROCESS_CAPABILITY' });
  await assert.rejects(readFile(f.cfg.exitVault.path), { code: 'ENOENT' });
});

test('fixed child never exports keys or offers arbitrary signing, RPC, destination or observer replacement', async t => {
  const f = await setup(t), child = await fixtureChild(t, f);
  assert.doesNotMatch(JSON.stringify(child.initial), /PRIVATE KEY|privateKey|password|secret|witness/);
  for (const operation of ['exportPrivateKeys', 'sign', 'rpc', 'replaceObserver', 'setDestination']) {
    await assert.rejects(child.ask(operation, null), { code: 'OWNER_RECOVERY_OPERATION_DENIED' });
  }
  await assert.rejects(child.ask('authorizeCurrentNote', { note: 'source', recipient: 'ff'.repeat(20) }),
    { code: 'OWNER_RECOVERY_EXACT_FIELDS' });
  await assert.rejects(child.ask('withdrawalStatus', { note: 'reserve' }), { code: 'OWNER_RECOVERY_NOTE_SELECTION' });
  assert.equal(child.log.reads, 0);
  assert.deepEqual(await child.close(), { code: 0, signal: null });
  assert.equal(child.log.stdoutBytes + child.log.stderrBytes, 0);
});

test('IPC authorization is durably acknowledged; exact retry/restart and root/epoch renewal retain canonical nullifier', async t => {
  const f = await setup(t), original = await readFile(f.cfg.recoveryVault.path);
  let child = await fixtureChild(t, f);
  const status = await child.ask('withdrawalStatus', { note: 'source' });
  const first = await child.ask('authorizeCurrentNote', { note: 'source' });
  assert.equal(first.status, 'AUTHORIZED_UNSPENT_AT_OBSERVATION');
  assert.deepEqual(checkAuthorization(first, status, f.view(), 2), first);
  const durable = await new Vault(f.cfg.exitVault.path).read(f.cfg.exitVault.password);
  assert.deepEqual(durable.data.withdrawals.source.witness, first.witness);
  assert.deepEqual(await child.ask('authorizeCurrentNote', { note: 'source' }), first);
  assert.equal((await new Vault(f.cfg.exitVault.path).read(f.cfg.exitVault.password)).revision, 1);
  f.setView(observation(f.record, [...f.view().commitments, 'ab'.repeat(32)], {
    timestamp: '1791001200', blockNumber: '101', blockHash: '0x' + 'cd'.repeat(32), poolStateSequence: '4' }));
  const renewed = await child.ask('authorizeCurrentNote', { note: 'source' });
  assert.notDeepEqual(renewed.witness.root, first.witness.root);
  assert.notEqual(renewed.witness.epoch, first.witness.epoch);
  assert.deepEqual(renewed.witness.spent, first.witness.spent);
  assert.equal(child.log.reads, 6); assert.equal(child.log.checks, 6);
  await child.close(); f.cfg.exitVault.mode = 'recover'; child = await fixtureChild(t, f);
  assert.deepEqual(await child.ask('authorizeCurrentNote', { note: 'source' }), renewed);
  for (const name of ['change', 'recovery']) {
    const result = await child.ask('authorizeCurrentNote', { note: name });
    assert.equal(result.status, 'AUTHORIZED_UNSPENT_AT_OBSERVATION');
    checkAuthorization(result, child.initial.statuses[name], f.view(), 2);
  }
  assert.deepEqual(await readFile(f.cfg.recoveryVault.path), original);
  await child.close();
});

test('parent-side pure validation rejects public-input, nullifier, opening, signature and observed-result tampering', async t => {
  const f = await setup(t), child = await fixtureChild(t, f);
  const result = await child.ask('authorizeCurrentNote', { note: 'source' }), status = child.initial.statuses.source;
  const mutations = [
    r => { r.expectedPublicInputs[0] = String(BigInt(r.expectedPublicInputs[0]) + 1n); },
    r => { r.witness.spent[0]++; }, r => { r.witness.secret[0] ^= 1; },
    r => { r.witness.signature[0] ^= 1; }, r => { r.witness.amount = '999'; },
    r => { r.observed.blockHash = '0x' + 'ff'.repeat(32); },
    r => { r.authorization.hash = 'aa'.repeat(32); }, r => { r.witness.privateKey = 'not permitted'; },
  ];
  for (const mutate of mutations) { const bad = copy(result); mutate(bad); assert.throws(() => checkAuthorization(bad, status, f.view(), 2)); }
  for (const mutate of [r => { r.witness.policy.unshift(r.witness.scope.pop()); },
    r => { r.witness.epoch = [r.witness.epoch]; }, r => { r.witness.scope[0] = String(r.witness.scope[0]); }]) {
    const bad = copy(result); mutate(bad);
    bad.authorization.hash = digest('LIANUM/PAEG/owner-exit-authorization/1', { request: requestFor(status, f.view()), witness: bad.witness });
    assert.throws(() => checkAuthorization(bad, status, f.view(), 2));
  }
  assert.throws(() => checkAuthorization(result, status, f.view(), 1), { code: 'OWNER_RECOVERY_CANONICAL_OBSERVATION_REQUIRED' });
  await child.close();
});

test('pure native-view projection normalizes RPC hex quantities, preserves lists and checks all registered pool domains', async t => {
  const f = await setup(t), v = f.view(), pool = '0x' + '12'.repeat(20);
  const native = { header: { number: '0x64', hash: v.blockHash, timestamp: '0x' + BigInt(v.timestamp).toString(16) },
    snapshot: { pool, ...Object.fromEntries(['scope', 'policy', 'hubDomain', 'registryCommitment'].map(k => [k, '0x' + v[k]])),
      assetIdentity: '0x' + v.asset },
    ledger: { publicState: { sequence: v.poolStateSequence }, tree: { root: v.root }, commitments: v.commitments, nullifiers: [] } };
  assert.deepEqual(projectNativeObservation(native, f.cfg.expectedBinding, pool), v);
  assert.equal(native.header.number, '0x64');
  for (const field of ['pool', 'scope', 'policy', 'hubDomain', 'registryCommitment', 'assetIdentity']) {
    const bad = copy(native); bad.snapshot[field] = '0x' + 'bb'.repeat(field === 'pool' ? 20 : 32);
    assert.throws(() => projectNativeObservation(bad, f.cfg.expectedBinding, pool), { code: 'OWNER_RECOVERY_POOL_BINDING' });
  }
  const missing = copy(native); delete missing.ledger.nullifiers;
  assert.throws(() => projectNativeObservation(missing, f.cfg.expectedBinding, pool));
  const relative = copy(f.cfg); relative.recoveryVault.path = 'original.vault'; relative.exitVault.path = 'exits.vault';
  const normalized = config(relative);
  assert.equal(normalized.recoveryVault.path, process.cwd() + '/original.vault');
  assert.equal(normalized.exitVault.path, process.cwd() + '/exits.vault');
});

test('failed final canonical check withholds a durably written witness; explicit recovery safely returns the exact retained authorization', async t => {
  const f = await setup(t);
  let child = await fixtureChild(t, f, { canonical: count => count !== 2 });
  await assert.rejects(child.ask('authorizeCurrentNote', { note: 'source' }),
    { code: 'OWNER_RECOVERY_CANONICAL_OBSERVATION_REQUIRED' });
  const committed = await new Vault(f.cfg.exitVault.path).read(f.cfg.exitVault.password);
  assert.equal(committed.revision, 1);
  await child.close(); f.cfg.exitVault.mode = 'recover'; child = await fixtureChild(t, f);
  const result = await child.ask('authorizeCurrentNote', { note: 'source' });
  assert.deepEqual(result.witness, committed.data.withdrawals.source.witness);
  await child.close();
});

test('substituted bridge sequence and concurrent operation are rejected before authorization', async t => {
  const f = await setup(t), child = await fixtureChild(t, f, { replyBridgeId: id => id + 1 });
  await assert.rejects(child.ask('authorizeCurrentNote', { note: 'source' }), { code: 'OWNER_RECOVERY_BRIDGE_SEQUENCE' });
  assert.equal((await child.exited).code, 1);
  assert.equal((await new Vault(f.cfg.exitVault.path).read(f.cfg.exitVault.password)).revision, 0);
  f.cfg.exitVault.mode = 'recover';
  const busy = await fixtureChild(t, f, { holdBridge: true });
  const rejection = assert.rejects(busy.ask('authorizeCurrentNote', { note: 'source' }), { code: 'OWNER_RECOVERY_BUSY_OR_CLOSED' });
  const message = encode({ kind: 'request', protocol: PROTOCOL, id: 3, operation: 'withdrawalStatus', input: { note: 'source' } });
  busy.child.send(message, () => message.fill(0));
  await rejection; assert.equal((await busy.exited).code, 1);
});

test('bridge domain/address/method substitutions and missing ledger lists fail closed', async t => {
  const f = await setup(t), q = { ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment']
    .map(name => [name, f.cfg.expectedBinding[name]])), note: 'source' };
  for (const name of ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'note']) {
    assert.throws(() => checkQuery({ ...q, [name]: name === 'note' ? 'change' : 'aa'.repeat(32) }, f.cfg.expectedBinding, 'source'),
      { code: 'OWNER_RECOVERY_BRIDGE_DOMAIN' });
  }
  for (const key of ['poolIndex', 'to', 'method', 'params', 'header']) {
    assert.throws(() => checkQuery({ ...q, [key]: 'arbitrary' }, f.cfg.expectedBinding, 'source'));
  }
  const missing = f.view(); delete missing.nullifiers;
  assert.throws(() => view(missing, f.cfg.expectedBinding));
  const child = await fixtureChild(t, f, { replyView: current => ({ ...current, asset: 'aa'.repeat(32) }) });
  await assert.rejects(child.ask('authorizeCurrentNote', { note: 'source' }), { code: 'OWNER_RECOVERY_BRIDGE_DOMAIN' });
  assert.equal((await new Vault(f.cfg.exitVault.path).read(f.cfg.exitVault.password)).revision, 0);
  await child.close();
});

test('observed consumed and unissued results are distinct, witness-free, and never successful withdrawal', async t => {
  const f = await setup(t), child = await fixtureChild(t, f), status = child.initial.statuses.source;
  f.setView(observation(f.record, []));
  const missing = await child.ask('authorizeCurrentNote', { note: 'source' });
  assert.equal(missing.status, 'NOTE_NOT_ISSUED_AT_OBSERVATION'); assert.equal(missing.witness, undefined);
  checkAuthorization(missing, status, f.view(), 1);
  f.setView({ ...f.view(), nullifiers: ['0x' + status.canonicalNullifier] });
  const consumed = await child.ask('authorizeCurrentNote', { note: 'source' });
  assert.equal(consumed.status, 'NOTE_CONSUMED_REQUIRES_TRANSACTION_RECONCILIATION'); assert.equal(consumed.witness, undefined);
  checkAuthorization(consumed, status, f.view(), 1);
  assert.equal((await new Vault(f.cfg.exitVault.path).read(f.cfg.exitVault.password)).revision, 0);
  assert.equal(child.log.reads, 2); assert.equal(child.log.checks, 2);
  await child.close();
});

test('unexpected actual child exit rejects an outstanding request and requires reopen', async t => {
  const f = await setup(t), child = await fixtureChild(t, f, { holdBridge: true });
  const result = child.ask('authorizeCurrentNote', { note: 'source' });
  const rejected = assert.rejects(result, { code: 'FIXTURE_CHILD_EXIT' });
  child.child.kill('SIGTERM');
  await rejected; assert.deepEqual(await child.exited, { code: null, signal: 'SIGTERM' });
  assert.equal((await new Vault(f.cfg.exitVault.path).read(f.cfg.exitVault.password)).revision, 0);
});

test('wire codec is bounded and strictly JSON; duplicate sequence terminates the child', async t => {
  assert.throws(() => encode({ value: 'x'.repeat(MAX_BYTES) }), { code: 'OWNER_RECOVERY_MESSAGE_LIMIT' });
  assert.throws(() => decode(Buffer.alloc(MAX_BYTES + 1)), { code: 'OWNER_RECOVERY_MESSAGE_LIMIT' });
  assert.throws(() => encode({ callback() {} }));
  const f = await setup(t), child = await fixtureChild(t, f);
  const bytes = encode({ kind: 'request', protocol: PROTOCOL, id: 1, operation: 'withdrawalStatus', input: { note: 'source' } });
  child.child.send(bytes, () => bytes.fill(0));
  const exit = await child.exited; assert.equal(exit.code, 1);
});

test('unanswered observation bridge times out and the actual private worker exits', async t => {
  const f = await setup(t), child = await fixtureChild(t, f, { holdBridge: true });
  await assert.rejects(child.ask('authorizeCurrentNote', { note: 'source' }), { code: 'OWNER_RECOVERY_OPERATION_TIMEOUT' });
  assert.equal((await child.exited).code, 1);
  assert.equal((await new Vault(f.cfg.exitVault.path).read(f.cfg.exitVault.password)).revision, 0);
});

test('child startup filesystem errors expose a bounded code, never paths, passwords or raw exceptions', async t => {
  const f = await setup(t); f.cfg.recoveryVault.path += '.missing-private-path';
  await assert.rejects(fixtureChild(t, f), error => {
    assert.equal(error.code, 'OWNER_RECOVERY_REJECTED');
    assert.equal(error.message, 'OWNER_RECOVERY_REJECTED');
    return true;
  });
});
