/** Public DATA and a fixed signature vocabulary. Normalization creates no
 * financial permission; the original device and issuer must sign/consume it. */
import {externalFlatExactV1 as exact,externalFlatHexV1 as hex,externalFlatUintV1 as uint,normalizeExternalFlatDescriptorV1} from './device-external-flat-note-v1.mjs';
export const DEVICE_SEPOLIA_DEFI_REVIEW_V4='DEVICE_SEPOLIA_DEFI_REVIEW_V4';
export const DEVICE_SEPOLIA_DEFI_REVIEW_CHALLENGE_V4='DEVICE_SEPOLIA_DEFI_REVIEW_CHALLENGE_V4';
const need=(ok)=>{if(!ok)throw Error('DEVICE_SEPOLIA_DEFI_REVIEW_DATA');};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const nonzero=v=>{hex(v);need(v!=='0'.repeat(64));return v;};
const address=v=>{need(typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v)&&v!=='0x'+'0'.repeat(40));return v;};
const u128=v=>{need(typeof v==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(v)&&BigInt(v)<1n<<128n);return v;};
export function normalizeDeviceSepoliaDefiReviewV4(raw){
 const v=exact(raw,['profile','protocol','action','descriptor','rootId','noteRevision','reference','shares','maximumInputAtomic','minimumAssetsAtomic','underlyingReceiver','shareWithdrawalRecipient','validFrom','validUntil','receiptCommitment']);
 need(v.profile===DEVICE_SEPOLIA_DEFI_REVIEW_V4&&['AAVE_STATIC','MORPHO_V2'].includes(v.protocol)&&['INVEST','REDEEM'].includes(v.action));
 v.descriptor=normalizeExternalFlatDescriptorV1(v.descriptor);need(v.descriptor.profile==='LIANUM_DEVICE_EXTERNAL_FLAT_SHARE_NOTE_V1');nonzero(v.rootId);nonzero(v.reference);need(Number.isSafeInteger(v.noteRevision)&&v.noteRevision>0);uint(v.shares);need(BigInt(v.shares)>0n);uint(v.validFrom);uint(v.validUntil);need(BigInt(v.validFrom)<BigInt(v.validUntil));address(v.underlyingReceiver);address(v.shareWithdrawalRecipient);need(v.shareWithdrawalRecipient!==v.underlyingReceiver);
 need(v.underlyingReceiver!=='0x'+v.descriptor.poolTerms.pool);
 if(v.protocol==='AAVE_STATIC')need(v.descriptor.assetMetadata.decimals===6&&BigInt(v.shares)>=1000000n);
 else need(v.descriptor.assetMetadata.decimals===18&&BigInt(v.shares)>=1000000000000000000n);
 if(v.action==='INVEST'){u128(v.maximumInputAtomic);need(BigInt(v.maximumInputAtomic)>0n&&v.minimumAssetsAtomic===null);nonzero(v.receiptCommitment);}
 else{need(v.maximumInputAtomic===null&&v.receiptCommitment===null);uint(v.minimumAssetsAtomic);need(BigInt(v.minimumAssetsAtomic)>0n);}
 return freeze(v);
}
export function normalizeDeviceSepoliaDefiReviewChallengeV4(raw){const v=exact(raw,['profile','review','challengeId','nonce','expiresAt']);need(v.profile===DEVICE_SEPOLIA_DEFI_REVIEW_CHALLENGE_V4);v.review=normalizeDeviceSepoliaDefiReviewV4(v.review);nonzero(v.challengeId);nonzero(v.nonce);need(Number.isSafeInteger(v.expiresAt)&&v.expiresAt>0);return freeze(v);}
export function validateDeviceSepoliaDefiReviewFreshV4(raw,now=Date.now()){const v=normalizeDeviceSepoliaDefiReviewChallengeV4(raw);need(Number.isSafeInteger(now)&&v.expiresAt>now&&v.expiresAt<=now+15000);return v;}
export function deviceSepoliaDefiReviewPermissionMessageV4(raw){const v=normalizeDeviceSepoliaDefiReviewChallengeV4(raw),domain=new TextEncoder().encode('LIANUM/SEPOLIA/DEFI/REVIEW/4'),body=new TextEncoder().encode(JSON.stringify(v));need(body.length<=8192);const out=new Uint8Array(8+domain.length+body.length),dv=new DataView(out.buffer);dv.setUint32(0,domain.length);out.set(domain,4);dv.setUint32(4+domain.length,body.length);out.set(body,8+domain.length);return out;}
