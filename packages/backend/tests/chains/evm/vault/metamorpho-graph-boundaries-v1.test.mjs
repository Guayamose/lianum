/** Pure host boundaries only. No chain, compilation, prover or financial
 * acceptance. The fresh original graph flow still requires real acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { METAMORPHO_GRAPH_DELIVERY_PROFILE_V1, validateEvmGraphDeliveryDescriptorV1,
  evmGraphDeliveryTermsV1, evmGraphDeliveryDescriptorCommitmentV1,
  encodeEvmGraphDeliveryCallV1, decodeEvmGraphDeliveryCallV1 }
  from '../../../../src/chains/evm/dispatch/evm-graph-delivery-codec-v1.mjs';
import { encodePrivateExternalDelivery } from '../../../../src/defi/delivery/private-external-delivery.mjs';
import { encodeEvmVaultDeliveryCall, evmVaultDeliveryDescriptorCommitment }
  from '../../../../src/chains/evm/vault/evm-vault-delivery.mjs';
import { assertOwnedEvmGraphDeliveryObserverV1, assertOwnedEvmGraphDeliveryFactsV1,
  assertOwnedEvmGraphDeliveryDescriptorV1 } from '../../../../src/chains/evm/dispatch/owned-evm-graph-delivery-v1.mjs';
import { prepareOwnedMetaMorphoGraphDescriptorV1, assertOwnedMetaMorphoGraphDeliveryFactsV1 }
  from '../../../../src/chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs';

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
