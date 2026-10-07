import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createPublicKey, verify } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createRecipientCustody, recoverRecipientCustody, validateRecipientTerms, recipientTermsDigest,
  importRecipientInvoice, recipientWithdrawalInput,
} from '../../src/recipients/private-recipient-custody.mjs';
import {
  origin, paymentCommitment, localCommitment, invoiceFrame, withdrawFrame, freshKey,
  graphCommitment, reservedCommitment, ownerFrame, signature, reserveInput, policyCommitment, admission,
} from '../../src/notes/private-note-encoding.mjs';
import { PrivateNoteTree } from '../../src/notes/private-note-tree.mjs';

const randomHex = (n = 32) => randomBytes(n).toString('hex');
const clone = o => structuredClone(o);
const raw = h => Buffer.from(h, 'hex');
function fixture(role = 'sol', shared = {}) {
  const scope = shared.scope ?? randomHex(), policy = shared.policy ?? randomHex(), seed = shared.seed ?? randomHex();
  const slot = role === 'sol' ? 1 : 2;
  return { scope, policy, role, originSlot: slot, origin: origin(scope, seed, slot).toString('hex'), value: '500000000000000',
    descriptor: { chain: slot, nonce: randomHex(), source: role === 'btc' ? '00'.repeat(32) : randomHex(), recipient: randomHex(),
      amount: role === 'sol' ? '3000000' : '100000', executeAfter: '1900000200', executeBefore: '1900005000',
      validFrom: '3166667', validUntil: '3166676' } };
}
async function setup(t, role = 'sol', terms = fixture(role)) {
  const directory = await mkdtemp(join(tmpdir(), `pc17-${role}-`));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, config: { path: join(directory, 'recipient.vault.json'), password: `synthetic-${role}-${randomHex()}`,
    expectedTerms: terms, withdrawalRecipient: randomHex(20) } };
}
function approval(review) { const { termsDigest, value, paymentCommitment, localCommitment } = review; return { termsDigest, value, paymentCommitment, localCommitment }; }
function exposure(terms, review) { return { terms, paymentCommitment: review.paymentCommitment, localCommitment: review.localCommitment }; }
function withdrawal(cfg, invoice) { return { scope: cfg.expectedTerms.scope, policy: cfg.expectedTerms.policy,
  paymentCommitment: invoice.paymentCommitment, recipient: cfg.withdrawalRecipient, amount: cfg.expectedTerms.value, epoch: '3166669' }; }
function checkSignature(note, message, sig) {
  const key = createPublicKey({ key: { kty: 'EC', crv: 'secp256k1', x: raw(note.x).toString('base64url'), y: raw(note.y).toString('base64url') }, format: 'jwk' });
  return verify('sha256', message, { key, dsaEncoding: 'ieee-p1363' }, raw(sig));
}

test('recipient terms accept only the exact own-role descriptor, origin slot and u64 values', () => {
  const terms = fixture();
  assert.deepEqual(validateRecipientTerms(terms), terms);
  for (const extra of ['originSeed', 'graphCommitment', 'reservationNullifier', 'siblingDescriptor', 'privateKey']) {
    assert.throws(() => validateRecipientTerms({ ...terms, [extra]: randomHex() }));
  }
  for (const value of ['0', '-1', '01', (1n << 64n).toString(), 1]) assert.throws(() => validateRecipientTerms({ ...terms, value }));
  assert.throws(() => validateRecipientTerms({ ...terms, originSlot: 2 }));
  assert.throws(() => validateRecipientTerms({ ...terms, role: 'recovery' }));
  assert.throws(() => validateRecipientTerms({ ...terms, descriptor: { ...terms.descriptor, executeBefore: terms.descriptor.executeAfter } }));
  assert.throws(() => validateRecipientTerms({ ...fixture('btc'), descriptor: { ...fixture('btc').descriptor, source: randomHex() } }));
  let invoked = false;
  const getter = { ...terms }; Object.defineProperty(getter, 'value', { enumerable: true, get() { invoked = true; return '10'; } });
  assert.throws(() => validateRecipientTerms(getter)); assert.equal(invoked, false);
  assert.throws(() => validateRecipientTerms(new Proxy(terms, {})));
});

