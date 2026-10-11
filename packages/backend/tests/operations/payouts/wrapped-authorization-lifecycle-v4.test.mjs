import test from 'node:test';
import assert from 'node:assert/strict';
import {h,copy} from '../../fixtures/operations/deployments/wrapped/wrapped-v4-host-fixtures.mjs';
import {profileCommitment} from '../../../src/chains/shared/transfers/generic-native-value-v2.mjs';
import {fixture,keys,graphModule,claimModule,bootstrapModule,nativeClaimModule,natives,testGraphOperationsV4,wrappedHostDiagnostic} from '../../support/wrapped-authorization-host.mjs';
const cause=regex=>error=>{for(let e=error;e;e=e.cause)if(regex.test(e.message))return true;return false;};

test('actual wrapped factories issue a separate V4 original lease after complete BTC/SOL and typed GRAPH validation',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),before=keys;
 const result=await f.quorum.health(f.request);
 wrappedHostDiagnostic('claim-health-complete');
 assert.equal(result.authorizationLifecycleProfile,'WRAPPED_CLAIM_AUTHORIZATION_LIFECYCLE_V4');assert.equal(keys-before,3);
 assert.ok(f.controls.inventoryReads.every(count=>count>=12));assert.ok(f.graphRecords.slice(0,3).every(row=>row.record.state.lastClock==='1000'));
 const saved=copy(result),count=keys;const token=await f.quorum.validateOriginalAuthorizationV4(result);
 wrappedHostDiagnostic('claim-original-validation-complete');
 assert.equal(keys,count);assert.deepEqual(result,saved);
 assert.throws(()=>nativeClaimModule.openClaimOriginalAuthorizationLeaseV4(token,f.quorum,result),/PRIVATE_ORIGINAL_LEASE/);
 const lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result);
 assert.equal(lease.profile,'WRAPPED_CLAIM_ORIGINAL_AUTHORIZATION_LEASE_V4');assert.equal(lease.auditStarted,0);
 lease.assertBeforeKey();assert.throws(()=>lease.assertBeforeKey(),/ALREADY_CONSUMED/);assert.throws(()=>lease.assertContinuationSourceCurrent(),/BROADCAST_ONLY/);
 assert.throws(()=>claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result),/PRIVATE_ORIGINAL_LEASE/);
});

