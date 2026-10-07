import test from 'node:test';
import assert from 'node:assert/strict';
import {newIdentity,sign,digest} from '../../src/crypto/privacy.mjs';
import {SemanticRoute,semanticIntent,semanticHash,syntheticSemanticResult,syntheticInvalidation} from '../../src/core/semantic.mjs';
const now=1800000000000;
function fixture(){
  const owner=newIdentity(),observer=newIdentity(),intent=semanticIntent(observer.publicKey,now),signature=sign(intent,owner.privateKey);
  const route=()=>new SemanticRoute(intent,signature,{userPublicKey:owner.publicKey,observerPublicKey:observer.publicKey});
  return {owner,observer,intent,signature,route};
}
function deliver(f,r,stage,amount){
  const plan=r.plan(stage,now);r.markSubmitted(stage,plan.planHash,now);
  const outputs=stage==='lock'?{escrowId:'a'.repeat(64),owner:f.intent.owner,solver:f.intent.solver,amount:f.intent.quote.inputAmount,termsHash:semanticHash(f.intent),status:'OPEN'}:
    {recipient:f.intent.recipients[stage],amount:amount??plan.action.amount,fee:'100'};
  const signed=syntheticSemanticResult(f.intent,plan,f.observer.privateKey,now,outputs);r.accept(signed,now);return signed;
}
test('four-action semantic route: authenticated lock gates SOL, SOL determines BTC, both determine claim',()=>{
  const f=fixture(),r=f.route();assert.throws(()=>r.plan('sol',now),/MISSING_AUTHENTICATED/);
  deliver(f,r,'lock');const solPlan=r.plan('sol',now);assert.equal(solPlan.action.max,'3500000');assert.equal(solPlan.parents[0].stage,'lock');
  deliver(f,r,'sol','3000000');const btc=r.plan('btc',now);assert.equal(btc.action.amount,'168750');assert.equal(btc.action.solCost,'300000');assert.deepEqual(btc.parents.map(p=>p.stage),['lock','sol']);
  assert.throws(()=>r.fulfillmentStatement(now),/MISSING_AUTHENTICATED/);deliver(f,r,'btc');
  const statement=r.fulfillmentStatement(now);assert.equal(statement.type,'LOCAL_CHECKED_STATEMENT_NOT_ZK');assert.equal(statement.claim.action.amount,'1000000');assert.equal(statement.claim.action.effects.length,2);
  assert.equal(statement.authorization.signature,f.signature);assert.deepEqual(statement.authorization.signedIntent,f.intent);
});
test('varying one authorized predecessor output changes successor amount and rejects an otherwise signed stale result',()=>{
  const f=fixture(),a=f.route(),b=f.route();
  const lock=deliver(f,a,'lock');const bl=b.plan('lock',now);b.markSubmitted('lock',bl.planHash,now);b.accept(lock,now);
  deliver(f,a,'sol','3000000');deliver(f,b,'sol','3500000');
  const ap=a.plan('btc',now),bp=b.plan('btc',now);assert.equal(ap.action.amount,'168750');assert.equal(bp.action.amount,'156250');assert.notEqual(ap.planHash,bp.planHash);
  b.markSubmitted('btc',bp.planHash,now);
  const stale=syntheticSemanticResult(f.intent,ap,f.observer.privateKey,now,{recipient:f.intent.recipients.btc,amount:ap.action.amount,fee:'100'});
  assert.throws(()=>b.accept(stale,now),/STALE_PREDECESSOR_BINDING/);
  const wrong=syntheticSemanticResult(f.intent,bp,f.observer.privateKey,now,{recipient:f.intent.recipients.btc,amount:ap.action.amount,fee:'100'});
  assert.throws(()=>b.accept(wrong,now),/BTC_RESIDUAL_FORMULA_MISMATCH/);
});
test('binding includes predecessor effect identity, not only observed value or arrival order',()=>{
  const f=fixture(),a=f.route(),b=f.route();deliver(f,a,'lock');deliver(f,b,'lock');deliver(f,a,'sol','3000000');deliver(f,b,'sol','3000000');
  const pa=a.plan('btc',now),pb=b.plan('btc',now);assert.equal(pa.action.amount,pb.action.amount);assert.notEqual(pa.planHash,pb.planHash);
});
test('invalidation before successor dispatch revokes old plan and permits recalculation while preserving history',()=>{
  const f=fixture(),r=f.route();deliver(f,r,'lock');deliver(f,r,'sol','3000000');const old=r.plan('btc',now),oldView=r.projection('btc',now);
  const sol=r.snapshot().records.sol;
  const result=r.invalidate(syntheticInvalidation(f.intent,'sol',sol.digest,f.observer.privateKey,now),now);assert.equal(result.recomputeAllowed,true);
  assert.throws(()=>r.plan('btc',now),/MISSING_AUTHENTICATED/);deliver(f,r,'sol','3500000');const next=r.plan('btc',now);
  assert.notEqual(next.planHash,old.planHash);assert.equal(next.action.amount,'156250');assert.throws(()=>r.markSubmitted('btc',old.planHash,now),/STALE_PLAN/);
  assert.notEqual(r.projection('btc',now).dispatchToken,oldView.dispatchToken);assert.equal(r.snapshot().history.filter(h=>h.type==='result'&&h.signed.payload.stage==='sol').length,2);
});
test('invalidation after irreversible successor freezes; it never rewrites downstream output or proves recovery',()=>{
  const f=fixture(),r=f.route();deliver(f,r,'lock');deliver(f,r,'sol','3000000');deliver(f,r,'btc');const before=r.snapshot();
  const result=r.invalidate(syntheticInvalidation(f.intent,'sol',before.records.sol.digest,f.observer.privateKey,now),now);
  assert.equal(result.frozen,true);assert.equal(r.snapshot().records.btc.admissible,false);assert.deepEqual(r.snapshot().records.btc.signed,before.records.btc.signed);
  assert.throws(()=>r.fulfillmentStatement(now),/FROZEN/);assert.throws(()=>r.plan('btc',now),/FROZEN/);
});
test('quote, chain genesis, authority policy, exact lock and owner authorization are bound',()=>{
  const f=fixture();const altered=structuredClone(f.intent);altered.quote.protocolFee='26000';assert.throws(()=>new SemanticRoute(altered,f.signature,{userPublicKey:f.owner.publicKey,observerPublicKey:f.observer.publicKey}),/OWNER_AUTHORIZATION/);
  assert.throws(()=>new SemanticRoute(f.intent,f.signature,{userPublicKey:f.owner.publicKey,observerPublicKey:newIdentity().publicKey}),/OBSERVER_POLICY/);
  const r=f.route(),plan=r.plan('lock',now);r.markSubmitted('lock',plan.planHash,now);
  const receipt=syntheticSemanticResult(f.intent,plan,f.observer.privateKey,now,{escrowId:'b'.repeat(64),owner:f.intent.owner,solver:f.intent.solver,amount:'999999',termsHash:semanticHash(f.intent),status:'OPEN'});
  assert.throws(()=>r.accept(receipt,now),/WRONG_LOCK_RESULT/);
  receipt.payload.outputs.amount=f.intent.quote.inputAmount;receipt.payload.effect.genesis='wrong-chain';receipt.signature=sign(receipt.payload,f.observer.privateKey);assert.throws(()=>r.accept(receipt,now),/WRONG_CHAIN_IDENTITY/);
});
test('claim grace differs from execution deadline; expiry and unauthenticated invalidation fail closed',()=>{
  const f=fixture(),r=f.route();deliver(f,r,'lock');deliver(f,r,'sol','3000000');deliver(f,r,'btc');
  assert.equal(r.fulfillmentStatement(f.intent.executeBy+1).type,'LOCAL_CHECKED_STATEMENT_NOT_ZK');assert.throws(()=>r.fulfillmentStatement(f.intent.claimBy),/STAGE_EXPIRED/);
  const invalid=syntheticInvalidation(f.intent,'sol',r.snapshot().records.sol.digest,newIdentity().privateKey,now);assert.throws(()=>r.invalidate(invalid,now),/OBSERVER_SIGNATURE/);
});
test('owner-only plans are not executor projections; projections omit graph and predecessor identifiers',()=>{
  const f=fixture(),r=f.route();deliver(f,r,'lock');const view=r.projection('sol',now),text=JSON.stringify(view);
  assert.ok(!text.includes(semanticHash(f.intent)));assert.ok(!text.includes(f.intent.id));assert.ok(!text.includes('escrowId'));assert.ok(!text.includes('btc'));
  assert.equal(view.action.recipient,f.intent.recipients.sol);assert.ok(text.includes('2500000')); // necessary economic leakage remains
});
test('competent dataflow baseline also invalidates changed predecessor: no novelty is inferred',()=>{
  const f=fixture(),r=f.route();deliver(f,r,'lock');deliver(f,r,'sol','3000000');const plan=r.plan('btc',now);
  const competentBaseline=predecessors=>digest('signed-dataflow-inputs',predecessors);
  const old=competentBaseline(plan.parents),changed=structuredClone(plan.parents);changed[1].resultDigest='different-authenticated-outcome';
  assert.notEqual(old,competentBaseline(changed));assert.equal(plan.action.amount,'168750');
});

