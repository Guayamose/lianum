import {DEVICE_OPERATION_CONSENT_MS_V41} from '@lianum/mobile-protocol/device/paged-owner-v3';
/** A bounded storage-only PoP channel. It retains an opaque Original
 * preparation; parsed request DATA cannot manufacture that preparation. */
import assert from 'node:assert/strict';
import {createPublicKey,randomBytes,verify} from 'node:crypto';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as S from '@lianum/mobile-protocol/device/paged-source-successor-v35';

export function createPagedSourceSuccessorPermissionChannelV35(rawDescriptor){
 assert.equal(arguments.length,1);const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),device=descriptor.devicePublicKey;
 const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(device.slice(2,66),'hex').toString('base64url'),y:Buffer.from(device.slice(66),'hex').toString('base64url')}});
 const challenges=new Map();let closed=false;
 function live(){assert.ok(!closed,'PAGED_MIXED_SUCCESSOR_CHANNEL_CLOSED');}
 function sweep(){for(const[id,row]of challenges)if(row.used||performance.now()>=row.deadline||Date.now()>=row.consent.expiresAt)challenges.delete(id);}
 return Object.freeze({
  issue(rawRequest,preparation,data){
   assert.equal(arguments.length,3);live();sweep();assert.ok(challenges.size<16,'PAGED_MIXED_SUCCESSOR_CHALLENGE_CAPACITY');assert.ok(preparation&&typeof preparation==='object','PAGED_MIXED_SUCCESSOR_PREPARATION');
   assert.deepEqual(data.sourceDescriptor,descriptor,'PAGED_MIXED_SUCCESSOR_PREPARATION_BINDING');
   const issuedAt=Date.now(),consent=S.normalizeDevicePagedSourceSuccessorChallengeV35({version:35,profile:S.DEVICE_PAGED_SOURCE_SUCCESSOR_CHALLENGE_V35,sourceDescriptor:descriptor,request:S.normalizeDevicePagedSourceSuccessorRequestV35(rawRequest),predecessor:{walletRootId:data.walletRootId,sourceRevision:String(data.sourceRevision),sourceId:data.sourceId,journalRevision:String(data.predecessorJournalRevision),journalDataSHA256:data.predecessorJournalDataSHA256},birthOrdinal:String(data.birthOrdinal),terminalKind:data.terminalKind,challengeId:randomBytes(24).toString('hex'),nonce:randomBytes(32).toString('hex'),issuedAt,expiresAt:Math.min(issuedAt+DEVICE_OPERATION_CONSENT_MS_V41,descriptor.deadlineMs)},descriptor);
   challenges.set(consent.challengeId,{consent,preparation,used:false,deadline:performance.now()+Math.max(0,consent.expiresAt-Date.now())});return consent;
  },
  consume(rawConsent,signature){
   assert.equal(arguments.length,2);live();const consent=S.normalizeDevicePagedSourceSuccessorChallengeV35(rawConsent,descriptor),row=challenges.get(consent.challengeId);
   assert.ok(row&&!row.used&&performance.now()<row.deadline,'PAGED_MIXED_SUCCESSOR_CHALLENGE');assert.deepEqual(consent,row.consent,'PAGED_MIXED_SUCCESSOR_CHALLENGE_BINDING');assert.ok(Date.now()<row.consent.expiresAt,'PAGED_MIXED_SUCCESSOR_EXPIRED');
   S.validateDevicePagedSourceSuccessorChallengeFreshV35(consent,descriptor);
   assert.ok(typeof signature==='string'&&/^[0-9a-f]{128}$/.test(signature),'PAGED_MIXED_SUCCESSOR_SIGNATURE');
   const bytes=S.devicePagedSourceSuccessorPermissionMessageV35(consent,descriptor);
   try{assert.ok(verify('sha256',bytes,{key,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'hex')),'PAGED_MIXED_SUCCESSOR_SIGNATURE');}finally{bytes.fill(0);}
   S.validateDevicePagedSourceSuccessorChallengeFreshV35(consent,descriptor);assert.ok(performance.now()<row.deadline,'PAGED_MIXED_SUCCESSOR_CHALLENGE');row.used=true;
   return Object.freeze({consent,preparation:row.preparation});
  },
  close(){closed=true;challenges.clear();},
 });
}
