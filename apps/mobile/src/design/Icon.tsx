import Svg,{Path,Rect,Circle} from 'react-native-svg';
import {walletColors} from './tokens';

export type WalletIconName='chat'|'checks'|'more'|'agent'|'wallet'|'grid'|'swap'|'activity'|'settings'|'send'|'receive'|'plus'|'minus'|'shield'|'arrow'|'phone'|'close'|'mic'|'speaker';
export function WalletIcon({name,size=22,color=walletColors.text}:{name:WalletIconName;size?:number;color?:string}){
 return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
  {name==='chat'?<Path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>:null}
  {name==='checks'?<><Path d="m18 6-7 7-3-3M22 10l-7 7-3-3M2 12l3 3"/></>:null}
  {name==='more'?<><Circle cx="5" cy="12" r="1"/><Circle cx="12" cy="12" r="1"/><Circle cx="19" cy="12" r="1"/></>:null}
  {name==='agent'?<><Circle cx="12" cy="12" r="7"/><Path d="M12 2v3M12 19v3M2 12h3M19 12h3M9 10h.01M15 10h.01M9 14q3 2 6 0"/></>:null}
  {name==='wallet'?<><Rect x="4" y="5" width="16" height="15" rx="2"/><Path d="M5 5V3h12v2M20 10h-6v5h6"/><Circle cx="16" cy="12.5" r=".6"/></>:null}
  {name==='grid'?<><Rect x="4" y="4" width="6" height="6" rx=".5"/><Rect x="14" y="4" width="6" height="6" rx=".5"/><Rect x="4" y="14" width="6" height="6" rx=".5"/><Rect x="14" y="14" width="6" height="6" rx=".5"/></>:null}
  {name==='swap'?<Path d="M4 8h16l-4-4M20 16H4l4 4"/>:null}
  {name==='activity'?<><Circle cx="12" cy="12" r="8"/><Path d="M12 7v5l3 2"/></>:null}
  {name==='settings'?<><Path d="M4 6h16M4 12h16M4 18h16"/><Rect x="8" y="4" width="3" height="4" rx="1" fill={walletColors.background}/><Rect x="14" y="10" width="3" height="4" rx="1" fill={walletColors.background}/><Rect x="7" y="16" width="3" height="4" rx="1" fill={walletColors.background}/></>:null}
  {name==='send'?<Path d="M6 18 18 6M7 6h11v11"/>:null}
  {name==='receive'?<Path d="M18 6 6 18M6 7v11h11"/>:null}
  {name==='plus'?<Path d="M5 12h14M12 5v14"/>:null}
  {name==='minus'?<Path d="M5 12h14"/>:null}
  {name==='shield'?<><Path d="M12 3 4 6v6c0 4 5 7 8 9 3-2 8-5 8-9V6Z"/><Path d="m8 12 3 3 5-6"/></>:null}
  {name==='phone'?<><Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.08 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.33 1.84.56 2.8.69A2 2 0 0 1 22 16.92Z"/></>:null}
  {name==='mic'?<><Rect x="9" y="3" width="6" height="12" rx="3"/><Path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></>:null}
  {name==='speaker'?<><Path d="M11 5 6 9H3v6h3l5 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></>:null}
  {name==='close'?<Path d="m6 6 12 12M18 6 6 18"/>:null}
  {name==='arrow'?<Path d="M4 12h16m-6-6 6 6-6 6"/>:null}
 </Svg>;
}
