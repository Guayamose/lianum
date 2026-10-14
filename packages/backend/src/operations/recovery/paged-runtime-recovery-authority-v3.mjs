/** Private supervisor retention. Public records never issue runtime authority.
 * Only an authenticated, exclusively claimed captured vault issues one-use
 * opening tokens. A failed/partial opening stays visible and cannot be replayed. */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,realpath,open,unlink} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {readPrivateRuntimeRecoveryV1} from '../../chains/shared/runtime/owned-runtime-recovery-files-v1.mjs';

const PROFILE='ORIGINAL_PAGED_SUPERVISOR_RETENTION_V3',tokens=new WeakMap();
export const PAGED_SOURCE_AUTHORITY_COLLECTION_RETENTION_V4='ORIGINAL_PAGED_SOURCE_AUTHORITY_COLLECTION_V4';
export const PAGED_PUBLIC_INDEPENDENT_AUTHORITY_COLLECTION_V4='ORIGINAL_PAGED_PUBLIC_INDEPENDENT_AUTHORITY_COLLECTION_V4';
function sourceAuthorityCollection(value,descriptor){
 exact(value,['profile','entries']);assert.equal(value.profile,PAGED_SOURCE_AUTHORITY_COLLECTION_RETENTION_V4);
 assert.ok(Array.isArray(value.entries)&&value.entries.length>0&&value.entries.length<=256,'PAGED_SUPERVISOR_SOURCE_COLLECTION_BOUND');
 const pairings=new Set(),journals=new Set();
 for(const [index,entry]of value.entries.entries()){
  exact(entry,['authority','systemIndex','journalRelative']);exact(entry.authority,['profile','descriptor','identity','journalRevision','journalDataSHA256','ownerCheckpoint']);
  assert.equal(entry.authority.profile,'DEVICE_PAGED_AUTHORITY_RETAINED_V3');const current=P.normalizeDevicePagedDescriptorV3(entry.authority.descriptor);
  for(const key of ['origin','devicePublicKey','genesis','chainId','policy','assetIdentity','manifestSHA256','consumerSHA256'])assert.equal(current[key],descriptor[key],'PAGED_SUPERVISOR_SOURCE_COLLECTION_BINDING');
  assert.ok(!pairings.has(current.pairingId));pairings.add(current.pairingId);
  assert.ok(Number.isSafeInteger(entry.systemIndex)&&entry.systemIndex>=0&&entry.systemIndex<257&&!Object.is(entry.systemIndex,-0),'PAGED_SUPERVISOR_SOURCE_COLLECTION_SYSTEM');
  assert.equal(entry.journalRelative,index===0?'authority/journal.vault':`sources/source-${index}/journal.vault`,'PAGED_SUPERVISOR_SOURCE_COLLECTION_JOURNAL');
  assert.ok(!journals.has(entry.journalRelative));journals.add(entry.journalRelative);P.pagedOwnerHexV3(entry.authority.identity);P.pagedOwnerHexV3(entry.authority.journalDataSHA256);
  assert.ok(Number.isSafeInteger(entry.authority.journalRevision)&&entry.authority.journalRevision>=0&&!Object.is(entry.authority.journalRevision,-0));
 }
 assert.deepEqual(value.entries[0].authority.descriptor,descriptor,'PAGED_SUPERVISOR_AUTHORITY_DESCRIPTOR');return value;
}
function tokenConsumedTree(token){const state=tokens.get(token);return !!state?.consumed&&(!state.requiresSourceChildren||Array.isArray(state.children)&&state.children.length>0&&state.children.every(tokenConsumedTree));}
function retireTokenTree(token){const state=tokens.get(token);if(state){for(const child of state.children??[])retireTokenTree(child);state.data=null;tokens.delete(token);}}
const families=Object.freeze(['receiver','graphNative','bitcoin','solana']);
const components=Object.freeze(['deployment','authority','provider']);
const MIXED='UNISWAP_THREE_NETWORK_V3',mixedFamilies=Object.freeze([...families,'uniswap']),mixedComponents=Object.freeze([...components,'uniswap']);
const PUBLIC='PUBLIC_SEPOLIA_THREE_NETWORK_V4',publicComponents=Object.freeze([...components,'native']);
const runtimeNames=(mixed,publicSource=false)=>publicSource?[]:mixed?mixedFamilies:families,componentNames=(mixed,publicSource=false)=>publicSource?publicComponents:mixed?mixedComponents:components;
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
 const data=record.data,mixed=Object.hasOwn(data,'composition');exact(data,['profile','identity','descriptor','generation','phase','snapshot',...(mixed?['composition']:[])]);if(mixed)assert.ok([MIXED,PUBLIC].includes(data.composition),'PAGED_SUPERVISOR_COMPOSITION');
 assert.equal(data.profile,PROFILE);P.pagedOwnerHexV3(data.identity);P.normalizeDevicePagedDescriptorV3(data.descriptor);
 assert.ok(Number.isSafeInteger(data.generation)&&data.generation>=0&&data.generation<16);assert.ok(['ACTIVE','CAPTURED','OPENING'].includes(data.phase));
 assert.equal(data.snapshot===null,data.phase==='ACTIVE');
 if(data.snapshot!==null){const saved=exact(data.snapshot,['profile','snapshotSHA256','bytes','parts']);assert.equal(saved.profile,PROFILE);P.pagedOwnerHexV3(saved.snapshotSHA256);assert.ok(Number.isSafeInteger(saved.bytes)&&saved.bytes>0&&saved.bytes<=24*1024*1024);assert.ok(Array.isArray(saved.parts)&&saved.parts.length===Math.ceil(saved.bytes/(384*1024)));for(const part of saved.parts){exact(part,['name','dataSHA256']);assert.match(part.name,/^supervisor-snapshot-[0-9a-f]{32}-[0-9]{1,3}\.vault$/);P.pagedOwnerHexV3(part.dataSHA256);}}
 assert.ok(Buffer.byteLength(canonical(data))<=128*1024,'PAGED_SUPERVISOR_RECORD_BOUND');return data;
}
function validateSnapshot(saved,descriptor,mixed,publicSource=false){
 if(publicSource){validatePublicSnapshot(saved,descriptor);return;}
 exact(saved,['deployment','authority','provider','runtimes',...(mixed?['uniswap']:[])]);exact(saved.runtimes,runtimeNames(mixed));
 for(const family of runtimeNames(mixed)){const section=saved.runtimes[family];assert.ok(section&&section.family===(family==='uniswap'?'receiver':family),'PAGED_SUPERVISOR_RUNTIME_FAMILY');assert.ok(section.terminal?.ownedProcessStopped===true&&section.terminal.forced===false,'PAGED_SUPERVISOR_RUNTIME_NOT_CAPTURED');assert.ok(Number.isSafeInteger(section.processGeneration)&&section.processGeneration>=0&&section.processGeneration<16);if(family==='solana')assert.equal(section.terminal.nativeOrderlyExit,true);}
 assert.equal(new Set(runtimeNames(mixed).map(name=>saved.runtimes[name].cwd)).size,runtimeNames(mixed).length,'PAGED_SUPERVISOR_RUNTIME_ALIAS');
 if(saved.authority?.profile===PAGED_SOURCE_AUTHORITY_COLLECTION_RETENTION_V4){assert.equal(mixed,false,'PAGED_SUPERVISOR_SOURCE_COLLECTION_NATIVE_ONLY');sourceAuthorityCollection(saved.authority,descriptor);assert.equal(saved.deployment?.profile,'ORIGINAL_PAGED_DEPOSIT_CATALOGUE_RETENTION_V1','PAGED_SUPERVISOR_SOURCE_COLLECTION_CATALOGUE');assert.ok(Array.isArray(saved.deployment.systems)&&saved.deployment.systems.length>0&&saved.deployment.systems.length<257);for(const entry of saved.authority.entries)assert.ok(entry.systemIndex<saved.deployment.systems.length,'PAGED_SUPERVISOR_SOURCE_COLLECTION_SYSTEM');}
 else assert.deepEqual(saved.authority.descriptor,descriptor,'PAGED_SUPERVISOR_AUTHORITY_DESCRIPTOR');
 if(mixed){assert.ok(saved.uniswap&&Object.getPrototypeOf(saved.uniswap)===Object.prototype,'PAGED_SUPERVISOR_UNISWAP_COMPONENT');assert.equal(saved.uniswap.profile,'ORIGINAL_PAGED_UNISWAP_CONTEXT_COLD_RETENTION_V3');const pairing=saved.provider.configuration?.publicConfiguration?.uniswap;assert.ok(pairing,'PAGED_SUPERVISOR_UNISWAP_PROVIDER');assert.deepEqual(saved.uniswap.targetDescriptor,pairing.targetConnection.descriptor,'PAGED_SUPERVISOR_UNISWAP_DESCRIPTOR');}
 else assert.ok(!saved.provider.configuration?.publicConfiguration?.uniswap,'PAGED_SUPERVISOR_COMPOSITION');
}
/** PUBLIC recovery retains our journals and key ownership. It never records a
 * stopped process or claims to stop any external blockchain. Every consumer
 * independently revalidates its protected original files and canonical chain. */
