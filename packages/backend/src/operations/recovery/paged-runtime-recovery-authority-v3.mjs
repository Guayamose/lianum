/** Private supervisor retention. Public records never issue runtime authority.
 * Only an authenticated, exclusively claimed captured vault issues one-use
 * opening tokens. A failed/partial opening stays visible and cannot be replayed. */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,realpath,open,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {readPrivateRuntimeRecoveryV1} from '../../chains/shared/runtime/owned-runtime-recovery-files-v1.mjs';

const PROFILE='ORIGINAL_PAGED_SUPERVISOR_RETENTION_V3',tokens=new WeakMap();
const families=Object.freeze(['receiver','graphNative','bitcoin','solana']);
const components=Object.freeze(['deployment','authority','provider']);
const MIXED='UNISWAP_THREE_NETWORK_V3',mixedFamilies=Object.freeze([...families,'uniswap']),mixedComponents=Object.freeze([...components,'uniswap']);
const runtimeNames=mixed=>mixed?mixedFamilies:families,componentNames=mixed=>mixed?mixedComponents:components;
const clone=value=>structuredClone(value),sha=value=>createHash('sha256').update(canonical(value)).digest('hex');
function exact(value,keys){assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort());for(const key of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));return value;}
function freeze(value){if(value&&typeof value==='object'){for(const entry of Object.values(value))freeze(entry);Object.freeze(value);}return value;}
async function location(raw){
 exact(raw,['directory','password']);assert.equal(typeof raw.directory,'string');assert.equal(resolve(raw.directory),raw.directory);assert.ok(raw.directory.length<4096);
 assert.ok(typeof raw.password==='string'&&raw.password.length>=32&&raw.password.length<=4096);
 const stat=await lstat(raw.directory);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()&&(stat.mode&0o777)===0o700&&await realpath(raw.directory)===raw.directory,'PAGED_SUPERVISOR_PRIVATE_DIRECTORY');
 return {directory:raw.directory,path:join(raw.directory,'supervisor.vault'),password:raw.password};
}
async function physical(path,required=true){
 try{const stat=await lstat(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.uid===process.getuid()&&(stat.mode&0o777)===0o600&&stat.size>0&&stat.size<=2*1024*1024,'PAGED_SUPERVISOR_PRIVATE_FILE');}
 catch(error){if(required||error.code!=='ENOENT')throw error;}
 try{await lstat(path+'.lock');assert.fail('PAGED_SUPERVISOR_TRANSACTION_LOCKED');}catch(error){if(error.code!=='ENOENT')throw error;}
}
function validate(record){
 const data=record.data,mixed=Object.hasOwn(data,'composition');exact(data,['profile','identity','descriptor','generation','phase','snapshot',...(mixed?['composition']:[])]);if(mixed)assert.equal(data.composition,MIXED);
 assert.equal(data.profile,PROFILE);P.pagedOwnerHexV3(data.identity);P.normalizeDevicePagedDescriptorV3(data.descriptor);
 assert.ok(Number.isSafeInteger(data.generation)&&data.generation>=0&&data.generation<16);assert.ok(['ACTIVE','CAPTURED','OPENING'].includes(data.phase));
 assert.equal(data.snapshot===null,data.phase==='ACTIVE');
 if(data.snapshot!==null){const saved=exact(data.snapshot,['profile','snapshotSHA256','bytes','parts']);assert.equal(saved.profile,PROFILE);P.pagedOwnerHexV3(saved.snapshotSHA256);assert.ok(Number.isSafeInteger(saved.bytes)&&saved.bytes>0&&saved.bytes<=24*1024*1024);assert.ok(Array.isArray(saved.parts)&&saved.parts.length===Math.ceil(saved.bytes/(384*1024)));for(const part of saved.parts){exact(part,['name','dataSHA256']);assert.match(part.name,/^supervisor-snapshot-[0-9a-f]{32}-[0-9]{1,3}\.vault$/);P.pagedOwnerHexV3(part.dataSHA256);}}
 assert.ok(Buffer.byteLength(canonical(data))<=128*1024,'PAGED_SUPERVISOR_RECORD_BOUND');return data;
}
function validateSnapshot(saved,descriptor,mixed){
 exact(saved,['deployment','authority','provider','runtimes',...(mixed?['uniswap']:[])]);exact(saved.runtimes,runtimeNames(mixed));
 for(const family of runtimeNames(mixed)){const section=saved.runtimes[family];assert.ok(section&&section.family===(family==='uniswap'?'receiver':family),'PAGED_SUPERVISOR_RUNTIME_FAMILY');assert.ok(section.terminal?.ownedProcessStopped===true&&section.terminal.forced===false,'PAGED_SUPERVISOR_RUNTIME_NOT_CAPTURED');assert.ok(Number.isSafeInteger(section.processGeneration)&&section.processGeneration>=0&&section.processGeneration<16);if(family==='solana')assert.equal(section.terminal.nativeOrderlyExit,true);}
 assert.equal(new Set(runtimeNames(mixed).map(name=>saved.runtimes[name].cwd)).size,runtimeNames(mixed).length,'PAGED_SUPERVISOR_RUNTIME_ALIAS');
 assert.deepEqual(saved.authority.descriptor,descriptor,'PAGED_SUPERVISOR_AUTHORITY_DESCRIPTOR');
 if(mixed){assert.ok(saved.uniswap&&Object.getPrototypeOf(saved.uniswap)===Object.prototype,'PAGED_SUPERVISOR_UNISWAP_COMPONENT');assert.equal(saved.uniswap.profile,'ORIGINAL_PAGED_UNISWAP_CONTEXT_COLD_RETENTION_V3');const pairing=saved.provider.configuration?.publicConfiguration?.uniswap;assert.ok(pairing,'PAGED_SUPERVISOR_UNISWAP_PROVIDER');assert.deepEqual(saved.uniswap.targetDescriptor,pairing.targetConnection.descriptor,'PAGED_SUPERVISOR_UNISWAP_DESCRIPTOR');}
 else assert.ok(!saved.provider.configuration?.publicConfiguration?.uniswap,'PAGED_SUPERVISOR_COMPOSITION');
}
async function compactRuntime(section){
 const path=join(section.cwd,'wrapped-runtime-terminal.json'),file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{const before=await file.stat();assert.ok(before.isFile()&&before.nlink===1&&before.uid===process.getuid()&&(before.mode&0o777)===0o600&&before.size>0&&before.size<=64*1024*1024,'PAGED_SUPERVISOR_CAPTURE_FILE');bytes=await file.readFile();const after=await file.stat();for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(after[key],before[key],'PAGED_SUPERVISOR_CAPTURE_CHANGED');assert.equal(bytes.length,before.size);const {localCustody,...terminalSection}=section;assert.deepEqual(JSON.parse(bytes.toString('utf8')),terminalSection,'PAGED_SUPERVISOR_ORIGINAL_RUNTIME_CAPTURE');return {...(localCustody?{localCustody:clone(localCustody)}:{}),family:section.family,cwd:section.cwd,processGeneration:section.processGeneration,terminal:clone(section.terminal),genesis:section.genesis,terminalRecord:{path:'wrapped-runtime-terminal.json',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}};}finally{bytes?.fill(0);await file.close();}
}
async function storeSnapshot(directory,password,snapshot,mixed){
 const value=clone(snapshot);for(const family of runtimeNames(mixed))value.runtimes[family]=await compactRuntime(value.runtimes[family]);
 const bytes=Buffer.from(JSON.stringify(value));assert.ok(bytes.length>0&&bytes.length<=24*1024*1024,'PAGED_SUPERVISOR_SNAPSHOT_BOUND');const id=randomBytes(16).toString('hex'),parts=[];
 try{for(let offset=0;offset<bytes.length;offset+=384*1024){const ordinal=parts.length,name=`supervisor-snapshot-${id}-${ordinal}.vault`,data={profile:PROFILE,ordinal,payload:bytes.subarray(offset,offset+384*1024).toString('base64')};await new Vault(join(directory,name)).create(data,password);await physical(join(directory,name));parts.push({name,dataSHA256:sha(data)});}return {profile:PROFILE,snapshotSHA256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,parts};}finally{bytes.fill(0);}
}
async function loadSnapshot(directory,password,saved,descriptor,mixed){
 const chunks=[];let joined;
 try{for(const [ordinal,part]of saved.parts.entries()){const path=join(directory,part.name);await physical(path);const row=await new Vault(path).read(password);assert.equal(row.revision,0,'PAGED_SUPERVISOR_SNAPSHOT_IMMUTABLE');exact(row.data,['profile','ordinal','payload']);assert.equal(row.data.profile,PROFILE);assert.equal(row.data.ordinal,ordinal);assert.equal(sha(row.data),part.dataSHA256,'PAGED_SUPERVISOR_SNAPSHOT_HASH');const chunk=Buffer.from(row.data.payload,'base64');assert.equal(chunk.toString('base64'),row.data.payload);assert.ok(chunk.length>0&&chunk.length<=384*1024);chunks.push(chunk);}joined=Buffer.concat(chunks);assert.equal(joined.length,saved.bytes);assert.equal(createHash('sha256').update(joined).digest('hex'),saved.snapshotSHA256,'PAGED_SUPERVISOR_SNAPSHOT_HASH');const value=JSON.parse(joined.toString('utf8'));validateSnapshot(value,descriptor,mixed);return value;}finally{joined?.fill(0);for(const chunk of chunks)chunk.fill(0);}
}
async function claim(directory){
 const path=join(directory,'supervisor-owner.lock'),file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 const identity=randomBytes(32).toString('hex');await file.writeFile(JSON.stringify({profile:PROFILE,identity,pid:process.pid}));await file.sync();const original=await file.stat();
 let closed=false;
 return {async current(){assert.ok(!closed,'PAGED_SUPERVISOR_CLOSED');const actual=await lstat(path);for(const key of ['dev','ino','uid','mode','nlink'])assert.equal(actual[key],original[key],'PAGED_SUPERVISOR_OWNER_CHANGED');},async close(){if(closed)return;closed=true;try{const actual=await lstat(path);for(const key of ['dev','ino','uid','mode','nlink'])assert.equal(actual[key],original[key],'PAGED_SUPERVISOR_OWNER_CHANGED');await unlink(path);}finally{await file.close();}}};
}
async function build(raw,descriptor,opening,mixed=false){
 const input=await location(raw),lease=await claim(input.directory),vault=new Vault(input.path);let password=input.password,record,openingSnapshot=null,closed=false,busy=false;const issued=new Set();
 async function current(){assert.ok(!closed,'PAGED_SUPERVISOR_CLOSED');await lease.current();await physical(input.path);const actual=await vault.read(password);validate(actual);assert.equal(actual.revision,record.revision,'PAGED_SUPERVISOR_REVISION');assert.equal(sha(actual.data),sha(record.data),'PAGED_SUPERVISOR_HIGHWATER');return actual;}
 async function write(data){await current();const next=await vault.update(password,record.revision,()=>clone(data));const actual=await vault.read(password);validate(actual);assert.deepEqual(actual,next,'PAGED_SUPERVISOR_READBACK');record=actual;await lease.current();return actual;}
 try{
  await physical(input.path,opening);
  if(opening){record=await vault.read(password);validate(record);assert.equal(Object.hasOwn(record.data,'composition'),mixed,'PAGED_SUPERVISOR_COMPOSITION');assert.equal(record.data.phase,'CAPTURED','PAGED_SUPERVISOR_NO_CAPTURED_REOPEN');openingSnapshot=await loadSnapshot(input.directory,password,record.data.snapshot,record.data.descriptor,mixed);const next=clone(record.data);next.phase='OPENING';await write(next);}
  else{const normalized=P.normalizeDevicePagedDescriptorV3(descriptor);record=await vault.create({profile:PROFILE,identity:randomBytes(32).toString('hex'),descriptor:normalized,generation:0,phase:'ACTIVE',snapshot:null,...(mixed?{composition:MIXED}:{})},password);validate(record);await physical(input.path);}
  const handle=Object.freeze({
   descriptor(){assert.ok(!closed);return freeze(clone(record.data.descriptor));},
   checkpoint(){assert.ok(!closed);return freeze({profile:PROFILE,identity:record.data.identity,generation:record.data.generation,revision:record.revision,dataSHA256:sha(record.data),phase:record.data.phase});},
   async capture(snapshot){assert.ok(!closed&&!busy&&record.data.phase==='ACTIVE','PAGED_SUPERVISOR_CAPTURE_PHASE');busy=true;try{validateSnapshot(snapshot,record.data.descriptor,mixed);const next=clone(record.data);next.phase='CAPTURED';next.snapshot=await storeSnapshot(input.directory,password,snapshot,mixed);validate({data:next});await write(next);return handle.checkpoint();}finally{busy=false;}},
   async issueRuntime(family){assert.ok(runtimeNames(mixed).includes(family));return issue('runtime',family);},
   async issueComponent(component){assert.ok(componentNames(mixed).includes(component));return issue('component',component);},
   async complete(){assert.ok(!closed&&!busy&&record.data.phase==='OPENING','PAGED_SUPERVISOR_COMPLETE_PHASE');assert.equal(issued.size,runtimeNames(mixed).length+componentNames(mixed).length,'PAGED_SUPERVISOR_OPEN_COMPONENTS');assert.ok([...issued].every(token=>tokens.get(token)?.consumed),'PAGED_SUPERVISOR_OPEN_COMPONENTS');busy=true;try{const next=clone(record.data);next.phase='ACTIVE';next.generation++;next.snapshot=null;validate({data:next});await write(next);openingSnapshot=null;return handle.checkpoint();}finally{busy=false;}},
   async close(){if(closed)return;assert.ok(!busy,'PAGED_SUPERVISOR_BUSY');closed=true;for(const token of issued)tokens.delete(token);password=null;record=null;await lease.close();}
  });
  async function issue(kind,name){assert.ok(!closed&&!busy&&record.data.phase==='OPENING','PAGED_SUPERVISOR_OPEN_PHASE');busy=true;try{await current();assert.ok(![...issued].some(token=>tokens.get(token)?.kind===kind&&tokens.get(token)?.name===name),'PAGED_SUPERVISOR_OPEN_TOKEN_USED');const token=Object.freeze(Object.create(null));let data=kind==='runtime'?openingSnapshot.runtimes[name]:openingSnapshot[name];if(kind==='runtime'){const section=data;data=await readPrivateRuntimeRecoveryV1(section.cwd,section.terminalRecord);for(const key of ['family','cwd','processGeneration','genesis'])assert.equal(data[key],section[key],'PAGED_SUPERVISOR_RUNTIME_CAPTURE_HASH');assert.deepEqual(data.terminal,section.terminal);if(section.localCustody){assert.ok(name==='uniswap'?data.schema==='OWNED_EXTERNAL_DEFI_RECEIVER_CAPTURE_V3':['receiver','graphNative'].includes(name)&&data.schema==='OWNED_FIXED_EVM_CAPTURE_V2','PAGED_SUPERVISOR_ORIGINAL_EVM_CUSTODY');data.localCustody=clone(section.localCustody);}}tokens.set(token,{kind,name,data:clone(data),active:()=>!closed&&record.data?.phase==='OPENING',consumed:false});issued.add(token);return token;}finally{busy=false;}}
  return handle;
 }catch(error){password=null;await lease.close();throw error;}
}
export async function createOriginalPagedSupervisorRetentionV3(input,descriptor){assert.equal(arguments.length,2);return build(input,descriptor,false);}
export async function openOriginalPagedSupervisorRetentionV3(input){assert.equal(arguments.length,1);return build(input,null,true);}
export async function createOriginalPagedMixedSupervisorRetentionV3(input,descriptor){assert.equal(arguments.length,2);return build(input,descriptor,false,true);}
export async function openOriginalPagedMixedSupervisorRetentionV3(input){assert.equal(arguments.length,1);return build(input,null,true,true);}
function consume(token,kind,name){const original=tokens.get(token);assert.ok(original?.active()&&!original.consumed&&original.kind===kind&&original.name===name,'PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN');original.consumed=true;const value=clone(original.data);original.data=null;return value;}
export function consumeOriginalPagedRuntimeRecoveryV3(token,family){assert.equal(arguments.length,2);assert.ok(mixedFamilies.includes(family));return consume(token,'runtime',family);}
export function consumeOriginalPagedComponentRecoveryV3(token,component){assert.equal(arguments.length,2);assert.ok(mixedComponents.includes(component));return consume(token,'component',component);}
