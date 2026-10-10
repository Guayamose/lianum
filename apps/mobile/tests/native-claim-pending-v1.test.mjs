import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createNativeClaimPendingRedemptionV1} from '../src/custody/native-claim-pending-v1.mjs';
import {createNativeClaimDeviceApiV1} from '../src/api/native-claim-device-api-v1.mjs';
const h=value=>createHash('sha256').update(value).digest('hex');
const descriptor={version:1,profile:'LIANUM_NATIVE_CLAIM_DEVICE_PAIRING_V1',origin:'https://127.0.0.1:9443',pairingId:h('pairing'),devicePublicKey:'04'+'11'.repeat(64),accountScopeSHA256:h('scope'),lifetimeSHA256:h('life'),claimDomain:h('domain'),nativeFamily:'2',nativeGenesis:h('genesis'),nativeAsset:h('native'),wrapperAssetIdentity:h('wrapper'),claimSymbol:'cSOL',nativeSymbol:'SOL',decimals:9,atomicUnit:'lamport',nativeAssetKind:null,mint:null};
const signature='0'.repeat(63)+'1'+'0'.repeat(63)+'1';
function permission(id='original_spend_01'){return{version:1,profile:'LIANUM_NATIVE_CLAIM_DEVICE_REDEEM_PERMISSION_V1',action:'REDEEM_NATIVE_CLAIM',descriptor,
 redemptionBinding:{profile:'ORIGINAL_NATIVE_CLAIM_DEVICE_REDEMPTION_BINDING_V1',accountScopeSHA256:descriptor.accountScopeSHA256,claimDomain:descriptor.claimDomain,callerSHA256:h('caller'),nativeFamily:'2',nativeGenesis:descriptor.nativeGenesis,nativeAsset:descriptor.nativeAsset,recipientEndpoint:'22'.repeat(32),recipientEndpointCommitment:h('endpoint'),custody:'BACKEND_LOCAL_QUORUM',nativeSelfCustody:false},requestId:id,amount:'1000000',maxFee:'5000',challengeId:h('permission-'+id),nonce:h('nonce-'+id),expiresAt:Date.now()+15000};}
function storage(){const values=new Map();let owner=descriptor.devicePublicKey,writeFailure=false,pointerFailure=false;const ports={
 async get(key){return values.get(key)??null;},async set(key,value){assert.ok(value.length<=1800);values.set(key,value);if(writeFailure||pointerFailure&&key==='lianum.native-claim.pending.v1'){writeFailure=false;pointerFailure=false;throw Error('HOST_REPLY_LOST_AFTER_ORIGINAL_WRITE');}},
 async digest(value){return h(value);},async devicePublicKey(){return owner;}};
 return{values,ports,actor:()=>createNativeClaimPendingRedemptionV1(ports),changeOwner(){owner='04'+'33'.repeat(64);},loseWrite(){writeFailure=true;},losePointerWrite(){pointerFailure=true;}};
}
async function originalRead(state='CONFIRMED',requestId='original_spend_01'){
 const challenge={version:1,profile:'LIANUM_NATIVE_CLAIM_DEVICE_PERMISSION_V1',action:'READ_CLAIM_JOURNAL',descriptor,challengeId:h('read'),nonce:h('read-nonce'),expiresAt:Date.now()+15000,requestId:null,requestSHA256:null};
 // Explicitly inert HTTP port; SDK framing/one-use/observation brand are real.
 const client=createNativeClaimDeviceApiV1({descriptor,fetchImpl:async(url)=>new Response(JSON.stringify(url.endsWith('/challenges')?challenge:{version:1,profile:'LIANUM_NATIVE_CLAIM_DEVICE_OBSERVATION_V1',descriptor,permissionId:challenge.challengeId,observedAt:Date.now(),expiresAt:challenge.expiresAt,
 state:{phase:'READY',storageAvailable:true,requiresReconciliation:state!=='CONFIRMED',requests:[{requestId,action:'redeem',state,errorCode:null,requestSHA256:h('original-request')}],deposits:[],tickets:[],custody:'BACKEND_LOCAL_QUORUM',nativeSelfCustody:false,underlyingSpendable:false,independentOperators:false,availablePrivateClaims:null}}),{status:200,headers:{'content-type':'application/json'}})});
 const p=await client.challenge();return client.read(p,signature);
}
test('protected native spend pointer reopens exact original scope and admits another request only after a fresh branded confirmation',async()=>{
 const f=storage(),a=f.actor(),p=permission();assert.equal(await a.read(),null);const saved=await a.retain(p,signature);
 assert.equal(saved.state,'UNRESOLVED');assert.equal(saved.requestId,p.requestId);assert.equal(saved.recipientEndpoint,p.redemptionBinding.recipientEndpoint);
 assert.equal(saved.permissionSHA256,h(p.profile+'\n'+JSON.stringify(p)));assert.ok(!JSON.stringify(saved).includes(signature));
 assert.deepEqual(await f.actor().read(),saved,'new JS actor retains same recovery pointer');
 await assert.rejects(f.actor().retain(permission('new_native_spend_02'),signature));
 const pending=await originalRead('RECONCILIATION_REQUIRED');assert.equal((await a.confirm(pending)).state,'UNRESOLVED');
 const confirmed=await originalRead();assert.throws(()=>a.confirm(structuredClone(confirmed)),'DTO cannot confirm a durable pointer');
 assert.equal((await a.confirm(confirmed)).state,'CONFIRMED');await assert.rejects(a.retain(p,signature),'never resubmit the old signed spend');
 assert.equal((await a.retain(permission('new_native_spend_02'),signature)).state,'UNRESOLVED');
 f.changeOwner();await assert.rejects(f.actor().read(),'different identity cannot adopt the recovery record');
});
test('native pointer preserves uncertain protected writes and rejects changed pages without sending or signing',async()=>{
 const f=storage();f.loseWrite();await assert.rejects(f.actor().retain(permission(),signature));
 assert.equal(await f.actor().read(),null,'partial pages never publish a recovery pointer');
 const saved=await f.actor().retain(permission(),signature);assert.equal(saved.state,'UNRESOLVED');
 const pointer=JSON.parse(f.values.get('lianum.native-claim.pending.v1'));
 const key='lianum.native-claim.pending.v1.'+pointer.sha256+'.0';f.values.set(key,f.values.get(key).replace('1000000','1000001'));
 await assert.rejects(f.actor().read(),'authentic pointer cannot reference changed request bytes');
 const g=storage();g.losePointerWrite();await assert.rejects(g.actor().retain(permission(),signature));
 assert.equal((await g.actor().read()).state,'UNRESOLVED','lost acknowledgement after pointer write restores the original request');
 await assert.rejects(g.actor().retain(permission('another_spend_03'),signature),'uncertain write cannot authorize another request');
});
