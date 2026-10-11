/** Private withdrawals operations.
 * The owning authority supplies live state and its original guards through context.
 * This factory does not register, copy or grant an account capability.
 */
import * as PrivateExit from "../../../../../mobile-protocol/src/device-native-private-exit-v2.mjs";
import assert from "node:assert/strict";
import { isOriginalNativePrivateWorkerExecutionBridgeV3, assertDeviceOwnerExecutionBridgeV1, isOriginalNativePrivateExecutionBridgeV2 } from "../device-owner-execution-bridge-v1.mjs";
import { copy, sha } from "../../../../../engine/src/execution/accounts/generic-account-journal.mjs";
import { verifyPrivateNotePath } from "../../../../../engine/src/notes/private-note-tree.mjs";
import { exactRecord } from "../../../execution/encoding/commitments.mjs";
import { genericBalanceNativeTerms, validateGenericBalanceNativePreparation } from "../../../../../engine/src/execution/balances/generic-balance-native-preparation.mjs";
import { validateFlatAccountOwnerObservation, flatAccountCalldataHash } from "../flat-account-validation.mjs";
import { readOriginalNativePrivateExitDerivationV2 } from "../../../../../proofs/src/jobs/native-device-private-exit-client-v2.mjs";
import { captureNativeDeviceOriginalW39MetricsFrameV1 } from "../native-device-original-w39-metrics-frame-v1.mjs";
import { normalizeDeviceExitWitnessV1, deviceExitWitnessBytesV1, wipeDeviceExitWitnessV1 } from "../../../../../mobile-protocol/src/device-exit-consent-v1.mjs";
import { walletInputPublicWords, decodeWalletPoolInputs, balanceCommitment } from "../../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs";
import { nullifier } from "../../../../../engine/src/notes/private-note-encoding.mjs";
import { createNativeEconomicNoteProofProcessV1, createProofProcess } from "../../../../../engine/src/execution/proofs/proof-process.mjs";
import { privateFailureDiagnostic } from "../../../execution/account/reconciliation/failure-diagnostics.mjs";
import { encodeFlatTransaction } from "../../../execution/encoding/transaction-codec.mjs";

