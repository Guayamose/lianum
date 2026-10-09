/** Exact family-3 semantic variants. These codecs never grant dispatch or facts
 * authority. The original router/observer/provider brands remain mandatory. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exactRecord, bytes32 } from '../../../execution/encoding/commitments.mjs';
import { validateEvmVaultDeliveryDescriptor, evmVaultDeliveryDescriptorCommitment,
  encodeEvmVaultDeliveryCall, decodeEvmVaultDeliveryCall } from '../vault/evm-vault-delivery.mjs';
import { preparePrivateExternalDelivery, encodePrivateExternalDelivery,
  decodePrivateExternalDeliveryCall } from '../../../defi/delivery/private-external-delivery.mjs';

export const METAMORPHO_GRAPH_DELIVERY_PROFILE_V1 = 'LIANUM_FLAT_METAMORPHO_GRAPH_DELIVERY_V1';
export const UNISWAP_GRAPH_DELIVERY_PROFILE_V1 = 'LIANUM_FLAT_UNISWAP_V3_GRAPH_DELIVERY_V1';
export const AAVE_STATIC_GRAPH_DELIVERY_PROFILE_V1 = 'LIANUM_FLAT_AAVE_STATIC_GRAPH_DELIVERY_V1';
const CONTEXT = ['genesisHash', 'ledgerNamespace', 'sourceLedgerNamespace',
  'sourceAssetIdentity', 'targetAssetIdentity', 'routerRuntimeCodeSHA256'];
const freeze = value => { if (value && typeof value === 'object') {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const copy = value => freeze(structuredClone(value));
const sha = value => createHash('sha256').update(value).digest('hex');
const word = value => BigInt(value).toString(16).padStart(64, '0');

/** A discriminator selects framing only; it never creates an owned brand. */
export function isMetaMorphoGraphDescriptorV1(value) {
  return Object.getOwnPropertyDescriptor(value ?? {}, 'profile')?.value === METAMORPHO_GRAPH_DELIVERY_PROFILE_V1;
}
export function isUniswapGraphDescriptorV1(value) {
  return Object.getOwnPropertyDescriptor(value ?? {}, 'profile')?.value === UNISWAP_GRAPH_DELIVERY_PROFILE_V1;
}
export function isAaveStaticGraphDescriptorV1(value) { return Object.getOwnPropertyDescriptor(value ?? {}, 'profile')?.value === AAVE_STATIC_GRAPH_DELIVERY_PROFILE_V1; }
export const isExternalGraphDescriptorV1 = value => isMetaMorphoGraphDescriptorV1(value) || isUniswapGraphDescriptorV1(value) || isAaveStaticGraphDescriptorV1(value);
export function validateEvmGraphDeliveryDescriptorV1(value) {
  if (!Object.hasOwn(value ?? {}, 'profile')) return validateEvmVaultDeliveryDescriptor(value);
  exactRecord(value, ['profile', 'context', 'plan']);
  assert.ok(isExternalGraphDescriptorV1(value), 'EVM_GRAPH_UNKNOWN_DESCRIPTOR_PROFILE');
  exactRecord(value.context, CONTEXT); CONTEXT.forEach(key => bytes32(value.context[key], true));
  assert.equal(value.context.sourceLedgerNamespace, value.context.ledgerNamespace, 'EVM_GRAPH_CROSS_LEDGER_NOT_ACCEPTED');
  assert.notEqual(value.context.sourceAssetIdentity, value.context.targetAssetIdentity, 'EVM_GRAPH_DISTINCT_ASSETS');
  preparePrivateExternalDelivery(value.plan);
  assert.equal(value.plan.identity.chainId, '31337', 'EVM_GRAPH_LOCAL_CHAIN');
  if (isUniswapGraphDescriptorV1(value)) {
    assert.equal(value.plan.protocolKind, 'UNISWAP_V3_EXACT_OUTPUT_SINGLE', 'EVM_GRAPH_UNISWAP_ONLY');
    assert.equal(value.plan.fee, '3000', 'EVM_GRAPH_UNISWAP_FIXED_FEE');
    assert.notEqual(value.plan.identity.protocol, value.plan.identity.outputAsset, 'EVM_GRAPH_UNISWAP_DISTINCT_PROTOCOL');
  } else {
    assert.equal(value.plan.protocolKind, isAaveStaticGraphDescriptorV1(value) ? 'AAVE_V3_STATIC_EXACT_SHARE_MINT' : 'METAMORPHO_V1_EXACT_SHARE_MINT', 'EVM_GRAPH_METAMORPHO_ONLY');
    assert.equal(value.plan.fee, null, 'EVM_GRAPH_METAMORPHO_FEE');
    assert.equal(value.plan.identity.protocol, value.plan.identity.outputAsset, 'EVM_GRAPH_ORIGINAL_SHARE_TOKEN');
  }
  return copy(value);
}
/** Normalize semantic fields for the unchanged native dispatch/journal/PAEG.
 * maximumInput is a limit, never an observed protocol debit. */
