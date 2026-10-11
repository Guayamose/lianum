/** Device U/S domains, never a constructor or native-dispatch capability.
 * The exact owner openings enter one original ephemeral worker. Neither a
 * signing key nor an encryption root is a field of this transport. Custody is
 * the device's signed declaration, not server verification of SecureStore. */
import { normalizeOriginalAccountBindingV2, normalizeOriginalAccountSignatureV2 } from './original-account-review-v2.mjs';
import { normalizeMobileOrigin } from './authorization.mjs';
/** @typedef {import('./device-reservation-consent-v1.mjs').DeviceReservationOpeningV1} DeviceReservationOpeningV1 */
/** @typedef {import('./device-reservation-consent-v1.mjs').DeviceReservationNodeV1} DeviceReservationNodeV1 */
/** @typedef {import('./device-reservation-consent-v1.mjs').DeviceReservationInputV1} DeviceReservationInputV1 */
/** @typedef {import('./device-reservation-consent-v1.mjs').DeviceReservationStatementV1} DeviceReservationStatementV1 */
/** @typedef {import('./device-reservation-consent-v1.mjs').DeviceReservationCustodyV1} DeviceReservationCustodyV1 */
/** @typedef {import('./device-reservation-consent-v1.mjs').DeviceReservationActionV1} DeviceReservationActionV1 */
/** @typedef {import('./device-reservation-consent-v1.mjs').DeviceReservationCapsuleOptionsV1} DeviceReservationCapsuleOptionsV1 */
/** @typedef {import('./device-reservation-consent-v1.mjs').DeviceReservationWitnessV1} DeviceReservationWitnessV1 */
/** @typedef {import('./device-reservation-consent-v1.mjs').DeviceReservationConsentV1} DeviceReservationConsentV1 */
/** @typedef {import('./device-reservation-consent-v1.mjs').DeviceReservationQuoteV1} DeviceReservationQuoteV1 */
/** @typedef {import('./device-reservation-consent-v1.mjs').DeviceReservationStatusV1} DeviceReservationStatusV1 */
export const DEVICE_RESERVATION_CONSENT_V1 = 'LIANUM_DEVICE_ORIGINAL_US_V1';
export const DEVICE_RESERVATION_DISCLOSURE_V1 = 'ONE_FUNDED_OWNER_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER';
const ZERO = '0'.repeat(64), PROFILE = 'LIANUM_PAEG_FUNDED_4_V1';
const HASH_FIELDS = /** @type {const} */ (['scope','policy','asset','operationId','inputCommitment','inputNullifier',
  'reservationIntent','graphCommitment','treeRoot','reserveCommitment','reserveNullifier','changeCommitment']);
