/** HOST signature/admission checks; no financial authority or broadcasts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import * as S from '../../../../mobile-protocol/src/device-paged-source-successor-v35.mjs';
import {createPagedSourceSuccessorPermissionChannelV35} from '../../../src/accounts/authority/device-paged-successor-permission-v35.mjs';
const h=value=>value.repeat(64);
function fixture(){
 const keys=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),pub=keys.publicKey.export({format:'jwk'}),now=Date.now(),descriptor={profile:'LIANUM_DEVICE_PAGED_OWNER_V3',graphProfile:'LIANUM_PAEG_FUNDED_PAGED_V3',sparseEncoding:'BN254_POSEIDON2_SPARSE_V3',origin:'https://api.lianum.oryontechnology.com',pairingId:'successor-predecessor-host-001',devicePublicKey:'04'+Buffer.from(pub.x,'base64url').toString('hex')+Buffer.from(pub.y,'base64url').toString('hex'),deadlineMs:now+3600000,chainDeadlineSeconds:String(Math.floor((now+3600000)/1000)),chainId:'11155111',...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(key=>[key,h('a')])),...Object.fromEntries(['pool','state','native','math'].map((key,index)=>[key,'0x'+String(index+1).repeat(40)]))},request={action:'PREPARE_SUCCESSOR',intentId:'successor-intent-host-0001'},challenge={version:35,profile:S.DEVICE_PAGED_SOURCE_SUCCESSOR_CHALLENGE_V35,sourceDescriptor:descriptor,request,predecessor:{walletRootId:h('b'),sourceRevision:'1',sourceId:h('c'),journalRevision:'65',journalDataSHA256:h('d')},birthOrdinal:'5',terminalKind:'WITHDRAWN_UNRESERVED',challengeId:'successor-challenge-host-0001',nonce:h('e'),issuedAt:now,expiresAt:now+15000},connection={format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor:{...descriptor,pairingId:'successor-new-host-0002'},transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:'-----BEGIN CERTIFICATE-----\nAA==\n-----END CERTIFICATE-----\n',certificateSHA256:h('f')}},reply={profile:S.DEVICE_PAGED_SOURCE_SUCCESSOR_REPLY_V35,sourceDescriptor:descriptor,request,terminalKind:challenge.terminalKind,connection};return{keys,descriptor,request,challenge,connection,reply};
}
function setup(){const f=fixture(),channel=createPagedSourceSuccessorPermissionChannelV35(f.descriptor),preparation=Object.freeze(Object.create(null)),data={sourceDescriptor:f.descriptor,walletRootId:h('b'),sourceRevision:1,sourceId:h('c'),predecessorJournalRevision:65,predecessorJournalDataSHA256:h('d'),birthOrdinal:5,terminalKind:'WITHDRAWN_UNRESERVED'};return{...f,channel,preparation,data,pop:consent=>sign('sha256',S.devicePagedSourceSuccessorPermissionMessageV35(consent,f.descriptor),{key:f.keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('hex')};}
test('storage PoP consumes the exact retained opaque preparation once; forged or altered requests cannot use it',()=>{
 const f=setup(),consent=f.channel.issue(f.request,f.preparation,f.data);
 assert.equal(consent.expiresAt,f.descriptor.deadlineMs,'the one-hour permission is clipped to the original source deadline');
 assert.throws(()=>f.channel.consume(consent,'0'.repeat(128)),/SIGNATURE/);
 assert.throws(()=>f.channel.consume({...consent,request:{...consent.request,intentId:'different-intent-001'}},f.pop(consent)),/BINDING/);
 const other=setup();assert.throws(()=>other.channel.consume(consent,f.pop(consent)),/BINDING/);
 const accepted=f.channel.consume(consent,f.pop(consent));assert.strictEqual(accepted.preparation,f.preparation);assert.deepEqual(accepted.consent,consent);
 assert.throws(()=>f.channel.consume(consent,f.pop(consent)),/CHALLENGE/);f.channel.close();assert.throws(()=>f.channel.issue(f.request,f.preparation,f.data),/CLOSED/);
});
test('expired challenges, foreign source data and capacity reject without retaining unlimited preparations',t=>{
 const f=setup(),before=Date.now(),consent=f.channel.issue(f.request,f.preparation,f.data),signature=f.pop(consent);
 t.mock.method(Date,'now',()=>consent.expiresAt);assert.throws(()=>f.channel.consume(consent,signature),/EXPIRED/);t.mock.restoreAll();
 assert.throws(()=>f.channel.issue(f.request,f.preparation,{...f.data,sourceDescriptor:{...f.descriptor,pairingId:'different-pairing-001'}}),/BINDING/);
 const bounded=setup();for(let i=0;i<16;i++)bounded.channel.issue(bounded.request,bounded.preparation,bounded.data);assert.throws(()=>bounded.channel.issue(bounded.request,bounded.preparation,bounded.data),/CAPACITY/);bounded.channel.close();f.channel.close();
});