for(const change of ['copy','wrong-quorum','wrong-result']) test('wrapped original lease '+change+' refuses without adopting native identity and burns on open failure',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),result=await f.quorum.health(f.request),token=await f.quorum.validateOriginalAuthorizationV4(result),count=keys;
 if(change==='copy'){assert.throws(()=>claimModule.openWrappedClaimOriginalAuthorizationLeaseV4({...token},f.quorum,result),/PRIVATE_ORIGINAL_LEASE/);claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result).assertBeforeKey();}
 else {assert.throws(()=>claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,change==='wrong-quorum'?{}:f.quorum,change==='wrong-result'?copy(result):result),/LEASE_(QUORUM|ORIGINAL_RESULT)/);
  assert.throws(()=>claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result),/PRIVATE_ORIGINAL_LEASE/);}
 assert.equal(keys,count);
});
for(const delta of ['graph-operation','native-read','evm-epoch','native-close','claim-operation']) test('wrapped V4 lease rejects later '+delta+' and cannot revive',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),result=await f.quorum.health(f.request),token=await f.quorum.validateOriginalAuthorizationV4(result),count=keys;
 const lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result);
 if(delta==='graph-operation')await f.pairs[0].graph.audit({poolIndex:0});
 if(delta==='native-read')await f.nativeRuntimes[1].inventory();
 if(delta==='evm-epoch')f.controls.evmEpoch++;
 if(delta==='native-close')natives.get(f.nativeRuntimes[1]).closed=true;
 if(delta==='claim-operation')await f.pairs[0].claim.audit();
 assert.throws(()=>lease.assertBeforeKey(),/SOURCE_CHANGED|NATIVE_STATE_CHANGED|EVM_MUTATION_CHANGED|NATIVE_CLOSED|GENERATION_CHANGED/);
 assert.throws(()=>lease.assertBeforeKey(),/ALREADY_CONSUMED/);assert.equal(keys,count);
});
for(const elapsed of [-1,30_000,Infinity,NaN])test('wrapped V4 final authority rejects nonfinite, negative, and exact-thirty-second elapsed: '+elapsed,async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);const f=await fixture(t),result=await f.quorum.health(f.request),token=await f.quorum.validateOriginalAuthorizationV4(result),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result);now=elapsed;
 assert.throws(()=>lease.assertBeforeKey(),/AUDIT_TOO_OLD/);assert.throws(()=>lease.assertBeforeKey(),/ALREADY_CONSUMED/);
});
test('wrapped independent complete rounds may exceed thirty seconds in total without relaxing any one round',async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);const f=await fixture(t);f.controls.beforeInventory=async()=>{now+=1500;};
 const count=keys,result=await f.quorum.health(f.request);assert.equal(keys-count,3);assert.ok(now>30_000);
 const token=await f.quorum.validateOriginalAuthorizationV4(result),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result);
 lease.assertBeforeKey();assert.ok(now-lease.auditStarted<30_000);assert.equal(keys-count,3);
});
test('wrapped complete original revalidation is validation-only and rejects a removed durable signature',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),result=await f.quorum.health(f.request),count=keys;
 // An external CAS-record change cannot be normalized into a new signature.
 f.store(0).data.authorizations[0].signature=null;
 await assert.rejects(f.quorum.validateOriginalAuthorizationV4(result),cause(/JOURNAL|CHANGED|UNFINISHED/));assert.equal(keys,count);
});
test('wrapped failure drains every started independent signer before releasing its reservation',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);let release,entered;
 const waiting=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);let calls=0;
 f.controls.beforeInventory=async()=>{if(++calls===1){entered();await gate;throw Error('TEST_NATIVE_UNKNOWN');}};
 const work=f.quorum.health(f.request);await waiting;
 await assert.rejects(f.pairs[0].graph.audit({poolIndex:0}),/EXCLUSIVE|RESERVED/);assert.equal(f.pairs[0].claim.status().reserved,true);
 release();await assert.rejects(work,cause(/TEST_NATIVE_UNKNOWN|RETAINED_NATIVE|INVENTORY|COMPLETE_AUDIT/));
 for(const pair of f.pairs.slice(0,3))assert.equal(pair.claim.status().reserved,false);
 assert.ok(f.nativeRuntimes.every(native=>natives.get(native).activeReads===0));
});
test('wrapped private key and facts consumers reject public lookalikes before key use',()=>{
 const count=keys;assert.throws(()=>bootstrapModule.consumeWrappedClaimOperatorConstructionV1(Object.freeze({signerIndex:0})),/PRIVATE_OPERATOR_CONSTRUCTION_REQUIRED/);
 assert.throws(()=>claimModule.consumeWrappedClaimOperatorKeyLeaseV4({}, {},'health',{},Buffer.alloc(0)),/PRIVATE_KEY_LEASE/);
 assert.throws(()=>claimModule.consumeWrappedClaimPayoutFactsKeyLeaseV4({}, {},{},Buffer.alloc(0)),/PRIVATE_FACTS_KEY_LEASE/);
 assert.equal(keys,count);
});
test('ordinary wrapped ingress health retains its original non-V4 result and full final coverage',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),count=keys;
 const result=await f.quorum.health({...f.request,mode:'ingress'});assert.equal(result.authorizationLifecycleProfile,undefined);assert.equal(keys-count,3);
 const reads=f.controls.inventoryReads[0];await f.quorum.assertOriginalAuthorizationCurrent(result);assert.equal(keys-count,3);assert.ok(f.controls.inventoryReads[0]>reads);
 await assert.rejects(async()=>f.quorum.validateOriginalAuthorizationV4(result),/V4_ORIGINAL_AUTHORIZATION_REQUIRED/);
});
for(const kind of ['1','2'])test('actual wrapped SOL '+(kind==='1'?'redeem':'refund')+' retains original backing/presign/reservation/broadcast and payout facts signatures',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);
 await f.addClaimFact();const p=f.preparePayout(kind),begin=await f.quorum.backing(p.begin);
 assert.equal(begin.authorizationLifecycleProfile,'WRAPPED_CLAIM_AUTHORIZATION_LIFECYCLE_V4');
 const beginKeys=keys;claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(await f.quorum.validateOriginalAuthorizationV4(begin),f.quorum,begin).assertBeforeKey();assert.equal(keys,beginKeys);
 p.beginIncluded();const presign=await f.quorum.authorizePayout(p.request);assert.equal(presign.message.ticketId,p.ticket.id);
 const reservationRequest=await p.retain(),reservation=await f.quorum.reservation(reservationRequest);
 claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(await f.quorum.validateOriginalAuthorizationV4(reservation),f.quorum,reservation).assertBeforeKey();
 const broadcastRequest=p.reserved(),broadcast=await f.quorum.authorizeBroadcast(broadcastRequest),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(await f.quorum.validateOriginalAuthorizationV4(broadcast),f.quorum,broadcast);
 lease.assertBeforeKey();lease.assertContinuationSourceCurrent();assert.throws(()=>lease.assertContinuationSourceCurrent(),/ALREADY_CONSUMED/);
 const factsRequest=p.observed(),facts=await f.quorum.facts(factsRequest),factKeys=keys;
 assert.equal(facts.authorizationLifecycleProfile,'WRAPPED_CLAIM_AUTHORIZATION_LIFECYCLE_V4');assert.equal(facts.certificates.length,3);
 const again=await f.quorum.facts(factsRequest);assert.deepEqual(again,facts);assert.equal(keys,factKeys);
 for(let i=0;i<3;i++)assert.equal(f.store(i).data.wrappedFactsHistory.filter(row=>row.request.nativeId===factsRequest.nativeId).length,1);
 p.discharge();const health=await f.quorum.health({...f.request,claimDomain:p.request.claimDomain});assert.equal(health.authorizationLifecycleProfile,'WRAPPED_CLAIM_AUTHORIZATION_LIFECYCLE_V4');
});
test('loaded genuine typed GRAPH source histories are independently reopened in every wrapped V4 round',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);await f.addGraphFact();const before=f.graphFixtures.map(row=>row.calls.length),count=keys;
 const result=await f.quorum.health(f.request);assert.equal(keys-count,3);
 for(let i=0;i<3;i++){assert.ok(f.graphFixtures[i].calls.length>before[i]);assert.equal(f.graphRecords[i].record.state.inventories[0].entries[0].history.length,1);}
 const token=await f.quorum.validateOriginalAuthorizationV4(result),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result);lease.assertBeforeKey();
});
test('loaded typed GRAPH unknown refuses all wrapped claim keys and later adverse history stays latched',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);await f.addGraphFact();const count=keys;
 f.controls.graphUnknown=true;await assert.rejects(f.quorum.health(f.request),cause(/FULL_INVENTORY_BLOCKED/));assert.equal(keys,count);
 f.controls.graphUnknown=false;await f.quorum.health(f.request);
 // A changed inclusion is authenticated adverse, even when the same wire exists.
 const oldHash=f.graphFixtures[0].state.included.hash;f.graphFixtures[0].state.included.hash=hash(80000);
 await assert.rejects(f.quorum.health(f.request),cause(/FULL_INVENTORY_BLOCKED/));
 assert.equal(f.graphRecords[0].record.state.inventories[0].entries[0].status,'adverse');
 f.graphFixtures[0].state.included.hash=oldHash;
 await assert.rejects(f.quorum.health(f.request),cause(/FULL_INVENTORY_BLOCKED/));
 assert.equal(f.graphRecords[0].record.state.inventories[0].entries[0].status,'adverse');
});
for(const delta of ['read','mutation','pending','adverse','history'])test('wrapped original lease fences separate registered GRAPH native '+delta+' after complete audit',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),result=await f.quorum.health(f.request),token=await f.quorum.validateOriginalAuthorizationV4(result),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result),count=keys;
 if(delta==='read')f.graphNative.readGeneration=String(BigInt(f.graphNative.readGeneration)+1n);
 if(delta==='mutation')f.graphNative.mutationGeneration='1';
 if(delta==='pending')f.graphNative.pending=true;
 if(delta==='adverse')f.graphNative.adverseHistory=true;
 if(delta==='history')f.graphNative.transactions.push({nativeId:h('unexpected-native-transaction')});
 assert.throws(()=>lease.assertBeforeKey(),/GRAPH_NATIVE_(STATE|HISTORY)_CHANGED/);assert.throws(()=>lease.assertBeforeKey(),/ALREADY_CONSUMED/);assert.equal(keys,count);
});
for(const kind of ['1','2'])test('actual wrapped BTC '+(kind==='1'?'redeem':'refund')+' signs exact original broadcast purpose and retains payout facts',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t,{family:'1'});await f.addBitcoinClaimFact();const p=f.prepareBitcoinPayout(kind);
 const begin=await f.quorum.backing(p.begin);claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(await f.quorum.validateOriginalAuthorizationV4(begin),f.quorum,begin).assertBeforeKey();
 p.beginIncluded();const presign=await f.quorum.authorizePayout(p.request);assert.equal(presign.message.ticketId,p.ticket.id);
 const reservationRequest=await p.retain(),reservation=await f.quorum.reservation(reservationRequest);
 claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(await f.quorum.validateOriginalAuthorizationV4(reservation),f.quorum,reservation).assertBeforeKey();
 const request=p.reserved(),broadcast=await f.quorum.authorizeBitcoinBroadcast(request),count=keys;
 claimModule.assertOriginalBitcoinPayoutBroadcastAuthorization(f.quorum,broadcast,request);
 const token=await f.quorum.validateOriginalAuthorizationV4(broadcast),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,broadcast);
 lease.assertBeforeKey();lease.assertContinuationSourceCurrent();assert.equal(keys,count);
 await assert.rejects(f.quorum.authorizeBroadcast(request),/SOL|BITCOIN|FAMILY/);
 const factsRequest=p.observed(),facts=await f.quorum.facts(factsRequest),factKeys=keys;
 assert.equal(facts.authorizationLifecycleProfile,'WRAPPED_CLAIM_AUTHORIZATION_LIFECYCLE_V4');assert.deepEqual(await f.quorum.facts(factsRequest),facts);assert.equal(keys,factKeys);
 for(let i=0;i<3;i++)assert.equal(f.store(i).data.wrappedFactsHistory.filter(row=>row.request.nativeId===factsRequest.nativeId).length,1);
});

