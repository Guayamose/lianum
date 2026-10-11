import {applicationFlowEntrypoints} from '../../runners/application-flow-entrypoints.mjs';
import { createOwnedLocalTronNativeValueV1, assertOwnedLocalTronNativeValueV1, readOwnedLocalTronNativeValueAuditStateV4, openOwnedTronOriginalReadPort } from '../../../../packages/backend/src/chains/tron/runtime/owned-tron-native-value-runtime.mjs';
import { readTronJournal } from '../../../../packages/backend/src/chains/tron/transfers/owned-tron-native-value-journal.mjs';
import { decodeTronNativeTransferWire } from '../../../../packages/backend/src/chains/tron/transfers/tron-native-transfer-wire.mjs';
import { describeOwnedLocalTronNativeValueSource } from '../../../../packages/backend/src/chains/tron/health/owned-tron-native-value-health-source-v4.mjs';
import { loadNativeValueDevLiveArtifactsV5 } from '../../../../packages/backend/src/proving/native-value/metadata/native-value-dev-live-v5-artifacts.mjs';
import { nativeWalletTronDevSourcePinsV5 } from './native-wallet-tron-dev-source-pins-v5.mjs';
import { privateNativeEconomicSuccessorFirstErrorV1 } from './native-device-economic-private-error-v1.mjs';
import { assertNativeWalletTronDevReleaseV5, assertNativeWalletTronDevResultV5, NATIVE_WALLET_TRON_DEV_RESULT_V5 } from './native-wallet-tron-dev-policy-v5.mjs';
/** Fixed one-profile genuine native-value wallet acceptance. Import is inert.
 * This is an explicitly scripted fake-value local acceptance, never a wallet
 * agent/planner or public-chain transaction. It uses the SAME original owner,
 * account, generic keeper, session and loopback SDK across TOP_UP/GRAPH/EXIT.
 * Missing artifacts/profile gates stop before any runtime or value. Every funded
 * invocation repeats unfunded and loaded-liability preflights on its own fixture.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, realpathSync, writeFileSync, lstatSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from '@lianum/proofs/catalog';
import { createProofProcess } from '@lianum/proofs/execution/proof-process';
import { createNativeRecipientProcess } from '../../../../packages/backend/src/execution/native/recipients/native-recipient-process.mjs';
import { NATIVE_ADMISSION_LOSS_CLAUSE } from '@lianum/engine/execution/native/dispatch/native-admission';
import { walletInputPublicWords } from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import { noteWordsToHash } from '@lianum/engine/notes/private-note-tree';
import { createOwnedLocalEvmV2, createOwnedLocalEvmNativeValueV1,
  assertOwnedLocalEvmV2, assertOwnedLocalEvmNativeValueV1, createOwnedLocalEvmObservedClockV1, refreshNativeValueReceiverClock } from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { describeOwnedLocalEvmNativeValueSource } from '../../../../packages/backend/src/chains/evm/health/owned-evm-native-value-health-source-v4.mjs';
import { profileCommitment } from '../../../../packages/backend/src/chains/shared/transfers/generic-native-value-v2.mjs';
import { createOwnedNativeValueProviderCustody } from '../../../../packages/backend/src/providers/native-value-provider-v2.mjs';
import { createOwnedLocalNativeValueOperatorBootstrap, createOwnedLocalTronWallclockOperatorBootstrapV1 } from '../../../../packages/backend/src/operations/operators/native-value/native-value-local-operator-bootstrap-v4.mjs';
import { deployNativeValueSystem, deployNativeValueDevSystemV5, assertOwnedNativeValueSystem } from '../../../../packages/backend/src/operations/deployments/native-value/native-value-system-v2.mjs';
import { loadNativeValueDeploymentArtifacts, loadNativeValueDevDeploymentArtifactsV5, NATIVE_VALUE_VERIFIER_ORDER } from '../../../../packages/backend/src/operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import { loadNativeValueLiveArtifacts } from '../../../../packages/backend/src/proving/native-value/metadata/native-value-live-v2-artifacts.mjs';
import { NATIVE_VALUE_LIVE_V2_KEY_SHA256, NATIVE_VALUE_LIVE_V2_SOURCE_VERSION } from '@lianum/proofs/native-value/metadata/native-value-live-v2-profile';
import { NATIVE_VALUE_ACCEPTED_PROGRAM_SHA256 } from '@lianum/proofs/native-value/metadata/native-value-v2-profile';
import { createNativeValueSystemStateReader } from '../../../../packages/backend/src/execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import { createNativeValueOwnerProcess } from '../../../../packages/backend/src/custody/processes/native-value-owner-process-v2.mjs';
import { createNativeValueExecution } from '../../../../packages/backend/src/execution/native-value/execution/native-value-execution-v2.mjs';
import { createNativeValueAccountAuthority } from '../../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs';
import { createOriginalSessionWalletEconomicStateV1, readOriginalSessionWalletEconomicStateV1 } from '@lianum/backend/accounts/manual-graph';
import { createNativeValueManualGraphAccountSession } from '@lianum/backend/operations/recovery/native-original-source-lifecycle-v1';
import { createWalletApplicationClient } from '../../../../packages/backend/src/api/wallet/wallet-application-client.mjs';
import { FLAT_TRANSACTION_METHODS, encodeFlatTransaction } from '../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { decodeStatement, joinReadiness } from '@lianum/components/encoding/statements';
import { decodeNativeValueTerminalCalldata } from '../../../../packages/backend/src/execution/encoding/terminal-calldata-codec.mjs';
import { privateFailureDiagnostic } from '../../../../packages/backend/src/execution/account/reconciliation/failure-diagnostics.mjs';
import { nativeValueFailureDiagnostic } from '../../../../packages/backend/src/execution/native-value/reconciliation/native-value-failure-retention.mjs';
import { startWalletApplication } from '../../../../apps/wallet/src/server/server.mjs';
import { createManualWalletAppDriver } from '../manual/manual-wallet-app-driver.mjs';
import { freshFixtureId, fixtureJSON, writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';
import { NATIVE_FLOW_LIMITS } from '../../native/native-flow-supervisor.mjs';
import { nativeWalletRealSourcePins } from './native-wallet-real-source-pins-v1.mjs';
import { decodeNativeWalletAdmissionCalldata, assertNativeWalletConservation, nativeWalletHash as hash } from './native-wallet-real-evidence-v1.mjs';
import { NATIVE_WALLET_UNFUNDED_RELEASE_V1, NATIVE_WALLET_REAL_RELEASE_V1,
  NATIVE_WALLET_RESULT_V1, NATIVE_WALLET_PREFLIGHT_RESULT_V1, NATIVE_WALLET_ECONOMICS_V1,
  NATIVE_WALLET_REQUEST_IDS_V1, assertNativeWalletRealResult, assertNativeWalletUnfundedResult } from './native-wallet-real-policy-v1.mjs';
const bare = v => v.slice(2), hexWords = values => values.map(v=>'0x'+BigInt(v).toString(16).padStart(64,'0'));
const roles = new Map(NATIVE_VALUE_VERIFIER_ORDER);
export async function runNativeWalletRealAcceptance() {
  assert.equal(arguments.length,0,'NATIVE_WALLET_FIXED_NO_OPTIONS');
  assert.ok(NATIVE_WALLET_REAL_RELEASE_V1,'NATIVE_WALLET_REAL_RELEASE_ABSENT');
  return runFixed(false);
}
export async function runNativeWalletRealPreflight() {
  assert.equal(arguments.length,0,'NATIVE_WALLET_FIXED_NO_OPTIONS');
  assert.ok(NATIVE_WALLET_UNFUNDED_RELEASE_V1,'NATIVE_WALLET_UNFUNDED_RELEASE_ABSENT');
  return runFixed(true);
}
export async function runNativeWalletTronDevAcceptanceV5(){
 assert.equal(arguments.length,0,'NATIVE_WALLET_TRON_NO_OPTIONS');assertNativeWalletTronDevReleaseV5();
 return runFixed(false,true);
}
async function runFixed(unfundedOnly,tron=false) {
  const suffix=unfundedOnly?'preflight':'acceptance', stem=tron?'native-wallet-tron-dev-v5':'native-wallet-real-'+suffix+'-v1';
  assert.equal(process.argv.length,2,'NATIVE_WALLET_NO_ARGUMENTS'); assert.deepEqual(process.execArgv,[]);
  assert.equal(realpathSync(process.argv[1]),applicationFlowEntrypoints[stem==='native-wallet-real-preflight-v1'?'nativeWalletRealPreflight':'nativeWalletRealAcceptance'].worker);
  assert.equal(realpathSync(process.cwd()),ROOT); assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);
  assert.equal(process.env.PATH,'/usr/bin:/bin'); assert.equal(process.env.LANG,'C.UTF-8');
  const parent=readFileSync(`/proc/${process.ppid}/cmdline`,'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length,2); assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`),parent[1])),applicationFlowEntrypoints[stem==='native-wallet-real-preflight-v1'?'nativeWalletRealPreflight':'nativeWalletRealAcceptance'].entry);
  const local=join(ROOT,'.local',stem), lock=JSON.parse(readFileSync(join(local,'active.lock')));
  assert.equal(lock.pid,process.ppid); assert.match(lock.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt,'.local/'+stem+'/attempt-'+lock.runId);
  const directory=join(ROOT,lock.attempt), privateDirectory=join(directory,'private-audit'), proofDirectory=join(directory,'public-proofs');
  mkdirSync(privateDirectory,{mode:0o700}); mkdirSync(proofDirectory,{mode:0o700});
  const deadlineMs=Date.parse(lock.startedAt)+NATIVE_FLOW_LIMITS.totalMilliseconds-NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds;
  const result={format:tron?NATIVE_WALLET_TRON_DEV_RESULT_V5:unfundedOnly?NATIVE_WALLET_PREFLIGHT_RESULT_V1:NATIVE_WALLET_RESULT_V1,
    runId:lock.runId,startedAt:new Date().toISOString(),phase:'starting',success:false,
    localOnly:true,fakeFundsOnly:true,publicNetwork:false,supervisor:{supervisorPID:process.ppid,workerPID:process.pid},
    sourcePins:tron?nativeWalletTronDevSourcePinsV5():nativeWalletRealSourcePins(),stages:[],proofs:[],admissionProof:null,health:[],httpEvidence:[],
    preflight:{},funded:false,nativeDeliveryCount:0,cleanup:{closedEvm:null,...(tron?{closedNativeTron:null}:{closedNativeEvm:null})},
    keeperRestart:false,nodeRestart:false,fullWalletAcceptance:false,actualFRecoveryAcceptance:false,
    disclosure:[tron?'One owned local Java-Tron node and wallclock receiver; original TRX solver delivery is not private native custody credit.':'One owned local synthetic chain-ID-1 Anvil, not Ethereum mainnet or production-client/finality acceptance.',
      'One original private source account pays an independent solver only after genuine I84 admission and ordinary four-slot N/T settlement.',
      'Four registered source slots share one host/node; fresh complete histories do not establish independent infrastructure.',
      'Separate solver-native liquidity is never source-custody backing or privately spendable native credit.',
      'Owner and recipient processes reopen original encrypted state. Original keeper and nodes survive; no lifetime or window is renewed.',
      'Failure preserves the exact attempt. No automatic reproof, redispatch, reauthorization or new fixture retry.']};
  let runtime,nativeRuntime,bootstrap,system,reader,owner,execution,account,joined,preparation,app,driver,custody,recipient,recipientBoot,legacy;
  let closed=false,interrupted=false,graphRef,graphPrepared,ownerScope,preflightIdentity,firstAccountErrorRetained=false;
  const proofsByLabel=new Map(),handoffs=new Map();
  function nativeAudit(){assert.ok(tron&&nativeRuntime);return readOwnedLocalTronNativeValueAuditStateV4(nativeRuntime);}
  function nativeTransactionCount(){if(!nativeRuntime)return 0;if(!tron)return nativeRuntime.transactions.length;
   return nativeAudit().journal?.events.filter(e=>e.kind==='BROADCAST').length??0;}
  function originalNativeProofs(){
   const dependency=proofsByLabel.get('leg-0-dependency'),readiness=proofsByLabel.get('leg-0-readiness');assert.ok(dependency&&readiness);
   const d=decodeStatement('dependency',dependency.publicInputs),ready=decodeStatement('ready',readiness.publicInputs);joinReadiness(d,ready);
   return {dependency,readiness,ready};
  }
  async function checkOriginalTronInclusion(detail){
   assert.equal(detail.reference,graphRef);assert.equal(owner.report().available,false);
   const {dependency,readiness,ready}=originalNativeProofs(),proofHash=hash(fixtureJSON([dependency,readiness]));
   const action=graphPrepared.rolePackets.local[0].action,core=graphPrepared.rolePackets.reservation.core.value;
   const bounds={readyFrom:ready.readyFrom,readyUntil:ready.readyUntil,executionFrom:action.executionFrom,
    executionUntil:action.executionUntil,settleBefore:core.settleBefore};
   await assertOwnedLocalTronNativeValueV1(nativeRuntime);const audit=nativeAudit();assert.equal(audit.journal,null);
   const before=await nativeRuntime.health();await refreshNativeValueReceiverClock(runtime);const view=await reader.read();
   const nativeSecond=BigInt(before.head.timestampMs)/1000n,receiverSecond=BigInt(view.head.timestamp),wall=BigInt(Date.now());
   assert.ok(wall-BigInt(before.head.timestampMs)>=0n&&wall-BigInt(before.head.timestampMs)<=5000n,'TRON_WALLET_ACTUAL_NATIVE_CLOCK');
   for(const now of [nativeSecond,receiverSecond])assert.ok(BigInt(bounds.readyFrom)<=now&&now<BigInt(bounds.readyUntil)
    &&BigInt(bounds.executionFrom)<=now&&now<BigInt(bounds.executionUntil)&&now<BigInt(bounds.settleBefore),'TRON_WALLET_ORIGINAL_WINDOW_CLOSED');
   const checkpoint=view.checkpoints.find(row=>row.digest===ready.checkpoint);assert.ok(checkpoint,'TRON_WALLET_ORIGINAL_CHECKPOINT');
   await reader.assertCurrent(view);assert.equal(nativeTransactionCount(),0);assert.equal(hash(fixtureJSON([dependency,readiness])),proofHash);
   result.nativeClockSynchronization={phase:'completed',receiverObservedWallclock:true,nativeClockChanged:false,windowsChanged:false,
    proofBytesUnchanged:true,nativeHeadSecond:nativeSecond.toString(),receiverHeadSecond:receiverSecond.toString(),bounds};save();
  }

  const save=()=>writeFixturePrivate(join(directory,'result.json'),result);
  function retainPrivateError(filename,error,diagnostic){
    // Only a fixed private audit filename reaches this local helper. Never export
    // raw error text, stacks, comparison values or cause objects in result/stdout.
    try {
      const causeChain=[],seen=new Set([error]);
      for(let cause=error?.cause;cause&&!seen.has(cause)&&causeChain.length<4;cause=cause.cause){
        seen.add(cause);causeChain.push({name:String(cause.name),code:typeof cause.code==='string'?cause.code:null,
          message:String(cause.message),stack:String(cause.stack)});
      }
      writeFixturePrivate(join(privateDirectory,filename),{name:String(error?.name),
        code:typeof error?.code==='string'?error.code:null,message:String(error?.message),stack:String(error?.stack),
        causeChain,privateDiagnostic:diagnostic});
    } catch { /* Preserve the original error and still close every owned resource. */ }
  }
  const remaining=()=>{const n=deadlineMs-Date.now();assert.ok(n>0,'NATIVE_WALLET_ORIGINAL_DEADLINE');return n;};
  async function stage(name){remaining();result.phase=name;result.stages.push({name,at:new Date().toISOString()});save();process.stdout.write(JSON.stringify({stage:name})+'\n');}
  function retainAccountFailure(event){
    if(event.stage!=='account-first-failure'||firstAccountErrorRetained||!Object.hasOwn(event,'originalError'))return;
    firstAccountErrorRetained=true;
    try {
      // Reuse the reviewed native-V8 formatter: only closed source codes and
      // physical owned source locations. No reference, message, wire or state.
      const first=privateNativeEconomicSuccessorFirstErrorV1(event.originalError);
      const diagnostic=privateFailureDiagnostic(event.originalError,'FLAT_ACCOUNT_ORIGINAL_OUTCOME_UNRESOLVED');
      writeFixturePrivate(join(privateDirectory,'account-first-error-private.json'),{...first,diagnostic});
    }catch{ /* Preserve the first cause and original cleanup on storage failure. */ }
  }
  async function retainProof({label,relation,proof}) {
    assert.ok(!proofsByLabel.has(label),'NATIVE_WALLET_DUPLICATE_PROOF_ROLE');
    const payload=typeof proof.proof==='string'?Buffer.from(proof.proof,'hex'):Buffer.from(proof.proof),inputs=fixtureJSON(proof.publicInputs);
    const width=relation==='admission_native_value_v2'?84:roles.get(relation);
    assert.equal(proof.publicInputs.length,width,'NATIVE_WALLET_PROOF_PUBLIC_WIDTH');
    const file=relation==='admission_native_value_v2'?'original-native-I84':null;
    // Only the explicitly approved I84 public proof/inputs are exported here.
    // Other original workers retain their own evidence; this report stores hashes.
    if(file){
      writeFileSync(join(proofDirectory,file+'.bin'),payload,{flag:'wx',mode:0o600});
      writeFileSync(join(proofDirectory,file+'.inputs.json'),inputs,{flag:'wx',mode:0o600});
    }
    const publicRecord={label,relation,publicWords:width,file,proofSHA256:hash(payload),publicInputsSHA256:hash(inputs)};
    proofsByLabel.set(label,{proof:payload.toString('hex'),publicInputs:[...proof.publicInputs]});
    if(relation==='admission_native_value_v2')result.admissionProof=publicRecord;else result.proofs.push(publicRecord);
    save(); return publicRecord;
  }
  // Read-only original inclusion check. The native factory deliberately has no
  // public clock mutator. Its fixed next block must already fit original P/R,
  // using the pre-funding receiver schedule below; never repair it here.
  async function checkOriginalNativeFixtureInclusion(detail) {
    if(detail.stage!=='dispatch-native-leg-0')return;
    if(tron)return checkOriginalTronInclusion(detail);
    assert.equal(detail.reference,graphRef,'NATIVE_WALLET_CLOCK_ORIGINAL_GRAPH');
    assert.equal(result.nativeClockSynchronization,undefined,'NATIVE_WALLET_CLOCK_NO_RETRY');
    const sync=result.nativeClockSynchronization={phase:'checking',clockChanged:false,windowsChanged:false};save();
    try {
      assert.equal(owner.report().available,false,'NATIVE_WALLET_CLOCK_OWNER_STAYS_ABSENT');
      await assertOwnedLocalEvmNativeValueV1(nativeRuntime);
      assert.equal(nativeTransactionCount(),0,'NATIVE_WALLET_CLOCK_BEFORE_FIRST_PREPARATION');
      assert.deepEqual(nativeRuntime.mutationStatus,{busy:false,uncertain:false});
      const dependency=proofsByLabel.get('leg-0-dependency'),readiness=proofsByLabel.get('leg-0-readiness');
      assert.ok(dependency&&readiness,'NATIVE_WALLET_CLOCK_ORIGINAL_PROOFS_REQUIRED');
      const proofBinding=hash(fixtureJSON([dependency,readiness]));
      const d=decodeStatement('dependency',dependency.publicInputs),ready=decodeStatement('ready',readiness.publicInputs);joinReadiness(d,ready);
      const action=graphPrepared.rolePackets.local[0].action,core=graphPrepared.rolePackets.reservation.core.value;
      const bounds=Object.freeze({readyFrom:ready.readyFrom,readyUntil:ready.readyUntil,
        executionFrom:action.executionFrom,executionUntil:action.executionUntil,settleBefore:core.settleBefore});
      const source=await reader.read({domainCommitment:ready.domainCommitment,authorizationRoot:ready.authorizationRoot,checkpoint:ready.checkpoint});
      const original=source.dispatch.checkpointSnapshot;
      assert.equal(original.timestamp,ready.readyFrom,'NATIVE_WALLET_CLOCK_ORIGINAL_CHECKPOINT_TIME');
      assert.deepEqual({...source.snapshot,timestamp:original.timestamp},original,'NATIVE_WALLET_CLOCK_ORIGINAL_CHECKPOINT_STATE');
      assert.equal(source.head.timestamp,ready.readyFrom,'NATIVE_WALLET_CLOCK_NO_STALE_SOURCE_REFRESH');
      const head=await nativeRuntime.block(),before=BigInt(head.timestamp);
      const next=before+1n,sourceNow=BigInt(source.head.timestamp),schedule=result.preflight.fixtureClockSchedule;
      assert.equal(BigInt(head.number),0n,'NATIVE_WALLET_NATIVE_GENESIS_UNCHANGED');
      assert.equal(before.toString(),schedule.nativeInitialSecond,'NATIVE_WALLET_NATIVE_INITIAL_TIME_CHANGED');
      assert.equal(next.toString(),schedule.expectedReadyFrom,'NATIVE_WALLET_FIXED_NATIVE_INCLUSION');
      assert.equal(ready.readyFrom,schedule.expectedReadyFrom,'NATIVE_WALLET_FIXED_SOURCE_BLOCK_SEQUENCE');
      assert.equal(sourceNow,next,'NATIVE_WALLET_SOURCE_NATIVE_INCLUSION_MATCH');
      assert.ok(before<=sourceNow,'NATIVE_WALLET_CLOCK_NATIVE_AHEAD');
      assert.ok(BigInt(bounds.readyFrom)<=sourceNow&&sourceNow<BigInt(bounds.readyUntil)
        &&BigInt(bounds.executionFrom)<=sourceNow&&sourceNow<BigInt(bounds.executionUntil)&&sourceNow<BigInt(bounds.settleBefore),
        'NATIVE_WALLET_CLOCK_SOURCE_OUTSIDE_ORIGINAL_WINDOW');
      assert.ok(BigInt(bounds.readyFrom)<=next&&next<BigInt(bounds.readyUntil)
        &&BigInt(bounds.executionFrom)<=next&&next<BigInt(bounds.executionUntil)&&next<BigInt(bounds.settleBefore),
        'NATIVE_WALLET_CLOCK_NO_VALID_ORIGINAL_INCLUSION');
      Object.assign(sync,{nativeHeadBefore:before.toString(),sourceHead:sourceNow.toString(),plannedNativeInclusion:next.toString(),bounds});save();
      await reader.assertCurrent(source);
      const after=await nativeRuntime.block();assert.deepEqual(after,head,'NATIVE_WALLET_CLOCK_UNCHANGED_NATIVE_HEAD');
      await reader.assertCurrent(source);assert.equal(nativeTransactionCount(),0);
      assert.equal(owner.report().available,false);assert.equal(hash(fixtureJSON([dependency,readiness])),proofBinding);
      assert.deepEqual(bounds,{readyFrom:ready.readyFrom,readyUntil:ready.readyUntil,
        executionFrom:action.executionFrom,executionUntil:action.executionUntil,settleBefore:core.settleBefore});
      Object.assign(sync,{phase:'completed',nativeHeadAfter:before.toString(),originalProofsUnchanged:true,sourceHeadUnchanged:true});save();
    } catch(error) {sync.phase='failed';sync.errorCode=privateFailureDiagnostic(error).code;save();throw error;}
  }
  async function retainExecutionFailure(event){
    if(tron&&event.stage==='native-admitted'){
      assert.equal(result.originalI84WorkerEvidence,undefined,'TRON_WALLET_SINGLE_I84_JOB');
      assert.ok(event.originalProofEvidence);result.originalI84WorkerEvidence=structuredClone(event.originalProofEvidence);save();
    }
    // Fixed private diagnostic events only; no operation reference, native ID,
    // witness, raw exception, or economic state is exported by this projection.
    if(event.stage==='execution-first-failure'){
      // Synchronous 0600 retention precedes the keeper's error-state commit and
      // SDK polling. A later aggregate error must not overwrite this first cause.
      if(!result.originalExecutionFailure&&Object.hasOwn(event,'originalError'))
        retainPrivateError('execution-first-error-private.json',event.originalError,event.diagnostic);
      result.originalExecutionFailure??={diagnostic:structuredClone(event.diagnostic),
        retainedState:structuredClone(event.retainedState),
        retainedStateAuthority:'LAST_KEEPER_MEMORY_NOT_A_TERMINAL_OR_DURABLE_ERROR_COMMIT',
        authoritativeErrorCommit:'NOT_ATTEMPTED'};save();
    }else if(event.stage==='execution-error-commit'&&result.originalExecutionFailure){
      result.originalExecutionFailure.authoritativeErrorCommit=event.status;
      if(event.status==='UNAVAILABLE')result.originalExecutionFailure.commitFailure=structuredClone(event.diagnostic);
      save();
    }
  }
  async function auditCounts(){
    if(nativeRuntime)result.nativeDeliveryCount=tron?(nativeAudit().journal&&readTronJournal(nativeAudit().journal).phase==='OBSERVED'?1:0):nativeRuntime.transactions.filter(r=>r.signed&&r.receipt?.status==='0x1').length;
    if(execution&&graphRef){
      try{result.originalGraphSnapshot=execution.snapshot(graphRef);
        result.originalGraphSnapshotAvailability={status:'AVAILABLE_MEMORY_SNAPSHOT'};
      }catch(error){
        if(result.originalGraphSnapshot)result.lastOriginalGraphSnapshot=result.originalGraphSnapshot;
        result.originalGraphSnapshot=null;
        result.originalGraphSnapshotAvailability={status:'UNAVAILABLE',diagnostic:nativeValueFailureDiagnostic(error),
          previousSnapshotIsCurrent:false};
      }
    }
    // Retain actual phase labels/counts, never native IDs, signatures or raw wire.
    result.nativeRecordStates=tron&&nativeRuntime?[{phase:nativeRuntime.report().phase,signed:Boolean(nativeAudit().entry?.signed),broadcastCount:nativeTransactionCount()}]:nativeRuntime?.transactions.map(r=>({phase:r.phase,signed:!!r.signed,receiptStatus:r.receipt?.status??null,
      ...(r.finalityConfirmation?{finalityConfirmation:Object.fromEntries(['phase','requiredEmptyBlocks','confirmedEmptyBlocks','includedNumber','includedTimestamp','tipNumber','tipTimestamp','finalizedNumber'].map(k=>[k,r.finalityConfirmation[k]]))}:{})}))??[];
    writeFixturePrivate(join(privateDirectory,'observation-counts.json'),{phase:result.phase,nativeRecordStates:result.nativeRecordStates,
      receiverTransactions:runtime?.transactions.length??0,nativeTransactions:nativeTransactionCount(),
      originalOwnerAvailable:owner?.report().available??null}); save();
  }
  async function cleanup(){
    if(closed)return;closed=true;
    const failures=[];
    const close=async(name,fn)=>{try{await fn();}catch(error){failures.push({name,code:privateFailureDiagnostic(error).code});}};
    if(app)await close('listener',()=>app.close());
    if(account)await close('account-abort',()=>account.abort());
    if(execution)await close('execution-abort',()=>execution.abort());
    if(legacy)await close('recipient-proof',()=>legacy.close());
    if(joined)await close('session',()=>joined.session.close());
    if(account)await close('account',()=>account.close());
    if(execution)await close('execution',()=>execution.close());
    if(custody&&!custody.report().leaseIssued)await close('unopened-custody',()=>custody.close());
    if(recipient)await close('recipient',()=>recipient.close());
    if(owner)await close('owner',()=>owner.close());
    if(bootstrap)await close('bootstrap',()=>bootstrap.close());
    for(const [name,resource] of [['closedEvm',runtime],[tron?'closedNativeTron':'closedNativeEvm',nativeRuntime]])if(resource){
      try{const stopped=await resource.close();if(tron&&resource===nativeRuntime){assert.equal(stopped.stopped,true);assert.equal(stopped.forced,false);assert.equal(stopped.exitCode,0);assert.equal(stopped.signal,null);result.cleanup.tronOriginal=stopped;}result.cleanup[name]=true;}catch(error){result.cleanup[name]=false;failures.push({name,code:privateFailureDiagnostic(error).code});}}
    if(tron&&failures.length===0){await close('synthetic-private-files',async()=>{
     for(const name of ['owner','original-solver-payout.vault','original-account-journal.vault','original-account-journal.vault.economic-state.vault']){
      const path=join(privateDirectory,name);assert.equal(realpathSync(path),path,'TRON_WALLET_PRIVATE_CLEANUP_ALIAS');const stat=lstatSync(path);
      assert.equal(stat.uid,process.getuid());assert.equal(stat.isSymbolicLink(),false);
      assert.ok(stat.isDirectory()?(stat.mode&0o7777)===0o700:(stat.mode&0o7777)===0o600,'TRON_WALLET_PRIVATE_CLEANUP_MODE');
      rmSync(path,{recursive:stat.isDirectory()});
     }result.cleanup.syntheticPrivateFilesRemoved=true;
    });}
    result.cleanup.failures=failures;if(failures.length)throw Error('NATIVE_WALLET_CLEANUP_INCOMPLETE');
  }
  const stop=()=>{if(interrupted)return;interrupted=true;result.interruption={at:new Date().toISOString(),phase:result.phase};
    void auditCounts().catch(()=>{}).then(cleanup).catch(()=>{}).finally(()=>{result.phase='failed';result.success=false;
      result.errorCode='NATIVE_WALLET_INTERRUPTED_ORIGINAL_OUTCOME_UNKNOWN';save();process.exit(2);});};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  async function openListener(){const economicState=readOriginalSessionWalletEconomicStateV1(joined.session)??await createOriginalSessionWalletEconomicStateV1(joined.session);
    app=await startWalletApplication({accountSession:joined.session,economicState,actionAccessMode:'exact-only',port:0});
    driver=createManualWalletAppDriver(app,{deadlineMs});assert.equal(app.actionAccess,undefined);}
  async function health(phase,backed,reservations,inventoryCount){
    remaining(); assertOwnedNativeValueSystem(runtime,system);
    const before=await reader.read(); assert.equal(before.ledger.publicState.backedAmount,backed);
    assert.equal(before.ledger.publicState.liveReservations,reservations);
    const permit=await system.quorum.health({poolIndex:0,validUntil:(BigInt(before.head.timestamp)+30n).toString()});
    assert.deepEqual(permit.head,before.head);assert.deepEqual(permit.indexes,[0,1,2]);assert.equal(permit.audits.length,3);
    assert.equal(BigInt(permit.message.validUntil)-BigInt(permit.message.validFrom),30n);
    const counts=[];
    for(const a of permit.audits){assert.deepEqual(a.head,before.head);assert.deepEqual(a.blockers,[]);
      assert.equal(a.inventoryCount,String(inventoryCount));assert.equal(a.observations.length,inventoryCount);counts.push(a.inventoryCount);
      for(const o of a.observations){assert.equal(o.attempted,true);assert.equal(o.nativeObservationReturned,true);
        assert.equal(o.sourceStatus,'observed');assert.ok(BigInt(o.authenticatedNativeReadCount)>0n);assert.equal(o.priorAdverse,false);}}
    await reader.assertCurrent(before);remaining();
    result.health.push({phase,inventoryCounts:counts,blockers:0,fullInventories:true,exactCurrentHead:true,
      headSHA256:hash(fixtureJSON(before.head)),originalThirtySecondGuard:true});save();return before;
  }
  async function ownerReview(proposal){
    const review=await preparation.review(proposal);assert.equal(review.request.requestId,proposal.requestId);
    assert.equal(review.kind,proposal.kind);assert.equal(review.keyScopeSHA256,ownerScope.keyScopeSHA256);
    assert.equal(review.processIdentitySHA256,ownerScope.processIdentitySHA256);
    assert.equal(review.amount,proposal.kind==='TOP_UP'?NATIVE_WALLET_ECONOMICS_V1.sourceDepositAtomic:NATIVE_WALLET_ECONOMICS_V1.sourceChangeAtomic);
    // Fixed script explicitly confirms THIS original owner-local review.
    const body=await preparation.confirm();assert.ok(body,'NATIVE_WALLET_ORIGINAL_NOTE_CONSENT_UNRESOLVED');
    assert.deepEqual(body,review.request);assert.deepEqual(joined.bindManualNote(preparation.originalApproval(body.requestId)),body);
    handoffs.set(body.requestId,body);return body;
  }
  async function accountAction(action,body){
    remaining();const before=[runtime.transactions.length,nativeTransactionCount()];
    const output=await driver.account(action,body);
    if(action==='reconcile')assert.deepEqual([runtime.transactions.length,nativeTransactionCount()],before,'NATIVE_WALLET_RECONCILE_RESENT');
    await auditCounts();return output.snapshot;
  }
  async function duplicateNoEffect(requestId){
    const before=[runtime.transactions.length,nativeTransactionCount()],client=createWalletApplicationClient({origin:app.origin,ownerToken:app.ownerAccess.token});
    assert.equal(await client.refresh(),true);
    // Confirmed execute cannot acquire a fresh grant; the SDK rejects it before
    // any send. Every successful action also tests its original token replay.
    assert.throws(()=>client.review('accountExecute',{requestId}));
    assert.deepEqual([runtime.transactions.length,nativeTransactionCount()],before);
  }
  async function awaitSessionAdmission(receipt){
    for(;;){remaining();const s=await joined.session.snapshot(),row=s.admissions.find(a=>a.sequence===receipt.sequence);
      assert.ok(row);if(row.state==='FAILED')throw Error(row.errorCode);
      if(row.state==='SUCCEEDED'&&s.busy===false&&s.queued===0&&s.observation==='CURRENT')return s;
      await new Promise(r=>setTimeout(r,Math.min(500,remaining())));}
  }
  try {
    await stage('genuine-artifacts-before-runtime-or-funding');
    const bundle=await (tron?loadNativeValueDevDeploymentArtifactsV5():loadNativeValueDeploymentArtifacts()),live=await (tron?loadNativeValueDevLiveArtifactsV5():loadNativeValueLiveArtifacts());
    assert.deepEqual(Object.keys(bundle.verifiers).sort(),NATIVE_VALUE_VERIFIER_ORDER.map(([name])=>name).sort());
    assert.equal(live.keySHA256,NATIVE_VALUE_LIVE_V2_KEY_SHA256);assert.equal(live.sourceVersion,NATIVE_VALUE_LIVE_V2_SOURCE_VERSION);
    assert.equal(live.artifactSHA256,NATIVE_VALUE_ACCEPTED_PROGRAM_SHA256);
    assert.equal(bundle.verifiers.admission.lineage.keySHA256,live.keySHA256);
    assert.equal(bundle.verifiers.admission.lineage.programSHA256,live.artifactSHA256);
    assert.equal(bundle.verifiers.admission.lineage.publicWords,84);
    result.artifacts={provenanceSHA256:hash(fixtureJSON(bundle.provenance)),admissionKeySHA256:live.keySHA256,
      admissionProgramSHA256:live.artifactSHA256,admissionSourceVersion:live.sourceVersion};
    result.preflight.genuineArtifactsLoadedBeforeRuntimes=true;result.preflight.allTwelveVerifierLineages=true;
    await stage('unfunded-original-runtime-deployment-and-session');
    runtime=await (tron?createOwnedLocalEvmObservedClockV1():createOwnedLocalEvmV2());nativeRuntime=await (tron?createOwnedLocalTronNativeValueV1():createOwnedLocalEvmNativeValueV1());
    await assertOwnedLocalEvmV2(runtime);await (tron?assertOwnedLocalTronNativeValueV1(nativeRuntime):assertOwnedLocalEvmNativeValueV1(nativeRuntime));
    // Inspect the actual original objects before deployment, owner terms or funds.
    // Native-value instances intentionally omit receiver send/dispatch/clock APIs.
    if(tron){assert.equal(Object.hasOwn(runtime,'advanceTo'),false,'TRON_WALLET_RECEIVER_NO_CALLER_CLOCK');
      assert.equal(typeof runtime.refreshObservedClock,'function','TRON_WALLET_ORIGINAL_OBSERVED_CLOCK');
    }else assert.equal(typeof runtime.advanceTo,'function','NATIVE_WALLET_RECEIVER_CLOCK_API_REQUIRED');
    for(const name of ['advanceTo','send','dispatch'])
      assert.equal(Object.hasOwn(nativeRuntime,name),false,'NATIVE_WALLET_NATIVE_MUTATOR_API_FORBIDDEN');
    for(const name of (tron?['health','dispatchNativeValueV1','assertNativeValuePreparedCurrent','observeNativeValueOriginal']:['health','block','time','dispatchNativeValueV1','assertNativeValuePreparedCurrent','observeNativeValueOriginal']))
      assert.equal(typeof nativeRuntime[name],'function','NATIVE_WALLET_NATIVE_ORIGINAL_API_REQUIRED');
    result.preflight.actualRuntimeCapabilitySurfaceVerified=true;
    result.preflight.nativeClockMutatorAbsent=true;save();
    assert.notEqual(runtime,nativeRuntime);if(tron)assert.notEqual(runtime.metadata.processId,nativeRuntime.metadata.processId??nativeRuntime.metadata.pid);else assert.notEqual(runtime.metadata.processId,nativeRuntime.metadata.processId);
    assert.equal(runtime.metadata.chainId,'31337');
    let registered;
    if(tron){
      assert.equal(nativeRuntime.metadata.classification,'LOCAL_SYNTHETIC_TRON_JAVA_TRON_CONSENSUS');
      result.nativeProfile={family:'4',genesis:nativeRuntime.metadata.genesis,publicNetwork:false,
       productionClientAcceptance:'UNVERIFIED',publicConsensusOrFinalityVerified:false};
      bootstrap=await createOwnedLocalTronWallclockOperatorBootstrapV1({nativeRuntimes:[nativeRuntime]});
      registered=bootstrap.metadata.adapterProfiles[0];assert.equal(bootstrap.metadata.adapterProfiles.length,1);
      assert.equal(registered.profile.maximumAncestry,'256');assert.equal(registered.profile.maximumEvidenceLifetime,'300');
      assert.equal(registered.profile.genesis,nativeRuntime.metadata.genesis);
      for(let i=0;i<4;i++)assert.deepEqual(registered.sources[i].identity,describeOwnedLocalTronNativeValueSource(nativeRuntime,{profile:registered.profile,sourceIndex:String(i)}).identity);
      system=await deployNativeValueDevSystemV5({runtime,options:{deploymentDomain:'0x'+freshFixtureId(),registryEpoch:'1',bootstrap,
       pools:[0,1].map(()=>({policy:'0x'+freshFixtureId(),deploymentDomain:'0x'+freshFixtureId()}))}});
      assertOwnedNativeValueSystem(runtime,system);assert.equal(system.claimsEnabled,false);
      assert.deepEqual(system.adapterProfiles,bootstrap.metadata.adapterProfiles);
      for(const d of system.deployments)assert.ok(d.runtimeBytes<=24576);
      result.preflight.fixtureClockSchedule={receiverMode:'OBSERVED_WALLCLOCK_SECONDS_V1',nativeConsensusClockOriginal:true,
       syntheticBlockScheduleInstalled:false,windowsRenewed:false};save();
    }else{
assert.equal(runtime.metadata.chainId,'31337');assert.equal(nativeRuntime.metadata.chainId,'1');
    result.nativeProfile={chainId:'1',publicNetwork:false,productionClientAcceptance:'UNVERIFIED',publicConsensusOrFinalityVerified:false};
    bootstrap=await createOwnedLocalNativeValueOperatorBootstrap({nativeRuntimes:[nativeRuntime]});
    assert.equal(bootstrap.metadata.adapterProfiles.length,1);registered=bootstrap.metadata.adapterProfiles[0];
    assert.equal(registered.profile.chainId,'1');assert.equal(registered.profile.genesis,bare(nativeRuntime.metadata.evmGenesis));
    assert.equal(registered.profile.maximumEvidenceLifetime,'30');
    assert.equal(new Set(registered.sources.map(s=>s.identity.endpointIdentity)).size,4);
    for(let i=0;i<4;i++){const original=await describeOwnedLocalEvmNativeValueSource(nativeRuntime,i);
      for(const k of ['endpointIdentity','clientRelease','chainConfiguration'])assert.equal(registered.sources[i].identity[k],original.identity[k]);}
    system=await deployNativeValueSystem({runtime,options:{deploymentDomain:'0x'+freshFixtureId(),registryEpoch:'1',bootstrap,
      pools:[0,1].map(()=>({policy:'0x'+freshFixtureId(),deploymentDomain:'0x'+freshFixtureId()}))}});
    assertOwnedNativeValueSystem(runtime,system);assert.equal(system.claimsEnabled,false);
    assert.equal(system.adapterProfiles.length,1);assert.deepEqual(system.adapterProfiles,bootstrap.metadata.adapterProfiles);
    for(const d of system.deployments)assert.ok(d.runtimeBytes<=24576);
    // Fixed source schedule: D top-up, S reservation, then checkpoint each
    // mine one block before native dispatch. Native's first inclusion is +1.
    // Set ONLY the owned receiver, forward-only, before owner terms or funding.
    // The later read-only P/R check enforces this exact sequence; no catch-up.
    const nativeNow=await nativeRuntime.time(),receiverNow=await runtime.time();
    const sourceBlocksBeforeNative=3n,nativeNext=nativeNow+1n,receiverInitial=nativeNext-sourceBlocksBeforeNative;
    assert.ok(receiverNow<=receiverInitial,'NATIVE_WALLET_INITIAL_CLOCK_ALIGNMENT_UNAVAILABLE');
    assert.ok((nativeNow-receiverInitial)*1000n<=BigInt(registered.profile.maximumClockSkewMs),
      'NATIVE_WALLET_INITIAL_NATIVE_SKEW_LIMIT');
    assert.equal(nativeTransactionCount(),0);
    if(receiverNow<receiverInitial)await runtime.advanceTo(receiverInitial.toString());
    assert.equal(await runtime.time(),receiverInitial);assert.equal(await nativeRuntime.time(),nativeNow);
    result.preflight.fixtureClockSchedule={nativeInitialSecond:nativeNow.toString(),receiverInitialSecond:receiverInitial.toString(),
      sourceBlocksBeforeNative:Number(sourceBlocksBeforeNative),expectedReadyFrom:nativeNext.toString(),
      receiverScheduledBeforeOwnerTermsAndFunds:true,nativeClockMutated:false};save();
    }
    reader=await createNativeValueSystemStateReader({runtime,system,poolIndex:0});
    const ownerDir=join(privateDirectory,'owner');mkdirSync(ownerDir,{mode:0o700});
    owner=await createNativeValueOwnerProcess({runtime,system,poolIndex:0,directory:ownerDir,password:freshFixtureId(),create:true,checkpoint:null,
      onCheckpoint:async value=>writeFixturePrivate(join(ownerDir,'checkpoint.json'),value)});
    ownerScope=await owner.publicView.summary();
    execution=await createNativeValueExecution({runtime,system,poolIndex:0,quorum:system.quorum},{onProof:retainProof,onStage:checkOriginalNativeFixtureInclusion,onPrivateAudit:retainExecutionFailure});
    account=await createNativeValueAccountAuthority({runtime,system,poolIndex:0,owner,nativeExecution:execution,
      accountId:freshFixtureId(),journalId:freshFixtureId()},{onProof:retainProof,onPrivateAudit:retainAccountFailure,onStage:async detail=>{
        if(detail.stage==='OWNER_SUSPENDED_BEFORE_NATIVE'){
          assert.equal(detail.reference,graphRef);assert.equal(owner.report().available,false);
          await health('reserved-before-native',NATIVE_WALLET_ECONOMICS_V1.sourceDepositAtomic,1,0);
        }
      }});
    preparation=await account.ownerActions.createManualPreparation();
    joined=await createNativeValueManualGraphAccountSession({runtime,system,poolIndex:0,account,
      journal:{path:join(privateDirectory,'original-account-journal.vault'),password:freshFixtureId()}});
    await openListener();const initialApp=await driver.state();assert.ok(initialApp.account);
    preflightIdentity={runtime,nativeRuntime,system,owner,account,joined,preparation};
    await health('empty','0',0,0);
    const proposal={requestId:NATIVE_WALLET_REQUEST_IDS_V1[0],kind:'TOP_UP',amount:NATIVE_WALLET_ECONOMICS_V1.sourceDepositAtomic,exitRecipient:bare(runtime.accounts[3])};
    const preReview=await preparation.review(proposal);assert.equal(preReview.amount,proposal.amount);
    assert.equal(preparation.cancelReview(),true);assert.equal(await preparation.confirm(),false);
    assert.equal(runtime.transactions.filter(t=>BigInt(t.request.value??'0')!==0n).length,0);
    assert.equal(nativeTransactionCount(),0);assert.equal(result.proofs.length,0);
    Object.assign(result.preflight,{genuineOriginalFactories:true,constructorStorageVerified:true,sameOriginalFixture:true,
      sameOriginalOwnerAccountSession:true,exactRegisteredNativeProfile:true,emptyCurrentFullInventoryHealth:true,
      sourceFundingAbsent:true,nativeDeliveryAbsent:true,confirmedSourceValueTransfers:0,
      manualReviewCancelledWithoutConsent:true,sourcePoolBalance:'0'});save();
    if(!unfundedOnly){
      for(const [key,value] of Object.entries({runtime,nativeRuntime,system,owner,account,joined,preparation}))
        assert.equal(value,preflightIdentity[key],'NATIVE_WALLET_ORIGINAL_FIXTURE_REBOUND');
      await stage('manual-top-up-shared-http-sdk');
      const receiverPayerBefore=await runtime.balance(runtime.accounts[0]),receiverTransactionStart=runtime.transactions.length;
      const changeBefore=await runtime.balance(runtime.accounts[3]),payoutBefore=await runtime.balance(runtime.accounts[1]);
      const nativeSenderBefore=tron?BigInt((await nativeRuntime.health()).ownerBalanceSun):await nativeRuntime.balance(nativeRuntime.accounts[0]),nativeRecipientBefore=tron?null:await nativeRuntime.balance(nativeRuntime.accounts[1]);
      const topUp=await ownerReview(proposal);await accountAction('prepare',topUp);
      await accountAction('execute',{requestId:topUp.requestId});result.funded=true;
      await accountAction('reconcile',{requestId:topUp.requestId});await duplicateNoEffect(topUp.requestId);
      await stage('same-fixture-loaded-liability-preflight-before-U-S');
      await health('loaded-before-authorization',NATIVE_WALLET_ECONOMICS_V1.sourceDepositAtomic,0,0);
      assert.equal(nativeTransactionCount(),0);assert.equal(result.proofs.length,1);
      await stage('original-owner-and-solver-one-leg-graph-preparation');
      const now=await runtime.time(),cutoff=now+28800n,domain=system.pools[0].domain,operationId=freshFixtureId();
      const directory=join(nativeRuntime.metadata.scratchDirectory,'original-native-solver');mkdirSync(directory,{mode:0o700});
      custody=await createOwnedNativeValueProviderCustody({runtime,system,poolIndex:0,nativeRuntime,bootstrap,
        profileCommitment:profileCommitment(system.adapterProfiles[0].profile),recipientEndpoint:nativeRuntime.accounts[1],
        terms:{scope:domain.scope,policy:domain.policy,asset:domain.asset,amount:NATIVE_WALLET_ECONOMICS_V1.solverNativeDeliveryAtomic,
          executionFrom:String(now),executionUntil:String(cutoff-60n),settleBefore:String(cutoff)},
        acceptedLossClause:NATIVE_ADMISSION_LOSS_CLAUSE,directory,password:freshFixtureId()});
      const offer=custody.offer();
      recipientBoot={mode:'create',path:join(privateDirectory,'original-solver-payout.vault'),password:freshFixtureId(),
        expectedTerms:{scope:domain.scope,policy:domain.policy,asset:domain.asset,hubDomain:domain.hubDomain,
          registryCommitment:domain.registryCommitment,operationId,slot:0,evidencePolicy:offer.evidencePolicy,
          value:NATIVE_WALLET_ECONOMICS_V1.solverPayoutAtomic,settleBefore:String(cutoff),actionTemplate:offer.actionTemplate},
        withdrawalRecipient:bare(runtime.accounts[1])};
      recipient=await createNativeRecipientProcess(recipientBoot);const recipientOffer=await recipient.offer();
      const {settleBefore:_cutoff,...actionTemplate}=offer.actionTemplate;
      await owner.owner.prepareAuthorization({changeRecipient:bare(runtime.accounts[3]),recoveryRecipient:bare(runtime.accounts[3]),
        nativeConfig:{...Object.fromEntries(['scope','policy','asset','hubDomain','registryCommitment'].map(k=>[k,domain[k]])),
          operationId,fundingNotBefore:String(now),fundingValidUntil:String(now+7200n),settleBefore:String(cutoff),
          nodes:[{id:'native-leg-0',dependsOn:[],evidencePolicy:offer.evidencePolicy,actionTemplate,recipientOffer}]}});
      const invoices=await owner.owner.invoiceRequests();assert.equal(invoices.length,1);assert.equal(invoices[0].slot,0);
      const invoice=await recipient.acceptInvoice(invoices[0].invoice);await custody.bindQuote({recipientCustody:recipient});
      const deliveryRiskSalt=(await recipient.acceptedQuote()).deliveryRiskSalt;
      await owner.owner.authorize({invoiceSignatures:[invoice.invoiceSignature]});
      const authorization=await owner.ownerProof.proveAuthorization();await retainProof({label:'owner-envelope',relation:'authorization',proof:authorization});
      const rolePackets={};for(const name of ['reservation','recovery','assembler'])rolePackets[name]=(await owner.roles[name]()).select();
      for(const name of ['local','dependency']){rolePackets[name]=[];for(let slot=0;slot<4;slot++)rolePackets[name].push((await owner.roles[name](slot)).select());}
      graphPrepared={authorization:{proof:authorization.proof,publicInputs:[...authorization.publicInputs]},rolePackets};graphRef=freshFixtureId();
      await account.ownerActions.registerGraph({ownerOperationRef:graphRef,prepared:graphPrepared,providers:[{slot:0,custody,deliveryRiskSalt}]});
      const approval=await account.ownerActions.approveManualNativeValueGraph({requestId:NATIVE_WALLET_REQUEST_IDS_V1[1],ownerOperationRef:graphRef});
      const graph=joined.bindManualGraph(approval);handoffs.set(graph.requestId,graph);
      await stage('shared-http-sdk-original-native-I84-and-ordinary-N-T');
      await accountAction('prepare',graph);await accountAction('execute',{requestId:graph.requestId});
      assert.equal(owner.report().available,false);assert.equal(owner.report().childExited,true);
      const snap=execution.snapshot(graphRef);assert.equal(snap.outcome,'FULFILLED');assert.equal(snap.admittedReceipts,1);
      assert.deepEqual(snap.nativeExposure,[{slot:0,family:tron?'4':'3',status:'ADMITTED'}]);
      await accountAction('reconcile',{requestId:graph.requestId});await duplicateNoEffect(graph.requestId);
      const view=await health('settled-loaded',NATIVE_WALLET_ECONOMICS_V1.sourceDepositAtomic,0,1);
      const admissions=runtime.transactions.filter(t=>t.request.to===system.hub.address&&t.request.data?.slice(2,10)===FLAT_TRANSACTION_METHODS.admit.selector);
      assert.equal(admissions.length,1,'NATIVE_WALLET_EXACT_ORIGINAL_ADMISSION');const admitted=admissions[0];
      assert.equal(admitted.phase,'mined');assert.equal(admitted.receipt.status,'0x1');assert.equal(admitted.receipt.to,system.hub.address);
      assert.equal(admitted.receipt.transactionHash,admitted.transactionHash);await runtime.checkReceipt(admitted.receipt);await runtime.assertCanonical(admitted.receipt);
      const transaction=await runtime.transaction(admitted.transactionHash);assert.equal(transaction.to,system.hub.address);
      assert.equal(transaction.input,admitted.request.data);assert.equal(BigInt(transaction.value),0n);
      const decoded=decodeNativeWalletAdmissionCalldata(admitted.request.data);assert.equal(decoded.request.pool,system.pools[0].address);
      assert.equal(system.hub.selectors[FLAT_TRANSACTION_METHODS.admit.signature],FLAT_TRANSACTION_METHODS.admit.selector);
      assert.deepEqual(decoded.request.dependency,proofsByLabel.get('leg-0-dependency'));assert.deepEqual(decoded.request.readiness,proofsByLabel.get('leg-0-readiness'));
      assert.equal(decoded.admission.domainCommitment,bare(system.pools[0].domainCommitment));
      assert.ok(view.receiptLeaves.includes(decoded.admission.receiptLeaf));
      assert.equal(system.verifiers.admission.lineage.keySHA256,result.artifacts.admissionKeySHA256);
      assert.equal(system.verifiers.admission.lineage.programSHA256,result.artifacts.admissionProgramSHA256);
      assert.equal(await system.verify('admission',Buffer.from(decoded.request.admission.proof,'hex'),hexWords(decoded.request.admission.publicInputs)),true);
      const retained=await retainProof({label:'original-native-I84',relation:'admission_native_value_v2',proof:decoded.request.admission});
      if(tron){const original=result.originalI84WorkerEvidence;assert.ok(original);
        assert.equal(original.proofSHA256,retained.proofSHA256);assert.equal(original.publicInputsSHA256,retained.publicInputsSHA256);
        assert.equal(original.keySHA256,system.verifiers.admission.lineage.keySHA256);
        assert.equal(original.programSHA256,system.verifiers.admission.lineage.programSHA256);}
      Object.assign(retained,{originalCanonicalCall:true,deployedVerifierAccepted:true,originalI84ArtifactBound:true,
        keySHA256:system.verifiers.admission.lineage.keySHA256,programSHA256:system.verifiers.admission.lineage.programSHA256,
        originalCallSHA256:hash(Buffer.from(admitted.request.data.slice(2),'hex')),receiptSHA256:hash(fixtureJSON(admitted.receipt))});
      const terminals=runtime.transactions.filter(t=>t.request.to===system.pools[0].address&&t.request.data?.slice(2,10)===FLAT_TRANSACTION_METHODS.fulfillGeneric.selector);
      assert.equal(terminals.length,1);await runtime.checkReceipt(terminals[0].receipt);
      const terminal=decodeNativeValueTerminalCalldata(terminals[0].request.data);assert.equal(terminal.kind,'settlement');
      assert.deepEqual(terminal.request.settlement,proofsByLabel.get('global-fulfillment'));
      for(let i=0;i<4;i++)assert.deepEqual(terminal.request.completions[i],proofsByLabel.get('slot-'+i+'-completion'));
      assert.ok(view.ledger.nullifiers.includes('0x'+rolePackets.reservation.core.value.reserveNullifier));
      await stage('reopen-original-session-and-listener');
      const oldAccess=await driver.unspentGraphGrantForListenerReplacement(graph.requestId);
      result.httpEvidence.push(...driver.evidence());await app.close();app=null;
      await awaitSessionAdmission(await joined.session.restartCoordinator());await openListener();
      await driver.rejectForeignListenerGrant('accountReconcile',{requestId:graph.requestId},oldAccess);
      await accountAction('reconcile',{requestId:graph.requestId});await accountAction('reconcile',{requestId:topUp.requestId});
      await stage('reopen-original-solver-payout-and-exit');
      await recipient.close();recipient=await createNativeRecipientProcess({...recipientBoot,mode:'recover'});
      const payout=await recipient.withdrawalStatus(),payoutView=await reader.read();assert.equal(payout.amount,NATIVE_WALLET_ECONOMICS_V1.solverPayoutAtomic);
      const index=payoutView.ledger.commitments.indexOf('0x'+payout.payoutCommitment);assert.ok(index>=0);
      assert.ok(!payoutView.ledger.nullifiers.includes('0x'+payout.canonicalNullifier));
      const witness=await recipient.authorizeWithdrawal({scope:payout.scope,policy:payout.policy,payoutCommitment:payout.payoutCommitment,
        recipient:payout.recipient,amount:payout.amount,epoch:String(BigInt(payoutView.head.timestamp)/600n),path:payoutView.ledger.tree.path(index)});
      const publicInputs=walletInputPublicWords('withdraw_balance',witness);
      assert.equal(noteWordsToHash(publicInputs.slice(25,33)),'0x'+payout.canonicalNullifier);
      legacy=createProofProcess({purpose:'recipient',modes:['withdraw_balance']});
      const withdrawn=await legacy.prove('withdraw_balance',witness,publicInputs,'original-solver-payout-exit');await legacy.close();legacy=null;
      const payoutProof={proof:Buffer.from(withdrawn.proof).toString('hex'),publicInputs:[...withdrawn.publicInputs]};
      await retainProof({label:'original-solver-payout-exit',relation:'withdraw_balance',proof:payoutProof});
      const withdrawalCall=encodeFlatTransaction('withdrawBalance',payoutProof);
      await runtime.send('native-wallet-original-payout-exit',{to:system.pools[0].address,data:withdrawalCall});
      const beforeReplay=await reader.read(),balanceBeforeReplay=await runtime.balance(runtime.accounts[1]);
      await runtime.send('native-wallet-reject-original-payout-replay',{to:system.pools[0].address,data:withdrawalCall},'0x0','NOTE_ALREADY_SPENT');
      const afterReplay=await reader.read();assert.deepEqual(afterReplay.ledger.publicState,beforeReplay.ledger.publicState);
      assert.equal(await runtime.balance(runtime.accounts[1]),balanceBeforeReplay);
      assert.ok(afterReplay.ledger.nullifiers.includes('0x'+payout.canonicalNullifier));
      await stage('same-original-owner-manual-change-exit-shared-http-sdk');
      await owner.restart();const restarted=await owner.publicView.summary();
      assert.equal(restarted.keyScopeSHA256,ownerScope.keyScopeSHA256);assert.equal(restarted.processIdentitySHA256,ownerScope.processIdentitySHA256);
      assert.equal(restarted.processGeneration,ownerScope.processGeneration+1);
      const exit=await ownerReview({requestId:NATIVE_WALLET_REQUEST_IDS_V1[2],kind:'EXIT',role:'change'});
      await accountAction('prepare',exit);await accountAction('execute',{requestId:exit.requestId});
      await accountAction('reconcile',{requestId:exit.requestId});await duplicateNoEffect(exit.requestId);
      const final=await health('closed','0',0,1);
      const unusedReader=await createNativeValueSystemStateReader({runtime,system,poolIndex:1}),unused=await unusedReader.read();
      assert.deepEqual(unused.head,final.head);assert.equal(unused.ledger.publicState.backedAmount,'0');
      assert.equal(unused.ledger.publicState.actualAssetBalance,'0');assert.equal(unused.ledger.publicState.liveReservations,0);
      await unusedReader.assertCurrent(unused);await reader.assertCurrent(final);
      const changeDelta=String(await runtime.balance(runtime.accounts[3])-changeBefore),payoutDelta=String(await runtime.balance(runtime.accounts[1])-payoutBefore);
      assert.equal(changeDelta,NATIVE_WALLET_ECONOMICS_V1.sourceChangeAtomic);assert.equal(payoutDelta,NATIVE_WALLET_ECONOMICS_V1.solverPayoutAtomic);
            let nativeRecipientAfter;
      if(tron){
       const audit=nativeAudit(),journal=readTronJournal(audit.journal);assert.equal(journal.phase,'OBSERVED');
       assert.equal(journal.uncertainty,null);assert.equal(journal.adverse,false);assert.equal(journal.providerAttested,true);assert.equal(journal.sendStarted,true);
       assert.equal(nativeTransactionCount(),1);const signed=journal.signed,wire=decodeTronNativeTransferWire(signed.nativeWire);
       assert.equal(wire.nativeId,signed.nativeId);assert.equal(wire.transactionSHA256,signed.transactionSHA256);
       assert.equal(wire.ownerAddress,nativeRuntime.accounts[0]);assert.equal(wire.recipientAddress,nativeRuntime.accounts[1]);
       assert.equal(wire.amountSun,NATIVE_WALLET_ECONOMICS_V1.solverNativeDeliveryAtomic);
       const port=openOwnedTronOriginalReadPort(nativeRuntime,signed),info=await port.readTransactionInfo(),tx=await port.readTransaction();
       assert.equal(info.id,signed.nativeId);assert.equal(info.result,'SUCESS');assert.equal(tx.txID,signed.nativeId);assert.equal(tx.raw_data_hex,wire.rawDataHex);
       const solid=await port.readSolidBlock(),block=await port.readBlock(info.blockNumber);
       assert.ok(BigInt(solid.block_header.raw_data.number)>=BigInt(info.blockNumber));
       assert.equal(block.block_header.raw_data.timestamp,info.blockTimeStamp);
       assert.equal(block.transactions.filter(row=>row.txID===signed.nativeId&&row.raw_data_hex===wire.rawDataHex).length,1);
       const replay=await port.readReplay({nativeId:signed.nativeId,blockId:block.blockID});
       assert.equal(replay.nativeId,signed.nativeId);assert.equal(replay.blockId,block.blockID);assert.equal(replay.transactionSHA256,signed.transactionSHA256);
       const now=await nativeRuntime.health();assert.equal(nativeSenderBefore-BigInt(now.ownerBalanceSun),BigInt(wire.amountSun)+BigInt(info.fee));
       assert.equal(final.ledger.publicState.backedAmount,'0');assert.equal(final.ledger.publicState.actualAssetBalance,'0');assert.equal(final.ledger.publicState.liveReservations,0);
       assert.equal(BigInt(NATIVE_WALLET_ECONOMICS_V1.sourceDepositAtomic),BigInt(changeDelta)+BigInt(payoutDelta));
       result.tronConservation={amountSun:wire.amountSun,feeSun:info.fee,sourceDeltaSun:(nativeSenderBefore-BigInt(now.ownerBalanceSun)).toString(),
        canonicalSolidifiedOriginal:true,originalPermissionReplayRead:true,broadcastCount:1,recipientBalanceDeltaObserved:false};
       writeFixturePrivate(join(privateDirectory,'original-tron-canonical-observation.json'),{info,tx,solid,block,replay,finalHealth:now});
      }else{
       const nativeOriginals=nativeRuntime.transactions.filter(t=>t.signed);assert.equal(nativeOriginals.length,1);const native=nativeOriginals[0];
       assert.equal(native.phase,'mined');assert.equal(native.receipt.status,'0x1');await nativeRuntime.checkReceipt(native.receipt);await nativeRuntime.assertCanonical(native.receipt);
       const nativeTx=await nativeRuntime.transaction(native.transactionHash);assert.equal(nativeTx.from,nativeRuntime.accounts[0]);assert.equal(nativeTx.to,nativeRuntime.accounts[1]);
       assert.equal(BigInt(nativeTx.value).toString(),NATIVE_WALLET_ECONOMICS_V1.solverNativeDeliveryAtomic);
       nativeRecipientAfter=await nativeRuntime.balance(nativeRuntime.accounts[1]);
       assertNativeWalletConservation({sourceDeposit:NATIVE_WALLET_ECONOMICS_V1.sourceDepositAtomic,sourceChange:changeDelta,solverPayout:payoutDelta,
        sourcePoolBacked:final.ledger.publicState.backedAmount,sourcePoolActual:final.ledger.publicState.actualAssetBalance,liveReservations:final.ledger.publicState.liveReservations,
        nativeRecipientBefore:String(nativeRecipientBefore),nativeRecipientAfter:String(nativeRecipientAfter),nativeSenderBefore:String(nativeSenderBefore),nativeSenderAfter:String(await nativeRuntime.balance(nativeRuntime.accounts[0])),
        nativeValue:NATIVE_WALLET_ECONOMICS_V1.solverNativeDeliveryAtomic,nativeGasUsed:BigInt(native.receipt.gasUsed).toString(),nativeGasPrice:BigInt(nativeTx.gasPrice).toString()});
      }
      let receiverGas=0n,receiverValue=0n;
      for(const sent of runtime.transactions.slice(receiverTransactionStart)){
        assert.equal(sent.request.from,runtime.accounts[0]);assert.equal(sent.phase,'mined');
        await runtime.checkReceipt(sent.receipt);const tx=await runtime.transaction(sent.transactionHash);
        assert.equal(tx.from,runtime.accounts[0]);assert.equal(tx.input,sent.request.data);
        receiverGas+=BigInt(sent.receipt.gasUsed)*BigInt(tx.gasPrice);receiverValue+=BigInt(tx.value);
      }
      assert.equal(receiverValue,BigInt(NATIVE_WALLET_ECONOMICS_V1.sourceDepositAtomic));
      assert.equal(receiverPayerBefore-await runtime.balance(runtime.accounts[0]),receiverValue+receiverGas,
        'NATIVE_WALLET_SOURCE_PAYER_GAS_CONSERVATION');
      const finalApp=await driver.state();result.confirmedRequestIds=finalApp.account.snapshot.requests.map(r=>{assert.equal(r.state,'CONFIRMED');return r.requestId;});
      assert.deepEqual(result.confirmedRequestIds,NATIVE_WALLET_REQUEST_IDS_V1);
      result.httpEvidence.push(...driver.evidence());result.economics=NATIVE_WALLET_ECONOMICS_V1;
      result.finalAccounting={sourcePoolBacked:'0',sourcePoolActual:'0',unusedPoolBacked:'0',unusedPoolActual:'0',liveReservations:0,sourceChangeDelta:changeDelta,solverPayoutDelta:payoutDelta,
        nativeRecipientDelta:tron?null:String(nativeRecipientAfter-nativeRecipientBefore),nativeSenderValueAndGasAccounted:!tron,...(tron?{nativeSenderValueAndFeeAccounted:true}:{}),receiverFundingAndGasAccounted:true};
      result.acceptance={ownerAbsentDuringNativeAndSettlement:true,ordinaryFourSlotNTSettlement:true,ownerRestartedOriginal:true,
        recipientReopenedOriginal:true,sameSessionReopened:true,oldListenerGrantRejected:true,duplicateRequestsNoEffect:true,
        payoutReplayRejected:true,exactSourceConservation:true,exactNativeConservation:true,sourceReservationClosed:true};
    }
    await auditCounts();await cleanup();assert.deepEqual(tron?nativeWalletTronDevSourcePinsV5():nativeWalletRealSourcePins(),result.sourcePins);result.sourceUnchanged=true;
    result.phase='completed';result.success=true;
    (tron?assertNativeWalletTronDevResultV5:unfundedOnly?assertNativeWalletUnfundedResult:assertNativeWalletRealResult)(result);save();
  } catch(error){
    const diagnostic=privateFailureDiagnostic(error);result.errorCode=diagnostic.code;result.errorCauseCodes=diagnostic.causeCodes;
    // The terminal poll error remains separate from the retained first cause.
    retainPrivateError('error-private.json',error,diagnostic);
    if(diagnostic.auditBudget)result.errorAuditBudget=diagnostic.auditBudget;
    result.failedPhase=result.phase;await auditCounts().catch(()=>{});await cleanup().catch(()=>{});
    result.phase='failed';result.success=false;save();process.exitCode=1;
  } finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
  return result;
}
