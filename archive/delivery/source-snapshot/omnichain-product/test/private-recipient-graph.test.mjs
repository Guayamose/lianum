import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRecipientGraphPlan, discoverRecipientWithdrawal } from '../src/private-recipient-graph.mjs';
import { createRecipientCustody, recipientWithdrawalInput } from '../src/private-recipient-custody.mjs';
import { freshKey, reserveInput, nullifier } from '../src/private-note-encoding.mjs';
import { PrivateNoteTree, privateSpentDigest } from '../src/private-note-tree.mjs';
const h = (n = 32) => randomBytes(n).toString('hex');
const pref = b => `0x${Buffer.from(b).toString('hex')}`;
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'pc17-graph-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const policy = { minimumBtcConfirmations: 6 };
  for (const c of ['sol', 'btc']) { const key = freshKey(); policy[c] = { policyId: h(), identityNamespace: h(), genesis: h(), x: key.x, y: key.y }; }
  const input = { scope: h(), policy, epoch: 3166667n, sourceSol: h(), recipientSol: h(), recipientBtc: h() };
  const plan = createRecipientGraphPlan(input), wallets = {}, invoices = {}, terms = {}, recipients = {};
  for (const role of ['sol', 'btc']) {
    terms[role] = plan.terms(role); recipients[role] = h(20);
    const wallet = await createRecipientCustody({ path: join(directory, `${role}.vault`), password: h(), expectedTerms: terms[role], withdrawalRecipient: recipients[role] });
    t.after(() => wallet.close()); wallets[role] = wallet;
    const { termsDigest, value, paymentCommitment, localCommitment } = wallet.reviewCompensation();
    await wallet.acknowledgeCompensation({ termsDigest, value, paymentCommitment, localCommitment });
    invoices[role] = wallet.invoice(terms[role]);
  }
  return { input, plan, wallets, invoices, terms, recipients };
}

test('new owner graph uses recipient invoices without generating or importing recipient signing keys', async t => {
  const { plan, invoices, terms } = await setup(t);
  assert.throws(() => plan.assemble({ sol: invoices.btc, btc: invoices.sol }));
  const mutated = structuredClone(invoices); mutated.sol.note.value = '1';
  assert.throws(() => plan.assemble(mutated));
  const g = plan.assemble(invoices), input = reserveInput(g, 3166667n);
  assert.equal(input.sol_payout, terms.sol.value); assert.equal(input.btc_payout, terms.btc.value);
  assert.deepEqual(input.sol_invoice_signature, [...Buffer.from(invoices.sol.invoiceSignature, 'hex')]);
  assert.equal(g.solNote.privateKey, undefined); assert.equal(g.btcNote.privateKey, undefined);
  assert.ok(g.owner.privateKey); assert.ok(g.recovery.privateKey);
  assert.notDeepEqual(g.solNote.x, g.btcNote.x);
  assert.throws(() => plan.assemble(invoices), /RECIPIENT_GRAPH_ALREADY_ASSEMBLED/);
  for (const role of ['sol', 'btc']) {
    const wire = JSON.stringify(terms[role]);
    for (const hidden of [g.originSeed, g.graphSalt, g.commitment, g.nullifier, g[role === 'sol' ? 'btc' : 'sol'].recipient])
      assert.equal(wire.includes(hidden.toString('hex')), false);
  }
  const copy = plan.terms('sol'); copy.value = '1'; assert.equal(plan.terms('sol').value, terms.sol.value);
});

test('graph plan rejects invalid positive amount, conservation and execution-window parameters', async t => {
  const { input } = await setup(t);
  for (const field of ['amountSol', 'numerator', 'denominator', 'budget', 'solCompensation'])
    assert.throws(() => createRecipientGraphPlan({ ...input, [field]: 0n }));
  assert.throws(() => createRecipientGraphPlan({ ...input, solCompensation: 1000000000000000n }));
  assert.throws(() => createRecipientGraphPlan({ ...input, claimEpoch: input.epoch + 1n }));
  assert.throws(() => createRecipientGraphPlan({ ...input, amountSol: 1n, denominator: 30n }));
});

