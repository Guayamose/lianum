import {describeWrappedResumeSuccessorV1} from './wrapped-withdrawal-successor-review-v1.mjs';
import {projectStoredWrappedResumeAdmissionV1} from './wrapped-withdrawal-admission-read-v1.mjs';
import { inspectWrappedInstallationSourcesV2 } from '@lianum/components/verification/wrapped-installation';
/** Original wrapped note withdrawal service. Source/change and the second
 * recipient keep distinct private process brands. No public amount, destination,
 * proof, key, observer, callback, restore or send-retry input is accepted. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describeWrappedWithdrawalResumeReviewV1 } from './wrapped-withdrawal-resume-review-v1.mjs';
import { assertWrappedWithdrawalReleasedV1 } from './wrapped-withdrawal-release-v1.mjs';
const owned=new WeakMap(),owners=new WeakSet(),recipients=new WeakSet();
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const sha=value=>createHash('sha256').update(canonical(value)).digest('hex'),copy=value=>structuredClone(value),bare=value=>value.slice(2);
const fail=code=>{throw Object.assign(new Error(code),{code});},need=(value,code)=>{if(!value)fail(code);};
export function assertOwnedWrappedWithdrawalSessionV1(session){const s=owned.get(session);need(s&&!s.closed(),'WRAPPED_WITHDRAWAL_ORIGINAL_SESSION_REQUIRED');s.live();}
export function wrappedWithdrawalSessionBindingV1(session){assertOwnedWrappedWithdrawalSessionV1(session);return owned.get(session).binding;}
export async function createWrappedWithdrawalSessionV1(input){assert.equal(arguments.length,1);return withdrawalSession(input,null);}
async function withdrawalSession(input,recovery){
await assertWrappedWithdrawalReleasedV1();
 const { exactRecord }=await import('@lianum/components/encoding/commitments');
 const { assertOwnedWrappedClaimWalletSystemV1 }=await import('../../operations/deployments/wrapped/wrapped-claim-system-v1.mjs');
 const { assertOwnedWrappedClaimOwnerProcessV1,assertWrappedClaimOwnerOriginalLifetimeV1 }=await import('../../custody/processes/wrapped-claim-owner-process-v1.mjs');
 const { assertOwnedWrappedWalletAccountAuthorityV1,wrappedWalletAccountManualGraphDetailsV1 }=await import("../../accounts/authority/native-value-account-authority-v2.mjs");
 const { assertOwnedNativeRecipientProcess,assertOriginalNativeRecipientRecoveryV1 }=await import('../../execution/native/recipients/native-recipient-process.mjs');
 const { assertOwnedNativeValueProviderCustody,ownedNativeValueProviderCustodyReview }=await import('../../chains/shared/dispatch/wrapped-claim-dispatch-owner-v1.mjs');
 const { createWrappedWalletStateReaderV1 }=await import('../../execution/wrapped/reconciliation/wrapped-wallet-state-v1.mjs');
 const { createClaimRecordStore,openClaimRecordStore }=await import('@lianum/engine/storage/records');
 const { createProofProcess }=await import('@lianum/proofs/execution/proof-process');
 const { walletInputPublicWords,decodeWalletPoolInputs }=await import('@lianum/engine/wallet/notes/private-wallet-note-encoding');
 const { encodeFlatTransaction }=await import('../../execution/encoding/transaction-codec.mjs');
 exactRecord(input,['runtime','system','owner','account','journal']);exactRecord(input.journal,['path','password']);
 const {runtime,system,owner,account}=input,pool=system.pools[1],journal={...input.journal};
 assertOwnedWrappedClaimWalletSystemV1(runtime,system);assertOwnedWrappedClaimOwnerProcessV1(owner,{runtime,system,poolIndex:1});
 assertOwnedWrappedWalletAccountAuthorityV1(account,{runtime,system,poolIndex:1,owner});need(!owners.has(owner),'WRAPPED_WITHDRAWAL_OWNER_ALREADY_LEASED');owners.add(owner);
 const originalOwner=owner.report(),identity=(await owner.publicView.summary()).identitySHA256;
 const currentBinding=Object.freeze({profile:'ORIGINAL_WRAPPED_NOTE_WITHDRAWAL_SESSION_V1',hub:system.hub.address,pool:pool.address,
  assetId:account.assetId,asset:copy(account.registry[0]),ownerIdentitySHA256:identity,processIdentitySHA256:originalOwner.processIdentitySHA256});
 const binding=recovery?Object.freeze(copy(recovery.record.binding)):currentBinding;
 if(recovery){const {processIdentitySHA256:_old,...old}=binding,{processIdentitySHA256:_new,...current}=currentBinding;assert.deepEqual(old,current,'WRAPPED_WITHDRAWAL_ORIGINAL_BINDING_CHANGED');assertWrappedClaimOwnerOriginalLifetimeV1(owner,recovery.record.ownerLifetime);}
 inspectWrappedInstallationSourcesV2();const store=recovery?await openClaimRecordStore({path:journal.path,password:journal.password,identity:binding}):await createClaimRecordStore({path:journal.path,password:journal.password,identity:binding},
  {profile:binding.profile,recipient:null,operations:[]});
 const reader=await createWrappedWalletStateReaderV1({runtime,system,poolIndex:1});
 let record=await store.read(),tail=Promise.resolve(),pending=0,busy=false,closed=false,closing=false,fault=false,recipient=null,recipientBinding=null,activeProof=null,closePromise=null,ownerReadPending=false,capturing=false,captureStarted=false;
 if(recovery){assert.deepEqual({revision:record.revision,commitment:record.commitment},recovery.record.checkpoint,'WRAPPED_WITHDRAWAL_ORIGINAL_CHECKPOINT_CHANGED');assert.deepEqual(record.data.recipient,recovery.record.recipientBinding);recipient=recovery.recipient;recipientBinding=copy(recovery.record.recipientBinding);if(recipientBinding){assertOriginalNativeRecipientRecoveryV1(recipient,{originalProcessId:recipientBinding.pid,originalLifetimeIdentity:recipientBinding.originalLifetimeIdentity});need(!recipients.has(recipient),'WRAPPED_WITHDRAWAL_RECIPIENT_ALREADY_LEASED');recipients.add(recipient);}else assert.equal(recipient,null);}
 const lifetimeRegistry=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
 let lifetimeState={journal:{...journal},checkpoint:{revision:record.revision,commitment:record.commitment},pendingUpdate:null},lifetimeHandle;
 if(recovery){const original=await lifetimeRegistry.readWrappedPrivateLifetimePartV1(runtime,'wallet-withdrawal',binding);assert.equal(sha(original.privateState),sha(lifetimeState),'WRAPPED_WITHDRAWAL_REGISTRY_CHECKPOINT_CHANGED');lifetimeHandle=original.handle;}
 else lifetimeHandle=await lifetimeRegistry.retainWrappedPrivateLifetimePartV1(runtime,'wallet-withdrawal',binding,lifetimeState);
 async function retainLifetime(next){await lifetimeRegistry.updateWrappedPrivateLifetimePartV1(lifetimeHandle,next);lifetimeState=copy(next);}
 const live=()=>{need(!closed&&!fault,'WRAPPED_WITHDRAWAL_UNAVAILABLE');assertOwnedWrappedClaimWalletSystemV1(runtime,system);
  assertOwnedWrappedWalletAccountAuthorityV1(account,{runtime,system,poolIndex:1,owner});
  if(recovery)assertWrappedClaimOwnerOriginalLifetimeV1(owner,recovery.record.ownerLifetime);else assert.equal(owner.report().processIdentitySHA256,originalOwner.processIdentitySHA256);};
 const enqueue=work=>{const next=tail.then(work);tail=next.catch(()=>{});return next;};
 async function read(){live();try{const actual=await store.read();assert.deepEqual(actual,record);return actual.data;}catch(error){fault=true;throw error;}}
 async function change(work){await read();try{const data=copy(record.data);work(data);await retainLifetime({...lifetimeState,pendingUpdate:{revision:record.revision+1,dataSHA256:sha(data)}});record=await store.update(record.revision,()=>data);assert.deepEqual(await store.read(),record);await retainLifetime({...lifetimeState,checkpoint:{revision:record.revision,commitment:record.commitment},pendingUpdate:null});}catch(error){fault=true;throw error;}}
 const rowFor=id=>{const row=record.data.operations.find(row=>row.requestId===id);need(row,'WRAPPED_WITHDRAWAL_UNKNOWN_REQUEST');return row;};
 function livePreparedActor(row){if(row.state!=='PREPARED'||closed||capturing)return false;
  if(row.role==='change'){const process=owner.report();return process.available&&process.processIdentitySHA256===row.terms.actor.processIdentitySHA256&&process.generation===row.terms.actor.generation;}
  if(!recipient)return false;const process=recipient.report();return !process.exited&&sha({profile:process.profile,pid:process.pid,processLifetimeIdentity:process.processLifetimeIdentity,pool:pool.address})===row.terms.actor.processIdentitySHA256;
 }
 const projection=row=>({resume:projectStoredWrappedResumeAdmissionV1(row,{revision:record.revision,commitment:record.commitment}),executionAvailable:livePreparedActor(row),interruption:row.progress?{version:1,signingStarted:row.progress.signingStarted,authorizationRetained:row.progress.authorizationRetained,proofGenerationStarted:row.progress.proofGenerationStarted,proofRetained:row.progress.proofRetained,broadcastStarted:row.progress.broadcastStarted,canonicalNullifier:row.progress.canonicalNullifier,authorizationJobSHA256:row.progress.authorizationJobSHA256,observedHead:copy(row.retainedAuthorizationObservedHead??null)}:null,requestId:row.requestId,role:row.role,state:row.state,terms:copy(row.terms),termsSHA256:row.termsSHA256,
  transactionHash:row.transactionHash,errorCode:row.errorCode});
 const journalView=()=>({version:1,profile:binding.profile,resumeActions:{manualReview:true,continuationReleased:RESUME_CONTINUATION_RELEASE==='LIANUM_WRAPPED_ORIGINAL_PROOF_RESUME_SOURCE_V1'},phase:closed?'CLOSED':fault?'UNAVAILABLE':'READY',storageAvailable:!closed&&!fault,
  busy,queued:pending-Number(busy),observation:'ORIGINAL_RETAINED_JOURNAL_ONLY',operations:record.data.operations.map(projection)});
 const recipientUnspent=(status,view)=>{assert.match(status.canonicalNullifier,/^[0-9a-f]{64}$/);need(!view.ledger.nullifiers.includes('0x'+status.canonicalNullifier),'WRAPPED_WITHDRAWAL_RECIPIENT_ALREADY_SPENT');};
 const effectReady=()=>{inspectWrappedInstallationSourcesV2();need(!closing&&!closed&&!capturing,'WRAPPED_WITHDRAWAL_CLOSING');};
 const mutationReady=()=>{const status=runtime.mutationStatus;need(status?.busy===false&&status.uncertain===false,'WRAPPED_WITHDRAWAL_RECEIVER_MUTATION_FENCED');};
 async function terms(role){
  live();effectReady();mutationReady();need(role==='change'||role==='recipient','WRAPPED_WITHDRAWAL_ROLE');
  const view=await reader.read();let note,actor;
  if(role==='change'){
   const status=owner.report();need(status.available,'WRAPPED_WITHDRAWAL_OWNER_UNAVAILABLE');
   const original=await owner.ownerView.preparationTerms({kind:'withdraw_change'});
   need(original.eligible&&original.note?.observedUnspent&&original.note.status==='AVAILABLE','WRAPPED_WITHDRAWAL_CHANGE_NOT_AVAILABLE');
   assert.equal(original.identitySHA256,identity);assert.equal(original.observed.blockHash,view.head.hash);assert.equal(original.observed.timestamp,view.head.timestamp);
   const packet=(await owner.roles.reservation()).select();
   note={commitment:packet.funding.value.changeCommitment,amount:original.note.amount,recipient:original.note.recipient};
   actor={kind:'ORIGINAL_WRAPPED_SOURCE_OWNER_CHANGE',identitySHA256:identity,processIdentitySHA256:status.processIdentitySHA256,generation:status.generation};
  }else{
   need(recipient&&recipientBinding,'WRAPPED_WITHDRAWAL_RECIPIENT_NOT_BOUND');assertOwnedNativeRecipientProcess(recipient);
   const process=recipient.report();need(!process.exited,'WRAPPED_WITHDRAWAL_RECIPIENT_UNAVAILABLE');if(recovery)assertOriginalNativeRecipientRecoveryV1(recipient,{originalProcessId:recipientBinding.pid,originalLifetimeIdentity:recipientBinding.originalLifetimeIdentity});else assert.equal(process.pid,recipientBinding.pid);
   const status=await recipient.withdrawalStatus();assert.equal(status.authorization,null,'WRAPPED_WITHDRAWAL_RECIPIENT_ALREADY_AUTHORIZED');
   assert.equal(status.scope,pool.domain.scope);assert.equal(status.policy,pool.domain.policy);assert.equal(status.payoutCommitment,recipientBinding.payoutCommitment);
   recipientUnspent(status,view);note={commitment:status.payoutCommitment,amount:status.amount,recipient:status.recipient};
   actor={kind:'ORIGINAL_GRAPH_PAYOUT_RECIPIENT',identitySHA256:recipientBinding.identitySHA256,processIdentitySHA256:sha({profile:process.profile,pid:process.pid,processLifetimeIdentity:process.processLifetimeIdentity,pool:pool.address}),generation:1};
  }
  assert.ok(view.ledger.commitments.includes('0x'+note.commitment));need(BigInt(note.amount)>0n,'WRAPPED_WITHDRAWAL_AMOUNT');
  assert.match(note.recipient,/^[0-9a-f]{40}$/);assert.notEqual(note.recipient,bare(pool.address));
  await reader.assertCurrent(view);effectReady();mutationReady();
  return Object.freeze({version:1,profile:'ORIGINAL_WRAPPED_WITHDRAWAL_TERMS_V1',role,actor,pool:pool.address,assetId:account.assetId,
   asset:copy(account.registry[0]),noteCommitment:note.commitment,amount:note.amount,recipient:note.recipient,
   epoch:String(BigInt(view.head.timestamp)/600n),head:copy(view.head),registryCommitment:bare(system.registryCommitment),claimAuthority:system.claims.authority.address});
 }
 function assertUnsent(row){need(['PREPARED','CANCELLED'].includes(row.state)&&row.proof===null&&row.calldata===null&&row.transactionHash===null,'WRAPPED_WITHDRAWAL_SIGNED_ORIGINAL_RECONCILIATION_REQUIRED');}
 function sameEconomics(old,next){for(const key of ['version','profile','role','pool','assetId','asset','noteCommitment','amount','recipient','registryCommitment','claimAuthority'])assert.deepEqual(next[key],old[key],'WRAPPED_WITHDRAWAL_ORIGINAL_ECONOMICS_CHANGED');assert.equal(next.actor.kind,old.actor.kind);assert.equal(next.actor.identitySHA256,old.actor.identitySHA256);}
 async function checkPrepared(row){
  live();effectReady();mutationReady();assert.equal(sha(row.terms),row.termsSHA256);const view=await reader.read();
  assert.deepEqual(view.head,row.terms.head,'WRAPPED_WITHDRAWAL_APPROVED_HEAD_CHANGED');assert.equal(String(BigInt(view.head.timestamp)/600n),row.terms.epoch);
  if(row.role==='change'){const process=owner.report();assert.equal(process.processIdentitySHA256,row.terms.actor.processIdentitySHA256);assert.equal(process.generation,row.terms.actor.generation);need(process.available,'WRAPPED_WITHDRAWAL_OWNER_UNAVAILABLE');}
  else{assertOwnedNativeRecipientProcess(recipient);const process=recipient.report();assert.equal(sha({profile:process.profile,pid:process.pid,processLifetimeIdentity:process.processLifetimeIdentity,pool:pool.address}),row.terms.actor.processIdentitySHA256);need(!process.exited,'WRAPPED_WITHDRAWAL_RECIPIENT_UNAVAILABLE');}
  assert.ok(view.ledger.commitments.includes('0x'+row.terms.noteCommitment));await reader.assertCurrent(view);effectReady();mutationReady();return view;
 }
 async function observeRetainedAuthorization(row){
  // This is a positive read of the original acknowledged signer record. A
  // missing RPC receipt or a false caller flag can never establish eligibility.
  need(row.progress?.version===1&&row.progress.signingStarted===true&&row.progress.broadcastStarted===false,'WRAPPED_WITHDRAWAL_ORIGINAL_SEND_RECONCILIATION_REQUIRED');
  const lifetime=await lifetimeRegistry.readWrappedPrivateLifetimePartV1(runtime,'wallet-withdrawal',binding);
  need(lifetime.privateState.pendingUpdate===null,'WRAPPED_WITHDRAWAL_PENDING_CHECKPOINT_UNRESOLVED');
  assert.deepEqual(lifetime.privateState.checkpoint,{revision:record.revision,commitment:record.commitment},'WRAPPED_WITHDRAWAL_LATEST_CHECKPOINT_REQUIRED');
  const native=runtime.transactions;need(Array.isArray(native),'WRAPPED_WITHDRAWAL_ORIGINAL_NATIVE_JOURNAL_REQUIRED');
  need(native.filter(entry=>entry.label==='wrapped-withdrawal-'+row.requestId).length===0,'WRAPPED_WITHDRAWAL_ORIGINAL_NATIVE_RECORD_EXISTS');
  effectReady();mutationReady();let retained,job;
  if(row.role==='change'){
   need(typeof owner.ownerProof.retainedWithdrawal==='function','WRAPPED_WITHDRAWAL_RETAINED_AUTHORIZATION_UNAVAILABLE');
   retained=await owner.ownerProof.retainedWithdrawal('change');
   need(retained.profile==='WRAPPED_RETAINED_WITHDRAWAL_WITNESS_V1'&&retained.kind==='withdraw_change'&&retained.operation?.stage==='AUTHORIZED'&&retained.operation.submission===null&&retained.operation.confirmation===null,'WRAPPED_WITHDRAWAL_RETAINED_AUTHORIZATION_UNAVAILABLE');
   assert.equal(retained.identitySHA256,identity);assert.equal(retained.note.commitment,row.terms.noteCommitment);assert.equal(retained.note.amount,row.terms.amount);assert.equal(retained.note.recipient,row.terms.recipient);job=retained.job;
  }else{
   need(recipient&&typeof recipient.retainedWithdrawal==='function','WRAPPED_WITHDRAWAL_RETAINED_AUTHORIZATION_UNAVAILABLE');
   assertOwnedNativeRecipientProcess(recipient);assertOriginalNativeRecipientRecoveryV1(recipient,{originalProcessId:recipientBinding.pid,originalLifetimeIdentity:recipientBinding.originalLifetimeIdentity});
   retained=await recipient.retainedWithdrawal();need(retained.status==='RETAINED'&&retained.originalStatus?.authorization&&retained.job,'WRAPPED_WITHDRAWAL_RETAINED_AUTHORIZATION_UNAVAILABLE');assert.equal(retained.profile,recipient.report().profile);
   assert.equal(retained.originalStatus.payoutCommitment,row.terms.noteCommitment);assert.equal(retained.originalStatus.amount,row.terms.amount);assert.equal(retained.originalStatus.recipient,row.terms.recipient);job=retained.job;
  }
  need(job&&Array.isArray(job.publicInputs),'WRAPPED_WITHDRAWAL_RETAINED_AUTHORIZATION_UNAVAILABLE');
  exactRecord(retained.checkpoint,['revision','stateSHA256']);need(Number.isSafeInteger(retained.checkpoint.revision)&&retained.checkpoint.revision>=0,'WRAPPED_WITHDRAWAL_RETAINED_CHECKPOINT');assert.match(retained.checkpoint.stateSHA256,/^[0-9a-f]{64}$/);
  assert.deepEqual(walletInputPublicWords('withdraw_balance',job.inputs),job.publicInputs,'WRAPPED_WITHDRAWAL_ORIGINAL_PUBLIC_INPUTS_CHANGED');
  const statement=decodeWalletPoolInputs('withdraw_balance',job.publicInputs),jobSHA256=sha(job);
  assert.equal(statement.scope,'0x'+pool.domain.scope);assert.equal(statement.policy,'0x'+pool.domain.policy);assert.equal(statement.epoch,row.terms.epoch);assert.equal(statement.amount,row.terms.amount);assert.equal(statement.recipient,'0x'+row.terms.recipient);
  const nullifier='0x'+(row.role==='change'?retained.note.canonicalNullifier:retained.originalStatus.canonicalNullifier);assert.equal(statement.nullifier,nullifier);
  if(row.progress.authorizationJobSHA256!==null)assert.equal(jobSHA256,row.progress.authorizationJobSHA256,'WRAPPED_WITHDRAWAL_ORIGINAL_JOB_CHANGED');
  if(row.authorizationJob!==null)assert.equal(jobSHA256,sha(row.authorizationJob),'WRAPPED_WITHDRAWAL_ORIGINAL_JOB_CHANGED');
  const view=await reader.read();need(BigInt(view.head.timestamp)/600n===BigInt(row.terms.epoch),'WRAPPED_WITHDRAWAL_ORIGINAL_EPOCH_REVIEW_REQUIRED');
  assert.equal(view.ledger.publicState.root,statement.root,'WRAPPED_WITHDRAWAL_ORIGINAL_ROOT_REQUIRED');
  need(view.ledger.commitments.includes('0x'+row.terms.noteCommitment)&&!view.ledger.nullifiers.includes(nullifier),'WRAPPED_WITHDRAWAL_ORIGINAL_NOTE_UNSPENT_REQUIRED');
  await reader.assertCurrent(view);effectReady();mutationReady();
  need(runtime.transactions.filter(entry=>entry.label==='wrapped-withdrawal-'+row.requestId).length===0,'WRAPPED_WITHDRAWAL_ORIGINAL_NATIVE_RECORD_EXISTS');
  return {retained,job,jobSHA256,nullifier,view};
 }
 async function reconcileRetainedAuthorization(row){
  need(!row.resumeAdmission,'WRAPPED_WITHDRAWAL_RESUME_ADMISSION_ALREADY_CONSUMED');
  const {retained,job,jobSHA256,nullifier,view}=await observeRetainedAuthorization(row);
  await change(data=>{const original=data.operations.find(value=>value.requestId===row.requestId);original.interruptionHistory??=[];need(original.interruptionHistory.length<32,'WRAPPED_WITHDRAWAL_INTERRUPTION_HISTORY_LIMIT');
   original.interruptionHistory.push({state:original.state,errorCode:original.errorCode,progress:copy(original.progress)});original.authorizationJob=copy(job);original.progress.authorizationRetained=true;original.progress.authorizationJobSHA256=jobSHA256;original.progress.canonicalNullifier=nullifier;
   original.retainedAuthorizationCheckpoint=copy(retained.checkpoint);original.retainedAuthorizationObservedHead=copy(view.head);original.state='LOCAL_PROOF_READY';original.errorCode=null;});
  // Deliberately no proof, signature, binding, broadcast or renewed approval.
 }
 function resumeActor(row){
  if(row.role==='change'){const actor=owner.report();need(actor.available,'WRAPPED_WITHDRAWAL_OWNER_UNAVAILABLE');return {kind:'CURRENT_ORIGINAL_WRAPPED_OWNER',processIdentitySHA256:actor.processIdentitySHA256,generation:actor.generation};}
  assertOwnedNativeRecipientProcess(recipient);const lineage=assertOriginalNativeRecipientRecoveryV1(recipient,{originalProcessId:recipientBinding.pid,originalLifetimeIdentity:recipientBinding.originalLifetimeIdentity}),actor=recipient.report();need(!actor.exited,'WRAPPED_WITHDRAWAL_RECIPIENT_UNAVAILABLE');
  return {kind:'CURRENT_ORIGINAL_WRAPPED_RECIPIENT',processIdentitySHA256:sha({profile:actor.profile,pid:actor.pid,processLifetimeIdentity:actor.processLifetimeIdentity,pool:pool.address}),generation:lineage.generation,pid:actor.pid,lifetimeIdentity:actor.processLifetimeIdentity};
 }
 async function currentResumeReview(row,continuation=false){
  live();need(continuation?(['RESUME_ADMITTED','RESUME_PROVING','RESUME_PROOF_READY','RESUME_PROOF_INTERRUPTED'].includes(row.state)&&row.resumeAdmission?.consumed===true):(row.state==='LOCAL_PROOF_READY'&&!row.resumeAdmission),'WRAPPED_WITHDRAWAL_ORIGINAL_RESUME_NOT_REVIEWABLE');
  // The recipient accessor must be the parent-ACK-gated original implementation;
  // its capture-only predecessor cannot satisfy this joined source contract.
  const first=await observeRetainedAuthorization(row),firstActor=resumeActor(row),nativeBefore=sha(runtime.transactions),epochBefore=copy(runtime.ingressSendState);
  need(epochBefore.busy===false&&epochBefore.uncertain===false,'WRAPPED_WITHDRAWAL_RECEIVER_MUTATION_FENCED');
  const second=await(row.role==='change'?owner.ownerProof.retainedWithdrawal('change'):recipient.retainedWithdrawal());
  need(sha(second.checkpoint)===sha(first.retained.checkpoint)&&sha(second.job)===first.jobSHA256,'WRAPPED_WITHDRAWAL_RESUME_SIGNER_CHANGED');
  const latest=await lifetimeRegistry.readWrappedPrivateLifetimePartV1(runtime,'wallet-withdrawal',binding);
  need(latest.privateState.pendingUpdate===null&&sha(latest.privateState.checkpoint)===sha({revision:record.revision,commitment:record.commitment}),'WRAPPED_WITHDRAWAL_LATEST_CHECKPOINT_REQUIRED');
  await reader.assertCurrent(first.view);if(continuation)assertSignerCheckpointCurrent(row,second.checkpoint);effectReady();mutationReady();const actor=resumeActor(row),epoch=runtime.ingressSendState;
  need(sha(actor)===sha(firstActor),'WRAPPED_WITHDRAWAL_RESUME_ACTOR_CHANGED');
  need(epoch.busy===false&&epoch.uncertain===false&&epoch.epoch===epochBefore.epoch&&sha(runtime.transactions)===nativeBefore,'WRAPPED_WITHDRAWAL_RESUME_NATIVE_JOURNAL_CHANGED');
  if(row.proof!==null){need(row.calldata===encodeFlatTransaction('withdrawBalance',row.proof),'WRAPPED_WITHDRAWAL_ORIGINAL_PROOF_CHANGED');need(sha(row.proof.publicInputs)===sha(first.job.publicInputs),'WRAPPED_WITHDRAWAL_ORIGINAL_PROOF_CHANGED');}
  else need(row.calldata===null,'WRAPPED_WITHDRAWAL_ORIGINAL_PROOF_CHANGED');
  return describeWrappedWithdrawalResumeReviewV1({requestId:row.requestId,role:row.role,noteCommitment:row.terms.noteCommitment,canonicalNullifier:bare(first.nullifier),pool:row.terms.pool,assetId:row.terms.assetId,amount:row.terms.amount,recipient:'0x'+row.terms.recipient,registryCommitment:row.terms.registryCommitment,claimAuthority:row.terms.claimAuthority,originalActorIdentitySHA256:row.terms.actor.identitySHA256,signedTermsSHA256:row.termsSHA256,authorizationJobSHA256:first.jobSHA256,
   walletCheckpoint:{revision:record.revision,commitment:record.commitment},signerCheckpoint:copy(second.checkpoint),head:{number:String(first.view.head.number),hash:first.view.head.hash,timestamp:String(first.view.head.timestamp)},mutationEpoch:epoch.epoch,nativeJournalSHA256:nativeBefore,
   actor,proof:row.proof===null?{retained:false,proofSHA256:null,calldataSHA256:null}:{retained:true,proofSHA256:sha(row.proof),calldataSHA256:sha(row.calldata)},registryPending:false,broadcastStarted:false});
 }
 async function resumeAdmission(body){
  exactRecord(body,['requestId','resumeSHA256']);assert.match(body.requestId,/^[A-Za-z0-9_-]{8,100}$/);assert.match(body.resumeSHA256,/^[0-9a-f]{64}$/);
  const row=rowFor(body.requestId),review=await currentResumeReview(row);need(review.resumeSHA256===body.resumeSHA256,'WRAPPED_WITHDRAWAL_FRESH_RESUME_REVIEW_REQUIRED');
  await change(data=>{need(sha({revision:record.revision,commitment:record.commitment})===sha(review.review.walletCheckpoint),'WRAPPED_WITHDRAWAL_RESUME_WALLET_CHECKPOINT_CHANGED');const original=data.operations.find(value=>value.requestId===body.requestId);need(original.state==='LOCAL_PROOF_READY'&&!original.resumeAdmission,'WRAPPED_WITHDRAWAL_RESUME_ADMISSION_ALREADY_CONSUMED');
   original.resumeAdmission={schema:'WRAPPED_WITHDRAWAL_ONE_USE_RESUME_ADMISSION_V1',resumeSHA256:review.resumeSHA256,review:copy(review.review),consumed:true,continuationStarted:false,expectedRevision:record.revision+1,proofStarted:false,broadcastArmed:false};original.state='RESUME_ADMITTED';});
  // This next-only increment persists consent consumption but has no proof or
  // dispatch continuation. No caller obtains an effect capability from it.
  return Object.freeze({requestId:body.requestId,state:'RESUME_ADMITTED',resumeSHA256:review.resumeSHA256,effectPermission:false});
 }
 // Closed release: source review and inert admission tests confer no effect
 // release. The fixed installation/release procedure must separately replace it.
 const RESUME_CONTINUATION_RELEASE=null;
 function resumeNativeUnchanged(row){
  const admission=row.resumeAdmission,epoch=runtime.ingressSendState;effectReady();mutationReady();
  need(epoch.busy===false&&epoch.uncertain===false&&epoch.epoch===admission.review.mutationEpoch&&sha(runtime.transactions)===admission.review.nativeJournalSHA256,'WRAPPED_WITHDRAWAL_RESUME_NATIVE_JOURNAL_CHANGED');
  need(sha(resumeActor(row))===sha(admission.review.actor),'WRAPPED_WITHDRAWAL_RESUME_ACTOR_CHANGED');
 }
 async function verifyResumeContinuation(row){
  const admission=row.resumeAdmission;need(admission?.consumed===true&&admission.broadcastArmed===false&&row.progress.broadcastStarted===false,'WRAPPED_WITHDRAWAL_ORIGINAL_SEND_RECONCILIATION_REQUIRED');
  need(record.revision===admission.expectedRevision,'WRAPPED_WITHDRAWAL_RESUME_WALLET_CHECKPOINT_CHANGED');
  const observed=await currentResumeReview(row,true),comparison=copy(observed.review);
  // Admission itself and this same continuation advance only the private
  // wallet journal. No unrelated record advancement is admitted above.
  comparison.walletCheckpoint=copy(admission.review.walletCheckpoint);
  if(!admission.review.proof.retained)comparison.proof=copy(admission.review.proof);
  comparison.work=admission.review.work;
  need(sha(comparison)===(admission.reviewSHA256??admission.resumeSHA256),'WRAPPED_WITHDRAWAL_FRESH_RESUME_REVIEW_REQUIRED');
  resumeNativeUnchanged(row);return observed;
 }
 function assertSignerCheckpointCurrent(row,expected){
  if(row.role==='change'){need(typeof owner.ownerProof.assertRetainedCheckpoint==='function','WRAPPED_WITHDRAWAL_ORIGINAL_PARENT_CHECKPOINT_REQUIRED');owner.ownerProof.assertRetainedCheckpoint(expected);}
  else{need(typeof recipient.assertRetainedWithdrawalCheckpoint==='function','WRAPPED_WITHDRAWAL_ORIGINAL_PARENT_CHECKPOINT_REQUIRED');recipient.assertRetainedWithdrawalCheckpoint(expected);}
 }
 async function verifyArmedResume(row,submissionBound){
  const admission=row.resumeAdmission;need(admission?.consumed===true&&admission.continuationStarted===true&&admission.broadcastArmed===true&&row.progress.broadcastStarted===true&&row.state==='SEND_UNKNOWN','WRAPPED_WITHDRAWAL_ORIGINAL_ARMED_RESUME_REQUIRED');
  need(record.revision===admission.expectedRevision,'WRAPPED_WITHDRAWAL_RESUME_WALLET_CHECKPOINT_CHANGED');
  const signerRead=()=>row.role==='change'?(submissionBound?owner.ownerProof.retainedWithdrawalSubmission('change'):owner.ownerProof.retainedWithdrawal('change')):recipient.retainedWithdrawal();
  function checkSigner(retained){
   need(sha(retained.job)===admission.review.authorizationJobSHA256,'WRAPPED_WITHDRAWAL_ORIGINAL_JOB_CHANGED');
   if(row.role==='change'&&submissionBound){
    need(retained.profile==='WRAPPED_RETAINED_WITHDRAWAL_SUBMISSION_WITNESS_V1'&&retained.operation?.stage==='SUBMITTING'&&retained.operation.confirmation===null&&retained.operation.submission?.transactionHash===null,'WRAPPED_WITHDRAWAL_ORIGINAL_SUBMISSION_NOT_ADMITTED');
    need(retained.operation.submission.calldataSHA256===createHash('sha256').update(Buffer.from(row.calldata.slice(2),'hex')).digest('hex'),'WRAPPED_WITHDRAWAL_ORIGINAL_SUBMISSION_CHANGED');
    need(retained.checkpoint.revision===admission.review.signerCheckpoint.revision+1,'WRAPPED_WITHDRAWAL_RESUME_SIGNER_CHANGED');
   }else need(sha(retained.checkpoint)===sha(admission.review.signerCheckpoint),'WRAPPED_WITHDRAWAL_RESUME_SIGNER_CHANGED');
  }
  const first=await signerRead();checkSigner(first);
  const latest=await lifetimeRegistry.readWrappedPrivateLifetimePartV1(runtime,'wallet-withdrawal',binding);need(latest.privateState.pendingUpdate===null&&sha(latest.privateState.checkpoint)===sha({revision:record.revision,commitment:record.commitment}),'WRAPPED_WITHDRAWAL_LATEST_CHECKPOINT_REQUIRED');
  const view=await reader.read(),statement=decodeWalletPoolInputs('withdraw_balance',row.proof.publicInputs);
  need(sha(view.head)===sha(admission.review.head),'WRAPPED_WITHDRAWAL_APPROVED_HEAD_CHANGED');
  need(BigInt(view.head.timestamp)/600n===BigInt(row.terms.epoch)&&view.ledger.publicState.root===statement.root,'WRAPPED_WITHDRAWAL_ORIGINAL_ROOT_REQUIRED');
  need(view.ledger.commitments.includes('0x'+row.terms.noteCommitment)&&!view.ledger.nullifiers.includes(statement.nullifier),'WRAPPED_WITHDRAWAL_ORIGINAL_NOTE_UNSPENT_REQUIRED');
  await reader.assertCurrent(view);const second=await signerRead();checkSigner(second);need(sha(second.checkpoint)===sha(first.checkpoint),'WRAPPED_WITHDRAWAL_RESUME_SIGNER_CHANGED');
  await reader.assertCurrent(view);assertSignerCheckpointCurrent(row,second.checkpoint);resumeNativeUnchanged(row);return copy(second.checkpoint);
 }
 async function continueResume(body){
  exactRecord(body,['requestId','resumeSHA256']);need(RESUME_CONTINUATION_RELEASE==='LIANUM_WRAPPED_ORIGINAL_PROOF_RESUME_SOURCE_V1','WRAPPED_WITHDRAWAL_RESUME_CONTINUATION_NOT_RELEASED');
  let row=rowFor(body.requestId);need(((row.state==='RESUME_ADMITTED'&&row.resumeAdmission?.continuationStarted===false)||(row.state==='RESUME_PROOF_INTERRUPTED'&&row.resumeAdmission?.proofWorkerClosed===true&&row.resumeAdmission.broadcastArmed===false&&row.progress.broadcastStarted===false))&&row.resumeAdmission?.consumed===true&&row.resumeAdmission.resumeSHA256===body.resumeSHA256,'WRAPPED_WITHDRAWAL_RESUME_CONTINUATION_ONCE');
  await verifyResumeContinuation(row);
  await change(data=>{const original=data.operations.find(value=>value.requestId===body.requestId);need(record.revision===original.resumeAdmission.expectedRevision&&(!original.resumeAdmission.continuationStarted||(original.state==='RESUME_PROOF_INTERRUPTED'&&original.resumeAdmission.proofWorkerClosed===true)),'WRAPPED_WITHDRAWAL_RESUME_CONTINUATION_ONCE');
   original.resumeAdmission.continuationStarted=true;original.resumeAdmission.proofWorkerClosed=false;original.resumeAdmission.proofAttempts=(original.resumeAdmission.proofAttempts??0)+(original.proof===null?1:0);need(original.resumeAdmission.proofAttempts<=32,'WRAPPED_WITHDRAWAL_RESUME_PROOF_ATTEMPT_LIMIT');original.resumeAdmission.expectedRevision=record.revision+1;original.resumeAdmission.proofStarted=original.proof===null;original.state=original.proof===null?'RESUME_PROVING':'RESUME_PROOF_READY';
   if(original.proof===null)original.progress.proofGenerationStarted=true;});
  let proofWorkerFailed=false,proofWorkerClosed=false;
  try{
   row=rowFor(body.requestId);await verifyResumeContinuation(row);
   if(row.proof===null){
    // The only proof input is the exact retained authorization. No prepare,
    // sign, renew, path replacement or authorization method is called here.
    const job=copy(row.authorizationJob);need(sha(job)===row.resumeAdmission.review.authorizationJobSHA256,'WRAPPED_WITHDRAWAL_ORIGINAL_JOB_CHANGED');
    assertSignerCheckpointCurrent(row,row.resumeAdmission.review.signerCheckpoint);resumeNativeUnchanged(row);
    const client=createProofProcess({purpose:row.role==='change'?'owner':'recipient',modes:['withdraw_balance']});activeProof=client;let generated;
    try{generated=await client.prove('withdraw_balance',job.inputs,job.publicInputs,'wrapped-withdrawal-original-resume-'+row.role);}catch(error){proofWorkerFailed=true;throw error;}finally{const stopped=await client.close();proofWorkerClosed=stopped?.closed===true&&stopped?.exited===true;if(proofWorkerClosed)activeProof=null;need(proofWorkerClosed,'WRAPPED_WITHDRAWAL_RESUME_PROOF_CLEANUP_UNCONFIRMED');}
    const proof={proof:typeof generated.proof==='string'?generated.proof:Buffer.from(generated.proof).toString('hex'),publicInputs:[...generated.publicInputs]};
    need(sha(proof.publicInputs)===sha(job.publicInputs),'WRAPPED_WITHDRAWAL_ORIGINAL_PROOF_CHANGED');const calldata=encodeFlatTransaction('withdrawBalance',proof);
    row=rowFor(body.requestId);await verifyResumeContinuation(row);
    await change(data=>{const original=data.operations.find(value=>value.requestId===body.requestId);need(record.revision===original.resumeAdmission.expectedRevision,'WRAPPED_WITHDRAWAL_RESUME_WALLET_CHECKPOINT_CHANGED');
     original.proof=proof;original.calldata=calldata;original.progress.proofRetained=true;original.resumeAdmission.expectedRevision=record.revision+1;original.state='RESUME_PROOF_READY';});
   }
   row=rowFor(body.requestId);await verifyResumeContinuation(row);
   await change(data=>{const original=data.operations.find(value=>value.requestId===body.requestId);need(record.revision===original.resumeAdmission.expectedRevision&&!original.resumeAdmission.broadcastArmed,'WRAPPED_WITHDRAWAL_RESUME_WALLET_CHECKPOINT_CHANGED');
    original.resumeAdmission.broadcastArmed=true;original.resumeAdmission.expectedRevision=record.revision+1;original.progress.broadcastStarted=true;original.state='SEND_UNKNOWN';});
   row=rowFor(body.requestId);const unboundCheckpoint=await verifyArmedResume(row,false);assertSignerCheckpointCurrent(row,unboundCheckpoint);resumeNativeUnchanged(row);
   if(row.role==='change')need((await owner.owner.bindSubmission({kind:'withdraw_change',calldata:row.calldata})).dispatchAllowed===true,'WRAPPED_WITHDRAWAL_ORIGINAL_SUBMISSION_NOT_ADMITTED');
   // After arming, every ambiguity is original send reconciliation. The
   // original actor and complete native journal are checked after the await.
   const boundCheckpoint=await verifyArmedResume(row,row.role==='change');assertSignerCheckpointCurrent(row,boundCheckpoint);resumeNativeUnchanged(row);const receipt=await runtime.send('wrapped-withdrawal-'+row.requestId,{to:pool.address,data:row.calldata});
   await change(data=>{const original=data.operations.find(value=>value.requestId===body.requestId);original.transactionHash=receipt.transactionHash;original.resumeAdmission.expectedRevision=record.revision+1;});
   await reconcile(rowFor(body.requestId));return {requestId:body.requestId,state:rowFor(body.requestId).state};
  }catch(error){
   if(!fault)await change(data=>{const original=data.operations.find(value=>value.requestId===body.requestId);original.resumeFailureHistory??=[];need(original.resumeFailureHistory.length<32,'WRAPPED_WITHDRAWAL_INTERRUPTION_HISTORY_LIMIT');
    original.resumeFailureHistory.push({state:original.state,errorCode:original.errorCode,progress:copy(original.progress),consumedResumeSHA256:original.resumeAdmission.resumeSHA256});original.state=proofWorkerFailed&&proofWorkerClosed&&!original.resumeAdmission.broadcastArmed&&!original.progress.broadcastStarted?'RESUME_PROOF_INTERRUPTED':'UNKNOWN';original.errorCode='WRAPPED_WITHDRAWAL_ORIGINAL_RESUME_RECONCILIATION_REQUIRED';original.resumeAdmission.proofWorkerClosed=proofWorkerClosed;original.resumeAdmission.failureObserved=true;original.resumeAdmission.expectedRevision=record.revision+1;});
   throw error;
  }
 }
 function successorEligible(row){
  const prior=row.resumeAdmission;need(prior?.consumed===true&&prior.broadcastArmed===false&&row.progress?.broadcastStarted===false,'WRAPPED_WITHDRAWAL_SUCCESSOR_ORIGINAL_SEND_FORBIDDEN');
  need(activeProof===null&&!busy&&!ownerReadPending,'WRAPPED_WITHDRAWAL_SUCCESSOR_ACTIVE_WORK');
  need(row.state==='RESUME_ADMITTED'&&prior.continuationStarted===false||row.state==='RESUME_PROOF_INTERRUPTED'&&prior.continuationStarted===true&&prior.proofWorkerClosed===true,'WRAPPED_WITHDRAWAL_SUCCESSOR_STATE_FORBIDDEN');
  const history=row.resumeAdmissionHistory??[];need(Array.isArray(history)&&history.length<32&&(prior.ordinal??0)===history.length,'WRAPPED_WITHDRAWAL_SUCCESSOR_HISTORY_LIMIT');
  if(history.length)need(sha(history.at(-1).admission)===prior.predecessorAdmissionSHA256,'WRAPPED_WITHDRAWAL_SUCCESSOR_HISTORY_CHANGED');
  const attempts=prior.proofAttempts??0;need(Number.isSafeInteger(attempts)&&attempts>=0&&attempts<=32&&(row.proof!==null||attempts<32),'WRAPPED_WITHDRAWAL_RESUME_PROOF_ATTEMPT_LIMIT');
  need(history.every(item=>(item.admission.proofAttempts??0)<=attempts),'WRAPPED_WITHDRAWAL_SUCCESSOR_BUDGET_RESET');
  return prior;
 }
 async function successorReview(row){
  live();effectReady();mutationReady();const prior=copy(successorEligible(row)),predecessorAdmissionSHA256=sha(prior),ordinal=(prior.ordinal??0)+1;
  const current=await currentResumeReview(row,true);const latest=rowFor(row.requestId);successorEligible(latest);
  need(sha(latest.resumeAdmission)===predecessorAdmissionSHA256,'WRAPPED_WITHDRAWAL_SUCCESSOR_PREDECESSOR_CHANGED');
  need(sha(current.review.walletCheckpoint)===sha({revision:record.revision,commitment:record.commitment}),'WRAPPED_WITHDRAWAL_RESUME_WALLET_CHECKPOINT_CHANGED');
  return describeWrappedResumeSuccessorV1({predecessorAdmissionSHA256,ordinal,originalReview:current.review});
 }
 async function successorAdmission(body){
  exactRecord(body,['requestId','resumeSHA256']);const reviewed=await successorReview(rowFor(body.requestId));need(reviewed.resumeSHA256===body.resumeSHA256,'WRAPPED_WITHDRAWAL_FRESH_SUCCESSOR_REVIEW_REQUIRED');
  const current=reviewed.review.originalReview;
  await change(data=>{const original=data.operations.find(value=>value.requestId===body.requestId),prior=successorEligible(original);
   need(sha({revision:record.revision,commitment:record.commitment})===sha(current.walletCheckpoint),'WRAPPED_WITHDRAWAL_RESUME_WALLET_CHECKPOINT_CHANGED');
   need(sha(prior)===reviewed.review.predecessorAdmissionSHA256&&(prior.ordinal??0)+1===reviewed.review.ordinal,'WRAPPED_WITHDRAWAL_SUCCESSOR_PREDECESSOR_CHANGED');
   assertSignerCheckpointCurrent(original,current.signerCheckpoint);effectReady();mutationReady();const epoch=runtime.ingressSendState;
   need(epoch.busy===false&&epoch.uncertain===false&&epoch.epoch===current.mutationEpoch&&sha(runtime.transactions)===current.nativeJournalSHA256&&sha(resumeActor(original))===sha(current.actor),'WRAPPED_WITHDRAWAL_SUCCESSOR_CONTEXT_CHANGED');
   need(sha(original.authorizationJob)===current.authorizationJobSHA256,'WRAPPED_WITHDRAWAL_ORIGINAL_JOB_CHANGED');
   need(current.proof.retained?sha(original.proof)===current.proof.proofSHA256&&sha(original.calldata)===current.proof.calldataSHA256:original.proof===null&&original.calldata===null,'WRAPPED_WITHDRAWAL_ORIGINAL_PROOF_CHANGED');
   original.resumeAdmissionHistory??=[];original.resumeAdmissionHistory.push({admission:copy(prior),walletCheckpoint:copy(current.walletCheckpoint)});
   original.resumeAdmission={schema:'WRAPPED_WITHDRAWAL_ONE_USE_RESUME_ADMISSION_V1',ordinal:reviewed.review.ordinal,predecessorAdmissionSHA256:reviewed.review.predecessorAdmissionSHA256,successorReview:copy(reviewed.review),resumeSHA256:reviewed.resumeSHA256,reviewSHA256:sha(current),review:copy(current),consumed:true,continuationStarted:false,expectedRevision:record.revision+1,proofStarted:false,proofWorkerClosed:false,proofAttempts:prior.proofAttempts??0,broadcastArmed:false};original.state='RESUME_ADMITTED';
  });
  return Object.freeze({requestId:body.requestId,state:'RESUME_ADMITTED',resumeSHA256:reviewed.resumeSHA256,effectPermission:false});
 }
 async function reconcile(row){
  if(row.progress?.version===1&&row.progress.broadcastStarted===false)return reconcileRetainedAuthorization(row);
  need(row.calldata,'WRAPPED_WITHDRAWAL_NO_ORIGINAL_SEND');assert.equal(encodeFlatTransaction('withdrawBalance',row.proof),row.calldata);
  const records=runtime.transactions.filter(item=>item.label==='wrapped-withdrawal-'+row.requestId&&item.request.to===pool.address&&item.request.data===row.calldata);
  need(records.length===1,'WRAPPED_WITHDRAWAL_ORIGINAL_SEND_UNKNOWN');const original=records[0];
  need(original.transactionHash,'WRAPPED_WITHDRAWAL_ORIGINAL_SEND_UNKNOWN');if(row.transactionHash!==null)assert.equal(row.transactionHash,original.transactionHash);
  const receipt=await runtime.receipt(original.transactionHash),transaction=await runtime.transaction(original.transactionHash);
  need(receipt&&transaction,'WRAPPED_WITHDRAWAL_ORIGINAL_SEND_UNKNOWN');assert.equal(receipt.status,'0x1');assert.equal(transaction.input,row.calldata);assert.equal(transaction.to,pool.address);assert.equal(BigInt(transaction.value),0n);
  await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);
  const before=await reader.readHistorical('0x'+(BigInt(receipt.blockNumber)-1n).toString(16)),after=await reader.readHistorical(receipt.blockNumber);
  const statement=decodeWalletPoolInputs('withdraw_balance',row.proof.publicInputs);assert.equal(statement.amount,row.terms.amount);assert.equal(statement.recipient,'0x'+row.terms.recipient);
  assert.ok(!before.ledger.nullifiers.includes(statement.nullifier)&&after.ledger.nullifiers.includes(statement.nullifier));
  assert.equal(BigInt(before.ledger.publicState.backedAmount)-BigInt(after.ledger.publicState.backedAmount),BigInt(row.terms.amount));
  assert.equal(BigInt(before.ledger.publicState.actualAssetBalance)-BigInt(after.ledger.publicState.actualAssetBalance),BigInt(row.terms.amount));
  const holder='0x'+row.terms.recipient;assert.equal(await pool.assetCapability.balance(holder,after.header.number)-await pool.assetCapability.balance(holder,before.header.number),BigInt(row.terms.amount));
  if(row.role==='change'){await owner.owner.acknowledgeSubmitted({kind:'withdraw_change',transactionHash:bare(receipt.transactionHash)});assert.equal((await owner.owner.reconcile({kind:'withdraw_change'})).stage,'CONFIRMED');}
  const current=await reader.read();assert.ok(current.ledger.nullifiers.includes(statement.nullifier));await reader.assertCurrent(current);
  await change(data=>{const retained=data.operations.find(v=>v.requestId===row.requestId);retained.transactionHash=receipt.transactionHash;retained.state='CONFIRMED';retained.errorCode=null;});
 }
 async function execute(row){
  need(row.state==='EXECUTE_ADMITTED','WRAPPED_WITHDRAWAL_RECONCILE_ORIGINAL_ONLY');const view=await checkPrepared(row);
  await change(data=>{const original=data.operations.find(v=>v.requestId===row.requestId);original.state='SIGNING_UNKNOWN';original.progress={version:1,signingStarted:true,authorizationRetained:false,proofGenerationStarted:false,proofRetained:false,broadcastStarted:false,canonicalNullifier:null,authorizationJobSHA256:null};original.authorizationJob=null;});
  effectReady();mutationReady();let job;
  if(row.role==='change'){
   await owner.owner.prepareWithdrawal({role:'change',epoch:row.terms.epoch});await checkPrepared(row);effectReady();mutationReady();job=await owner.ownerProof.withdrawal('change');
  }else{
   const status=await recipient.withdrawalStatus();assert.equal(status.authorization,null);
   assert.equal(status.payoutCommitment,row.terms.noteCommitment);assert.equal(status.amount,row.terms.amount);assert.equal(status.recipient,row.terms.recipient);
   recipientUnspent(status,view);await reader.assertCurrent(view);effectReady();mutationReady();
   const index=view.ledger.commitments.indexOf('0x'+status.payoutCommitment);assert.ok(index>=0);
   const inputs=await recipient.authorizeWithdrawal({scope:status.scope,policy:status.policy,payoutCommitment:status.payoutCommitment,recipient:status.recipient,
    amount:status.amount,epoch:row.terms.epoch,path:view.ledger.tree.path(index)});job={inputs,publicInputs:walletInputPublicWords('withdraw_balance',inputs)};
  }
  const authorizationStatement=decodeWalletPoolInputs('withdraw_balance',job.publicInputs);
  assert.equal(authorizationStatement.epoch,row.terms.epoch);assert.equal(authorizationStatement.amount,row.terms.amount);assert.equal(authorizationStatement.recipient,'0x'+row.terms.recipient);
  // The exact original authorization/witness is encrypted and checkpointed
  // before a proof worker starts. A proof-only interruption need not re-sign.
  await change(data=>{const original=data.operations.find(v=>v.requestId===row.requestId);original.authorizationJob=copy(job);original.progress.authorizationJobSHA256=sha(job);original.progress.authorizationRetained=true;original.progress.canonicalNullifier=authorizationStatement.nullifier;original.progress.proofGenerationStarted=true;original.state='PROVING';});
  effectReady();mutationReady();const client=createProofProcess({purpose:row.role==='change'?'owner':'recipient',modes:['withdraw_balance']});activeProof=client;let generated;
  try{generated=await client.prove('withdraw_balance',job.inputs,job.publicInputs,'wrapped-withdrawal-'+row.role);}finally{job=null;await client.close();activeProof=null;}
  const proof={proof:typeof generated.proof==='string'?generated.proof:Buffer.from(generated.proof).toString('hex'),publicInputs:[...generated.publicInputs]},statement=decodeWalletPoolInputs('withdraw_balance',proof.publicInputs);
  assert.equal(statement.scope,'0x'+pool.domain.scope);assert.equal(statement.policy,'0x'+pool.domain.policy);assert.equal(statement.epoch,row.terms.epoch);assert.equal(statement.amount,row.terms.amount);assert.equal(statement.recipient,'0x'+row.terms.recipient);
  assert.deepEqual(proof.publicInputs,rowFor(row.requestId).authorizationJob.publicInputs);assert.equal(statement.nullifier,rowFor(row.requestId).progress.canonicalNullifier);
  await checkPrepared(row);const calldata=encodeFlatTransaction('withdrawBalance',proof);
  await change(data=>{const v=data.operations.find(v=>v.requestId===row.requestId);v.proof=proof;v.calldata=calldata;v.progress.proofRetained=true;v.state='PROOF_READY';});
  // Arm before both the owner submission latch and native send. Any error
  // after this durable boundary is original reconciliation only.
  await change(data=>{const original=data.operations.find(v=>v.requestId===row.requestId);original.progress.broadcastStarted=true;original.state='SEND_UNKNOWN';});
  if(row.role==='change')assert.equal((await owner.owner.bindSubmission({kind:'withdraw_change',calldata})).dispatchAllowed,true);
  // The original runtime retains this exact label/wire on uncertainty. There
  // is no second execute path, replacement proof, epoch renewal or fresh send.
  effectReady();mutationReady();try{const receipt=await runtime.send('wrapped-withdrawal-'+row.requestId,{to:pool.address,data:calldata});
   await change(data=>{data.operations.find(v=>v.requestId===row.requestId).transactionHash=receipt.transactionHash;});}
  catch(error){const hash=error.transactionRecord?.transactionHash;if(hash)await change(data=>{data.operations.find(v=>v.requestId===row.requestId).transactionHash=hash;});throw error;}
  await reconcile(rowFor(row.requestId));
 }
 const session=Object.freeze({
  // Next-only internal service methods; no HTTP/server action is joined.
  async reviewOriginalResumeSuccessor(body){exactRecord(body,['requestId']);body=copy(body);live();effectReady();need(pending===0&&!ownerReadPending&&!busy&&activeProof===null,'WRAPPED_WITHDRAWAL_BUSY');pending++;try{return await enqueue(()=>successorReview(rowFor(body.requestId)));}finally{pending--;}} ,
  async admitOriginalResumeSuccessor(body){exactRecord(body,['requestId','resumeSHA256']);body=copy(body);live();effectReady();need(pending===0&&!ownerReadPending&&!busy&&activeProof===null,'WRAPPED_WITHDRAWAL_BUSY');pending++;try{return await enqueue(()=>successorAdmission(body));}finally{pending--;}} ,
  async continueOriginalResume(body){exactRecord(body,['requestId','resumeSHA256']);body=copy(body);live();effectReady();need(pending===0&&!ownerReadPending,'WRAPPED_WITHDRAWAL_BUSY');pending++;try{return await enqueue(async()=>{busy=true;try{return await continueResume(body);}finally{busy=false;}});}finally{pending--;}} ,
  async reviewOriginalResume(body){exactRecord(body,['requestId']);body=copy(body);live();effectReady();need(pending===0&&!ownerReadPending,'WRAPPED_WITHDRAWAL_BUSY');pending++;try{return await enqueue(()=>currentResumeReview(rowFor(body.requestId)));}finally{pending--;}} ,
  async admitOriginalResume(body){exactRecord(body,['requestId','resumeSHA256']);body=copy(body);live();effectReady();need(pending===0&&!ownerReadPending,'WRAPPED_WITHDRAWAL_BUSY');pending++;try{return await enqueue(()=>resumeAdmission(body));}finally{pending--;}} ,
  async bindOriginalRecipient(raw){exactRecord(raw,['recipient','provider','approval']);live();effectReady();need(pending===0&&!ownerReadPending,'WRAPPED_WITHDRAWAL_BUSY');
   raw={recipient:raw.recipient,provider:raw.provider,approval:raw.approval};pending++;
   try{return await enqueue(async()=>{effectReady();need(!recipient&&!recipientBinding,'WRAPPED_WITHDRAWAL_RECIPIENT_ONCE');
   assertOwnedNativeRecipientProcess(raw.recipient);assertOwnedNativeValueProviderCustody(raw.provider,{runtime,system,poolIndex:1});
   const graph=wrappedWalletAccountManualGraphDetailsV1(raw.approval);assert.equal(graph.account,account);
   const review=ownedNativeValueProviderCustodyReview(raw.provider,{runtime,system,poolIndex:1}),status=await raw.recipient.withdrawalStatus();
   assert.equal(status.payoutCommitment,review.payoutCommitment);assert.equal(status.payoutCommitment,graph.review.payoutCommitment);
   need(!recipient&&!recipientBinding,'WRAPPED_WITHDRAWAL_RECIPIENT_ONCE');const process=raw.recipient.report();need(!process.exited&&!recipients.has(raw.recipient),'WRAPPED_WITHDRAWAL_RECIPIENT_ALREADY_LEASED');recipients.add(raw.recipient);
   effectReady();recipient=raw.recipient;recipientBinding={pid:process.pid,originalLifetimeIdentity:process.processLifetimeIdentity,payoutCommitment:status.payoutCommitment,
    identitySHA256:sha({pool:pool.address,status,offer:await recipient.offer()}),processIdentitySHA256:sha({profile:process.profile,pid:process.pid,processLifetimeIdentity:process.processLifetimeIdentity,pool:pool.address})};
   await change(data=>{data.recipient=copy(recipientBinding);});return {bound:true};});}finally{pending--;}
  },
  async ownerView(){live();effectReady();need(pending===0&&!ownerReadPending,'WRAPPED_WITHDRAWAL_BUSY');ownerReadPending=true;
   try{return await enqueue(async()=>{const offers=[],reviews=[];
    for(const role of ['recipient','change']){const row=record.data.operations.find(row=>row.role===role);if(row&&!['PREPARED','CANCELLED'].includes(row.state))continue;try{const value=await terms(role);
      if(!row)offers.push({terms:value,termsSHA256:sha(value)});else{assertUnsent(row);sameEconomics(row.terms,value);reviews.push({requestId:row.requestId,terms:value,termsSHA256:sha(value),priorTermsSHA256:row.termsSHA256});}}catch{}}
    return {profile:binding.profile,offers,reviews,operations:record.data.operations.map(projection),privateSpendable:null};});}finally{ownerReadPending=false;}},
  async snapshot(){if(!pending&&!closed)await enqueue(read);return journalView();},
  async submit(action,body){exactRecord(body,action==='prepare'?['requestId','role','termsSHA256']:['requestId','termsSHA256']);
   need(['prepare','execute','reconcile','reapprove','cancel'].includes(action),'WRAPPED_WITHDRAWAL_ACTION');need(typeof body.requestId==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(body.requestId),'WRAPPED_WITHDRAWAL_REQUEST_ID');assert.match(body.termsSHA256,/^[0-9a-f]{64}$/);
   body=copy(body);live();need(!closing&&!capturing&&pending===0&&!ownerReadPending,'WRAPPED_WITHDRAWAL_BUSY');pending++;
   try{await enqueue(async()=>{await read();if(action==='prepare'){
     need(!record.data.operations.some(row=>row.requestId===body.requestId||row.role===body.role),'WRAPPED_WITHDRAWAL_ORIGINAL_ALREADY_PREPARED');const value=await terms(body.role);
     assert.equal(sha(value),body.termsSHA256,'WRAPPED_WITHDRAWAL_REVIEW_CHANGED');
     await change(data=>{need(data.operations.length<2,'WRAPPED_WITHDRAWAL_CAPACITY');data.operations.push({requestId:body.requestId,role:body.role,terms:copy(value),termsSHA256:body.termsSHA256,state:'PREPARED',proof:null,calldata:null,transactionHash:null,errorCode:null});});
    }else{const row=rowFor(body.requestId);
     if(action==='reapprove'){
       assertUnsent(row);const next=await terms(row.role);sameEconomics(row.terms,next);assert.equal(sha(next),body.termsSHA256,'WRAPPED_WITHDRAWAL_REVIEW_CHANGED');
       await change(data=>{const current=data.operations.find(v=>v.requestId===body.requestId);current.reviewHistory??=[];need(current.reviewHistory.length<32,'WRAPPED_WITHDRAWAL_REVIEW_LIMIT');current.reviewHistory.push({terms:copy(current.terms),termsSHA256:current.termsSHA256,state:current.state});current.terms=copy(next);current.termsSHA256=body.termsSHA256;current.state='PREPARED';current.lastRequestedAction=action;});return;
     }
     assert.equal(row.termsSHA256,body.termsSHA256);
     if(action==='cancel'){assertUnsent(row);need(row.state==='PREPARED','WRAPPED_WITHDRAWAL_CANCELLED');await change(data=>{const current=data.operations.find(v=>v.requestId===body.requestId);current.state='CANCELLED';current.lastRequestedAction=action;});return;}
     if(action==='execute'){need(row.state==='PREPARED','WRAPPED_WITHDRAWAL_RECONCILE_ORIGINAL_ONLY');need(livePreparedActor(row),'WRAPPED_WITHDRAWAL_CURRENT_REVIEW_REQUIRED');await checkPrepared(row);}
     else need(['SIGNING_UNKNOWN','PROVING','PROOF_READY','LOCAL_PROOF_READY','SEND_UNKNOWN','UNKNOWN','CONFIRMED'].includes(row.state),'WRAPPED_WITHDRAWAL_ORIGINAL_RECONCILIATION_REQUIRED');
     // The exact action is durably admitted before HTTP 202, not just prepared.
     await change(data=>{const retained=data.operations.find(v=>v.requestId===body.requestId);retained.lastRequestedAction=action;
      if(action==='execute')retained.state='EXECUTE_ADMITTED';});}});
    if(['prepare','reapprove','cancel'].includes(action)){pending--;return {admitted:true,action,requestId:body.requestId};}
    void enqueue(async()=>{busy=true;try{await(action==='execute'?execute(rowFor(body.requestId)):reconcile(rowFor(body.requestId)));}
     catch(error){if(!fault)await change(data=>{const row=data.operations.find(v=>v.requestId===body.requestId);row.state='UNKNOWN';row.errorCode='WRAPPED_WITHDRAWAL_ORIGINAL_RECONCILIATION_REQUIRED';});}
     finally{busy=false;pending--;}});return {admitted:true,action,requestId:body.requestId};
   }catch(error){pending--;throw error;}
  },
  close(){if(closePromise)return closePromise;closing=true;closePromise=(async()=>{
   // Admission can append its effect job after the current tail resolves.
   // Drain until both the retained tail and explicit pending count are stable.
   for(;;){const current=tail;await activeProof?.abort();await current;if(pending===0&&tail===current)break;await Promise.resolve();}
   closed=true;store.close();return {closed:true,originalSendsRetained:true};})();return closePromise;},
 });owned.set(session,{live,closed:()=>closed,binding,
  fence(){need(!capturing&&!closing&&!closed&&!fault&&pending===0&&!busy&&!ownerReadPending,'WRAPPED_WITHDRAWAL_BUSY');capturing=true;return recipient;},
  async capture(){
   if(!capturing)owned.get(session).fence();need(!captureStarted,'WRAPPED_WITHDRAWAL_CAPTURE_ONCE');captureStarted=true;
   const current=await store.read();assert.deepEqual(current,record,'WRAPPED_WITHDRAWAL_ORIGINAL_CHECKPOINT_CHANGED');
   return {record:{schema:'WRAPPED_ORIGINAL_WITHDRAWAL_RECOVERY_V1',journal:{...journal},binding:copy(binding),
     checkpoint:{revision:record.revision,commitment:record.commitment},recipientBinding:copy(recipientBinding),
     ownerLifetime:recovery?copy(recovery.record.ownerLifetime):{processIdentitySHA256:originalOwner.processIdentitySHA256,generation:originalOwner.generation}},recipient};
  }});return session;
}

export async function captureWrappedWithdrawalSessionForReopenV1(session){const state=owned.get(session);need(state,'WRAPPED_WITHDRAWAL_ORIGINAL_SESSION_REQUIRED');return state.capture();}
export async function stopCapturedWrappedWithdrawalSessionV1(session){need(owned.has(session),'WRAPPED_WITHDRAWAL_ORIGINAL_SESSION_REQUIRED');return session.close();}
export async function reopenWrappedWithdrawalSessionFromRecoveryV1(token){
 const {consumeWrappedWalletRecoveryPartV1}=await import('../../operations/wallet/wrapped-wallet-composition-v1.mjs');
 const {exactRecord}=await import('@lianum/components/encoding/commitments');
 const retained=consumeWrappedWalletRecoveryPartV1(token,'withdrawal');exactRecord(retained,['input','record','recipient']);
 exactRecord(retained.record,['schema','journal','binding','checkpoint','recipientBinding','ownerLifetime']);need(retained.record.schema==='WRAPPED_ORIGINAL_WITHDRAWAL_RECOVERY_V1','WRAPPED_WITHDRAWAL_ORIGINAL_SESSION_REQUIRED');
 assert.equal(sha(retained.input.journal),sha(retained.record.journal),'WRAPPED_WITHDRAWAL_ORIGINAL_CREDENTIALS_CHANGED');return withdrawalSession(retained.input,retained);
}

export function fenceWrappedWithdrawalSessionRecoveryV1(session){const state=owned.get(session);need(state,"WRAPPED_WITHDRAWAL_ORIGINAL_SESSION_REQUIRED");return state.fence();}
