/** Serve captured original sources without reopening financial permissions. */
import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PUBLIC_OPERATOR_STATE_V4,publishOriginalPublicConnectionFileV4} from './public-operator-state-v4.mjs';

export async function openCapturedPublicReadServerV4(root,configuration,ingress){
 const load=path=>import(pathToFileURL(join(root,path)).href);
 const [R,I,H,T]=await Promise.all([
  load('packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs'),
  load('packages/backend/src/operations/recovery/paged-source-read-recovery-issuer-v4.mjs'),
  load('packages/backend/src/api/mobile/device-paged-source-read-recovery-http-v4.mjs'),
  load('packages/backend/src/api/mobile/paged-remote-ingress-binding-v4.mjs')]);
 const transport=T.readOriginalPagedRemoteIngressBindingV4(ingress);
 let supervisor,server,closed=false,closing;
 const issuers=[],dispatchers=[],routes=new Map(),sockets=new Set();
 async function close(){return closing??=(async()=>{
  closed=true;
  const stopped=server?new Promise(resolve=>server.close(resolve)):Promise.resolve();
  for(const socket of sockets)socket.destroy();
  await Promise.allSettled(dispatchers.map(value=>value.close()));
  await stopped;
  const failures=[];
  for(const issuer of issuers)try{await I.closeOriginalPagedSourceReadRecoveryIssuerV4(issuer);}catch(error){failures.push(error);}
  try{await supervisor?.close();}catch(error){failures.push(error);}
  if(failures.length)throw new AggregateError(failures,'PAEG_PUBLIC_READ_CAPTURE_CLOSE_FAILED');
 })();}
 try{
  supervisor=await R.openOriginalPagedSourceReadRecoverySupervisorV4({directory:configuration.supervisorDirectory,password:configuration.journal.password});
  const descriptors=await supervisor.sourceDescriptors();
  assert.ok(Array.isArray(descriptors)&&descriptors.length>=1&&descriptors.length<=2,'PAEG_PUBLIC_READ_SOURCE_COUNT');
  assert.equal(descriptors[0].devicePublicKey,configuration.devicePublicKey,'PAEG_PUBLIC_READ_HOST_IDENTITY');
  for(const [index,descriptor]of descriptors.entries()){
   assert.equal(descriptor.origin,transport.origin,'PAEG_PUBLIC_READ_SOURCE_ORIGIN');
   assert.ok(!routes.has(descriptor.pairingId),'PAEG_PUBLIC_READ_PAIRING_DUPLICATE');
   const issuer=await I.openOriginalPagedSourceReadRecoveryIssuerV4(await supervisor.issueSource(descriptor.pairingId),{journalPassword:configuration.journal.password});issuers.push(issuer);
   assert.deepEqual(I.readOriginalPagedSourceReadRecoveryIssuerDescriptorV4(issuer),descriptor,'PAEG_PUBLIC_READ_ORIGINAL_DESCRIPTOR');
   const dispatcher=H.createOriginalDevicePagedSourceReadRecoveryHttpV4(issuer);dispatchers.push(dispatcher);routes.set(descriptor.pairingId,dispatcher);
   const connection={format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:transport.publicCertificatePEM,certificateSHA256:transport.publicCertificateSHA256}};
   const bytes=Buffer.from(JSON.stringify(connection)+'\n');
   try{await publishOriginalPublicConnectionFileV4(PUBLIC_OPERATOR_STATE_V4,bytes,index===0?'paired-connection.json':'paired-phone-connection.json');}finally{bytes.fill(0);}
  }
  server=createServer({...transport.privateTLS,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'},(request,response)=>{
   try{
    assert.ok(!closed,'PAEG_PUBLIC_READ_SERVER_CLOSED');T.readOriginalPagedRemoteIngressBindingV4(ingress);
    const dispatcher=routes.get(request.headers['x-lianum-paged-pairing-id']);
    if(!dispatcher){response.writeHead(403,{'content-type':'application/json','cache-control':'no-store'});response.end('{"error":"PAGED_SOURCE_READ_RECOVERY_REJECTED"}');return;}
    void dispatcher.handler(request,response).catch(()=>response.destroy());
   }catch{response.destroy();}
  });
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  server.requestTimeout=20000;server.headersTimeout=15000;server.maxHeadersCount=32;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(transport.port,transport.host,resolve);});
  assert.equal(server.address().port,transport.port);
  return Object.freeze({profile:'ORIGINAL_PUBLIC_CAPTURED_READ_SERVER_V4',sources:routes.size,financialPermissionsReopened:false,close});
 }catch(error){try{await close();}catch{}throw error;}
}
