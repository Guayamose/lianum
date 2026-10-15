/** Actual assigned private interface, TLS certificate and Original ingress
 * owner. ACCESS-only endpoint, no proof/contract/financial acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {networkInterfaces} from 'node:os';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {openPublicThreeNetworkHostCustodyV4,publicThreeNetworkSdkUrlV4,bindOriginalPublicThreeNetworkHostIngressV5} from './public-three-network-host-custody-v4.mjs';
import {createOriginalPagedRemoteIngressBindingV4,readOriginalPagedRemoteIngressBindingV4,closeOriginalPagedRemoteIngressBindingV4,PAGED_REMOTE_ORIGIN_V4,PAGED_REMOTE_PORT_V4} from '../../packages/backend/src/api/mobile/paged-remote-ingress-binding-v4.mjs';
import * as E from '../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex'),run=promisify(execFile);
test('HOST maps the unchanged public SDK origin to its Original private ingress without public DNS or copied grants',{timeout:30000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lianum-original-ingress-host-'));let host,server,transport,sourceTransport,client,ingress;
 try{
  const address=Object.values(networkInterfaces()).flat().find(row=>row?.family==='IPv4'&&!row.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(row.address))?.address;
  assert.ok(address,'HOST_ASSIGNED_PRIVATE_INTERFACE_REQUIRED');
  host=await openPublicThreeNetworkHostCustodyV4({directory});
  const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'});
  await writeFile(join(directory,'key.pem'),key,{mode:0o600});
  await run('/usr/bin/openssl',['req','-new','-x509','-key',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=api.lianum.oryontechnology.com','-addext','subjectAltName=DNS:api.lianum.oryontechnology.com,IP:'+address,'-addext','basicConstraints=critical,CA:FALSE'],{timeout:15000,maxBuffer:8192});
  const cert=await readFile(join(directory,'cert.pem'),'utf8'),requests=[];
  ingress=createOriginalPagedRemoteIngressBindingV4({origin:PAGED_REMOTE_ORIGIN_V4,host:address,port:PAGED_REMOTE_PORT_V4,privateTLS:{key,cert},publicCertificatePEM:cert});
  const fixed=readOriginalPagedRemoteIngressBindingV4(ingress),descriptor=E.normalizeExternalFlatDescriptorV1({profile:E.DEVICE_EXTERNAL_FLAT_SHARE_V1,origin:fixed.origin,pairingId:sha('HOST original share'),devicePublicKey:'04'+'11'.repeat(64),lifetime:sha('HOST lifetime'),poolTerms:Object.fromEntries(['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace'].map(name=>[name,sha('HOST '+name).slice(0,['pool','asset','hub'].includes(name)?40:64)])),assetMetadata:{kind:'ERC20',symbol:'USDC',decimals:6}});
  server=https.createServer({key,cert},async(req,res)=>{
   const parts=[];for await(const part of req)parts.push(part);requests.push({path:req.url,headers:req.headers,body:JSON.parse(Buffer.concat(parts))});
   const wire=JSON.stringify({profile:E.DEVICE_EXTERNAL_FLAT_SHARE_V1,action:'ACCESS',origin:descriptor.origin,pairingId:descriptor.pairingId,devicePublicKey:descriptor.devicePublicKey,challengeId:sha('HOST original challenge'),nonce:sha('HOST original nonce'),expiresAt:Date.now()+15000});
   res.writeHead(200,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(wire)});res.end(wire);
  });server.listen(fixed.port,fixed.host);await once(server,'listening');
  assert.throws(()=>bindOriginalPublicThreeNetworkHostIngressV5(host,{...ingress}),/PAGED_REMOTE_ORIGINAL_BINDING/);
  const bound=bindOriginalPublicThreeNetworkHostIngressV5(host,ingress);assert.equal(bound.financialPermission,false);
  assert.throws(()=>bindOriginalPublicThreeNetworkHostIngressV5(host,ingress),/HOST_TLS_BIND_BEFORE_OPEN/);
  const T=await import(publicThreeNetworkSdkUrlV4('api/device-paged-connection-transport-v3.ts')),R=await import(publicThreeNetworkSdkUrlV4('api/device-paged-uniswap-public-routing-v5.mjs')),SDK=await import(publicThreeNetworkSdkUrlV4('api/device-external-flat-note-api-v1.mjs'));
  transport=await T.createDeviceExternalFlatPinnedTransportV1({descriptor,certificatePEM:cert,certificateSHA256:fixed.publicCertificateSHA256});
  client=SDK.createDeviceExternalFlatNoteApiV1({descriptor,fetchImpl:R.createDevicePagedPublicUniswapFetchV5(transport.fetchImpl,descriptor)});
  assert.equal((await client.challenge()).origin,PAGED_REMOTE_ORIGIN_V4);assert.equal(requests.length,1);assert.equal(requests[0].headers.host,new URL(PAGED_REMOTE_ORIGIN_V4).host);assert.equal(requests[0].headers.origin,PAGED_REMOTE_ORIGIN_V4);assert.deepEqual(requests[0].body,{pairingId:descriptor.pairingId});assert.equal(requests[0].headers['x-lianum-paged-pairing-id'],undefined);
  const Core=await import(publicThreeNetworkSdkUrlV4('api/device-paged-pinned-transport-core-v3.ts'));
  sourceTransport=await Core.createDevicePagedPinnedTransportCoreV3('PAGED',fixed.origin,Date.now()+60000,{certificatePEM:cert,certificateSHA256:fixed.publicCertificateSHA256},undefined,'HOST-original-source-pairing');
  const source=await sourceTransport.fetchImpl(fixed.origin+'/v1/mobile/paged-owner/challenges',{method:'POST',headers:{'Content-Type':'application/json','x-lianum-paged-pairing-id':'HOST-original-source-pairing'},body:JSON.stringify({action:'READ_STATE'})});
  assert.equal(source.status,200);await source.text();assert.equal(requests.length,2);assert.equal(requests[1].path,'/v1/mobile/paged-owner/challenges');assert.equal(requests[1].headers['x-lianum-paged-pairing-id'],'HOST-original-source-pairing');assert.equal(requests[1].headers.origin,undefined);assert.deepEqual(requests[1].body,{action:'READ_STATE'});
  closeOriginalPagedRemoteIngressBindingV4(ingress);ingress=null;
  await assert.rejects(()=>client.challenge());assert.equal(requests.length,2,'closed Original ingress cannot send a new request');
 }finally{await client?.close();await sourceTransport?.close();await transport?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(ingress)closeOriginalPagedRemoteIngressBindingV4(ingress);await host?.close();await rm(directory,{recursive:true,force:true});}
});
