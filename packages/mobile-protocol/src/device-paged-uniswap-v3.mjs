/** Exact-output composition only. This intent grants no custody or right to
 * spend the received token; the original D27 owner retains that authority. */
import * as P from './device-paged-owner-v3.mjs';
import {normalizeExternalFlatDescriptorV1,DEVICE_EXTERNAL_FLAT_SHARE_V1} from './device-external-flat-note-v1.mjs';
export const DEVICE_PAGED_UNISWAP_INTENT_V3='UNISWAP_V3_EXACT_OUTPUT_SINGLE';
export function normalizeDevicePagedUniswapIntentV3(raw){
 const hasRecipient=raw&&typeof raw==='object'&&Object.hasOwn(raw,'recipient'),v=P.pagedOwnerExactV3(raw,['kind','depositJobId','rootId','outputCommitment','maximumInput','outputAmount','validFrom','validUntil',...(hasRecipient?['recipient']:[])]);
 if(hasRecipient&&(typeof v.recipient!=='string'||!/^[0-9a-f]{40}$/.test(v.recipient)||v.recipient==='0'.repeat(40)))throw Error('PAGED_UNISWAP_INTENT');
 if(v.kind!==DEVICE_PAGED_UNISWAP_INTENT_V3)throw Error('PAGED_UNISWAP_INTENT');
 for(const key of ['depositJobId','rootId','outputCommitment']){P.pagedOwnerHexV3(v[key]);if(v[key]==='0'.repeat(64))throw Error('PAGED_UNISWAP_INTENT');}
 for(const key of ['maximumInput','outputAmount','validFrom','validUntil'])P.pagedOwnerUintV3(v[key],true);
 if(BigInt(v.maximumInput)<=0n||BigInt(v.outputAmount)<=0n||BigInt(v.validFrom)>=BigInt(v.validUntil))throw Error('PAGED_UNISWAP_INTENT');
 return Object.freeze(v);
}
/** Public bootstrap data only. The original Paged descriptor binds this
 * explicit adjacent TLS port and the same device, never a caller factory. */
export function normalizeDevicePagedUniswapPreparationV3(raw,rawPagedDescriptor){
 const v=P.pagedOwnerExactV3(raw,['configuration','targetConnection','template']),paged=P.normalizeDevicePagedDescriptorV3(rawPagedDescriptor),config=P.pagedOwnerExactV3(v.configuration,['family','label','chainDomain','evidencePolicy','assetSymbol','decimals','destinations']);
 if(config.family!=='EVM'||typeof config.label!=='string'||config.label.length<1||config.label.length>80||!Array.isArray(config.destinations)||config.destinations.length!==0)throw Error('PAGED_UNISWAP_PREPARATION');
 P.pagedOwnerHexV3(config.chainDomain);P.pagedOwnerHexV3(config.evidencePolicy);
 const connection=P.pagedOwnerExactV3(v.targetConnection,['format','descriptor','transport']),descriptor=normalizeExternalFlatDescriptorV1(connection.descriptor),transport=P.pagedOwnerExactV3(connection.transport,['type','certificatePEM','certificateSHA256']);
 if(connection.format!=='DEVICE_EXTERNAL_FLAT_CONNECTION_V1'||descriptor.profile!==DEVICE_EXTERNAL_FLAT_SHARE_V1||descriptor.devicePublicKey!==paged.devicePublicKey||transport.type!=='ANDROID_PINNED_TLS_V1'||typeof transport.certificatePEM!=='string'||transport.certificatePEM.length>32768||!/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/.test(transport.certificatePEM)||typeof transport.certificateSHA256!=='string'||!/^[a-f0-9]{64}$/.test(transport.certificateSHA256))throw Error('PAGED_UNISWAP_PREPARATION');
 const origin=new URL(paged.origin);if(Number(origin.port)>=65535)throw Error('PAGED_UNISWAP_PREPARATION');origin.port=String(Number(origin.port)+1);
 if(descriptor.origin!==origin.origin||config.assetSymbol!==descriptor.assetMetadata.symbol||config.decimals!==descriptor.assetMetadata.decimals)throw Error('PAGED_UNISWAP_PREPARATION');
 const template=P.pagedOwnerExactV3(v.template,['maximumInput','outputAmount','recipient','inputAsset']),asset=P.pagedOwnerExactV3(template.inputAsset,['asset','assetIdentity','symbol','decimals']);P.pagedOwnerHexV3(asset.assetIdentity);if(template.maximumInput!=='200'||template.outputAmount!=='100'||typeof template.recipient!=='string'||!/^[a-f0-9]{40}$/.test(template.recipient)||template.recipient==='0'.repeat(40)||typeof asset.asset!=='string'||!/^[a-f0-9]{40}$/.test(asset.asset)||asset.asset===descriptor.poolTerms.asset||asset.assetIdentity===descriptor.poolTerms.assetIdentity||typeof asset.symbol!=='string'||!/^[\x20-\x7e]{1,64}$/.test(asset.symbol)||!Number.isSafeInteger(asset.decimals)||asset.decimals<0||asset.decimals>18)throw Error('PAGED_UNISWAP_PREPARATION');
 return Object.freeze({configuration:Object.freeze(config),template:Object.freeze({...template,inputAsset:Object.freeze(asset)}),targetConnection:Object.freeze({format:connection.format,descriptor,transport:Object.freeze(transport)})});
}
