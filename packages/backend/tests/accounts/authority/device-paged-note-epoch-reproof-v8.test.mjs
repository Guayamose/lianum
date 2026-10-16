/** Actual authority, signed OwnerPoP and encrypted Vault. Seeded proof bytes, deployment and empty
 * OWNER process ports are HOST inert; this does not broadcast or claim a proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,sign,verify,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('PUBLIC epoch reproof requires zero Original Source attempts and preserves pending work',async t=>{
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
 const sourceAttempts=new WeakMap();let sourceReads=0;
 t.mock.module(new URL('../../../src/providers/paged-public-testnet-runtimes-v1.mjs',import.meta.url).href,{exports:{async readOriginalPagedPublicSepoliaSourceRecoveryRowsV8(runtime){assert.ok(originalSystems.has(runtime),'HOST_ORIGINAL_SOURCE_RUNTIME');sourceReads++;return Object.freeze({operations:structuredClone(sourceAttempts.get(runtime)??[])});}}});
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
  f.deployment={...Object.fromEntries(['pool','state','native'].map(key=>[key,{expectedCode:'0x6000',codeHash:'0x'+hash(9)}])),call:async(_,method)=>{assert.ok(['leafCount()','backedAmount()','insertedCommitments(bytes32)'].includes(method));return word(0);}};
  const runtime={metadata:{chainId:isPublic?'11155111':'31337',evmGenesis:hash(1)},receipts:[],block:async()=>{f.reads++;return f.current;},health:async()=>{},assertCanonical:async value=>{f.canonicalReads.push(value);assert.ok(value===head||value===later);assert.ok(!f.reorg,'HOST_WITNESS_REORG');},code:async(_,block)=>{assert.equal(block,head.number);if(f.advance)f.current=later;return f.codeMismatch?'0x6001':'0x6000';}};
  originalSystems.set(runtime,system);fixtures.set(runtime,f);
  const input={origin:'https://localhost:23456',devicePublicKey,journal:{path:join(directory,'jobs-'+n+'.aead'),password:'host-original-public-journal-32bytes'}};
  const ctor=isPublic?A.createOriginalDevicePagedSepoliaGraphNoteAuthorityV4:A.createOriginalDevicePagedGraphNoteAuthorityV3;
  const authority=await ctor(runtime,system,input);t.after(()=>authority.close());return{...f,fixture:f,runtime,system,input,authority};
 }
 function draft(id){return{action:'READ_STATE',jobId:'host-witness-read-'+id,rootId:hash(1),revision:1,mode:null,publicInputs:null,witnessSHA256:null,authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null};}
 const words=h=>Array.from({length:h.length/8},(_,i)=>String(Buffer.from(h,'hex').readUInt32BE(i*4))),proof='01',proofSHA256=createHash('sha256').update(Buffer.from(proof,'hex')).digest('hex');
 async function seeded(stage='PROVED',attempts=[]){
  const f=await fixture(true),v=new Vault(f.input.journal.path),r=await v.read(f.input.journal.password),descriptor=f.authority.descriptor(),publicInputs=[...words(f.system.scope),...words(f.system.policy),'1','10',...words(hash(6))],job={profile:P.DEVICE_PAGED_OWNER_V3,descriptor,jobId:'host-expired-epoch-job',rootId:hash(1),revision:1,mode:'deposit',publicInputs,witnessSHA256:hash(2),proofSHA256,proof,stage,commitment:hash(6),nullifier:hash(7),transactionHash:null,errorCode:null};
  sourceAttempts.set(f.runtime,attempts);await v.update(f.input.journal.password,r.revision,data=>({...data,jobs:[job],pending:stage==='UNKNOWN'?{jobId:job.jobId,from:address(1),to:address(2),value:'10',calldataSHA256:hash(9)}:null}));return{...f,v,job};
 }
 const safe=await seeded(),c=await safe.authority.challenge(draft('epoch-safe')),status=await safe.authority.submit(c,permission(c),null);
 assert.equal(status.jobs[0].stage,'FAILED');assert.equal(status.jobs[0].errorCode,P.DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8);assert.equal(status.jobs[0].jobId,safe.job.jobId);assert.deepEqual(status.jobs[0].publicInputs,safe.job.publicInputs);assert.equal(status.note,null);assert.ok(sourceReads>0);
 for(const phase of ['KEY_PENDING','SIGNED','SUBMITTING','UNKNOWN','CONFIRMED','FINALIZED']){
  const f=await seeded('PROVED',[{phase,command:{identity:hash(3),jobId:'host-expired-epoch-job'},signed:phase==='KEY_PENDING'?null:{nativeId:'0x'+hash(8)}}]),before=await f.v.read(f.input.journal.password),c=await f.authority.challenge(draft('epoch-'+phase.toLowerCase().replaceAll('_','-')));
  await assert.rejects(f.authority.submit(c,permission(c),null),/PAGED_NOTE_EPOCH_RETRY_SOURCE_ATTEMPT_EXISTS/);assert.deepEqual(await f.v.read(f.input.journal.password),before,'failed preflight cannot clear or mutate original Source work');
 }
 const unknown=await seeded('UNKNOWN'),before=await unknown.v.read(unknown.input.journal.password),uc=await unknown.authority.challenge(draft('epoch-unknown')),u=await unknown.authority.submit(uc,permission(uc),null);
 assert.equal(u.jobs[0].stage,'UNKNOWN');assert.deepEqual(await unknown.v.read(unknown.input.journal.password),before,'lost ACK remains the same pending intent');
});
