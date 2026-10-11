/** HOST ONLY: crypto, encrypted local files, actor/process boundaries. No native
 * runtime, network, funding, genuine proofs or claim of chain availability. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Vault } from '../../src/crypto/vault.mjs';
import { encryptJson } from '../../src/crypto/privacy.mjs';
import { freshKey, createGraph, paymentCommitment, localCommitment, signature, invoiceFrame } from '../../src/notes/private-note-encoding.mjs';
import { PrivateNoteTree, noteWordsToHash } from '../../src/notes/private-note-tree.mjs';
import { createAssemblyOwner, assemblyActorPublicInputs, assemblyPackageDigest } from '../../src/assembly/private-assembly-actors.mjs';
import { launchAssemblyProcess } from '@lianum/proofs/execution/assembly-workers';
import { persistOriginalOwnerRefundCustody, recoverOwnerRefundCustody, validateOwnerRefundBinding, validateOwnerRefundOpening, importOwnerRefundOpening, ownerRefundWithdrawalInput } from '../../src/recovery/private-owner-refund-custody.mjs';
import { launchOwnerRefundProcess } from '../../src/recovery/private-owner-refund-process.mjs';
const h = (width = 32) => randomBytes(width).toString('hex');
function plan() {
  const policy = { minimumBtcConfirmations: 6 };
  for (const role of ['sol', 'btc']) { const k = freshKey(); policy[role] = { policyId: h(), identityNamespace: h(), genesis: h(), x: k.x.toString('hex'), y: k.y.toString('hex') }; }
  return { scope: h(), policy, epoch: '1000', sourceSol: h(), recipientSol: h(), recipientBtc: h(), claimEpoch: '1012', budget: '1000000000000000' };
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'owner-refund-')); t.after(() => rm(directory, { recursive: true, force: true }));
  return { graph: createGraph(plan()), cfg: { path: join(directory, 'owner.refund.vault'), password: `synthetic-🔐-${h()}`, withdrawalRecipient: h(20) } };
}
const recovery = (cfg, opening) => ({ path: cfg.path, password: cfg.password, expectedBinding: opening.binding });
const request = o => ({ scope: o.binding.scope, policy: o.binding.policy, paymentCommitment: o.binding.paymentCommitment, recipient: o.binding.withdrawalRecipient, amount: o.binding.budget, epoch: o.binding.cutoff });
async function persisted(t) { const f = await fixture(t), wallet = await persistOriginalOwnerRefundCustody(f.graph, f.cfg); return { ...f, wallet, opening: wallet.opening() }; }

test('HOST ONLY: persists ONLY exact original type3 note/key/binding and recovers unchanged withdrawal authorization', async t => {
  const { graph, cfg, wallet, opening } = await persisted(t), req = request(opening);
  assert.deepEqual(Object.keys(wallet), []); assert.equal(wallet.exportKey, undefined); assert.equal(wallet.sign, undefined);
  assert.equal(opening.note.type, 3); assert.equal(opening.note.value, graph.budget.toString());
  assert.equal(opening.binding.paymentCommitment, graph.recovery.commitment.toString('hex'));
  const plain = (await new Vault(cfg.path).read(cfg.password)).data;
  assert.deepEqual(Object.keys(plain).sort(), ['binding', 'note', 'privateKeyPem', 'version']);
  assert.deepEqual(Object.keys(plain.note).sort(), ['origin', 'secret', 'type', 'value', 'x', 'y']);
  const encoded = await readFile(cfg.path, 'utf8');
  for (const secret of [cfg.password, graph.originSeed.toString('hex'), graph.recovery.secret.toString('hex'), graph.recovery.x.toString('hex'), 'PRIVATE KEY', 'originSeed', 'graphSalt', 'reserveSecret']) assert.equal(encoded.includes(secret), false);
  assert.equal((await stat(cfg.path)).mode & 0o777, 0o600);
  wallet.close(); assert.throws(() => wallet.opening(), /OWNER_REFUND_CLOSED/);
  const restored = await recoverOwnerRefundCustody(recovery(cfg, opening)); t.after(() => restored.close());
  assert.deepEqual(restored.opening(), opening);
  const authorization = restored.authorizeWithdrawal(req), tree = new PrivateNoteTree([h(), opening.binding.paymentCommitment]);
  const input = ownerRefundWithdrawalInput(opening.binding, opening, authorization, tree.path(1));
  assert.equal(input.note_type, 3); assert.equal(input.value, req.amount); assert.equal(input.epoch, req.epoch);
  assert.deepEqual(input.secret, [...graph.recovery.secret]); assert.deepEqual(input.key_x, [...graph.recovery.x]);
  assert.equal(importOwnerRefundOpening(opening.binding, opening).note.commitment.equals(graph.recovery.commitment), true);
});

test('HOST ONLY: wrong password, encrypted tampering and every immutable binding substitution reject recovery', async t => {
  const { cfg, wallet, opening } = await persisted(t); wallet.close();
  await assert.rejects(recoverOwnerRefundCustody({ ...recovery(cfg, opening), password: 'wrong' }));
  for (const field of Object.keys(opening.binding)) {
    const binding = { ...opening.binding, [field]: ['budget', 'cutoff'].includes(field) ? '1' : h(field === 'withdrawalRecipient' ? 20 : 32) };
    await assert.rejects(recoverOwnerRefundCustody({ ...recovery(cfg, opening), expectedBinding: binding }), /OWNER_REFUND_BINDING/);
  }
  const original = await readFile(cfg.path, 'utf8'), envelope = JSON.parse(original);
  envelope.ciphertext = `${envelope.ciphertext[0] === '0' ? '1' : '0'}${envelope.ciphertext.slice(1)}`;
  await writeFile(cfg.path, JSON.stringify(envelope)); await assert.rejects(recoverOwnerRefundCustody(recovery(cfg, opening)));
  await writeFile(cfg.path, original);
});

test('HOST ONLY: authenticated substituted note/type/key and mutable revision fail closed', async t => {
  const { cfg, wallet, opening } = await persisted(t); wallet.close();
  const record = await new Vault(cfg.path).read(cfg.password), original = await readFile(cfg.path);
  for (const mutate of [s => { s.note.type = 2; }, s => { s.note.value = '1'; }, s => { s.note.secret = h(); }, s => { s.note.x = h(); }, s => { s.privateKeyPem = freshKey().privateKey.export({ type: 'pkcs8', format: 'pem' }); }, s => { s.originSeed = h(); }]) {
    const changed = structuredClone(record); mutate(changed.data);
    await writeFile(cfg.path, JSON.stringify(encryptJson(changed, cfg.password)));
    await assert.rejects(recoverOwnerRefundCustody(recovery(cfg, opening)));
  }
  await writeFile(cfg.path, JSON.stringify(encryptJson({ ...record, revision: 1 }, cfg.password)));
  await assert.rejects(recoverOwnerRefundCustody(recovery(cfg, opening)), /OWNER_REFUND_IMMUTABLE_REVISION/);
  await writeFile(cfg.path, original);
});

test('HOST ONLY: exact request and witness validation reject destination/type/amount/epoch/path/signature changes', async t => {
  const { wallet, opening } = await persisted(t); t.after(() => wallet.close()); const req = request(opening);
  for (const field of ['scope', 'policy', 'paymentCommitment', 'recipient', 'amount']) assert.throws(() => wallet.authorizeWithdrawal({ ...req, [field]: field === 'amount' ? '1' : h(field === 'recipient' ? 20 : 32) }), /OWNER_REFUND_WITHDRAWAL_MISMATCH/);
  for (const epoch of ['-1', '01', 1012, (1n << 64n).toString()]) assert.throws(() => wallet.authorizeWithdrawal({ ...req, epoch }));
  assert.throws(() => wallet.authorizeWithdrawal({ ...req, epoch: '1011' }), /OWNER_REFUND_BEFORE_CUTOFF/);
  assert.throws(() => wallet.authorizeWithdrawal({ ...req, message: 'sign this instead' }), /OWNER_REFUND_FIELDS/);
  assert.throws(() => validateOwnerRefundBinding({ ...opening.binding, withdrawalRecipient: '00'.repeat(20) }), /OWNER_REFUND_DESTINATION/);
  assert.throws(() => validateOwnerRefundOpening({ ...opening, note: { ...opening.note, type: 2 } }, opening.binding), /OWNER_REFUND_NOTE_TYPE_VALUE/);
  const auth = wallet.authorizeWithdrawal(req), tree = new PrivateNoteTree([opening.binding.paymentCommitment, h()]);
  assert.throws(() => ownerRefundWithdrawalInput(opening.binding, opening, { ...auth, epoch: '1013' }, tree.path(0)), /OWNER_REFUND_SIGNATURE/);
  assert.throws(() => ownerRefundWithdrawalInput(opening.binding, opening, { ...auth, signature: '00'.repeat(64) }, tree.path(0)), /OWNER_REFUND_SIGNATURE/);
  assert.throws(() => ownerRefundWithdrawalInput(opening.binding, opening, auth, tree.path(1)), /OWNER_REFUND_MEMBERSHIP/);
});

test('HOST ONLY: persistence retry restores same original note after ambiguous save and rejects a replacement graph', async t => {
  const f = await fixture(t), vault = new Vault(f.cfg.path); let first = true;
  const factory = () => ({ read: password => vault.read(password), async create(state, password) { await vault.create(state, password); if (first) { first = false; throw new Error('SYNTHETIC_POST_COMMIT_ERROR'); } } });
  await assert.rejects(persistOriginalOwnerRefundCustody(f.graph, f.cfg, { vaultFactory: factory }), /SYNTHETIC_POST_COMMIT_ERROR/);
  const wallet = await persistOriginalOwnerRefundCustody(f.graph, f.cfg); t.after(() => wallet.close());
  assert.equal(wallet.opening().binding.paymentCommitment, f.graph.recovery.commitment.toString('hex'));
  await assert.rejects(persistOriginalOwnerRefundCustody(createGraph(plan()), f.cfg), /OWNER_REFUND_BINDING/);
});

function invoice(terms) {
  const key = freshKey(), note = { type: 2, origin: terms.origin, x: key.x.toString('hex'), y: key.y.toString('hex'), value: terms.value, secret: h() };
  const cm = paymentCommitment(terms.scope, note).toString('hex'), local = localCommitment(terms.scope, terms.policy, { ...terms.descriptor, payout: cm }).toString('hex');
  return { version: 1, role: terms.role, scope: terms.scope, policy: terms.policy, originSlot: terms.originSlot, paymentCommitment: cm, localCommitment: local, invoiceSignature: signature(key, invoiceFrame(terms.scope, local, cm)).toString('hex'), note };
}
async function ownerFixture(t, extra = {}) {
  const { cfg } = await fixture(t), calls = [];
  const config = { plan: plan(), bridgeTokens: { sol: h(), btc: h() }, ownerRefundCustody: cfg };
  const prove = async (mode, input) => {
    calls.push(structuredClone({ mode, input })); const recursive = mode === 'authorization', fields = Array(458).fill('1');
    return { proof: recursive ? Buffer.concat(fields.map(v => Buffer.from(BigInt(v).toString(16).padStart(64, '0'), 'hex'))) : Buffer.from('HOST-ONLY'), publicInputs: assemblyActorPublicInputs(mode, input), ...(recursive ? { proofFields: fields, vkFields: Array(115).fill('1') } : {}) };
  };
  const owner = createAssemblyOwner(config, { proveReserve: prove, proveAssembly: prove, ...extra });
  for (const role of ['sol', 'btc']) await owner.request(role, 'acceptInvoice', invoice(await owner.request(role, 'terms', null)));
  return { cfg, config, owner, calls };
}
async function deliver(f) {
  const reserve = await f.owner.request('control', 'proveReserve', { epoch: '1000' }), tree = new PrivateNoteTree([noteWordsToHash(reserve.publicInputs.slice(18, 26))]);
  await f.owner.request('control', 'proveAuthorization', { path: tree.path(0) });
  const packages = [];
  for (const role of ['sol', 'btc', 'assembler']) {
    const pkg = await f.owner.request(role, role === 'assembler' ? 'authorization' : 'ownPackage', null); packages.push(pkg);
    await f.owner.request(role, 'acknowledgePackage', { packageSHA256: assemblyPackageDigest(pkg) });
  }
  return { reserve, packages };
}

test('HOST ONLY: save/readback failures gate reserve proving and retries retain original recovery key', async t => {
  let failSave = true, failRead = false, stored, captures = [];
  const store = { async create(state) { captures.push(structuredClone(state)); if (failSave) throw new Error('SAVE_FAILED'); if (stored) throw Object.assign(new Error('VAULT_EXISTS'), { code: 'VAULT_EXISTS' }); stored = structuredClone(state); }, async read() { if (failRead) throw new Error('READ_FAILED'); return { revision: 0, data: structuredClone(stored) }; } };
  const f = await ownerFixture(t, { ownerRefundVaultFactory: () => store });
  await assert.rejects(f.owner.request('control', 'proveReserve', { epoch: '1000' }), /SAVE_FAILED/); assert.equal(f.calls.length, 0);
  failSave = false; failRead = true;
  await assert.rejects(f.owner.request('control', 'proveReserve', { epoch: '1000' }), /READ_FAILED/); assert.equal(f.calls.length, 0);
  failRead = false; await f.owner.request('control', 'proveReserve', { epoch: '1000' });
  assert.equal(f.calls.length, 1); assert.equal((await f.owner.request('control', 'status', null)).reserveProved, true);
  assert.equal(captures.length, 3); for (const capture of captures) assert.deepEqual(capture, captures[0]);
  assert.deepEqual(Buffer.from(f.calls[0].input.recovery_note_x).toString('hex'), captures[0].note.x);
  await f.owner.request('control', 'shutdown', null);
});

test('HOST ONLY: deletion during prover prevents reserve release despite successful pre-proof readbacks', async t => {
  let path;
  const f = await ownerFixture(t, { async proveReserve(mode, input) { await writeFile(path, 'tampered-during-prover'); return { proof: Buffer.from('HOST-ONLY'), publicInputs: assemblyActorPublicInputs(mode, input) }; } }); path = f.cfg.path;
  await assert.rejects(f.owner.request('control', 'proveReserve', { epoch: '1000' }));
  assert.equal((await f.owner.request('control', 'status', null)).reserveProved, false);
  await f.owner.request('control', 'shutdown', null);
});

test('HOST ONLY: completePackages and orderly exit reauthenticate; public summaries/role packages never expose custody', async t => {
  const f = await ownerFixture(t), { reserve, packages } = await deliver(f), status = await f.owner.request('control', 'status', null);
  const publicText = JSON.stringify([reserve, packages, status]);
  for (const secret of [f.cfg.password, f.cfg.path, f.cfg.withdrawalRecipient, 'ownerRefundCustody', 'privateKeyPem', 'note_type']) assert.equal(publicText.includes(secret), false);
  for (const operation of ['opening', 'authorizeWithdrawal', 'ownerRefundCustody', 'exportKey']) await assert.rejects(f.owner.request('control', operation, null), /PC18_OPERATION_DENIED/);
  const original = await readFile(f.cfg.path); await writeFile(f.cfg.path, 'tampered');
  await assert.rejects(f.owner.request('control', 'completePackages', null)); assert.equal((await f.owner.request('control', 'status', null)).complete, false);
  await assert.rejects(f.owner.request('control', 'shutdown', null));
  await writeFile(f.cfg.path, original); assert.equal((await f.owner.request('control', 'completePackages', null)).event, 'complete-packages-ready');
  await f.owner.request('control', 'shutdown', null);
});

test('HOST ONLY: actual recovery-only child reopens exact note and denies extra operations/incorrect destination', async t => {
  const { cfg, wallet, opening } = await persisted(t); wallet.close();
  const process = launchOwnerRefundProcess(recovery(cfg, opening)); t.after(() => process.stop());
  assert.deepEqual(await process.ready, { event: 'ready', kind: 'owner-refund' });
  assert.deepEqual(await process.request('opening'), opening);
  for (const op of ['create', 'exportKey', 'sign', 'invoice', 'proveReserve']) await assert.rejects(process.request(op), /OWNER_REFUND_OPERATION_DENIED/);
  await assert.rejects(process.request('authorizeWithdrawal', { ...request(opening), recipient: h(20) }), /OWNER_REFUND_WITHDRAWAL_MISMATCH/);
  const auth = await process.request('authorizeWithdrawal', request(opening));
  assert.equal(ownerRefundWithdrawalInput(opening.binding, opening, auth, new PrivateNoteTree([opening.binding.paymentCommitment]).path(0)).note_type, 3);
  await process.stop(); const again = launchOwnerRefundProcess(recovery(cfg, opening)); t.after(() => again.stop());
  await again.ready; assert.deepEqual(await again.request('opening'), opening); await again.stop();
  const bad = launchOwnerRefundProcess({ ...recovery(cfg, opening), password: 'wrong' }); t.after(() => bad.stop()); await assert.rejects(bad.ready); await bad.stop();
});

test('HOST ONLY: owner fd3 accepts custody bootstrap without leaking it to public ready/status or accepting control injection', async t => {
  const { cfg } = await fixture(t), actor = launchAssemblyProcess('owner', { plan: plan(), bridgeTokens: { sol: h(), btc: h() }, ownerRefundCustody: cfg });
  t.after(() => actor.control.stop()); const ready = await actor.control.ready, status = await actor.control.request('status');
  for (const value of [cfg.password, cfg.path, cfg.withdrawalRecipient, 'ownerRefundCustody']) assert.equal(JSON.stringify([ready, status]).includes(value), false);
  await assert.rejects(actor.control.request('status', { ownerRefundCustody: cfg })); await actor.control.stop();
});

test('HOST ONLY: recovery child itself rejects creation/key/arbitrary signing and bootstrap fields on command IPC', async t => {
  const { cfg, wallet, opening } = await persisted(t); wallet.close();
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/private-owner-refund-process.mjs', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGKILL')); child.stderr.resume();
  let pending = '', values = [], waiters = [];
  child.stdout.setEncoding('utf8'); child.stdout.on('data', text => { pending += text; let i; while ((i = pending.indexOf('\n')) >= 0) { const value = JSON.parse(pending.slice(0, i)); pending = pending.slice(i + 1); const next = waiters.shift(); if (next) next(value); else values.push(value); } });
  const next = () => values.length ? Promise.resolve(values.shift()) : new Promise(resolve => waiters.push(resolve));
  child.stdio[3].end(JSON.stringify(recovery(cfg, opening))); assert.deepEqual(await next(), { event: 'ready', kind: 'owner-refund' });
  for (const operation of ['create', 'exportKey', 'sign', 'invoice', 'proveReserve']) {
    child.stdin.write(JSON.stringify({ id: operation, operation, input: null }) + '\n');
    assert.deepEqual(await next(), { id: operation, ok: false, code: 'OWNER_REFUND_OPERATION_DENIED' });
  }
  child.stdin.write(JSON.stringify({ id: 'inject', operation: 'opening', input: null, password: cfg.password }) + '\n');
  assert.deepEqual(await next(), { id: null, ok: false, code: 'OWNER_REFUND_IPC_INPUT' });
  const closed = new Promise(resolve => child.once('close', resolve));
  child.stdin.write(Array.from({ length: 17 }, (_, i) => JSON.stringify({ id: `overflow_${i}`, operation: 'opening', input: null }) + '\n').join(''));
  assert.deepEqual(await next(), { id: null, ok: false, code: 'OWNER_REFUND_QUEUE_LIMIT' }); assert.equal(await closed, 1);
});

test('HOST ONLY: live stopped signer cannot indefinitely block a request or shutdown-before-ready', async t => {
  const { cfg, wallet, opening } = await persisted(t); wallet.close();
  const child = launchOwnerRefundProcess(recovery(cfg, opening), { requestTimeoutMs: 100, forceAfterMs: 100 }); t.after(() => child.stop());
  await child.ready; process.kill(child.pid, 'SIGSTOP');
  await assert.rejects(child.request('opening'), /OWNER_REFUND_REQUEST_TIMEOUT/);
  assert.equal((await child.exited).signal, 'SIGKILL');
  const startup = launchOwnerRefundProcess(recovery(cfg, opening), { startupTimeoutMs: 100, forceAfterMs: 100 }); t.after(() => startup.stop());
  process.kill(startup.pid, 'SIGSTOP'); const started = performance.now(); const result = await startup.stop();
  assert.equal(result.signal, 'SIGKILL'); assert.ok(performance.now() - started < 3000);
  await assert.rejects(startup.ready);
});

test('HOST ONLY: stale custody lock remains explicit and never permits original-note regeneration', async t => {
  const { cfg, graph } = await fixture(t), text = 'preserve-this-foreign-lock'; await writeFile(`${cfg.path}.lock`, text);
  await assert.rejects(persistOriginalOwnerRefundCustody(graph, cfg), /Vault is locked/);
  assert.equal(await readFile(`${cfg.path}.lock`, 'utf8'), text);
  await assert.rejects(readFile(cfg.path));
});
