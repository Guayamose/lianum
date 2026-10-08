/** One private fixed-attempt initialization/checkpoint registry. Credentials
 * remain local; their retention is not permission to replay, sign or reopen.
 * Only an authority-pinned ordered reopen may attach this registry anew. */
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {randomBytes} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,realpath,mkdir,open,unlink,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {exactRecord} from '../../../execution/encoding/commitments.mjs';
import {assertOwnedLocalEvmV2} from '../../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {createClaimRecordStore,openClaimRecordStore} from '../../storage/segmented-record-store.mjs';
const PROFILE='WRAPPED_FIXED_PRIVATE_LIFETIME_REGISTRY_V1';
const ROOT=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const PARTS=Object.freeze(['native-receiver','native-bitcoin','native-solana','native-graph-evm','native-graph-tron','operator-keys','custody-bootstrap','owner-0','owner-1','claim-keeper','wallet','wallet-account-0','wallet-account-1','wallet-execution-0','wallet-execution-1','wallet-graph-keeper','wallet-graph-keeper-0','wallet-graph-keeper-1','wallet-withdrawal','wallet-catalogue',...Array.from({length:8},(_,i)=>'wallet-catalogue-keeper-'+i),...Array.from({length:8},(_,i)=>'wallet-official-vault-'+i),...Array.from({length:8},(_,i)=>'wallet-vault-exit-'+i),...Array.from({length:8},(_,i)=>'provider-'+i),...Array.from({length:8},(_,i)=>'recipient-'+i)]);
const registries=new WeakMap(),runtimes=new WeakMap(),parts=new WeakMap();
const same=(a,b,code='WRAPPED_LIFETIME_PRIVATE_IDENTITY_CHANGED')=>assert.ok(isDeepStrictEqual(a,b),code);
const copy=value=>structuredClone(value),opaque=()=>Object.freeze(Object.create(null));
async function syncDirectory(path){const fd=await open(path,'r');try{await fd.sync();}finally{await fd.close();}}
async function privateDirectory(path){const st=await lstat(path);assert.ok(st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o777)===0o700,'WRAPPED_LIFETIME_PRIVATE_DIRECTORY');assert.equal(await realpath(path),path);if(typeof process.getuid==='function')assert.equal(st.uid,process.getuid());}
async function privateRead(path,maximum){const st=await lstat(path);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&(st.mode&0o777)===0o600&&st.size<=maximum,'WRAPPED_LIFETIME_PRIVATE_FILE');const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const current=await fd.stat();assert.equal(current.ino,st.ino);assert.equal(current.dev,st.dev);const bytes=await fd.readFile();assert.equal(bytes.length,st.size);return bytes;}finally{await fd.close();}}
function inputIdentity(input){exactRecord(input,['runtime','directory','runId','sourceSHA256','deadlineMs']);assert.match(input.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.match(input.sourceSHA256,/^[0-9a-f]{64}$/);assert.ok(Number.isSafeInteger(input.deadlineMs)&&input.deadlineMs>0);assert.ok(['wrapped-wallet-fixed-acceptance-v1','wrapped-wallet-fixed-preflight-v1','wrapped-deployment-only-v1','external-defi-owner-cycle-v1'].some(stem=>input.directory===join(ROOT,'.local',stem,'attempt-'+input.runId,'private-audit')),'WRAPPED_LIFETIME_FIXED_ATTEMPT_DIRECTORY');
 return {profile:PROFILE,directory:input.directory,runId:input.runId,sourceSHA256:input.sourceSHA256,deadlineMs:input.deadlineMs,genesis:input.runtime.metadata.evmGenesis,chainId:input.runtime.metadata.chainId};}
const checkpoint=record=>Object.freeze({revision:record.revision,commitment:record.commitment});
async function lease(directory,identity){const path=join(directory,'registry.active'),raw=JSON.stringify({profile:PROFILE,runId:identity.runId,pid:process.pid,nonce:randomBytes(32).toString('hex')});const fd=await open(path,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await fd.writeFile(raw);await fd.sync();await syncDirectory(directory);}catch(error){await fd.close();throw error;}const original=await fd.stat();let released=false;return async()=>{if(released)return;const current=await lstat(path);assert.equal(current.ino,original.ino);assert.equal(current.dev,original.dev);assert.equal((await privateRead(path,1024)).toString(),raw);await unlink(path);await syncDirectory(directory);released=true;await fd.close();};}
function live(s){assert.ok(s&&!s.closed&&!s.sealed&&!s.fault,'WRAPPED_LIFETIME_ORIGINAL_LIVE_REGISTRY_REQUIRED');void s.runtime.ingressSendState;}
function forRuntime(runtime){const s=runtimes.get(runtime);live(s);return s;}
function recordValid(record,identity){exactRecord(record.data,['profile','identity','parts']);assert.equal(record.data.profile,PROFILE);same(record.data.identity,identity);assert.ok(record.data.parts&&typeof record.data.parts==='object');for(const [name,row]of Object.entries(record.data.parts)){assert.ok(PARTS.includes(name));exactRecord(row,['identity','privateState','version']);assert.ok(Number.isSafeInteger(row.version)&&row.version>=1);}}
async function factory(input,expected,create){await assertOwnedLocalEvmV2(input.runtime);assert.equal(input.runtime.metadata.version,'OWNED_FLAT_LOCAL_EVM_V2','WRAPPED_LIFETIME_ORIGINAL_RECEIVER_REQUIRED');const identity=inputIdentity(input);assert.ok(!runtimes.has(input.runtime),'WRAPPED_LIFETIME_RUNTIME_ALREADY_BOUND');await privateDirectory(input.directory);const directory=join(input.directory,'private-lifetime-v1');if(create){await mkdir(directory,{mode:0o700});await syncDirectory(input.directory);}await privateDirectory(directory);const release=await lease(directory,identity);let store;
 try{const keyPath=join(directory,'local-root.secret');if(create){const key=randomBytes(32),fd=await open(keyPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await fd.writeFile(key);await fd.sync();}finally{key.fill(0);await fd.close();}await syncDirectory(directory);}const key=await privateRead(keyPath,32);assert.equal(key.length,32);
  try{const options={path:join(directory,'registry.vault'),password:key.toString('hex'),identity};store=create?await createClaimRecordStore(options,{profile:PROFILE,identity,parts:{}}):await openClaimRecordStore(options);}finally{key.fill(0);}
  const record=await store.read();recordValid(record,identity);if(!create){exactRecord(expected,['revision','commitment']);same(checkpoint(record),expected,'WRAPPED_LIFETIME_CAPTURE_CHECKPOINT_CHANGED');}
  const registry=opaque(),s={runtime:input.runtime,identity,directory,store,record,release,closed:false,sealed:false,fault:false,pending:0,tail:Promise.resolve(),handles:new Map()};registries.set(registry,s);runtimes.set(input.runtime,s);return registry;
 }catch(error){store?.close();try{await release();}catch(cleanup){throw new AggregateError([error,cleanup],'WRAPPED_LIFETIME_OPEN_CLEANUP_FAILED',{cause:error});}throw error;}}
export function createWrappedPrivateLifetimeRegistryV1(input){assert.equal(arguments.length,1);return factory(input,null,true);}
export function openWrappedPrivateLifetimeRegistryV1(input,expected){assert.equal(arguments.length,2);return factory(input,expected,false);}
function serialize(s,work){live(s);s.pending++;const next=s.tail.then(async()=>{live(s);try{const current=await s.store.read();same(current,s.record,'WRAPPED_LIFETIME_RECORD_CHANGED');return await work();}catch(error){s.fault=true;throw error;}});s.tail=next.catch(()=>{});return next.finally(()=>{s.pending--;});}
async function persist(s,transform){const next=await s.store.update(s.record.revision,transform),actual=await s.store.read();same(actual,next,'WRAPPED_LIFETIME_DURABLE_READBACK');recordValid(actual,s.identity);s.record=actual;}
function handleFor(s,name){let handle=s.handles.get(name);if(!handle){handle=opaque();const row=s.record.data.parts[name];parts.set(handle,{s,name,version:row.version});s.handles.set(name,handle);}return handle;}
export async function retainWrappedPrivateLifetimePartV1(runtime,name,identity,privateState){assert.equal(arguments.length,4);assert.ok(PARTS.includes(name),'WRAPPED_LIFETIME_FIXED_PART_REQUIRED');const s=forRuntime(runtime),normalizedIdentity=copy(identity),normalizedState=copy(privateState);
 return serialize(s,async()=>{const old=s.record.data.parts[name];if(old){same(old.identity,normalizedIdentity,'WRAPPED_LIFETIME_PART_IDENTITY_CHANGED');same(old.privateState,normalizedState,'WRAPPED_LIFETIME_INITIALIZATION_CHANGED');}
  else await persist(s,data=>{assert.equal(data.parts[name],undefined);data.parts[name]={identity:normalizedIdentity,privateState:normalizedState,version:1};return data;});return handleFor(s,name);});}
export async function readWrappedPrivateLifetimePartV1(runtime,name,identity){assert.equal(arguments.length,3);assert.ok(PARTS.includes(name));const s=forRuntime(runtime);return serialize(s,async()=>{const row=s.record.data.parts[name];assert.ok(row,'WRAPPED_LIFETIME_ORIGINAL_PART_REQUIRED');same(row.identity,identity,'WRAPPED_LIFETIME_PART_IDENTITY_CHANGED');return Object.freeze({privateState:copy(row.privateState),version:row.version,handle:handleFor(s,name)});});}
export async function updateWrappedPrivateLifetimePartV1(handle,privateState){assert.equal(arguments.length,2);const part=parts.get(handle);assert.ok(part,'WRAPPED_LIFETIME_ORIGINAL_PART_HANDLE');const {s,name}=part,normalized=copy(privateState);return serialize(s,async()=>{assert.equal(s.record.data.parts[name].version,part.version,'WRAPPED_LIFETIME_PART_VERSION_CHANGED');await persist(s,data=>{const row=data.parts[name];row.privateState=normalized;row.version++;return data;});part.version=s.record.data.parts[name].version;return Object.freeze({version:part.version,durable:true,recoveryAuthorized:false});});}
export function assertWrappedPrivateLifetimePartSealedV1(handle){assert.equal(arguments.length,1);const part=parts.get(handle);assert.ok(part,'WRAPPED_LIFETIME_ORIGINAL_PART_HANDLE');live(part.s);assert.equal(part.s.pending,0,'WRAPPED_LIFETIME_DURABLE_WRITE_PENDING');assert.equal(part.s.record.data.parts[part.name].version,part.version);return Object.freeze({durable:true,recoveryAuthorized:false});}
export async function wrappedPrivateLifetimeRegistryCheckpointV1(registry){assert.equal(arguments.length,1);const s=registries.get(registry);live(s);assert.equal(s.pending,0);same(await s.store.read(),s.record);return checkpoint(s.record);}
export async function closeWrappedPrivateLifetimeRegistryV1(registry){assert.equal(arguments.length,1);const s=registries.get(registry);assert.ok(s&&!s.pending);if(s.releaseError)throw s.releaseError;if(s.closed)return {closed:true,privateStateRetained:true};s.sealed=true;s.store.close();s.closed=true;try{await s.release();}catch(error){s.releaseError=error;throw error;}return {closed:true,privateStateRetained:true};}
export async function retainWrappedPrivateLifetimeRegistryForReopenV1(runtime,token){assert.equal(arguments.length,2);const s=forRuntime(runtime);assert.equal(s.pending,0,'WRAPPED_LIFETIME_DURABLE_WRITE_PENDING');s.sealed=true;let releaseAttempted=false;
 try{const {retainOriginalWrappedRecoverySectionV1,originalWrappedRecoverySectionIdentityV1}=await import('./wrapped-recovery-authority-v1.mjs');const authority=originalWrappedRecoverySectionIdentityV1(token,'privateLifetime');for(const key of ['directory','runId','sourceSHA256','deadlineMs'])assert.equal(s.identity[key],authority[key],'WRAPPED_LIFETIME_ORIGINAL_ATTEMPT');
 same(await s.store.read(),s.record);const {profile,genesis,chainId,...input}=s.identity;await retainOriginalWrappedRecoverySectionV1(token,'privateLifetime',{schema:PROFILE,input,checkpoint:checkpoint(s.record)});s.store.close();s.closed=true;releaseAttempted=true;try{await s.release();}catch(error){s.releaseError=error;throw error;}return {retained:true,originalResourcesStopped:true};}
 catch(error){s.fault=true;s.store.close();s.closed=true;if(!releaseAttempted){try{await s.release();}catch(cleanup){s.releaseError=cleanup;throw new AggregateError([error,cleanup],'WRAPPED_LIFETIME_CAPTURE_CLEANUP_FAILED',{cause:error});}}throw error;}}
export async function reopenWrappedPrivateLifetimeRegistryFromAuthorityV1({runtime,attemptAuthority}){const {consumeOriginalWrappedRecoverySectionV1,originalWrappedRecoverySectionIdentityV1}=await import('./wrapped-recovery-authority-v1.mjs');const authority=originalWrappedRecoverySectionIdentityV1(attemptAuthority,'privateLifetime'),saved=consumeOriginalWrappedRecoverySectionV1(attemptAuthority,'privateLifetime');exactRecord(saved,['schema','input','checkpoint']);assert.equal(saved.schema,PROFILE);for(const key of ['directory','runId','sourceSHA256','deadlineMs'])assert.equal(saved.input[key],authority[key]);return openWrappedPrivateLifetimeRegistryV1({runtime,...saved.input},saved.checkpoint);}

export async function retainWrappedPrivateLifetimeIndexedPartV1(runtime,family,identity,privateState){
 assert.equal(arguments.length,4);assert.ok(['provider','recipient','wallet-catalogue-keeper','wallet-official-vault','wallet-vault-exit'].includes(family));const s=forRuntime(runtime),normalizedIdentity=copy(identity),normalizedState=copy(privateState);
 return serialize(s,async()=>{const names=PARTS.filter(name=>name.startsWith(family+'-')),existing=names.filter(name=>s.record.data.parts[name]&&isDeepStrictEqual(s.record.data.parts[name].identity,normalizedIdentity));assert.ok(existing.length<=1,'WRAPPED_LIFETIME_INDEXED_IDENTITY_AMBIGUOUS');
  if(existing.length){same(s.record.data.parts[existing[0]].privateState,normalizedState,'WRAPPED_LIFETIME_INITIALIZATION_CHANGED');return handleFor(s,existing[0]);}
  const name=names.find(name=>s.record.data.parts[name]===undefined);assert.ok(name,'WRAPPED_LIFETIME_INDEXED_CAPACITY');await persist(s,data=>{assert.equal(data.parts[name],undefined);data.parts[name]={identity:normalizedIdentity,privateState:normalizedState,version:1};return data;});return handleFor(s,name);
 });
}
export async function readWrappedPrivateLifetimeIndexedPartV1(runtime,family,identity){
 assert.equal(arguments.length,3);assert.ok(['provider','recipient','wallet-catalogue-keeper','wallet-official-vault','wallet-vault-exit'].includes(family));const s=forRuntime(runtime);return serialize(s,async()=>{const matches=Object.entries(s.record.data.parts).filter(([name,row])=>name.startsWith(family+'-')&&isDeepStrictEqual(row.identity,identity));assert.equal(matches.length,1,'WRAPPED_LIFETIME_ORIGINAL_INDEXED_PART_REQUIRED');const [name,row]=matches[0];return Object.freeze({privateState:copy(row.privateState),version:row.version,handle:handleFor(s,name)});});
}

export function wrappedPrivateLifetimeRegistryIdentityV1(registry){assert.equal(arguments.length,1);const s=registries.get(registry);live(s);return Object.freeze({...s.identity});}

/** Original registry admission must match the fixed section's attempt. */
export function assertWrappedPrivateLifetimeAttemptV1(runtime,expected){
 assert.equal(arguments.length,2);const s=forRuntime(runtime);
 for(const key of ['directory','runId','sourceSHA256','deadlineMs'])assert.equal(s.identity[key],expected[key],'WRAPPED_LIFETIME_ORIGINAL_ATTEMPT');
 assert.equal(s.identity.genesis,runtime.metadata.evmGenesis,'WRAPPED_LIFETIME_ORIGINAL_GENESIS');
 assert.equal(s.identity.chainId,runtime.metadata.chainId,'WRAPPED_LIFETIME_ORIGINAL_CHAIN');
 assert.equal(s.pending,0,'WRAPPED_LIFETIME_DURABLE_WRITE_PENDING');return true;
}

/** Public inventory completeness only; names do not expose private rows. */
export function assertWrappedPrivateLifetimePartsV1(runtime,expectedNames){
 assert.equal(arguments.length,2);const s=forRuntime(runtime);assert.equal(s.pending,0,'WRAPPED_LIFETIME_DURABLE_WRITE_PENDING');
 assert.ok(Array.isArray(expectedNames)&&expectedNames.length>0&&new Set(expectedNames).size===expectedNames.length&&expectedNames.every(name=>PARTS.includes(name)),'WRAPPED_LIFETIME_EXPECTED_PARTS');
 same(Object.keys(s.record.data.parts).sort(),[...expectedNames].sort(),'WRAPPED_LIFETIME_INVENTORY_INCOMPLETE');
 return Object.freeze({parts:Object.freeze([...expectedNames].sort()),checkpoint:checkpoint(s.record),credentialsExposed:false});
}

/** Private read-only checkpoint for a fixed runtime-attached registry. */
export async function wrappedPrivateLifetimeRuntimeCheckpointV1(runtime){
 assert.equal(arguments.length,1);const s=forRuntime(runtime);assert.equal(s.pending,0,'WRAPPED_LIFETIME_DURABLE_WRITE_PENDING');
 same(await s.store.read(),s.record,'WRAPPED_LIFETIME_RECORD_CHANGED');live(s);assert.equal(s.pending,0,'WRAPPED_LIFETIME_DURABLE_WRITE_PENDING');return checkpoint(s.record);
}
