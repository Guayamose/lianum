/** Lease DATA and canonical journal joins only. No original renewal issuer,
 * network, proof, financial permission or hardware acceptance is exercised. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as P from '../src/device-paged-owner-v3.mjs';
import * as L from '../src/device-paged-channel-lease-v4.mjs';

const hash=character=>character.repeat(64),base=1700000000000;
const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://127.0.0.1:9443',pairingId:'lease-source-original-0001',devicePublicKey:'04'+'a'.repeat(128),deadlineMs:base+9*3600000,chainDeadlineSeconds:String(Math.floor(base/1000)+9*3600),chainId:'31337',
 ...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(name=>[name,hash('a')])),
 ...Object.fromEntries(['pool','state','native','math'].map((name,i)=>[name,'0x'+String(i+1).repeat(40)]))});
const source={walletRootId:hash('b'),sourceRevision:'7',sourceId:hash('c')};
function lease(changes={}){return{profile:L.DEVICE_PAGED_CHANNEL_LEASE_V4,sourceBinding:L.devicePagedChannelSourceBindingDataV4(descriptor),source:structuredClone(source),intentId:'lease-intent-original-0001',leaseId:hash('d'),generation:'1',predecessorLeaseId:null,issuedAt:descriptor.deadlineMs+1000,expiresAt:descriptor.deadlineMs+1000+L.DEVICE_PAGED_CHANNEL_LEASE_MAX_MS_V4,access:L.DEVICE_PAGED_CHANNEL_LEASE_ACCESS_V4,...changes};}
const next=previous=>lease({generation:'2',predecessorLeaseId:previous.leaseId,leaseId:hash('e'),intentId:'lease-intent-original-0002',issuedAt:previous.issuedAt+10000,expiresAt:previous.expiresAt+10000});

test('canonical lease binding preserves the complete old descriptor and cannot rewrite deadline or pairing',()=>{
 const original=JSON.stringify(descriptor),sorted=Object.fromEntries(Object.entries(descriptor).sort(([left],[right])=>left.localeCompare(right))),expected=createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
 assert.equal(L.devicePagedChannelSourceBindingDataV4(descriptor).descriptorSHA256,expected);
 const parsed=L.normalizeDevicePagedChannelLeaseDataV4(lease(),descriptor);assert.equal(parsed.source.walletRootId,source.walletRootId);assert.ok(parsed.issuedAt>descriptor.deadlineMs,'DATA may describe a future original renewal without changing legacy source lifetime');
 assert.equal(JSON.stringify(descriptor),original);assert.ok(Object.isFrozen(parsed)&&Object.isFrozen(parsed.sourceBinding)&&Object.isFrozen(parsed.source));
 for(const changed of [{...descriptor,deadlineMs:descriptor.deadlineMs+1},{...descriptor,chainDeadlineSeconds:String(BigInt(descriptor.chainDeadlineSeconds)+1n)},{...descriptor,pairingId:'lease-other-source-0001'},{...descriptor,devicePublicKey:'04'+'f'.repeat(128)},{...descriptor,genesis:hash('f')}])assert.throws(()=>L.normalizeDevicePagedChannelLeaseDataV4(lease(),changed),/MOBILE_PAGED_CHANNEL_LEASE_SOURCE/);
});

test('lease DATA admits EMPTY or original lineage without fabricating a sourceId and rejects open frames',()=>{
 assert.equal(L.normalizeDevicePagedChannelLeaseDataV4(lease({source:null}),descriptor).source,null);
 assert.equal(L.normalizeDevicePagedChannelLeaseDataV4(lease({source:{...source,sourceId:null}}),descriptor).source.sourceId,null);
 const before=L.normalizeDevicePagedChannelLeaseDataV4(lease({source:null}),descriptor),filled=next(before);
 assert.deepEqual(L.normalizeDevicePagedChannelLeaseTransitionDataV4(before,filled,descriptor).source,source);
 for(const bad of [lease({access:'EXECUTE_ALL'}),lease({profile:'LEASE_APPROVED_FROM_CACHE'}),lease({extra:true}),lease({source:{...source,sourceRevision:'0'}}),lease({source:{...source,sourceRevision:'07'}}),lease({source:{...source,walletRootId:hash('0')}}),lease({source:{...source,sourceId:'caller-source'}})])assert.throws(()=>L.normalizeDevicePagedChannelLeaseDataV4(bad,descriptor));
 const getter=lease();Object.defineProperty(getter,'generation',{enumerable:true,get(){throw Error('GETTER_MUST_NOT_RUN');}});assert.throws(()=>L.normalizeDevicePagedChannelLeaseDataV4(getter,descriptor),/MOBILE_PAGED_OWNER_BINDING/);
});

test('durable transition DATA rejects replay, skipped generations, source substitution and clock rollback',()=>{
 const first=lease(),second=next(first);assert.equal(L.normalizeDevicePagedChannelLeaseTransitionDataV4(null,first,descriptor).generation,'1');assert.equal(L.normalizeDevicePagedChannelLeaseTransitionDataV4(first,second,descriptor).generation,'2');
 for(const bad of [first,{...second,generation:'3'},{...second,predecessorLeaseId:hash('f')},{...second,leaseId:first.leaseId},{...second,intentId:first.intentId},{...second,source:null},{...second,source:{...source,walletRootId:hash('f')}},{...second,source:{...source,sourceRevision:'8'}},{...second,source:{...source,sourceId:hash('f')}},{...second,issuedAt:first.issuedAt-1,expiresAt:first.expiresAt-1}])assert.throws(()=>L.normalizeDevicePagedChannelLeaseTransitionDataV4(first,bad,descriptor));
 assert.throws(()=>L.normalizeDevicePagedChannelLeaseTransitionDataV4(null,second,descriptor),/MOBILE_PAGED_CHANNEL_LEASE_GENERATION/);
 const knownWithoutId=lease({source:{...source,sourceId:null}});assert.equal(L.normalizeDevicePagedChannelLeaseTransitionDataV4(knownWithoutId,second,descriptor).source.sourceId,source.sourceId);
 for(const generation of ['0','01','18446744073709551616'])assert.throws(()=>L.normalizeDevicePagedChannelLeaseDataV4(lease({generation}),descriptor));
});

test('lease is bounded to nine hours and never validates legacy freshness or financial deadlines',()=>{
 const original=lease();assert.equal(original.expiresAt-original.issuedAt,L.DEVICE_PAGED_CHANNEL_LEASE_MAX_MS_V4);
 for(const bad of [{...original,expiresAt:original.expiresAt+1},{...original,expiresAt:original.issuedAt},{...original,issuedAt:NaN},{...original,issuedAt:-0},{...original,expiresAt:Number.MAX_SAFE_INTEGER+1}])assert.throws(()=>L.normalizeDevicePagedChannelLeaseDataV4(bad,descriptor));
 // Parsing historical bytes is useful for recovery; it is never a freshness
 // check and cannot make the original financial source descriptor current.
 assert.equal(L.normalizeDevicePagedChannelLeaseDataV4(original,descriptor).expiresAt,original.expiresAt);
 assert.throws(()=>P.assertDevicePagedGraphDeadlineV3(descriptor,String(BigInt(descriptor.chainDeadlineSeconds)+1n)),/MOBILE_PAGED_OWNER_BINDING/);
 const status={profile:P.DEVICE_PAGED_OWNER_V3,descriptor,jobs:[],note:null,issuedAt:original.issuedAt,expiresAt:original.issuedAt+15000,blockHash:'0x'+hash('f'),blockNumber:'1',epoch:'1'};
 assert.throws(()=>P.validateDevicePagedStatusFreshV3(status,original.issuedAt),/MOBILE_PAGED_OWNER_BINDING/,'serializable lease DATA does not bypass the original V3 source deadline');
});
