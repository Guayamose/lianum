import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {openTrustedOwnerDraft,recoverUncommittedOwnerDraft,objectDigest} from '../../../../engine/src/execution/balances/generic-balance-custody.mjs';
import {setup,fund,prepare,terms,submission,success,h,ledger} from './generic-balance-fixtures.mjs';
import {signature,freshKey} from '../../../../engine/src/notes/private-note-encoding.mjs';
import {PrivateNoteTree} from '../../../../engine/src/notes/private-note-tree.mjs';

test('D26 credits exact deposit despite an unrelated canonical pool transition after preparation',async t=>{
  const f=await setup(t),reference='funding-concurrent';
  await f.owner.prepareFunding({ownerOperationRef:reference,identitySHA256:objectDigest(f.id),amount:'50000',epoch:'10'});
  await f.owner.depositInput(reference);const request=submission(f,reference,'D26');await f.owner.bindSubmission(request);
  const other='0x'+h('unrelated funded note'),emptyRoot=new PrivateNoteTree().root,newRoot=new PrivateNoteTree([other]).root;
  f.snapshot=ledger(f.id,{commitments:[other],sequence:'1',outputs:1,backing:'7000',roots:[emptyRoot,newRoot]});
  const observed=success(f,reference,request,'D26');f.observe(reference,observed);
  await f.owner.reconcile(reference);assert.equal(f.owner.privateBalance().available,'50000');
});

test('D26 epoch renewal retains source/key/amount and cannot clear a submission latch',async t=>{
  const f=await setup(t),reference='funding-renewal';
  await f.owner.prepareFunding({ownerOperationRef:reference,identitySHA256:objectDigest(f.id),amount:'50000',epoch:'10'});
  const first=await f.owner.depositInput(reference),original=(await f.vault.read(f.password)).data.notes;
  await assert.rejects(f.owner.renewFundingEpoch({ownerOperationRef:reference,epoch:'11'}),/RENEWAL_EPOCH/);
  for(const epoch of ['11','12']){
    f.snapshot=ledger(f.id,{timestamp:String(BigInt(epoch)*600n)});
    await f.owner.renewFundingEpoch({ownerOperationRef:reference,epoch});
    const witness=await f.owner.depositInput(reference);assert.equal(witness.epoch,epoch);
    assert.deepEqual(witness.output,first.output);assert.equal(witness.amount,first.amount);
  }
  assert.deepEqual((await f.vault.read(f.password)).data.notes,original);
  await f.reopen();const request=submission(f,reference,'D26');await f.owner.bindSubmission(request);
  f.snapshot=ledger(f.id,{timestamp:'7800'});
  await assert.rejects(f.owner.renewFundingEpoch({ownerOperationRef:reference,epoch:'13'}),/RENEWAL_STAGE/);
  assert.equal((await f.owner.bindSubmission(request)).dispatchAllowed,false);
});

