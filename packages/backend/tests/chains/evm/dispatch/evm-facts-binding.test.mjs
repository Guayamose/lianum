/** Pure synthetic standard-signature fixtures, never native acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateEvmDeliveryWire, evmFundingEndpointCommitment } from '../../../../src/chains/evm/dispatch/evm-facts-binding.mjs';
import { evmVaultDeliveryDescriptorCommitment } from '@lianum/engine/encoding/evm-vault-delivery';
import { evmDeliveryFixture, signedDeliveryWire } from '../../../fixtures/chains/evm/transfers/test-fixtures/evm-delivery-wire.mjs';

test('EVM wire joins signed sender, exact calldata, full SHA and canonical identity', () => {
  const f = evmDeliveryFixture(), result = validateEvmDeliveryWire(f.nativeWire, f.intent);
  assert.equal(result.nativeId, f.nativeId); assert.equal(result.transactionId, f.nativeId + '0'.repeat(64));
  assert.equal(result.transactionSHA256, f.transactionSHA256);
  assert.equal(result.wireKeyCommitment, f.intent.receiptKeyCommitment);
  assert.equal(result.destinationCommitment, evmVaultDeliveryDescriptorCommitment(f.intent.descriptor));
  assert.equal(result.amount, '100'); assert.notEqual(result.amount, f.intent.descriptor.route.assetAmount);
  assert.deepEqual([result.effectIndex, result.wireBindingVersion, result.wireBindingKind, result.wireBindingPosition], ['0', '1', '3', '0']);
  assert.ok(Object.isFrozen(result));
  for (const patch of [{ chainId: '31338' }, { to: '11'.repeat(20) }, { value: '1' }, { data: '0x12345678' }])
    assert.throws(() => validateEvmDeliveryWire(signedDeliveryWire(f.intent, patch).nativeWire, f.intent));
});

test('every descriptor/proof/K substitution is bound; re-signed alternate calls have different identity', () => {
  const f = evmDeliveryFixture();
  for (const change of [call => { call.proof = 'cafebabe'; }, call => { call.receiptKeyCommitment = '11'.repeat(32); },
    call => { call.descriptor.identity.solver = '12'.repeat(20); }, call => { call.descriptor.identity.targetPool = '13'.repeat(20); },
    call => { call.descriptor.publicInputs[26] = '14'.padStart(64, '0'); },
    call => { call.descriptor.route.executionUntil = '1099'; }]) {
    const changed = structuredClone(f.intent); change(changed);
    assert.throws(() => validateEvmDeliveryWire(f.nativeWire, changed));
  }
  const alternate = { ...f.intent, proof: 'cafebabe' }, signed = signedDeliveryWire(alternate);
  const result = validateEvmDeliveryWire(signed.nativeWire, alternate);
  assert.equal(result.destinationCommitment, evmVaultDeliveryDescriptorCommitment(f.intent.descriptor));
  assert.notEqual(result.nativeId, f.nativeId); assert.notEqual(result.transactionSHA256, f.transactionSHA256);
});

test('EVM funding endpoint matches independent H4 frame and strict address widths', () => {
  const f = evmDeliveryFixture(), input = { genesis: f.rule.genesis, asset: f.rule.asset, address: f.identity.solver };
  const parts = [Buffer.from('LIANUM/PAEG/native-endpoint/2'), Buffer.from('LIANUM_PAEG_NATIVE_4_V2'),
    Buffer.from('EVM'), Buffer.from(input.genesis, 'hex'), Buffer.from(input.asset, 'hex'),
    Buffer.from('EVM_ADDRESS'), Buffer.from(input.address, 'hex')];
  const frame = Buffer.concat(parts.flatMap(part => { const n = Buffer.alloc(4); n.writeUInt32BE(part.length); return [n, part]; }));
  assert.equal(evmFundingEndpointCommitment(input), createHash('sha256').update(frame).digest('hex'));
  for (const address of ['0x' + input.address, input.address.toUpperCase(), '00'.repeat(20), input.address + '\n'])
    assert.throws(() => evmFundingEndpointCommitment({ ...input, address }));
  for (const nativeWire of ['0x' + f.nativeWire, f.nativeWire + '00', f.nativeWire.toUpperCase(), f.nativeWire + '\n'])
    assert.throws(() => validateEvmDeliveryWire(nativeWire, f.intent));
  let accessed = false; const intent = { ...f.intent };
  Object.defineProperty(intent, 'proof', { enumerable: true, get() { accessed = true; return 'deadbeef'; } });
  assert.throws(() => validateEvmDeliveryWire(f.nativeWire, intent)); assert.equal(accessed, false);
});
