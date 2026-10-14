/** Public preparation DATA and bounded sequencing, shared by mobile/platform.
 * Every append port must persist/submit one original <=64-node page. This
 * helper creates no consent, note, proof, authority, reservation or payment. */
export const DEVICE_PAGED_PAYMENT_PAGE_SIZE_V3=64;
// Explicit current product/work bound, independent of the 64-node page size.
export const DEVICE_PAGED_PAYMENT_LIMIT_V3=256;
export const DEVICE_PAGED_PAYMENT_BUFFER_LIMIT_V3=DEVICE_PAGED_PAYMENT_LIMIT_V3;
export function devicePagedPaymentPagesV3(payments,{maximumPayments=DEVICE_PAGED_PAYMENT_BUFFER_LIMIT_V3}={}){
 if(!Number.isSafeInteger(maximumPayments)||maximumPayments<1||maximumPayments>DEVICE_PAGED_PAYMENT_BUFFER_LIMIT_V3||!Array.isArray(payments)||payments.length<1||payments.length>maximumPayments)throw Error('MOBILE_PAGED_PAYMENT_LIST_CAPACITY');
 const pages=[];for(let offset=0;offset<payments.length;offset+=DEVICE_PAGED_PAYMENT_PAGE_SIZE_V3)pages.push(payments.slice(offset,offset+DEVICE_PAGED_PAYMENT_PAGE_SIZE_V3));return pages;
}
export async function prepareDevicePagedPaymentListV3({read,begin,resumeBegin,append,seal,signal,onStage,maximumTransitions}){
 if(maximumTransitions!==undefined&&(!Number.isSafeInteger(maximumTransitions)||maximumTransitions<1||maximumTransitions>DEVICE_PAGED_PAYMENT_BUFFER_LIMIT_V3+6))throw Error('MOBILE_PAGED_GUIDED_PREPARATION');
 const live=()=>{if(signal?.aborted)throw Error('MOBILE_PAGED_CANCELLED');};let limit=maximumTransitions;
 for(let step=0;;step++){
  live();const state=await read();live();
  if(!Number.isSafeInteger(state.draftPayments)||state.draftPayments<0||!Number.isSafeInteger(state.savedPayments)||state.savedPayments<0||state.savedPayments+state.draftPayments>DEVICE_PAGED_PAYMENT_LIMIT_V3)throw Error('MOBILE_PAGED_PAYMENT_LIST_CAPACITY');
  limit??=Math.ceil(state.draftPayments/DEVICE_PAGED_PAYMENT_PAGE_SIZE_V3)+6;
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
  if(step===limit)throw Error('MOBILE_PAGED_GUIDED_PREPARATION');
  onStage?.(action);live();await({begin,'resume-begin':resumeBegin,append,seal}[action])();live();
 }
}
