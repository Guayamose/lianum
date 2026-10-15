/** Actual portable proposal/device signatures and persisted public records.
 * No custody, financial issuer, blockchain or Android port is fabricated. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {secp256k1} from '@noble/curves/secp256k1.js';
import * as P from '../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import * as A from '../../../packages/mobile-protocol/src/device-paged-agent-v4.mjs';
import * as L from '../../../packages/mobile-protocol/src/device-paged-agent-read-lifetime-v5.mjs';
import * as Automation from '../../../packages/mobile-protocol/src/device-paged-automation-v4.mjs';
import * as Api from '../src/api/device-paged-agent-api-v4.mjs';
import * as Public from '../src/api/device-paged-agent-public-operation-v4.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),hex=b=>Buffer.from(b).toString('hex');
function fixture(){
 const owner=new Uint8Array(32);owner[31]=1;const agent=new Uint8Array(32);agent[31]=3;
 const now=Math.floor(P.devicePagedNowV3()),descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://api.lianum.oryontechnology.com',pairingId:'host-agent-public-operation',devicePublicKey:hex(secp256k1.getPublicKey(owner,false)),deadlineMs:now+9*3600000,chainId:'11155111',chainDeadlineSeconds:String(Math.floor(now/1000)+9*3600),...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(k=>[k,sha(k)])),...Object.fromEntries(['pool','state','native','math'].map((k,i)=>[k,'0x'+String(i+1).repeat(40)]))});
 const terms={budget:'100',fundingNotBefore:String(Math.floor(now/1000)),fundingValidUntil:String(Math.floor(now/1000)+600),settleBefore:String(Math.floor(now/1000)+6*3600)},proposal=Api.createDevicePagedAgentNativeProposalV4(agent,descriptor,terms,[{id:'ethereum',networkId:'ethereum-sepolia',recipient:'0x'+'5'.repeat(40),amountAtomic:'1000000000000000',providerPayoutAtomic:'100',dependsOn:[]}]);
 const financial=Automation.normalizeDevicePagedAutomationTermsV4({profile:Automation.DEVICE_PAGED_AUTOMATION_V4,descriptorSHA256:A.devicePagedAgentDescriptorSHA256V4(descriptor),graphId:'paged-graph-'+sha('graph').slice(0,32),rootId:sha('root'),revision:1,authorizationRoot:sha('authorized'),reserveNullifier:sha('reserve'),budget:terms.budget,nodes:'1',settleBefore:terms.settleBefore,quoteRoot:sha('quotes'),maxCommands:10,expiresAt:now+2*3600000});
 const readerPublicKey=proposal.proposal.agentPublicKey,readUntilMs=now+8*3600000,grant=L.normalizeDevicePagedAgentReadGrantV5({profile:L.DEVICE_PAGED_AGENT_READ_GRANT_V5,descriptorSHA256:financial.descriptorSHA256,terms:financial,readerPublicKey,maximumReads:4096,readUntilMs,grantId:L.devicePagedAgentReadGrantIdV5(financial.descriptorSHA256,financial,readerPublicKey,4096,readUntilMs)}),readerGrant={grant,signature:hex(secp256k1.sign(L.devicePagedAgentReadGrantMessageAnyV5(grant),owner,{prehash:true,lowS:true}))};
 const connection={format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:'-----BEGIN CERTIFICATE-----\nSE9TVCBEQVRB\n-----END CERTIFICATE-----\n',certificateSHA256:sha('HOST CERTIFICATE DATA')}};
 owner.fill(0);agent.fill(0);return{descriptor,proposal,readerGrant,connection};
}
test('receiving an exact signed link binds the saved source and rejects redirection, extras, changes and oversize',()=>{
 const f=fixture(),link=Public.createDevicePagedAgentProposalLinkV4(f.proposal);assert.deepEqual(Public.parseDevicePagedAgentProposalLinkV4(link,f.descriptor),f.proposal);
 assert.throws(()=>Public.parseDevicePagedAgentProposalLinkV4(link,{...f.descriptor,origin:'https://other.example.com'}));
 for(const attack of [link+'&data=duplicated',link+'&origin=https://other.example.com',link+'#fragment',link.replace('lianum://agent/','https://agent/'),link.replace('/proposal?','/proposal/extra?'),'lianum://agent/proposal?data='+ 'x'.repeat(Public.DEVICE_PAGED_AGENT_PROPOSAL_LINK_MAX_V4)])assert.throws(()=>Public.parseDevicePagedAgentProposalLinkV4(attack,f.descriptor));
 const changed=structuredClone(f.proposal);changed.proposal.nodes[0].amountAtomic='2';assert.throws(()=>Public.createDevicePagedAgentProposalLinkV4(changed));
 const injected=structuredClone(f.proposal);injected.privateKey='never accepted';assert.throws(()=>Public.createDevicePagedAgentProposalLinkV4(injected));
 assert.throws(()=>Public.normalizeDevicePagedAgentPublicConnectionV4({...f.connection,privateKey:'never accepted'}));
 assert.throws(()=>Public.normalizeDevicePagedAgentPublicConnectionV4({...f.connection,transport:{...f.connection.transport,fetchImpl:()=>{throw Error('not invoked');}}}));
});
test('lost START acknowledgement leaves a durable unconfirmed record; only confirmed export contains public TLS/grant',async()=>{
 const f=fixture(),map=new Map(),storage={get:async key=>map.get(key)??null,set:async(key,value)=>{map.set(key,value);},digest:async text=>sha(text)},store=Public.createDevicePagedAgentPublicOperationStoreV4(f.descriptor,storage),pending=Public.createDevicePagedAgentSavedOperationV4(f.connection,f.proposal,f.readerGrant);
 await store.save(pending);const reopened=Public.createDevicePagedAgentPublicOperationStoreV4(f.descriptor,storage);assert.deepEqual(await reopened.read(),pending);assert.throws(()=>Public.devicePagedAgentReadConnectionExportV4(pending,f.descriptor));
 const confirmed={...pending,confirmation:'CONFIRMED'};await reopened.save(confirmed);const packet=JSON.parse(Public.devicePagedAgentReadConnectionExportV4(await reopened.read(),f.descriptor));assert.deepEqual(Object.keys(packet).sort(),['connection','format','readerGrant']);assert.deepEqual(packet.readerGrant,f.readerGrant);assert.ok(!JSON.stringify(packet).includes('opening')&&!JSON.stringify(packet).includes('privateKey')&&!JSON.stringify(packet).includes('rootKey'));
 await assert.rejects(reopened.save(pending),'confirmation cannot silently move backwards after readback');
 const different=structuredClone(confirmed);different.proposalSHA256=sha('replacement');await assert.rejects(reopened.save(different));
 const pointerKey=[...map.keys()].find(k=>{try{return !!JSON.parse(map.get(k)).sha256;}catch{return false;}}),pointer=JSON.parse(map.get(pointerKey)),partKey=pointerKey+'.'+pointer.sha256+'.0',part=map.get(partKey);map.set(partKey,'X'+part.slice(1));await assert.rejects(reopened.read());map.set(partKey,part);map.delete(pointerKey+'.'+pointer.sha256+'.1');await assert.rejects(reopened.read(),'missing chunk is not an absent operation');
});
test('interrupted public record writes do not publish partial grants or replace another operation',async()=>{
 const f=fixture(),map=new Map();let writes=0,fail=true;const storage={get:async key=>map.get(key)??null,digest:async text=>sha(text),set:async(key,value)=>{if(fail&&++writes===2)throw Error('HOST_STORAGE_INTERRUPTED');map.set(key,value);}},store=Public.createDevicePagedAgentPublicOperationStoreV4(f.descriptor,storage),record=Public.createDevicePagedAgentSavedOperationV4(f.connection,f.proposal,f.readerGrant);
 await assert.rejects(store.save(record),/HOST_STORAGE_INTERRUPTED/);assert.equal(await store.read(),null);fail=false;await store.save(record);assert.deepEqual(await store.read(),record);
 const wrongDescriptor={...f.descriptor,pairingId:'host-other-source'};assert.throws(()=>Public.normalizeDevicePagedAgentSavedOperationV4(record,wrongDescriptor));const altered=structuredClone(record);altered.readerGrant.grant.maximumReads=1;assert.throws(()=>Public.normalizeDevicePagedAgentSavedOperationV4(altered,f.descriptor));
});