test('a submitted EVM claim freezes the route when its BTC predecessor is invalidated',()=>{
  const f=fixture(),r=f.route();deliver(f,r,'lock');deliver(f,r,'sol','3000000');deliver(f,r,'btc');
  const claim=r.plan('claim',now);r.markSubmitted('claim',claim.planHash,now);
  const result=r.invalidate(syntheticInvalidation(f.intent,'btc',r.snapshot().records.btc.digest,f.observer.privateKey,now),now);
  assert.equal(result.frozen,true);assert.equal(result.recomputeAllowed,false);assert.throws(()=>r.fulfillmentStatement(now),/FROZEN/);
});
test('trusted observer timeline cannot place a successor observation before recorded dispatch or predecessor',()=>{
  const f=fixture(),r=f.route();deliver(f,r,'lock');const plan=r.plan('sol',now+10);r.markSubmitted('sol',plan.planHash,now+10);
  const early=syntheticSemanticResult(f.intent,plan,f.observer.privateKey,now,{recipient:f.intent.recipients.sol,amount:'3000000',fee:'100'});
  assert.throws(()=>r.accept(early,now+20),/RESULT_BEFORE_PREDECESSOR_OR_DISPATCH/);
});
test('returned aggregate statement cannot mutate the authorized private intent',()=>{
  const f=fixture(),r=f.route();deliver(f,r,'lock');deliver(f,r,'sol','3000000');deliver(f,r,'btc');
  const before=r.snapshot(),statement=r.fulfillmentStatement(now);statement.authorization.signedIntent.quote.inputAmount='1';statement.authorization.signature='altered';statement.claim.parents[0].resultDigest='tampered';
  assert.deepEqual(r.snapshot(),before);assert.equal(r.fulfillmentStatement(now).claim.action.amount,'1000000');assert.equal(r.fulfillmentStatement(now).authorization.signature,f.signature);
});
test('infeasible and representation-overflowing quotes reject before any input lock',()=>{
  const f=fixture();
  for(const modify of [i=>i.quote.inputAmount='25001',i=>{i.quote.inputAmount='1000000000000000000000000000000';i.quote.btcPriceNumerator='1';i.quote.btcPriceDenominator='1000000000000000000000000000000';}]){
    const intent=structuredClone(f.intent);modify(intent);
    assert.throws(()=>new SemanticRoute(intent,sign(intent,f.owner.privateKey),{userPublicKey:f.owner.publicKey,observerPublicKey:f.observer.publicKey}));
  }
});

