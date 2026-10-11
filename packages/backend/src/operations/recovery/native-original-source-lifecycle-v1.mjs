import {privateDirectory,syncDirectory,readPrivate,exclusive,replace} from './source-journal/private-files-v1.mjs';
import {processIdentity,validateProcess,absent} from './source-journal/process-identity-v1.mjs';
import {clearNativeSourceAccountCheckpointLockV1} from './source-journal/account-lock-v1.mjs';
import {createNativeSourceJournalCodecV1} from './source-journal/journal-codec-v1.mjs';
import * as wrappedRecovery from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import * as deviceSourceAuthority from './device-external-flat-original-source-v2.mjs';
/** Original same-host durable source. It can reopen a confirmed point between
 * operations after every old owned PID is absent. Pending writes/mutations stay
 * UNKNOWN; this does not recover a destroyed native process mid-mutation. */
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,createHmac,createCipheriv,createDecipheriv} from 'node:crypto';
import {mkdir,lstat,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {ROOT} from '@lianum/proofs/catalog';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import {exactRecord} from '@lianum/components/encoding/commitments';
import {NATIVE_VALUE_DEV_RELEASE_V5} from '../releases/native-value/native-value-dev-release-v5.mjs';
import {assertOwnedEvmRecoveryStateDumpV1} from '../../chains/evm/runtime/owned-evm-recovery-state-bound-v1.mjs';

import {buildOwnedEvmRuntimeBackendV1} from '../../chains/evm/runtime/owned-evm-runtime-backend-v1.mjs';

export const ORIGINAL_NATIVE_SOURCE_PROFILE_V1='NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1';
const SCHEMA='ORIGINAL_NATIVE_SOURCE_CAPSULE_V1';
const BASE=join(ROOT,'.local/original-native-source-durable-operator-v1');
const LOCATOR=join(BASE,'source.json'),MAX_RECORD=64*1024*1024;
const SECTIONS=Object.freeze(['receiver','graphNative','bootstrap','system','provider','owner','executor','account','session','actor']);
const FAMILIES=Object.freeze(['receiver','graphNative']);
const SECTION_SCHEMAS=Object.freeze({receiver:'ORIGINAL_NATIVE_SOURCE_RUNTIME_V1',graphNative:'ORIGINAL_NATIVE_SOURCE_RUNTIME_V1',bootstrap:'ORIGINAL_NATIVE_BOOTSTRAP_DURABLE_SOURCE_V1',system:'ORIGINAL_NATIVE_SYSTEM_DURABLE_SOURCE_V1',provider:'ORIGINAL_NATIVE_PROVIDER_DURABLE_SOURCE_V1',owner:'ORIGINAL_NATIVE_OWNER_DURABLE_SOURCE_V1',executor:'ORIGINAL_NATIVE_EXECUTOR_DURABLE_SOURCE_V1',account:'ORIGINAL_NATIVE_SOURCE_ACCOUNT_SECTION_V1',session:'ORIGINAL_NATIVE_SOURCE_SESSION_SECTION_V1',actor:'ORIGINAL_NATIVE_ACTOR_DURABLE_SOURCE_V1'});
const authorities=new WeakMap(),writes=new WeakMap(),reads=new WeakMap(),handles=new WeakMap(),runtimes=new WeakMap(),mutations=new WeakMap(),requests=new WeakMap(),checkpointRequests=new WeakMap();
const opaque=()=>Object.freeze(Object.create(null));
const copy=value=>JSON.parse(JSON.stringify(value));
const {sourceJSON,dataCopy,decodeRecord,readJournal,encodeJournal}=createNativeSourceJournalCodecV1({canonical,validateIdentity,readPrivate,replace});
const STATE_MAGIC=Buffer.from('LIANUM_NATIVE_SOURCE_STATE_V1\0');
const STATE_OVERHEAD=STATE_MAGIC.length+12+16;
function stateKey(s,family,generation){const secret=Buffer.from(s.password,'hex');try{return createHmac('sha256',secret).update('LIANUM_NATIVE_SOURCE_STATE_V1/'+family+'/'+generation).digest();}finally{secret.fill(0);}}
const stateAAD=(identity,family,pin)=>Buffer.from(canonical({identity,family,generation:pin.generation,genesis:pin.genesis,head:pin.head}));
function encryptState(s,family,pin,plaintext){const key=stateKey(s,family,pin.generation),iv=randomBytes(12);try{const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(stateAAD(s.identity,family,pin));const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);try{return Buffer.concat([STATE_MAGIC,iv,cipher.getAuthTag(),encrypted]);}finally{encrypted.fill(0);}}finally{key.fill(0);iv.fill(0);}}
function decryptState(s,family,pin,bytes){assert.ok(bytes.length>STATE_OVERHEAD&&bytes.subarray(0,STATE_MAGIC.length).equals(STATE_MAGIC),'NATIVE_SOURCE_NATIVE_FRAME');const key=stateKey(s,family,pin.generation);try{const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(STATE_MAGIC.length,STATE_MAGIC.length+12));cipher.setAAD(stateAAD(s.identity,family,pin));cipher.setAuthTag(bytes.subarray(STATE_MAGIC.length+12,STATE_OVERHEAD));return Buffer.concat([cipher.update(bytes.subarray(STATE_OVERHEAD)),cipher.final()]);}finally{key.fill(0);}}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.exec(value)?.[0]===value;
function validateIdentity(value){exactRecord(value,['profile','directory','runId','sourceSHA256','deadlineMs']);assert.equal(value.profile,ORIGINAL_NATIVE_SOURCE_PROFILE_V1);assert.ok(typeof value.runId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.exec(value.runId)?.[0]===value.runId);assert.equal(value.directory,join(BASE,'realms','realm-'+value.runId));assert.ok(hex(value.sourceSHA256)&&Number.isSafeInteger(value.deadlineMs)&&value.deadlineMs>0);}
function validateSection(value,identity,section){exactRecord(value,['schema','sourceSHA256','ownedProcesses','confirmed','candidate']);assert.equal(value.schema,SECTION_SCHEMAS[section],'NATIVE_SOURCE_SECTION_SCHEMA');assert.equal(value.sourceSHA256,identity.sourceSHA256,'NATIVE_SOURCE_SECTION_CLOSURE');assert.ok(Array.isArray(value.ownedProcesses)&&value.ownedProcesses.length<=16);value.ownedProcesses.forEach(validateProcess);assert.ok(value.confirmed&&typeof value.confirmed==='object'&&!Array.isArray(value.confirmed));assert.ok(value.candidate===null||value.candidate&&typeof value.candidate==='object'&&!Array.isArray(value.candidate));}
function validate(record,identity){exactRecord(record,['revision','data']);assert.ok(Number.isSafeInteger(record.revision)&&record.revision>=0);const d=record.data;exactRecord(d,['schema','identity','phase','generation','creator','sections','native','clockSecond']);assert.ok(typeof d.clockSecond==='string'&&/^(?:0|[1-9][0-9]{0,19})$/.exec(d.clockSecond)?.[0]===d.clockSecond,'NATIVE_SOURCE_ORIGINAL_CLOCK_CHECKPOINT');assert.equal(d.schema,SCHEMA);assert.deepEqual(d.identity,identity);validateIdentity(identity);assert.ok(['SEEDING','CONFIRMED','OPENING','UNKNOWN'].includes(d.phase));assert.ok(Number.isSafeInteger(d.generation)&&d.generation>=0&&d.generation<16);validateProcess(d.creator);exactRecord(d.sections,SECTIONS);exactRecord(d.native,FAMILIES);
 for(const name of SECTIONS)if(d.sections[name]!==null)validateSection(d.sections[name],identity,name);
 for(const name of FAMILIES){const row=d.native[name];if(row===null)continue;exactRecord(row,['pending','confirmed',...(Object.hasOwn(row,'candidate')?['candidate']:[])]);assert.ok(row.pending===null||Number.isSafeInteger(row.pending)&&row.pending>0);if(row.confirmed!==null)validateNativePin(row.confirmed,name);
  if(row.candidate!==undefined&&row.candidate!==null){exactRecord(row.candidate,['revision','confirmed']);assert.equal(row.candidate.revision,row.pending,'NATIVE_SOURCE_ORIGINAL_NATIVE_CANDIDATE');validateNativePin(row.candidate.confirmed,name);assert.notEqual(row.candidate.confirmed.path,row.confirmed?.path,'NATIVE_SOURCE_ORIGINAL_NATIVE_CANDIDATE');}}

}
function validateNativePin(pin,family){exactRecord(pin,['path','bytes','sha256','stateSHA256','generation','genesis','head']);
 assert.ok([family+'-confirmed.aead',family+'-confirmed-0.aead',family+'-confirmed-1.aead'].includes(pin.path),'NATIVE_SOURCE_ORIGINAL_NATIVE_PATH');
 assert.ok(Number.isSafeInteger(pin.bytes)&&pin.bytes>0&&pin.bytes<=MAX_RECORD&&hex(pin.sha256)&&hex(pin.stateSHA256)&&Number.isSafeInteger(pin.generation)&&pin.generation>=0&&pin.generation<16);}
