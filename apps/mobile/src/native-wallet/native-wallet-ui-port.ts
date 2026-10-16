/** Public account and service DATA. Implementations keep seed/signing in custody. */
export type NativeWalletChainV1='ethereum'|'bitcoin'|'solana';
export type NativeWalletAccountV1=Readonly<{chain:NativeWalletChainV1;network:'mainnet'|'testnet';networkId:string;address:string;path:string;publicKey:string}>;
export type NativeWalletStateV1=Readonly<{status:'ABSENT'|'READY';accounts:readonly NativeWalletAccountV1[];transactions?:readonly NativeWalletTransferV1[];fiatOrders?:readonly NativeWalletFiatOrderV1[];pendingFiatRequests?:readonly NativeWalletFiatRequestV1[]}>;
export type NativeWalletNetworkV1=Readonly<{id:string;chain:NativeWalletChainV1;network:'mainnet'|'testnet';genesisHash:string;symbol:string;decimals:number;trust:'RPC_PROVIDER'}>;
export type NativeWalletBalanceV1=Readonly<{network:NativeWalletNetworkV1;address:string;balanceAtomic:string;spendableAtomic:string;reservedAtomic:string;observed:Readonly<{blockHash:string;blockNumber:string}>}>;
export type NativeWalletAccountBalanceV1=Readonly<{account:NativeWalletAccountV1;status:'CONFIRMED'|'UNKNOWN';balance:NativeWalletBalanceV1|null;reason?:string}>;
export type NativeWalletSendQuoteV1=Readonly<{profile:'NATIVE_WALLET_SEND_QUOTE_V1';id:string;networkId:string;network:NativeWalletNetworkV1;account:NativeWalletAccountV1;recipient:string;amountAtomic:string;fee:Readonly<{assetSymbol:string;maximumAtomic:string}>;issuedAt:number;expiresAt:number;transaction:unknown;quoteSHA256:string}>;
export type NativeWalletTransferV1=Readonly<{id:string;status:'SUBMITTED'|'PENDING'|'CONFIRMED'|'FAILED'|'UNKNOWN';transactionId?:string|null;networkId?:string;recipient?:string;amountAtomic?:string}>;
export type NativeWalletFiatAssetV1=Readonly<{asset:'BTC'|'ETH'|'SOL';network:NativeWalletChainV1;decimals:number;chain:string}>;
export type NativeWalletFiatCapabilitiesV1=Readonly<{profile:'LIANUM_MOONPAY_CAPABILITIES_V1';configured:boolean;environment:'SANDBOX'|'PRODUCTION'|null;buy:boolean;sell:boolean;fiatCurrencies:readonly ['EUR'];assets:readonly NativeWalletFiatAssetV1[];reason:string|null}>;
export type NativeWalletFiatRequestV1=Readonly<{requestId:string;flow:'BUY'|'SELL';asset:'BTC'|'ETH'|'SOL';network:NativeWalletChainV1;fiatCurrency:'EUR';amount:string;walletAddress:string}>;
export type NativeWalletFiatOrderV1=Readonly<{requestId:string;profile:'LIANUM_MOONPAY_CHECKOUT_V1';id:string;externalTransactionId:string;flow:'BUY'|'SELL';asset:'BTC'|'ETH'|'SOL';network:NativeWalletChainV1;chain:string;fiatCurrency:'EUR';amount:string;walletAddress:string;environment:'SANDBOX'|'PRODUCTION';checkoutUrl?:string;status:string;createdAt:number|string;expiresAt:number|null;providerStatus:string|null;providerTransactionId:string|null;chainConfirmation:'UNVERIFIED';privateBalanceCredited:false;deposit?:Readonly<{address:string;amountAtomic:string;networkId:string;expiresAt:number}>|null}>;

export interface NativeWalletUiPortV1 {
 readState(signal:AbortSignal):Promise<NativeWalletStateV1>;
 create(signal:AbortSignal):Promise<NativeWalletStateV1>;
 restore(mnemonic:string,signal:AbortSignal):Promise<NativeWalletStateV1>;
 /** Explicit protected disclosure only; no private keys returned by any port. */
 revealMnemonic(signal:AbortSignal):Promise<string>;
 readBalances(signal:AbortSignal):Promise<readonly NativeWalletAccountBalanceV1[]>;
 prepareSend(input:{account:NativeWalletAccountV1;recipient:string;amountAtomic:string},signal:AbortSignal):Promise<NativeWalletSendQuoteV1>;
 /** Cancels only an original unsigned quote, never a signed/uncertain send. */
 cancelSendQuote(id:string,signal:AbortSignal):Promise<void>;
 /** Quote is the unchanged original controller object, never reconstructed from JSX. */
 authorizeAndSend(quote:NativeWalletSendQuoteV1,signal:AbortSignal):Promise<NativeWalletTransferV1>;
 refreshTransaction(id:string,signal:AbortSignal):Promise<NativeWalletTransferV1>;
 readFiatCapabilities(signal:AbortSignal):Promise<NativeWalletFiatCapabilitiesV1>;
 createFiatSession(input:NativeWalletFiatRequestV1,signal:AbortSignal):Promise<NativeWalletFiatOrderV1>;
 reconcileFiatSession(id:string,signal:AbortSignal):Promise<NativeWalletFiatOrderV1>;
 /** Same durable request ID after an unconfirmed checkout response. No new order intent. */
 resumeFiatSession(requestId:string,signal:AbortSignal):Promise<NativeWalletFiatOrderV1>;
 /** Reconciles the authenticated provider order; only its exact deposit is eligible. */
 prepareFiatSale(id:string,signal:AbortSignal):Promise<NativeWalletSendQuoteV1>;
}