test('native preparation salts and exact capsule inputs persist with original A0 across restart',async t=>{
  const f=await setup(t),source=await fund(f),recipient=freshKey(),reference='native-persist-reference';
  const config={scope:f.id.scope,policy:f.id.policy,asset:f.id.asset.identity,hubDomain:f.id.hubDomain,
    registryCommitment:f.id.registryCommitment,operationId:h(reference),fundingNotBefore:'5900',fundingValidUntil:'6200',settleBefore:'6500',
    nodes:[{id:'native-leg',dependsOn:[],evidencePolicy:h('native evidence'),actionTemplate:{chainDomain:h('chain'),signerIdentity:h('signer'),
      sourceCommitment:h('source'),destinationCommitment:h('destination'),amount:'9000',custodyKind:1,custodyCommitment:h('custody'),
      executionFrom:'6250',executionUntil:'6400'},recipientOffer:{x:recipient.x.toString('hex'),y:recipient.y.toString('hex'),value:'20000',
      secret:h('payout secret'),randomness:h('payout randomness')}}]};
  const request={ownerOperationRef:reference,identitySHA256:objectDigest(f.id),sourceNoteId:source.noteId,nativeConfig:config};
  await f.owner.prepareNativeOperation(request);const first=(await f.vault.read(f.password)).data.operations.at(-1).nativePreparation;
  const invoices=f.owner.invoiceRequests(reference),nativeInvoices=f.owner.nativeInvoiceRequests(reference);
  const signed=await f.owner.authorizeOperation({ownerOperationRef:reference,
    invoiceSignatures:invoices.map(v=>signature(recipient,Buffer.from(v.message,'hex')).toString('hex'))});
  const plan=f.owner.ownerPlan(reference),authorizationProof={publicInputs:plan.authorizationPublicInputs,proofFields:Array(458).fill('0'),vkFields:Array(115).fill('0')};
  const capsule=f.owner.nativeCapsuleInputs({ownerOperationRef:reference,authorizationProof});assert.equal(capsule.expectedPublicInputs.length,129);
  assert.equal(nativeInvoices[0].invoice.action.receiptRho,first.nodes[0].action.receiptRho);
  await f.reopen();await f.owner.prepareNativeOperation(request);
  assert.deepEqual((await f.vault.read(f.password)).data.operations.at(-1).nativePreparation,first);
  assert.deepEqual(await f.owner.resumeAuthorization(reference),signed);
  assert.deepEqual(f.owner.nativeCapsuleInputs({ownerOperationRef:reference,authorizationProof}),capsule);
  assert.doesNotMatch(JSON.stringify(f.publicView.operation(reference)),/receiptRho|salt|graph|secret|capsule/i);
  const changed=structuredClone(request);changed.nativeConfig.nodes[0].actionTemplate.amount='9001';
  await assert.rejects(f.owner.prepareNativeOperation(changed),/REFERENCE_REUSE/);
  const badProof=structuredClone(authorizationProof);badProof.publicInputs[0]='1';
  assert.throws(()=>f.owner.nativeCapsuleInputs({ownerOperationRef:reference,authorizationProof:badProof}),/A0_STATEMENT/);
});

test('50000 funding, exact 20000 S66 spend, reuse actual 30000 change for distinct 12000 intent',async t=>{
  const f=await setup(t),source=await fund(f);assert.equal(f.owner.privateBalance().available,'50000');
  const p=await prepare(f,source,'operation-one',20000),before=f.owner.privateBalance();
  assert.equal(before.available,'0');assert.equal(before.locked,'50000');
  assert.deepEqual(before.notes.filter(n=>n.role!=='SOURCE').map(n=>[n.value,n.status]),[['30000','UNISSUED'],['20000','UNISSUED']]);
  const witness=await f.owner.authorizeOperation(p.authorization);assert.deepEqual(witness,p.signed,'exact repeat preserves original signature');
  const cp=f.owner.checkpoint();await f.owner.prepareOperation(p.request);assert.deepEqual(f.owner.checkpoint(),cp,'repeat makes no notes/write');
  assert.equal((await f.owner.bindSubmission(p.submission)).dispatchAllowed,true);
  assert.equal((await f.owner.bindSubmission(p.submission)).dispatchAllowed,false);
  const o=success(f,'operation-one',p.submission);f.observe('operation-one',o);await f.owner.reconcile('operation-one');f.snapshot=o.after;
  const change=f.owner.privateBalance().notes.find(n=>n.status==='AVAILABLE');assert.equal(change.value,'30000');
  const second=await prepare(f,change,'operation-two',12000);await f.owner.bindSubmission(second.submission);
  const o2=success(f,'operation-two',second.submission);f.observe('operation-two',o2);await f.owner.reconcile('operation-two');f.snapshot=o2.after;
  const balance=f.owner.privateBalance();assert.equal(balance.available,'18000');assert.equal(balance.locked,'0');
  assert.equal(20000+12000+Number(balance.available),50000);assert.equal(balance.notes.filter(n=>n.status==='SPENT_INTERNALLY').length,2);
  assert.equal(balance.notes.filter(n=>n.role==='RECOVERY'&&n.status==='UNISSUED').length,2);
  await f.reopen();assert.equal(f.owner.privateBalance().available,'18000');
  const publicText=JSON.stringify(f.publicView);assert.equal(publicText,'{}');
  const projection=f.publicView.operation('operation-two');assert.deepEqual(Object.keys(projection).sort(),['dispatchAllowed','kind','ownerOperationRef','reconcileRequired','stage']);
  assert.doesNotMatch(JSON.stringify(projection),/graph|privateKey|secret|opening|nonce|signature/i);
  const ciphertext=await readFile(f.path,'utf8');assert.doesNotMatch(ciphertext,/PRIVATE KEY|30000|operation-one|reserveSecret/);
});

