/** Same-host fixed-purpose bootstrap. Only DATA endpoints and signed originals
 * are accepted. No caller transport, signer, clock, store, callback, restore
 * success flag or lower-owned-looking object can enter this private capability.
 * HTTPS authenticates configured endpoint names, not infrastructure independence
 * or native consensus. Every native fact still passes the unchanged V3 sources. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../../../proof-workers/catalog.mjs';
import { exactRecord, fixedArray, bytes32, ZERO } from '../paeg/commitments.mjs';
import { cloneInput, frozenInput } from '../paeg/readiness-inputs.mjs';
import { createLocalNativeValueOperator, createNativeValueOperatorQuorum } from './native-value-operators-v3.mjs';
import { createClaimRecordStore } from '../native-claims/segmented-record-store.mjs';
import { assertNativeValueRegistrations } from './native-value-registry-v2.mjs';
import { createNativeValueOperatorInventory, nativeValueInventoryBinding, nativeValuePolicy,
  validateNativeValueOperatorInventory } from './native-value-inventory-v3.mjs';
import { profileCommitment, sourceCommitment, sha256, assertSource, validateProfile } from '../chain-adapters/generic-native-value-v2.mjs';
import { PROFILE_SCHEMA, REGISTRY_SCHEMA, CHAINS } from '../chain-adapters/evm-native-value-v2.mjs';
import { bindOriginalEvmGraphTransfer } from '../chain-adapters/evm-graph-transfer-binding.mjs';
import { bindOriginalTronGraphTransfer } from '../chain-adapters/tron-native-graph-profile.mjs';
import { createOwnedEvmNativeValueHealthSource } from '../chain-adapters/evm-native-value-health-source-v3.mjs';
import { createOwnedTronNativeValueHealthSource } from '../chain-adapters/tron-native-value-health-source-v3.mjs';
import { NATIVE_QUORUM_PROFILE } from '../../../../../omnichain-product/src/evidence/native-quorum.mjs';
const owns=new WeakMap(), fetchFixed=globalThis.fetch.bind(globalThis), now=Date.now.bind(Date), copy=cloneInput, freeze=frozenInput;
const node=(a,b)=>sha256(Buffer.from('01'+a+b,'hex'));
const originalKey=(p,n)=>p+':'+n;
function uri(raw,nullable=false) {
  if(nullable&&raw===null)return null;assert.equal(typeof raw,'string');const u=new URL(raw);
  assert.equal(u.protocol,'https:','NATIVE_VALUE_BOOTSTRAP_TLS_REQUIRED');
  assert.ok(!u.username&&!u.password&&!u.hash&&!u.search,'NATIVE_VALUE_BOOTSTRAP_NO_CREDENTIAL_OR_QUERY_URL');
  assert.equal(u.href,raw,'NATIVE_VALUE_BOOTSTRAP_CANONICAL_URL');return raw;
}
/** Public deterministic descriptor only, never ownership or native evidence. */
export function nativeValueEndpointIdentity(raw) {
  const v=copy(raw);exactRecord(v,['rpcURL','replayURL']);uri(v.rpcURL);uri(v.replayURL,true);
  return sha256('LIANUM/native-value-fixed-https/2\0'+JSON.stringify(v));
}
export function nativeValueSourceConfiguration(profile) {
  const p=validateProfile(profile);const {sourceSetRoot,...configuration}=p;
  return sha256('LIANUM/native-value-fixed-client-configuration/2\0'+JSON.stringify(configuration));
}
async function post(url,body,signal) {
  const response=await fetchFixed(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal,redirect:'error'});
  assert.equal(response.ok,true,'NATIVE_VALUE_SOURCE_HTTP_STATUS');
  assert.ok(Number(response.headers.get('content-length')??'0')<=8*1024*1024,'NATIVE_VALUE_SOURCE_HTTP_SIZE');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try { while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;assert.ok(size<=8*1024*1024,'NATIVE_VALUE_SOURCE_HTTP_SIZE');chunks.push(value);} }
  catch(cause){await reader.cancel().catch(()=>{});throw cause;}finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function verifyClient(entry,index,signal) {
  const endpoint=entry.endpoints[index], identity=entry.sources[index].identity;
  let version;
  if(entry.profile.schema===PROFILE_SCHEMA) {
    const reply=await post(endpoint.rpcURL,{jsonrpc:'2.0',id:1,method:'web3_clientVersion',params:[]},signal);
    exactRecord(reply,['jsonrpc','id','result']);assert.equal(reply.jsonrpc,'2.0');assert.equal(reply.id,1);version=reply.result;
  } else {
    const reply=await post(new URL('/wallet/getnodeinfo',endpoint.rpcURL).href,{},signal);version=reply?.configNodeInfo?.codeVersion;
  }
  assert.ok(typeof version==='string'&&version.length>0&&version.length<=512,'NATIVE_VALUE_SOURCE_CLIENT_VERSION');
  assert.equal(sha256(version),identity.clientRelease,'NATIVE_VALUE_SOURCE_REGISTERED_CLIENT_RELEASE');
  assert.equal(nativeValueSourceConfiguration(entry.profile),identity.chainConfiguration,'NATIVE_VALUE_SOURCE_REGISTERED_CONFIGURATION');
}
const EVM_METHODS=new Set(['eth_chainId','eth_getBlockByNumber','eth_getTransactionByHash','eth_getTransactionReceipt','debug_traceTransaction']);
const TRON_PATHS=new Set(['/walletsolidity/getblockbynum','/walletsolidity/getnowblock','/walletsolidity/gettransactionbyid','/walletsolidity/gettransactioninfobyid']);
function transportFor(profile,endpoint) {
  if(profile.schema===PROFILE_SCHEMA)return async(method,params,{signal})=>{
    assert.ok(EVM_METHODS.has(method),'NATIVE_VALUE_READ_ONLY_EVM_METHOD');
    const value=await post(endpoint.rpcURL,{jsonrpc:'2.0',id:1,method,params},signal);
    exactRecord(value,['jsonrpc','id','result']);assert.equal(value.jsonrpc,'2.0');assert.equal(value.id,1);return value.result;
  };
  return async(path,body,{signal})=>{assert.ok(TRON_PATHS.has(path),'NATIVE_VALUE_READ_ONLY_TRON_METHOD');
    return post(new URL(path,endpoint.rpcURL).href,body,signal);};
}
function merkle(leaves,depth) {
  let level=[...leaves,...Array((1<<depth)-leaves.length).fill(ZERO)];const levels=[level];
  for(let d=0;d<depth;d++){level=Array.from({length:level.length/2},(_,i)=>node(level[2*i],level[2*i+1]));levels.push(level);}
  return {root:level[0],path:index=>({index:String(index),siblings:Array.from({length:depth},(_,d)=>levels[d][(index>>d)^1])})};
}
/** Endpoint identity is derived locally; release/config identities are explicit
 * registered trust assumptions. All four slots retain distinct endpoint names
 * and one stable operator identity across profiles. No test injection option. */
