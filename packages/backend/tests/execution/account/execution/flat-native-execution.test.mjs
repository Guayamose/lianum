/** Host handoff tests only. Synthetic roots, explicit test hash and invalid
 * proof bytes cannot establish funded state, proof acceptance or finality. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildSyntheticEnvelopeFixture } from '../../../../../../tests/integration/fixtures/proofs/envelopes/synthetic-envelope-fixture.mjs';
import { FIELD_MODULUS, encodeStatement } from '@lianum/components/encoding/statements';
import { validateFlatExecutionPreparation, assertOwnedFlatNativeExecution } from '../../../../src/execution/account/execution/flat-native-execution.mjs';
import { assertOwnedFlatNativeProvider } from '../../../../src/providers/native-provider.mjs';
import { assertOwnedFlatEvmVaultProvider } from '../../../../src/providers/evm-vault-provider.mjs';

const testHash = async fields => (BigInt('0x' + createHash('sha256').update(fields.map(String).join(',')).digest('hex'))
  % FIELD_MODULUS).toString(16).padStart(64, '0');

test('same owner handoff retains exact recovery/source bindings and rejects substitutions', async () => {
  const fixture = await buildSyntheticEnvelopeFixture({ hashFields: testHash });
  try {
    const prepared = { authorization: { proof: '11'.repeat(32),
      publicInputs: encodeStatement('authorization', fixture.public.statements.authorization) }, rolePackets: fixture.scoped };
    const accepted = await validateFlatExecutionPreparation(prepared, fixture.public.domain, testHash);
    assert.equal(accepted.binding.reserveNullifier, fixture.scoped.recovery.recovery.value.reserveNullifier);
    assert.equal(accepted.binding.recoveryCommitment, fixture.scoped.recovery.recovery.value.recoveryCommitment);
    assert.equal(accepted.binding.inputNullifier, fixture.scoped.reservation.funding.value.inputNullifier);
    assert.equal(accepted.binding.settleBefore, fixture.scoped.recovery.recovery.value.settleBefore);
    for (const mutate of [
      value => { value.rolePackets.recovery.recovery.value.recoveryCommitment = '12'.repeat(32); },
      value => { value.rolePackets.recovery.recovery.value.reserveNullifier = '13'.repeat(32); },
      value => { value.rolePackets.local[1] = value.rolePackets.local[0]; },
      value => { value.rolePackets.dependency[1].envelope = '00'.repeat(31) + '01'; },
      value => { value.rolePackets.assembler.payouts.reverse(); },
    ]) {
      const changed = structuredClone(prepared); mutate(changed);
      await assert.rejects(validateFlatExecutionPreparation(changed, fixture.public.domain, testHash));
    }
    let invoked = false;
    const malicious = { get authorization() { invoked = true; return prepared.authorization; }, rolePackets: fixture.scoped };
    await assert.rejects(validateFlatExecutionPreparation(malicious, fixture.public.domain, testHash));
    assert.equal(invoked, false);
  } finally { fixture.destroy(); }
});

test('execution/provider lookalikes never create owned capabilities', () => {
  assert.throws(() => assertOwnedFlatNativeExecution({}, { runtime: {}, system: {}, poolIndex: 0 }), /OWNED_CAPABILITY/);
  assert.throws(() => assertOwnedFlatNativeProvider({}, {}), /OWNED_CAPABILITY/);
  assert.throws(() => assertOwnedFlatEvmVaultProvider({}, {}), /OWNED_CAPABILITY/);
});
