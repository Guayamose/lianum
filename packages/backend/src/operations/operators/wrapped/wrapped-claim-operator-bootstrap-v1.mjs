/** Original local-runtime-only V4 bootstrap. No URL, signer, key, store, clock,
 * transport or caller profile can be installed. Four signer/source positions
 * perform independent fresh reads on each same-host/same-node synthetic chain;
 * distinct slots do NOT establish independent infrastructure or consensus. */
import assert from 'node:assert/strict';
import {createGraphNativeQueuesV4} from './graph-native-queues-v4.mjs';
import { consumeWrappedSystemRecoveryPartV1 } from '../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '@lianum/proofs/catalog';
import { exactRecord, fixedArray, bytes32, ZERO } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput } from '@lianum/components/plain-input';
import { createNativeValueOperatorQuorum } from './wrapped-claim-graph-operators-v1.mjs';
import { createCombinedWrappedClaimOperatorV1, captureCombinedWrappedClaimOperatorRecoveryV1, fenceCombinedWrappedClaimOperatorRecoveryV1, snapshotCombinedWrappedClaimInitializationV1 } from './wrapped-claim-combined-operators-v1.mjs';
import { createClaimOperatorQuorum } from '../../../claims/wrapped/operations/wrapped-operators-v1.mjs';
import { createOwnedWrappedClaimObserverV1 } from '../../../claims/wrapped/operations/wrapped-owned-state-v1.mjs';
import { assertOwnedWrappedClaimBootstrap, ownedWrappedClaimBootstrapBindings } from './wrapped-claim-custody-bootstrap-v1.mjs';
import { validateCustodyProfile, custodyProfileCommitment, CUSTODY_SCHEMA, CUSTODY_PREDICATE } from '../../../claims/protocol/registry-envelope-v2.mjs';
import { nativeClaimEndpointCommitment } from '@lianum/engine/claims/framing';
import { nativeRuleCommitment } from '@lianum/engine/native/native-receipt-binding';
import { assertOwnedBitcoinRuntime } from '../../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import { assertOwnedSolanaRuntime } from '../../../chains/solana/runtime/owned-solana-runtime.mjs';
import { createClaimRecordStore, openClaimRecordStore } from '@lianum/engine/storage/records';
import { assertCombinedAdapterRegistrationsV2 as assertNativeValueRegistrations } from '../../../claims/protocol/registry-envelope-v2.mjs';
import { createNativeValueOperatorInventory, nativeValueInventoryBinding, nativeValuePolicy,
  validateNativeValueOperatorInventory } from './wrapped-claim-graph-inventory-v1.mjs';
import { profileCommitment, sourceCommitment, sha256, validateProfile } from '../../../chains/shared/transfers/generic-native-value-v2.mjs';
import { PROFILE_SCHEMA, REGISTRY_SCHEMA, CHAINS, createProfile } from '../../../chains/evm/transfers/evm-native-value-v2.mjs';
import * as Tron from '../../../chains/tron/transfers/tron-native-graph-profile.mjs';
import { bindOriginalEvmGraphTransfer } from '../../../chains/evm/transfers/evm-graph-transfer-binding.mjs';
import { isOwnedLocalEvmNativeValueRuntime, assertOwnedLocalEvmNativeValueRuntimeLive, readOwnedLocalEvmNativeValueAuditStateV4 }
  from '../../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { describeOwnedLocalEvmNativeValueSource, createOwnedLocalEvmNativeValueHealthSource }
  from '../../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { NATIVE_QUORUM_PROFILE } from '@lianum/engine/evidence/native-quorum';
