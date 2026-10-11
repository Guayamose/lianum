/** Private reservations operations.
 * The owning authority supplies live state and its original guards through context.
 * This factory does not register, copy or grant an account capability.
 */
import * as PrivateU from "../../../../../mobile-protocol/src/device-native-private-reservation-v2.mjs";
import assert from "node:assert/strict";
import { validateGenericBalanceNativePreparation, genericBalanceNativeTerms } from "../../../../../engine/src/execution/balances/generic-balance-native-preparation.mjs";
import { normalizeDeviceReservationCapsuleOptionsV1, normalizeDeviceReservationWitnessV1, deviceReservationWitnessBytesV1, wipeDeviceReservationWitnessV1 } from "../../../../../mobile-protocol/src/device-reservation-consent-v1.mjs";
import { copy, sha } from "../../../../../engine/src/execution/accounts/generic-account-journal.mjs";
import { validateFlatAccountOwnerObservation, flatAccountGraphBinding, flatAccountCalldataHash } from "../flat-account-validation.mjs";
import { decodeStatement, encodeStatement } from "../../../execution/encoding/statements.mjs";
import { randomBytes } from "node:crypto";
import { isOriginalNativePrivateReservationBridgeV2 } from "../device-owner-reservation-bridge-v1.mjs";
import { readOriginalNativeDeviceAuthorizationDerivationV2, createRoleProofClient } from "../../../../../proofs/src/jobs/role-client.mjs";
import { compileFundedGraph, attachFundedSignatures, ownerAuthorizationMessage } from "../../../../../engine/src/execution/graph/funded-graph.mjs";
import { withFlatHash } from "../../../../../proofs/src/tooling/scoped-proof-tools.mjs";
import { buildAuthorizedEnvelope } from "../../../../../custody/src/signing/authorized-envelope.mjs";
import { reservationWitness } from "../../../execution/account/preparation/funding-inputs.mjs";
import { reserveProjection } from "../../../../../engine/src/execution/local/local-ledger.mjs";
import { encodeFlatTransaction } from "../../../execution/encoding/transaction-codec.mjs";

