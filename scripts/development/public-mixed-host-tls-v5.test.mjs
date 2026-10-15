/** Actual Node TLS and original mobile transport/SHARE SDK. The ephemeral
 * endpoint issues ACCESS data only; no wallet/proof/payment backend. */
import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {generateKeyPairSync,createHash,X509Certificate} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {openPublicThreeNetworkHostCustodyV4,publicThreeNetworkSdkUrlV4} from './public-three-network-host-custody-v4.mjs';
import * as E from '../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex'),run=promisify(execFile);
test('public mixed HOST uses pinned SHARE SDK challenge with body pairing and no PAGED scope leakage',{timeout:30000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lianum-mixed-host-tls-'));let host,server,transport,client;
 try{
  host=await openPublicThreeNetworkHostCustodyV4({directory});
  const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'});
  await writeFile(join(directory,'key.pem'),key,{mode:0o600});
  await run('/usr/bin/openssl',['req','-new','-x509','-key',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-addext','basicConstraints=critical,CA:FALSE'],{timeout:15000,maxBuffer:8192});
  const cert=await readFile(join(directory,'cert.pem'),'utf8'),pin=sha(new X509Certificate(cert).raw),requests=[];
  let descriptor;
  server=https.createServer({key,cert},async(req,res)=>{
   const parts=[];for await(const part of req)parts.push(part);const body=JSON.parse(Buffer.concat(parts));requests.push({path:req.url,headers:req.headers,body});
   const reply={profile:E.DEVICE_EXTERNAL_FLAT_SHARE_V1,action:'ACCESS',origin:descriptor.origin,pairingId:descriptor.pairingId,devicePublicKey:descriptor.devicePublicKey,challengeId:sha('HOST challenge'),nonce:sha('HOST nonce'),expiresAt:Date.now()+15000};
   const wire=JSON.stringify(reply);res.writeHead(200,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(wire)});res.end(wire);
  });server.listen(0,'127.0.0.1');await once(server,'listening');const origin='https://localhost:'+server.address().port;
  descriptor=E.normalizeExternalFlatDescriptorV1({profile:E.DEVICE_EXTERNAL_FLAT_SHARE_V1,origin,pairingId:sha('HOST share pairing'),devicePublicKey:'04'+'11'.repeat(64),lifetime:sha('HOST lifetime'),poolTerms:Object.fromEntries(['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace'].map(name=>[name,sha('HOST '+name).slice(0,['pool','asset','hub'].includes(name)?40:64)])),assetMetadata:{kind:'ERC20',symbol:'USDC',decimals:6}});
  const T=await import(publicThreeNetworkSdkUrlV4('api/device-paged-connection-transport-v3.ts')),R=await import(publicThreeNetworkSdkUrlV4('api/device-paged-uniswap-public-routing-v5.mjs')),SDK=await import(publicThreeNetworkSdkUrlV4('api/device-external-flat-note-api-v1.mjs'));
  await assert.rejects(()=>T.createDeviceExternalFlatPinnedTransportV1({descriptor,certificatePEM:cert,certificateSHA256:'00'.repeat(32)}));
  transport=await T.createDeviceExternalFlatPinnedTransportV1({descriptor,certificatePEM:cert,certificateSHA256:pin});
  client=SDK.createDeviceExternalFlatNoteApiV1({descriptor,fetchImpl:R.createDevicePagedPublicUniswapFetchV5(transport.fetchImpl,descriptor)});
  const access=await client.challenge();assert.equal(access.pairingId,descriptor.pairingId);assert.equal(requests.length,1);assert.equal(requests[0].path,'/v1/mobile/external-flat-share/challenges');assert.deepEqual(requests[0].body,{pairingId:descriptor.pairingId});assert.equal(requests[0].headers.accept,'application/json');assert.equal(requests[0].headers.origin,origin);assert.equal(requests[0].headers['content-type'],'application/json');assert.equal(requests[0].headers['x-lianum-paged-pairing-id'],undefined);
  await assert.rejects(()=>transport.fetchImpl(origin+'/v1/mobile/paged-owner/challenges',{method:'POST',headers:{Accept:'application/json',Origin:origin,'Content-Type':'application/json'},body:'{}'}),/MOBILE_PAGED_TLS_REQUEST/);
  await assert.rejects(()=>transport.fetchImpl(origin+'/v1/mobile/external-flat-share/challenges',{method:'POST',headers:{Accept:'application/json',Origin:origin,'Content-Type':'application/json','x-lianum-paged-pairing-id':'unrelated'},body:'{}'}),/MOBILE_PAGED_TLS_REQUEST/);
  assert.equal(requests.length,1,'scope rejection happens before network');
  await transport.close();await assert.rejects(()=>client.challenge());assert.equal(requests.length,1);
 }finally{await client?.close();await transport?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await host?.close();await rm(directory,{recursive:true,force:true});}
});
