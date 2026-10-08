/** Private fixed-attempt recovery authority. This is encrypted retention and
 * exclusive reopen admission, never evidence that a native component reopened.
 * No credentials, records or signed wires belong in public result/export files.
 */
import assert from 'node:assert/strict';
import { randomBytes, createHash, createHmac } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, realpath, mkdir, open, unlink, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exactRecord } from '../../../execution/encoding/commitments.mjs';
import { canonicalClaimRecordDataV1 } from '../../storage/segmented-record-store.mjs';
import { LOCAL_EVM_PROFILE } from '../../../../../engine/src/execution/local/local-evm.mjs';
import { assertStoppedNativeFilesV1 } from '../../../chains/shared/runtime/owned-runtime-recovery-files-v1.mjs';
import { createClaimRecordStore, openClaimRecordStore, observeClaimRecordStoreV1 } from '../../storage/segmented-record-store.mjs';

const EXTERNAL_LINEAGE_PROFILE='EXTERNAL_DEFI_CAPTURE_LINEAGE_V1';
const EXTERNAL_PARTIAL_PROFILE='EXTERNAL_DEFI_BOOTSTRAP_PARTIAL_SUCCESSOR_V1';
const EXTERNAL_REPAIR_PROFILE='EXTERNAL_DEFI_PREOPEN_REPAIR_AUTHORITY_V1';
const reopenDeadline=identity=>identity.profile===EXTERNAL_PARTIAL_PROFILE?identity.restoration.permit.deadlineMs:identity.profile===EXTERNAL_REPAIR_PROFILE?identity.repair.permitDeadlineMs:identity.deadlineMs;
const EXTERNAL_PROFILE='EXTERNAL_DEFI_PRIVATE_RECOVERY_AUTHORITY_V1',EXTERNAL_FUNDED_PROFILE='EXTERNAL_DEFI_FUNDED_PRIVATE_RECOVERY_AUTHORITY_V1';
const externalIdentity=identity=>[EXTERNAL_PROFILE,EXTERNAL_FUNDED_PROFILE,EXTERNAL_REPAIR_PROFILE,EXTERNAL_PARTIAL_PROFILE,EXTERNAL_LINEAGE_PROFILE].includes(identity.profile);
const NATIVE_D26_PROFILE='NATIVE_DEVICE_D26_OBSERVATION_RECOVERY_V1';
const NATIVE_PROVIDER_PROFILE='NATIVE_PROVIDER_ECONOMIC_RECOVERY_V1';
const NATIVE_ECONOMIC_PROFILE='NATIVE_VALUE_ECONOMIC_RECOVERY_V1';
const NATIVE_ECONOMIC_SECTIONS=Object.freeze(['receiver','graphNative','bootstrap','system','provider','owner','executor','account','session','actor']);
const PROFILE='WRAPPED_FIXED_PRIVATE_RECOVERY_AUTHORITY_V1';
const FUNDED_PROFILE='WRAPPED_FIXED_FUNDED_PRIVATE_RECOVERY_AUTHORITY_V1';
const TRON_PROFILE='WRAPPED_FIXED_TRON_PRIVATE_RECOVERY_AUTHORITY_V1',FUNDED_TRON_PROFILE='WRAPPED_FIXED_FUNDED_TRON_PRIVATE_RECOVERY_AUTHORITY_V1';
const fundedIdentity=identity=>[FUNDED_PROFILE,FUNDED_TRON_PROFILE,EXTERNAL_FUNDED_PROFILE].includes(identity.profile);
const tronIdentity=identity=>[TRON_PROFILE,FUNDED_TRON_PROFILE].includes(identity.profile);
const FIXED_WALLET_ROOT=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const RUNTIMES=Object.freeze(['bitcoin','solana','receiver','graphNative']);
const ALL_RUNTIMES=Object.freeze([...RUNTIMES,'graphNativeTron']);
const SECTIONS=Object.freeze([...RUNTIMES,'system','owners','keeper','fixture','privateLifetime']);
const sectionsFor=identity=>identity.profile===NATIVE_ECONOMIC_PROFILE?[...NATIVE_ECONOMIC_SECTIONS]:identity.profile===NATIVE_PROVIDER_PROFILE?['provider']:identity.profile===NATIVE_D26_PROFILE?['deviceD26','receiver']:externalIdentity(identity)?['receiver','privateLifetime','system','owners','wallet']:[...SECTIONS,...(tronIdentity(identity)?['graphNativeTron']:[]),...(fundedIdentity(identity)?['wallet']:[])];
const authorities=new WeakMap(),writes=new WeakMap(),reads=new WeakMap(),capturedRuntimeOwners=new WeakMap(),nativeAbortTokens=new WeakMap();
const clone=value=>structuredClone(value);
const normalized=value=>JSON.parse(JSON.stringify(value));
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
function opaque(){return Object.freeze(Object.create(null));}
function identityOf(input,funded=false,withTron=false,external=false){
 exactRecord(input,['directory','runId','sourceSHA256','deadlineMs']);
 assert.equal(resolve(input.directory),input.directory,'WRAPPED_RECOVERY_CANONICAL_DIRECTORY');
 assert.match(input.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(input.directory,join(FIXED_WALLET_ROOT,external?'.local/external-defi-owner-cycle-v1':'.local/wrapped-wallet-fixed-acceptance-v1','attempt-'+input.runId,'private-audit'),'WRAPPED_RECOVERY_FIXED_ATTEMPT');
 assert.ok(hex(input.sourceSHA256),'WRAPPED_RECOVERY_SOURCE_IDENTITY');
 assert.ok(Number.isSafeInteger(input.deadlineMs)&&input.deadlineMs>0,'WRAPPED_RECOVERY_ORIGINAL_DEADLINE');
 return {profile:external?(funded?EXTERNAL_FUNDED_PROFILE:EXTERNAL_PROFILE):withTron?(funded?FUNDED_TRON_PROFILE:TRON_PROFILE):(funded?FUNDED_PROFILE:PROFILE),...input};
}
async function privateDirectory(path){const st=await lstat(path);assert.ok(st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o777)===0o700,'WRAPPED_RECOVERY_PRIVATE_DIRECTORY');assert.equal(await realpath(path),path,'WRAPPED_RECOVERY_DIRECTORY_ALIAS');}
async function syncDirectory(path){const fd=await open(path,'r');try{await fd.sync();}finally{await fd.close();}}
async function originalProcess(){const raw=await readFile('/proc/self/stat','utf8'),tail=raw.slice(raw.lastIndexOf(')')+2).split(' ');assert.match(tail[19],/^[0-9]+$/);return {pid:process.pid,startTicks:tail[19]};}
async function privateRead(path,maximum){
 const st=await lstat(path);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&(st.mode&0o777)===0o600&&st.size<=maximum,'WRAPPED_RECOVERY_PRIVATE_FILE');
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const current=await fd.stat();assert.equal(current.ino,st.ino);assert.equal(current.dev,st.dev);const data=await fd.readFile();assert.equal(data.length,st.size);return data;}finally{await fd.close();}
}
async function exclusiveWrite(path,bytes){const fd=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await fd.writeFile(bytes);await fd.sync();assert.equal((await fd.stat()).mode&0o777,0o600);}finally{await fd.close();}}
async function acquireLease(directory,identity){
 const path=join(directory,'authority.active'),raw=Buffer.from(JSON.stringify({profile:PROFILE,runId:identity.runId,pid:process.pid,nonce:randomBytes(32).toString('hex')})+'\n');
 const fd=await open(path,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await fd.writeFile(raw);await fd.sync();await syncDirectory(directory);}catch(error){await fd.close();throw error;}
 const before=await fd.stat();let released=false;
 return async()=>{assert.equal(released,false,'WRAPPED_RECOVERY_LEASE_ALREADY_RELEASED');const after=await lstat(path);assert.equal(after.ino,before.ino,'WRAPPED_RECOVERY_LEASE_REPLACED');assert.equal(after.dev,before.dev);assert.deepEqual(await privateRead(path,1024),raw,'WRAPPED_RECOVERY_LEASE_CHANGED');await unlink(path);await syncDirectory(directory);released=true;await fd.close();};
}
function state(authority){const s=authorities.get(authority);assert.ok(s&&!s.closed&&!s.busy&&!s.operation&&!s.fault&&!s.finalization,'WRAPPED_RECOVERY_ORIGINAL_IDLE_AUTHORITY');return s;}
function checkpoint(record){return Object.freeze({revision:record.revision,commitment:record.commitment});}
function validateRecord(record,identity){
 exactRecord(record.data,['profile','identity','capturedProcess','phase','sections']);assert.equal(record.data.profile,identity.profile);assert.deepEqual(record.data.identity,identity,'WRAPPED_RECOVERY_ORIGINAL_IDENTITY');
 exactRecord(record.data.capturedProcess,['pid','startTicks']);assert.ok(Number.isSafeInteger(record.data.capturedProcess.pid)&&record.data.capturedProcess.pid>0);assert.match(record.data.capturedProcess.startTicks,/^[0-9]+$/);
 assert.ok(['CAPTURING','CAPTURED','REOPENING'].includes(record.data.phase));exactRecord(record.data.sections,sectionsFor(identity));
 for(const [name,row]of Object.entries(record.data.sections)){if(row===null)continue;exactRecord(row,['state','data','claim']);assert.ok(['RETAINED','CAPTURED','OPENING','OPENED'].includes(row.state));assert.ok(row.data&&typeof row.data==='object');if(['RETAINED','CAPTURED'].includes(row.state))assert.equal(row.claim,null);else{exactRecord(row.claim,['processId','nonce']);assert.ok(Number.isSafeInteger(row.claim.processId)&&row.claim.processId>0);assert.ok(hex(row.claim.nonce));}}
}
async function mutate(s,transform,expectedCheckpoint){assert.equal(s.busy,false,'WRAPPED_RECOVERY_BUSY');s.busy=true;try{const old=normalized(await s.store.read());validateRecord(old,s.identity);if(expectedCheckpoint)assert.equal(finalizationHash(checkpoint(old)),finalizationHash(expectedCheckpoint),'WRAPPED_RECOVERY_FINALIZATION_PRIOR_CHANGED');const next=normalized(await s.store.update(old.revision,transform));validateRecord(next,s.identity);s.record=next;return checkpoint(next);}catch(error){s.fault=true;throw error;}finally{s.busy=false;}}

async function authorityFactory(input,expected,creating,funded=false,withTron=false,external=false,nativeD26=false,nativeProvider=false,nativeEconomic=false,nativeEconomicNotes=false){
 const identity=nativeEconomic?nativeEconomicIdentity(input,nativeEconomicNotes):nativeProvider?nativeProviderIdentity(input):nativeD26?nativeD26Identity(input):identityOf(input,funded,withTron,external),sections=sectionsFor(identity);await privateDirectory(identity.directory);const directory=join(identity.directory,identity.profile===NATIVE_ECONOMIC_PROFILE?'native-value-economic':identity.profile===NATIVE_PROVIDER_PROFILE?'native-provider-economic':identity.profile===NATIVE_D26_PROFILE?'device-d26-observation':fundedIdentity(identity)?(tronIdentity(identity)?'funded-tron-recovery':'funded-recovery'):(tronIdentity(identity)?'tron-recovery':'recovery'));
 if(creating){await mkdir(directory,{mode:0o700});await syncDirectory(identity.directory);}await privateDirectory(directory);
 const release=await acquireLease(directory,identity);let store,password;
 try{
  if(!creating)await assertNoCaptureChild(directory);
  const keyPath=join(directory,'synthetic-local-root.secret');
  if(creating){const secret=randomBytes(32);try{await exclusiveWrite(keyPath,secret);await syncDirectory(directory);}finally{secret.fill(0);}}
  const secret=await privateRead(keyPath,32);try{assert.equal(secret.length,32);password=secret.toString('hex');}finally{secret.fill(0);}
  const options={path:join(directory,'authority.vault'),password,identity};
  const currentProcess=await originalProcess();
  store=creating?await createClaimRecordStore(options,{profile:identity.profile,identity,capturedProcess:currentProcess,phase:'CAPTURING',sections:Object.fromEntries(sections.map(name=>[name,null]))}):await openClaimRecordStore(options);
  password=undefined;const record=normalized(await store.read());validateRecord(record,identity);
  if(!creating){exactRecord(expected,['revision','commitment']);assert.deepEqual(checkpoint(record),expected,'WRAPPED_RECOVERY_CHECKPOINT_CHANGED');assert.equal(record.data.phase,'CAPTURED','WRAPPED_RECOVERY_CAPTURE_NOT_COMPLETE');assert.ok(sections.every(name=>record.data.sections[name]?.state==='CAPTURED'),'WRAPPED_RECOVERY_ALREADY_CLAIMED');assert.notDeepEqual(record.data.capturedProcess,currentProcess,'WRAPPED_RECOVERY_NEW_PROCESS_REQUIRED');}
  const authority=opaque(),s={directory,identity,store,record,release,busy:false,operation:null,closed:false,fault:false,creating};authorities.set(authority,s);return authority;
 }catch(error){password=undefined;try{store?.close();}finally{await release();}throw error;}
}
export function createWrappedRecoveryAuthorityV1(input){assert.equal(arguments.length,1);return authorityFactory(input,null,true);}
export function openWrappedRecoveryAuthorityV1(input,expectedCheckpoint){assert.equal(arguments.length,2);return authorityFactory(input,expectedCheckpoint,false);}
export function createWrappedFundedRecoveryAuthorityV1(input){assert.equal(arguments.length,1);return authorityFactory(input,null,true,true);}
export function openWrappedFundedRecoveryAuthorityV1(input,expectedCheckpoint){assert.equal(arguments.length,2);return authorityFactory(input,expectedCheckpoint,false,true);}
export function createWrappedTronRecoveryAuthorityV1(input){assert.equal(arguments.length,1);return authorityFactory(input,null,true,false,true);}
export function openWrappedTronRecoveryAuthorityV1(input,expected){assert.equal(arguments.length,2);return authorityFactory(input,expected,false,false,true);}
export function createWrappedFundedTronRecoveryAuthorityV1(input){assert.equal(arguments.length,1);return authorityFactory(input,null,true,true,true);}
export function openWrappedFundedTronRecoveryAuthorityV1(input,expected){assert.equal(arguments.length,2);return authorityFactory(input,expected,false,true,true);}
export function wrappedRecoveryAuthorityStatusV1(authority){assert.equal(arguments.length,1);const s=authorities.get(authority);assert.ok(s&&!s.closed,'WRAPPED_RECOVERY_ORIGINAL_AUTHORITY');return Object.freeze({profile:s.identity.profile,runId:s.identity.runId,sourceSHA256:s.identity.sourceSHA256,deadlineMs:s.identity.deadlineMs,checkpoint:checkpoint(s.record),phase:s.record.data.phase,operationInProgress:s.operation!==null,uncertain:s.fault,sections:Object.freeze(Object.fromEntries(sectionsFor(s.identity).map(name=>[name,s.record.data.sections[name]?.state??'ABSENT']))),scope:s.identity.profile===NATIVE_ECONOMIC_PROFILE?'ORIGINAL_NATIVE_VALUE_ECONOMIC_REOPEN_V1':s.identity.profile===NATIVE_PROVIDER_PROFILE?'ORIGINAL_NATIVE_PROVIDER_REOPEN_V1':s.identity.profile===NATIVE_D26_PROFILE?'ORIGINAL_DEVICE_D26_OBSERVE_ONLY_V1':s.identity.profile===EXTERNAL_LINEAGE_PROFILE?'RESTORE_ONLY_ORIGINAL_ACTOR_LINEAGE_V1':fundedIdentity(s.identity)?'ORDERED_FUNDED_ORIGINAL_REOPEN_V1':'ORDERED_PRE_PRINCIPAL_ORIGINAL_REOPEN_V1',nativeRecoveryEstablished:false,fundedEffectRecoveryEstablished:false});}