test('wrong identity, changed request, competing lock and replayed input fail closed',async t=>{
  const f=await setup(t),source=await fund(f),p=await prepare(f,source,'operation-lock',20000);
  await assert.rejects(f.owner.prepareOperation({...p.request,identitySHA256:h('other pool')}),/REQUEST_IDENTITY/);
  await assert.rejects(f.owner.prepareOperation({...p.request,terms:{...p.request.terms,budget:'19999'}}),/REFERENCE_REUSE/);
  await assert.rejects(f.owner.prepareOperation({...p.request,ownerOperationRef:'operation-compete',terms:{...p.request.terms,operationId:h('compete')}}),/SOURCE_UNAVAILABLE/);
  await f.owner.bindSubmission(p.submission);const o=success(f,'operation-lock',p.submission);f.observe('operation-lock',o);await f.owner.reconcile('operation-lock');f.snapshot=o.after;
  await assert.rejects(f.owner.prepareOperation({...p.request,ownerOperationRef:'operation-replay',terms:{...p.request.terms,operationId:h('replay')}}),/SOURCE_UNAVAILABLE/);
  const prior=f.owner.privateBalance();assert.equal(prior.available,'30000');
  const wrong={...f.id,pool:'22'.repeat(20)};
  await assert.rejects(openTrustedOwnerDraft({...f.config,identity:wrong,create:false,checkpoint:f.checkpoint},f.deps),/POOL_SCOPE/);
  await assert.rejects(openTrustedOwnerDraft({...f.config,create:false,checkpoint:{...f.checkpoint,identitySHA256:h('wrong')}},f.deps),/CHECKPOINT_IDENTITY/);
  await assert.rejects(openTrustedOwnerDraft({...f.config,create:false,checkpoint:{...f.checkpoint,acknowledged:{revision:0,stateSHA256:h('stale')}}},f.deps),/CHECKPOINT/);
});

test('lost response remains UNKNOWN across restart; unspent/spent bits and malformed transitions cannot credit change',async t=>{
  const f=await setup(t),source=await fund(f),p=await prepare(f,source,'operation-unknown',20000);
  await f.owner.bindSubmission(p.submission);await f.owner.markUnknown('operation-unknown');await f.reopen();
  assert.equal((await f.owner.reconcile('operation-unknown')).stage,'UNKNOWN');
  assert.equal((await f.owner.bindSubmission(p.submission)).dispatchAllowed,false);
  for(const o of [{unspent:true},{spent:true}]){f.observe('operation-unknown',o);await assert.rejects(f.owner.reconcile('operation-unknown'),/FIELDS/);}
  const valid=success(f,'operation-unknown',p.submission);
  const mutations=[o=>o.transaction.calldata+='00',o=>o.transaction.to='33'.repeat(20),o=>o.identitySHA256=h('wrong asset'),
    o=>o.receipt.status=0,o=>o.stateAdvanced.root='0x'+h('bad root'),o=>o.transition.spentNullifiers=[h('bad nf')],
    o=>o.transition.insertedCommitments.reverse(),o=>o.after.canonicalBlockHashAfter=h('reorg'),
    o=>o.before=ledger(f.id),o=>o.stateAdvanced.sequence='99'];
  for(const mutate of mutations){const o=structuredClone(valid);mutate(o);f.observe('operation-unknown',o);
    await assert.rejects(f.owner.reconcile('operation-unknown'));assert.equal(f.owner.privateBalance().available,'0');assert.equal(f.owner.privateBalance().locked,'50000');}
  f.observe('operation-unknown',valid);await f.owner.reconcile('operation-unknown');assert.equal(f.owner.privateBalance().available,'30000');
});

