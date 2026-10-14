/** Mechanical collection instance; no producer/runtime/service imports.
 * Original ownership lives in one fixed graph-operator composition. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,realpath,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {types,isDeepStrictEqual} from 'node:util';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
export function buildPagedSourceAccountCollectionBackendV4(contracts){
 assert.equal(arguments.length,1);assert.ok(contracts&&!types.isProxy(contracts)&&Object.getPrototypeOf(contracts)===Object.prototype);assert.deepEqual(Reflect.ownKeys(contracts).sort(),['PAGED_SOURCE_AUTHORITY_COLLECTION_RETENTION_V4', 'assertOriginalDevicePagedGraphNoteAuthorityV3', 'assertOriginalPagedDepositCatalogueV1', 'assertOriginalPagedNativeProviderV3', 'assertPagedPrivateSourceArchiveV1', 'captureOriginalDevicePagedGraphAuthorityV3', 'dispatchOriginalPagedNativeAccountContextV4', 'pauseOriginalDevicePagedApprovedContinuationV4', 'readOriginalDevicePagedGraphExecutionContextV3', 'readOriginalDevicePagedRefillBindingV4', 'readOriginalFundedPagedGraphDeploymentV3', 'registerOriginalPagedNativeRefillAccountV4', 'runOriginalPagedNativeSourceRefillV4'].sort());for(const key of Reflect.ownKeys(contracts)){assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(contracts,key),'value'));if(key!=='PAGED_SOURCE_AUTHORITY_COLLECTION_RETENTION_V4')assert.equal(typeof contracts[key],'function');}
 const {readOriginalDevicePagedGraphExecutionContextV3,assertOriginalPagedDepositCatalogueV1,assertPagedPrivateSourceArchiveV1,readOriginalFundedPagedGraphDeploymentV3,assertOriginalDevicePagedGraphNoteAuthorityV3,captureOriginalDevicePagedGraphAuthorityV3,pauseOriginalDevicePagedApprovedContinuationV4,readOriginalDevicePagedRefillBindingV4,assertOriginalPagedNativeProviderV3,registerOriginalPagedNativeRefillAccountV4,dispatchOriginalPagedNativeAccountContextV4,runOriginalPagedNativeSourceRefillV4,PAGED_SOURCE_AUTHORITY_COLLECTION_RETENTION_V4}=contracts;
const PROFILE='ORIGINAL_PAGED_SOURCE_ACCOUNT_COLLECTION_V4',owned=new WeakMap();
const copy=value=>structuredClone(value),sha=value=>createHash('sha256').update(canonical(value)).digest('hex');
function exact(value,keys){assert.ok(value&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype,'PAGED_SOURCE_COLLECTION_DATA');assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),'PAGED_SOURCE_COLLECTION_FIELDS');for(const key of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'),'PAGED_SOURCE_COLLECTION_ACCESSOR');}
async function privateDirectory(path){const stat=await lstat(path);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()&&(stat.mode&0o777)===0o700&&await realpath(path)===path,'PAGED_SOURCE_COLLECTION_PRIVATE_DIRECTORY');}
function validate(data){
 canonical(data);exact(data,['profile','principal','origin','devicePublicKey','entries','pending']);assert.equal(data.profile,PROFILE);assert.match(data.principal,/^[0-9a-f]{64}$/);
 assert.ok(Array.isArray(data.entries)&&data.entries.length>0&&data.entries.length<=256,'PAGED_SOURCE_COLLECTION_BOUND');const pairings=new Set();
 for(const [ordinal,entry]of data.entries.entries()){exact(entry,['descriptor','systemIndex','journalRelative']);assert.ok(Number.isSafeInteger(entry.systemIndex)&&entry.systemIndex>=0&&entry.systemIndex<257);assert.equal(entry.journalRelative,ordinal===0?'authority/journal.vault':`sources/source-${ordinal}/journal.vault`);assert.deepEqual(P.normalizeDevicePagedDescriptorV3(entry.descriptor),entry.descriptor,'PAGED_SOURCE_COLLECTION_DESCRIPTOR');assert.equal(entry.descriptor.origin,data.origin);assert.equal(entry.descriptor.devicePublicKey,data.devicePublicKey);assert.ok(!pairings.has(entry.descriptor.pairingId));pairings.add(entry.descriptor.pairingId);}
 if(data.pending!==null){exact(data.pending,['predecessorPairingId','ordinal','systemIndex','journalRelative']);assert.equal(data.pending.ordinal,data.entries.length);assert.equal(data.pending.predecessorPairingId,data.entries.at(-1).descriptor.pairingId);assert.ok(Number.isSafeInteger(data.pending.systemIndex)&&data.pending.systemIndex>=0&&data.pending.systemIndex<257);assert.equal(data.pending.journalRelative,`sources/source-${data.pending.ordinal}/journal.vault`);}
 assert.ok(Buffer.byteLength(canonical(data))<=768*1024,'PAGED_SOURCE_COLLECTION_RECORD_BOUND');
}

async function buildOriginalPagedSourceAccountCollectionV4(service,provider,raw,openingAccounts=null){
 assert.ok(arguments.length===3||arguments.length===4);exact(raw,['directory','password','catalogue','archive','principalSHA256']);raw={directory:raw.directory,password:raw.password,catalogue:raw.catalogue,archive:raw.archive,principalSHA256:raw.principalSHA256};
 const birth=readOriginalDevicePagedGraphExecutionContextV3(service),{runtime,system,account}=birth;
 assertOriginalPagedNativeProviderV3(provider,birth);assertOriginalPagedDepositCatalogueV1(runtime,raw.catalogue);
 assert.equal(raw.catalogue.retain().principal,raw.principalSHA256);assertPagedPrivateSourceArchiveV1(raw.archive,raw.principalSHA256,account.descriptor().genesis);
 assert.equal(resolve(raw.directory),raw.directory);await privateDirectory(raw.directory);assert.ok(typeof raw.password==='string'&&raw.password.length>=32&&raw.password.length<=4096);
 const systems=raw.catalogue.systems(),systemIndex=systems.indexOf(system);assert.ok(systemIndex>=0);
 const vault=new Vault(join(raw.directory,'source-accounts.vault'));let password=raw.password,record,candidate=null,pendingSuccessor=null,busy=false,closed=false,fenced=false,captured=null,quiescing=null;const operations=new Set();
 const accounts=openingAccounts===null?[account]:[...openingAccounts],byPairing=new Map();assert.equal(accounts[0],account);
 function installSuccessor(){
  if(!pendingSuccessor||record.data.pending!==null)return;
  const {account:successor,ordinal,entry}=pendingSuccessor;
  assert.equal(ordinal,accounts.length,'PAGED_SOURCE_COLLECTION_SUCCESSOR_ORDER');assert.deepEqual(record.data.entries[ordinal],entry,'PAGED_SOURCE_COLLECTION_SUCCESSOR_BINDING');assert.equal(record.data.entries.length,ordinal+1,'PAGED_SOURCE_COLLECTION_SUCCESSOR_COUNT');
  assertOriginalDevicePagedGraphNoteAuthorityV3(successor,runtime,raw.catalogue.systems()[entry.systemIndex]);assert.deepEqual(successor.descriptor(),entry.descriptor);
  accounts.push(successor);byPairing.set(entry.descriptor.pairingId,successor);pendingSuccessor=null;
 }
 async function current(allowFenced=false){
  assert.ok(!closed&&(allowFenced||!fenced),'PAGED_SOURCE_COLLECTION_CLOSED');await privateDirectory(raw.directory);const actual=await vault.read(password);validate(actual.data);
  // Only the exact locally proposed CAS revision may reconcile a lost write
  // acknowledgement. A foreign mutation or rollback never installs handles.
  if(candidate){
   if(isDeepStrictEqual(actual,candidate.expected)){record=actual;candidate=null;installSuccessor();}
   else{assert.deepEqual(actual,candidate.previous,'PAGED_SOURCE_COLLECTION_JOURNAL_CHANGED');candidate=null;}
  }
  assert.deepEqual(actual,record,'PAGED_SOURCE_COLLECTION_JOURNAL_CHANGED');return actual;
 }
 async function write(data){
  await current();validate(data);const previous=copy(record);candidate={previous,expected:{revision:previous.revision+1,data:copy(data)}};
  const next=await vault.update(password,previous.revision,()=>copy(data));assert.deepEqual(next,candidate.expected,'PAGED_SOURCE_COLLECTION_WRITE_RESULT');
  const readback=await vault.read(password);assert.deepEqual(readback,candidate.expected,'PAGED_SOURCE_COLLECTION_READBACK');validate(readback.data);record=readback;candidate=null;installSuccessor();
 }
 if(openingAccounts===null)record=await vault.create({profile:PROFILE,principal:raw.principalSHA256,origin:account.descriptor().origin,devicePublicKey:account.descriptor().devicePublicKey,entries:[{descriptor:account.descriptor(),systemIndex,journalRelative:'authority/journal.vault'}],pending:null},password);
 else{record=await vault.read(password);validate(record.data);assert.equal(record.data.pending,null,'PAGED_SOURCE_COLLECTION_REOPEN_UNRESOLVED');assert.equal(record.data.principal,raw.principalSHA256);assert.equal(record.data.entries.length,accounts.length,'PAGED_SOURCE_COLLECTION_ORIGINAL_REOPEN_COUNT');for(const [ordinal,actual]of accounts.entries()){const entry=record.data.entries[ordinal],actualSystem=raw.catalogue.systems()[entry.systemIndex];assertOriginalDevicePagedGraphNoteAuthorityV3(actual,runtime,actualSystem);assert.deepEqual(actual.descriptor(),entry.descriptor,'PAGED_SOURCE_COLLECTION_ORIGINAL_REOPEN_ACCOUNT');if(ordinal>0){const binding=readOriginalDevicePagedRefillBindingV4(actual,provider);assert.equal(binding.predecessorAccount,accounts[ordinal-1],'PAGED_SOURCE_COLLECTION_ORIGINAL_PREDECESSOR');assert.equal(binding.runtime,runtime);assert.equal(binding.system,actualSystem);}}}
 validate(record.data);assert.deepEqual(await vault.read(password),record);for(const actual of accounts)byPairing.set(actual.descriptor().pairingId,actual);
 const collection=Object.freeze({});
 async function refill(predecessor){
  assert.ok(!busy,'PAGED_SOURCE_COLLECTION_BUSY');busy=true;
  try{
   await current();const predecessorIndex=accounts.indexOf(predecessor);assert.ok(predecessorIndex>=0,'PAGED_SOURCE_COLLECTION_ORIGINAL_ACCOUNT');if(predecessorIndex<accounts.length-1)return accounts[predecessorIndex+1];assert.equal(accounts.at(-1),predecessor,'PAGED_SOURCE_COLLECTION_ACTIVE_ACCOUNT');assert.ok(accounts.length<256,'PAGED_SOURCE_COLLECTION_BOUND');
   let pending=record.data.pending,selected;
   if(pending===null){
    const previousSystem=readContext(predecessor).system,configuration=readOriginalFundedPagedGraphDeploymentV3(runtime,previousSystem).configuration;
    selected=await raw.catalogue.select({amountAtomic:configuration.minimumDepositAtomic,purpose:'GRAPH_SOURCE'});
    if(selected===null)selected=await raw.catalogue.rotate({amountAtomic:configuration.minimumDepositAtomic,purpose:'GRAPH_SOURCE'},configuration);
    const ordinal=accounts.length;pending={predecessorPairingId:predecessor.descriptor().pairingId,ordinal,systemIndex:raw.catalogue.systems().indexOf(selected.system),journalRelative:`sources/source-${ordinal}/journal.vault`};assert.ok(pending.systemIndex>=0);const next=copy(record.data);next.pending=pending;await write(next);
   }else selected={system:raw.catalogue.systems()[pending.systemIndex]};
   assert.ok(selected.system,'PAGED_SOURCE_COLLECTION_ORIGINAL_SYSTEM');const path=join(raw.directory,pending.journalRelative),input={origin:record.data.origin,devicePublicKey:record.data.devicePublicKey,journal:{path,password}};await mkdir(join(raw.directory,`sources/source-${pending.ordinal}`),{recursive:true,mode:0o700});await privateDirectory(join(raw.directory,`sources/source-${pending.ordinal}`));
   const successor=pendingSuccessor?.account??await runOriginalPagedNativeSourceRefillV4(provider,predecessor,raw.archive,selected.system,input,raw.principalSHA256);
   assertOriginalDevicePagedGraphNoteAuthorityV3(successor,runtime,selected.system);await registerOriginalPagedNativeRefillAccountV4(provider,successor);
   const entry={descriptor:successor.descriptor(),systemIndex:pending.systemIndex,journalRelative:pending.journalRelative};
   if(pendingSuccessor){assert.equal(pendingSuccessor.ordinal,pending.ordinal);assert.deepEqual(pendingSuccessor.entry,entry);}else pendingSuccessor={account:successor,ordinal:pending.ordinal,entry:copy(entry)};
   const next=copy(record.data);next.entries.push(entry);next.pending=null;await write(next);assert.equal(accounts.at(-1),successor);return successor;
  }finally{busy=false;}
 }
 function readContext(actual){const index=accounts.indexOf(actual);assert.ok(index>=0,'PAGED_SOURCE_COLLECTION_ORIGINAL_ACCOUNT');return {runtime,system:raw.catalogue.systems()[record.data.entries[index].systemIndex],account:actual};}
 function quiesce(){
  if(quiescing)return quiescing;quiescing=(async()=>{assert.ok(!busy&&!closed,'PAGED_SOURCE_COLLECTION_BUSY');await current();fenced=true;
  await Promise.allSettled([...operations]);
  // All original workers must stop before any provider journal is flushed.
  const results=await Promise.allSettled(accounts.map(actual=>pauseOriginalDevicePagedApprovedContinuationV4(actual)));const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
  await current(true);})();return quiescing;
 }
 owned.set(collection,{runtime,provider,accounts,byPairing,readContext,current,refill,quiesce,
  async dispatch(pairingId,method,args){
   assert.ok(!closed&&!fenced,'PAGED_SOURCE_COLLECTION_CLOSED');const operation=(async()=>{await current();assert.ok(!closed&&!fenced,'PAGED_SOURCE_COLLECTION_CLOSED');const actual=byPairing.get(pairingId);assert.ok(actual,'PAGED_SOURCE_COLLECTION_ORIGINAL_PAIRING');return dispatchOriginalPagedNativeAccountContextV4(provider,actual,method,args);})();operations.add(operation);try{return await operation;}finally{operations.delete(operation);}
  },
  async capture(){if(captured)return copy(captured);await quiesce();assert.ok(!busy&&!closed&&record.data.pending===null&&!pendingSuccessor,'PAGED_SOURCE_COLLECTION_CAPTURE_UNRESOLVED');busy=true;try{await current(true);const entries=[];for(const [ordinal,actual]of accounts.entries()){const retained=await captureOriginalDevicePagedGraphAuthorityV3(actual),row=record.data.entries[ordinal];entries.push({authority:retained,systemIndex:row.systemIndex,journalRelative:row.journalRelative});}await current(true);captured={profile:PAGED_SOURCE_AUTHORITY_COLLECTION_RETENTION_V4,entries};return copy(captured);}finally{busy=false;}},
  async close(){assert.ok(!busy,'PAGED_SOURCE_COLLECTION_BUSY');if(closed)return;fenced=true;await Promise.allSettled([...operations]);closed=true;const resources=[...accounts.slice(1),...(pendingSuccessor?[pendingSuccessor.account]:[])];const results=await Promise.allSettled([...new Set(resources)].map(actual=>actual.close()));password=null;const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;},
  status(){assert.ok(!closed);return copy({profile:PROFILE,principal:record.data.principal,entries:record.data.entries,pending:record.data.pending,revision:record.revision,dataSHA256:sha(record.data)});}});return collection;
}
function original(collection){const state=owned.get(collection);assert.ok(state,'PAGED_SOURCE_COLLECTION_ORIGINAL_HANDLE');return state;}
async function prepareOriginalPagedNextSourceAccountV4(collection,predecessor){assert.equal(arguments.length,2);return original(collection).refill(predecessor);}
function readOriginalPagedSourceAccountsV4(collection){assert.equal(arguments.length,1);return Object.freeze([...original(collection).accounts]);}
function readOriginalPagedSourceAccountCollectionV4(collection){assert.equal(arguments.length,1);return original(collection).status();}
async function dispatchOriginalPagedSourceAccountV4(collection,pairingId,method,args){assert.equal(arguments.length,4);return original(collection).dispatch(pairingId,method,args);}
async function quiesceOriginalPagedSourceAccountCollectionV4(collection){assert.equal(arguments.length,1);return original(collection).quiesce();}
async function captureOriginalPagedSourceAccountCollectionV4(collection){assert.equal(arguments.length,1);return original(collection).capture();}
async function closeOriginalPagedSourceAccountCollectionV4(collection){assert.equal(arguments.length,1);return original(collection).close();}

async function createOriginalPagedSourceAccountCollectionV4(service,provider,input){assert.equal(arguments.length,3);return buildOriginalPagedSourceAccountCollectionV4(service,provider,input);}
async function reopenOriginalPagedSourceAccountCollectionV4(service,provider,input,originalAccounts){assert.equal(arguments.length,4);assert.ok(Array.isArray(originalAccounts)&&!types.isProxy(originalAccounts)&&Object.getPrototypeOf(originalAccounts)===Array.prototype&&originalAccounts.length>0&&originalAccounts.length<=256);const properties=Object.getOwnPropertyDescriptors(originalAccounts);assert.equal(Reflect.ownKeys(properties).length,originalAccounts.length+1);for(let i=0;i<originalAccounts.length;i++)assert.ok(Object.hasOwn(properties[String(i)]??{},'value'));return buildOriginalPagedSourceAccountCollectionV4(service,provider,input,originalAccounts);}

 return Object.freeze({prepareOriginalPagedNextSourceAccountV4,readOriginalPagedSourceAccountsV4,readOriginalPagedSourceAccountCollectionV4,dispatchOriginalPagedSourceAccountV4,quiesceOriginalPagedSourceAccountCollectionV4,captureOriginalPagedSourceAccountCollectionV4,closeOriginalPagedSourceAccountCollectionV4,createOriginalPagedSourceAccountCollectionV4,reopenOriginalPagedSourceAccountCollectionV4});
}
