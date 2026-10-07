import test from 'node:test';
import assert from 'node:assert/strict';
import {objectDigest} from '../../src/paeg/generic-balance-custody.mjs';
import {setup,fund,prepare,submission,success,h} from './generic-balance-fixtures.mjs';

const destination='45'.repeat(20);
function withdrawal(f,note,reference='withdrawal-reference',epoch='10') {
  return {ownerOperationRef:reference,identitySHA256:objectDigest(f.id),sourceNoteId:note.noteId,recipient:destination,epoch};
}
function advanceEpoch(f,epoch) {
  const blockHash=h('withdrawal-epoch-'+epoch);
  f.snapshot={...f.snapshot,timestamp:String(BigInt(epoch)*600n),blockHash,canonicalBlockHashBefore:blockHash,canonicalBlockHashAfter:blockHash};
}

test('exact W39 withdraws the original funded note once and preserves its spent history',async t=>{
  const f=await setup(t),source=await fund(f),request=withdrawal(f,source);
  await f.owner.prepareWithdrawal(request);
  assert.equal(f.owner.privateBalance().available,'0');assert.equal(f.owner.privateBalance().locked,'50000');
  const witness=await f.owner.withdrawalInput(request.ownerOperationRef),plan=f.owner.ownerPlan(request.ownerOperationRef);
  assert.equal(plan.publicInputs.length,39);assert.equal(plan.statement.amount,'50000');assert.equal(plan.statement.recipient,destination);
  assert.deepEqual(await f.owner.withdrawalInput(request.ownerOperationRef),witness);
  const sent=submission(f,request.ownerOperationRef,'W39');assert.equal((await f.owner.bindSubmission(sent)).dispatchAllowed,true);
  assert.equal((await f.owner.bindSubmission(sent)).dispatchAllowed,false);
  const observation=success(f,request.ownerOperationRef,sent,'W39');f.observe(request.ownerOperationRef,observation);
  await f.owner.reconcile(request.ownerOperationRef);assert.equal(f.owner.privateBalance().available,'0');assert.equal(f.owner.privateBalance().locked,'0');
  assert.equal(f.owner.privateBalance().notes.find(n=>n.noteId===source.noteId).status,'WITHDRAWN');
  const cp=f.checkpoint;await f.owner.reconcile(request.ownerOperationRef);assert.deepEqual(f.checkpoint,cp);
  await f.reopen();assert.equal(f.owner.privateBalance().notes.length,1);
  await assert.rejects(f.owner.prepareWithdrawal({...request,ownerOperationRef:'withdrawal-replay'}),/SOURCE_UNAVAILABLE/);
});

test('W39 exits the actual S66 change without crediting recovery or changing its original provenance',async t=>{
  const f=await setup(t),source=await fund(f),spend=await prepare(f,source,'spend-before-withdraw',20000);
  await f.owner.bindSubmission(spend.submission);const funded=success(f,'spend-before-withdraw',spend.submission);
  f.observe('spend-before-withdraw',funded);await f.owner.reconcile('spend-before-withdraw');f.snapshot=funded.after;
  const change=f.owner.privateBalance().notes.find(n=>n.status==='AVAILABLE'),request=withdrawal(f,change);
  await f.owner.prepareWithdrawal(request);await f.owner.withdrawalInput(request.ownerOperationRef);
  const sent=submission(f,request.ownerOperationRef,'W39');await f.owner.bindSubmission(sent);
  f.observe(request.ownerOperationRef,success(f,request.ownerOperationRef,sent,'W39'));await f.owner.reconcile(request.ownerOperationRef);
  const balance=f.owner.privateBalance();assert.equal(balance.available,'0');assert.equal(balance.locked,'0');
  assert.equal(balance.notes.find(n=>n.role==='RECOVERY').status,'UNISSUED');
  assert.equal(balance.notes.find(n=>n.noteId===change.noteId).status,'WITHDRAWN');
  assert.deepEqual(balance.notes.find(n=>n.noteId===change.noteId).provenance,change.provenance);
});

