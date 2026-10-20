/** Storage validation owned by an actual authenticated Sup7 writer fence.
 * No parent runtime, financial issuer or supervisor implementation is imported.
 * The retained DATA must hash to that writer's protected snapshot reference. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {readOriginalPagedProcessFenceIdentityV4} from './paged-original-process-fence-v4.mjs';
const mixedSourceValidationsV10=new WeakMap(),clone=structuredClone;
const sha=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex');
const exact=P.pagedOwnerExactV3;
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function parentSnapshot(v){return{deployment:clone(v.deployment),authority:clone(v.authority.parent),provider:clone(v.provider.parent),native:clone(v.native),sourceLocation:clone(v.authority.parentLocation)};}
export async function createOriginalPagedMixedSourceValidationV10(raw){return createValidation(raw,false);}
/** Separate genuine Sup7 storage token; live/financial recovery remains unchanged. */
export async function createOriginalPagedMixedDeadNoteValidationV36(raw){return createValidation(raw,true);}
async function createValidation(raw,deadNotesV36){
 exact(raw,['directory','password','sourcePassword','fence','retained']);
 const identity=await readOriginalPagedProcessFenceIdentityV4(raw.fence);assert.equal(identity.directory,raw.directory);assert.equal(identity.purpose,'PAGED_PUBLIC_MIXED_SUPERVISOR','MIXED_CURRENT_ORIGINAL_WRITER');
 const F=await import('./paged-source-read-files-v4.mjs'),file=join(raw.directory,'mixed-supervisor.vault');await F.hashPagedSourcePrivateFileV4(file,2097152);const record=await new Vault(file).read(raw.password),d=record.data;assert.equal(d.profile,'ORIGINAL_PUBLIC_UNISWAP_MIXED_SUPERVISOR_V4');assert.ok(['ACTIVE','OPENING','CAPTURED'].includes(d.phase));const ref=d.phase==='ACTIVE'?d.activationBase:d.snapshot,bytes=Buffer.from(JSON.stringify(raw.retained));try{assert.equal(bytes.length,ref.bytes,'MIXED_CURRENT_ORIGINAL_SNAPSHOT');assert.equal(sha(bytes),ref.sha256,'MIXED_CURRENT_ORIGINAL_SNAPSHOT');}finally{bytes.fill(0);}
 const retained=clone(raw.retained),parentDir=d.parentLocationV6?.directory??join(raw.directory,'native3-parent-v4');if(d.parentLocationV6)assert.equal(d.parentLocationV6.credential,'SHARED_ROOT_PASSWORD_V6');
 const current=async()=>{assert.deepEqual(await readOriginalPagedProcessFenceIdentityV4(raw.fence),identity,'MIXED_CURRENT_ORIGINAL_WRITER');assert.deepEqual(await new Vault(file).read(raw.password),record,'MIXED_CURRENT_ORIGINAL_HIGHWATER');};await current();const token=Object.freeze(Object.create(null));mixedSourceValidationsV10.set(token,{current,retained,parentDir,password:raw.sourcePassword,deadNotesV36,result:null});return token;
}
export async function readOriginalPagedMixedSourceValidationResultV10(token){const g=mixedSourceValidationsV10.get(token);assert.ok(g?.result,'MIXED_CURRENT_VALIDATION_REQUIRED');await g.current();return freeze(clone(g.result));}
/** Compare only an authenticated Sup7 token's parent. Root independently loads
 * both candidate snapshots from its own AEAD vault; this grants no new anchor. */