// The only section writer accepts an ephemeral capability delivered directly
// to a fixed original producer. The attempt handle is not a section writer.
export async function retainOriginalWrappedRecoverySectionV1(token,section,data){
 assert.equal(arguments.length,3);const w=writes.get(token);assert.ok(w&&w.section===section&&!w.used&&w.s.operation===token,'WRAPPED_RECOVERY_ORIGINAL_CAPTURE_TOKEN');w.used=true;
 await mutate(w.s,old=>{assert.equal(old.phase,'CAPTURING');assert.equal(old.sections[section],null,'WRAPPED_RECOVERY_CAPTURE_ONCE');old.sections[section]={state:'RETAINED',data,claim:null};return old;});
}
async function fixedCapture(authority,section,produce){
 const s=state(authority);assert.ok(sectionsFor(s.identity).includes(section));assert.equal(s.record.data.phase,'CAPTURING');assert.equal(s.record.data.sections[section],null);const token=opaque(),entry={s,section,used:false};writes.set(token,entry);s.operation=token;
 try{const result=await produce(token);assert.equal(entry.used,true,'WRAPPED_RECOVERY_PRODUCER_DID_NOT_RETAIN');assert.deepEqual(result,{retained:true,originalResourcesStopped:true},'WRAPPED_RECOVERY_ORIGINAL_STOP_NOT_CONFIRMED');await mutate(s,old=>{assert.equal(old.sections[section]?.state,'RETAINED');old.sections[section].state='CAPTURED';return old;});}
 catch(error){s.fault=true;throw error;}finally{writes.delete(token);s.operation=null;}
 return wrappedRecoveryAuthorityStatusV1(authority);
}
export async function retainWrappedRuntimeRecoveryV1(authority,family,runtime){
 assert.equal(arguments.length,3);assert.ok(ALL_RUNTIMES.includes(family));assert.notEqual(state(authority).identity.profile,NATIVE_ECONOMIC_PROFILE,'NATIVE_ECONOMIC_DISTINCT_RUNTIME_CAPTURE');assert.ok(sectionsFor(state(authority).identity).includes(family),'WRAPPED_RECOVERY_RUNTIME_PROFILE_REQUIRED');assert.ok(runtime && typeof runtime==='object');assert.equal(capturedRuntimeOwners.has(runtime),false,'WRAPPED_RECOVERY_RUNTIME_ALREADY_ASSIGNED');capturedRuntimeOwners.set(runtime,authority);return fixedCapture(authority,family,async token=>{
  let data;if(family==='bitcoin'){const m=await import('../../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs');data=await m.captureOwnedBitcoinRecoveryV1(runtime);}
  else if(family==='solana'){const m=await import('../../../chains/solana/runtime/owned-solana-runtime.mjs');data=await m.captureOwnedSolanaRecoveryV1(runtime);}
  else if(family==='graphNativeTron'){const m=await import('../../../chains/tron/runtime/owned-tron-native-value-runtime.mjs');data=await m.captureOwnedTronRecoveryV1(runtime);}
  else{const m=await import('../../../chains/evm/runtime/owned-evm-v2-runtime.mjs');data=await m.captureOwnedEvmRecoveryV1(runtime);}
  assert.equal(data.family,family,'WRAPPED_RECOVERY_CAPTURE_FAMILY');assert.equal(data.terminal?.ownedProcessStopped,true,'WRAPPED_RECOVERY_NATIVE_STOP_REQUIRED');assert.equal(data.terminal.forced,false,'WRAPPED_RECOVERY_FORCED_STOP_UNCERTAIN');await retainOriginalWrappedRecoverySectionV1(token,family,data);return {retained:true,originalResourcesStopped:true};
 });
}
export async function retainWrappedSystemRecoveryV1(authority,input){
 assert.equal(arguments.length,2);exactRecord(input,['runtime','system','bootstrap','custodyBootstrap']);return fixedCapture(authority,'system',async token=>{const m=await import('../../../../../../tests/integration/wallet/wrapped/flows/wrapped-wallet-acceptance-v1.mjs');return m.retainWrappedWalletSystemForReopenV1({...input,attemptAuthority:token});});
}
export async function retainWrappedOwnersRecoveryV1(authority,input){
 assert.equal(arguments.length,2);exactRecord(input,['owners']);return fixedCapture(authority,'owners',async token=>{const m=await import('../../../../../custody/src/processes/wrapped-claim-owner-process-v1.mjs');return m.retainWrappedClaimOwnersForReopenV1({...input,attemptAuthority:token});});
}
export async function retainWrappedKeeperRecoveryV1(authority,keeper){
 assert.equal(arguments.length,2);return fixedCapture(authority,'keeper',async token=>{const m=await import('../controller/wrapped-controller-journal-v1.mjs');return m.retainWrappedKeeperForReopenV1(keeper,token);});
}
export async function retainWrappedPrivateLifetimeRecoveryV1(authority,runtime){assert.equal(arguments.length,2);return fixedCapture(authority,'privateLifetime',async token=>{const m=await import('./wrapped-private-lifetime-registry-v1.mjs');return m.retainWrappedPrivateLifetimeRegistryForReopenV1(runtime,token);});}
export async function retainWrappedFixtureRecoveryV1(authority,fixture){
 assert.equal(arguments.length,2);return fixedCapture(authority,'fixture',async token=>{const m=await import('../../../../../../tests/integration/fixtures/wallet/wrapped/flows/wrapped-wallet-fixed-fixture-v1.mjs');return m.retainWrappedFixtureContextForReopenV1(fixture,token);});
}
export async function retainWrappedWalletRecoveryV1(authority,wallet){
 assert.equal(arguments.length,2);assert.ok(fundedIdentity(state(authority).identity),'WRAPPED_RECOVERY_FUNDED_AUTHORITY_REQUIRED');
 return fixedCapture(authority,'wallet',async token=>{const m=await import('../../../../../../tests/integration/wallet/wrapped/flows/wrapped-wallet-acceptance-v1.mjs');return m.retainWrappedWalletForReopenV1(wallet,token);});
}
// Finalization intents are private publication anchors, never reopening tokens.
const FINALIZATION_SCHEMA='WRAPPED_RECOVERY_FINALIZATION_INTENT_V1';
function canonicalFinalization(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonicalFinalization).join(',')+']';return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalFinalization(value[key])).join(',')+'}';}
const finalizationHash=value=>createHash('sha256').update(canonicalFinalization(value)).digest('hex');
const bytesHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const finalizationBytes=value=>Buffer.from(canonicalFinalization(value)+'\n');
function finalizationDirectory(identity){if(identity.profile===EXTERNAL_LINEAGE_PROFILE){validateLineageIdentity(identity);return join(identity.directory,'recovery','capture-lineage-'+identity.lineage.generation);}return join(identity.directory,fundedIdentity(identity)?(tronIdentity(identity)?'funded-tron-recovery':'funded-recovery'):(tronIdentity(identity)?'tron-recovery':'recovery'));}
function finalizationIdentity(input,receipt){
 assert.ok(receipt&&[PROFILE,FUNDED_PROFILE,TRON_PROFILE,FUNDED_TRON_PROFILE,EXTERNAL_PROFILE,EXTERNAL_FUNDED_PROFILE,EXTERNAL_LINEAGE_PROFILE].includes(receipt.identity?.profile),'WRAPPED_RECOVERY_FINALIZATION_PROFILE');
 const identity=receipt.identity?.profile===EXTERNAL_LINEAGE_PROFILE?validateLineageIdentity(receipt.identity,input):identityOf(input,fundedIdentity(receipt.identity),tronIdentity(receipt.identity),externalIdentity(receipt.identity));
 exactRecord(receipt,['schema','identity','nonce','priorCheckpoint','targetRevision','targetRecordSHA256','storeHeaderSHA256','capturedProcess']);
 assert.equal(receipt.schema,FINALIZATION_SCHEMA);assert.equal(finalizationHash(receipt.identity),finalizationHash(identity),'WRAPPED_RECOVERY_FINALIZATION_IDENTITY');
 exactRecord(receipt.priorCheckpoint,['revision','commitment']);assert.ok(Number.isSafeInteger(receipt.priorCheckpoint.revision)&&receipt.priorCheckpoint.revision>=0&&hex(receipt.priorCheckpoint.commitment));
 assert.equal(receipt.targetRevision,receipt.priorCheckpoint.revision+1);assert.ok(hex(receipt.nonce)&&hex(receipt.targetRecordSHA256)&&hex(receipt.storeHeaderSHA256));
 exactRecord(receipt.capturedProcess,['pid','startTicks']);assert.ok(Number.isSafeInteger(receipt.capturedProcess.pid)&&receipt.capturedProcess.pid>0);assert.match(receipt.capturedProcess.startTicks,/^[0-9]{1,24}$/);
 assert.ok(finalizationBytes(receipt).length<=4096,'WRAPPED_RECOVERY_FINALIZATION_BOUND');return identity;
}
function finalizationTarget(record){const target=clone(record.data);assert.equal(target.phase,'CAPTURING','WRAPPED_RECOVERY_FINALIZATION_PHASE');target.phase='CAPTURED';return target;}
async function finalizationEnvelope(directory,domain,payload){
 const secret=await privateRead(join(directory,'synthetic-local-root.secret'),32);
 try{assert.equal(secret.length,32);return {payload,authenticator:createHmac('sha256',secret).update('WRAPPED_RECOVERY_FINALIZATION_V1/'+domain+'\0').update(canonicalFinalization(payload)).digest('hex')};}finally{secret.fill(0);}
}
async function readFinalizationEnvelope(directory,name,domain){
 const raw=await privateRead(join(directory,name),8192),value=JSON.parse(raw.toString('utf8'));exactRecord(value,['payload','authenticator']);
 const expected=await finalizationEnvelope(directory,domain,value.payload);assert.equal(hex(value.authenticator)&&value.authenticator===expected.authenticator,true,'WRAPPED_RECOVERY_FINALIZATION_AUTHENTICATION');
 assert.equal(bytesHash(raw),bytesHash(finalizationBytes(expected)),'WRAPPED_RECOVERY_FINALIZATION_CANONICAL_BYTES');return value.payload;
}
async function assertFinalizationAnchor(directory,receipt){
 const actual=await readFinalizationEnvelope(directory,'capture-finalization.intent','intent');
 assert.equal(finalizationHash(actual),finalizationHash(receipt),'WRAPPED_RECOVERY_FINALIZATION_INTENT_CHANGED');
 assert.equal(bytesHash(await privateRead(join(directory,'authority.vault','header.json'),4096)),receipt.storeHeaderSHA256,'WRAPPED_RECOVERY_FINALIZATION_STORE_CHANGED');
}
function validatePublicationReceipt(receipt,identity){
 exactRecord(receipt,['schema','index','intentSHA256']);assert.equal(receipt.schema,externalIdentity(identity)?'EXTERNAL_DEFI_PUBLICATION_INTENT_RECEIPT_V1':'WRAPPED_COLD_PUBLICATION_INTENT_RECEIPT_V1');assert.equal(receipt.index,fundedIdentity(identity)?1:0,'WRAPPED_RECOVERY_PUBLICATION_INDEX');assert.ok(hex(receipt.intentSHA256),'WRAPPED_RECOVERY_PUBLICATION_COMMITMENT');
}
async function readPublicationAck(directory,receipt){
 const ack=await readFinalizationEnvelope(directory,'capture-finalization.publication','publication');exactRecord(ack,['finalizationIntentSHA256','publicationReceipt']);
 assert.equal(ack.finalizationIntentSHA256,finalizationHash(receipt),'WRAPPED_RECOVERY_PUBLICATION_FINALIZATION_CHANGED');validatePublicationReceipt(ack.publicationReceipt,receipt.identity);return ack.publicationReceipt;
}
export async function prepareWrappedRecoveryFinalizationV1(authority){
 assert.equal(arguments.length,1);const existing=authorities.get(authority);
 if(existing?.finalization){assert.ok(!existing.closed&&!existing.fault&&!existing.busy&&!existing.operation,'WRAPPED_RECOVERY_FINALIZATION_NOT_IDLE');await assertFinalizationAnchor(existing.directory,existing.finalization);return Object.freeze(clone(existing.finalization));}
 const s=state(authority);assert.equal(s.creating,true,'WRAPPED_RECOVERY_FINALIZATION_ORIGINAL_CAPTURE');assert.ok(sectionsFor(s.identity).every(name=>s.record.data.sections[name]?.state==='CAPTURED'),'WRAPPED_RECOVERY_CAPTURE_INCOMPLETE');
 s.operation=opaque();try{
  if(s.identity.profile===EXTERNAL_LINEAGE_PROFILE)await preserveLineageReceiverArchive(s);
  const record=normalized(await s.store.read());validateRecord(record,s.identity);assert.equal(finalizationHash(checkpoint(record)),finalizationHash(checkpoint(s.record)),'WRAPPED_RECOVERY_FINALIZATION_CHECKPOINT_CHANGED');
  const receipt={schema:FINALIZATION_SCHEMA,identity:clone(s.identity),nonce:randomBytes(32).toString('hex'),priorCheckpoint:checkpoint(record),targetRevision:record.revision+1,targetRecordSHA256:finalizationHash(finalizationTarget(record)),storeHeaderSHA256:bytesHash(await privateRead(join(s.directory,'authority.vault','header.json'),4096)),capturedProcess:clone(record.data.capturedProcess)};
  await exclusiveWrite(join(s.directory,'capture-finalization.intent'),finalizationBytes(await finalizationEnvelope(s.directory,'intent',receipt)));await syncDirectory(s.directory);await assertFinalizationAnchor(s.directory,receipt);s.finalization=receipt;return Object.freeze(clone(receipt));
 }catch(error){s.fault=true;throw error;}finally{s.operation=null;}
}
export async function finishWrappedRecoveryCaptureV1(authority,publicationIntent,publicationReceipt){
 assert.ok(arguments.length===1||arguments.length===3);const anchored=arguments.length===3;if(anchored)publicationReceipt=clone(publicationReceipt);
 const s=anchored?authorities.get(authority):state(authority);
 if(anchored){assert.ok(s&&!s.closed&&!s.busy&&!s.operation&&!s.fault&&s.finalization,'WRAPPED_RECOVERY_ORIGINAL_FINALIZATION');assert.equal(finalizationHash(publicationIntent),finalizationHash(s.finalization),'WRAPPED_RECOVERY_FINALIZATION_ACK_CHANGED');}
 assert.ok(sectionsFor(s.identity).every(name=>s.record.data.sections[name]?.state==='CAPTURED'),'WRAPPED_RECOVERY_CAPTURE_INCOMPLETE');
 s.operation=opaque();try{
  if(anchored){
   validatePublicationReceipt(publicationReceipt,s.identity);await assertFinalizationAnchor(s.directory,s.finalization);
   const ack={finalizationIntentSHA256:finalizationHash(s.finalization),publicationReceipt:clone(publicationReceipt)};
   await exclusiveWrite(join(s.directory,'capture-finalization.publication'),finalizationBytes(await finalizationEnvelope(s.directory,'publication',ack)));await syncDirectory(s.directory);
   assert.equal(finalizationHash(await readPublicationAck(s.directory,s.finalization)),finalizationHash(publicationReceipt),'WRAPPED_RECOVERY_PUBLICATION_ACK_CHANGED');
  }
  const expected=await mutate(s,old=>{assert.equal(old.phase,'CAPTURING');old.phase='CAPTURED';if(anchored)assert.equal(finalizationHash(old),s.finalization.targetRecordSHA256,'WRAPPED_RECOVERY_FINALIZATION_TARGET_CHANGED');return old;},anchored?s.finalization.priorCheckpoint:undefined);
  if(anchored)assert.equal(expected.revision,s.finalization.targetRevision);
  s.store.close();s.closed=true;await s.release();return expected;
 }catch(error){s.fault=true;throw error;}finally{s.operation=null;}
}
export async function reconcileWrappedRecoveryFinalizationV1(input,publicationIntent){
 assert.equal(arguments.length,2);const receipt=clone(publicationIntent),identity=finalizationIdentity(input,receipt),directory=finalizationDirectory(identity);
 await privateDirectory(identity.directory);await privateDirectory(directory);await assertFinalizationAnchor(directory,receipt);
 const release=await acquireLease(directory,identity);let store,primary,result;
 try{
  await assertFinalizationAnchor(directory,receipt);const secret=await privateRead(join(directory,'synthetic-local-root.secret'),32);let password;
  try{assert.equal(secret.length,32);password=secret.toString('hex');}finally{secret.fill(0);}
  try{store=await observeClaimRecordStoreV1({path:join(directory,'authority.vault'),password,identity});}finally{password=undefined;}
  const record=normalized(await store.read());validateRecord(record,identity);
  assert.equal(record.revision,receipt.targetRevision,'WRAPPED_RECOVERY_FINALIZATION_EXACT_REVISION');
  assert.equal(record.data.phase,'CAPTURED','WRAPPED_RECOVERY_FINALIZATION_NOT_SEALED');
  assert.ok(sectionsFor(identity).every(name=>record.data.sections[name]?.state==='CAPTURED'),'WRAPPED_RECOVERY_FINALIZATION_ALREADY_CLAIMED');
  assert.equal(finalizationHash(record.data.capturedProcess),finalizationHash(receipt.capturedProcess),'WRAPPED_RECOVERY_FINALIZATION_CAPTURE_PROCESS');
  assert.equal(finalizationHash(record.data),receipt.targetRecordSHA256,'WRAPPED_RECOVERY_FINALIZATION_TARGET_CHANGED');
  await assertFinalizationAnchor(directory,receipt);const publication=await readPublicationAck(directory,receipt);result=Object.freeze({checkpoint:checkpoint(record),intentSHA256:finalizationHash(receipt),publicationIntentSHA256:publication.intentSHA256,publicationIndex:publication.index,recoveryAuthorized:false});
 }catch(error){primary=error;}
 try{store?.close();}catch(error){primary=primary?new AggregateError([primary,error],'WRAPPED_RECOVERY_FINALIZATION_CLOSE_FAILED'):error;}
 try{await release();}catch(error){primary=primary?new AggregateError([primary,error],'WRAPPED_RECOVERY_FINALIZATION_RELEASE_FAILED'):error;}
 if(primary)throw primary;return result;
}

