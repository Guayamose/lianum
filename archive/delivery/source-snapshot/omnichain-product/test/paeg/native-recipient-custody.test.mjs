import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Vault } from '../../src/vault.mjs';
import { PrivateNoteTree } from '../../src/private-note-tree.mjs';
import { balanceWithdrawFrame, walletNoteCommitment, walletInputPublicWords } from '../../src/private-wallet-note-encoding.mjs';
import { compileFundedGraph, payoutInvoiceMessage } from '../../src/paeg/funded-graph.mjs';
import { nativeDeliveryRiskCommitment, NATIVE_ADMISSION_LOSS_CLAUSE } from '../../src/paeg/native-admission.mjs';
import { nativeTransferActionCommitment } from '../../src/paeg/native-capsules.mjs';
import { createNativeRecipientCustody, recoverNativeRecipientCustody, nativeRecipientPayoutNote,
  nativeRecipientInvoiceRequest, nativeRecipientInvoiceMessage } from '../../src/paeg/native-recipient-custody.mjs';
import { createNativeRecipientProcess, assertOwnedNativeRecipientProcess } from '../../src/paeg/native-recipient-process.mjs';
import { positiveFixtures } from '../../experiments/private-core-proof/generic-funding/fixtures.mjs';

const hash = text => createHash('sha256').update('synthetic recipient test:' + text).digest('hex');
const raw = text => Buffer.from(text, 'hex');
const base = positiveFixtures().find(fixture => fixture.name === 'single-type2').input;
function terms() {
  return { scope: base.scope, policy: base.policy, asset: base.asset, hubDomain: hash('hub'), registryCommitment: hash('registry'),
    operationId: base.operationId, slot: 0, evidencePolicy: hash('evidence'), value: '25', settleBefore: base.settleBefore,
    actionTemplate: { chainDomain: hash('chain'), signerIdentity: hash('provider'), sourceCommitment: hash('source'),
      destinationCommitment: hash('native destination'), amount: '100', custodyKind: 1, custodyCommitment: hash('custody'),
      executionFrom: base.fundingNotBefore, executionUntil: base.fundingValidUntil, settleBefore: base.settleBefore } };
}
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'paeg-recipient-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  return { directory, cfg: { path: join(directory, 'recipient.vault.json'), password: 'synthetic-local-fixture-password',
    expectedTerms: terms(), withdrawalRecipient: '12'.repeat(20) } };
}
function actionTerms(t, offer, overrides = {}) {
  const note = nativeRecipientPayoutNote(t, offer), payoutCommitment = walletNoteCommitment(t.scope, t.policy, note).toString('hex');
  const deliveryRiskSalt = hash('delivery risk');
  const action = { ...t.actionTemplate, receiptKeyCommitment: hash('receipt key'), receiptRho: hash('receipt rho'), actionSalt: hash('action salt'), ...overrides };
  action.deliveryRiskCommitment = nativeDeliveryRiskCommitment({ clause: NATIVE_ADMISSION_LOSS_CLAUSE,
    hubDomain: t.hubDomain, registryCommitment: t.registryCommitment, chainDomain: action.chainDomain,
    sourceCommitment: action.sourceCommitment, destinationCommitment: action.destinationCommitment, amount: action.amount,
    scope: t.scope, policy: t.policy, asset: t.asset, payoutCommitment, settleBefore: t.settleBefore, salt: deliveryRiskSalt });
  return { action, deliveryRiskSalt };
}
function invoice(t, offer) { return nativeRecipientInvoiceRequest(t, offer, actionTerms(t, offer)); }
function withdrawal(cfg, accepted) {
  const tree = new PrivateNoteTree([hash('prior note'), accepted.payoutCommitment]);
  return { scope: cfg.expectedTerms.scope, policy: cfg.expectedTerms.policy, payoutCommitment: accepted.payoutCommitment,
    recipient: cfg.withdrawalRecipient, amount: cfg.expectedTerms.value, epoch: '2985001', path: tree.path(1) };
}
function signatureValid(offer, frame, sig) {
  return verify('sha256', frame, { key: createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: raw(offer.x).toString('base64url'), y: raw(offer.y).toString('base64url') } }), dsaEncoding: 'ieee-p1363' }, raw(sig));
}

