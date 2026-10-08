/** Host consent lifecycle with controlled async biometric/storage boundaries.
 * Signatures are real; this does not establish physical device authentication
 * or an economic backend/settlement. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicKey,verify } from 'node:crypto';
import { MOBILE_AUTHORIZATION_PROFILE,mobileAuthorizationMessage } from '@lianum/mobile-protocol';
import { createMobileReviewLease } from '../src/custody/review-lease.mjs';
import { devicePublicKey,signDeviceMessage } from '../src/custody/signing.mjs';
const key=new Uint8Array(32).fill(11),owner=devicePublicKey(key);
const publicKey=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',
  x:Buffer.from(owner.slice(2,66),'hex').toString('base64url'),y:Buffer.from(owner.slice(66),'hex').toString('base64url')}});
const deferred=()=>{let resolve;return {promise:new Promise(done=>{resolve=done;}),resolve:value=>resolve(value)};};
function fixture(){
  let clock=1_000_000;
  const intent={requestId:'original_request_0009',action:'execute',kind:'EXIT',chain:'ethereum',assetId:'c'.repeat(64),
    amountAtomic:'25',recipient:'0x'+'d'.repeat(40),maxFeeAtomic:'1'};
  const context={origin:'https://wallet.example',ownerPublicKey:owner,intent,connection:'READY',
    capabilities:{prepare:true,execute:true,reconcile:true,recover:true},observedAt:clock,stale:false,foreground:true};
  const challenge={version:1,profile:MOBILE_AUTHORIZATION_PROFILE,origin:context.origin,ownerPublicKey:owner,
    intent,challengeId:'a'.repeat(64),nonce:'b'.repeat(64),expiresAt:clock+60_000};
  const controller=createMobileReviewLease({readContext:()=>context,now:()=>clock});
  const events=[];
  const callbacks={
    sign:async review=>{events.push('sign');return signDeviceMessage(key,mobileAuthorizationMessage(review));},
    retain:async authorization=>{events.push('retain');assert.deepEqual(authorization.challenge,challenge);},
    post:async authorization=>{events.push('post');assert.equal(verify('sha256',mobileAuthorizationMessage(challenge),
      {key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(authorization.signature,'hex')),true);
      return {status:'ACCEPTED',operationState:'ADMITTED',requestId:intent.requestId,retryAllowed:false};},
  };
  return {controller,context,challenge,events,callbacks,
    lease:()=>controller.finish(controller.begin(),challenge).lease,advance:ms=>{clock+=ms;}};
}
test('a private review lease signs, retains and posts its original scope once',async()=>{
  const f=fixture(),lease=f.lease();
  assert.equal(Object.keys(lease).length,0);assert.throws(()=>JSON.stringify(lease),/NOT_SERIALIZABLE/);
  const {result}=await f.controller.submit(lease,f.callbacks);
  assert.deepEqual(f.events,['sign','retain','post']);assert.equal(result.operationState,'ADMITTED');
  await assert.rejects(f.controller.submit(lease,f.callbacks),/REVIEW_INACTIVE/);
  assert.deepEqual(f.events,['sign','retain','post']);
});
test('cancel, refresh, background or a superseding review invalidate a captured Alert callback',async()=>{
  for(const reason of ['cancel','refresh','background','new-review']){
    const f=fixture(),lease=f.lease();
    if(reason==='background')f.context.foreground=false;
    if(reason==='refresh')f.context.stale=true;
    if(reason==='new-review')f.controller.begin();else f.controller.invalidate();
    await assert.rejects(f.controller.submit(lease,f.callbacks),/REVIEW_INACTIVE/);
    assert.deepEqual(f.events,[]);
  }
  const f=fixture(),ticket=f.controller.begin();f.controller.invalidate();
  assert.throws(()=>f.controller.finish(ticket,f.challenge),/REVIEW_INACTIVE/);
  assert.throws(()=>f.controller.finish({},f.challenge),/REVIEW_INACTIVE/);
});
test('revocation during biometrics prevents retention and POST, and another callback cannot sign',async()=>{
  const f=fixture(),lease=f.lease(),signing=deferred();
  const callbacks={...f.callbacks,sign:async review=>{f.events.push('sign');await signing.promise;
    return signDeviceMessage(key,mobileAuthorizationMessage(review));}};
  const first=f.controller.submit(lease,callbacks);
  await assert.rejects(f.controller.submit(lease,callbacks),/REVIEW_INACTIVE/);
  f.context.foreground=false;f.controller.invalidate();signing.resolve();
  await assert.rejects(first,/REVIEW_INACTIVE/);assert.deepEqual(f.events,['sign']);
});
test('revocation while protected retention awaits prevents POST without erasing original evidence',async()=>{
  const f=fixture(),lease=f.lease(),retention=deferred(),entered=deferred();let retained;
  const first=f.controller.submit(lease,{...f.callbacks,retain:async authorization=>{
    retained=authorization;f.events.push('retain');entered.resolve();await retention.promise;
  }});
  await entered.promise;f.controller.invalidate();retention.resolve();
  await assert.rejects(first,/REVIEW_INACTIVE/);
  assert.deepEqual(f.events,['sign','retain']);assert.deepEqual(retained.challenge,f.challenge);
  await assert.rejects(f.controller.submit(lease,f.callbacks),/REVIEW_INACTIVE/);
});
test('current origin, owner, intent, capability and foreground are checked again after biometrics',async()=>{
  for(const mutate of [
    f=>{f.context.origin='https://foreign.example';},f=>{f.context.ownerPublicKey=devicePublicKey(new Uint8Array(32).fill(12));},
    f=>{f.context.intent={...f.context.intent,recipient:'0x'+'e'.repeat(40)};},
    f=>{f.context.capabilities.execute=false;},f=>{f.context.foreground=false;},f=>{f.context.stale=true;},
    f=>{f.context.connection='DISCONNECTED';},f=>{f.advance(30_001);},
  ]){
    const f=fixture(),lease=f.lease(),signing=deferred();
    const first=f.controller.submit(lease,{...f.callbacks,sign:async review=>{f.events.push('sign');await signing.promise;
      return signDeviceMessage(key,mobileAuthorizationMessage(review));}});
    mutate(f);signing.resolve();await assert.rejects(first,/REVIEW_(CHANGED|STALE)/);
    assert.deepEqual(f.events,['sign']);
  }
});
test('expiry and capability loss fail before signing; a failed POST cannot reuse consumed consent',async()=>{
  const expired=fixture(),expiredLease=expired.lease();expired.advance(60_001);
  await assert.rejects(expired.controller.submit(expiredLease,expired.callbacks),/REVIEW_STALE|CHALLENGE_EXPIRED/);
  assert.deepEqual(expired.events,[]);
  const unavailable=fixture(),unavailableLease=unavailable.lease();unavailable.context.capabilities.execute=false;
  await assert.rejects(unavailable.controller.submit(unavailableLease,unavailable.callbacks),/REVIEW_STALE/);
  assert.deepEqual(unavailable.events,[]);
  unavailable.context.capabilities.execute=true;
  await assert.rejects(unavailable.controller.submit(unavailableLease,unavailable.callbacks),/REVIEW_INACTIVE/);
  const f=fixture(),lease=f.lease();
  await assert.rejects(f.controller.submit(lease,{...f.callbacks,post:async()=>{f.events.push('post');throw Error('CONTROLLED_LOST_REPLY');}}),/CONTROLLED_LOST_REPLY/);
  await assert.rejects(f.controller.submit(lease,f.callbacks),/REVIEW_INACTIVE/);
  assert.deepEqual(f.events,['sign','retain','post']);
});
