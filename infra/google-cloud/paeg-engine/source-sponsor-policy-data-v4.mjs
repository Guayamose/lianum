/** Reviewable testnet policy DATA. Native's ORIGINAL owner validates and issues
 * the lane; this helper never authorizes a transaction or renews a journal. */
import assert from 'node:assert/strict';

export const PUBLIC_SOURCE_MINIMUM_ATOMIC_V4='1000000000000';
export const PUBLIC_SOURCE_DEMO_FUNDING_ATOMIC_V4='1000000000000000';

/** Call only for NEW configuration, after the real Native preflight. Reopen
 * reads the exact stored policy, including its original expiry and counters. */
export function buildNewSourceSponsorPolicyDataV4(context,now){
 assert.equal(arguments.length,2);
 assert.ok(Number.isSafeInteger(now)&&now>0,'SOURCE_SPONSOR_EPOCH');
 assert.ok(Number.isSafeInteger(now+9*60*60*1000),'SOURCE_SPONSOR_EPOCH');
 assert.ok(context&&typeof context.keysetId==='string'&&/^[0-9a-f]{64}$/.test(context.keysetId),'SOURCE_SPONSOR_KEYSET_DATA');
 assert.ok(Array.isArray(context.accounts),'SOURCE_SPONSOR_ACCOUNT_DATA');
 const accounts=context.accounts.filter(account=>account.networkId==='ethereum-sepolia');
 assert.equal(accounts.length,1,'SOURCE_SPONSOR_ACCOUNT_DATA');
 const account=accounts[0].address;
 assert.ok(typeof account==='string'&&/^0x[0-9a-fA-F]{40}$/.test(account),'SOURCE_SPONSOR_ACCOUNT_DATA');
 return Object.freeze({profile:'ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4',
  keysetId:context.keysetId,account,
  maximumFeePerTransactionAtomic:'500000000000000',
  maximumTotalFeeAtomic:'5000000000000000',
  maximumValuePerTransactionAtomic:PUBLIC_SOURCE_DEMO_FUNDING_ATOMIC_V4,
  maximumTotalValueAtomic:'2000000000000000',expiresAt:now+9*60*60*1000});
}