export function createNativeValueOperatorBootstrap(raw) {
  const data=copy(raw);exactRecord(data,['profiles']);assert.ok(data.profiles.length>0&&data.profiles.length<=5);fixedArray(data.profiles,data.profiles.length);
  const entries=data.profiles.map(row=>{
    exactRecord(row,['profile','sources']);fixedArray(row.sources,4);const endpoints=[],leaves=[];
    const sources=row.sources.map((item,i)=>{
      exactRecord(item,['identity','rpcURL','replayURL']);const endpoint={rpcURL:uri(item.rpcURL),replayURL:uri(item.replayURL,true)};
      assert.equal(item.identity.endpointIdentity,nativeValueEndpointIdentity(endpoint),'NATIVE_VALUE_ENDPOINT_REGISTERED_IDENTITY');
      sourceCommitment(item.identity);endpoints.push(endpoint);leaves.push(sourceCommitment(item.identity));return {identity:item.identity,index:String(i)};
    });const tree=merkle(leaves,2),profile=validateProfile({...row.profile,sourceSetRoot:tree.root});
    // The root is computed from exact registered source openings, never accepted
    // independently of the endpoint inventory.
    assert.equal(row.profile.sourceSetRoot,tree.root,'NATIVE_VALUE_BOOTSTRAP_SOURCE_ROOT');
    if(profile.schema!==PROFILE_SCHEMA)assert.ok(endpoints.every(e=>e.replayURL!==null),'NATIVE_VALUE_TRON_REPLAY_ENDPOINT_REQUIRED');
    else assert.ok(endpoints.every(e=>e.replayURL===null),'NATIVE_VALUE_EVM_NO_REPLAY_OVERRIDE');
    for(const source of sources)assert.equal(source.identity.chainConfiguration,nativeValueSourceConfiguration(profile),'NATIVE_VALUE_SOURCE_REGISTERED_CONFIGURATION');
    return {profile,sources:sources.map((s,i)=>({...s,siblings:tree.path(i).siblings})),endpoints};
  });
  // Complete the profile tree using order supplied once at bootstrap.
  const tree=merkle(entries.map(e=>profileCommitment(e.profile)),3),operators=[0,1,2,3].map(signerIndex=>createLocalNativeValueOperator({signerIndex}));
  const adapterProfiles=entries.map((entry,i)=>({profile:entry.profile,profilePath:tree.path(i),sources:entry.sources}));
  const metadata=freeze({attesterKeys:operators.map(o=>o.publicKey),rulesRoot:'0x'+tree.root,adapterProfiles,
    profile:'PRIVATE_NATIVE_VALUE_OPERATOR_BOOTSTRAP_V2',independentInfrastructureEstablished:false,sessionOnlyKeys:true});
  // Use a non-authoritative placeholder only to validate the full typed root and
  // key inventory. The actual hub domain is substituted once by the plan.
  const registry={schema:REGISTRY_SCHEMA,quorum:{profile:NATIVE_QUORUM_PROFILE,hubDomain:'01'.repeat(32),registryEpoch:'0',rulesRoot:tree.root,keys:metadata.attesterKeys}};
  try{assertNativeValueRegistrations({registry,profiles:adapterProfiles});}catch(cause){operators.forEach(o=>o.close());throw cause;}
  const state={operators,entries,metadata,originals:new Map(),stores:[],resources:null,system:null,runtime:null,bindingComplete:false,used:false,closed:false,poisoned:false};
  const bootstrap=Object.freeze({metadata,
    retainOriginal(input) {
      assert.ok(!state.closed&&!state.poisoned,'NATIVE_VALUE_BOOTSTRAP_NOT_LIVE');const request=copy(input);exactRecord(request,['profileCommitment','original']);bytes32(request.profileCommitment,true);
      const entry=entries.find(e=>profileCommitment(e.profile)===request.profileCommitment);assert.ok(entry,'NATIVE_VALUE_BOOTSTRAP_PROFILE');
      const binding=entry.profile.schema===PROFILE_SCHEMA?bindOriginalEvmGraphTransfer(request.original,{chain:CHAINS[entry.profile.chainId][0],genesisHash:'0x'+entry.profile.genesis}):bindOriginalTronGraphTransfer(request.original,entry.profile.genesis);
      const key=originalKey(request.profileCommitment,binding.identity.nativeId),prior=state.originals.get(key);
      if(prior)assert.deepEqual(prior,request.original,'NATIVE_VALUE_BOOTSTRAP_ORIGINAL_IMMUTABLE');
      else {assert.ok([...state.originals.keys()].filter(k=>k.startsWith(request.profileCommitment+':')).length<64,'NATIVE_VALUE_BOOTSTRAP_ORIGINAL_LIMIT');state.originals.set(key,freeze(request.original));}
      return freeze({profileCommitment:request.profileCommitment,nativeId:binding.identity.nativeId,authorityGranted:false});
    },
    close() {assert.ok(operators.every(o=>!o.status().busy&&!o.status().reserved),'NATIVE_VALUE_BOOTSTRAP_BUSY');state.closed=true;operators.forEach(o=>o.close());state.stores.forEach(s=>s.close());},
  });owns.set(bootstrap,state);return bootstrap;
}
export function assertNativeValueOperatorBootstrap(bootstrap) {assert.ok(owns.has(bootstrap),'NATIVE_VALUE_ORIGINAL_BOOTSTRAP_REQUIRED');const s=owns.get(bootstrap);assert.ok(!s.closed&&!s.poisoned,'NATIVE_VALUE_BOOTSTRAP_NOT_LIVE');return s.metadata;}
/** Original bootstrap/system join for the fixed-purpose provider boundary.
 * Matching public metadata, copied objects and an in-flight bind confer nothing.
 * This exposes only existing immutable metadata, never keys or journal access. */
