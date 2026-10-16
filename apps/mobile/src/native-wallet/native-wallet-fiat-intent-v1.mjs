/** Durable checkout identity is independent of transport replies. These records
 * contain public request DATA only and never authorize a native transfer. */
import {nativeWalletAmountAtomicV1,nativeWalletAmountTextV1} from './native-wallet-form-v1.mjs';
const fields=['requestId','flow','asset','network','fiatCurrency','amount','walletAddress'];
const need=v=>{if(!v)throw Error('FIAT_ORDER_BINDING');};
export function normalizeNativeWalletFiatIntentV1(raw){
 need(raw&&Object.getPrototypeOf(raw)===Object.prototype&&Object.keys(raw).sort().join(',')===[...fields].sort().join(','));
 need(typeof raw.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(raw.requestId));
 need(['BUY','SELL'].includes(raw.flow)&&['BTC','ETH','SOL'].includes(raw.asset)&&raw.network===({BTC:'bitcoin',ETH:'ethereum',SOL:'solana'})[raw.asset]&&raw.fiatCurrency==='EUR'&&typeof raw.walletAddress==='string');
 const decimals=raw.flow==='BUY'?2:({BTC:8,ETH:18,SOL:9})[raw.asset];
 const amount=nativeWalletAmountTextV1(nativeWalletAmountAtomicV1(raw.amount,decimals),decimals);
 return Object.freeze(Object.fromEntries(fields.map(key=>[key,key==='amount'?amount:raw[key]])));
}
const terms=value=>JSON.stringify(fields.filter(k=>k!=='requestId').map(k=>value[k]));
export function selectNativeWalletFiatIntentV1(requests,orders,raw){
 const input=normalizeNativeWalletFiatIntentV1(raw),normalized=requests.map(normalizeNativeWalletFiatIntentV1),sameId=normalized.find(r=>r.requestId===input.requestId);
 if(sameId)need(terms(sameId)===terms(input));
 const pending=normalized.filter(r=>terms(r)===terms(input)&&!orders.some(order=>order.requestId===r.requestId));
 if(pending.length>1)throw Error('FIAT_ORDER_AMBIGUOUS');
 return pending[0]??sameId??input;
}
