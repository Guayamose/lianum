/** Focused new owner-local review projection. Copied existing synthetic
 * custody fixture helpers; no real child, native execution or proof acceptance.
 * Original fixture boundary: explicit fake RPC records, fake proof bytes
 * and a test-only non-Poseidon hash. No child, backend, chain or Noir executes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Vault } from '@lianum/engine/crypto/vault';
import { PrivateNoteTree, privateSpentDigest } from '@lianum/engine/notes/private-note-tree';
import { freshKey, signature } from '@lianum/engine/notes/private-note-encoding';
import { derivePrivateAssetIdentity } from '@lianum/engine/notes/private-asset-runtime';
import { nativeRecipientInvoiceMessage } from '@lianum/engine/execution/native/recipients/native-recipient-custody';
import { createCommitmentCodec } from '@lianum/components/encoding/commitments';
import { encodeStatement } from '@lianum/components/encoding/statements';
import { encodeDepositIntentInputs } from '@lianum/engine/execution/inputs/deposit-intent';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimIntentId, encodeClaimIngressInputs }
  from '@lianum/engine/claims/framing';
import { CLAIM_BACKING_FIELDS, claimActionDigest } from '@lianum/engine/claims/permits';
import { encodeNativeClaimIssueCall, decodeNativeClaimIssueCall } from '@lianum/engine/claims/issue-call';
import { assertOwnedNativeClaimIngressHandoff } from '../../../backend/src/custody/processes/flat-owner-process.mjs';
import { encodeEvmVaultDeliveryCall, evmVaultDeliveryDescriptorCommitment }
  from '@lianum/engine/encoding/evm-vault-delivery';
import { openTrustedFlatOwnerCustody, ownerDigest, flatOwnerIdentity, flatOwnerSnapshot,
  decodeFlatOwnerCalldata, validateFlatOwnerTransition, validateFlatOwnerDepositIntentTransition,
  FLAT_OWNER_CLAIM_HANDOFF_PROFILE, FLAT_OWNER_CLAIM_HANDOFF_TRUST } from '../../src/signing/flat-owner-custody.mjs';

const h = value => createHash('sha256').update('flat owner custody test: ' + value).digest('hex');
const ZERO = '0'.repeat(64), p = value => '0x' + value;
const TOKEN = { token: 'ab'.repeat(20), codeHash: h('fixture token code') }, SENDER = '90'.repeat(20);
const hashFields = async fields => '00' + h(fields.map(String).join(':')).slice(2);
const word = value => typeof value === 'string' && value.startsWith('0x') ? value.slice(2).padStart(64, '0') : BigInt(value).toString(16).padStart(64, '0');
const words = values => '0x' + values.map(word).join('');
const methods = { deposit: 'depositBalance(bytes,bytes32[])', reservation: 'reserveGenericGuarded((bytes,bytes32[]),(bytes,bytes32[]),uint64,bytes32)',
  recovery: 'recoverGeneric(bytes,bytes32[])', withdrawal: 'withdrawBalance(bytes,bytes32[])',
  deposit_intent: 'depositBalanceIntent(bytes,bytes32[])' };
const artifact = { evm: { methodIdentifiers: Object.fromEntries(Object.values(methods).map((name, i) => [name, String(i + 1).padStart(8, '0')])) } };
function calldata(kind, inputs, u = null, guards = null) {
  const tuple = values => word(64) + word(128) + word(3) + 'c0ffee'.padEnd(64, '0') + word(values.length) + values.map(word).join('');
  const first = tuple(u ?? inputs), body = kind === 'reservation'
    ? word(128) + word(128 + first.length / 2) + word(guards.expectedSequence) + word(guards.expectedPostRoot) + first + tuple(inputs) : first;
  return '0x' + artifact.evm.methodIdentifiers[methods[kind]] + body;
}
function snapshot(id, { commitments = [], nullifiers = [], sequence = '0', reservations = 0, outputs = 0, backing = '0', roots,
  timestamp = '6000', blockHash = h('block-' + sequence) } = {}) {
  const root = new PrivateNoteTree(commitments).root; roots ??= [root]; const count = Buffer.alloc(4); count.writeUInt32BE(roots.length);
  const padded = roots.concat(Array(65 - roots.length).fill(p(ZERO)));
  const history = p(createHash('sha256').update(Buffer.concat([Buffer.from([0x18]), Buffer.from(id.domain.scope, 'hex'), count,
    ...padded.map(value => Buffer.from(value.slice(2), 'hex'))])).digest('hex'));
  return { identitySHA256: ownerDigest(id), blockHash, canonicalBlockHashBefore: blockHash, canonicalBlockHashAfter: blockHash, timestamp,
    rawState: words([root, privateSpentDigest(p(id.domain.scope), nullifiers), sequence, commitments.length, nullifiers.length, reservations, outputs,
      ...commitments, ...Array(64 - commitments.length).fill(p(ZERO)), ...nullifiers, ...Array(64 - nullifiers.length).fill(p(ZERO))]),
    rawHistory: words([sequence, history, roots.length, ...padded]), rawBacking: words([sequence, backing, backing, 0, 0, 0]) };
}
async function setup(t, { assetBinding = null } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'flat-owner-test-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const domain = Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace'].map(key => [key, h(key)]));
  domain.ledgerNamespace = domain.hubDomain;
  domain.asset = derivePrivateAssetIdentity(31337, p(assetBinding?.token ?? '0'.repeat(40)), p(assetBinding?.codeHash ?? ZERO)).slice(2);
  const id = { pool: '12'.repeat(20), domain, domainCommitment: await createCommitmentCodec({ hashFields }).domainCommitment(domain),
    ...(assetBinding ? { assetBinding: structuredClone(assetBinding) } : {}) };
  const path = join(directory, 'custody.vault'), password = 'test-only-password'; let checkpoint, current = snapshot(id), observation = null,
    deliveryObservation = null, hashes = 0, observedKind, checkpointHook = async () => {};
  const observations = new Map(), queries = [];
  const deps = { observer: { readSnapshot: async () => structuredClone(current), readTransaction: async query => {
    queries.push(structuredClone(query)); return structuredClone(query.kind === observedKind ? observation : observations.get(query.kind) ?? null);
  }, readDepositIntentDelivery: async query => {
    queries.push(structuredClone(query)); return structuredClone(deliveryObservation);
  } },
    onCheckpoint: async cp => { checkpoint = structuredClone(cp); await checkpointHook(cp); }, withHashFields: async work => { hashes++; return work(hashFields); } };
  const config = { path, password, identity: id, poolArtifact: artifact, create: true, checkpoint: null };
  let owner = await openTrustedFlatOwnerCustody(config, deps); const vault = new Vault(path);
  const f = { id, path, password, vault, observations, queries, get owner() { return owner; }, get current() { return current; }, set current(value) { current = value; },
    get hashes() { return hashes; }, get checkpoint() { return structuredClone(checkpoint); }, set observation(value) { observation = value; },
    set deliveryObservation(value) { deliveryObservation = value; },
    set checkpointHook(value) { checkpointHook = value; },
    set nativeClaimObservation(value) {
      deps.observer.readNativeClaimIntent = async query => { queries.push(structuredClone(query)); return structuredClone(value); };
    },
    async state() { return (await vault.read(password)).data; },
    async reopen(cp = checkpoint) { owner.close(); owner = await openTrustedFlatOwnerCustody({ ...config, create: false, checkpoint: cp }, deps); },
    async success(kind, beforeOverride = null, operationOverride = null) {
      const state = await this.state(), op = operationOverride ?? state.operations[kind], before = beforeOverride ?? current, b = flatOwnerSnapshot(before, id), s = op.statement;
      const withdrawal = kind.startsWith('withdraw_');
      const inserts = kind === 'deposit' ? [s.output] : kind === 'reservation' ? [s.reserveCommitment, s.changeCommitment] : kind === 'recovery' ? [s.recoveryCommitment] : [];
      const spends = kind === 'deposit' ? [] : [kind === 'reservation' ? s.inputNullifier : kind === 'recovery' ? s.reserveNullifier : s.nullifier];
      const commitments = b.commitments.concat(inserts.map(p)), nullifiers = b.nullifiers.concat(spends.map(p));
      const root = new PrivateNoteTree(commitments).root, sequence = String(BigInt(b.publicState.sequence) + 1n);
      const after = snapshot(id, { commitments, nullifiers, sequence, roots: inserts.length ? b.roots.concat(root) : b.roots,
        timestamp: before.timestamp, reservations: b.publicState.liveReservations + (kind === 'reservation' ? 1 : kind === 'recovery' ? -1 : 0),
        outputs: b.publicState.outputCapacity + (['deposit', 'recovery'].includes(kind) ? 1 : withdrawal ? -1 : 0),
        backing: String(BigInt(b.publicState.backedAmount) + (kind === 'deposit' ? BigInt(s.amount) : withdrawal ? -BigInt(s.amount) : 0n)) });
      const a = flatOwnerSnapshot(after, id).publicState, tx = h('tx-' + kind);
      observation = { identitySHA256: ownerDigest(id), transaction: { hash: tx, to: id.pool,
        value: kind === 'deposit' && !assetBinding ? s.amount : '0', calldata: op.submission.calldata,
        ...(assetBinding ? { from: SENDER } : {}) },
        receipt: { transactionHash: tx, blockHash: after.blockHash, status: 1 }, before, after,
        stateAdvanced: { address: id.pool, transactionHash: tx, blockHash: after.blockHash, sequence, root, spent: a.spentDigest, leaves: a.leaves, consumed: a.spent },
        ...(kind === 'recovery' ? { recoveryRoots: { rawAuthorizationRootHistory: words([p(s.authorizationRoot), ...Array(64).fill(p(ZERO))]),
          rawAuthorizationRootHistoryCount: words([1]) } } : {}),
        ...(withdrawal ? { withdrawal: { address: id.pool, transactionHash: tx, blockHash: after.blockHash, recipient: s.recipient, amount: s.amount, nullifier: s.nullifier } } : {}) };
      if (assetBinding) {
        const delta = kind === 'deposit' ? BigInt(s.amount) : withdrawal ? -BigInt(s.amount) : 0n;
        observation.assetObservation = { kind: 'ERC20', ...structuredClone(assetBinding), pool: id.pool,
          participant: withdrawal ? s.recipient : SENDER, participantRole: withdrawal ? 'RECIPIENT' : 'SENDER',
          before: { blockHash: before.blockHash, poolBalance: b.publicState.actualAssetBalance, participantBalance: '1000000' },
          after: { blockHash: after.blockHash, poolBalance: a.actualAssetBalance, participantBalance: String(1000000n - delta) } };
      }
      observedKind = kind; observations.set(kind, structuredClone(observation));
      return structuredClone(observation);
    } };
  t.after(() => { try { owner.close(); } catch {} }); return f;
}
async function deposit(f) {
  await f.owner.prepareDeposit({ amount: '50000', epoch: '10', exitRecipient: '34'.repeat(20) });
  const job = await f.owner.depositWitness(); await f.owner.bindSubmission({ kind: 'deposit', calldata: calldata('deposit', job.publicInputs) });
  const o = await f.success('deposit'); await f.owner.reconcile({ kind: 'deposit' }); f.current = o.after; return job;
}

test('original custody preparation review is read-only and returns no root, note opening or witness', async t => {
  const f = await setup(t), before = await f.state(), checkpoint = f.checkpoint, hashes = f.hashes;
  const empty = await f.owner.preparationTerms({ kind: 'deposit' });
  assert.deepEqual(empty, { identitySHA256: ownerDigest(f.id), kind: 'deposit', observed: { blockHash: f.current.blockHash, timestamp: '6000' },
    eligible: true, note: null, prepared: null });
  assert.deepEqual(await f.state(), before); assert.deepEqual(f.checkpoint, checkpoint); assert.equal(f.hashes, hashes);
  await f.owner.prepareDeposit({ amount: '50000', epoch: '10', exitRecipient: '34'.repeat(20) });
  const stored = await f.state(), nextCheckpoint = f.checkpoint, terms = await f.owner.preparationTerms({ kind: 'deposit' });
  assert.deepEqual(terms.note, { role: 'source', amount: '50000', recipient: '34'.repeat(20), status: 'UNISSUED', observedUnspent: false });
  assert.deepEqual(terms.prepared, { stage: 'PREPARED', epoch: '10', amount: '50000', recipient: '34'.repeat(20), submissionBound: false });
  assert.equal(terms.eligible, false); assert.deepEqual(await f.state(), stored); assert.deepEqual(f.checkpoint, nextCheckpoint);
  assert.doesNotMatch(JSON.stringify(terms), /root|opening|commitment|nullifier|witness|privateKey|secret|rho|proof|calldata/);
});

test('actual existing custody reviews original withdrawal terms before locking and exposes the stored prepared statement afterward', async t => {
  const f = await setup(t); await deposit(f);
  const before = await f.state(), cp = f.checkpoint, hashes = f.hashes;
  const review = await f.owner.preparationTerms({ kind: 'withdraw_source' });
  assert.equal(review.eligible, true); assert.equal(review.prepared, null);
  assert.deepEqual(review.note, { role: 'source', amount: '50000', recipient: '34'.repeat(20), status: 'AVAILABLE', observedUnspent: true });
  assert.deepEqual(await f.state(), before); assert.deepEqual(f.checkpoint, cp); assert.equal(f.hashes, hashes);
  await f.owner.prepareWithdrawal({ role: 'source', epoch: '10' });
  const prepared = await f.owner.preparationTerms({ kind: 'withdraw_source' }), state = await f.state();
  assert.equal(prepared.eligible, false); assert.equal(prepared.note.status, 'LOCKED');
  assert.equal(prepared.prepared.amount, state.operations.withdraw_source.statement.amount);
  assert.equal(prepared.prepared.recipient, state.operations.withdraw_source.statement.recipient);
  assert.equal(prepared.prepared.epoch, state.operations.withdraw_source.statement.epoch);
  assert.equal(prepared.prepared.submissionBound, false);
  const job = await f.owner.withdrawalWitness({ role: 'source' });
  await f.owner.bindSubmission({ kind: 'withdraw_source', calldata: calldata('withdrawal', job.publicInputs) });
  const submitted = await f.owner.preparationTerms({ kind: 'withdraw_source' });
  assert.equal(submitted.prepared.submissionBound, true); assert.equal(submitted.eligible, false);
});

test('owner-local terms use fresh observations, never silently renew epoch, and fail after owner close', async t => {
  const f = await setup(t);
  await f.owner.prepareDeposit({ amount: '50000', epoch: '10', exitRecipient: '34'.repeat(20) });
  f.current = snapshot(f.id, { timestamp: '6600', blockHash: h('new head') });
  const terms = await f.owner.preparationTerms({ kind: 'deposit' });
  assert.equal(terms.observed.timestamp, '6600'); assert.equal(terms.observed.blockHash, h('new head'));
  assert.equal(terms.prepared.epoch, '10');
  f.current = null; await assert.rejects(f.owner.preparationTerms({ kind: 'deposit' }));
  f.owner.close(); await assert.rejects(f.owner.preparationTerms({ kind: 'deposit' }), /UNAVAILABLE/);
});

test('ineligible source absence and alternate original deposit method cannot become new preparation', async t => {
  const f = await setup(t);
  for (const role of ['source', 'change', 'recovery']) {
    const value = await f.owner.preparationTerms({ kind: 'withdraw_' + role });
    assert.equal(value.note, null); assert.equal(value.prepared, null); assert.equal(value.eligible, false);
  }
  await f.owner.prepareDepositIntent({ amount: '50000', validFrom: '5900', validUntil: '6500', exitRecipient: '34'.repeat(20) });
  const value = await f.owner.preparationTerms({ kind: 'deposit' }); assert.equal(value.eligible, false); assert.equal(value.prepared, null);
});

test('private preparation projection rejects unsupported kinds and accessors without invocation', async t => {
  const f = await setup(t); let invoked = false;
  const value = {}; Object.defineProperty(value, 'kind', { get() { invoked = true; return 'deposit'; }, enumerable: true });
  await assert.rejects(f.owner.preparationTerms(value)); assert.equal(invoked, false);
  await assert.rejects(f.owner.preparationTerms({ kind: 'reservation' }), /MANUAL_KIND/);
  await assert.rejects(f.owner.preparationTerms({ kind: 'deposit', privateKey: 'fake' }));
});
