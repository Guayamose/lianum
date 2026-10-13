import {randomUUID} from 'node:crypto';
import {need,fail,signalCurrent} from './common-v1.mjs';
const LIMIT=8388608;
async function request(endpoint,{method='GET',body,signal,text=false,missing=false}={}){
 signalCurrent(signal);const abort=new AbortController(),onAbort=()=>abort.abort();signal?.addEventListener('abort',onAbort,{once:true});const timer=setTimeout(()=>abort.abort(),15000);let reply;
 try{
  reply=await fetch(endpoint,{method,body,signal:abort.signal,redirect:'error',headers:{Accept:text?'text/plain':'application/json',...(body!==undefined?{'Content-Type':text?'text/plain':'application/json'}:{})}});
  if(missing&&reply.status===404){await reply.body?.cancel();return null;}
  need(reply.status===200,'HTTP_STATUS');const length=reply.headers.get('content-length');if(length!==null)need(/^[0-9]+$/.test(length)&&BigInt(length)<=BigInt(LIMIT),'RESPONSE_BOUND');
  const reader=reply.body?.getReader();need(reader,'RESPONSE');const chunks=[];let bytes=0;try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;need(bytes<=LIMIT,'RESPONSE_BOUND');chunks.push(r.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  signalCurrent(signal);const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes));if(text)return raw.trim();return JSON.parse(raw);
 }catch(error){if(/^NATIVE_WALLET_[A-Z_]+$/.test(error?.code??''))throw error;fail(signal?.aborted?'CANCELLED':abort.signal.aborted?'HTTP_TIMEOUT':'HTTP_FAILED');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
}
export function nativeRpcV1(endpoint){return async(method,params=[],signal)=>{const id=randomUUID(),result=await request(endpoint,{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal});need(result?.jsonrpc==='2.0'&&result.id===id&&Object.hasOwn(result,'result')&&!Object.hasOwn(result,'error'),'RPC_FAILED');return result.result;};}
export function nativeEsploraV1(endpoint){const base=endpoint.replace(/\/$/,'');return(path,options)=>{need(typeof path==='string'&&/^\/[a-zA-Z0-9/_:.-]+$/.test(path)&&path.length<=300,'HTTP_PATH');return request(base+path,options);};}
