/** M3 semantic relation model. No RPC, escrow execution, ZK proof or durable authority.
 * The owning client is allowed to know its graph. Results are synthetic observer
 * assertions: signatures authenticate their issuer, not their truth or finality.
 */
import { randomBytes } from 'node:crypto';
import { canonical, digest, sign, verify } from './privacy.mjs';
const DOMAIN = 'paeg:semantic-model:v2';
const STAGES = ['lock', 'sol', 'btc'];
const ACTIONS = [...STAGES, 'claim'];
const CHAINS = { lock: 'ethereum-local', sol: 'solana-local', btc: 'bitcoin-regtest' };
const copy = value => JSON.parse(canonical(value));
const check = (condition, reason) => { if (!condition) throw new Error(reason); };
function integer(value) { check(Number.isSafeInteger(value) && value >= 0, 'INVALID_TIME'); return value; }
function n(value) { check(typeof value === 'string' && /^(0|[1-9][0-9]{0,30})$/.test(value), 'INVALID_QUANTITY'); return BigInt(value); }
function exact(value, keys) { check(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value,k)), 'INVALID_FIELDS'); }
const floor = (a,b) => { check(b>0n,'ZERO_DENOMINATOR'); return a/b; };
const ceil = (a,b) => { check(b>0n,'ZERO_DENOMINATOR'); return (a+b-1n)/b; };
export const observerId = key => digest('PAEG/observer-policy-key/2', key);
export const semanticHash = intent => digest('PAEG/semantic-intent/2', intent);
export const effectId = effect => digest('PAEG/semantic-effect/2', effect);

export function semanticIntent(observerPublicKey, now = 1800000000000) {
  return { version:2, domain:DOMAIN, id:randomBytes(32).toString('hex'), owner:'fixture-owner', solver:'fixture-solver',
    authority:{ chain:'ethereum-local', genesis:'fixture-evm-genesis', contract:'fixture-escrow', observerKeyId:observerId(observerPublicKey), policyVersion:2 },
    recipients:{sol:'fixture-sol-recipient',btc:'fixture-btc-recipient'},
    networks:{lock:'fixture-evm-genesis',sol:'fixture-svm-genesis',btc:'fixture-regtest-genesis'},
    quote:{ version:1, inputAmount:'1000000', protocolFee:'25000', solMin:'2500000', solMax:'3500000', solPriceNumerator:'1',solPriceDenominator:'10',btcPriceNumerator:'4',btcPriceDenominator:'1',btcMin:'150000',solFeeCap:'5000',btcFeeCap:'5000',rounding:'ceil-sol-cost-floor-btc-output-solver-keeps-dust' },
    executeBy:now+60000,claimBy:now+90000,guarantee:'conditional-input-payment-with-partial-outputs' };
}

export function validateSemanticIntent(value) {
  exact(value,['version','domain','id','owner','solver','authority','recipients','networks','quote','executeBy','claimBy','guarantee']);
  check(value.version===2 && value.domain===DOMAIN,'UNSUPPORTED_SEMANTIC_DOMAIN');
  check(/^[0-9a-f]{64}$/.test(value.id),'INVALID_ID');
  exact(value.authority,['chain','genesis','contract','observerKeyId','policyVersion']);
  check(value.authority.chain==='ethereum-local' && value.authority.policyVersion===2,'UNSUPPORTED_AUTHORITY');
  exact(value.recipients,['sol','btc']);exact(value.networks,['lock','sol','btc']);
  for(const item of [value.owner,value.solver,value.authority.genesis,value.authority.contract,...Object.values(value.recipients),...Object.values(value.networks)])check(typeof item==='string'&&/^[a-zA-Z0-9:_-]{1,100}$/.test(item),'INVALID_IDENTIFIER');
  check(value.authority.genesis===value.networks.lock,'WRONG_AUTHORITY_GENESIS');
  exact(value.quote,['version','inputAmount','protocolFee','solMin','solMax','solPriceNumerator','solPriceDenominator','btcPriceNumerator','btcPriceDenominator','btcMin','solFeeCap','btcFeeCap','rounding']);
  const q=value.quote;check(q.version===1,'UNSUPPORTED_QUOTE_VERSION');
  for(const key of Object.keys(q).filter(k=>!['version','rounding'].includes(k)))n(q[key]);
  check(n(q.inputAmount)>n(q.protocolFee)&&n(q.solMin)>0n&&n(q.solMax)>=n(q.solMin)&&n(q.btcMin)>0n,'INVALID_QUOTE_RANGE');
  for(const key of ['solPriceNumerator','solPriceDenominator','btcPriceNumerator','btcPriceDenominator'])check(n(q[key])>0n,'INVALID_PRICE_RATIO');
  check(q.rounding==='ceil-sol-cost-floor-btc-output-solver-keeps-dust','UNSUPPORTED_ROUNDING');
  // Reject an unfundable mathematical quote before permitting even the model lock.
  const spendable=n(q.inputAmount)-n(q.protocolFee),minimumSolCost=ceil(n(q.solMin)*n(q.solPriceNumerator),n(q.solPriceDenominator));
  check(spendable>=minimumSolCost,'INFEASIBLE_QUOTE');
  const maximumBtc=floor((spendable-minimumSolCost)*n(q.btcPriceDenominator),n(q.btcPriceNumerator));
  n(maximumBtc.toString());check(maximumBtc>=n(q.btcMin),'INFEASIBLE_QUOTE');
  check(integer(value.claimBy)>integer(value.executeBy),'INVALID_WINDOWS');
  check(value.guarantee==='conditional-input-payment-with-partial-outputs','UNSUPPORTED_GUARANTEE');
  check(Buffer.byteLength(canonical(value))<8192,'INTENT_TOO_LARGE');return value;
}

