import {DEVICE_EXTERNAL_FLAT_SHARE_V1,normalizeExternalFlatDescriptorV1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import {readDeviceExternalFlatStatusV1,readDeviceExternalFlatRowV1,readDeviceExternalFlatConsentV1} from './device-external-flat-note-api-v1.mjs';

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const need=value=>{if(!value)throw Error('MOBILE_EXTERNAL_FLAT_RECEPTION_BINDING');};

/** Reconcile one already handed-off D27. STATUS alone does not observe its
 * receipt. This port never proves, funds, swaps, withdraws or retries a submit. */
export async function observeDeviceExternalFlatReceptionV1({descriptor,status,summary,vault,client,sign,signal,assertCurrent}){
 need(signal instanceof AbortSignal&&typeof assertCurrent==='function');
 const live=()=>{need(!signal.aborted);assertCurrent();};
 live();descriptor=normalizeExternalFlatDescriptorV1(descriptor);status=readDeviceExternalFlatStatusV1(status);need(same(status.descriptor,descriptor));
 const original=status.jobs.find(row=>row.mode==='deposit_intent');
 // PROVED still belongs to preparation. Only a handed-off, unknown delivery
 // is observed automatically; another pending action keeps its own recovery.
 if(descriptor.profile!==DEVICE_EXTERNAL_FLAT_SHARE_V1||original?.stage!=='DELIVERY_UNKNOWN'||status.jobs.some(row=>row.mode==='withdraw_balance')||summary.graph!==null||summary.pending!==null&&(summary.pending.action!=='OBSERVE_D27'||summary.pending.jobId!==original.jobId))return{status,summary,observed:false};
 const subject=readDeviceExternalFlatRowV1(original),fields=subject.consentFields;
 need(same(summary.descriptor,descriptor)&&summary.rootId===fields.rootId&&summary.noteRevision===fields.noteRevision&&summary.recipient===fields.recipient&&summary.commitment===fields.statement.output&&summary.jobs.some(row=>same(row,subject)));
 const draft=await vault.draft('OBSERVE_D27');live();readDeviceExternalFlatStatusV1(status);
 need(draft.action==='OBSERVE_D27'&&draft.jobId===subject.jobId);
 for(const field of ['rootId','noteRevision','recipient','statement','path','witnessSHA256'])need(same(draft[field],fields[field]));
 let storage=await vault.beginSubmissionStorage('NOTE',draft,signal);
 try{
  live();const access=await client.challenge();live();const accessSignature=await sign(access);live();
  const consent=readDeviceExternalFlatConsentV1(await client.review(access,accessSignature,draft));live();
  need(consent.action==='OBSERVE_D27'&&same(consent.descriptor,descriptor));
  for(const field of Object.keys(fields))need(same(consent[field],fields[field]));
  const arm=await vault.bindSubmissionStorage(storage,consent);storage=null;live();
  const signature=await sign(consent);live();await vault.consumeSubmissionArm(arm,consent);live();
  const observed=readDeviceExternalFlatRowV1(await client.submit(consent,signature,null));live();
  need(observed.mode==='deposit_intent'&&observed.jobId===subject.jobId&&same(observed.descriptor,descriptor)&&same(observed.consentFields,fields)&&['DELIVERY_UNKNOWN','CONFIRMED'].includes(observed.stage));
  await vault.accept(observed);live();
  const next=readDeviceExternalFlatStatusV1(await client.readStatus(sign,signal,live));live();
  const nextRow=next.jobs.find(row=>row.jobId===subject.jobId);need(nextRow&&same(next.descriptor,descriptor)&&same(nextRow.consentFields,fields));
  const local=await vault.reconcileOriginalStatus(next);live();readDeviceExternalFlatStatusV1(next);
  return{status:next,summary:local,observed:true};
 }finally{if(storage)vault.endSubmissionStorage(storage);}
}
