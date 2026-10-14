/** Bounded continuation DATA. Only an original SDK-verified encrypted reply
 * from the predecessor can establish a handoff; this parser grants nothing. */
import * as P from './device-paged-owner-v3.mjs';
import {boundedPermissionSha256V1} from './bounded-permission-sha256-v1.mjs';

export const DEVICE_PAGED_SOURCE_CONTINUATION_V4='DEVICE_PAGED_SOURCE_CONTINUATION_V4';
export const DEVICE_PAGED_SOURCE_CONTINUATION_COMMAND_V4='READ_SOURCE_CONTINUATION_V4';
const need=(value,code='MOBILE_PAGED_SOURCE_CONTINUATION')=>{if(!value)throw Error(code);};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function sorted(value){return value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;}
function digest(value){const bytes=new TextEncoder().encode(JSON.stringify(sorted(value)));try{return Array.from(boundedPermissionSha256V1(bytes),v=>v.toString(16).padStart(2,'0')).join('');}finally{bytes.fill(0);}}

/** Shared canonical DATA identity; neither this hash nor a copied body proves
 * source ownership, terminal outcome or permission to open another account. */
export function devicePagedSourceIdentityV4(previousDescriptor,rawScope){
 const descriptor=P.normalizeDevicePagedDescriptorV3(previousDescriptor),scope=P.pagedOwnerExactV3(rawScope,['rootId','revision','commitment','nullifier','graphId']);
 for(const key of ['rootId','commitment','nullifier'])P.pagedOwnerHexV3(scope[key]);
 need(Number.isSafeInteger(scope.revision)&&scope.revision>0&&!Object.is(scope.revision,-0));
 need(scope.graphId===null||typeof scope.graphId==='string'&&/^[a-z0-9-]{8,100}$/.test(scope.graphId));
 return digest({descriptorSHA256:digest(descriptor),...scope});
}

export function normalizeDevicePagedSourceContinuationDataV4(raw,previousDescriptor){
 const previous=P.normalizeDevicePagedDescriptorV3(previousDescriptor);
 const row=P.pagedOwnerExactV3(raw,['profile','predecessor','descriptor','walletRootId','sourceRevision','status']);
 need(row.profile===DEVICE_PAGED_SOURCE_CONTINUATION_V4&&row.status==='EMPTY');
 const predecessor=P.pagedOwnerExactV3(row.predecessor,['pairingId','sourceId','walletRootId','sourceRevision']);
 need(predecessor.pairingId===previous.pairingId,'MOBILE_PAGED_SOURCE_CONTINUATION_PREDECESSOR');
 P.pagedOwnerHexV3(predecessor.sourceId);P.pagedOwnerHexV3(predecessor.walletRootId);P.pagedOwnerUintV3(predecessor.sourceRevision);
 P.pagedOwnerHexV3(row.walletRootId);P.pagedOwnerUintV3(row.sourceRevision);
 need(row.walletRootId===predecessor.walletRootId&&BigInt(row.sourceRevision)===BigInt(predecessor.sourceRevision)+1n,'MOBILE_PAGED_SOURCE_CONTINUATION_LINEAGE');
 row.descriptor=P.normalizeDevicePagedDescriptorV3(row.descriptor);
 need(row.descriptor.pairingId!==previous.pairingId,'MOBILE_PAGED_SOURCE_CONTINUATION_NEW_PAIRING');
 for(const key of ['origin','devicePublicKey','chainId','genesis','policy','assetIdentity','manifestSHA256','consumerSHA256','graphProfile','sparseEncoding'])
  need(row.descriptor[key]===previous[key],'MOBILE_PAGED_SOURCE_CONTINUATION_BINDING');
 need(row.descriptor.securityGeneration===previous.securityGeneration,'MOBILE_PAGED_SOURCE_CONTINUATION_BINDING');
 need((row.descriptor.minimumDepositAtomic===undefined)===(previous.minimumDepositAtomic===undefined),'MOBILE_PAGED_SOURCE_CONTINUATION_BINDING');
 if(previous.minimumDepositAtomic!==undefined)need(BigInt(row.descriptor.minimumDepositAtomic)>=BigInt(previous.minimumDepositAtomic),'MOBILE_PAGED_SOURCE_CONTINUATION_MINIMUM');
 row.predecessor=predecessor;
 return freeze(row);
}