export function createNativeValueReservations(context) {
  const privateReservationEnabled=()=>context.record.data.devicePrivateUProfile===PrivateU.DEVICE_NATIVE_PRIVATE_U_PROOF_V2;
  async function installPrivateReservation(bridge){return context.exclusive(async()=>{assert.ok(context.nativeNote&&!context.wrapped&&context.privateDepositEnabled()&&!context.privateReservationBridge,'NATIVE_PRIVATE_U_ORIGINAL_BIRTH');await context.healthy();if(!privateReservationEnabled()){assert.equal(context.record.data.devicePrivateUProfile,undefined);assert.equal(context.deviceRows().length,0);assert.equal(reservationRows().length,0);const view=await context.reader.read();assert.equal(view.ledger.commitments.length,0,'NATIVE_PRIVATE_U_BEFORE_FUNDING');assert.equal(view.ledger.nullifiers.length,0);await context.reader.assertCurrent(view);context.continueWork();await context.write(d=>({...d,devicePrivateUProfile:PrivateU.DEVICE_NATIVE_PRIVATE_U_PROOF_V2}));}context.privateReservationBridge=bridge;return{installed:true,profile:PrivateU.DEVICE_NATIVE_PRIVATE_U_PROOF_V2};});}
  async function privateReservationContext(bridge,c){return context.exclusive(async()=>{assert.equal(bridge,context.privateReservationBridge,'NATIVE_PRIVATE_U_ORIGINAL_BRIDGE');await context.healthy();reservationBinding(c);const deposit=reservationSubject(c.depositJobId,c.custody.rootId,c),quote=originalQuote(c.quoteId);assert.equal(quote.depositJobId,deposit.jobId);assert.equal(quote.rootId,c.custody.rootId);for(const n of ['origin','pairingId','devicePublicKey'])assert.equal(quote.descriptor[n],c[n]);assert.equal(c.custody.sourceCommitment,deposit.consent.statement.output);assert.equal(c.custody.sourceNullifier,deposit.nullifier);await context.observeDevice(deposit);await reservationCurrent(c);const preparation=validateGenericBalanceNativePreparation(quote.preparation),proposal={scope:preparation.config.scope,policy:preparation.config.policy,asset:preparation.config.asset,...genericBalanceNativeTerms(preparation)},capsules=normalizeDeviceReservationCapsuleOptionsV1({nodes:preparation.nodes.map(({id,action,receiptSpendSecret})=>({id,action,receiptSpendSecret})),slotSalts:preparation.slotSalts});return{domain:copy(context.identity.domain),proposalSHA256:PrivateU.nativePrivateReservationDigestV2(proposal),capsuleOptionsSHA256:PrivateU.nativePrivateReservationDigestV2(capsules),invoiceSignaturesSHA256:PrivateU.nativePrivateReservationDigestV2(quote.invoiceSignatures),sourceAmount:deposit.consent.statement.amount};});}
  const reservationRows=()=>context.record.data.deviceReservations??[];
  const reservationRow=id=>{context.reference(id);const row=reservationRows().find(value=>value.jobId===id);
    assert.ok(row,'DEVICE_RESERVATION_ORIGINAL_JOB_REQUIRED');return row;};
  const reservationUpdate=(id,fields)=>context.write(data=>({...data,deviceReservations:(data.deviceReservations??[])
    .map(row=>row.jobId===id?{...row,...copy(fields)}:row)}));
  const reservationPublic=row=>({jobId:row.jobId,stage:row.stage,consentFields:{
    ...Object.fromEntries(['depositJobId','quoteId','jobId','custody','statement','witnessSHA256'].map(name=>[name,copy(row.consent[name])])),
    proofSHA256:row.proofSHA256,publicInputsSHA256:row.publicInputsSHA256},statement:copy(row.consent.statement),
    observation:copy(row.observation),errorCode:row.errorCode});
  function reservationSubject(depositJobId,rootId,descriptor){
    const deposit=context.deviceRow(depositJobId);assert.equal(deposit.stage,'CONFIRMED','DEVICE_RESERVATION_D26_REQUIRED');
    assert.equal(deposit.consent.rootId,rootId,'DEVICE_RESERVATION_ROOT_CHANGED');
    for(const name of ['origin','pairingId','devicePublicKey'])assert.equal(deposit.consent[name],descriptor[name],'DEVICE_RESERVATION_DEVICE_CHANGED');
    return deposit;
  }
  function reservationBinding(consent){
    assert.equal(consent.binding.accountIdentitySHA256,sha(context.accountIdentity),'DEVICE_RESERVATION_ACCOUNT_CHANGED');
    assert.equal(consent.binding.originalAccountLifetime,context.config.lifetime,'DEVICE_RESERVATION_LIFETIME_CHANGED');
    assert.equal(consent.binding.assetId,context.asset.assetId,'DEVICE_RESERVATION_ASSET_CHANGED');
    for(const name of ['scope','policy','codeHash','assetIdentity'])assert.equal(consent.poolTerms[name],context.asset[name],'DEVICE_RESERVATION_ASSET_CHANGED');
    assert.equal(consent.poolTerms.domainCommitment,context.identity.domainCommitment,'DEVICE_RESERVATION_DOMAIN_CHANGED');
  }
  async function reservationCurrent(consent){await context.healthy();context.continueWork();reservationBinding(consent);
    const view=await context.reader.read();await context.reader.assertCurrent(view);context.continueWork();return view;}
  function originalQuote(id){context.reference(id);const quote=(context.record.data.deviceReservationQuotes??[]).find(row=>row.quoteId===id);
    assert.ok(quote,'DEVICE_RESERVATION_ORIGINAL_QUOTE_REQUIRED');return quote;}
  function originalReservationConsent(row,consent){reservationBinding(consent);
    for(const name of ['depositJobId','quoteId','jobId','witnessSHA256'])assert.equal(consent[name],row.consent[name],'DEVICE_RESERVATION_JOB_CHANGED');
    for(const name of ['custody','statement'])assert.deepEqual(consent[name],row.consent[name],'DEVICE_RESERVATION_JOB_CHANGED');
    assert.equal(consent.proofSHA256,row.proofSHA256,'DEVICE_RESERVATION_PROOF_CHANGED');
    assert.equal(consent.publicInputsSHA256,row.publicInputsSHA256,'DEVICE_RESERVATION_PROOF_CHANGED');
    reservationSubject(consent.depositJobId,consent.custody.rootId,consent);
  }
  async function reservationObservation(row){
    if(row.submission===null)return reservationPublic(row);
    const submission=row.submission,observation=await context.observer.readTransaction({kind:'reservation',identitySHA256: context.identitySHA256,
      transactionHash:submission.transactionHash,calldataSHA256:submission.calldataSHA256});
    if(observation===null)return {...reservationPublic(row),stage:'RESERVATION_UNKNOWN'};
    validateFlatAccountOwnerObservation({identity: context.identity,artifact:context.pool.artifact,submission,
      authorization:decodeStatement('authorization',row.authorization.publicInputs),observation});
    const view=await reservationCurrent(row.consent),statement=row.consent.statement;
    assert.ok(view.ledger.nullifiers.includes('0x'+statement.inputNullifier),'DEVICE_RESERVATION_ORIGINAL_SPEND_REQUIRED');
    const pathFor=commitment=>{const indices=view.ledger.commitments.flatMap((leaf,index)=>leaf==='0x'+commitment?[index]:[]);
      assert.equal(indices.length,1,'DEVICE_RESERVATION_ORIGINAL_OUTPUT_REQUIRED');const path=view.ledger.tree.path(indices[0]);
      return {root:context.bare(path.root),index:path.index,leaf:context.bare(path.leaf),siblings:path.siblings.map(context.bare)};};
    const receipt=await context.runtime.receipt('0x'+observation.transaction.hash);assert.ok(receipt,'DEVICE_RESERVATION_ORIGINAL_RECEIPT_REQUIRED');
    await context.runtime.checkReceipt(receipt);const block=await context.runtime.assertCanonical(receipt);
    const actual=decodeStatement('reservation',submission.publicInputs);
    const retained={profile:'LIANUM_DEVICE_ORIGINAL_S_OBSERVATION_V1',transactionHash:observation.transaction.hash,
      blockHash:observation.receipt.blockHash,blockNumber:BigInt(block.number).toString(),timestamp:observation.after.timestamp,
      sourceCommitment:statement.inputCommitment,sourceNullifier:statement.inputNullifier,
      changeCommitment:statement.changeCommitment,reserveCommitment:statement.reserveCommitment,
      domainCommitment:actual.domainCommitment,envelope:actual.envelope,admissionTag:actual.admissionTag,
      currentHead:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp},
      changePath:pathFor(statement.changeCommitment),reservePath:pathFor(statement.reserveCommitment)};
    // Store the authentic historical transition once. Re-observation may give
    // fresh paths, but cannot alter the original transaction or authorizing time.
    if(row.observation===null)await reservationUpdate(row.jobId,{stage:'RESERVED',errorCode:null,observation:retained,
      submission:{...submission,observation}});
    await context.reader.assertCurrent(view);if(context.recovery?.source)context.recovery.sourceObservationRequired=false;
    return {...reservationPublic(reservationRow(row.jobId)),observation:retained};
  }
  async function deviceReservation(original){return context.exclusive(async()=>{
    await context.healthy();context.continueWork();assert.ok(!context.wrapped,'DEVICE_RESERVATION_NATIVE_ACCOUNT_REQUIRED');
    const {action,consent}=original;
    if(action!=='OBSERVE_S'){const id=action==='PREPARE_U'?original.depositJobId:consent.depositJobId;assert.ok(!context.exitRows().some(r=>r.consent.noteRole==='deposit'&&r.consent.parentJobId===id),'DEVICE_RESERVATION_SOURCE_EXIT_ADMITTED');}
    if(action!=='OBSERVE_S')assert.notEqual(context.recovery?.sourceObservationRequired,true,'NATIVE_SOURCE_OBSERVE_BEFORE_CONTINUATION');
    if(context.recovery?.native&&action!=='OBSERVE_S') {
      assert.ok(context.recovery.source&&context.nativeSourceOriginal,'NATIVE_DEVICE_RECOVERY_OBSERVE_ORIGINAL_ONLY');
      assert.ok(['PREPARE_U','PROVE_U','RESERVE_S'].includes(action),'NATIVE_SOURCE_ORIGINAL_NEXT_ACTION_REQUIRED');
      // New U/S admits only this already-funded original note and preparation.
      // Existing PROVE/S latches below still reject any previously admitted job.
      context.originalSourceContinuationInstallation(original.bridge);
    }
    if(action==='PREPARE_U'){
      const deposit=reservationSubject(original.depositJobId,original.rootId,original.descriptor);
      assert.equal(original.binding.accountIdentitySHA256,sha(context.accountIdentity),'DEVICE_RESERVATION_ACCOUNT_CHANGED');
      assert.equal(original.binding.originalAccountLifetime,context.config.lifetime,'DEVICE_RESERVATION_LIFETIME_CHANGED');
      await context.refreshLiveOperationClock();
      await context.observeDevice(deposit);const view=await context.reader.read();await context.reader.assertCurrent(view);
      const preparation=validateGenericBalanceNativePreparation(original.nativePreparation),nativeConfig=preparation.config;
      for(const name of ['scope','policy','asset','hubDomain','registryCommitment'])
        assert.equal(nativeConfig[name],context.identity.domain[name],'DEVICE_RESERVATION_PREPARATION_DOMAIN_CHANGED');
      const proposal={scope:nativeConfig.scope,policy:nativeConfig.policy,asset:nativeConfig.asset,...genericBalanceNativeTerms(preparation)};
      assert.ok(BigInt(proposal.budget)<=BigInt(deposit.consent.statement.amount),'DEVICE_RESERVATION_SOURCE_VALUE');
      assert.ok(BigInt(view.head.timestamp)>=BigInt(proposal.fundingNotBefore)&&BigInt(view.head.timestamp)<BigInt(proposal.fundingValidUntil),
        'DEVICE_RESERVATION_ORIGINAL_WINDOW');
      const quotes=context.record.data.deviceReservationQuotes??[];
      let quote=quotes.find(row=>row.depositJobId===deposit.jobId&&row.rootId===original.rootId);
      if(quote){assert.deepEqual(quote.preparation,preparation,'DEVICE_RESERVATION_PREPARATION_CHANGED');
        assert.deepEqual(quote.invoiceSignatures,original.invoiceSignatures,'DEVICE_RESERVATION_INVOICES_CHANGED');}
      else {assert.ok(quotes.length<8,'DEVICE_RESERVATION_QUOTE_CAPACITY');quote={quoteId:randomBytes(32).toString('hex'),
        depositJobId:deposit.jobId,rootId:original.rootId,descriptor:copy(original.descriptor),preparation,
        invoiceSignatures:copy(original.invoiceSignatures)};
        await context.write(data=>({...data,deviceReservationQuotes:[...(data.deviceReservationQuotes??[]),quote]}));}
      // This write is the same authenticated account lifetime. It does not
      // invalidate a consumed READ or emit a new economic grant/review.
      return {quoteId:quote.quoteId,depositJobId:deposit.jobId,rootId:original.rootId,sourceCommitment:deposit.consent.statement.output,
        sourceNullifier:deposit.nullifier,poolTerms:{scope:context.asset.scope,policy:context.asset.policy,codeHash:context.asset.codeHash,
          assetIdentity:context.asset.assetIdentity,domainCommitment:context.identity.domainCommitment},proposal,
        capsuleOptions:normalizeDeviceReservationCapsuleOptionsV1({nodes:preparation.nodes.map(({id,action,receiptSpendSecret})=>({id,action,receiptSpendSecret})),
          slotSalts:preparation.slotSalts}),invoiceSignatures:copy(quote.invoiceSignatures),
        observed:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp}};
    }
    reservationBinding(consent);const reply=value=>({...value,authorizationSHA256:context.byteSHA(PrivateU.deviceReservationConsentEitherMessageV2(consent))});
    if(action==='PROVE_U'){
      assert.ok(!reservationRows().some(row=>row.jobId===consent.jobId||row.consent.custody.sourceCommitment===consent.custody.sourceCommitment),
        'DEVICE_RESERVATION_ORIGINAL_JOB_ALREADY_ADMITTED');
      const deposit=reservationSubject(consent.depositJobId,consent.custody.rootId,consent),quote=originalQuote(consent.quoteId);
      assert.equal(quote.depositJobId,deposit.jobId,'DEVICE_RESERVATION_QUOTE_SOURCE_CHANGED');
      assert.equal(quote.rootId,consent.custody.rootId,'DEVICE_RESERVATION_QUOTE_ROOT_CHANGED');
      for(const name of ['origin','pairingId','devicePublicKey'])assert.equal(quote.descriptor[name],consent[name],'DEVICE_RESERVATION_QUOTE_DEVICE_CHANGED');
      assert.ok(consent.custody.noteRevision>=deposit.consent.noteRevision,'DEVICE_RESERVATION_CUSTODY_REVISION');
      assert.equal(consent.custody.sourceCommitment,deposit.consent.statement.output,'DEVICE_RESERVATION_SOURCE_CHANGED');
      assert.equal(consent.custody.sourceNullifier,deposit.nullifier,'DEVICE_RESERVATION_SOURCE_NULLIFIER_CHANGED');
      if(privateReservationEnabled()){
        assert.ok(original.privateU===true&&original.bridge===context.privateReservationBridge&&isOriginalNativePrivateReservationBridgeV2(original.bridge),'NATIVE_PRIVATE_U_ORIGINAL_BRIDGE');
        const client=original.client;assert.ok(client,'NATIVE_PRIVATE_U_ORIGINAL_RECIPIENT');let derived;
        try{
          PrivateU.validateDeviceReservationConsentEitherFreshV2(consent);assert.equal(consent.version,2);
          const preparation=validateGenericBalanceNativePreparation(quote.preparation),proposal={scope:preparation.config.scope,policy:preparation.config.policy,asset:preparation.config.asset,...genericBalanceNativeTerms(preparation)},capsules=normalizeDeviceReservationCapsuleOptionsV1({nodes:preparation.nodes.map(({id,action,receiptSpendSecret})=>({id,action,receiptSpendSecret})),slotSalts:preparation.slotSalts});
          assert.deepEqual(consent.privateProof.context,{domain:context.identity.domain,proposalSHA256:PrivateU.nativePrivateReservationDigestV2(proposal),capsuleOptionsSHA256:PrivateU.nativePrivateReservationDigestV2(capsules),invoiceSignaturesSHA256:PrivateU.nativePrivateReservationDigestV2(quote.invoiceSignatures),sourceAmount:deposit.consent.statement.amount},'NATIVE_PRIVATE_U_ORIGINAL_CONTEXT');
          await context.observeDevice(deposit);await reservationCurrent(consent);PrivateU.validateDeviceReservationConsentEitherFreshV2(consent);
          await context.write(data=>({...data,deviceReservations:[...(data.deviceReservations??[]),{jobId:consent.jobId,consent:copy(consent),stage:'PROVING',proofSHA256:null,publicInputsSHA256:null,authorization:null,rolePackets:null,submission:null,observation:null,errorCode:null}]}));
          PrivateU.validateDeviceReservationConsentEitherFreshV2(consent);context.activeDeviceOwner=client;
          const result=await client.proveEncryptedNativeDeviceAuthorizationV2(original.witness,{kind:'ORIGINAL_CONSENT_V1',jobId:consent.jobId,consentSHA256:context.byteSHA(PrivateU.deviceReservationConsentEitherMessageV2(consent)),witnessSHA256:consent.witnessSHA256});
          derived=readOriginalNativeDeviceAuthorizationDerivationV2(client,result);assert.equal(derived.sourceAmount,deposit.consent.statement.amount,'NATIVE_PRIVATE_U_SOURCE_AMOUNT');assert.equal(derived.jobId,consent.jobId);assert.equal(derived.consentSHA256,context.byteSHA(PrivateU.deviceReservationConsentEitherMessageV2(consent)));assert.equal(derived.witnessSHA256,consent.witnessSHA256);
          assert.deepEqual(derived.expectedPublicInputs,[...encodeStatement('authorization',derived.publicStatement)],'NATIVE_PRIVATE_U_ORIGINAL_PUBLIC');
          const authorization=context.transportProof(result),rolePackets=derived.rolePackets,view=await reservationCurrent(consent);
          assert.equal(await context.system.verify('authorization',Buffer.from(authorization.proof,'hex'),authorization.publicInputs.map(word=>'0x'+BigInt(word).toString(16).padStart(64,'0')),view.header.number),true,'DEVICE_RESERVATION_DEPLOYED_U_REJECTED');
          flatAccountGraphBinding({authorization,rolePackets},context.identity);await context.reader.assertCurrent(view);context.continueWork();
          await context.onProof({label:'device-reservation-u',relation:'authorization',role:'device-owner',proof:result});
          await reservationUpdate(consent.jobId,{stage:'PROVED',authorization,rolePackets,...(context.nativeSourceOriginal?{originalSourceAuthorizationReceipt:context.sourceProofReceiptFrame('authorization','device-reservation-u',result)}:{}),proofSHA256:context.byteSHA(Buffer.from(authorization.proof,'hex')),publicInputsSHA256:sha(authorization.publicInputs)});
          await context.onPrivateAudit({reference:consent.jobId,phase:'device-reservation-proof-retained',stage:'PROVED'});return reply(reservationPublic(reservationRow(consent.jobId)));
        }catch(error){if(!context.unavailable&&reservationRows().some(row=>row.jobId===consent.jobId))await reservationUpdate(consent.jobId,{stage:'FAILED',errorCode:'DEVICE_RESERVATION_U_REJECTED'});throw error;}
        finally{await client.closePrivateNativeDeviceAuthorizationV2();context.activeDeviceOwner=null;}
      }
      assert.equal(consent.version,1,'NATIVE_PRIVATE_U_FIXED_PROFILE');
      const witness=normalizeDeviceReservationWitnessV1(original.witness),bytes=deviceReservationWitnessBytesV1(witness);
      let capability,ownerInputs,client;
      try{
        assert.equal(context.byteSHA(bytes),consent.witnessSHA256,'DEVICE_RESERVATION_WITNESS_CHANGED');
        const preparation=validateGenericBalanceNativePreparation(quote.preparation),proposal={scope:preparation.config.scope,
          policy:preparation.config.policy,asset:preparation.config.asset,...genericBalanceNativeTerms(preparation)};
        for(const name of Object.keys(proposal))assert.deepEqual(witness.input[name],proposal[name],'DEVICE_RESERVATION_PROPOSAL_CHANGED');
        assert.equal(witness.input.inputNote.value,deposit.consent.statement.amount,'DEVICE_RESERVATION_SOURCE_VALUE');
        assert.deepEqual(witness.envelopePreparation.capsuleOptions,normalizeDeviceReservationCapsuleOptionsV1({
          nodes:preparation.nodes.map(({id,action,receiptSpendSecret})=>({id,action,receiptSpendSecret})),slotSalts:preparation.slotSalts}),
          'DEVICE_RESERVATION_CAPSULES_CHANGED');
        assert.deepEqual(witness.invoiceSignatures,quote.invoiceSignatures,'DEVICE_RESERVATION_INVOICES_CHANGED');
        const compiled=compileFundedGraph(witness.input),signed=attachFundedSignatures(compiled,{ownerSignature:witness.ownerSignature,invoiceSignatures:witness.invoiceSignatures});
        assert.deepEqual(compiled.authorizationStatement,consent.statement,'DEVICE_RESERVATION_STATEMENT_CHANGED');
        assert.equal(context.byteSHA(ownerAuthorizationMessage(compiled.authorizationStatement)),consent.custody.frameSHA256,'DEVICE_RESERVATION_FRAME_CHANGED');
        await context.observeDevice(deposit);await reservationCurrent(consent);
        // Durable job latch precedes the single original owner proof. Custody
        // digests are a signed declaration; they are not a server claim about
        // encryption or the device's physical SecureStore.
        await context.write(data=>({...data,deviceReservations:[...(data.deviceReservations??[]),{jobId:consent.jobId,consent:copy(consent),
          stage:'PROVING',proofSHA256:null,publicInputsSHA256:null,authorization:null,rolePackets:null,submission:null,observation:null,errorCode:null}]}));
        capability=await withFlatHash(hashFields=>buildAuthorizedEnvelope({signed,domain:context.identity.domain,
          ...witness.envelopePreparation},{hashFields}));ownerInputs=capability.ownerAuthorizationInputs();
        const statement=capability.publicStatement(),rolePackets={};
        for(const name of ['reservation','recovery','assembler'])rolePackets[name]=capability[name]().select();
        for(const name of ['local','dependency'])rolePackets[name]=Array.from({length:4},(_,i)=>capability[name](i).select());
        capability.destroy();capability=null;client=createRoleProofClient('owner');context.activeDeviceOwner=client;
        const result=await client.prove({relation:'authorization',inputs:ownerInputs,expectedPublicInputs:[...encodeStatement('authorization',statement)]});
        const authorization=context.transportProof(result),view=await reservationCurrent(consent);
        assert.equal(await context.system.verify('authorization',Buffer.from(authorization.proof,'hex'),authorization.publicInputs
          .map(word=>'0x'+BigInt(word).toString(16).padStart(64,'0')),view.header.number),true,'DEVICE_RESERVATION_DEPLOYED_U_REJECTED');
        flatAccountGraphBinding({authorization,rolePackets},context.identity);await context.reader.assertCurrent(view);context.continueWork();
        await context.onProof({label:'device-reservation-u',relation:'authorization',role:'device-owner',proof:result});
        await reservationUpdate(consent.jobId,{stage:'PROVED',authorization,rolePackets,
          ...(context.nativeSourceOriginal?{originalSourceAuthorizationReceipt:context.sourceProofReceiptFrame('authorization','device-reservation-u',result)}:{}),proofSHA256:context.byteSHA(Buffer.from(authorization.proof,'hex')),
          publicInputsSHA256:sha(authorization.publicInputs)});
        await context.onPrivateAudit({reference:consent.jobId,phase:'device-reservation-proof-retained',stage:'PROVED'});
        return reply(reservationPublic(reservationRow(consent.jobId)));
      }catch(error){if(!context.unavailable&&reservationRows().some(row=>row.jobId===consent.jobId))
          await reservationUpdate(consent.jobId,{stage:'FAILED',errorCode:/^[A-Z0-9_]{1,100}$/.test(error.code??'')?error.code:'DEVICE_RESERVATION_U_REJECTED'});
        throw error;
      }finally{bytes.fill(0);wipeDeviceReservationWitnessV1(witness);capability?.destroy();ownerInputs=null;
        client?.close();context.activeDeviceOwner=null;}
    }
    const row=reservationRow(consent.jobId);originalReservationConsent(row,consent);
    if(action==='OBSERVE_S')return reply(await reservationObservation(row));
    assert.equal(action,'RESERVE_S');assert.equal(row.stage,'PROVED','DEVICE_RESERVATION_RECONCILE_ORIGINAL_ONLY');
    assert.equal(row.submission,null,'DEVICE_RESERVATION_RECONCILE_ORIGINAL_ONLY');
    await context.refreshLiveOperationClock();
    const deposit=reservationSubject(consent.depositJobId,consent.custody.rootId,consent);await context.observeDevice(deposit);
    // Bind these exact U packets to the account's original executor BEFORE S.
    // An already-spent historical U/S job cannot acquire a new dispatch route.
    if(context.nativeExecution!==null){const installation=context.deviceExecutionProviders.get(original.bridge);
      assert.ok(installation,'DEVICE_EXECUTION_ORIGINAL_INSTALLATION_REQUIRED');
      assert.equal(row.nativeBinding??null,null,'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
      const prepared={authorization:row.authorization,rolePackets:row.rolePackets};
      const binding=await context.nativeExecution.prepare(row.jobId,prepared,installation.providers);
      assert.deepEqual(binding,flatAccountGraphBinding(prepared,context.identity),'DEVICE_EXECUTION_ORIGINAL_BINDING_CHANGED');
      await reservationUpdate(row.jobId,{nativeBinding:binding,nativeStage:'PREPARED',nativeLatched:false,
        nativeRecoveryLatched:false,nativeOutcome:null,nativeTerminal:null,nativeErrorCode:null});
    }
    const before=await reservationCurrent(consent),packet=row.rolePackets.reservation,funding=packet.funding.value;
    const index=before.ledger.commitments.indexOf('0x'+funding.inputCommitment);
    assert.ok(index>=0&&!before.ledger.nullifiers.includes('0x'+funding.inputNullifier),'DEVICE_RESERVATION_SOURCE_NOT_UNSPENT');
    const path=before.ledger.tree.path(index),job=await withFlatHash(hashFields=>reservationWitness(packet,{inputRoot:context.bare(path.root),
      inputPath:{leaf:context.bare(path.leaf),index:path.index,siblings:path.siblings.map(context.bare)}},{hashFields}));
    // No retry after S uncertainty either: this is one retained original job.
    await reservationUpdate(row.jobId,{stage:'RESERVING',reservationConsent:copy(consent)});
    let submission,calldata;
    try{
    const proof=await context.proofRunner.prove('reservation',job,'device-reservation-s'),fresh=await reservationCurrent(consent);
    for(const name of ['publicState','commitments','nullifiers'])assert.deepEqual(fresh.ledger[name],before.ledger[name],'DEVICE_RESERVATION_FRESH_S_REQUIRED');
    assert.ok(BigInt(fresh.head.timestamp)>=BigInt(funding.fundingNotBefore)&&BigInt(fresh.head.timestamp)<BigInt(funding.fundingValidUntil),
      'DEVICE_RESERVATION_ORIGINAL_WINDOW');
    const projection=reserveProjection(before.ledger,'0x'+funding.reserveCommitment,'0x'+funding.changeCommitment);
    calldata=encodeFlatTransaction('reserveGenericGuarded',{authorization:row.authorization,reservation:proof,
      expectedSequence:projection.expectedSequence,expectedPostRoot:projection.expectedPostRoot});
    submission={kind:'reservation',calldata,calldataSHA256:flatAccountCalldataHash(calldata),publicInputs:proof.publicInputs,
      statement:job.statement,before:context.snapshotFromView(fresh),epoch:null,transactionHash:null,dispatchLatched:true,ownerConfirmed:false,observation:null};
    await reservationUpdate(row.jobId,{stage:'RESERVATION_UNKNOWN',submission});
    }catch(error){if(!context.unavailable)await reservationUpdate(row.jobId,{errorCode:/^[A-Z0-9_]{1,100}$/.test(error.code??'')
      ?error.code:'DEVICE_RESERVATION_S_UNRESOLVED'});throw error;}
    try{context.continueWork();const receipt=await context.runtime.send('flat-account-device-reservation',{to:context.pool.address,data:calldata,value:'0'});
      await reservationUpdate(row.jobId,{submission:{...submission,transactionHash:context.bare(receipt.transactionHash)}});
      return reply(await reservationObservation(reservationRow(row.jobId)));
    }catch(error){const hash=error.transactionRecord?.transactionHash;
      if(!context.unavailable)await reservationUpdate(row.jobId,{...(hash?{submission:{...submission,transactionHash:context.bare(hash)}}:{}),
        errorCode:/^[A-Z0-9_]{1,100}$/.test(error.code??'')?error.code:'DEVICE_RESERVATION_SEND_UNRESOLVED'});throw error;}
  });}
  return Object.freeze({ privateReservationEnabled, installPrivateReservation, privateReservationContext, reservationRows, reservationRow, reservationUpdate, reservationPublic, reservationSubject, reservationBinding, reservationCurrent, originalQuote, originalReservationConsent, reservationObservation, deviceReservation });
}
