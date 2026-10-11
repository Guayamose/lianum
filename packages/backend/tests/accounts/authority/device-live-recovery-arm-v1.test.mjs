import {sendRetainedTerminalV2,observeRetainedTerminalV2,recoverRetainedTerminalV2} from '../../../src/execution/native-value/reconciliation/terminal-actions-v2.mjs';
import {readNativeDeviceOutputBalance} from '../../../src/accounts/authority/native-value/native-device-output-balance.mjs';
import {createRecoveredDeviceInstallations} from '../../../src/accounts/authority/native-value/recovered-device-installations.mjs';
import {createLiveRecoveryLeaseFamily} from '../../../src/accounts/authority/native-value/live-recovery-leases.mjs';
import {createNativeValueLiveRecovery} from '../../../src/accounts/authority/native-value/native-value-live-recovery.mjs';
import {reconcileRetainedTerminalV2} from '../../../src/execution/native-value/reconciliation/terminal-reconciliation-v2.mjs';
/** HOST control-boundary cases. Real interfaces run with explicit inert
 * ledger/executor ports; no proof/send/economy is credited. */
import test,{mock} from 'node:test';
import {createNativeValueAccountJournals} from '../../../src/accounts/authority/native-value/native-value-authority-journals.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Vault} from '@lianum/engine/crypto/vault';
import {createCommitmentCodec,SCHEMAS} from '@lianum/components/encoding/commitments';
import {FIELD_MODULUS} from '@lianum/components/encoding/statements';
import {recoveryWitness} from '../../../src/execution/account/preparation/funding-inputs.mjs';
import {encodeFlatTransaction} from '../../../src/execution/encoding/transaction-codec.mjs';
import {decodeNativeValueTerminalCalldata} from '../../../src/execution/encoding/terminal-calldata-codec.mjs';
const {PrivateNoteTree,verifyPrivateNotePath}=await import('@lianum/engine/notes/private-note-tree');
// These are inert HOST ports, never accepted as an original account. Keep
// each fixture's live fields and injected failures visible to production bodies.
function hostPorts(ctx){
 const lifecycle=Object.create(ctx),continuity=Object.create(ctx);
 for(const [method,field] of Object.entries({isBusy:'busy',isClosed:'closed',isCancelled:'cancelled',isUnavailable:'unavailable',isCapturing:'capturing',whenIdle:'idle'}))lifecycle[method]=()=>ctx[field];
 continuity.lease=()=>ctx.liveRecovery;
 Object.assign(ctx,{profile:ctx,chain:ctx,reservations:ctx,deposits:ctx,exits:ctx,format:ctx,execution:ctx,operations:ctx,approvals:ctx,proofs:ctx,continuity,lifecycle,account:{capability:()=>ctx.capability}});
 if(ctx.write)ctx.journal=createNativeValueAccountJournals({readRecord:()=>ctx.record,write:ctx.write}).reservations;
 return ctx;
}
test('original output read preserves the included empty-change marker for a full-budget S',async()=>{
 const h=n=>n.toString(16).padStart(64,'0'),rootId=h(1),ref=h(2),scope=h(3),sourceNF=h(4),change=h(5),recovery=h(6),changeNF=h(7),recoveryNF=h(8);
 const tree=new PrivateNoteTree([Buffer.from(change,'hex')]);let spent=false;
 const parent={jobId:ref,consent:{custody:{rootId,noteRevision:1},statement:{inputNullifier:sourceNF}},
  nativeOutcome:null,nativeTerminal:null,nativeBinding:{changeCommitment:change,recoveryCommitment:recovery},quoteId:h(9)};
 const view={ledger:{commitments:['0x'+change],nullifiers:['0x'+sourceNF],tree},head:{number:'1',hash:h(10),timestamp:'1'}};
 const ctx={assert,exactRecord:(v,keys)=>assert.deepEqual(Object.keys(v).sort(),[...keys].sort()),reference:v=>assert.match(v,/^[0-9a-f]{64}$/),
  reservationRow:id=>{assert.equal(id,ref);return parent;},deviceExecutionOriginal:()=>({descriptor:{}}),reservationObservation:async()=>({stage:'RESERVED',observation:{transactionHash:h(11)}}),
  originalQuote:()=>({preparation:{}}),reservationSubject:()=>({consent:{statement:{amount:'500'}}}),
  genericBalanceNativeTerms:()=>({budget:'500'}),validateGenericBalanceNativePreparation:v=>v,
  reader:{read:async()=>{view.ledger.nullifiers=spent?['0x'+sourceNF,'0x'+changeNF]:['0x'+sourceNF];return view;},assertCurrent:async v=>assert.equal(v,view)},
  identity:{pool:'12'.repeat(20),domainCommitment:h(13)},asset:{assetId:h(14),scope,policy:h(15),codeHash:h(16),assetIdentity:h(17)},
  verifyPrivateNotePath,bare:v=>v.startsWith('0x')?v.slice(2):v,sha:v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),continueWork(){}};
 const read=(bridge,input)=>readNativeDeviceOutputBalance(bridge,input,{format:ctx,reservations:ctx,execution:ctx,chain:ctx,profile:ctx,lifecycle:ctx,preparationTerms:prep=>ctx.genericBalanceNativeTerms(ctx.validateGenericBalanceNativePreparation(prep)),verifyPath:verifyPrivateNotePath,hash:ctx.sha});
 const input={parentJobId:ref,rootId,noteRevision:1,changeNullifier:changeNF,recoveryNullifier:recoveryNF};
 const result=await read({},input);
 assert.equal(result.change.amount,'0');assert.equal(result.change.state,'UNSPENT');assert.equal(result.change.path.leaf,change);
 assert.equal(result.recovery.amount,'500');assert.equal(result.recovery.state,'LOCKED');assert.equal(result.recovery.path,null);
 assert.equal(result.sourceNullifierSpent,true);
 spent=true;await assert.rejects(read({},input),/EMPTY_CHANGE_SPENT/);
});
function liveRecovery(ctx){
 hostPorts(ctx);
 return createNativeValueLiveRecovery({profile:ctx.profile,chain:ctx.chain,lifecycle:ctx.lifecycle,
  reservations:ctx.reservations,continuity:ctx.continuity,format:ctx.format,execution:{
   deviceExecutionOriginal:ctx.deviceExecutionOriginal,deviceExecutionPublic:ctx.deviceExecutionPublic,retainDeviceTerminal:ctx.retainDeviceTerminal},
  permission:{validateFresh:ctx.validateDeviceRecoveryArmConsentFreshV1,message:ctx.deviceRecoveryArmConsentMessageV1},
  refreshClock:clock=>(ctx.nativeSourceOriginal?ctx.refreshOriginalNativeSourceObservedClockV1:ctx.refreshOriginalNativeDeviceLocalObservedClockV1)(clock),
  failureDiagnostic:ctx.privateFailureDiagnostic});
}
function recoveredInstallations(ctx){
 return createRecoveredDeviceInstallations({lifecycle:ctx,chain:ctx,continuity:ctx,
  records:{...ctx,readRecord:()=>ctx.record,findExecutionInstallation:bridge=>ctx.deviceExecutionProviders?.get(bridge)??ctx.deviceExecutionInstallations?.get(bridge)},
  format:ctx,validation:ctx});
}
function fixture(){
 const row={jobId:'original-ref',nativeOutcome:null,nativeRecoveryLatched:false,nativeBinding:{settleBefore:'800'},
   liveRecoveryArm:{state:'ARMED',armSHA256:'armed-original-consent',nativeBindingSHA256:'original-U',reservationTransactionHash:'same-S',settleBefore:'800',lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'}};
 const lease={closed:false,bridge:Object.freeze({})},calls={recover:0,reconcile:0,writes:0,refresh:0};let head='799',wait=null,readStarted=null,lose=false,wire=null;
 const context={assert,nativeSourceOriginal:null,liveRecovery:lease,busy:false,closed:false,cancelled:false,unavailable:false,capturing:false,
   reservationRows:()=>[row],reservationRow:()=>row,exclusive:async f=>f(),healthy:async()=>{},
   refreshOriginalNativeDeviceLocalObservedClockV1:async()=>{calls.refresh++;},
   deviceExecutionOriginal:()=>{},deviceExecutionPublic:async()=>({nativeBindingSHA256:'original-U',reservation:{observation:{transactionHash:'same-S'}},lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'}),
   reader:{read:async()=>{readStarted?.resolve();if(wait)await wait;return{head:{timestamp:head}};},assertCurrent:async()=>{}},
   reservationUpdate:async(id,fields)=>{assert.equal(id,row.jobId);calls.writes++;Object.assign(row,structuredClone(fields));},
   nativeExecution:{recover:async id=>{assert.equal(id,row.jobId);calls.recover++;wire??='original-F-hash';if(lose)throw Error('HOST_LOST_REPLY');return{outcome:'RECOVERED'};},
     reconcile:async id=>{assert.equal(id,row.jobId);calls.reconcile++;assert.equal(wire,'original-F-hash');return{outcome:'RECOVERED'};}},
   retainDeviceTerminal:async(current,result)=>{assert.equal(current,row);row.nativeOutcome=result.outcome;},
   privateFailureDiagnostic:()=>({code:'HOST_UNKNOWN'}),};
 const tick=liveRecovery(context).tickLiveRecovery;
 return{row,lease,calls,tick,setHead:value=>{head=value;},loseReply:()=>{lose=true;},setWait:value=>{wait=value;},setReadStarted:value=>{readStarted=value;}};
}
test('original live F remains armed before cutoff and does not recover a settled T',async()=>{
 const a=fixture();await a.tick(a.lease);assert.equal(a.calls.recover,0);assert.equal(a.calls.writes,0);assert.equal(a.row.liveRecoveryArm.state,'ARMED');
 a.row.nativeOutcome='FULFILLED';a.setHead('800');await a.tick(a.lease);assert.equal(a.calls.recover,0);assert.equal(a.row.liveRecoveryArm.state,'FULFILLED');
});
test('original durable F latch preserves lost reply; later ticks reconcile the same wire without another recovery',async()=>{
 const a=fixture();a.setHead('800');a.loseReply();await assert.rejects(a.tick(a.lease));
 assert.equal(a.row.nativeRecoveryLatched,true);assert.equal(a.row.liveRecoveryArm.state,'UNKNOWN');assert.equal(a.calls.recover,1);
 await a.tick(a.lease);assert.equal(a.calls.recover,1);assert.equal(a.calls.reconcile,1);assert.equal(a.row.liveRecoveryArm.state,'RECOVERED');
 await a.tick(a.lease);assert.equal(a.calls.recover,1);assert.equal(a.calls.reconcile,1);
});
test('original close fence during fresh read stops admission before F; copied lease has no authority',async()=>{
 const a=fixture(),gate=Promise.withResolvers(),started=Promise.withResolvers();a.setHead('800');a.setWait(gate.promise);a.setReadStarted(started);
 const work=a.tick(a.lease);await started.promise;a.lease.closed=true;gate.resolve();await work;
 assert.equal(a.calls.recover,0);assert.equal(a.calls.writes,0);await assert.rejects(a.tick({...a.lease}));
});
test('original lease close retains and drains admitted completion; copied token is rejected',async()=>{
 const account=Object.freeze({}),bridge=Object.freeze({}),clock=Object.freeze({}),nativeRuntime=Object.freeze({}),gate=Promise.withResolvers();let row;
 const state={runtime:Object.freeze({}),sourceIdentity(){assert.fail('not a SOURCE lease');},installLiveRecovery(value){row=value;},tickLiveRecovery(value){assert.equal(value,row);return gate.promise;}};
 const actual=createLiveRecoveryLeaseFamily({assertAccount(value){assert.equal(value,account);},readAccount(value){assert.equal(value,account);return state;},assertBridge(value,owner){assert.equal(value,bridge);assert.equal(owner,account);},
  assertClock(value,refs){assert.equal(value,clock);assert.deepEqual(refs,{runtime:state.runtime,nativeRuntime});},assertSourceClock(){assert.fail('not a SOURCE lease');}});
 const cap=actual.create(account,bridge,clock,nativeRuntime);assert.throws(()=>actual.tick({...cap}));
 const admitted=actual.tick(cap),closed=actual.close(cap);assert.equal(row.closed,true);assert.equal(admitted,closed);assert.throws(()=>actual.tick(cap));
 gate.resolve({state:'RECOVERED'});assert.deepEqual(await closed,{state:'RECOVERED'});
});

function armFixture(){
 const bridge=Object.freeze({}),lease={bridge,clock:Object.freeze({}),closed:false};
 const row={jobId:'same-original-job',nativeOutcome:null,nativeRecoveryLatched:false,nativeBinding:{settleBefore:'800'},liveRecoveryArm:null};
 const current={nativeBindingSHA256:'same-original-U',executionSnapshotSHA256:'same-original-snapshot',reservation:{observation:{transactionHash:'same-original-S'}},lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'};
 const calls={writes:0,refresh:0},state={head:'799',fresh:true,refreshHook:null};
 const context={assert,nativeSourceOriginal:null,nativeNote:true,recovery:null,wrapped:false,liveRecovery:lease,exclusive:async f=>f(),healthy:async()=>{},continueWork(){},
  refreshOriginalNativeDeviceLocalObservedClockV1:async clock=>{assert.equal(clock,lease.clock);calls.refresh++;state.refreshHook?.();},
  validateDeviceRecoveryArmConsentFreshV1:()=>{assert.ok(state.fresh,'HOST_FRESH_CONSENT_REQUIRED');},
  reservationRow:id=>{assert.equal(id,row.jobId);return row;},deviceExecutionPublic:async(original,r)=>{assert.equal(original,bridge);assert.equal(r,row);return current;},
  originalReservationConsent:(r,c)=>{assert.equal(r,row);assert.equal(c.jobId,row.jobId);},
  deviceRecoveryArmConsentMessageV1:value=>JSON.stringify(value),byteSHA:value=>'HOST_DIGEST:'+value,
  reader:{read:async()=>({head:{timestamp:state.head}})},
  reservationUpdate:async(id,fields)=>{assert.equal(id,row.jobId);calls.writes++;Object.assign(row,structuredClone(fields));},
 };
 const live=liveRecovery(context),actual={arm:live.armLiveRecovery,refresh:live.refreshLiveOperationClock};
 function consent(action,nonce){return{action,nonce,settleBefore:'800',execution:{reservation:{jobId:row.jobId},nativeBindingSHA256:current.nativeBindingSHA256,
   executionSnapshotSHA256:current.executionSnapshotSHA256,reservationTransactionHash:current.reservation.observation.transactionHash,lossClause:current.lossClause}};}
 return{row,lease,state,calls,actual,run:(action,nonce)=>actual.arm({bridge,action,consent:consent(action,nonce)})};
}
test('original recovery toggle rearms only a disarmed same reservation with a new fresh permission before cutoff',async()=>{
 const f=armFixture(),first=await f.run('ARM_RECOVERY',1);assert.equal(first.state,'ARMED');
 await f.run('DISARM_RECOVERY',2);assert.equal(f.row.liveRecoveryArm.state,'DISARMED');
 const second=await f.run('ARM_RECOVERY',3);assert.equal(second.state,'ARMED');assert.notEqual(second.armSHA256,first.armSHA256);
 assert.equal(f.calls.writes,3);await assert.rejects(f.run('ARM_RECOVERY',4),/ALREADY_ARMED/);assert.equal(f.calls.writes,3);
 for(const altered of ['latch','terminal','binding','cutoff','expired','closed']){
  const rejected=armFixture();await rejected.run('ARM_RECOVERY',1);await rejected.run('DISARM_RECOVERY',2);
  if(altered==='latch')rejected.row.nativeRecoveryLatched=true;
  if(altered==='terminal')rejected.row.nativeOutcome='FULFILLED';
  if(altered==='binding')rejected.row.liveRecoveryArm.reservationTransactionHash='other-S';
  if(altered==='cutoff')rejected.state.refreshHook=()=>{rejected.state.head='800';};
  if(altered==='expired')rejected.state.refreshHook=()=>{rejected.state.fresh=false;};
  if(altered==='closed')rejected.state.refreshHook=()=>{rejected.lease.closed=true;};
  await assert.rejects(rejected.run('ARM_RECOVERY',3));assert.equal(rejected.calls.writes,2);assert.equal(rejected.row.liveRecoveryArm.state,'DISARMED');
 }
});
test('original live operation refresh uses its pair even without ARM and rejects close before admission',async()=>{
 const f=armFixture();assert.equal(f.row.liveRecoveryArm,null);await f.actual.refresh();assert.equal(f.calls.refresh,1);assert.equal(f.calls.writes,0);
 f.state.refreshHook=()=>{f.lease.closed=true;};await assert.rejects(f.actual.refresh(),/ORIGINAL_INSTALLATION/);assert.equal(f.calls.writes,0);
});

/** Actual pending-installation/tick bodies, a REAL encrypted Vault and explicitly
 * inert original ledger/proof ports. Due-head below is HOST DATA, never an
 * observed economic timestamp or financial/native acceptance. */
test('HOST original LIVE_ARMED and SOURCE accounts reopen the same durable arm or revocation without rearming',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'original-live-armed-host-')),password='original-host-password-minimum',path=join(directory,'arm.vault');
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),hex=n=>n.repeat(64);
 const descriptor={origin:'https://host.invalid',pairingId:hex('1'),devicePublicKey:'04'+hex('2')+hex('3')};
 const nativeBinding={reserveNullifier:hex('4'),settleBefore:'800'},domain=Object.fromEntries(['scope','policy','asset','hubDomain','registryCommitment'].map(k=>[k,hex('5')]));
 const proof={proof:'ab',publicInputs:['1']},row={jobId:hex('6'),stage:'RESERVED',consent:{...descriptor,quoteId:hex('7'),depositJobId:hex('8'),custody:{rootId:hex('9')},statement:{inputCommitment:hex('a'),inputNullifier:hex('b')}},
  nativeBinding,nativeOutcome:null,nativeTerminal:null,nativeRecoveryLatched:false,nativeLatched:false,submission:{dispatchLatched:true},observation:{transactionHash:hex('c')},authorization:proof,rolePackets:{HOST:'inert-original-packet'},
  proofSHA256:createHash('sha256').update(Buffer.from(proof.proof,'hex')).digest('hex'),publicInputsSHA256:digest(proof.publicInputs),
  liveRecoveryArm:{state:'ARMED',armSHA256:hex('d'),nativeBindingSHA256:digest(nativeBinding),reservationTransactionHash:hex('c'),settleBefore:'800',lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1',errorCode:null}};
 const firstVault=new Vault(path);let record=await firstVault.create({rows:[row]},password);assert.deepEqual(await firstVault.read(password),record);
 const newborn=new Vault(path);record=await newborn.read(password);const restored=structuredClone(record.data.rows[0]),bridge=Object.freeze({}),lease={closed:false,bridge,clock:Object.freeze({})};
 let issued=false,head='799',lost=false,wire=null;const calls={recover:0,reconcile:0,proof:0,send:0,arm:0};
 const actual={assert,nativeSourceOriginal:null,recovery:{native:true,liveArmed:true},wrapped:false,nativeNote:true,nativeExecution:null,
  exclusive:async work=>work(),healthy:async()=>{assert.deepEqual(await newborn.read(password),record);},
  recoveredInstallations:[{descriptor,providers:[{slot:0,custodyIdentitySHA256:digest({HOST:'original-custody'}),deliveryRiskSalt:hex('e')}]}],
  sha:digest,byteSHA:bytes=>createHash('sha256').update(bytes).digest('hex'),copy:structuredClone,
  reservationRows:()=>[restored],reservationRow:id=>{assert.equal(id,restored.jobId);return restored;},
  originalQuote:()=>({descriptor,preparation:{config:domain},depositJobId:hex('8'),rootId:hex('9'),invoiceSignatures:['HOST-original-invoice']}),
  validateGenericBalanceNativePreparation:value=>value,reservationSubject:()=>({jobId:hex('8'),consent:{statement:{output:hex('a')}},nullifier:hex('b')}),
  identity:{domain},flatAccountGraphBinding:()=>nativeBinding,nativeRecoveryProviderReviewV1:()=>({HOST:'original-custody'}),
  runtime:Object.freeze({receipt:async hash=>{assert.equal(hash,'0x'+hex('f'));return{transactionHash:hash};},checkReceipt:async receipt=>{assert.equal(receipt.transactionHash,'0x'+hex('f'));},assertCanonical:async receipt=>{assert.equal(receipt.transactionHash,'0x'+hex('f'));}}),system:{verify:async()=>true},poolIndex:0,
  reservationObservation:async()=>({stage:'RESERVED',observation:restored.observation}),
  reader:{read:async()=>({head:{timestamp:head},header:{number:'0x1'},ledger:{nullifiers:['0x'+hex('b'),...(restored.nativeOutcome==='RECOVERED'?['0x'+nativeBinding.reserveNullifier]:[])]}}),assertCurrent:async()=>{}},
  continueWork(){},busy:false,closed:false,cancelled:false,unavailable:false,capturing:false,liveRecovery:lease,
  refreshOriginalNativeDeviceLocalObservedClockV1:async()=>{},
  deviceExecutionOriginal:()=>{},deviceExecutionPublic:async()=>({nativeBindingSHA256:digest(nativeBinding),reservation:{observation:restored.observation},lossClause:restored.liveRecoveryArm.lossClause}),
  reservationUpdate:async(id,fields)=>{assert.equal(id,restored.jobId);Object.assign(restored,structuredClone(fields));const next=await newborn.update(password,record.revision,()=>({rows:[structuredClone(restored)]}));assert.deepEqual(await newborn.read(password),next);record=next;},
  retainDeviceTerminal:async(current,result)=>{assert.equal(current,restored);restored.nativeOutcome=result.outcome;restored.nativeTerminal={transactionHash:hex('f')};},privateFailureDiagnostic:()=>({code:'HOST_ORIGINAL_LOST_REPLY'}),
  validateDeviceRecoveryArmConsentFreshV1:()=>{calls.arm++;throw Error('HOST_NO_FRESH_ARM_USED');},
 };
 actual.nativeExecution={snapshot:id=>{assert.equal(id,restored.jobId);return{outcome:restored.nativeOutcome};},
  recover:async id=>{assert.equal(id,restored.jobId);calls.recover++;calls.proof++;calls.send++;wire='same-original-F';if(lost)throw Error('HOST_LOST_REPLY');return{outcome:'RECOVERED'};},
  reconcile:async id=>{assert.equal(id,restored.jobId);assert.equal(wire,'same-original-F');calls.reconcile++;return{outcome:'RECOVERED'};}};
 try{

  const factory=ctx=>recoveredInstallations(ctx).nativeDeviceLiveArmedInstallation;
  const install=factory(hostPorts(actual)),prepared=await install(descriptor,Object.freeze({}));assert.equal(prepared.parentJobId,row.jobId);assert.deepEqual(prepared.nativePreparation.config,domain);assert.equal(prepared.armSHA256,hex('d'));assert.equal(prepared.state,'ARMED');
  await assert.rejects(install(descriptor,Object.freeze({})),/INSTALLATION_ONCE/);issued=true;

  const disarmed=structuredClone(restored),disarmCalls={permission:0,writes:0},current={nativeBindingSHA256:digest(nativeBinding),executionSnapshotSHA256:hex('0'),reservation:{observation:disarmed.observation},lossClause:disarmed.liveRecoveryArm.lossClause};
  const disarmContext={...actual,reservationRow:()=>disarmed,deviceExecutionPublic:async()=>current,
   originalReservationConsent:(r,value)=>{assert.equal(r,disarmed);assert.equal(value.jobId,disarmed.jobId);},
   validateDeviceRecoveryArmConsentFreshV1:()=>{disarmCalls.permission++;},deviceRecoveryArmConsentMessageV1:JSON.stringify,
   reservationUpdate:async(id,fields)=>{assert.equal(id,disarmed.jobId);disarmCalls.writes++;Object.assign(disarmed,structuredClone(fields));}};
  const revoke=liveRecovery(disarmContext).armLiveRecovery;
  await assert.rejects(revoke({bridge,action:'ARM_RECOVERY',consent:{}}),/NO_REARM_AFTER_RESTART/);assert.equal(disarmCalls.permission,0);
  const disarmConsent={action:'DISARM_RECOVERY',settleBefore:'800',execution:{reservation:{jobId:disarmed.jobId},nativeBindingSHA256:current.nativeBindingSHA256,
   executionSnapshotSHA256:current.executionSnapshotSHA256,reservationTransactionHash:disarmed.observation.transactionHash,lossClause:current.lossClause}};
  await revoke({bridge,action:'DISARM_RECOVERY',consent:disarmConsent});assert.equal(disarmed.liveRecoveryArm.state,'DISARMED');assert.equal(disarmCalls.writes,1);assert.ok(disarmCalls.permission>0);
  // The actual SOURCE installer rehydrates the original encrypted revocation;
  // it issues neither a replacement ARM nor a recovery permission.
  const sourceVault=new Vault(join(directory,'source-disarmed.vault'));
  const sourceRecord=await sourceVault.create({rows:[disarmed]},password);
  const sourceRow=structuredClone((await new Vault(join(directory,'source-disarmed.vault')).read(password)).data.rows[0]);
  const sourcePreparation={nativePreparation:{config:domain},invoiceSignatures:['HOST-original-invoice']};
  const sourceContext={...actual,record:sourceRecord,recovery:{native:true,source:true},nativeSourceOriginal:{clock:lease.clock},
   healthy:async()=>assert.deepEqual(await sourceVault.read(password),sourceRecord),
   recoveredInstallations:actual.recoveredInstallations.map(value=>({...value,preparation:sourcePreparation})),
   sourceInstallationPreparation:value=>{assert.deepEqual(value,sourcePreparation);return structuredClone(value);},
   reservationRows:()=>[sourceRow],reservationRow:()=>sourceRow};
  const sourceFactory=ctx=>recoveredInstallations(ctx).nativeDeviceSourceInstallation;
  const sourceOpen=sourceFactory(sourceContext),sameRevocation=await sourceOpen(descriptor,Object.freeze({}));
  assert.equal(sameRevocation.state,'DISARMED');assert.equal(sameRevocation.armSHA256,sourceRow.liveRecoveryArm.armSHA256);
  assert.equal(sameRevocation.settleBefore,'800');assert.equal(sameRevocation.parentJobId,row.jobId);
  await assert.rejects(sourceOpen(descriptor,Object.freeze({})),/INSTALLATION_ONCE/);
  const sourceTick=liveRecovery(sourceContext).tickLiveRecovery;
  assert.deepEqual(await sourceTick(lease),{state:'IDLE'});assert.equal(calls.send,0);assert.equal(calls.arm,0);
  sourceRow.nativeRecoveryLatched=true;await assert.rejects(sourceFactory(sourceContext)(descriptor,Object.freeze({})),/DISARM_UNLATCHED/);sourceRow.nativeRecoveryLatched=false;
  // LIVE_ARMED ordered capture still rejects a revoked permission.
  const legacyContext={...sourceContext,recovery:{native:true,liveArmed:true},nativeSourceOriginal:null};
  const legacyFactory=ctx=>recoveredInstallations(ctx).nativeDeviceLiveArmedInstallation;
  await assert.rejects(legacyFactory(legacyContext)(descriptor,Object.freeze({})),/ORIGINAL_PERMISSION_REQUIRED/);
  assert.deepEqual(await sourceVault.read(password),sourceRecord);
  disarmed.liveRecoveryArm.state='ARMED';head='800';await assert.rejects(revoke({bridge,action:'DISARM_RECOVERY',consent:disarmConsent}),/DISARM_BEFORE_CUTOFF/);assert.equal(disarmCalls.writes,1);head='799';

 const tick=liveRecovery(actual).tickLiveRecovery;
  await tick(lease);assert.equal(calls.recover,0);assert.equal(calls.arm,0);assert.equal(restored.liveRecoveryArm.armSHA256,hex('d'));
  head='800';lost=true;await assert.rejects(tick(lease));assert.equal(restored.liveRecoveryArm.state,'UNKNOWN');assert.equal(restored.nativeRecoveryLatched,true);
  const retained=await new Vault(path).read(password);assert.equal(retained.data.rows[0].liveRecoveryArm.armSHA256,hex('d'));assert.equal(retained.data.rows[0].liveRecoveryArm.state,'UNKNOWN');
  await tick(lease);assert.equal(restored.liveRecoveryArm.state,'RECOVERED');assert.equal(calls.recover,1);assert.equal(calls.reconcile,1);assert.equal(calls.proof,1);assert.equal(calls.send,1);assert.equal(calls.arm,0);
  await tick(lease);assert.equal(calls.recover,1);assert.equal(calls.reconcile,1);
  assert.equal((await new Vault(path).read(password)).data.rows[0].nativeOutcome,'RECOVERED');
  const recoveredInstall=factory(hostPorts(actual)),observation=await recoveredInstall(descriptor,Object.freeze({}));
  assert.equal(observation.state,'RECOVERED');assert.equal(observation.armSHA256,hex('d'));assert.equal(restored.nativeLatched,false);assert.equal(calls.send,1);
  const changed=restored.nativeTerminal;restored.nativeTerminal=null;await assert.rejects(factory(actual)(descriptor,Object.freeze({})),/TERMINAL_LATCHES/);restored.nativeTerminal=changed;
  const arm=liveRecovery(actual).armLiveRecovery;
  await assert.rejects(arm({bridge,action:'ARM_RECOVERY',consent:{}}),/NO_REARM_AFTER_RESTART/);assert.equal(calls.arm,0);
  lease.closed=true;assert.deepEqual(await tick(lease),{state:'CLOSED'});assert.equal(calls.send,1);assert.equal(issued,true);
 }finally{await rm(directory,{recursive:true,force:true});}
});


test('HOST SOURCE reopened original note admits only next original steps and retains all once latches',async()=>{
 // Account bodies and encrypted journal/CAS are real. Source membership,
 // chain observation and executor ports are explicitly inert fixtures.
 const directory=await mkdtemp(join(tmpdir(),'source-next-original-'));
 const path=join(directory,'account.vault'),password='synthetic-source-original-journal',vault=new Vault(path);
 const hex=n=>n.toString(16).padStart(64,'0'),domain={scope:hex(1),policy:hex(2),asset:hex(3),hubDomain:hex(4),registryCommitment:hex(5)};
 const descriptor={origin:'https://localhost:24443',pairingId:hex(6),devicePublicKey:'04'+'12'.repeat(64)};
 const bridge=Object.freeze({}),executionBridge=Object.freeze({}),custody=Object.freeze({}),clock=Object.freeze({}),runtime={},system={},nativeRuntime={};
 const preparation={config:domain,nodes:[],slotSalts:[]},tuple={nativePreparation:preparation,invoiceSignatures:[]};
 const providers=[{slot:0,custody,deliveryRiskSalt:hex(7)}],review={sameOriginalCustody:hex(8)};
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const retained={descriptor,preparation:tuple,providers:[{slot:0,deliveryRiskSalt:hex(7),custodyIdentitySHA256:digest(review)}]};
 const installation={descriptor,reservationBridge:bridge,sourcePreparation:tuple,providers};
 let mode={native:true,source:true},allowSource=true,head='799',writes=0,prepared=0,sends=0,fresh=true;
 let record=await vault.create({deviceDeposits:[{jobId:hex(9),stage:'CONFIRMED',consent:{rootId:hex(10),statement:{amount:'10',output:hex(19)}},nullifier:hex(21)}],deviceReservations:[],deviceReservationQuotes:[]},password);
 const calls={fresh:0};
 const statement={nativeBindingSHA256:hex(11),executionSnapshotSHA256:hex(12),reservation:{observation:{transactionHash:hex(13)}},lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'};
 const row={jobId:hex(14),stage:'RESERVED',nativeTerminal:null,nativeOutcome:null,nativeRecoveryLatched:false,nativeLatched:false,nativeBinding:{settleBefore:'800'},liveRecoveryArm:null};
 const ctx={assert,get record(){return record;},runtime,system,nativeRuntime,poolIndex:0,reference:value=>assert.match(value,/^[0-9a-f]{64}$/),assertOwnedNativeValueExecution(){},deviceRow:id=>{assert.equal(id,hex(9));return {...record.data.deviceDeposits[0],consent:{...record.data.deviceDeposits[0].consent,...descriptor}};},identity:{domain,domainCommitment:hex(20)},sha:digest,copy:structuredClone,
  assertOriginalNativeSourceObservedClockV1(value,refs){assert.equal(allowSource,true,'HOST_ORIGINAL_SOURCE_BRAND');assert.equal(value,clock);assert.equal(refs.runtime,runtime);assert.equal(refs.nativeRuntime,nativeRuntime);},
  nativeRecoveryProviderReviewV1(value){assert.equal(value,custody);return review;},
  sourceInstallationPreparation(value){assert.deepEqual(value,tuple);return structuredClone(value);},
  deviceExecutionProviders:new Map([[bridge,installation]]),deviceExecutionInstallations:new Map([[executionBridge,installation]]),recoveredInstallations:[retained],
  exclusive:async work=>work(),healthy:async()=>{assert.deepEqual(await vault.read(password),record);},continueWork(){},wrapped:false,nativeNote:true,
  reservationSubject(id,root,selected){assert.equal(id,hex(9));assert.equal(root,hex(10));for(const key of Object.keys(descriptor))assert.equal(selected[key],descriptor[key]);return record.data.deviceDeposits[0];},
  accountIdentity:{sameOriginalAccount:hex(15)},config:{lifetime:hex(16)},asset:{scope:domain.scope,policy:domain.policy,codeHash:hex(17),assetIdentity:domain.asset,assetId:hex(18)},
  observeDevice:async deposit=>{assert.equal(deposit.stage,'CONFIRMED');return{stage:'CONFIRMED'};},
  reader:{read:async()=>({head:{timestamp:head},ledger:{}}),assertCurrent:async()=>{}},
  validateGenericBalanceNativePreparation:value=>{assert.deepEqual(value,preparation);return structuredClone(value);},
  genericBalanceNativeTerms:()=>({budget:'8',fundingNotBefore:'1',fundingValidUntil:'900'}),
  normalizeDeviceReservationCapsuleOptionsV1:value=>structuredClone(value),randomBytes:()=>Buffer.alloc(32,0xab),
  write:async change=>{record=await vault.update(password,record.revision,change);assert.deepEqual(await vault.read(password),record);writes++;},
  exitRows:()=>record.data.deviceExits??[],reservationRows:()=>record.data.deviceReservations,reservationBinding:()=>{},reservationRow:()=>row,
  originalQuote:()=>({depositJobId:hex(9),rootId:hex(10),descriptor,preparation,invoiceSignatures:[]}),
  originalReservationConsent:()=>{},deviceReservationConsentMessageV1:JSON.stringify,deviceExecutionConsentMessageV1:JSON.stringify,byteSHA:digest,
  deviceExecutionOriginal:()=>{},deviceExecutionPublic:async()=>statement,
  reservationUpdate:async(id,fields)=>{assert.equal(id,row.jobId);record=await vault.update(password,record.revision,data=>({...data,lastTransition:structuredClone(fields)}));assert.deepEqual(await vault.read(password),record);Object.assign(row,structuredClone(fields));writes++;},
  reservationObservation:async()=>({stage:'RESERVED',observation:statement.reservation.observation}),
  nativeExecution:{snapshot:()=>({outcome:row.nativeOutcome}),prepare:async()=>{prepared++;throw Error('HOST_ORIGINAL_PREPARE_REACHED');},execute:async()=>{sends++;return{outcome:null};}},
  refreshOriginalNativeSourceObservedClockV1:async value=>{assert.equal(value,clock);},refreshOriginalNativeDeviceLocalObservedClockV1:async()=>{throw Error('legacy clock cannot run in SOURCE');},
  liveRecovery:{bridge:executionBridge,clock,nativeRuntime,closed:false},
  validateDeviceRecoveryArmConsentFreshV1(){calls.fresh++;assert.ok(fresh,'HOST_EXPIRED_OWNER_PERMISSION');},
  deviceRecoveryArmConsentMessageV1:JSON.stringify,privateFailureDiagnostic:()=>({code:'HOST_UNCERTAIN'}),
 };
 const moduleMocks=[];
 try{
  async function explicitModule(specifier,overrides){const original=await import(specifier instanceof URL?specifier.href:specifier);moduleMocks.push(mock.module(specifier,{exports:{...original,...overrides}}));}
  // The same finite primitive fixtures formerly passed to extracted bodies.
  // Account control flow, journals and all guards now run through real factories.
  await explicitModule('@lianum/engine/execution/balances/generic-balance-native-preparation',{validateGenericBalanceNativePreparation:ctx.validateGenericBalanceNativePreparation,genericBalanceNativeTerms:ctx.genericBalanceNativeTerms});
  await explicitModule('@lianum/mobile-protocol/device-reservation-consent-v1',{normalizeDeviceReservationCapsuleOptionsV1:ctx.normalizeDeviceReservationCapsuleOptionsV1});
  await explicitModule('@lianum/engine/accounts/journal',{sha:digest,copy:structuredClone});
  await explicitModule(new URL('../../../src/accounts/authority/flat-account-validation.mjs',import.meta.url),{flatAccountGraphBinding:()=>row.nativeBinding});
  await explicitModule('@lianum/mobile-protocol/device-execution-consent-v1',{deviceExecutionConsentMessageV1:JSON.stringify});
  await explicitModule('@lianum/mobile-protocol/device-recovery-arm-consent-v1',{validateDeviceRecoveryArmConsentFreshV1:ctx.validateDeviceRecoveryArmConsentFreshV1,deviceRecoveryArmConsentMessageV1:JSON.stringify});
  await explicitModule(new URL('../../../src/operations/recovery/native-original-source-observed-clock-v1.mjs',import.meta.url),{refreshOriginalNativeSourceObservedClockV1:ctx.refreshOriginalNativeSourceObservedClockV1});
  const {createNativeValueReservations}=await import('../../../src/accounts/authority/native-value/native-value-authority-reservations.mjs');
  const {createNativeValueExecutionOperations}=await import('../../../src/accounts/authority/native-value/native-value-authority-execution.mjs');
  const run=()=>{
   ctx.recovery=mode;ctx.nativeSourceOriginal={clock,nativeRuntime};hostPorts(ctx);
   ctx.originalSourceContinuationInstallation=recoveredInstallations(ctx).originalSourceContinuationInstallation;
   const execution=createNativeValueExecutionOperations(ctx);ctx.refreshLiveOperationClock=execution.refreshLiveOperationClock;
   const reservations=createNativeValueReservations({...ctx,journal:{...ctx.journal,rows:()=>record.data.deviceReservations.length?[row]:[]}});
   return{reservation:reservations.deviceReservation,execution:execution.deviceExecution,arm:execution.armLiveRecovery};
  };
  const request={bridge,action:'PREPARE_U',depositJobId:hex(9),rootId:hex(10),descriptor,nativePreparation:preparation,invoiceSignatures:[],binding:{accountIdentitySHA256:digest(ctx.accountIdentity),originalAccountLifetime:ctx.config.lifetime}};
  mode={native:true};await assert.rejects(run().reservation(request),/OBSERVE_ORIGINAL_ONLY/);assert.equal(writes,0);
  mode={native:true,source:true};allowSource=false;await assert.rejects(run().reservation(request),/HOST_ORIGINAL_SOURCE_BRAND/);assert.equal(writes,0);allowSource=true;
  const quote=await run().reservation(request);assert.equal(quote.depositJobId,hex(9));assert.equal(writes,1);assert.deepEqual(record.data.deviceReservationQuotes[0].invoiceSignatures,tuple.invoiceSignatures);
  const admitted={jobId:row.jobId,stage:'PROVING',consent:{custody:{sourceCommitment:hex(19)}}};row.consent=admitted.consent;
  record=await vault.update(password,record.revision,data=>({...data,deviceReservations:[admitted]}));
  const consent={...descriptor,jobId:row.jobId,depositJobId:hex(9),custody:{rootId:hex(10),sourceCommitment:hex(19)},binding:{accountIdentitySHA256:digest(ctx.accountIdentity),originalAccountLifetime:ctx.config.lifetime,assetId:ctx.asset.assetId},poolTerms:{...ctx.asset,domainCommitment:ctx.identity.domainCommitment}};row.consent=consent;
  await assert.rejects(run().reservation({bridge,action:'PROVE_U',consent}),/ALREADY_ADMITTED/);assert.equal(prepared,0);assert.equal(sends,0);
  row.stage='RESERVATION_UNKNOWN';await assert.rejects(run().reservation({bridge,action:'RESERVE_S',consent}),/RECONCILE_ORIGINAL_ONLY/);assert.equal(prepared,0);
  row.stage='PROVED';row.submission=null;row.nativeBinding=null;
  await assert.rejects(run().reservation({bridge,action:'RESERVE_S',consent}),/HOST_ORIGINAL_PREPARE_REACHED/);assert.equal(prepared,1);assert.equal(sends,0);
  row.stage='RESERVED';row.nativeBinding={settleBefore:'800'};row.submission={dispatchLatched:true};statement.nativeBindingSHA256=digest(row.nativeBinding);statement.executionSnapshotSHA256=digest(ctx.nativeExecution.snapshot(row.jobId));
  const execute={bridge:executionBridge,action:'EXECUTE_NATIVE',consent:{...statement,reservation:{jobId:row.jobId},reservationTransactionHash:statement.reservation.observation.transactionHash}};
  await run().execution(execute);assert.equal(row.nativeLatched,true);assert.equal(sends,1);
  await assert.rejects(run().execution(execute),/RECONCILE_ORIGINAL_ONLY/);assert.equal(sends,1);
  row.nativeRecoveryLatched=true;await assert.rejects(run().execution({...execute,action:'RECOVER_NATIVE'}),/RECONCILE_ORIGINAL_ONLY/);assert.equal(sends,1);row.nativeRecoveryLatched=false;
  const armConsent={action:'ARM_RECOVERY',settleBefore:'800',execution:{reservation:{jobId:row.jobId},nativeBindingSHA256:statement.nativeBindingSHA256,executionSnapshotSHA256:statement.executionSnapshotSHA256,reservationTransactionHash:statement.reservation.observation.transactionHash,lossClause:statement.lossClause}};
  fresh=false;const before=writes;await assert.rejects(run().arm({bridge:executionBridge,action:'ARM_RECOVERY',consent:armConsent}),/EXPIRED_OWNER_PERMISSION/);assert.equal(writes,before);fresh=true;
  await run().arm({bridge:executionBridge,action:'ARM_RECOVERY',consent:armConsent});assert.equal(row.liveRecoveryArm.state,'ARMED');
  const count=writes;await assert.rejects(run().arm({bridge:executionBridge,action:'ARM_RECOVERY',consent:armConsent}),/NO_REARM_AFTER_RESTART/);assert.equal(writes,count);
  row.liveRecoveryArm=null;head='800';await assert.rejects(run().arm({bridge:executionBridge,action:'ARM_RECOVERY',consent:armConsent}),/ARM_BEFORE_CUTOFF/);assert.equal(writes,count);
  assert.equal(sends,1);assert.equal(record.data.deviceDeposits.length,1);assert.equal(record.data.deviceDeposits[0].stage,'CONFIRMED');
 }finally{for(const handle of moduleMocks.reverse())handle.restore();await rm(directory,{recursive:true,force:true});}
});


/** Controlled HOST clock only: ORIGINAL eight-hour terms are born once and
 * never changed. Actual ticker/keeper/send/reconcile bodies and real AEAD CAS
 * run here. Hash, proof, native RPC and canonical observation ports are explicit
 * inert fixtures; this is no native proof, live-clock or financial acceptance. */
test('HOST original eight-hour cutoff admits one durable F and lost reply reconciles without reproof or resend',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'original-eight-hour-cutoff-host-')),password='original-cutoff-host-password-minimum';
 const hash=value=>createHash('sha256').update('controlled original cutoff '+value).digest('hex'),prefix=value=>'0x'+value,bare=value=>value.startsWith('0x')?value.slice(2):value;
 const testHash=async values=>(BigInt('0x'+hash(values.map(String).join(',')))%FIELD_MODULUS).toString(16).padStart(64,'0');
 const codec=createCommitmentCodec({hashFields:testHash}),started=1200n,cutoff=(started+28800n).toString();
 const domain=Object.fromEntries(SCHEMAS.domain.map(([key])=>[key,hash(key)])),domainCommitment=await codec.domainCommitment(domain);
 const core={context:hash('context'),reserveCommitment:hash('reserve'),reserveNullifier:hash('reserve-nullifier'),settleBefore:cutoff},recovery={reserveCommitment:core.reserveCommitment,reserveNullifier:core.reserveNullifier,recoveryCommitment:hash('recovery'),settleBefore:cutoff};
 const originals=[['core',core,0],['recovery',recovery,2]],leaves=Array.from({length:16},(_,i)=>'00'+hash('occupied-'+i).slice(2)),openings={};
 for(const[k,value,index]of originals){const blind=hash(k+'-blind'),leaf=await codec[k+'Leaf'](domainCommitment,value,blind);leaves[index]=leaf;openings[k]={value,blind,leaf};}
 const envelope=await codec.buildTree(domainCommitment,1,leaves);for(const[k,,index]of originals)Object.assign(openings[k],envelope.opening(index));
 const packet={domainCommitment,envelope:envelope.root,domain,...openings},originalPacket=JSON.stringify(packet);
 const authorization=await codec.buildTree(domainCommitment,0,[await codec.authorizationLeaf(domainCommitment,envelope.root)]),noteTree=new PrivateNoteTree([Buffer.from(core.reserveCommitment,'hex')]);
 const ref=hash('original-job'),sHash=hash('original-S'),bindingHash=hash('original-binding'),binding={inputNullifier:hash('source-nullifier'),reserveNullifier:core.reserveNullifier,reserveCommitment:core.reserveCommitment,settleBefore:cutoff,envelope:envelope.root};
 async function runCase(lostReply){
  const tag=lostReply?'lost':'confirmed',accountVault=new Vault(join(directory,tag+'-account.vault')),executorVault=new Vault(join(directory,tag+'-executor.vault'));
  let row={jobId:ref,nativeBinding:binding,nativeOutcome:null,nativeRecoveryLatched:false,nativeLatched:false,
   liveRecoveryArm:{state:'ARMED',armSHA256:hash('unchanged-original-ARM'),nativeBindingSHA256:bindingHash,reservationTransactionHash:sHash,settleBefore:cutoff,lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'}};
  let accountRecord=await accountVault.create({row},password),entry={reference:ref,binding,prepared:{rolePackets:{recovery:packet}},recoverySubmission:null,settlementSubmission:null,recoveryStatement:null,originalFCheckpoint:null,outcome:null,stage:'PREPARED',receipts:[],exposures:[]};
  let executorRecord=await executorVault.create({entry},password),head=(BigInt(cutoff)-1n).toString(),observations=0,lose=lostReply;
  const calls={proof:0,send:0,refresh:0,reconcile:0,accountWrites:0,executorWrites:0},wire=[],observed=new WeakMap();
  const view=()=>({head:{timestamp:head},ledger:{nullifiers:[prefix(binding.inputNullifier)],commitments:[prefix(core.reserveCommitment)],tree:noteTree},authorizationTree:{path:index=>authorization.opening(index)}});
  async function update(id,fields){assert.equal(id,ref);assert.deepEqual(await executorVault.read(password),executorRecord);const next=await executorVault.update(password,executorRecord.revision,()=>({entry:{...entry,...structuredClone(fields)}}));assert.deepEqual(await executorVault.read(password),next);executorRecord=next;entry=structuredClone(next.data.entry);calls.executorWrites++;}
  const runtime={send:async(label,request)=>{assert.equal(row.nativeRecoveryLatched,true);assert.equal(row.liveRecoveryArm.state,'FIRING');assert.equal(entry.recoverySubmission.transactionHash,null);assert.deepEqual(await accountVault.read(password),accountRecord);assert.deepEqual(await executorVault.read(password),executorRecord);
   calls.send++;assert.equal(calls.send,1);wire.push({label,request:structuredClone(request),transactionHash:prefix(hash('one-F-'+tag))});return{transactionHash:wire[0].transactionHash};}};
  const terminalObserver={observe:async query=>{observations++;assert.equal(query.kind,'recovery');assert.equal(query.submission.transactionHash,bare(wire[0].transactionHash));assert.equal(query.submission.calldata,wire[0].request.data);assert.equal(query.binding.settleBefore,cutoff);
   const decoded=decodeNativeValueTerminalCalldata(query.submission.calldata);assert.equal(decoded.kind,'recovery');assert.deepEqual(decoded.statement,query.statement);assert.equal(decoded.statement.settleBefore,cutoff);assert.equal(decoded.statement.recoveryCommitment,recovery.recoveryCommitment);
   if(lose){lose=false;throw Error('HOST_ORIGINAL_F_REPLY_LOST');}const value={outcome:'RECOVERED',receipt:{transactionHash:wire[0].transactionHash}};observed.set(value,{sameOriginalWire:true});return value;}};
  const ctx={assert,runtime,wrapped:false,pool:{address:prefix(hash('pool').slice(0,40))},prefix,bare,operation:id=>{assert.equal(id,ref);return entry;},update,
   exclusive:async work=>{assert.deepEqual(await executorVault.read(password),executorRecord);return work();},refreshNativeValueReceiverClock:async value=>{assert.equal(value,runtime);calls.refresh++;},
   reader:{read:async()=>view(),authorizationPath:async(v,e)=>{assert.equal(e,envelope.root);assert.equal(v.head.timestamp,head);return{root:authorization.root,index:0};}},
   withFlatHash:work=>work(testHash),recoveryWitness,
   fieldLeafPath:v=>({leaf:v.leaf,index:v.index,siblings:[...v.siblings]}),shaLeafPath:v=>({leaf:bare(v.leaf),index:v.index,siblings:v.siblings.map(bare)}),
   notePath:(v,commitment)=>{assert.equal(commitment,core.reserveCommitment);return noteTree.path(0);},
   prove:async(id,relation,job,label)=>{assert.equal(id,ref);assert.equal(relation,'recovery');assert.equal(label,'original-timeout-recovery');assert.equal(job.statement.settleBefore,cutoff);calls.proof++;assert.equal(job.publicInputs.length,41);return{proof:'11'.repeat(32),publicInputs:job.publicInputs};},
   encodeFlatTransaction,stage:async()=>{},onStage:async()=>{},dataHash:data=>createHash('sha256').update(Buffer.from(data.slice(2),'hex')).digest('hex'),detached:structuredClone,
   terminalObserver,readOriginalNativeRecoveryCheckpointV1:(o,v)=>{assert.equal(o,terminalObserver);assert.ok(observed.has(v));return{HOST:'original-observation-port',transactionHash:v.receipt.transactionHash};},
   HOST_RUNTIME_PROBE:{isOwnedOriginalNativeFReorgReceiverV1:()=>false},originalProbeToken:()=>{throw Error('HOST_REORG_NOT_SELECTED');},originalFReorgProbeTokensV1:new WeakMap(),admissionAdapters:new Map(),receiptPath:()=>{throw Error('HOST_NATIVE_ADMISSION_NOT_SELECTED');}};
  const send=(id,kind,target,calldata)=>sendRetainedTerminalV2(id,kind,target,calldata,{operation:ctx.operation,calldataHash:ctx.dataHash,update,
   beforeSend:async()=>{},send:runtime.send,bareHash:bare});
  const observedSubmission=(id,kind)=>observeRetainedTerminalV2(id,kind,{operation:ctx.operation,detached:structuredClone,wrapped:false,
   observe:terminalObserver.observe,recoveryCheckpoint:value=>ctx.readOriginalNativeRecoveryCheckpointV1(terminalObserver,value),update});
  const keeper={observedSubmission,recover:id=>ctx.exclusive(()=>recoverRetainedTerminalV2(id,{
   refresh:()=>ctx.refreshNativeValueReceiverClock(runtime),operation:ctx.operation,read:()=>ctx.reader.read(),observe:observedSubmission,prefix,prove:ctx.prove,update,stage:ctx.stage,onStage:ctx.onStage,
   async prepare(saved,fresh){const auth=await ctx.reader.authorizationPath(fresh,saved.binding.envelope);
    return recoveryWitness(saved.prepared.rolePackets.recovery,{authorizationRoot:auth.root,authorizationPath:ctx.fieldLeafPath(fresh.authorizationTree.path(auth.index)),
     poolRoot:bare(fresh.ledger.tree.root),reservePath:ctx.shaLeafPath(ctx.notePath(fresh,saved.binding.reserveCommitment))},{hashFields:testHash});},
   send:(reference,proof)=>send(reference,'recovery',ctx.pool.address,encodeFlatTransaction('recoverGeneric',proof))
  }))};
  keeper.reconcile=id=>ctx.exclusive(()=>reconcileRetainedTerminalV2(id,{operation:ctx.operation,admissions:ctx.admissionAdapters,read:()=>ctx.reader.read(),assertReceipt:ctx.receiptPath,update:ctx.update,observe:keeper.observedSubmission}));
  const originalReconcile=keeper.reconcile;keeper.reconcile=async id=>{calls.reconcile++;return originalReconcile(id);};
  const lease={closed:false,bridge:Object.freeze({}),clock:Object.freeze({})},accountCtx={assert,nativeSourceOriginal:null,liveRecovery:lease,busy:false,closed:false,cancelled:false,unavailable:false,capturing:false,
   exclusive:async work=>{assert.deepEqual(await accountVault.read(password),accountRecord);return work();},healthy:async()=>{assert.deepEqual(await accountVault.read(password),accountRecord);},reservationRows:()=>[row],reservationRow:id=>{assert.equal(id,ref);return row;},
   refreshOriginalNativeDeviceLocalObservedClockV1:async value=>assert.equal(value,lease.clock),deviceExecutionOriginal:()=>{},deviceExecutionPublic:async()=>({nativeBindingSHA256:bindingHash,reservation:{observation:{transactionHash:sHash}},lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'}),
   reader:{read:async()=>view(),assertCurrent:async v=>assert.equal(v.head.timestamp,head)},
   reservationUpdate:async(id,fields)=>{assert.equal(id,ref);const next=await accountVault.update(password,accountRecord.revision,()=>({row:{...row,...structuredClone(fields)}}));assert.deepEqual(await accountVault.read(password),next);accountRecord=next;row=structuredClone(next.data.row);calls.accountWrites++;},
   nativeExecution:keeper,retainDeviceTerminal:async(current,value)=>{assert.equal(current,row);row.nativeOutcome=value.outcome;},privateFailureDiagnostic:()=>({code:'HOST_ORIGINAL_F_REPLY_LOST'})};
 const tick=liveRecovery(accountCtx).tickLiveRecovery;
  await assert.rejects(keeper.recover(ref),/RECOVERY_BEFORE_CUTOFF/);await tick(lease);assert.equal(calls.proof,0);assert.equal(calls.send,0);assert.equal(calls.accountWrites,0);assert.equal(calls.executorWrites,0);
  head=cutoff;
  if(lostReply){await assert.rejects(tick(lease),/HOST_ORIGINAL_F_REPLY_LOST/);assert.equal(row.liveRecoveryArm.state,'UNKNOWN');assert.equal(row.nativeRecoveryLatched,true);assert.equal(entry.recoverySubmission.transactionHash,bare(wire[0].transactionHash));}
  else{await tick(lease);assert.equal(row.liveRecoveryArm.state,'RECOVERED');}
  if(lostReply)await tick(lease);
  assert.equal(row.liveRecoveryArm.state,'RECOVERED');assert.equal(row.nativeLatched,false);assert.equal(calls.proof,1);assert.equal(calls.send,1);assert.equal(row.liveRecoveryArm.armSHA256,hash('unchanged-original-ARM'));
  const writes=calls.executorWrites;await keeper.recover(ref);assert.equal(calls.executorWrites,writes);await tick(lease);assert.equal(calls.proof,1);assert.equal(calls.send,1);assert.equal(calls.reconcile,lostReply?1:0);
  assert.deepEqual(await accountVault.read(password),accountRecord);assert.deepEqual(await executorVault.read(password),executorRecord);assert.equal(JSON.stringify(packet),originalPacket);assert.equal(BigInt(cutoff)-started,28800n);
  assert.ok(observations>=2);lease.closed=true;assert.deepEqual(await tick(lease),{state:'CLOSED'});
 }
 try{await runCase(false);await runCase(true);}finally{await rm(directory,{recursive:true,force:true});}
});
