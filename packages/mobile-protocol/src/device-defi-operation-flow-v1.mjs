import {
  DEVICE_EXTERNAL_FLAT_SHARE_V1,
  normalizeExternalFlatDescriptorV1,
  normalizeExternalFlatStatusV1,
  externalFlatUintV1,
} from './device-external-flat-note-v1.mjs';
import {normalizeExternalFlatGraphStatusV1} from './device-external-flat-graph-v1.mjs';

/** Portable workflow decisions over observations already authenticated by the
 * original client. A decision grants no permission, proof or spend authority.
 * ExternalFlat evidence must never be presented as Paged native admission. */
export const DEVICE_DEFI_OPERATION_FLOW_V1 = 'DEVICE_DEFI_OPERATION_FLOW_V1';

export const DEVICE_DEFI_CAPABILITIES_V1 = Object.freeze([
  Object.freeze({protocol:'UNISWAP',operation:'SWAP_EXACT_OUTPUT',relationFamily:'EXTERNAL_FLAT',nativePagedAdmission:false,privateDestination:true,redemption:false}),
  Object.freeze({protocol:'AAVE',operation:'SUPPLY_STATIC_SHARES',relationFamily:'EXTERNAL_FLAT',nativePagedAdmission:false,privateDestination:true,redemption:true}),
  Object.freeze({protocol:'METAMORPHO',operation:'DEPOSIT_VAULT_SHARES',relationFamily:'EXTERNAL_FLAT',nativePagedAdmission:false,privateDestination:true,redemption:true}),
  Object.freeze({protocol:'MORPHO_BLUE',operation:'SUPPLY_POSITION_SHARES',relationFamily:'EXTERNAL_FLAT',nativePagedAdmission:false,privateDestination:true,redemption:true}),
]);

const need = value => {if(!value)throw Error('DEVICE_DEFI_OPERATION_FLOW_INVALID');};
const same = (left,right) => JSON.stringify(left)===JSON.stringify(right);
const fresh = (value,now) => value!==null && value.observedAt<=now && now<value.expiresAt;
const decision = (kind,label,phase,action=null,noteRole=null) => Object.freeze({
  profile:DEVICE_DEFI_OPERATION_FLOW_V1,relationFamily:'EXTERNAL_FLAT',nativePagedAdmission:false,
  kind,label,phase,action,noteRole,
});
const refresh = () => decision('REFRESH','Check the same operation','PENDING');

/** Exact decimal parsing without floating point or silent rounding. */
export function deviceDefiAmountToAtomicV1(text,decimals) {
  need(typeof text==='string'&&Number.isSafeInteger(decimals)&&decimals>=0&&decimals<=36);
  const value=text.trim().replace(',','.');
  need(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value));
  const [whole,fraction='']=value.split('.');need(fraction.length<=decimals);
  const atomic=(whole+fraction.padEnd(decimals,'0')).replace(/^0+(?=.)/,'');
  externalFlatUintV1(atomic);need(BigInt(atomic)>0n);return atomic;
}

export function deviceDefiAmountFromAtomicV1(amount,decimals) {
  externalFlatUintV1(amount);need(Number.isSafeInteger(decimals)&&decimals>=0&&decimals<=36);
  if(decimals===0)return amount;
  const digits=amount.padStart(decimals+1,'0'),fraction=digits.slice(-decimals).replace(/0+$/,'');
  return digits.slice(0,-decimals)+(fraction?'.'+fraction:'');
}

/** Chain time, rather than the phone clock, binds a new reception window. The
 * immutable original window must be reused after the D27 intent is created. */
export function deviceDefiReceptionWindowV1(observedTimestamp,durationSeconds) {
  externalFlatUintV1(observedTimestamp);
  need(Number.isSafeInteger(durationSeconds)&&durationSeconds>=300&&durationSeconds<=28800);
  const until=BigInt(observedTimestamp)+BigInt(durationSeconds)-60n;
  return Object.freeze({validFrom:observedTimestamp,validUntil:externalFlatUintV1(until.toString()),settleBefore:externalFlatUintV1((until+60n).toString())});
}

