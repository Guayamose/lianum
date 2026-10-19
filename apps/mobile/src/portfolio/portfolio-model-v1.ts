import type {NativeWalletAccountV1,NativeWalletAccountBalanceV1,NativeWalletTransferV1} from '../native-wallet/native-wallet-ui-port';
import type {DisplayCurrency,MarketSnapshot,MarketSymbol} from './market-data-v1';
export const portfolioAssets={bitcoin:{symbol:'BTC',name:'Bitcoin',decimals:8,color:'#C89039'},ethereum:{symbol:'ETH',name:'Ethereum',decimals:18,color:'#697FA3'},solana:{symbol:'SOL',name:'Solana',decimals:9,color:'#647C68'}} as const;
const same=(a:NativeWalletAccountV1,b:NativeWalletAccountV1)=>a.chain===b.chain&&a.network===b.network&&a.networkId===b.networkId&&a.address===b.address&&a.path===b.path&&a.publicKey===b.publicKey;
/** Presentation only: a failed refresh retains its labelled last observation.
 * Send preparation always obtains a new authenticated quote from the backend. */
export function mergeNativeBalancesV25(previous:readonly NativeWalletAccountBalanceV1[],updates:readonly NativeWalletAccountBalanceV1[],accounts:readonly NativeWalletAccountV1[],at:number):NativeWalletAccountBalanceV1[]{
 const result:NativeWalletAccountBalanceV1[]=[];
 for(const account of accounts){
  const prior=previous.find(row=>same(row.account,account)),next=updates.find(row=>same(row.account,account));
  if(next?.status==='CONFIRMED'&&next.balance)result.push({...next,observedAt:at,stale:false});
  else if(next&&prior?.status==='CONFIRMED'&&prior.balance)result.push({...prior,stale:true,reason:next.reason});
  else if(next)result.push(next);
  else if(prior)result.push(prior);
 }
 return result;
}
export {fiatCentsV1} from '@lianum/mobile-protocol/wallet/valuation-v1';
import {nativeFiatAmountsV1} from '@lianum/mobile-protocol/wallet/valuation-v1';
export function formatFiatV1(cents:bigint|null,currency:DisplayCurrency){if(cents===null)return '—';const negative=cents<0n,value=negative?-cents:cents,whole=(value/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,','),fraction=(value%100n).toString().padStart(2,'0');return `${negative?'−':''}${currency==='USD'?'$':'€'}${whole}.${fraction}`;}
export function portfolioOverviewV1(accounts:readonly NativeWalletAccountV1[],balances:readonly NativeWalletAccountBalanceV1[],market:MarketSnapshot|null,currency:DisplayCurrency,network:'mainnet'|'testnet'='mainnet'){
 if(network!=='mainnet'&&network!=='testnet')throw Error('PORTFOLIO_NETWORK');
 const rows=accounts.filter(a=>a.network===network).map(account=>{const asset=portfolioAssets[account.chain],entry=balances.find(b=>same(b.account,account)),balance=entry?.status==='CONFIRMED'?entry.balance:null;const {total,available,reserved,occupied}=nativeFiatAmountsV1(balance,asset.decimals,asset.symbol,market,currency);
  return {account,asset,balance,total,available,reserved,occupied};});
 const complete=rows.length>0&&rows.every(row=>row.total!==null);const sum=(key:'total'|'available'|'reserved'|'occupied')=>complete?rows.reduce((s,row)=>s+row[key]!,0n):null;
 return {rows,complete,total:sum('total'),available:sum('available'),reserved:sum('reserved'),occupied:sum('occupied'),knownRows:rows.filter(row=>row.total!==null).length};
}
export function pendingTransfersV1(rows:readonly NativeWalletTransferV1[]){return rows.filter(row=>['SUBMITTED','PENDING','INCLUDED','UNKNOWN'].includes(row.status));}
