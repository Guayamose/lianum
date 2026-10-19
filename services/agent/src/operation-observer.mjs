import {request as httpsRequest} from 'node:https';
import {checkServerIdentity,rootCertificates} from 'node:tls';
import {createHash,X509Certificate} from 'node:crypto';
import {createDevicePagedAgentApiV4} from '@lianum/sdk/agent';

/** Only the finite, device-signed read SDK is available here. No financial
 * transport, mobile key or arbitrary model URL is accepted by this adapter. */
export function createAgentOperationObserver({origin,requestImpl=httpsRequest}={}){
 if(!origin)return null;const base=new URL(origin);if(base.protocol!=='https:'||base.origin!==origin||base.username||base.password)throw Error('NATIVE_AGENT_OPERATION_ORIGIN');
 return async({record,key,signal})=>{
  const connection=record.connection;if(connection.descriptor.origin!==origin)throw Error('NATIVE_AGENT_OPERATION_ORIGIN');
  const pin=new X509Certificate(connection.transport.certificatePEM);if(createHash('sha256').update(pin.raw).digest('hex')!==connection.transport.certificateSHA256)throw Error('NATIVE_AGENT_OPERATION_TLS_PIN');
  const fetchImpl=(url,options)=>new Promise((resolve,reject)=>{
   const target=new URL(url);if(target.origin!==origin||options.method!=='POST'||!['/v1/mobile/paged-owner/agent/challenges','/v1/mobile/paged-owner/agent/observations'].includes(target.pathname)||target.search||target.hash){reject(Error('NATIVE_AGENT_OPERATION_READ_ONLY'));return;}
   const controller=AbortSignal.any([AbortSignal.timeout(15000),options.signal,...(signal?[signal]:[])]),body=options.body;if(typeof body!=='string'||body.length>262144){reject(Error('NATIVE_AGENT_OPERATION_BOUND'));return;}
   const request=requestImpl(target,{method:'POST',headers:options.headers,signal:controller,ca:[...rootCertificates,connection.transport.certificatePEM],rejectUnauthorized:true,checkServerIdentity(host,cert){const hostname=checkServerIdentity(host,cert);if(hostname)return hostname;if(!cert.raw||createHash('sha256').update(cert.raw).digest('hex')!==connection.transport.certificateSHA256)return Error('NATIVE_AGENT_OPERATION_TLS_PIN');}},response=>{
    const chunks=[];let bytes=0;response.on('data',chunk=>{bytes+=chunk.length;if(bytes>262144)response.destroy(Error('NATIVE_AGENT_OPERATION_BOUND'));else chunks.push(chunk);});response.on('error',reject);response.on('end',()=>resolve({status:response.statusCode,text:async()=>Buffer.concat(chunks).toString('utf8')}));
   });request.on('error',reject);request.end(body);
  });
  const api=createDevicePagedAgentApiV4({descriptor:connection.descriptor,grant:record.readerGrant,agentKey:key,fetchImpl});try{return await api.observe();}finally{api.close();}
 };
}
