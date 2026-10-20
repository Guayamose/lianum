/** Exact display arithmetic shared by mobile and read-only backend views. */
function decimal(value){if(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value)||value.length>80)throw Error('PORTFOLIO_RATE');const [whole,fraction='']=value.split('.');return {n:BigInt(whole+fraction),d:10n**BigInt(fraction.length)};}
export function fiatCentsV1(atomic,decimals,symbol,market,currency){
 if(!/^(0|[1-9]\d*)$/.test(atomic)||!Number.isInteger(decimals)||decimals<0||decimals>18||!['EUR','USD'].includes(currency))throw Error('PORTFOLIO_AMOUNT');const rate=decimal(market.rates[symbol]);if(rate.n===0n)throw Error('PORTFOLIO_RATE');const fx=currency==='EUR'?decimal(market.rates.EUR):{n:1n,d:1n},n=BigInt(atomic)*rate.d*fx.n*100n,d=10n**BigInt(decimals)*rate.n*fx.d;return(n+d/2n)/d;
}
export function nativeFiatAmountsV1(balance,decimals,symbol,market,currency){
 let total=null,available=null,reserved=null,occupied=null,paused=null;
 if(balance&&market){try{const b=BigInt(balance.balanceAtomic),a=BigInt(balance.spendableAtomic),r=BigInt(balance.reservedAtomic);if(b<0n||a<0n||r<0n||a>b)throw Error('PORTFOLIO_BALANCE');total=fiatCentsV1(b.toString(),decimals,symbol,market,currency);available=fiatCentsV1(a.toString(),decimals,symbol,market,currency);const unavailable=total-available;reserved=fiatCentsV1(r.toString(),decimals,symbol,market,currency);if(reserved>unavailable)reserved=unavailable;occupied=unavailable-reserved;paused=0n;if(balance.hasPendingTransfer){occupied=reserved;paused=unavailable-occupied;reserved=0n;}}catch{total=null;available=null;reserved=null;occupied=null;paused=null;}}
 return {total,available,reserved,occupied,paused};
}