function derive(intent, stage, records, planEpoch) {
  const q=intent.quote, parents=[];let action;
  const prior=key=>{const record=records.get(key);check(record?.admissible,'MISSING_AUTHENTICATED_PREDECESSOR');parents.push({stage:key,resultDigest:record.digest});return record.signed.payload.outputs;};
  if(stage==='lock') action={chain:CHAINS.lock,genesis:intent.networks.lock,contract:intent.authority.contract,owner:intent.owner,solver:intent.solver,amount:q.inputAmount,termsHash:semanticHash(intent),executeBy:intent.executeBy,claimBy:intent.claimBy};
  else if(stage==='sol') {
    const lock=prior('lock');const budget=n(lock.amount)-n(q.protocolFee),btcMinimumCost=ceil(n(q.btcMin)*n(q.btcPriceNumerator),n(q.btcPriceDenominator));
    check(budget>=btcMinimumCost,'INSUFFICIENT_RESIDUAL_BUDGET');
    const affordable=floor((budget-btcMinimumCost)*n(q.solPriceDenominator),n(q.solPriceNumerator));
    const max=affordable<n(q.solMax)?affordable:n(q.solMax);check(max>=n(q.solMin),'NO_ADMISSIBLE_SOL_OUTPUT');
    action={chain:CHAINS.sol,genesis:intent.networks.sol,recipient:intent.recipients.sol,min:q.solMin,max:max.toString(),maxFee:q.solFeeCap};
  } else if(stage==='btc') {
    const lock=prior('lock'),sol=prior('sol');
    const solCost=ceil(n(sol.amount)*n(q.solPriceNumerator),n(q.solPriceDenominator));
    const remaining=n(lock.amount)-n(q.protocolFee)-solCost;check(remaining>=0n,'NEGATIVE_RESIDUAL');
    const target=floor(remaining*n(q.btcPriceDenominator),n(q.btcPriceNumerator));n(target.toString());check(target>=n(q.btcMin),'BTC_BELOW_MINIMUM');
    action={chain:CHAINS.btc,genesis:intent.networks.btc,recipient:intent.recipients.btc,amount:target.toString(),maxFee:q.btcFeeCap,residualBudget:remaining.toString(),solCost:solCost.toString()};
  } else if(stage==='claim') {
    const lock=prior('lock');prior('sol');prior('btc');
    action={chain:CHAINS.lock,genesis:intent.networks.lock,contract:intent.authority.contract,escrowId:lock.escrowId,payee:intent.solver,amount:lock.amount,
      effects:['sol','btc'].map(key=>effectId(records.get(key).signed.payload.effect)),claimBy:intent.claimBy};
  } else throw new Error('UNKNOWN_STAGE');
  const body={version:2,planVersion:3,domain:DOMAIN,intentHash:semanticHash(intent),policyVersion:intent.authority.policyVersion,quoteVersion:q.version,stage,planEpoch,parents,action};
  return {...body,planHash:digest('PAEG/semantic-plan/3',body)};
}

