import {DEVICE_OPERATION_CONSENT_MS_V41} from './device-paged-clock-v3.mjs';
/** Storage succession framing only. Parsed DATA cannot issue a custody
 * handoff, transfer money, refresh an old plan or grant a new financial limit. */
import * as P from './device-paged-owner-v3.mjs';
export const DEVICE_PAGED_SOURCE_SUCCESSOR_CHALLENGE_V35='DEVICE_PAGED_SOURCE_SUCCESSOR_CHALLENGE_V35';
export const DEVICE_PAGED_SOURCE_SUCCESSOR_REPLY_V35='DEVICE_PAGED_SOURCE_SUCCESSOR_REPLY_V35';
export const DEVICE_PAGED_SOURCE_SUCCESSOR_TERMINALS_V35=Object.freeze(['WITHDRAWN_UNRESERVED','FULFILLED','RECOVERED','WITHDRAWN']);
const need=(value,code='MOBILE_PAGED_SOURCE_SUCCESSOR_DATA')=>{if(!value)throw Error(code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const id=value=>need(typeof value==='string'&&/^[a-z0-9-]{8,100}$/.test(value));
const integer=(value,zero=false)=>need(Number.isSafeInteger(value)&&value>=(zero?0:1)&&!Object.is(value,-0));
export function normalizeDevicePagedSourceSuccessorRequestV35(raw){
 const value=P.pagedOwnerExactV3(raw,['action','intentId']);need(value.action==='PREPARE_SUCCESSOR');id(value.intentId);return freeze(value);
}
export function normalizeDevicePagedSourceSuccessorChallengeV35(raw,sourceDescriptor){
 const source=P.normalizeDevicePagedDescriptorV3(sourceDescriptor),value=P.pagedOwnerExactV3(raw,['version','profile','sourceDescriptor','request','predecessor','birthOrdinal','terminalKind','challengeId','nonce','issuedAt','expiresAt']);
 need(value.version===35&&value.profile===DEVICE_PAGED_SOURCE_SUCCESSOR_CHALLENGE_V35);value.sourceDescriptor=P.normalizeDevicePagedDescriptorV3(value.sourceDescriptor);need(same(source,value.sourceDescriptor),'MOBILE_PAGED_SOURCE_SUCCESSOR_BINDING');value.request=normalizeDevicePagedSourceSuccessorRequestV35(value.request);
 const prior=P.pagedOwnerExactV3(value.predecessor,['walletRootId','sourceRevision','sourceId','journalRevision','journalDataSHA256']);for(const key of ['walletRootId','sourceId','journalDataSHA256'])P.pagedOwnerHexV3(prior[key]);P.pagedOwnerUintV3(prior.sourceRevision);P.pagedOwnerUintV3(prior.journalRevision,true);value.predecessor=prior;
 P.pagedOwnerUintV3(value.birthOrdinal);need(BigInt(value.birthOrdinal)>1n&&BigInt(value.birthOrdinal)>BigInt(prior.sourceRevision),'MOBILE_PAGED_SOURCE_SUCCESSOR_GENERATION');need(DEVICE_PAGED_SOURCE_SUCCESSOR_TERMINALS_V35.includes(value.terminalKind));id(value.challengeId);P.pagedOwnerHexV3(value.nonce);integer(value.issuedAt);integer(value.expiresAt);need(value.expiresAt>value.issuedAt&&value.expiresAt-value.issuedAt<=DEVICE_OPERATION_CONSENT_MS_V41&&value.expiresAt<=source.deadlineMs,'MOBILE_PAGED_SOURCE_SUCCESSOR_EXPIRED');return freeze(value);
}
export function validateDevicePagedSourceSuccessorChallengeFreshV35(raw,sourceDescriptor,now=P.devicePagedWallNowV3()){
 const value=normalizeDevicePagedSourceSuccessorChallengeV35(raw,sourceDescriptor);integer(now,true);need(value.issuedAt<=now&&now<value.expiresAt,'MOBILE_PAGED_SOURCE_SUCCESSOR_EXPIRED');(value.expiresAt-value.issuedAt<=15000?P.assertDevicePagedFrameElapsedV3:P.assertDevicePagedFrameElapsedV41)('source-successor:'+value.sourceDescriptor.pairingId+':'+value.challengeId+':'+value.nonce,value.expiresAt,now,...(value.expiresAt-value.issuedAt<=15000?[]:[value.issuedAt,'CONSENT']));return value;
}
export function devicePagedSourceSuccessorPermissionMessageV35(raw,sourceDescriptor){
 const bytes=new TextEncoder().encode('LIANUM_DEVICE_PAGED_SOURCE_SUCCESSOR/35\n'+JSON.stringify(normalizeDevicePagedSourceSuccessorChallengeV35(raw,sourceDescriptor)));need(bytes.length<=16384);return bytes;
}
export function normalizeDevicePagedSourceSuccessorConnectionV35(raw,sourceDescriptor){
 const source=P.normalizeDevicePagedDescriptorV3(sourceDescriptor),value=P.pagedOwnerExactV3(raw,['format','descriptor','transport']);need(value.format==='DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3');value.descriptor=P.normalizeDevicePagedDescriptorV3(value.descriptor);const next=value.descriptor;
 need(next.pairingId!==source.pairingId,'MOBILE_PAGED_SOURCE_SUCCESSOR_BINDING');for(const key of Object.keys(source))if(!['pairingId','deadlineMs','chainDeadlineSeconds'].includes(key))need(next[key]===source[key],'MOBILE_PAGED_SOURCE_SUCCESSOR_BINDING');need(Object.keys(next).length===Object.keys(source).length&&next.deadlineMs<=source.deadlineMs,'MOBILE_PAGED_SOURCE_SUCCESSOR_BINDING');if(source.chainDeadlineSeconds!==undefined)need(BigInt(next.chainDeadlineSeconds)<=BigInt(source.chainDeadlineSeconds),'MOBILE_PAGED_SOURCE_SUCCESSOR_BINDING');
 const pin=P.pagedOwnerExactV3(value.transport,['type','certificatePEM','certificateSHA256']);need(pin.type==='ANDROID_PINNED_TLS_V1'&&typeof pin.certificatePEM==='string'&&pin.certificatePEM.length>0&&pin.certificatePEM.length<=32768&&/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/.test(pin.certificatePEM));P.pagedOwnerHexV3(pin.certificateSHA256);value.transport=pin;return freeze(value);
}
export function normalizeDevicePagedSourceSuccessorReplyV35(raw,sourceDescriptor,rawChallenge){
 const challenge=normalizeDevicePagedSourceSuccessorChallengeV35(rawChallenge,sourceDescriptor),value=P.pagedOwnerExactV3(raw,['profile','sourceDescriptor','request','terminalKind','connection']);need(value.profile===DEVICE_PAGED_SOURCE_SUCCESSOR_REPLY_V35);value.sourceDescriptor=P.normalizeDevicePagedDescriptorV3(value.sourceDescriptor);value.request=normalizeDevicePagedSourceSuccessorRequestV35(value.request);need(same(value.sourceDescriptor,challenge.sourceDescriptor)&&same(value.request,challenge.request)&&value.terminalKind===challenge.terminalKind,'MOBILE_PAGED_SOURCE_SUCCESSOR_BINDING');value.connection=normalizeDevicePagedSourceSuccessorConnectionV35(value.connection,sourceDescriptor);return freeze(value);
}
