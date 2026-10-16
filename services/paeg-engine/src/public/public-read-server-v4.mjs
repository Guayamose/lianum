/** Serve captured original sources without reopening financial permissions. */
import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PUBLIC_OPERATOR_STATE_V4,readPrivateOperatorFileV4,publishOriginalPublicConnectionFileV4} from './public-operator-state-v4.mjs';

export async function openCapturedPublicReadServerV4(root,configuration,ingress,uniswapInput=null){
 const load=path=>import(pathToFileURL(join(root,path)).href);
 const [R,I,H,T]=await Promise.all([
  load('packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs'),
  load('packages/backend/src/operations/recovery/paged-source-read-recovery-issuer-v4.mjs'),
  load('packages/backend/src/api/mobile/device-paged-source-read-recovery-http-v4.mjs'),
  load('packages/backend/src/api/mobile/paged-remote-ingress-binding-v4.mjs')]);
 const transport=T.readOriginalPagedRemoteIngressBindingV4(ingress);
 let supervisor,mixedSupervisor,server,closed=false,closing;
 const issuers=[],flatIssuers=[],dispatchers=[],routes=new Map(),flatRoutes=new Map(),sockets=new Set();
 let flatModule;
 async function close(){return closing??=(async()=>{
  closed=true;
  const stopped=server?new Promise(resolve=>server.close(resolve)):Promise.resolve();
  for(const socket of sockets)socket.destroy();
  await Promise.allSettled(dispatchers.map(value=>value.close()));
  await stopped;
  const failures=[];
  for(const issuer of issuers)try{await I.closeOriginalPagedSourceReadRecoveryIssuerV4(issuer);}catch(error){failures.push(error);}
  for(const issuer of flatIssuers)try{await flatModule.closeOriginalPagedUniswapFlatReadV8(issuer);}catch(error){failures.push(error);}
  try{await (mixedSupervisor??supervisor)?.close();}catch(error){failures.push(error);}
  if(failures.length)throw new AggregateError(failures,'PAEG_PUBLIC_READ_CAPTURE_CLOSE_FAILED');
 })();}
 try{
  if(uniswapInput){
   const M=await load('packages/backend/src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs');
   mixedSupervisor=await M.openOriginalPagedPublicUniswapReadRecoverySupervisorV6({directory:uniswapInput.parent.supervisorDirectory,password:configuration.journal.password});supervisor=mixedSupervisor.parent;
  }else supervisor=await R.openOriginalPagedSourceReadRecoverySupervisorV4({directory:configuration.supervisorDirectory,password:configuration.journal.password});
  const mixedDescriptors=mixedSupervisor?await mixedSupervisor.sourceDescriptors():[],mixedPairings=new Set(mixedDescriptors.map(row=>row.pairingId));
  const descriptors=[...await supervisor.sourceDescriptors(),...mixedDescriptors];
  assert.ok(Array.isArray(descriptors)&&descriptors.length>=1,'PAEG_PUBLIC_READ_SOURCE_COUNT');
  const pairings=await supervisor.currentWalletPairings();
  assert.ok(Array.isArray(pairings)&&pairings.length>=1,'PAEG_PUBLIC_READ_CURRENT_WALLETS');
  const currentByDevice=new Map();
  for(const current of pairings){
   assert.deepEqual(Object.keys(current).sort(),['devicePublicKey','currentPairingId'].sort(),'PAEG_PUBLIC_READ_CURRENT_FIELDS');
   assert.ok(!currentByDevice.has(current.devicePublicKey),'PAEG_PUBLIC_READ_WALLET_DUPLICATE');
   const descriptor=descriptors.find(d=>d.pairingId===current.currentPairingId);
   assert.ok(descriptor&&descriptor.devicePublicKey===current.devicePublicKey,'PAEG_PUBLIC_READ_CURRENT_BINDING');currentByDevice.set(current.devicePublicKey,current.currentPairingId);
  }
  assert.ok(currentByDevice.has(configuration.devicePublicKey),'PAEG_PUBLIC_READ_HOST_IDENTITY');
  let phoneKey=null;
  if(currentByDevice.size>1){let bytes;try{bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'phone-source-request.json');const request=JSON.parse(bytes.toString('utf8'));assert.equal(request.journalPath,join(PUBLIC_OPERATOR_STATE_V4,'authority-phone','journal.vault'));assert.notEqual(request.devicePublicKey,configuration.devicePublicKey);phoneKey=request.devicePublicKey;assert.ok(currentByDevice.has(phoneKey),'PAEG_PUBLIC_READ_PHONE_IDENTITY');}finally{bytes?.fill(0);}}
  for(const descriptor of descriptors){
   assert.ok(currentByDevice.has(descriptor.devicePublicKey),'PAEG_PUBLIC_READ_UNREGISTERED_WALLET');
   assert.ok(descriptor.devicePublicKey===configuration.devicePublicKey||descriptor.devicePublicKey===phoneKey,'PAEG_PUBLIC_READ_UNCONFIGURED_WALLET');
   assert.equal(descriptor.origin,transport.origin,'PAEG_PUBLIC_READ_SOURCE_ORIGIN');
   assert.ok(!routes.has(descriptor.pairingId),'PAEG_PUBLIC_READ_PAIRING_DUPLICATE');
   const mixed=mixedPairings.has(descriptor.pairingId),sourceSupervisor=mixed?mixedSupervisor:supervisor;
   const issuer=await I.openOriginalPagedSourceReadRecoveryIssuerV4(await sourceSupervisor.issueSource(descriptor.pairingId),{journalPassword:mixed?uniswapInput.mixed.journal.password:configuration.journal.password});issuers.push(issuer);
   assert.deepEqual(I.readOriginalPagedSourceReadRecoveryIssuerDescriptorV4(issuer),descriptor,'PAEG_PUBLIC_READ_ORIGINAL_DESCRIPTOR');
   const dispatcher=H.createOriginalDevicePagedSourceReadRecoveryHttpV4(issuer);dispatchers.push(dispatcher);routes.set(descriptor.pairingId,dispatcher);
   const connection={format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:transport.publicCertificatePEM,certificateSHA256:transport.publicCertificateSHA256}};
   // The Original supervisor validates lineage and chooses its unique current
   // end. Historical pairings keep routes; array order never chooses a wallet.
   if(mixed||currentByDevice.get(descriptor.devicePublicKey)===descriptor.pairingId){const bytes=Buffer.from(JSON.stringify(connection)+'\n');try{await publishOriginalPublicConnectionFileV4(PUBLIC_OPERATOR_STATE_V4,bytes,mixed?'paired-uniswap-connection.json':descriptor.devicePublicKey===configuration.devicePublicKey?'paired-connection.json':'paired-phone-connection.json');}finally{bytes.fill(0);}}
  }
  if(mixedSupervisor){
   flatModule=await load('packages/backend/src/operations/recovery/paged-uniswap-flat-read-recovery-v8.mjs');
   const flatHttp=await load('packages/backend/src/api/mobile/device-paged-uniswap-flat-read-http-v8.mjs');
   const flatDescriptors=await mixedSupervisor.flatDescriptors();
   for(const descriptor of flatDescriptors){
    assert.ok(currentByDevice.has(descriptor.devicePublicKey),'PAEG_PUBLIC_FLAT_READ_UNREGISTERED_WALLET');assert.equal(descriptor.origin,transport.origin);assert.ok(!flatRoutes.has(descriptor.pairingId),'PAEG_PUBLIC_FLAT_READ_PAIRING_DUPLICATE');
    const issuer=await flatModule.openOriginalPagedUniswapFlatReadRecoveryV8(await mixedSupervisor.issueFlat(descriptor.pairingId),{journalPassword:uniswapInput.mixed.flatJournal.password});flatIssuers.push(issuer);
    assert.deepEqual(flatModule.readOriginalPagedUniswapFlatReadDescriptorV8(issuer),descriptor);
    const dispatcher=flatHttp.createOriginalDevicePagedUniswapFlatReadHttpV8(issuer);dispatchers.push(dispatcher);flatRoutes.set(descriptor.pairingId,dispatcher);
    if(flatDescriptors.length===1){const bytes=Buffer.from(JSON.stringify({format:'DEVICE_EXTERNAL_FLAT_CONNECTION_V1',descriptor,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:transport.publicCertificatePEM,certificateSHA256:transport.publicCertificateSHA256}})+'\n');try{await publishOriginalPublicConnectionFileV4(PUBLIC_OPERATOR_STATE_V4,bytes,'paired-uniswap-flat-connection.json');}finally{bytes.fill(0);}}
   }
  }
  server=createServer({...transport.privateTLS,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'},(request,response)=>{
   try{
    assert.ok(!closed,'PAEG_PUBLIC_READ_SERVER_CLOSED');T.readOriginalPagedRemoteIngressBindingV4(ingress);
    const flat=request.url?.startsWith('/v1/mobile/external-flat-share/'),flatPairing=request.headers['x-lianum-flat-pairing-id'];
    const dispatcher=flat?(flatPairing===undefined&&flatRoutes.size===1?flatRoutes.values().next().value:flatRoutes.get(flatPairing)):routes.get(request.headers['x-lianum-paged-pairing-id']);
    if(!dispatcher){response.writeHead(403,{'content-type':'application/json','cache-control':'no-store'});response.end('{"error":"PAGED_SOURCE_READ_RECOVERY_REJECTED"}');return;}
    void dispatcher.handler(request,response).catch(()=>response.destroy());
   }catch{response.destroy();}
  });
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  server.requestTimeout=20000;server.headersTimeout=15000;server.maxHeadersCount=32;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(transport.port,transport.host,resolve);});
  assert.equal(server.address().port,transport.port);
  return Object.freeze({profile:'ORIGINAL_PUBLIC_CAPTURED_READ_SERVER_V4',sources:routes.size,flatAccounts:flatRoutes.size,financialPermissionsReopened:false,close});
 }catch(error){try{await close();}catch{}throw error;}
}