test('exact compensation acknowledgement gates invoice and local native-exposure guard', async t => {
  const { config, directory } = await setup(t);
  const wallet = await createRecipientCustody(config), review = wallet.reviewCompensation();
  assert.equal(review.acknowledged, false);
  assert.throws(() => wallet.invoice(config.expectedTerms), { code: 'RECIPIENT_ACK_REQUIRED' });
  assert.throws(() => wallet.assertNativeExposureAcknowledged(exposure(config.expectedTerms, review)), { code: 'RECIPIENT_ACK_REQUIRED' });
  assert.throws(() => wallet.authorizeWithdrawal(withdrawal(config, review)), { code: 'RECIPIENT_ACK_REQUIRED' });
  for (const field of ['value', 'termsDigest', 'paymentCommitment', 'localCommitment']) {
    const bad = approval(review); bad[field] = field === 'value' ? '1' : randomHex();
    await assert.rejects(wallet.acknowledgeCompensation(bad), { code: 'RECIPIENT_ACK_MISMATCH' });
  }
  assert.equal(wallet.reviewCompensation().acknowledged, false);
  await wallet.acknowledgeCompensation(approval(review));
  const invoice = wallet.invoice(config.expectedTerms), imported = importRecipientInvoice(config.expectedTerms, invoice);
  assert.equal(checkSignature(invoice.note, invoiceFrame(invoice.scope, invoice.localCommitment, invoice.paymentCommitment), invoice.invoiceSignature), true);
  assert.equal(paymentCommitment(invoice.scope, imported.note).toString('hex'), invoice.paymentCommitment);
  assert.equal(localCommitment(invoice.scope, invoice.policy, imported.local).toString('hex'), invoice.localCommitment);
  assert.equal(Object.hasOwn(imported.note, 'privateKey'), false);
  assert.equal(Object.hasOwn(invoice.note, 'privateKey'), false);
  assert.equal(wallet.exportKey, undefined); assert.equal(wallet.sign, undefined);
  assert.deepEqual(Object.keys(wallet), []);
  assert.equal(wallet.assertNativeExposureAcknowledged(exposure(config.expectedTerms, review)).acknowledged, true);
  const encrypted = await readFile(config.path, 'utf8');
  for (const secret of ['PRIVATE KEY', invoice.note.secret, invoice.note.origin, invoice.note.x, config.password]) assert.equal(encrypted.includes(secret), false);
  assert.deepEqual(await readdir(directory), ['recipient.vault.json']);
  assert.equal((await stat(config.path)).mode & 0o777, 0o600);
  wallet.close(); assert.throws(() => wallet.invoice(config.expectedTerms), { code: 'RECIPIENT_CLOSED' });
});

test('descriptor, scope, compensation and payout substitutions fail after approval', async t => {
  const { config } = await setup(t), wallet = await createRecipientCustody(config);
  await wallet.acknowledgeCompensation(approval(wallet.reviewCompensation()));
  const invoice = wallet.invoice(config.expectedTerms);
  const mutants = [];
  for (const field of ['scope', 'policy', 'origin']) mutants.push({ ...config.expectedTerms, [field]: randomHex() });
  mutants.push({ ...config.expectedTerms, value: '123' });
  for (const field of ['nonce', 'source', 'recipient']) mutants.push({ ...config.expectedTerms, descriptor: { ...config.expectedTerms.descriptor, [field]: randomHex() } });
  mutants.push({ ...config.expectedTerms, descriptor: { ...config.expectedTerms.descriptor, amount: '123' } });
  for (const terms of mutants) {
    assert.throws(() => wallet.invoice(terms), { code: 'RECIPIENT_TERMS_MISMATCH' });
    assert.throws(() => wallet.assertNativeExposureAcknowledged(exposure(terms, invoice)), { code: 'RECIPIENT_TERMS_MISMATCH' });
    assert.throws(() => importRecipientInvoice(terms, invoice));
  }
  for (const field of ['paymentCommitment', 'localCommitment']) {
    assert.throws(() => wallet.assertNativeExposureAcknowledged({ ...exposure(config.expectedTerms, invoice), [field]: randomHex() }), { code: 'RECIPIENT_COMMITMENT_MISMATCH' });
    assert.throws(() => importRecipientInvoice(config.expectedTerms, { ...invoice, [field]: randomHex() }), { code: 'RECIPIENT_COMMITMENT_MISMATCH' });
  }
  const tampered = clone(invoice); tampered.note.secret = randomHex();
  assert.throws(() => importRecipientInvoice(config.expectedTerms, tampered), { code: 'RECIPIENT_COMMITMENT_MISMATCH' });
  wallet.close();
});

