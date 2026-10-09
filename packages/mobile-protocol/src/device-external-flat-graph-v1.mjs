/** Device-signed U/S and GRAPH transport. These frames never grant an original
 * account, provider, runtime or proof capability. No signing key is a field. */
import {externalFlatExactV1 as exact,externalFlatHexV1 as hex,externalFlatUintV1 as uint,normalizeExternalFlatDescriptorV1,
 normalizeExternalFlatAccessV1,normalizeExternalFlatObservedV1,normalizeExternalFlatSignatureV1}
 from './device-external-flat-note-v1.mjs';
import {normalizeDeviceReservationStatementV1,normalizeDeviceReservationCustodyV1,
 normalizeDeviceReservationWitnessV1,deviceReservationWitnessBytesV1,wipeDeviceReservationWitnessV1,
 normalizeDeviceReservationQuoteV1,normalizeDeviceReservationStatusV1,DEVICE_RESERVATION_DISCLOSURE_V1}
 from './device-reservation-consent-v1.mjs';
export const DEVICE_EXTERNAL_FLAT_GRAPH_V1='DEVICE_EXTERNAL_FLAT_GRAPH_SOURCE_V1';
export const EXTERNAL_FLAT_GRAPH_ACTIONS_V1=Object.freeze(['PROVE_U','RESERVE_S','OBSERVE_S','EXECUTE_GRAPH','RECONCILE_GRAPH','RECOVER_GRAPH','CANCEL_GRAPH']);
const need=v=>{if(!v)throw Error('MOBILE_EXTERNAL_FLAT_GRAPH_INVALID');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const nonzero=v=>{hex(v);need(v!=='0'.repeat(64));return v;};
const integer=v=>need(Number.isSafeInteger(v)&&v>=0&&!Object.is(v,-0));
export function normalizeExternalFlatGraphQuoteV1(raw){
 const v=exact(raw,['profile','descriptor','quote']);need(v.profile===DEVICE_EXTERNAL_FLAT_GRAPH_V1);
 v.descriptor=normalizeExternalFlatDescriptorV1(v.descriptor);v.quote=normalizeDeviceReservationQuoteV1(v.quote);
 for(const k of ['origin','pairingId','devicePublicKey'])need(v.quote[k]===v.descriptor[k]);
 const d=v.descriptor.poolTerms;for(const [k,j]of [['scope','scope'],['policy','policy'],['codeHash','poolCodeHash'],['assetIdentity','assetIdentity'],['domainCommitment','domainCommitment']])need(v.quote.poolTerms[k]===d[j]);
 return freeze(v);
}
export function normalizeExternalFlatGraphDraftV1(raw){
 const v=exact(raw,['action','depositJobId','rootId','quoteId','jobId','custody','statement','witnessSHA256','proofSHA256','publicInputsSHA256']);
 need(EXTERNAL_FLAT_GRAPH_ACTIONS_V1.includes(v.action));['depositJobId','rootId','quoteId','jobId','witnessSHA256'].forEach(k=>nonzero(v[k]));
 v.custody=normalizeDeviceReservationCustodyV1(v.custody);v.statement=normalizeDeviceReservationStatementV1(v.statement);
 need(v.rootId===v.custody.rootId&&v.statement.inputCommitment===v.custody.sourceCommitment&&v.statement.inputNullifier===v.custody.sourceNullifier
  &&v.statement.changeCommitment===v.custody.changeCommitment&&v.statement.recoveryCommitment===v.custody.recoveryCommitment);
 need((v.proofSHA256===null)===(v.publicInputsSHA256===null));
 if(v.action==='PROVE_U')need(v.proofSHA256===null);else if(v.action==='CANCEL_GRAPH'){if(v.proofSHA256!==null){nonzero(v.proofSHA256);nonzero(v.publicInputsSHA256);}}else{nonzero(v.proofSHA256);nonzero(v.publicInputsSHA256);}
 return freeze(v);
}
export function normalizeExternalFlatGraphConsentV1(raw){
 const v=exact(raw,['profile','descriptor','challengeId','nonce','expiresAt','draft','observed','openingDisclosure']);
 need(v.profile===DEVICE_EXTERNAL_FLAT_GRAPH_V1);v.descriptor=normalizeExternalFlatDescriptorV1(v.descriptor);
 nonzero(v.challengeId);nonzero(v.nonce);need(v.challengeId!==v.nonce);integer(v.expiresAt);
 v.draft=normalizeExternalFlatGraphDraftV1(v.draft);v.observed=normalizeExternalFlatObservedV1(v.observed);
 need(v.draft.statement.scope===v.descriptor.poolTerms.scope&&v.draft.statement.policy===v.descriptor.poolTerms.policy&&v.draft.statement.asset===v.descriptor.poolTerms.assetIdentity);
 need(v.openingDisclosure===(v.draft.action==='PROVE_U'?DEVICE_RESERVATION_DISCLOSURE_V1:null));return freeze(v);
}
export function validateExternalFlatGraphFreshV1(raw,now=Date.now()){
 const v=normalizeExternalFlatGraphConsentV1(raw);integer(now);need(v.expiresAt>now&&v.expiresAt<=now+15000);return v;
}
export function externalFlatGraphPermissionMessageV1(raw){
 const v=normalizeExternalFlatGraphConsentV1(raw),tag=new TextEncoder().encode('LIANUM/device-external-flat-graph/1'),body=new TextEncoder().encode(JSON.stringify(v));
 need(body.length<=8192);const bytes=new Uint8Array(8+tag.length+body.length),view=new DataView(bytes.buffer);
 view.setUint32(0,tag.length,false);bytes.set(tag,4);view.setUint32(4+tag.length,body.length,false);bytes.set(body,8+tag.length);return bytes;
}
function output(raw,row,index){const n=exact(raw,['noteRole','amount','commitment','nullifier','state','available','backing']);
 need(n.noteRole===(index===0?'change':'recovery'));uint(n.amount);nonzero(n.commitment);need(n.commitment===row.reservation.statement[n.noteRole+'Commitment']);
 need(['EMPTY','UNISSUED','UNSPENT','LOCKED','SPENT','UNKNOWN'].includes(n.state));
 if(n.amount==='0')need(n.noteRole==='change'&&n.state==='EMPTY'&&n.nullifier===null&&n.available===null&&n.backing===null);
 else{nonzero(n.nullifier);need(n.state!=='EMPTY'&&n.nullifier!==row.reservation.statement.inputNullifier&&n.nullifier!==row.reservation.statement.reserveNullifier);}
 if(n.available!==null){uint(n.available);need(n.state==='UNSPENT'&&n.available===n.amount&&n.amount!=='0');
  const b=n.backing=exact(n.backing,['held','liabilities','surplus','deficit']);Object.values(b).forEach(uint);need(b.deficit==='0'&&BigInt(b.held)>=BigInt(b.liabilities)&&BigInt(b.surplus)===BigInt(b.held)-BigInt(b.liabilities)&&BigInt(n.available)<=BigInt(b.held));
 }else need(n.backing===null&&n.state!=='UNSPENT');
 if(['EXECUTION_UNKNOWN','RECOVERY_UNKNOWN'].includes(row.graph.stage))need(n.available===null&&(n.state==='UNKNOWN'||n.state==='EMPTY'));
 if(n.noteRole==='recovery'){if(n.state==='UNSPENT'||n.state==='SPENT')need(row.graph.outcome==='RECOVERED');if(n.state==='UNISSUED')need(row.graph.outcome==='FULFILLED');if(n.state==='LOCKED')need(row.graph.outcome===null);}
 return n;
}
export function normalizeExternalFlatGraphRowV1(raw){
 const v=exact(raw,['profile','descriptor','reservation','graph','outputs']);need(v.profile===DEVICE_EXTERNAL_FLAT_GRAPH_V1);
 v.descriptor=normalizeExternalFlatDescriptorV1(v.descriptor);v.reservation=normalizeDeviceReservationStatusV1(v.reservation);
 need(v.reservation.statement.scope===v.descriptor.poolTerms.scope&&v.reservation.statement.policy===v.descriptor.poolTerms.policy&&v.reservation.statement.asset===v.descriptor.poolTerms.assetIdentity);
 v.graph=exact(v.graph,['stage','outcome','terminal']);need(['PREPARED','EXECUTION_UNKNOWN','RECOVERY_UNKNOWN','FULFILLED','RECOVERED','SOURCE_CANCELLED'].includes(v.graph.stage));
 need([null,'FULFILLED','RECOVERED'].includes(v.graph.outcome));need((v.graph.outcome===null)===(v.graph.terminal===null));
 if(v.graph.terminal!==null){const t=v.graph.terminal=exact(v.graph.terminal,['outcome','transactionHash','calldataSHA256','blockHash','blockNumber']);
  need(t.outcome===v.graph.outcome&&v.graph.stage===v.graph.outcome);['transactionHash','calldataSHA256','blockHash'].forEach(k=>nonzero(t[k]));
  need(typeof t.blockNumber==='string'&&/^(0|[1-9][0-9]*)$/.exec(t.blockNumber)?.[0]===t.blockNumber&&BigInt(t.blockNumber)<(1n<<64n));}
 need(Array.isArray(v.outputs)&&Object.getPrototypeOf(v.outputs)===Array.prototype&&[0,2].includes(v.outputs.length)&&Reflect.ownKeys(v.outputs).length===v.outputs.length+1);
 v.outputs=Array.from({length:v.outputs.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v.outputs,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'));return output(d.value,v,i);});
 if(v.outputs.length){need(v.reservation.stage==='RESERVED'&&v.reservation.observation!==null);need(v.outputs[0].commitment!==v.outputs[1].commitment&&(v.outputs[0].nullifier===null||v.outputs[0].nullifier!==v.outputs[1].nullifier));}
 return freeze(v);
}
export function normalizeExternalFlatGraphStatusV1(raw){
 const v=exact(raw,['profile','descriptor','jobs','observed','observedAt','expiresAt']);need(v.profile===DEVICE_EXTERNAL_FLAT_GRAPH_V1);
 v.descriptor=normalizeExternalFlatDescriptorV1(v.descriptor);v.observed=normalizeExternalFlatObservedV1(v.observed);integer(v.observedAt);integer(v.expiresAt);need(v.expiresAt===v.observedAt+15000);
 need(Array.isArray(v.jobs)&&Object.getPrototypeOf(v.jobs)===Array.prototype&&v.jobs.length<=1&&Reflect.ownKeys(v.jobs).length===v.jobs.length+1);
 v.jobs=Array.from({length:v.jobs.length},(_,i)=>{const p=Object.getOwnPropertyDescriptor(v.jobs,String(i));need(p?.enumerable&&Object.hasOwn(p,'value'));
  const r=normalizeExternalFlatGraphRowV1(p.value);need(same(r.descriptor,v.descriptor));return r;});return freeze(v);
}
export {normalizeExternalFlatAccessV1,normalizeExternalFlatSignatureV1,normalizeDeviceReservationWitnessV1,
 deviceReservationWitnessBytesV1,wipeDeviceReservationWitnessV1};
