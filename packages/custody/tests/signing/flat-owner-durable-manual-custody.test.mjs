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
import { Vault } from '../../../engine/src/crypto/vault.mjs';
import { PrivateNoteTree, privateSpentDigest } from '../../../engine/src/notes/private-note-tree.mjs';
import { freshKey, signature } from '../../../engine/src/notes/private-note-encoding.mjs';
import { derivePrivateAssetIdentity } from '../../../engine/src/notes/private-asset-runtime.mjs';
import { nativeRecipientInvoiceMessage } from '../../../engine/src/execution/native/recipients/native-recipient-custody.mjs';
import { createCommitmentCodec } from '../../../backend/src/execution/encoding/commitments.mjs';
import { encodeStatement } from '../../../backend/src/execution/encoding/statements.mjs';
import { encodeDepositIntentInputs } from '../../../backend/src/execution/account/preparation/deposit-intent.mjs';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimIntentId, encodeClaimIngressInputs }
  from '../../../backend/src/claims/protocol/framing.mjs';
import { CLAIM_BACKING_FIELDS, claimActionDigest } from '../../../backend/src/claims/authorization/permits.mjs';
import { encodeNativeClaimIssueCall, decodeNativeClaimIssueCall } from '../../../backend/src/claims/protocol/issue-call.mjs';
import { assertOwnedNativeClaimIngressHandoff } from '../../src/processes/flat-owner-process.mjs';
import { encodeEvmVaultDeliveryCall, evmVaultDeliveryDescriptorCommitment }
  from '../../../backend/src/chains/evm/vault/evm-vault-delivery.mjs';
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