function validatePublicSnapshot(saved,descriptor){
 exact(saved,['deployment','authority','provider','native',...(Object.hasOwn(saved,'sourceLocation')?['sourceLocation']:[])]);if(Object.hasOwn(saved,'sourceLocation')){exact(saved.sourceLocation,['journalPath']);const path=saved.sourceLocation.journalPath;assert.ok(typeof path==='string'&&resolve(path)===path&&path.length<4096&&!path.includes('\0'),'PAGED_SOURCE_READ_ORIGINAL_LOCATION');}
 exact(saved.deployment,['profile','system','configuration',...(Object.hasOwn(saved.deployment,'successor')?['successor']:[])]);assert.equal(saved.deployment.profile,'ORIGINAL_PAGED_SEPOLIA_DEPLOYMENT_RETENTION_V4');const system=saved.deployment.system;
 assert.equal(system.receiverProfile,'ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4');assert.equal(descriptor.chainId,'11155111','PAGED_SUPERVISOR_PUBLIC_CHAIN');
 for(const key of ['pool','state','native','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256'])assert.equal(system[key],descriptor[key],'PAGED_SUPERVISOR_PUBLIC_DEPLOYMENT_BINDING');
 if(saved.authority.profile===PAGED_PUBLIC_INDEPENDENT_AUTHORITY_COLLECTION_V4)publicIndependentAuthorityCollection(saved.authority,descriptor,saved.deployment,saved.sourceLocation??null);else validatePublicAuthority(saved.authority,descriptor);
 exact(saved.provider,['profile','directory','checkpoint','configuration']);assert.equal(saved.provider.profile,'ORIGINAL_PAGED_PROVIDER_COLD_RETENTION_V3');assert.equal(saved.provider.configuration.profile,'ORIGINAL_PAGED_PUBLIC_TESTNET_PROVIDER_V4','PAGED_SUPERVISOR_PUBLIC_PROVIDER');assert.deepEqual(saved.provider.configuration.binding.descriptor,descriptor,'PAGED_SUPERVISOR_PUBLIC_PROVIDER_BINDING');
 assert.equal(saved.native.profile,'ORIGINAL_PAGED_PUBLIC_RUNTIME_RETENTION_V4','PAGED_SUPERVISOR_PUBLIC_NATIVE');assert.ok(saved.native.checkpoint&&saved.native.keysetId===saved.native.checkpoint.keysetId,'PAGED_SUPERVISOR_PUBLIC_KEYSET');P.pagedOwnerHexV3(saved.native.keysetId);
 assert.ok(!Object.hasOwn(saved.native,'terminal')&&!Object.hasOwn(saved.native,'runtimes')&&!Object.hasOwn(saved.native,'ownedProcessStopped'),'PAGED_SUPERVISOR_PUBLIC_NO_LOCAL_CAPTURE');
 if(Object.hasOwn(saved.deployment,'successor'))validatePublicSuccessor(saved.deployment.successor,saved.deployment);
}
function validatePublicAuthority(value,descriptor){
 exact(value,['profile','descriptor','identity','journalRevision','journalDataSHA256','ownerCheckpoint']);assert.equal(value.profile,'DEVICE_PAGED_AUTHORITY_RETAINED_V3');assert.deepEqual(P.normalizeDevicePagedDescriptorV3(value.descriptor),descriptor,'PAGED_SUPERVISOR_AUTHORITY_DESCRIPTOR');P.pagedOwnerHexV3(value.identity);P.pagedOwnerHexV3(value.journalDataSHA256);assert.ok(Number.isSafeInteger(value.journalRevision)&&value.journalRevision>=0&&!Object.is(value.journalRevision,-0));
}
function publicIndependentAuthorityCollection(value,descriptor,deployment,location){
 exact(value,['profile','entries']);assert.equal(value.profile,PAGED_PUBLIC_INDEPENDENT_AUTHORITY_COLLECTION_V4);assert.ok(Array.isArray(value.entries)&&value.entries.length===2,'PAGED_SUPERVISOR_INDEPENDENT_BOUND');assert.ok(deployment.successor?.system,'PAGED_SUPERVISOR_INDEPENDENT_ORIGINAL_CHILD');
 const paths=new Set(),dirs=new Set(),keys=new Set(),pairings=new Set();
 for(const [index,entry]of value.entries.entries()){
  exact(entry,['authority','systemIndex','journalPath']);assert.equal(entry.systemIndex,index,'PAGED_SUPERVISOR_INDEPENDENT_SYSTEM');const current=P.normalizeDevicePagedDescriptorV3(entry.authority.descriptor);validatePublicAuthority(entry.authority,current);
  for(const key of ['origin','chainId','genesis','policy','assetIdentity','manifestSHA256','consumerSHA256'])assert.equal(current[key],descriptor[key],'PAGED_SUPERVISOR_INDEPENDENT_BINDING');const system=index===0?deployment.system:deployment.successor.system;
  for(const key of ['pool','state','native','scope','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','assetIdentity','policy','securityGeneration','minimumDepositAtomic'])assert.equal(current[key],system[key],'PAGED_SUPERVISOR_INDEPENDENT_DEPLOYMENT');
  assert.ok(typeof entry.journalPath==='string'&&entry.journalPath===resolve(entry.journalPath)&&entry.journalPath.length<4096&&!entry.journalPath.includes('\0'),'PAGED_SUPERVISOR_INDEPENDENT_JOURNAL');assert.ok(!paths.has(entry.journalPath)&&!dirs.has(dirname(entry.journalPath))&&!keys.has(current.devicePublicKey)&&!pairings.has(current.pairingId),'PAGED_SUPERVISOR_INDEPENDENT_ALIAS');paths.add(entry.journalPath);dirs.add(dirname(entry.journalPath));keys.add(current.devicePublicKey);pairings.add(current.pairingId);
 }
 assert.deepEqual(value.entries[0].authority.descriptor,descriptor);assert.ok(location&&location.journalPath===value.entries[0].journalPath,'PAGED_SUPERVISOR_INDEPENDENT_SOURCE_LOCATION');
}
/** Retained constructor-attempt DATA only. The original Kernel consumer must
 * recompile and validate the SAME attempt/wires before registering a child.
 * This parser issues neither a deployment nor an Authority capability. */
