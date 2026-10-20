export type NativeNetworkIdV1='ethereum-mainnet'|'ethereum-sepolia'|'bitcoin-mainnet'|'bitcoin-testnet'|'solana-mainnet'|'solana-devnet';
export type NativeAccountV1=Readonly<{networkId:NativeNetworkIdV1;chain:'ethereum'|'bitcoin'|'solana';network:'mainnet'|'testnet';address:string;path:string;publicKey:string}>;
export type NativeNetworkV1=Readonly<{id:NativeNetworkIdV1;chain:NativeAccountV1['chain'];network:NativeAccountV1['network'];genesisHash:string;symbol:'ETH'|'BTC'|'SOL';decimals:number;trust:'RPC_PROVIDER'}>;
export type NativeConfigurationV1={networks:Array<{id:NativeNetworkIdV1;endpoint:string}>};
export type NativeQuoteV1=Readonly<{profile:'NATIVE_WALLET_SEND_QUOTE_V1';id:string;networkId:NativeNetworkIdV1;network:NativeNetworkV1;account:NativeAccountV1;recipient:string;amountAtomic:string;fee:Readonly<{assetSymbol:string;maximumAtomic:string}>;transaction:Readonly<Record<string,unknown>>;issuedAt:number;expiresAt:number;quoteSHA256:string}>;
export type NativeBalanceV1=Readonly<{networkId:NativeNetworkIdV1;network:NativeNetworkV1;address:string;balanceAtomic:string;spendableAtomic:string;reservedAtomic:string;pendingAtomic:string;hasPendingTransfer:boolean;observed:Readonly<{blockHash:string;blockNumber:string;finality:string}>}>;
export type NativeStatusV1=Readonly<{operationId:string;quoteId:string;id:string|null;networkId:NativeNetworkIdV1;status:'PREPARED'|'EXPIRED'|'SUBMITTED'|'CONFIRMED'|'FINALIZED'|'FAILED'|'UNKNOWN';terminal:boolean;confirmations:string|null;blockHash:string|null;blockNumber:string|null;feeAtomic:string|null;errorCode:string|null}>;
export interface NativeWalletGatewayV1{
 capabilities():Readonly<{profile:string;signing:'DEVICE_ONLY';paeg:false;networks:ReadonlyArray<NativeNetworkV1&{minimumAmountAtomic:string;finality:string}>;quoteLifetimeMs:120000;onePendingPerAccount:true;automaticRebroadcast:true;maximumBroadcastAttempts:3}>;
 balances(account:NativeAccountV1,signal?:AbortSignal):Promise<NativeBalanceV1>;
 readAccount(account:NativeAccountV1,signal?:AbortSignal):Promise<NativeBalanceV1>;
 prepareSend(input:{account:NativeAccountV1;recipient:string;amountAtomic:string;operationId?:string;networkId?:NativeNetworkIdV1},signal?:AbortSignal):Promise<NativeQuoteV1>;
 broadcast(input:{quoteId:string;rawTransaction:string;networkId?:NativeNetworkIdV1},signal?:AbortSignal):Promise<NativeStatusV1>;
 submitSigned(input:{quoteId:string;rawTransaction:string;networkId?:NativeNetworkIdV1},signal?:AbortSignal):Promise<NativeStatusV1>;
 transactionStatus(input:{id:string;networkId?:NativeNetworkIdV1},signal?:AbortSignal):Promise<NativeStatusV1>;
 observeTransfer(id:string|{id:string;networkId?:NativeNetworkIdV1},signal?:AbortSignal):Promise<NativeStatusV1>;
 cancelQuote(input:{id:string;networkId?:NativeNetworkIdV1},signal?:AbortSignal):Promise<NativeStatusV1>;
 close():Promise<void>;
}
export function createNativeWalletGatewayV1(options:{directory:string;configuration:NativeConfigurationV1}|{journalDirectory:string;config:NativeConfigurationV1}):Promise<NativeWalletGatewayV1>;
export const createNativeWalletServiceV1:typeof createNativeWalletGatewayV1;
