/** Fixed host-internal account roles. These bindings are never accepted from
 * an HTTP/IPC request; the cohort runtime resolves them from its nine local
 * synthetic accounts. The legacy five-account profile is unchanged. */
import assert from 'node:assert/strict';
import {PRIVATE_COHORT_PROFILE} from '../../cohorts/private-cohort-runtime.mjs';
export function privateWalletAccountBindings(shared){
 const a=shared.runtime.accounts;
 if(!shared.accountBindings)return Object.freeze({deposit:a[0],ownerWithdrawal:a[0],relayer:a[2],payouts:Object.freeze({sol:a[3],btc:a[4]}),authorities:Object.freeze({sol:a[2],btc:a[1]})});
 const b=shared.accountBindings;
 assert.deepEqual(Object.keys(b).sort(),['profile','ownerIndex','deposit','ownerWithdrawal','relayer','payouts','authorities'].sort(),'PC24_ACCOUNT_FIELDS');
 assert.equal(b.profile,PRIVATE_COHORT_PROFILE,'PC24_ACCOUNT_PROFILE');
 assert.ok(b.ownerIndex===0||b.ownerIndex===1,'PC24_ACCOUNT_OWNER');
 assert.equal(a.length,9,'PC24_ACCOUNT_COUNT');
 const lower=value=>{assert.match(value,/^0x[0-9a-f]{40}$/i,'PC24_ACCOUNT_ADDRESS');return value.toLowerCase();};
 const same=(value,index)=>assert.equal(lower(value),lower(a[index]),'PC24_FIXED_ACCOUNT_BINDING');
 same(b.deposit,b.ownerIndex);same(b.ownerWithdrawal,b.ownerIndex);same(b.relayer,6);
 assert.deepEqual(Object.keys(b.payouts).sort(),['btc','sol']);assert.deepEqual(Object.keys(b.authorities).sort(),['btc','sol']);
 same(b.payouts.sol,2+2*b.ownerIndex);same(b.payouts.btc,3+2*b.ownerIndex);same(b.authorities.sol,7);same(b.authorities.btc,8);
 assert.equal(new Set(a.map(lower)).size,9,'PC24_DISTINCT_ACCOUNTS');
 return Object.freeze({deposit:b.deposit,ownerWithdrawal:b.ownerWithdrawal,relayer:b.relayer,payouts:Object.freeze({...b.payouts}),authorities:Object.freeze({...b.authorities})});
}