const TIMES = /** @type {const} */ (['fundingNotBefore','fundingValidUntil','settleBefore']);
/** @type {(condition: unknown) => asserts condition} */
const need = condition => { if (!condition) throw Error('MOBILE_DEVICE_RESERVATION_INVALID'); };
/** @param {unknown} raw @param {readonly string[]} names @returns {Record<string, unknown>} */
function exact(raw, names) {
  need(typeof raw === 'object' && raw !== null && Object.getPrototypeOf(raw) === Object.prototype);
  const keys = Reflect.ownKeys(raw); need(keys.length === names.length && keys.every(key => names.some(name => name === key)));
  return Object.fromEntries(names.map(name => { const field = Object.getOwnPropertyDescriptor(raw, name);
    need(field?.enumerable && Object.hasOwn(field, 'value')); return [name, field.value]; }));
}
/** @param {unknown} value @param {number} [width] @param {boolean} [zero] @returns {string} */
const hex = (value, width = 64, zero = true) => {
  need(typeof value === 'string' && new RegExp('^[0-9a-f]{'+width+'}$').exec(value)?.[0] === value
    && (zero || value !== '0'.repeat(width))); return value;
};
/** @param {unknown} value @param {number} [bits] @returns {string} */
const uint = (value, bits = 64) => {
  need(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value
    && value.length <= Math.ceil(bits / 3) && BigInt(value) < (1n << BigInt(bits))); return value;
};
/** @template T @param {unknown} raw @param {number} count @param {(raw: unknown, index: number) => T} read @returns {T[]} */
function array(raw, count, read) {
  need(Array.isArray(raw) && Object.getPrototypeOf(raw) === Array.prototype && raw.length === count
    && Reflect.ownKeys(raw).length === count + 1);
  return Array.from({ length: count }, (_, i) => { const row = Object.getOwnPropertyDescriptor(raw, String(i));
    need(row?.enumerable && Object.hasOwn(row, 'value')); return read(row.value, i); });
}
/** @template T @param {unknown} raw @param {number} min @param {number} max @param {(raw: unknown, index: number) => T} read @returns {T[]} */
function list(raw, min, max, read) { need(Array.isArray(raw) && raw.length >= min && raw.length <= max); return array(raw, raw.length, read); }
/** @template {string} T @param {unknown} value @param {readonly T[]} choices @returns {value is T} */
const oneOf=(value,choices)=>choices.some(choice=>choice===value);
/** @template {string} K @template V @param {Record<string,unknown>} value @param {readonly K[]} names @param {(raw:unknown)=>V} read @returns {Record<K,V>} */
function readFields(value,names,read){return /** @type {Record<K,V>} */(Object.fromEntries(names.map(name=>[name,read(value[name])])));}
/** @template T @param {T} value @returns {Readonly<T>} */
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
/** @param {unknown} raw @param {boolean} [empty] @returns {DeviceReservationOpeningV1} */
function opening(raw, empty = false) {
  const value = exact(raw, ['type','rho','x','y','value','secret']); need(value.type === 4);
  const amount=uint(value.value), hashes=readFields(value,['rho','x','y','secret'],raw=>hex(raw));
  need(empty || BigInt(amount)>0n);
  if(amount==='0')need(Object.values(hashes).every(value=>value===ZERO));
  /** @type {DeviceReservationOpeningV1} */ const validated={type:value.type,...hashes,value:amount};
  return Object.assign(value,validated);
}
/** @param {unknown} raw @returns {DeviceReservationNodeV1[]} */
function nodes(raw) {
  const value = list(raw, 1, 4, raw => {
    const node=exact(raw,['id','chainDomain','evidencePolicy','actionCommitment','dependsOn','payout']);
    need(typeof node.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.exec(node.id)?.[0]===node.id);
    const hashes=readFields(node,['chainDomain','evidencePolicy','actionCommitment'],raw=>hex(raw,64,false));
    const dependsOn=list(node.dependsOn,0,3,id=>{need(typeof id==='string');return id;}).sort();
    need(new Set(dependsOn).size===dependsOn.length);
    const payout=exact(node.payout,['x','y','value','secret','randomness']);
    const payoutHashes=readFields(payout,['x','y','secret','randomness'],raw=>hex(raw)), amount=uint(payout.value);need(BigInt(amount)>0n);
    /** @type {DeviceReservationNodeV1} */
    const validated={id:node.id,...hashes,dependsOn,payout:Object.assign(payout,payoutHashes,{value:amount})};
    return Object.assign(node,validated);
  });
  const byId=new Map(value.map(node=>[node.id,node]));need(byId.size===value.length);
  for(const node of value)need(node.dependsOn.every(id=>id!==node.id&&byId.has(id)));
  const remaining=new Set(byId.keys());
  /** @type {Set<string>} */ const complete=new Set();
  /** @type {DeviceReservationNodeV1[]} */ const result=[];
  while(remaining.size){const ready=[...remaining].filter(id=>{const node=byId.get(id);need(node);return node.dependsOn.every(id=>complete.has(id));}).sort();need(ready.length);
    for(const id of ready){const node=byId.get(id);need(node);result.push(node);remaining.delete(id);complete.add(id);}}
  return result;
}
/** @param {unknown} raw @returns {DeviceReservationInputV1} */
export function normalizeDeviceReservationInputV1(raw) {
  const value=exact(raw,['scope','policy','asset','operationId','budget',...TIMES,'reservationNonce',
    'reserveSecret','graphNonce','inputNote','changeNote','recoveryNote','nodes','paddingSalts']);
  const hashes=readFields(value,['scope','policy','asset','operationId','reservationNonce','reserveSecret','graphNonce'],raw=>hex(raw,64,false));
  const budget=uint(value.budget);need(BigInt(budget)>0n);const times=readFields(value,TIMES,raw=>uint(raw));
  need(BigInt(times.fundingNotBefore)<BigInt(times.fundingValidUntil)&&BigInt(times.fundingValidUntil)<=BigInt(times.settleBefore));
  const inputNote=opening(value.inputNote),changeNote=opening(value.changeNote,true),recoveryNote=opening(value.recoveryNote);
  need(BigInt(inputNote.value)===BigInt(budget)+BigInt(changeNote.value)&&recoveryNote.value===budget);
  const selectedNodes=nodes(value.nodes);need(selectedNodes.reduce((sum,node)=>sum+BigInt(node.payout.value),0n)===BigInt(budget));
  const paddingSalts=array(value.paddingSalts,4,value=>hex(value,64,false));
  return Object.assign(value,hashes,times,{budget,inputNote,changeNote,recoveryNote,nodes:selectedNodes,paddingSalts});
}
/** @param {unknown} raw @returns {Readonly<DeviceReservationStatementV1>} */
export function normalizeDeviceReservationStatementV1(raw) {
  const value=exact(raw,['profile',...HASH_FIELDS,'outputs','recoveryCommitment',...TIMES]);need(value.profile===PROFILE);
  const hashes=readFields(value,[...HASH_FIELDS,'recoveryCommitment'],raw=>hex(raw,64,false));
  const outputs=array(value.outputs,4,value=>hex(value,64,false)),times=readFields(value,TIMES,raw=>uint(raw));
  need(BigInt(times.fundingNotBefore)<BigInt(times.fundingValidUntil)&&BigInt(times.fundingValidUntil)<=BigInt(times.settleBefore));
  /** @type {DeviceReservationStatementV1} */ const validated={profile:value.profile,...hashes,outputs,...times};
  return freeze(Object.assign(value,validated));
}
/** @param {unknown} raw @returns {Readonly<DeviceReservationCustodyV1>} */
export function normalizeDeviceReservationCustodyV1(raw) {
  const fields=/** @type {const} */(['rootId','encryptedRecordSHA256','frameSHA256','sourceCommitment','sourceNullifier','changeCommitment','recoveryCommitment']);
  const value=exact(raw,['rootId','noteRevision',...fields.slice(1)]);
  need(typeof value.noteRevision==='number'&&Number.isSafeInteger(value.noteRevision)&&value.noteRevision>=0&&!Object.is(value.noteRevision,-0));
  return freeze(Object.assign(value,readFields(value,fields,raw=>hex(raw,64,false)),{noteRevision:value.noteRevision}));
}
/** @param {unknown} raw @returns {DeviceReservationCapsuleOptionsV1} */
export function normalizeDeviceReservationCapsuleOptionsV1(raw) {
  const value=exact(raw,['nodes','slotSalts']);
  const selectedNodes=list(value.nodes,1,4,raw=>{
    const node=exact(raw,['id','action','receiptSpendSecret']);need(typeof node.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.exec(node.id)?.[0]===node.id);
    const receiptSpendSecret=hex(node.receiptSpendSecret,64,false);
    const action=exact(node.action,['chainDomain','signerIdentity','sourceCommitment','destinationCommitment','amount',
      'custodyKind','custodyCommitment','executionFrom','executionUntil','settleBefore','receiptKeyCommitment',
      'receiptRho','deliveryRiskCommitment','actionSalt']);
    need(action.custodyKind===1);const amount=uint(action.amount,128);need(BigInt(amount)>0n);
    const times=readFields(action,['executionFrom','executionUntil','settleBefore'],raw=>uint(raw));
    need(BigInt(times.executionFrom)<BigInt(times.executionUntil)&&BigInt(times.executionUntil)<=BigInt(times.settleBefore));
    const hashes=readFields(action,['chainDomain','signerIdentity','sourceCommitment','destinationCommitment','custodyCommitment',
      'receiptKeyCommitment','receiptRho','deliveryRiskCommitment','actionSalt'],raw=>hex(raw,64,false));
    /** @type {DeviceReservationActionV1} */const validatedAction={...hashes,amount,custodyKind:action.custodyKind,...times};
    return Object.assign(node,{id:node.id,action:Object.assign(action,validatedAction),receiptSpendSecret});
  });
  need(new Set(selectedNodes.map(node=>node.id)).size===selectedNodes.length);
  const slotSalts=array(value.slotSalts,4,raw=>{const row=exact(raw,['targetSalt','localCapsuleSalt','dependencyCapsuleSalt']);
    return Object.assign(row,readFields(row,['targetSalt','localCapsuleSalt','dependencyCapsuleSalt'],value=>hex(value,64,false)));});
  return Object.assign(value,{nodes:selectedNodes,slotSalts});
}
/** @param {unknown} raw @returns {DeviceReservationWitnessV1} */
export function normalizeDeviceReservationWitnessV1(raw) {
  const value=exact(raw,['input','ownerSignature','invoiceSignatures','envelopePreparation']);
  const input=normalizeDeviceReservationInputV1(value.input),ownerSignature=normalizeOriginalAccountSignatureV2(value.ownerSignature);
  const invoiceSignatures=array(value.invoiceSignatures,input.nodes.length,normalizeOriginalAccountSignatureV2);
  const envelopePreparation=exact(value.envelopePreparation,['capsuleOptions','joinBlinds','leafBlinds']);
  const capsuleOptions=normalizeDeviceReservationCapsuleOptionsV1(envelopePreparation.capsuleOptions);
  const joinBlinds=array(envelopePreparation.joinBlinds,4,value=>hex(value,64,false));
  const leafBlinds=array(envelopePreparation.leafBlinds,16,value=>hex(value,64,false));
  return Object.assign(value,{input,ownerSignature,invoiceSignatures,envelopePreparation:Object.assign(envelopePreparation,{capsuleOptions,joinBlinds,leafBlinds})});
}
/** @param {unknown} value @returns {void} */
export function wipeDeviceReservationWitnessV1(value) {
  if(value&&typeof value==='object'){const record=/** @type {Record<string,unknown>} */(value);for(const key of Object.keys(record)){
    if(record[key]&&typeof record[key]==='object')wipeDeviceReservationWitnessV1(record[key]);record[key]=null;}}
}
/** @param {unknown} raw @returns {Uint8Array} */
export function deviceReservationWitnessBytesV1(raw) {
  const value=normalizeDeviceReservationWitnessV1(raw);
  try { const text=JSON.stringify(value);need(text.length<=32768);return new TextEncoder().encode(text); }
  finally {wipeDeviceReservationWitnessV1(value);}
}
/** @param {unknown} raw @returns {DeviceReservationConsentV1['poolTerms']} */
function poolTerms(raw){const value=exact(raw,['scope','policy','codeHash','assetIdentity','domainCommitment']);
  return Object.assign(value,readFields(value,['scope','policy','codeHash','assetIdentity','domainCommitment'],raw=>hex(raw,64,false)));}
