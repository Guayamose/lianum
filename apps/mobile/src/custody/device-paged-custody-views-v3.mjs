/** Inferior read capabilities. An issuer requires the actual custody ROOT
 * preimage and an original SDK graph observation; it retains no key bytes.
 * Each issued view is additionally revoked by its owning Vault callback. */
import {sha256} from '@noble/hashes/sha2.js';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {normalizeDevicePagedEconomicViewV3} from '../../../../packages/mobile-protocol/src/device-paged-economic-view-v3.mjs';
import {normalizeDevicePagedPayoutSettlementV3} from '../../../../packages/mobile-protocol/src/device-paged-payout-settlement-v3.mjs';
import {readDevicePagedGraphReplyV3,readDevicePagedGraphReplyConsentV3,readDevicePagedGraphStatusV3} from '../api/device-paged-graph-api-v3.mjs';
const reviews=new WeakMap(),options=new WeakMap(),economicReviews=new WeakMap(),need=(ok,code)=>{if(!ok)throw Error(code);};
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export function createDevicePagedCustodyViewIssuerV3(rootBytes,rawDescriptor,current){
 need(rootBytes instanceof Uint8Array&&rootBytes.length===32&&typeof current==='function','MOBILE_PAGED_CUSTODY_VIEW_ISSUER');
 const rootId=hex(sha256(rootBytes)),descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),issuer=Object.freeze(Object.create(null));
 function original(rawStatus){current();const status=readDevicePagedGraphStatusV3(rawStatus);need(same(status.descriptor,descriptor)&&status.rootId===rootId&&status.revision===1,'MOBILE_PAGED_CUSTODY_VIEW_ISSUER');return status;}
 return Object.freeze({
  executionReview(raw,rawStatus){const status=original(rawStatus),value=structuredClone(raw);
   need(same(value.descriptor,descriptor)&&value.rootId===rootId&&value.graphId===status.graphId&&value.authorizationRoot===status.authorizationRoot&&value.reserveNullifier===status.reserveNullifier&&value.budget===status.budget&&value.settleBefore===status.settleBefore&&['SIGNING','PREPARED','RESERVED'].includes(status.phase),'MOBILE_PAGED_EXECUTION_REVIEW');
   need(Number.isSafeInteger(value.expiresAt)&&value.expiresAt>P.devicePagedNowV3()&&value.expiresAt<=Math.min(P.devicePagedNowV3()+60000,descriptor.deadlineMs)&&Array.isArray(value.steps)&&String(value.steps.length)===status.nodes,'MOBILE_PAGED_EXECUTION_REVIEW');
   const issued=freeze(value);reviews.set(issued,{value:issued,current,issuer});return issued;
  },
  economicReview(raw,rawReply){const reply=readDevicePagedGraphReplyV3(rawReply),consent=readDevicePagedGraphReplyConsentV3(rawReply),status=original(reply.status),value=structuredClone(raw),view=normalizeDevicePagedEconomicViewV3(structuredClone(reply.private),descriptor),plan=normalizeDevicePagedPayoutSettlementV3(value.plan);
   need(consent.action==='READ_ECONOMIC_SETTLEMENT'&&status.phase==='FULFILLED'&&!status.pending&&consent.rootId===rootId&&consent.revision===1&&consent.graphId===status.graphId&&same(value.view,view)&&same(plan.descriptor,descriptor)&&plan.graphId===status.graphId&&plan.authorizationRoot===status.authorizationRoot&&value.rootId===rootId&&value.revision===1&&view.graphId===status.graphId&&view.authorizationRoot===status.authorizationRoot&&view.ledger.blockHash===status.blockHash&&view.ledger.blockNumber===status.blockNumber,'MOBILE_PAGED_ECONOMIC_REVIEW');
   need(value.providerIdentity===view.rows[0]?.providerIdentity&&value.signerIdentity===view.rows[0]?.signerIdentity&&plan.beneficiary===view.rows[0]?.beneficiary.address&&plan.payouts.length===view.rows.length&&plan.payouts.every(p=>view.rows.some(r=>r.id===p.id&&r.payoutAmount===p.amount&&r.payoutCommitment===p.commitment&&r.providerIdentity===value.providerIdentity&&r.signerIdentity===value.signerIdentity&&r.beneficiary.address===plan.beneficiary)&&view.outputs.some(o=>o.id===p.id&&o.amount===p.amount&&o.commitment===p.commitment&&o.nullifier===p.nullifier)),'MOBILE_PAGED_ECONOMIC_REVIEW');
   need(Number.isSafeInteger(value.expiresAt)&&value.expiresAt>P.devicePagedNowV3()&&value.expiresAt<=Math.min(P.devicePagedNowV3()+60000,descriptor.deadlineMs)&&typeof value.changeConfirmed==='boolean'&&typeof value.eligible==='boolean'&&value.eligible===(value.changeConfirmed&&value.blockedReason===null)&&[null,'CHANGE_REQUIRED','WITHDRAWAL_HISTORY_UNAVAILABLE','WITHDRAWN_ELSEWHERE'].includes(value.blockedReason)&&Array.isArray(value.paid)&&new Set(value.paid.map(p=>p.nullifier)).size===value.paid.length&&value.paid.every(p=>plan.payouts.some(o=>o.id===p.id&&o.nullifier===p.nullifier&&o.amount===p.amount)&&p.recipient===plan.beneficiary&&/^0x[0-9a-f]{64}$/.test(p.transactionHash)&&view.outputs.some(o=>o.id===p.id&&o.nullifier===p.nullifier&&o.withdrawn))&&(!value.eligible||view.outputs.filter(o=>o.withdrawn).length===value.paid.length),'MOBILE_PAGED_ECONOMIC_REVIEW');
   const issued=freeze(value);economicReviews.set(issued,{value:issued,current,issuer});return issued;
  },
  withdrawalOption(raw,binding,rawStatus,active){const status=original(rawStatus);
   need(typeof active==='function'&&same(binding.descriptor,descriptor)&&binding.rootId===rootId&&binding.revision===1&&binding.graphId===status.graphId&&['RESERVED','FULFILLED','RECOVERED'].includes(status.phase),'MOBILE_PAGED_WITHDRAWAL_OPTION');
   need(raw.role===binding.role&&raw.id===binding.id&&raw.amount===binding.amount&&raw.nullifier===binding.nullifier&&typeof raw.withdrawn==='boolean','MOBILE_PAGED_WITHDRAWAL_OPTION');P.pagedOwnerHexV3(raw.nullifier);P.pagedOwnerUintV3(raw.amount);
   const issued=freeze(structuredClone(raw)),scope=freeze(structuredClone(binding));options.set(issued,()=>{current();active();return scope;});return issued;
  },
 });
}
export function readDevicePagedExecutionReviewV3(raw){const entry=raw&&typeof raw==='object'?reviews.get(raw):undefined;need(entry,'MOBILE_PAGED_EXECUTION_REVIEW');entry.current();need(P.devicePagedNowV3()<entry.value.expiresAt,'MOBILE_PAGED_EXECUTION_REVIEW');return entry.value;}
export function assertDevicePagedExecutionReviewActiveV3(raw){const entry=raw&&typeof raw==='object'?reviews.get(raw):undefined;need(entry,'MOBILE_PAGED_EXECUTION_REVIEW');entry.current();}
export function readDevicePagedWithdrawalOptionV3(raw){const read=raw&&typeof raw==='object'?options.get(raw):undefined;need(read,'MOBILE_PAGED_WITHDRAWAL_OPTION');return read();}

