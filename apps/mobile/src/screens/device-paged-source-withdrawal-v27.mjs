/** One original source withdrawal. Every resume observes the retained job;
 * missing replies never authorize another financial submission. */
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
const need=(value,code='MOBILE_PAGED_SOURCE_WITHDRAWAL_REVIEW')=>{if(!value)throw Error(code);};
const recipientOf=job=>'0x'+P.devicePagedWordsHexV3(job.publicInputs,34,5);
export async function runDevicePagedSourceWithdrawalV27({descriptor,vault,api,signal,assertCurrent,sign,authorization,review,recipient=null,onStatus=()=>{},onProgress=()=>{}}){
 let approval=null,witness=null;const unknownReplies=new WeakSet();
 const current=()=>{need(!signal.aborted,'MOBILE_PAGED_CANCELLED');assertCurrent();};
 const progress=text=>{current();onProgress(text);};
 async function read(){
  current();await vault.beginReadStorage(signal);
  try{const draft=await vault.readDraft();current();const consent=await api.challenge(draft);current();const signature=await sign(consent);current();const status=await api.submit(consent,signature);current();await vault.acceptStatus(status);current();onStatus(status);return status;}
  finally{vault.endReadStorage();}
 }
 async function send(draft,secret=null){
  current();const arm=await vault.prearmDraft(draft);current();const consent=await api.challenge(draft);current();const signature=await sign(consent,approval);current();await vault.consumeArm(arm,consent);current();
  let row;try{row=await api.submit(consent,signature,secret);}catch(error){if(error instanceof Error)unknownReplies.add(error);throw error;}
  current();await vault.acceptRow(row);current();return row;
 }
 const result=(state,job)=>({state,jobId:job?.jobId??null,recipient:job?recipientOf(job):recipient,amount:job?.publicInputs[33]??null});
 try{
  progress("Checking the saved withdrawal...");let status=await read(),job=status.jobs.find(row=>row.mode==='withdraw');
  if(job?.stage==='CONFIRMED'&&status.note?.state==='SPENT')return result('CONFIRMED',job);
  if(job&&['PROVING','UNKNOWN'].includes(job.stage)){
   progress("Checking the same attempt, without repeating the transfer...");
   try{await send(await vault.effectDraft('OBSERVE_JOB',job.jobId));}catch(error){if(!signal.aborted&&unknownReplies.has(error))return result('PENDING',job);throw error;}
   status=await read();job=status.jobs.find(row=>row.mode==='withdraw');
   if(job?.stage==='CONFIRMED'&&status.note?.state==='SPENT')return result('CONFIRMED',job);
   if(job&&['PROVING','UNKNOWN'].includes(job.stage))return result('PENDING',job);
  }
  need(status.note?.state==='LIVE');
  need(!job||job.stage==='PROVED'||job.stage==='FAILED'&&job.errorCode===P.DEVICE_PAGED_NOTE_EPOCH_REPROOF_V8);
  const address=job?recipientOf(job):recipient;
  need(typeof address==='string'&&/^0x[0-9a-f]{40}$/.test(address)&&address!=='0x'+'0'.repeat(40));
  need(recipient===null||recipient===address);
  const source={commitment:status.note.commitment,nullifier:status.note.nullifier,amount:status.note.amount},priorJobId=job?.jobId??null;
  await review({recipient:address,amount:source.amount});current();
  // A review may stay open for minutes. Refresh before building or approving
  // the proof, retaining the reviewed source, amount, destination and job.
  status=await read();job=status.jobs.find(row=>row.mode==='withdraw');
  need(status.note?.state==='LIVE'&&status.note.commitment===source.commitment&&status.note.nullifier===source.nullifier&&status.note.amount===source.amount&&(job?.jobId??null)===priorJobId);
  let draft;
  if(job?.stage==='PROVED')draft=P.normalizeDevicePagedDraftV3({action:'PROVE_W39',jobId:job.jobId,rootId:job.rootId,revision:job.revision,mode:'withdraw',publicInputs:job.publicInputs,witnessSHA256:job.witnessSHA256,authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null});
  else{
   const prepared=job?await vault.prepareEpochRetry(status,job.jobId):(await vault.resumePreparedWithdrawalV10(status,address)??await vault.prepareWithdrawal(status,address));
   draft=prepared.draft;witness=prepared.witness;
  }
  current();need(recipientOf(draft)===address&&draft.publicInputs[33]===source.amount);
  approval=await authorization.approve(descriptor,draft,signal);current();
  status=await read();need(status.epoch===draft.publicInputs[16],'MOBILE_PAGED_NOTE_EPOCH_CHANGED');
  if(job?.stage==='PROVED')authorization.bind(approval,status);
  else{
   progress("Preparing your withdrawal...");let row;
   try{row=await send(draft,witness);}catch(error){if(!signal.aborted&&unknownReplies.has(error))return result('PENDING',draft);throw error;}
   P.pagedOwnerWipeV3(witness);witness=null;if(row.stage!=='PROVED')return result('PENDING',row);authorization.bind(approval,row);
  }
  progress("Sending your withdrawal...");let row;
  try{row=await send(await vault.effectDraft('WITHDRAW_W39',draft.jobId));}catch(error){if(!signal.aborted&&unknownReplies.has(error))return result('PENDING',draft);throw error;}
  status=await read();return result(row.stage==='CONFIRMED'&&status.note?.state==='SPENT'?'CONFIRMED':'PENDING',row);
 }finally{P.pagedOwnerWipeV3(witness);if(approval)authorization.close(approval);}
}
