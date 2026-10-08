/** Fixed original family-3 variants. Dispatch and facts authority is selected
 * only through private ownership maps, never by a caller's profile or shape. */
import assert from 'node:assert/strict';
import { assertOwnedEvmVaultRouter } from '../../../operations/deployments/defi/deploy-evm-vault-router.mjs';
import { assertOwnedPrivateExternalRouterV1 } from '../../../operations/deployments/defi/deploy-private-external-router-v1.mjs';
import { assertOwnedEvmVaultDeliveryObserver, assertOwnedEvmVaultDeliveryFacts }
  from '../vault/evm-vault-delivery-observer.mjs';
import { isOwnedMetaMorphoGraphDeliveryObserverV1, assertOwnedMetaMorphoGraphDeliveryObserverV1,
  assertOwnedMetaMorphoGraphDeliveryFactsV1, assertOwnedMetaMorphoGraphDescriptorV1,
  isOwnedAaveStaticGraphDeliveryObserverV1, assertOwnedAaveStaticGraphDeliveryObserverV1,
  assertOwnedAaveStaticGraphDeliveryFactsV1, assertOwnedAaveStaticGraphDescriptorV1,
  isOwnedUniswapGraphDeliveryObserverV1, assertOwnedUniswapGraphDeliveryObserverV1,
  assertOwnedUniswapGraphDeliveryFactsV1, assertOwnedUniswapGraphDescriptorV1 }
  from '../vault/metamorpho-graph-delivery-observer-v1.mjs';
import { evmGraphDeliveryTermsV1, isExternalGraphDescriptorV1 } from './evm-graph-delivery-codec-v1.mjs';

export function assertOwnedEvmGraphDeliveryObserverV1(observer, expected) {
  if (isOwnedMetaMorphoGraphDeliveryObserverV1(observer))
    return assertOwnedMetaMorphoGraphDeliveryObserverV1(observer, expected);
  if (isOwnedUniswapGraphDeliveryObserverV1(observer))
    return assertOwnedUniswapGraphDeliveryObserverV1(observer, expected);
  if (isOwnedAaveStaticGraphDeliveryObserverV1(observer)) return assertOwnedAaveStaticGraphDeliveryObserverV1(observer,expected);
  return assertOwnedEvmVaultDeliveryObserver(observer, expected);
}
export function assertOwnedEvmGraphDeliveryFactsV1(value, { observer }) {
  if (isOwnedMetaMorphoGraphDeliveryObserverV1(observer))
    return assertOwnedMetaMorphoGraphDeliveryFactsV1(value, { observer });
  if (isOwnedUniswapGraphDeliveryObserverV1(observer))
    return assertOwnedUniswapGraphDeliveryFactsV1(value, { observer });
  if (isOwnedAaveStaticGraphDeliveryObserverV1(observer)) return assertOwnedAaveStaticGraphDeliveryFactsV1(value,{observer});
  return assertOwnedEvmVaultDeliveryFacts(value, { observer });
}
export function assertOwnedEvmGraphDeliveryRouterV1(runtime, system, router, observer) {
  if (isOwnedMetaMorphoGraphDeliveryObserverV1(observer) || isOwnedUniswapGraphDeliveryObserverV1(observer) || isOwnedAaveStaticGraphDeliveryObserverV1(observer)) {
    const expected = { runtime, system, poolIndex: router.destinationPoolIndex };
    assertOwnedEvmGraphDeliveryObserverV1(observer, expected);
    assertOwnedPrivateExternalRouterV1(router, expected);
    assert.equal(router.protocolKind, isOwnedUniswapGraphDeliveryObserverV1(observer)
      ? 'UNISWAP_V3_EXACT_OUTPUT_SINGLE' : isOwnedAaveStaticGraphDeliveryObserverV1(observer) ? 'AAVE_V3_STATIC_EXACT_SHARE_MINT' : 'METAMORPHO_V1_EXACT_SHARE_MINT', 'EVM_GRAPH_FIXED_PROTOCOL');
  } else assertOwnedEvmVaultRouter(runtime, system, router);
}
export function assertOwnedEvmGraphDeliveryDescriptorV1(runtime, system, router, observer, descriptor) {
  assertOwnedEvmGraphDeliveryRouterV1(runtime, system, router, observer);
  assertOwnedEvmGraphDeliveryObserverV1(observer, { runtime, system, poolIndex: router.destinationPoolIndex });
  if (isOwnedMetaMorphoGraphDeliveryObserverV1(observer))
    assertOwnedMetaMorphoGraphDescriptorV1(observer, router, descriptor);
  else if (isOwnedUniswapGraphDeliveryObserverV1(observer))
    assertOwnedUniswapGraphDescriptorV1(observer, router, descriptor);
  else if (isOwnedAaveStaticGraphDeliveryObserverV1(observer)) assertOwnedAaveStaticGraphDescriptorV1(observer,router,descriptor);
  else {
    assert.equal(isExternalGraphDescriptorV1(descriptor), false, 'EVM_GRAPH_ORIGINAL_VAULT_DESCRIPTOR');
    assert.deepEqual(evmGraphDeliveryTermsV1(descriptor).identity, router.identity, 'EVM_GRAPH_ORIGINAL_VAULT_IDENTITY');
  }
  assert.deepEqual(observer.identity, router.identity, 'EVM_GRAPH_ORIGINAL_OBSERVER_ROUTER');
}
