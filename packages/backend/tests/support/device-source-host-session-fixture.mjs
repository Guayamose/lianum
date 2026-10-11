/** Full fixed host + actual mobile Vault/SDK; only a local public challenge
 * responder is synthetic. No account, graph producer or chain is created. */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,X509Certificate,createPrivateKey} from 'node:crypto';
import {createServer} from 'node:https';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import {openDeviceExternalFlatErc20HostV1} from '../../../../tests/integration/wallet/native/device-external-flat-erc20-host-vault-v1.mjs';
const methods=Object.freeze({installOriginalSourceGraphSdkV2:1,installOriginalSourceGraphSdkV3:2,installOriginalAaveSourceGraphSdkV3:2});
const mode=process.argv[2];assert.ok(Object.hasOwn(methods,mode));
const h=value=>createHash('sha256').update(value).digest('hex'),scratch=await mkdtemp(join(tmpdir(),'source-host-session-'));let host,server;
try{
 host=await openDeviceExternalFlatErc20HostV1(scratch);const configuration=host.originalSourceConfigurationV2();
 assert.equal(configuration.origin,host.origin);assert.equal(configuration.devicePublicKey,host.devicePublicKey);assert.equal(configuration.depositAmountAtomic,'500');
 const certificate=new X509Certificate(configuration.tls.certificate);assert.ok(certificate.checkPrivateKey(createPrivateKey(configuration.tls.privateKey)));assert.equal(certificate.checkHost('localhost'),'localhost');
 const descriptor=P.normalizeExternalFlatDescriptorV1({profile:P.DEVICE_EXTERNAL_FLAT_NOTE_V1,origin:host.origin,pairingId:h('source-pair'),devicePublicKey:host.devicePublicKey,lifetime:h('source-life'),poolTerms:Object.fromEntries(['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace'].map(name=>[name,h(name).slice(0,['pool','asset','hub'].includes(name)?40:64)])),assetMetadata:{kind:'ERC20',symbol:'SOURCE',decimals:6}});
 const target=P.normalizeExternalFlatDescriptorV1({...descriptor,profile:P.DEVICE_EXTERNAL_FLAT_SHARE_V1,pairingId:h('share-pair'),lifetime:h('share-life'),poolTerms:{...descriptor.poolTerms,pool:'23'.repeat(20),asset:'45'.repeat(20),assetIdentity:h('share-asset')}});
 let requests=0;
 server=createServer({cert:configuration.tls.certificate,key:configuration.tls.privateKey,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'},async(req,res)=>{
  try{assert.equal(req.url,'/v1/mobile/external-flat/challenges');assert.equal(req.method,'POST');assert.equal(req.headers.origin,host.origin);let body='';for await(const part of req)body+=part;assert.deepEqual(JSON.parse(body),{});requests++;
   const access=P.normalizeExternalFlatAccessV1({profile:descriptor.profile,action:'ACCESS',origin:descriptor.origin,pairingId:descriptor.pairingId,devicePublicKey:descriptor.devicePublicKey,challengeId:h('challenge-'+requests),nonce:h('nonce-'+requests),expiresAt:Date.now()+15000});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(access));
  }catch(error){res.destroy(error);}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(new URL(host.origin).port),'127.0.0.1',resolve);});
 const installed=host.installOriginalSourceSdkV2(descriptor,target);assert.deepEqual(installed.descriptor,descriptor);
 assert.throws(()=>host.resumeOriginalSourceGraphSdkV2(descriptor,target));
 let session=await host[mode]();assert.equal(Boolean(session.aaveClient),mode==='installOriginalAaveSourceGraphSdkV3');assert.equal(session.client,installed.client);assert.equal(Object.isFrozen(session),true);
 assert.throws(()=>host[mode]());const root=(await session.targetVault.summary()).rootId;
 for(let index=0;index<methods[mode];index++){
  const before=requests;assert.throws(()=>host.resumeOriginalSourceGraphSdkV2({...descriptor,devicePublicKey:'04'+'11'.repeat(64)},target));assert.throws(()=>host.resumeOriginalSourceGraphSdkV2(descriptor,{...target,pairingId:h('unpaired')}));assert.equal(requests,before);
  // A rejected rebind neither closes the existing SDK nor consumes a reopen.
  assert.equal((await session.client.challenge()).pairingId,descriptor.pairingId);assert.equal(requests,before+1);
  assert.deepEqual(host.originalSourceConfigurationForReopenV2(),configuration);
  const old=session;session=host.resumeOriginalSourceGraphSdkV2(structuredClone(descriptor),structuredClone(target));assert.equal(session.targetVault,old.targetVault);assert.equal((await session.targetVault.summary()).rootId,root);
  for(const key of ['client','targetClient','graphClient',...(old.aaveClient?['aaveClient']:[])]){assert.notEqual(session[key],old[key]);await assert.rejects(old[key].challenge());}
  assert.equal(requests,before+1);
 }
 const last=session,before=requests;assert.throws(()=>host.originalSourceConfigurationForReopenV2());assert.throws(()=>host.resumeOriginalSourceGraphSdkV2(descriptor,target));assert.equal(requests,before);
 assert.equal((await last.client.challenge()).pairingId,descriptor.pairingId);assert.equal(requests,before+1);assert.equal((await last.targetVault.summary()).rootId,root);
 assert.deepEqual(host.transport().requests,{challenges:requests});assert.deepEqual(host.transport().tlsVersions,['TLSv1.3']);
 const closed=await host.close();assert.equal(closed.closed,true);assert.equal(closed.ownedTlsSocketsRemaining,0);assert.equal(closed.service,null);for(const key of ['client','targetClient','graphClient',...(session.aaveClient?['aaveClient']:[])])await assert.rejects(session[key].challenge());
 assert.throws(()=>host.originalSourceConfigurationForReopenV2(),/DEVICE_EXTERNAL_FLAT_HOST_CLOSED/);assert.equal(requests,before+1);assert.deepEqual(host.remove(),{removed:true});
 process.stdout.write(JSON.stringify({mode,reopens:methods[mode],requests,closed:true})+'\n');
}finally{
 await host?.close();if(server)await new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});await rm(scratch,{recursive:true,force:true});
}
