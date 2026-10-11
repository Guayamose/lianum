/** Private installation on one genuine account/actor. U and S are distinct
 * signed admissions; HTTP loss never retries a proof or an original send.
 * Native preparation comes from the fixed private bootstrap, never a route
 * payload. This bridge grants no provider/quorum/native-dispatch authority. */
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { createHash,createPublicKey,randomBytes,verify } from 'node:crypto';
import { assertOwnedNativeValueAccountAuthority,runDeviceOwnerReservationAuthorizationV1,
  readDeviceOwnerReservationStatusV1,installOriginalNativePrivateReservationV2,readOriginalNativePrivateReservationContextV2 } from './native-value-account-authority-v2.mjs';
import { assertPairedOriginalAccountActorV2,assertPairedOriginalAccountActorAccountV2,
  pairedOriginalAccountActorDescriptorV2 } from '../../api/mobile/paired-original-account-actor-v2.mjs';
import { assertOwnedNativeValueWalletSystem } from '../../operations/deployments/native-value/native-value-system-v2.mjs';
import { createNativeValueSystemStateReader } from '../../execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { cloneInput } from '@lianum/components/plain-input';
import { validateGenericBalanceNativePreparation } from '@lianum/engine/execution/balances/generic-balance-native-preparation';
import { normalizeOriginalAccountSignatureV2,originalAccountAccessMessageV2 } from '@lianum/mobile-protocol/original-account-v2';
import { DEVICE_RESERVATION_CONSENT_V1,DEVICE_RESERVATION_DISCLOSURE_V1,normalizeDeviceReservationConsentV1,
  validateDeviceReservationConsentFreshV1,deviceReservationConsentMessageV1,normalizeDeviceReservationStatementV1,
  normalizeDeviceReservationCustodyV1,normalizeDeviceReservationWitnessV1,deviceReservationWitnessBytesV1,
  wipeDeviceReservationWitnessV1 } from '@lianum/mobile-protocol/device-reservation-consent-v1';