test('W39 renewal changes only expired epoch/membership and never clears a dispatch latch',async t=>{
  const f=await setup(t),source=await fund(f),request=withdrawal(f,source);
  await f.owner.prepareWithdrawal(request);const originalWitness=await f.owner.withdrawalInput(request.ownerOperationRef);
  const originalPlan=f.owner.ownerPlan(request.ownerOperationRef),notes=(await f.vault.read(f.password)).data.notes;
  await assert.rejects(f.owner.prepareWithdrawal({...request,recipient:'56'.repeat(20)}),/REFERENCE_REUSE/);
  await assert.rejects(f.owner.renewWithdrawalEpoch({ownerOperationRef:request.ownerOperationRef,epoch:'11'}),/RENEWAL_EPOCH/);
  for(const epoch of ['11','12']) {
    advanceEpoch(f,epoch);await f.owner.renewWithdrawalEpoch({ownerOperationRef:request.ownerOperationRef,epoch});
    const witness=await f.owner.withdrawalInput(request.ownerOperationRef),plan=f.owner.ownerPlan(request.ownerOperationRef);
    assert.equal(witness.epoch,epoch);assert.deepEqual(witness.spent,originalWitness.spent);
    assert.equal(plan.statement.nullifier,originalPlan.statement.nullifier);
    assert.equal(plan.statement.amount,originalPlan.statement.amount);assert.equal(plan.statement.recipient,destination);
  }
  assert.deepEqual((await f.vault.read(f.password)).data.notes,notes);await f.reopen();
  const sent=submission(f,request.ownerOperationRef,'W39');await f.owner.bindSubmission(sent);await f.owner.markUnknown(request.ownerOperationRef);
  advanceEpoch(f,'13');await assert.rejects(f.owner.renewWithdrawalEpoch({ownerOperationRef:request.ownerOperationRef,epoch:'13'}),/RENEWAL_STAGE/);
  assert.equal((await f.owner.reconcile(request.ownerOperationRef)).stage,'UNKNOWN');assert.equal(f.owner.privateBalance().locked,'50000');
});

test('wrong Withdrawal log, calldata, canonical headers and backing never retire a locked note',async t=>{
  const f=await setup(t),source=await fund(f),request=withdrawal(f,source);
  await f.owner.prepareWithdrawal(request);await f.owner.withdrawalInput(request.ownerOperationRef);
  const sent=submission(f,request.ownerOperationRef,'W39');await f.owner.bindSubmission(sent);await f.owner.markUnknown(request.ownerOperationRef);
  const valid=success(f,request.ownerOperationRef,sent,'W39');
  for(const mutate of [o=>o.withdrawal.recipient='56'.repeat(20),o=>o.withdrawal.amount='49999',o=>o.withdrawal.nullifier=h('other NF'),
    o=>o.withdrawal.transactionHash=h('other tx'),o=>o.withdrawal.address='56'.repeat(20),o=>delete o.withdrawal,
    o=>o.transaction.calldata+='00',o=>o.after.canonicalBlockHashAfter=h('reorg'),o=>o.after.rawBacking=o.before.rawBacking]) {
    const observed=structuredClone(valid);mutate(observed);f.observe(request.ownerOperationRef,observed);
    await assert.rejects(f.owner.reconcile(request.ownerOperationRef));assert.equal(f.owner.privateBalance().locked,'50000');
  }
  await f.reopen();assert.equal((await f.owner.bindSubmission(sent)).dispatchAllowed,false);
  f.observe(request.ownerOperationRef,valid);await f.owner.reconcile(request.ownerOperationRef);assert.equal(f.owner.privateBalance().locked,'0');
});

test('uncommitted W39 signature resumes the same destination/NF; committed confirmation is adopted after lost reply',async t=>{
  const f=await setup(t),source=await fund(f),request=withdrawal(f,source);
  await f.owner.prepareWithdrawal(request);const plan=f.owner.ownerPlan(request.ownerOperationRef);
  f.setFault('before-signed-result');await assert.rejects(f.owner.withdrawalInput(request.ownerOperationRef),/WRITE_UNCERTAIN/);
  await f.recoverAbsent();await f.owner.resumeAuthorization(request.ownerOperationRef);assert.deepEqual(f.owner.ownerPlan(request.ownerOperationRef),plan);
  const sent=submission(f,request.ownerOperationRef,'W39');await f.owner.bindSubmission(sent);
  f.observe(request.ownerOperationRef,success(f,request.ownerOperationRef,sent,'W39'));f.setFault('after');
  await assert.rejects(f.owner.reconcile(request.ownerOperationRef),/WRITE_UNCERTAIN/);await f.reopen();
  assert.equal(f.owner.privateBalance().notes.find(n=>n.noteId===source.noteId).status,'WITHDRAWN');
  assert.equal((await f.owner.bindSubmission(sent)).dispatchAllowed,false);
});
