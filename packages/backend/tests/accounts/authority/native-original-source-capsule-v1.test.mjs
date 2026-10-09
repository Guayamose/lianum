/** HOST actual capsule/Vault/AES/files + real exited child. Native snapshots
 * and part brands are explicit inert ports: no Anvil/proof/key/send acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,createHmac,createCipheriv,createDecipheriv} from 'node:crypto';
import {constants} from 'node:fs';
import {mkdir,lstat,realpath,open,rename,unlink,readFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {types} from 'node:util';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
const generated=fileURLToPath(import.meta.url).includes('/wallet-platform/modules/');
const capsuleURL=new URL(generated?'../ops/native-original-source-capsule-v1.mjs':'../../../src/operations/recovery/native-original-source-capsule-v1.mjs',import.meta.url);
const accountURL=new URL(generated?'../global-state/native-value-account-authority-v2.mjs':'../../../src/accounts/authority/native-value-account-authority-v2.mjs',import.meta.url);
const actorURL=new URL(generated?'../mobile/paired-original-account-actor-v2.mjs':'../../../src/api/mobile/paired-original-account-actor-v2.mjs',import.meta.url);
const reviewURL=new URL(generated?'../../../../../mobile-protocol/src/original-account-review-v2.mjs':'../../../../mobile-protocol/src/original-account-review-v2.mjs',import.meta.url);
const engineURL=new URL(generated?'../../../../../omnichain-product/src/vault.mjs':'../../../../engine/src/crypto/vault.mjs',import.meta.url);
const privacyURL=new URL(generated?'../../../../../omnichain-product/src/privacy.mjs':'../../../../engine/src/crypto/privacy.mjs',import.meta.url);
const encodingURL=new URL(generated?'../paeg/commitments.mjs':'../../../src/execution/encoding/commitments.mjs',import.meta.url);
const partsURL=new URL(generated?'../ops/native-original-source-parts-v1.mjs':'../../../src/operations/recovery/native-original-source-parts-v1.mjs',import.meta.url);
const boundURL=new URL(generated?'../chain-adapters/owned-evm-recovery-state-bound-v1.mjs':'../../../src/chains/evm/runtime/owned-evm-recovery-state-bound-v1.mjs',import.meta.url);
const [{Vault},{canonical},{exactRecord},{assertOwnedEvmRecoveryStateDumpV1},{normalizeOriginalAccountAccessV2,normalizeOriginalAccountReviewV2}]=await Promise.all([import(engineURL),import(privacyURL),import(encodingURL),import(boundURL),import(reviewURL)]);
const schemas={receiver:'ORIGINAL_NATIVE_SOURCE_RUNTIME_V1',graphNative:'ORIGINAL_NATIVE_SOURCE_RUNTIME_V1',bootstrap:'ORIGINAL_NATIVE_BOOTSTRAP_DURABLE_SOURCE_V1',system:'ORIGINAL_NATIVE_SYSTEM_DURABLE_SOURCE_V1',provider:'ORIGINAL_NATIVE_PROVIDER_DURABLE_SOURCE_V1',owner:'ORIGINAL_NATIVE_OWNER_DURABLE_SOURCE_V1',executor:'ORIGINAL_NATIVE_EXECUTOR_DURABLE_SOURCE_V1',account:'ORIGINAL_NATIVE_SOURCE_ACCOUNT_SECTION_V1',session:'ORIGINAL_NATIVE_SOURCE_SESSION_SECTION_V1',actor:'ORIGINAL_NATIVE_ACTOR_DURABLE_SOURCE_V1'};
if(process.argv[2]!=='--source-capsule-child')test('HOST SOURCE fixed session consumer preserves the original session for actor binding and shutdown',async()=>{
 const raw=await readFile(partsURL,'utf8'),start=raw.indexOf('function refs(');assert.ok(start>=0);
 const originals=new Map(['receiver','system','account','owner','session'].map(name=>[name,Object.freeze({explicitSyntheticLowerOriginal:name})])),token=Object.freeze({});let sessionCloses=0,actorCalls=0;
 const session=Object.freeze({async close(){sessionCloses++;return{phase:'CLOSED'};}});originals.set('session',session);
 const joined=Object.freeze({session,async bindManualNote(){throw Error('HOST_NO_NEW_AUTHORIZATION');}});
 const consumer=Function('assert','exactRecord','nativeSourceRecoveryOriginalReferenceV1','reopenOriginalNativeSessionSourceV1','reopenOriginalNativeActorSourceV1',raw.slice(start).replace(/^export /gm,'')+';return reopenFixedOriginalNativeSourcePartV1;')(
  assert,exactRecord,(actual,section,name)=>{assert.equal(actual,token);assert.ok(['session','actor'].includes(section));return originals.get(name);},
  async(actual,contexts)=>{assert.equal(actual,token);assert.equal(contexts.owner,originals.get('owner'));return joined;},
  async(actual,contexts)=>{assert.equal(actual,token);assert.equal(contexts.session,session);actorCalls++;return{explicitSyntheticActor:true};});
 const contexts={runtime:originals.get('receiver'),system:originals.get('system'),account:originals.get('account'),owner:originals.get('owner')};
 const recovered=await consumer(token,'session',contexts);assert.equal(recovered,session);assert.notEqual(recovered,joined);
 await consumer(token,'actor',{session:recovered,account:contexts.account,owner:contexts.owner});assert.equal(actorCalls,1);
 await assert.rejects(consumer(token,'actor',{session:{...recovered},account:contexts.account,owner:contexts.owner}),/NATIVE_SOURCE_ORIGINAL_CONTEXT_REFERENCE/);assert.equal(actorCalls,1);
 assert.equal((await recovered.close()).phase,'CLOSED');assert.equal(sessionCloses,1);
});
async function capsule(root,options={}){
 const raw=await readFile(capsuleURL,'utf8');let source=raw.replace(/^import[\s\S]*?;[\r\n]+/gm,'').replace(/^export /gm,'');
 let imports=0;source=source.replace(/await import\('([^']+)'\)/g,(_full,path)=>{imports++;const key=path.includes('owned-evm-v2-runtime')?'runtimePort':path.includes('observed-clock')?'clockPort':path.includes('source-parts')?'partsPort':path.includes('account-authority')?'accountPort':path.includes('paired-original-account-actor')?'actorPort':path.includes('flat-manual-graph-session')?'sessionPort':null;assert.ok(key,'HOST_FIXED_IMPORT_PORT');return key;});assert.equal(imports,10,'HOST_SOURCE_IMPORT_CUT');
 const brands=new WeakMap(),resources={};let api;const handles={};let stopAfterCandidate=false,faultEnabled=false,faultIdentity=null,rootFault=false;
 class HostVault extends Vault{async update(...args){if(rootFault){rootFault=false;throw Error('HOST_ORIGINAL_BODY_ROOT_CAS_WINDOW');}if(stopAfterCandidate){stopAfterCandidate=false;throw Error('HOST_ORIGINAL_COMPLETED_CAS_WINDOW');}const result=await super.update(...args);if(faultEnabled&&await api?._hostNativeCandidate(result,faultIdentity,args[0])){stopAfterCandidate=true;}return result;}}
 async function retain(token,section,resource){const identity=api.nativeSourceRecoverySectionIdentityV1(token,section),value={schema:schemas[section],sourceSHA256:identity.sourceSHA256,ownedProcesses:[],confirmed:{schema:'EXPLICIT_INERT_SOURCE_HOST_SECTION_V1',section,financialAcceptance:false,...(section==='system'?{originalContracts:[randomBytes(700000).toString('base64'),randomBytes(700000).toString('base64')]}:{})},candidate:null};handles[section]=await api.retainOriginalNativeSourceSectionV1(token,section,value);resources[section]=resource;return resource;}
 const runtimePort={
  assertOwnedNativeDurableSourceRuntimeV1(runtime){assert.ok(brands.has(runtime),'EXPLICIT_INERT_HOST_SOURCE_RUNTIME');},
  async createOwnedNativeDurableSourceRuntimeV1(token){const request=api.consumeOriginalNativeSourceRuntimeRequestV1(token),admitted=api.originalNativeSourceRuntimeRequestIdentityV1(request),identity=admitted.identity,family=admitted.family;
   assert.throws(()=>api.originalNativeSourceRuntimeRequestIdentityV1({...request}),/ORIGINAL_RUNTIME_REQUEST/);
   const runtime=Object.freeze({processStatus:()=>({stopped:true}),financialAcceptance:false}),state={family,processGeneration:0};brands.set(runtime,state);
   if(admitted.opening){const seed=api.readOriginalNativeSourceRuntimeSeedV1(request);assert.equal(seed.confirmed.financialAcceptance,false);const snapshot=await api.readOriginalNativeSourceRuntimeStateV1(request);assert.equal(snapshot.family,family);assert.equal(snapshot.stateDump,'0x01');assert.equal(snapshot.uncertainMutation,false);state.processGeneration=snapshot.processGeneration+1;handles[family]=api.resumeOriginalNativeSourceRuntimeSeedV1(request);}
   else{const seed={schema:schemas[family],sourceSHA256:identity.sourceSHA256,ownedProcesses:[],confirmed:{schema:'EXPLICIT_INERT_NATIVE_STATE_SEED_V1',family,financialAcceptance:false},candidate:null};handles[family]=await api.retainOriginalNativeSourceRuntimeSeedV1(request,seed);}
   const owned=await api.originalNativeSourceRuntimeOwnedProcessV1(request,process.pid);const seed={schema:schemas[family],sourceSHA256:identity.sourceSHA256,ownedProcesses:[owned],confirmed:{schema:'EXPLICIT_INERT_NATIVE_STATE_SEED_V1',family,financialAcceptance:false},candidate:null};await api.updateOriginalNativeSourceSectionV1(handles[family],seed);
   await api.attachOriginalNativeSourceRuntimeV1(request,runtime);await api.confirmOriginalNativeSourceBirthV1(runtime);resources[family]=runtime;return runtime;
  },
  bindOwnedNativeDurableSourceClockPairV1(runtime,nativeRuntime){return Object.freeze({runtime,nativeRuntime});},
  async readOriginalNativeDurableSourceStateV1(runtime){const state=brands.get(runtime);assert.ok(state);return{schema:'OWNED_NATIVE_SOURCE_PRIVATE_STATE_V1',family:state.family,stateDump:'0x01',genesisHash:'ab'.repeat(32),head:{number:'1',hash:'cd'.repeat(32),timestamp:'1'},processGeneration:state.processGeneration,uncertainMutation:false};}
 };
 const partsPort={retainFixedOriginalNativeSourcePartV1:retain,async reopenFixedOriginalNativeSourcePartV1(token,section){if(['receiver','graphNative'].includes(section))return runtimePort.createOwnedNativeDurableSourceRuntimeV1(token);const value=api.consumeOriginalNativeSourceSectionV1(token,section);assert.equal(value.confirmed.financialAcceptance,false);assert.equal(value.candidate,null);handles[section]=api.resumeOriginalNativeSourceSectionV1(token,section);await api.updateOriginalNativeSourceSectionV1(handles[section],value);return Object.freeze({financialAcceptance:false});}};
 const accountRaw=await readFile(accountURL,'utf8'),start=accountRaw.indexOf('export async function reconcileOriginalNativeAccountSourceCheckpointV1(request) {'),end=accountRaw.indexOf('/** Abrupt SOURCE opening',start);assert.ok(start>=0&&end>start,'HOST_ORIGINAL_ACCOUNT_CHECKPOINT_BODY');
 const accountBody=accountRaw.slice(start,end).replace(/^export /m,'');
 const checkpointResolver=()=>new Function('ctx','const {'+Object.keys({assert,consumeOriginalNativeSourceAccountCheckpointV1:api.consumeOriginalNativeSourceAccountCheckpointV1,exactRecord,Vault,join,sha:value=>createHash('sha256').update(canonical(value)).digest('hex'),immutable:value=>JSON.parse(canonical(value))}).join(',')+'}=ctx;'+accountBody+';return reconcileOriginalNativeAccountSourceCheckpointV1;')({assert,consumeOriginalNativeSourceAccountCheckpointV1:api.consumeOriginalNativeSourceAccountCheckpointV1,exactRecord,Vault,join,sha:value=>createHash('sha256').update(canonical(value)).digest('hex'),immutable:value=>JSON.parse(canonical(value))});
 const actorRaw=await readFile(actorURL,'utf8'),actorStart=actorRaw.indexOf('export function reconcileOriginalNativeActorSourceCheckpointV1(request){'),actorEnd=actorRaw.indexOf('export async function retainOriginalNativeActorSourceV1',actorStart),helperStart=actorRaw.indexOf('function exact(value, fields)'),helperEnd=actorRaw.indexOf('function key(value)',helperStart);
 assert.ok(actorStart>=0&&actorEnd>actorStart&&helperStart>=0&&helperEnd>helperStart,'HOST_ORIGINAL_ACTOR_CHECKPOINT_BODY');
 const actorBody=actorRaw.slice(helperStart,helperEnd)+actorRaw.slice(actorStart,actorEnd).replace(/^export /m,'');
 const actorResolver=()=>{const ctx={need:(value,code)=>assert.ok(value,code),types,normalizeOriginalAccountAccessV2,normalizeOriginalAccountReviewV2,consumeOriginalNativeSourceActorCheckpointV1:api.consumeOriginalNativeSourceActorCheckpointV1};return Function('ctx','const {'+Object.keys(ctx).join(',')+'}=ctx;'+actorBody+';return reconcileOriginalNativeActorSourceCheckpointV1;')(ctx);};
 const actorPort={reconcileOriginalNativeActorSourceCheckpointV1:request=>actorResolver()(request)};
 const accountPort={createOriginalNativeSourceNoteAccountAuthorityV1:(token)=>retain(token,'account',Object.freeze({financialAcceptance:false})),reconcileOriginalNativeAccountSourceCheckpointV1:async request=>{assert.throws(()=>api.consumeOriginalNativeSourceAccountCheckpointV1({...request}),/ORIGINAL_CHECKPOINT_REQUEST/);const result=await checkpointResolver()(request);assert.throws(()=>api.consumeOriginalNativeSourceAccountCheckpointV1(request),/ORIGINAL_CHECKPOINT_REQUEST/);return result;}};

 const sessionPort={async createOriginalNativeSourceGraphAccountSessionV1(token){const session=Object.freeze({financialAcceptance:false});await retain(token,'session',session);return{session};}};
 const clockPort={readOriginalNativeSourceClockReferencesV1:()=>({runtime:resources.receiver,nativeRuntime:resources.graphNative}),snapshotOriginalNativeSourceObservedClockV1:()=> '1'};
 const names=['assert','randomBytes','randomUUID','createHash','createHmac','createCipheriv','createDecipheriv','constants','mkdir','lstat','realpath','open','rename','unlink','readFile','join','resolve','ROOT','Vault','canonical','exactRecord','NATIVE_VALUE_DEV_RELEASE_V5','assertOwnedEvmRecoveryStateDumpV1','runtimePort','clockPort','partsPort','accountPort','sessionPort','actorPort','HOST_HANDLES','types','deflateRawSync','inflateRawSync','HOST_ARM_FAULT','HOST_ARM_ROOT_FAULT'];
 const values=[assert,randomBytes,randomUUID,createHash,createHmac,createCipheriv,createDecipheriv,constants,mkdir,lstat,realpath,open,rename,unlink,readFile,join,resolve,root,HostVault,canonical,exactRecord,{hostSourceClosureSHA256:'ef'.repeat(32)},assertOwnedEvmRecoveryStateDumpV1,runtimePort,clockPort,partsPort,accountPort,sessionPort,actorPort,handles,types,deflateRawSync,inflateRawSync,identity=>{faultEnabled=true;faultIdentity=identity;},()=>{rootFault=true;}];
 const exports=[...raw.matchAll(/^export (?:async )?function (\w+)/gm)].map(match=>match[1]);api=new Function(...names,source+'\nreturn {'+exports.join(',')+",_hostSection(authority,name){return authorities.get(authority).record.data.sections[name]},_hostUpdate(authority,name,value){return updateOriginalNativeSourceSectionV1(HOST_HANDLES[name],value)},_hostTokenIdentity(authority,name){const h=handles.get(HOST_HANDLES[name]);return nativeSourceRecoverySectionIdentityV1(h.tokenState.token,name)},_hostArmNativeFault(authority){HOST_ARM_FAULT(assertOriginalNativeSourceCapsuleV1(authority))},async _hostNativeCandidate(record,identity,password){const data=(await decodeRecord(record,identity,password)).data;return Boolean(data.native.receiver?.candidate)},_hostArmRootFault(){HOST_ARM_ROOT_FAULT()},_hostStored(authority){const s=authorities.get(authority);return s.vault.read(s.password)},_hostReadRecord(authority){const s=authorities.get(authority);return readJournal(s.vault,s.password,s.identity)},_hostBodySizes(authority){const s=authorities.get(authority),clear=Buffer.from(sourceJSON(s.record.data)),packed=deflateRawSync(clear);try{return{clearBytes:clear.length,packedBytes:packed.length,oldBase64Chars:packed.toString('base64').length}}finally{clear.fill(0);packed.fill(0)}},_hostNativePin(authority,family){return copy(authorities.get(authority).record.data.native[family].confirmed)},_hostCheckpointRequest(authority,section='account'){const s=authorities.get(authority),request=opaque();checkpointRequests.set(request,{s,section,revision:s.record.revision,used:false});return request},_hostProcessIdentity(pid){return processIdentity(pid)},_hostClearAccountLock(authority,account,creator){const s=authorities.get(authority);return clearOriginalAccountCheckpointLock({...s,record:{...s.record,data:{...s.record.data,creator}}},account)}};")(...values);
 return{api,resources,checkpointResolver,actorResolver,accountRaw};
}
async function prepare(root,mode){const {api,resources}=await capsule(root,{completeCandidateFault:mode==='native-completed'}),authority=await api.createOriginalNativeSourceCapsuleV1();await api.createOriginalNativeSourceClockPairV1(authority);
 for(const section of ['bootstrap','system','provider','owner','executor'])await api.retainOriginalNativeSourceReferenceV1(authority,section,Object.freeze({financialAcceptance:false}));
 const account=await api.createOriginalNativeSourceAccountV1(authority,{});await api.createOriginalNativeSourceSessionV1(authority,{account});await api.retainOriginalNativeSourceReferenceV1(authority,'actor',Object.freeze({financialAcceptance:false}));await api.retainOriginalNativeSourceClockCheckpointV1(authority,Object.freeze({}));await api.finishOriginalNativeSourceBirthV1(authority);
 if(mode==='native-completed'){api._hostArmNativeFault(authority);const token=await api.beginOriginalNativeSourceMutationV1(resources.receiver);let stopped=false;try{await api.confirmOriginalNativeSourceMutationV1(token);}catch(error){if(error.message==='HOST_ORIGINAL_COMPLETED_CAS_WINDOW')stopped=true;else throw error;}assert.ok(stopped,'HOST_ORIGINAL_COMPLETED_CAS_WINDOW_NOT_REACHED');}
 if(mode==='pending')await api.beginOriginalNativeSourceMutationV1(resources.receiver);
 if(mode==='candidate'){const value=api._hostSection(authority,'account');await api._hostUpdate(authority,'account',{...value,candidate:{kind:'EXPLICIT_INERT_ORIGINAL_CAS',revision:1}});}
 return{api,authority};
}
async function launch(root,mode){const child=spawn(process.execPath,['--max-old-space-size=384',fileURLToPath(import.meta.url),'--source-capsule-child',mode,root],{stdio:['ignore','pipe','pipe','ipc'],env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'}});const completion=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});let errorText='';child.stderr.on('data',bytes=>{errorText+=bytes;assert.ok(errorText.length<1024);});child.stdout.resume();
 const ready=new Promise((resolve,reject)=>{child.once('message',message=>message?.ready===true?resolve():reject(Error('HOST_CHILD_READY')));completion.then(()=>reject(Error('HOST_CHILD_EXIT_BEFORE_READY '+mode+' '+errorText)));});await ready;return{child,completion,errorText};}
if(process.argv[2]==='--source-capsule-child'){
 try{if(process.argv[3]==='opening'){const {api}=await capsule(process.argv[4]),authority=await api.openOriginalNativeSourceCapsuleV1();assert.equal(api.originalNativeSourceCapsuleStatusV1(authority).phase,'OPENING');await api.reopenOriginalNativeSourceReferenceV1(authority,'receiver',{});}else await prepare(process.argv[4],process.argv[3]);await new Promise((resolve,reject)=>process.send({ready:true},error=>error?reject(error):resolve()));process.once('message',()=>process.exit(17));}
 catch(error){const code=String(error.code??(/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:error.name));const frames=String(error.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,2);process.stderr.write(JSON.stringify({code,frames}));process.exit(1);}
}else test('original SOURCE capsule reopens only confirmed hard-exit generations and keeps half mutations UNKNOWN',async t=>{
 const roots=[];t.after(async()=>{for(const root of roots)await rm(root,{recursive:true,force:true});});
 for(const mode of ['confirmed','pending','candidate','tamper']){const root=await mkdtemp(join(tmpdir(),'native-source-original-host-'));roots.push(root);const running=await launch(root,mode),{api}=await capsule(root);
  await assert.rejects(api.openOriginalNativeSourceCapsuleV1(),/OLD_PROCESS_PRESENT/);
  running.child.send({exit:true});const ended=await running.completion;assert.equal(ended.code,17);assert.equal(ended.signal,null);await assert.rejects(lstat('/proc/'+running.child.pid),{code:'ENOENT'});
  if(mode==='tamper'){const locator=JSON.parse(await readFile(join(root,'.local/original-native-source-durable-operator-v1/source.json'),'utf8'));const path=join(locator.identity.directory,'receiver-confirmed-0.aead'),fd=await open(path,constants.O_RDWR|constants.O_NOFOLLOW);try{const b=Buffer.alloc(1),size=(await fd.stat()).size;await fd.read(b,0,1,size-1);b[0]^=1;await fd.write(b,0,1,size-1);await fd.sync();b.fill(0);}finally{await fd.close();}}
  const authority=await api.openOriginalNativeSourceCapsuleV1(),status=api.originalNativeSourceCapsuleStatusV1(authority);
  if(mode==='tamper'){await assert.rejects(api.reopenOriginalNativeSourceReferenceV1(authority,'receiver',{}),/CONFIRMED_NATIVE_BYTES/);await api.closeOriginalNativeSourceCapsuleV1(authority);continue;}
  if(mode!=='confirmed'){assert.equal(status.phase,'UNKNOWN');assert.equal(status.pending,true);assert.equal(status.observationOnly,true);await assert.rejects(api.createOriginalNativeSourceClockPairV1(authority),/PENDING_UNKNOWN/);await assert.rejects(api.reopenOriginalNativeSourceReferenceV1(authority,'receiver',{}),/PENDING_UNKNOWN/);await api.closeOriginalNativeSourceCapsuleV1(authority);continue;}
  assert.equal(status.phase,'OPENING');assert.equal(status.generation,1);
  for(const section of Object.keys(schemas))await api.reopenOriginalNativeSourceReferenceV1(authority,section,{});
  assert.deepEqual(api._hostSection(authority,'system').confirmed.originalContracts.map(value=>value.length),[933336,933336]);
  await api.finishOriginalNativeSourceReopenV1(authority);assert.equal(api.originalNativeSourceCapsuleStatusV1(authority).phase,'CONFIRMED');assert.equal(api._hostTokenIdentity(authority,'account').profile,'NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1');
  const original=api._hostSection(authority,'account');await api._hostUpdate(authority,'account',original);assert.equal(api.originalNativeSourceCapsuleStatusV1(authority).pending,false);assert.throws(()=>api.assertOriginalNativeSourceCapsuleV1({...authority}),/ORIGINAL_CAPSULE/);
  await api.closeOriginalNativeSourceCapsuleV1(authority);await assert.rejects(api.openOriginalNativeSourceCapsuleV1(),/OLD_PROCESS_PRESENT/);
 }
});


if(process.argv[2]!=='--source-capsule-child')test('HOST SOURCE resumes completed native publication and interrupted OPENING without replay, and fences original account CAS',async t=>{
 const root=await mkdtemp(join(tmpdir(),'native-source-partial-host-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const first=await launch(root,'native-completed'),{api,checkpointResolver,actorResolver,accountRaw}=await capsule(root),oldCreator=await api._hostProcessIdentity(first.child.pid);
 await assert.rejects(api.openOriginalNativeSourceCapsuleV1(),/OLD_PROCESS_PRESENT/);first.child.send({exit:true});assert.deepEqual(await first.completion,{code:17,signal:null});await assert.rejects(lstat('/proc/'+first.child.pid),{code:'ENOENT'});
 const partial=await launch(root,'opening');await assert.rejects(api.openOriginalNativeSourceCapsuleV1(),/OLD_PROCESS_PRESENT/);partial.child.send({exit:true});assert.deepEqual(await partial.completion,{code:17,signal:null});await assert.rejects(lstat('/proc/'+partial.child.pid),{code:'ENOENT'});
 const authority=await api.openOriginalNativeSourceCapsuleV1();assert.equal(api.originalNativeSourceCapsuleStatusV1(authority).generation,2);assert.equal(api.originalNativeSourceCapsuleStatusV1(authority).pending,false);
 for(const section of Object.keys(schemas))await api.reopenOriginalNativeSourceReferenceV1(authority,section,{});await api.finishOriginalNativeSourceReopenV1(authority);
 const directory=join(root,'original-account');await mkdir(directory,{mode:0o700});const password='synthetic-original-account-cas',vault=new Vault(join(directory,'operations.vault'));
 const digest=value=>createHash('sha256').update(canonical(value)).digest('hex'),accountIdentity={accountId:'original-account',journalId:'original-journal',lifetime:'11'.repeat(32),registrySHA256:'22'.repeat(32)},initial=await vault.create({version:1,identitySHA256:'33'.repeat(32),accountIdentity,operations:[]},password);
 const seed={schema:'ORIGINAL_NATIVE_SOURCE_NOTE_ACCOUNT_SEED_V1',sourceSHA256:'ef'.repeat(32),poolIndex:0,directory,password,accountId:accountIdentity.accountId,journalId:accountIdentity.journalId,checkpointSHA256:digest(initial),identitySHA256:initial.data.identitySHA256,accountIdentity,ownerIdentity:{},hasNativeExecution:true,manualMode:true,providerBindings:{operations:[],installations:[]}};
 const nextData={...initial.data,operations:[{ownerOperationRef:'original-fixture-job',stage:'UNKNOWN',financialAcceptance:false}]},candidate={kind:'ACCOUNT_CAS',revision:1,checkpointSHA256:digest({revision:1,data:nextData})},original=api._hostSection(authority,'account');
 await api._hostUpdate(authority,'account',{...original,confirmed:seed,candidate});let reconciled=await checkpointResolver()(api._hostCheckpointRequest(authority));assert.equal(reconciled.confirmed.checkpointSHA256,digest(initial));assert.equal(reconciled.confirmed.interruptedOperation,true);assert.equal(reconciled.candidate,null);
 const completed=await vault.update(password,initial.revision,()=>nextData);reconciled=await checkpointResolver()(api._hostCheckpointRequest(authority));assert.equal(reconciled.confirmed.checkpointSHA256,digest(completed));assert.equal(reconciled.confirmed.interruptedOperation,true);
 await vault.update(password,completed.revision,data=>({...data,operations:[]}));await assert.rejects(checkpointResolver()(api._hostCheckpointRequest(authority)),/ORIGINAL_CHECKPOINT_CHANGED/);
 // The actual private recovery removes only the authenticated departed
 // creator's lock. A lock belonging to the still-live parent is never removed.
 const lock=async pid=>{const fd=await open(vault.lockPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await fd.writeFile(JSON.stringify({version:1,pid,token:'44'.repeat(32)}));await fd.sync();}finally{await fd.close();}};
 await lock(process.pid);await assert.rejects(api._hostClearAccountLock(authority,reconciled,oldCreator),/STALE_ACCOUNT_LOCK_OWNER/);assert.ok((await lstat(vault.lockPath)).isFile());await unlink(vault.lockPath);
 await lock(oldCreator.pid);await api._hostClearAccountLock(authority,reconciled,oldCreator);await assert.rejects(lstat(vault.lockPath),{code:'ENOENT'});
 const actorOriginal=api._hostSection(authority,'actor'),access={version:2,profile:'LIANUM_ORIGINAL_ACCOUNT_ACCESS_V2',origin:'https://127.0.0.1:4443',pairingId:'55'.repeat(32),challengeId:'66'.repeat(32),nonce:'77'.repeat(32),expiresAt:1,devicePublicKey:'04'+'88'.repeat(64),action:'read'},actorSeed={schema:'ORIGINAL_NATIVE_ACTOR_SOURCE_SEED_V1',origin:access.origin,pairingId:access.pairingId,devicePublicKey:access.devicePublicKey,initial:{body:{},review:{}},challenges:{accesses:[{id:access.challengeId,value:access,consumed:false}],reviews:[],stateAccesses:[{id:access.challengeId,value:access,consumed:false}],stateReviews:[]}};
 await api._hostUpdate(authority,'actor',{...actorOriginal,confirmed:actorSeed,candidate:{kind:'ACTOR_PERMISSION_OR_OBSERVATION',method:'readPrivateState'}});
 const actorRequest=api._hostCheckpointRequest(authority,'actor');assert.throws(()=>actorResolver()({...actorRequest}),/ORIGINAL_CHECKPOINT_REQUEST/);const burned=actorResolver()(actorRequest);assert.equal(burned.candidate,null);
 for(const name of ['accesses','stateAccesses']){assert.equal(burned.confirmed.challenges[name][0].consumed,true);assert.deepEqual(burned.confirmed.challenges[name][0].value,access);assert.equal(burned.confirmed.challenges[name][0].value.expiresAt,1);}assert.throws(()=>actorResolver()(actorRequest),/ORIGINAL_CHECKPOINT_REQUEST/);
 await api._hostUpdate(authority,'actor',actorOriginal);
 const body=(from,to)=>{const a=accountRaw.indexOf(from),b=accountRaw.indexOf(to,a+from.length);assert.ok(a>=0&&b>a);return accountRaw.slice(a,b);};
 const arm=body('  async function armLiveRecovery(original)','  async function liveArmedOwnerSnapshot('),tick=body('  async function tickLiveRecovery(lease)','  async function deviceExecution(original)');let effects=0;
 const lease={},ctx={assert,recovery:{source:true,sourceObservationRequired:true},exclusive:async work=>work(),healthy:async()=>{},continueWork:()=>{},liveRecovery:lease,busy:false,closed:false,cancelled:false,unavailable:false,capturing:false,reservationRows:()=>{effects++;throw Error('effect must not run');}};
 const actual=Function('ctx','const {'+Object.keys(ctx).join(',')+'}=ctx;'+arm+tick+';return{arm:armLiveRecovery,tick:tickLiveRecovery};')(ctx);
 await assert.rejects(actual.arm({action:'ARM_RECOVERY',bridge:{},consent:{}}),/OBSERVE_BEFORE_CONTINUATION/);assert.deepEqual(await actual.tick(lease),{state:'BUSY'});assert.equal(effects,0);
 await api._hostUpdate(authority,'account',original);await api.closeOriginalNativeSourceCapsuleV1(authority);
});

if(process.argv[2]!=='--source-capsule-child')test('HOST SOURCE journal body keeps the confirmed AEAD slot when root CAS fails',async t=>{
 const root=await mkdtemp(join(tmpdir(),'native-source-body-host-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const {api,authority}=await prepare(root,'confirmed'),identity=api.assertOriginalNativeSourceCapsuleV1(authority),before=await api._hostStored(authority),sizes=api._hostBodySizes(authority);
 assert.ok(sizes.oldBase64Chars>1024*1024,'HOST_ORIGINAL_INLINE_VAULT_CAPACITY_REPRODUCED');assert.ok(sizes.clearBytes<=64*1024*1024);assert.ok(Buffer.byteLength(canonical(before.data))<1024);
 assert.equal(before.data.schema,'ORIGINAL_NATIVE_SOURCE_PRIVATE_JOURNAL_BODY_V1');assert.equal(before.data.revision,before.revision);
 const path=join(identity.directory,before.data.path),original=await readFile(path);assert.equal(original.length,before.data.bytes);assert.equal(createHash('sha256').update(original).digest('hex'),before.data.sha256);
 const logical=await api._hostReadRecord(authority);api._hostArmRootFault();await assert.rejects(api._hostUpdate(authority,'account',api._hostSection(authority,'account')),/HOST_ORIGINAL_BODY_ROOT_CAS_WINDOW/);
 assert.deepEqual(await api._hostStored(authority),before);assert.deepEqual(await readFile(path),original);assert.deepEqual(await api._hostReadRecord(authority),logical);
 const other=join(identity.directory,before.data.path==='source-body-0.aead'?'source-body-1.aead':'source-body-0.aead');assert.ok((await lstat(other)).isFile());
 const fd=await open(path,constants.O_RDWR|constants.O_NOFOLLOW);try{const byte=Buffer.from([original[original.length-1]^1]);await fd.write(byte,0,1,original.length-1);await fd.sync();byte.fill(0);}finally{await fd.close();}
 await assert.rejects(api._hostReadRecord(authority),/NATIVE_SOURCE_JOURNAL_BODY_BYTES/);original.fill(0);await api.closeOriginalNativeSourceCapsuleV1(authority);
});
