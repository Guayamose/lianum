/** Exact existing native-endpoint/2 framing, without importing local owners. */
import {createHash} from 'node:crypto';
import {decodeProviderBase58HexV1} from '@lianum/crypto/native-provider-crypto-v1';
import {bitcoinScriptV1} from '@lianum/crypto/native-wallet-v1';
import {need} from '../../native-wallet/common-v1.mjs';
export function publicPagedEndpointV1(account,rule,address){
 const family=account.chain==='ethereum'?'EVM':account.chain==='bitcoin'?'BTC':'SOL';
 const raw=family==='EVM'?address.slice(2):family==='BTC'?bitcoinScriptV1(address,'testnet'):decodeProviderBase58HexV1(address);
 need(/^[0-9a-f]+$/.test(raw)&&raw.length===(family==='EVM'?40:family==='BTC'?44:64),'PUBLIC_ENDPOINT');
 const parts=[Buffer.from('LIANUM/PAEG/native-endpoint/2'),Buffer.from('LIANUM_PAEG_NATIVE_4_V2'),Buffer.from(family),Buffer.from(rule.genesis,'hex'),Buffer.from(rule.asset,'hex'),Buffer.from(family==='EVM'?'EVM_ADDRESS':family==='BTC'?'BTC_P2WPKH_SCRIPT':'SOL_PUBLIC_KEY'),Buffer.from(raw,'hex')];
 return createHash('sha256').update(Buffer.concat(parts.flatMap(part=>{const size=Buffer.alloc(4);size.writeUInt32BE(part.length);return[size,part];}))).digest('hex');
}
