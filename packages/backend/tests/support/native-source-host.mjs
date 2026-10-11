/** Inert native ports around the real SOURCE lifecycle. No source extraction,
 * private-map access, financial runtime, proof or authority setter is used. */
import {mock} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {Vault} from '@lianum/engine/crypto/vault';
import {sha,immutable} from '@lianum/engine/accounts/journal';
import {canonical} from '@lianum/engine/crypto/privacy';
import {createNativeSourceJournalCodecV1} from '../../src/operations/recovery/source-journal/journal-codec-v1.mjs';
import {privateDirectory,readPrivate,replace} from '../../src/operations/recovery/source-journal/private-files-v1.mjs';
import {processIdentity} from '../../src/operations/recovery/source-journal/process-identity-v1.mjs';
import {clearNativeSourceAccountCheckpointLockV1} from '../../src/operations/recovery/source-journal/account-lock-v1.mjs';
import * as originalCheckpointData from '../../src/operations/recovery/source-journal/checkpoint-reconciliation-v1.mjs';
const {reconcileNativeSourceAccountCheckpointDataV1,reconcileNativeSourceActorCheckpointDataV1}=originalCheckpointData;

export const sourceHostSchemas=Object.freeze({receiver:'ORIGINAL_NATIVE_SOURCE_RUNTIME_V1',graphNative:'ORIGINAL_NATIVE_SOURCE_RUNTIME_V1',bootstrap:'ORIGINAL_NATIVE_BOOTSTRAP_DURABLE_SOURCE_V1',system:'ORIGINAL_NATIVE_SYSTEM_DURABLE_SOURCE_V1',provider:'ORIGINAL_NATIVE_PROVIDER_DURABLE_SOURCE_V1',owner:'ORIGINAL_NATIVE_OWNER_DURABLE_SOURCE_V1',executor:'ORIGINAL_NATIVE_EXECUTOR_DURABLE_SOURCE_V1',account:'ORIGINAL_NATIVE_SOURCE_ACCOUNT_SECTION_V1',session:'ORIGINAL_NATIVE_SOURCE_SESSION_SECTION_V1',actor:'ORIGINAL_NATIVE_ACTOR_DURABLE_SOURCE_V1'});
const recoveryURL=new URL('../../src/operations/recovery/',import.meta.url);

