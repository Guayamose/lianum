/** Applied original authority issuance/capture and recipient revocation, under inert
 * HOST chain/OWNER/journal ports. No SDK, RPC, listener, prover or financial claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {generateKeyPairSync} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {lstatSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=fileURLToPath(new URL('../../../../../',import.meta.url)).replace(/\/$/,''),authorityURL=new URL('../../../src/accounts/authority/device-paged-note-authority-v3.mjs',import.meta.url),authoritySource=await readFile(authorityURL,'utf8');

test('original capture retires an abandoned READ only on its original deadline; cleanup errors remain closed',async t=>{
 let wall=1791936000000,elapsed=0,current=null,waited=0,waitCalls=0,afterWait=null;
 t.mock.method(Date,'now',()=>wall);t.mock.method(performance,'now',()=>elapsed);
 const actualSetTimeout=globalThis.setTimeout;
 // Test-only trusted clock: advance exactly the requested interval. Production
 // applied wait/capture source is unmodified; no production clock-injection API exists.
 t.mock.method(globalThis,'setTimeout',(fn,delay,...args)=>actualSetTimeout(()=>{elapsed+=delay;wall+=delay;waited+=delay;waitCalls++;afterWait?.();fn(...args);},0));
 const P=await import(root+'/packages/mobile-protocol/src/device-paged-owner-v3.mjs'),C=await import(root+'/packages/mobile-protocol/src/device-paged-graph-v3.mjs');
 const {noteNodeHash}=await import(root+'/packages/engine/src/notes/private-note-tree.mjs');
 const hash=n=>String(n).repeat(64),address=n=>'0x'+String(n).repeat(40),word=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),zero=hash(0);
 const device=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),pub=device.publicKey.export({format:'jwk'}),devicePublicKey='04'+Buffer.from(pub.x,'base64url').toString('hex')+Buffer.from(pub.y,'base64url').toString('hex');
 const systems=new WeakMap();
 const deploymentURL=new URL('file://'+root+'/packages/backend/src/operations/local/funded-graph-paged-deployment-v3.mjs');
 t.mock.module(deploymentURL.href,{exports:{assertOriginalFundedPagedGraphWalletV3:(runtime,system)=>assert.strictEqual(systems.get(runtime),system),readOriginalFundedPagedGraphDeploymentV3:runtime=>runtime.fixture.deployment,pagedGraphProofDataV3(){throw Error('HOST_PROOF_FORBIDDEN');},pagedGraphStaticDataV3(){throw Error('HOST_SEND_FORBIDDEN');}}});
 t.mock.module('@lianum/engine/crypto/vault',{exports:{Vault:class{
  constructor(){this.fixture=current;this.fixture.vault=this;}
  async create(value){this.record={revision:0,data:structuredClone(value)};this.fixture.creates++;return structuredClone(this.record);}
  async read(){return structuredClone(this.record);}
  async update(){throw Error('HOST_JOURNAL_UPDATE_FORBIDDEN');}
 }}});
 const graphURL=new URL('file://'+root+'/packages/engine/src/execution/local/device-paged-graph-client-v3.mjs');
 t.mock.module(graphURL.href,{exports:{async createOriginalDevicePagedGraphClientV3(descriptor){const f=current;return {checkpoint:()=>({profile:'DEVICE_PAGED_OWNER_DURABLE_CHECKPOINT_V3',descriptorSHA256:hash(1),revision:0,dataSHA256:hash(2),public:f.vault.record.data.graph?.public??null}),async close(){f.ownerCloses++;},async prepare(action,jobId){const {createPrivateProofRecipientV1,readPrivateProofRecipientV1}=await import(root+'/packages/engine/src/crypto/private-proof-transit-v1.mjs');f.ownerPrepared=createPrivateProofRecipientV1({relation:P.DEVICE_PAGED_MODES_V3[C.DEVICE_PAGED_GRAPH_COMMANDS_V3[action]].relation,role:P.DEVICE_PAGED_MODES_V3[C.DEVICE_PAGED_GRAPH_COMMANDS_V3[action]].role,jobId});return readPrivateProofRecipientV1(f.ownerPrepared);},async discardReady(){f.ownerDiscards++;if(f.discardFailure)throw Error('HOST_ORIGINAL_DISCARD_FAILED');const {closePrivateProofRecipientV1}=await import(root+'/packages/engine/src/crypto/private-proof-transit-v1.mjs');closePrivateProofRecipientV1(f.ownerPrepared);f.ownerPrepared=null;},ownerReopenRequired:()=>false};},reopenOriginalDevicePagedGraphClientV3(){throw Error('HOST_REOPEN_FORBIDDEN');},readOriginalDevicePagedGraphResultV3(){throw Error('HOST_RESULT_FORBIDDEN');},readOriginalDevicePagedNativeReadyV3(){throw Error('HOST_NATIVE_FORBIDDEN');}}});
 const proofURL=new URL('file://'+root+'/packages/engine/src/execution/local/device-paged-proof-client-v3.mjs');
 t.mock.module(proofURL.href,{exports:{async prepareOriginalDevicePagedProofClientV3(mode,jobId){const f=current;const {createPrivateProofRecipientV1,readPrivateProofRecipientV1,closePrivateProofRecipientV1}=await import(root+'/packages/engine/src/crypto/private-proof-transit-v1.mjs');const recipient=createPrivateProofRecipientV1({relation:P.DEVICE_PAGED_MODES_V3[mode].relation,role:P.DEVICE_PAGED_MODES_V3[mode].role,jobId});return {ready:()=>readPrivateProofRecipientV1(recipient),async close(){f.proofCloses++;if(f.proofCloseFailure)throw Error('HOST_ORIGINAL_CLIENT_CLOSE_FAILED');closePrivateProofRecipientV1(recipient);},submit(){throw Error('HOST_PROOF_SUBMIT_FORBIDDEN');}};},readOriginalDevicePagedProofResultV3(){throw Error('HOST_PROOF_FORBIDDEN');}}});
 const A=await import(authorityURL.href);
 async function fixture(){
  wall+=30001; // New fixture epochs remain ahead of the original expired-frame watermark.
  const directory=await mkdtemp(join(tmpdir(),'paged-capture-draft-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const f={creates:0,ownerCloses:0,ownerDiscards:0,proofCloses:0,proofCloseFailure:false};current=f;
  const system={profile:P.DEVICE_PAGED_GRAPH_V3,manifestSHA256:hash(1),consumerSHA256:hash(2),pool:address(1),state:address(2),native:address(3),scope:hash(3),policy:hash(4),assetIdentity:hash(5),domain:hash(6),hubDomain:hash(7),registryCommitment:hash(8),deployments:[{name:'PagedSparsePoseidon2V3',address:address(4),codeHash:'0x'+hash(9)}]};
  const head={number:'0x1',hash:'0x'+hash(9),timestamp:'0x4b0'};
  const runtime={fixture:f,metadata:{chainId:'31337',evmGenesis:hash(1)},receipts:[],block:async()=>head,assertCanonical:async actual=>assert.strictEqual(actual,head),code:async()=> '0x6000',health:async()=>{}};systems.set(runtime,system);
  f.deployment={...Object.fromEntries(['pool','state','native'].map(key=>[key,{expectedCode:'0x6000',codeHash:'0x'+hash(9)}])),ledgerLeaves:async()=>{let root='0x'+hash(1),empty='0x'+zero;for(let i=0;i<8;i++){root=noteNodeHash(root,empty);empty=noteNodeHash(empty,empty);}return{leaves:['0x'+hash(1)],root};},call:async(_,method)=>{if(['leafCount()','backedAmount()','spentNullifiers(bytes32)','revocationSequence()'].includes(method))return word(0);if(['evidenceState()','receiptRoot()'].includes(method))return '0x'+hash(9);throw Error('HOST_CHAIN_PORT_UNEXPECTED');}};
  f.authority=await A.createOriginalDevicePagedGraphNoteAuthorityV3(runtime,system,{origin:'https://127.0.0.1:9443',devicePublicKey,journal:{path:join(directory,'jobs.aead'),password:'host-inert-capture-journal-32bytes'}});t.after(()=>f.authority.close());return f;
 }
 function setupGraph(f){f.vault.record.data.jobs=[{mode:'deposit',stage:'CONFIRMED',commitment:hash(1),nullifier:hash(2),rootId:hash(1),revision:1}];const publicState={authorizationRoot:hash(3),reserveNullifier:hash(4),progressCommitment:hash(5),readyCommitment:null,sourceCommitment:hash(1),sourceNullifier:hash(2),pages:0,nodes:0,budget:'400',settleBefore:'40000',phase:'BUILDING'};f.vault.record.data.graph={graphId:'host-capture-graph-001',rootId:hash(1),revision:1,phase:'BUILDING',public:publicState,work:null,pending:null};return publicState;}
 function readDraft(){return {action:'READ_STATE',jobId:'host-capture-read-'+Math.round(elapsed),rootId:hash(1),revision:1,mode:null,publicInputs:null,witnessSHA256:null,authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null};}
 await t.test('original pause retains OWNER and journal, rejects copied handle and still permits controlled capture',async()=>{const f=await fixture(),before=structuredClone(f.vault.record);await assert.rejects(A.pauseOriginalDevicePagedApprovedContinuationV4({...f.authority}),/PAGED_GRAPH_ORIGINAL_BIRTH/);await A.pauseOriginalDevicePagedApprovedContinuationV4(f.authority);assert.deepEqual(f.vault.record,before);assert.equal(f.ownerCloses,0);assert.equal(f.creates,1);const retained=await A.captureOriginalDevicePagedGraphAuthorityV3(f.authority);assert.equal(retained.journalRevision,before.revision);assert.equal(f.ownerCloses,1);});
 await t.test('already expired original READ: immediate capture, no journal or proof effect',async()=>{const f=await fixture();const c=await f.authority.challenge(readDraft());elapsed+=15001;const before=waited;const result=await A.captureOriginalDevicePagedGraphAuthorityV3(f.authority);assert.equal(result.profile,'DEVICE_PAGED_AUTHORITY_RETAINED_V3');assert.equal(result.journalRevision,0);assert.equal(waited,before);assert.equal(f.ownerCloses,1);assert.equal(f.creates,1);await assert.rejects(f.authority.submit(c,'0'.repeat(128),null));});
 await t.test('still-valid abandoned original READ waits exactly its first 15s, without renewal',async()=>{const f=await fixture();const c=await f.authority.challenge(readDraft());const before=waited,starts=elapsed;const retained=await A.captureOriginalDevicePagedGraphAuthorityV3(f.authority);assert.equal(waited-before,15000);assert.equal(elapsed-starts,15000);assert.equal(c.expiresAt,wall);assert.equal(retained.journalRevision,0);assert.equal(f.ownerCloses,1);});
 await t.test('original portfolio recipient is revoked through channel after expiry; nothing submitted',async()=>{const f=await fixture();const publicState=setupGraph(f);
  const c=await f.authority.graphChallenge({action:'READ_PORTFOLIO',graphId:'host-capture-graph-001',jobId:'host-capture-portfolio-001',rootId:hash(1),revision:1,commandSHA256:hash(2),replyPublicKey:generateKeyPairSync('x25519').publicKey.export({format:'der',type:'spki'}).toString('base64')});
  elapsed+=15001;const result=await A.captureOriginalDevicePagedGraphAuthorityV3(f.authority);assert.deepEqual(result.ownerCheckpoint.public,publicState);assert.equal(f.ownerDiscards,0,'real portfolio channel owns the recipient; generic OWNER never discards it');assert.equal(f.ownerCloses,1);assert.equal(f.creates,1);assert.equal(c.action,'READ_PORTFOLIO');
 });
 await t.test('original OWNER ready cleanup failure blocks capture and preserves challenge',async()=>{const f=await fixture();setupGraph(f);const c=await f.authority.graphChallenge({action:'READ_GRAPH',graphId:'host-capture-graph-001',jobId:'host-capture-owner-read-001',rootId:hash(1),revision:1,commandSHA256:hash(2),replyPublicKey:generateKeyPairSync('x25519').publicKey.export({format:'der',type:'spki'}).toString('base64')});elapsed+=15001;f.discardFailure=true;await assert.rejects(A.captureOriginalDevicePagedGraphAuthorityV3(f.authority),/HOST_ORIGINAL_DISCARD_FAILED/);assert.equal(f.ownerCloses,0);assert.equal(f.ownerDiscards,1);f.discardFailure=false;await A.captureOriginalDevicePagedGraphAuthorityV3(f.authority);assert.equal(f.ownerDiscards,2);assert.equal(f.ownerCloses,1);assert.equal(c.action,'READ_GRAPH');});
 await t.test('future/malformed or changed original expiry cannot be classified as expired',async()=>{const f=await fixture();setupGraph(f);const c=await f.authority.graphChallenge({action:'READ_PORTFOLIO',graphId:'host-capture-graph-001',jobId:'host-capture-portfolio-bind-001',rootId:hash(1),revision:1,commandSHA256:hash(2),replyPublicKey:generateKeyPairSync('x25519').publicKey.export({format:'der',type:'spki'}).toString('base64')});
  // The classifier is private; evaluate its exact current source with the real
 // protocol modules to cover rejected data that the original issuer never stores.
 const start=authoritySource.indexOf(' function captureConsentExpired('),end=authoritySource.indexOf(' async function retireExpiredCapturePermissions',start);assert.ok(start>0&&end>start);const box={P,C,assert,Error,classify:null};vm.runInNewContext(authoritySource.slice(start,end)+'\nthis.classify=captureConsentExpired;',box);
  assert.equal(box.classify(c,true),false);
  const future={...c,challengeId:'host-new-future-key-001',expiresAt:c.expiresAt+1000};assert.throws(()=>box.classify(future,true),error=>error.code==='MOBILE_PAGED_GRAPH_CONSENT_FUTURE');
  assert.throws(()=>box.classify({...c,expiresAt:c.expiresAt+1},true),/MOBILE_PAGED_CLOCK_BINDING/);
  assert.throws(()=>box.classify({...c,nonce:'z'.repeat(64)},true));
  elapsed+=15000;assert.equal(box.classify(c,true),true,'same exact frame expires at its first monotonic deadline despite still-fresh wall epoch');
  await A.captureOriginalDevicePagedGraphAuthorityV3(f.authority);
 });
 await t.test('new queued work during wait rejects capture instead of granting quiescence',async()=>{const f=await fixture();await f.authority.challenge(readDraft());let queued;afterWait=()=>{afterWait=null;queued=f.authority.challenge({...readDraft(),jobId:'host-capture-new-queued'});queued.catch(()=>{});};await assert.rejects(A.captureOriginalDevicePagedGraphAuthorityV3(f.authority),/PAGED_AUTHORITY_CAPTURE_QUEUED/);await queued;assert.equal(f.ownerCloses,0);});
 await t.test('revision changed during wait rejects checkpoint; cleanup is not financial recovery',async()=>{const f=await fixture();await f.authority.challenge(readDraft());afterWait=()=>{afterWait=null;f.vault.record.revision++;};await assert.rejects(A.captureOriginalDevicePagedGraphAuthorityV3(f.authority),/PAGED_AUTHORITY_CAPTURE_JOURNAL_CHANGED/);assert.equal(f.ownerCloses,0);});
 assert.ok(waitCalls>0);
});

test('finite capture metadata: original AssertionError code, public location-only six frames, no raw error data',async()=>{
 const source=await readFile(new URL('../../../src/operations/local/funded-paged-native-operator-v3.mjs',import.meta.url),'utf8');
 // Diagnostics are private; evaluate their exact current source without
 // constructing an operator, listener, provider or recovery grant.
 const start=source.indexOf('const captureStages='),end=source.indexOf('const startupStages=');assert.ok(start>0&&end>start);
 const fragment=source.slice(start,end).replace('export function readOriginalPagedCaptureFailureV3','function readOriginalPagedCaptureFailureV3');
 const box={Error,captureProjectRoot:root,lstatSync,realpathSync,fileURLToPath,relative,console:{error(){}},exports:null};vm.runInNewContext(fragment+'\nthis.exports={reportCaptureFailure,readOriginalPagedCaptureFailureV3};',box);
 const known=new assert.AssertionError({message:'PAGED_AUTHORITY_CAPTURE_QUIESCENT',actual:'NEVER_EMIT_PRIVATE_ACTUAL',expected:0});
 assert.equal(box.exports.reportCaptureFailure('GRAPH',known).code,'PAGED_AUTHORITY_CAPTURE_QUIESCENT');
 const unknown=Error('NEVER_EMIT_PRIVATE_MESSAGE');unknown.stack='Error: NEVER_EMIT_PRIVATE_MESSAGE\n'+Array.from({length:8},(_,i)=>'    at privateFunction_NEVER_EMIT (file://'+root+'/packages/backend/src/accounts/authority/device-paged-note-authority-v3.mjs:'+(217+i)+':138)').join('\n')+'\n    at unknown (/private/password.txt:1:1)';
 const metadata=box.exports.reportCaptureFailure('GRAPH',unknown);assert.equal(metadata.code,'UNCLASSIFIED');assert.equal(metadata.sourceFrames.length,6);assert.equal(metadata.sourceFrames[0].path,'packages/backend/src/accounts/authority/device-paged-note-authority-v3.mjs');assert.deepEqual(Object.keys(metadata.sourceFrames[0]).sort(),['column','line','path']);assert.ok(!JSON.stringify(metadata).includes('PRIVATE'));assert.ok(!JSON.stringify(metadata).includes('privateFunction'));assert.ok(!JSON.stringify(metadata).includes('/private/'));assert.strictEqual(box.exports.readOriginalPagedCaptureFailureV3(unknown),metadata);
 const outside=Error('PRIVATE_OUTSIDE');outside.stack='Error: PRIVATE_OUTSIDE\n    at synthetic (file:///private/config/ignored/packages/backend/src/accounts/authority/device-paged-note-authority-v3.mjs:217:138)\n    at nonexistent (file://'+root+'/packages/backend/src/accounts/authority/not-an-original-file.mjs:1:1)';assert.equal(box.exports.reportCaptureFailure('GRAPH',outside).sourceFrames.length,0);
});