function invalidatedPendingBtc(){
  const f=fixture(),r=f.route();deliver(f,r,'lock');deliver(f,r,'sol','3000000');
  const plan=r.plan('btc',now);r.markSubmitted('btc',plan.planHash,now);
  const result=syntheticSemanticResult(f.intent,plan,f.observer.privateKey,now+2,{recipient:f.intent.recipients.btc,amount:plan.action.amount,fee:'100'});
  r.invalidate(syntheticInvalidation(f.intent,'sol',r.snapshot().records.sol.digest,f.observer.privateKey,now+1),now+1);
  return {f,r,plan,result};
}
test('submitted BTC remains recordable against its archived plan after SOL invalidation',()=>{
  const {r,plan,result}=invalidatedPendingBtc(),before=r.snapshot();
  assert.equal(before.frozen,true);assert.equal(before.submissions[plan.planHash].retired,true);
  const accepted=r.accept(result,now+2),after=r.snapshot();
  assert.equal(accepted.recorded,true);assert.equal(accepted.acceptedForFulfillment,false);assert.equal(accepted.reason,'FROZEN_SUBMITTED_PLAN_RESULT');
  assert.equal(after.frozen,true);assert.equal(after.records.sol.admissible,false);assert.equal(after.records.btc,undefined);
  assert.deepEqual(after.submissions[plan.planHash],before.submissions[plan.planHash]);
  assert.deepEqual(after.incidents[0].signed,result);assert.equal(after.incidents[0].planHash,plan.planHash);
  assert.equal(after.incidents[0].signed.payload.outputs.amount,'168750');
  assert.equal(after.history.filter(h=>h.type==='result'&&h.signed.payload.stage==='btc').length,1);
  assert.throws(()=>r.fulfillmentStatement(now+2),/FROZEN/);
});
test('late incident path validates signature, domain, policy, exact submitted parents, chain and outputs before mutation',()=>{
  const {f,r,result}=invalidatedPendingBtc(),before=r.snapshot();
  const mutations=[
    e=>e.payload.version=3,e=>e.payload.domain='wrong-domain',e=>e.payload.evidenceType='native-consensus-proof',
    e=>e.payload.intentHash='b'.repeat(64),e=>e.payload.policyVersion=3,e=>e.payload.observerKeyId='b'.repeat(64),
    e=>e.payload.stage='claim',e=>e.payload.planHash='b'.repeat(64),e=>e.payload.parents[1].resultDigest='b'.repeat(64),
    e=>e.payload.effect.chain='solana-local',e=>e.payload.effect.genesis='wrong-genesis',e=>e.payload.effect.txRef='invalid',e=>e.payload.effect.effectIndex=-1,
    e=>e.payload.outputs.recipient='wrong-recipient',e=>e.payload.outputs.amount='156250',e=>e.payload.outputs.fee='5001',
    e=>e.payload.observedAt=now-1,e=>e.payload.observedAt=now+3,e=>e.payload.finality='pending'
  ];
  for(const mutate of mutations){const changed=structuredClone(result);mutate(changed);changed.signature=sign(changed.payload,f.observer.privateKey);assert.throws(()=>r.accept(changed,now+2));assert.deepEqual(r.snapshot(),before);}
  const forged=structuredClone(result);forged.signature=sign(forged.payload,newIdentity().privateKey);
  assert.throws(()=>r.accept(forged,now+2),/INVALID_OBSERVER_SIGNATURE/);assert.deepEqual(r.snapshot(),before);
  assert.equal(r.accept(result,now+2).recorded,true);
});
test('retained late resource cannot be recorded twice, including an authenticated changed observation',()=>{
  const {f,r,result}=invalidatedPendingBtc();r.accept(result,now+2);const before=r.snapshot();
  assert.throws(()=>r.accept(result,now+2),/RESULT_RESOURCE_REPLAY/);
  const changed=structuredClone(result);changed.payload.observedAt=now+3;changed.signature=sign(changed.payload,f.observer.privateKey);
  assert.throws(()=>r.accept(changed,now+3),/RESULT_RESOURCE_REPLAY/);assert.deepEqual(r.snapshot(),before);
});
test('distinct late BTC effects remain separate incidents for the original submitted plan',()=>{
  const {f,r,plan,result}=invalidatedPendingBtc();r.accept(result,now+2);
  const extra=syntheticSemanticResult(f.intent,plan,f.observer.privateKey,now+3,{recipient:f.intent.recipients.btc,amount:plan.action.amount,fee:'101'});
  assert.equal(r.accept(extra,now+3).acceptedForFulfillment,false);
  const state=r.snapshot();assert.equal(state.incidents.length,2);assert.notEqual(state.incidents[0].resource,state.incidents[1].resource);
  assert.ok(state.incidents.every(i=>i.planHash===plan.planHash));assert.equal(state.records.btc,undefined);
  assert.deepEqual(state.incidents.map(i=>i.signed.payload.outputs.fee),['100','101']);
});
test('additional effect for an admitted stage freezes without replacing its fulfillment record',()=>{
  const f=fixture(),r=f.route();deliver(f,r,'lock');deliver(f,r,'sol','3000000');deliver(f,r,'btc');const before=r.snapshot();
  const plan=Object.values(before.submissions).find(s=>s.plan.stage==='btc').plan;
  const extra=syntheticSemanticResult(f.intent,plan,f.observer.privateKey,now+1,{recipient:f.intent.recipients.btc,amount:plan.action.amount,fee:'101'});
  const result=r.accept(extra,now+1);assert.equal(result.reason,'EXTRA_SUBMITTED_PLAN_EFFECT');
  assert.deepEqual(r.snapshot().records.btc,before.records.btc);assert.equal(r.snapshot().incidents.length,1);assert.throws(()=>r.fulfillmentStatement(now+1),/FROZEN/);
});
test('same-shaped redispatch has a new epoch; late old evidence cannot fulfill the replacement',()=>{
  const f=fixture(),r=f.route();deliver(f,r,'lock');const oldPlan=r.plan('sol',now);deliver(f,r,'sol','3000000');
  r.invalidate(syntheticInvalidation(f.intent,'sol',r.snapshot().records.sol.digest,f.observer.privateKey,now+1),now+1);
  const next=r.plan('sol',now+1);assert.deepEqual(next.action,oldPlan.action);assert.deepEqual(next.parents,oldPlan.parents);
  assert.equal(oldPlan.planVersion,3);assert.equal(oldPlan.planEpoch,0);assert.equal(next.planEpoch,1);assert.notEqual(next.planHash,oldPlan.planHash);
  r.markSubmitted('sol',next.planHash,now+1);
  const late=syntheticSemanticResult(f.intent,oldPlan,f.observer.privateKey,now+2,{recipient:f.intent.recipients.sol,amount:'3000000',fee:'100'});
  assert.equal(r.accept(late,now+2).reason,'RETIRED_SUBMITTED_PLAN_RESULT');const state=r.snapshot();
  assert.equal(state.records.sol.admissible,false);assert.equal(state.incidents[0].planHash,oldPlan.planHash);
  assert.equal(state.submissions[oldPlan.planHash].retired,true);assert.equal(state.submissions[next.planHash].retired,false);
  assert.throws(()=>r.plan('btc',now+2),/FROZEN/);
});
test('authentic late execution or post-claim arrival is retained without admission; grace can admit timely execution',()=>{
  for(const scenario of ['late-execution','late-arrival','claim-grace']){
    const f=fixture(),r=f.route();deliver(f,r,'lock');deliver(f,r,'sol','3000000');const plan=r.plan('btc',now);r.markSubmitted('btc',plan.planHash,now);
    const observedAt=scenario==='late-execution'?f.intent.executeBy+1:f.intent.executeBy;
    const receivedAt=scenario==='late-arrival'?f.intent.claimBy:f.intent.executeBy+1;
    const result=syntheticSemanticResult(f.intent,plan,f.observer.privateKey,observedAt,{recipient:f.intent.recipients.btc,amount:plan.action.amount,fee:'100'});
    const accepted=r.accept(result,receivedAt);assert.equal(accepted.recorded,true);
    if(scenario==='claim-grace'){assert.equal(accepted.acceptedForFulfillment,true);assert.equal(r.fulfillmentStatement(receivedAt).type,'LOCAL_CHECKED_STATEMENT_NOT_ZK');}
    else{assert.equal(accepted.acceptedForFulfillment,false);assert.equal(accepted.reason,scenario==='late-execution'?'EFFECT_AFTER_EXECUTION_WINDOW':'RESULT_AFTER_CLAIM_WINDOW');assert.equal(r.snapshot().incidents.length,1);assert.throws(()=>r.fulfillmentStatement(receivedAt),/FROZEN/);}
  }
});
test('returned archive and incident snapshots cannot alter original submission bindings or retained evidence',()=>{
  const {r,plan,result}=invalidatedPendingBtc();r.accept(result,now+2);const before=r.snapshot(),changed=r.snapshot();
  changed.submissions[plan.planHash].plan.action.amount='1';changed.submissions[plan.planHash].plan.parents[1].resultDigest='tampered';
  changed.submissions[plan.planHash].parentObservations[0].observedAt=0;changed.submissions[plan.planHash].retired=false;
  changed.submissions[plan.planHash].at=0;changed.incidents[0].signed.payload.outputs.amount='1';changed.planEpochs.btc=0;
  result.payload.outputs.amount='1';plan.parents[1].resultDigest='tampered';
  assert.deepEqual(r.snapshot(),before);assert.throws(()=>r.fulfillmentStatement(now+2),/FROZEN/);
});
