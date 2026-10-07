/** Focused custody boundaries only: explicit fake RPC records, fake proof bytes
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
function nativeConfig(f, key) {
  return { ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'].map(name => [name, f.id.domain[name]])),
    operationId: h('intent'), fundingNotBefore: '5900', fundingValidUntil: '6200', settleBefore: '6500',
    nodes: [{ id: 'native-leg', dependsOn: [], evidencePolicy: h('evidence'), actionTemplate: { chainDomain: h('chain'), signerIdentity: h('provider'),
      sourceCommitment: h('source'), destinationCommitment: h('destination'), amount: '9', custodyKind: 1, custodyCommitment: h('custody'),
      executionFrom: '6250', executionUntil: '6400' }, recipientOffer: { x: key.x.toString('hex'), y: key.y.toString('hex'), value: '20000',
      secret: h('payout-secret'), randomness: h('payout-randomness') } }] };
}

// Synthetic journal fixture only. These observations do not establish proof
// acceptance, native delivery, or an actual owner-absent execution.
async function detachedRecoveryFixture(t, { confirmReservation = true, withdrawChange = false, assetBinding = null } = {}) {
  const f = await setup(t, { assetBinding }); await deposit(f); const recipient = freshKey();
  await f.owner.prepareAuthorization({ nativeConfig: nativeConfig(f, recipient), changeRecipient: '56'.repeat(20), recoveryRecipient: '78'.repeat(20) });
  const [invoice] = await f.owner.invoiceRequests();
  await f.owner.authorize({ invoiceSignatures: [signature(recipient, nativeRecipientInvoiceMessage(invoice.invoice)).toString('hex')] });
  const state = await f.state(), original = state.authorization.signed.authorizationStatement, envelope = state.authorization.envelope.publicStatement;
  const before = flatOwnerSnapshot(f.current, f.id), tree = new PrivateNoteTree(before.commitments.concat([p(original.reserveCommitment), p(original.changeCommitment)]));
  const reservation = { ...envelope, inputRoot: before.publicState.root.slice(2), inputNullifier: original.inputNullifier,
    reserveCommitment: original.reserveCommitment, changeCommitment: original.changeCommitment,
    admissionTag: state.authorization.signed.admissionTag, fundingNotBefore: original.fundingNotBefore, fundingValidUntil: original.fundingValidUntil };
  await f.owner.bindSubmission({ kind: 'reservation', calldata: calldata('reservation', encodeStatement('reservation', reservation),
    encodeStatement('authorization', envelope), { expectedSequence: before.publicState.sequence, expectedPostRoot: tree.root }) });
  const funded = await f.success('reservation');
  if (confirmReservation) await f.owner.reconcile({ kind: 'reservation' });
  f.current = { ...funded.after, timestamp: '6600' };
  if (withdrawChange) {
    await f.owner.prepareWithdrawal({ role: 'change', epoch: '11' });
    const exit = await f.owner.withdrawalWitness({ role: 'change' });
    await f.owner.bindSubmission({ kind: 'withdraw_change', calldata: calldata('withdrawal', exit.publicInputs) });
    const spent = await f.success('withdraw_change'); await f.owner.reconcile({ kind: 'withdraw_change' }); f.current = spent.after;
  }
  const statement = { domainCommitment: f.id.domainCommitment, authorizationRoot: '0'.repeat(63) + '1', poolRoot: tree.root.slice(2),
    reserveNullifier: original.reserveNullifier, recoveryCommitment: original.recoveryCommitment, settleBefore: original.settleBefore };
  const data = calldata('recovery', encodeStatement('recovery', statement));
  const observed = await f.success('recovery', null, { statement, submission: { calldata: data } });
  const request = { transactionHash: observed.transaction.hash, calldataSHA256: createHash('sha256').update(Buffer.from(data.slice(2), 'hex')).digest('hex') };
  return { f, observed, request, statement, funded, original };
}

function editSnapshot(id, raw, updates) {
  const decoded = flatOwnerSnapshot(raw, id), s = decoded.publicState;
  return snapshot(id, { commitments: decoded.commitments, nullifiers: decoded.nullifiers, roots: decoded.roots,
    sequence: s.sequence, reservations: s.liveReservations, outputs: s.outputCapacity, backing: s.backedAmount,
    timestamp: raw.timestamp, blockHash: raw.blockHash, ...updates });
}

test('encrypted source precedes funding; exact cached deposit survives reopen and safe epoch renewal', async t => {
  const f = await setup(t); await f.owner.prepareDeposit({ amount: '50000', epoch: '10', exitRecipient: '34'.repeat(20) });
  const saved = await f.state(); assert.equal(saved.notes.source.status, 'UNISSUED'); assert.equal(saved.operations.deposit.witness, null);
  const text = await readFile(f.path, 'utf8'); assert.doesNotMatch(text, /PRIVATE KEY|privateKeyPem|exitRecipient|50000/);
  const first = await f.owner.depositWitness(); await f.reopen(); assert.deepEqual(await f.owner.depositWitness(), first);
  await assert.rejects(f.owner.prepareDeposit({ amount: '50000', epoch: '10', exitRecipient: '56'.repeat(20) }));
  f.current = snapshot(f.id, { timestamp: '6600' }); await f.owner.renewEpoch({ kind: 'deposit', epoch: '11' });
  const second = await f.owner.depositWitness(); assert.deepEqual(second.inputs.output, first.inputs.output);
  assert.deepEqual((await f.state()).notes, saved.notes); assert.equal(second.statement.epoch, '11');
  const data = calldata('deposit', second.publicInputs); assert.equal((await f.owner.bindSubmission({ kind: 'deposit', calldata: data })).dispatchAllowed, true);
  assert.equal((await f.owner.bindSubmission({ kind: 'deposit', calldata: data })).dispatchAllowed, false);
  f.current = snapshot(f.id, { timestamp: '7200' }); await assert.rejects(f.owner.renewEpoch({ kind: 'deposit', epoch: '12' }), /LATCHED/);
  assert.equal((await f.owner.reconcile({ kind: 'deposit' })).stage, 'UNKNOWN'); await f.reopen();
  assert.equal((await f.owner.reconcile({ kind: 'deposit' })).stage, 'UNKNOWN');
});

test('external invoice binding, exact notes/blinds and direct U survive reopen without leaking keys', async t => {
  const f = await setup(t); await deposit(f); const recipient = freshKey();
  const request = { nativeConfig: nativeConfig(f, recipient), changeRecipient: '56'.repeat(20), recoveryRecipient: '78'.repeat(20) };
  await f.owner.prepareAuthorization(request); const prepared = await f.state();
  assert.equal(prepared.notes.change.opening.value, '30000'); assert.equal(prepared.notes.recovery.opening.value, '20000');
  const [invoice] = await f.owner.invoiceRequests(), msg = nativeRecipientInvoiceMessage(invoice.invoice);
  await assert.rejects(f.owner.authorize({ invoiceSignatures: [signature(freshKey(), msg).toString('hex')] }), /RECIPIENT_SIGNATURE/);
  assert.equal((await f.state()).authorization.invoiceSignatures, null);
  const signatures = [signature(recipient, msg).toString('hex')]; await f.owner.authorize({ invoiceSignatures: signatures });
  const job = await f.owner.ownerProofJob(); assert.equal(job.publicInputs.length, 16); assert.ok(job.inputs.owner_witness);
  const local = await f.owner.selectRole({ role: 'local', slot: 0 }); const dependency = await f.owner.selectRole({ role: 'dependency', slot: 0 });
  assert.equal(local.dependency, undefined); assert.equal(dependency.action, undefined); assert.equal(dependency.receiptSpendSecret, undefined);
  assert.doesNotMatch(JSON.stringify([job, local, dependency]), /privateKeyPem|PRIVATE KEY/);
  await f.reopen(); await f.owner.prepareAuthorization(request); await f.owner.authorize({ invoiceSignatures: signatures });
  assert.deepEqual(await f.owner.ownerProofJob(), job); assert.equal(f.hashes, 1);
  const reopened = await f.state(); assert.deepEqual(reopened.notes, prepared.notes);
  assert.deepEqual(reopened.authorization.joinBlinds, prepared.authorization.joinBlinds);
  assert.deepEqual(reopened.authorization.leafBlinds, prepared.authorization.leafBlinds);
  await assert.rejects(f.owner.prepareAuthorization({ ...request, recoveryRecipient: '90'.repeat(20) }));
});

test('flat reservation/recovery reconcile exact notes; withdrawal destination and nullifier stay fixed', async t => {
  const f = await setup(t); await deposit(f); const recipient = freshKey();
  await f.owner.prepareAuthorization({ nativeConfig: nativeConfig(f, recipient), changeRecipient: '56'.repeat(20), recoveryRecipient: '78'.repeat(20) });
  const [invoice] = await f.owner.invoiceRequests(); await f.owner.authorize({ invoiceSignatures: [signature(recipient, nativeRecipientInvoiceMessage(invoice.invoice)).toString('hex')] });
  const state = await f.state(), a = state.authorization.signed.authorizationStatement, e = state.authorization.envelope.publicStatement;
  const before = flatOwnerSnapshot(f.current, f.id), tree = new PrivateNoteTree(before.commitments.concat([p(a.reserveCommitment), p(a.changeCommitment)]));
  const s = { ...e, inputRoot: before.publicState.root.slice(2), inputNullifier: a.inputNullifier, reserveCommitment: a.reserveCommitment,
    changeCommitment: a.changeCommitment, admissionTag: state.authorization.signed.admissionTag, fundingNotBefore: a.fundingNotBefore, fundingValidUntil: a.fundingValidUntil };
  const data = calldata('reservation', encodeStatement('reservation', s), encodeStatement('authorization', e), { expectedSequence: before.publicState.sequence, expectedPostRoot: tree.root });
  assert.equal(decodeFlatOwnerCalldata(artifact, data).publicInputs.length, 58);
  await f.owner.bindSubmission({ kind: 'reservation', calldata: data });
  await assert.rejects(f.owner.prepareWithdrawal({ role: 'source', epoch: '10' }), /RESERVATION_LATCHED/);
  const moved = { ...f.current, blockHash: h('empty-block'), canonicalBlockHashBefore: h('empty-block'), canonicalBlockHashAfter: h('empty-block') };
  let observed = await f.success('reservation', moved); await f.owner.reconcile({ kind: 'reservation' }); f.current = observed.after;
  await f.reopen(); const funded = await f.state(); assert.equal(funded.notes.source.status, 'SPENT'); assert.equal(funded.notes.change.status, 'AVAILABLE');
  f.current = { ...f.current, timestamp: '6600' };
  const fs = { domainCommitment: f.id.domainCommitment, authorizationRoot: '0'.repeat(63) + '1', poolRoot: tree.root.slice(2),
    reserveNullifier: a.reserveNullifier, recoveryCommitment: a.recoveryCommitment, settleBefore: a.settleBefore };
  await f.owner.bindSubmission({ kind: 'recovery', calldata: calldata('recovery', encodeStatement('recovery', fs)) });
  observed = await f.success('recovery'); await f.owner.reconcile({ kind: 'recovery' }); f.current = observed.after;
  await f.reopen(); await f.owner.prepareWithdrawal({ role: 'recovery', epoch: '11' }); const exit = await f.owner.withdrawalWitness({ role: 'recovery' });
  assert.equal(exit.statement.recipient, '78'.repeat(20)); assert.equal(exit.statement.amount, '20000');
  f.current = { ...f.current, timestamp: '7200' }; await f.owner.renewEpoch({ kind: 'withdraw_recovery', epoch: '12' });
  const renewed = await f.owner.withdrawalWitness({ role: 'recovery' }); assert.equal(renewed.statement.nullifier, exit.statement.nullifier);
  assert.equal(renewed.statement.recipient, exit.statement.recipient); assert.equal(renewed.statement.amount, exit.statement.amount);
  await f.owner.bindSubmission({ kind: 'withdraw_recovery', calldata: calldata('withdrawal', renewed.publicInputs) });
  observed = await f.success('withdraw_recovery'); const wrong = structuredClone(observed); wrong.withdrawal.recipient = '90'.repeat(20); f.observation = wrong;
  await assert.rejects(f.owner.reconcile({ kind: 'withdraw_recovery' })); f.observation = observed;
  assert.equal((await f.owner.reconcile({ kind: 'withdraw_recovery' })).stage, 'CONFIRMED');
  assert.equal((await f.state()).notes.recovery.status, 'WITHDRAWN');
});

test('abandoned authorization retains an exact source exit and handles an already-emitted S winning', async t => {
  const f = await setup(t); const deposited = await deposit(f), recipient = freshKey();
  const request = { nativeConfig: nativeConfig(f, recipient), changeRecipient: '56'.repeat(20), recoveryRecipient: '78'.repeat(20) };
  await f.owner.prepareAuthorization(request); const retained = await f.state();
  const [invoice] = await f.owner.invoiceRequests();
  await assert.rejects(f.owner.authorize({ invoiceSignatures: [signature(freshKey(), nativeRecipientInvoiceMessage(invoice.invoice)).toString('hex')] }), /RECIPIENT_SIGNATURE/);
  await f.owner.prepareWithdrawal({ role: 'source', epoch: '10' }); await f.reopen();
  const exit = await f.owner.withdrawalWitness({ role: 'source' });
  assert.equal(exit.statement.amount, deposited.statement.amount); assert.equal(exit.statement.recipient, retained.notes.source.recipient);
  assert.deepEqual((await f.state()).authorization, retained.authorization, 'cancellation retains the exact old graph and salts');
  await assert.rejects(f.owner.prepareAuthorization(request), /SOURCE_EXIT_CHOSEN/);
  await assert.rejects(f.owner.authorize({ invoiceSignatures: [] }), /SOURCE_EXIT_CHOSEN/);
  await assert.rejects(f.owner.ownerProofJob(), /SOURCE_EXIT_CHOSEN/);
  await assert.rejects(f.owner.selectRole({ role: 'local', slot: 0 }), /SOURCE_EXIT_CHOSEN/);
  await assert.rejects(f.owner.bindSubmission({ kind: 'reservation', calldata: '0x00' }), /SOURCE_EXIT_CHOSEN/);
  assert.equal((await f.state()).notes.source.status, 'LOCKED', 'choosing exit does not claim inclusion');
  await f.owner.bindSubmission({ kind: 'withdraw_source', calldata: calldata('withdrawal', exit.publicInputs) });
  await f.success('withdraw_source'); await f.owner.reconcile({ kind: 'withdraw_source' });
  assert.equal((await f.state()).notes.source.status, 'WITHDRAWN');

  // Separate fake-observation branch of the same race: U/S left before the
  // owner chose exit. An external sender already holding them can still win.
  const g = await setup(t); await deposit(g); const otherRecipient = freshKey();
  await g.owner.prepareAuthorization({ nativeConfig: nativeConfig(g, otherRecipient), changeRecipient: '56'.repeat(20), recoveryRecipient: '78'.repeat(20) });
  const [accepted] = await g.owner.invoiceRequests();
  await g.owner.authorize({ invoiceSignatures: [signature(otherRecipient, nativeRecipientInvoiceMessage(accepted.invoice)).toString('hex')] });
  const authorized = await g.state(), a = authorized.authorization.signed.authorizationStatement, e = authorized.authorization.envelope.publicStatement;
  const before = flatOwnerSnapshot(g.current, g.id), afterTree = new PrivateNoteTree(before.commitments.concat([p(a.reserveCommitment), p(a.changeCommitment)]));
  const statement = { ...e, inputRoot: before.publicState.root.slice(2), inputNullifier: a.inputNullifier, reserveCommitment: a.reserveCommitment,
    changeCommitment: a.changeCommitment, admissionTag: authorized.authorization.signed.admissionTag, fundingNotBefore: a.fundingNotBefore, fundingValidUntil: a.fundingValidUntil };
  const externalCall = calldata('reservation', encodeStatement('reservation', statement), encodeStatement('authorization', e),
    { expectedSequence: before.publicState.sequence, expectedPostRoot: afterTree.root });
  await g.owner.prepareWithdrawal({ role: 'source', epoch: '10' });
  const losingExit = await g.owner.withdrawalWitness({ role: 'source' }); assert.equal(losingExit.statement.nullifier, a.inputNullifier);
  await g.owner.bindSubmission({ kind: 'withdraw_source', calldata: calldata('withdrawal', losingExit.publicInputs) });
  const originalLatch = (await g.state()).operations.withdraw_source.submission;
  const observed = await g.success('reservation', null, { statement, submission: { calldata: externalCall } });
  const query = { transactionHash: observed.transaction.hash, calldataSHA256: createHash('sha256').update(Buffer.from(externalCall.slice(2), 'hex')).digest('hex') };
  const wrong = structuredClone(observed); wrong.stateAdvanced.root = p(h('wrong root')); g.observation = wrong;
  await assert.rejects(g.owner.reconcileCompetingReservation(query)); g.observation = observed;
  assert.equal((await g.owner.reconcileCompetingReservation(query)).sourceExit, 'RESERVATION_WON');
  assert.deepEqual((await g.state()).operations.withdraw_source.submission, originalLatch, 'never clear the losing submission latch');
  assert.equal((await g.state()).notes.source.status, 'SPENT'); assert.equal((await g.state()).notes.change.status, 'AVAILABLE');
  await g.reopen(); await assert.rejects(g.owner.withdrawalWitness({ role: 'source' }), /RESERVATION_WON/);
  await assert.rejects(g.owner.selectRole({ role: 'reservation' }), /SOURCE_EXIT_CHOSEN/);
  const recovery = await g.owner.selectRole({ role: 'recovery' }); assert.equal(recovery.recovery.value.recoveryCommitment, a.recoveryCommitment);
});

test('fake detached F credits the retained note after reopen, preserves every withdrawal latch and stays idempotent', async t => {
  const { f, observed, request } = await detachedRecoveryFixture(t);
  const before = await f.state(), retainedNote = structuredClone(before.notes.recovery);
  assert.equal(before.operations.recovery, undefined, 'no owner F bind or submission occurred');
  const reserved = await f.owner.privateSummary();
  assert.deepEqual(reserved.balances, { available: '30000', reserved: '20000', recovery: '0', locked: '0' });
  f.current = observed.after;
  const pending = await f.owner.privateSummary();
  assert.deepEqual(pending.balances, { available: '30000', reserved: '0', recovery: '0', locked: '0' });
  assert.equal(pending.notes.recovery.pendingReconciliation, true);
  assert.equal(pending.notes.recovery.available, false);
  await f.reopen();
  assert.deepEqual(await f.owner.reconcileRecovery(request), { kind: 'recovery', stage: 'CONFIRMED', dispatchAllowed: false, reconcileRequired: false });
  const credited = await f.state();
  assert.deepEqual(credited.notes.recovery, { ...retainedNote, status: 'AVAILABLE' });
  assert.deepEqual(credited.authorization, before.authorization);
  assert.equal(credited.operations.recovery.submission, null, 'observing external issuance never forges owner dispatch authorization');
  assert.equal(credited.operations.recovery.intent, null); assert.equal(credited.operations.recovery.witness, null);
  assert.deepEqual(f.queries.slice(-2).map(q => q.kind), ['reservation', 'recovery']);
  const privateView = await f.owner.privateSummary();
  assert.deepEqual(privateView.balances, { available: '50000', reserved: '0', recovery: '20000', locked: '0' });
  assert.doesNotMatch(JSON.stringify(privateView), /privateKey|PRIVATE KEY|secret|rho|witness|commitment|recipient|signature/i);
  const checkpoint = f.checkpoint; await f.owner.reconcileRecovery(request); assert.deepEqual(f.checkpoint, checkpoint);
  await assert.rejects(f.owner.reconcileRecovery({ ...request, transactionHash: h('different tx') }), /RECOVERY_REUSE/);
  await assert.rejects(f.owner.reconcileRecovery({ ...request, calldataSHA256: h('different data') }), /RECOVERY_REUSE/);
  await assert.rejects(f.owner.bindSubmission({ kind: 'recovery', calldata: observed.transaction.calldata }), /ALREADY_CONFIRMED/);

  await f.owner.prepareWithdrawal({ role: 'recovery', epoch: '11' });
  let withdrawal = (await f.state()).operations.withdraw_recovery;
  await f.owner.reconcileRecovery(request);
  assert.deepEqual((await f.state()).operations.withdraw_recovery, withdrawal, 'prepared withdrawal is retained');
  let view = await f.owner.privateSummary();
  assert.deepEqual(view.balances, { available: '30000', reserved: '0', recovery: '20000', locked: '20000' });
  const exit = await f.owner.withdrawalWitness({ role: 'recovery' });
  assert.equal(exit.statement.recipient, retainedNote.recipient); assert.equal(exit.statement.amount, retainedNote.opening.value);
  await f.owner.bindSubmission({ kind: 'withdraw_recovery', calldata: calldata('withdrawal', exit.publicInputs) });
  withdrawal = (await f.state()).operations.withdraw_recovery;
  await f.owner.reconcileRecovery(request);
  assert.deepEqual((await f.state()).operations.withdraw_recovery, withdrawal, 'submitted withdrawal is retained');
  await f.owner.reconcile({ kind: 'withdraw_recovery' });
  withdrawal = (await f.state()).operations.withdraw_recovery; assert.equal(withdrawal.stage, 'UNKNOWN');
  await f.reopen(); await f.owner.reconcileRecovery(request);
  assert.deepEqual((await f.state()).operations.withdraw_recovery, withdrawal, 'unknown withdrawal latch is retained');
  assert.equal((await f.state()).notes.recovery.status, 'LOCKED');
  const spent = await f.success('withdraw_recovery'); await f.owner.reconcile({ kind: 'withdraw_recovery' }); f.current = spent.after;
  const withdrawn = await f.state(); await f.owner.reconcileRecovery(request);
  assert.deepEqual(await f.state(), withdrawn, 'repeated old issuance cannot revive a withdrawn recovery');
  view = await f.owner.privateSummary();
  assert.deepEqual(view.balances, { available: '30000', reserved: '0', recovery: '0', locked: '0' });
});

test('fake detached F rejects non-exact provenance, roots, deadline and conservation without writing custody', async t => {
  const { f, observed, request, funded } = await detachedRecoveryFixture(t);
  const before = await f.state(), checkpoint = f.checkpoint;
  const changedStatement = (o, fields) => {
    const original = before.authorization.signed.authorizationStatement;
    const recovery = { domainCommitment: f.id.domainCommitment, authorizationRoot: '0'.repeat(63) + '1',
      poolRoot: flatOwnerSnapshot(funded.after, f.id).publicState.root.slice(2), reserveNullifier: original.reserveNullifier,
      recoveryCommitment: original.recoveryCommitment, settleBefore: original.settleBefore, ...fields };
    o.transaction.calldata = calldata('recovery', encodeStatement('recovery', recovery));
    return { ...request, calldataSHA256: createHash('sha256').update(Buffer.from(o.transaction.calldata.slice(2), 'hex')).digest('hex') };
  };
  const cases = [
    ['current leaf only', o => { delete o.before; }],
    ['wrong owner domain', o => { o.identitySHA256 = h('wrong identity'); }],
    ['wrong pool', o => { o.transaction.to = 'ab'.repeat(20); }],
    ['wrong transaction hash', o => { o.transaction.hash = h('wrong hash'); }],
    ['wrong calldata digest', o => { o.transaction.calldata = o.transaction.calldata.replace('c0ffee', 'c0ffef'); }],
    ['wrong D', o => changedStatement(o, { domainCommitment: '0'.repeat(63) + '2' })],
    ['wrong reservation nullifier', o => changedStatement(o, { reserveNullifier: h('wrong reserve') })],
    ['wrong recovery note', o => changedStatement(o, { recoveryCommitment: h('wrong recovery') })],
    ['changed original cutoff', o => changedStatement(o, { settleBefore: '6501' })],
    ['pool root predates original S', o => changedStatement(o, { poolRoot: flatOwnerSnapshot(funded.before, f.id).publicState.root.slice(2) })],
    ['unaccepted pool root', o => changedStatement(o, { poolRoot: h('unknown root') })],
    ['unaccepted authorization root', o => { o.recoveryRoots.rawAuthorizationRootHistory = words([p('0'.repeat(63) + '2'), ...Array(64).fill(p(ZERO))]); }],
    ['missing root evidence', o => { delete o.recoveryRoots; }],
    ['noncanonical authorization padding', o => { o.recoveryRoots.rawAuthorizationRootHistory = words([p('0'.repeat(63) + '1'), p(h('extra root')), ...Array(63).fill(p(ZERO))]); }],
    ['reverted receipt', o => { o.receipt.status = 0; }],
    ['noncanonical receipt block', o => { o.after.canonicalBlockHashAfter = h('reorg'); }],
    ['before cutoff', o => { o.before.timestamp = '6400'; o.after.timestamp = '6400'; }],
    ['backward timestamp', o => { o.after.timestamp = '6550'; }],
    ['backing changed', o => { o.after = editSnapshot(f.id, o.after, { backing: '49999' }); }],
    ['reservation not decremented', o => { o.after = editSnapshot(f.id, o.after, { reservations: 1 }); }],
    ['output slot not minted', o => { o.after = editSnapshot(f.id, o.after, { outputs: 1 }); }],
    ['missing original S prefix', o => { o.before = editSnapshot(f.id, o.before, { nullifiers: [] }); }],
    ['missing NF consumption', o => { o.after = editSnapshot(f.id, o.after, { nullifiers: flatOwnerSnapshot(o.before, f.id).nullifiers }); }],
    ['wrong state event', o => { o.stateAdvanced.root = p(h('wrong event')); }],
  ];
  for (const [label, mutate] of cases) {
    const wrong = structuredClone(observed), changedRequest = mutate(wrong); f.observation = wrong;
    await assert.rejects(f.owner.reconcileRecovery(changedRequest ?? request), undefined, label);
    assert.deepEqual(f.checkpoint, checkpoint, label + ' must not write');
  }
  f.observation = null; await assert.rejects(f.owner.reconcileRecovery(request), /RECOVERY_UNOBSERVED/);
  f.observation = observed;
  f.observations.delete('reservation'); await assert.rejects(f.owner.reconcileRecovery(request), /RECOVERY_SOURCE_UNOBSERVED/);
  const badSource = structuredClone(funded); badSource.stateAdvanced.sequence = '999'; f.observations.set('reservation', badSource);
  await assert.rejects(f.owner.reconcileRecovery(request));
  f.observations.set('reservation', funded);
  assert.deepEqual(await f.state(), before); assert.deepEqual(f.checkpoint, checkpoint);
  await f.owner.reconcileRecovery(request); assert.equal((await f.state()).notes.recovery.status, 'AVAILABLE');
  const committed = f.checkpoint, changed = structuredClone(observed);
  changed.before.blockHash = changed.before.canonicalBlockHashBefore = changed.before.canonicalBlockHashAfter = h('changed original observation');
  f.observation = changed; await assert.rejects(f.owner.reconcileRecovery(request)); assert.deepEqual(f.checkpoint, committed);
  f.current = funded.after; await assert.rejects(f.owner.privateSummary(), /STALE_OBSERVATION/, 'a pre-credit snapshot is stale');
  f.current = null; await assert.rejects(f.owner.privateSummary(), undefined, 'unknown snapshot must not return a successful zero balance');
});

test('fake detached F cannot credit before original reservation reconciliation', async t => {
  const { f, observed, request, funded } = await detachedRecoveryFixture(t, { confirmReservation: false });
  const before = await f.state(); assert.equal(before.operations.reservation.stage, 'SUBMITTING');
  f.current = observed.after;
  await assert.rejects(f.owner.reconcileRecovery(request), /RECOVERY_SOURCE_UNCONFIRMED/);
  assert.deepEqual(await f.state(), before);
  f.observations.delete('reservation'); await f.owner.reconcile({ kind: 'reservation' });
  const unknown = await f.state(); assert.equal(unknown.operations.reservation.stage, 'UNKNOWN');
  await assert.rejects(f.owner.reconcileRecovery(request), /RECOVERY_SOURCE_UNCONFIRMED/);
  assert.deepEqual(await f.state(), unknown, 'unknown original submission remains latched');
  f.observations.set('reservation', funded); await f.owner.reconcile({ kind: 'reservation' });
  await f.owner.reconcileRecovery(request); assert.equal((await f.state()).notes.recovery.status, 'AVAILABLE');
});

test('fake detached F permits an intervening exact change exit and conserves remaining backing', async t => {
  const { f, observed, request } = await detachedRecoveryFixture(t, { withdrawChange: true });
  const before = await f.state(); assert.equal(before.notes.change.status, 'WITHDRAWN');
  assert.equal(flatOwnerSnapshot(observed.before, f.id).publicState.backedAmount, '20000');
  f.current = observed.after; await f.reopen(); await f.owner.reconcileRecovery(request);
  const after = await f.state();
  assert.deepEqual(after.notes.source, before.notes.source); assert.deepEqual(after.notes.change, before.notes.change);
  assert.deepEqual(after.operations.withdraw_change, before.operations.withdraw_change);
  assert.deepEqual(after.notes.recovery, { ...before.notes.recovery, status: 'AVAILABLE' });
  assert.deepEqual((await f.owner.privateSummary()).balances, { available: '20000', reserved: '0', recovery: '20000', locked: '0' });
});

test('native identity remains exact; token identity requires its immutable asset binding', () => {
  const domain = Object.fromEntries(['scope', 'policy', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace']
    .map(key => [key, h(key)]));
  domain.ledgerNamespace = domain.hubDomain;
  domain.asset = derivePrivateAssetIdentity(31337, p('0'.repeat(40)), p(ZERO)).slice(2);
  const native = { pool: '12'.repeat(20), domain, domainCommitment: '0'.repeat(63) + '1' };
  assert.deepEqual(flatOwnerIdentity(native), native);
  assert.equal(ownerDigest(flatOwnerIdentity(native)), ownerDigest(native), 'native fields and digest stay unchanged');
  const token = { ...structuredClone(native), assetBinding: structuredClone(TOKEN) };
  token.domain.asset = derivePrivateAssetIdentity(31337, p(TOKEN.token), p(TOKEN.codeHash)).slice(2);
  assert.deepEqual(flatOwnerIdentity(token), token);
  assert.notEqual(ownerDigest(token), ownerDigest(native));
  const missing = structuredClone(token); delete missing.assetBinding;
  assert.throws(() => flatOwnerIdentity(missing), /ASSET_DOMAIN/, 'stripping binding cannot reclassify a token as native');
  assert.throws(() => flatOwnerIdentity({ ...native, assetBinding: TOKEN }), /ASSET_DOMAIN/);
  for (const binding of [{ ...TOKEN, token: 'bc'.repeat(20) }, { ...TOKEN, codeHash: h('other code') },
    { ...TOKEN, token: '0'.repeat(40) }, { ...TOKEN, codeHash: ZERO }, { ...TOKEN, kind: 'ERC20' }]) {
    assert.throws(() => flatOwnerIdentity({ ...token, assetBinding: binding }));
  }
});

test('fake token D26/W39 requires exact historical balances, asset, participant and zero native value', async t => {
  const f = await setup(t, { assetBinding: TOKEN });
  await f.owner.prepareDeposit({ amount: '50000', epoch: '10', exitRecipient: '34'.repeat(20) });
  const job = await f.owner.depositWitness(); assert.equal(job.publicInputs.length, 26);
  await f.owner.bindSubmission({ kind: 'deposit', calldata: calldata('deposit', job.publicInputs) });
  const deposited = await f.success('deposit'), checkpoint = f.checkpoint;
  const cases = [
    ['missing observation', o => { delete o.assetObservation; }],
    ['native observation type', o => { o.assetObservation.kind = 'NATIVE'; }],
    ['wrong token', o => { o.assetObservation.token = 'bc'.repeat(20); }],
    ['wrong pinned code', o => { o.assetObservation.codeHash = h('other code'); }],
    ['wrong pool', o => { o.assetObservation.pool = 'bc'.repeat(20); }],
    ['missing sender', o => { delete o.transaction.from; }],
    ['wrong depositor', o => { o.assetObservation.participant = 'bc'.repeat(20); }],
    ['recipient instead of sender', o => { o.assetObservation.participantRole = 'RECIPIENT'; }],
    ['wrong historical parent', o => { o.assetObservation.before.blockHash = h('other parent'); }],
    ['wrong historical receipt', o => { o.assetObservation.after.blockHash = h('other receipt'); }],
    ['pool balance disagrees with backing', o => { o.assetObservation.after.poolBalance = '49999'; }],
    ['no independent sender debit', o => { o.assetObservation.after.participantBalance = '1000000'; }],
    ['fee on sender debit', o => { o.assetObservation.after.participantBalance = '949999'; }],
    ['noncanonical balance', o => { o.assetObservation.before.participantBalance = '01000000'; }],
    ['out of uint256 balance', o => { o.assetObservation.before.participantBalance = String(1n << 256n); }],
    ['native value added', o => { o.transaction.value = '50000'; }],
    ['events without asset evidence', o => { delete o.assetObservation.before; }],
  ];
  for (const [label, mutate] of cases) {
    const wrong = structuredClone(deposited); mutate(wrong); f.observation = wrong;
    await assert.rejects(f.owner.reconcile({ kind: 'deposit' }), undefined, label);
    assert.deepEqual(f.checkpoint, checkpoint, label + ' must not credit or write');
  }
  const state = await f.state(), otherState = structuredClone(state), other = { ...TOKEN, token: 'cd'.repeat(20) };
  otherState.identity.assetBinding = other;
  otherState.identity.domain.asset = derivePrivateAssetIdentity(31337, p(other.token), p(other.codeHash)).slice(2);
  const rebound = structuredClone(deposited), otherDigest = ownerDigest(otherState.identity);
  rebound.identitySHA256 = rebound.before.identitySHA256 = rebound.after.identitySHA256 = otherDigest;
  assert.throws(() => validateFlatOwnerTransition(rebound, state.operations.deposit, otherState, artifact), /ASSET_TOKEN/);
  const nativeState = structuredClone(state); delete nativeState.identity.assetBinding;
  nativeState.identity.domain.asset = derivePrivateAssetIdentity(31337, p('0'.repeat(40)), p(ZERO)).slice(2);
  const nativeDigest = ownerDigest(nativeState.identity), nativeRecord = structuredClone(deposited);
  nativeRecord.identitySHA256 = nativeRecord.before.identitySHA256 = nativeRecord.after.identitySHA256 = nativeDigest;
  nativeRecord.transaction.value = '50000';
  assert.throws(() => validateFlatOwnerTransition(nativeRecord, state.operations.deposit, nativeState, artifact), /EXACT_FIELDS/);

  f.observation = deposited; await f.owner.reconcile({ kind: 'deposit' }); f.current = deposited.after;
  assert.equal((await f.state()).operations.deposit.confirmation.assetObservationSHA256, ownerDigest(deposited.assetObservation));
  assert.deepEqual((await f.owner.privateSummary()).balances, { available: '50000', reserved: '0', recovery: '0', locked: '0' });
  await f.reopen(); assert.deepEqual((await f.state()).identity.assetBinding, TOKEN);
  const altered = structuredClone(deposited);
  altered.assetObservation.before.participantBalance = '1000001'; altered.assetObservation.after.participantBalance = '950001';
  f.observation = altered;
  await assert.rejects(f.owner.reconcile({ kind: 'deposit' }), /BINDING/, 'confirmed token observation remains exact');
  f.observation = deposited;

  await f.owner.prepareWithdrawal({ role: 'source', epoch: '10' });
  const exit = await f.owner.withdrawalWitness({ role: 'source' }); assert.equal(exit.publicInputs.length, 39);
  await f.owner.bindSubmission({ kind: 'withdraw_source', calldata: calldata('withdrawal', exit.publicInputs) });
  const withdrawn = await f.success('withdraw_source'), withdrawalCheckpoint = f.checkpoint;
  for (const [label, mutate] of [
    ['missing recipient credit', o => { o.assetObservation.after.participantBalance = '1000000'; }],
    ['recipient transfer fee', o => { o.assetObservation.after.participantBalance = '1049999'; }],
    ['wrong credited recipient', o => { o.assetObservation.participant = SENDER; }],
    ['wrong withdrawal amount', o => { o.withdrawal.amount = '49999'; }],
    ['wrong token', o => { o.assetObservation.token = 'bc'.repeat(20); }],
    ['nonzero native value', o => { o.transaction.value = '1'; }],
  ]) {
    const wrong = structuredClone(withdrawn); mutate(wrong); f.observation = wrong;
    await assert.rejects(f.owner.reconcile({ kind: 'withdraw_source' }), undefined, label);
    assert.deepEqual(f.checkpoint, withdrawalCheckpoint, label + ' must not write');
  }
  f.observation = withdrawn; await f.owner.reconcile({ kind: 'withdraw_source' }); f.current = withdrawn.after;
  assert.equal((await f.state()).notes.source.status, 'WITHDRAWN');
  assert.deepEqual((await f.owner.privateSummary()).balances, { available: '0', reserved: '0', recovery: '0', locked: '0' });
});

test('fake token S58/F41 requires zero asset movement and retains exact recovery provenance', async t => {
  const { f, observed, request, funded } = await detachedRecoveryFixture(t, { assetBinding: TOKEN });
  const state = await f.state(), checkpoint = f.checkpoint;
  assert.deepEqual(funded.assetObservation.before.poolBalance, funded.assetObservation.after.poolBalance);
  for (const phase of ['reservation', 'recovery']) {
    const original = phase === 'reservation' ? funded : observed;
    for (const [label, mutate] of [
      ['missing asset evidence', o => { delete o.assetObservation; }],
      ['sender token movement', o => { o.assetObservation.after.participantBalance = '999999'; }],
      ['pool token movement', o => { o.assetObservation.after.poolBalance = '49999'; }],
      ['native value movement', o => { o.transaction.value = '1'; }],
      ['different token', o => { o.assetObservation.token = 'bc'.repeat(20); }],
    ]) {
      const wrong = structuredClone(original); mutate(wrong);
      if (phase === 'reservation') f.observations.set('reservation', wrong);
      else f.observation = wrong;
      await assert.rejects(f.owner.reconcileRecovery(request), undefined, phase + ': ' + label);
      assert.deepEqual(f.checkpoint, checkpoint, 'rejected observation must not credit recovery');
      f.observations.set('reservation', funded); f.observation = observed;
    }
  }
  assert.deepEqual(await f.state(), state);
  f.current = observed.after; await f.owner.reconcileRecovery(request);
  assert.equal((await f.state()).notes.recovery.status, 'AVAILABLE');
  assert.equal((await f.state()).operations.recovery.confirmation.assetObservationSHA256, ownerDigest(observed.assetObservation));
  assert.deepEqual((await f.owner.privateSummary()).balances, { available: '50000', reserved: '0', recovery: '20000', locked: '0' });
});

// Explicit synthetic D27/atomic-router records. This never runs a proof, child,
// RPC runtime or transaction, and never grants a fabricated observer brand.
async function intentFixture(t) {
  const f = await setup(t, { assetBinding: TOKEN });
  const request = { amount: '50000', validFrom: '6050', validUntil: '7000', exitRecipient: '34'.repeat(20) };
  await f.owner.prepareDepositIntent(request);
  const job = await f.owner.depositIntentProofJob();
  const proof = { proof: 'c0ffee', publicInputs: job.publicInputs, evidence: { kind: 'EXPLICIT_SYNTHETIC_PROOF_NOT_VALIDATED' } };
  await f.owner.retainDepositIntentProof(proof);
  const identity = { chainId: '31337', genesisHash: h('evm genesis'), ledgerNamespace: f.id.domain.ledgerNamespace,
    adapterVersion: '1', router: 'ba'.repeat(20), routerCodeSHA256: h('router runtime'), routerVersion: '1',
    solver: SENDER, asset: 'cd'.repeat(20), assetCodeSHA256: h('underlying runtime'), assetIdentity: h('underlying identity'),
    vault: TOKEN.token, vaultCodeSHA256: h('vault runtime'), shareIdentity: f.id.domain.asset,
    vaultDomain: h('vault domain'), vaultRuntimeId: h('vault runtime id'), targetPool: f.id.pool,
    targetPoolCodeSHA256: h('pool runtime'), targetDomain: f.id.domainCommitment,
    targetScope: f.id.domain.scope, targetPolicy: f.id.domain.policy };
  const descriptor = { identity, route: { assetAmount: '70000', shareAmount: request.amount,
    executionFrom: '6100', executionUntil: '6900' }, publicInputs: job.publicInputs.map(word) };
  const receiptKeyCommitment = h('delivery key'), descriptorCommitment = evmVaultDeliveryDescriptorCommitment(descriptor);
  const data = encodeEvmVaultDeliveryCall({ descriptor, receiptKeyCommitment, proof: proof.proof });
  const before = structuredClone(f.current), b = flatOwnerSnapshot(before, f.id), commitments = [p(job.statement.output)];
  const root = new PrivateNoteTree(commitments).root;
  const after = snapshot(f.id, { commitments, sequence: '1', outputs: 1, backing: request.amount,
    roots: b.roots.concat(root), timestamp: '6500' });
  const a = flatOwnerSnapshot(after, f.id).publicState, tx = h('owned outer router transaction');
  const observation = { identitySHA256: ownerDigest(f.id), transaction: { hash: tx, from: SENDER, to: identity.router,
    value: '0', calldata: data }, receipt: { transactionHash: tx, blockHash: after.blockHash, status: 1 }, before, after,
    stateAdvanced: { address: f.id.pool, transactionHash: tx, blockHash: after.blockHash,
      sequence: '1', root, spent: a.spentDigest, leaves: 1, consumed: 0 },
    delivery: { descriptor, descriptorCommitment, receiptKeyCommitment, publicInputs: job.publicInputs },
    deliveryEvent: { address: identity.router, transactionHash: tx, blockHash: after.blockHash, position: 0,
      ledgerNamespace: identity.ledgerNamespace, receiptKeyCommitment, descriptorCommitment,
      outputCommitment: job.statement.output, shareAmount: request.amount },
    assetObservation: { kind: 'EVM_VAULT_DELIVERY', token: TOKEN.token, codeHash: TOKEN.codeHash, pool: f.id.pool,
      underlyingToken: identity.asset, underlyingCodeSHA256: identity.assetCodeSHA256, vault: identity.vault,
      router: identity.router, solver: identity.solver, underlyingAmount: '70000', shareAmount: request.amount,
      before: { blockHash: before.blockHash, poolBalance: '0', shareTotalSupply: '100000', vaultUnderlyingBalance: '200000',
        solverUnderlyingBalance: '90000', routerUnderlyingBalance: '4', routerShareBalance: '7' },
      after: { blockHash: after.blockHash, poolBalance: request.amount, shareTotalSupply: '150000', vaultUnderlyingBalance: '270000',
        solverUnderlyingBalance: '20000', routerUnderlyingBalance: '4', routerShareBalance: '7' } } };
  const inclusion = { transactionHash: tx, calldataSHA256: createHash('sha256').update(Buffer.from(data.slice(2), 'hex')).digest('hex') };
  f.deliveryObservation = observation;
  return { f, request, job, proof, observation, inclusion };
}

test('D27 retains original type4 custody and signature before proof, fixes the complete absolute intent, and caches proof across restart', async t => {
  const f = await setup(t, { assetBinding: TOKEN });
  const request = { amount: '50000', validFrom: '6050', validUntil: '7000', exitRecipient: '34'.repeat(20) };
  await f.owner.prepareDepositIntent(request);
  const before = await f.state(), note = before.notes.source;
  assert.equal(note.opening.type, 4); assert.equal(note.status, 'UNISSUED');
  assert.equal(before.operations.deposit_intent.witness, null); assert.equal(before.operations.deposit_intent.intent, null);
  assert.equal(before.operations.deposit_intent.proof, null);
  const text = await readFile(f.path, 'utf8'); assert.doesNotMatch(text, /PRIVATE KEY|privateKeyPem|50000/);
  const job = await f.owner.depositIntentProofJob(); assert.equal(job.publicInputs.length, 27);
  assert.equal(job.statement.output, note.commitment); assert.deepEqual(job.publicInputs, encodeDepositIntentInputs(job.statement));
  assert.doesNotMatch(JSON.stringify(job), /privateKeyPem|PRIVATE KEY/);
  const signed = await f.state(); assert.ok(signed.operations.deposit_intent.intent);
  assert.equal(signed.operations.deposit_intent.stage, 'AUTHORIZED'); assert.deepEqual(signed.notes.source, note);
  await f.reopen(); assert.deepEqual(await f.owner.depositIntentProofJob(), job);
  await f.owner.prepareDepositIntent(request);
  for (const update of [{ amount: '50001' }, { validFrom: '6000' }, { validUntil: '8000' }, { exitRecipient: '56'.repeat(20) }])
    await assert.rejects(f.owner.prepareDepositIntent({ ...request, ...update }), /INTENT_FIXED/);
  await assert.rejects(f.owner.prepareDeposit({ amount: request.amount, epoch: '10', exitRecipient: request.exitRecipient }), /FUNDING_METHOD_FIXED/);
  await assert.rejects(f.owner.renewEpoch({ kind: 'deposit_intent', epoch: '11' }));
  await assert.rejects(f.owner.bindSubmission({ kind: 'deposit_intent', calldata: calldata('deposit_intent', job.publicInputs) }), /DELIVERY_METHOD_REQUIRED/);
  await assert.rejects(f.owner.bindDepositIntentDelivery({ transactionHash: h('unproved'), calldataSHA256: h('unproved call') }), /PROOF_REQUIRED/);
  const proof = { proof: 'c0ffee', publicInputs: job.publicInputs, evidence: { kind: 'SYNTHETIC' } };
  await f.owner.retainDepositIntentProof(proof); await f.reopen();
  assert.deepEqual(await f.owner.depositIntentProofJob(), { proofResult: proof });
  await assert.rejects(f.owner.retainDepositIntentProof({ ...proof, proof: 'c0ffef' }), /BINDING/);
  const latch = { transactionHash: h('signed outer transaction'), calldataSHA256: h('outer call') };
  await f.owner.bindDepositIntentDelivery(latch);
  assert.equal((await f.owner.reconcileDepositIntent(latch)).stage, 'UNKNOWN'); await f.reopen();
  assert.equal((await f.owner.reconcileDepositIntent(latch)).stage, 'UNKNOWN');
  await assert.rejects(f.owner.bindDepositIntentDelivery({ ...latch, transactionHash: h('other transaction') }), /BINDING/);
  await assert.rejects(f.owner.reconcileDepositIntent({ ...latch, calldataSHA256: h('other call') }), /BINDING/);
  assert.deepEqual((await f.state()).notes.source, note);
});

test('synthetic exact nested D27 arrival credits once independently of source settlement/refund and retains W39 exit', async t => {
  const { f, observation, inclusion } = await intentFixture(t), before = await f.state();
  assert.equal(before.authorization, null); assert.equal(before.operations.reservation, undefined);
  f.current = observation.after;
  assert.equal((await f.owner.privateSummary()).notes.source.pendingReconciliation, true);
  assert.equal((await f.owner.privateSummary()).balances.available, '0');
  await f.reopen(); await f.owner.reconcileDepositIntent(inclusion);
  const credited = await f.state(), cp = f.checkpoint;
  assert.deepEqual(credited.notes.source, { ...before.notes.source, status: 'AVAILABLE' });
  assert.deepEqual(credited.authorization, before.authorization);
  assert.deepEqual(credited.operations.deposit_intent.submission, inclusion);
  assert.equal((await f.owner.privateSummary()).balances.available, '50000');
  await f.owner.reconcileDepositIntent(inclusion); assert.deepEqual(f.checkpoint, cp);
  const query = f.queries.at(-1);
  assert.deepEqual(Object.keys(query).sort(), ['calldataSHA256', 'identitySHA256', 'publicInputs', 'transactionHash']);
  assert.doesNotMatch(JSON.stringify(query), /secret|rho|key_x|signature|privateKey/);
  await assert.rejects(f.owner.reconcileDepositIntent({ ...inclusion, transactionHash: h('replacement outer tx') }), /BINDING/);
  await assert.rejects(f.owner.prepareDepositIntent({ amount: '50000', validFrom: '7000', validUntil: '8000',
    exitRecipient: before.notes.source.recipient }), /INTENT_FIXED/);
  await f.owner.prepareWithdrawal({ role: 'source', epoch: '10' });
  const exit = await f.owner.withdrawalWitness({ role: 'source' });
  assert.equal(exit.publicInputs.length, 39); assert.equal(exit.statement.recipient, before.notes.source.recipient);
  const locked = await f.state(); await f.owner.reconcileDepositIntent(inclusion);
  assert.deepEqual(await f.state(), locked, 'old arrival cannot unlock a prepared exit');
  await f.owner.bindSubmission({ kind: 'withdraw_source', calldata: calldata('withdrawal', exit.publicInputs) });
  const withdrawn = await f.success('withdraw_source'); await f.owner.reconcile({ kind: 'withdraw_source' });
  f.current = withdrawn.after; await f.reopen(); const ended = await f.state();
  await f.owner.reconcileDepositIntent(inclusion); assert.deepEqual(await f.state(), ended);
  assert.equal(ended.notes.source.status, 'WITHDRAWN'); assert.equal((await f.owner.privateSummary()).balances.available, '0');
});

test('synthetic D27 nested credit rejects substitutions, deadline violations and incomplete vault/pool deltas without writes', async t => {
  const { f, observation, inclusion } = await intentFixture(t), state = await f.state(), cp = f.checkpoint;
  const reencode = (o, mutate, proof = state.operations.deposit_intent.proof.proof) => {
    mutate(o.delivery.descriptor);
    o.delivery.descriptorCommitment = evmVaultDeliveryDescriptorCommitment(o.delivery.descriptor);
    o.delivery.publicInputs = o.delivery.descriptor.publicInputs.map(value => BigInt('0x' + value).toString());
    o.transaction.calldata = encodeEvmVaultDeliveryCall({ descriptor: o.delivery.descriptor,
      receiptKeyCommitment: o.delivery.receiptKeyCommitment, proof });
    return { ...inclusion, calldataSHA256: createHash('sha256').update(Buffer.from(o.transaction.calldata.slice(2), 'hex')).digest('hex') };
  };
  const mutations = [
    ['wrong identity', o => { o.identitySHA256 = h('other owner'); }],
    ['wrong transaction', o => { o.transaction.hash = h('other transaction'); }],
    ['wrong router', o => { o.transaction.to = 'bb'.repeat(20); }],
    ['wrong solver', o => { o.transaction.from = 'bb'.repeat(20); }],
    ['native value', o => { o.transaction.value = '1'; }],
    ['altered outer bytes', o => { o.transaction.calldata += '00'; }],
    ['failed receipt', o => { o.receipt.status = 0; }],
    ['descriptor changed', o => { o.delivery.descriptor.route.assetAmount = '70001'; }],
    ['different output', o => { o.delivery.publicInputs[19] = '1'; }],
    ['well-formed replacement output', o => reencode(o, d => { d.publicInputs[19] = word(1); })],
    ['well-formed replacement amount', o => reencode(o, d => { d.route.shareAmount = '50001'; d.publicInputs[18] = word(50001); })],
    ['well-formed earlier intent start', o => reencode(o, d => { d.publicInputs[16] = word(6000); })],
    ['well-formed extended intent end', o => reencode(o, d => { d.publicInputs[17] = word(8000); })],
    ['well-formed replacement pool', o => reencode(o, d => { d.identity.targetPool = 'dc'.repeat(20); })],
    ['well-formed replacement domain', o => reencode(o, d => { d.identity.targetDomain = h('another pool domain'); })],
    ['well-formed replacement proof', o => reencode(o, () => {}, 'c0ffef')],
    ['wrong K', o => { o.delivery.receiptKeyCommitment = h('other K'); }],
    ['wrong event position', o => { o.deliveryEvent.position = 1; }],
    ['wrong event Q', o => { o.deliveryEvent.outputCommitment = h('other output'); }],
    ['missing event', o => { delete o.deliveryEvent; }],
    ['missing descriptor', o => { delete o.delivery; }],
    ['missing token observation', o => { delete o.assetObservation; }],
    ['wrong token', o => { o.assetObservation.token = 'bc'.repeat(20); }],
    ['wrong code', o => { o.assetObservation.codeHash = h('other runtime'); }],
    ['wrong historic block', o => { o.assetObservation.before.blockHash = h('other historical block'); }],
    ['missing supply mint', o => { o.assetObservation.after.shareTotalSupply = '100000'; }],
    ['missing vault funding', o => { o.assetObservation.after.vaultUnderlyingBalance = '200000'; }],
    ['missing solver debit', o => { o.assetObservation.after.solverUnderlyingBalance = '90000'; }],
    ['invented router share debit', o => { o.assetObservation.before.routerShareBalance = '50007'; }],
    ['retained router asset surplus', o => { o.assetObservation.after.routerUnderlyingBalance = '5'; }],
    ['pool receipt off by one', o => { o.assetObservation.after.poolBalance = '49999'; }],
    ['wrong state event', o => { o.stateAdvanced.leaves = 2; }],
    ['expired absolute interval', o => { o.after.timestamp = '7000'; }],
    ['expired route interval', o => { o.after.timestamp = '6900'; }],
    ['too early route', o => { o.after.timestamp = '6099'; }],
    ['wrong capacity', o => { o.after = editSnapshot(f.id, o.after, { outputs: 0 }); }],
    ['wrong backing', o => { o.after = editSnapshot(f.id, o.after, { backing: '49999' }); }],
    ['changed reservation count', o => { o.after = editSnapshot(f.id, o.after, { reservations: 1 }); }],
    ['changed nullifier ledger', o => { o.after = editSnapshot(f.id, o.after, { nullifiers: [p(h('extra spend'))] }); }],
    ['reorged state', o => { o.after.canonicalBlockHashAfter = h('new canonical block'); }],
  ];
  for (const [label, change] of mutations) {
    const wrong = structuredClone(observation), changedInclusion = change(wrong); f.deliveryObservation = wrong;
    await assert.rejects(f.owner.reconcileDepositIntent(changedInclusion ?? inclusion), undefined, label);
    assert.deepEqual(f.checkpoint, cp, label + ' must not write');
  }
  assert.deepEqual(await f.state(), state);
  assert.throws(() => validateFlatOwnerTransition(observation, state.operations.deposit_intent, state, artifact, inclusion),
    /DELIVERY_METHOD_REQUIRED/, 'the direct observer/ledger path never accepts nested calldata');
  const wrongState = structuredClone(state); wrongState.notes.source.commitment = h('replacement custody note');
  assert.throws(() => validateFlatOwnerDepositIntentTransition(observation, state.operations.deposit_intent, wrongState, inclusion), /INTENT_NOTE/);
  f.deliveryObservation = observation; await f.owner.reconcileDepositIntent(inclusion);
  const accepted = f.checkpoint, changed = structuredClone(observation);
  changed.assetObservation.before.routerShareBalance = '8'; changed.assetObservation.after.routerShareBalance = '8';
  f.deliveryObservation = changed;
  await assert.rejects(f.owner.reconcileDepositIntent(inclusion), /BINDING/, 'same net deltas cannot replace retained historical evidence');
  assert.deepEqual(f.checkpoint, accepted);
});

// These fixtures model authenticated owner-observer responses only. They do not
// claim genuine D27 proofs, gateway acceptance, bytepin ownership or finality.
function nativeClaimObservation(f, packet, submission = null) {
  return { identitySHA256: ownerDigest(f.id), claimDomain: packet.claimDomain,
    intentIdentitySHA256: packet.intentIdentitySHA256, handoffIdentitySHA256: packet.handoffIdentitySHA256,
    snapshot: structuredClone(f.current), intent: { status: 'ACTIVE_UNISSUED', revision: '1',
      statement: structuredClone(packet.statement),
      proofSHA256: createHash('sha256').update(Buffer.from(packet.proofResult.proof, 'hex')).digest('hex') },
    submissionResolution: submission && { ...submission,
      receipt: { transactionHash: submission.transactionHash, blockHash: h('canonical reverted claim transaction'), status: 0 },
      canonicalBlockHashBefore: h('canonical reverted claim transaction'), canonicalBlockHashAfter: h('canonical reverted claim transaction') } };
}
async function nativeClaimFixture(t) {
  const fixture = await intentFixture(t), { f, job } = fixture;
  const request = { claimDomain: h('pinned native claim domain'), ingressProverIdentity: h('authenticated private ingress prover'),
    statement: job.statement };
  const handoff = await f.owner.createNativeClaimIngressHandoff(request);
  return { ...fixture, handoff, handoffRequest: request };
}

test('native claim handoff durably fixes one exact D27 opening, proof and recipient without exporting a signing key or witness', async t => {
  const { f, handoff, handoffRequest, proof, job } = await nativeClaimFixture(t), state = await f.state();
  assert.equal(handoff.profile, FLAT_OWNER_CLAIM_HANDOFF_PROFILE);
  assert.equal(handoff.trust, FLAT_OWNER_CLAIM_HANDOFF_TRUST); assert.equal(handoff.revision, 0);
  assert.deepEqual(handoff.statement, job.statement); assert.deepEqual(handoff.proofResult, proof);
  const n = state.notes.source.opening;
  assert.deepEqual(handoff.opening, { rho: n.rho, x: n.x, y: n.y, value: n.value, noteSecret: n.secret });
  assert.deepEqual(Object.keys(handoff.opening).sort(), ['noteSecret', 'rho', 'value', 'x', 'y']);
  assert.doesNotMatch(JSON.stringify(handoff), /PRIVATE KEY|privateKeyPem|signature|witness|exitRecipient|recipient|authorization/);
  const { handoffIdentitySHA256, ...body } = handoff; assert.equal(handoffIdentitySHA256, ownerDigest(body));
  assert.deepEqual(state.operations.deposit_intent.nativeClaim.handoff, handoff);
  assert.equal(Object.isFrozen(handoff.opening), true);
  assert.throws(() => { handoff.opening.value = '1'; });
  assert.doesNotMatch(await readFile(f.path, 'utf8'), new RegExp(n.secret));
  const checkpoint = f.checkpoint;
  await f.reopen(); assert.deepEqual(await f.owner.createNativeClaimIngressHandoff(handoffRequest), handoff);
  assert.deepEqual(f.checkpoint, checkpoint); assert.deepEqual(await f.owner.depositIntentProofJob(), { proofResult: proof });
  for (const change of [{ claimDomain: h('retargeted domain') }, { ingressProverIdentity: h('other prover') },
    ...['scope', 'policy', 'output'].map(field => ({ statement: { ...job.statement, [field]: h('other ' + field) } })),
    ...['amount', 'validFrom', 'validUntil'].map(field => ({ statement: { ...job.statement, [field]: String(BigInt(job.statement[field]) + 1n) } }))]) {
    await assert.rejects(f.owner.createNativeClaimIngressHandoff({ ...handoffRequest, ...change }));
  }
  await assert.rejects(f.owner.createNativeClaimIngressHandoff({ ...handoffRequest, privateKey: true }));
  assert.deepEqual(await f.state(), state);
});

test('native claim handoff refuses missing proof and does not widen ordinary D27 or native-ETH custody', async t => {
  for (const assetBinding of [TOKEN, null]) {
    const f = await setup(t, { assetBinding });
    await f.owner.prepareDepositIntent({ amount: '5', validFrom: '6000', validUntil: '7000', exitRecipient: '34'.repeat(20) });
    const job = await f.owner.depositIntentProofJob(), request = { claimDomain: h('claim'), ingressProverIdentity: h('prover'), statement: job.statement };
    await assert.rejects(f.owner.createNativeClaimIngressHandoff(request), assetBinding ? /PROOF_REQUIRED/ : /CLAIM_TOKEN_REQUIRED/);
    const state = await f.state(); assert.equal(Object.hasOwn(state.operations.deposit_intent, 'nativeClaim'), false);
    await assert.rejects(f.owner.renewNativeClaimDepositIntent({ handoffIdentitySHA256: h('unbound'), validFrom: '7000', validUntil: '8000' }), /HANDOFF_REQUIRED/);
  }
});

test('native claim renewal requires exact active canonical intent and keeps the original note, proofs and handoffs across restart', async t => {
  const { f, handoff, handoffRequest, proof } = await nativeClaimFixture(t), before = await f.state();
  const renewal = { handoffIdentitySHA256: handoff.handoffIdentitySHA256, validFrom: '7000', validUntil: '9000' };
  f.current = snapshot(f.id, { timestamp: '7500' });
  await assert.rejects(f.owner.renewNativeClaimDepositIntent(renewal), /CLAIM_OBSERVER_REQUIRED/);
  f.nativeClaimObservation = null;
  await assert.rejects(f.owner.renewNativeClaimDepositIntent(renewal), /CLAIM_INTENT_UNOBSERVED/);
  const observed = nativeClaimObservation(f, handoff);
  const mutations = [o => { o.intent.status = 'ISSUED'; }, o => { o.intent.status = 'VOIDED'; }, o => { o.intent.status = 'ABSENT'; },
    o => { o.claimDomain = h('another claim'); }, o => { o.identitySHA256 = h('another owner'); },
    o => { o.handoffIdentitySHA256 = h('another handoff'); }, o => { o.intentIdentitySHA256 = h('another intent'); },
    o => { o.intent.statement.amount = '1'; }, o => { o.intent.statement.output = h('replacement note'); },
    o => { o.intent.proofSHA256 = h('other proof'); }, o => { o.intent.revision = '01'; },
    o => { o.snapshot.canonicalBlockHashAfter = h('reorg'); },
    o => { o.submissionResolution = { confirmed: false }; },
    o => { o.snapshot = snapshot(f.id, { commitments: [p(handoff.statement.output)], sequence: '1', outputs: 1, backing: '50000', timestamp: '7500' }); }];
  for (const mutate of mutations) {
    const bad = structuredClone(observed); mutate(bad); f.nativeClaimObservation = bad;
    await assert.rejects(f.owner.renewNativeClaimDepositIntent(renewal)); assert.deepEqual(await f.state(), before);
  }
  f.nativeClaimObservation = observed;
  for (const change of [{ validUntil: '7000' }, { validFrom: '6000' }, { handoffIdentitySHA256: h('different handoff') },
    { amount: '1' }, { claimDomain: h('retargeted claim') }]) await assert.rejects(f.owner.renewNativeClaimDepositIntent({ ...renewal, ...change }));
  assert.equal((await f.owner.renewNativeClaimDepositIntent(renewal)).stage, 'PREPARED');
  const renewed = await f.state(), active = renewed.operations.deposit_intent;
  assert.deepEqual(renewed.notes, before.notes); assert.equal(active.history.length, 1);
  assert.deepEqual(active.history[0].proof, proof); assert.deepEqual(active.history[0].handoff, handoff);
  assert.deepEqual(active.history[0].canonicalIntent, observed);
  assert.equal(active.proof, null); assert.equal(active.witness, null); assert.equal(active.nativeClaim.handoff, null);
  const checkpoint = f.checkpoint;
  await f.reopen(); await f.owner.renewNativeClaimDepositIntent(renewal); assert.deepEqual(f.checkpoint, checkpoint);
  assert.deepEqual(await f.owner.createNativeClaimIngressHandoff(handoffRequest), handoff);
  await assert.rejects(f.owner.renewNativeClaimDepositIntent({ ...renewal, validUntil: '9500' }), /RENEWAL_FIXED/);
  const job = await f.owner.depositIntentProofJob(); assert.equal(job.statement.output, handoff.statement.output);
  for (const field of ['rho', 'key_x', 'key_y', 'secret']) assert.deepEqual(job.inputs[field], before.operations.deposit_intent.witness[field]);
  assert.notDeepEqual(job.inputs.signature, before.operations.deposit_intent.witness.signature);
  const newRequest = { ...handoffRequest, statement: job.statement };
  await assert.rejects(f.owner.createNativeClaimIngressHandoff(newRequest), /PROOF_REQUIRED/);
  const newProof = { proof: 'f00d01', publicInputs: job.publicInputs, evidence: { kind: 'EXPLICIT_SYNTHETIC_PROOF_NOT_VALIDATED' } };
  await f.owner.retainDepositIntentProof(newProof);
  const newHandoff = await f.owner.createNativeClaimIngressHandoff(newRequest);
  assert.equal(newHandoff.revision, 1); assert.deepEqual(newHandoff.opening, handoff.opening);
  assert.equal(newHandoff.intentIdentitySHA256, handoff.intentIdentitySHA256);
  assert.notEqual(newHandoff.handoffIdentitySHA256, handoff.handoffIdentitySHA256);
  assert.deepEqual(newHandoff.proofResult, newProof); assert.equal(newHandoff.statement.validUntil, '9000');
  await assert.rejects(f.owner.bindNativeClaimIssuance({ handoffIdentitySHA256: handoff.handoffIdentitySHA256,
    transactionHash: h('stale packet issue'), calldataSHA256: h('stale packet calldata') }), /CLAIM_BINDING/);
  await f.reopen(); assert.deepEqual(await f.owner.createNativeClaimIngressHandoff(newRequest), newHandoff);
  assert.deepEqual(await f.owner.createNativeClaimIngressHandoff(handoffRequest), handoff);
  assert.deepEqual((await f.state()).notes, before.notes);
  const secondRenewal = { handoffIdentitySHA256: newHandoff.handoffIdentitySHA256, validFrom: '9000', validUntil: '11000' };
  const secondObservation = nativeClaimObservation(f, newHandoff); f.nativeClaimObservation = secondObservation;
  await assert.rejects(f.owner.renewNativeClaimDepositIntent(secondRenewal), /CANONICAL_REVISION/);
  secondObservation.intent.revision = '2'; f.nativeClaimObservation = secondObservation;
  await f.owner.renewNativeClaimDepositIntent(secondRenewal); await f.reopen();
  const secondCheckpoint = f.checkpoint;
  await f.owner.renewNativeClaimDepositIntent(renewal); await f.owner.renewNativeClaimDepositIntent(secondRenewal);
  assert.deepEqual(f.checkpoint, secondCheckpoint); assert.deepEqual((await f.state()).notes, before.notes);
  assert.deepEqual(await f.owner.createNativeClaimIngressHandoff(handoffRequest), handoff);
  assert.deepEqual(await f.owner.createNativeClaimIngressHandoff(newRequest), newHandoff);
});

test('native claim renewal preserves unknown EVM issuance until the exact original canonical revert is observed', async t => {
  const { f, handoff } = await nativeClaimFixture(t);
  const submission = { transactionHash: h('original attempted EVM issue'), calldataSHA256: h('original attempted EVM issue data') };
  await f.owner.bindDepositIntentDelivery(submission); f.deliveryObservation = null;
  await f.owner.reconcileDepositIntent(submission); await f.reopen();
  const before = await f.state(), renewal = { handoffIdentitySHA256: handoff.handoffIdentitySHA256, validFrom: '7000', validUntil: '9000' };
  f.current = snapshot(f.id, { timestamp: '7500' });
  const observed = nativeClaimObservation(f, handoff, submission);
  for (const mutate of [o => { o.submissionResolution = null; }, o => { o.submissionResolution.receipt.status = 1; },
    o => { o.submissionResolution.transactionHash = h('other tx'); }, o => { o.submissionResolution.calldataSHA256 = h('other data'); },
    o => { o.submissionResolution.receipt.transactionHash = h('other receipt'); },
    o => { o.submissionResolution.canonicalBlockHashAfter = h('reorg'); }]) {
    const bad = structuredClone(observed); mutate(bad); f.nativeClaimObservation = bad;
    await assert.rejects(f.owner.renewNativeClaimDepositIntent(renewal)); assert.deepEqual(await f.state(), before);
  }
  f.nativeClaimObservation = observed;
  await f.owner.renewNativeClaimDepositIntent(renewal);
  const after = await f.state(); assert.equal(after.operations.deposit_intent.submission, null);
  assert.deepEqual(after.operations.deposit_intent.history[0].submission, submission);
  assert.deepEqual(after.operations.deposit_intent.history[0].canonicalIntent, observed);
  assert.deepEqual(after.notes, before.notes); await f.reopen();
  assert.equal((await f.owner.renewNativeClaimDepositIntent(renewal)).stage, 'PREPARED');
});

test('native claim handoff withholds opening on uncertain acknowledgement and reopens only its exact retained packet', async t => {
  const { f, job } = await intentFixture(t), request = { claimDomain: h('claim ack uncertainty'),
    ingressProverIdentity: h('prover ack uncertainty'), statement: job.statement };
  f.checkpointHook = async cp => { if (cp.pending === null) throw Error('synthetic lost final keeper acknowledgement'); };
  await assert.rejects(f.owner.createNativeClaimIngressHandoff(request), /FLAT_OWNER_WRITE_UNCERTAIN/);
  const retained = (await f.state()).operations.deposit_intent.nativeClaim.handoff;
  assert.ok(retained); await assert.rejects(f.owner.createNativeClaimIngressHandoff(request), /FLAT_OWNER_UNAVAILABLE/);
  const checkpoint = f.checkpoint; f.checkpointHook = async () => {};
  await f.reopen(); assert.deepEqual(await f.owner.createNativeClaimIngressHandoff(request), retained);
  assert.deepEqual(f.checkpoint, checkpoint);
});

async function nativeIssueFixture(t) {
  const f = await setup(t, { assetBinding: TOKEN });
  const request = { amount: '50000', validFrom: '6050', validUntil: '7000', exitRecipient: '34'.repeat(20) };
  await f.owner.prepareDepositIntent(request); const job = await f.owner.depositIntentProofJob();
  const proof = { proof: 'c0ffee', publicInputs: job.publicInputs, evidence: { kind: 'EXPLICIT_SYNTHETIC_PROOF_NOT_VALIDATED' } };
  await f.owner.retainDepositIntentProof(proof);
  const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([key, type]) => [key,
    type.startsWith('u') ? '1' : type === 'address' ? '67'.repeat(20) : type === 'field32' ? '00' + h(key).slice(2) : h(key)]));
  Object.assign(config, { evmChainId: '31337', nativeFamily: '2', refundMaxFee: '500', gateway: 'ba'.repeat(20),
    wrapper: TOKEN.token, wrapperCodeHash: TOKEN.codeHash, pool: f.id.pool, poolDomain: f.id.domainCommitment,
    scope: f.id.domain.scope, policy: f.id.domain.policy, wrapperAssetIdentity: f.id.domain.asset,
    hubDomain: f.id.domain.hubDomain, ledgerNamespace: f.id.domain.ledgerNamespace, registryCommitment: f.id.domain.registryCommitment });
  const claimDomain = claimDomainCommitment(config), handoff = await f.owner.createNativeClaimIngressHandoff({ claimDomain,
    ingressProverIdentity: h('explicit synthetic native claim prover'), statement: job.statement });
  const field = label => '00' + h(label).slice(2), intentId = claimIntentId({ claimDomain, outputQ: job.statement.output, amount: request.amount });
  const ingress = { claimDomain, outputQ: job.statement.output, admissionN: h('original claim N'), refundDestination: h('original claim refund'),
    admissionRevocationState: field('claim revocation'), ingressReceiptLeaf: field('synthetic typed claim receipt'),
    amountQ: request.amount, evidenceFrom: '6490', evidenceUntil: '6520' };
  const before = snapshot(f.id, { timestamp: '6499' }), b = flatOwnerSnapshot(before, f.id);
  const commitments = [p(job.statement.output)], root = new PrivateNoteTree(commitments).root;
  const after = snapshot(f.id, { commitments, sequence: '1', outputs: 1, backing: request.amount,
    roots: b.roots.concat(root), timestamp: '6500' }), a = flatOwnerSnapshot(after, f.id).publicState;
  const intent = { id: intentId, state: '1', output: job.statement.output, amount: request.amount,
    validFrom: request.validFrom, validUntil: request.validUntil, revision: '1',
    proofHash: createHash('sha256').update(Buffer.from(proof.proof, 'hex')).digest('hex'),
    nullifier: ingress.admissionN, refundDestination: ingress.refundDestination };
  const reservation = { gateway: config.gateway, operationId: intentId, revision: '1', wireBindingCommitment: h('reserved wire commitment'), ingress: true, consumed: false };
  const hub = { domain: config.poolDomain, receiptRoot: field('old receipt root'), receiptCount: '0', spentTagDigest: h('spent tag digest'),
    spentTagCount: '0', spentTagSequence: '0', revokedDigest: field('revoked'), revokedCount: '0', revocationSequence: '0',
    stateSequence: '9', evidenceState: field('old evidence'), halted: false, reservedTagCapacity: '0', totalReservedTagCapacity: '0' };
  const cb = { blockHash: before.blockHash, intent, reservation, receiptReservation: '1', reservedReceiptCapacity: '1',
    reservationOwner: config.gateway, operationNullifier: ingress.admissionN, admissionNullifier: false, claimSequence: '2',
    pendingRedemptions: '0', pendingRefunds: '0', heldUnissued: request.amount, reservedFees: config.refundMaxFee,
    reservedRefundTickets: '1', activePayout: ZERO, hubState: hub, receiptLeaves: [],
    admissionRevocationState: ingress.admissionRevocationState, revocationOverflowCount: '0' };
  const ca = { ...structuredClone(cb), blockHash: after.blockHash, intent: { ...intent, state: '2' }, reservation: { ...reservation, consumed: true },
    receiptReservation: '2', reservedReceiptCapacity: '0', admissionNullifier: true, claimSequence: '3', heldUnissued: '0',
    reservedFees: '0', reservedRefundTickets: '0', receiptLeaves: [ingress.ingressReceiptLeaf],
    hubState: { ...hub, receiptRoot: field('new receipt root'), receiptCount: '1', stateSequence: '10', evidenceState: field('new evidence') } };
  const actionDigest = claimActionDigest(claimDomain, { action: '3', operationId: intentId, revision: '1', amount: request.amount,
    destinationCommitment: ingress.refundDestination, maxFee: config.refundMaxFee, nullifier: ingress.admissionN,
    wireBindingCommitment: reservation.wireBindingCommitment, routeCommitment: ingress.ingressReceiptLeaf, claimSequence: '2', hubSequence: '9' });
  const permit = { claimDomain, custodyInventoryDomain: config.custodyInventoryDomain, actionDigest, expectedClaimSequence: '2', hubStateSequence: '9',
    revocationState: ingress.admissionRevocationState, wrapperSupply: '0', pendingRedemptions: '0', pendingRefunds: '0', heldUnissued: request.amount,
    unknownExposure: '0', nativePrincipalAvailable: request.amount, feeReserveAvailable: '500', reservedFeesAfter: '0',
    inventoryCommitment: h('fixture inventory'), obligationsCommitment: h('fixture obligations'), validFrom: '6490', validUntil: '6510' };
  // Structurally encoded fake signatures are never claimed to be a facts,
  // backing or health quorum; actual verification belongs to genuine execution.
  const signatures = [0, 1, 2].map(i => ({ signerIndex: String(i), v: '27', r: p(h('fake r' + i)), s: p(h('fake s' + i)) }));
  const authorization = { permit: Object.fromEntries(CLAIM_BACKING_FIELDS.map(([key, type]) => [key, type === 'b32' ? p(permit[key]) : permit[key]])),
    signatures, healthFrom: '6490', healthUntil: '6510', healthSignatures: signatures };
  const ingressPublicInputs = encodeClaimIngressInputs(ingress), ingressProof = 'feed01';
  const data = encodeNativeClaimIssueCall({ ownerProof: { proof: p(proof.proof), inputs: job.publicInputs.map(value => p(word(value))) },
    ingressProof: { proof: p(ingressProof), inputs: ingressPublicInputs.map(value => p(word(value))) }, authorization });
  const tx = h('synthetic exact native claim issue'), observation = { kind: 'NATIVE_CLAIM_ISSUE', identitySHA256: ownerDigest(f.id),
    transaction: { hash: tx, from: SENDER, to: config.gateway, value: '0', calldata: data },
    receipt: { transactionHash: tx, blockHash: after.blockHash, status: 1 }, before, after,
    stateAdvanced: { address: f.id.pool, transactionHash: tx, blockHash: after.blockHash, sequence: '1', root, spent: a.spentDigest, leaves: 1, consumed: 0 },
    delivery: { config, claimDomain, intentId, revision: '1', publicInputs: job.publicInputs, ownerProof: proof.proof, ingressPublicInputs, ingressProof },
    deliveryEvent: { address: config.gateway, transactionHash: tx, blockHash: after.blockHash, position: 7, intentId,
      nullifier: ingress.admissionN, output: ingress.outputQ, amount: ingress.amountQ },
    assetObservation: { kind: 'NATIVE_CLAIM_MINT', token: TOKEN.token, codeHash: TOKEN.codeHash, pool: f.id.pool, gateway: config.gateway,
      before: { blockHash: before.blockHash, poolBalance: '0', wrapperSupply: '0', gatewayBalance: '5', gatewayAllowance: '0' },
      after: { blockHash: after.blockHash, poolBalance: request.amount, wrapperSupply: request.amount, gatewayBalance: '5', gatewayAllowance: '0' } },
    claimObservation: { before: cb, after: ca } };
  const inclusion = { transactionHash: tx, calldataSHA256: createHash('sha256').update(Buffer.from(data.slice(2), 'hex')).digest('hex') };
  f.deliveryObservation = observation; f.current = after;
  return { f, job, proof, handoff, observation, inclusion };
}

test('synthetic native claim issue credits only its retained original note once, survives restart and preserves W39 exit', async t => {
  const { f, handoff, observation, inclusion } = await nativeIssueFixture(t), before = await f.state();
  assert.throws(() => assertOwnedNativeClaimIngressHandoff({ select: () => handoff }), /OWNED_CLAIM_HANDOFF_REQUIRED/);
  await assert.rejects(f.owner.bindNativeClaimIssuance({ ...inclusion, handoffIdentitySHA256: h('other handoff') }), /CLAIM_BINDING/);
  await f.owner.bindNativeClaimIssuance({ ...inclusion, handoffIdentitySHA256: handoff.handoffIdentitySHA256 });
  const bound = f.checkpoint;
  await f.owner.bindNativeClaimIssuance({ ...inclusion, handoffIdentitySHA256: handoff.handoffIdentitySHA256 }); assert.deepEqual(f.checkpoint, bound);
  await f.reopen(); assert.equal((await f.owner.privateSummary()).notes.source.pendingReconciliation, true);
  assert.equal((await f.owner.reconcileDepositIntent(inclusion)).stage, 'CONFIRMED');
  const credited = await f.state(); assert.equal(credited.notes.source.status, 'AVAILABLE');
  assert.deepEqual(credited.notes.source.opening, before.notes.source.opening);
  assert.equal(credited.operations.deposit_intent.confirmation.kind, 'NATIVE_CLAIM_ISSUE');
  assert.equal((await f.owner.privateSummary()).balances.available, '50000');
  const checkpoint = f.checkpoint; await f.reopen(); await f.owner.reconcileDepositIntent(inclusion); assert.deepEqual(f.checkpoint, checkpoint);
  await f.owner.prepareWithdrawal({ role: 'source', epoch: '10' }); const exit = await f.owner.withdrawalWitness({ role: 'source' });
  assert.equal(exit.statement.amount, '50000'); assert.equal(exit.statement.recipient, before.notes.source.recipient);
  await f.owner.bindSubmission({ kind: 'withdraw_source', calldata: calldata('withdrawal', exit.publicInputs) });
  const withdrawn = await f.success('withdraw_source'); await f.owner.reconcile({ kind: 'withdraw_source' }); f.current = withdrawn.after;
  const ended = await f.state(); f.deliveryObservation = observation; await f.owner.reconcileDepositIntent(inclusion);
  assert.deepEqual(await f.state(), ended); assert.equal(ended.notes.source.status, 'WITHDRAWN');
});

test('synthetic native claim issue rejects changed proofs, domain, receipts, N ownership, backing and event joins without weakening vault validation', async t => {
  const { f, observation, inclusion } = await nativeIssueFixture(t), state = await f.state(), op = state.operations.deposit_intent;
  const mutateCall = (o, change) => {
    const call = structuredClone(decodeNativeClaimIssueCall(o.transaction.calldata)); change(call);
    o.transaction.calldata = encodeNativeClaimIssueCall(call);
    return { ...inclusion, calldataSHA256: createHash('sha256').update(Buffer.from(o.transaction.calldata.slice(2), 'hex')).digest('hex') };
  };
  const cases = [
    ['wrong gateway', o => { o.transaction.to = 'ef'.repeat(20); }],
    ['wrong transaction', o => { o.transaction.hash = h('wrong issue'); }],
    ['reverted issue', o => { o.receipt.status = 0; }],
    ['wrong receipt block', o => { o.receipt.blockHash = h('wrong block'); }],
    ['native value', o => { o.transaction.value = '1'; }],
    ['extra field', o => { o.verified = true; }],
    ['fake vault classification', o => { delete o.kind; }],
    ['wrong domain', o => { o.delivery.claimDomain = h('wrong claim domain'); }],
    ['changed pin', o => { o.delivery.config.gatewayCodeHash = h('wrong gateway runtime'); }],
    ['changed Q', o => { o.delivery.publicInputs[19] = String(BigInt(o.delivery.publicInputs[19]) + 1n); }],
    ['changed proof field', o => { o.delivery.ownerProof = 'bad001'; }],
    ['changed genuine input bytes', o => mutateCall(o, c => { c.ownerProof.proof = '0xbad001'; o.delivery.ownerProof = 'bad001'; })],
    ['changed ingress proof', o => { o.delivery.ingressProof = 'bad001'; }],
    ['changed ingress Q', o => mutateCall(o, c => { c.ingressProof.inputs[8] = p(word('1')); o.delivery.ingressPublicInputs[8] = '1'; })],
    ['wrong event id', o => { o.deliveryEvent.intentId = h('other intent'); }],
    ['wrong event N', o => { o.deliveryEvent.nullifier = h('other N'); }],
    ['wrong state advance', o => { o.stateAdvanced.sequence = '2'; }],
    ['claim already issued', o => { o.claimObservation.before.intent.state = '2'; }],
    ['claim voided', o => { o.claimObservation.after.intent.state = '3'; }],
    ['wrong intent window', o => { o.claimObservation.after.intent.validUntil = '9000'; }],
    ['wrong retained owner proof', o => { o.claimObservation.before.intent.proofHash = h('other proof'); }],
    ['wrong canonical revision', o => { o.claimObservation.after.intent.revision = '2'; }],
    ['N was consumed before', o => { o.claimObservation.before.admissionNullifier = true; }],
    ['N not consumed', o => { o.claimObservation.after.admissionNullifier = false; }],
    ['wrong N owner', o => { o.claimObservation.before.reservationOwner = 'ef'.repeat(20); }],
    ['changed original wire', o => { o.claimObservation.after.reservation.wireBindingCommitment = h('other wire'); }],
    ['not ingress', o => { o.claimObservation.before.reservation.ingress = false; }],
    ['receipt capacity not converted', o => { o.claimObservation.after.receiptReservation = '1'; }],
    ['different claim receipt', o => { o.claimObservation.after.receiptLeaves = ['00' + h('other leaf').slice(2)]; }],
    ['receipt count unchanged', o => { o.claimObservation.after.hubState.receiptCount = '0'; }],
    ['hub double advance', o => { o.claimObservation.after.hubState.stateSequence = '11'; }],
    ['changed revocation', o => { o.claimObservation.after.admissionRevocationState = '00' + h('other state').slice(2); }],
    ['halted', o => { o.claimObservation.before.hubState.halted = true; }],
    ['held liability not converted', o => { o.claimObservation.after.heldUnissued = '50000'; }],
    ['invented refund', o => { o.claimObservation.after.pendingRefunds = '1'; }],
    ['fee reservation retained', o => { o.claimObservation.after.reservedFees = '500'; }],
    ['wrong mint', o => { o.assetObservation.after.wrapperSupply = '50001'; }],
    ['gateway retained claim value', o => { o.assetObservation.after.gatewayBalance = '50005'; }],
    ['nonzero allowance', o => { o.assetObservation.after.gatewayAllowance = '1'; }],
    ['wrong wrapper', o => { o.assetObservation.token = 'ef'.repeat(20); }],
    ['permit changed expected sequence', o => mutateCall(o, c => { c.authorization.permit.expectedClaimSequence = '3'; })],
    ['permit changed action', o => mutateCall(o, c => { c.authorization.permit.actionDigest = p(h('other action')); })],
    ['permit expired', o => mutateCall(o, c => { c.authorization.permit.validUntil = '6500'; })],
    ['health expired', o => mutateCall(o, c => { c.authorization.healthUntil = '6500'; })],
    ['permit unknown exposure', o => mutateCall(o, c => { c.authorization.permit.unknownExposure = '1'; })],
    ['permit insufficient principal', o => mutateCall(o, c => { c.authorization.permit.nativePrincipalAvailable = '49999'; })],
  ];
  for (const [label, mutate] of cases) {
    const bad = structuredClone(observation), changedInclusion = mutate(bad);
    assert.throws(() => validateFlatOwnerDepositIntentTransition(bad, op, state, changedInclusion ?? inclusion), undefined, label);
  }
  const wrongNote = structuredClone(state); wrongNote.notes.source.commitment = h('other note');
  assert.throws(() => validateFlatOwnerDepositIntentTransition(observation, op, wrongNote, inclusion), /INTENT_NOTE/);
  const noHandoff = structuredClone(op); delete noHandoff.nativeClaim;
  assert.throws(() => validateFlatOwnerDepositIntentTransition(observation, noHandoff, state, inclusion), /HANDOFF_REQUIRED/);
  f.deliveryObservation = { ...observation, kind: 'NATIVE_CLAIM_ISSUE_UNVERIFIED' };
  await assert.rejects(f.owner.reconcileDepositIntent(inclusion)); assert.deepEqual(await f.state(), state);
  f.deliveryObservation = observation; await f.owner.reconcileDepositIntent(inclusion);
  const confirmed = await f.state(), changed = structuredClone(observation); changed.deliveryEvent.position++;
  f.deliveryObservation = changed; await assert.rejects(f.owner.reconcileDepositIntent(inclusion), /BINDING/);
  assert.deepEqual(await f.state(), confirmed);
});

test('manual graph terms come from exact retained owner authorization, never a caller amount or recipient', async t => {
  const f = await setup(t); await deposit(f);
  await assert.rejects(f.owner.graphPreparationTerms(), /NOT_AUTHORIZED/);
  const recipient = freshKey(), config = nativeConfig(f, recipient);
  const request = { nativeConfig: config, changeRecipient: '56'.repeat(20), recoveryRecipient: '78'.repeat(20) };
  await f.owner.prepareAuthorization(request);
  await assert.rejects(f.owner.graphPreparationTerms(), /NOT_AUTHORIZED/);
  const [invoice] = await f.owner.invoiceRequests();
  await f.owner.authorize({ invoiceSignatures: [signature(recipient, nativeRecipientInvoiceMessage(invoice.invoice)).toString('hex')] });
  const before = await f.state(), observed = await f.owner.graphPreparationTerms();
  assert.deepEqual(observed, { identitySHA256: ownerDigest(f.id), envelope: before.authorization.envelope.publicStatement.envelope,
    sourceAmount: '50000', reservedAmount: '20000', changeAmount: '30000', changeRecipient: '56'.repeat(20), recoveryRecipient: '78'.repeat(20),
    fundingNotBefore: '5900', fundingValidUntil: '6200', settleBefore: '6500' });
  assert.ok(Object.isFrozen(observed));
  await f.reopen(); assert.deepEqual(await f.owner.graphPreparationTerms(), observed);
  assert.deepEqual(await f.state(), before);
  for (const changed of [{ ...request, recoveryRecipient: '99'.repeat(20) }, { ...request, changeRecipient: '99'.repeat(20) },
    { ...request, nativeConfig: { ...config, settleBefore: '9999' } }]) await assert.rejects(f.owner.prepareAuthorization(changed));
  assert.deepEqual(await f.owner.graphPreparationTerms(), observed);
  f.current = { ...f.current, timestamp: '6200' };
  await assert.rejects(f.owner.graphPreparationTerms(), /EXPIRED/);
});

test('manual graph terms cannot be freshly handed off after the original reservation dispatch latch', async t => {
  const { f } = await detachedRecoveryFixture(t);
  await assert.rejects(f.owner.graphPreparationTerms(), /RESERVATION_LATCHED/);
});