test('all signers share the final stable GRAPH physical snapshot after sequential independent reads without changing original signatures head or payout intent',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);await f.addGraphFact();await f.addClaimFact();
 const p=f.preparePayout('1');await f.quorum.backing(p.begin);p.beginIncluded();
 const original=await f.quorum.authorizePayout(p.request),savedResult=copy(original),savedRequest=copy(p.request),count=keys;
 const reads=f.graphFixtures.map(row=>row.calls.length),sampleStart=f.controls.graphSnapshotSamples.length,eventStart=f.controls.graphNativeReadEvents.length;
 const token=await f.quorum.validateOriginalAuthorizationV4(original),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,original);
 const samples=f.controls.graphSnapshotSamples.slice(sampleStart),finalGeneration=f.graphNative.readGeneration;
 for(let i=0;i<3;i++)assert.ok(f.graphFixtures[i].calls.length>reads[i],'each original registered source independently reopens');
 const events=f.controls.graphNativeReadEvents.slice(eventStart);assert.deepEqual([...new Set(events.map(row=>row.signerIndex))].sort(),[0,1,2]);
 assert.ok(events.length>=6);for(let i=0;i<events.length;i+=2){assert.equal(events[i].phase,'start');assert.equal(events[i+1].phase,'end');assert.equal(events[i].signerIndex,events[i+1].signerIndex);assert.equal(BigInt(events[i+1].generation),BigInt(events[i].generation)+1n);}
 assert.equal(events.at(-1).generation,finalGeneration,'all legitimate sequential reads precede the final stable snapshot');
 assert.equal(samples.at(-1).readGeneration,finalGeneration);assert.equal(samples.at(-1).activeReads,0);assert.equal(samples.at(-1).readsIdle,true);
 const calls=f.graphFixtures.map(row=>row.calls.length);lease.assertBeforeKey();
 assert.deepEqual(f.graphFixtures.map(row=>row.calls.length),calls,'terminal consumption performs no native reread');
 assert.deepEqual(original,savedResult);assert.deepEqual(p.request,savedRequest);assert.equal(keys,count);
 // The exact final fence is stricter than the cross-signer progress projection.
 const readLease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(await f.quorum.validateOriginalAuthorizationV4(original),f.quorum,original);
 await f.controls.graphNativeTransports[0]('eth_chainId',[],{signal:new AbortController().signal});
 assert.throws(()=>readLease.assertBeforeKey(),/GRAPH_NATIVE_STATE_CHANGED/);
 const mutationLease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(await f.quorum.validateOriginalAuthorizationV4(original),f.quorum,original);
 f.graphNative.mutationGeneration=String(BigInt(f.graphNative.mutationGeneration)+1n);
 assert.throws(()=>mutationLease.assertBeforeKey(),/GRAPH_NATIVE_HISTORY_CHANGED|GRAPH_NATIVE_STATE_CHANGED/);
 assert.deepEqual(original,savedResult);assert.deepEqual(p.request,savedRequest);assert.equal(keys,count);
});