export function assertNativeValueOperatorBootstrapForSystem(bootstrap,input) {
  assert.equal(arguments.length,2,'NATIVE_VALUE_BOOTSTRAP_SYSTEM_ARITY');
  exactRecord(input,['runtime','system']);
  const metadata=assertNativeValueOperatorBootstrap(bootstrap),s=owns.get(bootstrap);
  assert.ok(s.bindingComplete&&s.runtime===input.runtime&&s.system===input.system,
    'NATIVE_VALUE_ORIGINAL_BOOTSTRAP_SYSTEM_REQUIRED');
  return metadata;
}
/** Called only by the system factory. A caller cannot supply system resources:
 * binding consumes the original bootstrap and creates its own durable journals.
 * No signing is enabled until the system itself receives its private brand. */
export async function provisionNativeValueOperators(bootstrap,{runtime,registry,adapterProfiles}) {
  assertNativeValueOperatorBootstrap(bootstrap);const s=owns.get(bootstrap);assert.ok(!s.used,'NATIVE_VALUE_BOOTSTRAP_USED');s.used=true;s.runtime=runtime;
  assert.deepEqual(registry.quorum.keys,s.metadata.attesterKeys);assert.deepEqual(adapterProfiles,s.metadata.adapterProfiles);
  assertNativeValueRegistrations({registry,profiles:adapterProfiles});
  const live=()=>{assertNativeValueOperatorBootstrap(bootstrap);};
  try {
    const root=join(ROOT,'.local/native-value-v2/operator-journals');await mkdir(root,{recursive:true,mode:0o700});const directory=await mkdtemp(join(root,'session-'));
    const resources=[];
    for(let i=0;i<4;i++) {
      const binding=nativeValueInventoryBinding({registry,profiles:adapterProfiles,signerIndex:String(i),publicKey:s.operators[i].publicKey});
      const store=await createClaimRecordStore({path:join(directory,'operator-'+i),password:randomBytes(32).toString('hex'),identity:{profile:'NATIVE_VALUE_INVENTORY_V3',binding}},createNativeValueOperatorInventory(binding));s.stores.push(store);
      const load=async()=>{live();const r=await store.read();validateNativeValueOperatorInventory(r.data,binding);return {revision:String(r.revision),state:r.data};};
      resources.push(Object.freeze({assertLive:live,store:Object.freeze({load,async commit(raw){
        try{live();const input=copy(raw);exactRecord(input,['expectedRevision','nextState']);const old=await load();assert.equal(old.revision,input.expectedRevision,'NATIVE_VALUE_BOOTSTRAP_CAS');
          validateNativeValueOperatorInventory(input.nextState,binding);const r=await store.update(Number(input.expectedRevision),prior=>{assert.deepEqual(prior,old.state);return input.nextState;});
          const result={revision:String(r.revision),state:r.data};assert.deepEqual(await load(),result,'NATIVE_VALUE_BOOTSTRAP_DURABLE_READBACK');live();return freeze(result);
        }catch(cause){s.poisoned=true;throw new Error('NATIVE_VALUE_BOOTSTRAP_DURABLE_UNCERTAIN',{cause});}
      }}),async readerFor(raw){
        live();exactRecord(raw,['history','profileCommitment','nativeId','retained','currentRegistry']);const j=adapterProfiles.findIndex(e=>profileCommitment(e.profile)===raw.profileCommitment);assert.ok(j>=0,'NATIVE_VALUE_BOOTSTRAP_PROFILE');
        const entry=adapterProfiles[j],endpoint=s.entries[j].endpoints[i],policy=nativeValuePolicy(binding,entry),saved=s.originals.get(originalKey(raw.profileCommitment,raw.nativeId));
        assert.ok(saved,'NATIVE_VALUE_BOOTSTRAP_ORIGINAL_NOT_RETAINED');
        // Original signed wire never changes. The ONLY historical inclusion comes
        // from this operator's authenticated CAS record and one-use history token.
        const original={...saved,...(raw.retained?{inclusion:raw.retained.original.inclusion}:{})};
        if(raw.retained)assert.equal(saved.nativeWire,raw.retained.original.nativeWire,'NATIVE_VALUE_BOOTSTRAP_RETAINED_WIRE');
        // This independently opened endpoint must still serve its registered client
        // release. A deadline abort is awaited and drained by fetch before return.
        await verifyClient(s.entries[j],i,AbortSignal.timeout(Math.min(10000,Number(entry.profile.maximumQueryMs))));live();
        const transport=transportFor(entry.profile,endpoint),source={...assertSource(entry.profile,entry.sources[i]),transport};
        if(entry.profile.schema!==PROFILE_SCHEMA)source.readReplayContext=(query,{signal})=>post(endpoint.replayURL,query,signal);
        const input={policy,source,original,currentRegistry:raw.currentRegistry,now,history:raw.history};
        const reader=entry.profile.schema===PROFILE_SCHEMA?await createOwnedEvmNativeValueHealthSource(input):createOwnedTronNativeValueHealthSource(input);live();return reader;
      }}));
    }
    s.resources=Object.freeze(resources);return s.resources;
  }catch(cause){s.poisoned=true;for(const store of s.stores)try{store.close();}catch{}throw cause;}
}
export async function finishNativeValueOperators(bootstrap,{runtime,system}) {
  assertNativeValueOperatorBootstrap(bootstrap);const s=owns.get(bootstrap);assert.ok(s.used&&s.resources&&s.runtime===runtime&&!s.system,'NATIVE_VALUE_BOOTSTRAP_BIND_ONCE');s.system=system;
  try{const results=await Promise.allSettled(s.operators.map(o=>o.bind({runtime,system})));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    assertNativeValueOperatorBootstrap(bootstrap);const quorum=createNativeValueOperatorQuorum({operators:s.operators.slice(0,3)});
    s.bindingComplete=true;return Object.freeze({operators:Object.freeze([...s.operators]),quorum});
  }catch(cause){s.poisoned=true;for(const op of s.operators)try{op.close();}catch{}throw cause;}
}