async function issueWrappedRecoverySectionV1(s,section){
 assert.equal(arguments.length,2);assert.ok(sectionsFor(s.identity).includes(section));assert.ok(s.operation,'WRAPPED_RECOVERY_FIXED_REOPEN_REQUIRED');if(externalIdentity(s.identity)||s.identity.profile===NATIVE_ECONOMIC_PROFILE){const order=sectionsFor(s.identity);assert.ok(order.slice(0,order.indexOf(section)).every(name=>s.record.data.sections[name]?.state==='OPENED'),'EXTERNAL_RECOVERY_REOPEN_ORDER');}assert.equal(s.creating,false,'WRAPPED_RECOVERY_NEW_PROCESS_REQUIRED');assert.ok(Date.now()<authorityReopenDeadline(s),'WRAPPED_RECOVERY_ORIGINAL_DEADLINE');
 const claim={processId:process.pid,nonce:randomBytes(32).toString('hex')};await mutate(s,old=>{assert.ok(['CAPTURED','REOPENING'].includes(old.phase));const row=old.sections[section];assert.equal(row?.state,'CAPTURED','WRAPPED_RECOVERY_OPEN_ALREADY_CONSUMED');row.state='OPENING';row.claim=claim;old.phase='REOPENING';return old;});
 const token=opaque();reads.set(token,{s,section,operation:s.operation,data:clone(s.record.data.sections[section].data),claim,used:false});return token;
}
export function originalWrappedRecoverySectionIdentityV1(token,section){
 assert.equal(arguments.length,2);const w=writes.get(token),r=reads.get(token),entry=w??r;
 assert.ok(entry&&entry.section===section&&!entry.s.closed&&!entry.s.fault,'WRAPPED_RECOVERY_ORIGINAL_SECTION_TOKEN');
 assert.ok(w?w.s.operation===token:r.operation===r.s.operation&&r.s.operation,'WRAPPED_RECOVERY_ORIGINAL_SECTION_TOKEN');
 return Object.freeze(clone(entry.s.identity));
}
export function consumeOriginalWrappedRecoverySectionV1(token,section){assert.equal(arguments.length,2);const r=reads.get(token);assert.ok(r&&r.section===section&&!r.used&&r.operation===r.s.operation,'WRAPPED_RECOVERY_ORIGINAL_OPEN_TOKEN');r.used=true;assert.equal(r.s.closed,false);assert.equal(r.s.fault,false);assert.ok(Date.now()<authorityReopenDeadline(r.s),'WRAPPED_RECOVERY_ORIGINAL_DEADLINE');return clone(r.data);}
export function consumeWrappedRuntimeRecoveryV1(token,family){assert.equal(arguments.length,2);assert.ok(ALL_RUNTIMES.includes(family));const r=reads.get(token);assert.notEqual(r?.s.identity.profile,NATIVE_D26_PROFILE,'NATIVE_D26_DISTINCT_RECOVERY_TOKEN');assert.notEqual(r?.s.identity.profile,NATIVE_ECONOMIC_PROFILE,'NATIVE_ECONOMIC_DISTINCT_RECOVERY_TOKEN');assert.ok(r?.s.identity.profile!==EXTERNAL_REPAIR_PROFILE,'EXTERNAL_REPAIR_DEDICATED_RUNTIME_REQUIRED');return consumeOriginalWrappedRecoverySectionV1(token,family);}
async function fixedReopen(authority,section,work,stop){
 const s=state(authority);s.operation=opaque();let token,result,returned=false;
 try{token=await issueWrappedRecoverySectionV1(s,section);const r=reads.get(token);result=await work(token);returned=true;assert.equal(r.used,true,'WRAPPED_RECOVERY_OPEN_TOKEN_UNUSED');await mutate(s,old=>{const row=old.sections[section];assert.equal(row.state,'OPENING');assert.deepEqual(row.claim,r.claim);row.state='OPENED';return old;});return result;}
 catch(error){s.fault=true;if(returned){try{await stop(result);}catch(cleanup){throw new AggregateError([error,cleanup],'WRAPPED_RECOVERY_OPEN_AND_CLEANUP_FAILED',{cause:error});}}throw error;}
 finally{if(token)reads.delete(token);s.operation=null;}
}
export async function reopenWrappedRuntimeFromAuthorityV1(authority,family){
 assert.equal(arguments.length,2);assert.ok(ALL_RUNTIMES.includes(family));assert.notEqual(state(authority).identity.profile,NATIVE_D26_PROFILE,'NATIVE_D26_DISTINCT_RECOVERY_TOKEN');assert.notEqual(state(authority).identity.profile,NATIVE_ECONOMIC_PROFILE,'NATIVE_ECONOMIC_DISTINCT_RECOVERY_TOKEN');return fixedReopen(authority,family,async token=>{
  if(family==='bitcoin'){const m=await import('../../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs');return m.reopenOwnedBitcoinRecoveryV1(token);}
  if(family==='solana'){const m=await import('../../../chains/solana/runtime/owned-solana-runtime.mjs');return m.reopenOwnedSolanaRecoveryV1(token);}
  if(family==='graphNativeTron'){const m=await import('../../../chains/tron/runtime/owned-tron-native-value-runtime.mjs');return m.reopenOwnedTronRecoveryV1(token);}
  const m=await import('../../../chains/evm/runtime/owned-evm-v2-runtime.mjs');if(family==='receiver'&&externalIdentity(stateForRepairToken(token).identity)&&stateForRepairToken(token).identity.profile===EXTERNAL_REPAIR_PROFILE)return m.reopenOwnedReceiverPreopenRepairV1(token);return family==='receiver'?m.reopenOwnedReceiverRecoveryV1(token):m.reopenOwnedGraphNativeRecoveryV1(token);
 },runtime=>runtime.close());
}
export async function reopenWrappedSystemFromAuthorityV1(authority,input){assert.equal(arguments.length,2);exactRecord(input,['runtime','nativeRuntimes','graphNativeRuntimes']);return fixedReopen(authority,'system',async token=>{const m=await import('../../../../../../tests/integration/wallet/wrapped/flows/wrapped-wallet-acceptance-v1.mjs');return m.reopenWrappedWalletAcceptanceSystemV1({...input,attemptAuthority:token});},async value=>{const errors=[];try{value.bootstrap.close();}catch(error){errors.push(error);}try{const m=await import('../../../operations/operators/wrapped/wrapped-claim-custody-bootstrap-v1.mjs');m.revokeWrappedClaimCustodyBootstrapV1(input.runtime,value.custodyBootstrap);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'WRAPPED_RECOVERY_SYSTEM_CLEANUP_FAILED');});}
export async function reopenWrappedOwnersFromAuthorityV1(authority,input){assert.equal(arguments.length,2);exactRecord(input,['runtime','system','nativeClaimObservers']);return fixedReopen(authority,'owners',async token=>{const m=await import('../../../../../custody/src/processes/wrapped-claim-owner-process-v1.mjs');return m.reopenWrappedClaimOwnersV1({...input,attemptAuthority:token});},async owners=>{const results=await Promise.allSettled(owners.map(owner=>owner.close()));const failed=results.filter(row=>row.status==='rejected');if(failed.length)throw new AggregateError(failed.map(row=>row.reason),'WRAPPED_RECOVERY_OWNER_CLEANUP_FAILED');});}
export async function reopenWrappedKeeperFromAuthorityV1(authority,input){assert.equal(arguments.length,2);exactRecord(input,['runtime','claims']);return fixedReopen(authority,'keeper',async token=>{const m=await import('../controller/wrapped-controller-journal-v1.mjs');return m.reopenWrappedKeeperFromAuthorityV1({...input,attemptAuthority:token});},keeper=>keeper.close());}
export async function reopenWrappedFixtureFromAuthorityV1(authority,input){
 assert.equal(arguments.length,2);exactRecord(input,['runtime','nativeRuntimes','graphNativeRuntimes','system','bootstrap','custodyBootstrap','owners','keeper']);
 return fixedReopen(authority,'fixture',async token=>{const m=await import('../../../../../../tests/integration/fixtures/wallet/wrapped/flows/wrapped-wallet-fixed-fixture-v1.mjs');return m.reopenWrappedWalletFixedFixtureV1({...input,attemptAuthority:token});},fixture=>fixture.close());
}
export async function reopenWrappedWalletFromAuthorityV1(authority,input){
 assert.equal(arguments.length,2);assert.ok(fundedIdentity(state(authority).identity),'WRAPPED_RECOVERY_FUNDED_AUTHORITY_REQUIRED');
 exactRecord(input,['runtime','system','owners','controller','bootstrap','nativeRuntimes','deadlineMs']);
 return fixedReopen(authority,'wallet',async token=>{const m=await import('../../../../../../tests/integration/wallet/wrapped/flows/wrapped-wallet-acceptance-v1.mjs');return m.reopenWrappedWalletAcceptanceV1({...input,attemptAuthority:token});},wallet=>wallet.close());
}
export async function reopenWrappedPrivateLifetimeFromAuthorityV1(authority,runtime){assert.equal(arguments.length,2);return fixedReopen(authority,'privateLifetime',async token=>{const m=await import('./wrapped-private-lifetime-registry-v1.mjs');return m.reopenWrappedPrivateLifetimeRegistryFromAuthorityV1({runtime,attemptAuthority:token});},async registry=>{const m=await import('./wrapped-private-lifetime-registry-v1.mjs');return m.closeWrappedPrivateLifetimeRegistryV1(registry);});}
/** A failure deliberately leaves the persisted claim OPENING. Neither this
 * method nor lease release supplies a retry, claim reset or authority renewal. */
export async function closeWrappedRecoveryAuthorityV1(authority){assert.equal(arguments.length,1);const s=authorities.get(authority);assert.ok(s&&!s.closed&&!s.busy&&!s.operation,'WRAPPED_RECOVERY_ORIGINAL_IDLE_AUTHORITY');s.store.close();s.closed=true;await s.release();return Object.freeze({closed:true,privateStateRetained:true,lastKnownCheckpoint:checkpoint(s.record),checkpointMayBeStale:s.fault,reopenVerified:false});}

/** Exact standalone external-DeFi attempt, using the same encrypted authority.
 * Registry retention is not effect authorization. Reopen is strictly ordered. */
export function createExternalDefiRecoveryAuthorityV1(input){assert.equal(arguments.length,1);return authorityFactory(input,null,true,false,false,true);}
export function openExternalDefiRecoveryAuthorityV1(input,checkpoint){assert.equal(arguments.length,2);return authorityFactory(input,checkpoint,false,false,false,true);}
function externalAuthority(authority){assert.ok(externalIdentity(state(authority).identity),'EXTERNAL_RECOVERY_PROFILE_REQUIRED');}
export async function retainExternalDefiSystemRecoveryV1(authority,input){
 externalAuthority(authority);exactRecord(input,['runtime','bootstrap']);const registry=await import('./wrapped-private-lifetime-registry-v1.mjs');registry.assertWrappedPrivateLifetimeAttemptV1(input.runtime,state(authority).identity);return fixedCapture(authority,'system',async token=>{
  const m=await import('../../../operations/recovery/external-defi-bootstrap-recovery-v1.mjs');return m.retainExternalDefiBootstrapForReopenV1({...input,attemptAuthority:token});});
}
export async function reopenExternalDefiSystemFromAuthorityV1(authority,input){
 externalAuthority(authority);exactRecord(input,['runtime']);return fixedReopen(authority,'system',async token=>{
  const m=await import('../../../operations/recovery/external-defi-bootstrap-recovery-v1.mjs');return m.reopenExternalDefiBootstrapFromAuthorityV1({...input,attemptAuthority:token});},value=>value.close());
}
export async function retainExternalDefiOwnersRecoveryV1(authority,input){
 externalAuthority(authority);exactRecord(input,['owners']);return fixedCapture(authority,'owners',async token=>{
  const m=await import('../../../../../custody/src/processes/flat-owner-process.mjs');return m.retainFlatOwnersForReopenV1({...input,attemptAuthority:token});});
}
export async function reopenExternalDefiOwnersFromAuthorityV1(authority,input){
 externalAuthority(authority);exactRecord(input,['runtime','system','deliveryObservers']);return fixedReopen(authority,'owners',async token=>{
  const m=await import('../../../../../custody/src/processes/flat-owner-process.mjs');return m.reopenFlatOwnersFromAuthorityV1({...input,attemptAuthority:token});},async owners=>{
  const r=await Promise.allSettled(owners.map(owner=>owner.close()));const errors=r.filter(x=>x.status==='rejected');if(errors.length)throw new AggregateError(errors.map(x=>x.reason),'EXTERNAL_OWNER_CLOSE_FAILED');});
}
export async function retainExternalDefiWalletRecoveryV1(authority,wallet){
 externalAuthority(authority);return fixedCapture(authority,'wallet',async token=>{
  const m=await import('../../../accounts/recovery/external-defi-wallet-recovery-v1.mjs');return m.retainExternalDefiWalletForReopenV1(wallet,token);});
}
export async function reopenExternalDefiWalletFromAuthorityV1(authority,input,callbacks={}){
 externalAuthority(authority);exactRecord(input,['runtime','system','owners']);return fixedReopen(authority,'wallet',async token=>{
  const m=await import('../../../accounts/recovery/external-defi-wallet-recovery-v1.mjs');return m.reopenExternalDefiWalletFromRecoveryV1({...input,attemptAuthority:token},callbacks);},wallet=>wallet.close());
}

/** Fixed new catalogue producer. The original five-section AEAD issuer and
 * ordered, one-use reopen remain authoritative; no saved DTO is an opener. */
export async function retainExternalDefiCatalogueRecoveryV1(authority,catalogue){
 assert.equal(arguments.length,2);externalAuthority(authority);return fixedCapture(authority,'wallet',async token=>{
  const m=await import('../../../accounts/recovery/external-defi-catalogue-recovery-v1.mjs');return m.retainExternalDefiCatalogueForReopenV1(catalogue,token);});
}
export async function reopenExternalDefiCatalogueFromAuthorityV1(authority,input,callbacks={}){
 assert.ok(arguments.length===2||arguments.length===3);externalAuthority(authority);exactRecord(input,['runtime','system','owners']);return fixedReopen(authority,'wallet',async token=>{
  const m=await import('../../../accounts/recovery/external-defi-catalogue-recovery-v1.mjs');return m.reopenExternalDefiCatalogueFromRecoveryV1({...input,attemptAuthority:token},callbacks);
 },async catalogue=>{const m=await import('../../../accounts/storage/flat-journal-catalogue.mjs');return m.closeRetainedFlatJournalCatalogueV1(catalogue);});
}

export function createExternalDefiFundedRecoveryAuthorityV1(input){assert.equal(arguments.length,1);return authorityFactory(input,null,true,true,false,true);}
export function openExternalDefiFundedRecoveryAuthorityV1(input,checkpoint){assert.equal(arguments.length,2);return authorityFactory(input,checkpoint,false,true,false,true);}

/** External publication shares the original finalization anchor and HMAC key.
 * The inventory digest is comparison data, never evidence of native recovery. */
export async function publishExternalDefiRecoveryCaptureV1(authority,inventorySHA256){
 assert.equal(arguments.length,2);externalAuthority(authority);assert.ok(hex(inventorySHA256),'EXTERNAL_RECOVERY_INVENTORY_DIGEST');
 const s=state(authority),identity=clone(s.identity),directory=s.directory;
 const finalizationIntent=await prepareWrappedRecoveryFinalizationV1(authority);
 const payload={schema:'EXTERNAL_DEFI_CAPTURE_PUBLICATION_V1',identity,inventorySHA256,finalizationIntent};
 const bytes=finalizationBytes(await finalizationEnvelope(directory,'external-publication',payload));
 await exclusiveWrite(join(directory,'external-publication.intent'),bytes);await syncDirectory(directory);
 assert.equal(finalizationHash(await readFinalizationEnvelope(directory,'external-publication.intent','external-publication')),finalizationHash(payload),'EXTERNAL_RECOVERY_PUBLICATION_READBACK');
 const receipt={schema:'EXTERNAL_DEFI_PUBLICATION_INTENT_RECEIPT_V1',index:fundedIdentity(identity)?1:0,intentSHA256:bytesHash(bytes)};
 const checkpoint=await finishWrappedRecoveryCaptureV1(authority,finalizationIntent,receipt);
 return Object.freeze({checkpoint,inventorySHA256,finalizationIntent:clone(finalizationIntent),recoveryAuthorized:false});
}
export async function readExternalDefiRecoveryPublicationV1(input,inventorySHA256,options){
 assert.equal(arguments.length,3);exactRecord(options,['funded']);assert.equal(typeof options.funded,'boolean');assert.ok(hex(inventorySHA256));
 const identity=identityOf(input,options.funded,false,true),directory=finalizationDirectory(identity);
 await privateDirectory(identity.directory);await privateDirectory(directory);
 const payload=await readFinalizationEnvelope(directory,'external-publication.intent','external-publication');
 exactRecord(payload,['schema','identity','inventorySHA256','finalizationIntent']);assert.equal(payload.schema,'EXTERNAL_DEFI_CAPTURE_PUBLICATION_V1');
 assert.deepEqual(payload.identity,identity,'EXTERNAL_RECOVERY_PUBLICATION_ATTEMPT');assert.equal(payload.inventorySHA256,inventorySHA256,'EXTERNAL_RECOVERY_INVENTORY_CHANGED');
 const result=await reconcileWrappedRecoveryFinalizationV1(input,payload.finalizationIntent);
 assert.equal(result.publicationIntentSHA256,bytesHash(await privateRead(join(directory,'external-publication.intent'),8192)),'EXTERNAL_RECOVERY_PUBLICATION_CHANGED');
 return Object.freeze({checkpoint:result.checkpoint,inventorySHA256,recoveryAuthorized:false});
}