function validatePublicSuccessor(attempt,retained){
 exact(attempt,['profile','configuration','startNonce','planSHA256','system']);assert.equal(attempt.profile,'ORIGINAL_PAGED_SEPOLIA_SUCCESSOR_ATTEMPT_V4');P.pagedOwnerHexV3(attempt.planSHA256);
 const fields=['manifestSHA256','consumerSHA256','deploymentDomain','policy','registryEpoch','rulesRoot','attesterKeys','minimumDepositAtomic'];exact(attempt.configuration,fields);exact(retained.configuration,fields);
 const uint=value=>{assert.match(value,/^(?:0|[1-9][0-9]*)$/,'PAGED_SUPERVISOR_SUCCESSOR_UINT');const n=BigInt(value);assert.ok(n<(1n<<64n),'PAGED_SUPERVISOR_SUCCESSOR_UINT');return n;};
 for(const key of fields.filter(key=>key!=='minimumDepositAtomic'))assert.deepEqual(attempt.configuration[key],retained.configuration[key],'PAGED_SUPERVISOR_SUCCESSOR_CONFIGURATION');
 const minimum=uint(attempt.configuration.minimumDepositAtomic);assert.ok(minimum>0n&&minimum>=uint(retained.configuration.minimumDepositAtomic),'PAGED_SUPERVISOR_SUCCESSOR_MINIMUM');
 const nonce=uint(attempt.startNonce);assert.ok(nonce+2n<(1n<<64n),'PAGED_SUPERVISOR_SUCCESSOR_NONCE');const previous=retained.system;
 assert.ok(previous.prospective&&nonce>uint(previous.prospective.pool.nonce),'PAGED_SUPERVISOR_SUCCESSOR_NONCE');
 if(attempt.system===null)return;const system=attempt.system;exact(system,Object.keys(previous));
 for(const key of ['profile','securityGeneration','receiverProfile','manifestSHA256','consumerSHA256','assetIdentity','policy'])assert.deepEqual(system[key],previous[key],'PAGED_SUPERVISOR_SUCCESSOR_SYSTEM_BINDING');
 assert.equal(system.minimumDepositAtomic,attempt.configuration.minimumDepositAtomic,'PAGED_SUPERVISOR_SUCCESSOR_MINIMUM');
 assert.equal(system.manifestSHA256,attempt.configuration.manifestSHA256);assert.equal(system.consumerSHA256,attempt.configuration.consumerSHA256);assert.equal(system.policy,attempt.configuration.policy.slice(2));
 const kinds=['native','state','pool'],oldAddresses=kinds.map(key=>previous[key]),newAddresses=kinds.map(key=>system[key]);assert.equal(new Set([...oldAddresses,...newAddresses]).size,6,'PAGED_SUPERVISOR_SUCCESSOR_ADDRESS_ALIAS');for(const at of newAddresses)assert.match(at,/^0x[0-9a-f]{40}$/);
 for(const key of ['scope','domain','hubDomain','registryCommitment']){P.pagedOwnerHexV3(system[key]);assert.notEqual(system[key],previous[key],'PAGED_SUPERVISOR_SUCCESSOR_DOMAIN');}
 exact(system.registry,Object.keys(previous.registry));for(const key of Object.keys(previous.registry).filter(key=>key!=='hubDomain'))assert.deepEqual(system.registry[key],previous.registry[key],'PAGED_SUPERVISOR_SUCCESSOR_REGISTRY');assert.equal(system.registry.hubDomain,system.hubDomain);
 assert.equal(system.registry.registryEpoch,attempt.configuration.registryEpoch);assert.equal(system.registry.rulesRoot,attempt.configuration.rulesRoot.slice(2));assert.deepEqual(system.registry.keys,attempt.configuration.attesterKeys);
 exact(system.prospective,kinds);const reused=previous.deployments.filter(row=>!oldAddresses.includes(row.address));assert.ok(Array.isArray(system.deployments)&&system.deployments.length===reused.length+3,'PAGED_SUPERVISOR_SUCCESSOR_DEPLOYMENT_COUNT');assert.deepEqual(system.deployments.slice(0,reused.length),reused,'PAGED_SUPERVISOR_SUCCESSOR_REUSED_DEPLOYMENTS');
 const names={native:['contracts/wallet/PrivatePagedFundedGraphNativeStateV3.sol','PrivatePagedFundedGraphNativeStateV3'],state:['contracts/wallet/PrivatePagedFundedGraphStateV3.sol','PrivatePagedFundedGraphStateV3'],pool:['contracts/wallet/PrivatePagedFundedGraphPoolV4.sol','PrivatePagedFundedGraphPoolV4']};
 for(const [index,kind]of kinds.entries()){
  const plan=system.prospective[kind],row=system.deployments[reused.length+index];exact(plan,['address','nonce','runtimeCode']);assert.equal(plan.address,system[kind]);assert.equal(plan.nonce,(nonce+BigInt(index)).toString(),'PAGED_SUPERVISOR_SUCCESSOR_NONCE');assert.match(plan.runtimeCode,/^0x(?:[0-9a-f]{2})+$/);
  exact(row,['source','name','address','codeHash','expectedCode','nonce','receipt','constructorSHA256']);assert.deepEqual([row.source,row.name],names[kind],'PAGED_SUPERVISOR_SUCCESSOR_OWN_DEPLOYMENT');assert.equal(row.address,plan.address);assert.equal(row.nonce,plan.nonce);assert.equal(row.expectedCode,plan.runtimeCode);assert.match(row.codeHash,/^0x[0-9a-f]{64}$/);P.pagedOwnerHexV3(row.constructorSHA256);
  assert.ok(row.receipt&&row.receipt.status==='0x1'&&row.receipt.contractAddress?.toLowerCase()===row.address,'PAGED_SUPERVISOR_SUCCESSOR_RECEIPT');assert.match(row.receipt.transactionHash,/^0x[0-9a-f]{64}$/);assert.match(row.receipt.blockHash,/^0x[0-9a-f]{64}$/);assert.match(row.receipt.blockNumber,/^0x[0-9a-f]+$/);
 }
}
async function compactRuntime(section){
 const path=join(section.cwd,'wrapped-runtime-terminal.json'),file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{const before=await file.stat();assert.ok(before.isFile()&&before.nlink===1&&before.uid===process.getuid()&&(before.mode&0o777)===0o600&&before.size>0&&before.size<=64*1024*1024,'PAGED_SUPERVISOR_CAPTURE_FILE');bytes=await file.readFile();const after=await file.stat();for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(after[key],before[key],'PAGED_SUPERVISOR_CAPTURE_CHANGED');assert.equal(bytes.length,before.size);const {localCustody,...terminalSection}=section;assert.deepEqual(JSON.parse(bytes.toString('utf8')),terminalSection,'PAGED_SUPERVISOR_ORIGINAL_RUNTIME_CAPTURE');return {...(localCustody?{localCustody:clone(localCustody)}:{}),family:section.family,cwd:section.cwd,processGeneration:section.processGeneration,terminal:clone(section.terminal),genesis:section.genesis,terminalRecord:{path:'wrapped-runtime-terminal.json',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}};}finally{bytes?.fill(0);await file.close();}
}
async function storeSnapshot(directory,password,snapshot,mixed,publicSource=false){
 const value=clone(snapshot);for(const family of runtimeNames(mixed,publicSource))value.runtimes[family]=await compactRuntime(value.runtimes[family]);
 const bytes=Buffer.from(JSON.stringify(value));assert.ok(bytes.length>0&&bytes.length<=24*1024*1024,'PAGED_SUPERVISOR_SNAPSHOT_BOUND');const id=randomBytes(16).toString('hex'),parts=[];
 try{for(let offset=0;offset<bytes.length;offset+=384*1024){const ordinal=parts.length,name=`supervisor-snapshot-${id}-${ordinal}.vault`,data={profile:PROFILE,ordinal,payload:bytes.subarray(offset,offset+384*1024).toString('base64')};await new Vault(join(directory,name)).create(data,password);await physical(join(directory,name));parts.push({name,dataSHA256:sha(data)});}return {profile:PROFILE,snapshotSHA256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,parts};}finally{bytes.fill(0);}
}
async function loadSnapshot(directory,password,saved,descriptor,mixed,publicSource=false){
 const chunks=[];let joined;
 try{for(const [ordinal,part]of saved.parts.entries()){const path=join(directory,part.name);await physical(path);const row=await new Vault(path).read(password);assert.equal(row.revision,0,'PAGED_SUPERVISOR_SNAPSHOT_IMMUTABLE');exact(row.data,['profile','ordinal','payload']);assert.equal(row.data.profile,PROFILE);assert.equal(row.data.ordinal,ordinal);assert.equal(sha(row.data),part.dataSHA256,'PAGED_SUPERVISOR_SNAPSHOT_HASH');const chunk=Buffer.from(row.data.payload,'base64');assert.equal(chunk.toString('base64'),row.data.payload);assert.ok(chunk.length>0&&chunk.length<=384*1024);chunks.push(chunk);}joined=Buffer.concat(chunks);assert.equal(joined.length,saved.bytes);assert.equal(createHash('sha256').update(joined).digest('hex'),saved.snapshotSHA256,'PAGED_SUPERVISOR_SNAPSHOT_HASH');const value=JSON.parse(joined.toString('utf8'));validateSnapshot(value,descriptor,mixed,publicSource);return value;}finally{joined?.fill(0);for(const chunk of chunks)chunk.fill(0);}
}
async function claim(directory){
 const path=join(directory,'supervisor-owner.lock'),file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 const identity=randomBytes(32).toString('hex');await file.writeFile(JSON.stringify({profile:PROFILE,identity,pid:process.pid}));await file.sync();const original=await file.stat();
 let closed=false;
 return {async current(){assert.ok(!closed,'PAGED_SUPERVISOR_CLOSED');const actual=await lstat(path);for(const key of ['dev','ino','uid','mode','nlink'])assert.equal(actual[key],original[key],'PAGED_SUPERVISOR_OWNER_CHANGED');},async close(){if(closed)return;closed=true;try{const actual=await lstat(path);for(const key of ['dev','ino','uid','mode','nlink'])assert.equal(actual[key],original[key],'PAGED_SUPERVISOR_OWNER_CHANGED');await unlink(path);}finally{await file.close();}}};
}
async function build(raw,descriptor,opening,mixed=false,publicSource=false){
 assert.ok(!(mixed&&publicSource));
 const input=await location(raw),lease=await claim(input.directory),vault=new Vault(input.path);let password=input.password,record,openingSnapshot=null,closed=false,busy=false;const issued=new Set();
 async function current(){assert.ok(!closed,'PAGED_SUPERVISOR_CLOSED');await lease.current();await physical(input.path);const actual=await vault.read(password);validate(actual);assert.equal(actual.revision,record.revision,'PAGED_SUPERVISOR_REVISION');assert.equal(sha(actual.data),sha(record.data),'PAGED_SUPERVISOR_HIGHWATER');return actual;}
 async function write(data){await current();const next=await vault.update(password,record.revision,()=>clone(data));const actual=await vault.read(password);validate(actual);assert.deepEqual(actual,next,'PAGED_SUPERVISOR_READBACK');record=actual;await lease.current();return actual;}
 try{
  await physical(input.path,opening);
  if(opening){record=await vault.read(password);validate(record);assert.equal(record.data.composition??null,publicSource?PUBLIC:mixed?MIXED:null,'PAGED_SUPERVISOR_COMPOSITION');assert.equal(record.data.phase,'CAPTURED','PAGED_SUPERVISOR_NO_CAPTURED_REOPEN');openingSnapshot=await loadSnapshot(input.directory,password,record.data.snapshot,record.data.descriptor,mixed,publicSource);const next=clone(record.data);next.phase='OPENING';await write(next);}
  else{const normalized=P.normalizeDevicePagedDescriptorV3(descriptor);record=await vault.create({profile:PROFILE,identity:randomBytes(32).toString('hex'),descriptor:normalized,generation:0,phase:'ACTIVE',snapshot:null,...(publicSource?{composition:PUBLIC}:mixed?{composition:MIXED}:{})},password);validate(record);await physical(input.path);}
  const handle=Object.freeze({
   descriptor(){assert.ok(!closed);return freeze(clone(record.data.descriptor));},
   checkpoint(){assert.ok(!closed);return freeze({profile:PROFILE,identity:record.data.identity,generation:record.data.generation,revision:record.revision,dataSHA256:sha(record.data),phase:record.data.phase});},
   async readSourceLocationV4(){assert.equal(arguments.length,0);assert.ok(publicSource&&!closed&&!busy&&record.data.phase==='OPENING','PAGED_SUPERVISOR_ORIGINAL_SOURCE_LOCATION_PHASE');busy=true;try{await current();const actual=await loadSnapshot(input.directory,password,record.data.snapshot,record.data.descriptor,false,true);assert.deepEqual(actual,openingSnapshot,'PAGED_SUPERVISOR_SOURCE_LOCATION_HIGHWATER');return actual.sourceLocation?freeze(clone(actual.sourceLocation)):null;}finally{busy=false;}},
   async capture(snapshot){assert.ok(!closed&&!busy&&record.data.phase==='ACTIVE','PAGED_SUPERVISOR_CAPTURE_PHASE');busy=true;try{validateSnapshot(snapshot,record.data.descriptor,mixed,publicSource);const next=clone(record.data);next.phase='CAPTURED';next.snapshot=await storeSnapshot(input.directory,password,snapshot,mixed,publicSource);validate({data:next});await write(next);return handle.checkpoint();}finally{busy=false;}},
   async issueRuntime(family){assert.ok(runtimeNames(mixed,publicSource).includes(family));return issue('runtime',family);},
   async issueComponent(component){assert.ok(componentNames(mixed,publicSource).includes(component));return issue('component',component);},
   async complete(){assert.ok(!closed&&!busy&&record.data.phase==='OPENING','PAGED_SUPERVISOR_COMPLETE_PHASE');assert.equal(issued.size,runtimeNames(mixed,publicSource).length+componentNames(mixed,publicSource).length,'PAGED_SUPERVISOR_OPEN_COMPONENTS');assert.ok([...issued].every(tokenConsumedTree),'PAGED_SUPERVISOR_OPEN_COMPONENTS');busy=true;try{const next=clone(record.data);next.phase='ACTIVE';next.generation++;next.snapshot=null;validate({data:next});await write(next);openingSnapshot=null;return handle.checkpoint();}finally{busy=false;}},
   async close(){if(closed)return;assert.ok(!busy,'PAGED_SUPERVISOR_BUSY');closed=true;for(const token of issued)retireTokenTree(token);password=null;record=null;await lease.close();}
  });
  async function issue(kind,name){assert.ok(!closed&&!busy&&record.data.phase==='OPENING','PAGED_SUPERVISOR_OPEN_PHASE');busy=true;try{await current();assert.ok(![...issued].some(token=>tokens.get(token)?.kind===kind&&tokens.get(token)?.name===name),'PAGED_SUPERVISOR_OPEN_TOKEN_USED');const token=Object.freeze(Object.create(null));let data=kind==='runtime'?openingSnapshot.runtimes[name]:openingSnapshot[name];if(kind==='runtime'){const section=data;data=await readPrivateRuntimeRecoveryV1(section.cwd,section.terminalRecord);for(const key of ['family','cwd','processGeneration','genesis'])assert.equal(data[key],section[key],'PAGED_SUPERVISOR_RUNTIME_CAPTURE_HASH');assert.deepEqual(data.terminal,section.terminal);if(section.localCustody){assert.ok(name==='uniswap'?data.schema==='OWNED_EXTERNAL_DEFI_RECEIVER_CAPTURE_V3':['receiver','graphNative'].includes(name)&&data.schema==='OWNED_FIXED_EVM_CAPTURE_V2','PAGED_SUPERVISOR_ORIGINAL_EVM_CUSTODY');data.localCustody=clone(section.localCustody);}}tokens.set(token,{kind,name,data:clone(data),active:()=>!closed&&record.data?.phase==='OPENING',consumed:false,requiresSourceChildren:kind==='component'&&name==='authority'&&[PAGED_SOURCE_AUTHORITY_COLLECTION_RETENTION_V4,PAGED_PUBLIC_INDEPENDENT_AUTHORITY_COLLECTION_V4].includes(data?.profile),children:null,publicAuthority:publicSource&&kind==='component'&&name==='authority',journalPath:publicSource&&kind==='component'&&name==='authority'?openingSnapshot.sourceLocation?.journalPath??null:null});issued.add(token);return token;}finally{busy=false;}}
  return handle;
 }catch(error){password=null;await lease.close();throw error;}
}
export async function createOriginalPagedPublicSupervisorRetentionV4(input,descriptor){assert.equal(arguments.length,2);return build(input,descriptor,false,false,true);}
export async function openOriginalPagedPublicSupervisorRetentionV4(input){assert.equal(arguments.length,1);return build(input,null,true,false,true);}
export async function createOriginalPagedSupervisorRetentionV3(input,descriptor){assert.equal(arguments.length,2);return build(input,descriptor,false);}
export async function openOriginalPagedSupervisorRetentionV3(input){assert.equal(arguments.length,1);return build(input,null,true);}
export async function createOriginalPagedMixedSupervisorRetentionV3(input,descriptor){assert.equal(arguments.length,2);return build(input,descriptor,false,true);}
export async function openOriginalPagedMixedSupervisorRetentionV3(input){assert.equal(arguments.length,1);return build(input,null,true,true);}
function consume(token,kind,name,collection=false){const original=tokens.get(token);assert.ok(original?.active()&&!original.consumed&&original.kind===kind&&original.name===name,'PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN');assert.ok(collection||!original.requiresSourceChildren,'PAGED_SUPERVISOR_SOURCE_COLLECTION_SPLIT_REQUIRED');original.consumed=true;const value=clone(original.data);original.data=null;return value;}
export function consumeOriginalPagedRuntimeRecoveryV3(token,family){assert.equal(arguments.length,2);assert.ok(mixedFamilies.includes(family));return consume(token,'runtime',family);}
export function consumeOriginalPagedComponentRecoveryV3(token,component){assert.equal(arguments.length,2);assert.ok([...mixedComponents,'native'].includes(component));return consume(token,'component',component);}