test('recipient alone signs the exact stored note to its pinned destination; owner cannot redirect or export keys', async t => {
  const { config } = await setup(t), wallet = await createRecipientCustody(config);
  await wallet.acknowledgeCompensation(approval(wallet.reviewCompensation()));
  const invoice = wallet.invoice(config.expectedTerms), request = withdrawal(config, invoice);
  for (const field of ['scope', 'policy', 'paymentCommitment', 'recipient', 'amount']) {
    const bad = { ...request, [field]: field === 'amount' ? '1' : randomHex(field === 'recipient' ? 20 : 32) };
    assert.throws(() => wallet.authorizeWithdrawal(bad), { code: 'RECIPIENT_WITHDRAWAL_MISMATCH' });
  }
  assert.throws(() => wallet.authorizeWithdrawal({ ...request, message: 'arbitrary-message' }));
  const authorization = wallet.authorizeWithdrawal(request);
  assert.equal(checkSignature(invoice.note, withdrawFrame(request.scope, request.policy, request.paymentCommitment, raw(request.recipient), request.amount, request.epoch), authorization.signature), true);
  for (const field of ['scope', 'policy', 'paymentCommitment', 'recipient', 'amount', 'epoch']) {
    const bad = { ...authorization, [field]: ['amount', 'epoch'].includes(field) ? '1' : randomHex(field === 'recipient' ? 20 : 32) };
    assert.equal(checkSignature(invoice.note, withdrawFrame(bad.scope, bad.policy, bad.paymentCommitment, raw(bad.recipient), bad.amount, bad.epoch), bad.signature), false);
  }
  const fakeOwnerKey = freshKey();
  const forged = signature(fakeOwnerKey, withdrawFrame(request.scope, request.policy, request.paymentCommitment, raw(request.recipient), request.amount, request.epoch));
  assert.equal(checkSignature(invoice.note, withdrawFrame(request.scope, request.policy, request.paymentCommitment, raw(request.recipient), request.amount, request.epoch), forged.toString('hex')), false);
  const tree = new PrivateNoteTree([randomHex(), invoice.paymentCommitment]);
  const input = recipientWithdrawalInput(config.expectedTerms, invoice, authorization, tree.path(1));
  assert.equal(input.note_type, 2); assert.equal(input.amount, request.amount); assert.equal(input.epoch, request.epoch);
  assert.deepEqual(input.signature, [...raw(authorization.signature)]);
  assert.deepEqual(Object.keys(input).sort(), ['scope', 'policy', 'epoch', 'root', 'spent', 'amount', 'recipient', 'siblings', 'leaf_index', 'note_type', 'note_origin', 'key_x', 'key_y', 'value', 'secret', 'signature'].sort());
  assert.throws(() => recipientWithdrawalInput(config.expectedTerms, invoice, authorization, tree.path(0)), { code: 'RECIPIENT_MEMBERSHIP' });
  assert.throws(() => recipientWithdrawalInput(config.expectedTerms, invoice, { ...authorization, epoch: '1' }, tree.path(1)), { code: 'RECIPIENT_WITHDRAWAL_SIGNATURE' });
  wallet.close();
});