// This profile exists only for the original, unfunded receiver-construction
// failure. Predecessor records/markers remain immutable and auditable.
function stateForRepairToken(token){const r=reads.get(token);assert.ok(r&&r.operation===r.s.operation,'EXTERNAL_REPAIR_ORIGINAL_TOKEN');return r.s;}
async function repairAdmission(){
 const {readExternalDefiPreopenRepairAdmissionV1}=await import('../../authorization/external-defi-preopen-repair-admission-v1.mjs');
 const a=readExternalDefiPreopenRepairAdmissionV1();
 exactRecord(a,['schema','originalInput','originalInventorySHA256','failedCheckpoint','failedRecordSHA256','failedReceiverClaim','evidence','approvedSources','permit','native']);
 assert.equal(a.schema,'EXTERNAL_DEFI_PREOPEN_REPAIR_ADMISSION_V1');identityOf(a.originalInput,false,false,true);
 for(const hash of [a.originalInventorySHA256,a.failedRecordSHA256,a.failedCheckpoint.commitment])assert.ok(hex(hash));
 exactRecord(a.failedCheckpoint,['revision','commitment']);assert.ok(Number.isSafeInteger(a.failedCheckpoint.revision)&&a.failedCheckpoint.revision>0);
 exactRecord(a.failedReceiverClaim,['processId','nonce']);assert.ok(Number.isSafeInteger(a.failedReceiverClaim.processId)&&a.failedReceiverClaim.processId>0&&hex(a.failedReceiverClaim.nonce));
 exactRecord(a.permit,['id','issuedAtMs','deadlineMs','scope','effectAuthority']);assert.ok(hex(a.permit.id));assert.equal(a.permit.scope,'RESTORE_ORIGINAL_UNFUNDED_ACTORS_ONLY');assert.equal(a.permit.effectAuthority,false);
 assert.ok(Number.isSafeInteger(a.permit.issuedAtMs)&&Number.isSafeInteger(a.permit.deadlineMs)&&a.permit.deadlineMs>a.permit.issuedAtMs&&a.permit.deadlineMs-a.permit.issuedAtMs<=3600000,'EXTERNAL_REPAIR_BOUNDED_PERMIT');
 assert.ok(Date.now()>=a.permit.issuedAtMs&&Date.now()<a.permit.deadlineMs,'EXTERNAL_REPAIR_PERMIT_EXPIRED');
 exactRecord(a.evidence,['terminal','status','error','createTerminal','createStatus','probeSource']);
 for(const row of [...Object.values(a.evidence),...a.approvedSources]){
  exactRecord(row,['path','sha256']);assert.equal(resolve(row.path),row.path);assert.ok(hex(row.sha256));
  const st=await lstat(row.path);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.size<=8*1024*1024,'EXTERNAL_REPAIR_PINNED_FILE');
  assert.equal(bytesHash(await readFile(row.path)),row.sha256,'EXTERNAL_REPAIR_EVIDENCE_CHANGED');
 }
 assert.ok(Array.isArray(a.approvedSources)&&a.approvedSources.length>=2&&a.approvedSources.length<=8);
 assert.equal(new Set(a.approvedSources.map(row=>row.path)).size,a.approvedSources.length);
 for(const row of a.approvedSources)assert.ok(row.path.startsWith(FIXED_WALLET_ROOT+'/')&&row.path.endsWith('.mjs'),'EXTERNAL_REPAIR_SOURCE_SCOPE');
 exactRecord(a.native,['repairOrdinal','capturedGeneration','captureSHA256','predecessorClaim','predecessorMnemonic']);assert.equal(a.native.repairOrdinal,1);assert.equal(a.native.capturedGeneration,0);assert.ok(hex(a.native.captureSHA256));
 for(const row of [a.native.predecessorClaim,a.native.predecessorMnemonic]){exactRecord(row,['path','bytes','sha256']);assert.ok(Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=4096&&hex(row.sha256));}
 assert.equal(a.native.predecessorClaim.path,'wrapped-runtime-open-0.json');assert.equal(a.native.predecessorMnemonic.path,'reopen-mnemonic-1.txt');return a;
}
async function inspectRepairPredecessor(a){
 const identity=identityOf(a.originalInput,false,false,true),directory=join(identity.directory,'recovery');
 await privateDirectory(identity.directory);await privateDirectory(directory);
 const release=await acquireLease(directory,identity);let store;
 try{
  const key=await privateRead(join(directory,'synthetic-local-root.secret'),32);let password;
  try{assert.equal(key.length,32);password=key.toString('hex');}finally{key.fill(0);}
  try{store=await observeClaimRecordStoreV1({path:join(directory,'authority.vault'),password,identity});}finally{password=undefined;}
  const record=normalized(await store.read());validateRecord(record,identity);assert.deepEqual(checkpoint(record),a.failedCheckpoint,'EXTERNAL_REPAIR_PREDECESSOR_CHECKPOINT');
  assert.equal(finalizationHash(record),a.failedRecordSHA256,'EXTERNAL_REPAIR_PREDECESSOR_CHANGED');assert.equal(record.data.phase,'REOPENING');
  const receiver=record.data.sections.receiver;assert.equal(receiver.state,'OPENING');assert.deepEqual(receiver.claim,a.failedReceiverClaim,'EXTERNAL_REPAIR_FAILED_CLAIM_CHANGED');
  for(const [name,row]of Object.entries(record.data.sections))if(name!=='receiver'){assert.equal(row.state,'CAPTURED','EXTERNAL_REPAIR_LATER_SECTION_USED');assert.equal(row.claim,null);}
  const publication=await readFinalizationEnvelope(directory,'external-publication.intent','external-publication');
  exactRecord(publication,['schema','identity','inventorySHA256','finalizationIntent']);assert.equal(publication.schema,'EXTERNAL_DEFI_CAPTURE_PUBLICATION_V1');assert.deepEqual(publication.identity,identity);
  assert.equal(publication.inventorySHA256,a.originalInventorySHA256);const original=publication.finalizationIntent;
  finalizationIdentity(a.originalInput,original);await assertFinalizationAnchor(directory,original);const ack=await readPublicationAck(directory,original);
  assert.equal(ack.intentSHA256,bytesHash(await privateRead(join(directory,'external-publication.intent'),8192)));
  assert.equal(record.revision,original.targetRevision+1,'EXTERNAL_REPAIR_EXACT_FAILED_TRANSITION');
  const originalTarget=clone(record.data);originalTarget.phase='CAPTURED';originalTarget.sections.receiver.state='CAPTURED';originalTarget.sections.receiver.claim=null;
  assert.equal(finalizationHash(originalTarget),original.targetRecordSHA256,'EXTERNAL_REPAIR_ORIGINAL_CAPTURE_CHANGED');
  const terminal=JSON.parse(await readFile(a.evidence.terminal.path,'utf8')),status=JSON.parse(await readFile(a.evidence.status.path,'utf8')),error=JSON.parse(await readFile(a.evidence.error.path,'utf8'));
  assert.equal(terminal.phase,'reopen');assert.equal(terminal.exitCode,1);assert.equal(terminal.originalGroupAbsent,true);assert.equal(terminal.process.pid,receiver.claim.processId);assert.match(terminal.process.startTicks,/^[0-9]+$/);
  assert.equal(status.step,'REOPEN_ORIGINAL_RUNTIME');assert.equal(status.success,false);assert.equal(status.cleanupErrors,0);assert.equal(status.proofsGenerated,0);assert.equal(error.step,status.step);
  const created=JSON.parse(await readFile(a.evidence.createTerminal.path,'utf8')),createdStatus=JSON.parse(await readFile(a.evidence.createStatus.path,'utf8'));
  assert.equal(created.phase,'create');assert.equal(created.exitCode,0);assert.equal(created.originalGroupAbsent,true);assert.equal(createdStatus.success,true);assert.equal(createdStatus.cleanupErrors,0);assert.equal(createdStatus.proofsGenerated,0);
  assert.equal(created.process.pid,record.data.capturedProcess.pid);assert.equal(created.process.startTicks,record.data.capturedProcess.startTicks);
  const repair={schema:'EXTERNAL_DEFI_RECEIVER_PREOPEN_REPAIR_V1',...clone(a.native),failedPhase:status.step,originalRuntimeReturned:false,originalGroupsClosed:true,
   failureEvidence:Object.values(a.evidence).map(clone),approvedSourceSHA256:finalizationHash(a.approvedSources),
   predecessor:{checkpoint:checkpoint(record),recordSHA256:finalizationHash(record),receiverClaim:clone(receiver.claim)},permitDeadlineMs:a.permit.deadlineMs};
  assert.equal(receiver.data.processGeneration,repair.capturedGeneration);assert.equal(receiver.data.privateRecord.sha256,repair.captureSHA256);
  const native=await import('../../../chains/evm/runtime/owned-evm-v2-runtime.mjs');await native.assertOwnedReceiverPreopenRepairV1({record:clone(receiver.data),repair:clone(repair)});
  return {identity,directory,record,repair,originalTarget};
 }finally{store?.close();await release();}
}
function repairIdentity(a,p){return {profile:EXTERNAL_REPAIR_PROFILE,...clone(a.originalInput),repair:{...clone(p.repair),permitId:a.permit.id,permitIssuedAtMs:a.permit.issuedAtMs,originalInventorySHA256:a.originalInventorySHA256}};}
async function readRepairPublication(a,p){
 const identity=repairIdentity(a,p),directory=join(p.directory,'receiver-preopen-repair-1');await privateDirectory(directory);
 const marker=await readFinalizationEnvelope(p.directory,'receiver-preopen-repair-1.claim','preopen-repair-claim');
 exactRecord(marker,['schema','predecessorCheckpoint','predecessorRecordSHA256','successorIdentitySHA256','producerProcess']);assert.equal(marker.schema,'EXTERNAL_PREOPEN_REPAIR_SUCCESSOR_CLAIM_V1');
 assert.deepEqual(marker.predecessorCheckpoint,a.failedCheckpoint);assert.equal(marker.predecessorRecordSHA256,a.failedRecordSHA256);assert.equal(marker.successorIdentitySHA256,finalizationHash(identity));
 const publication=await readFinalizationEnvelope(p.directory,'receiver-preopen-repair-1.publication','preopen-repair-publication');
 exactRecord(publication,['schema','identity','checkpoint','recordSHA256','markerSHA256']);assert.equal(publication.schema,'EXTERNAL_PREOPEN_REPAIR_SUCCESSOR_PUBLICATION_V1');assert.deepEqual(publication.identity,identity);
 assert.equal(publication.markerSHA256,bytesHash(await privateRead(join(p.directory,'receiver-preopen-repair-1.claim'),8192)));
 return {identity,directory,marker,publication};
}
async function assertRepairPredecessorCurrent(a,p){
 const key=await privateRead(join(p.directory,'synthetic-local-root.secret'),32);let password,store;
 try{password=key.toString('hex');}finally{key.fill(0);}
 try{store=await observeClaimRecordStoreV1({path:join(p.directory,'authority.vault'),password,identity:p.identity});password=undefined;
  const record=normalized(await store.read());validateRecord(record,p.identity);assert.deepEqual(checkpoint(record),a.failedCheckpoint,'EXTERNAL_REPAIR_PREDECESSOR_CAS');
  assert.equal(finalizationHash(record),a.failedRecordSHA256,'EXTERNAL_REPAIR_PREDECESSOR_CAS');
 }finally{password=undefined;store?.close();}
}
export async function prepareExternalDefiReceiverRepairV1(){
 assert.equal(arguments.length,0);const a=await repairAdmission(),p=await inspectRepairPredecessor(a),identity=repairIdentity(a,p),directory=join(p.directory,'receiver-preopen-repair-1');
 const release=await acquireLease(p.directory,p.identity);let store;
 try{
  await assertRepairPredecessorCurrent(a,p);
  // Permanent exclusive CAS: an uncertain preparation cannot allocate claim #2.
  const processIdentity=await originalProcess(),marker={schema:'EXTERNAL_PREOPEN_REPAIR_SUCCESSOR_CLAIM_V1',predecessorCheckpoint:a.failedCheckpoint,predecessorRecordSHA256:a.failedRecordSHA256,successorIdentitySHA256:finalizationHash(identity),producerProcess:processIdentity};
  await exclusiveWrite(join(p.directory,'receiver-preopen-repair-1.claim'),finalizationBytes(await finalizationEnvelope(p.directory,'preopen-repair-claim',marker)));await syncDirectory(p.directory);
  await mkdir(directory,{mode:0o700});await syncDirectory(p.directory);await privateDirectory(directory);
  const key=await privateRead(join(p.directory,'synthetic-local-root.secret'),32);let password;try{password=key.toString('hex');}finally{key.fill(0);}
  try{store=await createClaimRecordStore({path:join(directory,'authority.vault'),password,identity},{profile:identity.profile,identity,capturedProcess:processIdentity,phase:'CAPTURED',sections:clone(p.originalTarget.sections)});}finally{password=undefined;}
  const record=normalized(await store.read());validateRecord(record,identity);
  const publication={schema:'EXTERNAL_PREOPEN_REPAIR_SUCCESSOR_PUBLICATION_V1',identity,checkpoint:checkpoint(record),recordSHA256:finalizationHash(record),markerSHA256:bytesHash(await privateRead(join(p.directory,'receiver-preopen-repair-1.claim'),8192))};
  await exclusiveWrite(join(p.directory,'receiver-preopen-repair-1.publication'),finalizationBytes(await finalizationEnvelope(p.directory,'preopen-repair-publication',publication)));await syncDirectory(p.directory);
  await readRepairPublication(a,p);return Object.freeze({checkpoint:checkpoint(record),repairOrdinal:1,originalInventorySHA256:a.originalInventorySHA256,originalDeadlineMs:a.originalInput.deadlineMs,reopenPermitDeadlineMs:a.permit.deadlineMs,effectAuthority:false});
 }finally{store?.close();await release();}
}
export async function openExternalDefiReceiverRepairAuthorityV1(){
 assert.equal(arguments.length,0);const a=await repairAdmission(),p=await inspectRepairPredecessor(a),saved=await readRepairPublication(a,p);
 const release=await acquireLease(saved.directory,saved.identity);let store;
 try{
  const key=await privateRead(join(p.directory,'synthetic-local-root.secret'),32);let password;try{password=key.toString('hex');}finally{key.fill(0);}
  try{store=await openClaimRecordStore({path:join(saved.directory,'authority.vault'),password,identity:saved.identity});}finally{password=undefined;}
  await assertRepairPredecessorCurrent(a,p);
  const record=normalized(await store.read());validateRecord(record,saved.identity);assert.deepEqual(checkpoint(record),saved.publication.checkpoint,'EXTERNAL_REPAIR_ALREADY_CLAIMED');assert.equal(finalizationHash(record),saved.publication.recordSHA256);
  assert.equal(record.data.phase,'CAPTURED');assert.ok(Object.values(record.data.sections).every(row=>row.state==='CAPTURED'&&row.claim===null));
  assert.notDeepEqual(record.data.capturedProcess,await originalProcess(),'EXTERNAL_REPAIR_NEW_PROCESS_REQUIRED');assert.deepEqual(record.data.capturedProcess,saved.marker.producerProcess);
  const authority=opaque();authorities.set(authority,{directory:saved.directory,identity:saved.identity,store,record,release,busy:false,operation:null,closed:false,fault:false,creating:false});return authority;
 }catch(error){store?.close();await release();throw error;}
}
export function consumeExternalDefiReceiverRepairV1(token){
 assert.equal(arguments.length,1);const state=stateForRepairToken(token);assert.equal(state.identity.profile,EXTERNAL_REPAIR_PROFILE,'EXTERNAL_REPAIR_ORIGINAL_PROFILE');
 const record=consumeOriginalWrappedRecoverySectionV1(token,'receiver');return Object.freeze({record,repair:clone(state.identity.repair)});
}

