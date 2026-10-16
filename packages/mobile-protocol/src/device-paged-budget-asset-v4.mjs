/** Budget metadata DATA beneath the actual original source/provider issuer.
 * Parsing cannot identify a receiver, issue a quote or convert another asset. */
import * as P from './device-paged-owner-v3.mjs';
const need=ok=>{if(!ok)throw Error('MOBILE_PAGED_BUDGET_ASSET');};
export function normalizeDevicePagedBudgetAssetDataV4(raw,rawDescriptor){
 need(arguments.length===2);const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),a=P.pagedOwnerExactV3(raw,['networkId','genesis','assetIdentity','symbol','decimals','unit']);
 need(a.networkId==='ethereum-sepolia'&&a.symbol==='ETH'&&a.decimals===18&&a.unit==='wei');need(descriptor.chainId==='11155111'&&a.genesis===descriptor.genesis&&a.assetIdentity===descriptor.assetIdentity);return Object.freeze(a);
}
export function normalizeDevicePagedPublicFundingMetadataDataV4(raw,descriptor){
 need(arguments.length===2);const row=P.pagedOwnerExactV3(raw,['budgetAsset','fundingOrigin']);need(row.fundingOrigin==='OPERATOR_TESTNET');row.budgetAsset=normalizeDevicePagedBudgetAssetDataV4(row.budgetAsset,descriptor);return Object.freeze(row);
}
export function assertDevicePagedPublicNetworkIdDataV4(networkId,family){
 need(arguments.length===2);need(networkId===({EVM:'ethereum-sepolia',BTC:'bitcoin-testnet',SOL:'solana-devnet',UNISWAP:'ethereum-sepolia',AAVE:'ethereum-sepolia',MORPHO:'ethereum-sepolia'})[family]);return networkId;
}
/** Display exact atomic units;600wei is never600ETH. No metadata fallback
 * converts units, supplies economic terms or labels an unknown asset ETH. */
export function devicePagedBudgetAmountPresentationDataV4(rawAmount,descriptor,rawMetadata=null){
 need(arguments.length===2||arguments.length===3);P.pagedOwnerUintV3(rawAmount,true);const d=P.normalizeDevicePagedDescriptorV3(descriptor);
 if(rawMetadata!==null){const m=normalizeDevicePagedPublicFundingMetadataDataV4(rawMetadata,d);return Object.freeze({amount:rawAmount+' wei',unit:'wei',asset:'ETH',decimals:m.budgetAsset.decimals,network:'Ethereum Sepolia',funding:'Patrocinado por el operador en redes de prueba',known:true});}
 const local=d.chainId==='31337';return Object.freeze({amount:rawAmount+(local?' unidades demo':' unidades del activo de la operación'),unit:local?'unidades demo':'unidades del activo',asset:null,decimals:null,network:local?'Ethereum local':'Red de la operación',funding:null,known:false});
}