export function nextDeviceDefiOperationV1(input) {
  need(input&&typeof input==='object'&&!Array.isArray(input));
  const {descriptor:rawDescriptor,noteStatus:rawNote=null,graphStatus:rawGraph=null,
    goal='CONVERT',role='NOTE',hasDestination=false,destinationAuthorized=false,
    notePending=null,graphPending=null,outputPending=[],now=Date.now()}=input;
  need(['CONVERT','WITHDRAW'].includes(goal)&&['SOURCE','DESTINATION','NOTE'].includes(role));
  need(typeof hasDestination==='boolean'&&typeof destinationAuthorized==='boolean'&&Number.isSafeInteger(now)&&now>=0);
  need(Array.isArray(outputPending)&&outputPending.length<=2);
  if(notePending!==null)need(notePending&&/^[0-9a-f]{64}$/.test(notePending.jobId)&&['PROVE_D26','FUND_D26','OBSERVE_D26','PROVE_D27','OBSERVE_D27','PROVE_W39','WITHDRAW_W39','OBSERVE_W39'].includes(notePending.action));
  need(graphPending===null||['PROVE_U','RESERVE_S','OBSERVE_S','EXECUTE_GRAPH','RECONCILE_GRAPH','RECOVER_GRAPH','CANCEL_GRAPH'].includes(graphPending));
  for(const pending of outputPending)need(pending&&['change','recovery'].includes(pending.noteRole)&&/^[0-9a-f]{64}$/.test(pending.jobId)&&['PROVE_W39','WITHDRAW_W39','OBSERVE_W39'].includes(pending.action));
  need(new Set(outputPending.map(value=>value.noteRole)).size===outputPending.length);
  const descriptor=normalizeExternalFlatDescriptorV1(rawDescriptor),
    note=rawNote===null?null:normalizeExternalFlatStatusV1(rawNote),
    graph=rawGraph===null?null:normalizeExternalFlatGraphStatusV1(rawGraph);
  if(note)need(same(note.descriptor,descriptor));if(graph)need(same(graph.descriptor,descriptor));
  const share=descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1;

  if(graph?.jobs.length) {
    if(!fresh(graph,now))return refresh();
    const row=graph.jobs[0],reservation=row.reservation,stage=row.graph.stage;
    if(graphPending!==null&&['PROVE_U','RESERVE_S','OBSERVE_S'].includes(graphPending)) {
      if(reservation.stage==='PROVING')return refresh();
      if(['RESERVING','RESERVATION_UNKNOWN'].includes(reservation.stage)||graphPending==='RESERVE_S')
        return decision('GRAPH_ACTION','Confirm the same reservation','RESERVING','OBSERVE_S');
    }
    if(['EXECUTION_UNKNOWN','RECOVERY_UNKNOWN'].includes(stage)||['EXECUTE_GRAPH','RECOVER_GRAPH','RECONCILE_GRAPH'].includes(graphPending))
      return decision('GRAPH_ACTION','Confirm the same conversion','PENDING','RECONCILE_GRAPH');
    if(stage==='SOURCE_CANCELLED')return goal==='WITHDRAW'
      ?decision('PREPARE_WITHDRAWAL','Prepare withdrawal of the released source','WITHDRAWING')
      :decision('SETTLED','Reservation released; you can withdraw the source','CANCELLED');
    if(reservation.stage==='FAILED')return decision('GRAPH_ACTION','Release the unsent reservation','RECOVERING','CANCEL_GRAPH');
    if(reservation.stage==='PROVING')return refresh();
    if(reservation.stage==='PROVED')return decision('GRAPH_ACTION','Review and authorize the reservation','RESERVING','RESERVE_S');
    if(['RESERVING','RESERVATION_UNKNOWN'].includes(reservation.stage))
      return decision('GRAPH_ACTION','Confirm the same reservation','RESERVING','OBSERVE_S');
    if(reservation.stage==='RESERVED'&&stage==='PREPARED') {
      const expired=BigInt(graph.observed.timestamp)>=BigInt(reservation.statement.settleBefore);
      return expired?decision('GRAPH_ACTION','Recover the expired reservation','RECOVERING','RECOVER_GRAPH')
        :decision('GRAPH_ACTION','Review and authorize the conversion','EXECUTING','EXECUTE_GRAPH');
    }
    if(stage==='FULFILLED'&&goal==='CONVERT')return hasDestination
      ?decision('OPEN_DESTINATION','Check the received asset','FULFILLED')
      :decision('SETTLED','Conversion confirmed','FULFILLED');
    if(['FULFILLED','RECOVERED'].includes(stage)) {
      const noteRole=stage==='RECOVERED'?'recovery':'change',
        withdrawal=graph.withdrawals.find(value=>value.noteRole===noteRole),
        pending=outputPending.find(value=>value.noteRole===noteRole);
      if(pending?.action==='PROVE_W39'||withdrawal?.row.stage==='PROVING')return refresh();
      if(withdrawal?.row.stage==='WITHDRAWAL_UNKNOWN'||pending)
        return decision('OUTPUT_ACTION','Confirm the same withdrawal','PENDING','OBSERVE_W39',noteRole);
      if(withdrawal?.row.stage==='PROVED')return decision('OUTPUT_ACTION','Review withdrawal of '+(noteRole==='change'?'change':'recovery'),'WITHDRAWING','WITHDRAW_W39',noteRole);
      if(withdrawal?.row.stage==='CONFIRMED')return decision('SETTLED','Withdrawal confirmed','WITHDRAWN');
      const output=row.outputs.find(value=>value.noteRole===noteRole);
      if(output?.state==='EMPTY'||output?.state==='UNISSUED')return decision('SETTLED','No balance in this output',stage);
      if(output?.state==='UNSPENT'&&output.available!==null)
        return decision('PREPARE_OUTPUT_WITHDRAWAL','Prepare withdrawal of '+(noteRole==='change'?'change':'recovery'),'WITHDRAWING',null,noteRole);
      return refresh();
    }
    return refresh();
  }
  if(graphPending!==null||outputPending.length)return refresh();
  if(!fresh(note,now))return refresh();
  if(note.graphClaimed)return refresh();
  const deposit=note.jobs.find(value=>value.mode!=='withdraw_balance'),
    withdrawal=note.jobs.find(value=>value.mode==='withdraw_balance');
  if(notePending!==null) {
    if(notePending.action==='FUND_D26')return decision('NOTE_ACTION','Confirm the same funding','PENDING','OBSERVE_D26');
    if(notePending.action==='WITHDRAW_W39')return decision('NOTE_ACTION','Confirm the same withdrawal','PENDING','OBSERVE_W39');
    if(notePending.action==='OBSERVE_D27')return decision('NOTE_ACTION','Check the same receipt','PENDING','OBSERVE_D27');
    return refresh();
  }
  if(withdrawal) {
    if(withdrawal.stage==='PROVED')return decision('NOTE_ACTION','Review and authorize the withdrawal','WITHDRAWING','WITHDRAW_W39');
    if(withdrawal.stage==='WITHDRAWAL_UNKNOWN')return decision('NOTE_ACTION','Confirm the same withdrawal','PENDING','OBSERVE_W39');
    if(withdrawal.stage==='CONFIRMED')return decision('SETTLED','Withdrawal confirmed','WITHDRAWN');
    return refresh();
  }
  if(!deposit)return decision('PREPARE_DEPOSIT',share?'Prepare asset receipt':'Prepare funding','FUNDING');
  if(deposit.stage==='PROVING')return refresh();
  if(deposit.stage==='FUNDING_UNKNOWN')return decision('NOTE_ACTION','Confirm the same funding','PENDING','OBSERVE_D26');
  if(deposit.stage==='DELIVERY_UNKNOWN')return decision('NOTE_ACTION','Check the same receipt','PENDING','OBSERVE_D27');
  if(deposit.stage==='PROVED') {
    if(!share)return decision('NOTE_ACTION','Review and authorize funding','FUNDING','FUND_D26');
    if(role==='DESTINATION'&&goal==='CONVERT'&&hasDestination)
      return decision('OPEN_SOURCE','Continue with the source and its reservation','RECEPTION_AUTHORIZED');
    return decision('NOTE_ACTION','Check the same receipt','PENDING','OBSERVE_D27');
  }
  if(deposit.stage==='CONFIRMED') {
    if(goal==='WITHDRAW')return decision('PREPARE_WITHDRAWAL','Prepare asset withdrawal','WITHDRAWING');
    if(share)return decision('SETTLED','Asset received and available in its note','FULFILLED');
    if(hasDestination&&!destinationAuthorized)return decision('OPEN_DESTINATION','Authorize receipt of the destination asset','RECEIVING');
    return decision('PREPARE_GRAPH','Prepare reservation and conversion','RESERVING');
  }
  return refresh();
}
