/** Original local-runtime-only V4 bootstrap. No URL, signer, key, store, clock,
 * transport or caller profile can be installed. Four signer/source positions
 * perform independent fresh reads on each same-host/same-node synthetic chain;
 * distinct slots do NOT establish independent infrastructure or consensus. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../../../../../proofs/src/catalog.mjs';
import { exactRecord, fixedArray, bytes32, ZERO } from '../../../execution/encoding/commitments.mjs';
import { cloneInput, frozenInput } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { createLocalNativeValueOperator, createNativeValueOperatorQuorum, assertNativeOperatorEconomicRecoveryIdleV1,
  fenceOriginalNativeOperatorEconomicRecoveryV1, captureOriginalNativeOperatorEconomicRecoveryV1,
  stopCapturedNativeOperatorEconomicRecoveryV1, abortNativeOperatorEconomicRecoveryV1,
  reopenOriginalNativeOperatorEconomicRecoveryV1 } from './native-value-operators-v4.mjs';
import { createClaimRecordStore, openClaimRecordStore, canonicalClaimRecordDataV1 } from '../../../claims/storage/segmented-record-store.mjs';
import { assertNativeEconomicRecoveryCaptureV1, nativeEconomicRecoverySectionIdentityV1,
  consumeNativeEconomicRecoverySectionV1 } from '../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import { nativeValueOriginalRecoverySourceV1 } from '../../deployments/native-value/native-value-system-v2.mjs';
import { assertNativeValueRegistrations } from '../../deployments/native-value/native-value-registry-v2.mjs';
import { createNativeValueOperatorInventory, nativeValueInventoryBinding, nativeValuePolicy,
  validateNativeValueOperatorInventory } from './native-value-inventory-v4.mjs';
import { profileCommitment, sourceCommitment, sha256, validateProfile } from '../../../chains/shared/transfers/generic-native-value-v2.mjs';
import { PROFILE_SCHEMA, REGISTRY_SCHEMA, CHAINS, createProfile } from '../../../chains/evm/transfers/evm-native-value-v2.mjs';
import * as Tron from '../../../chains/tron/transfers/tron-native-graph-profile.mjs';
import { bindOriginalEvmGraphTransfer } from '../../../chains/evm/transfers/evm-graph-transfer-binding.mjs';
import { isOwnedLocalEvmNativeValueRuntime, assertOwnedLocalEvmNativeValueRuntimeLive }
  from '../../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { describeOwnedLocalEvmNativeValueSource, createOwnedLocalEvmNativeValueHealthSource }
  from '../../../chains/evm/health/owned-evm-native-value-health-source-v4.mjs';
import { NATIVE_QUORUM_PROFILE } from '../../../../../engine/src/evidence/native-quorum.mjs';
export const NATIVE_VALUE_LOCAL_BOOTSTRAP_PROFILE = 'OWNED_LOCAL_FULL_HISTORY_NATIVE_VALUE_BOOTSTRAP_V4';
const owns=new WeakMap(),claimedNativeRuntimes=new WeakSet(),pendingNativeRuntimes=new WeakSet(),copy=cloneInput,freeze=frozenInput;
const operatorRecoveryTokens=new WeakMap();
const checkpoint=snapshot=>({revision:snapshot.revision,commitment:snapshot.commitment});
const node=(a,b)=>sha256(Buffer.from('01'+a+b,'hex')),originalKey=(p,n)=>p+':'+n;
const limits=Object.freeze({maximumAncestry:'32',maximumEvidenceLifetime:'30',maximumBlockAgeMs:'1800000',maximumClockSkewMs:'5000',maximumQueryMs:'10000'});
export const NATIVE_VALUE_LOCAL_WALLCLOCK_BOOTSTRAP_PROFILE_V1='OWNED_LOCAL_TRON_WALLCLOCK_BOOTSTRAP_V1';
// Explicit new initial registration, never a rewrite of V4 or any certificate.
// The native facts frame hashes this lifetime; full-audit 30s guards are separate.
export const LOCAL_TRON_WALLCLOCK_LIMITS_V1=Object.freeze({...limits,maximumAncestry:'256',maximumEvidenceLifetime:'300'});
export const LOCAL_TRON_WALLCLOCK_PROFILE_RELEASE_V1=Object.freeze({format:'REVIEWED_LOCAL_TRON_INITIAL_WALLCLOCK_PROFILE_V1',
  maximumEvidenceLifetime:'300',maximumAncestry:'256',maximumTaposDistance:'256',fullAuditMilliseconds:30000,
  localOnly:true,publicNetwork:false,independentInfrastructureEstablished:false,
  acceptedPrivateGraphEstablished:false,privateNativeCreditEstablished:false});
export function assertLocalTronWallclockProfileReleaseV1(){
 assert.equal(arguments.length,0,'NATIVE_VALUE_WALLCLOCK_RELEASE_NO_OPTIONS');
 assert.ok(LOCAL_TRON_WALLCLOCK_PROFILE_RELEASE_V1,'NATIVE_VALUE_WALLCLOCK_PROFILE_RELEASE_ABSENT');
 assert.deepEqual(LOCAL_TRON_WALLCLOCK_PROFILE_RELEASE_V1,{format:'REVIEWED_LOCAL_TRON_INITIAL_WALLCLOCK_PROFILE_V1',
  maximumEvidenceLifetime:'300',maximumAncestry:'256',maximumTaposDistance:'256',fullAuditMilliseconds:30000,
  localOnly:true,publicNetwork:false,independentInfrastructureEstablished:false,
  acceptedPrivateGraphEstablished:false,privateNativeCreditEstablished:false});return true;
}
const operatorIdentity=i=>sha256('LIANUM/owned-local-native-operator-slot/1\0'+i);
function merkle(leaves,depth) {
  let level=[...leaves,...Array((1<<depth)-leaves.length).fill(ZERO)];const levels=[level];
  for(let d=0;d<depth;d++){level=Array.from({length:level.length/2},(_,i)=>node(level[2*i],level[2*i+1]));levels.push(level);}
  return {root:level[0],path:index=>({index:String(index),siblings:Array.from({length:depth},(_,d)=>levels[d][(index>>d)^1])})};
}
async function drained(work) {const results=await Promise.allSettled(work.map(fn=>Promise.resolve().then(fn)));const failed=results.find(v=>v.status==='rejected');if(failed)throw failed.reason;return results.map(v=>v.value);}
async function runtimeEntry(nativeRuntime,sourceLimits=limits) {
  let descriptors,preliminary,assertLive,createSource;
  if(isOwnedLocalEvmNativeValueRuntime(nativeRuntime)) {
    assertLive=()=>assertOwnedLocalEvmNativeValueRuntimeLive(nativeRuntime);assertLive();
    descriptors=await drained([0,1,2,3].map(i=>()=>describeOwnedLocalEvmNativeValueSource(nativeRuntime,i)));assertLive();
    const first=descriptors[0];
    assert.ok(CHAINS[first.chainId], 'NATIVE_VALUE_LOCAL_REGISTERED_EVM_CHAIN');
    preliminary=createProfile({chain:CHAINS[first.chainId][0],genesisHash:'0x'+first.genesis,sourceSetRoot:sha256('native-value-local-unbound-source-root'),...sourceLimits});
    createSource=input=>createOwnedLocalEvmNativeValueHealthSource({nativeRuntime,...input});
  } else {
    // Exact fixed factory modules, never a caller module path or transport.
    const R=await import('../../../chains/tron/runtime/owned-tron-native-value-runtime.mjs');
    assert.ok(R.isOwnedLocalTronNativeValueV1(nativeRuntime),'NATIVE_VALUE_LOCAL_ORIGINAL_RUNTIME_REQUIRED');
    assertLive=()=>R.assertOwnedLocalTronNativeValueRuntimeLive(nativeRuntime);assertLive();
    await R.assertOwnedLocalTronNativeValueV1(nativeRuntime);assertLive();
    const genesis=nativeRuntime.metadata.genesis;bytes32(genesis,true);
    preliminary=Tron.validateProfile({schema:Tron.PROFILE_SCHEMA,version:'2',genesis,asset:Tron.tronGraphAsset(genesis),
      sourceSetRoot:sha256('native-value-local-unbound-source-root'),finalityPolicy:sha256(Tron.FINALITY),permissionPolicy:sha256(Tron.PERMISSION),
      taposExpiryPolicy:sha256(Tron.TAPOS_EXPIRY),obligation:sha256(Tron.OBLIGATION),maximumTaposDistance:'256',...sourceLimits});
    const S=await import('../../../chains/tron/health/owned-tron-native-value-health-source-v4.mjs');
    descriptors=await drained([0,1,2,3].map(i=>()=>S.describeOwnedLocalTronNativeValueSource(nativeRuntime,{profile:preliminary,sourceIndex:String(i)})));assertLive();
    createSource=input=>S.createOwnedLocalTronNativeValueHealthSource({nativeRuntime,...input});
  }
  const sources=descriptors.map((descriptor,i)=>{
    assert.equal(descriptor.publicNetwork,false,'NATIVE_VALUE_LOCAL_PUBLIC_NETWORK_REJECTED');
    assert.equal(descriptor.genesis,preliminary.genesis,'NATIVE_VALUE_LOCAL_SOURCE_GENESIS');
    if(preliminary.schema===PROFILE_SCHEMA)assert.equal(descriptor.chainId,preliminary.chainId,'NATIVE_VALUE_LOCAL_SOURCE_CHAIN');
    const identity={operatorIdentity:operatorIdentity(i),...copy(descriptor.identity)};
    assert.equal(identity.operatorIdentity,operatorIdentity(i),'NATIVE_VALUE_LOCAL_SOURCE_SLOT');sourceCommitment(identity);
    return {identity,index:String(i)};
  });
  const sourceTree=merkle(sources.map(s=>sourceCommitment(s.identity)),2),profile=validateProfile({...preliminary,sourceSetRoot:sourceTree.root});
  return {nativeRuntime,profile,sources:sources.map((s,i)=>({...s,siblings:sourceTree.path(i).siblings})),assertLive,createSource,
    descriptors:freeze(copy(descriptors))};
}
/** PRIVATE one-time constructor. It never starts or replaces a native runtime.
 * Reusing a runtime does not restore a lost operator journal or an old system. */
