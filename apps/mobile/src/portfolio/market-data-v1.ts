/** Anonymous market observations only. No addresses, identity, custody or orders. */
export type DisplayCurrency='EUR'|'USD';
export type MarketSymbol='BTC'|'ETH'|'SOL';
export type MarketSnapshot=Readonly<{observedAt:number;rates:Readonly<Record<MarketSymbol|'EUR',string>>;source:'Coinbase'}>;
export type MarketCandle=Readonly<{at:number;close:number}>;
export type MarketRange='1D'|'1W'|'1M'|'1Y';
const symbols=['BTC','ETH','SOL','EUR'] as const;
let snapshot:MarketSnapshot|null=null;
const history=new Map<string,{at:number;rows:readonly MarketCandle[]}>();
async function publicJSON(url:string,signal:AbortSignal){
 const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)controller.abort();const timer=setTimeout(abort,10000);
 try{const response=await fetch(url,{signal:controller.signal,credentials:'omit',redirect:'error',headers:{Accept:'application/json'}});if(!response.ok)throw Error('MARKET_UNAVAILABLE');const text=await response.text();if(text.length>250000)throw Error('MARKET_BOUND');return JSON.parse(text) as unknown;}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
export function normalizeMarketSnapshotV1(raw:unknown,observedAt=Date.now()):MarketSnapshot{
 const value=raw as {data?:{currency?:string;rates?:Record<string,unknown>}};
 if(value?.data?.currency!=='USD'||!Number.isSafeInteger(observedAt)||observedAt<=0)throw Error('MARKET_DATA');
 const rates={} as Record<MarketSymbol|'EUR',string>;
 for(const symbol of symbols){const rate=value.data.rates?.[symbol];if(typeof rate!=='string'||rate.length>80||!/^\d+(?:\.\d+)?$/.test(rate)||!Number.isFinite(Number(rate))||Number(rate)<=0)throw Error('MARKET_RATE');rates[symbol]=rate;}
 return Object.freeze({observedAt,rates:Object.freeze(rates),source:'Coinbase'});
}
export async function readMarketSnapshotV1(signal:AbortSignal):Promise<MarketSnapshot>{
 if(signal.aborted)throw Error('MARKET_CANCELLED');if(snapshot&&Date.now()-snapshot.observedAt<60000)return snapshot;
 const result=normalizeMarketSnapshotV1(await publicJSON('https://api.coinbase.com/v2/exchange-rates?currency=USD',signal));if(signal.aborted)throw Error('MARKET_CANCELLED');snapshot=result;return result;
}
export function normalizeMarketCandlesV1(raw:unknown,start:number,end:number):readonly MarketCandle[]{
 if(!Array.isArray(raw)||raw.length>500)throw Error('MARKET_HISTORY');const rows=new Map<number,MarketCandle>();
 for(const row of raw){if(!Array.isArray(row)||row.length<5||!Number.isSafeInteger(row[0])||!Number.isFinite(row[4])||row[4]<=0)throw Error('MARKET_CANDLE');const at=row[0]*1000;if(at>=start&&at<=end)rows.set(at,Object.freeze({at,close:row[4]}));}
 const result=[...rows.values()].sort((a,b)=>a.at-b.at);if(result.length<2)throw Error('MARKET_HISTORY_EMPTY');return Object.freeze(result);
}
export async function readMarketHistoryV1(symbol:MarketSymbol,currency:DisplayCurrency,range:MarketRange,signal:AbortSignal):Promise<readonly MarketCandle[]>{
 if(!['BTC','ETH','SOL'].includes(symbol)||!['EUR','USD'].includes(currency)||!['1D','1W','1M','1Y'].includes(range))throw Error('MARKET_PRODUCT');
 const key=symbol+currency+range,cached=history.get(key);if(cached&&Date.now()-cached.at<300000&&!signal.aborted)return cached.rows;
 const seconds={ '1D':86400,'1W':604800,'1M':2592000,'1Y':31536000}[range],granularity=range==='1D'?900:range==='1W'?3600:86400,end=Date.now(),start=end-seconds*1000;
 // Coinbase caps a request at 300 buckets. A year is two bounded requests.
 const rows:MarketCandle[]=[];for(let from=start;from<end;from+=granularity*250000){const to=Math.min(end,from+granularity*250000),url=`https://api.exchange.coinbase.com/products/${symbol}-${currency}/candles?granularity=${granularity}&start=${encodeURIComponent(new Date(from).toISOString())}&end=${encodeURIComponent(new Date(to).toISOString())}`;rows.push(...normalizeMarketCandlesV1(await publicJSON(url,signal),from,to));}
 if(signal.aborted)throw Error('MARKET_CANCELLED');const result=Object.freeze([...new Map(rows.map(row=>[row.at,row])).values()].sort((a,b)=>a.at-b.at));history.set(key,{at:Date.now(),rows:result});return result;
}
