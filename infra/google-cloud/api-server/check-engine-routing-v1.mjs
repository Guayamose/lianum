/** Read-only public ingress check. No signer, proof, deposit or payment. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {request} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {createHash} from 'node:crypto';
import {normalizeCloudConnectionDirectoryV1} from '../../../packages/backend/src/public-wallet/connection-directory-v1.mjs';
import {normalizeDevicePagedNativePreparationV3,DEVICE_PAGED_GRAPH_OWNER_V3} from '../../../packages/mobile-protocol/src/device-paged-graph-v3.mjs';

assert.equal(process.argv.length,3);
const origin='https://api.lianum.oryontechnology.com',rows=normalizeCloudConnectionDirectoryV1(JSON.parse(await readFile(process.argv[2],'utf8')),origin);
assert.ok(rows.length>0);
function pinned(path,pin,body,pairingId){
 return new Promise((resolve,reject)=>{
  const req=request(origin+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json','x-lianum-paged-pairing-id':pairingId},timeout:20000,checkServerIdentity(host,cert){return checkServerIdentity(host,cert)??(createHash('sha256').update(cert.raw).digest('hex')===pin?undefined:Error('PUBLIC_TLS_PIN_MISMATCH'));}},response=>{
   const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>4194304)response.destroy(Error('PUBLIC_RESPONSE_BOUND'));else chunks.push(chunk);});response.on('error',reject);response.on('end',()=>{try{resolve({status:response.statusCode,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch(error){reject(error);}});
  });req.on('timeout',()=>req.destroy(Error('PUBLIC_REQUEST_TIMEOUT')));req.on('error',reject);req.end(body);
 });
}
const checks=[];
for(const row of rows){
 const response=await pinned('/v1/mobile/paged-owner/graph/pairing',row.transport.certificateSHA256,'{}',row.descriptor.pairingId);
 assert.equal(response.status,200);assert.equal(response.body.profile,DEVICE_PAGED_GRAPH_OWNER_V3);assert.deepEqual(response.body.descriptor,row.descriptor);
 const nativePreparation=normalizeDevicePagedNativePreparationV3(response.body.nativePreparation,row.descriptor);
 checks.push({identitySHA256:createHash('sha256').update(row.descriptor.devicePublicKey).digest('hex'),matchingDescriptor:true,nativePreparationValidated:!!nativePreparation,networks:(nativePreparation.networks??[]).map(n=>({family:n.family,asset:n.assetSymbol,networkId:n.networkId??null})),defi:nativePreparation.uniswap?['UNISWAP']:[],publicTLSCertificatePinned:true});
}
const pin=rows[0].transport.certificateSHA256,health=await pinned('/health',pin),unknown=await pinned('/v1/mobile/paged-owner/graph/pairing',pin,'{}','unknown-pairing');
const missing=await new Promise((resolve,reject)=>{const req=request(origin+'/v1/mobile/paged-owner/graph/pairing',{method:'POST',headers:{'content-type':'application/json'},timeout:20000},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});req.on('timeout',()=>req.destroy(Error('PUBLIC_REQUEST_TIMEOUT')));req.on('error',reject);req.end('{}');});
assert.equal(health.status,200);assert.equal(health.body.ready,true);assert.equal(unknown.status,403);assert.equal(missing,403);
process.stdout.write(JSON.stringify({profile:'LIANUM_PUBLIC_ENGINE_ROUTING_CHECK_V1',checkedAt:new Date().toISOString(),connections:checks,health:health.body,unknownPairingRejected:true,missingPairingRejected:true,financialWrites:0},null,2)+'\n');