export function createNativeValueWithdrawals(context) {
  const privateExitEnabled=()=>context.record.data.devicePrivateW39Profile===PrivateExit.DEVICE_NATIVE_PRIVATE_EXIT_PROOF_V2;
  async function installPrivateExit(bridge){return context.exclusive(async()=>{assert.ok(context.nativeNote&&!context.wrapped&&context.privateDepositEnabled()&&!context.privateExitBridge,'NATIVE_PRIVATE_EXIT_ORIGINAL_BIRTH');await context.healthy();assert.equal(isOriginalNativePrivateWorkerExecutionBridgeV3(bridge),context.privateWorkerEnabled(),'NATIVE_PRIVATE_WORKER_SAME_JOURNAL_PROFILE');if(!privateExitEnabled()){assert.equal(context.record.data.devicePrivateW39Profile,undefined);assert.equal(context.deviceRows().length,0);assert.equal((context.record.data.deviceExits??[]).length,0);const view=await context.reader.read();assert.equal(view.ledger.commitments.length,0,'NATIVE_PRIVATE_EXIT_BEFORE_FUNDING');assert.equal(view.ledger.nullifiers.length,0);await context.reader.assertCurrent(view);context.continueWork();await context.write(d=>({...d,devicePrivateW39Profile:PrivateExit.DEVICE_NATIVE_PRIVATE_EXIT_PROOF_V2}));}context.privateExitBridge=bridge;return{installed:true,profile:PrivateExit.DEVICE_NATIVE_PRIVATE_EXIT_PROOF_V2};});}
  const exitRows=()=>context.record.data.deviceExits??[];
  const exitRow=id=>{context.reference(id);const row=exitRows().find(value=>value.jobId===id);assert.ok(row,'DEVICE_EXIT_ORIGINAL_JOB_REQUIRED');return row;};
  const exitUpdate=(id,fields)=>context.write(data=>({...data,deviceExits:(data.deviceExits??[]).map(row=>row.jobId===id?{...row,...copy(fields)}:row)}));
  const exitPublic=row=>({jobId:row.jobId,stage:row.stage,statement:copy(row.consent.statement),consentFields:{
    ...Object.fromEntries(['parentJobId','nativeBindingSHA256','quoteId','jobId','rootId','noteRevision','noteRole','statement','witnessSHA256'].map(name=>[name,copy(row.consent[name])])),
    proofSHA256:row.proofSHA256,publicInputsSHA256:row.publicInputsSHA256},observation:copy(row.observation),errorCode:row.errorCode});
  const sourceExitBinding=row=>sha({profile:'ORIGINAL_NATIVE_DEVICE_DEPOSIT_EXIT_BINDING_V2',jobId:row.jobId,rootId:row.consent.rootId,commitment:row.consent.statement.output,amount:row.consent.statement.amount,nullifier:row.nullifier,proofSHA256:row.proofSHA256,publicInputsSHA256:row.publicInputsSHA256,transactionHash:row.submission?.transactionHash,calldataSHA256:row.submission?.calldataSHA256,domainCommitment:context.identity.domainCommitment});
  async function depositedExitTerms(bridge,input){assert.ok(privateExitEnabled()&&bridge===context.privateExitBridge,'NATIVE_PRIVATE_EXIT_PROFILE_REQUIRED');const descriptor=assertDeviceOwnerExecutionBridgeV1(bridge,context.capability),deposit=context.deviceRow(input.parentJobId);context.deviceBinding(deposit.consent);for(const n of ['origin','pairingId','devicePublicKey'])assert.equal(deposit.consent[n],descriptor[n]);assert.equal(input.rootId,deposit.consent.rootId);assert.ok(Number.isSafeInteger(input.noteRevision)&&input.noteRevision>=deposit.consent.noteRevision);assert.equal(input.nullifier,deposit.nullifier,'DEVICE_EXIT_NULLIFIER_CHANGED');assert.ok(!(context.record.data.deviceReservations??[]).some(r=>r.consent.depositJobId===deposit.jobId),'DEVICE_EXIT_SOURCE_ALREADY_RESERVED');await context.observeDevice(deposit);const actual=context.deviceRow(deposit.jobId);assert.equal(actual.stage,'CONFIRMED','DEVICE_EXIT_ORIGINAL_D26_REQUIRED');const view=await context.reader.read(),cm=actual.consent.statement.output,indices=view.ledger.commitments.flatMap((leaf,index)=>leaf==='0x'+cm?[index]:[]);assert.equal(indices.length,1);assert.ok(!view.ledger.nullifiers.includes('0x'+input.nullifier),'DEVICE_EXIT_NOTE_ALREADY_SPENT');const path=view.ledger.tree.path(indices[0]);assert.equal(verifyPrivateNotePath(path),true);await context.reader.assertCurrent(view);context.continueWork();return{...Object.fromEntries(['parentJobId','noteRole','rootId','noteRevision'].map(n=>[n,input[n]])),nativeBindingSHA256:sourceExitBinding(actual),nullifierSpent:false,statement:{scope:context.asset.scope,policy:context.asset.policy,epoch:(BigInt(view.head.timestamp)/600n).toString(),root:context.bare(path.root),nullifier:actual.nullifier,amount:actual.consent.statement.amount,recipient:input.recipient,commitment:cm},path:{root:context.bare(path.root),index:path.index,leaf:context.bare(path.leaf),siblings:path.siblings.map(context.bare)},poolTerms:{scope:context.asset.scope,policy:context.asset.policy,codeHash:context.asset.codeHash,assetIdentity:context.asset.assetIdentity,domainCommitment:context.identity.domainCommitment},observed:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp}};}
  async function exitTerms(bridge,input){
    exactRecord(input,['parentJobId','noteRole','rootId','noteRevision','nullifier','recipient']);
    context.reference(input.nullifier);assert.match(input.recipient,/^[0-9a-f]{40}$/);assert.notEqual(input.recipient,'0'.repeat(40));assert.notEqual(input.recipient,context.identity.pool);
    if(input.noteRole==='deposit')return depositedExitTerms(bridge,input);
    const parent=context.reservationRow(input.parentJobId),installation=context.deviceExecutionOriginal(bridge,parent);
    assert.equal(input.rootId,parent.consent.custody.rootId,'DEVICE_EXIT_ROOT_CHANGED');
    assert.ok(Number.isSafeInteger(input.noteRevision)&&input.noteRevision>=parent.consent.custody.noteRevision,'DEVICE_EXIT_CUSTODY_REVISION');
    assert.ok(['change','recovery'].includes(input.noteRole),'DEVICE_EXIT_ORIGINAL_NOTE_ROLE');
    assert.ok(!parent.nativeFReorg || parent.nativeFReorg.phase === 'RECONFIRMED', 'F_REORG_OUTPUT_PENDING');
    const reserved=await context.reservationObservation(parent);assert.equal(reserved.stage,'RESERVED','DEVICE_EXIT_ORIGINAL_S_REQUIRED');
    if(input.noteRole==='recovery'){
      assert.equal(parent.nativeOutcome,'RECOVERED','DEVICE_EXIT_ORIGINAL_F_REQUIRED');assert.ok(parent.nativeTerminal,'DEVICE_EXIT_ORIGINAL_F_REQUIRED');
      const terminalReceipt=await context.runtime.receipt('0x'+parent.nativeTerminal.transactionHash);assert.ok(terminalReceipt);await context.runtime.checkReceipt(terminalReceipt);await context.runtime.assertCanonical(terminalReceipt);
      assert.equal(context.nativeExecution.snapshot(parent.jobId).outcome,'RECOVERED','DEVICE_EXIT_ORIGINAL_F_REQUIRED');
    }
    const quote=context.originalQuote(parent.consent.quoteId),deposit=context.reservationSubject(parent.consent.depositJobId,input.rootId,installation.descriptor),
      budget=BigInt(genericBalanceNativeTerms(validateGenericBalanceNativePreparation(quote.preparation)).budget),
      amount=input.noteRole==='change'?BigInt(deposit.consent.statement.amount)-budget:budget;
    assert.ok(amount>0n,'DEVICE_EXIT_POSITIVE_NOTE_REQUIRED');
    const commitment=input.noteRole==='change'?parent.nativeBinding.changeCommitment:parent.nativeBinding.recoveryCommitment,
      view=await context.reader.read(),indices=view.ledger.commitments.flatMap((leaf,index)=>leaf==='0x'+commitment?[index]:[]);
    assert.equal(indices.length,1,'DEVICE_EXIT_ORIGINAL_NOTE_REQUIRED');assert.ok(!view.ledger.nullifiers.includes('0x'+input.nullifier),'DEVICE_EXIT_NOTE_ALREADY_SPENT');
    const path=view.ledger.tree.path(indices[0]);await context.reader.assertCurrent(view);context.continueWork();
    return {...Object.fromEntries(['parentJobId','noteRole','rootId','noteRevision'].map(name=>[name,input[name]])),nullifierSpent:false,
      nativeBindingSHA256:sha(parent.nativeBinding),statement:{scope:context.asset.scope,policy:context.asset.policy,
      epoch:(BigInt(view.head.timestamp)/600n).toString(),root:context.bare(path.root),nullifier:input.nullifier,amount:amount.toString(),recipient:input.recipient,commitment},
      path:{root:context.bare(path.root),index:path.index,leaf:context.bare(path.leaf),siblings:path.siblings.map(context.bare)},
      poolTerms:{scope:context.asset.scope,policy:context.asset.policy,codeHash:context.asset.codeHash,assetIdentity:context.asset.assetIdentity,domainCommitment:context.identity.domainCommitment},
      observed:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp}};
  }
  async function outputBalance(bridge,input){
    exactRecord(input,['parentJobId','rootId','noteRevision','changeNullifier','recoveryNullifier']);
    context.reference(input.changeNullifier);context.reference(input.recoveryNullifier);
    const parent=context.reservationRow(input.parentJobId),installation=context.deviceExecutionOriginal(bridge,parent);
    assert.equal(input.rootId,parent.consent.custody.rootId,'DEVICE_OUTPUT_ROOT_CHANGED');
    assert.ok(Number.isSafeInteger(input.noteRevision)&&input.noteRevision>=parent.consent.custody.noteRevision,'DEVICE_OUTPUT_CUSTODY_REVISION');
    const reserved=await context.reservationObservation(parent);assert.equal(reserved.stage,'RESERVED','DEVICE_OUTPUT_ORIGINAL_S_REQUIRED');
    const sourceNullifier=parent.consent.statement.inputNullifier;
    assert.equal(new Set([sourceNullifier,input.changeNullifier,input.recoveryNullifier]).size,3,'DEVICE_OUTPUT_NULLIFIERS_CHANGED');
    if(parent.nativeOutcome!==null){
      assert.ok(parent.nativeTerminal,'DEVICE_OUTPUT_ORIGINAL_TERMINAL_REQUIRED');
      assert.equal(context.nativeExecution.snapshot(parent.jobId).outcome,parent.nativeOutcome,'DEVICE_OUTPUT_ORIGINAL_TERMINAL_CHANGED');
      const terminal=await context.runtime.receipt('0x'+parent.nativeTerminal.transactionHash);assert.ok(terminal);
      await context.runtime.checkReceipt(terminal);await context.runtime.assertCanonical(terminal);
    }
    const quote=context.originalQuote(parent.consent.quoteId),deposit=context.reservationSubject(parent.consent.depositJobId,input.rootId,installation.descriptor),
      budget=BigInt(genericBalanceNativeTerms(validateGenericBalanceNativePreparation(quote.preparation)).budget),
      view=await context.reader.read();
    assert.ok(view.ledger.nullifiers.includes('0x'+sourceNullifier),'DEVICE_OUTPUT_ORIGINAL_SOURCE_SPEND_REQUIRED');
    function note(role,amount){
      // Full-budget S inserts the original empty-change marker. It has an
      // inclusion path, but no positive note or withdrawal authority.
      assert.ok(amount>0n||role==='change'&&amount===0n,'DEVICE_OUTPUT_POSITIVE_NOTE_REQUIRED');
      const commitment=parent.nativeBinding[role==='change'?'changeCommitment':'recoveryCommitment'],nullifier=input[role+'Nullifier'];
      if(parent.nativeFReorg && parent.nativeFReorg.phase !== 'RECONFIRMED' || role==='recovery'&&parent.nativeOutcome!=='RECOVERED')return{noteRole:role,commitment,nullifier,amount:amount.toString(),state:'LOCKED',path:null};
      const indices=view.ledger.commitments.flatMap((leaf,index)=>leaf==='0x'+commitment?[index]:[]);
      assert.equal(indices.length,1,'DEVICE_OUTPUT_ORIGINAL_NOTE_REQUIRED');const path=view.ledger.tree.path(indices[0]);
      assert.equal(verifyPrivateNotePath(path),true,'DEVICE_OUTPUT_ORIGINAL_PATH');
      if(amount===0n)assert.ok(!view.ledger.nullifiers.includes('0x'+nullifier),'DEVICE_OUTPUT_EMPTY_CHANGE_SPENT');
      return{noteRole:role,commitment,nullifier,amount:amount.toString(),state:view.ledger.nullifiers.includes('0x'+nullifier)?'SPENT':'UNSPENT',
        path:{root:context.bare(path.root),index:path.index,leaf:context.bare(path.leaf),siblings:path.siblings.map(context.bare)}};
    }
    const change=note('change',BigInt(deposit.consent.statement.amount)-budget),recovery=note('recovery',budget);
    await context.reader.assertCurrent(view);context.continueWork();
    return{parentJobId:parent.jobId,rootId:input.rootId,noteRevision:input.noteRevision,nativeBindingSHA256:sha(parent.nativeBinding),
      reservationTransactionHash:reserved.observation.transactionHash,assetId:context.asset.assetId,pool:context.identity.pool,
      poolTerms:{scope:context.asset.scope,policy:context.asset.policy,codeHash:context.asset.codeHash,assetIdentity:context.asset.assetIdentity,domainCommitment:context.identity.domainCommitment},
      sourceNullifier,sourceNullifierSpent:true,nativeOutcome:parent.nativeOutcome,change,recovery,
      observed:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp}};
  }
  function exitBinding(consent,bridge){context.reservationBinding(consent);if(consent.noteRole==='deposit'){assert.ok(privateExitEnabled()&&bridge===context.privateExitBridge);const row=context.deviceRow(consent.parentJobId),descriptor=assertDeviceOwnerExecutionBridgeV1(bridge,context.capability);context.deviceBinding(row.consent);assert.equal(consent.rootId,row.consent.rootId);assert.equal(consent.nativeBindingSHA256,sourceExitBinding(row));assert.equal(consent.statement.commitment,row.consent.statement.output);assert.equal(consent.statement.nullifier,row.nullifier);for(const n of ['origin','pairingId','devicePublicKey'])assert.equal(consent[n],descriptor[n]);return row;}const parent=context.reservationRow(consent.parentJobId),installation=context.deviceExecutionOriginal(bridge,parent);
    assert.equal(consent.nativeBindingSHA256,sha(parent.nativeBinding),'DEVICE_EXIT_ORIGINAL_BINDING_CHANGED');
    assert.equal(consent.rootId,parent.consent.custody.rootId,'DEVICE_EXIT_ROOT_CHANGED');
    for(const name of ['origin','pairingId','devicePublicKey'])assert.equal(consent[name],installation.descriptor[name],'DEVICE_EXIT_DEVICE_CHANGED');return parent;}
  async function exitCurrent(consent,bridge,epoch){await context.healthy();context.continueWork();exitBinding(consent,bridge);const view=await context.reader.read();await context.reader.assertCurrent(view);
    if(epoch)assert.equal(consent.statement.epoch,(BigInt(view.head.timestamp)/600n).toString(),'DEVICE_EXIT_EPOCH_CHANGED');return view;}
  async function observeExit(row,bridge){
    exitBinding(row.consent,bridge);if(row.submission===null)return exitPublic(row);
    const observation=await context.observer.readTransaction({kind:row.consent.noteRole==='deposit'?'withdraw_source':'withdraw_'+row.consent.noteRole,identitySHA256: context.identitySHA256,
      transactionHash:row.submission.transactionHash,calldataSHA256:row.submission.calldataSHA256});
    if(observation===null)return{...exitPublic(row),stage:'WITHDRAWAL_UNKNOWN'};
    validateFlatAccountOwnerObservation({identity: context.identity,artifact:context.pool.artifact,submission:row.submission,authorization:null,observation});
    const view=await exitCurrent(row.consent,bridge,false);assert.ok(view.ledger.nullifiers.includes('0x'+row.consent.statement.nullifier),'DEVICE_EXIT_ORIGINAL_SPEND_REQUIRED');
    const receipt=await context.runtime.receipt('0x'+observation.transaction.hash);assert.ok(receipt);await context.runtime.checkReceipt(receipt);const block=await context.runtime.assertCanonical(receipt);
    const retained={profile:'LIANUM_DEVICE_ORIGINAL_W39_OBSERVATION_V1',jobId:row.jobId,parentJobId:row.consent.parentJobId,rootId:row.consent.rootId,
      noteRole:row.consent.noteRole,commitment:row.consent.statement.commitment,nullifier:row.consent.statement.nullifier,
      amount:row.consent.statement.amount,recipient:row.consent.statement.recipient,transactionHash:observation.transaction.hash,
      blockHash:observation.receipt.blockHash,blockNumber:BigInt(block.number).toString(),calldataSHA256:row.submission.calldataSHA256,
      timestamp:observation.after.timestamp,domainCommitment:context.identity.domainCommitment};
    if(row.observation!==null)assert.deepEqual(retained,row.observation,'DEVICE_EXIT_ORIGINAL_OBSERVATION_CHANGED');
    else await exitUpdate(row.jobId,{stage:'CONFIRMED',errorCode:null,observation:retained,submission:{...row.submission,observation}});
    await context.reader.assertCurrent(view);return exitPublic(exitRow(row.jobId));
  }
  async function provePrivateDeviceExit(original,reply){const {bridge,consent,witness:packet,client,privateW39}=original;assert.ok(privateW39&&bridge===context.privateExitBridge&&client&&context.nativeNote&&!context.wrapped,'NATIVE_PRIVATE_EXIT_ORIGINAL_RECIPIENT');assert.equal(isOriginalNativePrivateExecutionBridgeV2(bridge),true);assert.ok(!exitRows().some(r=>r.jobId===consent.jobId||r.consent.statement.commitment===consent.statement.commitment),'DEVICE_EXIT_ORIGINAL_JOB_ALREADY_ADMITTED');assert.ok(exitRows().length<16,'DEVICE_EXIT_JOURNAL_CAPACITY');PrivateExit.validateDeviceExitConsentEitherFreshV2(consent);const words=PrivateExit.nativePrivateExitPublicInputsV2(consent);assert.deepEqual(packet.authorization,{kind:'ORIGINAL_CONSENT_V1',jobId:consent.jobId,consentSHA256:context.byteSHA(PrivateExit.deviceExitConsentEitherMessageV2(consent)),witnessSHA256:consent.witnessSHA256});let started=false;try{const terms=await exitTerms(bridge,{parentJobId:consent.parentJobId,noteRole:consent.noteRole,rootId:consent.rootId,noteRevision:consent.noteRevision,nullifier:consent.statement.nullifier,recipient:consent.statement.recipient});for(const n of ['scope','policy','commitment','amount','recipient','nullifier','epoch'])assert.equal(consent.statement[n],terms.statement[n],'DEVICE_EXIT_TERMS_CHANGED');assert.deepEqual(consent.privateProof.path,terms.path,'DEVICE_EXIT_ORIGINAL_PATH_CHANGED');const before=await exitCurrent(consent,bridge,true);assert.ok(before.ledger.roots.includes('0x'+consent.statement.root));assert.ok(!before.ledger.nullifiers.includes('0x'+consent.statement.nullifier));PrivateExit.validateDeviceExitConsentEitherFreshV2(consent);await context.write(d=>({...d,deviceExits:[...(d.deviceExits??[]),{jobId:consent.jobId,consent:copy(consent),stage:'PROVING',proof:null,proofSHA256:null,publicInputsSHA256:null,submission:null,observation:null,errorCode:null}]}));started=true;PrivateExit.validateDeviceExitConsentEitherFreshV2(consent);context.activeLegacy=client;const result=await client.proveEncrypted(packet,packet.authorization),derived=readOriginalNativePrivateExitDerivationV2(client,result);for(const n of ['jobId'])assert.equal(derived[n],consent[n]);assert.equal(derived.commitment,consent.statement.commitment);assert.equal(derived.nullifier,consent.statement.nullifier);assert.equal(derived.consentSHA256,packet.authorization.consentSHA256);assert.equal(derived.witnessSHA256,consent.witnessSHA256);assert.equal(result.metrics.acceptedResult,true);assert.deepEqual(result.publicInputs,words);const view=await exitCurrent(consent,bridge,true),proof=context.transportProof(result);assert.ok(!view.ledger.nullifiers.includes('0x'+consent.statement.nullifier));assert.equal(await context.system.verify('withdraw_balance',Buffer.from(proof.proof,'hex'),proof.publicInputs.map(w=>'0x'+BigInt(w).toString(16).padStart(64,'0')),view.header.number),true,'DEVICE_EXIT_DEPLOYED_VERIFIER_REJECTED');await context.reader.assertCurrent(view);context.continueWork();await context.onProof({label:'device-exit-w39',relation:'withdraw_balance',role:'device-owner',proof:{...proof,metrics:result.metrics}});await exitUpdate(consent.jobId,{stage:'PROVED',proof,proofSHA256:context.byteSHA(Buffer.from(proof.proof,'hex')),publicInputsSHA256:sha(proof.publicInputs),...(context.recovery?.native?{originalPublicProofMetricsFrame:captureNativeDeviceOriginalW39MetricsFrameV1(result.metrics,proof)}:{}),...(context.nativeSourceOriginal?{originalSourceExitReceipt:context.sourceProofReceiptFrame('withdraw_balance','device-exit-w39-'+consent.noteRole,{...proof,metrics:result.metrics})}:{})});return reply(exitPublic(exitRow(consent.jobId)));}catch(error){if(started&&!context.unavailable)await exitUpdate(consent.jobId,{stage:'FAILED',errorCode:'DEVICE_EXIT_PRIVATE_PROOF_REJECTED'});throw error;}finally{await client?.close();context.activeLegacy=null;}}
  async function deviceExit(original){return context.exclusive(async()=>{
    const {bridge,action,consent}=original;exitBinding(consent,bridge);assert.equal(consent.version,privateExitEnabled()?2:1,'NATIVE_PRIVATE_EXIT_PROFILE_REQUIRED');const reply=value=>({...value,authorizationSHA256:context.byteSHA(PrivateExit.deviceExitConsentEitherMessageV2(consent))});
    if(action==='PROVE_W39'&&privateExitEnabled())return provePrivateDeviceExit(original,reply);
    if(action==='PROVE_W39'){
      assert.ok(!exitRows().some(row=>row.jobId===consent.jobId||row.consent.statement.commitment===consent.statement.commitment),
        'DEVICE_EXIT_ORIGINAL_JOB_ALREADY_ADMITTED');assert.ok(exitRows().length<16,'DEVICE_EXIT_JOURNAL_CAPACITY');
      const input=normalizeDeviceExitWitnessV1(original.witness),bytes=deviceExitWitnessBytesV1(input);let prover;
      try{
        assert.equal(context.byteSHA(bytes),consent.witnessSHA256,'DEVICE_EXIT_WITNESS_CHANGED');const publicInputs=walletInputPublicWords('withdraw_balance',input),
          statement=decodeWalletPoolInputs('withdraw_balance',publicInputs);
        for(const name of ['scope','policy','root','nullifier','recipient'])assert.equal(statement[name].slice(2),consent.statement[name],'DEVICE_EXIT_STATEMENT_CHANGED');
        for(const name of ['epoch','amount'])assert.equal(statement[name],consent.statement[name],'DEVICE_EXIT_STATEMENT_CHANGED');
        const opening={type:4,rho:Buffer.from(input.rho),x:Buffer.from(input.key_x),y:Buffer.from(input.key_y),value:input.value,secret:Buffer.from(input.secret)},
          commitment=balanceCommitment(consent.statement.scope,consent.statement.policy,opening);
        try{assert.equal(commitment.toString('hex'),consent.statement.commitment,'DEVICE_EXIT_ORIGINAL_OPENING_CHANGED');
          assert.equal(nullifier(Buffer.from(consent.statement.scope,'hex'),commitment,opening.secret).toString('hex'),consent.statement.nullifier,'DEVICE_EXIT_NULLIFIER_CHANGED');}
        finally{for(const name of ['rho','x','y','secret'])opening[name].fill(0);}
        const historicalPath={root:'0x'+consent.statement.root,leaf:'0x'+consent.statement.commitment,index:Number(input.leaf_index),
          siblings:input.siblings.map(bytes=>'0x'+Buffer.from(bytes).toString('hex'))};assert.equal(verifyPrivateNotePath(historicalPath),true,'DEVICE_EXIT_ORIGINAL_PATH_CHANGED');
        const terms=await exitTerms(bridge,{parentJobId:consent.parentJobId,noteRole:consent.noteRole,rootId:consent.rootId,noteRevision:consent.noteRevision,
          nullifier:consent.statement.nullifier,recipient:consent.statement.recipient});
        for(const name of ['scope','policy','commitment','amount','recipient','nullifier','epoch'])assert.equal(consent.statement[name],terms.statement[name],'DEVICE_EXIT_TERMS_CHANGED');
        const before=await exitCurrent(consent,bridge,true);assert.ok(before.ledger.roots.includes('0x'+consent.statement.root),'DEVICE_EXIT_ORIGINAL_ROOT_REQUIRED');
        assert.ok(!before.ledger.nullifiers.includes('0x'+consent.statement.nullifier),'DEVICE_EXIT_NOTE_ALREADY_SPENT');
        // The durable latch precedes the one original W39 worker. Neither the
        // witness nor the note/private root key is retained in the account.
        await context.write(data=>({...data,deviceExits:[...(data.deviceExits??[]),{jobId:consent.jobId,consent:copy(consent),stage:'PROVING',proof:null,
          proofSHA256:null,publicInputsSHA256:null,submission:null,observation:null,errorCode:null}]}));
        prover=context.nativeNote?createNativeEconomicNoteProofProcessV1('owner'):createProofProcess({purpose:'owner',modes:['withdraw_balance']});context.activeLegacy=prover;
        const result=await prover.prove('withdraw_balance',input,publicInputs,'device-exit-w39');assert.equal(result.metrics.acceptedResult,true);
        const view=await exitCurrent(consent,bridge,true),proof=context.transportProof(result);
        assert.equal(await context.system.verify('withdraw_balance',Buffer.from(proof.proof,'hex'),proof.publicInputs.map(word=>'0x'+BigInt(word).toString(16).padStart(64,'0')),
          view.header.number),true,'DEVICE_EXIT_DEPLOYED_VERIFIER_REJECTED');await context.reader.assertCurrent(view);context.continueWork();
        await context.onProof({label:'device-exit-w39',relation:'withdraw_balance',role:'device-owner',proof:{...proof,metrics:result.metrics}});
        await exitUpdate(consent.jobId,{stage:'PROVED',proof,proofSHA256:context.byteSHA(Buffer.from(proof.proof,'hex')),publicInputsSHA256:sha(proof.publicInputs),
          ...(context.recovery?.native?{originalPublicProofMetricsFrame:captureNativeDeviceOriginalW39MetricsFrameV1(result.metrics,proof)}:{}),
          ...(context.nativeSourceOriginal?{originalSourceExitReceipt:context.sourceProofReceiptFrame('withdraw_balance','device-exit-w39-'+consent.noteRole,{...proof,metrics:result.metrics})}:{})});
        return reply(exitPublic(exitRow(consent.jobId)));
      }catch(error){if(!context.unavailable&&exitRows().some(row=>row.jobId===consent.jobId))try{await exitUpdate(consent.jobId,{stage:'FAILED',
          errorCode:privateFailureDiagnostic(error,'DEVICE_EXIT_PROOF_REJECTED').code});}catch{}throw error;}
      finally{bytes.fill(0);wipeDeviceExitWitnessV1(input);if(prover)await prover.close();context.activeLegacy=null;}
    }
    const row=exitRow(consent.jobId);for(const name of ['parentJobId','nativeBindingSHA256','quoteId','rootId','noteRevision','noteRole','witnessSHA256'])
      assert.equal(consent[name],row.consent[name],'DEVICE_EXIT_ORIGINAL_JOB_CHANGED');assert.deepEqual(consent.statement,row.consent.statement,'DEVICE_EXIT_STATEMENT_CHANGED');
    assert.equal(consent.proofSHA256,row.proofSHA256,'DEVICE_EXIT_PROOF_CHANGED');assert.equal(consent.publicInputsSHA256,row.publicInputsSHA256,'DEVICE_EXIT_PROOF_CHANGED');
    if(action==='OBSERVE_W39')return reply(await observeExit(row,bridge));
    assert.equal(action,'WITHDRAW_W39');assert.equal(row.stage,'PROVED','DEVICE_EXIT_RECONCILE_ORIGINAL_ONLY');assert.equal(row.submission,null,'DEVICE_EXIT_RECONCILE_ORIGINAL_ONLY');
    const view=await exitCurrent(consent,bridge,true);assert.ok(view.ledger.roots.includes('0x'+consent.statement.root),'DEVICE_EXIT_ORIGINAL_ROOT_REQUIRED');
    assert.ok(!view.ledger.nullifiers.includes('0x'+consent.statement.nullifier),'DEVICE_EXIT_NOTE_ALREADY_SPENT');
    const calldata=encodeFlatTransaction('withdrawBalance',row.proof),submission={kind:consent.noteRole==='deposit'?'withdraw_source':'withdraw_'+consent.noteRole,calldata,calldataSHA256:flatAccountCalldataHash(calldata),
      publicInputs:row.proof.publicInputs,statement:{scope:consent.statement.scope,policy:consent.statement.policy,epoch:consent.statement.epoch,
        root:consent.statement.root,nullifier:consent.statement.nullifier,amount:consent.statement.amount,recipient:consent.statement.recipient},before:context.snapshotFromView(view),
      epoch:consent.statement.epoch,transactionHash:null,dispatchLatched:true,ownerConfirmed:false,observation:null};
    await exitUpdate(row.jobId,{stage:'WITHDRAWAL_UNKNOWN',withdrawalConsent:copy(consent),submission});
    try{context.continueWork();const receipt=await context.runtime.send('flat-account-device-exit',{to:context.pool.address,data:calldata,value:'0'});
      await exitUpdate(row.jobId,{submission:{...submission,transactionHash:context.bare(receipt.transactionHash)}});return reply(await observeExit(exitRow(row.jobId),bridge));}
    catch(error){if(!context.unavailable)try{const hash=error.transactionRecord?.transactionHash;await exitUpdate(row.jobId,{...(hash?{submission:{...submission,transactionHash:context.bare(hash)}}:{}),
        errorCode:privateFailureDiagnostic(error,'DEVICE_EXIT_SEND_UNRESOLVED').code});}catch{}throw error;}
  });}
  return Object.freeze({ privateExitEnabled, installPrivateExit, exitRows, exitRow, exitUpdate, exitPublic, sourceExitBinding, depositedExitTerms, exitTerms, outputBalance, exitBinding, exitCurrent, observeExit, provePrivateDeviceExit, deviceExit });
}
