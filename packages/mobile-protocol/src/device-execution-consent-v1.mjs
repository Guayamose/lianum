/** A device authorizes continuation of its original U/S, never another reserve.
 * This frame confers no custody/provider/quorum authority. Full owner refund
 * leaves any irreversible delivery at the original provider's accepted risk. */
import { normalizeDeviceReservationConsentV1,deviceReservationConsentMessageV1,
  validateDeviceReservationConsentFreshV1,normalizeDeviceReservationStatusV1 } from './device-reservation-consent-v1.mjs';
/** @typedef {import('./device-execution-consent-v1.mjs').DeviceExecutionConsentV1} DeviceExecutionConsentV1 */
/** @typedef {import('./device-execution-consent-v1.mjs').DeviceExecutionStatusV1} DeviceExecutionStatusV1 */
/** @typedef {DeviceExecutionStatusV1['executionSnapshot']} ExecutionSnapshot */
/** @typedef {NonNullable<ExecutionSnapshot['errorAuditBudget']>} AuditBudget */
export const DEVICE_EXECUTION_CONSENT_V1='LIANUM_DEVICE_ORIGINAL_EXECUTION_V1';
/** @type {(value: unknown) => asserts value} */
const need=value=>{if(!value)throw Error('MOBILE_DEVICE_EXECUTION_INVALID');};
/** @param {unknown} value @returns {string} */
const hex=value=>{need(typeof value==='string'&&/^[0-9a-f]{64}$/.exec(value)?.[0]===value&&value!=='0'.repeat(64));return value;};
/** @template {string | null} T @param {unknown} value @param {readonly T[]} choices @returns {value is T} */
const oneOf=(value,choices)=>choices.some(choice=>choice===value);
/** @template {string} K @template V @param {Record<string, unknown>} value
 * @param {readonly K[]} names @param {(raw: unknown) => V} read @returns {Record<K, V>} */
function readFields(value,names,read){return /** @type {Record<K,V>} */(Object.fromEntries(names.map(name=>[name,read(value[name])])));}
/** @template T @param {T} value @returns {Readonly<T>} */
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
/** @param {unknown} raw @returns {DeviceExecutionConsentV1} */
export function normalizeDeviceExecutionConsentV1(raw){
  const names=['version','profile','action','reservation','nativeBindingSHA256','reservationTransactionHash','executionSnapshotSHA256','lossClause'];
  const value=exactStatus(raw,names);
  need(value.version===1&&value.profile===DEVICE_EXECUTION_CONSENT_V1
    &&oneOf(value.action, /** @type {const} */ (['EXECUTE_NATIVE','RECONCILE_NATIVE','RECOVER_NATIVE'])));
  const reservation=normalizeDeviceReservationConsentV1(value.reservation);
  need(reservation.action==='OBSERVE_S'&&reservation.proofSHA256!==null&&reservation.publicInputsSHA256!==null);
  const hashes=readFields(value,['nativeBindingSHA256','reservationTransactionHash','executionSnapshotSHA256'],hex);
  need(value.lossClause==='FULL_OWNER_REFUND_PROVIDER_LOSS_V1');
  /** @type {DeviceExecutionConsentV1} */
  const validated={version:value.version,profile:value.profile,action:value.action,reservation,...hashes,lossClause:value.lossClause};
  return freeze(Object.assign(value,validated));
}
/** @param {unknown} raw @param {number} [now] @returns {DeviceExecutionConsentV1} */
export function validateDeviceExecutionConsentFreshV1(raw,now=Date.now()){
  const value=normalizeDeviceExecutionConsentV1(raw);validateDeviceReservationConsentFreshV1(value.reservation,now);return value;
}
/** @param {unknown} raw @returns {Uint8Array} */
export function deviceExecutionConsentMessageV1(raw){
  const value=normalizeDeviceExecutionConsentV1(raw);
  /** @param {string} text */
  const ascii=text=>Uint8Array.from(text,c=>c.charCodeAt(0));
  /** @param {string} text */
  const bytes=text=>{const pairs=text.match(/../g);need(pairs);return Uint8Array.from(pairs,byte=>Number.parseInt(byte,16));};
  const fields=[ascii(value.profile),new Uint8Array([1]),ascii(value.action),deviceReservationConsentMessageV1(value.reservation),
    ...(/** @type {const} */ (['nativeBindingSHA256','reservationTransactionHash','executionSnapshotSHA256'])).map(name=>bytes(value[name])),ascii(value.lossClause)];
  const size=fields.reduce((sum,field)=>sum+4+field.length,0);need(size<=4096);
  const result=new Uint8Array(size),view=new DataView(result.buffer);let offset=0;
  for(const field of fields){view.setUint32(offset,field.length,false);offset+=4;result.set(field,offset);offset+=field.length;}return result;
}