export function readDevicePagedEconomicReviewV3(raw){const entry=raw&&typeof raw==='object'?economicReviews.get(raw):undefined;need(entry,'MOBILE_PAGED_ECONOMIC_REVIEW');entry.current();need(P.devicePagedNowV3()<entry.value.expiresAt,'MOBILE_PAGED_ECONOMIC_REVIEW');return entry.value;}

/** Revocation only after approval; never refreshes a review or SDK frame. */
export function assertDevicePagedEconomicReviewActiveV3(raw){const entry=raw&&typeof raw==='object'?economicReviews.get(raw):undefined;need(entry,'MOBILE_PAGED_ECONOMIC_REVIEW');entry.current();}

/** Compare only approved terms after a human wait. Both objects must be views
 * from the same live original Vault issuer; this creates no view or permission.
 * The replacement reader still requires its own original freshness window. */
function readReviewRefresh(map,reader,approvedRaw,freshRaw,fields,code){
 const approved=approvedRaw&&typeof approvedRaw==='object'?map.get(approvedRaw):undefined;
 need(approved,code);approved.current();const fresh=reader(freshRaw),replacement=map.get(freshRaw);
 need(replacement&&approved.issuer===replacement.issuer&&fields.every(field=>same(approved.value[field],fresh[field])),code);
 return fresh;
}
export function readDevicePagedExecutionReviewRefreshV3(approvedRaw,freshRaw){return readReviewRefresh(reviews,readDevicePagedExecutionReviewV3,approvedRaw,freshRaw,['descriptor','rootId','graphId','authorizationRoot','reserveNullifier','budget','settleBefore','steps'],'MOBILE_PAGED_EXECUTION_REVIEW');}
export function readDevicePagedEconomicReviewRefreshV3(approvedRaw,freshRaw){return readReviewRefresh(economicReviews,readDevicePagedEconomicReviewV3,approvedRaw,freshRaw,['plan','rootId','revision','providerIdentity','signerIdentity','changeConfirmed','eligible','blockedReason','paid'],'MOBILE_PAGED_ECONOMIC_REVIEW');}