test('encrypted restart recovers exact role key/opening/approval; password, tamper and cross-role recovery fail', async t => {
  const { config } = await setup(t), wallet = await createRecipientCustody(config);
  const pending = wallet.reviewCompensation(); wallet.close();
  const recoveredPending = await recoverRecipientCustody(config);
  assert.deepEqual(recoveredPending.reviewCompensation(), pending);
  assert.throws(() => recoveredPending.invoice(config.expectedTerms), { code: 'RECIPIENT_ACK_REQUIRED' });
  await recoveredPending.acknowledgeCompensation(approval(pending));
  const original = recoveredPending.invoice(config.expectedTerms); recoveredPending.close();
  const recovered = await recoverRecipientCustody(config);
  assert.deepEqual(recovered.invoice(config.expectedTerms), original);
  const auth = recovered.authorizeWithdrawal(withdrawal(config, original));
  assert.equal(checkSignature(original.note, withdrawFrame(auth.scope, auth.policy, auth.paymentCommitment, raw(auth.recipient), auth.amount, auth.epoch), auth.signature), true);
  recovered.close();
  await assert.rejects(recoverRecipientCustody({ ...config, password: 'wrong-synthetic-password' }), /authentication/);
  await assert.rejects(recoverRecipientCustody({ ...config, withdrawalRecipient: randomHex(20) }), { code: 'RECIPIENT_RECOVERY_BINDING' });
  await assert.rejects(recoverRecipientCustody({ ...config, expectedTerms: fixture('btc') }), { code: 'RECIPIENT_RECOVERY_BINDING' });
  const ciphertext = JSON.parse(await readFile(config.path, 'utf8')); ciphertext.cipher.tag = '00'.repeat(16);
  await writeFile(config.path, JSON.stringify(ciphertext));
  await assert.rejects(recoverRecipientCustody(config), /authentication/);
});

test('independent recipient invoices assemble existing PC15 reserve witness without either recipient signing key', async t => {
  const policyFields = { minimumBtcConfirmations: 6 };
  for (const role of ['sol', 'btc']) { const key = freshKey(); policyFields[role] = { policyId: randomBytes(32), identityNamespace: randomBytes(32), genesis: randomBytes(32), x: key.x, y: key.y }; }
  const scope = randomHex(), seed = randomHex(), policy = policyCommitment(policyFields).toString('hex');
  const terms = { sol: fixture('sol', { scope, policy, seed }), btc: fixture('btc', { scope, policy, seed }) };
  const imported = {};
  for (const role of ['sol', 'btc']) {
    const { config } = await setup(t, role, terms[role]), wallet = await createRecipientCustody(config);
    await wallet.acknowledgeCompensation(approval(wallet.reviewCompensation()));
    const invoice = wallet.invoice(terms[role]);
    imported[role] = importRecipientInvoice(terms[role], invoice);
    const wire = JSON.stringify({ terms: terms[role], invoice });
    assert.equal(wire.includes(seed), false);
    assert.equal(wire.includes(terms[role === 'sol' ? 'btc' : 'sol'].descriptor.recipient), false);
    assert.equal(wire.includes(terms[role === 'sol' ? 'btc' : 'sol'].descriptor.nonce), false);
    wallet.close();
  }
  assert.notDeepEqual(imported.sol.note.x, imported.btc.note.x);
  assert.notDeepEqual(imported.sol.note.secret, imported.btc.note.secret);
  const recoveryKey = freshKey(), budget = 1000000000000000n;
  const recovery = { type: 3, origin: origin(scope, seed, 3), ...recoveryKey, value: budget, secret: randomBytes(32) };
  recovery.commitment = paymentCommitment(scope, recovery);
  const graph = { scope: raw(scope), policy: raw(policy), policyFields, originSeed: raw(seed), graphSalt: randomBytes(32), owner: freshKey(),
    budget, numerator: 1n, denominator: 30n, claimEpoch: 3166676n, reserveSecret: randomBytes(32), recovery,
    sol: imported.sol.local, btc: imported.btc.local, solNote: imported.sol.note, btcNote: imported.btc.note };
  graph.commitment = graphCommitment(graph); graph.reserved = reservedCommitment(graph);
  graph.admission = admission(scope, seed); graph.ownerSignature = signature(graph.owner, ownerFrame(scope, policy, graph.commitment));
  const witness = reserveInput(graph, '3166667');
  assert.deepEqual(witness.sol_note_x, [...imported.sol.note.x]);
  assert.deepEqual(witness.btc_note_x, [...imported.btc.note.x]);
  assert.deepEqual(witness.sol_invoice_signature, [...imported.sol.local.invoiceSignature]);
  assert.deepEqual(witness.btc_invoice_signature, [...imported.btc.local.invoiceSignature]);
  assert.equal(witness.sol_payout, terms.sol.value); assert.equal(witness.btc_payout, terms.btc.value);
  assert.equal(graph.solNote.privateKey, undefined); assert.equal(graph.btcNote.privateKey, undefined);
  // This is byte/field compatibility, NOT witness execution, proof or native evidence.
});