test('fresh type-4 offer and compact invoice match exact A0 payout derivation and H4 signature bytes', async t => {
  const { cfg } = await setup(t), custody = await createNativeRecipientCustody(cfg), offer = custody.offer();
  t.after(() => custody.close());
  assert.deepEqual(Object.keys(offer).sort(), ['x', 'y', 'value', 'secret', 'randomness'].sort());
  assert.deepEqual(Object.keys(custody), []);
  const request = invoice(cfg.expectedTerms, offer), accepted = await custody.acceptInvoice(request);
  const input = structuredClone(base);
  input.nodes[0] = { ...input.nodes[0], chainDomain: request.chainDomain, evidencePolicy: request.evidencePolicy,
    actionCommitment: request.actionCommitment, payout: offer };
  const graph = compileFundedGraph(input);
  assert.equal(graph.ownerWitness.payouts[0].rho, request.rho);
  assert.equal(graph.authorizationStatement.outputs[0], accepted.payoutCommitment);
  assert.deepEqual(nativeRecipientInvoiceMessage(request), payoutInvoiceMessage(graph.authorizationStatement, graph.ownerWitness.graph.nodes[0], 0));
  assert.equal(signatureValid(offer, nativeRecipientInvoiceMessage(request), accepted.invoiceSignature), true);
  assert.equal(accepted.note.type, 4);
  assert.deepEqual(await custody.acceptInvoice(request), accepted);
  assert.equal((await new Vault(cfg.path).read(cfg.password)).revision, 1);
  assert.doesNotMatch(JSON.stringify({ offer, accepted }), /privateKey|PRIVATE KEY/);
});