test('zero change is canonical unspendable padding with no note or key',async t=>{
  const f=await setup(t),source=await fund(f),p=await prepare(f,source,'operation-sendmax',50000);
  assert.deepEqual(p.signed.ownerWitness.changeNote,{type:4,rho:'0'.repeat(64),x:'0'.repeat(64),y:'0'.repeat(64),value:'0',secret:'0'.repeat(64)});
  assert.equal(f.owner.privateBalance().notes.some(n=>n.value==='0'||n.role==='CHANGE'),false);
  await f.owner.bindSubmission(p.submission);const o=success(f,'operation-sendmax',p.submission);f.observe('operation-sendmax',o);
  await f.owner.reconcile('operation-sendmax');assert.equal(f.owner.privateBalance().available,'0');
  const stored=await f.vault.read(f.password);assert.equal(stored.data.notes.length,2);
  assert.ok(stored.data.notes.every(n=>n.privateKeyPem.includes('PRIVATE KEY')));
});

test('immutable authorization, proof/calldata/guard latch rejects all substitution',async t=>{
  const f=await setup(t),source=await fund(f),p=await prepare(f,source,'operation-binding',20000);
  for(const mutate of [r=>r.publicInputs[32]='1',r=>r.calldata+='00',r=>r.authorizationSHA256=h('other A0')]){
    const r=structuredClone(p.submission);mutate(r);await assert.rejects(f.owner.bindSubmission(r));}
  await f.owner.bindSubmission(p.submission);
  const alt=submission(f,'operation-binding');alt.proofHex='beef';await assert.rejects(f.owner.bindSubmission(alt),/CALLDATA/);
  await assert.rejects(f.owner.authorizeOperation({...p.authorization,invoiceSignatures:['0'.repeat(128)]}),/AUTHORIZATION_REUSE/);
  const stored=await f.vault.read(f.password);assert.equal(new Set(stored.data.notes.map(n=>n.privateKeyPem)).size,3,'independent per-note keys');
  assert.equal(stored.data.operations.at(-1).submission.publicInputs.length,66);
  const changed=structuredClone(p.request);changed.privateKeyPem='injected';await assert.rejects(f.owner.prepareOperation(changed),/FIELDS/);
  for(const field of ['path','runtime','sign']){const bad=structuredClone(p.request);bad[field]='injected';await assert.rejects(f.owner.prepareOperation(bad),/FIELDS/);}
});

test('write-before-ack: after-rename and readback faults retain original authorization, notes and once-only dispatch',async t=>{
  const f=await setup(t),source=await fund(f),p=await prepare(f,source,'operation-write',20000);
  f.setFault('after');await assert.rejects(f.owner.bindSubmission(p.submission),/WRITE_UNCERTAIN/);
  assert.equal(f.publicView.summary().storageAvailable,false);assert.ok(f.checkpoint.pending);
  assert.throws(()=>f.owner.privateBalance(),/WRITE_UNCERTAIN/);
  await f.reopen();assert.equal(f.owner.privateBalance().locked,'50000');
  assert.equal((await f.owner.bindSubmission(p.submission)).dispatchAllowed,false);
  f.setFault('readback');await assert.rejects(f.owner.markUnknown('operation-write'),/WRITE_UNCERTAIN/);
  await f.owner.authenticateCommittedWrite();assert.equal(f.owner.projection('operation-write').stage,'UNKNOWN');
  const o=success(f,'operation-write',p.submission);f.observe('operation-write',o);f.setFault('keeper-ack');
  await assert.rejects(f.owner.reconcile('operation-write'),/WRITE_UNCERTAIN/);await f.reopen();
  assert.equal(f.owner.privateBalance().available,'30000');assert.equal((await f.owner.reconcile('operation-write')).stage,'CONFIRMED');
});

