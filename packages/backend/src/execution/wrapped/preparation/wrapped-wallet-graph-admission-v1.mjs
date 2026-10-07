import { refreshNativeValueReceiverClock } from '../../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
/** Narrow owned graph leg: genuine P/R -> original native dispatch -> genuine
 * dynamic I -> the existing atomic admit ABI. Returned receipt openings feed the
 * unchanged N/T witness builders. This is not a separate graph or wallet.
 * The separate wrapped keeper/account/terminal branch composes this exact
 * original admission into the unchanged generic N/T settlement roles. */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { Vault } from '../../../../../engine/src/crypto/vault.mjs';
import { assertOwnedWrappedClaimWalletSystemV1 } from '../../../operations/deployments/wrapped/wrapped-claim-wallet-binding-v1.mjs';
import { assertOwnedNativeValueQuorum } from '../../../operations/operators/wrapped/wrapped-claim-graph-operators-v1.mjs';
import { assertOwnedNativeValueProvider } from '../../../chains/shared/dispatch/wrapped-claim-graph-dispatch-gate-v1.mjs';
import { assertFactsQuorum, profileCommitment } from '../../../chains/shared/transfers/generic-native-value-v2.mjs';
import { exactRecord } from '../../encoding/commitments.mjs';
import { cloneInput, frozenInput } from '../../account/preparation/readiness-inputs.mjs';
import { decodeStatement, joinReadiness } from '../../encoding/statements.mjs';
import { joinNativeValueAdmission } from '../../encoding/native-value-statements-v2.mjs';
import { buildNativeValueAdmissionInputs } from '../../account/preparation/admission-native-value-v2-inputs.mjs';
import { createWrappedWalletStateReaderV1 } from '../reconciliation/wrapped-wallet-state-v1.mjs';
import { createWrappedWalletCurrentGateV1 } from '../../native-value/execution/native-value-current-gate-v2.mjs';
import { encodeFlatTransaction } from '../../encoding/transaction-codec.mjs';
import { withFlatHash } from '../../../../../proofs/src/tooling/scoped-proof-tools.mjs';
import { loadNativeValueLiveArtifacts } from '../../../../../proofs/src/native-value/metadata/native-value-live-v2-artifacts.mjs';
import { createNativeValueLiveProofClient } from '../../../../../proofs/src/native-value/runtime/native-value-live-v2-client.mjs';
import { inspectNativeValueOriginalAdmissionReceipt } from '../../native-value/preparation/native-value-graph-admission-v2.mjs';
const owned=new WeakMap(),copy=cloneInput,freeze=frozenInput;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const words=a=>a.map(v=>'0x'+BigInt(v).toString(16).padStart(64,'0'));
// Proof transport is canonical bounded hex; the deployed verifier requires bytes.
// Validate before decoding because Buffer.from(hex) silently truncates bad input.
function wrappedProofBytes(proof) {
  assert.ok(typeof proof === 'string' && proof.length > 0 && proof.length <= 2 * 1048576
    && proof.length % 64 === 0 && !/[^0-9a-f]/.test(proof), 'WRAPPED_NATIVE_PROOF_HEX');
  return Buffer.from(proof, 'hex');
}
export function assertOwnedWrappedWalletGraphAdmissionV1(adapter,binding) {
  exactRecord(binding,['runtime','system','poolIndex','provider']);const state=owned.get(adapter);
  assert.ok(state,'NV2_GRAPH_ORIGINAL_ADAPTER_REQUIRED');for(const k of Object.keys(binding))assert.equal(state[k],binding[k]);state.live();
}
export async function createOwnedWrappedWalletGraphAdmissionV1(input) {
  assert.equal(arguments.length, 1, 'WRAPPED_WALLET_NO_OVERRIDES');
  exactRecord(input,['runtime','system','poolIndex','provider']);
  const {runtime,system,poolIndex,provider}=input;
  assertOwnedWrappedClaimWalletSystemV1(runtime,system);const quorum=system.quorum;
  assert.equal(system.claimsEnabled,true,'WRAPPED_WALLET_CUSTODY_REQUIRED');
  const binding={runtime,system,poolIndex};
  const authority=()=>{assertOwnedWrappedClaimWalletSystemV1(runtime,system);assertOwnedNativeValueQuorum(quorum,{runtime,system});
    assertOwnedNativeValueProvider(provider,binding);assert.equal(system.claimsEnabled,true,'WRAPPED_WALLET_CUSTODY_REQUIRED');};
  authority();const artifacts=await loadNativeValueLiveArtifacts();
  const reader=await createWrappedWalletStateReaderV1(binding),gate=await createWrappedWalletCurrentGateV1({...binding,quorum});
  const directory=await mkdtemp(join(runtime.metadata.scratchDirectory,'native-value-admission-'));
  const vault=new Vault(join(directory,'admission.vault'));let password=randomBytes(32).toString('hex');
  let record=await vault.create({schema:'OWNED_WRAPPED_WALLET_GRAPH_ADMISSION_V1',pool:system.pools[poolIndex].address,
    requestSHA256:null,phase:'UNUSED',submission:null,receipt:null,statement:null},password);
  assert.deepEqual(await vault.read(password),record);
  let closed=false,poisoned=false,busy=false,proofClient=null,cancelled=false,originalRequest=null;
  const live=()=>{assert.ok(!closed&&!poisoned,'NV2_GRAPH_CLOSED_OR_UNCERTAIN');authority();};
  async function unchanged(){live();try{assert.deepEqual(await vault.read(password),record);}catch(cause){poisoned=true;throw Error('NV2_GRAPH_STORAGE_CHANGED',{cause});}}
  async function save(patch){await unchanged();try{record=await vault.update(password,record.revision,data=>({...data,...copy(patch)}));
    assert.deepEqual(await vault.read(password),record);}catch(cause){poisoned=true;throw Error('NV2_GRAPH_WRITE_UNCERTAIN',{cause});}}
  async function exclusive(work){live();assert.equal(busy,false,'NV2_GRAPH_BUSY');busy=true;try{await unchanged();return await work();}finally{busy=false;}}
  async function observeOriginal(){
    await unchanged();const retained=record.data,submission=retained.submission;
    assert.ok(submission,'NV2_GRAPH_NO_ORIGINAL_ADMISSION');
    // An uncertain send can only be matched to the owned runtime's retained
    // exact request. Never resubmit or replace the original transaction.
    const candidates=runtime.transactions.filter(row=>row.request.to===submission.target&&row.request.data===submission.calldata);
    assert.equal(candidates.length,1,'NV2_GRAPH_ORIGINAL_TRANSACTION_UNRESOLVED');const transaction=candidates[0];
    assert.equal(transaction.phase,'mined','NV2_GRAPH_ORIGINAL_NOT_MINED');
    if(submission.transactionHash)assert.equal(transaction.transactionHash,submission.transactionHash);
    const receipts=runtime.receipts.filter(row=>row.transactionHash===transaction.transactionHash);
    assert.equal(receipts.length,1,'NV2_GRAPH_ORIGINAL_RECEIPT_UNRESOLVED');
    const receipt = inspectNativeValueOriginalAdmissionReceipt(receipts[0], transaction);
    await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);
    const view=await reader.read(),position=view.receiptLeaves.indexOf(retained.receipt.leaf);
    assert.ok(position>=0,'NV2_GRAPH_RECEIPT_NOT_INCLUDED');await reader.assertCurrent(view);
    await save({phase:'ADMITTED',submission:{...submission,transactionHash:transaction.transactionHash}});
    return freeze(copy({classification:'ACTUAL_NATIVE_VALUE_GRAPH_RECEIPT_NOT_N_T_SETTLEMENT_OR_PRIVATE_CREDIT',
      receipt:retained.receipt,admissionStatement:retained.statement,transactionHash:transaction.transactionHash,
      creditEligible:false,privateSpendableAtomic:null}));
  }
  const adapter=Object.freeze({
    admit(raw){const request=copy(raw);exactRecord(request,['dependencyProof','readyProof','readinessOpening','action','deliveryRiskSalt','receiptSpendSecret']);
      return exclusive(async()=>{
        assert.equal(cancelled,false,'NV2_GRAPH_CANCELLED');
        const requestSHA256=sha(JSON.stringify(request));
        const firstAttempt=record.data.requestSHA256===null;
        if(!firstAttempt){assert.equal(record.data.requestSHA256,requestSHA256,'NV2_GRAPH_ORIGINAL_REQUEST_ONLY');
          if(record.data.submission)return observeOriginal();
          assert.ok(['DISPATCH_PENDING','NATIVE_OBSERVATION_PENDING'].includes(record.data.phase),'NV2_GRAPH_UNRESOLVED_NO_REPROVE_OR_REDISPATCH');
          assert.ok(originalRequest,'NV2_GRAPH_ORIGINAL_SESSION_REQUEST_REQUIRED');
        }else{
          // This irreversible latch precedes any native dispatch or proof job.
          await save({requestSHA256,phase:'DISPATCH_PENDING'});originalRequest=copy(request);
        }
        try {
          const dependency=decodeStatement('dependency',request.dependencyProof.publicInputs),ready=decodeStatement('ready',request.readyProof.publicInputs);
          joinReadiness(dependency,ready);
          // The original provider compares this exact request to its retained
          // approved intent and verifies real P/R before first native send.
          if(firstAttempt)await provider.execute(request);
          await save({phase:'NATIVE_OBSERVATION_PENDING'});
          const cutoff=[BigInt(ready.readyUntil),BigInt(request.action.executionUntil),BigInt(request.action.settleBefore)].reduce((a,b)=>a<b?a:b);
          let observed;
          for(;;){
            assert.equal(cancelled,false,'NV2_GRAPH_CANCELLED');
            await refreshNativeValueReceiverClock(runtime);
            const view=await reader.read();assert.ok(BigInt(view.head.timestamp)<cutoff,'NV2_GRAPH_ORIGINAL_NATIVE_WINDOW_CLOSED');
            observed=await provider.reconcile();
            assert.ok(observed.phase!=='ADVERSE','NV2_GRAPH_ORIGINAL_NATIVE_ADVERSE');
            if(observed.phase==='OBSERVED')break;
            assert.equal(observed.phase,'UNKNOWN','NV2_GRAPH_ORIGINAL_NATIVE_FINALITY');
            assert.equal(observed.nativeExecutionClass,'LOCAL_SYNTHETIC_TRON_JAVA_TRON_CONSENSUS','NV2_GRAPH_ORIGINAL_NATIVE_FINALITY');
            // Native consensus is autonomous. Wait/read only, never redispatch,
            // resign, rebase TAPOS or replace the original provider/Action.
            await new Promise(resolve=>setTimeout(resolve,1000));
          }
          assert.equal(observed.creditEligible,false);assert.equal(observed.publicNetwork,false);
          const descriptor=request.readinessOpening.descriptor;
          const selected=system.adapterProfiles.filter(row=>profileCommitment(row.profile)===descriptor.evidencePolicy);
          assert.equal(selected.length,1,'NV2_GRAPH_ORIGINAL_REGISTERED_PROFILE');const entry=selected[0];
          const sources=quorum.signerIndexes.map(index=>entry.sources[index]);
          // A new certify round performs full independent inventory/current
          // health checks. Old certificates from dispatch are never reused.
          await refreshNativeValueReceiverClock(runtime);
          const certified=await quorum.certify({poolIndex,profileCommitment:descriptor.evidencePolicy,nativeId:observed.signed.nativeId});
          const fact=assertFactsQuorum(certified.certificates,{ledgerNamespace:request.readinessOpening.domain.ledgerNamespace,
            registry:system.registry,profile:entry.profile,profilePath:entry.profilePath},sources).facts;
          assert.equal(fact.nativeGid,observed.signed.nativeGid);assert.equal(fact.transactionSHA256,observed.signed.transactionSHA256);
          const current=await reader.read(),index=current.checkpoints.findIndex(row=>row.digest===ready.checkpoint);
          assert.ok(index>=0,'NV2_GRAPH_HISTORICAL_CHECKPOINT_NOT_RETAINED');
          const opening=Object.fromEntries(['hubDomain','registryCommitment','scope','policy','localCommitment','dispatchId',
            'chainDomain','evidencePolicy','actionCommitment','payoutCommitment'].map(name=>[name,descriptor[name]]));
          Object.assign(opening,{globalEffectId:fact.nativeGid,validFrom:fact.observation.evidenceFrom,
            validUntil:String(BigInt(fact.observation.evidenceUntil)<BigInt(request.action.settleBefore)?BigInt(fact.observation.evidenceUntil):BigInt(request.action.settleBefore)),
            receiptKeyCommitment:request.action.receiptKeyCommitment,receiptRho:request.action.receiptRho});
          const checkpoint=current.checkpointTree.path(index);
          const job=await withFlatHash(hashFields=>buildNativeValueAdmissionInputs({dependencyStatement:dependency,readyStatement:ready,
            readinessOpening:request.readinessOpening,action:request.action,receiptSpendSecret:request.receiptSpendSecret,
            receiptOpening:opening,checkpointOpening:{root:checkpoint.root,index:checkpoint.index,siblings:[...checkpoint.siblings]},
            registry:system.registry,profile:entry.profile,profilePath:entry.profilePath,sources,
            provider:{publicKey:observed.providerKey,dispatchStatement:observed.dispatchStatement,signature:observed.dispatchSignature,
              deliveryRiskSalt:request.deliveryRiskSalt},certificates:certified.certificates,
            currentRevocation:{entries:current.revokedEntries,revokedDigest:current.state.revokedDigest,
              revokedCount:current.state.revokedCount,revocationSequence:current.state.revocationSequence},
            admissionFrom:opening.validFrom,admissionUntil:opening.validUntil},{hashFields,abi:artifacts.program.abi}));
          joinNativeValueAdmission(dependency,ready,job.statement);originalRequest=null;
          assert.equal(job.statement.admissionNullifier,observed.admissionNullifier,'NV2_GRAPH_ORIGINAL_ADMISSION_NULLIFIER');await save({phase:'PROOF_PENDING'});
          proofClient=createNativeValueLiveProofClient();
          const result=await proofClient.prove({inputs:job.inputs,expectedPublicInputs:job.expectedPublicInputs});
          proofClient.close();proofClient=null;
          const admission={proof:result.proof,publicInputs:result.publicInputs};
          assert.equal(await system.verify('admission',wrappedProofBytes(admission.proof),words(admission.publicInputs)),true,'NV2_GRAPH_DEPLOYED_I_REJECTED');
          const permit=await gate.readForAdmission({relation:'admission_native_value_v2',dependencyStatement:dependency,readyStatement:ready,admissionStatement:job.statement});
          const calldata=encodeFlatTransaction('admit',{pool:system.pools[poolIndex].address,dependency:request.dependencyProof,readiness:request.readyProof,admission,
            healthFrom:permit.health.message.validFrom,healthUntil:permit.health.message.validUntil,healthSignatures:permit.health.abiSignatures});
          const submission={target:system.hub.address,calldata,calldataSHA256:sha(Buffer.from(calldata.slice(2),'hex')),transactionHash:null};
          await save({phase:'ADMISSION_PENDING',submission,receipt:{opening,leaf:job.statement.receiptLeaf,commitment:job.receiptCommitment},statement:job.statement});
          // Atomic contract verifies P/R/I and CURRENT purpose-18/health again.
          assert.equal(cancelled,false,'NV2_GRAPH_CANCELLED');
          const receipt=await runtime.send('native-value-graph-admit-'+requestSHA256,{to:submission.target,data:submission.calldata});
          await save({submission:{...submission,transactionHash:receipt.transactionHash}});return await observeOriginal();
        }finally{request.receiptSpendSecret=null;proofClient?.stop();if(proofClient){proofClient.close();proofClient=null;}}
      });
    },
    reconcile(){assert.equal(arguments.length,0);if(!record.data.submission&&originalRequest)return adapter.admit(originalRequest);return exclusive(observeOriginal);},
    stop(){assert.equal(arguments.length,0);cancelled=true;proofClient?.stop();provider.stop();},
    snapshot(){live();return freeze({phase:record.data.phase,originalRequestBound:record.data.requestSHA256!==null,
      admissionSubmitted:record.data.submission!==null,creditEligible:false,privateSpendableAtomic:null});},
    close(){assert.equal(busy,false,'NV2_GRAPH_BUSY');closed=true;originalRequest=null;password=record=undefined;},
    toJSON(){throw Error('NV2_GRAPH_PRIVATE_CAPABILITY');},
  });
  owned.set(adapter,{...input,live});return adapter;
}
