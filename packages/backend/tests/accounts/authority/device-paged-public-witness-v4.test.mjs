/** Actual authority, signed OwnerPoP and encrypted Vault. Deployment and empty
 * OWNER process ports are HOST inert; this does not broadcast or claim a proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,sign,verify} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('PUBLIC source reads retain a canonical witness while the chain advances; LOCAL still requires the exact head',async t=>{
 const P=await import('../../../../mobile-protocol/src/device-paged-owner-v3.mjs');
 const hash=n=>String(n).repeat(64),address=n=>'0x'+String(n).repeat(40),word=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
 const originalSystems=new WeakMap(),fixtures=new WeakMap();
 const deploymentURL=new URL('../../../src/operations/local/funded-graph-paged-deployment-v3.mjs',import.meta.url);
 t.mock.module(deploymentURL.href,{exports:{
  assertOriginalFundedPagedGraphWalletV3:(runtime,system)=>assert.strictEqual(originalSystems.get(runtime),system,'HOST_ORIGINAL_DEPLOYMENT'),
  readOriginalFundedPagedGraphDeploymentV3:runtime=>fixtures.get(runtime).deployment,
  pagedGraphProofDataV3(){throw Error('HOST_PROOF_FORBIDDEN');},pagedGraphStaticDataV3(){throw Error('HOST_EFFECT_FORBIDDEN');}
 }});
 const graphURL=new URL('../../../../engine/src/execution/local/device-paged-graph-client-v3.mjs',import.meta.url);
 t.mock.module(graphURL.href,{exports:{
  async createOriginalDevicePagedGraphClientV3(){return Object.freeze({async close(){},ownerReopenRequired:()=>false});},
  reopenOriginalDevicePagedGraphClientV3(){throw Error('HOST_REOPEN_FORBIDDEN');},
  readOriginalDevicePagedGraphResultV3(){throw Error('HOST_RESULT_FORBIDDEN');},
  readOriginalDevicePagedNativeReadyV3(){throw Error('HOST_NATIVE_FORBIDDEN');}
 }});
 // Fixed PUBLIC kernel journal/permission ports are HOST here. They share the
 // real Vault with Authority and retain explicit opaque original fixture tokens;
 // Native's kernel focal separately covers its producer and financial caps.
 const {Vault}=await import('@lianum/engine/crypto/vault');
 const bundles=new WeakMap(),journals=new WeakMap(),permissions=new WeakMap(),consumed=new WeakMap();
 const kernelURL=new URL('../../../src/operations/local/funded-graph-paged-public-kernel-v4.mjs',import.meta.url);
 t.mock.module(kernelURL.href,{exports:{
  async createOriginalPagedSepoliaSourceJournalV4(runtime,system,input){
   assert.strictEqual(originalSystems.get(runtime),system,'HOST_ORIGINAL_DEPLOYMENT');assert.equal(system.receiverProfile,'ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4','PAGED_AUTHORITY_RECEIVER_PROFILE');
   const d=fixtures.get(runtime).deployment,math=system.deployments[0],head=await runtime.block(),descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:input.origin,devicePublicKey:input.devicePublicKey,chainId:runtime.metadata.chainId,genesis:runtime.metadata.evmGenesis,...Object.fromEntries(['pool','state','native','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256'].map(k=>[k,system[k]])),poolCodeHash:d.pool.codeHash.slice(2),stateCodeHash:d.state.codeHash.slice(2),nativeCodeHash:d.native.codeHash.slice(2),math:math.address,mathCodeHash:math.codeHash.slice(2),pairingId:'host-public-source-'+randomBytes(8).toString('hex'),deadlineMs:P.devicePagedNowV3()+9*60*60*1000,chainDeadlineSeconds:(BigInt(head.timestamp)+32400n).toString()});
   const identity=randomBytes(32).toString('hex'),vault=new Vault(input.journal.path);await vault.create({schema:P.DEVICE_PAGED_OWNER_V3,identity,descriptor,jobs:[],pending:null,graph:null},input.journal.password);
   const journalToken=Object.freeze({}),bundle=Object.freeze({journalToken,vault,descriptor,identity,opening:null});journals.set(journalToken,{descriptor,closed:false});bundles.set(bundle,{runtime,system});return bundle;
  },
  assertOriginalPagedSepoliaSourceJournalV4(runtime,system,bundle){assert.deepEqual(bundles.get(bundle),{runtime,system},'HOST_ORIGINAL_JOURNAL_BUNDLE');},
  issueOriginalPagedSepoliaSourcePermissionV4(journalToken,raw){const j=journals.get(journalToken);assert.ok(j&&!j.closed);const consent=P.validateDevicePagedConsentFreshV3(raw);assert.deepEqual(consent.descriptor,j.descriptor);const token=Object.freeze({});permissions.set(token,{journalToken,consent,used:false});return token;},
  consumeOriginalPagedSepoliaSourcePermissionV4(journalToken,token,sig){const p=permissions.get(token);assert.ok(p&&p.journalToken===journalToken&&!p.used);P.validateDevicePagedConsentFreshV3(p.consent);assert.ok(verify('sha256',P.devicePagedPermissionMessageV3(p.consent),{key:device.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(sig,'hex')));p.used=true;const grant=Object.freeze({});consumed.set(grant,p);return grant;},
  readOriginalPagedSepoliaSourcePermissionV4(journalToken,token){const p=consumed.get(token);assert.ok(p?.journalToken===journalToken);return{kind:'note',consent:p.consent};},
  closeOriginalPagedSepoliaSourceJournalV4(token){const j=journals.get(token);assert.ok(j);j.closed=true;}
 }});
 const A=await import('../../../src/accounts/authority/device-paged-note-authority-v3.mjs');
 const device=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),jwk=device.publicKey.export({format:'jwk'});
 const devicePublicKey='04'+Buffer.from(jwk.x,'base64url').toString('hex')+Buffer.from(jwk.y,'base64url').toString('hex');
 const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
 function permission(consent){let value=sign('sha256',P.devicePagedPermissionMessageV3(consent),{key:device.privateKey,dsaEncoding:'ieee-p1363'});const s=BigInt('0x'+value.subarray(32).toString('hex'));if(s>order/2n)value=Buffer.concat([value.subarray(0,32),Buffer.from((order-s).toString(16).padStart(64,'0'),'hex')]);return value.toString('hex');}
 const directory=await mkdtemp(join(tmpdir(),'paged-public-witness-'));t.after(()=>rm(directory,{recursive:true,force:true}));let serial=0;
 async function fixture(isPublic){
  const n=++serial,head={number:'0x1',hash:'0x'+hash(8),timestamp:'0x4b0'},later={number:'0x2',hash:'0x'+hash(9),timestamp:'0x4bc'};
  const f={head,later,current:head,advance:false,reorg:false,codeMismatch:false,reads:0,canonicalReads:[]};
  const system={profile:P.DEVICE_PAGED_GRAPH_V3,...(isPublic?{receiverProfile:'ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4'}:{}),manifestSHA256:hash(1),consumerSHA256:hash(2),pool:address(1),state:address(2),native:address(3),scope:hash(3),policy:hash(4),assetIdentity:hash(5),domain:hash(6),hubDomain:hash(7),registryCommitment:hash(8),deployments:[{name:'PagedSparsePoseidon2V3',address:address(4),codeHash:'0x'+hash(9)}]};
  f.deployment={...Object.fromEntries(['pool','state','native'].map(key=>[key,{expectedCode:'0x6000',codeHash:'0x'+hash(9)}])),call:async(_,method)=>{assert.ok(['leafCount()','backedAmount()'].includes(method));return word(0);}};
  const runtime={metadata:{chainId:isPublic?'11155111':'31337',evmGenesis:hash(1)},receipts:[],block:async()=>{f.reads++;return f.current;},health:async()=>{},assertCanonical:async value=>{f.canonicalReads.push(value);assert.ok(value===head||value===later);assert.ok(!f.reorg,'HOST_WITNESS_REORG');},code:async(_,block)=>{assert.equal(block,head.number);if(f.advance)f.current=later;return f.codeMismatch?'0x6001':'0x6000';}};
  originalSystems.set(runtime,system);fixtures.set(runtime,f);
  const input={origin:'https://localhost:23456',devicePublicKey,journal:{path:join(directory,'jobs-'+n+'.aead'),password:'host-original-public-journal-32bytes'}};
  const ctor=isPublic?A.createOriginalDevicePagedSepoliaGraphNoteAuthorityV4:A.createOriginalDevicePagedGraphNoteAuthorityV3;
  const authority=await ctor(runtime,system,input);t.after(()=>authority.close());return{...f,fixture:f,runtime,system,input,authority};
 }
 function draft(id){return{action:'READ_STATE',jobId:'host-witness-read-'+id,rootId:hash(1),revision:1,mode:null,publicInputs:null,witnessSHA256:null,authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null};}
 await t.test('public constructor requires its original PUBLIC deployment and cannot accept LOCAL or copied system',async()=>{
  const local=await fixture(false);
  await assert.rejects(A.createOriginalDevicePagedSepoliaGraphNoteAuthorityV4(local.runtime,local.system,local.input),/PAGED_AUTHORITY_RECEIVER_PROFILE/);
  const pub=await fixture(true);
  await assert.rejects(A.createOriginalDevicePagedGraphNoteAuthorityV3(pub.runtime,pub.system,pub.input),/PAGED_AUTHORITY_RECEIVER_PROFILE/);
  await assert.rejects(A.createOriginalDevicePagedSepoliaGraphNoteAuthorityV4(pub.runtime,{...pub.system},pub.input),/HOST_ORIGINAL_DEPLOYMENT/);
 });
 await t.test('PUBLIC head advancement preserves the exact original canonical witness',async()=>{
  const f=await fixture(true),consent=await f.authority.challenge(draft('public'));f.fixture.advance=true;
  const status=await f.authority.submit(consent,permission(consent),null);
  assert.equal(f.fixture.current,f.fixture.later);assert.equal(status.blockHash,f.fixture.head.hash);assert.equal(status.blockNumber,'1');
  assert.ok(f.fixture.canonicalReads.filter(h=>h===f.fixture.head).length>=2);
 });
 await t.test('LOCAL advancement remains rejected by its existing quiet-head guard',async()=>{
  const f=await fixture(false),consent=await f.authority.challenge(draft('local'));f.fixture.advance=true;
  await assert.rejects(f.authority.submit(consent,permission(consent),null),/PAGED_DEVICE_HEAD_CHANGED/);
 });
 await t.test('PUBLIC reorg and changed deployment code stay rejected',async()=>{
  const first=await fixture(true),c1=await first.authority.challenge(draft('reorg'));first.fixture.reorg=true;
  await assert.rejects(first.authority.submit(c1,permission(c1),null),/HOST_WITNESS_REORG/);
  const second=await fixture(true),c2=await second.authority.challenge(draft('code'));second.fixture.codeMismatch=true;
  await assert.rejects(second.authority.submit(c2,permission(c2),null),error=>error.code==='ERR_ASSERTION');
 });
});