test('wrapped original all-signer lease accepts the unchanged receiver busy dispatch section while separate GRAPH remains idle',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);f.controls.receiverBusy=true;
 const result=await f.quorum.health(f.request),count=keys,token=await f.quorum.validateOriginalAuthorizationV4(result);
 const lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result);
 assert.equal(f.runtime.ingressSendState.busy,true);assert.equal(f.graphNative.busy,false);lease.assertBeforeKey();assert.equal(keys,count);
});
for(const change of ['epoch','busy'])test('receiver '+change+' change after the busy original all-signer audit refuses without graph-idle relaxation',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);f.controls.receiverBusy=true;
 const result=await f.quorum.health(f.request),token=await f.quorum.validateOriginalAuthorizationV4(result),lease=claimModule.openWrappedClaimOriginalAuthorizationLeaseV4(token,f.quorum,result),count=keys;
 if(change==='epoch')f.controls.evmEpoch++;else f.controls.receiverBusy=false;
 assert.throws(()=>lease.assertBeforeKey(),/EVM_MUTATION_CHANGED/);assert.throws(()=>lease.assertBeforeKey(),/ALREADY_CONSUMED/);assert.equal(keys,count);
});
test('a busy separate GRAPH native runtime refuses before claim keys even inside the legitimate receiver dispatch section',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);f.controls.receiverBusy=true;f.graphNative.busy=true;const count=keys;
 await assert.rejects(f.quorum.health(f.request),cause(/GRAPH_NATIVE_STATE_busy/));assert.equal(keys,count);
 assert.equal(f.runtime.ingressSendState.busy,true);assert.equal(f.graphNative.busy,true);
});


