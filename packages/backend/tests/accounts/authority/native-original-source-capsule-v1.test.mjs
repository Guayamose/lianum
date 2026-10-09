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
const engineURL=new URL(generated?'../../../../../omnichain-product/src/vault.mjs':'../../../../engine/src/crypto/vault.mjs',import.meta.url);
const privacyURL=new URL(generated?'../../../../../omnichain-product/src/privacy.mjs':'../../../../engine/src/crypto/privacy.mjs',import.meta.url);
const encodingURL=new URL(generated?'../paeg/commitments.mjs':'../../../src/execution/encoding/commitments.mjs',import.meta.url);
const boundURL=new URL(generated?'../chain-adapters/owned-evm-recovery-state-bound-v1.mjs':'../../../src/chains/evm/runtime/owned-evm-recovery-state-bound-v1.mjs',import.meta.url);
const [{Vault},{canonical},{exactRecord},{assertOwnedEvmRecoveryStateDumpV1}]=await Promise.all([import(engineURL),import(privacyURL),import(encodingURL),import(boundURL)]);
const schemas={receiver:'ORIGINAL_NATIVE_SOURCE_RUNTIME_V1',graphNative:'ORIGINAL_NATIVE_SOURCE_RUNTIME_V1',bootstrap:'ORIGINAL_NATIVE_BOOTSTRAP_DURABLE_SOURCE_V1',system:'ORIGINAL_NATIVE_SYSTEM_DURABLE_SOURCE_V1',provider:'ORIGINAL_NATIVE_PROVIDER_DURABLE_SOURCE_V1',owner:'ORIGINAL_NATIVE_OWNER_DURABLE_SOURCE_V1',executor:'ORIGINAL_NATIVE_EXECUTOR_DURABLE_SOURCE_V1',account:'ORIGINAL_NATIVE_SOURCE_ACCOUNT_SECTION_V1',session:'ORIGINAL_NATIVE_SOURCE_SESSION_SECTION_V1',actor:'ORIGINAL_NATIVE_ACTOR_DURABLE_SOURCE_V1'};
async function capsule(root){
 const raw=await readFile(capsuleURL,'utf8');let source=raw.replace(/^import[\s\S]*?;[\r\n]+/gm,'').replace(/^export /gm,'');
 let imports=0;source=source.replace(/await import\('([^']+)'\)/g,(_full,path)=>{imports++;const key=path.includes('owned-evm-v2-runtime')?'runtimePort':path.includes('observed-clock')?'clockPort':path.includes('source-parts')?'partsPort':path.includes('account-authority')?'accountPort':path.includes('flat-manual-graph-session')?'sessionPort':null;assert.ok(key,'HOST_FIXED_IMPORT_PORT');return key;});assert.equal(imports,8,'HOST_SOURCE_IMPORT_CUT');
 const brands=new WeakMap(),resources={};let api;const handles={};
 async function retain(token,section,resource){const identity=api.nativeSourceRecoverySectionIdentityV1(token,section),value={schema:schemas[section],sourceSHA256:identity.sourceSHA256,ownedProcesses:[],confirmed:{schema:'EXPLICIT_INERT_SOURCE_HOST_SECTION_V1',section,financialAcceptance:false,...(section==='system'?{originalContracts:['a'.repeat(700000),'b'.repeat(700000)]}:{})},candidate:null};handles[section]=await api.retainOriginalNativeSourceSectionV1(token,section,value);resources[section]=resource;return resource;}
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
 const accountPort={createOriginalNativeSourceNoteAccountAuthorityV1:(token)=>retain(token,'account',Object.freeze({financialAcceptance:false}))};
 const sessionPort={async createOriginalNativeSourceGraphAccountSessionV1(token){const session=Object.freeze({financialAcceptance:false});await retain(token,'session',session);return{session};}};
 const clockPort={readOriginalNativeSourceClockReferencesV1:()=>({runtime:resources.receiver,nativeRuntime:resources.graphNative}),snapshotOriginalNativeSourceObservedClockV1:()=> '1'};
 const names=['assert','randomBytes','randomUUID','createHash','createHmac','createCipheriv','createDecipheriv','constants','mkdir','lstat','realpath','open','rename','unlink','readFile','join','resolve','ROOT','Vault','canonical','exactRecord','NATIVE_VALUE_DEV_RELEASE_V5','assertOwnedEvmRecoveryStateDumpV1','runtimePort','clockPort','partsPort','accountPort','sessionPort','HOST_HANDLES','types','deflateRawSync','inflateRawSync'];
 const values=[assert,randomBytes,randomUUID,createHash,createHmac,createCipheriv,createDecipheriv,constants,mkdir,lstat,realpath,open,rename,unlink,readFile,join,resolve,root,Vault,canonical,exactRecord,{hostSourceClosureSHA256:'ef'.repeat(32)},assertOwnedEvmRecoveryStateDumpV1,runtimePort,clockPort,partsPort,accountPort,sessionPort,handles,types,deflateRawSync,inflateRawSync];
 const exports=[...raw.matchAll(/^export (?:async )?function (\w+)/gm)].map(match=>match[1]);api=new Function(...names,source+'\nreturn {'+exports.join(',')+",_hostSection(authority,name){return authorities.get(authority).record.data.sections[name]},_hostUpdate(authority,name,value){return updateOriginalNativeSourceSectionV1(HOST_HANDLES[name],value)},_hostTokenIdentity(authority,name){const h=handles.get(HOST_HANDLES[name]);return nativeSourceRecoverySectionIdentityV1(h.tokenState.token,name)}};")(...values);
 return{api,resources};
}
async function prepare(root,mode){const {api,resources}=await capsule(root),authority=await api.createOriginalNativeSourceCapsuleV1();await api.createOriginalNativeSourceClockPairV1(authority);
 for(const section of ['bootstrap','system','provider','owner','executor'])await api.retainOriginalNativeSourceReferenceV1(authority,section,Object.freeze({financialAcceptance:false}));
 const account=await api.createOriginalNativeSourceAccountV1(authority,{});await api.createOriginalNativeSourceSessionV1(authority,{account});await api.retainOriginalNativeSourceReferenceV1(authority,'actor',Object.freeze({financialAcceptance:false}));await api.retainOriginalNativeSourceClockCheckpointV1(authority,Object.freeze({}));await api.finishOriginalNativeSourceBirthV1(authority);
 if(mode==='pending')await api.beginOriginalNativeSourceMutationV1(resources.receiver);
 if(mode==='candidate'){const value=api._hostSection(authority,'account');await api._hostUpdate(authority,'account',{...value,candidate:{kind:'EXPLICIT_INERT_ORIGINAL_CAS',revision:1}});}
 return{api,authority};
}
async function launch(root,mode){const child=spawn(process.execPath,['--max-old-space-size=384',fileURLToPath(import.meta.url),'--source-capsule-child',mode,root],{stdio:['ignore','pipe','pipe','ipc'],env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'}});const completion=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});let errorText='';child.stderr.on('data',bytes=>{errorText+=bytes;assert.ok(errorText.length<1024);});child.stdout.resume();
 const ready=new Promise((resolve,reject)=>{child.once('message',message=>message?.ready===true?resolve():reject(Error('HOST_CHILD_READY')));completion.then(()=>reject(Error('HOST_CHILD_EXIT_BEFORE_READY')));});await ready;return{child,completion,errorText};}
if(process.argv[2]==='--source-capsule-child'){
 try{await prepare(process.argv[4],process.argv[3]);await new Promise((resolve,reject)=>process.send({ready:true},error=>error?reject(error):resolve()));process.once('message',()=>process.exit(17));}
 catch(error){process.stderr.write(String(error.code??error.name));process.exit(1);}
}else test('original SOURCE capsule reopens only confirmed hard-exit generations and keeps half mutations UNKNOWN',async t=>{
 const roots=[];t.after(async()=>{for(const root of roots)await rm(root,{recursive:true,force:true});});
 for(const mode of ['confirmed','pending','candidate','tamper']){const root=await mkdtemp(join(tmpdir(),'native-source-original-host-'));roots.push(root);const running=await launch(root,mode),{api}=await capsule(root);
  await assert.rejects(api.openOriginalNativeSourceCapsuleV1(),/OLD_PROCESS_PRESENT/);
  running.child.send({exit:true});const ended=await running.completion;assert.equal(ended.code,17);assert.equal(ended.signal,null);await assert.rejects(lstat('/proc/'+running.child.pid),{code:'ENOENT'});
  if(mode==='tamper'){const locator=JSON.parse(await readFile(join(root,'.local/original-native-source-durable-operator-v1/source.json'),'utf8'));const path=join(locator.identity.directory,'receiver-confirmed.aead'),fd=await open(path,constants.O_RDWR|constants.O_NOFOLLOW);try{const b=Buffer.alloc(1),size=(await fd.stat()).size;await fd.read(b,0,1,size-1);b[0]^=1;await fd.write(b,0,1,size-1);await fd.sync();b.fill(0);}finally{await fd.close();}}
  const authority=await api.openOriginalNativeSourceCapsuleV1(),status=api.originalNativeSourceCapsuleStatusV1(authority);
  if(mode==='tamper'){await assert.rejects(api.reopenOriginalNativeSourceReferenceV1(authority,'receiver',{}),/CONFIRMED_NATIVE_BYTES/);await api.closeOriginalNativeSourceCapsuleV1(authority);continue;}
  if(mode!=='confirmed'){assert.equal(status.phase,'UNKNOWN');assert.equal(status.pending,true);assert.equal(status.observationOnly,true);await assert.rejects(api.createOriginalNativeSourceClockPairV1(authority),/PENDING_UNKNOWN/);await assert.rejects(api.reopenOriginalNativeSourceReferenceV1(authority,'receiver',{}),/PENDING_UNKNOWN/);await api.closeOriginalNativeSourceCapsuleV1(authority);continue;}
  assert.equal(status.phase,'OPENING');assert.equal(status.generation,1);
  for(const section of Object.keys(schemas))await api.reopenOriginalNativeSourceReferenceV1(authority,section,{});
  assert.deepEqual(api._hostSection(authority,'system').confirmed.originalContracts,['a'.repeat(700000),'b'.repeat(700000)]);
  await api.finishOriginalNativeSourceReopenV1(authority);assert.equal(api.originalNativeSourceCapsuleStatusV1(authority).phase,'CONFIRMED');assert.equal(api._hostTokenIdentity(authority,'account').profile,'NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1');
  const original=api._hostSection(authority,'account');await api._hostUpdate(authority,'account',original);assert.equal(api.originalNativeSourceCapsuleStatusV1(authority).pending,false);assert.throws(()=>api.assertOriginalNativeSourceCapsuleV1({...authority}),/ORIGINAL_CAPSULE/);
  await api.closeOriginalNativeSourceCapsuleV1(authority);await assert.rejects(api.openOriginalNativeSourceCapsuleV1(),/OLD_PROCESS_PRESENT/);
 }
});