export async function createOwnedLocalNativeValueOperatorBootstrap(raw) {
  assert.equal(arguments.length,1,'NATIVE_VALUE_LOCAL_BOOTSTRAP_ARITY');
  return createFixedLocalNativeValueBootstrap(raw,false);
}
/** A separate local Tron-only initial source profile. Its release remains null
 * pending explicit policy review plus real runtime and wallclock acceptance. */
export async function createOwnedLocalTronWallclockOperatorBootstrapV1(raw){
  assert.equal(arguments.length,1,'NATIVE_VALUE_LOCAL_BOOTSTRAP_ARITY');exactRecord(raw,['nativeRuntimes']);
  assertLocalTronWallclockProfileReleaseV1();
  assert.equal(raw.nativeRuntimes.length,1,'NATIVE_VALUE_WALLCLOCK_TRON_ONLY');
  const R=await import('../../../chains/tron/runtime/owned-tron-native-value-runtime.mjs');
  assert.ok(R.isOwnedLocalTronNativeValueV1(raw.nativeRuntimes[0]),'NATIVE_VALUE_WALLCLOCK_ORIGINAL_TRON_REQUIRED');
  return createFixedLocalNativeValueBootstrap(raw,true);
}
async function createFixedLocalNativeValueBootstrap(raw,wallclock,recovery=null){
  exactRecord(raw,['nativeRuntimes']);
  assert.ok(Array.isArray(raw.nativeRuntimes)&&raw.nativeRuntimes.length>0&&raw.nativeRuntimes.length<=5,'NATIVE_VALUE_LOCAL_RUNTIME_COUNT');
  fixedArray(raw.nativeRuntimes,raw.nativeRuntimes.length);
  const runtimes=[...raw.nativeRuntimes];assert.equal(new Set(runtimes).size,runtimes.length,'NATIVE_VALUE_LOCAL_DUPLICATE_RUNTIME');
  for(const r of runtimes)assert.ok(r&&typeof r==='object'&&!claimedNativeRuntimes.has(r)&&!pendingNativeRuntimes.has(r),'NATIVE_VALUE_LOCAL_RUNTIME_ALREADY_BOUND_OR_INVALID');
  runtimes.forEach(r=>pendingNativeRuntimes.add(r));
  let entries;
  try{entries=await drained(runtimes.map(r=>()=>runtimeEntry(r,wallclock?LOCAL_TRON_WALLCLOCK_LIMITS_V1:limits)));entries.forEach(e=>e.assertLive());}
  catch(error){runtimes.forEach(r=>pendingNativeRuntimes.delete(r));throw error;}
  // Permanent within this original process lifetime, including after close.
  // A fresh bootstrap must never discard an earlier signer's retained history.
  runtimes.forEach(r=>{pendingNativeRuntimes.delete(r);claimedNativeRuntimes.add(r);});
  if(recovery){
    exactRecord(recovery,['schema','metadata','registry','signers','stores','originals']);
    assert.equal(recovery.schema,'ORIGINAL_NATIVE_BOOTSTRAP_ECONOMIC_RECOVERY_V1');
    assert.equal(wallclock,false,'NATIVE_VALUE_RECOVERY_FIXED_EVM_PROFILE');
    assert.equal(entries.length,1);assert.equal(entries[0].profile.schema,PROFILE_SCHEMA);
    fixedArray(recovery.signers,4);fixedArray(recovery.stores,4);
  }
  const tree=merkle(entries.map(e=>profileCommitment(e.profile)),3),operators=[];
  try{for(let signerIndex=0;signerIndex<4;signerIndex++){
    if(!recovery)operators.push(createLocalNativeValueOperator({signerIndex}));
    else{assert.equal(recovery.signers[signerIndex].signerIndex,signerIndex);
      const token=Object.freeze(Object.create(null));operatorRecoveryTokens.set(token,copy(recovery.signers[signerIndex]));
      try{operators.push(await reopenOriginalNativeOperatorEconomicRecoveryV1(token));}
      finally{operatorRecoveryTokens.delete(token);}
    }
  }}catch(error){for(const operator of operators)operator.close();throw error;}
  const adapterProfiles=entries.map((e,i)=>({profile:e.profile,profilePath:tree.path(i),sources:e.sources}));
  const metadata=freeze({attesterKeys:operators.map(o=>o.publicKey),rulesRoot:'0x'+tree.root,adapterProfiles,
    profile:wallclock?NATIVE_VALUE_LOCAL_WALLCLOCK_BOOTSTRAP_PROFILE_V1:NATIVE_VALUE_LOCAL_BOOTSTRAP_PROFILE,commonHost:true,commonNodePerProfile:true,publicNetwork:false,
    independentInfrastructureEstablished:false,independentConsensusEstablished:false,sessionOnlyKeys:false});
  const registry={schema:REGISTRY_SCHEMA,quorum:{profile:NATIVE_QUORUM_PROFILE,hubDomain:'01'.repeat(32),registryEpoch:'0',rulesRoot:tree.root,keys:metadata.attesterKeys}};
  try{assertNativeValueRegistrations({registry,profiles:adapterProfiles});}catch(cause){operators.forEach(o=>o.close());throw cause;}
  if(recovery)try{assert.deepEqual(metadata,recovery.metadata,'NATIVE_VALUE_RECOVERY_REGISTERED_SOURCES_OR_KEYS_CHANGED');}catch(error){operators.forEach(operator=>operator.close());throw error;}
  const state={operators,entries,metadata,originals:new Map(),stores:[],storeCredentials:[],resources:null,system:null,runtime:null,
    bindingComplete:false,used:false,closed:false,poisoned:false,capturing:false,captured:false,captureToken:null,captureIdentity:null,
    activeResources:0,recovery,registry:null};
  try{if(recovery){
    assert.ok(Array.isArray(recovery.originals)&&recovery.originals.length<=64,'NATIVE_VALUE_RECOVERY_ORIGINAL_COUNT');
    for(const row of recovery.originals){exactRecord(row,['key','original']);assert.equal(typeof row.key,'string');
      const [profileHash,nativeId]=row.key.split(':');bytes32(profileHash,true);bytes32(nativeId,true);
      assert.equal(row.key,originalKey(profileHash,nativeId));assert.equal(state.originals.has(row.key),false);
      const entry=entries.find(e=>profileCommitment(e.profile)===profileHash);assert.ok(entry,'NATIVE_VALUE_RECOVERY_ORIGINAL_PROFILE');
      const binding=bindOriginalEvmGraphTransfer(row.original,{chain:CHAINS[entry.profile.chainId][0],genesisHash:'0x'+entry.profile.genesis});
      assert.equal(binding.identity.nativeId,nativeId,'NATIVE_VALUE_RECOVERY_ORIGINAL_WIRE_REBOUND');state.originals.set(row.key,freeze(copy(row.original)));
    }
  }}catch(error){operators.forEach(operator=>operator.close());throw error;}
  const live=()=>{assert.ok(!state.closed&&!state.poisoned&&!state.capturing,'NATIVE_VALUE_BOOTSTRAP_NOT_LIVE');for(const e of entries)assert.equal(e.assertLive(),undefined,'NATIVE_VALUE_SYNCHRONOUS_NATIVE_LIVENESS');};
  const bootstrap=Object.freeze({metadata,
    retainOriginal(input) {
      live();const request=copy(input);exactRecord(request,['profileCommitment','original']);bytes32(request.profileCommitment,true);
      const entry=entries.find(e=>profileCommitment(e.profile)===request.profileCommitment);assert.ok(entry,'NATIVE_VALUE_BOOTSTRAP_PROFILE');
      const binding=entry.profile.schema===PROFILE_SCHEMA?bindOriginalEvmGraphTransfer(request.original,{chain:CHAINS[entry.profile.chainId][0],genesisHash:'0x'+entry.profile.genesis}):Tron.bindOriginalTronGraphTransfer(request.original,entry.profile.genesis);
      const key=originalKey(request.profileCommitment,binding.identity.nativeId),prior=state.originals.get(key);
      if(prior)assert.deepEqual(prior,request.original,'NATIVE_VALUE_BOOTSTRAP_ORIGINAL_IMMUTABLE');
      else {assert.ok([...state.originals.keys()].filter(k=>k.startsWith(request.profileCommitment+':')).length<64,'NATIVE_VALUE_BOOTSTRAP_ORIGINAL_LIMIT');state.originals.set(key,freeze(request.original));}
      live();return freeze({profileCommitment:request.profileCommitment,nativeId:binding.identity.nativeId,authorityGranted:false});
    },
    close(){assert.ok(!state.capturing||state.closed,'NATIVE_VALUE_BOOTSTRAP_CAPTURE_OWNS_LIFETIME');assert.equal(state.activeResources,0,'NATIVE_VALUE_BOOTSTRAP_RESOURCES_BUSY');assert.ok(operators.every(o=>!o.status().busy&&!o.status().reserved),'NATIVE_VALUE_BOOTSTRAP_BUSY');state.closed=true;operators.forEach(o=>o.close());state.stores.forEach(s=>s.close());state.storeCredentials=[];state.recovery=null;},
  });state.live=live;owns.set(bootstrap,state);live();return bootstrap;
}
export function assertNativeValueOperatorBootstrap(bootstrap) {const s=owns.get(bootstrap);assert.ok(s,'NATIVE_VALUE_ORIGINAL_LOCAL_BOOTSTRAP_REQUIRED');s.live();return s.metadata;}
export function assertNativeValueOperatorBootstrapForSystem(bootstrap,input) {
  assert.equal(arguments.length,2,'NATIVE_VALUE_BOOTSTRAP_SYSTEM_ARITY');exactRecord(input,['runtime','system']);
  const metadata=assertNativeValueOperatorBootstrap(bootstrap),s=owns.get(bootstrap);
  assert.ok(s.bindingComplete&&s.runtime===input.runtime&&s.system===input.system,'NATIVE_VALUE_ORIGINAL_BOOTSTRAP_SYSTEM_REQUIRED');return metadata;
}
/** No loading/reset fallback. The V4 store identity/schema is mandatory and
 * every record is validated; V3/unknown state cannot be silently initialized. */
