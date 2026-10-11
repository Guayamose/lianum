import { refreshNativeValueReceiverClock, readOwnedEvmWrappedGraphOperationV4 } from '../../evm/runtime/owned-evm-v2-runtime.mjs';
import { readOwnedTronWrappedGraphOperationV4 } from '../../tron/runtime/owned-tron-native-value-runtime.mjs';
import * as graphAuthorizationV4 from '../../../operations/operators/wrapped/wrapped-claim-graph-operators-v1.mjs';
/** Fixed provider/dispatch integration over the new system/quorum/reader brands.
 * No caller adapter, signer, journal, hash backend, transport or clock is accepted.
 * The dedicated lease factory joins original recipient consent and owned source
 * resources. New deployment artifacts still gate activation. No test mints brands.
 * The EVM runtime's distinct native-value method consumes ONLY the private scope
 * below, leaving its old vault/claim value-zero dispatch predicates unchanged. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { exactRecord, createCommitmentCodec } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput, inputUint } from "@lianum/components/plain-input";
import { assertOwnedWrappedClaimGraphSystem } from '../../../operations/deployments/wrapped/wrapped-claim-system-v1.mjs';
import { assertOwnedNativeValueQuorum } from '../../../operations/operators/wrapped/wrapped-claim-graph-operators-v1.mjs';
import { createWrappedClaimGraphStateReaderV1, assertWrappedClaimGraphCurrentViewV1, decodeFlatWords } from '../../../execution/wrapped/reconciliation/wrapped-claim-system-state-v1.mjs';
import { assertNativeValueHealth } from '../health/native-value-health-v2.mjs';
import { assertFactsQuorum } from '../transfers/generic-native-value-v2.mjs';
import { PROFILE_SCHEMA as TRON_SCHEMA } from '../../tron/transfers/tron-native-graph-profile.mjs';
import { PROFILE_SCHEMA as EVM_SCHEMA } from '../../evm/transfers/evm-native-value-v2.mjs';
import { encodeEvmGraphTransferMemo } from '../../evm/transfers/evm-graph-transfer-binding.mjs';
import { openNativeValueDispatchLease, NATIVE_VALUE_DISPATCH_OWNER_BLOCKERS } from './wrapped-claim-dispatch-owner-v1.mjs';
import { DISPATCH_PROFILE, normalizeNativeValueDispatchBinding, bindNativeValueDispatchRequest, selectedNativeValueProfile,
  nativeValueEvmScopeBinding, normalizeOriginalNativeValueEvmPreparation, nativeValueTronScopeBinding, normalizeOriginalNativeValueTronPreparation, assertNativeValueSigned, nativeValueDispatchNullifier, equal } from './wrapped-claim-dispatch-binding-v1.mjs';
import { MAX_DISPATCH_EVENTS, readNativeValueDispatchJournal, appendNativeValueDispatchEvent, assertNativeValueRetainedIntent, nativeValueDispatchStatement } from './wrapped-claim-dispatch-journal-v1.mjs';
const requests=new WeakMap(),providers=new WeakMap(),bindRequests=new WeakMap();
const operationsV4=new WeakMap(),authoritiesV4=new WeakMap();
const copy=cloneInput,freeze=frozenInput,prefix=v=>'0x'+v;
// Proof transport is canonical bounded hex; the deployed verifier requires bytes.
// Validate before decoding because Buffer.from(hex) silently truncates bad input.
function wrappedProofBytes(proof) {
  assert.ok(typeof proof === 'string' && proof.length > 0 && proof.length <= 2 * 1048576
    && proof.length % 64 === 0 && !/[^0-9a-f]/.test(proof), 'WRAPPED_NATIVE_PROOF_HEX');
  return Buffer.from(proof, 'hex');
}
/** Non-minting fixed operation reader for the original GRAPH quorum. The
 * physical runtime issued the token; this genuine provider closure bound it
 * to its original approved request before exposing it to its own quorum. */
