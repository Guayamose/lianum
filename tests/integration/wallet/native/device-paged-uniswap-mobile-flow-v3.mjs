/** Actual mobile Vault, protected software PoP and SDK through the original
 * TLS D27 service. No proof/economic ports are replaced; no phone is claimed. */
import assert from 'node:assert/strict';
import {request} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {createHash,randomBytes,X509Certificate} from 'node:crypto';
import {dirname,join} from 'node:path';
import {realpath} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readOriginalPagedUniswapContextV3,prepareOriginalPagedUniswapSolverV3} from '@lianum/backend/providers/paged-uniswap-provider-v3';
import {readOriginalDeviceExternalFlatD27PreparationV3} from '@lianum/backend/accounts/authority/device-external-flat-note-authority-v1';
import {createOriginalDeviceExternalFlatTlsServerV1} from '@lianum/backend/api/mobile/device-external-flat-note-http-v1';
import {normalizeDevicePagedUniswapIntentV3} from '@lianum/mobile-protocol/device/paged-graph-v3';
import {externalFlatWipeV1} from '@lianum/mobile-protocol/device/source-note-v1';
import {assertOriginalPagedMixedBackendProcessV3} from './device-paged-mixed-backend-client-v3.mjs';
import {assertOriginalPagedMobileHostV3,retainOriginalPagedMobileUniswapCopyV3} from './device-paged-mobile-host-v3.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../../../..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sources=Object.freeze({vault:'custody/device-external-flat-note-vault-v1.ts',api:'api/device-external-flat-note-api-v1.mjs',key:'custody/key-store.ts'});
async function mobile(name){assert.ok(Object.hasOwn(sources,name));const path=fileURLToPath(new URL(pathToFileURL(join(root,'apps/mobile/src',sources[name]))));assert.equal(await realpath(path),path);return import(pathToFileURL(path).href);}
export async function prepareOriginalPagedMobileUniswapNodeV3(context,host,tls,managed=null){
 assert.ok(arguments.length===3||arguments.length===4);if(managed!==null){assert.deepEqual(Reflect.ownKeys(managed),['listenerManagedByOperator']);assert.equal(managed.listenerManagedByOperator,true);} assertOriginalPagedMobileHostV3(host);assert.deepEqual(Reflect.ownKeys(tls).sort(),['certificate','privateKey']);
 const original=readOriginalPagedUniswapContextV3(context);return prepareTarget(original,context,host,tls,managed,null);
}
export async function prepareOriginalPagedMobileUniswapNodeFromBackendV3(backend,host,tls){
 assert.equal(arguments.length,3);assertOriginalPagedMixedBackendProcessV3(backend);assertOriginalPagedMobileHostV3(host);const data=backend.data(),u=data.uniswap;assert.ok(u&&u.targetConnection&&u.template,'PAGED_MIXED_ORIGINAL_UNISWAP_PAIRING');assert.equal(u.template.maximumInput,'200');assert.equal(u.template.outputAmount,'100');
 return prepareTarget({targetDescriptor:u.targetConnection.descriptor},u,host,tls,{listenerManagedByOperator:true},backend);
}
async function prepareTarget(original,context,host,tls,managed,backend){
 const descriptor=original.targetDescriptor;assert.equal(descriptor.devicePublicKey,host.devicePublicKey);
 const [{createDeviceExternalFlatRoutedNoteVaultV1},{createDeviceExternalFlatNoteApiV1},key]=await Promise.all(['vault','api','key'].map(mobile));
 const {observeDeviceExternalFlatReceptionV1}=await import('../../../../apps/mobile/src/api/device-external-flat-reception-observer-v1.mjs');
 assert.equal(await key.readDevicePublicKey(),host.devicePublicKey);const certificate=new X509Certificate(tls.certificate);assert.equal(certificate.ca,false);const expectedPin=sha(certificate.raw),prefix='/v1/mobile/external-flat-share/',paths=new Set(['challenges','reviews','private-operations','operations','status'].map(path=>prefix+path));
 const listener=managed?null:await createOriginalDeviceExternalFlatTlsServerV1({account:original.targetAccount,tls,host:'127.0.0.1'}),controller=new AbortController(),active=new Set();let vault,client,closed=false,suspended=false,closing=null,prepared=null,submission=null,targetSubject=null;
 const fetchImpl=(url,init)=>{
  assert.equal(closed,false);assert.equal(typeof url,'string');const target=new URL(url);assert.equal(target.origin,descriptor.origin);assert.ok(paths.has(target.pathname)&&url===descriptor.origin+target.pathname);assert.equal(init.method,'POST');assert.deepEqual(init.headers,{Accept:'application/json',Origin:descriptor.origin,'Content-Type':'application/json'});assert.ok(Buffer.byteLength(init.body)<=16384);
  const work=new Promise((resolve,reject)=>{let tlsVerified=false;const req=request(target,{agent:false,ca:tls.certificate,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',method:'POST',headers:{...init.headers,'Content-Length':Buffer.byteLength(init.body)},signal:init.signal,checkServerIdentity(hostname,peer){const error=checkServerIdentity(hostname,peer);if(error)return error;if(!peer.raw||sha(peer.raw)!==expectedPin)return Error('PAGED_UNISWAP_EXACT_TLS_PIN');}},response=>{let count=0;const chunks=[];response.on('data',chunk=>{count+=chunk.length;if(count>65536){response.destroy(Error('PAGED_UNISWAP_REPLY_CAP'));return;}chunks.push(chunk);});response.once('error',error=>{chunks.forEach(b=>b.fill(0));reject(error);});response.once('aborted',()=>{chunks.forEach(b=>b.fill(0));reject(Error('PAGED_UNISWAP_REPLY_ABORTED'));});response.once('end',()=>{let body;try{assert.equal(tlsVerified,true,'PAGED_UNISWAP_TLS_HANDSHAKE_REQUIRED');body=Buffer.concat(chunks);const reply=new Response(Uint8Array.from(body),{status:response.statusCode,headers:response.headers});Object.defineProperty(reply,'url',{value:url});resolve(reply);}catch(error){reject(error);}finally{body?.fill(0);chunks.forEach(b=>b.fill(0));}});});req.once('socket',socket=>socket.once('secureConnect',()=>{try{assert.equal(socket.getProtocol(),'TLSv1.3');const peer=socket.getPeerCertificate(true);assert.ok(peer.raw&&sha(peer.raw)===expectedPin);tlsVerified=true;}catch(error){req.destroy(error);}}));req.once('error',reject);req.end(init.body);});active.add(work);work.finally(()=>active.delete(work)).catch(()=>{});return work;
 };
 async function close(){if(closing)return closing;closed=true;controller.abort();client?.close();closing=(async()=>{const results=await Promise.allSettled([...active,vault?.close(),listener?.close()]);externalFlatWipeV1(prepared?.witness);assert.ok(results.every(row=>row.status==='fulfilled'),'PAGED_UNISWAP_MOBILE_CLOSE_UNCONFIRMED');assert.equal(active.size,0);return{closed:true,originalMobileBodiesDrained:true};})();return closing;}
 async function suspend(){assert.equal(closed,false);assert.equal(active.size,0,'PAGED_UNISWAP_REQUEST_DRAIN');client?.close();await vault?.close();vault=null;client=null;suspended=true;return{drained:true};}
 async function reconnect(){assert.equal(closed,false);assert.equal(suspended,true);vault=await createDeviceExternalFlatRoutedNoteVaultV1(descriptor);client=createDeviceExternalFlatNoteApiV1({descriptor,fetchImpl});suspended=false;const status=await observeTarget();assert.ok(['PROVED','CONFIRMED'].includes(sameTarget(status).stage),'PAGED_UNISWAP_REOPEN_TARGET_UNRESOLVED');return status;}
 async function access(){const a=await client.challenge();return[a,await key.signDeviceExternalFlatPermissionV1(a,descriptor.origin,descriptor.pairingId,controller.signal)];}
 async function targetStatus(){assert.equal(closed,false);const[a,signature]=await access(),status=await client.status(a,signature);await vault.acceptStatus(status);return status;}
 function sameTarget(status){
  assert.ok(targetSubject,'PAGED_UNISWAP_ORIGINAL_D27_REQUIRED');assert.equal(status.jobs.length,1,'PAGED_UNISWAP_ORIGINAL_TARGET_JOBS');
  const row=status.jobs.find(value=>value.jobId===targetSubject.jobId);assert.ok(row&&row.mode==='deposit_intent','PAGED_UNISWAP_ORIGINAL_D27_REQUIRED');
  assert.deepEqual(row.descriptor,descriptor);assert.deepEqual(row.consentFields,targetSubject.consentFields,'PAGED_UNISWAP_ORIGINAL_D27_CHANGED');return row;
 }
 async function observeTarget(){
  const status=await targetStatus();if(targetSubject===null)return status;
  sameTarget(status);await vault.reconcileOriginalStatus(status);
  const result=await observeDeviceExternalFlatReceptionV1({descriptor,status,summary:await vault.summary(),vault,client,sign:value=>key.signDeviceExternalFlatPermissionV1(value,descriptor.origin,descriptor.pairingId,controller.signal),signal:controller.signal,assertCurrent(){assert.equal(closed,false);controller.signal.throwIfAborted();}});
  sameTarget(result.status);return result.status;
 }
 try{
  vault=await createDeviceExternalFlatRoutedNoteVaultV1(descriptor);client=createDeviceExternalFlatNoteApiV1({descriptor,fetchImpl});const initial=await observeTarget();assert.equal(initial.jobs.length,0);const validFrom=initial.observed.timestamp,validUntil=(BigInt(validFrom)+7200n).toString(),maximumInput='200',outputAmount='100',recipient=backend?context.template.recipient:original.runtime.accounts[1].slice(2);
  if(!backend)await prepareOriginalPagedUniswapSolverV3(context,maximumInput);prepared=await vault.prepareDeposit(descriptor,recipient,outputAmount,validFrom,validUntil);submission=await vault.beginSubmissionStorage('NOTE',prepared.draft,controller.signal);
  const[a,accessSignature]=await access(),consent=await client.review(a,accessSignature,prepared.draft);assert.equal(consent.action,'PROVE_D27');assert.equal(consent.privateProof.recipient.role,'owner');assert.equal(consent.privateProof.recipient.relation,'deposit_intent');const arm=await vault.bindSubmissionStorage(submission,consent);submission=null;
  const signature=await key.signDeviceExternalFlatPermissionV1(consent,descriptor.origin,descriptor.pairingId,controller.signal);await vault.consumeSubmissionArm(arm,consent);const accepted=await client.submit(consent,signature,prepared.witness);externalFlatWipeV1(prepared.witness);prepared=null;assert.equal(accepted.stage,'PROVED');await vault.accept(accepted);targetSubject={jobId:accepted.jobId,consentFields:structuredClone(accepted.consentFields)};
  const subject=backend?{jobId:accepted.jobId,rootId:accepted.consentFields.rootId,proofSHA256:accepted.consentFields.proofSHA256,statement:accepted.consentFields.statement}:await readOriginalDeviceExternalFlatD27PreparationV3(original.targetAccount,{runtime:original.runtime,system:original.system,poolIndex:1,deliveryObserver:original.observer});assert.equal(subject.jobId,accepted.jobId);assert.equal(subject.rootId,accepted.consentFields.rootId);assert.equal(subject.proofSHA256,accepted.consentFields.proofSHA256);
  const passphrase=randomBytes(32).toString('hex'),backup=await vault.exportBackup(passphrase,host.devicePublicKey,controller.signal),checkpoint=await vault.verifyBackupCopy(backup,passphrase,host.devicePublicKey,controller.signal);assert.equal(checkpoint.rootId,subject.rootId);assert.deepEqual(checkpoint,await vault.recoveryCheckpoint());
  const retained=retainOriginalPagedMobileUniswapCopyV3(host,descriptor,backup,passphrase),intent=normalizeDevicePagedUniswapIntentV3({kind:'UNISWAP_V3_EXACT_OUTPUT_SINGLE',depositJobId:subject.jobId,rootId:subject.rootId,outputCommitment:subject.statement.output,maximumInput,outputAmount,validFrom,validUntil,recipient});
  return Object.freeze({intent,configuration:context.configuration,targetDescriptor:descriptor,originalD27:{jobId:subject.jobId,rootId:subject.rootId,proofSHA256:subject.proofSHA256,originalMobileBodies:true,physicalPhone:false},custodyCopy:retained,observeTarget,suspend,reconnect,close});
 }catch(error){if(submission)try{vault.endSubmissionStorage(submission);}catch{}await close().catch(()=>{});throw error;}
}