export function evmGraphDeliveryTermsV1(descriptor) {
  validateEvmGraphDeliveryDescriptorV1(descriptor);
  if (!isExternalGraphDescriptorV1(descriptor)) return copy(descriptor);
  const { plan, context } = descriptor, id = plan.identity, route = plan.route;
  return copy({ identity: { chainId: id.chainId, genesisHash: context.genesisHash,
    ledgerNamespace: context.sourceLedgerNamespace, assetIdentity: context.sourceAssetIdentity,
    shareIdentity: context.targetAssetIdentity, solver: id.solver, router: id.router,
    asset: id.inputAsset, vault: id.outputAsset, targetPool: id.targetPool },
  route: { assetAmount: route.maximumInput, shareAmount: route.outputAmount,
    executionFrom: route.validFrom, executionUntil: route.validUntil },
  publicInputs: plan.ownerPublicInputs.map(word) });
}
export function evmGraphDeliveryDescriptorCommitmentV1(descriptor) {
  validateEvmGraphDeliveryDescriptorV1(descriptor);
  if (!isExternalGraphDescriptorV1(descriptor)) return evmVaultDeliveryDescriptorCommitment(descriptor);
  const plan = preparePrivateExternalDelivery(descriptor.plan);
  const tag = isUniswapGraphDescriptorV1(descriptor)
    ? 'LIANUM/PAEG/uniswap-v3-exact-output-single-delivery/1' : isAaveStaticGraphDescriptorV1(descriptor)
      ? 'LIANUM/PAEG/aave-v3-static-exact-share-delivery/1' : 'LIANUM/PAEG/metamorpho-exact-share-delivery/1';
  const parts = [Buffer.from(tag),
    ...CONTEXT.map(key => Buffer.from(descriptor.context[key], 'hex')), Buffer.from(plan.descriptor, 'hex')];
  return sha(Buffer.concat(parts.flatMap(part => {
    const size = Buffer.alloc(4); size.writeUInt32BE(part.length); return [size, part];
  })));
}
export function encodeEvmGraphDeliveryCallV1(intent) {
  exactRecord(intent, ['descriptor', 'receiptKeyCommitment', 'proof']);
  validateEvmGraphDeliveryDescriptorV1(intent.descriptor);
  if (!isExternalGraphDescriptorV1(intent.descriptor)) return encodeEvmVaultDeliveryCall(intent);
  return encodePrivateExternalDelivery({ plan: intent.descriptor.plan,
    receiptCommitment: intent.receiptKeyCommitment, proof: intent.proof }).calldata;
}
/** The context is supplied only by a retained original router descriptor.
 * Canonical inclusion, code and source/target domain checks remain the observer. */
export function decodeEvmGraphDeliveryCallV1(calldata, descriptor) {
  validateEvmGraphDeliveryDescriptorV1(descriptor);
  if (!isExternalGraphDescriptorV1(descriptor)) {
    const call = decodeEvmVaultDeliveryCall(calldata, descriptor.identity);
    return copy({ descriptor: call.descriptor, receiptKeyCommitment: call.receiptKeyCommitment, proof: call.proof });
  }
  const { plan } = descriptor;
  const call = decodePrivateExternalDeliveryCall({ calldata, identity: plan.identity,
    protocolKind: plan.protocolKind, fee: plan.fee });
  const result = { descriptor: { profile: descriptor.profile, context: descriptor.context, plan: call.plan },
    receiptKeyCommitment: call.receiptCommitment, proof: call.proof };
  assert.equal(encodeEvmGraphDeliveryCallV1(result), calldata, 'EVM_GRAPH_CANONICAL_CALLDATA');
  return copy(result);
}

