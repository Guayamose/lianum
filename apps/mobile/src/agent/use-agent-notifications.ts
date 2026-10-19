import {useEffect,useRef,useState} from 'react';
import {AppState,Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import {requestPublicWalletSessionV1} from '../api/public-wallet-session-api-v1';
let viewingAgent=false;
Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:!viewingAgent,shouldShowList:!viewingAgent,shouldPlaySound:!viewingAgent,shouldSetBadge:false})});
const channel=async()=>{if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('lianum-agent',{name:"Your agent",importance:Notifications.AndroidImportance.HIGH,lockscreenVisibility:Notifications.AndroidNotificationVisibility.PRIVATE,sound:'default'});};
export function useAgentNotificationRoute(onOpen:()=>void){
 const open=useRef(onOpen);open.current=onOpen;
 useEffect(()=>{let closed=false;const receive=(response:Notifications.NotificationResponse|null)=>{if(closed||response?.notification.request.content.data?.route!=='agent')return;open.current();void Notifications.clearLastNotificationResponseAsync().catch(()=>{});};void Notifications.getLastNotificationResponseAsync().then(receive).catch(()=>{});const listener=Notifications.addNotificationResponseReceivedListener(receive);return()=>{closed=true;listener.remove();};},[]);
}
export function useAgentNotifications(active:boolean,configured:boolean,registered:boolean,onRefresh:()=>void){
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),enabled=useRef(registered);enabled.current=registered;const refresh=useRef(onRefresh);refresh.current=onRefresh;
 useEffect(()=>{if(!active)return;let closed=false;
  const presence=()=>{const visible=AppState.currentState==='active';viewingAgent=visible;void requestPublicWalletSessionV1('/v1/agent/presence',{visible},AbortSignal.timeout(4000)).catch(()=>{});};presence();const timer=setInterval(presence,15000),listener=AppState.addEventListener('change',presence);
  const token=Notifications.addPushTokenListener(value=>{if(!closed&&enabled.current&&Platform.OS==='android'&&typeof value.data==='string')void requestPublicWalletSessionV1('/v1/agent/push',{enabled:true,token:value.data},AbortSignal.timeout(7000)).catch(()=>{});});
  if(configured&&registered)void(async()=>{try{await channel();const permission=await Notifications.getPermissionsAsync();if(closed)return;if(!permission.granted){await requestPublicWalletSessionV1('/v1/agent/push',{enabled:false},AbortSignal.timeout(7000));refresh.current();return;}const native=await Notifications.getDevicePushTokenAsync();if(!closed&&typeof native.data==='string')await requestPublicWalletSessionV1('/v1/agent/push',{enabled:true,token:native.data},AbortSignal.timeout(7000));}catch{ /* Retain the existing registration until a confirmed change. */ }})();
  return()=>{closed=true;clearInterval(timer);listener.remove();token.remove();viewingAgent=false;void requestPublicWalletSessionV1('/v1/agent/presence',{visible:false},AbortSignal.timeout(3000)).catch(()=>{});};
 },[active,configured,registered]);
 async function toggle(){if(busy||!configured||!active)return;setBusy(true);setError(null);try{if(registered)await requestPublicWalletSessionV1('/v1/agent/push',{enabled:false},AbortSignal.timeout(7000));else{await channel();const permission=await Notifications.requestPermissionsAsync();if(!permission.granted){setError("Android does not allow Lianum notifications. You can activate them in your phone settings.");return;}const native=await Notifications.getDevicePushTokenAsync();if(Platform.OS!=='android'||typeof native.data!=='string')throw Error();await requestPublicWalletSessionV1('/v1/agent/push',{enabled:true,token:native.data},AbortSignal.timeout(7000));}refresh.current();}catch{setError("The change of notifications could not be confirmed. You can check again.");}finally{setBusy(false);}}
 return {busy,error,toggle};
}