async function readNativeState(s,family,pin){validateNativePin(pin,family);const bytes=await readPrivate(join(s.identity.directory,pin.path),MAX_RECORD);let plaintext;
 try{assert.equal(bytes.length,pin.bytes);assert.equal(hash(bytes),pin.sha256,'NATIVE_SOURCE_CONFIRMED_NATIVE_BYTES');plaintext=decryptState(s,family,pin,bytes);assert.equal(hash(plaintext),pin.stateSHA256,'NATIVE_SOURCE_ORIGINAL_NATIVE_FRAME');
  const value=JSON.parse(plaintext.toString('utf8'));assertOwnedEvmRecoveryStateDumpV1(value.stateDump);assert.equal(value.schema,'OWNED_NATIVE_SOURCE_PRIVATE_STATE_V1');assert.equal(value.family,family);assert.equal(value.genesisHash,pin.genesis);assert.deepEqual(value.head,pin.head);assert.equal(value.processGeneration,pin.generation);assert.equal(value.uncertainMutation,false,'NATIVE_SOURCE_HALF_MUTATION');return value;
 }finally{plaintext?.fill(0);bytes.fill(0);}}
function resumableCheckpoints(data){return FAMILIES.every(name=>{const row=data.native[name];return row&&row.confirmed&&(row.pending===null||row.candidate?.revision===row.pending);})
 &&SECTIONS.every(name=>{const row=data.sections[name];return row&&(row.candidate===null||name==='account'&&['ACCOUNT_CAS','ADMITTED_OPERATION'].includes(row.candidate?.kind)||name==='actor'&&row.candidate?.kind==='ACTOR_PERMISSION_OR_OBSERVATION');});}
export function consumeOriginalNativeSourceAccountCheckpointV1(request){assert.equal(arguments.length,1);const r=checkpointRequests.get(request);assert.ok(r&&r.section==='account'&&!r.used&&!r.s.closed&&!r.s.fault&&r.revision===r.s.record.revision,'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_REQUEST');
 r.used=true;assert.ok(Date.now()<r.s.identity.deadlineMs,'NATIVE_SOURCE_ORIGINAL_DEADLINE');return Object.freeze({identity:Object.freeze(copy(r.s.identity)),section:dataCopy(r.s.record.data.sections.account),interruptedActor:r.s.record.data.sections.actor.candidate!==null});}
export function consumeOriginalNativeSourceActorCheckpointV1(request){assert.equal(arguments.length,1);const r=checkpointRequests.get(request);assert.ok(r&&r.section==='actor'&&!r.used&&!r.s.closed&&!r.s.fault&&r.revision===r.s.record.revision,'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_REQUEST');
 r.used=true;assert.ok(Date.now()<r.s.identity.deadlineMs,'NATIVE_SOURCE_ORIGINAL_DEADLINE');return Object.freeze({identity:Object.freeze(copy(r.s.identity)),section:dataCopy(r.s.record.data.sections.actor)});}
async function reconcileCheckpoints(s){const before=copy(s.record.data),native={};
 for(const name of FAMILIES){const row=before.native[name];if(row.pending!==null){await readNativeState(s,name,row.candidate.confirmed);native[name]={pending:null,confirmed:copy(row.candidate.confirmed),candidate:null};}}
 let actor=null;if(before.sections.actor.candidate!==null){const request=opaque();checkpointRequests.set(request,{s,section:'actor',revision:s.record.revision,used:false});const module=await import('../../api/mobile/paired-original-account-actor-v2.mjs');actor=await module.reconcileOriginalNativeActorSourceCheckpointV1(request);validateSection(actor,s.identity,'actor');assert.equal(actor.candidate,null);}
 let account=null;if(before.sections.account.candidate!==null||actor){const request=opaque();checkpointRequests.set(request,{s,section:'account',revision:s.record.revision,used:false});const module=await import('../../accounts/authority/native-value-account-authority-v2.mjs');account=await module.reconcileOriginalNativeAccountSourceCheckpointV1(request);validateSection(account,s.identity,'account');assert.equal(account.candidate,null);await clearOriginalAccountCheckpointLock(s,account);}
 if(Object.keys(native).length||account||actor)await update(s,data=>{assert.deepEqual(data,before,'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_CHANGED');for(const name of Object.keys(native))data.native[name]=native[name];if(account)data.sections.account=dataCopy(account);if(actor)data.sections.actor=dataCopy(actor);return data;});}
