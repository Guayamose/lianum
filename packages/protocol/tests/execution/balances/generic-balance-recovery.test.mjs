/** HOST ONLY: real encrypted Vaults, synthetic observations and deliberately
 * invalid proof fixtures. No chains, native transfers, compilers or provers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {objectDigest, openTrustedOwnerDraft} from '../../../../engine/src/execution/balances/generic-balance-custody.mjs';
import {validateRecoveryObservationQuery, methodPlane, encode, BALANCE_OWNER_PROTOCOL}
  from '../../../../engine/src/execution/balances/generic-balance-owner-protocol.mjs';
import {setup, fund, prepare, submission, success, recoverySuccess, recoveryRequest, h}
  from './generic-balance-fixtures.mjs';

async function reserved(t, reference = 'recovery-original') {
  const f = await setup(t), source = await fund(f), prepared = await prepare(f, source, reference, 20000);
  await f.owner.bindSubmission(prepared.submission);
  const observation = success(f, reference, prepared.submission);
  f.observe(reference, observation); await f.owner.reconcile(reference); f.snapshot = observation.after;
  return {f, reference, prepared, observation};
}
const record = async (f, reference) => (await f.vault.read(f.password)).data.operations.find(value => value.ownerOperationRef === reference);
const replaceWord = (raw, index, value) => raw.slice(0, 2 + index * 64)
  + BigInt(value).toString(16).padStart(64, '0') + raw.slice(2 + (index + 1) * 64);
async function withdraw(f, note, reference) {
  await f.owner.prepareWithdrawal({ownerOperationRef: reference, identitySHA256: objectDigest(f.id), sourceNoteId: note.noteId,
    recipient: '45'.repeat(20), epoch: String(BigInt(f.snapshot.timestamp) / 600n)});
  await f.owner.withdrawalInput(reference);
  const request = submission(f, reference, 'W39'); await f.owner.bindSubmission(request);
  const observed = success(f, reference, request, 'W39');
  f.observe(reference, observed); await f.owner.reconcile(reference); f.snapshot = observed.after;
}

test('original F51 credits once after real change reuse, then W39 exits that same note and remaining change', async t => {
  const {f, reference, observation} = await reserved(t);
  const original = await record(f, reference), beforeNotes = (await f.vault.read(f.password)).data.notes;
  const change = f.owner.privateBalance().notes.find(note => note.role === 'CHANGE');
  const second = await prepare(f, change, 'recovery-second-graph', 12000);
  await f.owner.bindSubmission(second.submission);
  const secondObserved = success(f, 'recovery-second-graph', second.submission);
  f.observe('recovery-second-graph', secondObserved); await f.owner.reconcile('recovery-second-graph'); f.snapshot = secondObserved.after;
  assert.equal(f.owner.privateBalance().available, '18000');
  // This older accepted root contains the original reservation; graph two has
  // since consumed its change. Neither operation's original accounting moves.
  const recovered = await recoverySuccess(f, reference, {acceptedRoot: original.confirmation.postRoot.slice(2)});
  const request = recoveryRequest(recovered, reference); f.observe(reference, recovered);
  assert.deepEqual(await f.owner.reconcileRecovery(request), {ownerOperationRef: reference, recoveryStage: 'CONFIRMED', dispatchAllowed: false});
  f.snapshot = recovered.after;
  await assert.rejects(f.owner.reconcileRecovery({...request, ownerOperationRef: 'recovery-second-graph'}), /RECOVERY_REUSE/);
  assert.equal(f.owner.privateBalance().available, '38000');
  const credited = await record(f, reference), {recoveryCredit, ...unchanged} = credited;
  const {recoveryCredit: emptyCredit, ...old} = original;
  assert.equal(emptyCredit, null); assert.deepEqual(unchanged, old);
  assert.equal(recoveryCredit.confirmation.sourceConfirmationSHA256, objectDigest(original.confirmation));
  assert.equal(recoveryCredit.confirmation.calldataSHA256, request.calldataSHA256);
  for (const note of beforeNotes) {
    const current = (await f.vault.read(f.password)).data.notes.find(value => value.noteId === note.noteId);
    assert.equal(current.privateKeyPem, note.privateKeyPem); assert.deepEqual(current.opening, note.opening);
  }
  const cp = f.checkpoint; await f.owner.reconcileRecovery(request); assert.deepEqual(f.checkpoint, cp);
  await f.reopen(); assert.equal(f.owner.privateBalance().available, '38000');
  const recovery = f.owner.privateBalance().notes.find(note => note.noteId === original.recovery);
  assert.equal(recovery.value, '20000'); assert.equal(recovery.role, 'RECOVERY');
  await withdraw(f, recovery, 'recovery-note-exit');
  assert.equal(f.owner.privateBalance().available, '18000');
  const remaining = f.owner.privateBalance().notes.find(note => note.status === 'AVAILABLE');
  await withdraw(f, remaining, 'recovery-change-exit'); assert.equal(f.owner.privateBalance().available, '0');
  const retired = f.owner.privateBalance().notes.find(note => note.noteId === recovery.noteId);
  assert.equal(retired.status, 'WITHDRAWN'); assert.deepEqual(retired.provenance, recovery.provenance);
  await f.owner.reconcileRecovery(request); assert.equal(f.owner.privateBalance().available, '0');
  assert.equal(f.owner.privateBalance().notes.length, 5);
  f.observe(reference, observation); await f.owner.reconcile(reference);
  assert.deepEqual((await record(f, reference)).confirmation, original.confirmation);
  assert.doesNotMatch(JSON.stringify(f.publicView.operation(reference)), /recoveryCredit|recoveryStage|noteId|commitment|calldata|signature|secret/i);
});

test('unknown S66 cannot credit recovery until exact original source debit and change are reconciled', async t => {
  const f = await setup(t), source = await fund(f), reference = 'recovery-unknown-source';
  const prepared = await prepare(f, source, reference, 20000); await f.owner.bindSubmission(prepared.submission);
  const sourceObserved = success(f, reference, prepared.submission); f.snapshot = sourceObserved.after;
  await f.owner.markUnknown(reference);
  const recovered = await recoverySuccess(f, reference), request = recoveryRequest(recovered, reference);
  f.observe(reference, recovered); const cp = f.checkpoint;
  await assert.rejects(f.owner.reconcileRecovery(request), /RECOVERY_SOURCE_UNCONFIRMED/);
  assert.deepEqual(f.checkpoint, cp); assert.equal(f.owner.privateBalance().locked, '50000');
  await f.reopen(); await assert.rejects(f.owner.reconcileRecovery(request), /RECOVERY_SOURCE_UNCONFIRMED/);
  f.observe(reference, sourceObserved); await f.owner.reconcile(reference);
  assert.equal(f.owner.privateBalance().available, '30000');
  f.observe(reference, recovered); await f.owner.reconcileRecovery(request);
  assert.equal(f.owner.privateBalance().available, '50000'); assert.equal(f.owner.privateBalance().locked, '0');
});

test('substituted recovery fields, noncanonical history, wrong deltas and latest spent guesses fail without credit', async t => {
  const {f, reference} = await reserved(t), valid = await recoverySuccess(f, reference);
  const request = recoveryRequest(valid, reference), checkpoint = f.checkpoint;
  const mutations = [
    value => value.recovery.scope = h('other scope'), value => value.recovery.policy = h('other policy'),
    value => value.recovery.asset = h('other asset'), value => value.recovery.reserveNullifier = h('other reserve'),
    value => value.recovery.recoveryCommitment = h('other note'), value => value.recovery.settleBefore = '6299',
    value => value.recovery.acceptedRoot = h('unaccepted root'), value => value.recovery.validFrom = '6299',
    value => value.recovery.validUntil = '6300', value => value.transaction.calldata += '00',
    value => value.transaction.to = '77'.repeat(20), value => value.transaction.value = '1',
    value => value.transaction.hash = h('other transaction'), value => value.receipt.status = 0,
    value => value.stateAdvanced.transactionHash = h('other event'), value => value.stateAdvanced.sequence = '900',
    value => value.after.canonicalBlockHashAfter = h('reorganized block'),
    value => value.before.canonicalBlockHashBefore = h('reorganized ancestor'),
    value => value.transition.spentNullifiers = [h('other reserve')],
    value => value.transition.insertedCommitments.push(h('extra credit')), value => value.transition.admissionTag = h('admission'),
    value => { value.after.rawBacking = replaceWord(replaceWord(value.after.rawBacking, 1, 70000), 2, 70000); },
    value => value.after.rawState = replaceWord(value.after.rawState, 5, 1),
    value => value.after.rawState = replaceWord(value.after.rawState, 6, 1),
    value => value.after.timestamp = '6900', value => value.identitySHA256 = h('other identity'),
    value => delete value.recovery,
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(valid); mutate(changed); f.observe(reference, changed);
    await assert.rejects(f.owner.reconcileRecovery(request));
    assert.deepEqual(f.checkpoint, checkpoint); assert.equal(f.owner.privateBalance().available, '30000');
    assert.equal(f.owner.privateBalance().notes.find(note => note.role === 'RECOVERY').status, 'UNISSUED');
  }
  for (const observation of [null, {spent: true}]) {
    f.observe(reference, observation); await assert.rejects(f.owner.reconcileRecovery(request));
  }
  // Canonical F51 bytes for an accepted root predating the reserve are also rejected.
  const tooEarly = await recoverySuccess(f, reference, {acceptedRoot: valid.before.rawHistory.slice(2 + 4 * 64, 2 + 5 * 64)});
  f.observe(reference, tooEarly); await assert.rejects(f.owner.reconcileRecovery(recoveryRequest(tooEarly, reference)), /ACCEPTED_ROOT/);
  f.observe(reference, valid); await f.owner.reconcileRecovery(request);
  for (const replacement of [{transactionHash: h('replacement transaction')}, {calldataSHA256: h('replacement calldata')}]) {
    await assert.rejects(f.owner.reconcileRecovery({...request, ...replacement}), /RECOVERY_REUSE/);
  }
  const changedCanonical = structuredClone(valid); changedCanonical.before.timestamp = '6001';
  f.observe(reference, changedCanonical); await assert.rejects(f.owner.reconcileRecovery(request), /CONFIRMATION_CHANGED/);
});

test('absent recovery credit resumes the exact retained candidate without dispatch or duplicated value', async t => {
  const {f, reference} = await reserved(t), observation = await recoverySuccess(f, reference);
  const request = recoveryRequest(observation, reference); f.observe(reference, observation); f.setFault('before');
  await assert.rejects(f.owner.reconcileRecovery(request), /WRITE_UNCERTAIN/);
  assert.equal(f.checkpoint.pending.mutation.type, 'RECOVERY_CREDIT');
  assert.deepEqual(f.checkpoint.pending.mutation.recoveryRequest, request);
  assert.equal((await f.owner.resumePendingWrite()).dispatchAllowed, false);
  assert.equal(f.owner.privateBalance().available, '50000');
  await f.owner.reconcileRecovery(request); assert.equal(f.owner.privateBalance().available, '50000');
});

test('restart records an absent credit and permits only its original F51 query and observation', async t => {
  const {f, reference} = await reserved(t), observation = await recoverySuccess(f, reference);
  const request = recoveryRequest(observation, reference); f.observe(reference, observation); f.setFault('before');
  await assert.rejects(f.owner.reconcileRecovery(request), /WRITE_UNCERTAIN/);
  await assert.rejects(f.reopen(), /CHECKPOINT/);
  await f.recoverAbsent(); assert.equal(f.owner.privateBalance().available, '30000');
  await assert.rejects(f.owner.reconcileRecovery({...request, transactionHash: h('changed recovery')}), /RECOVERY_REUSE/);
  const changed = structuredClone(observation); changed.before.timestamp = '6001'; f.observe(reference, changed);
  await assert.rejects(f.owner.reconcileRecovery(request), /CONFIRMATION_CHANGED/);
  f.observe(reference, observation); await f.owner.reconcileRecovery(request);
  await f.reopen(); assert.equal(f.owner.privateBalance().available, '50000');
});

for (const fault of ['after', 'readback', 'keeper-ack']) test(`committed recovery credit survives ${fault} interruption exactly once`, async t => {
  const {f, reference} = await reserved(t), observation = await recoverySuccess(f, reference);
  const request = recoveryRequest(observation, reference); f.observe(reference, observation); f.setFault(fault);
  await assert.rejects(f.owner.reconcileRecovery(request), /WRITE_UNCERTAIN/);
  if (fault === 'after') await f.reopen(); else await f.owner.authenticateCommittedWrite();
  const checkpoint = f.checkpoint; await f.owner.reconcileRecovery(request);
  assert.deepEqual(f.checkpoint, checkpoint); assert.equal(f.owner.privateBalance().available, '50000');
});

test('V3 custody and checkpoints reject V2 rather than silently interpreting authenticated old state', async t => {
  const f = await setup(t);
  await assert.rejects(openTrustedOwnerDraft({...f.config, create: false, checkpoint: {...f.checkpoint, version: 2}}, f.deps), /CHECKPOINT_IDENTITY/);
  const stored = await f.vault.read(f.password);
  const old = await f.vault.update(f.password, stored.revision, state => ({...state, version: 2, profile: 'DRAFT_GENERIC_BALANCE_OWNER_V2'}));
  const checkpoint = {version: 2, identitySHA256: objectDigest(f.id), acknowledged: {revision: old.revision, stateSHA256: objectDigest(old.data)}, pending: null};
  await assert.rejects(openTrustedOwnerDraft({...f.config, create: false, checkpoint}, f.deps), /CUSTODY_VERSION/);
});

test('recovery IPC is private and the host query is restricted to the exact current command', () => {
  assert.equal(methodPlane('reconcileRecovery'), 'owner');
  const request = {ownerOperationRef: 'recovery-private-query', transactionHash: h('tx'), calldataSHA256: h('calldata')};
  const identitySHA256 = h('identity'), query = {...request, identitySHA256};
  validateRecoveryObservationQuery(request, query, identitySHA256);
  for (const key of Object.keys(query)) assert.throws(() => validateRecoveryObservationQuery(request,
    {...query, [key]: key === 'ownerOperationRef' ? 'another-operation' : h('wrong ' + key)}, identitySHA256), /RECOVERY_QUERY/);
  assert.throws(() => validateRecoveryObservationQuery(request, {...query, rpcUrl: 'injected'}, identitySHA256), /FIELDS/);
  assert.throws(() => encode({protocol: BALANCE_OWNER_PROTOCOL, session: h('session'), type: 'request', id: 1,
    plane: 'public', method: 'reconcileRecovery', input: request}), /PLANE/);
  assert.throws(() => encode({protocol: 'LIANUM_GENERIC_BALANCE_OWNER_IPC_V2', session: h('session'), type: 'request', id: 1,
    plane: 'owner', method: 'reconcileRecovery', input: request}), /PROTOCOL/);
});
