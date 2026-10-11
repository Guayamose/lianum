import {validatePreparedGraphDependencies} from './prepared-graph-dependencies-v1.mjs';
/** Project original reviewed custody terms into ONE owner-only graph review.
 * Called behind the keeper's private ownership map, never a dispatch authority.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cloneInput,frozenInput} from './readiness-inputs.mjs';
import {canonicalOwnerGraphTerms,validateOwnerGraphStructure} from '@lianum/mobile-protocol/wallet/owner-graph-review-v1';
export function buildOwnerNativeGraphRoute({binding,packets,selected,reviewProvider,wrapped,flat=false}){
 assert.ok(Array.isArray(selected)&&selected.length>0&&selected.length<=4,'OWNER_GRAPH_ORIGINAL_PROVIDERS');
 assert.equal(typeof reviewProvider,'function');assert.equal(typeof wrapped,'boolean');assert.equal(packets.local.length,4);assert.equal(packets.dependency.length,4);
 const {activeSlots:active,edges}=validatePreparedGraphDependencies(packets);
 assert.deepEqual(selected.map(item=>item.slot),active,'OWNER_GRAPH_ALL_ACTIVE_LEGS_REQUIRED');
 const legs=[];
 for(const chosen of selected){
  const slot=chosen.slot,local=packets.local[slot].local.value,dependency=packets.dependency[slot].dependency.value;
  assert.equal(local.slot,String(slot));assert.equal(dependency.targetSlot,String(slot));
  const review=cloneInput(reviewProvider(chosen));
  assert.equal(review.settleBefore,binding.settleBefore,'OWNER_GRAPH_ORIGINAL_CUTOFF');
  assert.equal(review.payoutCommitment,local.payoutCommitment,'OWNER_GRAPH_ORIGINAL_PAYOUT');
  if(review.routeProfile!=='REGISTERED_LOCAL_EVM_VAULT_V1')assert.equal(review.deliveryRiskCommitment,packets.local[slot].action.deliveryRiskCommitment,'OWNER_GRAPH_ORIGINAL_RISK');
  // A later changed custody quote cannot replace the original prepared offer.
  assert.deepEqual(review,chosen.review,'OWNER_GRAPH_ORIGINAL_ROUTE_CHANGED');
  legs.push({slot,route:review,localCommitment:local.localCommitment,dependencyCommitment:packets.dependency[slot].dependency.leaf});
 }
 const result={graph:{version:1,profile:'OWNER_PRIVATE_EXECUTION_GRAPH_V1',legs,edges,graphTermsSHA256:'1'.repeat(64)},
  envelope:binding.envelope,fundingNotBefore:packets.reservation.funding.value.fundingNotBefore,
  fundingValidUntil:packets.reservation.funding.value.fundingValidUntil,
  executionUntil:legs.map(x=>BigInt(x.route.executionUntil)).reduce((a,b)=>a<b?a:b).toString(),settleBefore:binding.settleBefore};
 validateOwnerGraphStructure(result,wrapped,flat);result.graph.graphTermsSHA256=createHash('sha256').update(canonicalOwnerGraphTerms(result,wrapped,flat)).digest('hex');return frozenInput(result);
}
