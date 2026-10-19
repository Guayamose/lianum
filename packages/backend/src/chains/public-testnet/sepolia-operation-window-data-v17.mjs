/** Explicit finite testnet operating window, signed inside epoch limits.
 * It extends time only: monetary ceilings and cumulative reservations remain
 * unchanged. Legacy epochs without this field retain the nine-hour bound. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {types} from 'node:util';

export const OPERATION_WINDOW_V17='LIANUM_SEPOLIA_FINITE_OPERATION_WINDOW_V17';
export const MAX_OPERATION_WINDOW_MS_V17=45*24*3600000;
const fields=['maximumFeePerTransactionAtomic','maximumTotalFeeAtomic','maximumValuePerTransactionAtomic','maximumTotalValueAtomic'];
export function operationSpendingPolicySHA256V17(policy){
 return createHash('sha256').update(JSON.stringify(Object.fromEntries(['profile','keysetId','account',...fields].map(k=>[k,policy[k]])))).digest('hex');
}
export function normalizeOperationWindowDataV17(raw){
 assert.ok(raw&&typeof raw==='object'&&!types.isProxy(raw)&&Object.getPrototypeOf(raw)===Object.prototype,'OPERATION_WINDOW_OBJECT');
 const keys=['profile','authorizedAt','expiresAt','spendingPolicySHA256'],descriptors=Object.getOwnPropertyDescriptors(raw);
 assert.deepEqual(Reflect.ownKeys(descriptors).sort(),keys.slice().sort(),'OPERATION_WINDOW_FIELDS');
 for(const k of keys)assert.ok(Object.hasOwn(descriptors[k],'value'),'OPERATION_WINDOW_GETTER');
 assert.equal(raw.profile,OPERATION_WINDOW_V17,'OPERATION_WINDOW_PROFILE');
 assert.ok(Number.isSafeInteger(raw.authorizedAt)&&raw.authorizedAt>0&&Number.isSafeInteger(raw.expiresAt)&&raw.expiresAt>raw.authorizedAt&&raw.expiresAt<=raw.authorizedAt+MAX_OPERATION_WINDOW_MS_V17,'OPERATION_WINDOW_PERIOD');
 assert.match(raw.spendingPolicySHA256,/^[0-9a-f]{64}$/,'OPERATION_WINDOW_SPENDING_BINDING');
 return Object.freeze(Object.fromEntries(keys.map(k=>[k,raw[k]])));
}
export function assertOperationWindowPolicyDataV17(raw,policy,issuedAt){
 const window=normalizeOperationWindowDataV17(raw);
 assert.ok(Number.isSafeInteger(issuedAt)&&window.authorizedAt<=issuedAt&&issuedAt<window.expiresAt,'OPERATION_WINDOW_AUTHORIZATION_TIME');
 assert.equal(policy.expiresAt,window.expiresAt,'OPERATION_WINDOW_POLICY_DEADLINE');
 assert.equal(operationSpendingPolicySHA256V17(policy),window.spendingPolicySHA256,'OPERATION_WINDOW_SPENDING_CHANGED');
 return window;
}
export function operationSourceDeadlineDataV17(history,now){
 const policy=history.effectivePolicy,window=history.limits?.operationWindowV17;
 if(!window)return Math.min(now+9*3600000,policy.expiresAt-30*60000);
 const epoch=history.history.at(-1)?.epoch;
 assert.ok(epoch&&epoch.epochId===history.epochId,'OPERATION_WINDOW_ORIGINAL_HISTORY');
 assertOperationWindowPolicyDataV17(window,policy,epoch.issuedAt);
 assert.ok(now<policy.expiresAt-30*60000,'OPERATION_WINDOW_CLOSED');
 return policy.expiresAt-30*60000;
}