// Framing only: normalized statuses do not emit an observer, provider, grant or
// custody capability. Only the fixed TLS client can retain response provenance.
/** @param {unknown} raw @param {readonly string[]} names @returns {Record<string, unknown>} */
const exactStatus=(raw,names)=>{need(typeof raw==='object'&&raw!==null&&Object.getPrototypeOf(raw)===Object.prototype&&Reflect.ownKeys(raw).length===names.length);
  return Object.fromEntries(names.map(name=>{const row=Object.getOwnPropertyDescriptor(raw,name);need(row?.enumerable&&Object.hasOwn(row,'value'));return[name,row.value];}));};
/** @param {unknown} value @param {number} [max] @returns {number} */
const safeInteger=(value,max=Number.MAX_SAFE_INTEGER)=>{need(typeof value==='number'&&Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=0&&value<=max);return value;};
/** @param {unknown} value @returns {string} */
const label=value=>{need(typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.exec(value)?.[0]===value);return value;};
/** @param {unknown} value @returns {string | null} */
const errorLabel=value=>{need(value===null||(typeof value==='string'&&/^[A-Z0-9_]{1,160}$/.exec(value)?.[0]===value));return value;};
/** @template T @param {unknown} raw @param {number} max @param {(raw: unknown) => T} read @returns {T[]} */
function dense(raw,max,read){need(Array.isArray(raw)&&Object.getPrototypeOf(raw)===Array.prototype&&raw.length<=max&&Reflect.ownKeys(raw).length===raw.length+1);
  return Array.from({length:raw.length},(_,i)=>{const row=Object.getOwnPropertyDescriptor(raw,String(i));need(row?.enumerable&&Object.hasOwn(row,'value'));return read(row.value);});}
