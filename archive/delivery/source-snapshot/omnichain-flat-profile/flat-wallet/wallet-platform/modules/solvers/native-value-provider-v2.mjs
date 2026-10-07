/** Fixed factory only: no user-facing generic signer or trusted adapter input.
 * Lifecycle lives beside the one-use scoped EVM request brand. */
export { createOwnedNativeValueProvider, assertOwnedNativeValueProvider, NATIVE_VALUE_PROVIDER_BLOCKERS }
  from '../chain-adapters/native-value-evm-dispatch-gate.mjs';
export { createOwnedNativeValueProviderCustody } from '../chain-adapters/native-value-dispatch-owner-v2.mjs';