const canonicalDataHash=value=>bytesHash(Buffer.from(canonicalClaimRecordDataV1(value)));
async function bootstrapPartialAdmission(prefix=false){
 const a=prefix?(await import('../../authorization/external-bootstrap-prefix-admission-v1.mjs')).readExternalBootstrapPrefixAdmissionV1():(await import('../../authorization/external-bootstrap-partial-admission-v1.mjs')).readExternalBootstrapPartialAdmissionV1();
 exactRecord(a,['schema','originalInput','originalInventorySHA256','predecessorCheckpoint','predecessorRecordSHA256','predecessorPermitSHA256','claims','registry','native','evidence','approvedSources','permit',...(prefix?['predecessor','failureCode']:[])]);
 assert.equal(a.schema,prefix?'EXTERNAL_BOOTSTRAP_PREFIX_CONTINUATION_ADMISSION_V1':'EXTERNAL_BOOTSTRAP_PARTIAL_SUCCESSOR_ADMISSION_V1');
 if(prefix){exactRecord(a.predecessor,['ordinal','publicationSHA256','markerSHA256']);assert.ok(Number.isSafeInteger(a.predecessor.ordinal)&&a.predecessor.ordinal>=1&&a.predecessor.ordinal<=8);assert.ok(hex(a.predecessor.publicationSHA256)&&hex(a.predecessor.markerSHA256));assert.equal(a.failureCode,'FLAT_PURE_HASH_IMMUTABLE_FACADE');}identityOf(a.originalInput,false,false,true);
 exactRecord(a.claims,['receiver','privateLifetime','system']);for(const claim of Object.values(a.claims)){exactRecord(claim,['processId','nonce']);assert.ok(Number.isSafeInteger(claim.processId)&&claim.processId>0&&hex(claim.nonce));}
 exactRecord(a.registry,['checkpoint','partVersion','partIdentitySHA256','canonicalStateSHA256','canonicalInventorySHA256','legacyDescriptorSHA256']);assert.equal(a.registry.partVersion,2);
 exactRecord(a.native,['generation','captureSHA256','terminalSHA256','repairMarkerSHA256']);assert.equal(a.native.generation,prefix?a.predecessor.ordinal+1:1);
 exactRecord(a.evidence,['terminal','status','error','failedClose','equivalence','equivalenceReview','stageSource']);
 assert.ok(Array.isArray(a.approvedSources)&&a.approvedSources.length>=2&&a.approvedSources.length<=10);
 assert.equal(new Set(a.approvedSources.map(row=>row.path)).size,a.approvedSources.length);
 for(const row of [...Object.values(a.evidence),...a.approvedSources]){exactRecord(row,['path','sha256']);assert.equal(resolve(row.path),row.path);assert.ok(hex(row.sha256));
  const st=await lstat(row.path);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.size<=8*1024*1024);assert.equal(bytesHash(await readFile(row.path)),row.sha256,'PARTIAL_RESTORE_EVIDENCE_CHANGED');}
 for(const row of a.approvedSources)assert.ok(row.path.startsWith(FIXED_WALLET_ROOT+'/')&&row.path.endsWith('.mjs'),'PARTIAL_RESTORE_SOURCE_SCOPE');
 exactRecord(a.permit,['id','issuedAtMs','deadlineMs','scope','effectAuthority']);assert.equal(a.permit.scope,'RESTORE_ORIGINAL_UNFUNDED_ACTORS_ONLY');assert.equal(a.permit.effectAuthority,false);assert.ok(hex(a.permit.id));
 assert.ok(Number.isSafeInteger(a.permit.issuedAtMs)&&Number.isSafeInteger(a.permit.deadlineMs)&&a.permit.deadlineMs>a.permit.issuedAtMs&&a.permit.deadlineMs-a.permit.issuedAtMs<=3600000);
 assert.ok(Date.now()>=a.permit.issuedAtMs&&Date.now()<a.permit.deadlineMs,'PARTIAL_RESTORE_PERMIT_EXPIRED');return a;
}
async function observeUsingOriginalKey(path,identity,keyRoot){
 const key=await privateRead(join(keyRoot,'synthetic-local-root.secret'),32);let password;
 try{password=key.toString('hex');}finally{key.fill(0);}
 try{return await observeClaimRecordStoreV1({path,password,identity});}finally{password=undefined;}
}
async function inspectBootstrapPartialPredecessor(a){
 const prefix=Boolean(a.predecessor),root=join(a.originalInput.directory,'recovery'),stem=prefix?'bootstrap-partial-successor-'+a.predecessor.ordinal:'receiver-preopen-repair-1',directory=join(root,stem);await privateDirectory(root);await privateDirectory(directory);
 const publication=await readFinalizationEnvelope(root,stem+'.publication',prefix?'bootstrap-partial-publication':'preopen-repair-publication');
 const marker=await readFinalizationEnvelope(root,stem+'.claim',prefix?'bootstrap-partial-claim':'preopen-repair-claim');
 assert.equal(publication.schema,prefix?'EXTERNAL_BOOTSTRAP_PARTIAL_PUBLICATION_V1':'EXTERNAL_PREOPEN_REPAIR_SUCCESSOR_PUBLICATION_V1');assert.equal(publication.identity.profile,prefix?EXTERNAL_PARTIAL_PROFILE:EXTERNAL_REPAIR_PROFILE);
 assert.equal(publication.markerSHA256,bytesHash(await privateRead(join(root,stem+'.claim'),8192)));assert.equal(marker.successorIdentitySHA256,finalizationHash(publication.identity));
 if(prefix){assert.equal(bytesHash(await privateRead(join(root,stem+'.publication'),8192)),a.predecessor.publicationSHA256);assert.equal(publication.markerSHA256,a.predecessor.markerSHA256);assert.equal(publication.identity.restoration.generation,a.predecessor.ordinal+1);}
 for(const key of ['directory','runId','sourceSHA256','deadlineMs'])assert.equal(publication.identity[key],a.originalInput[key]);
 const oldPermit=prefix?publication.identity.restoration.permit:publication.identity.repair;assert.equal(finalizationHash(prefix?oldPermit:{id:oldPermit.permitId,issuedAtMs:oldPermit.permitIssuedAtMs,deadlineMs:oldPermit.permitDeadlineMs}),a.predecessorPermitSHA256,'PARTIAL_RESTORE_OLD_PERMIT_CHANGED');assert.equal(prefix?publication.identity.restoration.originalInventorySHA256:oldPermit.originalInventorySHA256,a.originalInventorySHA256);
 const release=await acquireLease(directory,publication.identity);let store;
 try{
  store=await observeUsingOriginalKey(join(directory,'authority.vault'),publication.identity,root);const record=normalized(await store.read());validateRecord(record,publication.identity);
  assert.deepEqual(checkpoint(record),a.predecessorCheckpoint);assert.equal(finalizationHash(record),a.predecessorRecordSHA256);assert.equal(record.revision,publication.checkpoint.revision+5);assert.equal(record.data.phase,'REOPENING');
  for(const [name,expected]of Object.entries({receiver:'OPENED',privateLifetime:'OPENED',system:'OPENING',owners:'CAPTURED',wallet:'CAPTURED'})){
   const row=record.data.sections[name];assert.equal(row.state,expected,'PARTIAL_RESTORE_EXACT_PREFIX');if(Object.hasOwn(a.claims,name))assert.deepEqual(row.claim,a.claims[name]);else assert.equal(row.claim,null);}
  const original=clone(record);original.revision=publication.checkpoint.revision;original.commitment=publication.checkpoint.commitment;original.data.phase='CAPTURED';
  for(const row of Object.values(original.data.sections)){row.state='CAPTURED';row.claim=null;}
  assert.equal(finalizationHash(original),publication.recordSHA256,'PARTIAL_RESTORE_ORIGINAL_CAPSULE_CHANGED');assert.deepEqual(record.data.capturedProcess,marker.producerProcess);
  const terminal=JSON.parse(await readFile(a.evidence.terminal.path,'utf8')),status=JSON.parse(await readFile(a.evidence.status.path,'utf8')),error=JSON.parse(await readFile(a.evidence.error.path,'utf8')),closed=JSON.parse(await readFile(a.evidence.failedClose.path,'utf8'));
  assert.equal(terminal.phase,'reopen');assert.equal(terminal.exitCode,1);assert.equal(terminal.originalGroupAbsent,true);for(const claim of Object.values(a.claims))assert.equal(claim.processId,terminal.process.pid);
  assert.equal(status.step,'REOPEN_ORIGINAL_BOOTSTRAP');assert.equal(status.success,false);assert.equal(status.cleanupErrors,0);assert.equal(status.proofsGenerated,0);assert.equal(error.step,status.step);assert.equal(closed.closed,true);assert.deepEqual(closed.lastKnownCheckpoint,a.predecessorCheckpoint);
  const oldDescriptor=record.data.sections.system.data;assert.equal(oldDescriptor.schema,prefix?'EXTERNAL_DEFI_BOOTSTRAP_SECTION_V2':'EXTERNAL_DEFI_BOOTSTRAP_SECTION_V1');
  if(prefix){assert.equal(oldDescriptor.legacyBinding?.legacyDescriptorSHA256,a.registry.legacyDescriptorSHA256);assert.equal(error.error.message,a.failureCode,'PARTIAL_RESTORE_EXACT_PRE_SYSTEM_FAILURE');}
  else{assert.equal(canonicalDataHash(oldDescriptor),a.registry.legacyDescriptorSHA256);assert.ok(error.error.message.includes(oldDescriptor.stateSHA256)&&error.error.message.includes(a.registry.canonicalStateSHA256),'PARTIAL_RESTORE_EXACT_ENCODING_FAILURE');}
  const lifetime=record.data.sections.privateLifetime.data;assert.deepEqual(lifetime.checkpoint,a.registry.checkpoint);
  const registryIdentity={profile:'WRAPPED_FIXED_PRIVATE_LIFETIME_REGISTRY_V1',...lifetime.input,genesis:record.data.sections.receiver.data.genesis,chainId:String(LOCAL_EVM_PROFILE.chainId)};
  for(const key of ['directory','runId','sourceSHA256','deadlineMs'])assert.equal(lifetime.input[key],a.originalInput[key]);
  const registryDirectory=join(a.originalInput.directory,'private-lifetime-v1');await privateDirectory(registryDirectory);
  await assertNoFile(join(registryDirectory,'registry.active'),'PARTIAL_RESTORE_REGISTRY_STILL_ACTIVE');const registryKey=await privateRead(join(registryDirectory,'local-root.secret'),32);let registry;
  try{registry=await observeClaimRecordStoreV1({path:join(registryDirectory,'registry.vault'),password:registryKey.toString('hex'),identity:registryIdentity});}finally{registryKey.fill(0);}
  let registryRecord;try{registryRecord=await registry.read();assert.deepEqual(checkpoint(registryRecord),a.registry.checkpoint);}finally{registry.close();}
  const part=registryRecord.data.parts['custody-bootstrap'];assert.equal(part.version,a.registry.partVersion);assert.deepEqual(part.identity,oldDescriptor.identity);assert.equal(canonicalDataHash(part.identity),a.registry.partIdentitySHA256);
  assert.equal(canonicalDataHash(part.privateState),a.registry.canonicalStateSHA256);assert.equal(canonicalDataHash(part.privateState.inventory),a.registry.canonicalInventorySHA256);
  const descriptor=prefix?clone(oldDescriptor):{schema:'EXTERNAL_DEFI_BOOTSTRAP_SECTION_V2',hashProfile:'CLAIM_RECORD_CANONICAL_JSON_SHA256_V1',identity:clone(oldDescriptor.identity),stateSHA256:a.registry.canonicalStateSHA256,inventorySHA256:a.registry.canonicalInventorySHA256,
   legacyBinding:{profile:'AUTHENTICATED_V1_TO_CANONICAL_BOOTSTRAP_V2',legacyDescriptorSHA256:a.registry.legacyDescriptorSHA256,registryCheckpoint:clone(a.registry.checkpoint),partIdentitySHA256:a.registry.partIdentitySHA256,partVersion:a.registry.partVersion}};
  const bootstrap=await import('../../../operations/recovery/external-defi-bootstrap-recovery-v1.mjs');bootstrap.assertCanonicalExternalBootstrapSectionV2({descriptor,state:part.privateState,partVersion:part.version,registryCheckpoint:lifetime.checkpoint});
  const priorReceiver=record.data.sections.receiver.data,cwd=priorReceiver.cwd;
  const nativeTerminalBytes=await privateRead(join(cwd,'wrapped-runtime-terminal.json'),1024*1024);assert.equal(bytesHash(nativeTerminalBytes),a.native.terminalSHA256);const receiver=JSON.parse(nativeTerminalBytes.toString());
  assert.equal(receiver.schema,'OWNED_FIXED_EVM_CAPTURE_V1');assert.equal(receiver.family,'receiver');assert.equal(receiver.cwd,cwd);assert.equal(receiver.genesis,priorReceiver.genesis);assert.equal(receiver.processGeneration,a.native.generation);assert.equal(receiver.processGeneration,priorReceiver.processGeneration+1);
  assert.equal(receiver.privateRecord.sha256,a.native.captureSHA256);assert.equal(receiver.terminal.ownedProcessStopped,true);assert.equal(receiver.terminal.forced,false);await assertStoppedNativeFilesV1(cwd,receiver.files);
  const nativeCaptureBytes=await privateRead(join(cwd,receiver.privateRecord.path),64*1024*1024);assert.equal(nativeCaptureBytes.length,receiver.privateRecord.bytes);assert.equal(bytesHash(nativeCaptureBytes),a.native.captureSHA256);
  const repairMarkerBytes=await privateRead(join(cwd,'wrapped-runtime-repair-0-1.json'),8192);assert.equal(bytesHash(repairMarkerBytes),a.native.repairMarkerSHA256);const repairMarker=JSON.parse(repairMarkerBytes.toString());if(prefix){const archived=await privateRead(join(directory,'receiver-generation-'+priorReceiver.processGeneration+'.capture'),64*1024*1024);assert.equal(bytesHash(archived),priorReceiver.privateRecord.sha256);const archivedTerminal=await privateRead(join(directory,'receiver-generation-'+priorReceiver.processGeneration+'.terminal'),1024*1024);assert.deepEqual(JSON.parse(archivedTerminal.toString()),priorReceiver);}
  else assert.equal(repairMarker.captureSHA256,priorReceiver.privateRecord.sha256);
  for(const pin of repairMarker.originalHistory){const bytes=await privateRead(join(cwd,pin.path),64*1024*1024);assert.equal(bytes.length,pin.bytes);assert.equal(bytesHash(bytes),pin.sha256);}
  const eq=JSON.parse(await readFile(a.evidence.equivalence.path,'utf8')),review=JSON.parse(await readFile(a.evidence.equivalenceReview.path,'utf8'));
  assert.equal(eq.schema,'ORIGINAL_RECEIVER_GENERATION_EQUIVALENCE_V1');assert.equal(eq.originalCaptureSHA256,priorReceiver.privateRecord.sha256);assert.equal(eq.currentCaptureSHA256,a.native.captureSHA256);assert.equal(eq.currentTerminalSHA256,a.native.terminalSHA256);assert.equal(eq.allCheckedEqual,true);assert.ok(Object.values(eq.fields).every(x=>x===true)&&Object.values(eq.decodedNativeState).every(x=>x===true));
  if(prefix){
   const processes=eq.processIdentityEvidence;assert.equal(processes?.kind,'DISTINCT_SUPERVISED_PRODUCERS_AND_COMPLETE_GROUP_ABSENCE');assert.equal(processes.receipts.length,2);
   for(const pin of processes.receipts){assert.equal(resolve(pin.path),pin.path);assert.ok(hex(pin.sha256));const raw=await readFile(pin.path);assert.equal(bytesHash(raw),pin.sha256,'PREFIX_PROCESS_RECEIPT_CHANGED');const receipt=JSON.parse(raw.toString());assert.equal(receipt.originalGroupAbsent,true);assert.equal(pin.originalGroupAbsent,true);assert.deepEqual(receipt.process,pin.process);exactRecord(pin.process,['pid','startTicks','pidNamespace','bootId']);assert.ok(Number.isSafeInteger(pin.process.pid)&&pin.process.pid>0);assert.match(pin.process.startTicks,/^[0-9]+$/);assert.ok(typeof pin.process.pidNamespace==='string'&&typeof pin.process.bootId==='string');}
   assert.notDeepEqual(processes.receipts[0].process,processes.receipts[1].process,'PREFIX_DISTINCT_PRODUCER_LIFETIMES_REQUIRED');assert.deepEqual(processes.receipts[1].process,terminal.process);assert.equal(processes.receipts[1].sha256,a.evidence.terminal.sha256);
  }
  assert.equal(review.evidenceSHA256,a.evidence.equivalence.sha256);assert.equal(review.independentlyRecomputed,true);assert.equal(review.allOriginalCredentialsEconomicsHistoryEqual,true);assert.equal(review.onlyOriginalProcessGenerationReadEpochLifecycleAdvance,true);
  return {root,directory,identity:publication.identity,record,descriptor,receiver,nativeTerminalBytes,nativeCaptureBytes};
 }finally{store?.close();await release();}
}
async function assertNoFile(path,code){try{await lstat(path);}catch(error){if(error.code==='ENOENT')return;throw error;}throw Error(code);}
function bootstrapSuccessorOrdinal(a){return a.predecessor?a.predecessor.ordinal+1:1;}
function bootstrapSuccessorStem(a){return 'bootstrap-partial-successor-'+bootstrapSuccessorOrdinal(a);}
function bootstrapPartialIdentity(a){return {profile:EXTERNAL_PARTIAL_PROFILE,...clone(a.originalInput),restoration:{profile:'ORIGINAL_ACTOR_PARTIAL_RESTORATION_V1',generation:bootstrapSuccessorOrdinal(a)+1,permit:clone(a.permit),predecessorPermitSHA256:a.predecessorPermitSHA256,predecessorCheckpoint:clone(a.predecessorCheckpoint),predecessorRecordSHA256:a.predecessorRecordSHA256,originalInventorySHA256:a.originalInventorySHA256,approvedSourceSHA256:finalizationHash(a.approvedSources),migrationSHA256:finalizationHash(a.registry)}};}
async function readBootstrapPartialPublication(a,p){
 const identity=bootstrapPartialIdentity(a),directory=join(p.root,bootstrapSuccessorStem(a));await privateDirectory(directory);
 const marker=await readFinalizationEnvelope(p.root,bootstrapSuccessorStem(a)+'.claim','bootstrap-partial-claim'),publication=await readFinalizationEnvelope(p.root,bootstrapSuccessorStem(a)+'.publication','bootstrap-partial-publication');
 assert.equal(marker.schema,'EXTERNAL_BOOTSTRAP_PARTIAL_CHILD_CLAIM_V1');assert.deepEqual(marker.predecessorCheckpoint,a.predecessorCheckpoint);assert.equal(marker.predecessorRecordSHA256,a.predecessorRecordSHA256);assert.equal(marker.successorIdentitySHA256,finalizationHash(identity));
 assert.equal(publication.schema,'EXTERNAL_BOOTSTRAP_PARTIAL_PUBLICATION_V1');assert.deepEqual(publication.identity,identity);assert.equal(publication.markerSHA256,bytesHash(await privateRead(join(p.root,bootstrapSuccessorStem(a)+'.claim'),8192)));
 assert.equal(bytesHash(await privateRead(join(directory,'receiver-generation-'+a.native.generation+'.capture'),64*1024*1024)),a.native.captureSHA256);assert.equal(bytesHash(await privateRead(join(directory,'receiver-generation-'+a.native.generation+'.terminal'),1024*1024)),a.native.terminalSHA256);
 return {identity,directory,marker,publication};
}
export async function prepareExternalDefiBootstrapPartialSuccessorV1(){assert.equal(arguments.length,0);return prepareBootstrapSuccessor(await bootstrapPartialAdmission());}
export async function prepareExternalDefiBootstrapPrefixContinuationV1(){assert.equal(arguments.length,0);return prepareBootstrapSuccessor(await bootstrapPartialAdmission(true));}
async function prepareBootstrapSuccessor(a){
 const p=await inspectBootstrapPartialPredecessor(a),identity=bootstrapPartialIdentity(a),directory=join(p.root,bootstrapSuccessorStem(a));
 const release=await acquireLease(p.directory,p.identity);let original,store;
 try{
  original=await observeUsingOriginalKey(join(p.directory,'authority.vault'),p.identity,p.root);const current=normalized(await original.read());assert.deepEqual(checkpoint(current),a.predecessorCheckpoint);assert.equal(finalizationHash(current),a.predecessorRecordSHA256,'PARTIAL_RESTORE_PREDECESSOR_CAS');
  const producerProcess=await originalProcess(),marker={schema:'EXTERNAL_BOOTSTRAP_PARTIAL_CHILD_CLAIM_V1',predecessorCheckpoint:a.predecessorCheckpoint,predecessorRecordSHA256:a.predecessorRecordSHA256,successorIdentitySHA256:finalizationHash(identity),producerProcess};
  await exclusiveWrite(join(p.root,bootstrapSuccessorStem(a)+'.claim'),finalizationBytes(await finalizationEnvelope(p.root,'bootstrap-partial-claim',marker)));await syncDirectory(p.root);
  await mkdir(directory,{mode:0o700});await exclusiveWrite(join(directory,'receiver-generation-'+a.native.generation+'.capture'),p.nativeCaptureBytes);await exclusiveWrite(join(directory,'receiver-generation-'+a.native.generation+'.terminal'),p.nativeTerminalBytes);await syncDirectory(directory);await syncDirectory(p.root);
  const sections=clone(p.record.data.sections);for(const row of Object.values(sections)){row.state='CAPTURED';row.claim=null;}sections.receiver.data=clone(p.receiver);sections.system.data=clone(p.descriptor);
  const key=await privateRead(join(p.root,'synthetic-local-root.secret'),32);try{store=await createClaimRecordStore({path:join(directory,'authority.vault'),password:key.toString('hex'),identity},{profile:identity.profile,identity,capturedProcess:producerProcess,phase:'CAPTURED',sections});}finally{key.fill(0);}
  const record=normalized(await store.read());validateRecord(record,identity);const publication={schema:'EXTERNAL_BOOTSTRAP_PARTIAL_PUBLICATION_V1',identity,checkpoint:checkpoint(record),recordSHA256:finalizationHash(record),markerSHA256:bytesHash(await privateRead(join(p.root,bootstrapSuccessorStem(a)+'.claim'),8192))};
  await exclusiveWrite(join(p.root,bootstrapSuccessorStem(a)+'.publication'),finalizationBytes(await finalizationEnvelope(p.root,'bootstrap-partial-publication',publication)));await syncDirectory(p.root);await readBootstrapPartialPublication(a,p);
  return Object.freeze({checkpoint:checkpoint(record),restorationGeneration:bootstrapSuccessorOrdinal(a)+1,originalInventorySHA256:a.originalInventorySHA256,originalDeadlineMs:a.originalInput.deadlineMs,reopenPermitDeadlineMs:a.permit.deadlineMs,effectAuthority:false});
 }finally{original?.close();store?.close();await release();}
}
export async function openExternalDefiBootstrapPartialSuccessorV1(){assert.equal(arguments.length,0);return openBootstrapSuccessor(await bootstrapPartialAdmission());}
export async function openExternalDefiBootstrapPrefixContinuationV1(){assert.equal(arguments.length,0);return openBootstrapSuccessor(await bootstrapPartialAdmission(true));}
async function openBootstrapSuccessor(a){
 const p=await inspectBootstrapPartialPredecessor(a),saved=await readBootstrapPartialPublication(a,p),release=await acquireLease(saved.directory,saved.identity);let store;
 try{
  const key=await privateRead(join(p.root,'synthetic-local-root.secret'),32);try{store=await openClaimRecordStore({path:join(saved.directory,'authority.vault'),password:key.toString('hex'),identity:saved.identity});}finally{key.fill(0);}
  const record=normalized(await store.read());validateRecord(record,saved.identity);assert.deepEqual(checkpoint(record),saved.publication.checkpoint,'PARTIAL_RESTORE_ALREADY_CLAIMED');assert.equal(finalizationHash(record),saved.publication.recordSHA256);
  assert.equal(record.data.phase,'CAPTURED');assert.ok(Object.values(record.data.sections).every(row=>row.state==='CAPTURED'&&row.claim===null));assert.deepEqual(record.data.capturedProcess,saved.marker.producerProcess);assert.notDeepEqual(record.data.capturedProcess,await originalProcess(),'PARTIAL_RESTORE_NEW_PROCESS_REQUIRED');
  const authority=opaque();authorities.set(authority,{directory:saved.directory,identity:saved.identity,store,record,release,busy:false,operation:null,closed:false,fault:false,creating:false});return authority;
 }catch(error){store?.close();await release();throw error;}
}

