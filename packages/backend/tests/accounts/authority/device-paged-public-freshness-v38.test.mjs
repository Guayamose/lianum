/** Actual authority, signed OwnerPoP and encrypted Vault. Deployment and empty
 * OWNER process ports are HOST inert; this does not broadcast or claim a proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,sign,verify,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('PUBLIC cold history and slow proof handoff preserve current state and signed intake bounds',async t=>{
 const wallNow=Date.now.bind(Date),elapsedNow=performance.now.bind(performance);let offset=0;
 t.mock.method(Date,'now',()=>wallNow()+offset);t.mock.method(performance,'now',()=>elapsedNow()+offset);
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
 const {canonical}=await import('@lianum/engine/crypto/privacy');
 const H=value=>createHash('sha256').update(canonical(value)).digest('hex');
 const Transit=await import('@lianum/engine/crypto/private-proof-transit-v1');
 const realProofPorts=await import('@lianum/engine/execution/local/device-paged-proof-client-v3');
 let acceptedProof=false,activeProofFixture=null;
 t.mock.module('@lianum/engine/execution/local/device-paged-proof-client-v3',{exports:{...realProofPorts,
  prepareOriginalDevicePagedProofClientV3(){assert.fail('HOST_LOCAL_PROOF_FORBIDDEN');},
  readOriginalDevicePagedProofResultV3(){assert.fail('HOST_PROOF_RESULT_FORBIDDEN');},
  async prepareOriginalDevicePagedDurableProofClientV6(mode,jobId,manifest,descriptor){
   const recipient=Transit.createPrivateProofRecipientV1({relation:'deposit_balance',role:'owner',jobId}),ready=Transit.readPrivateProofRecipientV1(recipient);let checkpoint=null;
   return {ready:()=>ready,checkpoint:()=>checkpoint,
    async prepareProofIntentV6(cipher,consent){P.validateDevicePagedConsentFreshV3(consent);assert.equal(consent.mode,mode);assert.deepEqual(consent.recipient,ready);assert.equal(cipher.authorization.consentSHA256,createHash('sha256').update(P.devicePagedPermissionMessageV3(consent)).digest('hex'));acceptedProof=true;activeProofFixture.delayAfterAcceptance=20000;checkpoint={profile:'DEVICE_PAGED_NOTE_PROOF_CHECKPOINT_V6',descriptorSHA256:H(descriptor),revision:0,dataSHA256:hash(8),public:{jobId,mode,rootId:consent.rootId,sourceRevision:consent.revision,consentSHA256:cipher.authorization.consentSHA256,witnessSHA256:consent.witnessSHA256,publicInputsSHA256:H(consent.publicInputs),stage:'INTENT'}};return Object.freeze({});},
    async continueProofIntentV6(){assert.ok(acceptedProof);assert.equal(activeProofFixture.delayAfterAcceptance,0);throw Error('HOST_STOP_AFTER_DURABLE_ACCEPTANCE');},
    async close(){Transit.closePrivateProofRecipientV1(recipient);}
   };
  }
 }});
 t.mock.module(new URL('../../../src/providers/paged-public-testnet-runtimes-v1.mjs',import.meta.url).href,{exports:{async readOriginalPagedPublicSepoliaSourceRecoveryRowsV8(){return{operations:[]};}}});
 const A=await import('../../../src/accounts/authority/device-paged-note-authority-v3.mjs');
 const device=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),jwk=device.publicKey.export({format:'jwk'});
 const devicePublicKey='04'+Buffer.from(jwk.x,'base64url').toString('hex')+Buffer.from(jwk.y,'base64url').toString('hex');
 const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
 function permission(consent){let value=sign('sha256',P.devicePagedPermissionMessageV3(consent),{key:device.privateKey,dsaEncoding:'ieee-p1363'});const s=BigInt('0x'+value.subarray(32).toString('hex'));if(s>order/2n)value=Buffer.concat([value.subarray(0,32),Buffer.from((order-s).toString(16).padStart(64,'0'),'hex')]);return value.toString('hex');}
 const directory=await mkdtemp(join(tmpdir(),'paged-public-witness-'));t.after(()=>rm(directory,{recursive:true,force:true}));let serial=0;
 async function fixture(isPublic){
  const n=++serial,head={number:'0x1',hash:'0x'+hash(8),timestamp:'0x4b0'},later={number:'0x2',hash:'0x'+hash(9),timestamp:'0x4bc'};
  const f={head,later,current:head,advance:false,reorg:false,codeMismatch:false,reads:0,canonicalReads:[],ledgerDelay:0,delayAfterAcceptance:0,advanceClock:()=>{},root:null,currentRoot:null,leaves:['0x'+hash(6)],ledgerReads:0,ledgerGate:null,ledgerEntered:null,spent:0,backed:20,currentReadDelay:0};
  const system={profile:P.DEVICE_PAGED_GRAPH_V3,...(isPublic?{receiverProfile:'ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4'}:{}),manifestSHA256:hash(1),consumerSHA256:hash(2),pool:address(1),state:address(2),native:address(3),scope:hash(3),policy:hash(4),assetIdentity:hash(5),domain:hash(6),hubDomain:hash(7),registryCommitment:hash(8),deployments:[{name:'PagedSparsePoseidon2V3',address:address(4),codeHash:'0x'+hash(9)}]};
  f.deployment={...Object.fromEntries(['pool','state','native'].map(key=>[key,{expectedCode:'0x6000',codeHash:'0x'+hash(9)}])),call:async(_,method)=>{assert.ok(['leafCount()','backedAmount()','spentNullifiers(bytes32)','currentRoot()'].includes(method));if(method==='spentNullifiers(bytes32)'){f.advanceClock(f.currentReadDelay);f.currentReadDelay=0;}return method==='spentNullifiers(bytes32)'?word(f.spent):method==='backedAmount()'?word(f.backed):method==='currentRoot()'?f.currentRoot:word(0);},ledgerLeaves:async()=>{f.ledgerReads++;f.ledgerEntered?.();if(f.ledgerGate)await f.ledgerGate;f.advanceClock(f.ledgerDelay);return{leaves:[...f.leaves],root:f.root};}};
  const runtime={metadata:{chainId:isPublic?'11155111':'31337',evmGenesis:hash(1)},receipts:[],block:async()=>{f.reads++;return f.current;},health:async()=>{f.advanceClock(f.delayAfterAcceptance);f.delayAfterAcceptance=0;},assertCanonical:async value=>{f.canonicalReads.push(value);assert.ok(value===head||value===later);assert.ok(!f.reorg,'HOST_WITNESS_REORG');},code:async(_,block)=>{assert.equal(block,head.number);if(f.advance)f.current=later;return f.codeMismatch?'0x6001':'0x6000';}};
  originalSystems.set(runtime,system);fixtures.set(runtime,f);
  const input={origin:'https://localhost:23456',devicePublicKey,journal:{path:join(directory,'jobs-'+n+'.aead'),password:'host-original-public-journal-32bytes'}};
  const ctor=isPublic?A.createOriginalDevicePagedSepoliaGraphNoteAuthorityV4:A.createOriginalDevicePagedGraphNoteAuthorityV3;
  const authority=await ctor(runtime,system,input);t.after(()=>authority.close());return{...f,fixture:f,runtime,system,input,authority};
 }
 function draft(id){return{action:'READ_STATE',jobId:'host-witness-read-'+id,rootId:hash(1),revision:1,mode:null,publicInputs:null,witnessSHA256:null,authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null};}

 async function fundedFixture(){
  const {noteNodeHash}=await import('@lianum/engine/notes/private-note-tree');
  const {encodeWalletPoolInputs}=await import('@lianum/engine/wallet/notes/private-wallet-note-encoding');
  const f=await fixture(true),v=new Vault(f.input.journal.path),r=await v.read(f.input.journal.password),descriptor=f.authority.descriptor();
  let leaves=['0x'+hash(6),...Array(255).fill(word(0))];while(leaves.length>1)leaves=Array.from({length:leaves.length/2},(_,i)=>noteNodeHash(leaves[2*i],leaves[2*i+1]));
  f.fixture.root=f.fixture.currentRoot=leaves[0];f.fixture.advanceClock=ms=>{offset+=ms;};
  const job={profile:P.DEVICE_PAGED_OWNER_V3,descriptor,jobId:'host-cold-confirmed-deposit',rootId:hash(1),revision:1,mode:'deposit',publicInputs:encodeWalletPoolInputs('deposit_balance',{scope:'0x'+f.system.scope,policy:'0x'+f.system.policy,epoch:'2',amount:'20',output:'0x'+hash(6)}),witnessSHA256:hash(2),proofSHA256:createHash('sha256').update(Buffer.from('01','hex')).digest('hex'),proof:'01',stage:'CONFIRMED',commitment:hash(6),nullifier:hash(7),transactionHash:'0x'+hash(3),errorCode:null};
  await v.update(f.input.journal.password,r.revision,data=>({...data,jobs:[job]}));
  return f;
 }
 await t.test('cold history precedes the fresh window; changed roots, spent notes and slow current reads stay guarded',async sub=>{
  const {noteNodeHash}=await import('@lianum/engine/notes/private-note-tree');
  const f=await fundedFixture();f.fixture.ledgerDelay=20000;const leaves=[f.fixture.root];
  const c=await f.authority.challenge(draft('cold-history')),before=Date.now(),status=await f.authority.submit(c,permission(c),null);
  assert.ok(status.issuedAt>=before+20000);assert.equal(status.note.state,'LIVE');assert.equal(status.note.available,'20');assert.equal(status.note.path.root,leaves[0].slice(2));assert.equal(status.expiresAt-status.issuedAt,120000);
  f.fixture.spent=1;const spentConsent=await f.authority.challenge(draft('cold-spent')),spent=await f.authority.submit(spentConsent,permission(spentConsent),null);assert.equal(spent.note.state,'SPENT');assert.equal(spent.note.available,null,'prepared membership does not cache spendability');
  assert.equal(f.fixture.ledgerReads,1,'unchanged current root reuses membership, never a balance');
  // Caller mutation cannot poison the private membership used by the next read.
  assert.throws(()=>{spent.note.path.root=hash(5);});assert.throws(()=>spent.note.path.siblings.fill(hash(5)));
  f.fixture.spent=0;const restored=await f.authority.challenge(draft('cold-restored'));
  const restoredStatus=await f.authority.submit(restored,permission(restored),null);
  assert.equal(restoredStatus.note.path.root,f.fixture.root.slice(2));assert.equal(f.fixture.ledgerReads,1);
  f.fixture.backed=0;const unbacked=await f.authority.challenge(draft('cold-unbacked'));
  await assert.rejects(f.authority.submit(unbacked,permission(unbacked),null));f.fixture.backed=20;
  const warm=await f.authority.challenge(draft('cold-after-error'));await f.authority.submit(warm,permission(warm),null);
  assert.equal(f.fixture.ledgerReads,2,'a failed current observation invalidates the private path');
  // Another valid insertion refreshes membership once and checks current funds again.
  f.fixture.leaves.push('0x'+hash(4));let next=[...f.fixture.leaves,...Array(254).fill(word(0))];
  while(next.length>1)next=Array.from({length:next.length/2},(_,i)=>noteNodeHash(next[2*i],next[2*i+1]));
  f.fixture.root=f.fixture.currentRoot=next[0];
  const inserted=await f.authority.challenge(draft('cold-new-insertion')),updated=await f.authority.submit(inserted,permission(inserted),null);
  assert.equal(updated.note.path.root,next[0].slice(2));assert.equal(updated.note.available,'20');assert.equal(f.fixture.ledgerReads,3);
  f.fixture.currentRoot='0x'+hash(5);const changed=await f.authority.challenge(draft('cold-changed-root'));await assert.rejects(f.authority.submit(changed,permission(changed),null),/PAGED_DEVICE_STATUS_LEDGER_CHANGED/);assert.equal(f.fixture.ledgerReads,4,'one bounded refresh cannot turn inconsistent state into a balance');
  f.fixture.currentRoot=f.fixture.root;f.fixture.ledgerDelay=0;const slow=await f.authority.challenge(draft('cold-slow-current'));f.fixture.currentReadDelay=120001;
  await assert.rejects(f.authority.submit(slow,permission(slow),null),e=>e.code==='ERR_ASSERTION','current reads remain bounded');
 });
 await t.test('lost HTTP read response completes on the original authority and reconnect reads fresh without repeating history',async()=>{
  const {createServer}=await import('node:http'),{once}=await import('node:events');
  const {createDevicePagedPlatformApplicationV3}=await import('../../../src/api/mobile/device-paged-platform-application-v3.mjs');
  const {createDevicePagedOwnerApiV3}=await import('../../../../../apps/mobile/src/api/device-paged-owner-api-v3.mjs');
  const f=await fundedFixture();let release,entered,finished;
  f.fixture.ledgerGate=new Promise(resolve=>{release=resolve;});
  const began=new Promise(resolve=>{entered=resolve;});f.fixture.ledgerEntered=entered;
  const completed=new Promise(resolve=>{finished=resolve;});
  const application=createDevicePagedPlatformApplicationV3({descriptor:f.authority.descriptor(),nativePreparation:null,isLive:()=>true,dispatch:(method,args)=>f.authority[method](...args)});
  const server=createServer((request,response)=>{void application.handler(request,response).finally(()=>{if(request.url.endsWith('/operations'))finished();});});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const endpoint='http://127.0.0.1:'+server.address().port;
  const fetchImpl=(url,options)=>fetch(endpoint+new URL(url).pathname,options);
  const api=createDevicePagedOwnerApiV3({descriptor:f.authority.descriptor(),fetchImpl});let next;
  try{
   const consent=await api.challenge(draft('lost-response')),signature=permission(consent);
   const rejected=assert.rejects(api.submit(consent,signature),/MOBILE_PAGED_SERVICE_UNAVAILABLE/);
   await began;await api.close();await rejected;
   // The phone's socket has closed; the accepted read still finishes. Its
   // historical delay cannot become a stale balance or a financial command.
   offset+=20000;release();await completed;
   f.fixture.ledgerGate=null;f.fixture.ledgerEntered=null;
   next=createDevicePagedOwnerApiV3({descriptor:f.authority.descriptor(),fetchImpl});
   const freshConsent=await next.challenge(draft('reconnected-response'));
   const status=await next.submit(freshConsent,permission(freshConsent));
   assert.equal(status.note.available,'20');assert.equal(f.fixture.ledgerReads,1);
   assert.ok(status.issuedAt>=consent.issuedAt+20000);assert.equal(status.expiresAt-status.issuedAt,120000);
   const record=await new Vault(f.input.journal.path).read(f.input.journal.password);
   assert.equal(record.data.jobs.length,1);assert.equal(record.data.pending,null);assert.equal(record.data.noteWork,undefined);
  }finally{release();await api.close();await next?.close();application.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 });
 await t.test('fresh note intake is durable before slow chain preflight and grants no financial send',async sub=>{
  const {encodeWalletPoolInputs}=await import('@lianum/engine/wallet/notes/private-wallet-note-encoding');
  const f=await fixture(true);activeProofFixture=f.fixture;f.fixture.advanceClock=ms=>{offset+=ms;};acceptedProof=false;
  const inputs=encodeWalletPoolInputs('deposit_balance',{scope:'0x'+f.system.scope,policy:'0x'+f.system.policy,epoch:'2',amount:'20',output:'0x'+hash(6)});
  const request={action:'PROVE_D26',jobId:'host-fresh-durable-handoff',rootId:hash(1),revision:1,mode:'deposit',publicInputs:inputs,witnessSHA256:hash(3),authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null};
  const consent=await f.authority.challenge(request),cipher={authorization:{kind:'ORIGINAL_CONSENT_V1',jobId:request.jobId,consentSHA256:createHash('sha256').update(P.devicePagedPermissionMessageV3(consent)).digest('hex'),witnessSHA256:request.witnessSHA256}};
  await assert.rejects(f.authority.submit(consent,permission(consent),cipher),/HOST_STOP_AFTER_DURABLE_ACCEPTANCE/);
  assert.ok(acceptedProof);P.validateDevicePagedConsentFreshV3(consent);
  const retained=await new Vault(f.input.journal.path).read(f.input.journal.password);assert.equal(retained.data.noteWork.checkpoint.public.stage,'INTENT');assert.equal(retained.data.jobs[0].stage,'PROVING');assert.equal(retained.data.pending,null);
 });
 await t.test('an admitted intent keeps computing after its start margin shrinks, without extending its epoch',async()=>{
  const {encodeWalletPoolInputs}=await import('@lianum/engine/wallet/notes/private-wallet-note-encoding');
  const f=await fixture(true);activeProofFixture=f.fixture;acceptedProof=false;
  const request={action:'PROVE_D26',jobId:'host-admitted-near-epoch-end',rootId:hash(1),revision:1,mode:'deposit',publicInputs:encodeWalletPoolInputs('deposit_balance',{scope:'0x'+f.system.scope,policy:'0x'+f.system.policy,epoch:'2',amount:'20',output:'0x'+hash(6)}),witnessSHA256:hash(3),authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null};
  const consent=await f.authority.challenge(request),cipher={authorization:{kind:'ORIGINAL_CONSENT_V1',jobId:request.jobId,consentSHA256:createHash('sha256').update(P.devicePagedPermissionMessageV3(consent)).digest('hex'),witnessSHA256:request.witnessSHA256}};
  // HOST chain clock advances after the proof challenge, leaving 120s in the
  // same epoch. No signing/RPC/economic execution is provided by this fixture.
  f.fixture.head.timestamp='0x690';
  await assert.rejects(f.authority.submit(consent,permission(consent),cipher),/HOST_STOP_AFTER_DURABLE_ACCEPTANCE/);
  const retained=await new Vault(f.input.journal.path).read(f.input.journal.password);
  assert.ok(acceptedProof);assert.equal(retained.data.jobs[0].stage,'PROVING');assert.equal(retained.data.pending,null);
  const late=await fixture(true);late.fixture.head.timestamp='0x690';
  await assert.rejects(late.authority.challenge({...request,jobId:'host-not-yet-admitted'}),/PAGED_DEVICE_NOTE_EPOCH_TOO_SHORT/);
 });
 await t.test('expired proof intake cannot create a retained job or start computation',async()=>{
  const {encodeWalletPoolInputs}=await import('@lianum/engine/wallet/notes/private-wallet-note-encoding');
  const f=await fixture(true);activeProofFixture=f.fixture;acceptedProof=false;
  const request={action:'PROVE_D26',jobId:'host-expired-durable-intake',rootId:hash(1),revision:1,mode:'deposit',publicInputs:encodeWalletPoolInputs('deposit_balance',{scope:'0x'+f.system.scope,policy:'0x'+f.system.policy,epoch:'2',amount:'20',output:'0x'+hash(6)}),witnessSHA256:hash(3),authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null};
  const consent=await f.authority.challenge(request);offset+=300001;
  await assert.rejects(f.authority.submit(consent,permission(consent),{}));assert.equal(acceptedProof,false);
  const retained=await new Vault(f.input.journal.path).read(f.input.journal.password);assert.equal(retained.data.jobs.length,0);assert.equal(retained.data.noteWork,undefined);assert.equal(retained.data.pending,null);
 });

});
