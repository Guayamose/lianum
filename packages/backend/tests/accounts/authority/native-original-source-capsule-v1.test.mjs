/** HOST actual capsule/Vault/AES/files + real exited child. Native snapshots
 * and part brands are explicit inert ports: no Anvil/proof/key/send acceptance. */
import test,{mock,after} from 'node:test';
import {createNativeSourceHost,sourceHostSchemas as schemas} from '../../support/native-source-host.mjs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import {constants} from 'node:fs';
import {mkdir,lstat,open,unlink,readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {deflateRawSync} from 'node:zlib';
const partsURL=new URL('../../../src/operations/recovery/native-original-source-parts-v1.mjs',import.meta.url);
if(process.argv[2]!=='--source-capsule-child')test('HOST SOURCE fixed session consumer preserves the original session for actor binding and shutdown',async t=>{
 const originals=new Map(['receiver','system','account','owner','session'].map(name=>[name,Object.freeze({explicitSyntheticLowerOriginal:name})])),token=Object.freeze({});let sessionCloses=0,actorCalls=0;
 const session=Object.freeze({async close(){sessionCloses++;return{phase:'CLOSED'};}});originals.set('session',session);
 const joined=Object.freeze({session,async bindManualNote(){throw Error('HOST_NO_NEW_AUTHORIZATION');}});
 const mocks=[],install=(path,exports)=>mocks.push(mock.module(new URL(path,partsURL),{exports}));
 t.after(()=>{for(const item of mocks.reverse())item.restore();});
 const unused=()=>assert.fail('HOST_UNEXPECTED_PART_PORT');
 install('./native-original-source-lifecycle-v1.mjs',{
  nativeSourceRecoveryOriginalReferenceV1(actual,section,name){assert.equal(actual,token);assert.ok(['session','actor'].includes(section));return originals.get(name);},
  createOwnedNativeDurableSourceRuntimeV1:unused});
 for(const [path,names]of [
  ['../operators/native-value/native-value-local-operator-bootstrap-v4.mjs',['retainOriginalNativeSourceBootstrapV1','reopenOriginalNativeSourceBootstrapV1']],
  ['../deployments/native-value/native-value-system-v2.mjs',['retainOriginalNativeSystemSourceV1','reopenOriginalNativeSystemSourceV1']],
  ['../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs',['retainOriginalNativeSourceProviderV1','reopenOriginalNativeSourceProviderV1']],
  ['../../custody/processes/native-value-owner-process-v2.mjs',['retainOriginalNativeSourceOwnerV1','reopenOriginalNativeSourceOwnerV1']],
  ['../../execution/native-value/execution/native-value-execution-v2.mjs',['retainOriginalNativeExecutorSourceV1','reopenOriginalNativeExecutorSourceV1']],
  ['../../accounts/authority/native-value-account-authority-v2.mjs',['reopenOriginalNativeAccountSourceV1']],
 ])install(path,Object.fromEntries(names.map(name=>[name,unused])));
 install('../../api/accounts/flat-manual-graph-session.mjs',{async reopenOriginalNativeSessionSourceV1(actual,contexts){assert.equal(actual,token);assert.equal(contexts.owner,originals.get('owner'));return joined;}});
 install('../../api/mobile/paired-original-account-actor-v2.mjs',{retainOriginalNativeActorSourceV1:unused,async reopenOriginalNativeActorSourceV1(actual,contexts){assert.equal(actual,token);assert.equal(contexts.session,session);actorCalls++;return{explicitSyntheticActor:true};}});
 const {reopenFixedOriginalNativeSourcePartV1:consumer}=await import(new URL('?session='+randomUUID(),partsURL));
 const contexts={runtime:originals.get('receiver'),system:originals.get('system'),account:originals.get('account'),owner:originals.get('owner')};
 const recovered=await consumer(token,'session',contexts);assert.equal(recovered,session);assert.notEqual(recovered,joined);
 await consumer(token,'actor',{session:recovered,account:contexts.account,owner:contexts.owner});assert.equal(actorCalls,1);
 await assert.rejects(consumer(token,'actor',{session:{...recovered},account:contexts.account,owner:contexts.owner}),/NATIVE_SOURCE_ORIGINAL_CONTEXT_REFERENCE/);assert.equal(actorCalls,1);
 assert.equal((await recovered.close()).phase,'CLOSED');assert.equal(sessionCloses,1);
});
let activeHost;
async function capsule(root){activeHost?.restore();activeHost=await createNativeSourceHost(root);return activeHost;}
async function prepare(root,mode){const host=await capsule(root),{api,resources}=host,authority=await api.createOriginalNativeSourceCapsuleV1();await api.createOriginalNativeSourceClockPairV1(authority);
 for(const section of ['bootstrap','system','provider','owner','executor'])await api.retainOriginalNativeSourceReferenceV1(authority,section,Object.freeze({financialAcceptance:false}));
 const account=await api.createOriginalNativeSourceAccountV1(authority,{});await api.createOriginalNativeSourceSessionV1(authority,{account});await api.retainOriginalNativeSourceReferenceV1(authority,'actor',Object.freeze({financialAcceptance:false}));await api.retainOriginalNativeSourceClockCheckpointV1(authority,Object.freeze({}));await api.finishOriginalNativeSourceBirthV1(authority);
 if(mode==='native-completed'){
  const directory=join(root,'retained-checkpoint-account'),password='synthetic-checkpoint-account';await mkdir(directory,{mode:0o700});
  const accountIdentity={accountId:'retained-account',journalId:'retained-journal',lifetime:'11'.repeat(32),registrySHA256:'22'.repeat(32)};
  const initial=await new Vault(join(directory,'operations.vault')).create({version:1,identitySHA256:'33'.repeat(32),accountIdentity,operations:[]},password);
  const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
  const seed={schema:'ORIGINAL_NATIVE_SOURCE_NOTE_ACCOUNT_SEED_V1',sourceSHA256:'ef'.repeat(32),poolIndex:0,directory,password,accountId:accountIdentity.accountId,journalId:accountIdentity.journalId,checkpointSHA256:digest(initial),identitySHA256:initial.data.identitySHA256,accountIdentity,ownerIdentity:{},hasNativeExecution:true,manualMode:true,providerBindings:{operations:[],installations:[]}};
  await host.update('account',{...host.section('account'),confirmed:seed,candidate:{kind:'ACCOUNT_CAS',revision:1,checkpointSHA256:digest({revision:1,data:{...initial.data,operations:[{stage:'UNKNOWN'}]}})}});
  const access={version:2,profile:'LIANUM_ORIGINAL_ACCOUNT_ACCESS_V2',origin:'https://127.0.0.1:4443',pairingId:'55'.repeat(32),challengeId:'66'.repeat(32),nonce:'77'.repeat(32),expiresAt:1,devicePublicKey:'04'+'88'.repeat(64),action:'read'};
  const actorSeed={schema:'ORIGINAL_NATIVE_ACTOR_SOURCE_SEED_V1',origin:access.origin,pairingId:access.pairingId,devicePublicKey:access.devicePublicKey,initial:{body:{},review:{}},challenges:{accesses:[{id:access.challengeId,value:access,consumed:false}],reviews:[],stateAccesses:[{id:access.challengeId,value:access,consumed:false}],stateReviews:[]}};
  await host.update('actor',{...host.section('actor'),confirmed:actorSeed,candidate:{kind:'ACTOR_PERMISSION_OR_OBSERVATION',method:'readPrivateState'}});
 }
 if(mode==='native-completed'){host.armNativeFault();const token=await api.beginOriginalNativeSourceMutationV1(resources.receiver);let stopped=false;try{await api.confirmOriginalNativeSourceMutationV1(token);}catch(error){if(error.message==='HOST_ORIGINAL_COMPLETED_CAS_WINDOW')stopped=true;else throw error;}assert.ok(stopped,'HOST_ORIGINAL_COMPLETED_CAS_WINDOW_NOT_REACHED');}
 if(mode==='pending')await api.beginOriginalNativeSourceMutationV1(resources.receiver);
 if(mode==='candidate'){const value=host.section('account');await host.update('account',{...value,candidate:{kind:'EXPLICIT_INERT_ORIGINAL_CAS',revision:1}});}
 return{...host,authority};
}
async function launch(root,mode){const child=spawn(process.execPath,['--max-old-space-size=384','--experimental-test-module-mocks',fileURLToPath(import.meta.url),'--source-capsule-child',mode,root],{stdio:['ignore','pipe','pipe','ipc'],env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'}});const completion=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});let errorText='';child.stderr.on('data',bytes=>{errorText+=bytes;assert.ok(errorText.length<8192);});child.stdout.resume();
 const ready=new Promise((resolve,reject)=>{child.once('message',message=>message?.ready===true?resolve(message):reject(Error('HOST_CHILD_READY')));completion.then(()=>reject(Error('HOST_CHILD_EXIT_BEFORE_READY '+mode+' '+errorText)));});const announced=await ready;return{child,completion,errorText,announced};}
if(process.argv[2]==='--source-capsule-child'){
 try{if(process.argv[3]==='opening'){const {api}=await capsule(process.argv[4]),authority=await api.openOriginalNativeSourceCapsuleV1();assert.equal(api.originalNativeSourceCapsuleStatusV1(authority).phase,'OPENING');await api.reopenOriginalNativeSourceReferenceV1(authority,'receiver',{});}else await prepare(process.argv[4],process.argv[3]);await new Promise((resolve,reject)=>process.send({ready:true,checkpointChecks:activeHost.checkpointChecks},error=>error?reject(error):resolve()));process.once('message',()=>process.exit(17));}
 catch(error){const code=String(error.code??(/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:error.name));const frames=String(error.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,2);process.stderr.write(JSON.stringify({code,frames}));process.exit(1);}
}else test('original SOURCE capsule reopens only confirmed hard-exit generations and keeps half mutations UNKNOWN',async t=>{
 const roots=[];t.after(async()=>{for(const root of roots)await rm(root,{recursive:true,force:true});});
 for(const mode of ['confirmed','pending','candidate','tamper']){const root=await mkdtemp(join(tmpdir(),'native-source-original-host-'));roots.push(root);const running=await launch(root,mode),host=await capsule(root),{api}=host;
  await assert.rejects(api.openOriginalNativeSourceCapsuleV1(),/OLD_PROCESS_PRESENT/);
  running.child.send({exit:true});const ended=await running.completion;assert.equal(ended.code,17);assert.equal(ended.signal,null);await assert.rejects(lstat('/proc/'+running.child.pid),{code:'ENOENT'});
  if(mode==='tamper'){const locator=JSON.parse(await readFile(join(root,'.local/original-native-source-durable-operator-v1/source.json'),'utf8'));const path=join(locator.identity.directory,'receiver-confirmed-0.aead'),fd=await open(path,constants.O_RDWR|constants.O_NOFOLLOW);try{const b=Buffer.alloc(1),size=(await fd.stat()).size;await fd.read(b,0,1,size-1);b[0]^=1;await fd.write(b,0,1,size-1);await fd.sync();b.fill(0);}finally{await fd.close();}}
  const authority=await api.openOriginalNativeSourceCapsuleV1(),status=api.originalNativeSourceCapsuleStatusV1(authority);
  if(mode==='tamper'){await assert.rejects(api.reopenOriginalNativeSourceReferenceV1(authority,'receiver',{}),/CONFIRMED_NATIVE_BYTES/);await api.closeOriginalNativeSourceCapsuleV1(authority);continue;}
  if(mode!=='confirmed'){assert.equal(status.phase,'UNKNOWN');assert.equal(status.pending,true);assert.equal(status.observationOnly,true);await assert.rejects(api.createOriginalNativeSourceClockPairV1(authority),/PENDING_UNKNOWN/);await assert.rejects(api.reopenOriginalNativeSourceReferenceV1(authority,'receiver',{}),/PENDING_UNKNOWN/);await api.closeOriginalNativeSourceCapsuleV1(authority);continue;}
  assert.equal(status.phase,'OPENING');assert.equal(status.generation,1);
  for(const section of Object.keys(schemas))await api.reopenOriginalNativeSourceReferenceV1(authority,section,{});
  assert.deepEqual(host.section('system').confirmed.originalContracts.map(value=>value.length),[933336,933336]);
  await api.finishOriginalNativeSourceReopenV1(authority);assert.equal(api.originalNativeSourceCapsuleStatusV1(authority).phase,'CONFIRMED');assert.equal(host.tokenIdentity('account').profile,'NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1');
  const original=host.section('account');await host.update('account',original);assert.equal(api.originalNativeSourceCapsuleStatusV1(authority).pending,false);assert.throws(()=>api.assertOriginalNativeSourceCapsuleV1({...authority}),/ORIGINAL_CAPSULE/);
  await api.closeOriginalNativeSourceCapsuleV1(authority);await assert.rejects(api.openOriginalNativeSourceCapsuleV1(),/OLD_PROCESS_PRESENT/);
 }
});


if(process.argv[2]!=='--source-capsule-child')test('HOST SOURCE resumes completed native publication and interrupted OPENING without replay, and fences original account CAS',async t=>{
 const root=await mkdtemp(join(tmpdir(),'native-source-partial-host-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const first=await launch(root,'native-completed'),host=await capsule(root),{api}=host,oldCreator=await host.processIdentity(first.child.pid);
 await assert.rejects(api.openOriginalNativeSourceCapsuleV1(),/OLD_PROCESS_PRESENT/);first.child.send({exit:true});assert.deepEqual(await first.completion,{code:17,signal:null});await assert.rejects(lstat('/proc/'+first.child.pid),{code:'ENOENT'});
 const partial=await launch(root,'opening');assert.deepEqual(partial.announced.checkpointChecks,{account:1,actor:1});await assert.rejects(api.openOriginalNativeSourceCapsuleV1(),/OLD_PROCESS_PRESENT/);partial.child.send({exit:true});assert.deepEqual(await partial.completion,{code:17,signal:null});await assert.rejects(lstat('/proc/'+partial.child.pid),{code:'ENOENT'});
 const authority=await api.openOriginalNativeSourceCapsuleV1();assert.equal(api.originalNativeSourceCapsuleStatusV1(authority).generation,2);assert.equal(api.originalNativeSourceCapsuleStatusV1(authority).pending,false);
 for(const section of Object.keys(schemas))await api.reopenOriginalNativeSourceReferenceV1(authority,section,{});await api.finishOriginalNativeSourceReopenV1(authority);
 const directory=join(root,'original-account');await mkdir(directory,{mode:0o700});const password='synthetic-original-account-cas',vault=new Vault(join(directory,'operations.vault'));
 const digest=value=>createHash('sha256').update(canonical(value)).digest('hex'),accountIdentity={accountId:'original-account',journalId:'original-journal',lifetime:'11'.repeat(32),registrySHA256:'22'.repeat(32)},initial=await vault.create({version:1,identitySHA256:'33'.repeat(32),accountIdentity,operations:[]},password);
 const seed={schema:'ORIGINAL_NATIVE_SOURCE_NOTE_ACCOUNT_SEED_V1',sourceSHA256:'ef'.repeat(32),poolIndex:0,directory,password,accountId:accountIdentity.accountId,journalId:accountIdentity.journalId,checkpointSHA256:digest(initial),identitySHA256:initial.data.identitySHA256,accountIdentity,ownerIdentity:{},hasNativeExecution:true,manualMode:true,providerBindings:{operations:[],installations:[]}};
 const nextData={...initial.data,operations:[{ownerOperationRef:'original-fixture-job',stage:'UNKNOWN',financialAcceptance:false}]},candidate={kind:'ACCOUNT_CAS',revision:1,checkpointSHA256:digest({revision:1,data:nextData})},original=host.section('account');
 await host.update('account',{...original,confirmed:seed,candidate});let reconciled=await host.reconcileAccount({identity:api.assertOriginalNativeSourceCapsuleV1(authority),section:host.section('account'),interruptedActor:false});assert.equal(reconciled.confirmed.checkpointSHA256,digest(initial));assert.equal(reconciled.confirmed.interruptedOperation,true);assert.equal(reconciled.candidate,null);
 const completed=await vault.update(password,initial.revision,()=>nextData);reconciled=await host.reconcileAccount({identity:api.assertOriginalNativeSourceCapsuleV1(authority),section:host.section('account'),interruptedActor:false});assert.equal(reconciled.confirmed.checkpointSHA256,digest(completed));assert.equal(reconciled.confirmed.interruptedOperation,true);
 await vault.update(password,completed.revision,data=>({...data,operations:[]}));await assert.rejects(host.reconcileAccount({identity:api.assertOriginalNativeSourceCapsuleV1(authority),section:host.section('account'),interruptedActor:false}),/ORIGINAL_CHECKPOINT_CHANGED/);
 // The actual private recovery removes only the authenticated departed
 // creator's lock. A lock belonging to the still-live parent is never removed.
 const lock=async pid=>{const fd=await open(vault.lockPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await fd.writeFile(JSON.stringify({version:1,pid,token:'44'.repeat(32)}));await fd.sync();}finally{await fd.close();}};
 await lock(process.pid);await assert.rejects(host.clearAccountLock(oldCreator,reconciled),/STALE_ACCOUNT_LOCK_OWNER/);assert.ok((await lstat(vault.lockPath)).isFile());await unlink(vault.lockPath);
 await lock(oldCreator.pid);await host.clearAccountLock(oldCreator,reconciled);await assert.rejects(lstat(vault.lockPath),{code:'ENOENT'});
 const actorOriginal=host.section('actor'),access={version:2,profile:'LIANUM_ORIGINAL_ACCOUNT_ACCESS_V2',origin:'https://127.0.0.1:4443',pairingId:'55'.repeat(32),challengeId:'66'.repeat(32),nonce:'77'.repeat(32),expiresAt:1,devicePublicKey:'04'+'88'.repeat(64),action:'read'},actorSeed={schema:'ORIGINAL_NATIVE_ACTOR_SOURCE_SEED_V1',origin:access.origin,pairingId:access.pairingId,devicePublicKey:access.devicePublicKey,initial:{body:{},review:{}},challenges:{accesses:[{id:access.challengeId,value:access,consumed:false}],reviews:[],stateAccesses:[{id:access.challengeId,value:access,consumed:false}],stateReviews:[]}};
 await host.update('actor',{...actorOriginal,confirmed:actorSeed,candidate:{kind:'ACTOR_PERMISSION_OR_OBSERVATION',method:'readPrivateState'}});
 const burned=host.reconcileActor({identity:api.assertOriginalNativeSourceCapsuleV1(authority),section:host.section('actor')});assert.equal(burned.candidate,null);
 for(const name of ['accesses','stateAccesses']){assert.equal(burned.confirmed.challenges[name][0].consumed,true);assert.deepEqual(burned.confirmed.challenges[name][0].value,access);assert.equal(burned.confirmed.challenges[name][0].value.expiresAt,1);}
 assert.throws(()=>api.consumeOriginalNativeSourceActorCheckpointV1(Object.freeze({})),/ORIGINAL_CHECKPOINT_REQUEST/);
 await host.update('actor',actorOriginal);
 await host.update('account',original);await api.closeOriginalNativeSourceCapsuleV1(authority);
});

if(process.argv[2]!=='--source-capsule-child')test('HOST SOURCE journal body keeps the confirmed AEAD slot when root CAS fails',async t=>{
 const root=await mkdtemp(join(tmpdir(),'native-source-body-host-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const host=await prepare(root,'confirmed'),{api,authority}=host,identity=api.assertOriginalNativeSourceCapsuleV1(authority),before=await host.stored(authority),clear=Buffer.from(host.codec.sourceJSON((await host.readRecord(authority)).data)),packed=deflateRawSync(clear),sizes={oldBase64Chars:packed.toString('base64').length,clearBytes:clear.length};clear.fill(0);packed.fill(0);
 assert.ok(sizes.oldBase64Chars>1024*1024,'HOST_ORIGINAL_INLINE_VAULT_CAPACITY_REPRODUCED');assert.ok(sizes.clearBytes<=64*1024*1024);assert.ok(Buffer.byteLength(canonical(before.data))<1024);
 assert.equal(before.data.schema,'ORIGINAL_NATIVE_SOURCE_PRIVATE_JOURNAL_BODY_V1');assert.equal(before.data.revision,before.revision);
 const path=join(identity.directory,before.data.path),original=await readFile(path);assert.equal(original.length,before.data.bytes);assert.equal(createHash('sha256').update(original).digest('hex'),before.data.sha256);
 const logical=await host.readRecord(authority);host.armRootFault();await assert.rejects(host.update('account',host.section('account')),/HOST_ORIGINAL_BODY_ROOT_CAS_WINDOW/);
 assert.deepEqual(await host.stored(authority),before);assert.deepEqual(await readFile(path),original);assert.deepEqual(await host.readRecord(authority),logical);
 const other=join(identity.directory,before.data.path==='source-body-0.aead'?'source-body-1.aead':'source-body-0.aead');assert.ok((await lstat(other)).isFile());
 const fd=await open(path,constants.O_RDWR|constants.O_NOFOLLOW);try{const byte=Buffer.from([original[original.length-1]^1]);await fd.write(byte,0,1,original.length-1);await fd.sync();byte.fill(0);}finally{await fd.close();}
 await assert.rejects(host.readRecord(authority),/NATIVE_SOURCE_JOURNAL_BODY_BYTES/);original.fill(0);await api.closeOriginalNativeSourceCapsuleV1(authority);
});

// The continuation fence is independent of child-process and AEAD preparation.
// Test the actual operation bodies quickly with explicitly inert HOST ports.
if(process.argv[2]!=='--source-capsule-child')test('HOST SOURCE continuation fence rejects arm and pauses tick before any effects',async()=>{
 activeHost?.restore();
 const {createNativeValueExecutionOperations}=await import('../../../src/accounts/authority/native-value/native-value-authority-execution.mjs');
 let effects=0;const lease={},ports={assert,
  continuity:{recovery:{source:true,sourceObservationRequired:true},lease:()=>lease},
  lifecycle:{exclusive:async work=>work(),healthy:async()=>{},continueWork(){},isBusy:()=>false,isClosed:()=>false,isCancelled:()=>false,isUnavailable:()=>false,isCapturing:()=>false},
  reservations:{reservationRows:()=>{effects++;throw Error('effect must not run');}}};
 const operations=createNativeValueExecutionOperations(ports),actual={arm:operations.armLiveRecovery,tick:operations.tickLiveRecovery};
 await assert.rejects(actual.arm({action:'ARM_RECOVERY',bridge:{},consent:{}}),/OBSERVE_BEFORE_CONTINUATION/);
 assert.deepEqual(await actual.tick(lease),{state:'BUSY'});assert.equal(effects,0);
});

after(()=>activeHost?.restore());
