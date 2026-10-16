/** Public DATA tests only. No owner, permission, signing key or chain action. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as A from '../src/device-paged-agent-v4.mjs';
import * as L from '../src/device-paged-agent-read-lifetime-v5.mjs';
import * as V4 from '../src/device-paged-automation-v4.mjs';
import * as V5 from '../src/device-paged-automation-v5.mjs';
import {devicePagedEconomicProviderV3} from '../src/device-paged-economic-provider-v3.mjs';
const h=v=>createHash('sha256').update(v).digest('hex');
const point='0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
function fixture(){
 const now=Date.now(),base={profile:V4.DEVICE_PAGED_AUTOMATION_V4,descriptorSHA256:h('descriptor'),graphId:'paged-graph-'+'a'.repeat(32),rootId:h('root'),revision:1,authorizationRoot:h('authorization'),reserveNullifier:h('reserve'),budget:'100',nodes:'1',settleBefore:String(Math.floor(now/1000)+600),quoteRoot:h('quote'),maxCommands:16,expiresAt:now+900000},provider=devicePagedEconomicProviderV3(point);
 const payouts={profile:'DEVICE_PAGED_EXECUTOR_PAYOUT_PLAN_V5',descriptorSHA256:base.descriptorSHA256,providerIdentity:h('provider'),providerPublicKey:point,graphId:base.graphId,rootId:base.rootId,revision:base.revision,authorizationRoot:base.authorizationRoot,beneficiary:provider.address,quoteRoot:base.quoteRoot,collectBy:now+660000,maximumTotalFeeAtomic:'5',payouts:[{id:'payment',ordinal:'0',commitment:h('commitment'),nullifier:h('nullifier'),amountAtomic:'10',certificateSHA256:h('certificate'),maximumFeeAtomic:'5'}]};
 const terms=V5.normalizeDevicePagedAutomationTermsV5({...base,profile:V5.DEVICE_PAGED_AUTOMATION_V5,executorPayouts:payouts});
 const grant={profile:L.DEVICE_PAGED_AGENT_READ_GRANT_V5,descriptorSHA256:base.descriptorSHA256,terms,readerPublicKey:point,maximumReads:7,readUntilMs:now+1000000};grant.grantId=L.devicePagedAgentReadGrantIdV5(grant.descriptorSHA256,terms,point,grant.maximumReads,grant.readUntilMs);
 const progress={profile:A.DEVICE_PAGED_AGENT_PROGRESS_V4,descriptorSHA256:base.descriptorSHA256,graphId:base.graphId,rootId:base.rootId,revision:base.revision,authorizationRoot:base.authorizationRoot,reserveNullifier:base.reserveNullifier,phase:'FULFILLED',pending:false,automation:{terms,commandsUsed:5,revoked:false},execution:{completed:'1',total:'1',currentNodeId:null},observed:{blockHash:'0x'+h('block'),blockNumber:'1',timestamp:String(Math.floor(now/1000)),issuedAt:now,expiresAt:now+15000},current:true};
 return{base,terms,grant,progress};
}
test('V5 read grant and progress preserve the complete payout authorization while V4 remains strict',()=>{
 const {base,terms,grant,progress}=fixture(),g=L.normalizeDevicePagedAgentReadGrantAnyV5(grant),p=A.normalizeDevicePagedAgentProgressAnyV5(progress);
 assert.deepEqual(g.terms,terms);assert.deepEqual(p.automation.terms.executorPayouts,terms.executorPayouts);assert.equal(p.automation.terms.profile,V5.DEVICE_PAGED_AUTOMATION_V5);assert.ok(Object.isFrozen(p.automation.terms.executorPayouts.payouts[0]));
 assert.throws(()=>V4.normalizeDevicePagedAutomationTermsV4(terms));assert.throws(()=>A.normalizeDevicePagedAgentProgressV4(progress));assert.throws(()=>A.devicePagedAgentReadGrantIdV4(base.descriptorSHA256,terms,point));
 assert.equal(A.devicePagedAgentAutomationTermsSHA256AnyV5(base),A.devicePagedAgentAutomationTermsSHA256V4(base));
 const old={profile:A.DEVICE_PAGED_AGENT_READ_GRANT_V4,descriptorSHA256:base.descriptorSHA256,terms:base,readerPublicKey:point,maximumReads:7,grantId:A.devicePagedAgentReadGrantIdV4(base.descriptorSHA256,base,point)};
 assert.deepEqual(L.normalizeDevicePagedAgentReadGrantAnyV5(old),A.normalizeDevicePagedAgentReadGrantV4(old));assert.deepEqual(L.devicePagedAgentReadGrantMessageAnyV5(old),A.devicePagedAgentReadGrantMessageV4(old));
});
test('read-grant signatures bind all V5 payout fees, deadlines, commitments and amounts without a V4 downgrade',()=>{
 const {terms,grant,progress}=fixture(),digest=A.devicePagedAgentAutomationTermsSHA256AnyV5(terms);
 for(const mutate of [t=>t.executorPayouts.maximumTotalFeeAtomic='6',t=>t.executorPayouts.collectBy++,t=>t.executorPayouts.payouts[0].commitment=h('other'),t=>t.executorPayouts.payouts[0].amountAtomic='11',t=>t.executorPayouts.payouts[0].maximumFeeAtomic='4']){
  const changed=structuredClone(grant);mutate(changed.terms);assert.notEqual(A.devicePagedAgentAutomationTermsSHA256AnyV5(changed.terms),digest);assert.throws(()=>L.normalizeDevicePagedAgentReadGrantV5(changed),'an old signed grant cannot accept changed payout terms');
 }
 for(const mutate of [t=>delete t.executorPayouts,t=>t.profile=V4.DEVICE_PAGED_AUTOMATION_V4,t=>t.executorPayouts.permission='SEND_ANYWHERE']){const p=structuredClone(progress);mutate(p.automation.terms);assert.throws(()=>A.normalizeDevicePagedAgentProgressAnyV5(p));}
 assert.equal(L.devicePagedAgentReadUntilMsV5(grant),grant.readUntilMs);assert.equal(L.normalizeDevicePagedAgentReadGrantV5(grant).terms.expiresAt,terms.expiresAt,'a longer read lifetime never renews the financial authorization');
});
test('256 payout terms stay fully bound without increasing the bounded hash input limit',()=>{
 const {terms:single,grant,progress}=fixture(),terms=structuredClone(single);terms.nodes='256';terms.budget='2560';terms.executorPayouts.payouts=Array.from({length:256},(_,index)=>({...terms.executorPayouts.payouts[0],id:'payment-'+index,ordinal:String(index),commitment:h('commitment-'+index),nullifier:h('nullifier-'+index),certificateSHA256:h('certificate-'+index)}));
 assert.ok(JSON.stringify(terms).length>8192);const digest=A.devicePagedAgentAutomationTermsSHA256AnyV5(terms),large={...grant,terms};large.grantId=L.devicePagedAgentReadGrantIdV5(large.descriptorSHA256,terms,point,large.maximumReads,large.readUntilMs);
 assert.equal(L.normalizeDevicePagedAgentReadGrantV5(large).terms.executorPayouts.payouts.length,256);const p={...progress,automation:{...progress.automation,terms},execution:{completed:'256',total:'256',currentNodeId:null}};assert.equal(A.normalizeDevicePagedAgentProgressAnyV5(p).automation.terms.executorPayouts.payouts.length,256);
 const changed=structuredClone(large);changed.terms.executorPayouts.payouts[255].certificateSHA256=h('last-payout-changed');assert.notEqual(A.devicePagedAgentAutomationTermsSHA256AnyV5(changed.terms),digest);assert.throws(()=>L.normalizeDevicePagedAgentReadGrantV5(changed));
});
