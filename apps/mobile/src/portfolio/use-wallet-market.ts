import {useCallback,useEffect,useState} from 'react';
import {AppState} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {readMarketSnapshotV1,type MarketSnapshot,type DisplayCurrency} from './market-data-v1';
const preferenceKey='lianum.display.currency.v1';
export function useWalletMarketV1(active:boolean){
 const [currency,setCurrency]=useState<DisplayCurrency>('EUR'),[market,setMarket]=useState<MarketSnapshot|null>(null),[marketError,setMarketError]=useState(false);
 useEffect(()=>{let mounted=true;void SecureStore.getItemAsync(preferenceKey).then(value=>{if(mounted&&(value==='EUR'||value==='USD'))setCurrency(value);}).catch(()=>{});return()=>{mounted=false;};},[]);
 const chooseCurrency=useCallback((value:DisplayCurrency)=>{setCurrency(value);void SecureStore.setItemAsync(preferenceKey,value).catch(()=>{});},[]);
 useEffect(()=>{if(!active){setMarket(null);return;}let controller:AbortController|null=null;const update=()=>{if(controller||AppState.currentState==='background')return;controller=new AbortController();const own=controller;void readMarketSnapshotV1(own.signal).then(value=>{if(!own.signal.aborted){setMarket(value);setMarketError(false);}}).catch(()=>{if(!own.signal.aborted)setMarketError(true);}).finally(()=>{if(controller===own)controller=null;});};update();const timer=setInterval(update,60000),subscription=AppState.addEventListener('change',state=>{if(state==='active')update();else{controller?.abort();controller=null;}});return()=>{clearInterval(timer);subscription.remove();controller?.abort();};},[active]);
 return {currency,chooseCurrency,market,marketError};
}