export async function matchesOriginalPagedMixedSourceValidationParentV36(token,base,dead){assert.equal(arguments.length,3);const g=mixedSourceValidationsV10.get(token);assert.ok(g,'MIXED_CURRENT_ORIGINAL_VALIDATION');await g.current();assert.equal(dead.directory,g.parentDir,'MIXED_CURRENT_ORIGINAL_ROOT');return isDeepStrictEqual(base,parentSnapshot(g.retained));}
export function closeOriginalPagedMixedSourceValidationV10(token){mixedSourceValidationsV10.delete(token);}
export async function corroborateOriginalPagedPublicMixedSourceRowsV10(token,raw){
 assert.equal(arguments.length,2);exact(raw,['base','dead','sourceRows','rpc','head']);const g=mixedSourceValidationsV10.get(token);assert.ok(g,'MIXED_CURRENT_ORIGINAL_VALIDATION');await g.current();assert.equal(raw.dead.directory,g.parentDir,'MIXED_CURRENT_ORIGINAL_ROOT');assert.deepEqual(raw.base,parentSnapshot(g.retained),'MIXED_CURRENT_PARENT_ANCHOR');
 const F=await import('./paged-source-read-files-v4.mjs'),sourceFile=join(g.retained.native.directory,'source-operations/native-wallet.json'),source=await F.readPagedSourcePrivateJSONV4(sourceFile,33554432);assert.deepEqual(source.data.operations,raw.sourceRows,'MIXED_CURRENT_ORIGINAL_SOURCE_ROWS');const sourceSHA=await F.hashPagedSourcePrivateFileV4(sourceFile,33554432),entries=[],ids=[],files=[],currentAuthorities=[];
 const {readPagedExpiredWithdrawalsCurrentDataV10}=await import('./paged-expired-withdrawal-current-data-v10.mjs');
 for(const entry of g.retained.authority.entries){
  if(!entry.expiredWithdrawalsV10?.length){
   const current=g.deadNotesV36?await new Vault(entry.journalPath).read(g.password):null;
   if(current&&(current.revision!==entry.authority.journalRevision||sha(current.data)!==entry.authority.journalDataSHA256||current.data.pending!==null)){
    const {readPagedPublicMixedNoteCurrentDataV36}=await import('./paged-public-mixed-note-current-data-v36.mjs');const verified=await readPagedPublicMixedNoteCurrentDataV36({entry,system:g.retained.mixedSource.entries[entry.sourceIndex].source.system,password:g.password,sourceRows:raw.sourceRows,rpc:raw.rpc,head:raw.head,account:g.retained.native.source.configuration.receiver.account});entries.push(verified.entry);ids.push(...verified.sourceRowIds);files.push(...verified.files);currentAuthorities.push(verified.authorityData);
   }else entries.push(clone(entry));continue;
  }
  const old=await new Vault(entry.journalPath).read(g.password);assert.equal(old.revision,entry.authority.journalRevision,'MIXED_CURRENT_EXPIRED_SOURCE_CHANGED');assert.equal(sha(old.data),entry.authority.journalDataSHA256,'MIXED_CURRENT_EXPIRED_SOURCE_CHANGED');assert.equal(old.data.identity,entry.authority.identity);assert.deepEqual(old.data.descriptor,entry.authority.descriptor);assert.ok(Date.now()>=entry.authority.descriptor.deadlineMs,'MIXED_CURRENT_SOURCE_NOT_EXPIRED');
  const D=await import('./paged-source-read-files-v4.mjs'),ownerPath=join(dirname(entry.journalPath),'private-owner.vault');files.push({path:entry.journalPath,max:2097152,sha256:await D.hashPagedSourcePrivateFileV4(entry.journalPath,2097152)},{path:ownerPath,max:2097152,sha256:await D.hashPagedSourcePrivateFileV4(ownerPath,2097152)});
  const O=await import('../local/device-paged-owner-retention-v3.mjs');let validation;try{validation=await O.validateOriginalDevicePagedOwnerReadRecoveryV4({path:ownerPath,password:sha(Buffer.from('LIANUM/PAGED/OWNER-RETENTION/V3\0'+g.password+'\0'+entry.authority.descriptor.pairingId))},entry.authority.descriptor,entry.authority.ownerCheckpoint);assert.deepEqual((await O.readOriginalDevicePagedOwnerReadRecoveryValidationV4(validation)).checkpoint,entry.authority.ownerCheckpoint,'MIXED_CURRENT_EXPIRED_OWNER_CHANGED');}finally{if(validation)O.closeOriginalDevicePagedOwnerReadRecoveryValidationV4(validation);}
  const validated=await readPagedExpiredWithdrawalsCurrentDataV10({source:entry,rows:entry.expiredWithdrawalsV10,password:g.password,sourceRows:raw.sourceRows});entries.push({...clone(entry),expiredWithdrawalsV10:validated.rows});ids.push(...validated.sourceRowIds);files.push(...validated.files);
 }
 await(await import('./paged-expired-withdrawal-current-data-v10.mjs')).corroboratePagedExpiredWithdrawalRowsCanonicalV10(raw.sourceRows,ids.filter(id=>!currentAuthorities.some(authority=>raw.sourceRows.some(row=>row.id===id&&row.command.identity===authority.identity))),raw.rpc,raw.head);await raw.rpc.assertCanonical(raw.head);await g.current();assert.equal(await F.hashPagedSourcePrivateFileV4(sourceFile,33554432),sourceSHA,'MIXED_CURRENT_SOURCE_HIGHWATER');for(const file of files)assert.equal(await F.hashPagedSourcePrivateFileV4(file.path,file.max),file.sha256,'MIXED_CURRENT_BROKER_HIGHWATER');g.result={entries,sourceRowIds:ids,files,...(currentAuthorities.length?{currentAuthorities}: {})};return freeze(clone(g.result));
}
