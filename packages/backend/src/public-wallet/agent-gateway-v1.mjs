/** Private loopback hop after the public API verified the device's signed
 * one-use request. Identity and connection routing are never model arguments. */
export function createAgentGatewayV1({url,token}){
 const base=new URL(url);if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||base.username||base.password||base.pathname!=='/'||base.search||base.hash||typeof token!=='string'||token.length<32||/[\r\n]/.test(token))throw Error('NATIVE_AGENT_GATEWAY_CONFIGURATION');
 async function call(path,body,signal){
  const abort=new AbortController(),cancel=()=>abort.abort(),timer=setTimeout(cancel,10000);signal?.addEventListener('abort',cancel,{once:true});let reader;
  try{
   if(signal?.aborted)cancel();const response=await fetch(base.origin+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:abort.signal});
   reader=response.body?.getReader();if(!reader)throw Error();const chunks=[];let size=0;
   for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>2*1024*1024)throw Error();chunks.push(next.value);}
   const data=JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
   if(!response.ok)throw Error(typeof data.error==='string'&&/^NATIVE_AGENT_[A-Z_]+$/.test(data.error)?data.error:'NATIVE_AGENT_UNAVAILABLE');return data;
  }catch(error){if(/^NATIVE_AGENT_[A-Z_]+$/.test(error?.message??''))throw error;throw Error('NATIVE_AGENT_UNAVAILABLE');}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);try{await reader?.cancel();}catch{}reader?.releaseLock();}
 }
 async function *stream(identity,body,signal){
  const controller=new AbortController(),cancel=()=>controller.abort(),timer=setTimeout(cancel,18000);signal?.addEventListener('abort',cancel,{once:true});let reader;
  try{
   if(signal?.aborted)cancel();const response=await fetch(base.origin+'/stream',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({identity,path:'/v1/agent/stream',body}),redirect:'error',signal:controller.signal});
   if(!response.ok){const text=await response.text();if(text.length>4096)throw Error('NATIVE_AGENT_UNAVAILABLE');const data=JSON.parse(text);throw Error(/^NATIVE_AGENT_[A-Z_]+$/.test(data.error??'')?data.error:'NATIVE_AGENT_UNAVAILABLE');}if(!response.headers.get('content-type')?.startsWith('text/event-stream'))throw Error('NATIVE_AGENT_UNAVAILABLE');
   reader=response.body?.getReader();if(!reader)throw Error('NATIVE_AGENT_UNAVAILABLE');let size=0;
   for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>2*1024*1024)break;yield next.value;}
  }finally{clearTimeout(timer);cancel();signal?.removeEventListener('abort',cancel);try{await reader?.cancel();}catch{}reader?.releaseLock();}
 }
 return Object.freeze({stream,capabilities:signal=>call('/health',undefined,signal),dispatch:(identity,path,body,signal)=>call('/dispatch',{identity,path,body},signal)});
}
