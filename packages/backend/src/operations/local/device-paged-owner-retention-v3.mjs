/** Encrypted original OWNER retention and readonly validation orchestration.
 * The lower store authenticates AEAD and issues one-use readonly openings;
 * the graph reconstructs original signatures without importing this wrapper. */
import assert from 'node:assert/strict';
import {wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {createDevicePagedOwnerRetentionV3,openOriginalDevicePagedOwnerReadRecoveryStoreV4} from './device-paged-owner-read-store-v4.mjs';
export {createDevicePagedOwnerRetentionV3,consumeOriginalDevicePagedOwnerReadRecoveryOpeningV4} from './device-paged-owner-read-store-v4.mjs';
const readRecoveryValidations=new WeakMap();
/** Authenticated DATA only. No capsule, ROOT, password or execution grant is
 * returned. The original child must reopen this exact record, reconstruct its
 * signatures/graph and reissue the retained proof before authority recovery. */
export async function readOriginalDevicePagedOwnerProofCheckpointV4(config,descriptor,before){
 assert.equal(arguments.length,3);P.pagedOwnerExactV3(config,['path','password']);
 const reader=await createDevicePagedOwnerRetentionV3({...config,expected:null},descriptor);
 try{return await reader.readProofCheckpointAfter(before);}finally{reader.close();}
}

/** Readback of the exact immutable-at-transition OWNER capsule. This reader
 * proves storage lineage only; the authority separately checks canonical
 * terminal graph outcome/source nullifier and its original client checkpoint. */
export async function readOriginalDevicePagedOwnerTerminalCheckpointV4(config,descriptor,expected){
 assert.equal(arguments.length,3);P.pagedOwnerExactV3(config,['path','password']);
 const reader=await createDevicePagedOwnerRetentionV3({...config,expected},descriptor);let capsule;
 try{capsule=reader.restored();assert.ok(['FULFILLED','RECOVERED'].includes(capsule.phase)&&capsule.phase===capsule.public.phase,'PAGED_REFILL_OWNER_TERMINAL');assert.equal(capsule.pending,null,'PAGED_REFILL_OWNER_PENDING');assert.deepEqual(capsule.public,expected.public,'PAGED_REFILL_OWNER_PUBLIC');return reader.checkpoint();}
 finally{wipePrivateProofInputsV1(capsule);reader.close();}
}

/** Only used below an original durable CREATING marker. Reads the authentic
 * existing empty OWNER file; missing/active capsules are never recreated. */
export async function readOriginalDevicePagedOwnerEmptyBirthCheckpointV4(config,descriptor){
 assert.equal(arguments.length,2);P.pagedOwnerExactV3(config,['path','password']);const reader=await createDevicePagedOwnerRetentionV3({...config,expected:null},descriptor);
 try{return await reader.readEmptyBirthCheckpoint();}finally{reader.close();}
}

/** Validate the existing encrypted OWNER even after its service descriptor
 * expires. The reopened controller is strictly read-only and rechecks original
 * graph signatures/commitments. No V3 command, prover result or dispatch grant
 * is made current. Authority renewal still needs its original supervisor token
 * and a separate current original deployment/ledger read. */
export async function validateOriginalDevicePagedOwnerReadRecoveryV4(config,descriptor,expected){
 assert.equal(arguments.length,3);const store=await openOriginalDevicePagedOwnerReadRecoveryStoreV4(config,descriptor,expected);let controller,closed=false;
 try{
  const {reopenOriginalDevicePagedPrivateGraphReadRecoveryV4}=await import('./device-paged-private-graph-v3.mjs');
  controller=await reopenOriginalDevicePagedPrivateGraphReadRecoveryV4(store.opening);await store.assertCurrent();
  const validation=Object.freeze(Object.create(null)),checkpoint=store.checkpoint(),pub=controller.summary(),automation=controller.automation();
  const data={profile:'ORIGINAL_PAGED_OWNER_READ_RECOVERY_VALIDATION_V4',checkpoint,public:pub,automation:automation===null?null:{terms:structuredClone(automation.terms),commandsUsed:automation.commandsUsed,revoked:automation.revoked},current:false};
  await controller.close();controller=null;
  let expiry;const close=()=>{if(closed)return;closed=true;clearTimeout(expiry);store.close();wipePrivateProofInputsV1(data);readRecoveryValidations.delete(validation);};
  readRecoveryValidations.set(validation,{store,data,close});expiry=setTimeout(close,15000);expiry.unref?.();
  return validation;
 }catch(error){closed=true;await controller?.close();store.close();throw error;}
}

/** Same original validation object and unchanged AEAD high-water only. This
 * inferior metadata is not canonical chain state or financial authority. */
export async function readOriginalDevicePagedOwnerReadRecoveryValidationV4(token){
 assert.equal(arguments.length,1);const original=readRecoveryValidations.get(token);assert.ok(original,'PAGED_OWNER_ORIGINAL_READ_RECOVERY_VALIDATION');await original.store.assertCurrent();assert.equal(readRecoveryValidations.get(token),original,'PAGED_OWNER_ORIGINAL_READ_RECOVERY_VALIDATION');return structuredClone(original.data);
}
export function closeOriginalDevicePagedOwnerReadRecoveryValidationV4(token){assert.equal(arguments.length,1);readRecoveryValidations.get(token)?.close();}