async function launch(t, cfg, mode = 'create', { splitBootstrapReads = false } = {}) {
  const processUrl = new URL('../src/private-recipient-process.mjs', import.meta.url);
  // Exercise the actual child/OS pipe and unchanged protocol with deterministic
  // one-byte fs reads on fd3. Test-only highWaterMark prevents the kernel merging
  // parent writes from hiding a split UTF-8 sequence; other streams stay normal.
  const args = splitBootstrapReads ? ['--input-type=module', '-e', `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const original = fs.createReadStream;
    fs.createReadStream = (path, options) => original(path, options?.fd === 3 ? { ...options, highWaterMark: 1 } : options);
    syncBuiltinESMExports();
    await import(${JSON.stringify(processUrl.href)});
  `] : [fileURLToPath(processUrl)];
  const child = spawn(process.execPath, args, {
    stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
  });
  let pending = '', stderr = '', counter = 0;
  const seen = [], waiters = [];
  const ended = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  const lifecycleTimer = setTimeout(() => { child.kill('SIGKILL'); }, 15000);
  ended.then(() => clearTimeout(lifecycleTimer));
  child.stderr.on('data', b => { stderr += b; });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    pending += chunk;
    const lines = pending.split('\n'); pending = lines.pop();
    for (const line of lines) {
      const message = JSON.parse(line); seen.push(message);
      const index = waiters.findIndex(w => w.matches(message));
      if (index >= 0) { const [w] = waiters.splice(index, 1); clearTimeout(w.timer); w.resolve(message); }
    }
  });
  const wait = matches => {
    const previous = seen.find(matches); if (previous) return Promise.resolve(previous);
    return new Promise((resolve, reject) => {
      const waiter = { matches, resolve, timer: setTimeout(() => reject(new Error('PC17 process response timeout')), 10000) };
      waiters.push(waiter);
    });
  };
  child.stdio[3].end(JSON.stringify({ mode, ...cfg }));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await ended;
    for (const waiter of waiters) clearTimeout(waiter.timer);
    assert.equal(stderr, '');
  });
  const ready = await wait(m => m.event === 'ready' || m.event === 'startupRejected');
  async function request(operation, input = null, channel = 'owner') {
    const id = `request_${++counter}`, response = wait(m => m.id === id);
    (channel === 'operator' ? child.stdio[4] : child.stdin).write(`${JSON.stringify({ id, operation, input })}\n`);
    return response;
  }
  return { child, ready, request, ended, seen };
}

