import {normalizeAgentContextV1} from '@lianum/mobile-protocol/agent/chat-v1';
export function createAgentBackendClient({url,token,fetchImpl=fetch}={}){
 if(!url&&!token)return null;const target=new URL(url);
 if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||target.pathname!=='/'||target.search||target.hash||target.username||target.password||typeof token!=='string'||token.length<32||/[\r\n]/.test(token))throw Error('NATIVE_AGENT_BACKEND_CONFIGURATION');
 return Object.freeze({async snapshot(ownerId,network,signal){
  const response=await fetchImpl(target.origin+'/snapshot',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({ownerId,network}),redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(30000),...(signal?[signal]:[])])});
  const text=await response.text();if(text.length>262144||!response.ok)throw Error('NATIVE_AGENT_BACKEND_UNAVAILABLE');const data=JSON.parse(text);
  if(data.profile!=='LIANUM_AGENT_BACKEND_SNAPSHOT_V1'||data.source!=='BACKEND_RPC'||data.financialPermission!==false||!Array.isArray(data.operations)||data.operations.length>32)throw Error('NATIVE_AGENT_BACKEND_RESPONSE');
  data.context=normalizeAgentContextV1(data.context);if(data.context.network!==network)throw Error('NATIVE_AGENT_BACKEND_NETWORK');return data;
 }});
}
