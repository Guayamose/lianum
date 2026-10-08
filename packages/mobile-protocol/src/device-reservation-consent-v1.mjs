/** Device U/S domains, never a constructor or native-dispatch capability.
 * The exact owner openings enter one original ephemeral worker. Neither a
 * signing key nor an encryption root is a field of this transport. Custody is
 * the device's signed declaration, not server verification of SecureStore. */
import { normalizeOriginalAccountBindingV2, normalizeOriginalAccountSignatureV2 } from './original-account-review-v2.mjs';
import { normalizeMobileOrigin } from './authorization.mjs';
export const DEVICE_RESERVATION_CONSENT_V1 = 'LIANUM_DEVICE_ORIGINAL_US_V1';
export const DEVICE_RESERVATION_DISCLOSURE_V1 = 'ONE_FUNDED_OWNER_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER';
const ZERO = '0'.repeat(64), PROFILE = 'LIANUM_PAEG_FUNDED_4_V1';
const HASH_FIELDS = ['scope','policy','asset','operationId','inputCommitment','inputNullifier',
  'reservationIntent','graphCommitment','treeRoot','reserveCommitment','reserveNullifier','changeCommitment'];
const TIMES = ['fundingNotBefore','fundingValidUntil','settleBefore'];
const need = condition => { if (!condition) throw Error('MOBILE_DEVICE_RESERVATION_INVALID'); };
function exact(raw, names) {
  need(raw && Object.getPrototypeOf(raw) === Object.prototype);
  const keys = Reflect.ownKeys(raw); need(keys.length === names.length && keys.every(key => names.includes(key)));
  return Object.fromEntries(names.map(name => { const field = Object.getOwnPropertyDescriptor(raw, name);
    need(field?.enumerable && Object.hasOwn(field, 'value')); return [name, field.value]; }));
}
const hex = (value, width = 64, zero = true) => {
  need(typeof value === 'string' && new RegExp('^[0-9a-f]{'+width+'}$').exec(value)?.[0] === value
    && (zero || value !== '0'.repeat(width))); return value;
};
const uint = (value, bits = 64) => {
  need(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value
    && value.length <= Math.ceil(bits / 3) && BigInt(value) < (1n << BigInt(bits))); return value;
};
function array(raw, count, read) {
  need(Array.isArray(raw) && Object.getPrototypeOf(raw) === Array.prototype && raw.length === count
    && Reflect.ownKeys(raw).length === count + 1);
  return Array.from({ length: count }, (_, i) => { const row = Object.getOwnPropertyDescriptor(raw, String(i));
    need(row?.enumerable && Object.hasOwn(row, 'value')); return read(row.value, i); });
}
function list(raw, min, max, read) { need(Array.isArray(raw) && raw.length >= min && raw.length <= max); return array(raw, raw.length, read); }
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function opening(raw, empty = false) {
  const value = exact(raw, ['type','rho','x','y','value','secret']); need(value.type === 4); uint(value.value);
  for (const name of ['rho','x','y','secret']) hex(value[name]);
  need(empty || BigInt(value.value) > 0n);
  if (value.value === '0') need(['rho','x','y','secret'].every(name => value[name] === ZERO)); return value;
}
function nodes(raw) {
  const value = list(raw, 1, 4, raw => {
    const node = exact(raw, ['id','chainDomain','evidencePolicy','actionCommitment','dependsOn','payout']);
    need(typeof node.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.exec(node.id)?.[0] === node.id);
    for (const name of ['chainDomain','evidencePolicy','actionCommitment']) hex(node[name],64,false);
    node.dependsOn = list(node.dependsOn,0,3,id => { need(typeof id === 'string'); return id; }).sort();
    need(new Set(node.dependsOn).size === node.dependsOn.length);
    node.payout = exact(node.payout,['x','y','value','secret','randomness']);
    ['x','y','secret','randomness'].forEach(name => hex(node.payout[name])); uint(node.payout.value); need(BigInt(node.payout.value)>0n);
    return node;
  });
  const byId = new Map(value.map(node => [node.id,node])); need(byId.size === value.length);
  for (const node of value) need(node.dependsOn.every(id => id !== node.id && byId.has(id)));
  const remaining = new Set(byId.keys()), complete = new Set(), result = [];
  while (remaining.size) { const ready = [...remaining].filter(id => byId.get(id).dependsOn.every(id => complete.has(id))).sort(); need(ready.length);
    for (const id of ready) { result.push(byId.get(id)); remaining.delete(id); complete.add(id); } } return result;
}
export function normalizeDeviceReservationInputV1(raw) {
  const value = exact(raw,['scope','policy','asset','operationId','budget',...TIMES,'reservationNonce',
    'reserveSecret','graphNonce','inputNote','changeNote','recoveryNote','nodes','paddingSalts']);
  ['scope','policy','asset','operationId','reservationNonce','reserveSecret','graphNonce'].forEach(name=>hex(value[name],64,false));
  uint(value.budget); need(BigInt(value.budget)>0n); TIMES.forEach(name=>uint(value[name]));
  need(BigInt(value.fundingNotBefore)<BigInt(value.fundingValidUntil) && BigInt(value.fundingValidUntil)<=BigInt(value.settleBefore));
  value.inputNote=opening(value.inputNote);value.changeNote=opening(value.changeNote,true);value.recoveryNote=opening(value.recoveryNote);
  need(BigInt(value.inputNote.value)===BigInt(value.budget)+BigInt(value.changeNote.value) && value.recoveryNote.value===value.budget);
  value.nodes=nodes(value.nodes);need(value.nodes.reduce((sum,node)=>sum+BigInt(node.payout.value),0n)===BigInt(value.budget));
  value.paddingSalts=array(value.paddingSalts,4,value=>hex(value,64,false));return value;
}
export function normalizeDeviceReservationStatementV1(raw) {
  const value=exact(raw,['profile',...HASH_FIELDS,'outputs','recoveryCommitment',...TIMES]);need(value.profile===PROFILE);
  [...HASH_FIELDS,'recoveryCommitment'].forEach(name=>hex(value[name],64,false));
  value.outputs=array(value.outputs,4,value=>hex(value,64,false));TIMES.forEach(name=>uint(value[name]));
  need(BigInt(value.fundingNotBefore)<BigInt(value.fundingValidUntil) && BigInt(value.fundingValidUntil)<=BigInt(value.settleBefore));return freeze(value);
}
export function normalizeDeviceReservationCustodyV1(raw) {
  const value=exact(raw,['rootId','noteRevision','encryptedRecordSHA256','frameSHA256','sourceCommitment',
    'sourceNullifier','changeCommitment','recoveryCommitment']);
  need(Number.isSafeInteger(value.noteRevision)&&value.noteRevision>=0&&!Object.is(value.noteRevision,-0));
  for(const name of Object.keys(value))if(name!=='noteRevision')hex(value[name],64,false);return freeze(value);
}
export function normalizeDeviceReservationCapsuleOptionsV1(raw) {
  const value=exact(raw,['nodes','slotSalts']);
  value.nodes=list(value.nodes,1,4,raw=>{
    const node=exact(raw,['id','action','receiptSpendSecret']);need(typeof node.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.exec(node.id)?.[0]===node.id);
    hex(node.receiptSpendSecret,64,false);
    node.action=exact(node.action,['chainDomain','signerIdentity','sourceCommitment','destinationCommitment','amount',
      'custodyKind','custodyCommitment','executionFrom','executionUntil','settleBefore','receiptKeyCommitment',
      'receiptRho','deliveryRiskCommitment','actionSalt']);
    need(node.action.custodyKind===1);uint(node.action.amount,128);need(BigInt(node.action.amount)>0n);
    ['executionFrom','executionUntil','settleBefore'].forEach(name=>uint(node.action[name]));
    need(BigInt(node.action.executionFrom)<BigInt(node.action.executionUntil)&&BigInt(node.action.executionUntil)<=BigInt(node.action.settleBefore));
    for(const name of Object.keys(node.action))if(!['amount','custodyKind','executionFrom','executionUntil','settleBefore'].includes(name))hex(node.action[name],64,false);
    return node;
  });
  need(new Set(value.nodes.map(node=>node.id)).size===value.nodes.length);
  value.slotSalts=array(value.slotSalts,4,raw=>{const row=exact(raw,['targetSalt','localCapsuleSalt','dependencyCapsuleSalt']);
    Object.values(row).forEach(value=>hex(value,64,false));return row;});return value;
}
export function normalizeDeviceReservationWitnessV1(raw) {
  const value=exact(raw,['input','ownerSignature','invoiceSignatures','envelopePreparation']);
  value.input=normalizeDeviceReservationInputV1(value.input);value.ownerSignature=normalizeOriginalAccountSignatureV2(value.ownerSignature);
  value.invoiceSignatures=array(value.invoiceSignatures,value.input.nodes.length,normalizeOriginalAccountSignatureV2);
  value.envelopePreparation=exact(value.envelopePreparation,['capsuleOptions','joinBlinds','leafBlinds']);
  value.envelopePreparation.capsuleOptions=normalizeDeviceReservationCapsuleOptionsV1(value.envelopePreparation.capsuleOptions);
  value.envelopePreparation.joinBlinds=array(value.envelopePreparation.joinBlinds,4,value=>hex(value,64,false));
  value.envelopePreparation.leafBlinds=array(value.envelopePreparation.leafBlinds,16,value=>hex(value,64,false));return value;
}
export function wipeDeviceReservationWitnessV1(value) {
  if(value&&typeof value==='object')for(const key of Object.keys(value)){
    if(value[key]&&typeof value[key]==='object')wipeDeviceReservationWitnessV1(value[key]);value[key]=null;}
}
export function deviceReservationWitnessBytesV1(raw) {
  const value=normalizeDeviceReservationWitnessV1(raw);
  try { const text=JSON.stringify(value);need(text.length<=32768);return new TextEncoder().encode(text); }
  finally {wipeDeviceReservationWitnessV1(value);}
}
export function normalizeDeviceReservationQuoteV1(raw) {
  const value=exact(raw,['version','profile','origin','pairingId','devicePublicKey','quoteId','depositJobId','rootId',
    'sourceCommitment','sourceNullifier','poolTerms','proposal','capsuleOptions','invoiceSignatures','observed','expiresAt']);
  need(value.version===1&&value.profile==='LIANUM_DEVICE_ORIGINAL_US_QUOTE_V1');normalizeMobileOrigin(value.origin);
  ['pairingId','quoteId','depositJobId','rootId','sourceCommitment','sourceNullifier'].forEach(name=>hex(value[name],64,false));
  need(/^04[0-9a-f]{128}$/.exec(value.devicePublicKey)?.[0]===value.devicePublicKey&&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>0);
  value.poolTerms=exact(value.poolTerms,['scope','policy','codeHash','assetIdentity','domainCommitment']);Object.values(value.poolTerms).forEach(value=>hex(value,64,false));
  value.proposal=exact(value.proposal,['scope','policy','asset','operationId','budget',...TIMES,'nodes']);
  ['scope','policy','asset','operationId'].forEach(name=>hex(value.proposal[name],64,false));uint(value.proposal.budget);TIMES.forEach(name=>uint(value.proposal[name]));
  need(BigInt(value.proposal.budget)>0n&&BigInt(value.proposal.fundingNotBefore)<BigInt(value.proposal.fundingValidUntil)
    &&BigInt(value.proposal.fundingValidUntil)<=BigInt(value.proposal.settleBefore));value.proposal.nodes=nodes(value.proposal.nodes);
  need(value.proposal.nodes.reduce((sum,node)=>sum+BigInt(node.payout.value),0n)===BigInt(value.proposal.budget));
  need(value.proposal.scope===value.poolTerms.scope&&value.proposal.policy===value.poolTerms.policy&&value.proposal.asset===value.poolTerms.assetIdentity);
  value.capsuleOptions=normalizeDeviceReservationCapsuleOptionsV1(value.capsuleOptions);
  need(value.capsuleOptions.nodes.length===value.proposal.nodes.length&&value.capsuleOptions.nodes.every((node,i)=>node.id===value.proposal.nodes[i].id));
  value.invoiceSignatures=array(value.invoiceSignatures,value.proposal.nodes.length,normalizeOriginalAccountSignatureV2);
  value.observed=exact(value.observed,['blockNumber','blockHash','timestamp']);uint(value.observed.blockNumber);hex(value.observed.blockHash);uint(value.observed.timestamp);
  return freeze(value);
}
export function normalizeDeviceReservationStatusV1(raw) {
  const value=exact(raw,['jobId','stage','consentFields','statement','observation','errorCode','authorizationSHA256']);hex(value.jobId,64,false);
  need(['PROVING','PROVED','FAILED','RESERVING','RESERVATION_UNKNOWN','RESERVED'].includes(value.stage));
  const fields=exact(value.consentFields,['depositJobId','quoteId','jobId','custody','statement','witnessSHA256','proofSHA256','publicInputsSHA256']);
  ['depositJobId','quoteId','jobId','witnessSHA256'].forEach(name=>hex(fields[name],64,false));need(fields.jobId===value.jobId);
  fields.custody=normalizeDeviceReservationCustodyV1(fields.custody);fields.statement=normalizeDeviceReservationStatementV1(fields.statement);
  for(const name of ['proofSHA256','publicInputsSHA256'])if(fields[name]!==null)hex(fields[name],64,false);
  need((fields.proofSHA256===null)===(fields.publicInputsSHA256===null));
  if(['PROVED','RESERVING','RESERVATION_UNKNOWN','RESERVED'].includes(value.stage))need(fields.proofSHA256!==null);
  need((value.stage==='RESERVED')===(value.observation!==null));value.consentFields=fields;
  value.statement=normalizeDeviceReservationStatementV1(value.statement);need(JSON.stringify(value.statement)===JSON.stringify(fields.statement));
  need(value.errorCode===null||(typeof value.errorCode==='string'&&/^[A-Z0-9_]{1,160}$/.exec(value.errorCode)?.[0]===value.errorCode));
  hex(value.authorizationSHA256,64,false);
  if(value.observation!==null){const observation=exact(value.observation,['profile','transactionHash','blockHash','blockNumber','timestamp',
    'sourceCommitment','sourceNullifier','changeCommitment','reserveCommitment','domainCommitment','envelope','admissionTag','currentHead','changePath','reservePath']);
    need(observation.profile==='LIANUM_DEVICE_ORIGINAL_S_OBSERVATION_V1');
    ['transactionHash','blockHash','sourceCommitment','sourceNullifier','changeCommitment','reserveCommitment','domainCommitment','envelope','admissionTag'].forEach(name=>hex(observation[name],64,false));
    ['blockNumber','timestamp'].forEach(name=>uint(observation[name]));
    observation.currentHead=exact(observation.currentHead,['blockNumber','blockHash','timestamp']);uint(observation.currentHead.blockNumber);hex(observation.currentHead.blockHash);uint(observation.currentHead.timestamp);
    for(const name of ['changePath','reservePath']){const path=exact(observation[name],['root','index','leaf','siblings']);
      hex(path.root);hex(path.leaf,64,false);need(Number.isSafeInteger(path.index)&&path.index>=0&&path.index<64);path.siblings=array(path.siblings,6,value=>hex(value));observation[name]=path;}
    need(observation.sourceCommitment===fields.statement.inputCommitment&&observation.sourceNullifier===fields.statement.inputNullifier
      &&observation.changeCommitment===fields.statement.changeCommitment&&observation.reserveCommitment===fields.statement.reserveCommitment
      &&observation.changePath.leaf===observation.changeCommitment&&observation.reservePath.leaf===observation.reserveCommitment);
    value.observation=observation;}
  return freeze(value);
}
export function normalizeDeviceReservationConsentV1(raw) {
  const value=exact(raw,['version','profile','action','origin','pairingId','devicePublicKey','challengeId','nonce','expiresAt',
    'binding','poolTerms','depositJobId','quoteId','jobId','custody','statement','witnessSHA256','proofSHA256','publicInputsSHA256','observed','openingDisclosure']);
  need(value.version===1&&value.profile===DEVICE_RESERVATION_CONSENT_V1&&['PROVE_U','RESERVE_S','OBSERVE_S'].includes(value.action));
  normalizeMobileOrigin(value.origin);['pairingId','challengeId','nonce','depositJobId','quoteId','jobId','witnessSHA256'].forEach(name=>hex(value[name],64,false));
  need(/^04[0-9a-f]{128}$/.exec(value.devicePublicKey)?.[0]===value.devicePublicKey && new Set([value.pairingId,value.challengeId,value.nonce]).size===3
    &&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>0);
  value.binding=normalizeOriginalAccountBindingV2(value.binding);
  value.poolTerms=exact(value.poolTerms,['scope','policy','codeHash','assetIdentity','domainCommitment']);Object.values(value.poolTerms).forEach(value=>hex(value,64,false));
  value.statement=normalizeDeviceReservationStatementV1(value.statement);value.custody=normalizeDeviceReservationCustodyV1(value.custody);
  need(value.statement.scope===value.poolTerms.scope&&value.statement.policy===value.poolTerms.policy&&value.statement.asset===value.poolTerms.assetIdentity
    &&value.custody.sourceCommitment===value.statement.inputCommitment&&value.custody.sourceNullifier===value.statement.inputNullifier
    &&value.custody.changeCommitment===value.statement.changeCommitment&&value.custody.recoveryCommitment===value.statement.recoveryCommitment);
  value.observed=exact(value.observed,['blockNumber','blockHash','timestamp']);uint(value.observed.blockNumber);hex(value.observed.blockHash);uint(value.observed.timestamp);
  if(value.action==='PROVE_U')need(value.proofSHA256===null&&value.publicInputsSHA256===null&&value.openingDisclosure===DEVICE_RESERVATION_DISCLOSURE_V1);
  else {need(value.openingDisclosure===null);need((value.proofSHA256===null&&value.publicInputsSHA256===null&&value.action==='OBSERVE_S')
    ||(hex(value.proofSHA256,64,false)&&hex(value.publicInputsSHA256,64,false)));}
  return freeze(value);
}
export function validateDeviceReservationConsentFreshV1(raw,now=Date.now()) {
  const value=normalizeDeviceReservationConsentV1(raw);need(Number.isSafeInteger(now)&&value.expiresAt>now&&value.expiresAt<=now+15000);return value;
}
export function deviceReservationConsentMessageV1(raw) {
  const value=normalizeDeviceReservationConsentV1(raw);
  const ascii=text=>{need(/^[\x20-\x7e]*$/.exec(text)?.[0]===text);return Uint8Array.from(text,c=>c.charCodeAt(0));};
  const bytes=value=>Uint8Array.from(value.match(/../g),byte=>Number.parseInt(byte,16));
  const integer=value=>bytes(BigInt(value).toString(16).padStart(16,'0'));
  const nullable=value=>value===null?new Uint8Array([0]):new Uint8Array([1,...bytes(value)]);
  const fields=[ascii(value.profile),new Uint8Array([1]),ascii(value.action),ascii(value.origin),
    bytes(value.pairingId),bytes(value.devicePublicKey),bytes(value.challengeId),bytes(value.nonce),integer(value.expiresAt),
    ascii(JSON.stringify(value.binding)),...Object.values(value.poolTerms).map(bytes),
    ...['depositJobId','quoteId','jobId'].map(name=>bytes(value[name])),
    bytes(value.custody.rootId),integer(value.custody.noteRevision),
    ...['encryptedRecordSHA256','frameSHA256','sourceCommitment','sourceNullifier','changeCommitment','recoveryCommitment'].map(name=>bytes(value.custody[name])),
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
