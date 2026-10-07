/** Focused HOST tests only. Proof envelopes below are synthetic non-proofs.
 * No native runtime, proof generation, pinned-key verification or chain access.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, verify } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Vault } from '../../../../src/crypto/vault.mjs';
import { freshKey, wordsBE } from '../../../../src/notes/private-note-encoding.mjs';
import { PrivateNoteTree } from '../../../../src/notes/private-note-tree.mjs';
import { walletNoteCommitment, balanceWithdrawFrame } from '../../../../src/wallet/notes/private-wallet-note-encoding.mjs';
import { compileFundedGraph, fundedAuthorizationWords } from '../../../../src/execution/graph/funded-graph.mjs';
import { a0Context } from '../../../../src/execution/native/dispatch/native-capsules.mjs';
import { encodePrivateProof } from '../../../../src/execution/proofs/proof-worker.mjs';
import { openGenericOwnerRecoveryCustody, OWNER_RECOVERY_SCHEMA } from '../../../../src/execution/native/recovery/native-owner-recovery-custody.mjs';

const hash = text => createHash('sha256').update('synthetic recovery fixture:' + text).digest('hex');
const zero = '0'.repeat(64);
const words = value => wordsBE(Buffer.from(value, 'hex')).map(String);
const note = (key, value, label) => ({ type: 4, rho: hash(label + ' rho'), x: key.x.toString('hex'),
  y: key.y.toString('hex'), value, secret: hash(label + ' secret') });
const emptyNote = () => ({ type: 4, rho: zero, x: zero, y: zero, value: '0', secret: zero });
const stored = (key, opening) => ({ opening, privateKeyPem: key?.privateKey.export({ type: 'pkcs8', format: 'pem' }) ?? null });
function fixture({ prepared = false, emptyChange = false } = {}) {
  const keys = { source: freshKey(), change: freshKey(), recovery: freshKey(), payout: freshKey() };
  const config = { scope: hash('scope'), policy: hash('policy'), asset: hash('asset'), operationId: hash('operation'),
    hubDomain: hash('hub'), registryCommitment: hash('registry'), epoch: '2985000',
    fundingNotBefore: '1791000000', fundingValidUntil: '1791000300', settleBefore: '1791000900' };
  const input = { ...Object.fromEntries(['scope', 'policy', 'asset', 'operationId', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore'].map(k => [k, config[k]])),
    budget: '25', reservationNonce: hash('reservation nonce'), graphNonce: hash('graph nonce'), reserveSecret: hash('reserve secret'),
    inputNote: note(keys.source, emptyChange ? '25' : '32', 'source'), changeNote: emptyChange ? emptyNote() : note(keys.change, '7', 'change'),
    recoveryNote: note(keys.recovery, '25', 'recovery'), nodes: [{ id: 'one', chainDomain: hash('chain'), evidencePolicy: hash('policy one'),
      actionCommitment: hash('action'), dependsOn: [], payout: { x: keys.payout.x.toString('hex'), y: keys.payout.y.toString('hex'),
        value: '25', secret: hash('payout secret'), randomness: hash('payout randomness') } }],
    paddingSalts: Array.from({ length: 4 }, (_, i) => hash('padding ' + i)) };
  const compiled = compileFundedGraph(input), s = compiled.authorizationStatement;
  const binding = { ...config, fundingCommitment: s.inputCommitment, admissionTag: compiled.admissionTag,
    reserveCommitment: s.reserveCommitment, reserveNullifier: s.reserveNullifier,
    changeCommitment: s.changeCommitment, recoveryCommitment: s.recoveryCommitment };
  const c = [...['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'].flatMap(k => words(binding[k])),
    ...words(a0Context(s)), ...words(s.reserveCommitment), ...words(s.reserveNullifier),
    ...Array.from({ length: 8 }, (_, i) => words(hash('capsule ' + i))).flat(), s.settleBefore];
  const mockEnvelope = (mode, publicInputs) => encodePrivateProof(mode, { proof: Buffer.from('SYNTHETIC_HOST_TEST_NOT_A_PROOF'), publicInputs,
    proofFields: Array(458).fill('0'), vkFields: Array(115).fill('0') });
  const record = { schema: OWNER_RECOVERY_SCHEMA, state: prepared ? 'prepared' : 'authorized', binding,
    reserveSecret: input.reserveSecret, source: stored(keys.source, input.inputNote),
    change: stored(emptyChange ? null : keys.change, input.changeNote), recovery: stored(keys.recovery, input.recoveryNote),
    privateProofs: prepared ? null : { authorization: mockEnvelope('authorization', fundedAuthorizationWords(s)),
      capsuleAuthorization: mockEnvelope('capsule', c) } };
  return { keys, record, input, statement: s };
}
async function setup(t, options = {}) {
  const data = fixture(options), directory = await mkdtemp(join(tmpdir(), 'owner-recovery-draft-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cfg = { recoveryVault: { path: join(directory, 'original.vault'), password: 'synthetic original password' },
    exitVault: { path: join(directory, 'exits.vault'), password: 'synthetic exits password', mode: 'create' },
    expectedBinding: structuredClone(data.record.binding), destinations: { source: '12'.repeat(20),
      change: options.emptyChange ? null : '34'.repeat(20), recovery: '56'.repeat(20) } };
  await new Vault(cfg.recoveryVault.path).create(data.record, cfg.recoveryVault.password);
  const { binding } = data.record;
  let commitments = [binding.fundingCommitment, ...(options.emptyChange ? [] : [binding.changeCommitment]), binding.recoveryCommitment];
  let current = observation(data.record, commitments), reads = 0, canonicalChecks = 0;
  const observer = {
    async observe() { reads++; return structuredClone(current); },
    async assertCanonical(view) { canonicalChecks++; return view.blockHash === current.blockHash; },
  };
  return { ...data, cfg, directory, observer, view: () => structuredClone(current),
    setView: value => { current = value; }, reads: () => reads, canonicalChecks: () => canonicalChecks,
    open: mode => openGenericOwnerRecoveryCustody({ ...cfg, exitVault: { ...cfg.exitVault, mode: mode ?? 'create' } }, observer) };
}
function observation(record, commitments, changes = {}) {
  const tree = new PrivateNoteTree(commitments);
  return { ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'].map(k => [k, record.binding[k]])),
    blockNumber: '100', blockHash: '0x' + hash('block 100'), timestamp: '1791000600', poolStateSequence: '3',
    root: tree.root, commitments: commitments.map(c => c.startsWith('0x') ? c : '0x' + c), nullifiers: [], ...changes };
}
function request(custody, state, name = 'source') {
  const { eligibility, authorization, ...terms } = custody.withdrawalStatus(name);
  const tree = new PrivateNoteTree(state.commitments), index = state.commitments.indexOf('0x' + terms.noteCommitment);
  return { ...terms, epoch: (BigInt(state.timestamp) / 600n).toString(), path: tree.path(index) };
}
const recoverCfg = cfg => ({ ...cfg, exitVault: { ...cfg.exitVault, mode: 'recover' } });
async function editRecovery(cfg, transform) {
  const vault = new Vault(cfg.recoveryVault.path), record = await vault.read(cfg.recoveryVault.password);
  await vault.update(cfg.recoveryVault.password, record.revision, transform);
}

test('authorized V1 reopens unchanged, pins destinations before signing, and authorizes only fixed type-4 exits', async t => {
  const f = await setup(t), originalBytes = await readFile(f.cfg.recoveryVault.path), custody = await f.open();
  t.after(() => custody.close());
  assert.deepEqual(Object.keys(custody), []);
  assert.deepEqual(Object.getOwnPropertyNames(Object.getPrototypeOf(custody)).sort(),
    ['constructor', 'withdrawalStatus', 'recordStatus', 'authorizeWithdrawal', 'close'].sort());
  const sidecar = await new Vault(f.cfg.exitVault.path).read(f.cfg.exitVault.password);
  assert.deepEqual(sidecar.data.destinations, f.cfg.destinations); assert.equal(sidecar.revision, 0);
  assert.equal(custody.recordStatus().persistedProofBindingsChecked, true);
  assert.equal(custody.recordStatus().cryptographicProofVerification, false);
  for (const name of ['source', 'change', 'recovery']) {
    const req = request(custody, f.view(), name), result = await custody.authorizeWithdrawal(req);
    assert.equal(result.status, 'AUTHORIZED_UNSPENT_AT_OBSERVATION'); assert.equal(result.expectedPublicInputs.length, 39);
    assert.equal(result.witness.amount, f.record[name].opening.value);
    assert.equal(verify('sha256', balanceWithdrawFrame(req.scope, req.policy, req.noteCommitment, req.recipient, req.amount, req.epoch),
      { key: f.keys[name].publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(result.witness.signature)), true);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE KEY|privateKey|synthetic .* password/);
  }
  assert.deepEqual(await readFile(f.cfg.recoveryVault.path), originalBytes);
  const disk = await readFile(f.cfg.exitVault.path, 'utf8');
  for (const privateText of ['PRIVATE KEY', f.cfg.exitVault.password, f.record.source.opening.secret]) assert.equal(disk.includes(privateText), false);
  assert.equal(f.reads(), 3); assert.equal(f.canonicalChecks(), 6);
});

test('prepared V1 permits source only; zero change requires canonical empty opening/null key', async t => {
  const f = await setup(t, { prepared: true, emptyChange: true }), custody = await f.open();
  t.after(() => custody.close());
  assert.equal(custody.recordStatus().persistedProofBindingsChecked, false);
  assert.equal(custody.withdrawalStatus('change').eligibility, 'NO_CHANGE_NOTE');
  assert.equal(custody.withdrawalStatus('change').canonicalNullifier, null);
  assert.equal(custody.withdrawalStatus('recovery').eligibility, 'AUTHORIZED_RECORD_REQUIRED');
  await assert.rejects(custody.authorizeWithdrawal(request(custody, f.view(), 'recovery')), { code: 'OWNER_RECOVERY_AUTHORIZED_RECORD_REQUIRED' });
  assert.equal((await custody.authorizeWithdrawal(request(custody, f.view()))).status, 'AUTHORIZED_UNSPENT_AT_OBSERVATION');
  const bad = await setup(t, { emptyChange: true });
  await editRecovery(bad.cfg, state => { state.change.privateKeyPem = bad.record.source.privateKeyPem; return state; });
  await assert.rejects(bad.open(), { code: 'OWNER_RECOVERY_EMPTY_CHANGE' });
});

test('key/note mismatch, conservation, every expected binding, A0 fields and C129 context fail closed', async t => {
  const f = await setup(t);
  for (const field of Object.keys(f.cfg.expectedBinding)) {
    const value = ['epoch', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore'].includes(field)
      ? String(BigInt(f.cfg.expectedBinding[field]) + 1n) : hash('wrong ' + field);
    await assert.rejects(openGenericOwnerRecoveryCustody({ ...f.cfg, expectedBinding: { ...f.cfg.expectedBinding, [field]: value } }, f.observer));
  }
  const mutations = [
    [state => { state.source.privateKeyPem = state.recovery.privateKeyPem; }, 'KEY_NOTE_MISMATCH'],
    [state => { state.source.opening.secret = hash('bad source secret'); }, 'NOTE_COMMITMENT'],
    [state => { state.recovery.opening.value = '24'; state.binding.recoveryCommitment = walletNoteCommitment(state.binding.scope, state.binding.policy, state.recovery.opening).toString('hex'); }, 'CONSERVATION'],
    [state => { state.reserveSecret = hash('bad reserve secret'); }, 'RESERVE_NULLIFIER'],
    [state => { state.privateProofs.authorization.publicInputs[32] = '1'; }, 'A0_SOURCE_BINDING'],
    [state => { state.privateProofs.authorization.publicInputs[40] = '1'; }, 'A0_SOURCE_BINDING'],
    [state => { state.privateProofs.authorization.publicInputs[72] = '1'; }, 'A0_BINDING'],
    [state => { state.privateProofs.authorization.publicInputs[136] = '1791000001'; }, 'A0_BINDING'],
    [state => { state.privateProofs.capsuleAuthorization.publicInputs[40] = '1'; }, 'CAPSULE_A0_BINDING'],
    [state => { state.privateProofs.capsuleAuthorization.publicInputs[24] = '1'; }, 'CAPSULE_BINDING'],
  ];
  for (const [mutate, code] of mutations) {
    const item = await setup(t);
    await editRecovery(item.cfg, state => { mutate(state); item.cfg.expectedBinding = structuredClone(state.binding); return state; });
    await assert.rejects(item.open(), { code: 'OWNER_RECOVERY_' + code });
  }
  await assert.rejects(f.open('recover'), { code: 'ENOENT' });
});

test('exact latest retry is stable; destination/value/note/nullifier/domain changes cannot sign', async t => {
  const f = await setup(t), custody = await f.open(); t.after(() => custody.close());
  const req = request(custody, f.view()), first = await custody.authorizeWithdrawal(req);
  assert.deepEqual(await custody.authorizeWithdrawal(req), first); assert.equal(f.reads(), 2);
  assert.equal((await new Vault(f.cfg.exitVault.path).read(f.cfg.exitVault.password)).revision, 1);
  for (const field of ['scope', 'policy', 'noteCommitment', 'recipient', 'amount', 'canonicalNullifier']) {
    const value = field === 'amount' ? '31' : field === 'recipient' ? '78'.repeat(20) : hash('rebind ' + field);
    await assert.rejects(custody.authorizeWithdrawal({ ...req, [field]: value }), { code: 'OWNER_RECOVERY_WITHDRAWAL_MISMATCH' });
  }
  await assert.rejects(custody.authorizeWithdrawal({ ...req, note: 'recovery' }), { code: 'OWNER_RECOVERY_WITHDRAWAL_MISMATCH' });
  await assert.rejects(custody.authorizeWithdrawal({ ...req, message: 'sign arbitrary bytes' }), { code: 'OWNER_RECOVERY_EXACT_FIELDS' });
  const badPath = structuredClone(req.path); badPath.siblings[0] = '0x' + hash('bad sibling');
  await assert.rejects(custody.authorizeWithdrawal({ ...req, path: badPath }), { code: 'OWNER_RECOVERY_MEMBERSHIP' });
  const publicStatus = custody.withdrawalStatus('source'); publicStatus.recipient = 'aa'.repeat(20);
  assert.equal(custody.withdrawalStatus('source').recipient, f.cfg.destinations.source);
});

test('epoch/path rollover and encrypted restart retain latest exact witness and canonical nullifier', async t => {
  const f = await setup(t); let custody = await f.open();
  const oldReq = request(custody, f.view()), first = await custody.authorizeWithdrawal(oldReq);
  f.setView(observation(f.record, [...f.view().commitments, hash('later note')], {
    timestamp: '1791001200', blockNumber: '101', blockHash: '0x' + hash('block 101'), poolStateSequence: '4' }));
  await assert.rejects(custody.authorizeWithdrawal(oldReq), { code: 'OWNER_RECOVERY_CURRENT_MEMBERSHIP_REQUIRED' });
  const freshReq = request(custody, f.view()), fresh = await custody.authorizeWithdrawal(freshReq);
  assert.notDeepEqual(fresh.witness.root, first.witness.root); assert.notEqual(fresh.witness.epoch, first.witness.epoch);
  assert.deepEqual(fresh.witness.spent, first.witness.spent);
  assert.deepEqual(await custody.authorizeWithdrawal(freshReq), fresh);
  custody.close(); custody = await f.open('recover');
  assert.deepEqual(await custody.authorizeWithdrawal(freshReq), fresh); custody.close();
  await assert.rejects(openGenericOwnerRecoveryCustody({ ...recoverCfg(f.cfg), destinations: { ...f.cfg.destinations, source: 'ab'.repeat(20) } }, f.observer), { code: 'OWNER_RECOVERY_EXIT_BINDING' });
  await assert.rejects(f.open(), { code: 'VAULT_EXISTS' });
});

test('fresh reconciliation is mandatory even for retry; unissued and consumed never mean withdrawn/refunded', async t => {
  const f = await setup(t);
  await assert.rejects(openGenericOwnerRecoveryCustody(f.cfg), { code: 'OWNER_RECOVERY_OBSERVER_REQUIRED' });
  const custody = await f.open(); t.after(() => custody.close());
  const req = request(custody, f.view()), original = f.view();
  f.setView(observation(f.record, []));
  assert.equal((await custody.authorizeWithdrawal(req)).status, 'NOTE_NOT_ISSUED_AT_OBSERVATION');
  assert.equal(custody.withdrawalStatus('source').authorization, null);
  f.setView(original); await custody.authorizeWithdrawal(req);
  f.setView({ ...original, nullifiers: ['0x' + req.canonicalNullifier] });
  const consumed = await custody.authorizeWithdrawal(req);
  assert.equal(consumed.status, 'NOTE_CONSUMED_REQUIRES_TRANSACTION_RECONCILIATION'); assert.equal(consumed.witness, undefined);
  for (const field of ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment']) {
    f.setView({ ...original, [field]: hash('wrong observed ' + field) });
    await assert.rejects(custody.authorizeWithdrawal(req), { code: 'OWNER_RECOVERY_OBSERVATION_DOMAIN' });
  }
  f.setView({ ...original, root: '0x' + hash('unaccepted root') });
  await assert.rejects(custody.authorizeWithdrawal(req), { code: 'OWNER_RECOVERY_OBSERVATION_ROOT' });
  f.setView({ ...original, nullifiers: undefined }); await assert.rejects(custody.authorizeWithdrawal(req));
  f.setView(original); assert.equal(f.reads() >= 10, true);
});

test('canonical observation failure returns no authorization before or after the durable write', async t => {
  const f = await setup(t); let count = 0;
  const observer = { observe: f.observer.observe, assertCanonical: async () => ++count % 2 === 1 };
  const custody = await openGenericOwnerRecoveryCustody(f.cfg, observer), req = request(custody, f.view());
  await assert.rejects(custody.authorizeWithdrawal(req), { code: 'OWNER_RECOVERY_CANONICAL_OBSERVATION_REQUIRED' });
  assert.equal((await new Vault(f.cfg.exitVault.path).read(f.cfg.exitVault.password)).revision, 1);
  custody.close(); const recovered = await f.open('recover');
  assert.equal((await recovered.authorizeWithdrawal(req)).status, 'AUTHORIZED_UNSPENT_AT_OBSERVATION'); recovered.close();
  const firstFail = await openGenericOwnerRecoveryCustody(recoverCfg(f.cfg), { observe: f.observer.observe, assertCanonical: async () => false });
  await assert.rejects(firstFail.authorizeWithdrawal(req), { code: 'OWNER_RECOVERY_CANONICAL_OBSERVATION_REQUIRED' }); firstFail.close();
});

test('durable failure before/after rename and on readback never acknowledges; reopen reconciles actual disk', async t => {
  const f = await setup(t); let custody = await f.open();
  const req = request(custody, f.view()), originalWrite = Vault.prototype._write;
  async function failure(afterWrite, input = req) {
    Vault.prototype._write = async function(record, password) {
      if (this.path !== f.cfg.exitVault.path) return originalWrite.call(this, record, password);
      if (afterWrite) await originalWrite.call(this, record, password);
      throw Object.assign(new Error('controlled synthetic I/O failure'), { code: 'EIO' });
    };
    try { await assert.rejects(custody.authorizeWithdrawal(input), { code: 'EIO' }); }
    finally { Vault.prototype._write = originalWrite; }
    assert.throws(() => custody.withdrawalStatus('source'), { code: 'OWNER_RECOVERY_REOPEN_REQUIRED' });
    custody.close(); custody = await f.open('recover');
  }
  await failure(false); assert.equal(custody.withdrawalStatus('source').authorization, null);
  await failure(true);
  const disk = await new Vault(f.cfg.exitVault.path).read(f.cfg.exitVault.password);
  assert.deepEqual((await custody.authorizeWithdrawal(req)).witness, disk.data.withdrawals.source.witness);
  f.setView({ ...f.view(), timestamp: '1791001200' }); const renew = request(custody, f.view());
  await failure(false, renew); assert.equal(custody.withdrawalStatus('source').authorization.epoch, req.epoch);
  await failure(true, renew); assert.equal(custody.withdrawalStatus('source').authorization.epoch, renew.epoch);
  assert.deepEqual((await custody.authorizeWithdrawal(renew)).witness.spent, disk.data.withdrawals.source.witness.spent);
  // Inject the readback fault only after the successful update has reached disk.
  f.setView({ ...f.view(), timestamp: '1791001800' }); const third = request(custody, f.view());
  const originalRead = Vault.prototype.read; let committed = false;
  Vault.prototype._write = async function(record, password) { const result = await originalWrite.call(this, record, password);
    if (this.path === f.cfg.exitVault.path) committed = true; return result; };
  Vault.prototype.read = async function(password) {
    if (committed && this.path === f.cfg.exitVault.path) throw Object.assign(new Error('controlled readback failure'), { code: 'EIO' });
    return originalRead.call(this, password);
  };
  try { await assert.rejects(custody.authorizeWithdrawal(third), { code: 'EIO' }); }
  finally { Vault.prototype._write = originalWrite; Vault.prototype.read = originalRead; }
  assert.throws(() => custody.withdrawalStatus('source'), { code: 'OWNER_RECOVERY_REOPEN_REQUIRED' }); custody.close();
  custody = await f.open('recover'); assert.equal((await custody.authorizeWithdrawal(third)).status, 'AUTHORIZED_UNSPENT_AT_OBSERVATION'); custody.close();
});

test('destination initialization write failure returns no custody object, including a committed lost acknowledgement', async t => {
  for (const afterWrite of [false, true]) {
    const f = await setup(t), originalWrite = Vault.prototype._write;
    Vault.prototype._write = async function(record, password) {
      if (this.path !== f.cfg.exitVault.path) return originalWrite.call(this, record, password);
      if (afterWrite) await originalWrite.call(this, record, password);
      throw Object.assign(new Error('controlled creation failure'), { code: 'EIO' });
    };
    try { await assert.rejects(f.open(), { code: 'EIO' }); } finally { Vault.prototype._write = originalWrite; }
    if (!afterWrite) await assert.rejects(f.open('recover'), { code: 'ENOENT' });
    else {
      await assert.rejects(f.open(), { code: 'VAULT_EXISTS' });
      const custody = await f.open('recover'); assert.equal(custody.withdrawalStatus('source').authorization, null); custody.close();
      await assert.rejects(openGenericOwnerRecoveryCustody({ ...recoverCfg(f.cfg), destinations: { ...f.cfg.destinations, source: 'ee'.repeat(20) } }, f.observer), { code: 'OWNER_RECOVERY_EXIT_BINDING' });
    }
  }
});

test('missing/corrupt/locked Vaults, tampered durable signatures, and concurrent writers fail closed', async t => {
  const f = await setup(t); let custody = await f.open(), req = request(custody, f.view());
  await custody.authorizeWithdrawal(req); custody.close();
  await assert.rejects(openGenericOwnerRecoveryCustody({ ...recoverCfg(f.cfg), recoveryVault: { ...f.cfg.recoveryVault, password: 'wrong' } }, f.observer));
  const original = await readFile(f.cfg.recoveryVault.path);
  await writeFile(f.cfg.recoveryVault.path + '.lock', 'synthetic stale lock');
  await assert.rejects(f.open('recover'), { code: 'OWNER_RECOVERY_VAULT_LOCKED' }); await rm(f.cfg.recoveryVault.path + '.lock');
  await writeFile(f.cfg.recoveryVault.path, 'corrupt'); await assert.rejects(f.open('recover')); await writeFile(f.cfg.recoveryVault.path, original);
  const sidecar = new Vault(f.cfg.exitVault.path), prior = await sidecar.read(f.cfg.exitVault.password);
  await sidecar.update(f.cfg.exitVault.password, prior.revision, state => { state.withdrawals.source.witness.signature[0] ^= 1; return state; });
  await assert.rejects(f.open('recover'), { code: 'OWNER_RECOVERY_EXIT_SIGNATURE' });
  const clean = await setup(t), one = await clean.open(), two = await clean.open('recover');
  req = request(one, clean.view()); await one.authorizeWithdrawal(req);
  await assert.rejects(two.authorizeWithdrawal(req), { code: 'OWNER_RECOVERY_EXIT_RECORD_CHANGED' });
  assert.throws(() => two.withdrawalStatus('source'), { code: 'OWNER_RECOVERY_REOPEN_REQUIRED' }); one.close(); two.close();
  const changed = await setup(t), active = await changed.open();
  await editRecovery(changed.cfg, state => state);
  await assert.rejects(active.authorizeWithdrawal(request(active, changed.view())), { code: 'OWNER_RECOVERY_RECOVERY_RECORD_CHANGED' }); active.close();
  const missing = await setup(t); await rm(missing.cfg.recoveryVault.path); await assert.rejects(missing.open(), { code: 'ENOENT' });
  assert.deepEqual((await readdir(missing.directory)), []);
});

test('exact retry cannot acknowledge a superseded authorization after awaiting observation', async t => {
  const f = await setup(t), first = await f.open();
  const req = request(first, f.view()); await first.authorizeWithdrawal(req);
  let entered, release;
  const observing = new Promise(resolve => { entered = resolve; });
  const waiting = new Promise(resolve => { release = resolve; });
  const pausedObserver = { async observe() { const snapshot = f.view(); entered(); await waiting; return snapshot; },
    async assertCanonical() { return true; } }; // Both old/new blocks can remain canonical.
  const second = await openGenericOwnerRecoveryCustody(recoverCfg(f.cfg), pausedObserver);
  const pending = second.authorizeWithdrawal(req);
  const rejected = assert.rejects(pending, { code: 'OWNER_RECOVERY_EXIT_RECORD_CHANGED' });
  await observing;
  f.setView({ ...f.view(), timestamp: '1791001200' });
  await first.authorizeWithdrawal(request(first, f.view()));
  release(); await rejected;
  assert.throws(() => second.withdrawalStatus('source'), { code: 'OWNER_RECOVERY_REOPEN_REQUIRED' });
  first.close(); second.close();
});

test('source and exit Vault data/lock namespaces must be disjoint before writing', async t => {
  const f = await setup(t);
  for (const path of [f.cfg.recoveryVault.path, f.cfg.recoveryVault.path + '.lock']) {
    await assert.rejects(openGenericOwnerRecoveryCustody({ ...f.cfg, exitVault: { ...f.cfg.exitVault, path } }, f.observer),
      { code: 'OWNER_RECOVERY_SEPARATE_EXIT_VAULT_REQUIRED' });
  }
  await assert.rejects(openGenericOwnerRecoveryCustody({ ...f.cfg,
    recoveryVault: { ...f.cfg.recoveryVault, path: f.cfg.exitVault.path + '.lock' } }, f.observer),
  { code: 'OWNER_RECOVERY_SEPARATE_EXIT_VAULT_REQUIRED' });
  assert.deepEqual(await readdir(f.directory), ['original.vault']);
});