import * as PrivateU from '@lianum/mobile-protocol/device/native-reservation-v2';
import {createRoleProofClient} from '@lianum/backend/proving/roles/role-client';
const reservationFresh=PrivateU.validateDeviceReservationConsentEitherFreshV2,reservationMessage=PrivateU.deviceReservationConsentEitherMessageV2;
const bridges=new WeakMap(),admissions=new WeakMap();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),nonce=()=>randomBytes(32).toString('hex');
const opaque=()=>Object.freeze(Object.defineProperty(Object.create(null),'toJSON',{value(){throw Error('DEVICE_RESERVATION_NOT_SERIALIZABLE');}}));
export function createDeviceOwnerReservationBridgeV1(input){assert.equal(arguments.length,1);return createReservationBridge(input,false);}
export function createOriginalNativePrivateReservationBridgeV2(input){assert.equal(arguments.length,1);return createReservationBridge(input,true);}
async function createReservationBridge(input,privateU) {
  assert.equal(arguments.length,2);exactRecord(input,['actor','account','owner','runtime','system','poolIndex','nativePreparation','invoiceSignatures']);
  const {actor,account,owner,runtime,system,poolIndex}=input;
  const original=()=>{assertPairedOriginalAccountActorV2(actor);assertPairedOriginalAccountActorAccountV2(actor,account);
    assertOwnedNativeValueAccountAuthority(account,{runtime,system,poolIndex,owner});assertOwnedNativeValueWalletSystem(runtime,system);};
  original();const descriptor=pairedOriginalAccountActorDescriptorV2(actor),nativePreparation=validateGenericBalanceNativePreparation(input.nativePreparation);
  const invoiceSignatures=cloneInput(input.invoiceSignatures);assert.equal(invoiceSignatures.length,nativePreparation.nodes.length);
  invoiceSignatures.forEach(normalizeOriginalAccountSignatureV2);
  const reader=await createNativeValueSystemStateReader({runtime,system,poolIndex});original();
  const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',
    x:Buffer.from(descriptor.devicePublicKey.slice(2,66),'hex').toString('base64url'),
    y:Buffer.from(descriptor.devicePublicKey.slice(66),'hex').toString('base64url')}});
  const pending=new Map(),acceptedWork=new Map(),admittedSources=new Set();let closed=false,busy=false;const privateStops=new Set();
  function drainPrepared(row){clearTimeout(row?.timer);if(!row?.client)return Promise.resolve();row.client.stop();const stop=row.client.closePrivateNativeDeviceAuthorizationV2();privateStops.add(stop);stop.finally(()=>privateStops.delete(stop)).catch(()=>{});return stop;}
  function prune(){for(const[id,row]of pending)if(row.consumed||row.value.expiresAt<=Date.now()){pending.delete(id);if(!row.consumed)drainPrepared(row).catch(()=>{});}}
  const live=()=>{assert.ok(!closed,'DEVICE_RESERVATION_BRIDGE_CLOSED');original();};
  async function current(){live();const view=await reader.read();await reader.assertCurrent(view);live();return view;}
  function terms(view){const selected=account.config.registry.filter(row=>row.assetId===account.assetId);
    assert.equal(selected.length,1,'DEVICE_RESERVATION_ORIGINAL_ASSET');const asset=selected[0];
    assert.equal(asset.pool,view.poolAddress.slice(2));for(const name of ['scope','policy'])assert.equal(asset[name],view.domain[name]);
    assert.equal(asset.assetIdentity,view.domain.asset);return{scope:asset.scope,policy:asset.policy,codeHash:asset.codeHash,
      assetIdentity:asset.assetIdentity,domainCommitment:view.domainCommitment};}
  async function read(input){const binding=await actor.deviceDepositSignedReadBindingV1({challenge:cloneInput(input.access),signature:input.signature});
    live();return{binding,authorizationSHA256:sha(originalAccountAccessMessageV2(input.access))};}
  function grant(value){const cap=opaque();admissions.set(cap,{bridge,account,...value,consumed:false});return cap;}
  function issue(action,binding,view,fields,prepared=null,accessExpiresAt=null){prune();
    assert.ok(pending.size<4,'DEVICE_RESERVATION_CHALLENGE_CAPACITY');
    let value=normalizeDeviceReservationConsentV1({version:1,profile:DEVICE_RESERVATION_CONSENT_V1,action,...descriptor,
      challengeId:nonce(),nonce:nonce(),expiresAt:Date.now()+15000,binding,poolTerms:terms(view),...fields,
      observed:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp},
      openingDisclosure:action==='PROVE_U'?DEVICE_RESERVATION_DISCLOSURE_V1:null});
    if(prepared){assert.ok(privateU&&action==='PROVE_U');assert.ok(accessExpiresAt>Date.now(),'DEVICE_RESERVATION_ORIGINAL_ACCESS_EXPIRED');const context=prepared.context;const raw={...value,version:2,profile:PrivateU.DEVICE_NATIVE_PRIVATE_RESERVATION_V2,expiresAt:Math.min(value.expiresAt,accessExpiresAt),openingDisclosure:'ENCRYPTED_U_OPENING_TO_ORIGINAL_NATIVE_RECIPIENT',privateProof:{profile:PrivateU.DEVICE_NATIVE_PRIVATE_U_PROOF_V2,...prepared.recipients,context,transcriptSHA256:'1'.repeat(64)}};const bytes=PrivateU.nativePrivateReservationTranscriptBytesV2(raw);try{raw.privateProof.transcriptSHA256=sha(bytes);}finally{bytes.fill(0);}value=PrivateU.normalizeNativePrivateReservationConsentV2(raw);}
    const row={value,consumed:false,...(prepared?{client:prepared.client,timer:setTimeout(()=>{if(pending.get(value.challengeId)===row&&!row.consumed){pending.delete(value.challengeId);drainPrepared(row).catch(()=>{});}},Math.max(1,value.expiresAt-Date.now()))}:{})};pending.set(value.challengeId,row);return structuredClone(value);}
  async function authorize(input,action,consume=true){exactRecord(input,action==='PROVE_U'?['consent','signature','witness']:['consent','signature']);live();
    const consent=reservationFresh(cloneInput(input.consent)),row=pending.get(consent.challengeId);
    assert.ok(row&&!row.consumed&&consent.action===action,'DEVICE_RESERVATION_ORIGINAL_CONSENT');assert.equal(consent.version===2,privateU&&action==='PROVE_U','DEVICE_RESERVATION_FIXED_INTAKE');
    assert.deepEqual(consent,row.value,'DEVICE_RESERVATION_ORIGINAL_CONSENT');
    const signature=normalizeOriginalAccountSignatureV2(input.signature);
    assert.equal(verify('sha256',reservationMessage(consent),{key,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'hex')),true,
      'DEVICE_RESERVATION_DEVICE_SIGNATURE');
    assert.deepEqual(await actor.deviceDepositOriginalBinding(),consent.binding,'DEVICE_RESERVATION_BINDING_CHANGED');live();
    reservationFresh(consent);if(!consume)return consent;let witness=null;
    try{if(action==='PROVE_U'&&privateU){assert.ok(row.client,'DEVICE_RESERVATION_ORIGINAL_RECIPIENT');witness=cloneInput(input.witness);exactRecord(witness,['type','profile','relation','role','jobId','recipientPublicKey','senderPublicKey','authorization','publicInputsSHA256','salt','iv','tag','ciphertext']);assert.ok(typeof witness.ciphertext==='string'&&witness.ciphertext.length<=60116,'DEVICE_RESERVATION_PRIVATE_BOUND');for(const name of ['profile','relation','role','jobId','recipientPublicKey'])assert.equal(witness[name],consent.privateProof.recipient[name],'DEVICE_RESERVATION_ORIGINAL_RECIPIENT');assert.deepEqual(witness.authorization,{kind:'ORIGINAL_CONSENT_V1',jobId:consent.jobId,consentSHA256:sha(reservationMessage(consent)),witnessSHA256:consent.witnessSHA256},'DEVICE_RESERVATION_PRIVATE_BINDING');}
      else if(action==='PROVE_U'){witness=normalizeDeviceReservationWitnessV1(cloneInput(input.witness));const bytes=deviceReservationWitnessBytesV1(witness);
      try{assert.equal(sha(bytes),consent.witnessSHA256,'DEVICE_RESERVATION_WITNESS_CHANGED');}finally{bytes.fill(0);}}
      row.consumed=true;clearTimeout(row.timer);return grant({action,consent,witness,...(privateU&&action==='PROVE_U'?{privateU:true,client:row.client,signature}: {})});
    }catch(error){wipeDeviceReservationWitnessV1(witness);throw error;}}
  async function retainedWork(input,action){assert.ok(!busy,'DEVICE_RESERVATION_BRIDGE_BUSY');busy=true;
    let admission,completion,failure,failed=false;
    try{admission=await authorize(input,action);const consent=admissions.get(admission).consent,workKey=consent.jobId+':'+action;
      if(action!=='OBSERVE_S')assert.ok(!acceptedWork.has(workKey),'DEVICE_RESERVATION_ORIGINAL_WORK_ALREADY_ADMITTED');
      if(action==='PROVE_U'){assert.ok(!admittedSources.has(consent.custody.sourceCommitment),'DEVICE_RESERVATION_ORIGINAL_SOURCE_ALREADY_ADMITTED');
        admittedSources.add(consent.custody.sourceCommitment);}
      // Invalid/replayed consent cannot replace completion of the admitted job.
      completion=Promise.withResolvers();completion.promise.catch(()=>{});
      if(action!=='OBSERVE_S')acceptedWork.set(workKey,completion.promise);bridges.get(bridge).completion=completion.promise;
      return await runDeviceOwnerReservationAuthorizationV1(account,bridge,admission);}
    catch(error){failure=error;failed=true;throw error;}
    finally{if(admission)wipeDeviceReservationWitnessV1(admissions.get(admission)?.witness);busy=false;
      if(completion){if(failed)completion.reject(failure);else completion.resolve();}}}
  const bridge=Object.freeze({
    async challengePreparation(input){assert.equal(arguments.length,1);exactRecord(input,['access','signature','depositJobId','rootId']);
      assert.ok(!busy,'DEVICE_RESERVATION_BRIDGE_BUSY');busy=true;
      try{live();const access=await read(input),view=await current();
        // Only the private installation selects nativePreparation. The same Vault
        // checks D26 subject, records its generated preparation, then quotes it.
        const quote=await runDeviceOwnerReservationAuthorizationV1(account,bridge,grant({action:'PREPARE_U',binding:access.binding,
          descriptor,depositJobId:input.depositJobId,rootId:input.rootId,nativePreparation,invoiceSignatures}));
        assert.deepEqual(quote.poolTerms,terms(view),'DEVICE_RESERVATION_QUOTE_DOMAIN_CHANGED');
        return{quote:{version:1,profile:'LIANUM_DEVICE_ORIGINAL_US_QUOTE_V1',...quote,...descriptor,expiresAt:Math.min(input.access.expiresAt,Date.now()+15000)},authorizationSHA256:access.authorizationSHA256};
      }finally{busy=false;}},
    async challengeJob(input){assert.equal(arguments.length,1);exactRecord(input,['access','signature','depositJobId','quoteId','custody','statement','witnessSHA256','jobId']);
      assert.ok(!busy,'DEVICE_RESERVATION_BRIDGE_BUSY');busy=true;
      try{const originalAccess=cloneInput(input.access),access=await read({...input,access:originalAccess}),view=await current();
        const statement=normalizeDeviceReservationStatementV1(cloneInput(input.statement)),custody=normalizeDeviceReservationCustodyV1(cloneInput(input.custody));
        const fields={depositJobId:input.depositJobId,quoteId:input.quoteId,jobId:input.jobId??nonce(),custody,statement,
          witnessSHA256:input.witnessSHA256,proofSHA256:null,publicInputsSHA256:null};
        // Structural framing is not admission. The account validates the
        // original quote/D26/custody/frame again before the one proof job.
        if(!privateU)return issue('PROVE_U',access.binding,view,fields);
        prune();assert.ok(pending.size<4,'DEVICE_RESERVATION_CHALLENGE_CAPACITY');let client;try{
          const context=await readOriginalNativePrivateReservationContextV2(account,bridge,{...fields,binding:access.binding,poolTerms:terms(view),...descriptor});
          client=createRoleProofClient('owner');const recipients=await client.preparePrivateNativeDeviceAuthorizationV2();await reader.assertCurrent(view);live();assert.deepEqual(await actor.deviceDepositOriginalBinding(),access.binding,'DEVICE_RESERVATION_BINDING_CHANGED');live();assert.ok(originalAccess.expiresAt>Date.now(),'DEVICE_RESERVATION_ORIGINAL_ACCESS_EXPIRED');
          return issue('PROVE_U',access.binding,view,fields,{client,recipients,context},originalAccess.expiresAt);
        }catch(error){if(client)await drainPrepared({client});throw error;}
      }finally{busy=false;}},
    async prove(input){assert.equal(arguments.length,1);return retainedWork(input,'PROVE_U');},
    async challengeReservation(input){assert.equal(arguments.length,1);exactRecord(input,['access','signature','jobId']);
      assert.ok(!busy,'DEVICE_RESERVATION_BRIDGE_BUSY');busy=true;
      try{const access=await read(input),job=await readDeviceOwnerReservationStatusV1(account,bridge,input.jobId);
        assert.equal(job.stage,'PROVED','DEVICE_RESERVATION_PROVED_REQUIRED');return issue('RESERVE_S',access.binding,await current(),job.consentFields);
      }finally{busy=false;}},
    async reserve(input){assert.equal(arguments.length,1);return retainedWork(input,'RESERVE_S');},
    async challengeObservation(input){assert.equal(arguments.length,1);exactRecord(input,['access','signature','jobId']);
      assert.ok(!busy,'DEVICE_RESERVATION_BRIDGE_BUSY');busy=true;
      try{const access=await read(input),job=await readDeviceOwnerReservationStatusV1(account,bridge,input.jobId);
        return issue('OBSERVE_S',access.binding,await current(),job.consentFields);
      }finally{busy=false;}},
    async observe(input){assert.equal(arguments.length,1);return retainedWork(input,'OBSERVE_S');},
    close(){assert.equal(arguments.length,0);closed=true;if(!privateU){pending.clear();return{closed:true,originalWorkRetained:true};}const stops=[...pending.values()].filter(r=>!r.consumed).map(drainPrepared);pending.clear();const admitted=bridges.get(bridge).completion;return(async()=>{await Promise.allSettled([...stops,...privateStops,...(admitted?[admitted]:[])]);return{closed:true,originalWorkRetained:true};})();},
  });bridges.set(bridge,{account,actor,original,descriptor,nativePreparation,invoiceSignatures,live,privateU,
    async durableReservation(input){assert.ok(!busy,'DEVICE_RESERVATION_BRIDGE_BUSY');busy=true;
      try{const consent=await authorize(input,'RESERVE_S',false);
        assert.ok(!acceptedWork.has(consent.jobId+':RESERVE_S'),'DEVICE_RESERVATION_ORIGINAL_WORK_ALREADY_ADMITTED');
        return consent;}finally{busy=false;}}
  });if(privateU)await installOriginalNativePrivateReservationV2(account,bridge);return bridge;
}
/** Read-only verification of the actual pending S consent; no grant minted. */
export function assertDeviceOwnerReservationDurableRequestV1(bridge,input){
  assert.equal(arguments.length,2);deviceOwnerReservationBridgeActorV1(bridge);
  return bridges.get(bridge).durableReservation(input);
}
export function assertDeviceOwnerReservationBridgeV1(bridge,account){assert.equal(arguments.length,2);
  assert.ok(!types.isProxy(bridge),'DEVICE_RESERVATION_ORIGINAL_BRIDGE');const row=bridges.get(bridge);
  assert.ok(row&&row.account===account,'DEVICE_RESERVATION_ORIGINAL_BRIDGE');row.original();return row.descriptor;}