function original(authority,allowUnknown=false){const s=authorities.get(authority);assert.ok(s&&!s.closed&&!s.fault,'NATIVE_SOURCE_ORIGINAL_CAPSULE');assert.ok(allowUnknown||s.record.data.phase!=='UNKNOWN','NATIVE_SOURCE_PENDING_UNKNOWN');assert.ok(Date.now()<s.identity.deadlineMs,'NATIVE_SOURCE_ORIGINAL_DEADLINE');return s;}
async function update(s,change){const operation=s.tail.then(async()=>{assert.ok(!s.closed&&!s.fault,'NATIVE_SOURCE_UNAVAILABLE');await privateDirectory(s.identity.directory);
 const stored=await s.vault.read(s.password),current=await decodeRecord(stored,s.identity,s.password);validate(current,s.identity);assert.deepEqual(current,s.record,'NATIVE_SOURCE_CHECKPOINT_CHANGED');
 const changed=change(copy(current.data));validate({revision:current.revision+1,data:changed},s.identity);
 const index=await encodeJournal(changed,s.identity,s.password,current.revision+1,stored.data);
 const published=await s.vault.update(s.password,current.revision,data=>{assert.deepEqual(data,stored.data,'NATIVE_SOURCE_CHECKPOINT_CHANGED');return index;});
 const next=await decodeRecord(published,s.identity,s.password);validate(next,s.identity);const actual=await readJournal(s.vault,s.password,s.identity);assert.deepEqual(actual,next,'NATIVE_SOURCE_CHECKPOINT_READBACK');s.record=next;return next;
 });s.tail=operation.catch(()=>{});try{return await operation;}catch(e){s.fault=true;throw e;}}
function uncertain(data){return FAMILIES.some(name=>data.native[name]?.pending!==null&&data.native[name]!==null)||SECTIONS.some(name=>data.sections[name]?.candidate!==null&&data.sections[name]!==null);}
async function clearOriginalSourceVaultLock(s){const path=s.vault.lockPath;let bytes;try{bytes=await readPrivate(path,2048);}catch(e){if(e.code==='ENOENT')return;throw e;}
 try{const lock=JSON.parse(bytes.toString('utf8'));exactRecord(lock,['version','pid','token']);assert.equal(lock.version,1);assert.equal(lock.pid,s.record.data.creator.pid,'NATIVE_SOURCE_STALE_LOCK_OWNER');assert.ok(hex(lock.token));await absent(s.record.data.creator);const again=await readPrivate(path,2048);try{assert.deepEqual(again,bytes);}finally{again.fill(0);}await unlink(path);await syncDirectory(s.identity.directory);}finally{bytes.fill(0);}}
// Explicit recovery of this authenticated account's own Vault lock. The
// capsule has already proved the former original creator physically absent.
const clearOriginalAccountCheckpointLock=(s,account)=>clearNativeSourceAccountCheckpointLockV1(s.record.data.creator,account);
async function acquire(s,creating){const path=join(s.identity.directory,'source.active');
 if(!creating){let bytes;try{bytes=await readPrivate(path,2048);}catch(e){if(e.code!=='ENOENT')throw e;}if(bytes)try{const old=JSON.parse(bytes.toString('utf8'));exactRecord(old,['profile','creator','token']);assert.equal(old.profile,ORIGINAL_NATIVE_SOURCE_PROFILE_V1);assert.deepEqual(old.creator,s.record.data.creator);assert.ok(hex(old.token));await absent(old.creator);const again=await readPrivate(path,2048);try{assert.deepEqual(again,bytes);}finally{again.fill(0);}await unlink(path);await syncDirectory(s.identity.directory);}finally{bytes.fill(0);}}
 const creator=await processIdentity(process.pid),bytes=Buffer.from(JSON.stringify({profile:ORIGINAL_NATIVE_SOURCE_PROFILE_V1,creator,token:randomBytes(32).toString('hex')}));
 await exclusive(path,bytes);const pin=await lstat(path);s.release=async()=>{const actual=await readPrivate(path,2048);try{const named=await lstat(path);assert.equal(named.ino,pin.ino);assert.equal(named.dev,pin.dev);assert.deepEqual(actual,bytes,'NATIVE_SOURCE_LEASE_CHANGED');await unlink(path);await syncDirectory(s.identity.directory);}finally{actual.fill(0);bytes.fill(0);}};return creator;
}
export async function createOriginalNativeSourceCapsuleV1(){assert.equal(arguments.length,0);await mkdir(join(BASE,'realms'),{recursive:true,mode:0o700});await privateDirectory(BASE);await privateDirectory(join(BASE,'realms'));
 try{await lstat(LOCATOR);assert.fail('NATIVE_SOURCE_EXISTING_ORIGINAL_REALM');}catch(e){if(e.code!=='ENOENT')throw e;}
 const identity={profile:ORIGINAL_NATIVE_SOURCE_PROFILE_V1,directory:join(BASE,'realms','realm-'+randomUUID()),runId:null,sourceSHA256:NATIVE_VALUE_DEV_RELEASE_V5.hostSourceClosureSHA256,deadlineMs:Date.now()+9*60*60*1000};identity.runId=identity.directory.slice(identity.directory.lastIndexOf('realm-')+6);validateIdentity(identity);await mkdir(identity.directory,{mode:0o700});await privateDirectory(identity.directory);
 const key=randomBytes(32);let s;try{await exclusive(join(identity.directory,'source.secret'),key);const password=key.toString('hex'),vault=new Vault(join(identity.directory,'source.vault')),creator=await processIdentity(process.pid);
 const initial={schema:SCHEMA,identity,phase:'SEEDING',generation:0,creator,clockSecond:'0',sections:Object.fromEntries(SECTIONS.map(k=>[k,null])),native:{receiver:null,graphNative:null}};
 const index=await encodeJournal(initial,identity,password,0,null),record=await decodeRecord(await vault.create(index,password),identity,password);validate(record,identity);assert.deepEqual(await readJournal(vault,password,identity),record);
 s={identity,vault,password,record,tail:Promise.resolve(),closed:false,fault:false,opening:false,opened:new Set(),references:new Map(),release:null};await acquire(s,true);await exclusive(LOCATOR,Buffer.from(JSON.stringify({schema:SCHEMA,identity})));const authority=opaque();authorities.set(authority,s);return authority;
 }catch(e){if(s?.release)await s.release();throw e;}finally{key.fill(0);}}
