/** Protocol amount bounds. No private witness, proof or transfer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import * as P from '../src/device-paged-owner-v3.mjs';
const key=generateKeyPairSync('ec',{namedCurve:'secp256k1'}).publicKey.export({format:'jwk'}),h=n=>String(n).repeat(64),a=n=>'0x'+String(n).repeat(40);
const descriptor={profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://127.0.0.1:9445',pairingId:'minimum-deposit-demo',devicePublicKey:'04'+Buffer.from(key.x,'base64url').toString('hex')+Buffer.from(key.y,'base64url').toString('hex'),deadlineMs:Date.now()+60000,chainId:'31337',genesis:h(1),pool:a(1),state:a(2),native:a(3),scope:h(2),policy:h(3),assetIdentity:h(4),domain:h(5),hubDomain:h(6),registryCommitment:h(7),manifestSHA256:h(8),consumerSHA256:h(9),poolCodeHash:h(1),stateCodeHash:h(2),nativeCodeHash:h(3),math:a(4),mathCodeHash:h(4),minimumDepositAtomic:'100',securityGeneration:'EXACT_PAYOUT_SET_V4'};
const limbs=hex=>hex.match(/.{8}/g).map(v=>BigInt('0x'+v).toString());
test('minimum applies to deposits and permits a small original withdrawal',()=>{
 assert.equal(P.normalizeDevicePagedDescriptorV3(descriptor).minimumDepositAtomic,'100');
 for(const amount of ['0','-1','18446744073709551616','1.5'])assert.throws(()=>P.normalizeDevicePagedDescriptorV3({...descriptor,minimumDepositAtomic:amount}));
 const deposit=[...limbs(descriptor.scope),...limbs(descriptor.policy),'1','99',...limbs(h(5))];
 assert.throws(()=>P.assertDevicePagedPublicJoinV3({descriptor,mode:'deposit',publicInputs:deposit}),/MOBILE_PAGED_DEPOSIT_BELOW_MINIMUM/);
 deposit[17]='100';assert.equal(P.assertDevicePagedPublicJoinV3({descriptor,mode:'deposit',publicInputs:deposit})[17],'100');
 const withdrawal=[...limbs(descriptor.scope),...limbs(descriptor.policy),'1',...limbs(h(5)),...limbs(h(6)),'1','1','1','1','1','1'];
 assert.equal(withdrawal.length,39);assert.equal(P.assertDevicePagedPublicJoinV3({descriptor,mode:'withdraw',publicInputs:withdrawal})[33],'1');
});
