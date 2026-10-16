/** Public routing/configuration DATA. A profile never authorizes an investment,
 * creates a note, supplies a price quote or proves ownership of a balance. */
import {externalFlatExactV1 as exact,externalFlatUintV1 as uint,normalizeExternalFlatDescriptorV1,DEVICE_EXTERNAL_FLAT_SHARE_V1} from './device-external-flat-note-v1.mjs';
import {normalizeDevicePagedDescriptorV3} from './device-paged-owner-v3.mjs';
import {normalizeDevicePagedNativePreparationV3} from './device-paged-graph-v3.mjs';
export const DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7='DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7';
const need=value=>{if(!value)throw Error('DEVICE_SEPOLIA_DEFI_CONNECTION_DATA');};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function address(value){need(typeof value==='string'&&/^0x[0-9a-f]{40}$/.test(value)&&value!=='0x'+'0'.repeat(40));return value;}
export function normalizeDeviceSepoliaDefiConnectionV7(raw) {
  const value=exact(raw,['format','descriptor','transport','protocol','underlying','terms',...(Object.hasOwn(raw??{},'paegSource')?['paegSource']:[])]);
  need(value.format===DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7&&['AAVE_STATIC','MORPHO_V2'].includes(value.protocol));
  const descriptor=normalizeExternalFlatDescriptorV1(value.descriptor);
  need(descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1&&descriptor.assetMetadata.kind==='ERC20');
  need(descriptor.assetMetadata.symbol===(value.protocol==='AAVE_STATIC'?'stataUSDC':'mvUSDC')&&descriptor.assetMetadata.decimals===(value.protocol==='AAVE_STATIC'?6:18));
  const underlying=exact(value.underlying,['symbol','decimals','address']);need(underlying.symbol==='USDC'&&underlying.decimals===6);address(underlying.address);need(underlying.address!=='0x'+descriptor.poolTerms.asset);
  const terms=exact(value.terms,['shareWithdrawalRecipient','underlyingReceiver','maximumInputAtomic','minimumAssetsAtomic']);
  address(terms.shareWithdrawalRecipient);if(terms.underlyingReceiver!==null)address(terms.underlyingReceiver);
  need(terms.shareWithdrawalRecipient!==terms.underlyingReceiver&&terms.underlyingReceiver!=='0x'+descriptor.poolTerms.pool);
  need(typeof terms.maximumInputAtomic==='string'&&/^[1-9][0-9]{0,38}$/.test(terms.maximumInputAtomic)&&BigInt(terms.maximumInputAtomic)<1n<<128n);
  uint(terms.minimumAssetsAtomic);need(BigInt(terms.minimumAssetsAtomic)>0n);
  const transport=exact(value.transport,['type','certificatePEM','certificateSHA256']);
  need(transport.type==='ANDROID_PINNED_TLS_V1'&&typeof transport.certificatePEM==='string'&&transport.certificatePEM.length>0&&transport.certificatePEM.length<=32768&&/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/.test(transport.certificatePEM)&&typeof transport.certificateSHA256==='string'&&/^[0-9a-f]{64}$/.test(transport.certificateSHA256));
  let paegSource;
  if(value.paegSource!==undefined){
    const s=exact(value.paegSource,['descriptor','preparation']),source=normalizeDevicePagedDescriptorV3(s.descriptor),preparation=normalizeDevicePagedNativePreparationV3(s.preparation,source);
    need(source.chainId==='11155111'&&source.origin===descriptor.origin&&source.devicePublicKey===descriptor.devicePublicKey&&source.genesis===descriptor.poolTerms.genesis&&preparation.defi!==undefined&&preparation.uniswap===undefined);
    need(JSON.stringify(preparation.defi.targetDescriptors[value.protocol])===JSON.stringify(descriptor));
    need(source.pool!=='0x'+descriptor.poolTerms.pool&&source.assetIdentity!==descriptor.poolTerms.assetIdentity);
    paegSource={descriptor:source,preparation};
  }
  return freeze({format:value.format,descriptor,transport:{...transport},protocol:value.protocol,underlying:{...underlying},terms:{...terms},...(paegSource?{paegSource}:{})});
}
