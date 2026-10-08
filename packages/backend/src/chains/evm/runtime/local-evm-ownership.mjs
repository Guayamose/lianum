/** Exact ownership facade. No copying, branding, endpoint discovery or wrapping. */
import { assertLocalEvm as assertGoldenLocalEvm } from '../../../../../engine/src/execution/local/local-evm.mjs';
import assert from 'node:assert/strict';
import { LOCAL_EVM_PROFILE, LOCAL_OSAKA_EVM_PROFILE_V1, isOwnedLocalEvmV2, assertOwnedLocalEvmV2 } from './owned-evm-v2-runtime.mjs';
export async function assertLocalEvm(runtime) {
  if (isOwnedLocalEvmV2(runtime)) return assertOwnedLocalEvmV2(runtime);
  return assertGoldenLocalEvm(runtime);
}
/** Two fixed deployment profiles only, after original runtime authentication. */
export async function assertLocalEvmDeploymentProfile(runtime) {
  assert.equal(arguments.length, 1);
  await assertLocalEvm(runtime);
  if (isOwnedLocalEvmV2(runtime) && runtime.metadata.profile === LOCAL_OSAKA_EVM_PROFILE_V1)
    return LOCAL_OSAKA_EVM_PROFILE_V1;
  assert.deepEqual(runtime.metadata.profile, LOCAL_EVM_PROFILE);
  return LOCAL_EVM_PROFILE;
}
