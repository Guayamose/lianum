/** Public ingress check. Metadata and unsigned ACCESS challenges only; no
 * wallet signature, proof, authorization, deposit, payment or redemption. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {request} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {createHash} from 'node:crypto';
import {normalizeCloudConnectionDirectoryV1} from '../../../packages/backend/src/public-wallet/connection-directory-v1.mjs';
import {normalizeExternalFlatAccessV1} from '../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import {normalizeDevicePagedNativePreparationV3,DEVICE_PAGED_GRAPH_OWNER_V3} from '../../../packages/mobile-protocol/src/device-paged-graph-v3.mjs';

assert.equal(process.argv.length,3);
const origin='https://api.lianum.oryontechnology.com',rows=normalizeCloudConnectionDirectoryV1(JSON.parse(await readFile(process.argv[2],'utf8')),origin);
assert.ok(rows.length>0);
function pinned(path,pin,body,pairingId,kind='paged'){
 return new Promise((resolve,reject)=>{
  const req=request(origin+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json','content-length':Buffer.byteLength(body),'origin':origin,...(pairingId===undefined?{}:{['x-lianum-'+kind+'-pairing-id']:pairingId})},timeout:20000,checkServerIdentity(host,cert){return checkServerIdentity(host,cert)??(createHash('sha256').update(cert.raw).digest('hex')===pin?undefined:Error('PUBLIC_TLS_PIN_MISMATCH'));}},response=>{
   const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>4194304)response.destroy(Error('PUBLIC_RESPONSE_BOUND'));else chunks.push(chunk);});response.on('error',reject);response.on('end',()=>{try{resolve({status:response.statusCode,body:response.statusCode===403?null:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch(error){reject(error);}});
  });req.on('timeout',()=>req.destroy(Error('PUBLIC_REQUEST_TIMEOUT')));req.on('error',reject);req.end(body);
 });
}
const checks=[],sourcePairings=new Set();let accessChallengesIssued=0,scopedAccessChallengesIssued=0,singleFlatDiscoveryValidated=false;
const flatConnections=rows.filter(row=>row.format==='DEVICE_EXTERNAL_FLAT_CONNECTION_V1');
async function graphMetadata(row,kind='WALLET'){
 const response=await pinned('/v1/mobile/paged-owner/graph/pairing',row.transport.certificateSHA256,'{}',row.descriptor.pairingId);
 assert.equal(response.status,200);assert.equal(response.body.profile,DEVICE_PAGED_GRAPH_OWNER_V3);assert.deepEqual(response.body.descriptor,row.descriptor);
 const preparation=normalizeDevicePagedNativePreparationV3(response.body.nativePreparation,row.descriptor);
 return {kind,identitySHA256:createHash('sha256').update(row.descriptor.devicePublicKey).digest('hex'),matchingDescriptor:true,nativePreparationValidated:true,networks:(preparation.networks??[]).map(n=>({family:n.family,asset:n.assetSymbol,networkId:n.networkId??null})),defi:(preparation.defi?.networks??[]).map(d=>d.protocol??d.family).filter(Boolean).concat(preparation.uniswap?['UNISWAP']:[]),publicTLSCertificatePinned:true};
}
for(const row of rows){
 if(row.format==='DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3')checks.push(await graphMetadata(row));
 else{
  const defi=row.format==='DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7',kind=defi?'defi':'flat',path='/v1/mobile/'+(defi?'sepolia-defi-shares':'external-flat-share')+'/challenges';
  const response=await pinned(path,row.transport.certificateSHA256,'{}',row.descriptor.pairingId,kind);assert.equal(response.status,200);
  const challenge=normalizeExternalFlatAccessV1(response.body);for(const field of ['profile','origin','pairingId','devicePublicKey'])assert.equal(challenge[field],row.descriptor[field]);assert.ok(challenge.expiresAt>Date.now());accessChallengesIssued++;scopedAccessChallengesIssued++;
  checks.push({kind:defi?row.protocol:'UNISWAP_TOKEN',identitySHA256:createHash('sha256').update(row.descriptor.devicePublicKey).digest('hex'),matchingAccessScope:true,publicTLSCertificatePinned:true});
  assert.equal((await pinned(path,row.transport.certificateSHA256,'{}','f'.repeat(64),kind)).status,403);
  const missingSelector=await pinned(path,row.transport.certificateSHA256,'{}',undefined,kind);
  // The Original flat dispatcher permits discovery of its sole unsigned
  // ACCESS challenge. A supplied selector must still match; DeFi and paged
  // routing always require an explicit selector. This grants no wallet access.
  if(!defi&&flatConnections.length===1){
   assert.equal(missingSelector.status,200);
   const discovered=normalizeExternalFlatAccessV1(missingSelector.body);
   for(const field of ['profile','origin','pairingId','devicePublicKey'])assert.equal(discovered[field],row.descriptor[field]);
   assert.ok(discovered.expiresAt>Date.now());singleFlatDiscoveryValidated=true;accessChallengesIssued++;
  }else assert.equal(missingSelector.status,403);
  if(defi&&row.paegSource&&!sourcePairings.has(row.paegSource.descriptor.pairingId)){sourcePairings.add(row.paegSource.descriptor.pairingId);checks.push(await graphMetadata({descriptor:row.paegSource.descriptor,transport:row.transport},'DEFI_PAEG_BUDGET'));}
 }
}

const pin=rows[0].transport.certificateSHA256,health=await pinned('/health',pin),unknown=await pinned('/v1/mobile/paged-owner/graph/pairing',pin,'{}','unknown-pairing');
const missing=await pinned('/v1/mobile/paged-owner/graph/pairing',pin,'{}');
assert.equal(health.status,200);assert.equal(health.body.ready,true);assert.equal(unknown.status,403);assert.equal(missing.status,403);
process.stdout.write(JSON.stringify({profile:'LIANUM_PUBLIC_ENGINE_ROUTING_CHECK_V1',checkedAt:new Date().toISOString(),connections:checks,health:health.body,unknownPairingRejected:true,missingPagedPairingRejected:true,missingDefiPairingRejected:true,singleFlatDiscoveryValidated,scopedAccessChallengesIssued,accessChallengesIssued,financialWrites:0},null,2)+'\n');
