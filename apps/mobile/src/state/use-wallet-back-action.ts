import {useEffect,useRef} from 'react';
import {walletBackActionsV1} from './wallet-navigation-v1.mjs';
/** Register only the visible child. The root owns Android's system callback. */
export function useWalletBackAction(active:boolean,action:()=>boolean,priority=0){
 const current=useRef(action);current.current=action;
 useEffect(()=>{if(!active)return;const remove=walletBackActionsV1.register(()=>current.current(),priority);return()=>{remove();};},[active,priority]);
}
