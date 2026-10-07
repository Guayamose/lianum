import { refreshNativeValueReceiverClock } from './owned-evm-v2-runtime.mjs';
/** Fixed provider/dispatch integration over the new system/quorum/reader brands.
 * No caller adapter, signer, journal, hash backend, transport or clock is accepted.
 * The dedicated lease factory joins original recipient consent and owned source
 * resources. New deployment artifacts still gate activation. No test mints brands.
 * The EVM runtime's distinct native-value method consumes ONLY the private scope
 * below, leaving its old vault/claim value-zero dispatch predicates unchanged. */
import assert from 'node:assert/strict';
import { retainNativeValueFailurePhase, retainNativeValueSecondaryFailure } from '../paeg/native-value-failure-retention.mjs';
import { performance } from 'node:perf_hooks';
import { exactRecord, createCommitmentCodec } from '../paeg/commitments.mjs';
import { cloneInput, frozenInput, inputUint } from '../paeg/readiness-inputs.mjs';
import { assertOwnedNativeValueSystem } from '../ops/native-value-system-v2.mjs';
import { assertOwnedNativeValueQuorum } from '../ops/native-value-operators-v4.mjs';
import { createNativeValueSystemStateReader, assertNativeValueCurrentView, decodeFlatWords } from '../paeg/native-value-system-state-v2.mjs';
import { assertNativeValueHealth } from './native-value-health-v2.mjs';
import { assertFactsQuorum } from './generic-native-value-v2.mjs';
import { PROFILE_SCHEMA as TRON_SCHEMA } from './tron-native-graph-profile.mjs';
import { PROFILE_SCHEMA as EVM_SCHEMA } from './evm-native-value-v2.mjs';
import { encodeEvmGraphTransferMemo } from './evm-graph-transfer-binding.mjs';
import { openNativeValueDispatchLease, NATIVE_VALUE_DISPATCH_OWNER_BLOCKERS } from './native-value-dispatch-owner-v2.mjs';
import { DISPATCH_PROFILE, normalizeNativeValueDispatchBinding, bindNativeValueDispatchRequest, selectedNativeValueProfile,
  nativeValueEvmScopeBinding, normalizeOriginalNativeValueEvmPreparation, nativeValueTronScopeBinding, normalizeOriginalNativeValueTronPreparation, assertNativeValueSigned, nativeValueDispatchNullifier, equal } from './native-value-dispatch-binding-v2.mjs';
