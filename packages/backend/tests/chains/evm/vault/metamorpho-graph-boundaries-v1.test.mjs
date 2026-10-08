/** Pure host boundaries only. No chain, compilation, prover or financial
 * acceptance. The fresh original graph flow still requires real acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { METAMORPHO_GRAPH_DELIVERY_PROFILE_V1, UNISWAP_GRAPH_DELIVERY_PROFILE_V1, validateEvmGraphDeliveryDescriptorV1,
  evmGraphDeliveryTermsV1, evmGraphDeliveryDescriptorCommitmentV1,
  encodeEvmGraphDeliveryCallV1, decodeEvmGraphDeliveryCallV1 }
  from '../../../../src/chains/evm/dispatch/evm-graph-delivery-codec-v1.mjs';
import { encodePrivateExternalDelivery } from '../../../../src/defi/delivery/private-external-delivery.mjs';
import { encodeEvmVaultDeliveryCall, evmVaultDeliveryDescriptorCommitment }
  from '../../../../src/chains/evm/vault/evm-vault-delivery.mjs';
import { assertOwnedEvmGraphDeliveryObserverV1, assertOwnedEvmGraphDeliveryFactsV1,
  assertOwnedEvmGraphDeliveryDescriptorV1 } from '../../../../src/chains/evm/dispatch/owned-evm-graph-delivery-v1.mjs';
import { prepareOwnedMetaMorphoGraphDescriptorV1, assertOwnedMetaMorphoGraphDeliveryFactsV1,
  prepareOwnedUniswapGraphDescriptorV1, assertOwnedUniswapGraphDeliveryFactsV1 }
  from '../../../../src/chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs';

import { validateOwnerGraphReview, canonicalOwnerGraphTerms } from '../../../../../../apps/wallet/src/client/features/accounts/owner-graph-review-v1.mjs';
import { accountReviewDetails } from '../../../../../../apps/wallet/src/client/state/view-model.mjs';

const h = n => n.toString(16).padStart(2, '0').repeat(32), a = n => n.toString(16).padStart(2, '0').repeat(20);
const word = n => BigInt(n).toString(16).padStart(64, '0');
const limbs = hash => hash.match(/.{8}/g).map(value => BigInt('0x' + value).toString());
function official() {
  const scope = h(10), policy = h(11), output = h(12);
  return { profile: METAMORPHO_GRAPH_DELIVERY_PROFILE_V1,
    context: { genesisHash: h(1), ledgerNamespace: h(2), sourceLedgerNamespace: h(2),
      sourceAssetIdentity: h(3), targetAssetIdentity: h(4), routerRuntimeCodeSHA256: h(5) },
    plan: { identity: { chainId: '31337', router: a(1), solver: a(2), inputAsset: a(3), outputAsset: a(4),
      protocol: a(4), targetPool: a(5), inputCode: h(6), outputCode: h(7), protocolCode: h(7),
      poolCode: h(9), scope, policy }, protocolKind: 'METAMORPHO_V1_EXACT_SHARE_MINT', fee: null,
    route: { maximumInput: '1000000', outputAmount: '1000000000000000000', validFrom: '1000', validUntil: '1100' },
    ownerPublicInputs: [...limbs(scope), ...limbs(policy), '900', '1200', '1000000000000000000', ...limbs(output)] } };
}
test('official calldata remains the original D27 mint while PAEG binds chain, namespace and source asset', () => {
  const descriptor = official(), intent = { descriptor, receiptKeyCommitment: h(13), proof: 'deadbeef' };
  const calldata = encodeEvmGraphDeliveryCallV1(intent);
  assert.equal(calldata, encodePrivateExternalDelivery({ plan: descriptor.plan, receiptCommitment: h(13), proof: intent.proof }).calldata);
  assert.deepEqual(decodeEvmGraphDeliveryCallV1(calldata, descriptor), intent);
  const commitment = evmGraphDeliveryDescriptorCommitmentV1(descriptor);
  for (const key of ['genesisHash', 'sourceAssetIdentity', 'routerRuntimeCodeSHA256']) {
    const changed = structuredClone(descriptor); changed.context[key] = h(30);
    assert.notEqual(evmGraphDeliveryDescriptorCommitmentV1(changed), commitment);
    assert.equal(encodeEvmGraphDeliveryCallV1({ ...intent, descriptor: changed }), calldata);
  }
  const changed = structuredClone(descriptor); changed.context.ledgerNamespace = changed.context.sourceLedgerNamespace = h(31);
  assert.notEqual(evmGraphDeliveryDescriptorCommitmentV1(changed), commitment);
  assert.equal(evmGraphDeliveryTermsV1(descriptor).route.assetAmount, '1000000');
});
test('descriptor and calldata reject unsupported protocols, crossed ledgers and a substituted owner output', () => {
  const intent = { descriptor: official(), receiptKeyCommitment: h(13), proof: 'deadbeef' };
  for (const mutate of [d => d.profile = 'METAMORPHO_CALLER_PROFILE', d => d.context.sourceLedgerNamespace = h(32),
    d => d.plan.protocolKind = 'UNISWAP_V3_EXACT_OUTPUT_SINGLE', d => d.plan.identity.chainId = '1',
    d => d.plan.route.outputAmount = '1000', d => d.plan.ownerPublicInputs[18] = '0']) {
    const changed = structuredClone(intent.descriptor); mutate(changed);
    assert.throws(() => validateEvmGraphDeliveryDescriptorV1(changed));
  }
  const encoded = encodeEvmGraphDeliveryCallV1(intent), rebound = structuredClone(intent.descriptor);
  rebound.plan.ownerPublicInputs.splice(19, 8, ...limbs(h(33)));
  assert.notEqual(evmGraphDeliveryDescriptorCommitmentV1(rebound), evmGraphDeliveryDescriptorCommitmentV1(intent.descriptor));
  assert.notEqual(encodeEvmGraphDeliveryCallV1({ ...intent, descriptor: rebound }), encoded);
  assert.throws(() => decodeEvmGraphDeliveryCallV1(encoded + '00', intent.descriptor));
});
test('legacy vault framing and calldata are preserved exactly', () => {
  const identity = { chainId: '31337', genesisHash: h(1), ledgerNamespace: h(2), adapterVersion: '1',
    router: a(3), routerCodeSHA256: h(4), routerVersion: '1', solver: a(5), asset: a(6), assetCodeSHA256: h(7),
    assetIdentity: h(8), vault: a(9), vaultCodeSHA256: h(10), shareIdentity: h(11), vaultDomain: h(12), vaultRuntimeId: h(13),
    targetPool: a(14), targetPoolCodeSHA256: h(15), targetDomain: h(16), targetScope: h(17), targetPolicy: h(18) };
  const descriptor = { identity, route: { assetAmount: '100', shareAmount: '100', executionFrom: '1000', executionUntil: '1100' },
    publicInputs: [...limbs(identity.targetScope), ...limbs(identity.targetPolicy), '900', '1200', '100', ...limbs(h(19))].map(word) };
  const intent = { descriptor, receiptKeyCommitment: h(20), proof: 'deadbeef' };
  assert.equal(evmGraphDeliveryDescriptorCommitmentV1(descriptor), evmVaultDeliveryDescriptorCommitment(descriptor));
  assert.equal(encodeEvmGraphDeliveryCallV1(intent), encodeEvmVaultDeliveryCall(intent));
});
test('a valid descriptor, copied observer and fabricated facts acquire no original authority', () => {
  const descriptor = official(), runtime = Object.freeze({}), system = Object.freeze({}), router = Object.freeze({ destinationPoolIndex: 1 });
  const observer = Object.freeze({ identity: descriptor.plan.identity,
    binding: Object.freeze({ poolIndex: 1, recipientIndex: '1', genesis: h(1), asset: h(4), sourceEndpoint: a(2), destinationEndpoint: a(1) }),
    profile: METAMORPHO_GRAPH_DELIVERY_PROFILE_V1 });
  assert.throws(() => assertOwnedEvmGraphDeliveryObserverV1(observer, { runtime, system, poolIndex: 1 }));
  assert.throws(() => assertOwnedEvmGraphDeliveryDescriptorV1(runtime, system, router, observer, descriptor));
  assert.throws(() => prepareOwnedMetaMorphoGraphDescriptorV1({ observer, router, route: descriptor.plan.route,
    ownerPublicInputs: descriptor.plan.ownerPublicInputs }));
  const fabricated = Object.freeze({ status: 'observed', intent: { descriptor, receiptKeyCommitment: h(13), proof: 'deadbeef' } });
  assert.throws(() => assertOwnedEvmGraphDeliveryFactsV1(fabricated, { observer }));
  assert.throws(() => assertOwnedMetaMorphoGraphDeliveryFactsV1(fabricated, { observer }));
});

function uniswap() {
  const descriptor = official(); descriptor.profile = UNISWAP_GRAPH_DELIVERY_PROFILE_V1;
  descriptor.plan.protocolKind = 'UNISWAP_V3_EXACT_OUTPUT_SINGLE'; descriptor.plan.fee = '3000';
  descriptor.plan.identity.protocol = a(6); descriptor.plan.identity.protocolCode = h(8);
  descriptor.plan.route.maximumInput = '2000'; descriptor.plan.route.outputAmount = '1000';
  descriptor.plan.ownerPublicInputs[18] = '1000'; return descriptor;
}
test('fixed Uniswap framing preserves the original exact-output D27 wire and rejects fee, protocol, ledger and owner substitution', () => {
  const descriptor = uniswap(), intent = { descriptor, receiptKeyCommitment: h(13), proof: 'deadbeef' };
  const calldata = encodeEvmGraphDeliveryCallV1(intent);
  assert.equal(calldata, encodePrivateExternalDelivery({ plan: descriptor.plan, receiptCommitment: h(13), proof: intent.proof }).calldata);
  assert.deepEqual(decodeEvmGraphDeliveryCallV1(calldata, descriptor), intent);
  const commitment = evmGraphDeliveryDescriptorCommitmentV1(descriptor);
  assert.notEqual(commitment, evmGraphDeliveryDescriptorCommitmentV1(official()));
  for (const key of ['genesisHash', 'sourceAssetIdentity', 'targetAssetIdentity', 'routerRuntimeCodeSHA256']) {
    const changed = structuredClone(descriptor); changed.context[key] = h(30);
    assert.notEqual(evmGraphDeliveryDescriptorCommitmentV1(changed), commitment);
    assert.equal(encodeEvmGraphDeliveryCallV1({ ...intent, descriptor: changed }), calldata);
  }
  for (const mutate of [d => d.profile = METAMORPHO_GRAPH_DELIVERY_PROFILE_V1,
    d => d.plan.fee = '500', d => d.plan.protocolKind = 'METAMORPHO_V1_EXACT_SHARE_MINT',
    d => d.plan.identity.chainId = '1', d => d.plan.identity.protocol = d.plan.identity.outputAsset,
    d => d.context.sourceLedgerNamespace = h(31), d => d.plan.ownerPublicInputs[18] = '999']) {
    const changed = structuredClone(descriptor); mutate(changed);
    assert.throws(() => validateEvmGraphDeliveryDescriptorV1(changed));
  }
  const terms = evmGraphDeliveryTermsV1(descriptor);
  assert.equal(terms.route.assetAmount, '2000'); assert.equal(terms.route.shareAmount, '1000');
  assert.throws(() => decodeEvmGraphDeliveryCallV1(calldata + '00', descriptor));
});
test('Uniswap owner consent distinguishes input cap and private output; copied observers and facts retain no authority', () => {
  const descriptor = uniswap(), plan = descriptor.plan, identity = plan.identity;
  const route = { routeProfile: 'REGISTERED_LOCAL_EVM_UNISWAP_V3_V1', family: '3', protocolKind: plan.protocolKind, fee: plan.fee,
    chainId: identity.chainId, genesis: descriptor.context.genesisHash, router: identity.router, protocol: identity.protocol,
    inputToken: identity.inputAsset, outputToken: identity.outputAsset, solver: identity.solver, sourcePool: a(7), targetPool: identity.targetPool,
    sourceAssetIdentity: descriptor.context.sourceAssetIdentity, targetAssetIdentity: descriptor.context.targetAssetIdentity,
    targetCommitment: h(12), descriptorCommitment: evmGraphDeliveryDescriptorCommitmentV1(descriptor),
    solverMaximumInputAmount: '2000', deliveredOutputAmount: '1000', executionFrom: '1000', executionUntil: '1100', settleBefore: '1200',
    payoutCommitment: h(13), deliveryRiskCommitment: h(14), deliveryLossClause: 'EXPLICIT_HOST_TERMS_ONLY',
    protocolAmountsPublic: true, publicNetwork: false };
  const review = { version: 2, profile: 'ORIGINAL_MANUAL_FLAT_GRAPH_REVIEW_V2', requestId: 'uniswap_host_only', kind: 'GRAPH',
    ownerOperationRef: h(15), assetId: h(16), asset: { assetId: h(16), symbol: 'PALT', decimals: 6 },
    graph: { version: 1, profile: 'OWNER_PRIVATE_EXECUTION_GRAPH_V1', legs: [{ slot: 0, route,
      localCommitment: h(17), dependencyCommitment: h(18) }], edges: [], graphTermsSHA256: h(19) },
    envelope: h(20), fundingNotBefore: '1000', fundingValidUntil: '1050', executionUntil: '1100', settleBefore: '1200',
    identitySHA256: h(21), sourceAmount: '5000000', reservedAmount: '1200', changeAmount: '4998800', changeRecipient: a(8),
    recoveryRecipient: a(9), originalAccountLifetime: h(22), observation: 'ORIGINAL_AUTHORIZED_TERMS_ONLY',
    solverOwnLiquidity: true, settlementEstablished: false, recovery: 'PRIVATE_ORIGINAL_CUTOFF_ONLY' };
  validateOwnerGraphReview(review);
  const canonical = canonicalOwnerGraphTerms(review, false, true);
  const rows = accountReviewDetails({ graph: review });
  assert.ok(rows.some(([key, value]) => key.includes('límite del solver') && value.includes('2000')));
  assert.ok(rows.some(([key, value]) => key.includes('token de salida privado') && value.includes('1000') && value.includes(identity.outputAsset)));
  assert.ok(rows.some(([key]) => key.includes('exposición')));
  const changed = structuredClone(review); changed.graph.legs[0].route.deliveredOutputAmount = '1001';
  assert.notEqual(canonicalOwnerGraphTerms(changed, false, true), canonical);
  for (const mutate of [r => r.fee = '500', r => r.protocolAmountsPublic = false, r => r.publicNetwork = true,
    r => r.outputToken = r.inputToken, r => r.deliveredShares = '1000', r => r.solverMaximumInputAmount = '0']) {
    const value = structuredClone(review); mutate(value.graph.legs[0].route); assert.throws(() => validateOwnerGraphReview(value));
  }
  const runtime = Object.freeze({}), system = Object.freeze({}), router = Object.freeze({ destinationPoolIndex: 1 });
  const observer = Object.freeze({ identity, profile: UNISWAP_GRAPH_DELIVERY_PROFILE_V1 });
  assert.throws(() => assertOwnedEvmGraphDeliveryObserverV1(observer, { runtime, system, poolIndex: 1 }));
  assert.throws(() => prepareOwnedUniswapGraphDescriptorV1({ observer, router, route: plan.route, ownerPublicInputs: plan.ownerPublicInputs }));
  const fabricated = Object.freeze({ status: 'observed', intent: { descriptor, receiptKeyCommitment: h(13), proof: 'deadbeef' } });
  assert.throws(() => assertOwnedEvmGraphDeliveryFactsV1(fabricated, { observer }));
  assert.throws(() => assertOwnedUniswapGraphDeliveryFactsV1(fabricated, { observer }));
});
