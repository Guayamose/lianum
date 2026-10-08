/** A device authorizes continuation of its original U/S, never another reserve.
 * This frame confers no custody/provider/quorum authority. Full owner refund
 * leaves any irreversible delivery at the original provider's accepted risk. */
import { normalizeDeviceReservationConsentV1,deviceReservationConsentMessageV1,
  validateDeviceReservationConsentFreshV1 } from './device-reservation-consent-v1.mjs';
export const DEVICE_EXECUTION_CONSENT_V1='LIANUM_DEVICE_ORIGINAL_EXECUTION_V1';
const need=value=>{if(!value)throw Error('MOBILE_DEVICE_EXECUTION_INVALID');};
const hex=value=>{need(typeof value==='string'&&/^[0-9a-f]{64}$/.exec(value)?.[0]===value&&value!=='0'.repeat(64));return value;};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function normalizeDeviceExecutionConsentV1(raw){
  const names=['version','profile','action','reservation','nativeBindingSHA256','reservationTransactionHash','executionSnapshotSHA256','lossClause'];
  need(raw&&Object.getPrototypeOf(raw)===Object.prototype&&Reflect.ownKeys(raw).length===names.length);
  const value=Object.fromEntries(names.map(name=>{const row=Object.getOwnPropertyDescriptor(raw,name);
    need(row?.enumerable&&Object.hasOwn(row,'value'));return[name,row.value];}));
  need(value.version===1&&value.profile===DEVICE_EXECUTION_CONSENT_V1
    &&['EXECUTE_NATIVE','RECONCILE_NATIVE','RECOVER_NATIVE'].includes(value.action));
  value.reservation=normalizeDeviceReservationConsentV1(value.reservation);
  need(value.reservation.action==='OBSERVE_S'&&value.reservation.proofSHA256!==null&&value.reservation.publicInputsSHA256!==null);
  for(const name of ['nativeBindingSHA256','reservationTransactionHash','executionSnapshotSHA256'])hex(value[name]);
  need(value.lossClause==='FULL_OWNER_REFUND_PROVIDER_LOSS_V1');return freeze(value);
}
export function validateDeviceExecutionConsentFreshV1(raw,now=Date.now()){
  const value=normalizeDeviceExecutionConsentV1(raw);validateDeviceReservationConsentFreshV1(value.reservation,now);return value;
}
export function deviceExecutionConsentMessageV1(raw){
  const value=normalizeDeviceExecutionConsentV1(raw),ascii=text=>Uint8Array.from(text,c=>c.charCodeAt(0));
  const bytes=text=>Uint8Array.from(text.match(/../g),byte=>Number.parseInt(byte,16));
  const fields=[ascii(value.profile),new Uint8Array([1]),ascii(value.action),deviceReservationConsentMessageV1(value.reservation),
    ...['nativeBindingSHA256','reservationTransactionHash','executionSnapshotSHA256'].map(name=>bytes(value[name])),ascii(value.lossClause)];
  const size=fields.reduce((sum,field)=>sum+4+field.length,0);need(size<=4096);
  const result=new Uint8Array(size),view=new DataView(result.buffer);let offset=0;
  for(const field of fields){view.setUint32(offset,field.length,false);offset+=4;result.set(field,offset);offset+=field.length;}return result;
}
