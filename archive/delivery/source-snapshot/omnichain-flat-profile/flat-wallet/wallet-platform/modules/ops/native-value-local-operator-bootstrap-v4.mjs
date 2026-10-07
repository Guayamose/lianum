/** Original local-runtime-only V4 bootstrap. No URL, signer, key, store, clock,
 * transport or caller profile can be installed. Four signer/source positions
 * perform independent fresh reads on each same-host/same-node synthetic chain;
 * distinct slots do NOT establish independent infrastructure or consensus. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../../../proof-workers/catalog.mjs';
import { exactRecord, fixedArray, bytes32, ZERO } from '../paeg/commitments.mjs';
import { cloneInput, frozenInput } from '../paeg/readiness-inputs.mjs';
import { createLocalNativeValueOperator, createNativeValueOperatorQuorum } from './native-value-operators-v4.mjs';
import { createClaimRecordStore } from '../native-claims/segmented-record-store.mjs';
import { assertNativeValueRegistrations } from './native-value-registry-v2.mjs';
import { createNativeValueOperatorInventory, nativeValueInventoryBinding, nativeValuePolicy,
  validateNativeValueOperatorInventory } from './native-value-inventory-v4.mjs';
import { profileCommitment, sourceCommitment, sha256, validateProfile } from '../chain-adapters/generic-native-value-v2.mjs';
import { PROFILE_SCHEMA, REGISTRY_SCHEMA, CHAINS, createProfile } from '../chain-adapters/evm-native-value-v2.mjs';
import * as Tron from '../chain-adapters/tron-native-graph-profile.mjs';
import { bindOriginalEvmGraphTransfer } from '../chain-adapters/evm-graph-transfer-binding.mjs';
import { isOwnedLocalEvmNativeValueRuntime, assertOwnedLocalEvmNativeValueRuntimeLive }
  from '../chain-adapters/owned-evm-v2-runtime.mjs';
import { describeOwnedLocalEvmNativeValueSource, createOwnedLocalEvmNativeValueHealthSource }
  from '../chain-adapters/owned-evm-native-value-health-source-v4.mjs';
import { NATIVE_QUORUM_PROFILE } from '../../../../../omnichain-product/src/evidence/native-quorum.mjs';
export const NATIVE_VALUE_LOCAL_BOOTSTRAP_PROFILE = 'OWNED_LOCAL_FULL_HISTORY_NATIVE_VALUE_BOOTSTRAP_V4';
const owns=new WeakMap(),claimedNativeRuntimes=new WeakSet(),pendingNativeRuntimes=new WeakSet(),copy=cloneInput,freeze=frozenInput;
const node=(a,b)=>sha256(Buffer.from('01'+a+b,'hex')),originalKey=(p,n)=>p+':'+n;
const limits=Object.freeze({maximumAncestry:'32',maximumEvidenceLifetime:'30',maximumBlockAgeMs:'1800000',maximumClockSkewMs:'5000',maximumQueryMs:'10000'});
export const NATIVE_VALUE_LOCAL_WALLCLOCK_BOOTSTRAP_PROFILE_V1='OWNED_LOCAL_TRON_WALLCLOCK_BOOTSTRAP_V1';
// Explicit new initial registration, never a rewrite of V4 or any certificate.
// The native facts frame hashes this lifetime; full-audit 30s guards are separate.
export const LOCAL_TRON_WALLCLOCK_LIMITS_V1=Object.freeze({...limits,maximumAncestry:'256',maximumEvidenceLifetime:'300'});
export const LOCAL_TRON_WALLCLOCK_PROFILE_RELEASE_V1=null;
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
    const R=await import('../chain-adapters/owned-tron-native-value-runtime.mjs');
    assert.ok(R.isOwnedLocalTronNativeValueV1(nativeRuntime),'NATIVE_VALUE_LOCAL_ORIGINAL_RUNTIME_REQUIRED');
    assertLive=()=>R.assertOwnedLocalTronNativeValueRuntimeLive(nativeRuntime);assertLive();
    await R.assertOwnedLocalTronNativeValueV1(nativeRuntime);assertLive();
    const genesis=nativeRuntime.metadata.genesis;bytes32(genesis,true);
    preliminary=Tron.validateProfile({schema:Tron.PROFILE_SCHEMA,version:'2',genesis,asset:Tron.tronGraphAsset(genesis),
      sourceSetRoot:sha256('native-value-local-unbound-source-root'),finalityPolicy:sha256(Tron.FINALITY),permissionPolicy:sha256(Tron.PERMISSION),
      taposExpiryPolicy:sha256(Tron.TAPOS_EXPIRY),obligation:sha256(Tron.OBLIGATION),maximumTaposDistance:'256',...sourceLimits});
    const S=await import('../chain-adapters/owned-tron-native-value-health-source-v4.mjs');
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
  assert.ok(LOCAL_TRON_WALLCLOCK_PROFILE_RELEASE_V1,'NATIVE_VALUE_WALLCLOCK_PROFILE_RELEASE_ABSENT');
  assert.equal(raw.nativeRuntimes.length,1,'NATIVE_VALUE_WALLCLOCK_TRON_ONLY');
  const R=await import('../chain-adapters/owned-tron-native-value-runtime.mjs');
  assert.ok(R.isOwnedLocalTronNativeValueV1(raw.nativeRuntimes[0]),'NATIVE_VALUE_WALLCLOCK_ORIGINAL_TRON_REQUIRED');
  return createFixedLocalNativeValueBootstrap(raw,true);
}
async function createFixedLocalNativeValueBootstrap(raw,wallclock){
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
  const tree=merkle(entries.map(e=>profileCommitment(e.profile)),3),operators=[0,1,2,3].map(signerIndex=>createLocalNativeValueOperator({signerIndex}));
  const adapterProfiles=entries.map((e,i)=>({profile:e.profile,profilePath:tree.path(i),sources:e.sources}));
  const metadata=freeze({attesterKeys:operators.map(o=>o.publicKey),rulesRoot:'0x'+tree.root,adapterProfiles,
    profile:wallclock?NATIVE_VALUE_LOCAL_WALLCLOCK_BOOTSTRAP_PROFILE_V1:NATIVE_VALUE_LOCAL_BOOTSTRAP_PROFILE,commonHost:true,commonNodePerProfile:true,publicNetwork:false,
    independentInfrastructureEstablished:false,independentConsensusEstablished:false,sessionOnlyKeys:true});
  const registry={schema:REGISTRY_SCHEMA,quorum:{profile:NATIVE_QUORUM_PROFILE,hubDomain:'01'.repeat(32),registryEpoch:'0',rulesRoot:tree.root,keys:metadata.attesterKeys}};
  try{assertNativeValueRegistrations({registry,profiles:adapterProfiles});}catch(cause){operators.forEach(o=>o.close());throw cause;}
  const state={operators,entries,metadata,originals:new Map(),stores:[],resources:null,system:null,runtime:null,bindingComplete:false,used:false,closed:false,poisoned:false};
  const live=()=>{assert.ok(!state.closed&&!state.poisoned,'NATIVE_VALUE_BOOTSTRAP_NOT_LIVE');for(const e of entries)assert.equal(e.assertLive(),undefined,'NATIVE_VALUE_SYNCHRONOUS_NATIVE_LIVENESS');};
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
    close(){assert.ok(operators.every(o=>!o.status().busy&&!o.status().reserved),'NATIVE_VALUE_BOOTSTRAP_BUSY');state.closed=true;operators.forEach(o=>o.close());state.stores.forEach(s=>s.close());},
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
  const live=()=>{assertNativeValueOperatorBootstrap(bootstrap);};
  try {
    const root=join(ROOT,'.local/native-value-v4/operator-journals');await mkdir(root,{recursive:true,mode:0o700});const directory=await mkdtemp(join(root,'session-'));live();
    const resources=[];
    for(let i=0;i<4;i++) {
      const binding=nativeValueInventoryBinding({registry,profiles:adapterProfiles,signerIndex:String(i),publicKey:s.operators[i].publicKey});
      const store=await createClaimRecordStore({path:join(directory,'operator-'+i),password:randomBytes(32).toString('hex'),identity:{profile:'NATIVE_VALUE_LOCAL_CHECKPOINT_INVENTORY_V4',binding}},createNativeValueOperatorInventory(binding));s.stores.push(store);live();
      const load=async()=>{live();const r=await store.read();validateNativeValueOperatorInventory(r.data,binding);live();return {revision:String(r.revision),state:r.data};};
      resources.push(Object.freeze({assertLive:live,store:Object.freeze({load,async commit(raw){
        try{live();const input=copy(raw);exactRecord(input,['expectedRevision','nextState']);const old=await load();assert.equal(old.revision,input.expectedRevision,'NATIVE_VALUE_BOOTSTRAP_CAS');
          validateNativeValueOperatorInventory(input.nextState,binding);const r=await store.update(Number(input.expectedRevision),prior=>{assert.deepEqual(prior,old.state);return input.nextState;});
          const result={revision:String(r.revision),state:r.data};assert.deepEqual(await load(),result,'NATIVE_VALUE_BOOTSTRAP_DURABLE_READBACK');live();return freeze(result);
        }catch(cause){s.poisoned=true;throw new Error('NATIVE_VALUE_BOOTSTRAP_DURABLE_UNCERTAIN',{cause});}
      }}),async readerFor(raw){
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
      }}));
    }
    s.resources=Object.freeze(resources);live();return s.resources;
  }catch(cause){s.poisoned=true;for(const store of s.stores)try{store.close();}catch{}throw cause;}
}
export async function finishNativeValueOperators(bootstrap,{runtime,system}) {
  assertNativeValueOperatorBootstrap(bootstrap);const s=owns.get(bootstrap);assert.ok(s.used&&s.resources&&s.runtime===runtime&&!s.system,'NATIVE_VALUE_BOOTSTRAP_BIND_ONCE');s.system=system;
  try{await drained(s.operators.map(o=>()=>o.bind({runtime,system})));assertNativeValueOperatorBootstrap(bootstrap);
    const quorum=createNativeValueOperatorQuorum({operators:s.operators.slice(0,3)});s.bindingComplete=true;
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
