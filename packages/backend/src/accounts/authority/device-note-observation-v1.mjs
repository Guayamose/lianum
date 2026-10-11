/** Read-only projection of the already authenticated account's original
 * journal and canonical ledger. These functions create data, never ownership. */
import {normalizeExternalFlatStatusV1} from '@lianum/mobile-protocol/device/source-note-v1';
/** @typedef {import('@lianum/mobile-protocol/device/source-note-v1').ExternalFlatDescriptor} Descriptor */
/** @typedef {import('@lianum/mobile-protocol/device/source-note-v1').ExternalFlatConsent} Consent */
/** @typedef {import('@lianum/mobile-protocol/device/source-note-v1').ExternalFlatRow} Row */
/** @typedef {import('@lianum/mobile-protocol/device/source-note-v1').ExternalFlatStatus} Status */
/** @typedef {{jobId:string,mode:Row['mode'],stage:Row['stage'],consent:Consent,nullifier:string,proofSHA256:string|null,publicInputsSHA256:string|null,observation:Row['observation'],errorCode:null}} JournalJob */
/** @typedef {{jobs:JournalJob[],graphClaim?:unknown}} JournalData */
/** @typedef {{ledger:{commitments:string[],nullifiers:string[],publicState:{actualAssetBalance:string|bigint,backedAmount:string|bigint,surplus:string|bigint}}}} LedgerView */
/** @typedef {LedgerView & {head:{number:string,hash:string,timestamp:string}}} View */
/** @param {unknown} value @param {string} code */
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
/** @template T @param {T} value @returns {T} */
const copy=value=>structuredClone(value);

/** @param {Descriptor} descriptor @param {JournalJob} r @returns {Row} */
export function publicDeviceNoteRowV1(descriptor,r){return ({profile:descriptor.profile,descriptor:copy(descriptor),jobId:r.jobId,mode:r.mode,stage:r.stage,consentFields:{jobId:r.jobId,depositJobId:r.consent.depositJobId,rootId:r.consent.rootId,noteRevision:r.consent.noteRevision,recipient:r.consent.recipient,statement:copy(r.consent.statement),path:copy(r.consent.path),witnessSHA256:r.consent.witnessSHA256,proofSHA256:r.proofSHA256,publicInputsSHA256:r.publicInputsSHA256},observation:copy(r.observation),errorCode:r.errorCode});}
/** @param {LedgerView} v @param {JournalJob} r */
export function assertDeviceNoteUnspentV1(v,r){need(v.ledger.commitments.filter(c=>c==='0x'+r.consent.statement.output).length===1&&!v.ledger.nullifiers.includes('0x'+r.nullifier),'DEVICE_EXTERNAL_FLAT_SOURCE_NOT_AVAILABLE');}
/** @param {LedgerView} v @param {JournalData} data @returns {NonNullable<Status['note']>} */
export function readDeviceShareNoteV1(v,data){
  const parent=data.jobs.find(r=>r.mode==='deposit_intent'),commitment=parent?.consent.statement.output??null;
  if(!parent)return{state:'UNISSUED',commitment,available:null,backing:null};
  if(parent.stage!=='CONFIRMED'||data.jobs.some(r=>r.mode==='withdraw_balance'&&r.stage!=='CONFIRMED'))return{state:'UNKNOWN',commitment,available:null,backing:null};
  if(v.ledger.nullifiers.includes('0x'+parent.nullifier))return{state:'SPENT',commitment,available:null,backing:null};
  assertDeviceNoteUnspentV1(v,parent);const p=v.ledger.publicState,held=String(p.actualAssetBalance),liabilities=String(p.backedAmount),surplus=String(p.surplus);
  need(BigInt(held)>=BigInt(liabilities)&&BigInt(surplus)===BigInt(held)-BigInt(liabilities),'DEVICE_EXTERNAL_FLAT_SHARE_BACKING');
  return{state:'LIVE',commitment,available:parent.consent.statement.amount,backing:{held,liabilities,surplus,deficit:'0'}};
 }
 // A funding receipt alone is not an unspent read. This uses the SAME fresh
 // original ledger, commitment, nullifier and backing as the selected account.
/** @param {LedgerView} v @param {JournalData} data @returns {NonNullable<Status['note']>} */
export function readDeviceSourceNoteV1(v,data){
  const parent=data.jobs.find(r=>r.mode==='deposit_balance'),commitment=parent?.consent.statement.output??null;
  if(!parent)return{state:'UNISSUED',commitment,available:null,backing:null};
  if(parent.stage!=='CONFIRMED')return{state:'UNKNOWN',commitment,available:null,backing:null};
  if(v.ledger.nullifiers.includes('0x'+parent.nullifier))return{state:'SPENT',commitment,available:null,backing:null};
  if(data.graphClaim!=null||data.jobs.some(r=>r.mode==='withdraw_balance'&&r.stage!=='CONFIRMED'))return{state:'UNKNOWN',commitment,available:null,backing:null};
  assertDeviceNoteUnspentV1(v,parent);const p=v.ledger.publicState,held=String(p.actualAssetBalance),liabilities=String(p.backedAmount),surplus=String(p.surplus);
  need(BigInt(held)>=BigInt(liabilities)&&BigInt(surplus)===BigInt(held)-BigInt(liabilities)&&BigInt(parent.consent.statement.amount)<=BigInt(held),'DEVICE_EXTERNAL_FLAT_SOURCE_BACKING');
  return{state:'LIVE',commitment,available:parent.consent.statement.amount,backing:{held,liabilities,surplus,deficit:'0'}};
 }

/** The caller has already checked permission freshness and canonical ledger.
 * Keep confirmed receipts historical while availability follows the fresh read.
 * @param {Descriptor} descriptor @param {JournalData} data @param {View} view
 * @param {boolean} share @param {number} [observedAt] @returns {Status} */
export function readDeviceNoteStatusV1(descriptor,data,view,share,observedAt=Date.now()){
 return normalizeExternalFlatStatusV1({descriptor:copy(descriptor),jobs:data.jobs.map(row=>publicDeviceNoteRowV1(descriptor,row)),observed:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp},observedAt,expiresAt:observedAt+15000,...(share?{note:readDeviceShareNoteV1(view,data)}:{graphClaimed:data.graphClaim!=null,note:readDeviceSourceNoteV1(view,data)})});
}