export function assertOriginalNativeSourceCapsuleV1(authority){assert.equal(arguments.length,1);return Object.freeze(copy(original(authority).identity));}
export function originalNativeSourceCapsuleStatusV1(authority){assert.equal(arguments.length,1);const s=original(authority,true),d=s.record.data;return Object.freeze({profile:s.identity.profile,phase:d.phase,generation:d.generation,pending:uncertain(d),observationOnly:d.phase==='UNKNOWN',financialRestoreEstablished:false,betweenOperationsOnly:true});}
/** Private owned-process evidence for the fixed outer supervisor, never a PID selector. */
export function readOriginalNativeSourceOwnedProcessesV1(authority){assert.equal(arguments.length,1);const s=original(authority,true);return Object.freeze([s.record.data.creator,...SECTIONS.flatMap(name=>s.record.data.sections[name]?.ownedProcesses??[])].map(value=>Object.freeze(copy(value))));}
export async function openOriginalNativeSourceCapsuleV1(){assert.equal(arguments.length,0);const bytes=await readPrivate(LOCATOR,16384);let locator;try{locator=JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}exactRecord(locator,['schema','identity']);assert.equal(locator.schema,SCHEMA);const identity=locator.identity;validateIdentity(identity);assert.equal(identity.sourceSHA256,NATIVE_VALUE_DEV_RELEASE_V5.hostSourceClosureSHA256,'NATIVE_SOURCE_ORIGINAL_CLOSURE');assert.ok(Date.now()<identity.deadlineMs,'NATIVE_SOURCE_ORIGINAL_DEADLINE');await privateDirectory(identity.directory);
 const key=await readPrivate(join(identity.directory,'source.secret'),32);let password;try{assert.equal(key.length,32);password=key.toString('hex');}finally{key.fill(0);}const vault=new Vault(join(identity.directory,'source.vault')),record=await readJournal(vault,password,identity);validate(record,identity);
 assert.ok(['CONFIRMED','OPENING'].includes(record.data.phase),'NATIVE_SOURCE_CONFIRMED_POINT_REQUIRED');const processes=[record.data.creator,...SECTIONS.flatMap(k=>record.data.sections[k]?.ownedProcesses??[])];for(const p of processes)await absent(p);
 const authority=opaque(),s={identity,vault,password,record,tail:Promise.resolve(),closed:false,fault:false,opening:true,opened:new Set(),references:new Map(),release:null};authorities.set(authority,s);
 if(uncertain(record.data)&&!resumableCheckpoints(record.data)){s.record={...record,data:{...record.data,phase:'UNKNOWN'}};return authority;}
 try{assert.ok(SECTIONS.every(k=>record.data.sections[k])&&FAMILIES.every(k=>record.data.native[k]?.confirmed),'NATIVE_SOURCE_COMPLETE_ORIGINAL_MEMBERSHIP');await clearOriginalSourceVaultLock(s);await acquire(s,false);
  if(uncertain(record.data))await reconcileCheckpoints(s);
  // A claim survives partial reopen; it is never reset by cleanup.
  await exclusive(join(identity.directory,'open-'+s.record.data.generation+'.claimed'),Buffer.from(JSON.stringify({profile:identity.profile,generation:s.record.data.generation,checkpointSHA256:hash(Buffer.from(JSON.stringify(s.record)))})));
  const creator=await processIdentity(process.pid);await update(s,d=>({...d,phase:'OPENING',generation:d.generation+1,creator}));return authority;
 }catch(error){s.closed=true;authorities.delete(authority);try{await s.release?.();}catch(cleanup){throw new AggregateError([error,cleanup],'NATIVE_SOURCE_OPEN_CLEANUP_FAILED');}finally{s.password=null;}throw error;}
}
// Fixed producer tokens never leave these module-to-module calls.
function writer(s,section){const token=opaque();writes.set(token,{token,s,section,generation:s.record.data.generation,used:false,runtimeConsumed:false,processes:new Map()});return token;}
const processKey=value=>canonical(value);
function producerProcesses(t,values){for(const value of values)assert.ok(t.processes.has(processKey(value)),'NATIVE_SOURCE_ORIGINAL_PROCESS_PROVENANCE');}
export function nativeSourceRecoverySectionIdentityV1(token,section){assert.equal(arguments.length,2);const t=writes.get(token)??reads.get(token);assert.ok(t&&t.section===section&&t.generation===t.s.record.data.generation&&SECTIONS.includes(section)&&(writes.has(token)||reads.has(token)&&(t.s.record.data.phase==='OPENING'||t.used&&t.resumed&&t.s.record.data.phase==='CONFIRMED')),'NATIVE_SOURCE_ORIGINAL_SECTION_TOKEN');originalFromState(t.s);return Object.freeze(copy(t.s.identity));}
function originalFromState(s){assert.ok(!s.closed&&!s.fault&&s.record.data.phase!=='UNKNOWN'&&Date.now()<s.identity.deadlineMs,'NATIVE_SOURCE_UNAVAILABLE');}
export function nativeSourceRecoveryOriginalReferenceV1(token,section,name){assert.equal(arguments.length,3);nativeSourceRecoverySectionIdentityV1(token,section);const t=writes.get(token)??reads.get(token);assert.ok(SECTIONS.includes(name)&&t.s.references.has(name),'NATIVE_SOURCE_ORIGINAL_PART_REFERENCE');return t.s.references.get(name);}
export async function nativeSourceRecoveryOwnedProcessV1(token,section,pid){assert.equal(arguments.length,3);nativeSourceRecoverySectionIdentityV1(token,section);assert.ok(writes.has(token)||reads.has(token),'NATIVE_SOURCE_ORIGINAL_PROCESS_PRODUCER');const t=writes.get(token)??reads.get(token),identity=await processIdentity(pid);t.processes.set(processKey(identity),identity);return Object.freeze(identity);}
export async function retainOriginalNativeSourceSectionV1(token,section,data){assert.equal(arguments.length,3);nativeSourceRecoverySectionIdentityV1(token,section);const t=writes.get(token);assert.ok(t&&!t.used,'NATIVE_SOURCE_ORIGINAL_SECTION_WRITER');t.used=true;const value=dataCopy(data);validateSection(value,t.s.identity,section);producerProcesses(t,value.ownedProcesses);await update(t.s,d=>{assert.equal(d.sections[section],null,'NATIVE_SOURCE_SECTION_ONCE');d.sections[section]=value;return d;});const handle=opaque();handles.set(handle,{s:t.s,section,tokenState:t,processesBound:!FAMILIES.includes(section)});return handle;}
export async function updateOriginalNativeSourceSectionV1(handle,data){assert.equal(arguments.length,2);const h=handles.get(handle);assert.ok(h,'NATIVE_SOURCE_ORIGINAL_SECTION_HANDLE');nativeSourceRecoverySectionIdentityV1(h.tokenState.token,h.section);const value=dataCopy(data);validateSection(value,h.s.identity,h.section);producerProcesses(h.tokenState,value.ownedProcesses);await update(h.s,d=>{assert.ok(d.sections[h.section],'NATIVE_SOURCE_ORIGINAL_SECTION_REQUIRED');assert.equal(value.schema,d.sections[h.section].schema);if(h.processesBound)assert.deepEqual(value.ownedProcesses,d.sections[h.section].ownedProcesses,'NATIVE_SOURCE_ORIGINAL_PROCESS_CHANGED');else{assert.ok(h.s.record.data.phase==='SEEDING'&&FAMILIES.includes(h.section)||h.resumed&&h.s.record.data.phase==='OPENING','NATIVE_SOURCE_PROCESS_REBIND_ONCE');h.processesBound=true;}d.sections[h.section]=value;return d;});}
export function consumeOriginalNativeSourceSectionV1(token,section){assert.equal(arguments.length,2);nativeSourceRecoverySectionIdentityV1(token,section);const t=reads.get(token);assert.ok(t&&!t.used,'NATIVE_SOURCE_ORIGINAL_SECTION_READER');t.used=true;t.s.opened.add(section);return copy(t.s.record.data.sections[section]);}
export function resumeOriginalNativeSourceSectionV1(token,section){assert.equal(arguments.length,2);nativeSourceRecoverySectionIdentityV1(token,section);const t=reads.get(token);assert.ok(t&&t.used&&!t.resumed,'NATIVE_SOURCE_ORIGINAL_SECTION_RESUME');t.resumed=true;const handle=opaque();handles.set(handle,{s:t.s,section,tokenState:t,resumed:true,processesBound:false});return handle;}
export async function retainOriginalNativeSourceReferenceV1(authority,section,resource){assert.equal(arguments.length,3);const s=original(authority);assert.equal(s.record.data.phase,'SEEDING');assert.ok(SECTIONS.includes(section)&&!FAMILIES.includes(section)&&s.record.data.sections[section]===null);const token=writer(s,section);
 const producer=await import('./native-original-source-parts-v1.mjs');const retained=await producer.retainFixedOriginalNativeSourcePartV1(token,section,resource);s.references.set(section,retained);return retained;
}
export async function createOriginalNativeSourceAccountV1(authority,input){assert.equal(arguments.length,2);const s=original(authority);assert.equal(s.record.data.phase,'SEEDING');assert.equal(s.record.data.sections.account,null);const module=await import('../../accounts/authority/native-value-account-authority-v2.mjs'),account=await module.createOriginalNativeSourceNoteAccountAuthorityV1(writer(s,'account'),input);s.references.set('account',account);return account;}
export async function createOriginalNativeSourceSessionV1(authority,input){assert.equal(arguments.length,2);const s=original(authority);assert.equal(s.record.data.phase,'SEEDING');assert.equal(s.record.data.sections.session,null);assert.equal(input.account,s.references.get('account'),'NATIVE_SOURCE_ORIGINAL_SESSION_ACCOUNT');const module=await import('../../api/accounts/flat-manual-graph-session.mjs'),joined=await module.createOriginalNativeSourceGraphAccountSessionV1(writer(s,'session'),input);s.references.set('session',joined.session);return joined;}
export async function reopenOriginalNativeSourceReferenceV1(authority,section,contexts){assert.equal(arguments.length,3);const s=original(authority);assert.ok(s.opening&&s.record.data.phase==='OPENING');assert.equal(SECTIONS[s.opened.size],section,'NATIVE_SOURCE_ORIGINAL_OPEN_ORDER');const token=opaque();reads.set(token,{token,s,section,generation:s.record.data.generation,used:false,processes:new Map()});
 try{const producer=await import('./native-original-source-parts-v1.mjs');const retained=await producer.reopenFixedOriginalNativeSourcePartV1(token,section,contexts);s.references.set(section,retained);return retained;}catch(e){s.fault=true;throw e;}
}
export async function createOriginalNativeSourceClockPairV1(authority){assert.equal(arguments.length,1);const s=original(authority);assert.equal(s.record.data.phase,'SEEDING');const module=sourceRuntimeAPI;let runtime,nativeRuntime;
 try{runtime=await module.createOwnedNativeDurableSourceRuntimeV1(writer(s,'receiver'));nativeRuntime=await module.createOwnedNativeDurableSourceRuntimeV1(writer(s,'graphNative'));return module.bindOwnedNativeDurableSourceClockPairV1(runtime,nativeRuntime);}
 catch(e){for(const r of [nativeRuntime,runtime])if(r)try{await r.close({removeScratch:false});}catch{}throw e;}
}
export function consumeOriginalNativeSourceRuntimeRequestV1(token){assert.equal(arguments.length,1);const t=writes.get(token)??reads.get(token);assert.ok(t&&FAMILIES.includes(t.section)&&!t.runtimeConsumed,'NATIVE_SOURCE_ORIGINAL_RUNTIME_REQUEST');nativeSourceRecoverySectionIdentityV1(token,t.section);t.runtimeConsumed=true;const request=opaque();requests.set(request,{token,s:t.s,family:t.section,opening:reads.has(token),seed:reads.has(token)?consumeOriginalNativeSourceSectionV1(token,t.section):null});return request;}
function runtimeRequest(request){const r=requests.get(request);assert.ok(r,'NATIVE_SOURCE_ORIGINAL_RUNTIME_REQUEST');nativeSourceRecoverySectionIdentityV1(r.token,r.family);return r;}
export function originalNativeSourceRuntimeRequestIdentityV1(request){assert.equal(arguments.length,1);const r=runtimeRequest(request);return Object.freeze({family:r.family,opening:r.opening,identity:Object.freeze(copy(r.s.identity))});}
export function readOriginalNativeSourceRuntimeSeedV1(request){assert.equal(arguments.length,1);const r=runtimeRequest(request);assert.ok(r.opening&&r.seed,'NATIVE_SOURCE_ORIGINAL_RUNTIME_SEED');return copy(r.seed);}
export async function retainOriginalNativeSourceRuntimeSeedV1(request,data){assert.equal(arguments.length,2);const r=runtimeRequest(request);assert.equal(r.opening,false);return retainOriginalNativeSourceSectionV1(r.token,r.family,data);}
export function resumeOriginalNativeSourceRuntimeSeedV1(request){assert.equal(arguments.length,1);const r=runtimeRequest(request);assert.equal(r.opening,true);return resumeOriginalNativeSourceSectionV1(r.token,r.family);}
export async function originalNativeSourceRuntimeOwnedProcessV1(request,pid){assert.equal(arguments.length,2);const r=runtimeRequest(request),t=writes.get(r.token)??reads.get(r.token),identity=await processIdentity(pid);t.processes.set(processKey(identity),identity);return Object.freeze(identity);}
export async function readOriginalNativeSourceRuntimeStateV1(request){assert.equal(arguments.length,1);const r=runtimeRequest(request),s=r.s;assert.ok(r.opening&&s.opening&&s.opened.has(r.family),'NATIVE_SOURCE_ORIGINAL_RUNTIME_REOPEN');return readNativeState(s,r.family,s.record.data.native[r.family].confirmed);
}
export async function attachOriginalNativeSourceRuntimeV1(request,runtime){assert.equal(arguments.length,2);const r=runtimeRequest(request);assert.equal(runtimes.has(runtime),false,'NATIVE_SOURCE_RUNTIME_ALREADY_ATTACHED');const module=sourceRuntimeAPI;module.assertOwnedNativeDurableSourceRuntimeV1(runtime);runtimes.set(runtime,{s:r.s,family:r.family});r.s.references.set(r.family,runtime);}
export async function beginOriginalNativeSourceMutationV1(runtime){assert.equal(arguments.length,1);const r=runtimes.get(runtime);assert.ok(r,'NATIVE_SOURCE_ORIGINAL_MUTATION');originalFromState(r.s);const token=opaque();const next=await update(r.s,d=>{const old=d.native[r.family];assert.ok(!old||old.pending===null,'NATIVE_SOURCE_PENDING_MUTATION');d.native[r.family]={pending:r.s.record.revision+1,confirmed:old?.confirmed??null,candidate:null};return d;});mutations.set(token,{...r,runtime,revision:next.revision,used:false});return token;}
export async function confirmOriginalNativeSourceMutationV1(token){assert.equal(arguments.length,1);const m=mutations.get(token);assert.ok(m&&!m.used,'NATIVE_SOURCE_ORIGINAL_MUTATION_TOKEN');m.used=true;originalFromState(m.s);const module=sourceRuntimeAPI;const value=await module.readOriginalNativeDurableSourceStateV1(m.runtime);assertOwnedEvmRecoveryStateDumpV1(value.stateDump);assert.equal(value.uncertainMutation,false,'NATIVE_SOURCE_HALF_MUTATION');const plaintext=Buffer.from(JSON.stringify(value));assert.ok(plaintext.length>0&&plaintext.length<=MAX_RECORD-STATE_OVERHEAD,'NATIVE_SOURCE_NATIVE_RECORD_BOUND');const previous=m.s.record.data.native[m.family].confirmed,path=m.family+'-confirmed-'+(previous?.path===m.family+'-confirmed-0.aead'?'1':'0')+'.aead';const pin={path,bytes:plaintext.length+STATE_OVERHEAD,sha256:null,stateSHA256:hash(plaintext),generation:value.processGeneration,genesis:value.genesisHash,head:copy(value.head)};let bytes;
 try{bytes=encryptState(m.s,m.family,pin,plaintext);assert.equal(bytes.length,pin.bytes);pin.sha256=hash(bytes);await replace(join(m.s.identity.directory,path),bytes);
  await update(m.s,d=>{assert.equal(d.native[m.family].pending,m.revision);assert.deepEqual(d.native[m.family].confirmed,previous);d.native[m.family]={pending:m.revision,confirmed:previous,candidate:{revision:m.revision,confirmed:pin}};return d;});
  await update(m.s,d=>{assert.equal(d.native[m.family].pending,m.revision);assert.deepEqual(d.native[m.family].candidate,{revision:m.revision,confirmed:pin});d.native[m.family]={pending:null,confirmed:pin,candidate:null};return d;});}
 finally{bytes?.fill(0);plaintext.fill(0);}
}
export async function confirmOriginalNativeSourceBirthV1(runtime){assert.equal(arguments.length,1);const token=await beginOriginalNativeSourceMutationV1(runtime);return confirmOriginalNativeSourceMutationV1(token);}
export function readOriginalNativeSourceClockCheckpointV1(authority){assert.equal(arguments.length,1);return original(authority).record.data.clockSecond;}
export async function retainOriginalNativeSourceClockCheckpointV1(authority,clock){
 assert.equal(arguments.length,2);const s=original(authority),module=await import('./native-original-source-observed-clock-v1.mjs'),pair=module.readOriginalNativeSourceClockReferencesV1(clock);
 for(const resource of [pair.runtime,pair.nativeRuntime])assert.equal(runtimes.get(resource)?.s,s,'NATIVE_SOURCE_CLOCK_ORIGINAL_REALM');
 const second=module.snapshotOriginalNativeSourceObservedClockV1(clock);assert.ok(/^[1-9][0-9]{0,19}$/.exec(second)?.[0]===second,'NATIVE_SOURCE_ORIGINAL_CLOCK_CHECKPOINT');
 await update(s,d=>{assert.ok(BigInt(second)>=BigInt(d.clockSecond),'NATIVE_SOURCE_CLOCK_ROLLBACK');d.clockSecond=second;return d;});
}
export async function finishOriginalNativeSourceBirthV1(authority){assert.equal(arguments.length,1);const s=original(authority);assert.equal(s.record.data.phase,'SEEDING');await update(s,d=>{assert.ok(SECTIONS.every(k=>d.sections[k])&&FAMILIES.every(k=>d.native[k]?.confirmed)&&BigInt(d.clockSecond)>0n&&!uncertain(d),'NATIVE_SOURCE_COMPLETE_ORIGINAL_MEMBERSHIP');d.phase='CONFIRMED';return d;});return originalNativeSourceCapsuleStatusV1(authority);}
export async function finishOriginalNativeSourceReopenV1(authority){assert.equal(arguments.length,1);const s=original(authority);assert.ok(s.opening&&s.opened.size===SECTIONS.length);await update(s,d=>{assert.equal(d.phase,'OPENING');assert.equal(uncertain(d),false);d.phase='CONFIRMED';return d;});s.opening=false;return originalNativeSourceCapsuleStatusV1(authority);}
export async function closeOriginalNativeSourceCapsuleV1(authority){assert.equal(arguments.length,1);const s=authorities.get(authority);assert.ok(s,'NATIVE_SOURCE_ORIGINAL_CAPSULE');if(s.closed)return {closed:true};await s.tail;for(const name of FAMILIES){const resource=s.references.get(name);if(resource)assert.equal(resource.processStatus().stopped,true,'NATIVE_SOURCE_CLOSE_OWNED_PROCESS_UNCONFIRMED');}for(const section of SECTIONS)for(const owned of s.record.data.sections[section]?.ownedProcesses??[])if(owned.pid!==process.pid)await absent(owned);s.closed=true;s.password=undefined;if(s.release)await s.release();return {closed:true,betweenOperationsOnly:true};}