test('absent preparation cannot silently roll back; explicit restart tombstones it and preserves existing funds',async t=>{
  const f=await setup(t),source=await fund(f),original=await f.vault.read(f.password),{terms:t1}=terms('before-write',20000);
  f.setFault('before');await assert.rejects(f.owner.prepareOperation({ownerOperationRef:'operation-uncommitted',identitySHA256:objectDigest(f.id),sourceNoteId:source.noteId,terms:t1}),/WRITE_UNCERTAIN/);
  assert.deepEqual(await f.vault.read(f.password),original);await assert.rejects(f.owner.authenticateCommittedWrite(),/NOT_COMMITTED/);
  await assert.rejects(openTrustedOwnerDraft({...f.config,create:false,checkpoint:f.checkpoint},f.deps),/CHECKPOINT/);
  assert.equal(f.publicView.summary().storageAvailable,false);
  const recovered=await f.recoverAbsent();assert.equal(recovered.recovery.disposition,'PREPARATION_TOMBSTONED');
  assert.equal(f.owner.privateBalance().available,'50000');assert.equal(f.owner.privateBalance().notes.length,1);
  assert.equal(f.owner.projection('operation-uncommitted').stage,'ABANDONED');
  await assert.rejects(f.owner.prepareOperation({ownerOperationRef:'operation-uncommitted',identitySHA256:objectDigest(f.id),sourceNoteId:source.noteId,terms:t1}),/TOMBSTONED/);
  await prepare(f,source,'operation-after-tombstone',10000);assert.equal(f.owner.privateBalance().locked,'50000');
});

test('interrupted SIGNING resumes only the durable message/invoices with the original notes and keys',async t=>{
  const f=await setup(t),source=await fund(f),{key,terms:t1}=terms('signing-gap',20000),reference='operation-signing-gap';
  await f.owner.prepareOperation({ownerOperationRef:reference,identitySHA256:objectDigest(f.id),sourceNoteId:source.noteId,terms:t1});
  const input={ownerOperationRef:reference,invoiceSignatures:f.owner.invoiceRequests(reference).map(r=>signature(key,Buffer.from(r.message,'hex')).toString('hex'))};
  f.setFault('after');await assert.rejects(f.owner.authorizeOperation(input),/WRITE_UNCERTAIN/);await f.reopen();
  assert.equal(f.owner.projection(reference).stage,'SIGNING');await assert.rejects(f.owner.authorizeOperation(input),/CUSTODY_STAGE/);
  assert.equal(f.owner.privateBalance().locked,'50000');assert.equal(f.owner.privateBalance().notes.length,3);
  const record=await f.vault.read(f.password);assert.equal(record.data.operations.at(-1).authorization,null);
  const signed=await f.owner.resumeAuthorization(reference),after=await f.vault.read(f.password);
  assert.deepEqual(after.data.notes,record.data.notes);assert.deepEqual(after.data.operations.at(-1).signingIntent,record.data.operations.at(-1).signingIntent);
  assert.deepEqual(signed.signatures.invoiceSignatures.slice(0,1),input.invoiceSignatures);
  assert.deepEqual(await f.owner.resumeAuthorization(reference),signed);
});