const graphQuorumV4 = f => graphModule.createNativeValueOperatorQuorum({operators:f.pairs.slice(0,3).map(pair=>pair.graph)});
const graphHealthV4 = f => ({poolIndex:0,validUntil:String(BigInt(f.head.timestamp)+30n)});
function originalOperationPortV4(f, phase='native-key') {
 const token=Object.freeze(Object.create(null)), profile=profileCommitment(f.c.registration.profiles.find(row=>row.kind==='native-value').profile);
 const state={phase,nativeAuditStarted:performance.now(),prepared:{intent:{amount:'7'},unsignedWire:'0011'},signed:phase==='native-key'?null:{nativeId:h('dispatch-native-id'),nativeWire:'aabb',transactionSHA256:h('dispatch-wire')}};
 Object.assign(f.graphNative,{busy:true,pending:true,activeMutations:1});
 testGraphOperationsV4.set(token,()=>({profile:'WRAPPED_GRAPH_DISPATCH_OPERATION_V4',profileCommitment:profile,family:f.graphNative.family,lifetimeId:f.graphNative.lifetimeId,
  phase:state.phase,prepared:state.prepared,signed:state.signed,nativeAuditStarted:state.nativeAuditStarted,physicalState:f.graphNative}));
 return {token,state};
}
test('GRAPH V4 original factories sign and validate reciprocal original claim history with one-use unchanged health',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),q=graphQuorumV4(f),count=keys,reads=[...f.controls.inventoryReads];
 const result=await q.health(graphHealthV4(f));assert.equal(keys-count,3);assert.ok(f.controls.inventoryReads.every((n,i)=>n>reads[i]));
 const saved=copy(result),signed=keys,lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);
 assert.equal(graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),0);
 assert.equal(keys,signed);assert.deepEqual(result,saved);assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),/PRIVATE_ORIGINAL_LEASE_REQUIRED/);
});
for(const phase of ['native-key','provider-key','send'])test('GRAPH V4 exact original dispatch operation phase '+phase+' alone may be busy',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),q=graphQuorumV4(f),op=originalOperationPortV4(f,phase),count=keys;
 const result=await graphModule.issueWrappedGraphDispatchHealthV4(q,graphHealthV4(f),op.token),saved=copy(result);assert.equal(keys-count,3);
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);
 assert.equal(graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),0);assert.deepEqual(result,saved);
 assert.equal(f.graphNative.busy,true);assert.equal(f.graphNative.pending,true);assert.equal(f.graphNative.activeMutations,1);
});

