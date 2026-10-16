/** Explicit seven-component PUBLIC Mixed recovery. Parent capabilities are
 * issued by a private, fixed Original Native3 supervisor; Mixed capabilities
 * have their own singleton. Snapshot DATA cannot enter either token registry. */
import assert from 'node:assert/strict';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {lstat,mkdir,realpath} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as F from '@lianum/mobile-protocol/device/source-note-v1';
import {claimOriginalPagedProcessFenceV4} from './paged-original-process-fence-v4.mjs';
import {createOriginalPagedPublicSupervisorRetentionV4,openOriginalPagedPublicSupervisorRetentionV4,resumeOriginalPagedPublicSupervisorOpeningV5,readOriginalPagedPublicActivationAnchorV4,readOriginalPagedPublicSupervisorParentV6,openOriginalPagedSourceReadRecoverySupervisorV4,openOriginalPagedPublicActiveRecoveryV4,readOriginalPagedPublicOpeningParentV7} from './paged-runtime-recovery-authority-v3.mjs';
const PROFILE='ORIGINAL_PUBLIC_UNISWAP_MIXED_SUPERVISOR_V4',names=Object.freeze(['deployment','target','mixedSource','flatAuthority','authority','provider','native']),tokens=new WeakMap(),activationAnchors=new WeakMap(),groupProfiles=Object.freeze({mixedSource:'ORIGINAL_PUBLIC_UNISWAP_MIXED_SOURCE_COLLECTION_V4',flatAuthority:'ORIGINAL_PUBLIC_UNISWAP_FLAT_COLLECTION_V4',authority:'ORIGINAL_PUBLIC_UNISWAP_AUTHORITY_COLLECTION_V4',provider:'ORIGINAL_PUBLIC_UNISWAP_PROVIDER_COLLECTION_V4'});
const clone=structuredClone,sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex');
function exact(v,fields){assert.ok(v&&Object.getPrototypeOf(v)===Object.prototype,'MIXED_SUP_OBJECT');assert.deepEqual(Reflect.ownKeys(v).sort(),[...fields].sort(),'MIXED_SUP_FIELDS');for(const k of fields)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'),'MIXED_SUP_GETTER');return v;}
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function integer(v){assert.ok(Number.isSafeInteger(v)&&v>=0&&!Object.is(v,-0));return v;}
function hex(v){P.pagedOwnerHexV3(v);return v;}
function path(v){assert.ok(typeof v==='string'&&v===resolve(v)&&v.length<4096&&!v.includes('\0'),'MIXED_SUP_PATH');return v;}
function parentAuthorityDescriptors(parent){return Array.isArray(parent.entries)?parent.entries.map(e=>P.normalizeDevicePagedDescriptorV3(e.authority.descriptor)):[P.normalizeDevicePagedDescriptorV3(parent.descriptor)];}
function snapshot(v,descriptor){
 exact(v,names);exact(v.target,['profile','plan','system']);assert.equal(v.target.profile,'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_TARGET_RETENTION_V4');assert.equal(v.target.plan.planSHA256,v.target.system.planSHA256);hex(v.target.system.planSHA256);
 assert.equal(v.deployment.profile,'ORIGINAL_PAGED_SEPOLIA_DEPLOYMENT_RETENTION_V4');assert.equal(v.native.profile,'ORIGINAL_PAGED_PUBLIC_RUNTIME_RETENTION_V4');assert.equal(v.native.keysetId,v.native.checkpoint.keysetId);assert.equal(v.target.plan.keysetId,v.native.keysetId);assert.equal(v.target.plan.predecessor,v.deployment.system.pool);
 exact(v.authority,['profile','parent','parentLocation','entries']);exact(v.authority.parentLocation,['journalPath']);path(v.authority.parentLocation.journalPath);exact(v.provider,['profile','parent','entries']);assert.equal(v.authority.profile,groupProfiles.authority);assert.equal(v.provider.profile,groupProfiles.provider);
 const parentDescriptors=parentAuthorityDescriptors(v.authority.parent);assert.ok(parentDescriptors.length>0&&parentDescriptors.length<=256);assert.deepEqual(parentDescriptors[0],descriptor);assert.equal(v.provider.parent.profile,'ORIGINAL_PAGED_PROVIDER_COLD_RETENTION_V3');assert.equal(v.provider.parent.configuration.profile,'ORIGINAL_PAGED_PUBLIC_TESTNET_PROVIDER_V4');assert.deepEqual(v.provider.parent.configuration.binding.descriptor,descriptor);
 for(const name of ['mixedSource','flatAuthority']){exact(v[name],['profile','entries']);assert.equal(v[name].profile,groupProfiles[name]);}
 const length=v.mixedSource.entries.length;assert.ok(length>=1&&length<=2,'MIXED_SUP_WALLET_BOUND');for(const name of ['flatAuthority','authority','provider'])assert.equal(v[name].entries.length,length,'MIXED_SUP_COLLECTION_ALIGNMENT');
 const keys=new Set(),journals=new Set(),pools=new Set([v.deployment.system.pool,v.deployment.system.state,v.deployment.system.native]);
 for(let i=0;i<length;i++){
  const source=v.mixedSource.entries[i];exact(source,['source','devicePublicKey']);exact(source.source,['profile','plan','system']);assert.equal(source.source.profile,'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_MIXED_SOURCE_RETENTION_V4');assert.equal(source.source.plan.keysetId,v.native.keysetId);assert.equal(source.source.plan.targetPlanSHA256,v.target.system.planSHA256);assert.equal(source.source.plan.predecessor,v.deployment.system.pool);
  const authority=v.authority.entries[i];exact(authority,['authority','journalPath','sourceIndex']);assert.equal(authority.sourceIndex,i);const a=P.normalizeDevicePagedDescriptorV3(authority.authority.descriptor);assert.equal(authority.authority.profile,'DEVICE_PAGED_AUTHORITY_RETAINED_V3');hex(authority.authority.identity);hex(authority.authority.journalDataSHA256);integer(authority.authority.journalRevision);path(authority.journalPath);assert.ok(!journals.has(authority.journalPath)&&!keys.has(a.devicePublicKey));journals.add(authority.journalPath);keys.add(a.devicePublicKey);assert.ok(parentDescriptors.some(d=>d.devicePublicKey===a.devicePublicKey),'MIXED_SUP_PARENT_PRINCIPAL_REQUIRED');assert.equal(source.devicePublicKey,a.devicePublicKey);
  for(const k of ['origin','chainId','genesis','assetIdentity','manifestSHA256','consumerSHA256'])assert.equal(a[k],descriptor[k],'MIXED_SUP_PARENT_BINDING');for(const k of ['pool','state','native','scope','policy','domain','hubDomain','registryCommitment','minimumDepositAtomic'])assert.equal(a[k],source.source.system[k],'MIXED_SUP_SOURCE_BINDING');for(const k of ['pool','state','native']){assert.ok(!pools.has(a[k]),'MIXED_SUP_POOL_ALIAS');pools.add(a[k]);}
  const flat=v.flatAuthority.entries[i];exact(flat,['profile','descriptor','identity','journalPath','journalRevision','journalDataSHA256','targetPlanSHA256']);assert.equal(flat.profile,'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_FLAT_AUTHORITY_RETENTION_V4');const fd=F.normalizeExternalFlatDescriptorV1(flat.descriptor);assert.equal(fd.origin,a.origin);assert.equal(fd.devicePublicKey,a.devicePublicKey);assert.equal(flat.targetPlanSHA256,v.target.system.planSHA256);hex(flat.identity);hex(flat.journalDataSHA256);integer(flat.journalRevision);path(flat.journalPath);assert.ok(!journals.has(flat.journalPath)&&dirname(flat.journalPath)!==dirname(authority.journalPath),'MIXED_SUP_FLAT_JOURNAL_ALIAS');journals.add(flat.journalPath);
  const scope=v.provider.entries[i];exact(scope,['provider','sourceIndex']);assert.equal(scope.sourceIndex,i);assert.equal(scope.provider.profile,'ORIGINAL_PAGED_PROVIDER_COLD_RETENTION_V3');assert.equal(scope.provider.configuration.profile,'ORIGINAL_PAGED_PUBLIC_MIXED_PROVIDER_V4');assert.deepEqual(scope.provider.configuration.binding.descriptor,a);const binding=scope.provider.configuration.publicConfiguration.mixedScope;assert.equal(binding.sourceDomain,a.domain);assert.equal(binding.targetPlanSHA256,v.target.system.planSHA256);assert.equal(binding.keysetId,v.native.keysetId);assert.equal(binding.parentProviderIdentity,v.provider.parent.checkpoint.providerIdentity);
 }
 return v;
}
function parentSnapshot(v){return {deployment:clone(v.deployment),authority:clone(v.authority.parent),provider:clone(v.provider.parent),native:clone(v.native),sourceLocation:clone(v.authority.parentLocation)};}
async function parentReference(directory,password,value,phase,identity){const p=join(directory,'supervisor.vault');await physical(p);const row=await new Vault(p).read(password);assert.equal(row.data.identity,identity,'MIXED_SUP_PARENT_IDENTITY');assert.equal(row.data.composition,'PUBLIC_SEPOLIA_THREE_NETWORK_V4');assert.equal(row.data.phase,phase,'MIXED_SUP_PARENT_PHASE');assert.equal(row.data.snapshot?.snapshotSHA256,sha(Buffer.from(JSON.stringify(parentSnapshot(value)))),'MIXED_SUP_PARENT_SNAPSHOT_DISCREPANCY');await physical(p);}
async function physical(p){const s=await lstat(p);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&s.nlink===1&&(s.mode&0o777)===0o600&&s.size>0&&s.size<=2*1024*1024,'MIXED_SUP_PRIVATE_FILE');}
async function store(directory,password,v){const bytes=Buffer.from(JSON.stringify(v)),parts=[],id=randomBytes(16).toString('hex');assert.ok(bytes.length>0&&bytes.length<=24*1024*1024);try{for(let offset=0;offset<bytes.length;offset+=384*1024){const ordinal=parts.length,name='mixed-snapshot-'+id+'-'+ordinal+'.vault',data={profile:PROFILE,ordinal,payload:bytes.subarray(offset,offset+384*1024).toString('base64')};await new Vault(join(directory,name)).create(data,password);await physical(join(directory,name));parts.push({name,dataSHA256:sha(data)});}return {sha256:sha(bytes),bytes:bytes.length,parts};}finally{bytes.fill(0);}}
async function load(directory,password,ref,descriptor){exact(ref,['sha256','bytes','parts']);hex(ref.sha256);assert.ok(Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&ref.bytes<=24*1024*1024&&Array.isArray(ref.parts)&&ref.parts.length===Math.ceil(ref.bytes/(384*1024)));const chunks=[];let bytes;try{for(const [ordinal,part]of ref.parts.entries()){exact(part,['name','dataSHA256']);assert.match(part.name,/^mixed-snapshot-[0-9a-f]{32}-[0-9]{1,3}\.vault$/);hex(part.dataSHA256);const p=join(directory,part.name);await physical(p);const row=await new Vault(p).read(password);assert.equal(row.revision,0);exact(row.data,['profile','ordinal','payload']);assert.equal(row.data.profile,PROFILE);assert.equal(row.data.ordinal,ordinal);assert.equal(sha(row.data),part.dataSHA256);const chunk=Buffer.from(row.data.payload,'base64');assert.equal(chunk.toString('base64'),row.data.payload);assert.ok(chunk.length>0&&chunk.length<=384*1024);chunks.push(chunk);}bytes=Buffer.concat(chunks);assert.equal(bytes.length,ref.bytes);assert.equal(sha(bytes),ref.sha256);return snapshot(JSON.parse(bytes.toString('utf8')),descriptor);}finally{bytes?.fill(0);chunks.forEach(b=>b.fill(0));}}
function tokenDone(token){const g=tokens.get(token);return !!g?.used&&(!g.children||g.children.every(tokenDone));}
function retire(token){const g=tokens.get(token);if(g){g.children?.forEach(retire);g.data=null;tokens.delete(token);}}
function consume(token,name,group=false){const g=tokens.get(token);assert.ok(g?.active()&&!g.used&&g.name===name,'MIXED_SUP_ORIGINAL_TOKEN');assert.equal(!!g.group,group,'MIXED_SUP_SPLIT_REQUIRED');g.used=true;const data=clone(g.data);g.data=null;return data;}
export function consumeOriginalPagedPublicUniswapMixedComponentV4(token,name){assert.equal(arguments.length,2);assert.ok(['target','mixedSource','flatAuthority','mixedAuthority','providerScope'].includes(name));return consume(token,name);}
/** Read only the same unconsumed opaque provider child from this opened Sup7.
 * Its authenticated birth template is configuration, never a send capability. */