export const NATIVE_VALUE_LOCAL_BOOTSTRAP_PROFILE = 'OWNED_WRAPPED_CLAIM_GRAPH_BOOTSTRAP_V1';
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
// Private original physical GRAPH queues. Only this fixed bootstrap can select
// a registered runtime or enqueue its original source construction+observation.
// No public callback, arbitrary source, transport, cache or retry enters them.
const {graphReadV4,graphNativeStateV4,quiesceGraphNativeV4,assertGraphQuiescenceV4,releaseGraphQuiescenceV4} = createGraphNativeQueuesV4({profileCommitment});
async function runtimeEntry(nativeRuntime,sourceLimits=limits) {
  let descriptors,preliminary,assertLive,createSource,readNativeStateV4;
  if(isOwnedLocalEvmNativeValueRuntime(nativeRuntime)) {
    assertLive=()=>assertOwnedLocalEvmNativeValueRuntimeLive(nativeRuntime);assertLive();
    readNativeStateV4=()=>readOwnedLocalEvmNativeValueAuditStateV4(nativeRuntime);
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
    readNativeStateV4=()=>R.readOwnedLocalTronNativeValueAuditStateV4(nativeRuntime);
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
  return {nativeRuntime,profile,sources:sources.map((s,i)=>({...s,siblings:sourceTree.path(i).siblings})),assertLive,createSource,readNativeStateV4,
    descriptors:freeze(copy(descriptors))};
}
/** PRIVATE one-time constructor. It never starts or replaces a native runtime.
 * Reusing a runtime does not restore a lost operator journal or an old system. */
const constructionRequests = new WeakMap(), usedCustodyBootstraps = new WeakSet();
export function consumeWrappedClaimOperatorConstructionV1(token) {
  const value = constructionRequests.get(token); assert.ok(value, 'WRAPPED_PRIVATE_OPERATOR_CONSTRUCTION_REQUIRED');
  constructionRequests.delete(token); assertOwnedWrappedClaimBootstrap(value.runtime, value.custodyBootstrap);
  return Object.freeze({signerIndex:value.signerIndex, ...(value.recovery ? {recovery:value.recovery} : {})});
}
const custodySourceSessions = new WeakMap();
function custodyEntries(binding) {
  return binding.nativeRuntimes.map((native, i) => {
    (i === 0 ? assertOwnedBitcoinRuntime : assertOwnedSolanaRuntime)(native);
    const close = Object.getOwnPropertyDescriptor(native, 'close');
    assert.ok(Object.isFrozen(native) && close && Object.hasOwn(close,'value') && typeof close.value === 'function', 'WRAPPED_CUSTODY_PHYSICAL_NODE_IDENTITY');
    let session = custodySourceSessions.get(close.value);
    if (!session) { session = randomBytes(32).toString('hex'); custodySourceSessions.set(close.value,session); }
    const rule = binding.rules[i], roles = binding.nativeRoles[i];
    const configuration = {family:rule.family,genesis:rule.genesis,asset:rule.asset,roles,inventoryDomain:binding.inventoryDomains[i],
      nonceInfrastructureByAuthority:i === 1 ? native.nonceInfrastructureByAuthority : null};
    const clientRelease = sha256(JSON.stringify(native.metadata.runtimePins));
    const sources = [0,1,2,3].map(index=>({identity:{operatorIdentity:operatorIdentity(index),
      endpointIdentity:sha256('LIANUM/owned-custody-physical-source/1\0'+session+':'+index),
      clientRelease,chainConfiguration:sha256(JSON.stringify(configuration))},index:String(index)}));
    const sourceTree = merkle(sources.map(row=>sourceCommitment(row.identity)),2);
    const profile = validateCustodyProfile({schema:CUSTODY_SCHEMA,version:'2',family:rule.family,genesis:rule.genesis,asset:rule.asset,
      nativeRuleCommitment:nativeRuleCommitment(rule),escrowEndpointCommitment:nativeClaimEndpointCommitment({family:rule.family,genesis:rule.genesis,asset:rule.asset,endpoint:roles.escrow.endpoint}),
      custodyInventoryDomain:binding.inventoryDomains[i],sourceSetRoot:sourceTree.root,predicate:CUSTODY_PREDICATE});
    return {profile,sources:sources.map((row,index)=>({...row,siblings:sourceTree.path(index).siblings}))};
  });
}
/** Artifact-authenticated custody bootstrap is mandatory BEFORE any key/source
 * identity allocation. Native handles are original owned capabilities only. */
export async function createWrappedClaimOperatorBootstrapV1(raw) {
  assert.equal(arguments.length,1,'WRAPPED_BOOTSTRAP_ARITY');
  exactRecord(raw,['runtime','nativeRuntimes','custodyBootstrap']);
  assertOwnedWrappedClaimBootstrap(raw.runtime,raw.custodyBootstrap);
  assert.ok(!usedCustodyBootstraps.has(raw.custodyBootstrap), 'WRAPPED_CUSTODY_OPERATOR_BOOTSTRAP_ONCE');
  usedCustodyBootstraps.add(raw.custodyBootstrap); // No fresh-key retry after any failed original attempt.
  return createFixedLocalNativeValueBootstrap(raw,false);
}
async function createFixedLocalNativeValueBootstrap(raw,wallclock,recovery=null){
  exactRecord(raw,['runtime','nativeRuntimes','custodyBootstrap']);
  const custodyBinding = ownedWrappedClaimBootstrapBindings(raw.custodyBootstrap);
  assert.equal(custodyBinding.runtime,raw.runtime);
  if (recovery) {
    fixedArray(recovery.custodySessions, custodyBinding.nativeRuntimes.length);
    custodyBinding.nativeRuntimes.forEach((native, index) => {
      bytes32(recovery.custodySessions[index], true);
      assert.ok(!custodySourceSessions.has(native.close), 'WRAPPED_RECOVERY_CUSTODY_ALREADY_CLAIMED');
      custodySourceSessions.set(native.close, recovery.custodySessions[index]);
    });
  }
  const custodyProfiles = custodyEntries(custodyBinding);
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
  const allEntries = [...custodyProfiles.map(row=>({...row,kind:'custody'})),...entries.map(row=>({...row,kind:'native-value'}))];
  const tree=merkle(allEntries.map(e=>e.kind==='custody'?custodyProfileCommitment(e.profile):profileCommitment(e.profile)),3);
  const combined=[];
  try { for(const signerIndex of [0,1,2,3]){
    const request=Object.freeze(Object.create(null));constructionRequests.set(request,{runtime:raw.runtime,custodyBootstrap:raw.custodyBootstrap,signerIndex,...(recovery?{recovery:recovery.signers[signerIndex]}:{})});
    try{combined.push(createCombinedWrappedClaimOperatorV1(request));}finally{constructionRequests.delete(request);}
  }} catch(cause){for(const row of combined)try{row.graph.close();}catch{}throw cause;}
  const operators=combined.map(row=>row.graph),claimOperators=combined.map(row=>row.claim);
  const adapterProfiles=allEntries.map((e,i)=>({kind:e.kind,profile:e.profile,profilePath:tree.path(i),sources:e.sources}));
  const metadata=freeze({attesterKeys:operators.map(o=>o.publicKey),rulesRoot:'0x'+tree.root,adapterProfiles,
    profile:wallclock?NATIVE_VALUE_LOCAL_WALLCLOCK_BOOTSTRAP_PROFILE_V1:NATIVE_VALUE_LOCAL_BOOTSTRAP_PROFILE,commonHost:true,commonNodePerProfile:true,publicNetwork:false,
    independentInfrastructureEstablished:false,independentConsensusEstablished:false,sessionOnlyKeys:false,privateLocalRecoveryOnly:true});
  const registry={schema:REGISTRY_SCHEMA,quorum:{profile:NATIVE_QUORUM_PROFILE,hubDomain:'01'.repeat(32),registryEpoch:'0',rulesRoot:tree.root,keys:metadata.attesterKeys}};
  try{assertNativeValueRegistrations({registry,profiles:adapterProfiles});if(recovery)assert.deepEqual(metadata,recovery.metadata,'WRAPPED_RECOVERY_ORIGINAL_REGISTRATIONS');}
  catch(cause){for(const op of operators)try{op.close();}catch{}throw cause;}
  const state={combined,recovery,storeRecords:[],recovering:false,captureStarted:false,activeCommits:0,operators,claimOperators,custodyBootstrap:raw.custodyBootstrap,custodyBinding,entries,metadata,originals:new Map(recovery?.originals ?? []),stores:[],resources:null,system:null,runtime:null,bindingComplete:false,used:false,closed:false,poisoned:false};
  const live=()=>{assert.ok(!state.closed&&!state.poisoned,'NATIVE_VALUE_BOOTSTRAP_NOT_LIVE');assertOwnedWrappedClaimBootstrap(custodyBinding.runtime,raw.custodyBootstrap);for(const e of entries)assert.equal(e.assertLive(),undefined,'NATIVE_VALUE_SYNCHRONOUS_NATIVE_LIVENESS');};
  const bootstrap=Object.freeze({metadata,
    retainOriginal(input) {
      live();assert.ok(!state.recovering,'WRAPPED_RECOVERY_MUTATION_FENCED');const request=copy(input);exactRecord(request,['profileCommitment','original']);bytes32(request.profileCommitment,true);
      const entry=entries.find(e=>profileCommitment(e.profile)===request.profileCommitment);assert.ok(entry,'NATIVE_VALUE_BOOTSTRAP_PROFILE');
      const binding=entry.profile.schema===PROFILE_SCHEMA?bindOriginalEvmGraphTransfer(request.original,{chain:CHAINS[entry.profile.chainId][0],genesisHash:'0x'+entry.profile.genesis}):Tron.bindOriginalTronGraphTransfer(request.original,entry.profile.genesis);
      const key=originalKey(request.profileCommitment,binding.identity.nativeId),prior=state.originals.get(key);
      if(prior)assert.deepEqual(prior,request.original,'NATIVE_VALUE_BOOTSTRAP_ORIGINAL_IMMUTABLE');
      else {assert.ok([...state.originals.keys()].filter(k=>k.startsWith(request.profileCommitment+':')).length<64,'NATIVE_VALUE_BOOTSTRAP_ORIGINAL_LIMIT');state.originals.set(key,freeze(request.original));}
      live();return freeze({profileCommitment:request.profileCommitment,nativeId:binding.identity.nativeId,authorityGranted:false});
    },
    close(){assert.ok([...operators,...claimOperators].every(o=>!o.status().busy&&!o.status().reserved),'NATIVE_VALUE_BOOTSTRAP_BUSY');state.closed=true;operators.forEach(o=>o.close());state.stores.forEach(s=>s.close());},
  });state.live=live;owns.set(bootstrap,state);live();return bootstrap;
}
export function assertWrappedClaimOperatorBootstrapV1(bootstrap) {const s=owns.get(bootstrap);assert.ok(s,'NATIVE_VALUE_ORIGINAL_LOCAL_BOOTSTRAP_REQUIRED');s.live();return s.metadata;}
export function assertWrappedClaimOperatorBootstrapForSystemV1(bootstrap,input) {
  assert.equal(arguments.length,2,'NATIVE_VALUE_BOOTSTRAP_SYSTEM_ARITY');exactRecord(input,['runtime','system']);
  const metadata=assertWrappedClaimOperatorBootstrapV1(bootstrap),s=owns.get(bootstrap);
  assert.ok(s.bindingComplete&&s.runtime===input.runtime&&s.system===input.system,'NATIVE_VALUE_ORIGINAL_BOOTSTRAP_SYSTEM_REQUIRED');return metadata;
}
/** No loading/reset fallback. The V4 store identity/schema is mandatory and
 * every record is validated; V3/unknown state cannot be silently initialized. */
export async function provisionWrappedClaimOperatorsV1(bootstrap,{runtime,registry,adapterProfiles}) {
  assertWrappedClaimOperatorBootstrapV1(bootstrap);const s=owns.get(bootstrap);assert.ok(!s.used&&!s.recovering,'NATIVE_VALUE_BOOTSTRAP_USED');assert.equal(s.custodyBinding.runtime,runtime,'WRAPPED_BOOTSTRAP_ORIGINAL_RECEIVER');s.used=true;s.runtime=runtime;
  assert.deepEqual(registry.quorum.keys,s.metadata.attesterKeys);assert.deepEqual(adapterProfiles,s.metadata.adapterProfiles);assertNativeValueRegistrations({registry,profiles:adapterProfiles});
  const live=()=>{assertWrappedClaimOperatorBootstrapV1(bootstrap);};
  try {
    let directory = null;
    if (!s.recovery) {
      const root=join(ROOT,'.local/wrapped-claim-v1/operator-journals');await mkdir(root,{recursive:true,mode:0o700});directory=await mkdtemp(join(root,'session-'));
    }
    live();
    const resources=[];
    for(let i=0;i<4;i++) {
      const binding=nativeValueInventoryBinding({registry,profiles:adapterProfiles,signerIndex:String(i),publicKey:s.operators[i].publicKey});
      const identity={profile:'WRAPPED_CLAIM_GRAPH_CHECKPOINT_INVENTORY_V1',binding};
      const retained=s.recovery?.stores[i] ?? null;
      if(retained)assert.deepEqual(retained.options.identity,identity,'WRAPPED_RECOVERY_ORIGINAL_GRAPH_STORE');
      const options=retained?copy(retained.options):{path:join(directory,'operator-'+i),password:randomBytes(32).toString('hex'),identity};
      const store=retained?await openClaimRecordStore(options):await createClaimRecordStore(options,createNativeValueOperatorInventory(binding));
      s.stores.push(store);s.storeRecords.push(options);live();
      if(retained)assert.deepEqual(await store.read(),retained.snapshot,'WRAPPED_RECOVERY_GRAPH_CHECKPOINT_CHANGED');
      const load=async()=>{live();const r=await store.read();validateNativeValueOperatorInventory(r.data,binding);live();return {revision:String(r.revision),state:r.data};};
      const resource={assertLive:live,store:Object.freeze({load,async commit(raw){
        live();assert.ok(!s.recovering,'WRAPPED_RECOVERY_MUTATION_FENCED');s.activeCommits++;
        try{live();assert.ok(!s.recovering,'WRAPPED_RECOVERY_MUTATION_FENCED');const input=copy(raw);exactRecord(input,['expectedRevision','nextState']);const old=await load();assert.ok(!s.recovering,'WRAPPED_RECOVERY_MUTATION_FENCED');assert.equal(old.revision,input.expectedRevision,'NATIVE_VALUE_BOOTSTRAP_CAS');
          validateNativeValueOperatorInventory(input.nextState,binding);assert.ok(!s.recovering,'WRAPPED_RECOVERY_MUTATION_FENCED');const r=await store.update(Number(input.expectedRevision),prior=>{assert.deepEqual(prior,old.state);return input.nextState;});
          const result={revision:String(r.revision),state:r.data};assert.deepEqual(await load(),result,'NATIVE_VALUE_BOOTSTRAP_DURABLE_READBACK');live();return freeze(result);
        }catch(cause){s.poisoned=true;throw new Error('NATIVE_VALUE_BOOTSTRAP_DURABLE_UNCERTAIN',{cause});}finally{s.activeCommits--;}
      }}),async readerFor(raw){
        live();exactRecord(raw,['history','profileCommitment','nativeId','retained','currentRegistry']);
        const graphProfiles=adapterProfiles.filter(e=>e.kind==='native-value'),j=graphProfiles.findIndex(e=>profileCommitment(e.profile)===raw.profileCommitment);assert.ok(j>=0,'NATIVE_VALUE_BOOTSTRAP_PROFILE');
        const entry=graphProfiles[j],local=s.entries[j],policy=nativeValuePolicy(binding,entry),saved=s.originals.get(originalKey(raw.profileCommitment,raw.nativeId));
        assert.ok(saved,'NATIVE_VALUE_BOOTSTRAP_ORIGINAL_NOT_RETAINED');
        const original={...saved,...(raw.retained?{inclusion:raw.retained.original.inclusion}:{})};
        if(raw.retained)assert.equal(saved.nativeWire,raw.retained.original.nativeWire,'NATIVE_VALUE_BOOTSTRAP_RETAINED_WIRE');
        // This creates a NEW genuine original-runtime reader for this signer on
        // every pass. It receives the complete private retained history token.
        const reader=await local.createSource({policy,source:entry.sources[i],original,currentRegistry:raw.currentRegistry,history:raw.history});
        live();return reader;
      }};
      resources.push(Object.freeze({...resource,
        nativeStateV4(){assert.equal(arguments.length,0,'WRAPPED_GRAPH_NATIVE_STATE_NO_OPTIONS');return graphNativeStateV4(s);},
        quiesceNativeV4(){assert.equal(arguments.length,0,'WRAPPED_GRAPH_NATIVE_QUIESCENCE_NO_OPTIONS');return quiesceGraphNativeV4(s);},
        assertNativeQuiescenceV4(token){assert.equal(arguments.length,1,'WRAPPED_GRAPH_NATIVE_QUIESCENCE_NO_OPTIONS');return assertGraphQuiescenceV4(s,token);},
        releaseNativeQuiescenceV4(token){assert.equal(arguments.length,1,'WRAPPED_GRAPH_NATIVE_QUIESCENCE_NO_OPTIONS');return releaseGraphQuiescenceV4(s,token);},
        observeNativeV4(raw){
          live();exactRecord(raw,['history','profileCommitment','nativeId','retained','currentRegistry']);
          const entry=s.entries.find(row=>profileCommitment(row.profile)===raw.profileCommitment);
          assert.ok(entry,'WRAPPED_GRAPH_ORIGINAL_NATIVE_PROFILE_REQUIRED');
          return graphReadV4(entry,async()=>{
            const source=await resource.readerFor(raw);
            const observation=await source.observe(freeze({nativeId:raw.nativeId}));live();
            return Object.freeze({source,observation});
          });
        },
      }));
    }
    s.resources=Object.freeze(resources);live();return s.resources;
  }catch(cause){s.poisoned=true;for(const store of s.stores)try{store.close();}catch{}throw cause;}
}
export async function finishWrappedClaimOperatorsV1(bootstrap,{runtime,system,claims}) {
  assertWrappedClaimOperatorBootstrapV1(bootstrap);const s=owns.get(bootstrap);
  assert.ok(s.used&&s.resources&&s.runtime===runtime&&!s.system&&!s.recovering,'WRAPPED_BOOTSTRAP_BIND_ONCE');s.system=system;
  assert.equal(system.claims,claims);assert.equal(claims.flatSystem,system);
  assert.equal(claims.nativeRuntimes.length,s.custodyBinding.nativeRuntimes.length);
  claims.nativeRuntimes.forEach((native,i)=>assert.equal(native,s.custodyBinding.nativeRuntimes[i],'WRAPPED_EXACT_CUSTODY_RUNTIME'));
  try {
    const observer=await createOwnedWrappedClaimObserverV1({runtime,claims});
    await drained(s.claimOperators.map(op=>()=>op.bind(observer)));
    await drained(s.operators.map(op=>()=>op.bind({runtime,system})));
    assertWrappedClaimOperatorBootstrapV1(bootstrap);
    const quorum=createNativeValueOperatorQuorum({operators:s.operators.slice(0,3)}),claimQuorum=createClaimOperatorQuorum({operators:s.claimOperators.slice(0,3)});
    s.bindingComplete=true;
    return Object.freeze({operators:Object.freeze([...s.operators]),quorum,claimOperators:Object.freeze([...s.claimOperators]),claimQuorum,observer});
  } catch(cause) { s.poisoned=true;for(const op of s.operators)try{op.close();}catch{}throw cause; }
}

/** Exact original native handle registered by this bootstrap for this system.
 * Public profile/genesis equality cannot substitute a second native process. */
export function assertWrappedClaimBootstrapNativeRuntimeV1(bootstrap,input) {
  exactRecord(input,['runtime','system','nativeRuntime','profileCommitment']);
  assertWrappedClaimOperatorBootstrapForSystemV1(bootstrap,{runtime:input.runtime,system:input.system});
  const entry=owns.get(bootstrap).entries.find(e=>e.nativeRuntime===input.nativeRuntime);
  assert.ok(entry,'NATIVE_VALUE_BOOTSTRAP_ORIGINAL_NATIVE_RUNTIME_REQUIRED');
  assert.equal(profileCommitment(entry.profile),input.profileCommitment,'NATIVE_VALUE_BOOTSTRAP_NATIVE_PROFILE_REBOUND');
  entry.assertLive();return undefined;
}

export function assertWrappedClaimOperatorCustodyBootstrapV1(bootstrap, expected) {
  exactRecord(expected,['runtime','custodyBootstrap']);assertWrappedClaimOperatorBootstrapV1(bootstrap);const s=owns.get(bootstrap);
  assert.equal(s.custodyBinding.runtime,expected.runtime,'WRAPPED_BOOTSTRAP_ORIGINAL_RECEIVER');
  assert.equal(s.custodyBootstrap,expected.custodyBootstrap,'WRAPPED_BOOTSTRAP_ORIGINAL_CUSTODY_CAPABILITY');
}

/** Capture fences this original bootstrap before its first asynchronous read.
 * A failed capture remains fenced; no fresh identity or store fallback exists. */
export async function captureWrappedClaimOperatorBootstrapRecoveryV1(bootstrap) {
  assert.equal(arguments.length,1);assertWrappedClaimOperatorBootstrapV1(bootstrap);
  const state=owns.get(bootstrap);
  assert.ok(!state.captureStarted,'WRAPPED_RECOVERY_CAPTURE_ONCE');
  if(!state.recovering)fenceWrappedClaimOperatorBootstrapRecoveryV1(bootstrap);
  state.captureStarted=true;
  let signers;const stores=[];
  try {
    signers=[];for(const handle of state.combined)signers.push(await captureCombinedWrappedClaimOperatorRecoveryV1(handle));
    for(let i=0;i<4;i++){
      const snapshot=await state.stores[i].read();
      assert.deepEqual({revision:String(snapshot.revision),state:snapshot.data},signers[i].graph.record,'WRAPPED_RECOVERY_GRAPH_MEMORY_DURABLE_MISMATCH');
      stores.push({options:copy(state.storeRecords[i]),snapshot});
    }
  } catch(cause){for(const op of state.operators)try{op.close();}catch{}for(const store of state.stores)try{store.close();}catch{}state.poisoned=true;throw cause;}
  return {schema:'WRAPPED_OPERATOR_BOOTSTRAP_PRIVATE_RECOVERY_V1',metadata:copy(state.metadata),
    custodySessions:state.custodyBinding.nativeRuntimes.map(native=>custodySourceSessions.get(native.close)),
    signers,stores,originals:copy([...state.originals.entries()])};
}
export async function reopenWrappedClaimOperatorBootstrapRecoveryV1(token) {
  assert.equal(arguments.length,1);
  const {runtime,nativeRuntimes,custodyBootstrap,record}=consumeWrappedSystemRecoveryPartV1(token,'operators');
  exactRecord(record,['schema','metadata','custodySessions','signers','stores','originals']);
  assert.equal(record.schema,'WRAPPED_OPERATOR_BOOTSTRAP_PRIVATE_RECOVERY_V1');
  fixedArray(record.signers,4);fixedArray(record.stores,4);
  for(const row of record.stores){exactRecord(row,['options','snapshot']);exactRecord(row.options,['path','password','identity']);exactRecord(row.snapshot,['revision','data','commitment']);}
  for(const signer of record.signers)exactRecord(signer,['schema','signerIndex','privateKey','publicKey','uses','claim','graph']);
  assert.ok(Array.isArray(record.originals)&&record.originals.length<=320,'WRAPPED_RECOVERY_ORIGINAL_LIMIT');
  const keys=new Set();for(const row of record.originals){fixedArray(row,2);assert.ok(typeof row[0]==='string'&&!keys.has(row[0]));keys.add(row[0]);}
  assertOwnedWrappedClaimBootstrap(runtime,custodyBootstrap);
  assert.ok(!usedCustodyBootstraps.has(custodyBootstrap),'WRAPPED_CUSTODY_OPERATOR_BOOTSTRAP_ONCE');usedCustodyBootstraps.add(custodyBootstrap);
  const wallclock=record.metadata.profile===NATIVE_VALUE_LOCAL_WALLCLOCK_BOOTSTRAP_PROFILE_V1;
  assert.ok(wallclock||record.metadata.profile===NATIVE_VALUE_LOCAL_BOOTSTRAP_PROFILE,'WRAPPED_RECOVERY_PROFILE');
  return createFixedLocalNativeValueBootstrap({runtime,nativeRuntimes,custodyBootstrap},wallclock,record);
}

/** Irreversible mutation/signing fence, retaining original read-only system
 * identity so complete contract snapshots can be collected before stopping. */
export function fenceWrappedClaimOperatorBootstrapRecoveryV1(bootstrap) {
  assert.equal(arguments.length,1);assertWrappedClaimOperatorBootstrapV1(bootstrap);
  const state=owns.get(bootstrap);assert.ok(!state.recovering,'WRAPPED_RECOVERY_FENCE_ONCE');
  assert.equal(state.activeCommits,0,'WRAPPED_RECOVERY_STORE_COMMIT_IN_FLIGHT');
  assert.ok(state.bindingComplete && state.stores.length===4, 'WRAPPED_RECOVERY_FULLY_BOUND_REQUIRED');
  for(const operator of [...state.operators,...state.claimOperators]) {
    const status=operator.status();assert.ok(!status.busy&&!status.reserved&&!status.closed&&!status.poisoned,'WRAPPED_RECOVERY_OPERATOR_NOT_IDLE');
  }
  state.recovering=true;
  try{for(const handle of state.combined)fenceCombinedWrappedClaimOperatorRecoveryV1(handle);}
  catch(cause){state.poisoned=true;for(const op of state.operators)try{op.close();}catch{}throw cause;}
  return undefined;
}

/** Private initialization credentials are sealed before first principal.
 * They are deliberately not current journal checkpoints or reopen authority.
 * Only the original fully bound idle bootstrap can supply this snapshot. */
export function snapshotWrappedClaimOperatorInitializationV1(bootstrap) {
  assert.equal(arguments.length, 1);
  assertWrappedClaimOperatorBootstrapV1(bootstrap);
  const state = owns.get(bootstrap);
  assert.ok(state.bindingComplete && !state.recovering && state.stores.length === 4,
    'WRAPPED_INITIAL_CREDENTIALS_BOUND_REQUIRED');
  assert.equal(state.activeCommits, 0, 'WRAPPED_INITIAL_CREDENTIALS_COMMIT_IN_FLIGHT');
  const signers = state.combined.map(handle => snapshotCombinedWrappedClaimInitializationV1(handle));
  return {
    schema: 'WRAPPED_OPERATOR_PRIVATE_INITIAL_CREDENTIALS_V1',
    metadata: copy(state.metadata),
    custodySessions: state.custodyBinding.nativeRuntimes.map(native => custodySourceSessions.get(native.close)),
    signers,
    graphStores: copy(state.storeRecords),
    recoveryAdmissionGranted: false,
  };
}