/** Supplied-trace arithmetic only, never a delivery, price or solvency grant.
 * The original observer supplies these values after verifying the same signed
 * transaction, receipt, D27, protocol transition and canonical source/target.
 * Keep source-token debits, output-token backing and native gas in their own
 * units. No fee is added to inputSpent, no share NAV or net wealth is inferred. */
export function inspectEvmGraphDeliveryEconomicsV1(input) {
  exactRecord(input, ['descriptor', 'transactionHash', 'blockHash', 'observedHeadHash',
    'solverInputBefore', 'solverInputAfter', 'inputSpent', 'outputDelivered',
    'gasUsed', 'gasPrice', 'nativeBalanceBefore', 'nativeBalanceAfter', 'targetBacking']);
  const descriptor = validateEvmGraphDeliveryDescriptorV1(input.descriptor);
  assert.ok(isExternalGraphDescriptorV1(descriptor), 'EVM_GRAPH_ECONOMIC_OFFICIAL_DESCRIPTOR');
  for (const key of ['transactionHash', 'blockHash', 'observedHeadHash']) bytes32(input[key], true);
  const uint = (value, positive = false) => {
    assert.ok(typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value), 'EVM_GRAPH_ECONOMIC_INTEGER');
    const n = BigInt(value); assert.ok(n < (1n << 256n) && (!positive || n > 0n), 'EVM_GRAPH_ECONOMIC_INTEGER'); return n;
  };
  const before = uint(input.solverInputBefore), after = uint(input.solverInputAfter), spent = uint(input.inputSpent, true);
  assert.equal(before - after, spent, 'EVM_GRAPH_ECONOMIC_INPUT_DELTA');
  assert.ok(spent <= uint(descriptor.plan.route.maximumInput, true), 'EVM_GRAPH_ECONOMIC_INPUT_LIMIT');
  assert.equal(input.outputDelivered, descriptor.plan.route.outputAmount, 'EVM_GRAPH_ECONOMIC_OUTPUT');
  const gas = uint(input.gasUsed, true) * uint(input.gasPrice, true); uint(gas.toString());
  assert.equal(uint(input.nativeBalanceBefore) - uint(input.nativeBalanceAfter), gas, 'EVM_GRAPH_ECONOMIC_GAS_DELTA');
  exactRecord(input.targetBacking, ['held', 'liabilities', 'surplus']);
  const held = uint(input.targetBacking.held), liabilities = uint(input.targetBacking.liabilities);
  assert.ok(held >= liabilities, 'EVM_GRAPH_ECONOMIC_BACKING_DEFICIT');
  assert.equal(held - liabilities, uint(input.targetBacking.surplus), 'EVM_GRAPH_ECONOMIC_BACKING_SURPLUS');
  return copy({ profile: 'ORIGINAL_EVM_DEFI_DELIVERY_ECONOMICS_V1', status: 'OBSERVED', transactionHash: input.transactionHash,
    blockHash: input.blockHash, observedHeadHash: input.observedHeadHash,
    descriptorCommitment: evmGraphDeliveryDescriptorCommitmentV1(descriptor),
    sourceAssetIdentity: descriptor.context.sourceAssetIdentity, targetAssetIdentity: descriptor.context.targetAssetIdentity,
    maximumInputAtomic: descriptor.plan.route.maximumInput, actualInputSpentAtomic: input.inputSpent,
    unusedMaximumInputAtomic: String(BigInt(descriptor.plan.route.maximumInput) - spent),
    solverInputBeforeAtomic: input.solverInputBefore, solverInputAfterAtomic: input.solverInputAfter,
    deliveredOutputAtomic: input.outputDelivered, nativeGasCostWei: gas.toString(), nativeGasPayer: descriptor.plan.identity.solver,
    protocolFeeRateMillionths: isUniswapGraphDescriptorV1(descriptor) ? descriptor.plan.fee : null,
    protocolFeeSeparatelyValuedAtomic: null, protocolFeeAddedToInputSpent: false,
    targetBacking: { ...input.targetBacking, deficit: '0' },
    scope: 'ORIGINAL_CANONICAL_DELIVERY_AND_OBSERVED_HEAD_ONLY',
    futureSolvencyEstablished: false, netSolverWealthLossEstablished: false, outputsValuedAsSourceAtomic: false });
}