function authorityFixture(terms, invoice) {
  const tree = new PrivateNoteTree([h(), invoice.paymentCommitment]);
  const snapshot = { blockNumber: '0x1', blockHash: `0x${h()}`, blockTimestamp: '1900000201', epoch: '3166667',
    scope: `0x${terms.scope}`, policy: `0x${terms.policy}`, leaves: [tree.path(0).leaf, tree.path(1).leaf],
    root: tree.root, leafCount: 2, nullifiers: [], spentCount: 0 };
  snapshot.spentDigest = privateSpentDigest(snapshot.scope, [], 0);
  const calls = [], flags = {};
  const pool = { address: `0x${h(20)}`, scope: snapshot.scope, policy: snapshot.policy, snapshot: async () => structuredClone(snapshot),
    call: async (method, args, block) => { calls.push({ method, args, block }); return flags[method] ?? `0x${'0'.repeat(63)}${method.startsWith('spent') ? '0' : '1'}`; } };
  const runtime = { evm: async (method, [block]) => { assert.equal(method, 'eth_getBlockByNumber'); assert.equal(block, snapshot.blockNumber); return { hash: snapshot.blockHash }; } };
  return { snapshot, flags, calls, pool, runtime };
}

test('withdrawal discovers own issued note from pinned live authority and binds exact epoch/root/unspentness', async t => {
  const { terms, invoices, recipients, wallets } = await setup(t), fixture = authorityFixture(terms.sol, invoices.sol);
  const d = await discoverRecipientWithdrawal({ ...fixture, terms: terms.sol, invoice: invoices.sol, recipient: recipients.sol });
  assert.equal(d.path.index, 1); assert.equal(d.path.root, fixture.snapshot.root);
  assert.equal(d.authority.unspent, true); assert.equal(d.request.epoch, fixture.snapshot.epoch);
  assert.ok(fixture.calls.every(c => c.block === fixture.snapshot.blockNumber));
  const auth = wallets.sol.authorizeWithdrawal(d.request);
  const input = recipientWithdrawalInput(terms.sol, invoices.sol, auth, d.path);
  assert.equal(input.amount, terms.sol.value);
  assert.deepEqual(Object.keys(d.request), ['scope', 'policy', 'paymentCommitment', 'recipient', 'amount', 'epoch']);
});

test('invented/unaccepted roots, absent/spent notes, wrong scope and changed canonical block fail closed', async t => {
  const { terms, invoices, recipients } = await setup(t);
  const run = async change => { const f = authorityFixture(terms.sol, invoices.sol); change(f); await assert.rejects(discoverRecipientWithdrawal({ ...f, terms: terms.sol, invoice: invoices.sol, recipient: recipients.sol })); };
  await run(f => { f.snapshot.root = `0x${h()}`; });
  await run(f => { f.flags['acceptedRoots(bytes32)'] = `0x${'0'.repeat(64)}`; });
  await run(f => { f.flags['insertedCommitments(bytes32)'] = `0x${'0'.repeat(64)}`; });
  await run(f => { f.flags['spentNullifiers(bytes32)'] = `0x${'0'.repeat(63)}1`; });
  await run(f => { f.pool.scope = `0x${h()}`; });
  await run(f => { f.snapshot.epoch = '1'; });
  await run(f => { f.runtime.evm = async () => ({ hash: `0x${h()}` }); });
  await run(f => { const tree = new PrivateNoteTree([h()]); f.snapshot.leafCount = 1; f.snapshot.leaves = [tree.path(0).leaf]; f.snapshot.root = tree.root; });
  await run(f => { f.snapshot.nullifiers = [pref(nullifier(terms.sol.scope, invoices.sol.paymentCommitment, invoices.sol.note.secret))]; f.snapshot.spentCount = 1; f.snapshot.spentDigest = privateSpentDigest(f.pool.scope, f.snapshot.nullifiers, 1); });
});
