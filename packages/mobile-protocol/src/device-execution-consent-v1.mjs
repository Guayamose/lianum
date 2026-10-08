/** A device authorizes continuation of its original U/S, never another reserve.
 * This frame confers no custody/provider/quorum authority. Full owner refund
 * leaves any irreversible delivery at the original provider's accepted risk. */
import { normalizeDeviceReservationConsentV1,deviceReservationConsentMessageV1,
  validateDeviceReservationConsentFreshV1,normalizeDeviceReservationStatusV1 } from './device-reservation-consent-v1.mjs';
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

// Framing only: normalized statuses do not emit an observer, provider, grant or
// custody capability. Only the fixed TLS client can retain response provenance.
const exactStatus=(raw,names)=>{need(raw&&Object.getPrototypeOf(raw)===Object.prototype&&Reflect.ownKeys(raw).length===names.length);
  return Object.fromEntries(names.map(name=>{const row=Object.getOwnPropertyDescriptor(raw,name);need(row?.enumerable&&Object.hasOwn(row,'value'));return[name,row.value];}));};
const safeInteger=(value,max=Number.MAX_SAFE_INTEGER)=>{need(Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=0&&value<=max);return value;};
const label=value=>{need(typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.exec(value)?.[0]===value);return value;};
const errorLabel=value=>{need(value===null||(typeof value==='string'&&/^[A-Z0-9_]{1,160}$/.exec(value)?.[0]===value));return value;};
function dense(raw,max,read){need(Array.isArray(raw)&&Object.getPrototypeOf(raw)===Array.prototype&&raw.length<=max&&Reflect.ownKeys(raw).length===raw.length+1);
  return Array.from({length:raw.length},(_,i)=>{const row=Object.getOwnPropertyDescriptor(raw,String(i));need(row?.enumerable&&Object.hasOwn(row,'value'));return read(row.value);});}
function auditBudget(raw){const scoped=Object.hasOwn(raw??{},'method')||Object.hasOwn(raw??{},'round'),value=exactStatus(raw,
  scoped?['phase','method','round','elapsedMilliseconds','limitMilliseconds']:['phase','elapsedMilliseconds','limitMilliseconds']);
  need(['graph-current','after-native-audit','before-claim-coverage','after-claim-coverage','after-operation','claim-current',
    'before-graph-coverage','after-graph-coverage','synchronous-v4-fence'].includes(value.phase));
  if(scoped){need(['operation','begin-payout','redeem','reserve-payout','debt-health','presign-payout','payout-broadcast'].includes(value.method));
    need(['whole-operation','initial-preparation','original-validation','existing-authorization','pre-key','persisted-return'].includes(value.round));}
  safeInteger(value.elapsedMilliseconds,3600000);need(value.limitMilliseconds===30000);return value;
}
function snapshotV1(raw){const optional=Object.hasOwn(raw??{},'errorAuditBudget'),value=exactStatus(raw,['reference','stage','outcome','executionStarted',
  'nativeExposure','admittedReceipts','errorCode','errorCauseCodes',...(optional?['errorAuditBudget']:[]),
  'keeperRestart','nodeRestart','fullWalletAcceptance','claimsEnabled']);
  hex(value.reference);label(value.stage);need([null,'FULFILLED','RECOVERED'].includes(value.outcome)&&typeof value.executionStarted==='boolean');
  value.nativeExposure=dense(value.nativeExposure,4,raw=>{const row=exactStatus(raw,['slot','family','status']);safeInteger(row.slot,3);
    need(['3','4'].includes(row.family)&&['POSSIBLE','ADMITTED'].includes(row.status));return row;});
  need(new Set(value.nativeExposure.map(row=>row.slot)).size===value.nativeExposure.length);
  safeInteger(value.admittedReceipts,4);need(value.admittedReceipts===value.nativeExposure.filter(row=>row.status==='ADMITTED').length);
  errorLabel(value.errorCode);value.errorCauseCodes=dense(value.errorCauseCodes,4,value=>{need(errorLabel(value)!==null);return value;});
  if(optional)value.errorAuditBudget=auditBudget(value.errorAuditBudget);
  need(['keeperRestart','nodeRestart','fullWalletAcceptance','claimsEnabled'].every(name=>value[name]===false));return value;
}
export function normalizeDeviceExecutionStatusV1(raw){const value=exactStatus(raw,['jobId','reservation','nativeBindingSHA256','executionSnapshot',
  'executionSnapshotSHA256','stage','outcome','terminal','errorCode','lossClause','authorizationSHA256']);
  ['jobId','nativeBindingSHA256','executionSnapshotSHA256','authorizationSHA256'].forEach(name=>hex(value[name]));
  const reservation=exactStatus(value.reservation,['jobId','stage','consentFields','statement','observation','errorCode']);
  // The existing U/S parser only checks framing. Supply the actual OUTER hash
  // for that check, then omit it from the nested projection; no synthetic hash.
  const checked=normalizeDeviceReservationStatusV1({...reservation,authorizationSHA256:value.authorizationSHA256});
  const {authorizationSHA256:_outerFramingHash,...reserved}=checked;value.reservation=reserved;
  need(reserved.stage==='RESERVED'&&reserved.jobId===value.jobId);value.executionSnapshot=snapshotV1(value.executionSnapshot);
  need(value.executionSnapshot.reference===value.jobId&&['PREPARED','EXECUTING','UNKNOWN','FULFILLED','RECOVERING','RECOVERED'].includes(value.stage));
  need([null,'FULFILLED','RECOVERED'].includes(value.outcome));errorLabel(value.errorCode);
  need(value.lossClause==='FULL_OWNER_REFUND_PROVIDER_LOSS_V1');
  if(value.terminal!==null){value.terminal=exactStatus(value.terminal,['transactionHash','blockHash','blockNumber','calldataSHA256','outcome']);
    ['transactionHash','blockHash','calldataSHA256'].forEach(name=>hex(value.terminal[name]));
    need(typeof value.terminal.blockNumber==='string'&&/^(0|[1-9][0-9]{0,19})$/.exec(value.terminal.blockNumber)?.[0]===value.terminal.blockNumber
      &&BigInt(value.terminal.blockNumber)<(1n<<64n));need(['FULFILLED','RECOVERED'].includes(value.terminal.outcome));}
  const terminal=['FULFILLED','RECOVERED'].includes(value.stage);need(terminal===(value.terminal!==null)&&terminal===(value.outcome!==null));
  if(terminal)need(value.stage===value.outcome&&value.terminal.outcome===value.outcome&&value.executionSnapshot.outcome===value.outcome&&value.errorCode===null);
  // UNKNOWN with a terminal executor snapshot still requires the original
  // account reconciliation; normalization never promotes that snapshot alone.
  return freeze(value);
}
export function deviceExecutionSnapshotBytesV1(raw){const value=snapshotV1(raw);
  // Byte-identical to engine privacy.canonical()/generic-account-journal.sha:
  // the validated snapshot contains only dense arrays/plain objects/safe data.
  const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']'
    :value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}'
    :JSON.stringify(value);
  const bytes=new TextEncoder().encode(canonical(value));need(bytes.length<=8192);return bytes;
}