import { flatAccountAsset } from '../../../backend/src/accounts/authority/flat-account-validation.mjs';
function reviewed(f, { kind = 'TOP_UP', role = null, requestId = 'durable_manual_01', ref = h('manual reference'), epoch = '10' } = {}) {
  const asset = flatAccountAsset({ identity: f.id, chainId: '31337', genesis: h('genesis'), poolCodeHash: h('pool code') });
  return { request: { requestId, kind, ownerOperationRef: ref, assetId: asset.assetId }, kind,
    ownerKind: kind === 'TOP_UP' ? 'deposit' : 'withdraw_' + role,
    ownerIdentitySHA256: ownerDigest(f.id), accountIdentitySHA256: h('original account'), asset,
    epoch, amount: '50000', recipient: '34'.repeat(20), role, noteStatus: kind === 'TOP_UP' ? null : 'AVAILABLE',
    observed: { blockHash: f.current.blockHash, timestamp: f.current.timestamp },
    effect: kind === 'TOP_UP' ? 'CREATE_ORIGINAL_PRIVATE_DEPOSIT_PREPARATION' : 'LOCK_ORIGINAL_NOTE_FOR_FULL_WITHDRAWAL_PREPARATION',
    fundingApproval: 'EXISTING_EXACT_TOKEN_ALLOWANCE_REQUIRED_WHEN_APPLICABLE',
    registration: 'ORIGINAL_AUTHORITY_MAY_CREATE_RETAINED_TOKEN_DEPOSIT_WITNESS',
    spending: 'SEPARATE_ACCOUNT_PREPARE_AND_EXECUTE_REVIEW_REQUIRED' };
}
test('legacy custody reads remain byte-for-byte unchanged; extension binds exact terms before note creation', async t => {
  const f = await setup(t), before = await readFile(f.path), old = await f.state(), review = reviewed(f), checkpoints = [];
  assert.deepEqual(await f.owner.manualPreparations(null), { version: 1, records: [] });
  assert.deepEqual(await readFile(f.path), before); assert.equal(Object.hasOwn(await f.state(), 'manualPreparations'), false);
  f.checkpointHook = async cp => {
    if (cp.pending === null) checkpoints.push({ cp, state: await f.state() });
  };
  await f.owner.prepareManualPreparation({ review });
  assert.equal(checkpoints[0].state.notes.source, null); assert.deepEqual(checkpoints[0].state.operations, old.operations);
  assert.deepEqual(checkpoints[0].state.manualPreparations, { version: 1, records: [{ review, ownerState: 'LATCHED' }] });
  const prepared = await f.owner.manualPreparations(null);
  assert.deepEqual(prepared, { version: 1, records: [{ review, ownerState: 'PREPARED' }] });
  assert.equal(checkpoints[1].cp.acknowledged.revision, 2);
  await f.reopen(); assert.deepEqual(await f.owner.manualPreparations(null), prepared);
  assert.doesNotMatch(JSON.stringify(prepared), /"(?:privateKey[^"\n]*|opening|witness|commitment|secret|root)"\s*:/i);
  const current = await readFile(f.path); await f.owner.manualPreparations(null); await f.owner.preparationTerms({ kind: 'deposit' });
  assert.deepEqual(await readFile(f.path), current);
  await assert.rejects(f.owner.prepareManualPreparation({ review }), /MANUAL_ORIGINAL_ONLY/);
  await assert.rejects(f.owner.prepareDeposit({ amount: review.amount, epoch: review.epoch, exitRecipient: review.recipient }), /MANUAL_ORIGINAL_ONLY/);
  await assert.rejects(f.owner.renewEpoch({ kind: 'deposit', epoch: '11' }), /MANUAL_EPOCH_FIXED/);
});
for (const revision of [1, 2]) test('lost checkpoint reply at durable revision ' + revision + ' retains original without retry', async t => {
  const f = await setup(t), review = reviewed(f); let thrown = false;
  f.checkpointHook = async cp => {
    if (!thrown && cp.pending === null && cp.acknowledged.revision === revision) { thrown = true; throw Error('synthetic lost checkpoint ack'); }
  };
  await assert.rejects(f.owner.prepareManualPreparation({ review }), /WRITE_UNCERTAIN/);
  const stored = await f.state(); assert.deepEqual(stored.manualPreparations.records[0].review, review);
  assert.equal(stored.manualPreparations.records[0].ownerState, revision === 1 ? 'LATCHED' : 'PREPARED');
  assert.equal(Boolean(stored.notes.source), revision === 2);
  f.checkpointHook = async () => {}; await f.reopen();
  const bytes = await readFile(f.path), checkpoint = f.checkpoint;
  assert.deepEqual((await f.owner.manualPreparations(null)).records[0].review, review);
  await assert.rejects(f.owner.prepareManualPreparation({ review }), /MANUAL_ORIGINAL_ONLY/);
  await assert.rejects(f.owner.prepareManualPreparation({ review: { ...review, request: { ...review.request, requestId: 'replacement_01', ownerOperationRef: h('replacement') } } }), /MANUAL_ORIGINAL_ONLY/);
  assert.deepEqual(await readFile(f.path), bytes); assert.deepEqual(f.checkpoint, checkpoint);
});
test('missing pending candidate fails closed and preserves the exact old encrypted state', async t => {
  const f = await setup(t), before = await readFile(f.path), review = reviewed(f);
  f.checkpointHook = async cp => { if (cp.pending) throw Error('lost before encrypted candidate write'); };
  await assert.rejects(f.owner.prepareManualPreparation({ review }), /WRITE_UNCERTAIN/);
  assert.deepEqual(await readFile(f.path), before);
  f.checkpointHook = async () => {}; await assert.rejects(f.reopen());
  assert.deepEqual(await readFile(f.path), before);
});
test('EXIT preserves earlier operations, durable review precedes the original note lock', async t => {
  const f = await setup(t); await deposit(f); const old = await f.state(), review = reviewed(f, { kind: 'EXIT', role: 'source' });
  let latched;
  f.checkpointHook = async cp => { if (!cp.pending) { const value = await f.state(); if (value.manualPreparations?.records[0].ownerState === 'LATCHED') latched = value; } };
  await f.owner.prepareManualPreparation({ review });
  assert.equal(latched.notes.source.status, 'AVAILABLE'); assert.deepEqual(latched.operations, old.operations);
  const value = await f.state(); assert.equal(value.notes.source.status, 'LOCKED');
  assert.deepEqual(value.operations.deposit, old.operations.deposit); await f.reopen();
  assert.deepEqual((await f.owner.manualPreparations(null)).records[0].review, review);
});
for (const field of ['ownerIdentitySHA256', 'amount', 'recipient', 'epoch']) test('wrong reviewed EXIT ' + field + ' fails before durable binding', async t => {
  const f = await setup(t); await deposit(f); const review = reviewed(f, { kind: 'EXIT', role: 'source' });
  review[field] = field === 'ownerIdentitySHA256' ? h('wrong owner') : field === 'amount' ? '999' : field === 'recipient' ? '56'.repeat(20) : '11';
  const bytes = await readFile(f.path); await assert.rejects(f.owner.prepareManualPreparation({ review }));
  assert.deepEqual(await readFile(f.path), bytes);
});
for (const mutation of [
  state => { state.manualPreparations = { version: 3, records: [] }; },
  state => { state.manualPreparations = { version: 1, records: [], consent: true }; },
  state => { state.manualPreparations = null; },
  state => { state.unknownExtension = {}; },
]) test('authenticated unsupported schema is never migrated or overwritten', async t => {
  const f = await setup(t); f.owner.close();
  const record = await f.vault.read(f.password); const changed = await f.vault.update(f.password, record.revision, state => { mutation(state); return state; });
  const bytes = await readFile(f.path), cp = { version: 1, identitySHA256: ownerDigest(f.id),
    acknowledged: { revision: changed.revision, stateSHA256: ownerDigest(changed.data) }, pending: null };
  await assert.rejects(f.reopen(cp)); assert.deepEqual(await readFile(f.path), bytes);
});
test('legacy prepared notes cannot be relabelled with an invented manual request/reference', async t => {
  const f = await setup(t); await f.owner.prepareDeposit({ amount: '50000', epoch: '10', exitRecipient: '34'.repeat(20) });
  const bytes = await readFile(f.path); await assert.rejects(f.owner.prepareManualPreparation({ review: reviewed(f) }), /MANUAL_REVIEW_STALE/);
  assert.deepEqual(await readFile(f.path), bytes); assert.deepEqual(await f.owner.manualPreparations(null), { version: 1, records: [] });
});