// This instance is the only runtime issuer admitted to this journal. Callers may
// construct isolated mechanical backends, but cannot access this instance or
// register their runtimes as SOURCE authority.
const originalEvmRuntimeBackend = buildOwnedEvmRuntimeBackendV1(Object.freeze({
 journal: Object.freeze({
  originalNativeSourceRuntimeRequestIdentityV1,
  readOriginalNativeSourceRuntimeSeedV1,
  retainOriginalNativeSourceRuntimeSeedV1,
  resumeOriginalNativeSourceRuntimeSeedV1,
  originalNativeSourceRuntimeOwnedProcessV1,
  readOriginalNativeSourceRuntimeStateV1,
  updateOriginalNativeSourceSectionV1,
  beginOriginalNativeSourceMutationV1,
  confirmOriginalNativeSourceMutationV1,
 }),
 recovery: Object.freeze({
  consumeExternalDefiReceiverRepairV1: wrappedRecovery.consumeExternalDefiReceiverRepairV1,
  consumeWrappedRuntimeRecoveryV1: wrappedRecovery.consumeWrappedRuntimeRecoveryV1,
  assertNativeEconomicRecoveryCaptureV1: wrappedRecovery.assertNativeEconomicRecoveryCaptureV1,
  nativeEconomicRecoverySectionIdentityV1: wrappedRecovery.nativeEconomicRecoverySectionIdentityV1,
  externalDefiReceiverCaptureIdentityV2: wrappedRecovery.externalDefiReceiverCaptureIdentityV2,
  consumeExternalDefiReceiverRuntimeSectionV2: wrappedRecovery.consumeExternalDefiReceiverRuntimeSectionV2,
  deviceExternalFlatReceiverCaptureIdentityV1: wrappedRecovery.deviceExternalFlatReceiverCaptureIdentityV1,
  consumeDeviceExternalFlatReceiverRuntimeSectionV1: wrappedRecovery.consumeDeviceExternalFlatReceiverRuntimeSectionV1,
  assertNativeLiveArmedRecoveryCaptureV1: wrappedRecovery.assertNativeLiveArmedRecoveryCaptureV1,
  nativeLiveArmedRecoverySectionIdentityV1: wrappedRecovery.nativeLiveArmedRecoverySectionIdentityV1,
  consumeNativeLiveArmedRecoverySectionV1: wrappedRecovery.consumeNativeLiveArmedRecoverySectionV1,
  async nativeD26() {
   const module0 = await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
   return Object.freeze({ consumeNativeD26ObservationSectionV1: module0.consumeNativeD26ObservationSectionV1 });
  },
  async economic() {
   const module0 = await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
   return Object.freeze({ consumeNativeEconomicRecoverySectionV1: module0.consumeNativeEconomicRecoverySectionV1 });
  },
 }),
 deviceSource: Object.freeze({
  consumeOriginalDeviceGraphSourceRequestV2: deviceSourceAuthority.consumeOriginalDeviceGraphSourceRequestV2,
  consumeOriginalDeviceGraphSourceSectionV2: deviceSourceAuthority.consumeOriginalDeviceGraphSourceSectionV2,
  originalDeviceGraphSourceSectionIdentityV2: deviceSourceAuthority.originalDeviceGraphSourceSectionIdentityV2,
  beginOriginalDeviceGraphSourceActivityV2: deviceSourceAuthority.beginOriginalDeviceGraphSourceActivityV2,
  endOriginalDeviceGraphSourceActivityV2: deviceSourceAuthority.endOriginalDeviceGraphSourceActivityV2,
 }),
 reorg: Object.freeze({
  async probe() {
   const module0 = await import('../../execution/native-value/execution/native-value-execution-v2.mjs');
   return Object.freeze({ consumeOriginalNativeFReorgProbeV1: module0.consumeOriginalNativeFReorgProbeV1 });
  },
  async recovery() {
   const module0 = await import('../../execution/native-value/execution/native-value-execution-v2.mjs');
   return Object.freeze({ consumeOriginalNativeRecoveryReorgWireV1: module0.consumeOriginalNativeRecoveryReorgWireV1 });
  },
 }),
 dispatch: Object.freeze({
  async deviceNote() {
   const module0 = await import('../../accounts/authority/device-external-flat-note-authority-v1.mjs');
   return Object.freeze({ consumeOriginalDeviceExternalFlatSendV1: module0.consumeOriginalDeviceExternalFlatSendV1 });
  },
  async claim() {
   const module0 = await import('../../chains/evm/dispatch/evm-dispatch-gate.mjs');
   const module1 = await import('../../claims/controller/controller.mjs');
   const module2 = await import('../../claims/wrapped/controller/wrapped-controller-v1.mjs');
   return Object.freeze({ assertOwnedEvmDispatchRequest: module0.assertOwnedEvmDispatchRequest, isOwnedClaimEvmDispatchRequest: module1.isOwnedClaimEvmDispatchRequest, assertOwnedClaimEvmDispatchRequest: module1.assertOwnedClaimEvmDispatchRequest, isWrapped: module2.isOwnedClaimEvmDispatchRequest, openWrapped: module2.assertOwnedClaimEvmDispatchRequest });
  },
  async paged() {
   const module0 = await import('../../chains/evm/dispatch/funded-paged-native-gate-v3.mjs');
   return Object.freeze({ openOriginalPagedNativeDispatchV3: module0.openOriginalPagedNativeDispatchV3 });
  },
  async native() {
   const module0 = await import('../../chains/evm/dispatch/native-value-evm-dispatch-gate.mjs');
   const module1 = await import('../../chains/shared/dispatch/wrapped-claim-graph-dispatch-gate-v1.mjs');
   return Object.freeze({ assertOwnedNativeValueEvmDispatchRequest: module0.assertOwnedNativeValueEvmDispatchRequest, isWrappedClaimGraphDispatchRequestV1: module1.isWrappedClaimGraphDispatchRequestV1, openWrappedNativeValueEvmDispatchRequest: module1.assertOwnedNativeValueEvmDispatchRequest, consumeWrappedGraphDispatchAuthorityV4: module1.consumeWrappedGraphDispatchAuthorityV4 });
  },
 }),
 observation: Object.freeze({
  async nativeValue() {
   const module0 = await import('../../chains/evm/health/evm-native-value-health-source-v4.mjs');
   return Object.freeze({ createOwnedEvmNativeValueHealthSource: module0.createOwnedEvmNativeValueHealthSource });
  },
 }),
}));
const originalSourceRuntimeBackend = originalEvmRuntimeBackend.sourceRuntime;