for(const kind of ['checkpoint','certify'])test('GRAPH V4 '+kind+' fixed signing domain preserves exact retained original bytes',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),q=graphQuorumV4(f);await f.addClaimFact();const count=keys;
 const request=kind==='checkpoint'?{poolIndex:0,requestId:h('original-checkpoint')}:{poolIndex:0,profileCommitment:profileCommitment(f.c.registration.profiles.find(row=>row.kind==='native-value').profile),nativeId:f.graphFixtures[0].binding.identity.nativeId};
 const result=await q[kind](request),saved=copy(result),signed=keys;assert.equal(signed-count,3);
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);
 graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result);assert.equal(keys,signed);assert.deepEqual(result,saved);
 if(kind==='certify')for(let i=0;i<3;i++)assert.equal(f.graphRecords[i].record.state.inventories[0].entries[0].history.length,1);
});
test('GRAPH V4 does not mistake copies, proxies, callbacks or booleans for original result/key authority',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),q=graphQuorumV4(f),result=await q.health(graphHealthV4(f)),count=keys;
 for(const falseResult of [copy(result),new Proxy(result,{}),true,undefined])assert.throws(()=>graphModule.validateWrappedGraphOriginalAuthorizationV4(q,falseResult),/ORIGINAL_AUTHORIZATION_REQUIRED/);
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);
 for(const falseLease of [{...lease},new Proxy(lease,{}),{assertCurrent(){}},true,undefined])assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(falseLease,q,result),/PRIVATE_ORIGINAL_LEASE_REQUIRED/);
 for(const falseLease of [{},true,undefined])assert.throws(()=>graphModule.consumeWrappedGraphOperatorKeyLeaseV4(falseLease,{},'health',result.message,null,Buffer.alloc(0)),/PRIVATE_KEY_LEASE_REQUIRED/);
 graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result);assert.equal(keys,count);
});
for(const change of ['quorum','result','options'])test('GRAPH V4 mismatching '+change+' burns original final lease before checks',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),q=graphQuorumV4(f),result=await q.health(graphHealthV4(f)),count=keys;
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result),args=[lease,change==='quorum'?{}:q,change==='result'?copy(result):result];if(change==='options')args.push({phase:'send'});
 assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(...args),/LEASE_QUORUM|LEASE_RESULT|NO_OPTIONS/);
 assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),/PRIVATE_ORIGINAL_LEASE_REQUIRED/);assert.equal(keys,count);
});
for(const change of ['claim-read','claim-mutation','claim-operation','graph-read','graph-mutation','graph-operation','receiver','native-phase','prepared','signed'])test('GRAPH V4 terminal original authority rejects later '+change,async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),q=graphQuorumV4(f),op=originalOperationPortV4(f,'provider-key');
 const result=await graphModule.issueWrappedGraphDispatchHealthV4(q,graphHealthV4(f),op.token),lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result),count=keys;
 if(change==='claim-read')await f.nativeRuntimes[0].inventory();if(change==='claim-mutation')natives.get(f.nativeRuntimes[0]).mutations++;
 if(change==='claim-operation')await f.pairs[0].claim.retainSignedEffect({claimDomain:h('nonregistered'),operationId:h('none'),receiptSecret:h('s'),wireSalt:h('w'),nativeId:h('n')}).catch(()=>{});
 if(change==='graph-read')f.graphNative.readGeneration=String(BigInt(f.graphNative.readGeneration)+1n);
 if(change==='graph-mutation')f.graphNative.mutationGeneration=String(BigInt(f.graphNative.mutationGeneration)+1n);
 if(change==='graph-operation')await f.pairs[0].graph.audit({poolIndex:0});if(change==='receiver')f.controls.evmEpoch++;
 if(change==='native-phase')op.state.phase='send';if(change==='prepared')op.state.prepared.intent.amount='8';if(change==='signed')op.state.signed.nativeWire+='00';
 assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result));
 assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),/PRIVATE_ORIGINAL_LEASE_REQUIRED/);assert.equal(keys,count);
});
for(const elapsed of [-1,29999,30000,Infinity,NaN])test('GRAPH V4 strict final clock boundary '+elapsed,async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);const f=await fixture(t),q=graphQuorumV4(f),result=await q.health(graphHealthV4(f));
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);now=elapsed;
 if(elapsed===29999)assert.equal(graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),0);
 else assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),/COMPLETE_AUDIT_DEADLINE/);
 assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),/PRIVATE_ORIGINAL_LEASE_REQUIRED/);
});
test('GRAPH V4 complete rounds may exceed thirty seconds together without refreshing original certificate bytes',async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);const f=await fixture(t),q=graphQuorumV4(f);f.controls.beforeInventory=async()=>{now+=1500;};
 const count=keys,result=await q.health(graphHealthV4(f)),saved=copy(result);assert.equal(keys-count,3);assert.ok(now>30000);
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result),start=graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result);
 assert.ok(now-start<30000);assert.deepEqual(result,saved);assert.equal(keys-count,3);
});
test('GRAPH V4 one expired complete reciprocal round cannot be renewed with a cheap refresh',async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);const f=await fixture(t),q=graphQuorumV4(f),count=keys;f.controls.beforeInventory=async()=>{now+=30000;};
 await assert.rejects(q.health(graphHealthV4(f)),cause(/AUDIT_TOO_OLD|COMPLETE_AUDIT_DEADLINE|COMPLETE_AUDIT_UNAVAILABLE/));assert.equal(keys,count);
});
test('GRAPH V4 fresh original native read can advance before validation, then its exact generation and clock are pinned',async t=>{
 let now=0;t.mock.method(performance,'now',()=>now);const f=await fixture(t),q=graphQuorumV4(f),op=originalOperationPortV4(f);
 const result=await graphModule.issueWrappedGraphDispatchHealthV4(q,graphHealthV4(f),op.token),saved=copy(result);now=90000;op.state.nativeAuditStarted=now;f.graphNative.readGeneration='12';
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);assert.equal(graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result),90000);assert.deepEqual(result,saved);
 const expired=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);op.state.nativeAuditStarted=90001;
 assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(expired,q,result));
});
for(const failure of ['unsigned-preparation','active-payout','claim-adverse','graph-unknown','changed-signature','omitted-claim-inventory'])test('GRAPH V4 full reciprocal retained history refuses '+failure+' without new key',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t),q=graphQuorumV4(f);
 if(failure==='graph-unknown')await f.addGraphFact();if(['claim-adverse','active-payout','unsigned-preparation'].includes(failure))await f.addClaimFact();
 let result;if(failure==='changed-signature')result=await q.health(graphHealthV4(f));const count=keys;
 if(failure==='unsigned-preparation')f.preparePayout();if(failure==='active-payout'){const p=f.preparePayout();p.beginIncluded();}
 if(failure==='claim-adverse')f.controls.claimAdverse=true;if(failure==='graph-unknown')f.controls.graphUnknown=true;
 if(failure==='changed-signature')f.graphRecords[0].record.state.authorizations[0].signature=null;
 if(failure==='omitted-claim-inventory')f.c.inventories[1].inventory.accounts=[];
 await assert.rejects(result?graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result):q.health(graphHealthV4(f)));assert.equal(keys,count);
});

