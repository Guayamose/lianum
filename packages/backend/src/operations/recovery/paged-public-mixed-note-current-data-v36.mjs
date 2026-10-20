/** Read-only current D26/W39 data for interrupted Sup7 storage capture.
 * The genuine Sup7 token supplies the retained entry. This file grants no
 * capability, retires no attempt, and preserves unknown outcomes verbatim. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import {wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {nativeProofCalldata} from '../../execution/native/dispatch/native-deployment.mjs';
import {isExpiredSourceNoteV32,assertSourceNoteJobV32,assertNoteSourceIdV32} from '../../chains/public-testnet/sepolia-note-retry-data-v32.mjs';
import {hashPagedSourcePrivateFileV4} from './paged-source-read-files-v4.mjs';
import {validateOriginalDevicePagedOwnerReadRecoveryV4,readOriginalDevicePagedOwnerReadRecoveryValidationV4,closeOriginalDevicePagedOwnerReadRecoveryValidationV4} from '../local/device-paged-owner-retention-v3.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex'),sha=v=>hash(canonical(v)),exact=P.pagedOwnerExactV3;
const artifact={abi:['depositBalance','withdraw'].map(name=>({type:'function',name,inputs:[{type:'bytes'},{type:'bytes32[]'}]})),evm:{methodIdentifiers:Object.fromEntries(['depositBalance(bytes,bytes32[])','withdraw(bytes,bytes32[])'].map(signature=>[signature,publicKeccak256(Buffer.from(signature)).subarray(0,4).toString('hex')]))}};
const calldata=job=>nativeProofCalldata(artifact,(job.mode==='deposit'?'depositBalance':'withdraw')+'(bytes,bytes32[])',Buffer.from(job.proof,'hex'),job.publicInputs);
export async function readPagedPublicMixedNoteCurrentDataV36(raw){
 exact(raw,['entry','system','password','sourceRows','rpc','head','account']);const {entry,system,rpc,head}=raw,a=entry.authority,descriptor=P.normalizeDevicePagedDescriptorV3(a.descriptor),files=[];
 assert.equal(a.profile,'DEVICE_PAGED_AUTHORITY_RETAINED_V3');assert.equal(entry.mixedSuccessorV35,undefined,'MIXED_NOTE_STORAGE_SUCCESSOR_NOT_ADMITTED');
 for(const key of ['pool','state','native','scope','policy','domain','hubDomain','registryCommitment','minimumDepositAtomic'])assert.equal(descriptor[key],system[key],'MIXED_NOTE_STORAGE_NAMESPACE');
 const watch=async path=>{const row={path,max:2097152,sha256:await hashPagedSourcePrivateFileV4(path,2097152)};files.push(row);};await watch(entry.journalPath);
 const current=await new Vault(entry.journalPath).read(raw.password),data=current.data;
 exact(data,['schema','identity','descriptor','jobs','pending','graph',...(Object.hasOwn(data,'noteWork')?['noteWork']:[]),...(Object.hasOwn(data,'emptyReplacementV9')?['emptyReplacementV9']:[])]);
 assert.equal(data.schema,P.DEVICE_PAGED_OWNER_V3);assert.equal(data.identity,a.identity,'MIXED_NOTE_STORAGE_IDENTITY');assert.deepEqual(data.descriptor,descriptor,'MIXED_NOTE_STORAGE_DESCRIPTOR');assert.deepEqual(data.emptyReplacementV9??null,entry.emptyReplacementV9??null,'MIXED_NOTE_STORAGE_LINEAGE');
 assert.ok(Number.isSafeInteger(current.revision)&&current.revision>=a.journalRevision,'MIXED_NOTE_STORAGE_ROLLBACK');if(current.revision===a.journalRevision)assert.equal(sha(data),a.journalDataSHA256,'MIXED_NOTE_STORAGE_SAME_REVISION');
 assert.equal(data.noteWork??null,null,'MIXED_NOTE_STORAGE_PROVER_PENDING');assert.ok(Array.isArray(data.jobs)&&data.jobs.length>0&&data.jobs.length<=2,'MIXED_NOTE_STORAGE_JOBS');
 const prooflessWithdrawals=new Set(),ids=new Set();for(const job of data.jobs){const {proof,...publicRow}=job;assert.deepEqual(P.normalizeDevicePagedRowV3(publicRow),publicRow);assert.deepEqual(job.descriptor,descriptor);assert.ok(!ids.has(job.jobId),'MIXED_NOTE_STORAGE_JOB_ALIAS');ids.add(job.jobId);assert.ok(['deposit','withdraw'].includes(job.mode)&&['PROVED','UNKNOWN','CONFIRMED','FAILED'].includes(job.stage),'MIXED_NOTE_STORAGE_JOB_STAGE');if(job.stage==='FAILED'&&job.errorCode===P.DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8&&proof===null){
  assert.ok(job.mode==='withdraw'&&job.proofSHA256===null&&job.commitment===null&&job.nullifier===null&&job.transactionHash===null&&data.pending===null,'MIXED_NOTE_STORAGE_FAILED_PROOFLESS_SCOPE');
  P.assertDevicePagedPublicJoinV3(job);prooflessWithdrawals.add(job.jobId);
 }else assert.ok(typeof proof==='string'&&/^(?:[0-9a-f]{2})+$/.test(proof)&&hash(Buffer.from(proof,'hex'))===job.proofSHA256,'MIXED_NOTE_STORAGE_PROOF_HASH');}
 const ownerPath=join(dirname(entry.journalPath),'private-owner.vault'),ownerPassword=hash('LIANUM/PAGED/OWNER-RETENTION/V3\0'+raw.password+'\0'+descriptor.pairingId);await watch(ownerPath);const owner=await new Vault(ownerPath).read(ownerPassword);let validation;
 try{
  assert.equal(owner.revision,a.ownerCheckpoint.revision,'MIXED_NOTE_STORAGE_OWNER_ADVANCED');assert.equal(sha(owner.data),a.ownerCheckpoint.dataSHA256,'MIXED_NOTE_STORAGE_OWNER_CHANGED');assert.deepEqual(owner.data.descriptor,descriptor);const g=data.graph;
  if(g){assert.equal(g.phase,'PREPARED','MIXED_NOTE_STORAGE_GRAPH_PHASE');assert.equal(g.public.phase,'PREPARED');assert.equal(g.work??null,null);assert.equal(g.pending??null,null);assert.equal(g.job??null,null);assert.equal(g.automation?.revoked,true,'MIXED_NOTE_STORAGE_GRAPH_NOT_STOPPED');assert.deepEqual(g.public,owner.data.controller.public,'MIXED_NOTE_STORAGE_OWNER_PUBLIC');assert.equal(owner.data.controller.pending,null,'MIXED_NOTE_STORAGE_OWNER_PENDING');}
  validation=await validateOriginalDevicePagedOwnerReadRecoveryV4({path:ownerPath,password:ownerPassword},descriptor,a.ownerCheckpoint);assert.deepEqual((await readOriginalDevicePagedOwnerReadRecoveryValidationV4(validation)).checkpoint,a.ownerCheckpoint);
 }finally{if(validation)closeOriginalDevicePagedOwnerReadRecoveryValidationV4(validation);wipePrivateProofInputsV1(owner.data.controller);}
 const rows=raw.sourceRows.filter(row=>row.command?.identity===data.identity),seen=new Set(),liveByJob=new Map();assert.ok(rows.length>0,'MIXED_NOTE_STORAGE_SOURCE_REQUIRED');
 for(const row of rows){assert.equal(row.profile,'ORIGINAL_PAGED_SEPOLIA_SOURCE_ROW_V4','MIXED_NOTE_STORAGE_SOURCE_PROFILE');assertNoteSourceIdV32(row);assert.ok(!seen.has(row.id),'MIXED_NOTE_STORAGE_ROW_ALIAS');seen.add(row.id);const c=row.command,job=data.jobs.find(job=>job.jobId===c.jobId);assert.ok(job,'MIXED_NOTE_STORAGE_ORPHAN_ROW');assert.ok(['FUND_D26','WITHDRAW_W39'].includes(c.action),'MIXED_NOTE_STORAGE_ACTION');assert.equal(c.from,raw.account.address,'MIXED_NOTE_STORAGE_ACCOUNT');assert.ok(Number.isSafeInteger(c.journalRevision)&&c.journalRevision<=current.revision,'MIXED_NOTE_STORAGE_COMMAND_REVISION');assert.equal(c.executorPayout,undefined);assert.equal(c.expiredMixedWithdrawalV10,undefined);const statement=assertSourceNoteJobV32(c,job,descriptor);if(prooflessWithdrawals.has(job.jobId))assert.ok(isExpiredSourceNoteV32(row),'MIXED_NOTE_STORAGE_FAILED_ACTIVE_SOURCE');assert.ok(row.signed&&row.transaction,'MIXED_NOTE_STORAGE_UNSIGNED');assert.equal(row.transaction.to,c.to);assert.equal(row.transaction.calldata,c.data);assert.equal(row.transaction.value,c.value);
  const receipt=await rpc.receipt(row.signed.nativeId);if(row.receipt)assert.deepEqual(receipt,row.receipt,'MIXED_NOTE_STORAGE_RECEIPT_CHANGED');if(receipt){assert.equal(receipt.transactionHash,row.signed.nativeId);const tx=await rpc.transaction(row.signed.nativeId);assert.ok(tx&&tx.from?.toLowerCase()===c.from&&tx.to?.toLowerCase()===c.to&&tx.input===c.data&&BigInt(tx.value)===BigInt(c.value)&&BigInt(tx.nonce)===BigInt(row.transaction.nonce),'MIXED_NOTE_STORAGE_TRANSACTION');const receiptBlock=await rpc.block(receipt.blockNumber);assert.equal(receipt.blockHash,receiptBlock.hash,'MIXED_NOTE_STORAGE_RECEIPT_BLOCK');await rpc.assertCanonical(receiptBlock);}
  if(isExpiredSourceNoteV32(row)){assert.ok(!receipt||receipt.status==='0x0','MIXED_NOTE_STORAGE_RETIRED_SUCCESS');const finalized=await rpc.block('finalized');await rpc.assertCanonical(finalized);assert.ok(BigInt(statement.epoch)<BigInt(finalized.timestamp)/600n,'MIXED_NOTE_STORAGE_RETIRED_EPOCH');}
  else{assert.equal(c.data,calldata(job),'MIXED_NOTE_STORAGE_EXACT_PROOF');assert.ok(!liveByJob.has(job.jobId),'MIXED_NOTE_STORAGE_MULTIPLE_ACTIVE');liveByJob.set(job.jobId,row);if(job.stage==='CONFIRMED'){assert.ok(receipt?.status==='0x1'&&['CONFIRMED','FINALIZED'].includes(row.phase),'MIXED_NOTE_STORAGE_CONFIRMED_RECEIPT');assert.equal(job.transactionHash,row.signed.nativeId);}else{assert.equal(job.stage,'UNKNOWN','MIXED_NOTE_STORAGE_UNACKNOWLEDGED_STAGE');assert.ok(['SIGNED','SUBMITTING','UNKNOWN','CONFIRMED','FINALIZED','REVERTED'].includes(row.phase));assert.ok(data.pending&&data.pending.jobId===job.jobId,'MIXED_NOTE_STORAGE_UNCLAIMED_WIRE');}}
 }
 if(data.pending){exact(data.pending,['jobId','from','to','value','calldataSHA256']);const job=data.jobs.find(job=>job.jobId===data.pending.jobId);assert.ok(job?.stage==='UNKNOWN'&&liveByJob.has(job.jobId),'MIXED_NOTE_STORAGE_ORPHAN_PENDING');assert.deepEqual(data.pending,{jobId:job.jobId,from:raw.account.address,to:descriptor.pool,value:job.mode==='deposit'?String(job.publicInputs[17]):'0',calldataSHA256:hash(Buffer.from(calldata(job).slice(2),'hex'))},'MIXED_NOTE_STORAGE_PENDING_CHANGED');}
 for(const job of data.jobs){assert.ok(prooflessWithdrawals.has(job.jobId)||rows.some(row=>row.command.jobId===job.jobId),'MIXED_NOTE_STORAGE_UNCORROBORATED_JOB');if(job.stage==='UNKNOWN')assert.equal(data.pending?.jobId,job.jobId,'MIXED_NOTE_STORAGE_UNKNOWN_PENDING');}
 // An expired intake can be retired before its prover emitted any bytes.
 // Preserve that inert FAILED job without inventing a proof or a Source send.
 // Its original deposit, epoch and canonical non-spending remain mandatory;
 // any later proof/send still needs the ordinary fresh device authorization.
 if(prooflessWithdrawals.size){
  const finalized=await rpc.block('finalized');await rpc.assertCanonical(finalized);
  for(const job of data.jobs.filter(job=>prooflessWithdrawals.has(job.jobId))){
   const deposit=data.jobs.find(other=>other.mode==='deposit'&&other.stage==='CONFIRMED');
   assert.ok(deposit&&deposit.rootId===job.rootId&&deposit.revision===job.revision&&deposit.publicInputs[17]===job.publicInputs[33]&&deposit.nullifier===P.devicePagedWordsHexV3(job.publicInputs,25),'MIXED_NOTE_STORAGE_FAILED_SOURCE');
   assert.ok(BigInt(job.publicInputs[16])<BigInt(finalized.timestamp)/600n,'MIXED_NOTE_STORAGE_FAILED_EPOCH');
   const call={to:descriptor.pool,data:'0x'+publicKeccak256(Buffer.from('spentNullifiers(bytes32)')).subarray(0,4).toString('hex')+deposit.nullifier};
   for(const tag of new Set([finalized.number,head.number]))assert.equal(await rpc.call(call,tag),'0x'+'0'.repeat(64),'MIXED_NOTE_STORAGE_FAILED_SPENT');
  }
  await rpc.assertCanonical(finalized);
 }
 assert.equal(publicKeccak256(Buffer.from((await rpc.code(descriptor.pool,head.number)).slice(2),'hex')).toString('hex'),descriptor.poolCodeHash,'MIXED_NOTE_STORAGE_POOL_CODE');await rpc.assertCanonical(head);for(const row of files)assert.equal(await hashPagedSourcePrivateFileV4(row.path,row.max),row.sha256,'MIXED_NOTE_STORAGE_CHANGED');
 return Object.freeze({entry:{...structuredClone(entry),authority:{...structuredClone(a),journalRevision:current.revision,journalDataSHA256:sha(data)}},authorityData:structuredClone(data),sourceRowIds:[...seen],files});
}
