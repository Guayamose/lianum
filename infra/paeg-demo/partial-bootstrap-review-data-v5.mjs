/** Fixed server review DATA. Only the Original Native producer can consume
 * it and issue/persist the actual bootstrap approval. No key is opened here. */
import assert from 'node:assert/strict';
import {PUBLIC_OPERATOR_STATE_V4,PUBLIC_NATIVE_DIRECTORY_V4} from './public-operator-state-v4.mjs';
export const PARTIAL_BOOTSTRAP_REVIEW_FILE_V5='partial-bootstrap-review-v5.json';
export const PARTIAL_BOOTSTRAP_MAXIMUM_TOTAL_FEE_V5='30000000000000000';
function exact(value,keys){assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype);assert.deepEqual(Reflect.ownKeys(value).sort(),keys.slice().sort());for(const key of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));}
export function normalizePartialBootstrapReviewDataV5(input,fresh=false){
 assert.ok(arguments.length===1||arguments.length===2);assert.equal(typeof fresh,'boolean');
 exact(input,['operatorDirectory','nativeDirectory','checkpointSHA256','operatorConfigurationSHA256','approval']);
 assert.equal(input.operatorDirectory,PUBLIC_OPERATOR_STATE_V4);assert.equal(input.nativeDirectory,PUBLIC_NATIVE_DIRECTORY_V4);
 for(const key of ['checkpointSHA256','operatorConfigurationSHA256'])assert.match(input[key],/^[a-f0-9]{64}$/);
 exact(input.approval,['maximumTotalFeeAtomic','expiresAt']);assert.equal(input.approval.maximumTotalFeeAtomic,PARTIAL_BOOTSTRAP_MAXIMUM_TOTAL_FEE_V5);
 assert.ok(Number.isSafeInteger(input.approval.expiresAt)&&input.approval.expiresAt>0,'PAEG_PARTIAL_REVIEW_DEADLINE');
 if(fresh)assert.ok(input.approval.expiresAt>Date.now()&&input.approval.expiresAt<=Date.now()+3600000,'PAEG_PARTIAL_REVIEW_EXPIRED');
 return Object.freeze({...input,approval:Object.freeze({...input.approval})});
}