export function readOriginalPagedPublicUniswapMixedProviderBirthV5(token){
 assert.equal(arguments.length,1);const g=tokens.get(token);assert.ok(g?.active()&&!g.used&&!g.group&&g.name==='providerScope','MIXED_SUP_ORIGINAL_PROVIDER_BIRTH');const saved=g.data;exact(saved,['profile','directory','checkpoint','configuration']);assert.equal(saved.profile,'ORIGINAL_PAGED_PROVIDER_COLD_RETENTION_V3');assert.equal(saved.configuration.profile,'ORIGINAL_PAGED_PUBLIC_MIXED_PROVIDER_V4');assert.equal(sha(saved.configuration),saved.checkpoint.configurationSHA256,'MIXED_SUP_ORIGINAL_PROVIDER_CONFIGURATION');return freeze(clone({configuration:saved.configuration.publicConfiguration,binding:saved.configuration.binding}));
}
export function splitOriginalPagedPublicUniswapMixedCollectionV4(token,name){assert.equal(arguments.length,2);assert.ok(['mixedSource','flatAuthority'].includes(name));const g=tokens.get(token),data=consume(token,name,true);g.children=data.entries.map(entry=>{const child=Object.freeze(Object.create(null));tokens.set(child,{name,active:g.active,data:clone(name==='mixedSource'?entry.source:entry),used:false,group:false,children:null});return child;});return Object.freeze([...g.children]);}
async function build(raw,descriptor,opening,resumeOpening=false,adoptedParent=null,recoverActive=false){
 exact(raw,['directory','password']);path(raw.directory);assert.ok(typeof raw.password==='string'&&raw.password.length>=32&&raw.password.length<=4096);const ds=await lstat(raw.directory);assert.ok(ds.isDirectory()&&!ds.isSymbolicLink()&&ds.uid===process.getuid()&&(ds.mode&0o777)===0o700&&await realpath(raw.directory)===raw.directory);const fence=await claimOriginalPagedProcessFenceV4({directory:raw.directory,purpose:'PAGED_PUBLIC_MIXED_SUPERVISOR'}),vault=new Vault(join(raw.directory,'mixed-supervisor.vault'));let password=raw.password,record,parent,retained=null,closed=false,busy=false;const issued=new Map();
 function validate(r){exact(r.data,['profile','identity','descriptor','generation','phase','snapshot','parentIdentity',...(Object.hasOwn(r.data,'parentLocationV6')?['parentLocationV6']:[]),...(Object.hasOwn(r.data,'activationBase')?['activationBase']:[])]);if(Object.hasOwn(r.data,'parentLocationV6')){exact(r.data.parentLocationV6,['directory','credential']);path(r.data.parentLocationV6.directory);assert.equal(r.data.parentLocationV6.credential,'SHARED_ROOT_PASSWORD_V6');assert.notEqual(r.data.parentLocationV6.directory,raw.directory);}if(Object.hasOwn(r.data,'activationBase')){exact(r.data.activationBase,['sha256','bytes','parts']);hex(r.data.activationBase.sha256);integer(r.data.activationBase.bytes);assert.ok(Array.isArray(r.data.activationBase.parts)&&r.data.activationBase.parts.length>0);} assert.equal(r.data.profile,PROFILE);hex(r.data.identity);hex(r.data.parentIdentity);P.normalizeDevicePagedDescriptorV3(r.data.descriptor);integer(r.data.generation);assert.ok(r.data.generation<16);assert.ok(['ACTIVE','CAPTURED','OPENING'].includes(r.data.phase));assert.equal(r.data.snapshot===null,r.data.phase==='ACTIVE');return r;}
 async function current(){assert.ok(!closed);await fence.current();await physical(vault.path??join(raw.directory,'mixed-supervisor.vault'));const r=validate(await vault.read(password));assert.deepEqual(r,record,'MIXED_SUP_HIGHWATER');return r;}
 async function write(data){await current();const r=await vault.update(password,record.revision,()=>clone(data)),readback=validate(await vault.read(password));assert.deepEqual(readback,r);record=readback;await fence.current();return r;}
 let parentDir=join(raw.directory,'native3-parent-v4'),parentPassword;
 try{
  if(recoverActive){
   assert.ok(opening&&!resumeOpening&&adoptedParent===null,'MIXED_SUP_ACTIVE_RECOVERY_MODE');record=validate(await vault.read(password));assert.equal(record.data.phase,'ACTIVE','MIXED_SUP_ACTIVE_RECOVERY_PHASE');assert.ok(record.data.activationBase,'MIXED_SUP_ACTIVE_RECOVERY_ANCHOR_REQUIRED');
   retained=await load(raw.directory,password,record.data.activationBase,record.data.descriptor);
   if(record.data.parentLocationV6){parentDir=record.data.parentLocationV6.directory;parentPassword=password;}else parentPassword=createHmac('sha256',password).update(PROFILE+'\0'+record.data.identity).digest('hex');
   const parentFile=join(parentDir,'supervisor.vault');await physical(parentFile);const anchored=await new Vault(parentFile).read(parentPassword);assert.equal(anchored.data.identity,record.data.parentIdentity);assert.ok(['ACTIVE','OPENING'].includes(anchored.data.phase),'MIXED_SUP_ACTIVE_PARENT_PHASE');assert.equal(anchored.data.activationBase?.snapshotSHA256,sha(Buffer.from(JSON.stringify(parentSnapshot(retained)))),'MIXED_SUP_ACTIVE_PARENT_ANCHOR');
   // The Original parent proves process death, private current highwaters and
   // canonical signed receipts. No caller snapshot or new contract is admitted.
   parent=await (anchored.data.phase==='ACTIVE'?openOriginalPagedPublicActiveRecoveryV4:resumeOriginalPagedPublicSupervisorOpeningV5)({directory:parentDir,password:parentPassword});const currentParent=await readOriginalPagedPublicOpeningParentV7(parent);assert.equal(currentParent.checkpoint.identity,record.data.parentIdentity);assert.deepEqual(currentParent.descriptor,record.data.descriptor);
   retained={...retained,deployment:clone(currentParent.snapshot.deployment),native:clone(currentParent.snapshot.native),authority:{...retained.authority,parent:clone(currentParent.snapshot.authority),parentLocation:clone(currentParent.snapshot.sourceLocation)},provider:{...retained.provider,parent:clone(currentParent.snapshot.provider)}};snapshot(retained,record.data.descriptor);
   const next=clone(record.data);next.phase='OPENING';next.snapshot=await store(raw.directory,password,retained);await write(next);await parentReference(parentDir,parentPassword,retained,'OPENING',record.data.parentIdentity);
  }
  else if(opening){record=validate(await vault.read(password));assert.equal(record.data.phase,resumeOpening?'OPENING':'CAPTURED','MIXED_SUP_OPENING_PHASE');retained=await load(raw.directory,password,record.data.snapshot,record.data.descriptor);if(record.data.parentLocationV6){parentDir=record.data.parentLocationV6.directory;parentPassword=password;}else parentPassword=createHmac('sha256',password).update(PROFILE+'\0'+record.data.identity).digest('hex');await parentReference(parentDir,parentPassword,retained,resumeOpening?'OPENING':'CAPTURED',record.data.parentIdentity);parent=await(resumeOpening?resumeOriginalPagedPublicSupervisorOpeningV5:openOriginalPagedPublicSupervisorRetentionV4)({directory:parentDir,password:parentPassword});await parentReference(parentDir,parentPassword,retained,'OPENING',record.data.parentIdentity);assert.equal(parent.checkpoint().identity,record.data.parentIdentity);if(!resumeOpening){const next=clone(record.data);next.phase='OPENING';await write(next);}}
  else if(adoptedParent!==null){
   assert.ok(!resumeOpening,'MIXED_SUP_ADOPTION_PHASE');const binding=await readOriginalPagedPublicSupervisorParentV6(adoptedParent);assert.deepEqual(binding.descriptor,P.normalizeDevicePagedDescriptorV3(descriptor),'MIXED_SUP_ADOPTION_DESCRIPTOR');
   parentDir=binding.directory;parentPassword=password;assert.ok(parentDir!==raw.directory&&!parentDir.startsWith(raw.directory+'/')&&!raw.directory.startsWith(parentDir+'/'),'MIXED_SUP_ADOPTION_LOCATION');
   const file=join(parentDir,'supervisor.vault');await physical(file);const retained=await new Vault(file).read(parentPassword);assert.equal(retained.data.identity,binding.checkpoint.identity);assert.equal(retained.revision,binding.checkpoint.revision);assert.equal(sha(retained.data),binding.checkpoint.dataSHA256);assert.equal(retained.data.phase,'ACTIVE');
   const identity=randomBytes(32).toString('hex');record=validate(await vault.create({profile:PROFILE,identity,descriptor:P.normalizeDevicePagedDescriptorV3(descriptor),generation:0,phase:'ACTIVE',snapshot:null,parentIdentity:binding.checkpoint.identity,parentLocationV6:{directory:parentDir,credential:'SHARED_ROOT_PASSWORD_V6'}},password));parent=adoptedParent;
  }
  else{const identity=randomBytes(32).toString('hex');parentPassword=createHmac('sha256',password).update(PROFILE+'\0'+identity).digest('hex');await mkdir(parentDir,{mode:0o700});parent=await createOriginalPagedPublicSupervisorRetentionV4({directory:parentDir,password:parentPassword},descriptor);record=validate(await vault.create({profile:PROFILE,identity,descriptor:P.normalizeDevicePagedDescriptorV3(descriptor),generation:0,phase:'ACTIVE',snapshot:null,parentIdentity:parent.checkpoint().identity},password));}
  const active=()=>!closed&&record.data.phase==='OPENING',issue=(name,data,group=false)=>{const t=Object.freeze(Object.create(null));tokens.set(t,{name,data:clone(data),group,used:false,children:null,active});issued.set(name,t);return t;};
  return Object.freeze({
   descriptor(){assert.ok(!closed);return freeze(clone(record.data.descriptor));},checkpoint(){assert.ok(!closed);return freeze({profile:PROFILE,identity:record.data.identity,generation:record.data.generation,revision:record.revision,dataSHA256:sha(record.data),phase:record.data.phase});},
   /** Durable publication only, never a Source/send/proof permission. The
    * private Parent singleton issues its own unchanged Native3 activation ACK.
    * The Mixed ACK is accepted only by a previously Original-bound service. */
   async publishActivationBaseV5(value){assert.equal(arguments.length,1);assert.ok(!closed&&!busy&&record.data.phase==='ACTIVE','MIXED_SUP_ACTIVATION_PHASE');busy=true;try{await current();snapshot(value,record.data.descriptor);const parentActivation=await parent.publishActivationBaseV4(parentSnapshot(value)),next=clone(record.data);next.activationBase=await store(raw.directory,password,value);await write(next);await readOriginalPagedPublicActivationAnchorV4(parentActivation);const mixedActivation=Object.freeze(Object.create(null)),expected={revision:record.revision,dataSHA256:sha(record.data)};activationAnchors.set(mixedActivation,{current:async()=>{await current();assert.equal(record.revision,expected.revision,'MIXED_SUP_ACTIVATION_HIGHWATER');assert.equal(sha(record.data),expected.dataSHA256,'MIXED_SUP_ACTIVATION_HIGHWATER');await readOriginalPagedPublicActivationAnchorV4(parentActivation);},data:clone(value.authority.entries.map(row=>({descriptor:row.authority.descriptor,journalPath:row.journalPath,sourceIndex:row.sourceIndex})))});return Object.freeze({parentActivation,mixedActivation});}finally{busy=false;}},
   async capture(value){assert.equal(arguments.length,1);assert.ok(!busy&&record.data.phase==='ACTIVE');busy=true;try{await current();snapshot(value,record.data.descriptor);await parent.capture(parentSnapshot(value));await parentReference(parentDir,parentPassword,value,'CAPTURED',record.data.parentIdentity);const next=clone(record.data);next.snapshot=await store(raw.directory,password,value);next.phase='CAPTURED';await write(next);}finally{busy=false;}},
   async issueComponent(name){assert.equal(arguments.length,1);assert.ok(names.includes(name)&&!busy&&active()&&!issued.has(name));busy=true;try{await current();if(['deployment','native'].includes(name)){const t=await parent.issueComponent(name);issued.set(name,t);return t;}return issue(name,retained[name],['mixedSource','flatAuthority','authority','provider'].includes(name));}finally{busy=false;}},
   async splitParentAndMixed(token,name){assert.equal(arguments.length,2);assert.ok(['authority','provider'].includes(name)&&!busy&&active()&&issued.get(name)===token);busy=true;try{await current();const g=tokens.get(token),data=consume(token,name,true),parentToken=await parent.issueComponent(name),childName=name==='authority'?'mixedAuthority':'providerScope';g.children=data.entries.map(entry=>{const child=Object.freeze(Object.create(null));tokens.set(child,{name:childName,data:clone(name==='authority'?{authority:clone(entry.authority),journalPath:entry.journalPath}:entry.provider),active,used:false,group:false,children:null});return child;});return Object.freeze({parentToken,entries:Object.freeze(data.entries.map((e,i)=>Object.freeze({sourceIndex:e.sourceIndex,token:g.children[i]})))});}finally{busy=false;}},
   async complete(){assert.equal(arguments.length,0);assert.ok(!busy&&active()&&issued.size===7);for(const name of ['target','mixedSource','flatAuthority','authority','provider'])assert.ok(tokenDone(issued.get(name)),'MIXED_SUP_CHILDREN_NOT_OPENED');busy=true;try{await current();await parentReference(parentDir,parentPassword,retained,'OPENING',record.data.parentIdentity);await parent.complete();const next=clone(record.data);next.generation++;next.phase='ACTIVE';next.snapshot=null;await write(next);retained=null;}finally{busy=false;}},
   async close(){if(closed)return;assert.ok(!busy);closed=true;for(const name of ['target','mixedSource','flatAuthority','authority','provider'])if(issued.has(name))retire(issued.get(name));await parent?.close();password=null;parentPassword=null;retained=null;record=null;await fence.close();}
  });
 }catch(error){await parent?.close().catch(()=>{});password=null;parentPassword=null;await fence.close();throw error;}
}
export async function createOriginalPagedPublicUniswapMixedSupervisorV4(input,descriptor){assert.equal(arguments.length,2);return build(input,descriptor,false);}
export async function openOriginalPagedPublicUniswapMixedSupervisorV4(input){assert.equal(arguments.length,1);return build(input,null,true);}
/** Continue the same authenticated unfinished opening, never reset to CAPTURED. */
export async function resumeOriginalPagedPublicUniswapMixedSupervisorOpeningV5(input){assert.equal(arguments.length,1);return build(input,null,true,true);}
/** Recover only the SAME published ACTIVE parent after its actual process died. */
export async function recoverOriginalPagedPublicUniswapMixedActivationV7(input){assert.equal(arguments.length,1);return build(input,null,true,false,null,true);}