// These functions retain the same closed backend as SOURCE. No instance or
// configurable issuer is exported by either public facade.
export const {
  createOwnedLocalEvmObservedClockV1,
  refreshNativeValueReceiverClock,
  nativeValueReceiverInclusionSecondV1,
  assertOwnedLocalEvmObservedClockV1,
  consumeNativeEconomicObservedCustodyRequestV2,
  createOwnedNativeEconomicObservedReceiverV2,
  createOwnedNativeEconomicObservedGraphRuntimeV2,
  createOwnedNativeEconomicObservedClockPairV2,
  assertOwnedNativeEconomicObservedReceiverV2,
  assertOwnedNativeEconomicObservedGraphRuntimeV2,
  createOwnedNativeLiveArmedObservedClockPairV1,
  assertOwnedNativeLiveArmedReceiverV1,
  assertOwnedNativeLiveArmedGraphRuntimeV1,
  bindOwnedNativeLiveArmedObservedClockPairV1,
  readOwnedNativeLiveArmedObservedClockPairV1,
  fenceOwnedNativeLiveArmedRuntimeV1,
  captureOwnedNativeLiveArmedRuntimeV1,
  abortOwnedNativeLiveArmedRuntimeV1,
  reopenOwnedNativeLiveArmedReceiverV1,
  reopenOwnedNativeLiveArmedGraphRuntimeV1,
  refreshOwnedNativeEconomicObservedGraphClockV2,
  probeOwnedOsakaTransactionGasRejectionV1,
  createOwnedOriginalNativeFReorgReceiverV1,
  isOwnedOriginalNativeFReorgReceiverV1,
  retainOwnedOriginalFReorgProbeV1,
  rewindOwnedOriginalFReorgProbeV1,
  reemitOwnedOriginalNativeRecoveryV1,
  armOwnedEvmRecoveryRetentionV1,
  captureOwnedEvmRecoveryV1,
  reopenOwnedReceiverRecoveryV1,
  reopenOwnedNativeD26ObservationReceiverV1,
  reopenOwnedNativeEconomicReceiverV1,
  reopenOwnedExternalDefiReceiverV2,
  reopenOwnedDeviceExternalFlatReceiverV1,
  reopenOwnedNativeEconomicGraphRuntimeV1,
  reopenOwnedReceiverPreopenRepairV1,
  reopenOwnedGraphNativeRecoveryV1,
  isOwnedLocalEvmNativeValueRuntime,
  assertOwnedLocalEvmNativeValueRuntime,
  assertOwnedLocalEvmNativeValueRuntimeLive,
  readOwnedLocalEvmNativeValueAuditStateV4,
  readOwnedEvmWrappedGraphOperationV4,
  ownedLocalEvmNativeValueRuntimeIdentity,
  openOwnedLocalEvmNativeValueSource,
  isOwnedLocalEvmNativeValueV1,
  assertOwnedLocalEvmNativeValueV1,
  isOwnedLocalEvmV2,
  ownedLocalEvmTransactionGasLimit,
  assertOwnedLocalEvmV2,
  createOwnedLocalEvmV2,
  createOwnedLocalEvmOsakaV1,
  createOwnedLocalEvmNativeValueV1,
  createOwnedLocalPagedNativeEvmV3,
  assertOwnedLocalPagedNativeEvmV3,
  createOwnedLocalEvmNativeValueBaseV1,
  createOwnedLocalEvmNativeValueArbitrumV1,
  createOwnedLocalEvmNativeValueBnbV1,
  createOwnedLocalEvmV2PoolGenerationAcceptance,
  ownedPoolGenerationTransportControls,
  recoveryAnvilPinV1,
  createOwnedRecoverableReceiverV1,
  createOwnedRecoverableGraphNativeV1,
  createOwnedNativeEconomicReceiverV2,
  createOwnedNativeEconomicGraphRuntimeV2,
  createOwnedExternalDefiReceiverV2,
  assertOwnedExternalDefiReceiverV2,
  captureOwnedExternalDefiReceiverV2,
  abortOwnedExternalDefiReceiverCaptureV2,
  createOwnedDeviceExternalFlatReceiverV1,
  createOwnedDeviceExternalFlatSourceReceiverV2,
  assertOwnedDeviceExternalFlatSourceReceiverV2,
  checkpointOwnedDeviceExternalFlatSourceReceiverV2,
  reopenOwnedDeviceExternalFlatSourceReceiverV2,
  assertOwnedDeviceExternalFlatReceiverV1,
  captureOwnedDeviceExternalFlatReceiverV1,
  abortOwnedDeviceExternalFlatReceiverCaptureV1,
  isOwnedNativeEconomicRuntimeV2,
  assertOwnedNativeEconomicRuntimeRecoverableV1,
  fenceOwnedNativeEconomicRuntimeV1,
  captureOwnedNativeEconomicRuntimeV1,
  abortOwnedNativeEconomicRuntimeV1,
  createNativeEconomicLocalCustodyV2,
  createNativeEconomicObservedLocalCustodyV2,
  assertNativeEconomicGenesisV2,
  reopenNativeEconomicLocalCustodyV2,
  reopenNativeEconomicObservedLocalCustodyV2,
  nativeEconomicLocalCustodyPublicV2,
  checkNativeEconomicLocalCustodyV2,
  signNativeEconomicCustodyTransactionV2,
  captureNativeEconomicLocalCustodyV2,
  prepareNativeEconomicCustodySigningV2,
  consumeNativeEconomicCustodySigningV2,
  revokeNativeEconomicCustodySigningV2,
  closeNativeEconomicLocalCustodyV2,
  consumeOwnedEvmNativeSourceRequest,
  describeOwnedLocalEvmNativeValueSource,
  createOwnedLocalEvmNativeValueHealthSource,
  openOriginalOwnedRollupNativeValueSourcesV1,
} = originalEvmRuntimeBackend;