import { MAX_DISPATCH_EVENTS, readNativeValueDispatchJournal, appendNativeValueDispatchEvent, assertNativeValueRetainedIntent, nativeValueDispatchStatement } from './native-value-dispatch-journal-v2.mjs';
const requests=new WeakMap(),providers=new WeakMap(),bindRequests=new WeakMap();
const copy=cloneInput,freeze=frozenInput,prefix=v=>'0x'+v;
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
export const NATIVE_VALUE_PROVIDER_BLOCKERS=NATIVE_VALUE_DISPATCH_OWNER_BLOCKERS;
export async function createOwnedNativeValueProvider(input) {
 exactRecord(input,['runtime','system','poolIndex','dispatchLease']);const {runtime,system,poolIndex,dispatchLease}=input;
 assert.ok(Number.isSafeInteger(poolIndex)&&!Object.is(poolIndex,-0)&&poolIndex>=0&&poolIndex<2);
 assertOwnedNativeValueSystem(runtime,system);assertOwnedNativeValueQuorum(system.quorum,{runtime,system});
 // The fixed private opener authenticates the original custody and exact
 // first approved P/R. No callback or copied lease can supply these resources.
 const bindRequest=Object.freeze(Object.create(null));bindRequests.set(bindRequest,{runtime,system,poolIndex,lease:dispatchLease});
 let r;try{r=await openNativeValueDispatchLease(dispatchLease,{runtime,system,poolIndex},bindRequest);}finally{bindRequests.delete(bindRequest);}
 try {
 const b=normalizeNativeValueDispatchBinding(r.binding),p=selectedNativeValueProfile(b),quorum=system.quorum;
 const evm=p.schema===EVM_SCHEMA;assert.ok(evm||p.schema===TRON_SCHEMA,'NATIVE_VALUE_NATIVE_PROFILE_REQUIRED');
 equal(b.registry,system.registry);equal(b.profiles,system.adapterProfiles);equal(b.domain,system.pools[poolIndex].domain);
 assert.equal(prefix(b.pool),system.pools[poolIndex].address);assert.equal(system.claimsEnabled,false,'NATIVE_VALUE_GRAPH_ONLY');
 for(const o of [r,r.store,r.nativeRuntime])assert.ok(Object.isFrozen(o),'NATIVE_VALUE_IMMUTABLE_ORIGINAL_RESOURCE');
 // Capture the original methods before the first await. Future owner must bind
 // its exact nativeRuntime, approved P/R/opening, same encrypted CAS record,
 // dedicated provider key and original bootstrap. No numeric resource lookup.
 const leaseLive=r.assertLive.bind(r),leaseCurrent=r.assertLeaseCurrent.bind(r),load=r.store.load.bind(r.store),commit=r.store.commit.bind(r.store);
 const nativeCurrent=r.assertPreparedCurrent.bind(r),providerSign=r.signDispatchOnce.bind(r),observe=r.observeOriginal.bind(r),retain=r.retainOriginal.bind(r);
 const nativeRuntime=r.nativeRuntime,transfer=nativeRuntime.dispatchNativeValueV1.bind(nativeRuntime),release=r.close.bind(r);
 const approved=assertNativeValueRetainedIntent(b,r.approvedIntent),codec=createCommitmentCodec({hashFields:r.hashFields});
 const reader=await createNativeValueSystemStateReader({runtime,system,poolIndex});
 let record,state,busy=false,closed=false,poisoned=false,active=false,originalPreparedCapability=null,historySaturated=false,adverseObserved=false,dispatchCancelled=false;
 const live=()=>{assert.ok(!closed&&!poisoned,'NATIVE_VALUE_DISPATCH_CLOSED_OR_PERSISTENCE_UNCERTAIN');leaseLive();
   assertOwnedNativeValueSystem(runtime,system);assertOwnedNativeValueQuorum(quorum,{runtime,system});};
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
 async function current(){assert.equal(dispatchCancelled,false,'NATIVE_VALUE_DISPATCH_CANCELLED');const started=performance.now();live();await unchanged();await leaseCurrent();
   await refreshNativeValueReceiverClock(runtime);
   if(state.prepared){assert.ok(originalPreparedCapability,'NATIVE_VALUE_ORIGINAL_PREPARATION_CAPABILITY_REQUIRED');
     assert.equal(await nativeCurrent(originalPreparedCapability),undefined,'NATIVE_VALUE_NATIVE_ASSERT_ONLY');}
   const i=approved,view=await reader.read({domainCommitment:i.ready.domainCommitment,authorizationRoot:i.ready.authorizationRoot,checkpoint:i.ready.checkpoint});
   assertNativeValueCurrentView(view,{runtime,system,poolIndex});
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
   const permit=await quorum.health({poolIndex,validUntil});equal(permit.head,view.head);
   assertNativeValueHealth({message:permit.message,indexes:permit.indexes,signatures:permit.signatures},view.healthState,system.registry);
   await append('CURRENT_CHECKED',{head:view.head});await unchanged();await leaseCurrent();
   assert.equal(await reader.assertCurrent(view),undefined,'NATIVE_VALUE_FINAL_HEAD_ASSERT_ONLY');live();
   assert.ok(performance.now()-started<30000,'NATIVE_VALUE_DISPATCH_CURRENT_CHECK_TOO_OLD');assert.equal(dispatchCancelled,false,'NATIVE_VALUE_DISPATCH_CANCELLED');return view.head.timestamp;
 }
 function outcome(){assert.ok(state.signed,'NATIVE_VALUE_UNKNOWN_NATIVE_ID_NO_REPLACEMENT');return freeze(copy({profile:DISPATCH_PROFILE,phase:state.phase,
   nativeExecutionClass:nativeRuntime.metadata.classification,publicNetwork:false,signed:state.signed,admissionNullifier:state.admissionNullifier,providerKey:b.providerKey,dispatchStatement:state.dispatchStatement,
   dispatchSignature:state.dispatchSignature,observation:state.observation,creditEligible:false,privateSpendableAtomic:null}));}
 async function reconcile(){live();await unchanged();assert.ok(state.signed,'NATIVE_VALUE_UNKNOWN_NATIVE_ID_NO_REPLACEMENT');
   assert.ok(state.phase!=='ADVERSE'&&!adverseObserved,'NATIVE_VALUE_ADVERSE_LATCHED');
   let failurePhase='provider-observe-native';
   try { const observation=copy(await observe({nativeId:state.signed.nativeId,nativeWire:state.signed.nativeWire,transactionSHA256:state.signed.transactionSHA256}));
   exactRecord(observation,['status','nativeId','nativeWire']);assert.equal(observation.nativeId,state.signed.nativeId);
   assert.ok(['observed','pending','unknown','unavailable','adverse'].includes(observation.status),'NATIVE_VALUE_ORIGINAL_OBSERVATION_STATUS');
   if(observation.status!=='observed')assert.equal(observation.nativeWire,null);
   if(observation.status==='observed'){
     assert.equal(observation.nativeWire,state.signed.nativeWire);equal(assertNativeValueSigned(b,state.prepared,{nativeWire:observation.nativeWire}),state.signed);
     // Original bootstrap records public native bytes only. It receives no P/R,
     // Action opening, recipient secret, provider key or user custody material.
     await refreshNativeValueReceiverClock(runtime);
     failurePhase='provider-retain-original';
     await retain({profileCommitment:b.profileCommitment,originalPreparation:state.originalPreparation,signed:state.signed});
     failurePhase='provider-certify-native';
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
   failurePhase='provider-persist-observation';
   await append('OBSERVATION',observation);return outcome();
   } catch(error) {
     retainNativeValueFailurePhase(error,failurePhase);
     try { if(!poisoned&&state.phase!=='ADVERSE'&&!adverseObserved&&record.state.events.length<MAX_DISPATCH_EVENTS
       &&!(state.phase==='UNKNOWN'&&state.failures.at(-1)?.stage==='reconciliation'))await append('UNKNOWN',{stage:'reconciliation'});
     } catch(appendError) { retainNativeValueSecondaryFailure(error,'provider-reconciliation-error-append',appendError); }
     throw error;
   }
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
       assert.equal(await system.verify(role,Buffer.from(value.proof,'hex'),value.publicInputs.map(v=>'0x'+BigInt(v).toString(16).padStart(64,'0'))),true,'NATIVE_VALUE_DISPATCH_PROOF_REJECTED');
     await current();await append('INTENT',intent);active=true;let stage='preparation',signedAt;
     const scopeBinding=evm?nativeValueEvmScopeBinding(b,intent):nativeValueTronScopeBinding(b,intent),gas=inputUint(r.gasLimit,256);assert.ok(gas>=23800n);
     const scope=freeze({binding:scopeBinding,transaction:freeze(evm?{from:b.native.solverEndpoint,to:b.native.recipientEndpoint,data:encodeEvmGraphTransferMemo(intent.action.receiptKeyCommitment),
       gas:'0x'+gas.toString(16),value:'0x'+BigInt(intent.action.amount).toString(16)}:{ownerAddress:b.native.solverEndpoint,recipientAddress:b.native.recipientEndpoint,amountSun:intent.action.amount,wireKeyCommitment:intent.action.receiptKeyCommitment}),
       async beforeSign(rawPrepared){live();assert.ok(active);const original=copy(rawPrepared),prepared=(evm?normalizeOriginalNativeValueEvmPreparation:normalizeOriginalNativeValueTronPreparation)(b,intent,original);originalPreparedCapability=rawPrepared;
         await append('PREPARED',{prepared,originalPreparation:original});await append('NATIVE_KEY_PENDING',null);stage='native-key';signedAt=await current();},
       async onSigned(rawSigned){live();assert.ok(active);exactRecord(rawSigned,['nativeWire','nativeId','transactionSHA256']);
         const signed=assertNativeValueSigned(b,state.prepared,{nativeWire:rawSigned.nativeWire});assert.equal(rawSigned.nativeId,(evm?'0x':'')+signed.nativeId);assert.equal(rawSigned.transactionSHA256,signed.transactionSHA256);
         const admissionNullifier=nativeValueDispatchNullifier(b,signed,request.receiptSpendSecret);
         await append('NATIVE_SIGNED',{signed,admissionNullifier,signedAt});stage='provider-key';
         const statement=nativeValueDispatchStatement(b,intent,signed,signedAt);await append('PROVIDER_KEY_PENDING',statement);await current();
         const signature=await providerSign(statement);await append('ATTESTED',{signature});},
       async beforeSend(){live();assert.ok(active);await append('SEND_PENDING',null);stage='send';await current();},
     });
     const scoped=Object.freeze(Object.create(null));requests.set(scoped,{nativeRuntime,family:evm?'3':'4',scope,opened:false,assertLive(){live();assert.ok(active,'NATIVE_VALUE_DISPATCH_INACTIVE_SCOPE');}});
     try{const sent=copy(await transfer(scoped));exactRecord(sent,['nativeId','transactionSHA256']);
       await append('BROADCAST',{nativeId:(assert.match(sent.nativeId,evm?/^0x[0-9a-f]{64}$/:/^[0-9a-f]{64}$/),evm?sent.nativeId.slice(2):sent.nativeId),transactionSHA256:sent.transactionSHA256});return outcome();
     }catch(error){
       retainNativeValueFailurePhase(error,'provider-'+stage);
       try{if(!poisoned&&record.state.events.length<MAX_DISPATCH_EVENTS)await append('UNKNOWN',{stage});}
       catch(appendError){retainNativeValueSecondaryFailure(error,'provider-dispatch-error-append',appendError);}
       throw error;
     }
     finally{requests.delete(scoped);active=false;request.receiptSpendSecret=null;}
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