export async function provisionNativeValueOperators(bootstrap,{runtime,registry,adapterProfiles}) {
  assertNativeValueOperatorBootstrap(bootstrap);const s=owns.get(bootstrap);assert.ok(!s.used,'NATIVE_VALUE_BOOTSTRAP_USED');s.used=true;s.runtime=runtime;
  assert.deepEqual(registry.quorum.keys,s.metadata.attesterKeys);assert.deepEqual(adapterProfiles,s.metadata.adapterProfiles);assertNativeValueRegistrations({registry,profiles:adapterProfiles});
  if(s.recovery)assert.deepEqual(registry,s.recovery.registry,'NATIVE_VALUE_RECOVERY_DEPLOYED_REGISTRY_CHANGED');
  s.registry=freeze(copy(registry));
  const live=()=>{assertNativeValueOperatorBootstrap(bootstrap);};
  const tracked=async work=>{live();s.activeResources++;try{return await work();}finally{s.activeResources--;}};
  try {
    const root=join(ROOT,'.local/native-value-v4/operator-journals');let directory;
    if(!s.recovery){await mkdir(root,{recursive:true,mode:0o700});directory=await mkdtemp(join(root,'session-'));live();}
    const resources=[];
    for(let i=0;i<4;i++) {
      const binding=nativeValueInventoryBinding({registry,profiles:adapterProfiles,signerIndex:String(i),publicKey:s.operators[i].publicKey});
      const identity={profile:'NATIVE_VALUE_LOCAL_CHECKPOINT_INVENTORY_V4',binding},retained=s.recovery?.stores[i];
      if(retained){exactRecord(retained,['options','checkpoint','record']);exactRecord(retained.options,['path','password','identity']);
        assert.deepEqual(retained.options.identity,identity,'NATIVE_VALUE_RECOVERY_STORE_IDENTITY');
        assert.ok(retained.options.path.startsWith(root+'/session-')&&retained.options.path.endsWith('/operator-'+i),'NATIVE_VALUE_RECOVERY_ORIGINAL_STORE_PATH');
      }
      const options=retained?copy(retained.options):{path:join(directory,'operator-'+i),password:randomBytes(32).toString('hex'),identity};
      const store=retained?await openClaimRecordStore(options):await createClaimRecordStore(options,createNativeValueOperatorInventory(binding));
      s.stores.push(store);s.storeCredentials.push(copy(options));live();
      if(retained){const actual=await store.read();assert.deepEqual(checkpoint(actual),retained.checkpoint,'NATIVE_VALUE_RECOVERY_STORE_CHECKPOINT_CHANGED');
        assert.deepEqual({revision:String(actual.revision),state:actual.data},retained.record,'NATIVE_VALUE_RECOVERY_STORE_HISTORY_CHANGED');}
      const load=()=>tracked(async()=>{const r=await store.read();validateNativeValueOperatorInventory(r.data,binding);live();return {revision:String(r.revision),state:r.data};});
      resources.push(Object.freeze({assertLive:live,store:Object.freeze({load,commit(raw){return tracked(async()=>{
        try{live();const input=copy(raw);exactRecord(input,['expectedRevision','nextState']);const old=await load();assert.equal(old.revision,input.expectedRevision,'NATIVE_VALUE_BOOTSTRAP_CAS');
          validateNativeValueOperatorInventory(input.nextState,binding);const r=await store.update(Number(input.expectedRevision),prior=>{assert.deepEqual(prior,old.state);return input.nextState;});
          const result={revision:String(r.revision),state:r.data};assert.deepEqual(await load(),result,'NATIVE_VALUE_BOOTSTRAP_DURABLE_READBACK');live();return freeze(result);
        }catch(cause){s.poisoned=true;throw new Error('NATIVE_VALUE_BOOTSTRAP_DURABLE_UNCERTAIN',{cause});}
      });}}),readerFor(raw){return tracked(async()=>{
        live();exactRecord(raw,['history','profileCommitment','nativeId','retained','currentRegistry']);
        const j=adapterProfiles.findIndex(e=>profileCommitment(e.profile)===raw.profileCommitment);assert.ok(j>=0,'NATIVE_VALUE_BOOTSTRAP_PROFILE');
        const entry=adapterProfiles[j],local=s.entries[j],policy=nativeValuePolicy(binding,entry),saved=s.originals.get(originalKey(raw.profileCommitment,raw.nativeId));
        assert.ok(saved,'NATIVE_VALUE_BOOTSTRAP_ORIGINAL_NOT_RETAINED');
        const original={...saved,...(raw.retained?{inclusion:raw.retained.original.inclusion}:{})};
        if(raw.retained)assert.equal(saved.nativeWire,raw.retained.original.nativeWire,'NATIVE_VALUE_BOOTSTRAP_RETAINED_WIRE');
        // This creates a NEW genuine original-runtime reader for this signer on
        // every pass. It receives the complete private retained history token.
        const reader=await local.createSource({policy,source:entry.sources[i],original,currentRegistry:raw.currentRegistry,history:raw.history});
        live();return reader;
      });}}));
    }
    s.resources=Object.freeze(resources);live();return s.resources;
  }catch(cause){s.poisoned=true;for(const store of s.stores)try{store.close();}catch{}throw cause;}
}
export async function finishNativeValueOperators(bootstrap,{runtime,system}) {
  assertNativeValueOperatorBootstrap(bootstrap);const s=owns.get(bootstrap);assert.ok(s.used&&s.resources&&s.runtime===runtime&&!s.system,'NATIVE_VALUE_BOOTSTRAP_BIND_ONCE');s.system=system;
  try{await drained(s.operators.map(o=>()=>o.bind({runtime,system})));assertNativeValueOperatorBootstrap(bootstrap);
    const quorum=createNativeValueOperatorQuorum({operators:s.operators.slice(0,3)});s.bindingComplete=true;s.recovery=null;
    return Object.freeze({operators:Object.freeze([...s.operators]),quorum});
  }catch(cause){s.poisoned=true;for(const op of s.operators)try{op.close();}catch{}throw cause;}
}

