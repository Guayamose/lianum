import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import * as XP from '../src/device-paged-executor-payout-v5.mjs';
import * as Any from '../src/device-paged-provider-quote-any-v5.mjs';
import * as A from '../src/device-paged-automation-v5.mjs';
import {freshKey} from '@lianum/engine/notes/private-note-encoding';
import {devicePagedEconomicProviderV3} from '../src/device-paged-economic-provider-v3.mjs';
const h=v=>createHash('sha256').update('payoutV5 protocol '+v).digest('hex');
test('ordered 256-payout plan folds complete terms inside bounded SHA frames and rejects alias/getter arrays',()=>{
 const key=freshKey(),provider=devicePagedEconomicProviderV3('04'+key.x.toString('hex')+key.y.toString('hex')),raw={profile:XP.DEVICE_PAGED_EXECUTOR_PAYOUT_PLAN_V5,descriptorSHA256:h('descriptor'),providerIdentity:h('provider'),providerPublicKey:provider.publicKey,graphId:'paged-plan-256-payouts',rootId:h('root'),revision:1,authorizationRoot:h('authorization'),beneficiary:provider.address,quoteRoot:h('quotes'),collectBy:2000000000000,maximumTotalFeeAtomic:'256000',payouts:Array.from({length:256},(_,i)=>({id:'payout'+i,ordinal:String(i),commitment:h('cm'+i),nullifier:h('nf'+i),amountAtomic:'100',certificateSHA256:h('cert'+i),maximumFeeAtomic:'1000'}))};
 assert.ok(JSON.stringify(raw).length>8192);const first=XP.devicePagedExecutorPayoutPlanHashV5(raw);assert.match(first,/^[0-9a-f]{64}$/);assert.equal(XP.devicePagedExecutorPayoutPlanHashV5(structuredClone(raw)),first);
 for(const field of ['amountAtomic','certificateSHA256','maximumFeeAtomic']){const changed=structuredClone(raw);changed.payouts[255][field]=field==='amountAtomic'?'101':field==='maximumFeeAtomic'?'1001':h('changed');assert.notEqual(XP.devicePagedExecutorPayoutPlanHashV5(changed),first);}
 const alias=structuredClone(raw);alias.payouts[255].nullifier=alias.payouts[0].nullifier;assert.throws(()=>XP.normalizeDevicePagedExecutorPayoutPlanV5(alias));
 const sparse=structuredClone(raw);delete sparse.payouts[10];assert.throws(()=>XP.normalizeDevicePagedExecutorPayoutPlanV5(sparse));
 let calls=0;const getter=structuredClone(raw);Object.defineProperty(getter.payouts,'10',{enumerable:true,get(){calls++;return raw.payouts[10];}});assert.throws(()=>XP.normalizeDevicePagedExecutorPayoutPlanV5(getter));assert.equal(calls,0);
 for(const normalize of [Any.normalizeDevicePagedProviderQuoteTermsAnyV5,A.normalizeDevicePagedAutomationTermsAnyV5]){const value={};Object.defineProperty(value,'profile',{enumerable:true,get(){calls++;return 'fake';}});assert.throws(()=>normalize(value));assert.equal(calls,0);}
});