export function deviceOwnerReservationBridgeActorV1(bridge){assert.equal(arguments.length,1);assert.ok(!types.isProxy(bridge));
  const row=bridges.get(bridge);assert.ok(row,'DEVICE_RESERVATION_ORIGINAL_BRIDGE');row.original();return row.actor;}
export function consumeDeviceOwnerReservationAuthorizationV1(bridge,cap,account){assert.equal(arguments.length,3);
  assertDeviceOwnerReservationBridgeV1(bridge,account);assert.ok(!types.isProxy(cap));const row=admissions.get(cap);
  assert.ok(row&&!row.consumed&&row.bridge===bridge&&row.account===account,'DEVICE_RESERVATION_ORIGINAL_ADMISSION');
  row.consumed=true;return row;}
export async function awaitDeviceOwnerReservationOriginalWorkV1(bridge){assert.equal(arguments.length,1);
  assert.ok(!types.isProxy(bridge));const row=bridges.get(bridge);assert.ok(row?.completion,'DEVICE_RESERVATION_ORIGINAL_WORK');
  row.original();const original=row.completion;await original;row.original();}

/** Private account installation reads the same preparation admitted by its
 * original bridge. These data create no reservation, consent or provider key. */
export function readDeviceOwnerReservationOriginalPreparationV1(bridge,account) {
  assert.equal(arguments.length,2);assertDeviceOwnerReservationBridgeV1(bridge,account);
  const row=bridges.get(bridge);row.live();
  return Object.freeze({nativePreparation:validateGenericBalanceNativePreparation(row.nativePreparation),
    invoiceSignatures:cloneInput(row.invoiceSignatures)});
}

export function isOriginalNativePrivateReservationBridgeV2(bridge){assert.equal(arguments.length,1);assert.ok(!types.isProxy(bridge));return bridges.get(bridge)?.privateU===true;}