test('separate role process rejects owner approval/key export and recovers same opening after clean shutdown', async t => {
  const { config, directory } = await setup(t), worker = await launch(t, config);
  assert.equal(worker.ready.event, 'ready');
  assert.equal((await worker.request('invoice', config.expectedTerms)).code, 'RECIPIENT_ACK_REQUIRED');
  assert.equal((await worker.request('acknowledgeCompensation', approval(worker.ready.review))).code, 'RECIPIENT_OPERATION_DENIED');
  for (const operation of ['exportKey', 'sign', 'getPrivateKey', 'updateWithdrawalRecipient', 'replaceTerms']) {
    assert.equal((await worker.request(operation, {})).code, 'RECIPIENT_OPERATION_DENIED');
  }
  const approved = await worker.request('acknowledgeCompensation', approval(worker.ready.review), 'operator');
  assert.equal(approved.ok, true);
  const invoiceReply = await worker.request('invoice', config.expectedTerms);
  assert.equal(invoiceReply.ok, true);
  const invoice = invoiceReply.value;
  importRecipientInvoice(config.expectedTerms, invoice);
  assert.equal((await worker.request('authorizeWithdrawal', { ...withdrawal(config, invoice), recipient: randomHex(20) })).code, 'RECIPIENT_WITHDRAWAL_MISMATCH');
  assert.equal((await worker.request('shutdown')).ok, true);
  assert.deepEqual(await worker.ended, { code: 0, signal: null });
  assert.deepEqual(await readdir(directory), ['recipient.vault.json']);
  const recovered = await launch(t, config, 'recover');
  assert.equal(recovered.ready.review.acknowledged, true);
  assert.deepEqual((await recovered.request('invoice', config.expectedTerms)).value, invoice);
  const auth = (await recovered.request('authorizeWithdrawal', withdrawal(config, invoice))).value;
  assert.equal(checkSignature(invoice.note, withdrawFrame(auth.scope, auth.policy, auth.paymentCommitment, raw(auth.recipient), auth.amount, auth.epoch), auth.signature), true);
  assert.equal((await recovered.request('shutdown')).ok, true);
  assert.deepEqual(await recovered.ended, { code: 0, signal: null });
  for (const message of [...worker.seen, ...recovered.seen]) {
    const text = JSON.stringify(message);
    assert.equal(text.includes('PRIVATE KEY'), false); assert.equal(text.includes(config.password), false);
  }
  const wrongPassword = await launch(t, { ...config, password: 'wrong-synthetic-password' }, 'recover');
  assert.equal(wrongPassword.ready.event, 'startupRejected');
  assert.deepEqual(await wrongPassword.ended, { code: 1, signal: null });
});

test('two recipient processes receive only own terms and cannot authorize each other’s notes', async t => {
  const shared = { scope: randomHex(), policy: randomHex(), seed: randomHex() };
  const solSetup = await setup(t, 'sol', fixture('sol', shared)), btcSetup = await setup(t, 'btc', fixture('btc', shared));
  const sol = await launch(t, solSetup.config), btc = await launch(t, btcSetup.config);
  for (const [worker, cfg] of [[sol, solSetup.config], [btc, btcSetup.config]]) {
    await worker.request('acknowledgeCompensation', approval(worker.ready.review), 'operator');
    assert.equal((await worker.request('assertNativeExposureAcknowledged', exposure(cfg.expectedTerms, worker.ready.review))).ok, true);
  }
  const solInvoice = (await sol.request('invoice', solSetup.config.expectedTerms)).value;
  const btcInvoice = (await btc.request('invoice', btcSetup.config.expectedTerms)).value;
  assert.notEqual(sol.child.pid, btc.child.pid); assert.notEqual(solInvoice.note.x, btcInvoice.note.x);
  assert.equal((await sol.request('invoice', btcSetup.config.expectedTerms)).code, 'RECIPIENT_TERMS_MISMATCH');
  assert.equal((await btc.request('authorizeWithdrawal', withdrawal(solSetup.config, solInvoice))).code, 'RECIPIENT_WITHDRAWAL_MISMATCH');
  for (const [worker, other] of [[sol, btcSetup.config], [btc, solSetup.config]]) {
    const ownWire = JSON.stringify(worker.seen);
    assert.equal(ownWire.includes(shared.seed), false);
    assert.equal(ownWire.includes(other.expectedTerms.descriptor.recipient), false);
    assert.equal(ownWire.includes(other.expectedTerms.origin), false);
    await worker.request('shutdown'); assert.deepEqual(await worker.ended, { code: 0, signal: null });
  }
});

