/** Fixed fresh V3 ingress/source-EXIT/redemption unit, never a graph rerun.
 * Source-disabled until parent checkpoints and explicitly launches it. */
import assert from 'node:assert/strict';
import { CLAIM_LOADED_V3_REAL_RUN_DISABLED } from './native-claim-loaded-v3-policy.mjs';
assert.equal(CLAIM_LOADED_V3_REAL_RUN_DISABLED, false, 'CLAIM_LOADED_V3_REQUIRES_FROZEN_CHECKPOINT_AND_EXPLICIT_LAUNCH');
const { runNativeClaimLoadedV3Supervisor } = await import('./native-flow-supervisor.mjs');
await runNativeClaimLoadedV3Supervisor();