export async function createNativeSourceHost(root,{largeContracts=false}={}){
 const brands=new WeakMap(),identities=new WeakMap(),resources={},handles={},tokens={},sections={},mocks=[],checkpointChecks={account:0};
 let api,rootFault=false,candidateFault=false,stopAfterCandidate=false;
 const accountReaders={readAccountRecord:(directory,password)=>new Vault(join(directory,'operations.vault')).read(password),hashRecord:sha,immutable};
 const codec=createNativeSourceJournalCodecV1({canonical,validateIdentity(identity){assert.equal(identity.directory,join(root,'.local/original-native-source-durable-operator-v1/realms','realm-'+identity.runId));},readPrivate,replace});
 class HostVault extends Vault{
  async update(...args){
   if(rootFault){rootFault=false;throw Error('HOST_ORIGINAL_BODY_ROOT_CAS_WINDOW');}
   if(stopAfterCandidate){stopAfterCandidate=false;throw Error('HOST_ORIGINAL_COMPLETED_CAS_WINDOW');}
   const result=await super.update(...args);
   if(candidateFault){const locator=JSON.parse(await readFile(join(root,'.local/original-native-source-durable-operator-v1/source.json'),'utf8'));
    if((await codec.decodeRecord(result,locator.identity,args[0])).data.native.receiver?.candidate)stopAfterCandidate=true;}
   return result;
  }
 }
 const install=(url,exports)=>mocks.push(mock.module(url,{exports}));
 async function retain(token,section,resource){
  const identity=api.nativeSourceRecoverySectionIdentityV1(token,section);
  const contractBytes=largeContracts?700000:96;
  const value={schema:sourceHostSchemas[section],sourceSHA256:identity.sourceSHA256,ownedProcesses:[],confirmed:{schema:'EXPLICIT_INERT_SOURCE_HOST_SECTION_V1',section,financialAcceptance:false,...(section==='system'?{originalContracts:[randomBytes(contractBytes).toString('base64'),randomBytes(contractBytes).toString('base64')]}:{})},candidate:null};
  handles[section]=await api.retainOriginalNativeSourceSectionV1(token,section,value);tokens[section]=token;sections[section]=value;resources[section]=resource;return resource;
 }
 const nativeBackend={
  async create(request){
   const admitted=api.originalNativeSourceRuntimeRequestIdentityV1(request),{identity,family}=admitted;
   assert.throws(()=>api.originalNativeSourceRuntimeRequestIdentityV1({...request}),/ORIGINAL_RUNTIME_REQUEST/);
   const runtime=Object.freeze({processStatus:()=>({stopped:true}),async block(){return {number:'1',hash:'cd'.repeat(32),timestamp:'1'};},async assertCanonical(head){assert.deepEqual(head,await this.block());},lifecycle:[{event:'stopped-owned-process',forced:false}],async close(){return{closed:true,stopped:true};},financialAcceptance:false});
   const state={family,identity,generation:0};brands.set(runtime,state);
   if(admitted.opening){
    const seed=api.readOriginalNativeSourceRuntimeSeedV1(request);assert.equal(seed.confirmed.financialAcceptance,false);
    const snapshot=await api.readOriginalNativeSourceRuntimeStateV1(request);assert.equal(snapshot.family,family);assert.equal(snapshot.stateDump,'0x01');assert.equal(snapshot.uncertainMutation,false);
    state.generation=snapshot.processGeneration+1;handles[family]=api.resumeOriginalNativeSourceRuntimeSeedV1(request);
   }else{
    const seed={schema:sourceHostSchemas[family],sourceSHA256:identity.sourceSHA256,ownedProcesses:[],confirmed:{schema:'EXPLICIT_INERT_NATIVE_STATE_SEED_V1',family,financialAcceptance:false},candidate:null};
    handles[family]=await api.retainOriginalNativeSourceRuntimeSeedV1(request,seed);
   }
   const owned=await api.originalNativeSourceRuntimeOwnedProcessV1(request,process.pid);
   const seed={schema:sourceHostSchemas[family],sourceSHA256:identity.sourceSHA256,ownedProcesses:[owned],confirmed:{schema:'EXPLICIT_INERT_NATIVE_STATE_SEED_V1',family,financialAcceptance:false},candidate:null};
   await api.updateOriginalNativeSourceSectionV1(handles[family],seed);sections[family]=seed;resources[family]=runtime;return runtime;
  },
  identity(runtime){assert.ok(brands.has(runtime));return brands.get(runtime);},
  assert(runtime){assert.ok(brands.has(runtime),'EXPLICIT_INERT_HOST_SOURCE_RUNTIME');},
  bindClocks(receiver,native){assert.ok(brands.has(receiver)&&brands.has(native));},
  async snapshot(runtime){const state=brands.get(runtime);assert.ok(state);return{schema:'OWNED_NATIVE_SOURCE_PRIVATE_STATE_V1',family:state.family,stateDump:'0x01',genesisHash:'ab'.repeat(32),head:{number:'1',hash:'cd'.repeat(32),timestamp:'1'},processGeneration:state.generation,uncertainMutation:false};}
 };
 const parts={retainFixedOriginalNativeSourcePartV1:retain,async reopenFixedOriginalNativeSourcePartV1(token,section){
  if(['receiver','graphNative'].includes(section))return api.createOwnedNativeDurableSourceRuntimeV1(token);
  const value=api.consumeOriginalNativeSourceSectionV1(token,section);assert.notEqual(value.confirmed.financialAcceptance,true);assert.equal(value.candidate,null);
  handles[section]=api.resumeOriginalNativeSourceSectionV1(token,section);tokens[section]=token;sections[section]=value;
  await api.updateOriginalNativeSourceSectionV1(handles[section],value);return Object.freeze({financialAcceptance:false});
 }};
 install('@lianum/proofs/catalog',{ROOT:root});
 install('@lianum/engine/crypto/vault',{Vault:HostVault});
 install(new URL('../releases/native-value/native-value-dev-release-v5.mjs',recoveryURL),{NATIVE_VALUE_DEV_RELEASE_V5:{hostSourceClosureSHA256:'ef'.repeat(32)}});
 install(new URL('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs',recoveryURL),{});
 install(new URL('device-external-flat-original-source-v2.mjs',recoveryURL),{});
 install(new URL('../../chains/evm/runtime/owned-evm-runtime-backend-v1.mjs',recoveryURL),{buildOwnedEvmRuntimeBackendV1(contracts){assert.ok(contracts.journal);return Object.freeze({sourceRuntime:nativeBackend,assertOwnedNativeEconomicObservedReceiverV2:runtime=>nativeBackend.assert(runtime),assertOwnedNativeEconomicObservedGraphRuntimeV2:runtime=>nativeBackend.assert(runtime),async refreshNativeValueReceiverClock(runtime){nativeBackend.assert(runtime);},async refreshOwnedNativeEconomicObservedGraphClockV2(runtime){nativeBackend.assert(runtime);}});}});
 install(new URL('native-original-source-parts-v1.mjs',recoveryURL),parts);
 install(new URL('../../accounts/authority/native-value-account-authority-v2.mjs',recoveryURL),{
  createOriginalNativeSourceNoteAccountAuthorityV1:token=>retain(token,'account',Object.freeze({financialAcceptance:false})),
 });
 install(new URL('source-journal/checkpoint-reconciliation-v1.mjs',recoveryURL),{
  ...originalCheckpointData,
  async reconcileNativeSourceAccountCheckpointDataV1(input,readers){
   assert.throws(()=>api.consumeOriginalNativeSourceAccountCheckpointV1({...input}),/ORIGINAL_CHECKPOINT_REQUEST/);
   const result=await reconcileNativeSourceAccountCheckpointDataV1(input,readers);
   checkpointChecks.account++;return result;
  }
 });
 install(new URL('../deployments/native-value/native-value-system-v2.mjs',recoveryURL),{});
 install(new URL('../../api/accounts/native-manual-session-backend-v1.mjs',recoveryURL),{buildNativeManualSessionV1(contracts){assert.ok(contracts.source);return Object.freeze({async createOriginalNativeSourceGraphAccountSessionV1(token){const session=Object.freeze({financialAcceptance:false});await retain(token,'session',session);return{session};}});}});
 try{api=await import(new URL('native-original-source-lifecycle-v1.mjs?host='+randomUUID(),recoveryURL));}
 catch(error){for(const item of mocks.reverse())item.restore();throw error;}
 async function stored(authority){const identity=identities.get(authority)??api.assertOriginalNativeSourceCapsuleV1(authority);identities.set(authority,identity);const secret=await readFile(join(identity.directory,'source.secret'));
  try{const password=secret.toString('hex');return{identity,password,record:await new Vault(join(identity.directory,'source.vault')).read(password)};}finally{secret.fill(0);}}
 return{api,resources,codec,checkpointChecks,section:name=>structuredClone(sections[name]),
  async update(section,value){await api.updateOriginalNativeSourceSectionV1(handles[section],value);sections[section]=structuredClone(value);},
  tokenIdentity:section=>api.nativeSourceRecoverySectionIdentityV1(tokens[section],section),
  armNativeFault(){candidateFault=true;},armRootFault(){rootFault=true;},
  async stored(authority){return(await stored(authority)).record;},
  async readRecord(authority){const {record,identity,password}=await stored(authority);return codec.decodeRecord(record,identity,password);},
  processIdentity,clearAccountLock:clearNativeSourceAccountCheckpointLockV1,
  reconcileAccount:input=>reconcileNativeSourceAccountCheckpointDataV1(input,accountReaders),reconcileActor:reconcileNativeSourceActorCheckpointDataV1,
  async assertPrivateRoot(){await privateDirectory(root);},
  restore(){for(const item of mocks.splice(0).reverse())item.restore();}
 };
}
