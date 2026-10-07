/** Existing empty-calldata native-value profile. The shared parser is not an
 * opt-in to graph memos, contract execution, signing or private credit. */
import { decodeEvmSignedTransactionWire } from './evm-signed-transaction-wire.mjs';
import { fields, need, freeze, unsignedDecimal, hash32 } from '../../shared/portfolio/portfolio-registry.mjs';

export function decodeEvmNativeTransferWire(nativeWire) {
  const decoded = decodeEvmSignedTransactionWire(nativeWire);
  // Bounded native-value transaction profile. This does not assert that the
  // recipient has no code/delegation or retains the value after execution.
  need(decoded.to !== null && decoded.data === '0x' && BigInt(decoded.value) > 0n
    && BigInt(decoded.value) < (1n << 128n) && BigInt(decoded.gas) >= 21000n
    && decoded.from !== decoded.to && !/^0x0+$/.test(decoded.to), 'EVM_TRANSFER_NATIVE_VALUE_PROFILE');
  return decoded;
}

export function bindOriginalEvmNativeTransfer(raw, chainId) {
  const original = fields(raw, ['nativeWire', 'expected'], ['inclusion'], true);
  const expected = fields(original.expected, ['nativeId', 'from', 'to', 'value', 'nonce'], [], true);
  hash32(expected.nativeId, false); unsignedDecimal(expected.value, 128); unsignedDecimal(expected.nonce, 256);
  for (const key of ['from', 'to']) need(typeof expected[key] === 'string'
    && /^0x[0-9a-f]{40}$/.exec(expected[key])?.[0] === expected[key], 'EVM_TRANSFER_EXPECTED_ADDRESS');
  const signed = decodeEvmNativeTransferWire(original.nativeWire);
  need(signed.chainId === chainId && signed.nativeId.slice(2) === expected.nativeId, 'EVM_TRANSFER_ORIGINAL_IDENTITY');
  for (const key of ['from', 'to', 'value', 'nonce']) need(signed[key] === expected[key], 'EVM_TRANSFER_ORIGINAL_INTENT');
  const inclusion = original.inclusion === undefined ? null : normalizeRetainedTransferInclusion(original.inclusion);
  return freeze({ signed, inclusion });
}
export function normalizeRetainedTransferInclusion(raw) {
  const value = fields(raw, ['blockId', 'blockHeight', 'transactionIndex', 'receiptCommitment'], [], true);
  hash32(value.blockId, false); hash32(value.receiptCommitment, false);
  unsignedDecimal(value.blockHeight, 64); unsignedDecimal(value.transactionIndex, 64);
  return freeze(value);
}
