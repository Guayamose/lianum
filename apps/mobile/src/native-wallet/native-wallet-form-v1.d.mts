import type {NativeWalletChainV1,NativeWalletAccountV1,NativeWalletSendQuoteV1,NativeWalletFiatCapabilitiesV1,NativeWalletFiatOrderV1} from './native-wallet-ui-port';
export function nativeWalletAssetV1(chain:NativeWalletChainV1):{symbol:'ETH'|'BTC'|'SOL';decimals:number;name:string};
export function nativeWalletAmountAtomicV1(text:string,decimals:number):string;
export function nativeWalletAmountTextV1(atomic:string,decimals:number):string;
export function nativeWalletQuoteReviewV1(quote:NativeWalletSendQuoteV1,account:NativeWalletAccountV1,input:{recipient:string;amountAtomic:string},now?:number):{symbol:string;network:string;recipient:string;amount:string;maximumFee:string;maximumTotal:string;expiresAt:number};
export function nativeWalletFiatEnabledV1(capabilities:NativeWalletFiatCapabilitiesV1|null,account:NativeWalletAccountV1,flow:'BUY'|'SELL'):boolean;
export function nativeWalletGatewayUrlV1(order:NativeWalletFiatOrderV1):string;
