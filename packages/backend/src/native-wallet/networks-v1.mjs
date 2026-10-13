import {nativeNetworkV1} from '@lianum/crypto/native-wallet-v1';
import {exact,need,freeze} from './common-v1.mjs';
// Public network genesis anchors: geth params/config.go; Bitcoin Core v29
// kernel/chainparams.cpp; Solana getGenesisHash (full hash, not CAIP-2 prefix).
const genesis=Object.freeze({
 'ethereum-mainnet':'0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3',
 'ethereum-sepolia':'0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',
 'bitcoin-mainnet':'000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
 'bitcoin-testnet':'000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943',
 'solana-mainnet':'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
 'solana-devnet':'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
});
export function nativePublicNetworksV1(config){exact(config,['networks']);need(Array.isArray(config.networks)&&config.networks.length>0&&config.networks.length<=6,'CONFIG');const ids=new Set();return config.networks.map(raw=>{exact(raw,['id','endpoint'],['feeProvider']);need(raw.feeProvider===undefined||raw.feeProvider==='ESPLORA'||raw.feeProvider==='MEMPOOL','CONFIG');need(!ids.has(raw.id),'CONFIG');ids.add(raw.id);const n=nativeNetworkV1(raw.id);need(Object.hasOwn(genesis,raw.id),'NETWORK_UNSUPPORTED');need(typeof raw.endpoint==='string'&&raw.endpoint.length<=2048,'CONFIG');const endpoint=new URL(raw.endpoint);need(endpoint.protocol==='https:'&&!endpoint.username&&!endpoint.password&&!endpoint.hash,'HTTPS_REQUIRED');need(!['localhost','127.0.0.1','::1','[::1]'].includes(endpoint.hostname),'PUBLIC_ENDPOINT_REQUIRED');return{network:freeze({id:raw.id,chain:n.chain,network:n.network,genesisHash:genesis[raw.id],symbol:n.symbol,decimals:n.decimals,trust:'RPC_PROVIDER'}),endpoint:endpoint.href,chainId:n.chainId??null,feeProvider:raw.feeProvider??'ESPLORA'};});}
