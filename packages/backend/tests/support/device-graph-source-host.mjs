/** Complete SOURCE owner with fixed inert lower resource ports. Journal AEAD,
 * CAS, process birth, private requests and reopening all run in the owner. */
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import {readDeviceGraphSourceBodyV2} from '../../src/operations/recovery/source-journal/device-graph-source-codec-v2.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const urls={
 catalogue:'@lianum/proofs/catalog',
 release:new URL('../../src/operations/releases/native-value/native-value-dev-release-v5.mjs',import.meta.url),
 deployment:new URL('../../src/operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs',import.meta.url),
 service:new URL('../../src/operations/local/device-external-flat-source-graph-service-v1.mjs',import.meta.url),
 runtime:new URL('../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs',import.meta.url),
 recovery:new URL('../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs',import.meta.url),
 system:new URL('../../src/accounts/recovery/device-external-flat-ordered-observation-recovery-v1.mjs',import.meta.url),
 source:new URL('../../src/operations/recovery/device-external-flat-original-source-v2.mjs',import.meta.url),
};
export async function createDeviceGraphSourceHost({root,flat,identity,devicePublicKey,head:initialHead,allowReopen=false}){
 const original=Object.fromEntries(await Promise.all(Object.entries(urls).filter(([key])=>key!=='source').map(async([key,url])=>[key,await import(url)])));
 const boundaries=[];let api,head=structuredClone(initialHead),standby=false;
 const counts={runtimeSnapshots:0,openAttempts:0,effects:0,closed:0};
 const account=Object.freeze({}),targetAccount=Object.freeze({}),bridge=Object.freeze({}),execution=Object.freeze({}),registry=Object.freeze({});
 const marker='HOST_SYNTHETIC_PRIVATE_CREDENTIAL';
 const runtime=Object.freeze({async block(){return structuredClone(head);},async assertCanonical(value){assert.ok(BigInt(value.number)<=BigInt(head.number));},async close(){counts.closed++;return{closed:true};}});
 const service=Object.freeze({account,targetAccount,async close(){counts.closed++;return{closed:true};}});
 const authenticateSection=(token,section)=>{
  assert.throws(()=>api.originalDeviceGraphSourceSectionIdentityV2({...token},section));
  assert.deepEqual(api.originalDeviceGraphSourceSectionIdentityV2(token,section),identity);
  const value=api.consumeOriginalDeviceGraphSourceSectionV2(token,section);
  assert.throws(()=>api.consumeOriginalDeviceGraphSourceSectionV2(token,section));return value;
 };
 const checkpoint=async(value,token)=>{
  assert.equal(value,service);assert.throws(()=>api.consumeOriginalDeviceGraphSourceRequestV2(token,'service-checkpoint',{}));
  api.consumeOriginalDeviceGraphSourceRequestV2(token,'service-checkpoint',service);
  const q=api.originalDeviceGraphSourceProducerRequestsV2(token);assert.throws(()=>api.originalDeviceGraphSourceProducerRequestsV2(token));
  for(const[name,resource,kind]of [['account',account,'account-checkpoint'],['targetAccount',targetAccount,'account-checkpoint'],['bridge',bridge,'bridge-checkpoint'],['execution',execution,'execution-checkpoint']]){
   assert.throws(()=>api.consumeOriginalDeviceGraphSourceRequestV2({...q[name]},kind,resource));assert.throws(()=>api.consumeOriginalDeviceGraphSourceRequestV2(q[name],kind,{}));api.consumeOriginalDeviceGraphSourceRequestV2(q[name],kind,resource);assert.throws(()=>api.consumeOriginalDeviceGraphSourceRequestV2(q[name],kind,resource));
  }
  return standby?null:{head:structuredClone(head),sections:{system:{schema:'HOST_INERT_SYSTEM',credential:marker},deviceAccount:{schema:'HOST_INERT_ACTORS',sameOriginalJobs:true,descriptor:{devicePublicKey},targetDescriptor:{devicePublicKey}}}};
 };
 const replacements={
  catalogue:{ROOT:root,FLAT:flat},
  release:{NATIVE_VALUE_DEV_RELEASE_V5:{...original.release.NATIVE_VALUE_DEV_RELEASE_V5,hostSourceClosureSHA256:identity.sourceSHA256}},
  deployment:{loadNativeValueDevDeploymentArtifactsV5:async()=>{}},
  service:{
   async originalDeviceExternalFlatGraphSourceBirthV2(value){assert.equal(value,service,'HOST_ORIGINAL_SERVICE_ONLY');return{runtime,registry,account,targetAccount,bridge,execution,identity,devicePublicKey,protocol:'METAMORPHO_PRIVATE_SHARE_MINT_V1'};},
   checkpointOriginalDeviceExternalFlatGraphSourceV2:checkpoint,checkpointOriginalDeviceExternalFlatGraphObservationSourceV2:checkpoint,
   async reopenOriginalDeviceExternalFlatGraphServiceSectionV1({runtime:actual,systemContext,attemptToken}){assert.equal(actual,runtime);assert.deepEqual(systemContext,{runtime,originalSystem:true});const saved=authenticateSection(attemptToken,'deviceAccount');assert.equal(saved.sameOriginalJobs,true);return service;},
   readOriginalDeviceGraphSourceObservationResourcesV2(value,token){assert.equal(value,service);api.consumeOriginalDeviceGraphSourceRequestV2(token,'observation-resources',service);return{bridge,execution};},
   wrapOriginalDeviceGraphSourceObservationV2(value,token,close){assert.equal(value,service);api.consumeOriginalDeviceGraphSourceRequestV2(token,'service-wrap',service);return Object.freeze({...service,close});},
  },
  runtime:{
   assertOwnedDeviceExternalFlatSourceReceiverV2(value){assert.equal(value,runtime);},
   async checkpointOwnedDeviceExternalFlatSourceReceiverV2(value,token){assert.equal(value,runtime);api.consumeOriginalDeviceGraphSourceRequestV2(token,'runtime-checkpoint',runtime);counts.runtimeSnapshots++;return{schema:'HOST_INERT_RUNTIME',state:{head:structuredClone(head)},localCustody:{credential:marker}};},
   async reopenOwnedDeviceExternalFlatSourceReceiverV2(token){counts.openAttempts++;assert.ok(allowReopen,'HOST_NATIVE_REOPEN_FORBIDDEN');const saved=authenticateSection(token,'receiver');assert.equal(saved.localCustody.credential,marker);head=structuredClone(saved.state.head);return runtime;},
  },
  recovery:{
   async wrappedPrivateLifetimeRegistryCheckpointV1(value){assert.equal(value,registry);return{revision:1,stateSHA256:hash('host-registry')};},
   async reopenOriginalDeviceGraphSourceRegistryV2(value,token){assert.equal(value,runtime);const saved=authenticateSection(token,'privateLifetime');assert.deepEqual(saved.checkpoint,{revision:1,stateSHA256:hash('host-registry')});return registry;},
   async closeWrappedPrivateLifetimeRegistryV1(value){assert.equal(value,registry);counts.closed++;return{closed:true};},
  },
  system:{async reopenDeviceExternalFlatSystemFromAuthorityV1({runtime:actual,attemptAuthority}){assert.equal(actual,runtime);const saved=authenticateSection(attemptAuthority,'system');assert.equal(saved.credential,marker);return{runtime,originalSystem:true};}},
 };
 try{
  for(const[key,exports]of Object.entries(replacements))boundaries.push(mock.module(urls[key],{exports:{...original[key],...exports}}));
  api=await import(new URL(urls.source.href+'?actual-source-host='+randomUUID()));
 }catch(error){for(const boundary of boundaries.reverse())boundary.restore();throw error;}
 async function journal(version){const directory=join(identity.directory,'graph-source-v'+version),secret=await readFile(join(directory,'source.secret'));try{return await new Vault(join(directory,'source.vault')).read(secret.toString('hex'));}finally{secret.fill(0);}}
 async function body(version,pin,paired){const directory=join(identity.directory,'graph-source-v'+version),secret=await readFile(join(directory,'source.secret'));try{const record=await journal(version);return await readDeviceGraphSourceBodyV2({password:secret.toString('hex'),profile:record.data.schema,identity,protocol:record.data.protocol,version,pairing:paired??record.data.pairing,directory,record},pin??record.data.confirmed,{read:async path=>readFile(path),canonical});}finally{secret.fill(0);}}
 return{api,service,account,targetAccount,bridge,runtime,registry,counts,marker,journal,body,setHead(value){head=structuredClone(value);},setStandby(value){standby=value;},restore(){for(const boundary of boundaries.reverse())boundary.restore();}};
}
