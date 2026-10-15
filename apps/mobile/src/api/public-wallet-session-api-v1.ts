import {AppState} from 'react-native';
import {walletSessionStatusV1,signWalletSessionNativeRequestV1} from '../custody/wallet-session-v1.ts';
import {nativeWalletBodyHashV1} from '../../../../packages/crypto/src/native-wallet-auth-v1.mjs';
import {nativeWalletPublicConfigurationV1} from '../native-wallet/native-wallet-public-configuration-v1.ts';

export function publicWalletSessionOriginV1():string{
 const value=nativeWalletPublicConfigurationV1.origin;if(!value)throw Error('NATIVE_SERVICE_NOT_CONFIGURED');
 const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('NATIVE_SERVICE_CONFIGURATION');return url.origin;
}
function live(signal:AbortSignal,owner?:string):string{
 const session=walletSessionStatusV1();
 if(signal.aborted||!session.active||!session.publicKey||AppState.currentState==='background'||owner&&session.publicKey!==owner)throw Error('NATIVE_WALLET_LOCKED');return session.publicKey;
}
export async function readPublicWalletJsonV1(path:string,body:string|undefined,signal:AbortSignal):Promise<any>{
 const owner=live(signal),controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,20000);signal.addEventListener('abort',abort,{once:true});
 try{
  if(signal.aborted)abort();
  const response=await fetch(publicWalletSessionOriginV1()+path,{method:body===undefined?'GET':'POST',headers:{accept:'application/json',...(body!==undefined?{'content-type':'application/json'}:{})},body,signal:controller.signal,redirect:'error'});
  const raw=await response.text();live(signal,owner);if(raw.length>2000000)throw Error('NATIVE_SERVICE_RESPONSE');
  let data;try{data=JSON.parse(raw);}catch{throw Error('NATIVE_SERVICE_RESPONSE');}
  if(!response.ok)throw Error(typeof data.error==='string'&&/^[A-Z_]+$/.test(data.error)?data.error:'NATIVE_SERVICE_UNAVAILABLE');return data;
 }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
/** Read permissions use the unlocked identity. No financial authorization or
 * additional biometric is acquired here. A locked/changed session cancels it. */
export async function requestPublicWalletSessionV1(path:string,value:unknown,signal:AbortSignal):Promise<any>{
 const owner=live(signal),body=JSON.stringify(value),expected={origin:publicWalletSessionOriginV1(),path,bodySHA256:nativeWalletBodyHashV1(body)};
 const challenge=await readPublicWalletJsonV1('/v1/auth/challenge',JSON.stringify({...expected,devicePublicKey:owner}),signal);live(signal,owner);
 const signature=signWalletSessionNativeRequestV1(challenge,expected);
 const result=await readPublicWalletJsonV1(path,JSON.stringify({challenge,signature,body}),signal);live(signal,owner);return result;
}
