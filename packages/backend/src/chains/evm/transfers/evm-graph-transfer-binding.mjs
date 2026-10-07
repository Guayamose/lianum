/** INACTIVE codec proposal: exact K-bearing EVM native-value wire and Action
 * expectations. No facts, admission, RPC, signer, dispatcher or credit issuer.
 * A valid wire can still execute recipient code, including delegated EOA code.
 */
import { createHash } from 'node:crypto';
import { fields, need, freeze, unsignedDecimal, hash32 } from '../../shared/portfolio/portfolio-registry.mjs';
import { decodeEvmSignedTransactionWire } from './evm-signed-transaction-wire.mjs';
import { normalizeRetainedTransferInclusion } from './evm-native-transfer-wire.mjs';
import { evmNativeTransferNetwork } from '../observations/evm-native-transfer-observer.mjs';
import { evmFundingEndpointCommitment } from '../dispatch/evm-facts-binding.mjs';
import { encodeWireCommitment, decodeWireCommitment, nativeFactIdentity,
  nativeCustodyCommitment } from '../../shared/dispatch/native-receipt-binding.mjs';
import { fundedFrame } from '../../../../../engine/src/execution/graph/funded-graph.mjs';
import { nativeTransferActionCommitment } from '../../../../../engine/src/execution/native/dispatch/native-capsules.mjs';

const ZERO = '0'.repeat(64), bindings = new WeakSet();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const exact = (raw, names, optional = []) => fields(raw, names, optional, true);
const EXPECTED = ['nativeId', 'chainId', 'genesisHash', 'from', 'to', 'value', 'nonce',
  'type', 'gas', 'fees', 'wireKeyCommitment'];
const ACTION = ['chainDomain', 'signerIdentity', 'sourceCommitment', 'destinationCommitment',
  'amount', 'custodyKind', 'custodyCommitment', 'executionFrom', 'executionUntil', 'settleBefore',
  'receiptKeyCommitment', 'receiptRho', 'deliveryRiskCommitment', 'actionSalt'];

/** Only the existing public K commitment is accepted, never its secret or
 * caller-selected calldata. This is exactly the BTC/SOL LNRB1 byte contract. */
export function encodeEvmGraphTransferMemo(wireKeyCommitment) {
  return '0x' + encodeWireCommitment(wireKeyCommitment).toString('hex');
}

/** Private integration bootstrap supplies the authenticated expected network.
 * The signed chain ID is checked; genesis is NOT encoded in an EVM transaction.
 * Matching two expected genesis values is no proof that either was observed.
 * Fee caps/gas limit are exact signed intent, not gas used or paid-fee claims.
 */