test('every scoped invoice field, exact action template and delivery-loss clause are checked before signing', async t => {
  const { cfg } = await setup(t), custody = await createNativeRecipientCustody(cfg), offer = custody.offer();
  t.after(() => custody.close());
  const request = invoice(cfg.expectedTerms, offer);
  for (const field of ['scope', 'policy', 'asset', 'operationId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'rho', 'payoutCommitment', 'deliveryRiskSalt']) {
    await assert.rejects(custody.acceptInvoice({ ...request, [field]: hash('mutated ' + field) }));
  }
  await assert.rejects(custody.acceptInvoice({ ...request, slot: 1 }));
  await assert.rejects(custody.acceptInvoice({ ...request, settleBefore: String(BigInt(request.settleBefore) + 1n) }));
  await assert.rejects(custody.acceptInvoice({ ...request, fullA0: {} }));
  for (const field of ['chainDomain', 'signerIdentity', 'sourceCommitment', 'destinationCommitment', 'custodyCommitment', 'amount', 'executionFrom']) {
    const action = { ...request.action, [field]: field === 'amount' ? '101' : field === 'executionFrom' ? String(BigInt(request.action.executionFrom) + 1n) : hash('other ' + field) };
    await assert.rejects(custody.acceptInvoice({ ...request, action, actionCommitment: nativeTransferActionCommitment(action) }), { code: 'PAEG_RECIPIENT_ACTION_MISMATCH' });
  }
  const action = { ...request.action, deliveryRiskCommitment: hash('different loss allocation') };
  await assert.rejects(custody.acceptInvoice({ ...request, action, actionCommitment: nativeTransferActionCommitment(action) }), { code: 'PAEG_RECIPIENT_DELIVERY_RISK' });
  assert.equal((await new Vault(cfg.path).read(cfg.password)).revision, 0);
  const accepted = await custody.acceptInvoice(request);
  const reboundAction = { ...request.action, receiptRho: hash('rebound receipt') };
  await assert.rejects(custody.acceptInvoice({ ...request, action: reboundAction, actionCommitment: nativeTransferActionCommitment(reboundAction) }), { code: 'PAEG_RECIPIENT_INVOICE_REBIND' });
  assert.deepEqual(await custody.acceptInvoice(request), accepted);
});

test('withdrawal refreshes epoch and path with fixed payout, destination, value and canonical nullifier', async t => {
  const { cfg } = await setup(t), custody = await createNativeRecipientCustody(cfg), offer = custody.offer();
  t.after(() => custody.close());
  await assert.rejects(custody.authorizeWithdrawal({}), { code: 'PAEG_RECIPIENT_INVOICE_REQUIRED' });
  assert.throws(() => custody.withdrawalStatus(), { code: 'PAEG_RECIPIENT_INVOICE_REQUIRED' });
  const accepted = await custody.acceptInvoice(invoice(cfg.expectedTerms, offer)), request = withdrawal(cfg, accepted);
  for (const field of ['scope', 'policy', 'payoutCommitment', 'recipient', 'amount']) {
    const value = field === 'amount' ? '1' : field === 'recipient' ? '34'.repeat(20) : hash('wrong ' + field);
    await assert.rejects(custody.authorizeWithdrawal({ ...request, [field]: value }), { code: 'PAEG_RECIPIENT_WITHDRAWAL_MISMATCH' });
  }
  await assert.rejects(custody.authorizeWithdrawal({ ...request, message: 'arbitrary signing request' }));
  const wrongLeaf = new PrivateNoteTree([hash('wrong leaf')]).path(0);
  await assert.rejects(custody.authorizeWithdrawal({ ...request, path: wrongLeaf }), { code: 'PAEG_RECIPIENT_MEMBERSHIP' });
  const wrongPath = structuredClone(request.path); wrongPath.siblings[0] = '0x' + hash('bad sibling');
  await assert.rejects(custody.authorizeWithdrawal({ ...request, path: wrongPath }), { code: 'PAEG_RECIPIENT_MEMBERSHIP' });
  const initialStatus = custody.withdrawalStatus();
  assert.deepEqual(Object.keys(initialStatus).sort(), ['scope', 'policy', 'payoutCommitment', 'recipient', 'amount', 'canonicalNullifier', 'authorization'].sort());
  assert.equal(initialStatus.authorization, null);
  const witness = await custody.authorizeWithdrawal(request);
  assert.equal(walletInputPublicWords('withdraw_balance', witness).length, 39);
  assert.equal(witness.value, '25'); assert.equal(witness.epoch, request.epoch);
  assert.equal(signatureValid(offer, balanceWithdrawFrame(request.scope, request.policy, request.payoutCommitment,
    request.recipient, request.amount, request.epoch), Buffer.from(witness.signature).toString('hex')), true);
  assert.deepEqual(await custody.authorizeWithdrawal(request), witness);
  const firstStatus = custody.withdrawalStatus();
  assert.equal(firstStatus.canonicalNullifier, witness.spent.map(word => word.toString(16).padStart(8, '0')).join(''));
  assert.equal(firstStatus.authorization.epoch, request.epoch);
  assert.equal(firstStatus.authorization.root, request.path.root);
  const rolledRequest = { ...request, epoch: '2985002' };
  const rolled = await custody.authorizeWithdrawal(rolledRequest);
  assert.deepEqual(rolled.spent, witness.spent);
  assert.equal(rolled.epoch, '2985002');
  assert.deepEqual(await custody.authorizeWithdrawal(rolledRequest), rolled);
  assert.equal(signatureValid(offer, balanceWithdrawFrame(request.scope, request.policy, request.payoutCommitment,
    request.recipient, request.amount, rolledRequest.epoch), Buffer.from(rolled.signature).toString('hex')), true);
  const extended = new PrivateNoteTree([hash('prior note'), accepted.payoutCommitment, hash('later note')]);
  const refreshedRequest = { ...rolledRequest, path: extended.path(1) };
  const refreshed = await custody.authorizeWithdrawal(refreshedRequest);
  assert.deepEqual(refreshed.spent, witness.spent);
  assert.notDeepEqual(refreshed.root, witness.root);
  assert.deepEqual(await custody.authorizeWithdrawal(refreshedRequest), refreshed);
  for (const field of ['scope', 'policy', 'payoutCommitment', 'recipient', 'amount']) {
    const value = field === 'amount' ? '1' : field === 'recipient' ? '34'.repeat(20) : hash('renewed wrong ' + field);
    await assert.rejects(custody.authorizeWithdrawal({ ...refreshedRequest, [field]: value }), { code: 'PAEG_RECIPIENT_WITHDRAWAL_MISMATCH' });
  }
  const renewedStatus = custody.withdrawalStatus();
  assert.deepEqual({ ...renewedStatus, authorization: null }, initialStatus);
  assert.equal(renewedStatus.authorization.epoch, refreshedRequest.epoch);
  assert.equal(renewedStatus.authorization.root, refreshedRequest.path.root);
  assert.notEqual(renewedStatus.authorization.hash, firstStatus.authorization.hash);
  assert.match(renewedStatus.authorization.hash, /^[0-9a-f]{64}$/);
  for (const secret of [offer.secret, offer.randomness, cfg.expectedTerms.operationId, offer.x, offer.y]) {
    assert.equal(JSON.stringify(renewedStatus).includes(secret), false);
  }
  renewedStatus.authorization.epoch = '1';
  assert.equal(custody.withdrawalStatus().authorization.epoch, refreshedRequest.epoch);
  assert.equal((await new Vault(cfg.path).read(cfg.password)).revision, 4);
});

test('encrypted restart recovers exact offer, invoice and withdrawal; wrong password/config fail closed', async t => {
  const { cfg, directory } = await setup(t), first = await createNativeRecipientCustody(cfg), offer = first.offer();
  const request = invoice(cfg.expectedTerms, offer), accepted = await first.acceptInvoice(request);
  const withdraw = withdrawal(cfg, accepted), witness = await first.authorizeWithdrawal(withdraw);
  first.close();
  const disk = await readFile(cfg.path, 'utf8');
  for (const text of [cfg.password, offer.secret, offer.randomness, accepted.invoiceSignature, 'PRIVATE KEY']) assert.equal(disk.includes(text), false);
  const recovered = await recoverNativeRecipientCustody(cfg);
  assert.deepEqual(recovered.offer(), offer);
  assert.deepEqual(await recovered.acceptInvoice(request), accepted);
  assert.deepEqual(await recovered.authorizeWithdrawal(withdraw), witness);
  recovered.close();
  await assert.rejects(recoverNativeRecipientCustody({ ...cfg, password: 'wrong-synthetic-password' }), /authentication/);
  await assert.rejects(recoverNativeRecipientCustody({ ...cfg, withdrawalRecipient: '34'.repeat(20) }), { code: 'PAEG_RECIPIENT_RECOVERY_BINDING' });
  await assert.rejects(recoverNativeRecipientCustody({ ...cfg, expectedTerms: { ...cfg.expectedTerms, operationId: hash('wrong operation') } }), { code: 'PAEG_RECIPIENT_RECOVERY_BINDING' });
  assert.deepEqual(await readdir(directory), ['recipient.vault.json']);
});

test('failed durable invoice/withdrawal writes never acknowledge and require authenticated recovery', async t => {
  const { cfg } = await setup(t), vault = new Vault(cfg.path);
  let custody = await createNativeRecipientCustody(cfg), offer = custody.offer(), request = invoice(cfg.expectedTerms, offer);
  const original = Vault.prototype._write;
  async function failWrite(operation, afterWrite) {
    Vault.prototype._write = async function(record, password) {
      if (this.path !== vault.path) return original.call(this, record, password);
      if (afterWrite) await original.call(this, record, password);
      throw Object.assign(new Error('controlled synthetic write failure'), { code: 'EIO' });
    };
    try { await assert.rejects(operation(), { code: 'EIO' }); }
    finally { Vault.prototype._write = original; }
    assert.throws(() => custody.offer(), { code: 'PAEG_RECIPIENT_RECOVERY_REQUIRED' });
    custody.close(); custody = await recoverNativeRecipientCustody(cfg);
  }
  await failWrite(() => custody.acceptInvoice(request), false);
  assert.equal((await vault.read(cfg.password)).data.invoice, null);
  await failWrite(() => custody.acceptInvoice(request), true);
  const persisted = (await vault.read(cfg.password)).data.invoice;
  const accepted = await custody.acceptInvoice(request);
  assert.equal(accepted.invoiceSignature, persisted.signature);
  const withdraw = withdrawal(cfg, accepted);
  await failWrite(() => custody.authorizeWithdrawal(withdraw), false);
  assert.equal((await vault.read(cfg.password)).data.withdrawal, null);
  await failWrite(() => custody.authorizeWithdrawal(withdraw), true);
  const stored = (await vault.read(cfg.password)).data.withdrawal.witness;
  assert.deepEqual(await custody.authorizeWithdrawal(withdraw), stored);
  assert.equal((await vault.read(cfg.password)).revision, 2);
  const previousStatus = custody.withdrawalStatus();
  const renewedRequest = { ...withdraw, epoch: '2985002',
    path: new PrivateNoteTree([hash('prior note'), accepted.payoutCommitment, hash('after rollover')]).path(1) };
  await failWrite(() => custody.authorizeWithdrawal(renewedRequest), false);
  assert.deepEqual(custody.withdrawalStatus(), previousStatus);
  assert.deepEqual(await custody.authorizeWithdrawal(withdraw), stored);
  await failWrite(() => custody.authorizeWithdrawal(renewedRequest), true);
  const renewedStatus = custody.withdrawalStatus(), renewed = await custody.authorizeWithdrawal(renewedRequest);
  assert.equal(renewedStatus.canonicalNullifier, previousStatus.canonicalNullifier);
  assert.notEqual(renewedStatus.authorization.hash, previousStatus.authorization.hash);
  assert.equal(renewedStatus.authorization.epoch, renewedRequest.epoch);
  assert.equal(renewedStatus.authorization.root, renewedRequest.path.root);
  assert.deepEqual(renewed.spent, stored.spent);
  assert.equal((await vault.read(cfg.password)).revision, 3);
  custody.close();
  custody = await recoverNativeRecipientCustody(cfg);
  assert.deepEqual(custody.withdrawalStatus(), renewedStatus);
  assert.deepEqual(await custody.authorizeWithdrawal(renewedRequest), renewed);
  const thirdRequest = { ...renewedRequest, epoch: '2985003' };
  const third = await custody.authorizeWithdrawal(thirdRequest);
  assert.deepEqual(third.spent, stored.spent);
  assert.equal(custody.withdrawalStatus().authorization.epoch, thirdRequest.epoch);
  custody.close();
  // Faults cover pre-write and post-write lost acknowledgements, not power-loss
  // fsync behavior, hostile filesystem rollback or attested native membership.
});

test('separate process retains private signer across restart and returns only constrained results', async t => {
  const { cfg } = await setup(t), first = await createNativeRecipientProcess({ mode: 'create', ...cfg });
  t.after(() => first.close());
  assert.notEqual(first.report().pid, process.pid);
  const offer = await first.offer(), request = invoice(cfg.expectedTerms, offer), accepted = await first.acceptInvoice(request);
  const withdraw = withdrawal(cfg, accepted), witness = await first.authorizeWithdrawal(withdraw);
  const closed = await first.close(); assert.equal(closed.exited, true); assert.deepEqual(closed.exit, { code: 0, signal: null });
  const recovered = await createNativeRecipientProcess({ mode: 'recover', ...cfg });
  t.after(() => recovered.close());
  assert.deepEqual(await recovered.offer(), offer);
  assert.deepEqual(await recovered.acceptInvoice(request), accepted);
  assert.deepEqual(await recovered.authorizeWithdrawal(withdraw), witness);
  await assert.rejects(recovered.authorizeWithdrawal({ ...withdraw, recipient: '34'.repeat(20) }), { code: 'PAEG_RECIPIENT_WITHDRAWAL_MISMATCH' });
  assert.doesNotMatch(JSON.stringify({ offer, accepted, witness, report: recovered.report() }), /privateKey|PRIVATE KEY|synthetic-local-fixture-password/);
  assert.equal((await recovered.close()).exited, true);
});

test('raw owner IPC rejects arbitrary signing, key export, destination replacement and full-graph input', async t => {
  const { cfg } = await setup(t), child = spawn(process.execPath,
    [fileURLToPath(new URL('../../src/paeg/native-recipient-process.mjs', import.meta.url)), '--worker'],
    { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  let buffer = '', stderr = '', seq = 0;
  const messages = [], waiters = [];
  const wait = predicate => {
    const previous = messages.find(predicate); if (previous) return Promise.resolve(previous);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => reject(new Error('synthetic IPC timeout')), 5000) }; waiters.push(waiter);
    });
  };
  child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => {
    buffer += chunk; const lines = buffer.split('\n'); buffer = lines.pop();
    for (const line of lines) {
      const message = JSON.parse(line); messages.push(message);
      const index = waiters.findIndex(waiter => waiter.predicate(message));
      if (index >= 0) { const [waiter] = waiters.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(message); }
    }
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  t.after(async () => { child.kill('SIGTERM'); await closed; waiters.forEach(waiter => clearTimeout(waiter.timer)); assert.equal(stderr, ''); });
  child.stdio[3].end(JSON.stringify({ mode: 'create', ...cfg }));
  assert.equal((await wait(message => message.event)).event, 'ready');
  const call = (operation, input = null) => {
    const id = ++seq, result = wait(message => message.id === id); child.stdin.write(JSON.stringify({ id, operation, input }) + '\n'); return result;
  };
  for (const operation of ['sign', 'exportKey', 'getPrivateKey', 'replaceTerms', 'updateWithdrawalRecipient']) {
    assert.equal((await call(operation, {})).code, 'PAEG_RECIPIENT_OPERATION_DENIED');
  }
  assert.equal((await call('acceptInvoice', { fullA0: {} })).ok, false);
  assert.equal((await call('close')).ok, true);
  assert.deepEqual(await closed, { code: 0, signal: null });
});