// Capture lineage is original custody retention. A restoration permit is kept
// in the live authority state and never rewrites the retained financial terms.
function originalExternalInput(identity) {
  return {directory: identity.directory, runId: identity.runId,
    sourceSHA256: identity.sourceSHA256, deadlineMs: identity.deadlineMs};
}
function validateLineageIdentity(identity, expectedInput) {
  exactRecord(identity, ['profile','directory','runId','sourceSHA256','deadlineMs','lineage']);
  assert.equal(identity.profile, EXTERNAL_LINEAGE_PROFILE);
  const input = originalExternalInput(identity);
  identityOf(input, false, false, true);
  if (expectedInput) assert.deepEqual(input, expectedInput, 'LINEAGE_ORIGINAL_ATTEMPT');
  const row = identity.lineage;
  exactRecord(row, ['profile','generation','predecessorIdentitySHA256','predecessorCheckpoint',
    'predecessorRecordSHA256','predecessorPublicationSHA256','inventorySHA256','captureSourceSHA256']);
  assert.equal(row.profile, 'ORIGINAL_ACTOR_CAPTURE_LINEAGE_V1');
  assert.ok(Number.isSafeInteger(row.generation) && row.generation >= 1 && row.generation <= 1024);
  for (const name of ['predecessorIdentitySHA256','predecessorRecordSHA256','inventorySHA256','captureSourceSHA256']) assert.ok(hex(row[name]));
  assert.ok(row.predecessorPublicationSHA256 === null || hex(row.predecessorPublicationSHA256));
  exactRecord(row.predecessorCheckpoint, ['revision','commitment']);
  assert.ok(Number.isSafeInteger(row.predecessorCheckpoint.revision) && row.predecessorCheckpoint.revision >= 0);
  assert.ok(hex(row.predecessorCheckpoint.commitment));
  return clone(identity);
}
function authorityReopenDeadline(s) {
  if (s.identity.profile !== EXTERNAL_LINEAGE_PROFILE) return reopenDeadline(s.identity);
  const permit = s.restorationPermit;
  assert.ok(permit && permit.effectAuthority === false && permit.scope === 'RESTORE_ORIGINAL_ACTORS_ONLY', 'LINEAGE_RESTORE_PERMIT_REQUIRED');
  assert.ok(Date.now() >= permit.issuedAtMs, 'LINEAGE_RESTORE_PERMIT_NOT_YET_VALID');
  return permit.deadlineMs;
}
async function assertNoCaptureChild(directory) {
  try { await lstat(join(directory, 'capture-lineage-child.claim')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  assert.fail('LINEAGE_PREDECESSOR_ALREADY_ADOPTED');
}
function nextLineageIdentity(predecessor, inventorySHA256, publicationSHA256, captureSourceSHA256) {
  assert.ok(hex(inventorySHA256));
  return validateLineageIdentity({profile: EXTERNAL_LINEAGE_PROFILE,
    ...originalExternalInput(predecessor.data.identity), lineage: {
      profile: 'ORIGINAL_ACTOR_CAPTURE_LINEAGE_V1',
      generation: predecessor.data.identity.profile === EXTERNAL_LINEAGE_PROFILE
        ? predecessor.data.identity.lineage.generation + 1 : 1,
      predecessorIdentitySHA256: finalizationHash(predecessor.data.identity),
      predecessorCheckpoint: checkpoint(predecessor),
      predecessorRecordSHA256: finalizationHash(predecessor),
      predecessorPublicationSHA256: publicationSHA256,
      inventorySHA256, captureSourceSHA256
    }});
}
function sourceKeyDirectory(s) {
  return [EXTERNAL_PARTIAL_PROFILE, EXTERNAL_REPAIR_PROFILE].includes(s.identity.profile)
    ? join(s.identity.directory, 'recovery') : s.directory;
}
async function createLineageChild(s, identity, capturedSections) {
  const childDirectory = finalizationDirectory(identity);
  const marker = {schema: 'ORIGINAL_CAPTURE_SINGLE_CHILD_V1', identity,
    predecessorCheckpoint: checkpoint(s.record), predecessorRecordSHA256: finalizationHash(s.record),
    producerProcess: await originalProcess(), childDirectory};
  // The exclusive, synced predecessor marker is the CAS. Any uncertain write
  // permanently blocks ordinary reopening; no fallback creates replacement actors.
  await assertNoCaptureChild(s.directory);
  const key = await privateRead(join(sourceKeyDirectory(s), 'synthetic-local-root.secret'), 32);
  let release, store;
  try {
    const envelope = {payload: marker, authenticator: createHmac('sha256', key)
      .update('ORIGINAL_CAPTURE_SINGLE_CHILD_V1\0').update(canonicalFinalization(marker)).digest('hex')};
    await exclusiveWrite(join(s.directory, 'capture-lineage-child.claim'), finalizationBytes(envelope));
    await syncDirectory(s.directory);
    await mkdir(childDirectory, {mode: 0o700});
    await syncDirectory(join(s.identity.directory, 'recovery'));
    await exclusiveWrite(join(childDirectory, 'synthetic-local-root.secret'), key);
    await exclusiveWrite(join(childDirectory, 'original-parent.claim'), finalizationBytes(envelope));
    await syncDirectory(childDirectory);
    release = await acquireLease(childDirectory, identity);
    store = await createClaimRecordStore({path: join(childDirectory, 'authority.vault'),
      password: key.toString('hex'), identity}, {
      profile: identity.profile, identity, capturedProcess: await originalProcess(), phase: 'CAPTURING',
      sections: capturedSections ?? Object.fromEntries(sectionsFor(identity).map(name => [name, null]))
    });
    const record = normalized(await store.read());
    validateRecord(record, identity);
    const authority = opaque();
    authorities.set(authority, {directory: childDirectory, identity, store, record, release,
      busy: false, operation: null, closed: false, fault: false, creating: true});
    return authority;
  } catch (error) {
    s.fault = true;
    try { store?.close(); } finally { if (release) await release(); }
    throw error;
  } finally { key.fill(0); }
}
export async function createExternalDefiSuccessorCaptureV1(authority, inventorySHA256) {
  assert.equal(arguments.length, 2);
  externalAuthority(authority);
  const s = state(authority);
  assert.equal(s.creating, false, 'LINEAGE_REQUIRES_ORIGINAL_REOPENED_AUTHORITY');
  assert.equal(s.record.data.phase, 'REOPENING');
  assert.ok(sectionsFor(s.identity).every(name => s.record.data.sections[name]?.state === 'OPENED'), 'LINEAGE_ALL_ORIGINAL_ACTORS_REQUIRED');
  s.operation = opaque();
  try {
    const actual = normalized(await s.store.read());
    validateRecord(actual, s.identity);
    assert.deepEqual(actual, s.record, 'LINEAGE_PREDECESSOR_CHANGED');
    const fresh = [EXTERNAL_PROFILE, EXTERNAL_FUNDED_PROFILE].includes(s.identity.profile);
    const source = fresh
      ? await originalFreshCaptureSource(s.identity)
      : s.executionSourceSHA256 ?? s.identity.restoration?.approvedSourceSHA256;
    assert.ok(hex(source), 'LINEAGE_ORIGINAL_EXECUTION_SOURCE_REQUIRED');
    const identity = nextLineageIdentity(actual, inventorySHA256, null, source);
    return await createLineageChild(s, identity, null);
  } finally { s.operation = null; }
}

async function captureLineageAdmission() {
  const {readExternalCaptureLineageAdmissionV1} = await import('../../authorization/external-capture-lineage-admission-v1.mjs');
  const a = readExternalCaptureLineageAdmissionV1();
  exactRecord(a, ['schema','mode','originalInput','inventorySHA256','capture','openedPredecessor','evidence','approvedSources','permit']);
  assert.equal(a.schema, 'EXTERNAL_CAPTURE_LINEAGE_ADMISSION_V1');
  assert.ok(['ADOPT_COMPLETED_ORIGINAL_CAPTURE','OPEN_LINEAGE_CAPTURE'].includes(a.mode));
  identityOf(a.originalInput, false, false, true);
  assert.ok(hex(a.inventorySHA256));
  exactRecord(a.capture, ['generation','checkpoint','recordSHA256','publicationSHA256']);
  assert.ok(Number.isSafeInteger(a.capture.generation) && a.capture.generation >= 0 && a.capture.generation <= 1024);
  assert.equal(a.mode === 'ADOPT_COMPLETED_ORIGINAL_CAPTURE', a.capture.generation === 0);
  assert.ok(hex(a.capture.recordSHA256) && hex(a.capture.publicationSHA256));
  exactRecord(a.capture.checkpoint, ['revision','commitment']);
  assert.ok(Number.isSafeInteger(a.capture.checkpoint.revision) && hex(a.capture.checkpoint.commitment));
  if (a.mode === 'ADOPT_COMPLETED_ORIGINAL_CAPTURE') {
    exactRecord(a.openedPredecessor, ['ordinal','checkpoint','recordSHA256','publicationSHA256']);
    assert.ok(Number.isSafeInteger(a.openedPredecessor.ordinal) && a.openedPredecessor.ordinal >= 1 && a.openedPredecessor.ordinal <= 9);
    assert.ok(hex(a.openedPredecessor.recordSHA256) && hex(a.openedPredecessor.publicationSHA256));
    exactRecord(a.evidence, ['result','ready','status','terminal','stageSource']);
  } else {
    assert.equal(a.openedPredecessor, null);
    exactRecord(a.evidence, ['terminal']);
  }
  assert.ok(Array.isArray(a.approvedSources) && a.approvedSources.length >= 2 && a.approvedSources.length <= 16);
  assert.equal(new Set(a.approvedSources.map(row => row.path)).size, a.approvedSources.length);
  for (const pin of [...a.approvedSources, ...Object.values(a.evidence)]) {
    exactRecord(pin, ['path','sha256']); assert.equal(resolve(pin.path), pin.path); assert.ok(hex(pin.sha256));
    const st = await lstat(pin.path); assert.ok(st.isFile() && !st.isSymbolicLink() && st.nlink === 1 && st.size <= 8 * 1024 * 1024);
    assert.equal(bytesHash(await readFile(pin.path)), pin.sha256, 'LINEAGE_ADMISSION_PIN_CHANGED');
  }
  const cleanup = JSON.parse(await readFile(a.evidence.terminal.path, 'utf8'));
  assert.equal(cleanup.originalGroupAbsent, true, 'LINEAGE_ORIGINAL_GROUP_ABSENCE_REQUIRED');
  assert.equal(cleanup.exitCode, 0, 'LINEAGE_COMPLETED_CAPTURE_PROCESS_REQUIRED');
  exactRecord(cleanup.process, ['pid','startTicks','pidNamespace','bootId']);
  assert.ok(Number.isSafeInteger(cleanup.process.pid) && cleanup.process.pid > 0);
  assert.match(cleanup.process.startTicks, /^[0-9]+$/);
  assert.ok(typeof cleanup.process.pidNamespace === 'string' && cleanup.process.pidNamespace.length > 0);
  assert.ok(typeof cleanup.process.bootId === 'string' && cleanup.process.bootId.length > 0);
  for (const pin of a.approvedSources) assert.ok(pin.path.startsWith(FIXED_WALLET_ROOT + '/') && pin.path.endsWith('.mjs'));
  exactRecord(a.permit, ['id','issuedAtMs','deadlineMs','scope','effectAuthority']);
  assert.ok(hex(a.permit.id)); assert.equal(a.permit.scope, 'RESTORE_ORIGINAL_ACTORS_ONLY'); assert.equal(a.permit.effectAuthority, false);
  assert.ok(Number.isSafeInteger(a.permit.issuedAtMs) && Number.isSafeInteger(a.permit.deadlineMs));
  assert.ok(a.permit.deadlineMs > a.permit.issuedAtMs && a.permit.deadlineMs - a.permit.issuedAtMs <= 3600000);
  assert.ok(Date.now() >= a.permit.issuedAtMs && Date.now() < a.permit.deadlineMs, 'LINEAGE_RESTORE_PERMIT_EXPIRED');
  return a;
}
async function inspectFullyOpenedPartialPredecessor(a) {
  const root = join(a.originalInput.directory, 'recovery');
  const stem = 'bootstrap-partial-successor-' + a.openedPredecessor.ordinal;
  const publicationBytes = await privateRead(join(root, stem + '.publication'), 8192);
  assert.equal(bytesHash(publicationBytes), a.openedPredecessor.publicationSHA256);
  const pub = await readFinalizationEnvelope(root, stem + '.publication', 'bootstrap-partial-publication');
  assert.equal(pub.identity.profile, EXTERNAL_PARTIAL_PROFILE);
  assert.deepEqual(originalExternalInput(pub.identity), a.originalInput);
  const directory = join(root, stem), release = await acquireLease(directory, pub.identity);
  let store;
  try {
    store = await observeUsingOriginalKey(join(directory, 'authority.vault'), pub.identity, root);
    const record = normalized(await store.read()); validateRecord(record, pub.identity);
    assert.deepEqual(checkpoint(record), a.openedPredecessor.checkpoint);
    assert.equal(finalizationHash(record), a.openedPredecessor.recordSHA256);
    assert.equal(record.revision, pub.checkpoint.revision + 10, 'LINEAGE_COMPLETE_OPEN_HISTORY_REQUIRED');
    assert.equal(record.data.phase, 'REOPENING');
    for (const row of Object.values(record.data.sections)) assert.equal(row.state, 'OPENED');
    const before = clone(record); before.revision = pub.checkpoint.revision; before.commitment = pub.checkpoint.commitment;
    before.data.phase = 'CAPTURED'; for (const row of Object.values(before.data.sections)) { row.state = 'CAPTURED'; row.claim = null; }
    assert.equal(finalizationHash(before), pub.recordSHA256, 'LINEAGE_OPENED_PREDECESSOR_MUTATED');
    const [result, ready, status, terminal] = await Promise.all(['result','ready','status','terminal'].map(async key => JSON.parse(await readFile(a.evidence[key].path, 'utf8'))));
    assert.equal(result.originalActorsMatched, true); assert.equal(result.actualFreshProcess, true);
    assert.equal(result.effectGrantUsed, false); assert.equal(result.proofsGenerated, 0); assert.equal(result.originalProcessesCaptured, true);
    assert.equal(result.finalInventorySHA256, a.inventorySHA256);
    assert.equal(ready.inventorySHA256, result.inventorySHA256); assert.equal(ready.unfunded, true); assert.equal(ready.proofsGenerated, 0);
    assert.equal(ready.originSourceSHA256, a.originalInput.sourceSHA256);
    assert.equal(status.success, true); assert.equal(status.cleanupErrors, 0); assert.equal(status.proofsGenerated, 0);
    assert.equal(terminal.originalGroupAbsent, true); assert.equal(terminal.exitCode, 0); assert.deepEqual(terminal.process, ready.process);
    for (const row of Object.values(record.data.sections)) assert.equal(row.claim.processId, ready.process.pid);
    return record;
  } finally { store?.close(); await release(); }
}
async function readLineagePublication(directory, input, expectedCapture, inventorySHA256) {
  const raw = await privateRead(join(directory, 'external-publication.intent'), 8192);
  assert.equal(bytesHash(raw), expectedCapture.publicationSHA256, 'LINEAGE_CAPTURE_PUBLICATION_CHANGED');
  const pub = await readFinalizationEnvelope(directory, 'external-publication.intent', 'external-publication');
  exactRecord(pub, ['schema','identity','inventorySHA256','finalizationIntent']);
  assert.equal(pub.schema, 'EXTERNAL_DEFI_CAPTURE_PUBLICATION_V1');
  assert.deepEqual(originalExternalInput(pub.identity), input); assert.equal(pub.inventorySHA256, inventorySHA256);
  assert.equal(finalizationDirectory(pub.identity), directory);
  const sealed = await reconcileWrappedRecoveryFinalizationV1(input, pub.finalizationIntent);
  assert.deepEqual(sealed.checkpoint, expectedCapture.checkpoint);
  return pub;
}
export async function prepareExternalDefiCompletedCaptureAdoptionV1() {
  assert.equal(arguments.length, 0);
  const a = await captureLineageAdmission(); assert.equal(a.mode, 'ADOPT_COMPLETED_ORIGINAL_CAPTURE');
  await inspectFullyOpenedPartialPredecessor(a);
  const directory = join(a.originalInput.directory, 'funded-recovery');
  const pub = await readLineagePublication(directory, a.originalInput, a.capture, a.inventorySHA256);
  assert.equal(pub.identity.profile, EXTERNAL_FUNDED_PROFILE);
  const release = await acquireLease(directory, pub.identity); let store, child;
  try {
    await assertNoCaptureChild(directory);
    store = await observeUsingOriginalKey(join(directory, 'authority.vault'), pub.identity, directory);
    const record = normalized(await store.read()); validateRecord(record, pub.identity);
    assert.deepEqual(checkpoint(record), a.capture.checkpoint); assert.equal(finalizationHash(record), a.capture.recordSHA256);
    await assertCaptureProducer(record, a.evidence.terminal);
    assert.equal(record.data.phase, 'CAPTURED');
    assert.ok(Object.values(record.data.sections).every(row => row.state === 'CAPTURED' && row.claim === null));
    const s = {directory, identity: pub.identity, record, fault: false};
    const identity = nextLineageIdentity(record, a.inventorySHA256, a.capture.publicationSHA256, finalizationHash(a.approvedSources));
    child = await createLineageChild(s, identity, clone(record.data.sections));
    const result = await publishExternalDefiRecoveryCaptureV1(child, a.inventorySHA256); child = null;
    return Object.freeze({...result, captureGeneration: identity.lineage.generation, effectAuthority: false});
  } finally {
    if (child) await closeWrappedRecoveryAuthorityV1(child);
    store?.close(); await release();
  }
}
export async function openExternalDefiCaptureLineageV1() {
  assert.equal(arguments.length, 0);
  const a = await captureLineageAdmission();
  const generation = a.mode === 'ADOPT_COMPLETED_ORIGINAL_CAPTURE' ? 1 : a.capture.generation;
  const directory = join(a.originalInput.directory, 'recovery', 'capture-lineage-' + generation);
  const pub = await readFinalizationEnvelope(directory, 'external-publication.intent', 'external-publication');
  validateLineageIdentity(pub.identity, a.originalInput);
  assert.equal(pub.identity.lineage.generation, generation); assert.equal(pub.inventorySHA256, a.inventorySHA256);
  if (a.mode === 'ADOPT_COMPLETED_ORIGINAL_CAPTURE') {
    await inspectFullyOpenedPartialPredecessor(a);
    assert.equal(pub.identity.lineage.predecessorRecordSHA256, a.capture.recordSHA256);
    assert.deepEqual(pub.identity.lineage.predecessorCheckpoint, a.capture.checkpoint);
    assert.equal(pub.identity.lineage.predecessorPublicationSHA256, a.capture.publicationSHA256);
  } else {
    await readLineagePublication(directory, a.originalInput, a.capture, a.inventorySHA256);
  }
  await assertLineageParentMarker(directory, pub.identity);
  const sealed = await reconcileWrappedRecoveryFinalizationV1(a.originalInput, pub.finalizationIntent);
  const release = await acquireLease(directory, pub.identity); let store;
  try {
    await assertNoCaptureChild(directory);
    store = await observeUsingOriginalKey(join(directory, 'authority.vault'), pub.identity, directory);
    // Reopen through the writable store only after all public/immutable bindings.
    const observed = normalized(await store.read()); store.close(); store = null;
    validateRecord(observed, pub.identity); assert.deepEqual(checkpoint(observed), sealed.checkpoint);
    const receiver = observed.data.sections.receiver.data;
    assert.equal(bytesHash(await privateRead(join(directory, 'receiver-original.capture'), 64 * 1024 * 1024)), receiver.privateRecord.sha256);
    assert.deepEqual(JSON.parse((await privateRead(join(directory, 'receiver-original.terminal'), 1024 * 1024)).toString()), receiver);
    assert.equal(finalizationHash(observed.data), pub.finalizationIntent.targetRecordSHA256);
    if (a.mode === 'OPEN_LINEAGE_CAPTURE') {
      assert.equal(finalizationHash(observed), a.capture.recordSHA256);
      await assertCaptureProducer(observed, a.evidence.terminal);
    }
    assert.notDeepEqual(observed.data.capturedProcess, await originalProcess(), 'LINEAGE_NEW_PROCESS_REQUIRED');
    const key = await privateRead(join(directory, 'synthetic-local-root.secret'), 32);
    try { store = await openClaimRecordStore({path: join(directory, 'authority.vault'), password: key.toString('hex'), identity: pub.identity}); }
    finally { key.fill(0); }
    const actual = normalized(await store.read()); assert.deepEqual(actual, observed);
    const authority = opaque(); authorities.set(authority, {directory, identity: pub.identity, store,
      record: actual, release, busy: false, operation: null, closed: false, fault: false,
      creating: false, restorationPermit: clone(a.permit), executionSourceSHA256: finalizationHash(a.approvedSources)});
    return authority;
  } catch (error) { store?.close(); await release(); throw error; }
}
async function preserveLineageReceiverArchive(s) {
  const receiver = s.record.data.sections.receiver.data;
  assert.equal(receiver.schema, 'OWNED_FIXED_EVM_CAPTURE_V1'); assert.equal(receiver.family, 'receiver');
  assert.equal(receiver.terminal.ownedProcessStopped, true); assert.equal(receiver.terminal.forced, false);
  await assertStoppedNativeFilesV1(receiver.cwd, receiver.files);
  const raw = await privateRead(join(receiver.cwd, receiver.privateRecord.path), 64 * 1024 * 1024);
  assert.equal(raw.length, receiver.privateRecord.bytes); assert.equal(bytesHash(raw), receiver.privateRecord.sha256);
  const terminal = await privateRead(join(receiver.cwd, 'wrapped-runtime-terminal.json'), 1024 * 1024);
  assert.deepEqual(JSON.parse(terminal.toString()), receiver);
  await exclusiveWrite(join(s.directory, 'receiver-original.capture'), raw);
  await exclusiveWrite(join(s.directory, 'receiver-original.terminal'), terminal);
  await syncDirectory(s.directory);
}
async function assertLineageParentMarker(directory, identity) {
  const raw = await privateRead(join(directory, 'original-parent.claim'), 8192);
  const envelope = JSON.parse(raw.toString()); exactRecord(envelope, ['payload','authenticator']);
  const key = await privateRead(join(directory, 'synthetic-local-root.secret'), 32);
  try { assert.equal(envelope.authenticator, createHmac('sha256', key).update('ORIGINAL_CAPTURE_SINGLE_CHILD_V1\0').update(canonicalFinalization(envelope.payload)).digest('hex')); }
  finally { key.fill(0); }
  const marker = envelope.payload;
  exactRecord(marker, ['schema','identity','predecessorCheckpoint','predecessorRecordSHA256','producerProcess','childDirectory']);
  assert.equal(marker.schema, 'ORIGINAL_CAPTURE_SINGLE_CHILD_V1'); assert.deepEqual(marker.identity, identity);
  assert.equal(marker.childDirectory, directory);
  assert.deepEqual(marker.predecessorCheckpoint, identity.lineage.predecessorCheckpoint);
  assert.equal(marker.predecessorRecordSHA256, identity.lineage.predecessorRecordSHA256);
  // Parent location is authenticated separately below; never accept a caller path.
  const candidates = [join(identity.directory, 'funded-recovery'), join(identity.directory, 'recovery'), join(identity.directory, 'recovery', 'receiver-preopen-repair-1'), ...Array.from({length: 9}, (_, index) => join(identity.directory, 'recovery', 'bootstrap-partial-successor-' + (index + 1)))];
  if (identity.lineage.generation > 1) candidates.splice(0, candidates.length, join(identity.directory, 'recovery', 'capture-lineage-' + (identity.lineage.generation - 1)));
  let found = 0;
  for (const parent of candidates) {
    try { const parentRaw = await privateRead(join(parent, 'capture-lineage-child.claim'), 8192); if (bytesHash(parentRaw) === bytesHash(raw)) found++; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  assert.equal(found, 1, 'LINEAGE_EXACT_ORIGINAL_PARENT_MARKER_REQUIRED');
}

async function assertCaptureProducer(record, terminalPin) {
  const raw = await readFile(terminalPin.path);
  assert.equal(bytesHash(raw), terminalPin.sha256, 'LINEAGE_CAPTURE_TERMINAL_CHANGED');
  const terminal = JSON.parse(raw.toString());
  assert.equal(terminal.originalGroupAbsent, true);
  assert.equal(terminal.exitCode, 0);
  assert.deepEqual(record.data.capturedProcess, {pid: terminal.process.pid, startTicks: terminal.process.startTicks}, 'LINEAGE_EXACT_CAPTURE_PRODUCER_REQUIRED');
}

/** A fixed deployment admission supplies current static source pins. The
 * configured admission is excluded from its own digest; the supervisor's full
 * source freeze binds it. No request may select a source or restoration permit. */
async function originalFreshCaptureSource(identity) {
  assert.ok([EXTERNAL_PROFILE, EXTERNAL_FUNDED_PROFILE].includes(identity.profile));
  const {readExternalFreshCaptureAdmissionV1} = await import('../../authorization/external-fresh-capture-admission-v1.mjs');
  const admission = readExternalFreshCaptureAdmissionV1();
  exactRecord(admission, ['schema','approvedSources']);
  assert.equal(admission.schema, 'EXTERNAL_FRESH_CAPTURE_SOURCE_ADMISSION_V1');
  const rows = admission.approvedSources;
  assert.ok(Array.isArray(rows) && rows.length >= 1 && rows.length <= 16);
  assert.equal(new Set(rows.map(row => row.path)).size, rows.length);
  assert.ok(rows.some(row => row.path === fileURLToPath(import.meta.url)), 'FRESH_CAPTURE_AUTHORITY_SOURCE_REQUIRED');
  for (const row of rows) {
    exactRecord(row, ['path','sha256']);
    assert.equal(resolve(row.path), row.path);
    assert.ok(row.path.startsWith(FIXED_WALLET_ROOT + '/') && row.path.endsWith('.mjs'));
    assert.ok(!row.path.endsWith('/external-fresh-capture-admission-v1.mjs'), 'FRESH_CAPTURE_NONCIRCULAR_SOURCE_SET');
    assert.ok(hex(row.sha256));
    const info = await lstat(row.path);
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size <= 8 * 1024 * 1024);
    assert.equal(bytesHash(await readFile(row.path)), row.sha256, 'FRESH_CAPTURE_EXECUTION_SOURCE_CHANGED');
  }
  return finalizationHash({profile: 'ORIGINAL_EXTERNAL_FRESH_CAPTURE_SOURCE_V1',
    originalSourceSHA256: identity.sourceSHA256,
    approvedExecutionSourcesSHA256: finalizationHash(rows)});
}


/** Separate native OBSERVE-only issuer. These two sections are produced only
 * by original same-realm references. Wrapped tokens cannot open this profile. */
function nativeD26Identity(input) {
 exactRecord(input,['directory','runId','sourceSHA256','deadlineMs']);
 assert.match(input.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(input.directory,join(FIXED_WALLET_ROOT,'.local/mobile-device-d26-observation-recovery-v1','attempt-'+input.runId,'private-audit'),'NATIVE_D26_FIXED_PRIVATE_DIRECTORY');
 assert.ok(hex(input.sourceSHA256)&&Number.isSafeInteger(input.deadlineMs)&&input.deadlineMs>0,'NATIVE_D26_RECOVERY_IDENTITY');
 return {profile:NATIVE_D26_PROFILE,...input};
}
export function createNativeDeviceD26ObservationRecoveryV1(input) {
 assert.equal(arguments.length,1);return authorityFactory(input,null,true,false,false,false,true);
}
export function openNativeDeviceD26ObservationRecoveryV1(input,expectedCheckpoint) {
 assert.equal(arguments.length,2);return authorityFactory(input,expectedCheckpoint,false,false,false,false,true);
}
function nativeD26Authority(authority) {
 const s=state(authority);assert.equal(s.identity.profile,NATIVE_D26_PROFILE,'NATIVE_D26_ORIGINAL_RECOVERY_AUTHORITY');return s;
}
export async function retainNativeDeviceD26ObservationRecoveryV1(authority,input) {
 assert.equal(arguments.length,2);exactRecord(input,['actor','account','runtime','system','jobId']);
 const s=nativeD26Authority(authority);assert.equal(s.creating,true);
 assert.equal(capturedRuntimeOwners.has(input.runtime),false,'NATIVE_D26_RUNTIME_ALREADY_ASSIGNED');
 capturedRuntimeOwners.set(input.runtime,authority);
 await fixedCapture(authority,'deviceD26',async token=>{
  const m=await import('../../../accounts/authority/native-value-account-authority-v2.mjs');
  const data=await m.captureOriginalDeviceD26ObservationV1(input);
  assert.equal(data.system.retainedHostSourceSHA256,s.identity.sourceSHA256,'NATIVE_D26_RECOVERY_ORIGINAL_SOURCE_CAPSULE');
  await retainOriginalWrappedRecoverySectionV1(token,'deviceD26',data);
  return {retained:true,originalResourcesStopped:true};
 });
 await fixedCapture(authority,'receiver',async token=>{
  const m=await import('../../../chains/evm/runtime/owned-evm-v2-runtime.mjs');
  const data=await m.captureOwnedEvmRecoveryV1(input.runtime);
  assert.equal(data.family,'receiver');assert.deepEqual(data.terminal,{ownedProcessStopped:true,forced:false});
  await retainOriginalWrappedRecoverySectionV1(token,'receiver',data);
  return {retained:true,originalResourcesStopped:true};
 });
 return finishWrappedRecoveryCaptureV1(authority);
}
export function consumeNativeD26ObservationSectionV1(token,section) {
 assert.equal(arguments.length,2);const r=reads.get(token);
 assert.equal(r?.s.identity.profile,NATIVE_D26_PROFILE,'NATIVE_D26_DISTINCT_RECOVERY_TOKEN');
 assert.ok(['receiver','deviceD26'].includes(section));return consumeOriginalWrappedRecoverySectionV1(token,section);
}
export async function reopenNativeDeviceD26ObservationV1(authority) {
 assert.equal(arguments.length,1);nativeD26Authority(authority);
 // Durable OPENING precedes each original reopen. A failed open is never reset.
 const runtime=await fixedReopen(authority,'receiver',async token=>{
  const m=await import('../../../chains/evm/runtime/owned-evm-v2-runtime.mjs');
  return m.reopenOwnedNativeD26ObservationReceiverV1(token);
 },value=>value.close());
 try {
  const observation=await fixedReopen(authority,'deviceD26',async token=>{
   const m=await import('../../../accounts/authority/device-d26-observation-recovery-v1.mjs');
   return m.createRecoveredDeviceD26ObservationV1(token,runtime);
  },value=>value.close());
  await closeWrappedRecoveryAuthorityV1(authority);return observation;
 }catch(error){try{await runtime.close();}catch(cleanup){throw new AggregateError([error,cleanup],'NATIVE_D26_REOPEN_AND_CLOSE_FAILED',{cause:error});}throw error;}
}
export function closeNativeDeviceD26ObservationRecoveryV1(authority) {
 assert.equal(arguments.length,1);const s=authorities.get(authority);
 assert.equal(s?.identity.profile,NATIVE_D26_PROFILE,'NATIVE_D26_ORIGINAL_RECOVERY_AUTHORITY');
 return closeWrappedRecoveryAuthorityV1(authority);
}


/** Native economic provider sections have a distinct issuer and one-use token.
 * Reopening still requires original native economic system/bootstrap/runtime
 * references; neither a wrapped token nor the D26 observation brand qualifies. */
function nativeProviderIdentity(input){
 exactRecord(input,['directory','runId','sourceSHA256','deadlineMs']);
 assert.match(input.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(input.directory,join(FIXED_WALLET_ROOT,'.local/native-provider-economic-recovery-v1','attempt-'+input.runId,'private-audit'),'NATIVE_PROVIDER_FIXED_PRIVATE_DIRECTORY');
 assert.ok(hex(input.sourceSHA256)&&Number.isSafeInteger(input.deadlineMs)&&input.deadlineMs>0,'NATIVE_PROVIDER_RECOVERY_IDENTITY');
 return {profile:NATIVE_PROVIDER_PROFILE,...input};
}
export function createNativeProviderRecoveryAuthorityV1(input){
 assert.equal(arguments.length,1);return authorityFactory(input,null,true,false,false,false,false,true);
}
export function openNativeProviderRecoveryAuthorityV1(input,expectedCheckpoint){
 assert.equal(arguments.length,2);return authorityFactory(input,expectedCheckpoint,false,false,false,false,false,true);
}
export function assertNativeProviderRecoveryAuthorityV1(authority){
 assert.equal(arguments.length,1);const s=state(authority);assert.ok([NATIVE_PROVIDER_PROFILE,NATIVE_ECONOMIC_PROFILE].includes(s.identity.profile),'NATIVE_PROVIDER_DISTINCT_RECOVERY_AUTHORITY');
 assert.equal(s.creating,true);assert.equal(s.record.data.phase,'CAPTURING');assert.equal(s.record.data.sections.provider,null,'NATIVE_PROVIDER_CAPTURE_ONCE');
 return Object.freeze(clone(s.identity));
}
export function nativeProviderRecoverySectionIdentityV1(token){
 assert.equal(arguments.length,1);const identity=nativeAbortTokens.has(token)?nativeEconomicRecoverySectionIdentityV1(token,'provider'):originalWrappedRecoverySectionIdentityV1(token,'provider');
 assert.ok([NATIVE_PROVIDER_PROFILE,NATIVE_ECONOMIC_PROFILE].includes(identity.profile),'NATIVE_PROVIDER_DISTINCT_RECOVERY_TOKEN');return identity;
}
export function consumeNativeProviderRecoverySectionV1(token){
 assert.equal(arguments.length,1);nativeProviderRecoverySectionIdentityV1(token);return consumeOriginalWrappedRecoverySectionV1(token,'provider');
}
// The custody entry point must have fenced the original provider synchronously.
// This issuer invokes fixed producers; no caller callback can supply a section.
export async function retainNativeProviderRecoveryV1(authority,custody){
 assert.equal(arguments.length,2);assertNativeProviderRecoveryAuthorityV1(authority);
 await fixedCapture(authority,'provider',async token=>{
  const m=await import('../../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs');
  try{const retained=await m.captureOriginalNativeProviderEconomicRecoveryV1(custody,token);
   assert.equal(retained.sourceSHA256,nativeProviderRecoverySectionIdentityV1(token).sourceSHA256,'NATIVE_PROVIDER_CAPTURE_ORIGINAL_SOURCE');
   await retainOriginalWrappedRecoverySectionV1(token,'provider',retained);
   assert.deepEqual(await m.stopCapturedNativeProviderEconomicRecoveryV1(custody,token),{closed:true,originalPrivateStateRetained:true});
   return {retained:true,originalResourcesStopped:true};
  }catch(error){try{await m.abortNativeProviderEconomicRecoveryV1(custody,token);}catch(cleanup){throw new AggregateError([error,cleanup],'NATIVE_PROVIDER_CAPTURE_AND_CLOSE_FAILED',{cause:error});}throw error;}
 });
 return finishWrappedRecoveryCaptureV1(authority);
}
export async function reopenNativeProviderFromAuthorityV1(authority,contexts){
 assert.equal(arguments.length,2);exactRecord(contexts,['runtime','system','nativeRuntime','bootstrap']);
 assert.equal(state(authority).identity.profile,NATIVE_PROVIDER_PROFILE,'NATIVE_PROVIDER_DISTINCT_RECOVERY_AUTHORITY');
 const custody=await fixedReopen(authority,'provider',async token=>{
  const m=await import('../../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs');return m.reopenOriginalNativeProviderEconomicRecoveryV1(token,contexts);
 },value=>value.close());
 try{await closeWrappedRecoveryAuthorityV1(authority);return custody;}
 catch(error){try{await custody.close();}catch(cleanup){throw new AggregateError([error,cleanup],'NATIVE_PROVIDER_REOPEN_AND_CLOSE_FAILED',{cause:error});}throw error;}
}
export function closeNativeProviderRecoveryAuthorityV1(authority){
 assert.equal(arguments.length,1);assert.equal(authorities.get(authority)?.identity.profile,NATIVE_PROVIDER_PROFILE,'NATIVE_PROVIDER_DISTINCT_RECOVERY_AUTHORITY');
 return closeWrappedRecoveryAuthorityV1(authority);
}


/** Complete economic native sections; OBSERVE-only and wrapped capabilities
 * cannot enter. The fixed coordinator owns producer ordering and closure. */
function nativeEconomicIdentity(input,nativeNotes=false){
 exactRecord(input,['directory','runId','sourceSHA256','deadlineMs']);
 assert.match(input.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(input.directory,join(FIXED_WALLET_ROOT,nativeNotes?'.local/native-value-economic-note-recovery-v1':'.local/native-value-economic-recovery-v1','attempt-'+input.runId,'private-audit'),'NATIVE_ECONOMIC_FIXED_PRIVATE_DIRECTORY');
 assert.ok(hex(input.sourceSHA256)&&Number.isSafeInteger(input.deadlineMs)&&input.deadlineMs>0,'NATIVE_ECONOMIC_RECOVERY_IDENTITY');
 return {profile:NATIVE_ECONOMIC_PROFILE,...input};
}
export function createNativeEconomicRecoveryAuthorityV1(input){
 assert.equal(arguments.length,1);return authorityFactory(input,null,true,false,false,false,false,false,true);
}
export function openNativeEconomicRecoveryAuthorityV1(input,expectedCheckpoint){
 assert.equal(arguments.length,2);return authorityFactory(input,expectedCheckpoint,false,false,false,false,false,false,true);
}
/** Finite native-note entry only. The caller identity cannot choose a root;
 * both create and reopen select this fixed directory before any filesystem IO. */
export function createNativeEconomicNoteRecoveryAuthorityV1(input){
 assert.equal(arguments.length,1);return authorityFactory(input,null,true,false,false,false,false,false,true,true);
}
export function openNativeEconomicNoteRecoveryAuthorityV1(input,expectedCheckpoint){
 assert.equal(arguments.length,2);return authorityFactory(input,expectedCheckpoint,false,false,false,false,false,false,true,true);
}
export function assertNativeEconomicRecoveryCaptureV1(authority){
 assert.equal(arguments.length,1);const s=state(authority);assert.equal(s.identity.profile,NATIVE_ECONOMIC_PROFILE,'NATIVE_ECONOMIC_DISTINCT_RECOVERY_AUTHORITY');
 assert.equal(s.creating,true);assert.equal(s.record.data.phase,'CAPTURING');
 assert.ok(NATIVE_ECONOMIC_SECTIONS.every(section=>s.record.data.sections[section]===null),'NATIVE_ECONOMIC_CAPTURE_ONCE');return Object.freeze(clone(s.identity));
}
export function nativeEconomicRecoverySectionIdentityV1(token,section){
 assert.equal(arguments.length,2);assert.ok(NATIVE_ECONOMIC_SECTIONS.includes(section));
 const abort=nativeAbortTokens.get(token);if(abort){assert.equal(abort.section,section,'NATIVE_ECONOMIC_CLEANUP_SECTION');return Object.freeze(clone(abort.identity));}
 const identity=originalWrappedRecoverySectionIdentityV1(token,section);
 assert.equal(identity.profile,NATIVE_ECONOMIC_PROFILE,'NATIVE_ECONOMIC_DISTINCT_RECOVERY_TOKEN');return identity;
}
export function consumeNativeEconomicRecoverySectionV1(token,section){
 assert.equal(arguments.length,2);nativeEconomicRecoverySectionIdentityV1(token,section);return consumeOriginalWrappedRecoverySectionV1(token,section);
}
export function closeNativeEconomicRecoveryAuthorityV1(authority){
 assert.equal(arguments.length,1);assert.equal(authorities.get(authority)?.identity.profile,NATIVE_ECONOMIC_PROFILE,'NATIVE_ECONOMIC_DISTINCT_RECOVERY_AUTHORITY');return closeWrappedRecoveryAuthorityV1(authority);
}

// Fixed producer table belongs to this issuer. Caller-selected methods/paths,
// section callbacks and JSON records never enter its write-token registry.
const nativeProducerModules=Object.freeze({
 actor:async()=>({module:await import('../../../api/mobile/paired-original-account-actor-v2.mjs'),stem:'NativeActor'}),
 session:async()=>({module:await import('../../../api/accounts/flat-manual-graph-session.mjs'),stem:'NativeSession'}),
 account:async()=>({module:await import('../../../accounts/authority/native-value-account-authority-v2.mjs'),stem:'NativeAccount'}),
 executor:async()=>({module:await import('../../../execution/native-value/execution/native-value-execution-v2.mjs'),stem:'NativeExecution'}),
 provider:async()=>({module:await import('../../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs'),stem:'NativeProvider'}),
 owner:async()=>({module:await import('../../../../../custody/src/processes/native-value-owner-process-v2.mjs'),stem:'NativeOwner'}),
 bootstrap:async()=>({module:await import('../../../operations/operators/native-value/native-value-local-operator-bootstrap-v4.mjs'),stem:'NativeBootstrap'}),
 system:async()=>({module:await import('../../../operations/deployments/native-value/native-value-system-v2.mjs'),stem:'NativeSystem'}),
 receiver:async()=>({module:await import('../../../chains/evm/runtime/owned-evm-v2-runtime.mjs'),stem:null}),
 graphNative:async()=>({module:await import('../../../chains/evm/runtime/owned-evm-v2-runtime.mjs'),stem:null})
});
const nativeCaptureOrder=Object.freeze(['actor','session','account','executor','provider','owner','system','bootstrap','graphNative','receiver']);
function nativeOriginalFor(input,section){return section==='receiver'?input.runtime:section==='graphNative'?input.nativeRuntime:section==='executor'?input.nativeExecution:section==='provider'?input.providerCustody:input[section];}
async function nativeProducer(section){return nativeProducerModules[section]();}
function nativeCaptureArgs(input,section,token){return section==='system'?[input.runtime,input.system,token]:[nativeOriginalFor(input,section),token];}
async function retainNativeEconomicFixedSection(authority,input,section){
 return fixedCapture(authority,section,async token=>{
   const state=authorities.get(authority);state.nativeCaptureTokens??=new Map();state.nativeCaptureTokens.set(section,token);
   const {module:m,stem}=await nativeProducer(section),args=nativeCaptureArgs(input,section,token);
   if(['receiver','graphNative'].includes(section)){
     const record=await m.captureOwnedNativeEconomicRuntimeV1(...args);
     assert.equal(record.schema,m.isOwnedNativeEconomicRuntimeV2(nativeOriginalFor(input,section))?'OWNED_FIXED_EVM_CAPTURE_V2':'OWNED_FIXED_EVM_CAPTURE_V1');assert.equal(record.family,section);
     assert.equal(record.terminal.ownedProcessStopped,true);assert.equal(record.terminal.forced,false);
     await assertStoppedNativeFilesV1(record.cwd,record.files);await retainOriginalWrappedRecoverySectionV1(token,section,record);
   }else{
     const record=await m['captureOriginal'+stem+'EconomicRecoveryV1'](...args);
     await retainOriginalWrappedRecoverySectionV1(token,section,record);
     const stopped=await m['stopCaptured'+stem+'EconomicRecoveryV1'](...args);
     assert.deepEqual(stopped,section==='provider'?{closed:true,originalPrivateStateRetained:true}:{closed:true,originalResourcesStopped:true});
   }
   return {retained:true,originalResourcesStopped:true};
 });
}
async function abortNativeEconomicFixedCapture(s,input,fenced){
 const errors=[];
 // Fail-closed cleanup capabilities are distinct from writers/readers. They
 // cannot retain/consume a section or create a reopened economic object.
 for(const section of nativeCaptureOrder.filter(section=>fenced.includes(section))){
   const token=s.nativeCaptureTokens?.get(section)??opaque();nativeAbortTokens.set(token,{identity:s.identity,section});
   try{const {module:m,stem}=await nativeProducer(section),args=nativeCaptureArgs(input,section,token);
     if(['receiver','graphNative'].includes(section))await m.abortOwnedNativeEconomicRuntimeV1(...args);
     else await m['abort'+stem+'EconomicRecoveryV1'](...args);
   }catch(error){errors.push(error);}finally{nativeAbortTokens.delete(token);}
 }
 return errors;
}
/** Consumes only the fixed coordinator's original-reference request. */
export async function retainNativeEconomicRecoveryV1(authority,request){
 assert.equal(arguments.length,2);assertNativeEconomicRecoveryCaptureV1(authority);const s=authorities.get(authority);
 const coordinator=await import('../../../operations/recovery/native-value-economic-recovery-v1.mjs');
 const {input,fenced,fenceError,transportFenced}=coordinator.consumeNativeEconomicCaptureRequestV1(request,authority);
 try{
   if(transportFenced){const transport=await import('../../../api/mobile/paired-original-account-http-v2.mjs');
     await transport.stopCapturedNativeDeviceTransportRecoveryV1(input.transport,authority);}
   if(fenceError)throw fenceError;
   for(const section of nativeCaptureOrder)await retainNativeEconomicFixedSection(authority,input,section);
   return await finishWrappedRecoveryCaptureV1(authority);
 }catch(error){s.fault=true;const failures=[];
   if(transportFenced){try{const m=await import('../../../api/mobile/paired-original-account-http-v2.mjs');await m.abortNativeDeviceTransportRecoveryV1(input.transport,authority);}catch(cleanup){failures.push(cleanup);}}
   failures.push(...await abortNativeEconomicFixedCapture(s,input,fenced));
   if(failures.length)throw new AggregateError([error,...failures],'NATIVE_ECONOMIC_CAPTURE_AND_CLEANUP_FAILED',{cause:error});throw error;}
}
/** Same originals, fixed ordered consumers, fresh process and one-use sections.
 * Historical deadlines and UNKNOWN wires are data validated by those consumers.
 * No caller supplies factories, callbacks, keys, or restored records. */
export async function reopenNativeEconomicFromAuthorityV1(authority){
 assert.equal(arguments.length,1);assert.equal(state(authority).identity.profile,NATIVE_ECONOMIC_PROFILE,'NATIVE_ECONOMIC_DISTINCT_RECOVERY_AUTHORITY');
 const opened={};let composition;
 const reopen=async(section,work,stop)=>{const value=await fixedReopen(authority,section,work,stop);opened[section]=value;return value;};
 try{
   const r=await nativeProducer('receiver'),runtime=await reopen('receiver',token=>r.module.reopenOwnedNativeEconomicReceiverV1(token),value=>value.close());
   const nativeRuntime=await reopen('graphNative',token=>r.module.reopenOwnedNativeEconomicGraphRuntimeV1(token),value=>value.close());
   const b=await nativeProducer('bootstrap'),bootstrap=await reopen('bootstrap',token=>b.module.reopenOriginalNativeBootstrapEconomicRecoveryV1(token,nativeRuntime),value=>value.close());
   const y=await nativeProducer('system'),system=await reopen('system',token=>y.module.reopenOriginalNativeSystemEconomicRecoveryV1(token,{runtime,bootstrap}),()=>bootstrap.close());
   const p=await nativeProducer('provider'),providerCustody=await reopen('provider',token=>p.module.reopenOriginalNativeProviderEconomicRecoveryV1(token,{runtime,system,nativeRuntime,bootstrap}),value=>value.close());
   const o=await nativeProducer('owner'),owner=await reopen('owner',token=>o.module.reopenOriginalNativeOwnerEconomicRecoveryV1(token,{runtime,system}),value=>value.close());
   const dispatchLease=p.module.takeOriginalNativeProviderRecoveredLeaseV1(providerCustody);
   const e=await nativeProducer('executor'),nativeExecution=await reopen('executor',token=>e.module.reopenOriginalNativeExecutionEconomicRecoveryV1(token,{runtime,system,nativeRuntime,bootstrap,providerCustody,dispatchLease}),value=>value.close());
   const a=await nativeProducer('account'),account=await reopen('account',token=>a.module.reopenOriginalNativeAccountEconomicRecoveryV1(token,{runtime,system,owner,nativeExecution,providerCustody}),value=>value.abort());
   const t=await nativeProducer('session');composition=await reopen('session',token=>t.module.reopenOriginalNativeSessionEconomicRecoveryV1(token,{runtime,system,account,owner}),value=>value.session.close());
   const c=await nativeProducer('actor'),actor=await reopen('actor',token=>c.module.reopenOriginalNativeActorEconomicRecoveryV1(token,{session:composition.session,account,owner}),value=>value.close());
   await closeNativeEconomicRecoveryAuthorityV1(authority);
   return Object.freeze({runtime,nativeRuntime,bootstrap,system,providerCustody,dispatchLease,owner,nativeExecution,account,session:composition.session,
     bindManualNote:composition.bindManualNote,bindManualGraph:composition.bindManualGraph,actor});
 }catch(error){const failures=[];
   for(const section of [...NATIVE_ECONOMIC_SECTIONS].reverse()){
     const value=opened[section];if(!value||section==='system')continue;
     try{if(section==='account')await value.abort();else if(section==='session')await value.session.close();else if(section==='provider'){if(!value.report().closed)await value.close();}else await value.close();}
     catch(cleanup){failures.push(cleanup);}
   }
   // Keep every durable OPENING claim intact while releasing this failed
   // process's original key/store/lease. Closure never grants a second open.
   if(!authorities.get(authority)?.closed){try{await closeNativeEconomicRecoveryAuthorityV1(authority);}catch(cleanup){failures.push(cleanup);}}
   if(failures.length)throw new AggregateError([error,...failures],'NATIVE_ECONOMIC_REOPEN_AND_CLEANUP_FAILED',{cause:error});throw error;
 }
}

/** First dependent cut: exact original bootstrap producer. A partial capture
 * remains CAPTURING and can never pass complete economic reopen admission. */
export async function retainNativeEconomicBootstrapV1(authority,bootstrap){
 assert.equal(arguments.length,2);assert.equal(state(authority).identity.profile,NATIVE_ECONOMIC_PROFILE);
 const s=authorities.get(authority),input={bootstrap};
 try{return await retainNativeEconomicFixedSection(authority,input,'bootstrap');}
 catch(error){s.fault=true;const failures=await abortNativeEconomicFixedCapture(s,input,['bootstrap']);
   if(failures.length)throw new AggregateError([error,...failures],'NATIVE_BOOTSTRAP_CAPTURE_AND_CLEANUP_FAILED',{cause:error});throw error;}
}
