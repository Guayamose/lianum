/** Mechanical comparison under the actual Sup8/AEAD readers. None of these
 * DATA creates a provider, dispatch grant, proof slot or current observation. */
import assert from 'node:assert/strict';
const stages=Object.freeze({KEY_PENDING:0,SIGNED:1,MINED:2});
export function assertPagedPublicDefiProviderPrefixDataV8(baseline,current,checkpoint){
 assert.ok(baseline&&Number.isSafeInteger(baseline.revision)&&baseline.revision===checkpoint.revision&&baseline.dataSHA256===checkpoint.dataSHA256,'PAGED_DEFI_ACTIVE_BASELINE_CHECKPOINT');
 for(const key of ['preparations','defiDeliveries']){assert.ok(Array.isArray(baseline[key])&&Array.isArray(current[key])&&current[key].length>=baseline[key].length,'PAGED_DEFI_ACTIVE_PREFIX_MISSING');for(let i=0;i<baseline[key].length;i++)assert.deepEqual(current[key][i],baseline[key][i],'PAGED_DEFI_ACTIVE_PREPARATION_CHANGED');}
 assert.ok(Array.isArray(baseline.deliveries)&&Array.isArray(current.deliveries)&&current.deliveries.length>=baseline.deliveries.length,'PAGED_DEFI_ACTIVE_DELIVERY_MISSING');
 for(let i=0;i<baseline.deliveries.length;i++){
  const before=baseline.deliveries[i],after=current.deliveries[i];assert.ok(Object.hasOwn(stages,before.stage)&&Object.hasOwn(stages,after.stage)&&stages[after.stage]>=stages[before.stage],'PAGED_DEFI_ACTIVE_DELIVERY_REWIND');
  const immutable=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['stage','signed','dispatch','dispatchSignature','effect'].includes(key)));assert.deepEqual(immutable(after),immutable(before),'PAGED_DEFI_ACTIVE_DELIVERY_REBOUND');
  if(before.stage==='KEY_PENDING')assert.equal(before.signed,null);else for(const key of ['signed','dispatch','dispatchSignature','effect'])assert.deepEqual(after[key],before[key],'PAGED_DEFI_ACTIVE_SIGNED_DELIVERY_CHANGED');
 }
 return current;
}
