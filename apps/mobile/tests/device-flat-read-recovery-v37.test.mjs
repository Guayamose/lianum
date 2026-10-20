/** Isolated HOST diagnostic, not a financial/chain reproduction.
 * Uses the real HTTP handler, freshness validator and mobile SDK; account
 * ownership, current() observations and HTTPS sockets are explicit HOST ports.
 * No product sources, public VM, financial journals or real wallet are touched. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {createRequire} from 'node:module';
import * as P from '../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import {createDeviceHttpHost} from '../../../packages/backend/tests/support/device-http-host.mjs';
import {devicePublicKey,signDeviceMessage} from '../src/custody/signing.mjs';
const h=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t){
 const secret=new Uint8Array(32);secret[31]=23;const pub=devicePublicKey(secret),publicKey=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(pub.slice(2,66),'hex').toString('base64url'),y:Buffer.from(pub.slice(66),'hex').toString('base64url')}});
 const descriptor=P.normalizeExternalFlatDescriptorV1({profile:P.DEVICE_EXTERNAL_FLAT_SHARE_V1,origin:'https://localhost:9443',pairingId:h('HOST_CLOCK_PAIR'),devicePublicKey:pub,lifetime:h('HOST_CLOCK_LIFETIME'),poolTerms:Object.fromEntries(['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace'].map(name=>[name,h(name).slice(0,['pool','asset','hub'].includes(name)?40:64)])),assetMetadata:{kind:'ERC20',symbol:'HOST',decimals:18}});
 let wall=Date.now()+2000,ordinal=0,rollbacks=0,readPosts=0,afterReject=null,mode='normal';const grants=new Map();
 const account={challenge(){const value=P.normalizeExternalFlatAccessV1({profile:descriptor.profile,action:'ACCESS',origin:descriptor.origin,pairingId:descriptor.pairingId,devicePublicKey:pub,challengeId:h('HOST_CLOCK_CHALLENGE'+ ++ordinal),nonce:h('HOST_CLOCK_NONCE'+ordinal),expiresAt:Date.now()+15000});grants.set(value.challengeId,{value,used:false,deadline:performance.now()+15000});return value;},async status({access,signature}){
  readPosts++;const grant=grants.get(access.challengeId);assert.ok(grant&&!grant.used&&performance.now()<grant.deadline);assert.deepEqual(access,grant.value);P.validateExternalFlatFreshV1(access);assert.ok(verify('sha256',P.externalFlatPermissionMessageV1(access),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'hex')));grant.used=true;
  await Promise.resolve();if(rollbacks>0){wall-=1000;rollbacks--;}
  assert.ok(performance.now()<grant.deadline);P.validateExternalFlatFreshV1(access);
  return{descriptor,jobs:[],observed:{blockNumber:'1',blockHash:h('HOST_HEAD'),timestamp:'6000'},observedAt:Date.now(),expiresAt:Date.now()+15000,note:{state:'UNISSUED',commitment:null,available:null,backing:null}};
 },close:async()=>{}};
 const host=await createDeviceHttpHost(t,new Map([[account,descriptor]])),clock=mock.method(Date,'now',()=>wall);t.after(()=>clock.mock.restore());
 const listener=await host.api.createOriginalDeviceExternalFlatTlsServerV1({account,tls:host.tls});t.after(()=>listener.close());
 const sdkURL=new URL('../src/api/device-external-flat-note-api-v1.mjs',import.meta.url),crypto=mock.module(createRequire(sdkURL).resolve('expo-crypto'),{namedExports:{digest:async(_algorithm,bytes)=>Uint8Array.from(createHash('sha256').update(new Uint8Array(bytes)).digest()).buffer,CryptoDigestAlgorithm:{SHA256:'SHA-256'}}});t.after(()=>crypto.restore());
 const {createDeviceExternalFlatNoteApiV1}=await import(sdkURL.href+'?read-recovery-'+Math.random());const paths=[];
 const client=createDeviceExternalFlatNoteApiV1({descriptor,fetchImpl:async(url,init)=>{const path=new URL(url).pathname;paths.push(path);assert.ok(['/v1/mobile/external-flat-share/challenges','/v1/mobile/external-flat-share/status'].includes(path),'read recovery cannot invoke a financial route');if(mode==='transport-failure'&&path.endsWith('/status'))throw Error('MOBILE_EXTERNAL_FLAT_RESPONSE_REJECTED_HTTP_STATUS_403');const result=await host.request(0,path,JSON.parse(init.body));if(result.status===403)afterReject?.();if(mode==='invalid-body'&&path.endsWith('/status'))return new Response('not-json',{status:403,headers:{'content-type':'application/json'}});return new Response(result.body,{status:result.status,headers:result.headers});}});t.after(()=>client.close());t.after(()=>secret.fill(0));
 const sign=async access=>signDeviceMessage(secret,P.externalFlatPermissionMessageV1(access));
 return{client,sign,grants,paths,setRollbacks:n=>{rollbacks=n;},onReject:f=>{afterReject=f;},setMode:m=>{mode=m;},readPosts:()=>readPosts};
}
test('one new signed ACCESS recovers real HTTP CLOCK_FUTURE without replaying a consumed read',async t=>{
 const f=await fixture(t),signal=new AbortController().signal;const signed=[];f.setRollbacks(1);
 const result=await f.client.readStatus(async access=>{signed.push(access);return f.sign(access);},signal,()=>{});
 assert.equal(result.jobs.length,0);assert.equal(f.readPosts(),2);assert.equal(f.paths.length,4);assert.notEqual(signed[0].challengeId,signed[1].challengeId);assert.notEqual(signed[0].nonce,signed[1].nonce);
 assert.ok([...f.grants.values()].every(g=>g.used));const before=f.paths.length;await assert.rejects(f.client.status(signed[0],await f.sign(signed[0])));assert.equal(f.paths.length,before);
});
test('a second real HTTP403 remains explicit and cannot create a retry loop',async t=>{
 const f=await fixture(t);f.setRollbacks(3);await assert.rejects(f.client.readStatus(f.sign,new AbortController().signal,()=>{}),/HTTP_STATUS_403/);assert.equal(f.readPosts(),2);assert.equal(f.paths.length,4);
});
test('cancellation or client close after a rejection prevents the second challenge',async t=>{
 for(const close of [false,true]){await t.test(close?'client close':'abort',async t=>{const f=await fixture(t),stop=new AbortController();f.setRollbacks(1);f.onReject(()=>{if(close)f.client.close();else stop.abort();});await assert.rejects(f.client.readStatus(f.sign,stop.signal,()=>{}));assert.equal(f.readPosts(),1);assert.equal(f.paths.length,2);});}
});
test('context changes, arbitrary transport errors and invalid bodies never trigger recovery',async t=>{
 for(const mode of ['context-change','transport-failure','invalid-body']){await t.test(mode,async t=>{const f=await fixture(t);let changed=false;if(mode==='context-change'){f.setRollbacks(1);f.onReject(()=>{changed=true;});}else f.setMode(mode);await assert.rejects(f.client.readStatus(f.sign,new AbortController().signal,()=>{if(changed)throw Error('HOST_CONTEXT_CHANGED');}));assert.equal(f.readPosts(),mode==='transport-failure'?0:1);assert.equal(f.paths.length,2);});}
});
