import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash,timingSafeEqual} from 'node:crypto';
const digest=text=>createHash('sha256').update(text).digest();
export function createAgentHttpServer({runtime,token}){
 if(typeof token!=='string'||token.length<32||token.length>256||/[\r\n]/.test(token))throw Error('NATIVE_AGENT_GATEWAY_CONFIGURATION');
 const key=digest('Bearer '+token),active=new Set();let closing=false;
 const send=(response,status,body)=>{if(response.headersSent){response.end();return;}if(!response.destroyed&&!response.writableEnded){response.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});response.end(JSON.stringify(body));}};
 const server=createServer((request,response)=>{
  const work=(async()=>{
   try{
    if(closing){send(response,503,{error:'NATIVE_AGENT_CLOSED'});return;}
    if(!timingSafeEqual(key,digest(typeof request.headers.authorization==='string'?request.headers.authorization:''))){send(response,403,{error:'NATIVE_AGENT_AUTH_REQUIRED'});request.resume();return;}
    if(request.method==='GET'&&request.url==='/health'){send(response,200,runtime.capabilities());return;}
    if(request.method!=='POST'||!['/dispatch','/stream'].includes(request.url)){send(response,404,{error:'NATIVE_AGENT_ROUTE_NOT_FOUND'});request.resume();return;}
    if(active.size>16){send(response,429,{error:'NATIVE_AGENT_CAPACITY'});request.resume();return;}
    if(!/^application\/json(?:;.*)?$/i.test(request.headers['content-type']??''))throw Error('NATIVE_AGENT_DATA');
    const chunks=[];let bytes=0;
    for await(const chunk of request){bytes+=chunk.length;if(bytes>262144){send(response,413,{error:'NATIVE_AGENT_BODY_LIMIT'});request.destroy();return;}chunks.push(chunk);}
    const envelope=JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'));
    if(!envelope||Object.keys(envelope).sort().join(',')!=='body,identity,path')throw Error('NATIVE_AGENT_DATA');
    if(request.url==='/stream'){
     if(envelope.path!=='/v1/agent/stream')throw Error('NATIVE_AGENT_DATA');
     const controller=new AbortController(),cancel=()=>controller.abort();response.once('close',cancel);
     try{for await(const state of runtime.stream(envelope.identity,envelope.body,controller.signal)){
      if(controller.signal.aborted||response.destroyed)break;
      if(!response.headersSent){response.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-accel-buffering':'no'});response.flushHeaders();}
      if(!response.write('data: '+JSON.stringify(state)+'\n\n'))await once(response,'drain',{signal:controller.signal});
     }if(!response.destroyed)response.end();}finally{cancel();response.removeListener('close',cancel);}return;
    }
    send(response,200,await runtime.dispatch(envelope.identity,envelope.path,envelope.body));
   }catch(error){const code=typeof error?.message==='string'&&/^NATIVE_AGENT_[A-Z_]+$/.test(error.message)?error.message:'NATIVE_AGENT_DATA';send(response,code.includes('AUTH_')?403:code.includes('NOT_CONFIGURED')?503:code.includes('CAPACITY')?429:400,{error:code});}
  })();active.add(work);void work.finally(()=>active.delete(work));
 });
 server.requestTimeout=10000;server.headersTimeout=5000;server.maxHeadersCount=16;
 return {
  async listen({host='127.0.0.1',port=8790}={}){if(host!=='127.0.0.1')throw Error('NATIVE_AGENT_LOOPBACK_REQUIRED');await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);resolve();});});return server.address();},
  async close(){closing=true;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await Promise.allSettled([...active]);},
 };
}