/** Original, current activation publication DATA only. This reader cannot
 * issue component recovery, revive an expired Source or authorize a payment. */
export async function readOriginalPagedPublicUniswapMixedActivationV5(token){assert.equal(arguments.length,1);const a=activationAnchors.get(token);assert.ok(a,'MIXED_SUP_ORIGINAL_ACTIVATION_ACK');await a.current();return freeze(clone(a.data));}

/** Extend an actual active Native3 supervisor in place. Its identity, counters,
 * private directory and future component tokens remain owned by that parent. */
export async function adoptOriginalPagedPublicUniswapMixedSupervisorV6(input,parent){
 assert.equal(arguments.length,2);const binding=await readOriginalPagedPublicSupervisorParentV6(parent);return build(input,binding.descriptor,false,false,parent);
}
/** Protected phase inspection only. It does not claim a writer, issue a
 * component token, reopen financial permissions or extend any deadline. */
export async function readOriginalPagedPublicUniswapMixedRecoveryModeV6(raw){
 assert.equal(arguments.length,1);exact(raw,['directory','password']);path(raw.directory);const file=join(raw.directory,'mixed-supervisor.vault');await physical(file);const before=await new Vault(file).read(raw.password),data=before.data;assert.equal(data.profile,PROFILE);assert.ok(['CAPTURED','OPENING','ACTIVE'].includes(data.phase),'MIXED_SUP_INSPECTION_PHASE');P.normalizeDevicePagedDescriptorV3(data.descriptor);hex(data.identity);hex(data.parentIdentity);
 let parentDirectory=join(raw.directory,'native3-parent-v4'),parentPassword=createHmac('sha256',raw.password).update(PROFILE+'\0'+data.identity).digest('hex');
 if(data.parentLocationV6){exact(data.parentLocationV6,['directory','credential']);path(data.parentLocationV6.directory);assert.equal(data.parentLocationV6.credential,'SHARED_ROOT_PASSWORD_V6');parentDirectory=data.parentLocationV6.directory;parentPassword=raw.password;}
 if(data.phase==='CAPTURED'){const retained=await load(raw.directory,raw.password,data.snapshot,data.descriptor);await parentReference(parentDirectory,parentPassword,retained,'CAPTURED',data.parentIdentity);}
 assert.deepEqual(await new Vault(file).read(raw.password),before,'MIXED_SUP_INSPECTION_CHANGED');return freeze({profile:'ORIGINAL_PUBLIC_UNISWAP_MIXED_RECOVERY_MODE_V6',phase:data.phase,identity:data.identity,parentIdentity:data.parentIdentity,parentDirectory,descriptor:clone(data.descriptor),checkpointSHA256:sha(before),financialPermissionIssued:false});
}