/** @param {unknown} raw @returns {DeviceReservationConsentV1['observed']} */
function observed(raw){const value=exact(raw,['blockNumber','blockHash','timestamp']);
  const blockNumber=uint(value.blockNumber),blockHash=hex(value.blockHash),timestamp=uint(value.timestamp);
  return Object.assign(value,{blockNumber,blockHash,timestamp});}
/** @param {unknown} raw @returns {NonNullable<DeviceReservationStatusV1['observation']>['changePath']} */
function notePath(raw){const value=exact(raw,['root','index','leaf','siblings']),root=hex(value.root),leaf=hex(value.leaf,64,false);
  need(typeof value.index==='number'&&Number.isSafeInteger(value.index)&&value.index>=0&&value.index<64);
  return Object.assign(value,{root,leaf,index:value.index,siblings:array(value.siblings,6,raw=>hex(raw))});}
/** @param {unknown} raw @returns {DeviceReservationQuoteV1} */
export function normalizeDeviceReservationQuoteV1(raw) {
  const value=exact(raw,['version','profile','origin','pairingId','devicePublicKey','quoteId','depositJobId','rootId',
    'sourceCommitment','sourceNullifier','poolTerms','proposal','capsuleOptions','invoiceSignatures','observed','expiresAt']);
  need(value.version===1&&value.profile==='LIANUM_DEVICE_ORIGINAL_US_QUOTE_V1');const origin=normalizeMobileOrigin(value.origin);
  const hashes=readFields(value,['pairingId','quoteId','depositJobId','rootId','sourceCommitment','sourceNullifier'],raw=>hex(raw,64,false));
  need(typeof value.devicePublicKey==='string'&&/^04[0-9a-f]{128}$/.exec(value.devicePublicKey)?.[0]===value.devicePublicKey
    &&typeof value.expiresAt==='number'&&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>0);
  const terms=poolTerms(value.poolTerms),proposal=exact(value.proposal,['scope','policy','asset','operationId','budget',...TIMES,'nodes']);
  const proposalHashes=readFields(proposal,['scope','policy','asset','operationId'],raw=>hex(raw,64,false)),budget=uint(proposal.budget),times=readFields(proposal,TIMES,raw=>uint(raw));
  need(BigInt(budget)>0n&&BigInt(times.fundingNotBefore)<BigInt(times.fundingValidUntil)&&BigInt(times.fundingValidUntil)<=BigInt(times.settleBefore));
  const selectedNodes=nodes(proposal.nodes);need(selectedNodes.reduce((sum,node)=>sum+BigInt(node.payout.value),0n)===BigInt(budget));
  need(proposalHashes.scope===terms.scope&&proposalHashes.policy===terms.policy&&proposalHashes.asset===terms.assetIdentity);
  const capsuleOptions=normalizeDeviceReservationCapsuleOptionsV1(value.capsuleOptions);
  need(capsuleOptions.nodes.length===selectedNodes.length&&capsuleOptions.nodes.every((node,i)=>node.id===selectedNodes[i].id));
  const invoiceSignatures=array(value.invoiceSignatures,selectedNodes.length,normalizeOriginalAccountSignatureV2),observation=observed(value.observed);
  /** @type {DeviceReservationQuoteV1} */
  const validated={version:value.version,profile:value.profile,origin,...hashes,devicePublicKey:value.devicePublicKey,expiresAt:value.expiresAt,
    poolTerms:terms,proposal:Object.assign(proposal,proposalHashes,times,{budget,nodes:selectedNodes}),capsuleOptions,invoiceSignatures,observed:observation};
  return freeze(Object.assign(value,validated));
}
/** @param {unknown} raw @returns {DeviceReservationStatusV1} */
export function normalizeDeviceReservationStatusV1(raw) {
  const value=exact(raw,['jobId','stage','consentFields','statement','observation','errorCode','authorizationSHA256']);const jobId=hex(value.jobId,64,false);
  need(oneOf(value.stage,/** @type {const} */(['PROVING','PROVED','FAILED','RESERVING','RESERVATION_UNKNOWN','RESERVED'])));
  const fields=exact(value.consentFields,['depositJobId','quoteId','jobId','custody','statement','witnessSHA256','proofSHA256','publicInputsSHA256']);
  const hashes=readFields(fields,['depositJobId','quoteId','jobId','witnessSHA256'],raw=>hex(raw,64,false));need(hashes.jobId===jobId);
  const custody=normalizeDeviceReservationCustodyV1(fields.custody),fieldStatement=normalizeDeviceReservationStatementV1(fields.statement);
  const proofSHA256=fields.proofSHA256===null?null:hex(fields.proofSHA256,64,false),publicInputsSHA256=fields.publicInputsSHA256===null?null:hex(fields.publicInputsSHA256,64,false);
  need((proofSHA256===null)===(publicInputsSHA256===null));
  if(['PROVED','RESERVING','RESERVATION_UNKNOWN','RESERVED'].includes(value.stage))need(proofSHA256!==null);
  need((value.stage==='RESERVED')===(value.observation!==null));
  const consentFields=Object.assign(fields,hashes,{custody,statement:fieldStatement,proofSHA256,publicInputsSHA256});
  const statement=normalizeDeviceReservationStatementV1(value.statement);need(JSON.stringify(statement)===JSON.stringify(fieldStatement));
  need(value.errorCode===null||(typeof value.errorCode==='string'&&/^[A-Z0-9_]{1,160}$/.exec(value.errorCode)?.[0]===value.errorCode));
  const authorizationSHA256=hex(value.authorizationSHA256,64,false);
  /** @type {DeviceReservationStatusV1['observation']} */ let observation=null;
  if(value.observation!==null){const frame=exact(value.observation,['profile','transactionHash','blockHash','blockNumber','timestamp',
    'sourceCommitment','sourceNullifier','changeCommitment','reserveCommitment','domainCommitment','envelope','admissionTag','currentHead','changePath','reservePath']);
    need(frame.profile==='LIANUM_DEVICE_ORIGINAL_S_OBSERVATION_V1');
    const frameHashes=readFields(frame,['transactionHash','blockHash','sourceCommitment','sourceNullifier','changeCommitment','reserveCommitment','domainCommitment','envelope','admissionTag'],raw=>hex(raw,64,false));
    const times=readFields(frame,['blockNumber','timestamp'],raw=>uint(raw)),currentHead=observed(frame.currentHead),changePath=notePath(frame.changePath),reservePath=notePath(frame.reservePath);
    need(frameHashes.sourceCommitment===fieldStatement.inputCommitment&&frameHashes.sourceNullifier===fieldStatement.inputNullifier
      &&frameHashes.changeCommitment===fieldStatement.changeCommitment&&frameHashes.reserveCommitment===fieldStatement.reserveCommitment
      &&changePath.leaf===frameHashes.changeCommitment&&reservePath.leaf===frameHashes.reserveCommitment);
    /** @type {NonNullable<DeviceReservationStatusV1['observation']>} */
    const checked={profile:frame.profile,...frameHashes,...times,currentHead,changePath,reservePath};
    observation=Object.assign(frame,checked);}
  /** @type {DeviceReservationStatusV1} */
  const validated={jobId,stage:value.stage,consentFields,statement,observation,errorCode:value.errorCode,authorizationSHA256};
  return freeze(Object.assign(value,validated));
}
/** @param {unknown} raw @returns {DeviceReservationConsentV1} */
export function normalizeDeviceReservationConsentV1(raw) {
  const value=exact(raw,['version','profile','action','origin','pairingId','devicePublicKey','challengeId','nonce','expiresAt',
    'binding','poolTerms','depositJobId','quoteId','jobId','custody','statement','witnessSHA256','proofSHA256','publicInputsSHA256','observed','openingDisclosure']);
  need(value.version===1&&value.profile===DEVICE_RESERVATION_CONSENT_V1&&oneOf(value.action,/** @type {const} */(['PROVE_U','RESERVE_S','OBSERVE_S'])));
  const origin=normalizeMobileOrigin(value.origin),hashes=readFields(value,['pairingId','challengeId','nonce','depositJobId','quoteId','jobId','witnessSHA256'],raw=>hex(raw,64,false));
  need(typeof value.devicePublicKey==='string'&&/^04[0-9a-f]{128}$/.exec(value.devicePublicKey)?.[0]===value.devicePublicKey
    &&new Set([hashes.pairingId,hashes.challengeId,hashes.nonce]).size===3&&typeof value.expiresAt==='number'&&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>0);
  const binding=normalizeOriginalAccountBindingV2(value.binding),terms=poolTerms(value.poolTerms);
  const statement=normalizeDeviceReservationStatementV1(value.statement),custody=normalizeDeviceReservationCustodyV1(value.custody);
  need(statement.scope===terms.scope&&statement.policy===terms.policy&&statement.asset===terms.assetIdentity
    &&custody.sourceCommitment===statement.inputCommitment&&custody.sourceNullifier===statement.inputNullifier
    &&custody.changeCommitment===statement.changeCommitment&&custody.recoveryCommitment===statement.recoveryCommitment);
  const observation=observed(value.observed);
  /** @type {DeviceReservationConsentV1['openingDisclosure']} */ let openingDisclosure=null;
  /** @type {string|null} */ let proofSHA256=null;
  /** @type {string|null} */ let publicInputsSHA256=null;
  if(value.action==='PROVE_U'){
    need(value.proofSHA256===null&&value.publicInputsSHA256===null&&value.openingDisclosure===DEVICE_RESERVATION_DISCLOSURE_V1);openingDisclosure=value.openingDisclosure;
  }else{
    need(value.openingDisclosure===null);
    if(value.proofSHA256===null&&value.publicInputsSHA256===null&&value.action==='OBSERVE_S'){}
    else{proofSHA256=hex(value.proofSHA256,64,false);publicInputsSHA256=hex(value.publicInputsSHA256,64,false);}
  }
  /** @type {DeviceReservationConsentV1} */
  const validated={version:value.version,profile:value.profile,action:value.action,origin,...hashes,devicePublicKey:value.devicePublicKey,
    expiresAt:value.expiresAt,binding,poolTerms:terms,custody,statement,proofSHA256,publicInputsSHA256,observed:observation,openingDisclosure};
  return freeze(Object.assign(value,validated));
}
/** @param {unknown} raw @param {number} [now] @returns {DeviceReservationConsentV1} */
export function validateDeviceReservationConsentFreshV1(raw,now=Date.now()) {
  const value=normalizeDeviceReservationConsentV1(raw);need(Number.isSafeInteger(now)&&value.expiresAt>now&&value.expiresAt<=now+15000);return value;
}
/** @param {unknown} raw @returns {Uint8Array} */
export function deviceReservationConsentMessageV1(raw) {
  const value=normalizeDeviceReservationConsentV1(raw);
  /** @param {string} text */
  const ascii=text=>{need(/^[\x20-\x7e]*$/.exec(text)?.[0]===text);return Uint8Array.from(text,c=>c.charCodeAt(0));};
  /** @param {string} value */
  const bytes=value=>{const pairs=value.match(/../g);need(pairs);return Uint8Array.from(pairs,byte=>Number.parseInt(byte,16));};
  /** @param {string|number} value */
  const integer=value=>bytes(BigInt(value).toString(16).padStart(16,'0'));
  /** @param {string|null} value */
  const nullable=value=>value===null?new Uint8Array([0]):new Uint8Array([1,...bytes(value)]);
  const fields=[ascii(value.profile),new Uint8Array([1]),ascii(value.action),ascii(value.origin),
    bytes(value.pairingId),bytes(value.devicePublicKey),bytes(value.challengeId),bytes(value.nonce),integer(value.expiresAt),
    ascii(JSON.stringify(value.binding)),...Object.values(value.poolTerms).map(bytes),
    ...(/** @type {const} */(['depositJobId','quoteId','jobId'])).map(name=>bytes(value[name])),
    bytes(value.custody.rootId),integer(value.custody.noteRevision),
    ...(/** @type {const} */(['encryptedRecordSHA256','frameSHA256','sourceCommitment','sourceNullifier','changeCommitment','recoveryCommitment'])).map(name=>bytes(value.custody[name])),
    ascii(value.statement.profile),...HASH_FIELDS.map(name=>bytes(value.statement[name])),...value.statement.outputs.map(bytes),
    bytes(value.statement.recoveryCommitment),...TIMES.map(name=>integer(value.statement[name])),
    bytes(value.witnessSHA256),nullable(value.proofSHA256),nullable(value.publicInputsSHA256),
    integer(value.observed.blockNumber),bytes(value.observed.blockHash),integer(value.observed.timestamp),
    value.openingDisclosure===null?new Uint8Array([0]):ascii(value.openingDisclosure)];
  // H4 frames every field, including the distinct consent domain. Keep the
  // protected mobile signer bound intact; no caller hash callback is used.
  const size=fields.reduce((sum,field)=>sum+4+field.length,0);need(size<=4096);
  const result=new Uint8Array(size),view=new DataView(result.buffer);let cursor=0;
  for(const field of fields){view.setUint32(cursor,field.length,false);cursor+=4;result.set(field,cursor);cursor+=field.length;}
  return result;
}
