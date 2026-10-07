/** Pure integration monitor: decide from one snapshot before changing flags. */
export function ownerRefundMonitorAction(operation, requested){
 if(operation.phase==='REFUNDED')return 'terminal';
 if(['FAILED','INTERRUPTED'].includes(operation.phase)&&operation.engineState!=='RUNNING')return 'failed';
 if(operation.phase!=='REFUNDABLE')return 'wait';
 if(operation.allowedActions.includes('refund')){
  if(requested.refund)throw Error('M21_REFUND_ATTEMPT_RETURNED_WITHOUT_ISSUANCE');
  return 'refund';
 }
 if(operation.allowedActions.includes('recoverRefund')){
  if(!requested.refund)throw Error('M21_UNEXPECTED_REFUND_ISSUANCE');
  if(requested.recoverRefund)throw Error('M21_WITHDRAWAL_ATTEMPT_NOT_COMPLETED');
  return 'recoverRefund';
 }
 return 'wait'; // Unknown or first retained checkpoint is not an outcome.
}
