import {writeFile} from 'node:fs/promises';
import {newIdentity,sign} from '../../../packages/engine/src/crypto/privacy.mjs';
import {SemanticRoute,semanticIntent,semanticHash,syntheticSemanticResult,syntheticInvalidation} from '../../../packages/engine/src/core/semantic.mjs';
const now=1800000000000,owner=newIdentity(),observer=newIdentity(),intent=semanticIntent(observer.publicKey,now),authorization=sign(intent,owner.privateKey);
function route(){return new SemanticRoute(intent,authorization,{userPublicKey:owner.publicKey,observerPublicKey:observer.publicKey});}
function deliver(r,stage,amount){const plan=r.plan(stage,now);r.markSubmitted(stage,plan.planHash,now);const outputs=stage==='lock'?{escrowId:'a'.repeat(64),owner:intent.owner,solver:intent.solver,amount:intent.quote.inputAmount,termsHash:semanticHash(intent),status:'OPEN'}:{recipient:intent.recipients[stage],amount:amount??plan.action.amount,fee:'100'};const result=syntheticSemanticResult(intent,plan,observer.privateKey,now,outputs);r.accept(result,now);return result;}
const a=route();deliver(a,'lock');deliver(a,'sol','3000000');const priorPlan=a.plan('btc',now),before=a.snapshot();
a.invalidate(syntheticInvalidation(intent,'sol',before.records.sol.digest,observer.privateKey,now),now);deliver(a,'sol','3500000');const nextPlan=a.plan('btc',now);
let oldPlanRejected=false;try{a.markSubmitted('btc',priorPlan.planHash,now);}catch{oldPlanRejected=true;}
deliver(a,'btc');const statement=a.fulfillmentStatement(now);const claim=a.plan('claim',now);a.markSubmitted('claim',claim.planHash,now);
a.invalidate(syntheticInvalidation(intent,'btc',a.snapshot().records.btc.digest,observer.privateKey,now),now);
const late=route();deliver(late,'lock');deliver(late,'sol','3000000');const submitted=late.plan('btc',now);late.markSubmitted('btc',submitted.planHash,now);
const lateResult=syntheticSemanticResult(intent,submitted,observer.privateKey,now,{recipient:intent.recipients.btc,amount:submitted.action.amount,fee:'100'});
late.invalidate(syntheticInvalidation(intent,'sol',late.snapshot().records.sol.digest,observer.privateKey,now),now);
const lateOutcome=late.accept(lateResult,now);
const report={version:3,planVersion:3,classification:'SEMANTIC_MODEL_ONLY_NO_ZK_NO_NATIVE_EXECUTION',command:'node scripts/semantic-demo.mjs',generatedAt:new Date().toISOString(),
  intent,authorization:{signature:authorization,userPublicKey:owner.publicKey},observerPublicKey:observer.publicKey,
  changes:{firstSolAmount:'3000000',firstBtcAmount:priorPlan.action.amount,revisedSolAmount:'3500000',revisedBtcAmount:nextPlan.action.amount,oldPlanRejected},
  statementBeforeInvalidation:statement,afterClaimSubmissionInvalidation:a.snapshot(),lateResultAfterParentInvalidation:{outcome:lateOutcome,snapshot:late.snapshot()},
  scope:['owner-private diagnostic, not executor transport','signatures are synthetic trusted assertions','no cross-chain clock or consensus verification','claim submission risk is modeled, no native claim was sent']};
await writeFile(new URL('../evidence/m3-semantic-model.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({classification:report.classification,...report.changes,frozen:a.snapshot().frozen,lateOutcome}));
