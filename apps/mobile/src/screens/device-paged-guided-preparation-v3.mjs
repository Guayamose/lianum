/** Preparation orchestration only. Every port runs the original SDK/Vault
 * checks. Public snapshots never grant authority. These ports prepare the
 * private graph; they never prove, reserve money or send a native payment.
 * The caller opens its original scoped approval after READY. */
export async function prepareDevicePagedPaymentListV3({read,begin,resumeBegin,append,seal,signal,onStage,maximumTransitions=6}){
 if(!Number.isSafeInteger(maximumTransitions)||maximumTransitions<1||maximumTransitions>10)throw Error('MOBILE_PAGED_GUIDED_PREPARATION');
 const live=()=>{if(signal?.aborted)throw Error('MOBILE_PAGED_CANCELLED');};
 for(let step=0;step<=maximumTransitions;step++){
  live();const state=await read();live();
  if(state.pending&&!state.beginPrepared)throw Error('MOBILE_PAGED_REQUIRES_OBSERVATION');
  if(['SIGNING','PREPARED','RESERVED'].includes(state.phase))return{type:'ready',phase:state.phase};
  if(['FULFILLED','RECOVERED'].includes(state.phase))return{type:'complete',phase:state.phase};
  if(state.pending||!['BUILDING',null].includes(state.phase))throw Error('MOBILE_PAGED_REQUIRES_OBSERVATION');
  let action;
  if(state.beginPrepared)action='resume-begin';
  else if(state.phase===null){if(state.draftPayments===0)throw Error('MOBILE_PAGED_NO_PAYMENTS');action='begin';}
  else if(state.pagePending||!state.pagesMatch||state.draftPayments>0)action='append';
  else if(state.savedPayments>0)action='seal';
  else throw Error('MOBILE_PAGED_NO_PAYMENTS');
  if(step===maximumTransitions)throw Error('MOBILE_PAGED_GUIDED_PREPARATION');
  onStage?.(action);live();
  await({begin,'resume-begin':resumeBegin,append,seal}[action])();live();
 }
 throw Error('MOBILE_PAGED_GUIDED_PREPARATION');
}