/** Only a parent minted by the authenticated supervisor can mint these child
 * opening tokens. Public collection DATA, copies and partial opens never do. */
export function splitOriginalPagedSourceAuthorityRecoveryV4(token){
 assert.equal(arguments.length,1);const original=tokens.get(token);assert.ok(original?.requiresSourceChildren&&original.children===null&&original.data?.profile===PAGED_SOURCE_AUTHORITY_COLLECTION_RETENTION_V4,'PAGED_SUPERVISOR_ORIGINAL_SOURCE_COLLECTION_TOKEN');
 const saved=consume(token,'component','authority',true);const children=[];
 const entries=saved.entries.map(entry=>{const child=Object.freeze(Object.create(null));tokens.set(child,{kind:'component',name:'authority',data:clone(entry.authority),active:original.active,consumed:false,requiresSourceChildren:false,children:null});children.push(child);return Object.freeze({token:child,systemIndex:entry.systemIndex,journalRelative:entry.journalRelative});});
 original.children=children;return Object.freeze(entries);
}

/** Type hint from the SAME still-unconsumed private token. DATA never replaces
 * that token when the chosen original opener subsequently consumes it. */
export function readOriginalPagedComponentRecoveryProfileV4(token,name){
 assert.equal(arguments.length,2);const state=tokens.get(token);assert.ok(state?.active()&&!state.consumed&&state.kind==='component'&&state.name===name,'PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN');return typeof state.data?.profile==='string'?state.data.profile:null;
}