test('GRAPH V4 final stable all-signer snapshot follows actual sequential claim and typed GRAPH reads',async t=>{
 t.mock.method(performance,'now',()=>0);const f=await fixture(t);await f.addClaimFact();await f.addGraphFact();const q=graphQuorumV4(f),result=await q.health(graphHealthV4(f)),count=keys,saved=copy(result);
 const graphReads=f.graphFixtures.map(row=>row.calls.length),claimReads=[...f.controls.inventoryReads];
 const lease=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result),generation=f.graphNative.readGeneration;
 for(let i=0;i<3;i++)assert.ok(f.graphFixtures[i].calls.length>graphReads[i]);assert.ok(f.controls.inventoryReads.every((n,i)=>n>claimReads[i]));
 const finalReads=f.graphFixtures.map(row=>row.calls.length),finalClaim=[...f.controls.inventoryReads];graphModule.consumeWrappedGraphOriginalAuthorizationV4(lease,q,result);
 assert.deepEqual(f.graphFixtures.map(row=>row.calls.length),finalReads);assert.deepEqual(f.controls.inventoryReads,finalClaim);assert.equal(f.graphNative.readGeneration,generation);
 const next=await graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);await f.controls.graphNativeTransports[0]('eth_chainId',[],{signal:new AbortController().signal});
 assert.throws(()=>graphModule.consumeWrappedGraphOriginalAuthorizationV4(next,q,result));assert.deepEqual(result,saved);assert.equal(keys,count);
});