test('absent signed result permits new signature on exact intent; committed result is reused verbatim',async t=>{
  const f=await setup(t),source=await fund(f),{key,terms:t1}=terms('signed-result-gap',20000),reference='operation-signed-result';
  await f.owner.prepareOperation({ownerOperationRef:reference,identitySHA256:objectDigest(f.id),sourceNoteId:source.noteId,terms:t1});
  const input={ownerOperationRef:reference,invoiceSignatures:f.owner.invoiceRequests(reference).map(r=>signature(key,Buffer.from(r.message,'hex')).toString('hex'))};
  f.setFault('before-signed-result');await assert.rejects(f.owner.authorizeOperation(input),/WRITE_UNCERTAIN/);
  const lost=f.lostCandidate,old=await f.vault.read(f.password);assert.equal(old.data.operations.at(-1).stage,'SIGNING');
  await assert.rejects(openTrustedOwnerDraft({...f.config,create:false,checkpoint:f.checkpoint},f.deps),/CHECKPOINT/);
  await f.recoverAbsent();f.setFault('after-signed-result');await assert.rejects(f.owner.resumeAuthorization(reference),/WRITE_UNCERTAIN/);
  const committed=await f.vault.read(f.password);await f.reopen();const signed=await f.owner.resumeAuthorization(reference);
  assert.deepEqual(signed,committed.data.operations.at(-1).authorization);
  assert.deepEqual(signed.authorizationStatement,lost.operations.at(-1).authorization.authorizationStatement);
  assert.deepEqual(signed.ownerWitness,lost.operations.at(-1).authorization.ownerWitness);
  assert.deepEqual(committed.data.notes,old.data.notes);assert.equal(f.owner.privateBalance().locked,'50000');
});

test('D26 absent signed result resumes the same deposit statement and original source key',async t=>{
  const f=await setup(t),reference='funding-signature-gap';
  await f.owner.prepareFunding({ownerOperationRef:reference,identitySHA256:objectDigest(f.id),amount:'50000',epoch:'10'});
  f.setFault('before-signed-result');await assert.rejects(f.owner.depositInput(reference),/WRITE_UNCERTAIN/);
  const original=await f.vault.read(f.password);await f.recoverAbsent();const witness=await f.owner.resumeAuthorization(reference);
  assert.deepEqual((await f.vault.read(f.password)).data.notes,original.data.notes);
  assert.deepEqual(witness.scope,f.lostCandidate.operations.at(-1).depositWitness.scope);
  assert.deepEqual(witness.output,f.lostCandidate.operations.at(-1).depositWitness.output);
  assert.equal(witness.amount,'50000');assert.deepEqual(await f.owner.depositInput(reference),witness);
});

test('in-memory absent preparation resumes its exact keys; absent dispatch may grant only the initial send',async t=>{
  const f=await setup(t),source=await fund(f),{terms:t1}=terms('in-memory-gap',20000),reference='operation-memory-gap';
  const request={ownerOperationRef:reference,identitySHA256:objectDigest(f.id),sourceNoteId:source.noteId,terms:t1};
  f.setFault('before');await assert.rejects(f.owner.prepareOperation(request),/WRITE_UNCERTAIN/);
  const expected=f.owner.checkpoint().pending.stateSHA256;
  assert.equal((await f.owner.resumePendingWrite()).dispatchAllowed,false);
  assert.equal(objectDigest((await f.vault.read(f.password)).data),expected);await f.owner.prepareOperation(request);
  // A separately fresh fixture exercises the first-dispatch recovery boundary.
  const g=await setup(t),s=await fund(g),p=await prepare(g,s,'operation-dispatch-gap',20000);
  g.setFault('before');await assert.rejects(g.owner.bindSubmission(p.submission),/WRITE_UNCERTAIN/);
  const recovery=await g.owner.resumePendingWrite();assert.equal(recovery.dispatchAllowed,true);
  assert.equal((await g.owner.bindSubmission(p.submission)).dispatchAllowed,false);
  await assert.rejects(g.owner.resumePendingWrite(),/NO_PENDING_WRITE/);
});

