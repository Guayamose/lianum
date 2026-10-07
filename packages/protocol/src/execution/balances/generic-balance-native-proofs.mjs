/** Owner-private proof preparation for an already funded source note.
 * The existing immutable custody record supplies the exact signed A0 and native
 * capsules. No source note, key or new deposit is created here. These outputs
 * remain private capabilities; only the later S66/I42/T131 exports are public.
 */
import assert from 'node:assert/strict';
import { assertOwnedGenericBalanceOwnerProcess } from './generic-balance-owner-process.mjs';
import { createProofProcess } from '../proofs/proof-process.mjs';
import { wipePrivate } from '../proofs/proof-worker.mjs';
import { authorizationInputs } from '../../../../../experiments/protocol/private-core-proof/generic-funding/witness.mjs';
import { digestHex } from '../../../../../experiments/protocol/private-core-proof/generic-wrappers/abi.mjs';

const recursive = proof => ({ publicInputs: proof.publicInputs, proofFields: proof.proofFields, vkFields: proof.vkFields });
const activeProvers = new WeakMap();

export async function abortGenericBalanceNativeProofs(owner) {
  assertOwnedGenericBalanceOwnerProcess(owner);
  const prover = activeProvers.get(owner);
  return prover ? prover.abort() : { closed: true, exited: true, activeProof: false };
}

export async function prepareGenericBalanceNativeProofs({ owner, ownerOperationRef }, callbacks = {}) {
  assertOwnedGenericBalanceOwnerProcess(owner);
  assert.match(ownerOperationRef, /^[0-9a-f]{64}$/, 'BALANCE_NATIVE_PROOFS_REFERENCE');
  assert.ok(Object.keys(callbacks).every(key => ['onStage', 'onProof'].includes(key)),
    'BALANCE_NATIVE_PROOFS_CALLBACKS');
  const onStage = callbacks.onStage ?? (async () => {}), onProof = callbacks.onProof ?? (async () => {});
  assert.equal(typeof onStage, 'function');
  assert.equal(typeof onProof, 'function');
  const status = await owner.publicView.operation(ownerOperationRef);
  assert.equal(status.kind, 'S66', 'BALANCE_NATIVE_PROOFS_KIND');
  assert.equal(status.stage, 'AUTHORIZED', 'BALANCE_NATIVE_PROOFS_AUTHORIZATION_REQUIRED');
  const plan = await owner.owner.ownerPlan(ownerOperationRef);
  assert.ok(!activeProvers.has(owner), 'BALANCE_NATIVE_PROOFS_BUSY');
  const prover = createProofProcess({ purpose: 'owner', modes: ['authorization', 'capsule'] });
  activeProvers.set(owner, prover);
  let signed, a0Input, capsuleInputs, authorization, capsuleAuthorization;
  try {
    signed = await owner.owner.resumeAuthorization(ownerOperationRef);
    a0Input = authorizationInputs(signed);
    await onStage({ stage: 'prove-owner-authorization-from-existing-balance' });
    authorization = await prover.prove('authorization', a0Input,
      plan.authorizationPublicInputs, 'generic-account-owner-authorization');
    assert.equal(authorization.metrics.acceptedResult, true, 'BALANCE_NATIVE_PROOFS_A0_INCOMPLETE');
    await onProof({ mode: 'authorization', proof: authorization });
    wipePrivate(a0Input); a0Input = null;
    wipePrivate(signed); signed = null;

    capsuleInputs = await owner.owner.nativeCapsuleInputs({ ownerOperationRef,
      authorizationProof: recursive(authorization) });
    await onStage({ stage: 'prove-owner-native-capsules' });
    capsuleAuthorization = await prover.prove('capsule', capsuleInputs.inputs,
      capsuleInputs.expectedPublicInputs, 'generic-account-owner-capsules');
    assert.equal(capsuleAuthorization.metrics.acceptedResult, true, 'BALANCE_NATIVE_PROOFS_C_INCOMPLETE');
    await onProof({ mode: 'capsule', proof: capsuleAuthorization });
    const a0 = authorization.publicInputs;
    // Transfer owned copies. The finally block clears intermediate witnesses
    // and closes the proof facade before any native runtime work can begin.
    return {
      authorization: structuredClone(authorization), capsuleAuthorization: structuredClone(capsuleAuthorization),
      fundingCommitment: digestHex(a0.slice(32, 40)), admissionTag: plan.statement.admissionTag,
      reserveCommitment: plan.statement.reserveCommitment, reserveNullifier: digestHex(a0.slice(80, 88)),
      changeCommitment: plan.statement.changeCommitment, recoveryCommitment: digestHex(a0.slice(128, 136)),
      settleBefore: a0[138], rolePackets: structuredClone(capsuleInputs.rolePackets),
      providerRiskSalts: structuredClone(capsuleInputs.providerRiskSalts),
    };
  } finally {
    wipePrivate(signed); wipePrivate(a0Input); wipePrivate(capsuleInputs);
    wipePrivate(authorization); wipePrivate(capsuleAuthorization);
    await prover.close();
    activeProvers.delete(owner);
  }
}
