/** Proposal/grant DATA and real secp signatures. No Authority, receiver,
 * proof, server credential, mobile key or financial permission is created. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as P from '../src/device-paged-owner-v3.mjs';
import * as A from '../src/device-paged-agent-v4.mjs';
import {createDevicePagedAgentNativeProposalV4,verifyDevicePagedAgentNativeProposalV4} from '../../../apps/mobile/src/api/device-paged-agent-api-v4.mjs';
const h=v=>createHash('sha256').update(v).digest('hex');
const key=Uint8Array.from({length:32},(_,i)=>i===31?3:0);
const point='0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://localhost:9444',pairingId:'host-public-agent-data',devicePublicKey:point,deadlineMs:Math.floor(P.devicePagedNowV3()+9*3600000),chainId:'11155111',chainDeadlineSeconds:String(Math.floor(P.devicePagedNowV3()/1000)+9*3600),...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(k=>[k,h(k)])),...Object.fromEntries(['pool','state','native','math'].map((k,i)=>[k,'0x'+String(i+1).repeat(40)]))});
const now=Math.floor(P.devicePagedNowV3()/1000),terms={budget:'256',fundingNotBefore:String(now),fundingValidUntil:String(now+600),settleBefore:String(now+6*3600)};
function nodes(count){return Array.from({length:count},(_,i)=>({id:'payment-'+i,networkId:'ethereum-sepolia',recipient:'0x'+'a'.repeat(40),amountAtomic:'1000000000000000',providerPayoutAtomic:'1',dependsOn:Array.from({length:i},(_,j)=>'payment-'+j)}));}
test('256 signed proposed payments with dense dependencies retain bounded hash inputs and exact public terms',()=>{
 const signed=createDevicePagedAgentNativeProposalV4(key,descriptor,terms,nodes(256));assert.equal(verifyDevicePagedAgentNativeProposalV4(signed).proposal.nodes.length,256);assert.equal(signed.proposal.nodes[255].dependsOn.length,255);assert.equal(A.devicePagedAgentProposalMessageV4(signed.proposal).length<8192,true);
 for(const mutate of [p=>p.nodes[0].recipient='0x'+'b'.repeat(40),p=>p.nodes[0].amountAtomic='2',p=>p.nodes[255].dependsOn.pop(),p=>p.terms.settleBefore=String(now+7*3600),p=>p.nodes[1].networkId='bitcoin-testnet']){const changed=structuredClone(signed);mutate(changed.proposal);assert.throws(()=>verifyDevicePagedAgentNativeProposalV4(changed),/PAGED_AGENT_SDK/);}
 const reordered=structuredClone(signed);reordered.proposal.nodes.reverse();assert.throws(()=>verifyDevicePagedAgentNativeProposalV4(reordered),/PAGED_AGENT_SCOPE/);
 for(const extra of [{...signed.proposal,privateKey:h('private')},{...signed.proposal,permission:'EXECUTE_NATIVE'}])assert.throws(()=>A.normalizeDevicePagedAgentProposalV4(extra));
});
test('closed proposal rejects cycles, duplicate ids, mixed units, an overspent budget and inherited/accessor data',()=>{
 const raw=createDevicePagedAgentNativeProposalV4(key,descriptor,terms,nodes(2)).proposal;
 for(const mutate of [p=>p.nodes[0].dependsOn.push('payment-1'),p=>p.nodes[1].id='payment-0',p=>p.nodes[0].networkId='bitcoin-mainnet',p=>p.nodes[0].amountAtomic='0.001',p=>p.terms.budget='1']){const p=structuredClone(raw);mutate(p);assert.throws(()=>A.normalizeDevicePagedAgentProposalV4(p));}
 const accessor=structuredClone(raw);Object.defineProperty(accessor.nodes,'0',{enumerable:true,get(){throw Error('ACCESSOR_EXECUTED');}});assert.throws(()=>A.normalizeDevicePagedAgentProposalV4(accessor),error=>error.message==='PAGED_AGENT_SCOPE');
 const inherited=Object.assign(Object.create(raw),{});assert.throws(()=>A.normalizeDevicePagedAgentProposalV4(inherited));
});
