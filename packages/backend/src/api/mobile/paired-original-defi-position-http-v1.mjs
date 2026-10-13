/** TLS-only finite READ routes. Infrastructure certificate material is never
 * note custody; the original reader remains the sole admission authority. */
import {createServer} from 'node:https';
import {createPrivateKey,X509Certificate,createHash} from 'node:crypto';
import {types} from 'node:util';
import {isIP} from 'node:net';
import {assertPairedOriginalDefiPositionReaderV1} from './paired-original-defi-position-reader-v1.mjs';
const listeners=new WeakSet(),MAX_BODY=8192,MAX_REPLY=65536;
const fail=()=>{throw Error('DEVICE_DEFI_TLS_CONFIGURATION');};
function exact(v,keys){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value')))fail();}
function reply(response,status,value){if(response.destroyed||response.writableEnded)return;let bytes=Buffer.from(JSON.stringify(value));if(bytes.length>MAX_REPLY){status=403;bytes=Buffer.from('{"error":"REQUEST_REJECTED"}');}
 response.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':bytes.length,'cache-control':'no-store','connection':'close','x-content-type-options':'nosniff'});response.end(bytes);}
async function body(request){if(request.headers['content-type']!=='application/json'||request.headers['content-encoding']!==undefined||request.headers['transfer-encoding']!==undefined)fail();
 const length=request.headers['content-length'];if(typeof length!=='string'||/^(0|[1-9][0-9]{0,4})$/.exec(length)?.[0]!==length||Number(length)<2||Number(length)>MAX_BODY)fail();
 const parts=[];let count=0,bytes;try{for await(const part of request){parts.push(part);count+=part.length;if(count>Number(length)||count>MAX_BODY)fail();}if(count!==Number(length))fail();bytes=Buffer.concat(parts);return JSON.parse(bytes.toString('utf8'));}finally{bytes?.fill(0);parts.forEach(p=>p.fill(0));}}
export async function createPairedOriginalDefiPositionTlsServerV1(input){
 if(arguments.length!==1)fail();const keys=input&&!types.isProxy(input)&&Object.hasOwn(input,'host')?['reader','tls','host']:['reader','tls'];exact(input,keys);exact(input.tls,['certificate','privateKey']);
 const reader=input.reader,descriptor=assertPairedOriginalDefiPositionReaderV1(reader),origin=new URL(descriptor.origin),host=input.host??'127.0.0.1',hostname=origin.hostname.replace(/^\[|\]$/g,'');
 if(!['127.0.0.1','0.0.0.0'].includes(host)||listeners.has(reader)||typeof input.tls.certificate!=='string'||Buffer.byteLength(input.tls.certificate)>65536||typeof input.tls.privateKey!=='string'||Buffer.byteLength(input.tls.privateKey)>16384)fail();
 let certificate;try{certificate=new X509Certificate(input.tls.certificate);const key=createPrivateKey(input.tls.privateKey);if(certificate.ca||!certificate.checkPrivateKey(key)||(isIP(hostname)?certificate.checkIP(hostname)!==hostname:certificate.checkHost(hostname,{subject:'never',wildcards:false})!==hostname))fail();}catch{fail();}
 const current=()=>{const now=Date.now();if(now<certificate.validFromDate.getTime()||now>=certificate.validToDate.getTime())fail();};current();
 const publicCertificatePEM=input.tls.certificate,privateKey=Buffer.from(input.tls.privateKey),running=new Set(),sockets=new Set();let closed=false,closing,server;
 const routes=Object.freeze({'/v1/mobile/defi-positions/challenges':'challenge','/v1/mobile/defi-positions/reviews':'openReview','/v1/mobile/defi-positions/observations':'read'});
 listeners.add(reader);
 try{server=createServer({cert:input.tls.certificate,key:privateKey,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',ALPNProtocols:['http/1.1'],maxHeaderSize:8192,handshakeTimeout:2000},(request,response)=>{
  const work=(async()=>{if(closed)fail();current();if(request.socket.encrypted!==true||request.headers.host!==origin.host||request.headers.origin!==descriptor.origin||request.method!=='POST'||!Object.hasOwn(routes,request.url))fail();
   const value=await body(request);if(closed)fail();assertPairedOriginalDefiPositionReaderV1(reader);
   if(routes[request.url]==='challenge'){exact(value,[]);return reader.challenge();}return reader[routes[request.url]](value);})();
  running.add(work);work.finally(()=>running.delete(work)).catch(()=>{});let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('DEVICE_DEFI_HTTP_TIMEOUT')),15000);timer.unref();});
  Promise.race([work,timeout]).then(v=>reply(response,200,v),()=>reply(response,closed?503:403,{error:closed?'DISCONNECTED':'REQUEST_REJECTED'})).finally(()=>clearTimeout(timer)).catch(()=>{});
 });}catch(error){listeners.delete(reader);reader.close();throw error;}finally{privateKey.fill(0);}
 server.headersTimeout=2000;server.requestTimeout=15000;server.keepAliveTimeout=1;server.maxRequestsPerSocket=1;server.maxConnections=4;
 const track=socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));};server.on('connection',track);server.on('secureConnection',track);server.on('tlsClientError',(_error,socket)=>socket.destroy());
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(origin.port||443),host,()=>{server.off('error',reject);resolve();});});}
 catch(error){closed=true;reader.close();listeners.delete(reader);const ownedSockets=[...sockets],drain=Promise.all(ownedSockets.map(socket=>new Promise(resolve=>socket.once('close',resolve))));for(const socket of ownedSockets)socket.destroy();await Promise.all([drain,new Promise(resolve=>server.close(()=>resolve()))]);throw error;}
 const publicConnection=Object.freeze({format:'DEVICE_DEFI_POSITIONS_CONNECTION_V1',descriptor,transport:Object.freeze({type:'ANDROID_PINNED_TLS_V1',certificatePEM:publicCertificatePEM,certificateSHA256:createHash('sha256').update(certificate.raw).digest('hex')})});
 return Object.freeze({descriptor,url:descriptor.origin,publicConnection,
  close(){if(arguments.length!==0)fail();if(closing)return closing;closed=true;reader.close();const admitted=[...running];
   const ownedSockets=[...sockets],socketDrain=Promise.all(ownedSockets.map(socket=>new Promise(resolve=>socket.once('close',resolve))));const network=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));for(const socket of ownedSockets)socket.destroy();
   closing=(async()=>{const results=await Promise.allSettled([...admitted,network,socketDrain]);await reader.idle();if(results.slice(admitted.length).some(r=>r.status==='rejected')||sockets.size||running.size)throw Error('DEVICE_DEFI_TLS_CLOSE_UNCONFIRMED');listeners.delete(reader);
    return{closed:true,ownedSocketsRemaining:0,originalReadsInFlight:0,retainedOriginalCustody:true};})();return closing;},
 });
}
