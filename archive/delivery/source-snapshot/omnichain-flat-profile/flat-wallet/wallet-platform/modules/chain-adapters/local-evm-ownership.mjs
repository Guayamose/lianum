/** Exact ownership facade. No copying, branding, endpoint discovery or wrapping. */
import { assertLocalEvm as assertGoldenLocalEvm } from '../../../../../omnichain-product/src/paeg/local-evm.mjs';
import { isOwnedLocalEvmV2, assertOwnedLocalEvmV2 } from './owned-evm-v2-runtime.mjs';
export async function assertLocalEvm(runtime) {
  if (isOwnedLocalEvmV2(runtime)) return assertOwnedLocalEvmV2(runtime);
  return assertGoldenLocalEvm(runtime);
}
