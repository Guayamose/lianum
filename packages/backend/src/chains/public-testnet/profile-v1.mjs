/** Public test networks only. These domains are never adopted as owned local ledgers. */
import {createHash} from 'node:crypto';
import {decodeProviderBase58HexV1} from '@lianum/crypto/native-provider-crypto-v1';
import {nativePublicNetworksV1} from '../../native-wallet/networks-v1.mjs';
import {need,freeze} from '../../native-wallet/common-v1.mjs';
import {PUBLIC_PAGED_TESTNET_IDS_V1} from './account-v1.mjs';
export {PUBLIC_PAGED_TESTNET_IDS_V1,assertPublicPagedProviderAccountV1} from './account-v1.mjs';
import {nativeAdmissionChainDomain,nativeAdmissionRuleCommitment} from '@lianum/engine/execution/native/dispatch/native-admission';

export const PUBLIC_PAGED_TESTNET_PROFILE_V1='PAGED_PUBLIC_TESTNET_RPC_PROVIDER_V1';
export const PUBLIC_PAGED_TESTNET_DEFAULTS_V1=Object.freeze({networks:Object.freeze([
 Object.freeze({id:'ethereum-sepolia',endpoint:'https://sepolia.drpc.org'}),
 Object.freeze({id:'bitcoin-testnet',endpoint:'https://mempool.space/testnet/api',feeProvider:'MEMPOOL'}),
 Object.freeze({id:'solana-devnet',endpoint:'https://api.devnet.solana.com'}),
])});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const frame=(tag,parts)=>Buffer.concat([Buffer.from(tag,'ascii'),...parts].flatMap(part=>{const size=Buffer.alloc(4);size.writeUInt32BE(part.length);return[size,part];}));
export function publicPagedTestnetNetworksV1(configuration=PUBLIC_PAGED_TESTNET_DEFAULTS_V1){
 const rows=nativePublicNetworksV1(configuration);need(JSON.stringify(rows.map(r=>r.network.id))===JSON.stringify(PUBLIC_PAGED_TESTNET_IDS_V1),'PUBLIC_TESTNET_PROFILE');
 return rows.map(config=>{
  const family=config.network.chain==='ethereum'?'3':config.network.chain==='bitcoin'?'1':'2';
  const genesis=config.network.chain==='solana'?decodeProviderBase58HexV1(config.network.genesisHash):config.network.genesisHash.replace(/^0x/,'');
  // Currency identity includes the genuine network genesis. No fiat/native conversion is implied.
  const asset=hash(frame('LIANUM/PAEG/public-testnet-native-currency/1',[Buffer.from([Number(family)]),Buffer.from(genesis,'hex')]));
  const rule={family,genesis,asset,finalityKind:family,minimumConfirmations:family==='1'?'6':family==='3'?'1':'0',maximumEvidenceLifetime:'86400',maximumClockSkew:'30'};
  return {...config,rule:freeze(rule),configuration:freeze({family:family==='1'?'BTC':family==='2'?'SOL':'EVM',networkId:config.network.id,label:config.network.id,chainDomain:nativeAdmissionChainDomain(rule),evidencePolicy:nativeAdmissionRuleCommitment(rule),assetSymbol:config.network.symbol,decimals:config.network.decimals,classification:PUBLIC_PAGED_TESTNET_PROFILE_V1,trust:'RPC_PROVIDER',finality:family==='1'?'SIX_POW_CONFIRMATIONS':family==='2'?'RPC_FINALIZED':'RPC_FINALIZED',destinations:[]})};
 });
}
