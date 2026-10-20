export type ValuationCurrency='EUR'|'USD';
export type ValuationSymbol='BTC'|'ETH'|'SOL';
type Market={rates:Readonly<Record<ValuationSymbol|'EUR',string>>};
type Balance={balanceAtomic:string;spendableAtomic:string;reservedAtomic:string;hasPendingTransfer?:boolean};
export function fiatCentsV1(atomic:string,decimals:number,symbol:ValuationSymbol,market:Market,currency:ValuationCurrency):bigint;
export function nativeFiatAmountsV1(balance:Balance|null,decimals:number,symbol:ValuationSymbol,market:Market|null,currency:ValuationCurrency):{total:bigint|null;available:bigint|null;reserved:bigint|null;occupied:bigint|null;paused:bigint|null};
