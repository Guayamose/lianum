/** Independent READ_RECOVER framing. These parsers bind DATA only. They do
 * not reopen a source, make old V3 status current or authorize an effect. */
import * as P from './device-paged-owner-v3.mjs';
import * as L from './device-paged-channel-lease-v4.mjs';
import {normalizeDevicePagedAutomationTermsV4} from './device-paged-automation-v4.mjs';
import {boundedPermissionSha256V1} from './bounded-permission-sha256-v1.mjs';
export const DEVICE_PAGED_SOURCE_RENEWAL_REQUEST_V4='DEVICE_PAGED_SOURCE_RENEWAL_REQUEST_V4';
export const DEVICE_PAGED_SOURCE_RENEWAL_CHALLENGE_V4='DEVICE_PAGED_SOURCE_RENEWAL_CHALLENGE_V4';
export const DEVICE_PAGED_SOURCE_RENEWAL_REPLY_V4='DEVICE_PAGED_SOURCE_RENEWAL_REPLY_V4';
export const DEVICE_PAGED_SOURCE_READ_RECOVERY_OBSERVATION_V4='DEVICE_PAGED_SOURCE_READ_RECOVERY_OBSERVATION_V4';
const need=(ok,code='MOBILE_PAGED_SOURCE_RENEWAL_DATA')=>{if(!ok)throw Error(code);};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const integer=(value,zero=false)=>{need(Number.isSafeInteger(value)&&value>=(zero?0:1)&&!Object.is(value,-0));return value;};
const id=value=>{need(typeof value==='string'&&/^[a-z0-9-]{8,100}$/.test(value));return value;};
const requestKeys=['profile','action','sourceBinding','intentId','expectedGeneration','expectedLeaseId','replyPublicKey'];
export function normalizeDevicePagedSourceRenewalRequestDataV4(raw,descriptor){
 need(arguments.length===2);const row=P.pagedOwnerExactV3(raw,requestKeys);
 need(row.profile===DEVICE_PAGED_SOURCE_RENEWAL_REQUEST_V4&&['RENEW_CHANNEL','READ_RENEWAL_INTENT','READ_CHANNEL_STATE'].includes(row.action));
 row.sourceBinding=P.pagedOwnerExactV3(row.sourceBinding,['descriptorSHA256','pairingId','devicePublicKey']);need(same(row.sourceBinding,L.devicePagedChannelSourceBindingDataV4(descriptor)),'MOBILE_PAGED_SOURCE_RENEWAL_BINDING');
 id(row.intentId);if(row.action==='READ_CHANNEL_STATE')need(row.expectedGeneration===null&&row.expectedLeaseId===null,'MOBILE_PAGED_SOURCE_RENEWAL_GENERATION');
 else{P.pagedOwnerUintV3(row.expectedGeneration,true);if(row.expectedLeaseId!==null)P.pagedOwnerHexV3(row.expectedLeaseId);need((row.expectedGeneration==='0')===(row.expectedLeaseId===null),'MOBILE_PAGED_SOURCE_RENEWAL_GENERATION');}
 need(typeof row.replyPublicKey==='string'&&/^MCowBQYDK2VuAyEA[A-Za-z0-9+/]{43}=$/.test(row.replyPublicKey));return freeze(row);
}
export function normalizeDevicePagedSourceRenewalChallengeDataV4(raw,descriptor){
 need(arguments.length===2);const row=P.pagedOwnerExactV3(raw,['version','profile','request','challengeId','nonce','issuedAt','expiresAt']);
 need(row.version===4&&row.profile===DEVICE_PAGED_SOURCE_RENEWAL_CHALLENGE_V4);row.request=normalizeDevicePagedSourceRenewalRequestDataV4(row.request,descriptor);id(row.challengeId);P.pagedOwnerHexV3(row.nonce);integer(row.issuedAt);integer(row.expiresAt);need(row.expiresAt===row.issuedAt+15000);return freeze(row);
}
export function validateDevicePagedSourceRenewalChallengeFreshV4(raw,descriptor,now=P.devicePagedWallNowV3()){
 const row=normalizeDevicePagedSourceRenewalChallengeDataV4(raw,descriptor);integer(now,true);need(row.issuedAt<=now&&now<row.expiresAt,'MOBILE_PAGED_SOURCE_RENEWAL_EXPIRED');
 P.assertDevicePagedFrameElapsedV3('source-renewal:challenge:'+row.request.sourceBinding.pairingId+':'+row.challengeId+':'+row.nonce,row.expiresAt,now);return row;
}
export function devicePagedSourceRenewalPermissionMessageV4(raw,descriptor){
 const bytes=new TextEncoder().encode('LIANUM_DEVICE_PAGED_SOURCE_RENEWAL/4\n'+JSON.stringify(normalizeDevicePagedSourceRenewalChallengeDataV4(raw,descriptor)));need(bytes.length<=8192);return bytes;
}
export function devicePagedSourceRenewalRequestHashV4(raw,descriptor){
 const bytes=new TextEncoder().encode(JSON.stringify(normalizeDevicePagedSourceRenewalRequestDataV4(raw,descriptor)));try{return Array.from(boundedPermissionSha256V1(bytes),v=>v.toString(16).padStart(2,'0')).join('');}finally{bytes.fill(0);}
}
function ownerPublic(raw){
 const row=P.pagedOwnerExactV3(raw,['authorizationRoot','reserveNullifier','progressCommitment','readyCommitment','sourceCommitment','sourceNullifier','pages','nodes','budget','settleBefore','phase']);
 for(const k of ['authorizationRoot','reserveNullifier','progressCommitment','readyCommitment','sourceCommitment','sourceNullifier'])if(row[k]!==null)P.pagedOwnerHexV3(row[k]);
 for(const k of ['pages','nodes','budget','settleBefore'])if(row[k]!==null)P.pagedOwnerUintV3(row[k],true);
 need(['BUILDING','SIGNING','PREPARED','RESERVED','FULFILLED','RECOVERED'].includes(row.phase));return row;
}
function ownerCheckpoint(raw,binding){
 const row=P.pagedOwnerExactV3(raw,['profile','descriptorSHA256','revision','dataSHA256','public']);need(row.profile==='DEVICE_PAGED_OWNER_DURABLE_CHECKPOINT_V3'&&row.descriptorSHA256===binding.descriptorSHA256);integer(row.revision,true);P.pagedOwnerHexV3(row.dataSHA256);row.public=ownerPublic(row.public);return row;
}
function originalSource(raw){if(raw===null)return null;const row=P.pagedOwnerExactV3(raw,['walletRootId','sourceRevision','sourceId']);P.pagedOwnerHexV3(row.walletRootId);P.pagedOwnerUintV3(row.sourceRevision);if(row.sourceId!==null)P.pagedOwnerHexV3(row.sourceId);return row;}
export function normalizeDevicePagedSourceReadRecoveryObservationDataV4(raw,descriptor){
 need(arguments.length===2);const binding=L.devicePagedChannelSourceBindingDataV4(descriptor),row=P.pagedOwnerExactV3(raw,['profile','descriptorSHA256','journalRevision','journalDataSHA256','ownerCheckpoint','ownerValidation','source','current']);
 need(row.profile===DEVICE_PAGED_SOURCE_READ_RECOVERY_OBSERVATION_V4&&row.descriptorSHA256===binding.descriptorSHA256&&row.current===false);P.pagedOwnerUintV3(row.journalRevision,true);P.pagedOwnerHexV3(row.journalDataSHA256);row.ownerCheckpoint=ownerCheckpoint(row.ownerCheckpoint,binding);
 const validation=P.pagedOwnerExactV3(row.ownerValidation,['profile','checkpoint','public','automation','current']);need(validation.profile==='ORIGINAL_PAGED_OWNER_READ_RECOVERY_VALIDATION_V4'&&validation.current===false);validation.checkpoint=ownerCheckpoint(validation.checkpoint,binding);validation.public=ownerPublic(validation.public);need(same(validation.checkpoint,row.ownerCheckpoint)&&same(validation.public,row.ownerCheckpoint.public),'MOBILE_PAGED_SOURCE_RENEWAL_OWNER_JOIN');
 if(validation.automation!==null){const a=P.pagedOwnerExactV3(validation.automation,['terms','commandsUsed','revoked']);a.terms=normalizeDevicePagedAutomationTermsV4(a.terms);integer(a.commandsUsed,true);need(a.commandsUsed<=a.terms.maxCommands&&typeof a.revoked==='boolean');validation.automation=a;}
 row.ownerValidation=validation;row.source=originalSource(row.source);return freeze(row);
}
export function normalizeDevicePagedSourceRenewalReplyDataV4(raw,descriptor,rawChallenge){
 need(arguments.length===3);const challenge=normalizeDevicePagedSourceRenewalChallengeDataV4(rawChallenge,descriptor),row=P.pagedOwnerExactV3(raw,['profile','intentState','lease','observation','issuedAt','expiresAt']);
 need(row.profile===DEVICE_PAGED_SOURCE_RENEWAL_REPLY_V4);need(challenge.request.action==='READ_CHANNEL_STATE'?row.intentState==='CHANNEL_STATE':challenge.request.action==='RENEW_CHANNEL'?row.intentState==='ISSUED':['ISSUED','NOT_ISSUED'].includes(row.intentState),'MOBILE_PAGED_SOURCE_RENEWAL_INTENT');need(row.intentState==='NOT_ISSUED'?row.lease===null:row.intentState==='ISSUED'?row.lease!==null:true,'MOBILE_PAGED_SOURCE_RENEWAL_INTENT');row.observation=normalizeDevicePagedSourceReadRecoveryObservationDataV4(row.observation,descriptor);if(row.lease!==null){row.lease=L.normalizeDevicePagedChannelLeaseDataV4(row.lease,descriptor);need(same(row.lease.source,row.observation.source),'MOBILE_PAGED_SOURCE_RENEWAL_BINDING');}
 if(challenge.request.action!=='READ_CHANNEL_STATE'&&row.intentState==='ISSUED')need(row.lease!==null&&row.lease.intentId===challenge.request.intentId&&BigInt(row.lease.generation)===BigInt(challenge.request.expectedGeneration)+1n&&row.lease.predecessorLeaseId===challenge.request.expectedLeaseId,'MOBILE_PAGED_SOURCE_RENEWAL_GENERATION');
 integer(row.issuedAt);integer(row.expiresAt);need(row.expiresAt===row.issuedAt+15000);return freeze(row);
}
export function validateDevicePagedSourceRenewalReplyFreshV4(raw,descriptor,challenge,now=P.devicePagedWallNowV3()){
 const row=normalizeDevicePagedSourceRenewalReplyDataV4(raw,descriptor,challenge);integer(now,true);need(row.issuedAt<=now&&now<row.expiresAt,'MOBILE_PAGED_SOURCE_RENEWAL_EXPIRED');
 P.assertDevicePagedFrameElapsedV3('source-renewal:reply:'+challenge.request.sourceBinding.pairingId+':'+challenge.challengeId+':'+challenge.nonce,row.expiresAt,now);return row;
}