// Separate read capabilities never enter the component/send token registry.
const sourceReadTokensV6=new WeakMap(),sourceReadReadersV6=new WeakMap();
export async function openOriginalPagedPublicUniswapReadRecoverySupervisorV6(raw){
 assert.equal(arguments.length,1);exact(raw,['directory','password']);path(raw.directory);
 const ds=await lstat(raw.directory);assert.ok(ds.isDirectory()&&!ds.isSymbolicLink()&&ds.uid===process.getuid()&&(ds.mode&0o777)===0o700&&await realpath(raw.directory)===raw.directory);
 const fence=await claimOriginalPagedProcessFenceV4({directory:raw.directory,purpose:'PAGED_PUBLIC_MIXED_SUPERVISOR'}),file=join(raw.directory,'mixed-supervisor.vault'),vault=new Vault(file);
 let password=raw.password,parentPassword,parent,record,retained,closed=false;
 const issued=new Set(),readers=new Set(),pairings=new Set();
 async function close(){
  if(closed)return;closed=true;
  for(const token of issued)sourceReadTokensV6.delete(token);
  for(const reader of readers)sourceReadReadersV6.delete(reader);
  try{await parent?.close();}finally{password=null;parentPassword=null;record=null;retained=null;await fence.close();}
 }
 try{
  await physical(file);record=await vault.read(password);assert.equal(record.data.profile,PROFILE);assert.equal(record.data.phase,'CAPTURED','MIXED_SOURCE_READ_CAPTURE_REQUIRED');
  retained=await load(raw.directory,password,record.data.snapshot,record.data.descriptor);
  let parentDirectory=join(raw.directory,'native3-parent-v4');parentPassword=createHmac('sha256',password).update(PROFILE+'\0'+record.data.identity).digest('hex');
  if(record.data.parentLocationV6){exact(record.data.parentLocationV6,['directory','credential']);path(record.data.parentLocationV6.directory);assert.equal(record.data.parentLocationV6.credential,'SHARED_ROOT_PASSWORD_V6');parentDirectory=record.data.parentLocationV6.directory;parentPassword=password;}
  await parentReference(parentDirectory,parentPassword,retained,'CAPTURED',record.data.parentIdentity);
  parent=await openOriginalPagedSourceReadRecoverySupervisorV4({directory:parentDirectory,password:parentPassword});
  const checkpoint=()=>freeze({profile:PROFILE,identity:record.data.identity,generation:record.data.generation,revision:record.revision,dataSHA256:sha(record.data),phase:'CAPTURED'});
  async function current(){
   assert.ok(!closed,'MIXED_SOURCE_READ_CLOSED');await fence.current();await physical(file);assert.deepEqual(await vault.read(password),record,'MIXED_SOURCE_READ_HIGHWATER');
   assert.deepEqual(await load(raw.directory,password,record.data.snapshot,record.data.descriptor),retained,'MIXED_SOURCE_READ_SNAPSHOT_HIGHWATER');
   await parentReference(parentDirectory,parentPassword,retained,'CAPTURED',record.data.parentIdentity);await parent.sourceDescriptors();await fence.current();
  }
  await current();
  return Object.freeze({
   parent,
   async sourceDescriptors(){assert.equal(arguments.length,0);await current();return freeze(retained.authority.entries.map(entry=>clone(entry.authority.descriptor)));},
   async issueSource(pairingId){
    assert.equal(arguments.length,1);await current();assert.ok(!pairings.has(pairingId),'MIXED_SOURCE_READ_ALREADY_ISSUED');
    const entry=retained.authority.entries.find(entry=>entry.authority.descriptor.pairingId===pairingId);assert.ok(entry,'MIXED_SOURCE_READ_NOT_CAPTURED');
    const token=Object.freeze(Object.create(null)),data=freeze({profile:'ORIGINAL_PAGED_SUPERVISOR_SOURCE_READ_RECOVERY_V4',authority:clone(entry.authority),supervisor:checkpoint(),selection:{systemIndex:entry.sourceIndex},composition:'PUBLIC_SEPOLIA_UNISWAP_MIXED_V6'});
    const binding=freeze({deployment:clone(retained.deployment),native:clone(retained.native),sourceLocation:{journalPath:entry.journalPath},uniswap:{target:clone(retained.target),source:clone(retained.mixedSource.entries[entry.sourceIndex].source)}});
    sourceReadTokensV6.set(token,{current,data,binding,location:{supervisorDirectory:raw.directory,journalPath:entry.journalPath},readers});issued.add(token);pairings.add(pairingId);return token;
   },close,
  });
 }catch(error){await close();throw error;}
}
export function isOriginalPagedPublicUniswapSourceReadTokenV6(token){return sourceReadTokensV6.has(token);}
export function isOriginalPagedPublicUniswapSourceReadReaderV6(reader){return sourceReadReadersV6.has(reader);}
export async function consumeOriginalPagedPublicUniswapSourceReadV6(token){
 assert.equal(arguments.length,1);const state=sourceReadTokensV6.get(token);assert.ok(state,'MIXED_SOURCE_READ_ORIGINAL_TOKEN');await state.current();assert.strictEqual(sourceReadTokensV6.get(token),state,'MIXED_SOURCE_READ_CONSUMED');sourceReadTokensV6.delete(token);
 const reader=Object.freeze(Object.create(null));sourceReadReadersV6.set(reader,state);state.readers.add(reader);return reader;
}
async function readSourceV6(reader,field){const state=sourceReadReadersV6.get(reader);assert.ok(state,'MIXED_SOURCE_READ_ORIGINAL_READER');await state.current();assert.strictEqual(sourceReadReadersV6.get(reader),state,'MIXED_SOURCE_READ_CLOSED');return freeze(clone(state[field]));}
export async function readOriginalPagedPublicUniswapSourceReadV6(reader){assert.equal(arguments.length,1);return readSourceV6(reader,'data');}
export async function readOriginalPagedPublicUniswapSourceReadBindingV6(reader){assert.equal(arguments.length,1);return readSourceV6(reader,'binding');}
export async function readOriginalPagedPublicUniswapSourceReadLocationV6(reader){assert.equal(arguments.length,1);return readSourceV6(reader,'location');}
export function closeOriginalPagedPublicUniswapSourceReadV6(reader){assert.equal(arguments.length,1);sourceReadReadersV6.delete(reader);}
