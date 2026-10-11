import assert from 'node:assert/strict';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { claimVerifierSetCommitment } from '@lianum/engine/claims/framing';
import { SOLANA_NONCE_INGRESS_PROFILE } from "../../../chains/solana/runtime/solana-profiles.mjs";
const CANDIDATE = Object.freeze({profile:SOLANA_NONCE_INGRESS_PROFILE});
export function assertNonceIngressDeployment(system) {
  const selected = system.nativeRuntimes.map((native, i) => ({ native, config: system.configs[i] }))
    .filter(({ native }) => native.nonceIngressProfile !== undefined || native.nonceInfrastructureByAuthority !== undefined);
  assert.equal(selected.length, 1, 'WRAPPED_NONCE_SOL_CUSTODY_REQUIRED');
  for (const { native, config } of selected) {
    assert.equal(config.nativeFamily, '2', 'V3_DEPLOYMENT_SOL_ONLY');
    assert.equal(native.nonceIngressProfile, CANDIDATE.profile, 'V3_OWNED_RUNTIME_PROFILE');
    exactRecord(native.nonceInfrastructureByAuthority, ['depositor', 'escrow']);
  }
  const ingress = system.verifiers.CI51, discharge = system.verifiers.CO42;
  assert.equal(ingress.source, 'native_claim_ingress_nonce_registry_v3.sol', 'V3_ACTUAL_INGRESS_VERIFIER_REQUIRED');
  assert.equal(discharge.source, 'native_claim_discharge_registry_v2.sol', 'V3_ORIGINAL_DISCHARGE_VERIFIER_REQUIRED');
  assert.equal(system.verifierPins.length, 2, 'V3_TWO_ACTUAL_VERIFIER_ROLES');
  for (const [index, verifier] of [ingress, discharge].entries()) {
    const pin = system.verifierPins[index];
    assert.equal(pin.role, String(index), 'V3_VERIFIER_ROLE');
    assert.equal(pin.width, index === 0 ? '51' : '42', 'V3_VERIFIER_ABI');
    assert.equal(verifier.lineage.actualGeneratedKeyAndSource, true, 'V3_GENUINE_VERIFIER_LINEAGE');
    assert.equal(pin.sourceCommitment, verifier.lineage.sourceVersion, 'V3_VERIFIER_SOURCE_PIN');
    assert.equal(pin.keyCommitment, verifier.lineage.keySHA256, 'V3_VERIFIER_KEY_PIN');
    assert.equal(verifier.address, '0x' + pin.address, 'V3_VERIFIER_ADDRESS_PIN');
    assert.equal(verifier.codeHash, '0x' + pin.codeHash, 'V3_VERIFIER_CODE_PIN');
  }
  const verifierSet = claimVerifierSetCommitment(system.verifierPins);
  for (const config of system.configs) assert.equal(config.claimVerifierSetCommitment, verifierSet, 'V3_AUTHENTICATED_VERIFIER_SET');
  return true;
}
