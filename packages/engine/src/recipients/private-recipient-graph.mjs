/** PC17 owner graph assembly from recipient-created invoices.
 * Only owner/recovery keys are generated here. Recipient signing keys are never
 * created, imported or reconstructed by this module. The owner still receives
 * both complete note openings for the unchanged monolithic PC15 proof.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  freshKey, hex32, uintBE, origin, admission, paymentCommitment,
  policyCommitment, graphCommitment, reservedCommitment, ownerFrame, signature, nullifier,
} from '../notes/private-note-encoding.mjs';
import { validateRecipientTerms, importRecipientInvoice } from './private-recipient-custody.mjs';
import { PrivateNoteTree, privateSpentDigest } from '../notes/private-note-tree.mjs';
import { assertPrivateSnapshotCanonical } from '../finality/private-finality-runtime.mjs';

const roles = ['sol', 'btc'];
const hex = b => hex32(b).toString('hex');
const pref = b => `0x${Buffer.from(b).toString('hex')}`;
const clone = o => structuredClone(o);
const positive = n => { uintBE(n, 8); n = BigInt(n); assert.ok(n > 0n, 'RECIPIENT_GRAPH_POSITIVE'); return n; };

/** Own-role terms exist before any recipient key exists. Independent random
 * originSeed is selected once, and only derived role origins leave this plan. */
export function createRecipientGraphPlan({ scope, policy, epoch, sourceSol, recipientSol, recipientBtc,
  amountSol = 3000000n, numerator = 1n, denominator = 30n, budget = 1000000000000000n,
  solCompensation = BigInt(budget) / 2n, claimEpoch = BigInt(epoch) + 12n }) {
  const g = { scope: hex32(scope), policy: policyCommitment(policy), policyFields: clone(policy),
    owner: freshKey(), originSeed: randomBytes(32), graphSalt: randomBytes(32), reserveSecret: randomBytes(32),
    budget: positive(budget), numerator: positive(numerator), denominator: positive(denominator), claimEpoch: BigInt(claimEpoch) };
  uintBE(epoch, 8); uintBE(g.claimEpoch, 8);
  assert.ok(g.claimEpoch > BigInt(epoch) + 1n, 'RECIPIENT_GRAPH_WINDOW');
  const solValue = positive(solCompensation), btcValue = positive(g.budget - solValue);
  const amounts = [positive(amountSol), positive(BigInt(amountSol) * g.numerator / g.denominator)];
  const terms = {};
  roles.forEach((role, i) => {
    terms[role] = validateRecipientTerms({ scope: hex(g.scope), policy: hex(g.policy), role, originSlot: i + 1,
      origin: hex(origin(g.scope, g.originSeed, i + 1)), value: [solValue, btcValue][i].toString(),
      descriptor: { chain: i + 1, nonce: hex(randomBytes(32)), source: i ? '00'.repeat(32) : hex(sourceSol),
        recipient: hex(i ? recipientBtc : recipientSol), amount: amounts[i].toString(),
        executeAfter: (BigInt(epoch) * 600n).toString(), executeBefore: ((g.claimEpoch - 1n) * 600n).toString(),
        validFrom: BigInt(epoch).toString(), validUntil: g.claimEpoch.toString() } });
  });
  g.recovery = { type: 3, origin: origin(g.scope, g.originSeed, 3), ...freshKey(), value: g.budget, secret: randomBytes(32) };
  g.recovery.commitment = paymentCommitment(g.scope, g.recovery);
  let assembled = false;
  return Object.freeze({
    terms(role) { assert.ok(roles.includes(role), 'RECIPIENT_GRAPH_ROLE'); return clone(terms[role]); },
    assemble(invoices) {
      assert.equal(assembled, false, 'RECIPIENT_GRAPH_ALREADY_ASSEMBLED');
      assert.deepEqual(Object.keys(invoices).sort(), roles.slice().sort(), 'RECIPIENT_GRAPH_INVOICES');
      const imported = Object.fromEntries(roles.map(role => [role, importRecipientInvoice(terms[role], invoices[role])]));
      assert.equal(imported.sol.note.value + imported.btc.note.value, g.budget, 'RECIPIENT_GRAPH_CONSERVATION');
      for (const role of roles) { g[role] = imported[role].local; g[`${role}Note`] = imported[role].note; }
      g.commitment = graphCommitment(g); g.reserved = reservedCommitment(g);
      g.ownerSignature = signature(g.owner, ownerFrame(g.scope, g.policy, g.commitment));
      g.nullifier = nullifier(g.scope, g.reserved, g.reserveSecret); g.admission = admission(g.scope, g.originSeed);
      assembled = true;
      return g;
    },
  });
}

