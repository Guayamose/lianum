/** Mechanical comparison under the actual Sup8/AEAD readers. None of these
 * DATA creates a provider, dispatch grant, proof slot or current observation. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalPagedProviderDataV3} from './paged-native-provider-state-v3.mjs';
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
 const oldContexts=baseline.sourceContexts??[],contexts=current.sourceContexts??[];assert.ok(Array.isArray(oldContexts)&&Array.isArray(contexts)&&contexts.length>=oldContexts.length,'PAGED_EMPTY_PROVIDER_HISTORY_REWIND');assert.deepEqual(contexts.slice(0,oldContexts.length),oldContexts,'PAGED_EMPTY_PROVIDER_HISTORY_REBOUND');
 const oldPayouts=baseline.executorPayoutsV5??[],payouts=current.executorPayoutsV5??[];assert.ok(Array.isArray(oldPayouts)&&Array.isArray(payouts)&&payouts.length>=oldPayouts.length,'PAGED_EXECUTOR_PAYOUT_CUSTODY_REWIND');
 for(const [index,before]of oldPayouts.entries()){const after=payouts[index];assert.deepEqual(after.certificate,before.certificate,'PAGED_EXECUTOR_PAYOUT_CUSTODY_REBOUND');assert.equal(createHash('sha256').update(canonicalPagedProviderDataV3(after.key)).digest('hex'),before.keySHA256,'PAGED_EXECUTOR_PAYOUT_KEY_REBOUND');assert.ok(Array.isArray(after.requests)&&after.requests.length>=before.requests.length);assert.deepEqual(after.requests.slice(0,before.requests.length),before.requests,'PAGED_EXECUTOR_PAYOUT_REQUEST_REWIND');if(before.invoice!==null)assert.deepEqual(after.invoice,before.invoice,'PAGED_EXECUTOR_PAYOUT_INVOICE_REBOUND');}
 return current;
}