export function readWrappedGraphDispatchOperationV4(operation) {
 assert.equal(arguments.length,1,'WRAPPED_GRAPH_OPERATION_NO_OPTIONS');const state=operationsV4.get(operation);
 assert.ok(state,'WRAPPED_GRAPH_ORIGINAL_DISPATCH_OPERATION_REQUIRED');return state.read();
}
function consumeAuthorityV4(token,purpose,operation,nativeRuntime,prepared,signed,ownerLease=null,statement=null){
 const state=authoritiesV4.get(token);assert.ok(state,'WRAPPED_GRAPH_PRIVATE_AUTHORITY_REQUIRED');authoritiesV4.delete(token);
 assert.equal(state.purpose,purpose,'WRAPPED_GRAPH_AUTHORITY_PURPOSE');assert.equal(state.operation,operation,'WRAPPED_GRAPH_AUTHORITY_OPERATION');
 assert.equal(state.nativeRuntime,nativeRuntime,'WRAPPED_GRAPH_AUTHORITY_RUNTIME');assert.equal(state.prepared,prepared,'WRAPPED_GRAPH_AUTHORITY_PREPARATION_IDENTITY');
 equal(state.signed,signed,'WRAPPED_GRAPH_AUTHORITY_SIGNED_BYTES');
 if(purpose==='provider-key'){assert.equal(state.ownerLease,ownerLease,'WRAPPED_GRAPH_AUTHORITY_PROVIDER_OWNER');equal(state.statement,statement,'WRAPPED_GRAPH_AUTHORITY_PROVIDER_STATEMENT');}
 return state.consume();
}
export function consumeWrappedGraphDispatchAuthorityV4(token,purpose,operation,nativeRuntime,prepared,signed){
 if(arguments.length!==6){authoritiesV4.delete(token);throw new Error('WRAPPED_GRAPH_AUTHORITY_NO_OPTIONS');}
 if(!['native-key','send'].includes(purpose)){authoritiesV4.delete(token);throw new Error('WRAPPED_GRAPH_NATIVE_AUTHORITY_PURPOSE');}
 return consumeAuthorityV4(token,purpose,operation,nativeRuntime,prepared,signed);
}
export function consumeWrappedGraphProviderAuthorityV4(token,operation,ownerLease,nativeRuntime,statement){
 if(arguments.length!==5){authoritiesV4.delete(token);throw new Error('WRAPPED_GRAPH_AUTHORITY_NO_OPTIONS');}
 const state=authoritiesV4.get(token);assert.ok(state,'WRAPPED_GRAPH_PRIVATE_AUTHORITY_REQUIRED');
 return consumeAuthorityV4(token,'provider-key',operation,nativeRuntime,state.prepared,state.signed,ownerLease,statement);
}
/** Runtime-only one-use opener. An object, copied callback or public transaction
 * cannot obtain this original identity; no public issuer exists. */
export function assertOwnedNativeValueEvmDispatchRequest(request,nativeRuntime) {
 const r=requests.get(request);assert.ok(r&&r.family==='3'&&r.nativeRuntime===nativeRuntime,'NATIVE_VALUE_ORIGINAL_EVM_DISPATCH_REQUEST_REQUIRED');
 r.assertLive();assert.equal(r.opened,false,'NATIVE_VALUE_DISPATCH_SCOPE_ALREADY_OPENED');r.opened=true;return r.scope;
}
/** Fixed Tron runtime-only opener. No caller can register or manufacture a
 * request. Sharing the opaque object with another original runtime fails. */
export function consumeOwnedNativeValueTronDispatchRequest(request,nativeRuntime) {
 const r=requests.get(request);assert.ok(r&&r.family==='4'&&r.nativeRuntime===nativeRuntime,'NATIVE_VALUE_ORIGINAL_TRON_DISPATCH_REQUEST_REQUIRED');
 r.assertLive();assert.equal(r.opened,false,'NATIVE_VALUE_DISPATCH_SCOPE_ALREADY_OPENED');r.opened=true;return r.scope;
}
/** Private owner-resource join, analogous to original operator bind tokens.
 * Possession of the public opaque lease alone cannot expose its writable store
 * or fixed-purpose provider signer. Only this factory can issue a bind token. */