/** A separate original read capability. Financial opening tokens, callbacks
 * and snapshot DATA never enter this registry. CAPTURED remains CAPTURED. */
const sourceReadTokensV4=new WeakMap(),sourceReadReadersV4=new WeakMap();
export async function openOriginalPagedSourceReadRecoverySupervisorV4(raw){
 assert.equal(arguments.length,1);const input=await location(raw),ownership=await claim(input.directory),vault=new Vault(input.path);let password=input.password,closed=false,busy=false,record,snapshot;
 const issued=new Set(),readers=new Set(),pairings=new Set();
 async function current(){assert.ok(!closed,'PAGED_SOURCE_READ_SUPERVISOR_CLOSED');await ownership.current();await physical(input.path);const actual=await vault.read(password);validate(actual);assert.equal(actual.data.phase,'CAPTURED','PAGED_SOURCE_READ_CAPTURE_REQUIRED');assert.equal(actual.revision,record.revision,'PAGED_SOURCE_READ_SUPERVISOR_HIGHWATER');assert.equal(sha(actual.data),sha(record.data),'PAGED_SOURCE_READ_SUPERVISOR_HIGHWATER');const loaded=await loadSnapshot(input.directory,password,actual.data.snapshot,actual.data.descriptor,actual.data.composition===MIXED,actual.data.composition===PUBLIC);assert.deepEqual(loaded,snapshot,'PAGED_SOURCE_READ_SNAPSHOT_HIGHWATER');await ownership.current();return actual;}
 const checkpoint=()=>freeze({profile:PROFILE,identity:record.data.identity,generation:record.data.generation,revision:record.revision,dataSHA256:sha(record.data),phase:record.data.phase});
 try{
  await physical(input.path);record=await vault.read(password);validate(record);assert.equal(record.data.phase,'CAPTURED','PAGED_SOURCE_READ_CAPTURE_REQUIRED');snapshot=await loadSnapshot(input.directory,password,record.data.snapshot,record.data.descriptor,record.data.composition===MIXED,record.data.composition===PUBLIC);await current();
  const owner=Object.freeze({
   descriptor(){assert.ok(!closed);return freeze(clone(record.data.descriptor));},checkpoint(){assert.ok(!closed);return checkpoint();},
   async sourceDescriptors(){assert.equal(arguments.length,0);assert.ok(!closed&&!busy,'PAGED_SOURCE_READ_SUPERVISOR_BUSY');await current();const rows=[PAGED_SOURCE_AUTHORITY_COLLECTION_RETENTION_V4,PAGED_PUBLIC_INDEPENDENT_AUTHORITY_COLLECTION_V4].includes(snapshot.authority.profile)?snapshot.authority.entries.map(entry=>entry.authority.descriptor):[snapshot.authority.descriptor];return freeze(rows.map(descriptor=>clone(P.normalizeDevicePagedDescriptorV3(descriptor))));},
   async issueSource(pairingId){assert.equal(arguments.length,1);assert.ok(!closed&&!busy,'PAGED_SOURCE_READ_SUPERVISOR_BUSY');assert.ok(typeof pairingId==='string'&&/^[a-z0-9-]{8,100}$/.test(pairingId));assert.ok(!pairings.has(pairingId)&&pairings.size<256,'PAGED_SOURCE_READ_SOURCE_ALREADY_ISSUED');busy=true;
    try{await current();let authority,selection;
     if([PAGED_SOURCE_AUTHORITY_COLLECTION_RETENTION_V4,PAGED_PUBLIC_INDEPENDENT_AUTHORITY_COLLECTION_V4].includes(snapshot.authority.profile)){const entry=snapshot.authority.entries.find(row=>row.authority.descriptor.pairingId===pairingId);assert.ok(entry,'PAGED_SOURCE_READ_SOURCE_NOT_CAPTURED');authority=entry.authority;selection={systemIndex:entry.systemIndex,...(snapshot.authority.profile===PAGED_PUBLIC_INDEPENDENT_AUTHORITY_COLLECTION_V4?{journalPath:entry.journalPath}:{journalRelative:entry.journalRelative})};}
     else{authority=snapshot.authority;assert.equal(authority.descriptor.pairingId,pairingId,'PAGED_SOURCE_READ_SOURCE_NOT_CAPTURED');selection={systemIndex:0,journalRelative:'authority/journal.vault'};}
     exact(authority,['profile','descriptor','identity','journalRevision','journalDataSHA256','ownerCheckpoint']);assert.equal(authority.profile,'DEVICE_PAGED_AUTHORITY_RETAINED_V3');P.normalizeDevicePagedDescriptorV3(authority.descriptor);P.pagedOwnerHexV3(authority.identity);P.pagedOwnerHexV3(authority.journalDataSHA256);assert.ok(Number.isSafeInteger(authority.journalRevision)&&authority.journalRevision>=0);exact(authority.ownerCheckpoint,['profile','descriptorSHA256','revision','dataSHA256','public']);
     const data=freeze({profile:'ORIGINAL_PAGED_SUPERVISOR_SOURCE_READ_RECOVERY_V4',authority:clone(authority),supervisor:checkpoint(),selection,composition:record.data.composition??null}),token=Object.freeze(Object.create(null));const binding=record.data.composition===PUBLIC?{deployment:clone(snapshot.deployment),native:clone(snapshot.native),...(snapshot.authority.profile===PAGED_PUBLIC_INDEPENDENT_AUTHORITY_COLLECTION_V4?{sourceLocation:{journalPath:selection.journalPath}}:snapshot.sourceLocation?{sourceLocation:clone(snapshot.sourceLocation)}:{})}:null;sourceReadTokensV4.set(token,{current,data,binding,supervisorDirectory:input.directory,consumed:false,readers});issued.add(token);pairings.add(pairingId);return token;
    }finally{busy=false;}
   },
   async close(){if(closed)return;assert.equal(busy,false,'PAGED_SOURCE_READ_SUPERVISOR_BUSY');closed=true;for(const token of issued)sourceReadTokensV4.delete(token);for(const token of readers)sourceReadReadersV4.delete(token);password=null;record=null;snapshot=null;await ownership.close();}
  });return owner;
 }catch(error){password=null;record=null;snapshot=null;await ownership.close();throw error;}
}
/** One-use original token becomes a read-only source reader. Neither consumer
 * is accepted by financial consumeOriginalPagedComponentRecoveryV3. */