/** @param {unknown} raw @returns {AuditBudget} */
function auditBudget(raw){const scoped=Object.hasOwn(raw??{},'method')||Object.hasOwn(raw??{},'round'),value=exactStatus(raw,
  scoped?['phase','method','round','elapsedMilliseconds','limitMilliseconds']:['phase','elapsedMilliseconds','limitMilliseconds']);
  need(typeof value.phase==='string'&&['graph-current','after-native-audit','before-claim-coverage','after-claim-coverage','after-operation','claim-current',
    'before-graph-coverage','after-graph-coverage','synchronous-v4-fence'].includes(value.phase));
  /** @type {Pick<AuditBudget,'method'|'round'>} */ let details={};
  if(scoped){need(typeof value.method==='string'&&['operation','begin-payout','redeem','reserve-payout','debt-health','presign-payout','payout-broadcast'].includes(value.method));
    need(typeof value.round==='string'&&['whole-operation','initial-preparation','original-validation','existing-authorization','pre-key','persisted-return'].includes(value.round));details={method:value.method,round:value.round};}
  const elapsedMilliseconds=safeInteger(value.elapsedMilliseconds,3600000);need(value.limitMilliseconds===30000);
  /** @type {AuditBudget} */ const validated={phase:value.phase,...details,elapsedMilliseconds,limitMilliseconds:value.limitMilliseconds};
  return Object.assign(value,validated);
}
/** @param {unknown} raw @returns {ExecutionSnapshot} */
function snapshotV1(raw){const optional=Object.hasOwn(raw??{},'errorAuditBudget'),value=exactStatus(raw,['reference','stage','outcome','executionStarted',
  'nativeExposure','admittedReceipts','errorCode','errorCauseCodes',...(optional?['errorAuditBudget']:[]),
  'keeperRestart','nodeRestart','fullWalletAcceptance','claimsEnabled']);
  const reference=hex(value.reference),stage=label(value.stage);need(oneOf(value.outcome, /** @type {const} */ ([null,'FULFILLED','RECOVERED']))&&typeof value.executionStarted==='boolean');
  const nativeExposure=dense(value.nativeExposure,4,raw=>{const row=exactStatus(raw,['slot','family','status']);const slot=safeInteger(row.slot,3);
    need(oneOf(row.family, /** @type {const} */ (['3','4']))&&oneOf(row.status, /** @type {const} */ (['POSSIBLE','ADMITTED'])));
    return Object.assign(row,{slot,family:row.family,status:row.status});});
  need(new Set(nativeExposure.map(row=>row.slot)).size===nativeExposure.length);
  const admittedReceipts=safeInteger(value.admittedReceipts,4);need(admittedReceipts===nativeExposure.filter(row=>row.status==='ADMITTED').length);
  const errorCode=errorLabel(value.errorCode),errorCauseCodes=dense(value.errorCauseCodes,4,value=>{const code=errorLabel(value);need(code!==null);return code;});
  const budget=optional?{errorAuditBudget:auditBudget(value.errorAuditBudget)}:{};
  need(value.keeperRestart===false&&value.nodeRestart===false&&value.fullWalletAcceptance===false&&value.claimsEnabled===false);
  /** @type {ExecutionSnapshot} */
  const validated={reference,stage,outcome:value.outcome,executionStarted:value.executionStarted,nativeExposure,
    admittedReceipts,errorCode,errorCauseCodes,...budget,keeperRestart:value.keeperRestart,nodeRestart:value.nodeRestart,
    fullWalletAcceptance:value.fullWalletAcceptance,claimsEnabled:value.claimsEnabled};
  return Object.assign(value,validated);
}
/** @param {unknown} raw @returns {DeviceExecutionStatusV1} */
export function normalizeDeviceExecutionStatusV1(raw){const value=exactStatus(raw,['jobId','reservation','nativeBindingSHA256','executionSnapshot',
  'executionSnapshotSHA256','stage','outcome','terminal','errorCode','lossClause','authorizationSHA256']);
  const hashes=readFields(value,['jobId','nativeBindingSHA256','executionSnapshotSHA256','authorizationSHA256'],hex);
  const reservation=exactStatus(value.reservation,['jobId','stage','consentFields','statement','observation','errorCode']);
  // The existing U/S parser only checks framing. Supply the actual OUTER hash
  // for that check, then omit it from the nested projection; no synthetic hash.
  const checked=normalizeDeviceReservationStatusV1({...reservation,authorizationSHA256:value.authorizationSHA256});
  const {authorizationSHA256:_outerFramingHash,...reserved}=checked;
  need(reserved.stage==='RESERVED'&&reserved.jobId===value.jobId);const executionSnapshot=snapshotV1(value.executionSnapshot);
  need(executionSnapshot.reference===value.jobId&&oneOf(value.stage, /** @type {const} */ (['PREPARED','EXECUTING','UNKNOWN','FULFILLED','RECOVERING','RECOVERED'])));
  need(oneOf(value.outcome, /** @type {const} */ ([null,'FULFILLED','RECOVERED'])));const errorCode=errorLabel(value.errorCode);
  need(value.lossClause==='FULL_OWNER_REFUND_PROVIDER_LOSS_V1');
  /** @type {DeviceExecutionStatusV1['terminal']} */ let terminalFrame=null;
  if(value.terminal!==null){const frame=exactStatus(value.terminal,['transactionHash','blockHash','blockNumber','calldataSHA256','outcome']);
    const terminalHashes=readFields(frame,['transactionHash','blockHash','calldataSHA256'],hex);
    need(typeof frame.blockNumber==='string'&&/^(0|[1-9][0-9]{0,19})$/.exec(frame.blockNumber)?.[0]===frame.blockNumber
      &&BigInt(frame.blockNumber)<(1n<<64n));need(oneOf(frame.outcome, /** @type {const} */ (['FULFILLED','RECOVERED'])));
    terminalFrame=Object.assign(frame,{...terminalHashes,blockNumber:frame.blockNumber,outcome:frame.outcome});}

  const terminal=['FULFILLED','RECOVERED'].includes(value.stage);need(terminal===(value.terminal!==null)&&terminal===(value.outcome!==null));
  if(terminal){need(terminalFrame);need(value.stage===value.outcome&&terminalFrame.outcome===value.outcome&&executionSnapshot.outcome===value.outcome&&value.errorCode===null);}
  // UNKNOWN with a terminal executor snapshot still requires the original
  // account reconciliation; normalization never promotes that snapshot alone.
  /** @type {DeviceExecutionStatusV1} */
  const validated={...hashes,reservation:reserved,executionSnapshot,stage:value.stage,outcome:value.outcome,
    terminal:terminalFrame,errorCode,lossClause:value.lossClause};
  return freeze(Object.assign(value,validated));
}
/** @param {unknown} raw @returns {Uint8Array} */
export function deviceExecutionSnapshotBytesV1(raw){const value=snapshotV1(raw);
  // Byte-identical to engine privacy.canonical()/generic-account-journal.sha:
  // the validated snapshot contains only dense arrays/plain objects/safe data.
  /** @param {unknown} value @returns {string} */
  const canonical=value=>{
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(value!==null&&typeof value==='object'){
      const record=/** @type {Record<string, unknown>} */(value);
      return '{'+Object.keys(record).sort().map(key=>JSON.stringify(key)+':'+canonical(record[key])).join(',')+'}';
    }
    const text=JSON.stringify(value);need(typeof text==='string');return text;
  };
  const bytes=new TextEncoder().encode(canonical(value));need(bytes.length<=8192);return bytes;
}