test('separate native owner preparation feeds the exact scoped invoice into recipient custody without proving', async t => {
  const { createNativeOwnerProcess } = await import('../../src/paeg/native-owner.mjs');
  const { cfg, directory } = await setup(t), recipient = await createNativeRecipientProcess({ mode: 'create', ...cfg });
  t.after(() => recipient.close());
  const offer = await recipient.offer(), owner = createNativeOwnerProcess();
  t.after(() => owner.close());
  const terms = cfg.expectedTerms, { settleBefore: unused, ...actionTemplate } = terms.actionTemplate;
  const prepared = await owner.prepare({
    ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'operationId', 'settleBefore'].map(key => [key, terms[key]])),
    epoch: '2985000', fundingNotBefore: base.fundingNotBefore, fundingValidUntil: base.fundingValidUntil, fundingAmount: '32',
    nodes: [{ id: 'recipient-one', dependsOn: [], evidencePolicy: terms.evidencePolicy, actionTemplate, recipientOffer: offer }],
    vault: { path: join(directory, 'owner.vault.json'), password: 'synthetic-owner-password' },
  });
  assert.equal(prepared.invoiceRequests.length, 1);
  const accepted = await recipient.acceptInvoice(prepared.invoiceRequests[0].invoice);
  assert.equal(signatureValid(offer, nativeRecipientInvoiceMessage(prepared.invoiceRequests[0].invoice), accepted.invoiceSignature), true);
  assert.equal(prepared.metrics.proofs.length, 0);
  assert.equal((await owner.close()).exited, true);
  assert.equal((await recipient.close()).exited, true);
});

