/** Signed provider note DATA, not custody authority. No key is retained here. */
import {sha256} from '@noble/hashes/sha2.js';
import {secp256k1} from '@noble/curves/secp256k1.js';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as X from '@lianum/mobile-protocol/device/paged-executor-payout-v5';
import {localNoteHexBytesV1,localNoteUintBytesV1,localBalanceCommitmentMessageV1} from './balance-note-codec-v1.mjs';
import {devicePagedReviewedGraphFrameV4,devicePagedReviewedNoteNullifierV4} from './device-paged-reviewed-graph-data-v4.mjs';
const need=v=>{if(!v)throw Error('MOBILE_PAGED_EXECUTOR_PAYOUT_BINDING');},hex=b=>Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validateDevicePagedExecutorPayoutCertificateV5(raw,expected){
 const c=X.normalizeDevicePagedExecutorPayoutCustodyV5(raw),t=c.terms,d=P.normalizeDevicePagedDescriptorV3(expected.descriptor);
 need(same(t.descriptor,d));for(const k of ['graphId','rootId','revision','operationId','preparationId','id','ordinal','collectBy','maximumFeeAtomic'])need(t[k]===expected[k]);need(t.opening.value===expected.amount);
 const parts=[...[d.scope,d.policy,d.assetIdentity,d.hubDomain,d.registryCommitment].map(v=>localNoteHexBytesV1(v,32)),localNoteHexBytesV1(t.operationId,32),localNoteUintBytesV1(t.ordinal,8),localNoteHexBytesV1(t.randomness,32)];
 const origin=devicePagedReviewedGraphFrameV4('payout-origin',parts),cm=localBalanceCommitmentMessageV1(d.scope,d.policy,t.opening),frame=X.devicePagedExecutorPayoutCustodyFrameV5(c.termsSHA256);
 try{need(hex(sha256(origin))===t.opening.rho&&hex(sha256(cm))===t.commitment&&devicePagedReviewedNoteNullifierV4(d.scope,t.commitment,t.opening.secret)===t.nullifier);need(secp256k1.verify(localNoteHexBytesV1(c.signature,64),frame,localNoteHexBytesV1(t.providerPublicKey,65),{prehash:true,lowS:true})&&secp256k1.verify(localNoteHexBytesV1(c.ownershipSignature,64),frame,localNoteHexBytesV1('04'+t.opening.x+t.opening.y,65),{prehash:true,lowS:true}));return c;}finally{origin.fill(0);cm.fill(0);frame.fill(0);for(const b of parts)b.fill(0);}
}