export function consumeNativeValueProviderBindRequest(request,expected) {
 exactRecord(expected,['runtime','system','poolIndex','lease']);const r=bindRequests.get(request);
 assert.ok(r,'NATIVE_VALUE_ORIGINAL_PROVIDER_BIND_REQUEST_REQUIRED');for(const k of Object.keys(expected))assert.equal(r[k],expected[k]);
 bindRequests.delete(request);return undefined;
}
export function assertOwnedNativeValueProvider(provider,expected) {
 exactRecord(expected,['runtime','system','poolIndex']);const r=providers.get(provider);
 assert.ok(r,'NATIVE_VALUE_ORIGINAL_PROVIDER_REQUIRED');for(const k of Object.keys(expected))assert.equal(r[k],expected[k]);r.assertLive();return provider;
}
export { NATIVE_VALUE_DISPATCH_OWNER_BLOCKERS as NATIVE_VALUE_PROVIDER_BLOCKERS };
export async function createOwnedNativeValueProvider(input) {
 exactRecord(input,['runtime','system','poolIndex','dispatchLease']);const {runtime,system,poolIndex,dispatchLease}=input;
 assert.ok(Number.isSafeInteger(poolIndex)&&!Object.is(poolIndex,-0)&&poolIndex>=0&&poolIndex<2);
 assertOwnedWrappedClaimGraphSystem(runtime,system);assertOwnedNativeValueQuorum(system.quorum,{runtime,system});
 // The fixed private opener authenticates the original custody and exact
 // first approved P/R. No callback or copied lease can supply these resources.
 const bindRequest=Object.freeze(Object.create(null));bindRequests.set(bindRequest,{runtime,system,poolIndex,lease:dispatchLease});
 let r;try{r=await openNativeValueDispatchLease(dispatchLease,{runtime,system,poolIndex},bindRequest);}finally{bindRequests.delete(bindRequest);}
 try {
 const b=normalizeNativeValueDispatchBinding(r.binding),p=selectedNativeValueProfile(b),quorum=system.quorum;
 const evm=p.schema===EVM_SCHEMA;assert.ok(evm||p.schema===TRON_SCHEMA,'NATIVE_VALUE_NATIVE_PROFILE_REQUIRED');
 equal(b.registry,system.registry);equal(b.profiles,system.adapterProfiles);equal(b.domain,system.pools[poolIndex].domain);
 assert.equal(prefix(b.pool),system.pools[poolIndex].address);assert.equal(system.claimsEnabled,true,'WRAPPED_CLAIMS_REQUIRED');
 for(const o of [r,r.store,r.nativeRuntime])assert.ok(Object.isFrozen(o),'NATIVE_VALUE_IMMUTABLE_ORIGINAL_RESOURCE');
 // Capture the original methods before the first await. Future owner must bind
 // its exact nativeRuntime, approved P/R/opening, same encrypted CAS record,
 // dedicated provider key and original bootstrap. No numeric resource lookup.
 const leaseLive=r.assertLive.bind(r),leaseCurrent=r.assertLeaseCurrent.bind(r),load=r.store.load.bind(r.store),commit=r.store.commit.bind(r.store);
 const nativeCurrent=r.assertPreparedCurrent.bind(r),providerSign=r.signDispatchOnce.bind(r),observe=r.observeOriginal.bind(r),retain=r.retainOriginal.bind(r);
 const nativeRuntime=r.nativeRuntime,transfer=nativeRuntime.dispatchNativeValueV1.bind(nativeRuntime),release=r.close.bind(r);
 const approved=assertNativeValueRetainedIntent(b,r.approvedIntent),codec=createCommitmentCodec({hashFields:r.hashFields});
 const reader=await createWrappedClaimGraphStateReaderV1({runtime,system,poolIndex});
 let record,state,busy=false,closed=false,poisoned=false,active=false,originalPreparedCapability=null,historySaturated=false,adverseObserved=false,dispatchCancelled=false;
 const live=()=>{assert.ok(!closed&&!poisoned,'NATIVE_VALUE_DISPATCH_CLOSED_OR_PERSISTENCE_UNCERTAIN');leaseLive();
   assertOwnedWrappedClaimGraphSystem(runtime,system);assertOwnedNativeValueQuorum(quorum,{runtime,system});};
 function checkedRecord(raw){const v=copy(raw);exactRecord(v,['revision','state']);inputUint(v.revision);readNativeValueDispatchJournal(b,v.state);return v;}
 async function unchanged(){live();try{equal(checkedRecord(await load()),record);}catch(cause){poisoned=true;throw new Error('NATIVE_VALUE_ORIGINAL_JOURNAL_UNAVAILABLE_OR_CHANGED',{cause});}}
 async function append(kind,data){live();await unchanged();
   if(record.state.events.length>=MAX_DISPATCH_EVENTS){historySaturated=true;throw new Error('NATIVE_VALUE_DISPATCH_HISTORY_CAPACITY');}
   // A deterministic shape/capacity rejection did not attempt a write and must
   // not be mislabeled as persistence uncertainty. All old events remain intact.
   const next=appendNativeValueDispatchEvent(b,record.state,kind,data);try{
   const saved=checkedRecord(await commit({expectedRevision:record.revision,nextState:next}));assert.equal(BigInt(saved.revision),BigInt(record.revision)+1n);
   equal(saved.state,next);equal(checkedRecord(await load()),saved);record=saved;state=readNativeValueDispatchJournal(b,saved.state);
 }catch(cause){poisoned=true;throw new Error('NATIVE_VALUE_ORIGINAL_WRITE_UNCERTAIN_NO_REPLACEMENT',{cause});}}
 record=checkedRecord(await load());state=readNativeValueDispatchJournal(b,record.state);
 equal(approved.readinessOpening.domain,b.domain);
 assert.equal(await codec.domainCommitment(b.domain),approved.ready.domainCommitment,'NATIVE_VALUE_APPROVED_DOMAIN');
 assert.equal(await codec.readinessCommitment(approved.ready.domainCommitment,approved.ready.joinCommitment,approved.readinessOpening.readinessBlind,
   approved.readinessOpening.descriptor),approved.ready.readinessCommitment,'NATIVE_VALUE_APPROVED_READY_SEAL');
 if(state.intent)equal(state.intent,approved);
 async function current(operationV4=null){assert.equal(dispatchCancelled,false,'NATIVE_VALUE_DISPATCH_CANCELLED');const started=performance.now();live();await unchanged();await leaseCurrent();
   await refreshNativeValueReceiverClock(runtime);
   if(state.prepared){assert.ok(originalPreparedCapability,'NATIVE_VALUE_ORIGINAL_PREPARATION_CAPABILITY_REQUIRED');
     assert.equal(await nativeCurrent(originalPreparedCapability),undefined,'NATIVE_VALUE_NATIVE_ASSERT_ONLY');}
   const i=approved,view=await reader.read({domainCommitment:i.ready.domainCommitment,authorizationRoot:i.ready.authorizationRoot,checkpoint:i.ready.checkpoint});
   assertWrappedClaimGraphCurrentViewV1(view,{runtime,system,poolIndex});
   // R's hidden reserve guarantee remains current only under exact historical
   // snapshot equality, except the current timestamp. Preserve old strictness.
   const old=view.dispatch.checkpointSnapshot;equal({...view.snapshot,timestamp:old.timestamp},old);
   assert.equal(view.evidenceState,i.ready.readinessEvidenceState,'NATIVE_VALUE_STALE_READY');assert.equal(view.healthState.halted,'0');
   assert.equal(view.overflow.count,'0','NATIVE_VALUE_REVOCATION_OVERFLOW');
   const now=BigInt(view.head.timestamp);assert.ok(now>=BigInt(state.lastTimestamp),'NATIVE_VALUE_DISPATCH_CLOCK_ROLLBACK');assert.ok(BigInt(i.ready.readyFrom)<=now&&now<BigInt(i.ready.readyUntil)
     &&BigInt(i.action.executionFrom)<=now&&now<BigInt(i.action.executionUntil),'NATIVE_VALUE_DISPATCH_OUTSIDE_ORIGINAL_WINDOW');
   if(state.signed){assert.ok(!view.revokedEntries.slice(0,Number(view.state.revokedCount)).includes(state.signed.nativeGid),'NATIVE_VALUE_DISPATCH_REVOKED');
     assert.equal(BigInt(decodeFlatWords(await system.hub.call('admissionNullifiers(bytes32)',[prefix(state.admissionNullifier)],view.header.number),1)[0]),0n,'NATIVE_VALUE_DISPATCH_N_ALREADY_USED');}
   const validUntil=(now+30n<BigInt(i.ready.readyUntil)?now+30n:BigInt(i.ready.readyUntil)).toString();
   // Every invocation causes independent FULL inventory health observations.
   // No prior health result/certificate/receipt is reused across key/send gates.
   const operation=operationV4?readWrappedGraphDispatchOperationV4(operationV4):null;
   if(operation)assert.equal(typeof graphAuthorizationV4.issueWrappedGraphDispatchHealthV4,'function','WRAPPED_GRAPH_V4_ORIGINAL_ISSUER_REQUIRED');
   const permit=operation?await graphAuthorizationV4.issueWrappedGraphDispatchHealthV4(quorum,{poolIndex,validUntil},operationV4):await quorum.health({poolIndex,validUntil});equal(permit.head,view.head);
   assertNativeValueHealth({message:permit.message,indexes:permit.indexes,signatures:permit.signatures},view.healthState,system.registry);
   await append(operation?'CURRENT_CHECKED_V4':'CURRENT_CHECKED',operation?{head:view.head,purpose:operation.phase,authorization:permit}:{head:view.head});
   await unchanged();await leaseCurrent();
   assert.equal(await reader.assertCurrent(view),undefined,'NATIVE_VALUE_FINAL_HEAD_ASSERT_ONLY');live();
   assert.equal(dispatchCancelled,false,'NATIVE_VALUE_DISPATCH_CANCELLED');
   if(!operation){assert.ok(performance.now()-started<30000,'NATIVE_VALUE_DISPATCH_CURRENT_CHECK_TOO_OLD');return view.head.timestamp;}
   // Controller retention precedes the final complete original native check
   // and all-signer revalidation of the SAME persisted health signatures.
   assert.equal(await nativeCurrent(originalPreparedCapability),undefined,'NATIVE_VALUE_NATIVE_ASSERT_ONLY');
   assert.equal(await reader.assertCurrent(view),undefined,'NATIVE_VALUE_FINAL_HEAD_ASSERT_ONLY');live();
   const originalRecord=record,capturedRecord=freeze(copy(record)),capturedPermit=freeze(copy(permit));
   const originalIntent=freeze(copy(approved)),capturedHead=freeze(copy(view.head));
   const validation=await graphAuthorizationV4.validateWrappedGraphOriginalAuthorizationV4(quorum,permit);
   const originalOperation=readWrappedGraphDispatchOperationV4(operationV4),purpose=originalOperation.phase;
   const token=Object.freeze({profile:'WRAPPED_GRAPH_ORIGINAL_DISPATCH_AUTHORITY_V4'});
   authoritiesV4.set(token,{purpose,operation:operationV4,nativeRuntime,prepared:originalPreparedCapability,
    signed:originalOperation.signed,ownerLease:dispatchLease,statement:purpose==='provider-key'?freeze(copy(state.dispatchStatement)):null,
    consume(){
     live();assert.ok(active&&!dispatchCancelled,'NATIVE_VALUE_DISPATCH_INACTIVE_SCOPE');assert.equal(record,originalRecord,'WRAPPED_GRAPH_ORIGINAL_JOURNAL_IDENTITY');
     equal(record,capturedRecord,'WRAPPED_GRAPH_ORIGINAL_JOURNAL_CHANGED');equal(approved,originalIntent,'WRAPPED_GRAPH_ORIGINAL_INTENT_CHANGED');
     equal(permit,capturedPermit,'WRAPPED_GRAPH_ORIGINAL_HEALTH_CHANGED');equal(view.head,capturedHead,'WRAPPED_GRAPH_ORIGINAL_HEAD_CHANGED');
     const finalOperation=readWrappedGraphDispatchOperationV4(operationV4);equal(finalOperation,originalOperation,'WRAPPED_GRAPH_ORIGINAL_OPERATION_CHANGED');
     const now=BigInt(capturedHead.timestamp);assert.ok(BigInt(permit.message.validFrom)<=now&&now+1n<BigInt(permit.message.validUntil),'WRAPPED_GRAPH_ORIGINAL_HEALTH_EXPIRED');
     for(const [from,until] of [[approved.ready.readyFrom,approved.ready.readyUntil],[approved.action.executionFrom,approved.action.executionUntil]])
      assert.ok(BigInt(from)<=now&&now+1n<BigInt(until),'WRAPPED_GRAPH_ORIGINAL_WINDOW_EXPIRED');
     const auditStarted=graphAuthorizationV4.consumeWrappedGraphOriginalAuthorizationV4(validation,quorum,permit);
     return Object.freeze({auditStarted,nativeAuditStarted:finalOperation.nativeAuditStarted});
    }});
   return Object.freeze({timestamp:view.head.timestamp,authority:token});
 }
 function outcome(){assert.ok(state.signed,'NATIVE_VALUE_UNKNOWN_NATIVE_ID_NO_REPLACEMENT');return freeze(copy({profile:DISPATCH_PROFILE,phase:state.phase,
   nativeExecutionClass:nativeRuntime.metadata.classification,publicNetwork:false,signed:state.signed,admissionNullifier:state.admissionNullifier,providerKey:b.providerKey,dispatchStatement:state.dispatchStatement,
   dispatchSignature:state.dispatchSignature,observation:state.observation,creditEligible:false,privateSpendableAtomic:null}));}
 async function reconcile(){live();await unchanged();assert.ok(state.signed,'NATIVE_VALUE_UNKNOWN_NATIVE_ID_NO_REPLACEMENT');
   assert.ok(state.phase!=='ADVERSE'&&!adverseObserved,'NATIVE_VALUE_ADVERSE_LATCHED');
   try { const observation=copy(await observe({nativeId:state.signed.nativeId,nativeWire:state.signed.nativeWire,transactionSHA256:state.signed.transactionSHA256}));
   exactRecord(observation,['status','nativeId','nativeWire']);assert.equal(observation.nativeId,state.signed.nativeId);
   assert.ok(['observed','pending','unknown','unavailable','adverse'].includes(observation.status),'NATIVE_VALUE_ORIGINAL_OBSERVATION_STATUS');
   if(observation.status!=='observed')assert.equal(observation.nativeWire,null);
   if(observation.status==='observed'){
     assert.equal(observation.nativeWire,state.signed.nativeWire);equal(assertNativeValueSigned(b,state.prepared,{nativeWire:observation.nativeWire}),state.signed);
     // Original bootstrap records public native bytes only. It receives no P/R,
     // Action opening, recipient secret, provider key or user custody material.
     await refreshNativeValueReceiverClock(runtime);
     await retain({profileCommitment:b.profileCommitment,originalPreparation:state.originalPreparation,signed:state.signed});
     const attested=await quorum.certify({poolIndex,profileCommitment:b.profileCommitment,nativeId:state.signed.nativeId});
     const entry=b.profiles.find(e=>e.profile===p);
     const policy={ledgerNamespace:b.domain.ledgerNamespace,registry:b.registry,profile:p,profilePath:entry.profilePath};
     const facts=assertFactsQuorum(attested.certificates,policy,quorum.signerIndexes.map(index=>entry.sources[index])).facts;
     assert.equal(facts.nativeGid,state.signed.nativeGid);assert.equal(facts.transactionSHA256,state.signed.transactionSHA256);assert.equal(facts.wireKeyCommitment,b.quote.action.receiptKeyCommitment);
     for(const k of ['sourceCommitment','destinationCommitment','amount','custodyCommitment'])assert.equal(facts.observation[k],b.quote.action[k]);
   }
   if(observation.status==='adverse')adverseObserved=true;
   // Fresh native observations/certificates above are never skipped, even when
   // the resulting status is unchanged. Only duplicate journal events are omitted.
   if(state.phase===(observation.status==='observed'?'OBSERVED':observation.status==='adverse'?'ADVERSE':'UNKNOWN')
     &&state.observation&&['status','nativeId','nativeWire'].every(k=>state.observation[k]===observation[k])) {await unchanged();return outcome();}
   if(record.state.events.length>=MAX_DISPATCH_EVENTS){historySaturated=true;await unchanged();return freeze(copy({
     classification:'READ_ONLY_ORIGINAL_OBSERVATION_HISTORY_FULL_NO_ADMISSION_AUTHORITY',phase:adverseObserved?'ADVERSE':'UNKNOWN',
     observation,signed:state.signed,durableHistorySaturated:true,creditEligible:false,privateSpendableAtomic:null}));}
   await append('OBSERVATION',observation);return outcome();
   } catch(error) { if(!poisoned&&state.phase!=='ADVERSE'&&!adverseObserved&&record.state.events.length<MAX_DISPATCH_EVENTS
     &&!(state.phase==='UNKNOWN'&&state.failures.at(-1)?.stage==='reconciliation'))await append('UNKNOWN',{stage:'reconciliation'});throw error; }
 }
 async function serial(work){live();assert.equal(busy,false,'NATIVE_VALUE_DISPATCH_BUSY');busy=true;try{return await work();}finally{busy=false;}}
 const provider=Object.freeze({
   execute(raw){const request=copy(raw);return serial(async()=>{
     assert.equal(dispatchCancelled,false,'NATIVE_VALUE_DISPATCH_CANCELLED');
     const intent=await bindNativeValueDispatchRequest(b,request,{hashFields:r.hashFields});equal(intent,approved);await unchanged();
     if(state.phase!=='BOUND')return reconcile();
     // Actual original deployed proof verifiers, fixed roles, fixed public
     // count42/50. A pure current preflight is never treated as proof acceptance.
     for(const [role,value] of [['dependency',request.dependencyProof],['ready',request.readyProof]])
       assert.equal(await system.verify(role,wrappedProofBytes(value.proof),value.publicInputs.map(v=>'0x'+BigInt(v).toString(16).padStart(64,'0'))),true,'NATIVE_VALUE_DISPATCH_PROOF_REJECTED');
     await current();await append('INTENT',intent);active=true;let stage='preparation',signedAt,operationV4=null;
     function bindOperationV4(token,expectedPhase){
       const physical=(evm?readOwnedEvmWrappedGraphOperationV4:readOwnedTronWrappedGraphOperationV4)(token,nativeRuntime,scoped);
       assert.equal(physical.phase,expectedPhase,'WRAPPED_GRAPH_ORIGINAL_NATIVE_PHASE_REQUIRED');equal(physical.prepared,originalPreparedCapability);
       assert.equal(physical.profileCommitment,b.profileCommitment);assert.equal(physical.family,evm?'EVM':'TRON');
       if(operationV4===null){operationV4=token;operationsV4.set(token,{read(){
         live();assert.ok(active&&!dispatchCancelled,'NATIVE_VALUE_DISPATCH_INACTIVE_SCOPE');
         const actual=(evm?readOwnedEvmWrappedGraphOperationV4:readOwnedTronWrappedGraphOperationV4)(token,nativeRuntime,scoped);
         assert.equal(actual.phase,stage,'WRAPPED_GRAPH_ORIGINAL_OPERATION_PHASE');assert.equal(actual.profileCommitment,b.profileCommitment);
         equal(actual.prepared,originalPreparedCapability,'WRAPPED_GRAPH_ORIGINAL_PREPARATION_CHANGED');
         equal(state.originalPreparation,actual.prepared,'WRAPPED_GRAPH_ORIGINAL_RETAINED_PREPARATION');equal(state.intent,approved,'WRAPPED_GRAPH_ORIGINAL_INTENT_CHANGED');
         assert.equal(state.phase,{'native-key':'NATIVE_KEY_PENDING','provider-key':'PROVIDER_KEY_PENDING',send:'SEND_PENDING'}[stage],'WRAPPED_GRAPH_ORIGINAL_RETAINED_PHASE');
         if(actual.signed){assert.ok(state.signed,'WRAPPED_GRAPH_ORIGINAL_SIGNED_REQUIRED');assert.equal(actual.signed.nativeWire,state.signed.nativeWire);
           assert.equal(actual.signed.nativeId,(evm?'0x':'')+state.signed.nativeId);assert.equal(actual.signed.transactionSHA256,state.signed.transactionSHA256);}
         else assert.equal(stage,'native-key','WRAPPED_GRAPH_NATIVE_SIGNATURE_REQUIRED');
         return freeze({...actual,profile:'WRAPPED_GRAPH_DISPATCH_OPERATION_V4'});
       }});}else assert.equal(token,operationV4,'WRAPPED_GRAPH_ORIGINAL_OPERATION_IDENTITY');
       return physical;
     }
     const scopeBinding=evm?nativeValueEvmScopeBinding(b,intent):nativeValueTronScopeBinding(b,intent),gas=inputUint(r.gasLimit,256);assert.ok(gas>=23800n);
     const scope=freeze({binding:scopeBinding,transaction:freeze(evm?{from:b.native.solverEndpoint,to:b.native.recipientEndpoint,data:encodeEvmGraphTransferMemo(intent.action.receiptKeyCommitment),
       gas:'0x'+gas.toString(16),value:'0x'+BigInt(intent.action.amount).toString(16)}:{ownerAddress:b.native.solverEndpoint,recipientAddress:b.native.recipientEndpoint,amountSun:intent.action.amount,wireKeyCommitment:intent.action.receiptKeyCommitment}),
       async beforeSign(rawPrepared,operation){assert.equal(arguments.length,2,'WRAPPED_GRAPH_KEY_NO_OPTIONS');live();assert.ok(active);assert.equal(stage,'preparation','WRAPPED_GRAPH_KEY_PHASE_ONCE');const original=copy(rawPrepared),prepared=(evm?normalizeOriginalNativeValueEvmPreparation:normalizeOriginalNativeValueTronPreparation)(b,intent,original);originalPreparedCapability=rawPrepared;
         stage='native-key';bindOperationV4(operation,stage);await append('PREPARED',{prepared,originalPreparation:original});await append('NATIVE_KEY_PENDING',null);
         const checked=await current(operation);signedAt=checked.timestamp;return checked.authority;},
       async onSigned(rawSigned,operation){assert.equal(arguments.length,2,'WRAPPED_GRAPH_PROVIDER_NO_OPTIONS');live();assert.ok(active);assert.equal(stage,'native-key','WRAPPED_GRAPH_PROVIDER_PHASE_ONCE');exactRecord(rawSigned,['nativeWire','nativeId','transactionSHA256']);bindOperationV4(operation,'provider-key');
         const signed=assertNativeValueSigned(b,state.prepared,{nativeWire:rawSigned.nativeWire});assert.equal(rawSigned.nativeId,(evm?'0x':'')+signed.nativeId);assert.equal(rawSigned.transactionSHA256,signed.transactionSHA256);
         const admissionNullifier=nativeValueDispatchNullifier(b,signed,request.receiptSpendSecret);
         stage='provider-key';await append('NATIVE_SIGNED',{signed,admissionNullifier,signedAt});
         const statement=nativeValueDispatchStatement(b,intent,signed,signedAt);await append('PROVIDER_KEY_PENDING',statement);const checked=await current(operation);
         const signature=await providerSign(statement,checked.authority,operation);await append('ATTESTED',{signature});},
       async beforeSend(operation){assert.equal(arguments.length,1,'WRAPPED_GRAPH_SEND_NO_OPTIONS');live();assert.ok(active);assert.equal(stage,'provider-key','WRAPPED_GRAPH_SEND_PHASE_ONCE');bindOperationV4(operation,'send');stage='send';await append('SEND_PENDING',null);return (await current(operation)).authority;},
     });
     const scoped=Object.freeze(Object.create(null));requests.set(scoped,{nativeRuntime,family:evm?'3':'4',scope,opened:false,assertLive(){live();assert.ok(active,'NATIVE_VALUE_DISPATCH_INACTIVE_SCOPE');}});
     try{const sent=copy(await transfer(scoped));exactRecord(sent,['nativeId','transactionSHA256']);
       await append('BROADCAST',{nativeId:(assert.match(sent.nativeId,evm?/^0x[0-9a-f]{64}$/:/^[0-9a-f]{64}$/),evm?sent.nativeId.slice(2):sent.nativeId),transactionSHA256:sent.transactionSHA256});return outcome();
     }catch(error){if(!poisoned&&record.state.events.length<MAX_DISPATCH_EVENTS)await append('UNKNOWN',{stage});throw error;}
     finally{requests.delete(scoped);if(operationV4)operationsV4.delete(operationV4);active=false;request.receiptSpendSecret=null;}
   });},
   reconcile(){assert.equal(arguments.length,0);return serial(reconcile);},
   stop(){assert.equal(arguments.length,0);dispatchCancelled=true;},
   report(){return freeze({profile:DISPATCH_PROFILE,phase:adverseObserved?'ADVERSE':state.phase,closed,persistenceUncertain:poisoned,historySaturated,adverseObserved,dispatchCancelled,originalLeaseOnly:true,nativeExecutionClass:nativeRuntime.metadata.classification,publicNetwork:false,creditEligible:false});},
   async close(){assert.equal(busy,false,'NATIVE_VALUE_DISPATCH_BUSY');closed=true;await release();},
   toJSON(){throw new Error('NATIVE_VALUE_PROVIDER_NOT_SERIALIZABLE');},
 });
 providers.set(provider,{runtime,system,poolIndex,assertLive:live});return provider;
 } catch(error) { try { await r.close(); } catch {} throw error; }
}

export function isWrappedClaimGraphDispatchRequestV1(request) { return requests.has(request); }