export function bindOriginalEvmGraphTransfer(raw, expectedNetwork) {
  const original = exact(raw, ['nativeWire', 'expected'], ['inclusion']);
  const expected = exact(original.expected, EXPECTED);
  const network = evmNativeTransferNetwork(expectedNetwork);
  hash32(expected.nativeId, false); hash32(expected.genesisHash); hash32(expected.wireKeyCommitment, false);
  for (const name of ['chainId', 'nonce', 'gas']) unsignedDecimal(expected[name], 256);
  unsignedDecimal(expected.value, 128);
  for (const name of ['from', 'to']) need(typeof expected[name] === 'string'
    && /^0x[0-9a-f]{40}$/.exec(expected[name])?.[0] === expected[name], 'EVM_GRAPH_EXPECTED_ADDRESS');
  need(['0', '1', '2'].includes(expected.type), 'EVM_GRAPH_EXPECTED_TYPE');
  const feeNames = expected.type === '2' ? ['maxPriorityFeePerGas', 'maxFeePerGas'] : ['gasPrice'];
  const fees = exact(expected.fees, feeNames);
  for (const name of feeNames) unsignedDecimal(fees[name], 256);
  need(expected.chainId === network.chainId && expected.genesisHash === network.genesisHash,
    'EVM_GRAPH_EXPECTED_NETWORK');

  const signed = decodeEvmSignedTransactionWire(original.nativeWire);
  need(signed.chainId === network.chainId && signed.nativeId.slice(2) === expected.nativeId,
    'EVM_GRAPH_ORIGINAL_IDENTITY');
  for (const name of ['type', 'from', 'to', 'value', 'nonce', 'gas'])
    need(signed[name] === expected[name], 'EVM_GRAPH_ORIGINAL_INTENT');
  for (const name of feeNames) need(signed[name] === fees[name], 'EVM_GRAPH_ORIGINAL_FEES');
  need(signed.to !== null && signed.from !== signed.to && !/^0x0+$/.test(signed.to)
    && BigInt(signed.value) > 0n && BigInt(signed.value) < (1n << 128n), 'EVM_GRAPH_NATIVE_VALUE_PROFILE');
  // Access lists are valid EIP syntax but outside this narrow action profile.
  need(signed.accessList.length === 0, 'EVM_GRAPH_EMPTY_ACCESS_LIST_REQUIRED');
  const data = encodeEvmGraphTransferMemo(expected.wireKeyCommitment);
  need(signed.data === data, 'EVM_GRAPH_EXACT_K_MEMO');
  const wireKeyCommitment = decodeWireCommitment(Buffer.from(signed.data.slice(2), 'hex'));
  // Conservative shared profile floor also covers the EIP-7623 calldata
  // floor: all 70 ASCII bytes are nonzero. This is NOT a gas estimate or a
  // claim of fork activation; L2 charges, execution and block limits are unverified.
  need(BigInt(signed.gas) >= 21000n + 40n * 70n, 'EVM_GRAPH_MEMO_INTRINSIC_GAS_FLOOR');

  const genesis = network.genesisHash.slice(2), asset = network.nativeAssetCommitment;
  const nativeId = signed.nativeId.slice(2), transactionId = nativeId + ZERO;
  const sourceCommitment = evmFundingEndpointCommitment({ genesis, asset, address: signed.from.slice(2) });
  const destinationCommitment = evmFundingEndpointCommitment({ genesis, asset, address: signed.to.slice(2) });
  // Reuse existing EVM family/GID/endpoint frames without registering new
  // facts semantics. In particular no wireBindingKind/Version is assigned.
  const identity = { family: '3', genesis, asset, nativeId, transactionId, effectIndex: '0',
    nativeGid: nativeFactIdentity({ family: '3', genesis, asset, transactionId, effectIndex: '0' }),
    transactionSHA256: signed.transactionSHA256, from: signed.from, to: signed.to,
    amount: signed.value, nonce: signed.nonce, transactionType: signed.type,
    sourceCommitment, destinationCommitment };
  const chainDomain = sha(fundedFrame('LIANUM/evidence-chain/1',
    [Buffer.from('EVM'), Buffer.from(genesis, 'hex'), Buffer.from(asset, 'hex')]));
  const actionTerms = { chainDomain, sourceCommitment, destinationCommitment, amount: signed.value,
    custodyKind: 1, custodyCommitment: nativeCustodyCommitment({ family: '3', genesis, asset,
      sourceCommitment, destinationCommitment }), receiptKeyCommitment: wireKeyCommitment };
  const inclusion = original.inclusion === undefined ? null : normalizeRetainedTransferInclusion(original.inclusion);
  const result = freeze({ schema: 'flat-evm-graph-transfer-wire-binding/1', network, signed, inclusion,
    identity, wireKeyCommitment, actionTerms, assurance: 'exact-signed-wire-and-action-expectations-only',
    networkGenesisVerified: false, recipientCodeVerified: false, recipientControlVerified: false,
    permissionVerified: false, finalityVerified: false, deliveryVerified: false,
    graphAdmissionEligible: false, creditEligible: false, privateSpendableAtomic: null });
  bindings.add(result); return result;
}

/** A full existing PAEG Action is structurally validated and matched to exact
 * wire expectations. This neither authenticates its owner nor checks P/R,
 * current state, registry membership, signer authority or the loss agreement.
 * Brand only prevents copied wire-result shapes from passing this helper.
 */
export function assertEvmGraphTransferAction(binding, rawAction) {
  need(bindings.has(binding), 'EVM_GRAPH_WIRE_BINDING_PROVENANCE');
  const action = exact(rawAction, ACTION);
  const commitment = nativeTransferActionCommitment(action);
  for (const [name, value] of Object.entries(binding.actionTerms))
    need(action[name] === value, 'EVM_GRAPH_ACTION_WIRE_MISMATCH');
  return commitment;
}