test('restart after terminating an idle acknowledged recipient retains its independently generated key', async t => {
  const { config } = await setup(t), worker = await launch(t, config);
  await worker.request('acknowledgeCompensation', approval(worker.ready.review), 'operator');
  const invoice = (await worker.request('invoice', config.expectedTerms)).value;
  worker.child.kill('SIGTERM');
  assert.deepEqual(await worker.ended, { code: null, signal: 'SIGTERM' });
  const recovered = await launch(t, config, 'recover');
  assert.deepEqual((await recovered.request('invoice', config.expectedTerms)).value, invoice);
  const auth = (await recovered.request('authorizeWithdrawal', withdrawal(config, invoice))).value;
  assert.equal(checkSignature(invoice.note, withdrawFrame(auth.scope, auth.policy, auth.paymentCommitment, raw(auth.recipient), auth.amount, auth.epoch), auth.signature), true);
  await recovered.request('shutdown'); assert.deepEqual(await recovered.ended, { code: 0, signal: null });
  // This stops an idle process after committed writes; it is not a power-loss or
  // interrupted-fsync test, and does not imply vault rollback resistance.
});

test('split-byte bootstrap creation preserves Unicode password/path for ordinary recovery', async t => {
  const { config, directory } = await setup(t);
  const unicode = { ...config, path: join(directory, 'recipient-é-钥匙-🔑.vault.json'), password: 'synthetic-é-钥匙-🔑-password' };
  const worker = await launch(t, unicode, 'create', { splitBootstrapReads: true });
  assert.equal(worker.ready.event, 'ready');
  assert.equal((await stat(unicode.path)).isFile(), true);
  assert.equal((await worker.request('acknowledgeCompensation', approval(worker.ready.review), 'operator')).ok, true);
  const invoice = (await worker.request('invoice', unicode.expectedTerms)).value;
  await worker.request('shutdown'); assert.deepEqual(await worker.ended, { code: 0, signal: null });
  const recovered = await launch(t, unicode, 'recover');
  assert.equal(recovered.ready.event, 'ready');
  assert.deepEqual((await recovered.request('invoice', unicode.expectedTerms)).value, invoice);
  await recovered.request('shutdown'); assert.deepEqual(await recovered.ended, { code: 0, signal: null });
  assert.deepEqual(await readdir(directory), ['recipient-é-钥匙-🔑.vault.json']);
});

test('split-byte bootstrap recovery preserves Unicode credentials and signs with the same retained key', async t => {
  const { config, directory } = await setup(t);
  const unicode = { ...config, path: join(directory, '恢复-é-🔐.vault.json'), password: 'synthetic-恢复-é-🔐-password' };
  const worker = await launch(t, unicode);
  assert.equal(worker.ready.event, 'ready');
  assert.equal((await worker.request('acknowledgeCompensation', approval(worker.ready.review), 'operator')).ok, true);
  const invoice = (await worker.request('invoice', unicode.expectedTerms)).value;
  await worker.request('shutdown'); assert.deepEqual(await worker.ended, { code: 0, signal: null });
  const recovered = await launch(t, unicode, 'recover', { splitBootstrapReads: true });
  assert.equal(recovered.ready.event, 'ready');
  assert.deepEqual((await recovered.request('invoice', unicode.expectedTerms)).value, invoice);
  const auth = (await recovered.request('authorizeWithdrawal', withdrawal(unicode, invoice))).value;
  assert.equal(checkSignature(invoice.note, withdrawFrame(auth.scope, auth.policy, auth.paymentCommitment, raw(auth.recipient), auth.amount, auth.epoch), auth.signature), true);
  await recovered.request('shutdown'); assert.deepEqual(await recovered.ended, { code: 0, signal: null });
});
