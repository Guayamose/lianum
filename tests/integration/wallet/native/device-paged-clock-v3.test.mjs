/** Isolated HOST clock diagnostics; production exposes no clock injection. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import {generateKeyPairSync,sign,verify} from 'node:crypto';

const source=await readFile(new URL('../../../../packages/mobile-protocol/src/device-paged-clock-v3.mjs',import.meta.url),'utf8');
const ownerSource=await readFile(new URL('../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs',import.meta.url),'utf8');
const graphSource=await readFile(new URL('../../../../packages/mobile-protocol/src/device-paged-graph-v3.mjs',import.meta.url),'utf8');
const epoch=1800000000000;
function clock({timerAdvancesWall=true,onTimer=null}={}){
 const state={wall:epoch,monotonic:100,timers:[]};
 const api=runInNewContext(`(()=>{${source.replace(/^export /gm,'')}\nreturn {devicePagedNowV3,devicePagedWallNowV3,assertDevicePagedFrameElapsedV3,assertDevicePagedFrameElapsedV41,awaitDevicePagedIssuedTimeV3};})()`,{
  Date:{now:()=>state.wall},performance:{now:()=>state.monotonic},AbortSignal,
  setTimeout(fn,ms){const timer={cancelled:false};state.timers.push(ms);queueMicrotask(()=>{if(timer.cancelled)return;state.monotonic+=ms;if(timerAdvancesWall)state.wall+=ms;onTimer?.(state);fn();});return timer;},
  clearTimeout(timer){if(timer)timer.cancelled=true;}
 });
 return {state,...api};
}
const isCode=code=>error=>error.message===code;
const isGraphCode=code=>error=>error.message==='MOBILE_PAGED_GRAPH_MESSAGE'&&error.code===code;
function graphClock(){
 const state={wall:epoch,monotonic:100};
 const plain=text=>text.replace(/^import .*;\n/gm,'').replace(/^export \{.*;\n/gm,'').replace(/^export /gm,'');
 const api=runInNewContext(`(()=>{
  const clock=(()=>{${plain(source)}\nreturn {devicePagedNowV3,devicePagedWallNowV3,assertDevicePagedFrameElapsedV3,assertDevicePagedFrameElapsedV41};})();
  const P=(()=>{const {devicePagedWallNowV3,assertDevicePagedFrameElapsedV3,assertDevicePagedFrameElapsedV41}=clock;${plain(ownerSource)}\nreturn {...clock,pagedOwnerExactV3,pagedOwnerHexV3,pagedOwnerUintV3,normalizeDevicePagedDescriptorV3,normalizeDevicePagedRecipientV3,validateDevicePagedConsentFreshV3,devicePagedPermissionMessageV3};})();
  ${plain(graphSource)}
  return {validateDevicePagedGraphConsentFreshV3,devicePagedGraphPermissionMessageV3,validateDevicePagedConsentFreshV3:P.validateDevicePagedConsentFreshV3,devicePagedPermissionMessageV3:P.devicePagedPermissionMessageV3,parse:text=>JSON.parse(text)};
 })()`,{Date:{now:()=>state.wall},performance:{now:()=>state.monotonic},AbortSignal,URL,TextEncoder});
 return {state,...api};
}
function graphConsent(c,publicKey,deadlineMs=epoch+60000){
 const jwk=publicKey.export({format:'jwk'}),devicePublicKey='04'+Buffer.from(jwk.x,'base64url').toString('hex')+Buffer.from(jwk.y,'base64url').toString('hex');
 const descriptor={profile:'LIANUM_DEVICE_PAGED_OWNER_V3',graphProfile:'LIANUM_PAEG_FUNDED_PAGED_V3',sparseEncoding:'BN254_POSEIDON2_SPARSE_V3',origin:'https://127.0.0.1:9444',pairingId:'paged-pairing-clock-test',devicePublicKey,deadlineMs,chainId:'31337',...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(k=>[k,'a'.repeat(64)])),...Object.fromEntries(['pool','state','native','math'].map((k,i)=>[k,'0x'+String(i+1).repeat(40)]))};
 const recipientPublicKey=generateKeyPairSync('x25519').publicKey.export({type:'spki',format:'der'}).toString('base64'),jobId='paged-job-clock-test';
 return c.parse(JSON.stringify({version:3,profile:'LIANUM_DEVICE_PAGED_GRAPH_OWNER_V3',descriptor,action:'NEXT_COMMAND',graphId:'paged-graph-clock-test',jobId,rootId:'b'.repeat(64),revision:1,commandSHA256:'c'.repeat(64),replyPublicKey:recipientPublicKey,challengeId:'paged-challenge-clock-test',nonce:'d'.repeat(64),authorizationRoot:'e'.repeat(64),reserveNullifier:'f'.repeat(64),progressCommitment:'1'.repeat(64),recipient:{type:'flat-private-proof-input-ready',profile:'ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1',relation:'funded_graph_paged_reserve',role:'owner',jobId,recipientPublicKey},expiresAt:epoch+15000}));
}

test('wire wall and local ratchet stay separate during rollback and frame checks',()=>{
 const c=clock();assert.equal(c.devicePagedNowV3(),epoch);
 c.state.wall=epoch-5000;c.state.monotonic+=1000;
 assert.equal(c.devicePagedWallNowV3(),epoch-5000);
 c.assertDevicePagedFrameElapsedV3('owner:consent:test',epoch+10000,c.state.wall);
 assert.equal(c.devicePagedNowV3(),epoch+1000);
 c.state.monotonic+=1000;
 assert.equal(c.devicePagedNowV3(),epoch+2000);
 c.state.wall=epoch+20000;
 assert.equal(c.devicePagedNowV3(),epoch+20000);
});

test('wall rollback cannot renew or revive a seen 15-second consent',()=>{
 const c=clock(),key='owner:consent:pairing:challenge:nonce',expires=epoch+15000;
 c.assertDevicePagedFrameElapsedV3(key,expires,epoch);
 c.state.monotonic+=14999;c.state.wall=epoch+10000;
 c.assertDevicePagedFrameElapsedV3(key,expires,c.state.wall);
 c.state.monotonic+=1;
 assert.throws(()=>c.assertDevicePagedFrameElapsedV3(key,expires,c.state.wall),isCode('MOBILE_PAGED_CLOCK_EXPIRED'));
});

test('original signed graph permission survives rollback only until its first 15-second deadline',()=>{
 const c=graphClock(),key=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),consent=graphConsent(c,key.publicKey);
 c.validateDevicePagedGraphConsentFreshV3(consent);
 const message=c.devicePagedGraphPermissionMessageV3(consent),signature=sign('sha256',message,{key:key.privateKey,dsaEncoding:'ieee-p1363'});
 c.state.wall=epoch-1000;c.state.monotonic+=1;
 const original=c.validateDevicePagedGraphConsentFreshV3(consent);
 assert.ok(verify('sha256',c.devicePagedGraphPermissionMessageV3(original),{key:key.publicKey,dsaEncoding:'ieee-p1363'},signature));
 const copied=c.parse(JSON.stringify(consent));copied.challengeId='paged-challenge-clock-new';
 assert.throws(()=>c.validateDevicePagedGraphConsentFreshV3(copied),isGraphCode('MOBILE_PAGED_GRAPH_CONSENT_FUTURE'));
 const changed=c.parse(JSON.stringify(consent));changed.expiresAt++;
 assert.throws(()=>c.validateDevicePagedGraphConsentFreshV3(changed),isCode('MOBILE_PAGED_CLOCK_BINDING'));
 c.state.monotonic+=14998;c.validateDevicePagedGraphConsentFreshV3(consent);
 c.state.monotonic++;assert.throws(()=>c.validateDevicePagedGraphConsentFreshV3(consent),isGraphCode('MOBILE_PAGED_GRAPH_CONSENT_EXPIRED'));
 c.state.wall=epoch-3600000;c.state.monotonic+=15000;
 assert.throws(()=>c.validateDevicePagedGraphConsentFreshV3(consent),isGraphCode('MOBILE_PAGED_GRAPH_CONSENT_EXPIRED'));
});

test('new graph permission one millisecond in the future stays rejected; descriptor deadline is never extended',()=>{
 const c=graphClock(),key=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),consent=graphConsent(c,key.publicKey,epoch+15000);
 c.state.wall=epoch-1;
 assert.throws(()=>c.validateDevicePagedGraphConsentFreshV3(consent),isGraphCode('MOBILE_PAGED_GRAPH_CONSENT_FUTURE'));
 c.state.wall=epoch;c.validateDevicePagedGraphConsentFreshV3(consent);
 c.state.wall=epoch+15000;c.state.monotonic+=100;
 assert.throws(()=>c.validateDevicePagedGraphConsentFreshV3(consent),isGraphCode('MOBILE_PAGED_GRAPH_CONSENT_DEADLINE'));
});

test('original signed owner permission keeps its exact deadline through rollback; unknown future consent stays rejected',()=>{
 const c=graphClock(),key=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),{descriptor}=graphConsent(c,key.publicKey);
 const consent=c.parse(JSON.stringify({version:3,profile:'LIANUM_DEVICE_PAGED_OWNER_V3',descriptor,action:'READ_STATE',mode:null,jobId:'paged-owner-job-clock-test',challengeId:'paged-owner-challenge-clock-test',nonce:'d'.repeat(64),rootId:'b'.repeat(64),revision:1,authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,publicInputs:null,witnessSHA256:null,recipient:null,proofSHA256:null,expiresAt:epoch+15000}));
 c.state.wall=epoch-1;
 assert.throws(()=>c.validateDevicePagedConsentFreshV3(consent),isCode('MOBILE_PAGED_OWNER_BINDING'));
 c.state.wall=epoch;c.validateDevicePagedConsentFreshV3(consent);
 const signature=sign('sha256',c.devicePagedPermissionMessageV3(consent),{key:key.privateKey,dsaEncoding:'ieee-p1363'});
 c.state.wall=epoch-1000;c.state.monotonic+=14999;
 const original=c.validateDevicePagedConsentFreshV3(consent);
 assert.ok(verify('sha256',c.devicePagedPermissionMessageV3(original),{key:key.publicKey,dsaEncoding:'ieee-p1363'},signature));
 const changed=c.parse(JSON.stringify(consent));changed.expiresAt++;
 assert.throws(()=>c.validateDevicePagedConsentFreshV3(changed),isCode('MOBILE_PAGED_CLOCK_BINDING'));
 c.state.monotonic++;
 assert.throws(()=>c.validateDevicePagedConsentFreshV3(consent),isCode('MOBILE_PAGED_CLOCK_EXPIRED'));
 c.state.wall=epoch-3600000;c.state.monotonic+=15000;
 assert.throws(()=>c.validateDevicePagedConsentFreshV3(consent),isCode('MOBILE_PAGED_CLOCK_EXPIRED'));
});

test('forward wall changes expire a frame before its monotonic deadline',()=>{
 const c=clock(),key='graph:consent:pairing:challenge:nonce',expires=epoch+15000;
 c.assertDevicePagedFrameElapsedV3(key,expires,epoch);
 c.state.monotonic+=1000;c.state.wall=expires;
 assert.throws(()=>c.assertDevicePagedFrameElapsedV3(key,expires,c.state.wall),isCode('MOBILE_PAGED_CLOCK_EXPIRED'));
});

test('status remaining lifetime is latched once and cannot be extended',()=>{
 const c=clock(),key='owner:status:pairing:issued:block',expires=epoch+15000;
 c.state.wall=epoch+14000;
 c.assertDevicePagedFrameElapsedV3(key,expires,c.state.wall);
 c.state.wall=epoch+10000;c.state.monotonic+=1000;
 assert.throws(()=>c.assertDevicePagedFrameElapsedV3(key,expires,c.state.wall),isCode('MOBILE_PAGED_CLOCK_EXPIRED'));
});

test('purged tombstones preserve an expiry watermark under larger rollback',()=>{
 const c=clock(),key='owner:consent:old',expires=epoch+15000;
 c.assertDevicePagedFrameElapsedV3(key,expires,epoch);
 c.state.monotonic+=30000;c.state.wall=epoch+10000;
 assert.throws(()=>c.assertDevicePagedFrameElapsedV3(key,expires,c.state.wall),isCode('MOBILE_PAGED_CLOCK_EXPIRED'));
 assert.throws(()=>c.assertDevicePagedFrameElapsedV3('owner:consent:new-behind-watermark',expires,c.state.wall),isCode('MOBILE_PAGED_CLOCK_EXPIRED'));
 c.assertDevicePagedFrameElapsedV3('owner:consent:new-ahead',epoch+20000,c.state.wall);
});

test('registry is bounded and never evicts active frames or changes their expiry',()=>{
 const c=clock(),expires=epoch+15000;
 for(let i=0;i<512;i++)c.assertDevicePagedFrameElapsedV3('graph:consent:'+i,expires,epoch);
 assert.throws(()=>c.assertDevicePagedFrameElapsedV3('graph:consent:overflow',expires,epoch),isCode('MOBILE_PAGED_CLOCK_CAPACITY'));
 c.assertDevicePagedFrameElapsedV3('graph:consent:0',expires,epoch);
 assert.throws(()=>c.assertDevicePagedFrameElapsedV3('graph:consent:0',expires-1,epoch),isCode('MOBILE_PAGED_CLOCK_BINDING'));
 c.state.monotonic+=30000;c.state.wall=epoch+30000;
 c.assertDevicePagedFrameElapsedV3('graph:consent:after-purge',epoch+45000,c.state.wall);
});

test('peer lead permits at most 3000 ms, using wall without changing it',async()=>{
 const c=clock();await c.awaitDevicePagedIssuedTimeV3(epoch+3000);
 assert.deepEqual(c.state.timers,[3000]);assert.equal(c.devicePagedWallNowV3(),epoch+3000);
 await assert.rejects(c.awaitDevicePagedIssuedTimeV3(epoch+6001),error=>error.message==='MOBILE_PAGED_CLOCK_FUTURE'&&error.clockGapMs===3001);
});

test('peer wait times out monotonically if the wall does not reach issuance',async()=>{
 const c=clock({timerAdvancesWall:false});
 await assert.rejects(c.awaitDevicePagedIssuedTimeV3(epoch+3000),isCode('MOBILE_PAGED_CLOCK_FUTURE'));
 assert.equal(c.devicePagedWallNowV3(),epoch);assert.deepEqual(c.state.timers,[3000]);
});

test('rollback during a peer wait cannot schedule beyond its 3000-ms budget',async()=>{
 const c=clock({timerAdvancesWall:false,onTimer:state=>{if(state.timers.length===1)state.wall=epoch-1500;}});
 await assert.rejects(c.awaitDevicePagedIssuedTimeV3(epoch+1000),isCode('MOBILE_PAGED_CLOCK_FUTURE'));
 assert.deepEqual(c.state.timers,[1000,2000]);assert.equal(c.state.monotonic,3100);
});


test('five-minute consent and two-minute observations tolerate slow work but rollback never renews them',()=>{
 for(const [kind,lifetime]of [['CONSENT',300000],['OBSERVATION',120000]]){
  const c=clock(),key='v41:'+kind,expires=epoch+lifetime;
  c.assertDevicePagedFrameElapsedV41(key,expires,epoch,epoch,kind);
  c.state.wall+=45000;c.state.monotonic+=45000;
  c.assertDevicePagedFrameElapsedV41(key,expires,c.state.wall,epoch,kind);
  c.state.wall=epoch-60000;c.state.monotonic+=lifetime-45000;
  assert.throws(()=>c.assertDevicePagedFrameElapsedV41(key,expires,c.state.wall,epoch,kind),isCode('MOBILE_PAGED_CLOCK_EXPIRED'));
  const future=clock();assert.throws(()=>future.assertDevicePagedFrameElapsedV41(key,expires,epoch-1,epoch,kind),isCode('MOBILE_PAGED_CLOCK_FUTURE'));
  assert.throws(()=>future.assertDevicePagedFrameElapsedV41(key,expires+1,epoch,epoch,kind),isCode('MOBILE_PAGED_CLOCK_ARGUMENTS'));
 }
});

test('new signed consent binds its issue time, accepts 60 seconds and still expires at five minutes',()=>{
 const c=graphClock(),key=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),consent=graphConsent(c,key.publicKey,epoch+600000);
 consent.issuedAt=epoch;consent.expiresAt=epoch+300000;
 const signature=sign('sha256',c.devicePagedGraphPermissionMessageV3(consent),{key:key.privateKey,dsaEncoding:'ieee-p1363'});
 c.validateDevicePagedGraphConsentFreshV3(consent);c.state.wall+=60000;c.state.monotonic+=60000;
 c.validateDevicePagedGraphConsentFreshV3(consent);
 const changed=c.parse(JSON.stringify(consent));changed.issuedAt++;
 assert.equal(verify('sha256',c.devicePagedGraphPermissionMessageV3(changed),{key:key.publicKey,dsaEncoding:'ieee-p1363'},signature),false);
 c.state.wall=epoch+300000;c.state.monotonic+=240000;
 assert.throws(()=>c.validateDevicePagedGraphConsentFreshV3(consent),isGraphCode('MOBILE_PAGED_GRAPH_CONSENT_EXPIRED'));
});