/** Discover an issued note using a trusted deployed-pool object, never a caller
 * tree. Snapshot reconstitution, accepted-root, commitment and spent-map reads
 * are pinned to one checked canonical block. The recipient receives ONLY the
 * exact request, not this snapshot or sibling/nullifier inventory. Inclusion
 * still rechecks epoch/root/unspentness in the real pool and signature circuit.
 */
export async function discoverRecipientWithdrawal({ pool, runtime, terms, invoice, recipient }) {
  const { note } = importRecipientInvoice(terms, invoice);
  assert.equal(pool.scope, `0x${terms.scope}`, 'RECIPIENT_AUTHORITY_SCOPE');
  assert.equal(pool.policy, `0x${terms.policy}`, 'RECIPIENT_AUTHORITY_POLICY');
  assert.match(recipient, /^[0-9a-f]{40}$/, 'RECIPIENT_AUTHORITY_DESTINATION');
  const snapshot = await pool.snapshot();
  assert.equal(snapshot.scope, pool.scope, 'RECIPIENT_AUTHORITY_SCOPE');
  assert.equal(snapshot.policy, pool.policy, 'RECIPIENT_AUTHORITY_POLICY');
  assert.equal(snapshot.epoch, (BigInt(snapshot.blockTimestamp) / 600n).toString(), 'RECIPIENT_AUTHORITY_EPOCH');
  const tree = new PrivateNoteTree(snapshot.leaves.slice(0, snapshot.leafCount));
  assert.equal(tree.root, snapshot.root, 'RECIPIENT_AUTHORITY_ROOT');
  assert.equal(privateSpentDigest(pool.scope, snapshot.nullifiers, snapshot.spentCount), snapshot.spentDigest, 'RECIPIENT_AUTHORITY_SPENT_DIGEST');
  const index = snapshot.leaves.slice(0, snapshot.leafCount).indexOf(pref(note.commitment));
  assert.ok(index >= 0, 'RECIPIENT_PAYMENT_NOT_ISSUED');
  const spent = pref(nullifier(terms.scope, note.commitment, note.secret));
  assert.ok(!snapshot.nullifiers.slice(0, snapshot.spentCount).includes(spent), 'RECIPIENT_PAYMENT_ALREADY_SPENT');
  const truth = `0x${'0'.repeat(63)}1`, falsity = `0x${'0'.repeat(64)}`;
  assert.equal(await pool.call('acceptedRoots(bytes32)', [snapshot.root], snapshot.blockNumber), truth, 'RECIPIENT_ROOT_NOT_ACCEPTED');
  assert.equal(await pool.call('insertedCommitments(bytes32)', [pref(note.commitment)], snapshot.blockNumber), truth, 'RECIPIENT_PAYMENT_NOT_ISSUED');
  assert.equal(await pool.call('spentNullifiers(bytes32)', [spent], snapshot.blockNumber), falsity, 'RECIPIENT_PAYMENT_ALREADY_SPENT');
  await assertPrivateSnapshotCanonical(runtime, snapshot);
  return { request: { scope: terms.scope, policy: terms.policy, paymentCommitment: invoice.paymentCommitment,
    recipient, amount: note.value.toString(), epoch: snapshot.epoch }, path: tree.path(index),
    authority: { pool: pool.address, scope: pool.scope, policy: pool.policy, block: snapshot.blockNumber,
      blockHash: snapshot.blockHash, epoch: snapshot.epoch, root: snapshot.root, noteNullifier: spent,
      acceptedRoot: true, insertedCommitment: true, unspent: true, discovery: 'LIVE_PINNED_POOL_CANONICAL_STATE' } };
}
