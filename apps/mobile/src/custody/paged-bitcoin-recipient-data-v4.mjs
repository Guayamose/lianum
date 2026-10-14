/** Recipient input DATA only. A valid address neither chooses a PAEG network
 * nor proves its genesis/finality; the original signed provider must bind both. */
import {validateNativeAddressV1,bitcoinScriptV1} from '@lianum/crypto/native-wallet-v1';
export function pagedBitcoinRecipientDataValidV4(address){
 if(typeof address!=='string'||address.length>100||/[\s\x00-\x1f]/.test(address))return false;
 // Preserve the existing local input shape. Original local preparation still
 // checks its real network/script; it is never treated as a testnet address.
 if(/^bcrt1[023456789acdefghjklmnpqrstuvwxyz]{39}$/.test(address))return true;
 try{validateNativeAddressV1('bitcoin-testnet',address);return /^0014[0-9a-f]{40}$/.test(bitcoinScriptV1(address,'testnet'));}catch{return false;}
}
