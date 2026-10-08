/** Pure EVM delivery wire and endpoint framing. Parsing a valid signature or
 * call does not establish canonical execution, backing or reader ownership. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exactRecord } from '../../../execution/encoding/commitments.mjs';
import { decodeCanonicalEvmTransaction } from '../runtime/owned-evm-v2-runtime.mjs';
import { encodeEvmGraphDeliveryCallV1, evmGraphDeliveryDescriptorCommitmentV1, evmGraphDeliveryTermsV1 }
  from './evm-graph-delivery-codec-v1.mjs';

const ZERO = '0'.repeat(64);
const sha = value => createHash('sha256').update(value).digest('hex');
function hex(value, bytes) {
  assert.ok(typeof value === 'string' && value.length === bytes * 2
    && /^[0-9a-f]+$/.test(value) && /[1-9a-f]/.test(value), 'EVM_FACTS_HEX');
  return Buffer.from(value, 'hex');
}

/** Existing H4 native-endpoint/2 domain with raw twenty-byte EVM address. */
export function evmFundingEndpointCommitment(input) {
  exactRecord(input, ['genesis', 'asset', 'address']);
  const parts = [Buffer.from('LIANUM/PAEG/native-endpoint/2'), Buffer.from('LIANUM_PAEG_NATIVE_4_V2'),
    Buffer.from('EVM'), hex(input.genesis, 32), hex(input.asset, 32), Buffer.from('EVM_ADDRESS'), hex(input.address, 20)];
  return sha(Buffer.concat(parts.flatMap(part => {
    const size = Buffer.alloc(4); size.writeUInt32BE(part.length); return [size, part];
  })));
}

/** Bare lowercase complete signed wire, exact descriptor/K/proof call. Native
 * nonce/gas/fees are authenticated by the standard decoder; execution and the
 * original prepared transaction remain the branded reader's responsibility. */
export function validateEvmDeliveryWire(nativeWire, intent) {
  const calldata = encodeEvmGraphDeliveryCallV1(intent);
  assert.ok(typeof nativeWire === 'string' && nativeWire.length > 0 && nativeWire.length <= 262144
    && /^(?:[0-9a-f]{2})+$/.test(nativeWire), 'EVM_FACTS_SIGNED_WIRE');
  const signed = decodeCanonicalEvmTransaction('0x' + nativeWire), { identity, route } = evmGraphDeliveryTermsV1(intent.descriptor);
  assert.equal(signed.chainId, identity.chainId, 'EVM_FACTS_CHAIN_ID');
  assert.equal(signed.from, '0x' + identity.solver, 'EVM_FACTS_SOLVER');
  assert.equal(signed.to, '0x' + identity.router, 'EVM_FACTS_ROUTER');
  assert.equal(signed.value, '0', 'EVM_FACTS_NATIVE_VALUE');
  assert.equal(signed.data, calldata, 'EVM_FACTS_FULL_CALLDATA');
  const nativeId = signed.nativeId.slice(2), transactionSHA256 = sha(Buffer.from(nativeWire, 'hex'));
  hex(nativeId, 32); hex(transactionSHA256, 32); hex(intent.receiptKeyCommitment, 32);
  assert.equal(signed.transactionSHA256, transactionSHA256, 'EVM_FACTS_FULL_WIRE_SHA');
  return Object.freeze({ nativeId, transactionId: nativeId + ZERO, transactionSHA256,
    effectIndex: '0', wireBindingVersion: '1', wireBindingKind: '3', wireBindingPosition: '0',
    wireKeyCommitment: intent.receiptKeyCommitment, sourceEndpoint: identity.solver,
    destinationEndpoint: identity.router, sourceCommitment: evmFundingEndpointCommitment({
      genesis: identity.genesisHash, asset: identity.shareIdentity, address: identity.solver }),
    destinationCommitment: evmGraphDeliveryDescriptorCommitmentV1(intent.descriptor), amount: route.shareAmount });
}