export async function consumeOriginalPagedSourceReadRecoveryV4(token){
 assert.equal(arguments.length,1);const original=sourceReadTokensV4.get(token);assert.ok(original&&!original.consumed,'PAGED_SOURCE_READ_ORIGINAL_TOKEN');await original.current();assert.equal(original.consumed,false,'PAGED_SOURCE_READ_ORIGINAL_TOKEN');original.consumed=true;sourceReadTokensV4.delete(token);const reader=Object.freeze(Object.create(null));sourceReadReadersV4.set(reader,{current:original.current,data:original.data,binding:original.binding,supervisorDirectory:original.supervisorDirectory});original.readers.add(reader);return reader;
}
export async function readOriginalPagedSourceReadRecoveryV4(reader){
 assert.equal(arguments.length,1);const original=sourceReadReadersV4.get(reader);assert.ok(original,'PAGED_SOURCE_READ_ORIGINAL_READER');await original.current();assert.equal(sourceReadReadersV4.get(reader),original,'PAGED_SOURCE_READ_ORIGINAL_READER');return freeze(clone(original.data));
}
export function closeOriginalPagedSourceReadRecoveryV4(reader){assert.equal(arguments.length,1);sourceReadReadersV4.delete(reader);}

/** Protected original capture for the dedicated PUBLIC readonly validator.
 * This DATA is not a live kernel/system, native key, lane or financial token. */