/** Exact original native handle registered by this bootstrap for this system.
 * Public profile/genesis equality cannot substitute a second native process. */
export function assertNativeValueBootstrapNativeRuntime(bootstrap,input) {
  exactRecord(input,['runtime','system','nativeRuntime','profileCommitment']);
  assertNativeValueOperatorBootstrapForSystem(bootstrap,{runtime:input.runtime,system:input.system});
  const entry=owns.get(bootstrap).entries.find(e=>e.nativeRuntime===input.nativeRuntime);
  assert.ok(entry,'NATIVE_VALUE_BOOTSTRAP_ORIGINAL_NATIVE_RUNTIME_REQUIRED');
  assert.equal(profileCommitment(entry.profile),input.profileCommitment,'NATIVE_VALUE_BOOTSTRAP_NATIVE_PROFILE_REBOUND');
  entry.assertLive();return undefined;
}


/** Native economic restoration never imports caller keys or resets a signer
 * journal. Child tokens are minted only while consuming the bootstrap section. */
export function consumeNativeBootstrapOperatorRecoveryV1(token){
  assert.equal(arguments.length,1);const record=operatorRecoveryTokens.get(token);
  assert.ok(record,'NATIVE_VALUE_ORIGINAL_OPERATOR_RECOVERY_TOKEN');operatorRecoveryTokens.delete(token);return copy(record);
}
export function fenceOriginalNativeBootstrapEconomicRecoveryV1(bootstrap,authority){
  assert.equal(arguments.length,2);const identity=assertNativeEconomicRecoveryCaptureV1(authority);
  assertNativeValueOperatorBootstrap(bootstrap);const s=owns.get(bootstrap);
  assert.ok(s.bindingComplete&&s.runtime&&s.system&&!s.capturing&&s.activeResources===0,'NATIVE_VALUE_BOOTSTRAP_RECOVERY_NOT_IDLE');
  assert.equal(identity.sourceSHA256,nativeValueOriginalRecoverySourceV1(s.runtime,s.system),'NATIVE_VALUE_BOOTSTRAP_ORIGINAL_RECOVERY_SOURCE');
  assert.equal(s.entries.length,1);assert.equal(s.entries[0].profile.schema,PROFILE_SCHEMA,'NATIVE_VALUE_RECOVERY_FIXED_EVM_PROFILE');
  s.operators.forEach(operator => assertNativeOperatorEconomicRecoveryIdleV1(operator));
  s.operators.forEach(operator=>fenceOriginalNativeOperatorEconomicRecoveryV1(operator,authority));
  s.captureIdentity=copy(identity);s.capturing=true;
}
export async function captureOriginalNativeBootstrapEconomicRecoveryV1(bootstrap,token){
  assert.equal(arguments.length,2);const identity=nativeEconomicRecoverySectionIdentityV1(token,'bootstrap'),s=owns.get(bootstrap);
  assert.ok(s&&s.capturing&&!s.closed&&!s.poisoned&&!s.captured&&s.activeResources===0,'NATIVE_VALUE_BOOTSTRAP_RECOVERY_FENCE_REQUIRED');
  assert.deepEqual(identity,s.captureIdentity,'NATIVE_VALUE_BOOTSTRAP_RECOVERY_AUTHORITY_REBOUND');s.captureToken=token;
  const signers=s.operators.map(operator=>captureOriginalNativeOperatorEconomicRecoveryV1(operator,token)),stores=[];
  for(let index=0;index<4;index++){
    const snapshot=await s.stores[index].read(),record={revision:String(snapshot.revision),state:snapshot.data};
    assert.deepEqual(record,signers[index].record,'NATIVE_VALUE_BOOTSTRAP_RECOVERY_HISTORY_CHANGED');
    validateNativeValueOperatorInventory(snapshot.data,signers[index].binding);
    stores.push({options:copy(s.storeCredentials[index]),checkpoint:checkpoint(snapshot),record});
  }
  for(const entry of s.entries)entry.assertLive();assert.equal(s.activeResources,0);
  const retained={schema:'ORIGINAL_NATIVE_BOOTSTRAP_ECONOMIC_RECOVERY_V1',metadata:copy(s.metadata),registry:copy(s.registry),signers,stores,
    originals:[...s.originals].map(([key,original])=>({key,original:copy(original)}))};
  canonicalClaimRecordDataV1(retained);s.captured=true;return retained;
}
export function stopCapturedNativeBootstrapEconomicRecoveryV1(bootstrap,token){
  assert.equal(arguments.length,2);nativeEconomicRecoverySectionIdentityV1(token,'bootstrap');const s=owns.get(bootstrap);
  assert.ok(s&&s.capturing&&s.captured&&!s.closed&&s.activeResources===0,'NATIVE_VALUE_BOOTSTRAP_CAPTURE_REQUIRED');assert.equal(s.captureToken,token);
  s.operators.forEach(operator=>assert.deepEqual(stopCapturedNativeOperatorEconomicRecoveryV1(operator,token),{closed:true}));
  s.stores.forEach(store=>store.close());s.closed=true;s.storeCredentials=[];s.recovery=null;
  return {closed:true,originalResourcesStopped:true};
}
export function abortNativeBootstrapEconomicRecoveryV1(bootstrap,token){
  assert.equal(arguments.length,2);nativeEconomicRecoverySectionIdentityV1(token,'bootstrap');const s=owns.get(bootstrap);
  assert.ok(s&&s.capturing&&s.activeResources===0,'NATIVE_VALUE_BOOTSTRAP_RECOVERY_FENCE_REQUIRED');if(s.captureToken)assert.equal(s.captureToken,token);
  if(!s.closed){s.operators.forEach(operator=>abortNativeOperatorEconomicRecoveryV1(operator,token));s.stores.forEach(store=>store.close());}
  s.closed=true;s.storeCredentials=[];s.recovery=null;return {closed:true,recoveryIncomplete:true};
}
export async function reopenOriginalNativeBootstrapEconomicRecoveryV1(token,nativeRuntime){
  assert.equal(arguments.length,2);const recovery=consumeNativeEconomicRecoverySectionV1(token,'bootstrap');
  assert.equal(isOwnedLocalEvmNativeValueRuntime(nativeRuntime),true,'NATIVE_VALUE_RECOVERY_ORIGINAL_NATIVE_RUNTIME_REQUIRED');
  assert.equal(nativeRuntime.metadata.restoredOriginalState,true,'NATIVE_VALUE_RECOVERY_RESTORED_NATIVE_RUNTIME_REQUIRED');
  return createFixedLocalNativeValueBootstrap({nativeRuntimes:[nativeRuntime]},false,recovery);
}

/** Fixed coordinator-only liveness handoff, never an economic live assertion. */
export function assertNativeBootstrapEconomicCaptureV1(bootstrap,input){
 assert.equal(arguments.length,2);exactRecord(input,['runtime','system','authority']);const identity=assertNativeEconomicRecoveryCaptureV1(input.authority),s=owns.get(bootstrap);
 assert.ok(s&&s.capturing&&!s.closed&&!s.poisoned&&s.runtime===input.runtime&&s.system===input.system&&s.bindingComplete,'NATIVE_VALUE_BOOTSTRAP_ORIGINAL_CAPTURE_BINDING');
 assert.deepEqual(s.captureIdentity,identity,'NATIVE_VALUE_BOOTSTRAP_CAPTURE_AUTHORITY');return undefined;
}