export class SemanticRoute {
  #intent;#authorization;#observer;#records=new Map();#submitted=new Map();#archive=new Map();#incidents=[];#history=[];#views=new Map();#frozen=false;
  #epochs=new Map(ACTIONS.map(stage=>[stage,0]));
  constructor(intent, authorization, {userPublicKey,observerPublicKey}) {
    this.#intent=copy(validateSemanticIntent(copy(intent)));check(verify(this.#intent,authorization,userPublicKey),'INVALID_OWNER_AUTHORIZATION');
    check(observerId(observerPublicKey)===intent.authority.observerKeyId,'WRONG_OBSERVER_POLICY');
    this.#authorization={signedIntent:this.#intent,signature:authorization,userPublicKey,provenance:'locally-pinned-owner-key'};this.#observer=observerPublicKey;
  }
  plan(stage,now) {
    check(!this.#frozen,'SEMANTIC_ROUTE_FROZEN');integer(now);
    check(now<(stage==='claim'?this.#intent.claimBy:this.#intent.executeBy),'STAGE_EXPIRED');return copy(derive(this.#intent,stage,this.#records,this.#epochs.get(stage)));
  }
  projection(stage,now) {
    check(stage==='sol'||stage==='btc','NO_EXECUTOR_PROJECTION');const plan=this.plan(stage,now);
    if(!this.#views.has(plan.planHash))this.#views.set(plan.planHash,randomBytes(32).toString('hex'));
    const action={...plan.action};delete action.residualBudget;delete action.solCost;
    return {version:2,dispatchToken:this.#views.get(plan.planHash),action,executeBy:this.#intent.executeBy};
  }
  markSubmitted(stage,planHash,now) {
    const current=this.plan(stage,now);check(current.planHash===planHash,'STALE_PLAN');check(!this.#submitted.has(stage),'ALREADY_SUBMITTED');
    const submission={plan:copy(current),at:now,retired:false,parentObservations:current.parents.map(parent=>({...parent,observedAt:this.#records.get(parent.stage).signed.payload.observedAt}))};
    check(!this.#archive.has(planHash),'SUBMITTED_PLAN_REUSE');
    this.#submitted.set(stage,submission);this.#archive.set(planHash,submission);
    this.#history.push({type:'model-submission',stage,planHash,at:now,plan:copy(current)});
  }
  accept(signed,now) {
    const e=copy(signed);exact(e,['payload','signature']);check(verify(e.payload,e.signature,this.#observer),'INVALID_OBSERVER_SIGNATURE');
    const p=e.payload;exact(p,['version','domain','evidenceType','intentHash','policyVersion','observerKeyId','stage','planHash','parents','effect','outputs','observedAt','finality']);
    check(p.version===2&&p.domain===DOMAIN&&p.evidenceType==='synthetic-observer-assertion','UNSUPPORTED_RESULT_EVIDENCE');
    check(p.intentHash===semanticHash(this.#intent)&&p.policyVersion===this.#intent.authority.policyVersion&&p.observerKeyId===this.#intent.authority.observerKeyId,'RESULT_POLICY_BINDING');
    check(STAGES.includes(p.stage),'UNKNOWN_STAGE');integer(now);integer(p.observedAt);check(p.observedAt<=now,'RESULT_FROM_FUTURE');
    check(p.finality==='synthetic-final','NOT_ACCEPTED_FINALITY');exact(p.effect,['chain','genesis','txRef','effectIndex']);
    check(p.effect.chain===CHAINS[p.stage]&&p.effect.genesis===this.#intent.networks[p.stage],'WRONG_CHAIN_IDENTITY');
    check(typeof p.effect.txRef==='string'&&/^[0-9a-f]{64}$/.test(p.effect.txRef),'INVALID_TRANSACTION_REFERENCE');integer(p.effect.effectIndex);
    // Authenticate against the exact submitted version before considering current
    // predecessor admissibility. A native effect cannot be undone by re-derivation.
    const submitted=this.#archive.get(p.planHash);
    check(submitted, this.#submitted.has(p.stage)?'STALE_PREDECESSOR_BINDING':'UNRECORDED_DISPATCH');
    const original=submitted.plan;
    check(p.stage===original.stage&&canonical(p.parents)===canonical(original.parents),'STALE_PREDECESSOR_BINDING');
    check(p.observedAt>=submitted.at&&submitted.parentObservations.every(parent=>p.observedAt>=parent.observedAt),'RESULT_BEFORE_PREDECESSOR_OR_DISPATCH');
    const out=p.outputs;
    if(p.stage==='lock') {
      exact(out,['escrowId','owner','solver','amount','termsHash','status']);
      check(/^[0-9a-f]{64}$/.test(out.escrowId)&&out.owner===original.action.owner&&out.solver===original.action.solver&&out.amount===original.action.amount&&out.termsHash===original.action.termsHash&&out.status==='OPEN','WRONG_LOCK_RESULT');
    } else {
      exact(out,['recipient','amount','fee']);check(out.recipient===original.action.recipient&&n(out.fee)<=n(original.action.maxFee),'WRONG_NATIVE_EFFECT');
      if(p.stage==='sol')check(n(out.amount)>=n(original.action.min)&&n(out.amount)<=n(original.action.max),'SOL_OUTSIDE_AUTHORIZED_RANGE');
      else { n(out.amount);check(out.amount===original.action.amount,'BTC_RESIDUAL_FORMULA_MISMATCH'); }
    }
    const resultDigest=digest('PAEG/semantic-result/2',e),resource=effectId(p.effect);
    check(!this.#history.some(h=>h.type==='result'&&effectId(h.signed.payload.effect)===resource),'RESULT_RESOURCE_REPLAY');
    let reason;
    if(this.#frozen)reason='FROZEN_SUBMITTED_PLAN_RESULT';
    else if(submitted.retired||this.#submitted.get(p.stage)!==submitted)reason='RETIRED_SUBMITTED_PLAN_RESULT';
    else if(!original.parents.every(parent=>{const record=this.#records.get(parent.stage);return record?.admissible&&record.digest===parent.resultDigest;}))reason='INADMISSIBLE_SUBMITTED_PARENT';
    else if(this.#records.get(p.stage)?.admissible)reason='EXTRA_SUBMITTED_PLAN_EFFECT';
    else if(p.observedAt>this.#intent.executeBy)reason='EFFECT_AFTER_EXECUTION_WINDOW';
    else if(now>=this.#intent.claimBy)reason='RESULT_AFTER_CLAIM_WINDOW';
    this.#history.push({type:'result',signed:e,digest:resultDigest,resource,planHash:original.planHash,admitted:!reason});
    if(reason){
      this.#incidents.push({signed:e,digest:resultDigest,resource,planHash:original.planHash,reason,receivedAt:now});
      this.#frozen=true;return {acceptedForFulfillment:false,recorded:true,digest:resultDigest,reason};
    }
    this.#records.set(p.stage,{signed:e,digest:resultDigest,admissible:true});return {acceptedForFulfillment:true,recorded:true,digest:resultDigest};
  }
  invalidate(signed,now) {
    const e=copy(signed);exact(e,['payload','signature']);check(verify(e.payload,e.signature,this.#observer),'INVALID_OBSERVER_SIGNATURE');const p=e.payload;
    exact(p,['version','domain','intentHash','kind','stage','resultDigest','reason','issuedAt']);
    check(p.version===2&&p.domain===DOMAIN&&p.intentHash===semanticHash(this.#intent)&&p.kind==='invalidate-result','INVALID_INVALIDATION_DOMAIN');
    integer(p.issuedAt);check(p.issuedAt<=integer(now),'FUTURE_INVALIDATION');
    check(['CHAIN_REORG','OBSERVER_CORRECTION'].includes(p.reason),'INVALID_INVALIDATION_REASON');
    const record=this.#records.get(p.stage);check(record?.admissible&&record.digest===p.resultDigest,'UNKNOWN_CURRENT_RESULT');
    const successors=ACTIONS.slice(ACTIONS.indexOf(p.stage)+1);
    if(successors.some(s=>this.#submitted.has(s)||this.#records.get(s)?.admissible))this.#frozen=true;
    const affected=[p.stage,...successors];
    for(const key of affected)integer(this.#epochs.get(key)+1);
    for(const key of affected){
      this.#epochs.set(key,this.#epochs.get(key)+1);
      const submission=this.#submitted.get(key);if(submission)submission.retired=true;
      this.#submitted.delete(key);const r=this.#records.get(key);if(r)r.admissible=false;
    }
    this.#views.clear();
    this.#history.push({type:'invalidation',signed:e,at:now});return {frozen:this.#frozen,recomputeAllowed:!this.#frozen};
  }
  fulfillmentStatement(now) {
    const claim=this.plan('claim',now);return copy({type:'LOCAL_CHECKED_STATEMENT_NOT_ZK',authority:'no-chain-authority-in-this-model',claim,
      assumptions:['honest pinned synthetic observer','owner-private model state','no consensus verification','no private canonical spent-set implementation'],authorization:this.#authorization});
  }
  snapshot(){return copy({intent:this.#intent,authorization:this.#authorization,records:Object.fromEntries(this.#records),submissions:Object.fromEntries(this.#archive),planEpochs:Object.fromEntries(this.#epochs),incidents:this.#incidents,history:this.#history,frozen:this.#frozen});}
}

export function syntheticSemanticResult(intent,plan,observerPrivateKey,now,outputs) {
  const payload={version:2,domain:DOMAIN,evidenceType:'synthetic-observer-assertion',intentHash:semanticHash(intent),policyVersion:intent.authority.policyVersion,observerKeyId:intent.authority.observerKeyId,
    stage:plan.stage,planHash:plan.planHash,parents:plan.parents,effect:{chain:CHAINS[plan.stage],genesis:intent.networks[plan.stage],txRef:randomBytes(32).toString('hex'),effectIndex:0},outputs,observedAt:now,finality:'synthetic-final'};
  return {payload,signature:sign(payload,observerPrivateKey)};
}
export function syntheticInvalidation(intent,stage,resultDigest,observerPrivateKey,now,reason='CHAIN_REORG') {
  const payload={version:2,domain:DOMAIN,intentHash:semanticHash(intent),kind:'invalidate-result',stage,resultDigest,reason,issuedAt:now};return {payload,signature:sign(payload,observerPrivateKey)};
}