export async function readOriginalPagedSourceReadRecoveryBindingV4(reader){
 assert.equal(arguments.length,1);const original=sourceReadReadersV4.get(reader);assert.ok(original&&original.binding,'PAGED_SOURCE_READ_ORIGINAL_PUBLIC_BINDING');await original.current();assert.equal(sourceReadReadersV4.get(reader),original,'PAGED_SOURCE_READ_ORIGINAL_READER');return freeze(clone(original.binding));
}

/** The authenticated physical source locator was retained by its Original
 * product, independently of the supervisor directory. No inferred convention. */
export async function readOriginalPagedSourceReadRecoveryLocationV4(reader){
 assert.equal(arguments.length,1);const original=sourceReadReadersV4.get(reader);assert.ok(original&&original.binding?.sourceLocation,'PAGED_SOURCE_READ_LOCATION_NOT_RETAINED');await original.current();assert.equal(sourceReadReadersV4.get(reader),original,'PAGED_SOURCE_READ_ORIGINAL_READER');return freeze({supervisorDirectory:original.supervisorDirectory,journalPath:original.binding.sourceLocation.journalPath});
}

/** Two independent PUBLIC owners can be reopened only from the SAME captured
 * supervisor parent; complete requires consumption of both original children. */
export function splitOriginalPagedPublicIndependentAuthorityRecoveryV4(token){
 assert.equal(arguments.length,1);const original=tokens.get(token);assert.ok(original?.requiresSourceChildren&&original.children===null&&original.data?.profile===PAGED_PUBLIC_INDEPENDENT_AUTHORITY_COLLECTION_V4,'PAGED_SUPERVISOR_ORIGINAL_INDEPENDENT_COLLECTION_TOKEN');const saved=consume(token,'component','authority',true),children=[];
 const entries=saved.entries.map(entry=>{const child=Object.freeze(Object.create(null));tokens.set(child,{kind:'component',name:'authority',data:clone(entry.authority),active:original.active,consumed:false,requiresSourceChildren:false,children:null,publicAuthority:true,journalPath:entry.journalPath});children.push(child);return Object.freeze({token:child,systemIndex:entry.systemIndex,journalPath:entry.journalPath,descriptor:freeze(clone(entry.authority.descriptor))});});original.children=children;return Object.freeze(entries);
}

/** The physical PUBLIC locator belongs to the authenticated capture, before
 * its one-use token is consumed. Copied ciphertext at another path is fenced. */
export function assertOriginalPagedPublicAuthorityRecoveryLocationV4(token,path){
 assert.equal(arguments.length,2);const original=tokens.get(token);assert.ok(original?.active()&&!original.consumed&&original.kind==='component'&&original.name==='authority'&&original.publicAuthority&&!original.requiresSourceChildren,'PAGED_SUPERVISOR_ORIGINAL_PUBLIC_AUTHORITY_TOKEN');assert.ok(original.journalPath,'PAGED_SUPERVISOR_PUBLIC_LOCATION_NOT_RETAINED');assert.equal(path,original.journalPath,'PAGED_SUPERVISOR_PUBLIC_AUTHORITY_LOCATION');return true;
}
