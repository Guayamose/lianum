/** Signed provider offer DATA. No note, permission, SDK brand or FX oracle. */
import * as P from './device-paged-owner-v3.mjs';
import {normalizeDevicePagedPublicFundingMetadataDataV4,assertDevicePagedPublicNetworkIdDataV4} from './device-paged-budget-asset-v4.mjs';
import {boundedPermissionSha256V1} from './bounded-permission-sha256-v1.mjs';
import {devicePagedEconomicProviderV3} from './device-paged-economic-provider-v3.mjs';
export const DEVICE_PAGED_PROVIDER_QUOTE_V4='DEVICE_PAGED_PROVIDER_QUOTE_V4';
const exact=P.pagedOwnerExactV3,hash=P.pagedOwnerHexV3;
const need=v=>{if(!v)throw Error('MOBILE_PAGED_PROVIDER_QUOTE');};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const uint=(v,bits=128)=>{need(typeof v==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(v)&&BigInt(v)<1n<<BigInt(bits));return BigInt(v);};
const text=v=>{need(typeof v==='string'&&v.length>0&&v.length<=128&&!/[\s\x00-\x1f]/.test(v));return v;};
const id=v=>{need(typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(v));return v;};
const toHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const unhex=v=>{hash(v);return Uint8Array.from(v.match(/../g),x=>parseInt(x,16));};
function integerBytes(v,count){let n=uint(v,count*8),out=new Uint8Array(count);for(let i=count-1;i>=0;i--){out[i]=Number(n&255n);n>>=8n;}return out;}
function framedHash(tag,parts){const all=[new TextEncoder().encode(tag),...parts],out=new Uint8Array(all.reduce((n,p)=>n+4+p.length,0));let offset=0;try{for(const part of all){new DataView(out.buffer).setUint32(offset,part.length,false);offset+=4;out.set(part,offset);offset+=part.length;}return toHex(boundedPermissionSha256V1(out));}finally{out.fill(0);}}
export function devicePagedProviderQuotePolicyV4(){return freeze({
 payout:'FULL_ONLY',full:'ORIGINAL_FULFILL_THEN_OWNER_WITHDRAWAL',
 partial:'NO_PAYOUT_RESERVED_BUDGET_REFUND_AFTER_ORIGINAL_CUTOFF',
 timeout:'NO_PAYOUT_RESERVED_BUDGET_REFUND_AFTER_ORIGINAL_CUTOFF',
 irreversibleDelivery:'PROVIDER_BEAR_DELIVERED_ASSETS_AND_FEES',
 atomicity:'NO_CROSS_CHAIN_ROLLBACK',marketFairness:'NOT_ESTABLISHED',
});}
export function normalizeDevicePagedProviderQuoteTermsV4(raw){
 const q=exact(raw,['profile','classification','descriptor','providerIdentity','providerPublicKey','signerIdentity','graphId','rootId','revision','budget','preparationId','id','ordinal','dispatchId','actionSalt','deliver','payout','feeCeiling','inputCeiling','issuedAt','expiresAt','policy',...(Object.hasOwn(raw??{},'budgetAsset')||Object.hasOwn(raw??{},'fundingOrigin')?['budgetAsset','fundingOrigin']:[])]);
 need(q.profile===DEVICE_PAGED_PROVIDER_QUOTE_V4&&['LOCAL_FIXED_PROVIDER_OFFER_NOT_MARKET_PRICE','PUBLIC_TESTNET_FIXED_PROVIDER_OFFER_NOT_MARKET_PRICE'].includes(q.classification));
 q.descriptor=P.normalizeDevicePagedDescriptorV3(q.descriptor);if(q.budgetAsset!==undefined){need(q.classification==='PUBLIC_TESTNET_FIXED_PROVIDER_OFFER_NOT_MARKET_PRICE');const m=normalizeDevicePagedPublicFundingMetadataDataV4({budgetAsset:q.budgetAsset,fundingOrigin:q.fundingOrigin},q.descriptor);q.budgetAsset=m.budgetAsset;}hash(q.providerIdentity);hash(q.rootId);hash(q.dispatchId);hash(q.actionSalt);
 const provider=devicePagedEconomicProviderV3(q.providerPublicKey);need(q.signerIdentity===provider.signerIdentity);
 need(typeof q.graphId==='string'&&/^[a-z0-9-]{8,100}$/.test(q.graphId)&&Number.isSafeInteger(q.revision)&&q.revision>0);
 need(uint(q.budget,64)>0n&&/^paged-page-[0-9a-f]{32}$/.test(q.preparationId));id(q.id);uint(q.ordinal,64);
 const d=exact(q.deliver,['family','genesis','assetIdentity','chainDomain','unit','decimals','amountAtomic','recipient','sourceCommitment','destinationCommitment','receiptKeyCommitment','receiptRho',...(Object.hasOwn(q.deliver??{},'networkId')?['networkId']:[])]);if(d.networkId!==undefined){need(q.classification==='PUBLIC_TESTNET_FIXED_PROVIDER_OFFER_NOT_MARKET_PRICE');assertDevicePagedPublicNetworkIdDataV4(d.networkId,d.family);}
 const defi=['AAVE','MORPHO'].includes(d.family),assetConversion=defi||d.family==='UNISWAP';
 need(['EVM','BTC','SOL','UNISWAP','AAVE','MORPHO'].includes(d.family)&&Number.isSafeInteger(d.decimals)&&d.decimals>=0&&d.decimals<=18);need(d.unit===({EVM:'wei',BTC:'satoshi',SOL:'lamport',UNISWAP:'atomic',AAVE:'atomic',MORPHO:'atomic'})[d.family]);
 if(defi)need(q.classification==='PUBLIC_TESTNET_FIXED_PROVIDER_OFFER_NOT_MARKET_PRICE'&&d.networkId==='ethereum-sepolia'&&q.descriptor.chainId==='11155111'&&d.decimals===(d.family==='AAVE'?6:18));
 for(const k of ['genesis','assetIdentity','chainDomain','sourceCommitment','destinationCommitment','receiptKeyCommitment','receiptRho'])hash(d[k]);need(uint(d.amountAtomic)>0n);text(d.recipient);q.deliver=d;
 const p=exact(q.payout,['genesis','chainId','assetIdentity','unit','amountAtomic','commitment','beneficiary']);
 need(p.genesis===q.descriptor.genesis&&p.chainId===q.descriptor.chainId&&p.assetIdentity===q.descriptor.assetIdentity&&p.unit==='atomic');need(uint(p.amountAtomic,64)>0n&&uint(p.amountAtomic,64)<=uint(q.budget,64));hash(p.commitment);need(p.beneficiary===provider.address);q.payout=p;
 const f=exact(q.feeCeiling,['assetIdentity','unit','amountAtomic','bearer']);hash(f.assetIdentity);need(f.unit===({EVM:'wei',BTC:'satoshi',SOL:'lamport',UNISWAP:'wei',AAVE:'wei',MORPHO:'wei'})[d.family]&&uint(f.amountAtomic)>0n&&f.bearer==='PROVIDER');if(!assetConversion)need(f.assetIdentity===d.assetIdentity);if(defi)need(f.assetIdentity===q.descriptor.assetIdentity&&f.assetIdentity!==d.assetIdentity);q.feeCeiling=f;
 if(q.inputCeiling!==null){const value=exact(q.inputCeiling,['assetIdentity','unit','amountAtomic']);hash(value.assetIdentity);need(assetConversion&&value.assetIdentity!==d.assetIdentity&&value.unit==='atomic'&&uint(value.amountAtomic)>0n);if(defi)need(value.assetIdentity!==f.assetIdentity);q.inputCeiling=value;}else need(!assetConversion);
 need(uint(q.issuedAt,64)<uint(q.expiresAt,64));if(q.descriptor.chainDeadlineSeconds!==undefined)need(uint(q.expiresAt,64)<=uint(q.descriptor.chainDeadlineSeconds,64));
 q.policy=exact(q.policy,Object.keys(devicePagedProviderQuotePolicyV4()));need(JSON.stringify(q.policy)===JSON.stringify(devicePagedProviderQuotePolicyV4()));
 need(new TextEncoder().encode(JSON.stringify(q)).length<=16384);return freeze(q);
}
export function devicePagedProviderQuoteTermsHashV4(raw){const terms=normalizeDevicePagedProviderQuoteTermsV4(raw),bytes=new TextEncoder().encode(JSON.stringify(terms));try{return toHex(boundedPermissionSha256V1(bytes));}finally{bytes.fill(0);}}
export function devicePagedProviderQuoteRiskSaltV4(rawTerms){return framedHash('LIANUM/PAEG/paged/provider-quote-risk/3',[new TextEncoder().encode('LIANUM_PAEG_FUNDED_PAGED_V3'),unhex(devicePagedProviderQuoteTermsHashV4(rawTerms))]);}
/** Exact original V3 loss clause/H4 risk frame, with the signed offer as salt. */
export function devicePagedProviderQuoteDeliveryRiskV4(rawTerms){const t=normalizeDevicePagedProviderQuoteTermsV4(rawTerms),d=t.deliver,s=t.descriptor;return framedHash('LIANUM/PAEG/64/delivery-risk/2',[new TextEncoder().encode('LIANUM_PAEG_FUNDED_64_V2'),new TextEncoder().encode('FULL_OWNER_REFUND_PROVIDER_LOSS_V1'),...['scope','policy','assetIdentity','hubDomain','registryCommitment'].map(k=>unhex(s[k])),unhex(d.chainDomain),unhex(d.sourceCommitment),unhex(d.destinationCommitment),integerBytes(d.amountAtomic,16),unhex(t.payout.commitment),integerBytes(t.expiresAt,8),unhex(devicePagedProviderQuoteRiskSaltV4(t))]);}
export function devicePagedProviderQuoteActionCommitmentV4(rawAction){
 const fields=['chainDomain','signerIdentity','sourceCommitment','destinationCommitment','amount','custodyKind','custodyCommitment','executionFrom','executionUntil','settleBefore','receiptKeyCommitment','receiptRho','deliveryRiskCommitment','actionSalt'],a=exact(rawAction,fields);
 need(a.custodyKind===1&&uint(a.amount)>0n&&uint(a.executionFrom,64)<uint(a.executionUntil,64)&&uint(a.executionUntil,64)<=uint(a.settleBefore,64));
 return framedHash('LIANUM/PAEG/native-transfer-action/2',[new TextEncoder().encode('LIANUM_PAEG_NATIVE_4_V2'),...fields.map(k=>k==='custodyKind'?integerBytes('1',1):k==='amount'?integerBytes(a[k],16):['executionFrom','executionUntil','settleBefore'].includes(k)?integerBytes(a[k],8):unhex(a[k]))]);
}
export function assertDevicePagedProviderQuoteActionV4(rawQuote,rawAction){const q=normalizeDevicePagedProviderQuoteV4(rawQuote),a=rawAction,t=q.terms,d=t.deliver;need(devicePagedProviderQuoteActionCommitmentV4(a)===q.actionCommitment);for(const k of ['chainDomain','sourceCommitment','destinationCommitment','receiptKeyCommitment','receiptRho'])need(a[k]===d[k]);need(a.amount===d.amountAtomic&&a.signerIdentity===t.signerIdentity&&a.actionSalt===t.actionSalt&&a.settleBefore===t.expiresAt&&a.deliveryRiskCommitment===devicePagedProviderQuoteDeliveryRiskV4(t));return q;}
export function normalizeDevicePagedProviderQuoteV4(raw){const q=exact(raw,['terms','termsSHA256','actionCommitment','signature']);q.terms=normalizeDevicePagedProviderQuoteTermsV4(q.terms);hash(q.termsSHA256);hash(q.actionCommitment);need(q.termsSHA256===devicePagedProviderQuoteTermsHashV4(q.terms)&&typeof q.signature==='string'&&/^[0-9a-f]{128}$/.test(q.signature));const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,r=BigInt('0x'+q.signature.slice(0,64)),s=BigInt('0x'+q.signature.slice(64));need(r>0n&&r<order&&s>0n&&s<=order/2n);return freeze(q);}
/** Narrow verification message; it never requests device or wallet signing. */
export function devicePagedProviderQuoteFrameV4(termsSHA256,actionCommitment){hash(termsSHA256);hash(actionCommitment);const parts=[new TextEncoder().encode('LIANUM/PAEG/provider-quote/4'),new TextEncoder().encode(DEVICE_PAGED_PROVIDER_QUOTE_V4),Uint8Array.from(termsSHA256.match(/../g),v=>parseInt(v,16)),Uint8Array.from(actionCommitment.match(/../g),v=>parseInt(v,16))],out=new Uint8Array(parts.reduce((n,p)=>n+4+p.length,0));let offset=0;for(const part of parts){new DataView(out.buffer).setUint32(offset,part.length,false);offset+=4;out.set(part,offset);offset+=part.length;}return out;}
export function assertDevicePagedProviderQuoteBindingV4(raw,expected,now){const q=normalizeDevicePagedProviderQuoteV4(raw),e=exact(expected,['descriptor','graphId','rootId','revision','budget','id','ordinal','actionCommitment','recipient','payoutCommitment','payoutAmount']);need(JSON.stringify(q.terms.descriptor)===JSON.stringify(P.normalizeDevicePagedDescriptorV3(e.descriptor)));for(const k of ['graphId','rootId','revision','budget','id','ordinal'])need(q.terms[k]===e[k]);need(q.actionCommitment===e.actionCommitment&&q.terms.deliver.recipient===e.recipient&&q.terms.payout.commitment===e.payoutCommitment&&q.terms.payout.amountAtomic===e.payoutAmount);need(uint(q.terms.issuedAt,64)<=uint(now,64)&&uint(now,64)<uint(q.terms.expiresAt,64));return q;}