const originalDurableSourceRuntimesV1 = new WeakMap(), originalDurableSourcePairsV1 = new WeakMap();
export async function createOwnedNativeDurableSourceRuntimeV1(token) {
  assert.equal(arguments.length, 1);
  const request = consumeOriginalNativeSourceRuntimeRequestV1(token);
  let runtime;
  try {
    runtime = await originalSourceRuntimeBackend.create(request);
    originalDurableSourceRuntimesV1.set(runtime, originalSourceRuntimeBackend.identity(runtime));
    await attachOriginalNativeSourceRuntimeV1(request, runtime);
    await confirmOriginalNativeSourceBirthV1(runtime);
    return runtime;
  } catch (error) {
    if (runtime) try { error.cleanup = await runtime.close({ removeScratch: true }); }
    catch (cleanupError) { error.cleanupError = cleanupError; }
    throw error;
  }
}
function durableSourceRuntime(runtime,family){const state=originalDurableSourceRuntimesV1.get(runtime);assert.ok(state&&(!family||state.family===family),'NATIVE_SOURCE_ORIGINAL_RUNTIME_REQUIRED');originalSourceRuntimeBackend.assert(runtime);return state;}
export function assertOwnedNativeDurableSourceRuntimeV1(runtime){assert.equal(arguments.length,1);durableSourceRuntime(runtime);}
export function assertOwnedNativeDurableSourceReceiverV1(runtime){assert.equal(arguments.length,1);durableSourceRuntime(runtime,'receiver');assertOwnedNativeEconomicObservedReceiverV2(runtime);}
export function assertOwnedNativeDurableSourceGraphRuntimeV1(runtime){assert.equal(arguments.length,1);durableSourceRuntime(runtime,'graphNative');assertOwnedNativeEconomicObservedGraphRuntimeV2(runtime);}
export function bindOwnedNativeDurableSourceClockPairV1(receiver,native){
  assert.equal(arguments.length,2);const r=durableSourceRuntime(receiver,'receiver'),n=durableSourceRuntime(native,'graphNative');
  assert.deepEqual(r.identity,n.identity,'NATIVE_SOURCE_PAIR_ORIGINAL_REALM');assert.equal(r.generation,n.generation,'NATIVE_SOURCE_PAIR_ORIGINAL_GENERATION');
  assert.ok(!originalDurableSourcePairsV1.has(receiver)&&!originalDurableSourcePairsV1.has(native),'NATIVE_SOURCE_PAIR_ONCE');
  originalSourceRuntimeBackend.bindClocks(receiver,native);
  const pair=Object.freeze({runtime:receiver,nativeRuntime:native});originalDurableSourcePairsV1.set(receiver,pair);originalDurableSourcePairsV1.set(native,pair);return pair;
}
export function readOwnedNativeDurableSourceClockPairV1(receiver,native){assert.equal(arguments.length,2);durableSourceRuntime(receiver,'receiver');durableSourceRuntime(native,'graphNative');const pair=originalDurableSourcePairsV1.get(receiver);assert.ok(pair&&pair.runtime===receiver&&pair.nativeRuntime===native&&originalDurableSourcePairsV1.get(native)===pair,'NATIVE_SOURCE_PAIR_ORIGINAL_REFERENCES');return pair;}
export async function readOriginalNativeDurableSourceStateV1(runtime){assert.equal(arguments.length,1);durableSourceRuntime(runtime);return originalSourceRuntimeBackend.snapshot(runtime);}


const sourceRuntimeAPI = Object.freeze({
  createOwnedNativeDurableSourceRuntimeV1,
  assertOwnedNativeDurableSourceRuntimeV1,
  bindOwnedNativeDurableSourceClockPairV1,
  readOriginalNativeDurableSourceStateV1,
});
