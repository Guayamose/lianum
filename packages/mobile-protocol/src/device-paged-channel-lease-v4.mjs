/** Renewable channel DATA beneath an immutable Paged source. Normalizing or
 * comparing these bytes never reopens an account, issues a capability, accepts
 * an observation or extends a consent, graph, quote or biometric authorization. */
import * as P from './device-paged-owner-v3.mjs';
import {boundedPermissionSha256V1} from './bounded-permission-sha256-v1.mjs';

export const DEVICE_PAGED_CHANNEL_LEASE_V4='DEVICE_PAGED_ORIGINAL_CHANNEL_LEASE_V4';
export const DEVICE_PAGED_CHANNEL_LEASE_ACCESS_V4='READ_RECOVER_EXISTING_TERMS';
export const DEVICE_PAGED_CHANNEL_LEASE_MAX_MS_V4=9*60*60*1000;
const need=(value,code='MOBILE_PAGED_CHANNEL_LEASE_DATA')=>{if(!value)throw Error(code);};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const sorted=value=>value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const integer=value=>{need(Number.isSafeInteger(value)&&value>0&&!Object.is(value,-0));return value;};
const id=value=>{need(typeof value==='string'&&/^[a-z0-9-]{8,100}$/.test(value));return value;};

/** Canonical source descriptor hash shared with the original journal binding.
 * It includes the ORIGINAL deadline; lease renewal cannot rewrite that source. */
export function devicePagedChannelSourceBindingDataV4(rawDescriptor){
 need(arguments.length===1);
 const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),bytes=new TextEncoder().encode(JSON.stringify(sorted(descriptor)));
 try{return freeze({descriptorSHA256:Array.from(boundedPermissionSha256V1(bytes),v=>v.toString(16).padStart(2,'0')).join(''),pairingId:descriptor.pairingId,devicePublicKey:descriptor.devicePublicKey});}
 finally{bytes.fill(0);}
}

function source(raw){
 if(raw===null)return null;
 const row=P.pagedOwnerExactV3(raw,['walletRootId','sourceRevision','sourceId']);
 P.pagedOwnerHexV3(row.walletRootId);P.pagedOwnerUintV3(row.sourceRevision);
 if(row.sourceId!==null)P.pagedOwnerHexV3(row.sourceId);
 return row;
}

/** Historical/expired DATA is parseable for recovery diagnostics. Only the
 * independent original channel may validate freshness and issue a live lease. */
export function normalizeDevicePagedChannelLeaseDataV4(raw,rawDescriptor){
 need(arguments.length===2);
 const row=P.pagedOwnerExactV3(raw,['profile','sourceBinding','source','intentId','leaseId','generation','predecessorLeaseId','issuedAt','expiresAt','access']);
 need(row.profile===DEVICE_PAGED_CHANNEL_LEASE_V4&&row.access===DEVICE_PAGED_CHANNEL_LEASE_ACCESS_V4);
 row.sourceBinding=P.pagedOwnerExactV3(row.sourceBinding,['descriptorSHA256','pairingId','devicePublicKey']);
 need(same(row.sourceBinding,devicePagedChannelSourceBindingDataV4(rawDescriptor)),'MOBILE_PAGED_CHANNEL_LEASE_SOURCE');
 row.source=source(row.source);id(row.intentId);P.pagedOwnerHexV3(row.leaseId);P.pagedOwnerUintV3(row.generation);
 if(row.predecessorLeaseId!==null){P.pagedOwnerHexV3(row.predecessorLeaseId);need(row.predecessorLeaseId!==row.leaseId);}
 need((row.generation==='1')===(row.predecessorLeaseId===null),'MOBILE_PAGED_CHANNEL_LEASE_GENERATION');
 integer(row.issuedAt);integer(row.expiresAt);
 need(row.expiresAt>row.issuedAt&&row.expiresAt-row.issuedAt<=DEVICE_PAGED_CHANNEL_LEASE_MAX_MS_V4,'MOBILE_PAGED_CHANNEL_LEASE_DURATION');
 return freeze(row);
}

/** Compare a proposed durable DATA transition. This check is not an issuer,
 * replay registry, signature check or replacement for original journal CAS. */
export function normalizeDevicePagedChannelLeaseTransitionDataV4(previousRaw,nextRaw,rawDescriptor){
 need(arguments.length===3);
 const next=normalizeDevicePagedChannelLeaseDataV4(nextRaw,rawDescriptor);
 if(previousRaw===null){need(next.generation==='1'&&next.predecessorLeaseId===null,'MOBILE_PAGED_CHANNEL_LEASE_GENERATION');return next;}
 const previous=normalizeDevicePagedChannelLeaseDataV4(previousRaw,rawDescriptor);
 need(BigInt(next.generation)===BigInt(previous.generation)+1n&&next.predecessorLeaseId===previous.leaseId&&next.leaseId!==previous.leaseId&&next.intentId!==previous.intentId,'MOBILE_PAGED_CHANNEL_LEASE_GENERATION');
 need(next.issuedAt>=previous.issuedAt,'MOBILE_PAGED_CHANNEL_LEASE_ROLLBACK');
 if(previous.source!==null){
  need(next.source!==null&&next.source.walletRootId===previous.source.walletRootId&&next.source.sourceRevision===previous.source.sourceRevision,'MOBILE_PAGED_CHANNEL_LEASE_LINEAGE');
  if(previous.source.sourceId!==null)need(next.source.sourceId===previous.source.sourceId,'MOBILE_PAGED_CHANNEL_LEASE_LINEAGE');
 }
 return next;
}