test('provider acceptance capability exposes only the durably accepted own quote', async t => {
  const { cfg } = await setup(t);
  assert.throws(() => assertOwnedNativeRecipientProcess({ acceptedQuote() {} }), /OWNED_PROCESS_CAPABILITY/);
  const recipient = await createNativeRecipientProcess({ mode: 'create', ...cfg });
  t.after(() => recipient.close());
  assertOwnedNativeRecipientProcess(recipient);
  await assert.rejects(recipient.acceptedQuote(), /INVOICE_REQUIRED/);
  const offer = await recipient.offer(), request = invoice(cfg.expectedTerms, offer);
  await recipient.acceptInvoice(request);
  const quote = await recipient.acceptedQuote();
  assert.deepEqual(Object.keys(quote).sort(), ['scope','policy','asset','hubDomain','registryCommitment','action','payoutCommitment','deliveryRiskSalt'].sort());
  assert.equal(quote.payoutCommitment, request.payoutCommitment);
  assert.deepEqual(quote.action, request.action);
  assert.equal(JSON.stringify(quote).includes(cfg.expectedTerms.operationId), false);
  assert.equal(JSON.stringify(quote).includes(offer.secret), false);
  quote.action.amount = '1';
  assert.equal((await recipient.acceptedQuote()).action.amount, request.action.amount);
});
