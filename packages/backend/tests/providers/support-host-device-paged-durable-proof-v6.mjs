/** Explicit NOT_SNARK fixture ports for older SDK/Authority HOST tests.
 * Real Original durable proof/ACTIVE tests never import this module. These
 * controlled fake results exercise public contracts, not private acceptance. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {canonical} from '@lianum/engine/crypto/privacy';
import {privateProofBindingSHA256V1} from '@lianum/engine/crypto/private-proof-transit-v1';
const H=value=>createHash('sha256').update(canonical(value)).digest('hex');
export function createHostDevicePagedDurableProofPortsV6(legacy){
 const clients=new WeakMap(),results=new WeakMap(),intents=new WeakMap();
 return{
  ...legacy,
  async prepareOriginalDevicePagedDurableProofClientV6(mode,jobId,manifestSHA256,descriptor,retention){
   const P=await import('@lianum/mobile-protocol/device/paged-owner-v3');assert.equal(arguments.length,5);assert.equal(descriptor.manifestSHA256,manifestSHA256);assert.ok(retention.path&&retention.password);
   const original=await legacy.prepareOriginalDevicePagedProofClientV3(mode,jobId,manifestSHA256);
   let admitted=null,checkpoint=null;
   const client=Object.freeze({ready:()=>original.ready(),checkpoint:()=>structuredClone(checkpoint),
    async prepareProofIntentV6(cipher,consent){assert.equal(admitted,null);P.validateDevicePagedConsentFreshV3(consent);assert.deepEqual(consent.recipient,original.ready());assert.equal(consent.mode,mode);assert.equal(consent.jobId,jobId);const authorization={kind:'ORIGINAL_CONSENT_V1',jobId,consentSHA256:createHash('sha256').update(P.devicePagedPermissionMessageV3(consent)).digest('hex'),witnessSHA256:consent.witnessSHA256};assert.deepEqual(cipher.authorization,authorization);admitted={cipher,consent,authorization};const stat=readFileSync('/proc/self/stat','utf8'),tail=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/);checkpoint={profile:'DEVICE_PAGED_NOTE_PROOF_CHECKPOINT_V6',descriptorSHA256:H(descriptor),revision:0,dataSHA256:H({classification:'HOST_NOT_SNARK_INTENT',authorization}),public:{jobId,mode,rootId:consent.rootId,sourceRevision:consent.revision,consentSHA256:authorization.consentSHA256,witnessSHA256:consent.witnessSHA256,publicInputsSHA256:H(consent.publicInputs),stage:'INTENT',ownerProcess:{bootId:readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),pid:process.pid,startTicks:tail[19],processGroup:process.pid}}};const token=Object.freeze(Object.create(null));intents.set(token,{client,used:false});return token;},
    async continueProofIntentV6(token,expected){const intent=intents.get(token);assert.ok(intent?.client===client&&!intent.used,'HOST_ORIGINAL_DURABLE_INTENT_REQUIRED');assert.deepEqual(expected,admitted.consent.publicInputs);intent.used=true;const result=await original.submit(admitted.cipher,admitted.consent),actual=legacy.readOriginalDevicePagedProofResultV3(original,result);try{checkpoint={...checkpoint,revision:1,dataSHA256:H({classification:'HOST_NOT_SNARK_PROVED',authorization:admitted.authorization}),public:{...checkpoint.public,stage:'PROVED'}};const response=Object.freeze({type:'original-device-paged-public-proof-v3',mode,jobId,manifestSHA256,bindingSHA256:privateProofBindingSHA256V1(admitted.authorization),proof:actual.proof.toString('hex'),publicInputs:[...actual.publicInputs],source:{...actual.source}});results.set(response,{client,payload:{proof:Buffer.from(actual.proof),publicInputs:[...actual.publicInputs],source:{...actual.source},checkpoint:structuredClone(checkpoint)}});return response;}finally{actual.proof.fill(0);}},
    close:()=>original.close()
   });clients.set(client,true);return client;
  },
  readOriginalDevicePagedProofResultV3(client,result){if(!clients.has(client))return legacy.readOriginalDevicePagedProofResultV3(client,result);const owned=results.get(result);assert.ok(owned?.client===client,'HOST_ORIGINAL_DURABLE_RESULT_REQUIRED');return{...structuredClone(owned.payload),proof:Buffer.from(owned.payload.proof)};},
  async reopenOriginalDevicePagedDurableProofClientV6(){throw Error('HOST_FIXTURE_HAS_NO_ACCEPTED_PRIVATE_NOTE');},
  async readOriginalDevicePagedNoteProofCheckpointV6(){throw Error('HOST_FIXTURE_HAS_NO_ACCEPTED_PRIVATE_NOTE');}
 };
}
