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
 const retirementRequests=new WeakMap(),{canonical}=await import('@lianum/engine/crypto/privacy');
 async function consumeRetirement(runtime,token){const g=retirementRequests.get(token);assert.ok(g&&!g.used&&g.runtime===runtime,'HOST_ORIGINAL_RETIREMENT');const j=journals.get(g.journalToken);assert.ok(j&&!j.closed);const r=await j.vault.read(j.password);assert.equal(r.revision,g.expected.revision);assert.equal(createHash('sha256').update(canonical(r.data)).digest('hex'),g.expected.dataSHA256);g.used=true;const job=r.data.jobs.find(j=>j.jobId===g.jobId);return{identity:r.data.identity,jobId:g.jobId,...r.data.pending,publicInputs:job.publicInputs,poolCodeHash:j.descriptor.poolCodeHash};}
 const kernelURL=new URL('../../../src/operations/local/funded-graph-paged-public-kernel-v4.mjs',import.meta.url);
 t.mock.module(kernelURL.href,{exports:{
  async createOriginalPagedSepoliaSourceJournalV4(runtime,system,input){
   assert.strictEqual(originalSystems.get(runtime),system,'HOST_ORIGINAL_DEPLOYMENT');assert.equal(system.receiverProfile,'ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4','PAGED_AUTHORITY_RECEIVER_PROFILE');
   const d=fixtures.get(runtime).deployment,math=system.deployments[0],head=await runtime.block(),descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:input.origin,devicePublicKey:input.devicePublicKey,chainId:runtime.metadata.chainId,genesis:runtime.metadata.evmGenesis,...Object.fromEntries(['pool','state','native','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256'].map(k=>[k,system[k]])),poolCodeHash:d.pool.codeHash.slice(2),stateCodeHash:d.state.codeHash.slice(2),nativeCodeHash:d.native.codeHash.slice(2),math:math.address,mathCodeHash:math.codeHash.slice(2),pairingId:'host-public-source-'+randomBytes(8).toString('hex'),deadlineMs:P.devicePagedNowV3()+9*60*60*1000,chainDeadlineSeconds:(BigInt(head.timestamp)+32400n).toString()});
   const identity=randomBytes(32).toString('hex'),vault=new Vault(input.journal.path);await vault.create({schema:P.DEVICE_PAGED_OWNER_V3,identity,descriptor,jobs:[],pending:null,graph:null},input.journal.password);
   const journalToken=Object.freeze({}),bundle=Object.freeze({journalToken,vault,descriptor,identity,opening:null});journals.set(journalToken,{descriptor,closed:false,vault,runtime,password:input.journal.password});bundles.set(bundle,{runtime,system});return bundle;
  },
  assertOriginalPagedSepoliaSourceJournalV4(runtime,system,bundle){assert.deepEqual(bundles.get(bundle),{runtime,system},'HOST_ORIGINAL_JOURNAL_BUNDLE');},
  issueOriginalPagedSepoliaSourcePermissionV4(journalToken,raw){const j=journals.get(journalToken);assert.ok(j&&!j.closed);const consent=P.validateDevicePagedConsentFreshV3(raw);assert.deepEqual(consent.descriptor,j.descriptor);const token=Object.freeze({});permissions.set(token,{journalToken,consent,used:false});return token;},
  consumeOriginalPagedSepoliaSourcePermissionV4(journalToken,token,sig){const p=permissions.get(token);assert.ok(p&&p.journalToken===journalToken&&!p.used);P.validateDevicePagedConsentFreshV3(p.consent);assert.ok(verify('sha256',P.devicePagedPermissionMessageV3(p.consent),{key:device.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(sig,'hex')));p.used=true;const grant=Object.freeze({});consumed.set(grant,p);return grant;},
  readOriginalPagedSepoliaSourcePermissionV4(journalToken,token){const p=consumed.get(token);assert.ok(p?.journalToken===journalToken);return{kind:'note',consent:p.consent};},
  async armOriginalPagedSepoliaExpiredDepositRetirementV18(token,expected,jobId){const j=journals.get(token);assert.ok(j&&!j.closed);const request=Object.freeze({});retirementRequests.set(request,{journalToken:token,runtime:j.runtime,expected,jobId,used:false});return request;},
  async armOriginalPagedSepoliaExpiredWithdrawalRetirementV32(token,expected,jobId){const j=journals.get(token);assert.ok(j&&!j.closed);const request=Object.freeze({});retirementRequests.set(request,{journalToken:token,runtime:j.runtime,expected,jobId,used:false});return request;},
  closeOriginalPagedSepoliaSourceJournalV4(token){const j=journals.get(token);assert.ok(j);j.closed=true;}
 }});
 const sourceAttempts=new WeakMap();let sourceReads=0,retirements=0,retiredGrant=null,retiredToken=null;
 t.mock.module(new URL('../../../src/providers/paged-public-testnet-runtimes-v1.mjs',import.meta.url).href,{exports:{async readOriginalPagedPublicSepoliaSourceRecoveryRowsV8(runtime){assert.ok(originalSystems.has(runtime),'HOST_ORIGINAL_SOURCE_RUNTIME');sourceReads++;return Object.freeze({operations:structuredClone(sourceAttempts.get(runtime)??[])});},async retireOriginalPagedPublicExpiredDepositV18(runtime,token){retiredGrant=await consumeRetirement(runtime,token);retiredToken=token;retirements++;return Object.freeze({retired:true,financialSignatureIssued:false,broadcasts:0});},async retireOriginalPagedPublicExpiredWithdrawalV32(runtime,token){retiredGrant=await consumeRetirement(runtime,token);retiredToken=token;retirements++;return Object.freeze({retired:true,financialSignatureIssued:false,broadcasts:0});}}});
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
  f.deployment={...Object.fromEntries(['pool','state','native'].map(key=>[key,{expectedCode:'0x6000',codeHash:'0x'+hash(9)}])),call:async(_,method)=>{assert.ok(['leafCount()','backedAmount()','insertedCommitments(bytes32)','spentNullifiers(bytes32)'].includes(method));return word(0);}};
  const runtime={receipt:async()=>null,metadata:{chainId:isPublic?'11155111':'31337',evmGenesis:hash(1)},receipts:[],block:async()=>{f.reads++;return f.current;},health:async()=>{},assertCanonical:async value=>{f.canonicalReads.push(value);assert.ok(value===head||value===later);assert.ok(!f.reorg,'HOST_WITNESS_REORG');},code:async(_,block)=>{assert.equal(block,head.number);if(f.advance)f.current=later;return f.codeMismatch?'0x6001':'0x6000';}};
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
 // A rejected private intake can leave PROVING with no checkpoint. A
 // later authenticated read retires only its expired, unused, unsent epoch;
 // it preserves the exact job and never manufactures a proof checkpoint.
 const unaccepted=await seeded('PROVING'),ur=await unaccepted.v.read(unaccepted.input.journal.password);
 await unaccepted.v.update(unaccepted.input.journal.password,ur.revision,data=>({...data,jobs:data.jobs.map(job=>({...job,proof:null,proofSHA256:null,commitment:null,nullifier:null})),noteWork:{profile:'DEVICE_PAGED_NOTE_DURABLE_WORK_V6',jobId:unaccepted.job.jobId,mode:'deposit',rootId:unaccepted.job.rootId,sourceRevision:unaccepted.job.revision,consentSHA256:hash(3),witnessSHA256:unaccepted.job.witnessSHA256,publicInputsSHA256:createHash('sha256').update(canonical(unaccepted.job.publicInputs)).digest('hex'),checkpoint:null}}));
 const uc0=await unaccepted.authority.challenge(draft('unaccepted-intake'));
 const retired=await unaccepted.authority.submit(uc0,permission(uc0),null),retained=await unaccepted.v.read(unaccepted.input.journal.password);
 assert.equal(retired.jobs[0].stage,'FAILED');assert.equal(retired.jobs[0].errorCode,P.DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8);assert.equal(retained.data.noteWork,undefined);assert.equal(retired.jobs[0].jobId,unaccepted.job.jobId);assert.deepEqual(retired.jobs[0].publicInputs,unaccepted.job.publicInputs);
 const safe=await seeded(),c=await safe.authority.challenge(draft('epoch-safe')),status=await safe.authority.submit(c,permission(c),null);
 assert.equal(status.jobs[0].stage,'FAILED');assert.equal(status.jobs[0].errorCode,P.DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8);assert.equal(status.jobs[0].jobId,safe.job.jobId);assert.deepEqual(status.jobs[0].publicInputs,safe.job.publicInputs);assert.equal(status.note,null);assert.ok(sourceReads>0);
 for(const phase of ['KEY_PENDING','SIGNED','SUBMITTING','UNKNOWN','CONFIRMED','FINALIZED']){
  const f=await seeded('PROVED',[{phase,command:{identity:hash(3),jobId:'host-expired-epoch-job'},signed:phase==='KEY_PENDING'?null:{nativeId:'0x'+hash(8)}}]),before=await f.v.read(f.input.journal.password),c=await f.authority.challenge(draft('epoch-'+phase.toLowerCase().replaceAll('_','-')));
  await assert.rejects(f.authority.submit(c,permission(c),null),/PAGED_NOTE_EPOCH_RETRY_SOURCE_ATTEMPT_EXISTS/);assert.deepEqual(await f.v.read(f.input.journal.password),before,'failed preflight cannot clear or mutate original Source work');
 }
 const unknown=await seeded('UNKNOWN'),before=await unknown.v.read(unknown.input.journal.password),uc=await unknown.authority.challenge(draft('epoch-unknown')),u=await unknown.authority.submit(uc,permission(uc),null);
 assert.equal(u.jobs[0].stage,'UNKNOWN');assert.deepEqual(await unknown.v.read(unknown.input.journal.password),before,'lost ACK remains the same pending intent');
 // The real account issues/consumes a one-use retirement only for its own
 // current UNKNOWN mixed-source deposit after a finalized epoch boundary.
 const recoverable=await seeded('UNKNOWN'),rr=await recoverable.v.read(recoverable.input.journal.password);
 recoverable.runtime.accounts=[address(1)];const pending={...rr.data.pending,to:recoverable.system.pool,calldataSHA256:createHash('sha256').update(Buffer.from('deadbeef','hex')).digest('hex')};
 await recoverable.v.update(recoverable.input.journal.password,rr.revision,data=>({...data,pending}));
 sourceAttempts.set(recoverable.runtime,[{profile:'ORIGINAL_PAGED_SEPOLIA_DEFI_SOURCE_ROW_V8',phase:'UNKNOWN',command:{identity:rr.data.identity,jobId:recoverable.job.jobId,action:'FUND_D26',from:pending.from,to:pending.to,value:pending.value,data:'0xdeadbeef'},signed:{nativeId:'0x'+hash(8)}}]);
 const rc=await recoverable.authority.challenge({...draft('retire'),action:'OBSERVE_JOB',jobId:recoverable.job.jobId}),recovered=await recoverable.authority.submit(rc,permission(rc),null);
 assert.equal(recovered.stage,'FAILED');assert.equal(recovered.errorCode,P.DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8);assert.equal(retirements,1);
 const afterRetirement=await recoverable.v.read(recoverable.input.journal.password);assert.equal(afterRetirement.data.pending,null);assert.deepEqual(afterRetirement.data.jobs[0].publicInputs,recoverable.job.publicInputs);assert.equal(afterRetirement.data.jobs[0].proof,recoverable.job.proof);
 assert.equal(retiredGrant.identity,rr.data.identity);assert.equal(retiredGrant.to,recoverable.system.pool);assert.equal(retiredGrant.value,'10');assert.deepEqual(retiredGrant.publicInputs,recoverable.job.publicInputs);
 await assert.rejects(consumeRetirement(recoverable.runtime,{}),/ORIGINAL_RETIREMENT/);
 await assert.rejects(consumeRetirement(recoverable.runtime,retiredToken),/ORIGINAL_RETIREMENT/);
 const neverSigned=await seeded('UNKNOWN'),nr=await neverSigned.v.read(neverSigned.input.journal.password);
 neverSigned.runtime.accounts=[address(1)];await neverSigned.v.update(neverSigned.input.journal.password,nr.revision,data=>({...data,pending:{...data.pending,to:neverSigned.system.pool}}));
 const nc=await neverSigned.authority.challenge({...draft('retire-no-signature'),action:'OBSERVE_JOB',jobId:neverSigned.job.jobId}),ns=await neverSigned.authority.submit(nc,permission(nc),null);
 assert.equal(ns.stage,'FAILED');assert.equal(ns.errorCode,P.DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8);assert.equal(retirements,2);assert.equal((await neverSigned.v.read(neverSigned.input.journal.password)).data.pending,null);


 // Expired UNKNOWN W39 has the same exact-account retirement, without sending
 // or claiming payment. Changing the pool/sender/value keeps the intent pending.
 const {encodeWalletPoolInputs}=await import('@lianum/engine/wallet/notes/private-wallet-note-encoding');
 for(const action of ['OBSERVE_JOB','READ_STATE'])for(const wrong of [null,'from','to','value']){
  const f=await seeded('UNKNOWN'),before=await f.v.read(f.input.journal.password);f.runtime.accounts=[address(1)];
  const job={...f.job,mode:'withdraw',publicInputs:encodeWalletPoolInputs('withdraw_balance',{scope:'0x'+f.system.scope,policy:'0x'+f.system.policy,epoch:'1',root:'0x'+hash(6),nullifier:'0x'+hash(7),amount:'10',recipient:address(8)})};
  const pending={...before.data.pending,to:f.system.pool,value:'0'};if(wrong)pending[wrong]=wrong==='value'?'10':address(9);
  await f.v.update(f.input.journal.password,before.revision,data=>({...data,jobs:[job],pending}));
  const checkpoint=await f.v.read(f.input.journal.password),count=retirements,challenge=await f.authority.challenge({...draft('withdraw-'+action+'-'+(wrong??'ok')),action,jobId:job.jobId});
  const reply=await f.authority.submit(challenge,permission(challenge),null),result=action==='READ_STATE'?reply.jobs[0]:reply,after=await f.v.read(f.input.journal.password);
  if(wrong){assert.equal(result.stage,'UNKNOWN');assert.deepEqual(after,checkpoint);assert.equal(retirements,count);}
  else{assert.equal(result.stage,'FAILED');assert.equal(result.errorCode,P.DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8);assert.equal(retirements,count+1);assert.equal(after.data.pending,null);assert.deepEqual(after.data.jobs[0].publicInputs,job.publicInputs);assert.equal(after.data.jobs[0].proof,job.proof);assert.equal(retiredGrant.value,'0');await assert.rejects(consumeRetirement(f.runtime,retiredToken),/ORIGINAL_RETIREMENT/);}
 }

 // A lost successful withdrawal ACK must be reconciled before expired-note
 // retirement. Its nullifier is already spent: attempting retirement first
 // would reject permanently even though the actual payment succeeded.
 for(const action of ['READ_STATE','OBSERVE_JOB'])for(const receiptStatus of ['0x1','0x0']){
  const f=await seeded('UNKNOWN'),before=await f.v.read(f.input.journal.password);
  const txHash='0x'+hash(8),calldata='0xdeadbeef',job={...f.job,mode:'withdraw',publicInputs:encodeWalletPoolInputs('withdraw_balance',{scope:'0x'+f.system.scope,policy:'0x'+f.system.policy,epoch:'1',root:'0x'+hash(6),nullifier:'0x'+hash(7),amount:'10',recipient:address(8)})};
  const pending={jobId:job.jobId,from:address(1),to:f.system.pool,value:'0',calldataSHA256:createHash('sha256').update(Buffer.from('deadbeef','hex')).digest('hex')};
  await f.v.update(f.input.journal.password,before.revision,data=>({...data,jobs:[job],pending}));
  sourceAttempts.set(f.runtime,[{profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_ROW_V4',phase:'SUBMITTING',command:{identity:before.data.identity,jobId:job.jobId,action:'WITHDRAW_W39',from:pending.from,to:pending.to,value:'0',data:calldata},signed:{nativeId:txHash}}]);
  const receipt={transactionHash:txHash,status:receiptStatus,blockNumber:f.head.number,blockHash:f.head.hash};
  f.runtime.accounts=[address(1)];f.runtime.receipt=async h=>{assert.equal(h,txHash);return receipt;};
  f.runtime.transaction=async()=>({from:pending.from,to:pending.to,value:'0',input:calldata});
  f.runtime.checkReceipt=async value=>assert.equal(value,receipt);
  const canonical=f.runtime.assertCanonical;f.runtime.assertCanonical=async value=>value===receipt?undefined:canonical(value);
  const call=f.fixture.deployment.call;f.fixture.deployment.call=async(k,method,...args)=>method==='spentNullifiers(bytes32)'?word(receiptStatus==='0x1'?1:0):call(k,method,...args);
  const count=retirements,c=await f.authority.challenge({...draft('confirmed-before-retirement-'+action),action,jobId:job.jobId}),reply=await f.authority.submit(c,permission(c),null),result=action==='READ_STATE'?reply.jobs[0]:reply;
  assert.equal(result.stage,receiptStatus==='0x1'?'CONFIRMED':'FAILED');assert.equal(result.transactionHash,receiptStatus==='0x1'?txHash:null);assert.equal(retirements,count+(receiptStatus==='0x0'?1:0));if(receiptStatus==='0x0')assert.equal(result.errorCode,P.DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8);assert.equal((await f.v.read(f.input.journal.password)).data.pending,null);
 }

 // Near an epoch boundary the real PUBLIC authority rejects before allocating
 // a proof recipient or changing the retained failed job.
 const short=await seeded('FAILED'),sr=await short.v.read(short.input.journal.password);
 await short.v.update(short.input.journal.password,sr.revision,data=>({...data,jobs:[{...data.jobs[0],errorCode:P.DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8}]}));
 short.fixture.current.timestamp='0x'+(1799n).toString(16);
 const beforeShort=await short.v.read(short.input.journal.password),inputs=[...short.job.publicInputs];inputs[16]='2';
 const retry={action:'PROVE_D26',jobId:short.job.jobId,rootId:short.job.rootId,revision:short.job.revision,mode:'deposit',publicInputs:inputs,witnessSHA256:hash(3),authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null};
 await assert.rejects(short.authority.challenge(retry),/PAGED_DEVICE_NOTE_EPOCH_TOO_SHORT/);assert.deepEqual(await short.v.read(short.input.journal.password),beforeShort);

});
