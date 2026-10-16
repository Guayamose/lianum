import {validateNativeAccountV1,validateNativeAddressV1} from '@lianum/crypto/native-wallet-v1';
import type {NativeWalletUiPortV1} from './native-wallet-ui-port';

export function normalizeSepoliaDefiRecipientV7(value:string):string {
  validateNativeAddressV1('ethereum-sepolia',value);
  const address=value.toLowerCase();if(address==='0x'+'0'.repeat(40))throw Error('MOBILE_SEPOLIA_DEFI_RECIPIENT');return address;
}
/** Public metadata only. Ethereum uses the same native-wallet derivation path
 * on mainnet and Sepolia. This does not read seed words, sign, or merge balances. */
export async function readSepoliaDefiWalletRecipientV7(port:Pick<NativeWalletUiPortV1,'readState'>,signal:AbortSignal):Promise<string|null>{
  if(signal.aborted)throw Error('MOBILE_SEPOLIA_DEFI_RECIPIENT_CLOSED');
  const state=await port.readState(signal);if(signal.aborted)throw Error('MOBILE_SEPOLIA_DEFI_RECIPIENT_CLOSED');
  if(state.status==='ABSENT')return null;
  const accounts=state.accounts.filter(account=>account.chain==='ethereum');
  if(accounts.length===0)return null;if(accounts.length!==1)throw Error('MOBILE_SEPOLIA_DEFI_RECIPIENT');
  const account=validateNativeAccountV1(accounts[0]);
  if(!['ethereum-sepolia','ethereum-mainnet'].includes(account.networkId))throw Error('MOBILE_SEPOLIA_DEFI_RECIPIENT');
  return normalizeSepoliaDefiRecipientV7(account.address);
}