test('explicit absent-latch restart allows first dispatch; absent UNKNOWN write never clears a prior latch',async t=>{
  const f=await setup(t),source=await fund(f),p=await prepare(f,source,'operation-latch-restart',20000);
  f.setFault('before');await assert.rejects(f.owner.bindSubmission(p.submission),/WRITE_UNCERTAIN/);await f.recoverAbsent();
  assert.equal(f.owner.projection('operation-latch-restart').stage,'AUTHORIZED');
  assert.equal((await f.owner.bindSubmission(p.submission)).dispatchAllowed,true);
  f.setFault('before');await assert.rejects(f.owner.markUnknown('operation-latch-restart'),/WRITE_UNCERTAIN/);await f.recoverAbsent();
  assert.equal(f.owner.projection('operation-latch-restart').stage,'UNKNOWN');assert.equal(f.owner.privateBalance().locked,'50000');
  assert.equal((await f.owner.bindSubmission(p.submission)).dispatchAllowed,false);
  assert.equal((await f.owner.reconcile('operation-latch-restart')).stage,'UNKNOWN');
});

test('absent recovery-write may retry its tombstone; mismatched keeper identity/base are rejected',async t=>{
  const f=await setup(t),source=await fund(f),{terms:t1}=terms('repeat-recovery',20000);
  f.setFault('before');await assert.rejects(f.owner.prepareOperation({ownerOperationRef:'operation-recovery-gap',identitySHA256:objectDigest(f.id),sourceNoteId:source.noteId,terms:t1}),/WRITE_UNCERTAIN/);
  const cp=f.checkpoint;
  await assert.rejects(recoverUncommittedOwnerDraft({...f.config,create:false,checkpoint:{...cp,identitySHA256:h('changed')}},f.deps),/CHECKPOINT_IDENTITY/);
  await assert.rejects(recoverUncommittedOwnerDraft({...f.config,create:false,checkpoint:{...cp,acknowledged:{...cp.acknowledged,stateSHA256:h('changed')}}},f.deps),/CHECKPOINT/);
  f.setFault('before');await assert.rejects(f.recoverAbsent(),/WRITE_UNCERTAIN/);
  await f.recoverAbsent();assert.equal(f.owner.projection('operation-recovery-gap').stage,'ABANDONED');
  assert.equal(f.owner.privateBalance().available,'50000');assert.equal((await f.vault.read(f.password)).data.writeRecoveries.length,1);
});

test('stale competing owner and ciphertext corruption fail closed without replacing custody',async t=>{
  const f=await setup(t),source=await fund(f),second=await openTrustedOwnerDraft({...f.config,create:false,checkpoint:f.checkpoint},f.deps);
  t.after(()=>second.owner.close());await prepare(f,source,'operation-first-owner',20000);
  const {terms:t2}=terms('other-owner',20000);await assert.rejects(second.owner.prepareOperation({ownerOperationRef:'operation-other-owner',identitySHA256:objectDigest(f.id),sourceNoteId:source.noteId,terms:t2}),/STORAGE_CHANGED/);
  const encrypted=await readFile(f.path,'utf8'),parsed=JSON.parse(encrypted);
  const field=Object.keys(parsed).find(k=>typeof parsed[k]==='string'&&parsed[k].length>100);assert.ok(field);
  parsed[field]=parsed[field].slice(0,-2)+'ff';await writeFile(f.path,JSON.stringify(parsed));
  await assert.rejects(f.owner.prepareOperation({ownerOperationRef:'operation-tampered',identitySHA256:objectDigest(f.id),sourceNoteId:source.noteId,terms:t2}));
  await writeFile(f.path,encrypted);
  assert.equal(f.publicView.summary().storageAvailable,false);assert.throws(()=>f.owner.privateBalance(),/WRITE_UNCERTAIN/);
  await f.reopen();assert.equal(f.owner.privateBalance().locked,'50000');
});
