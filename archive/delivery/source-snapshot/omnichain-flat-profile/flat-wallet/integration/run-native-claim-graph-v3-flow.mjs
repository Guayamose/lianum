/** Fixed fresh-state V3 route. Remains source-disabled until separately
 * reviewed, durably checkpointed and explicitly launched by the owner. */
import assert from 'node:assert/strict';
import { CLAIM_GRAPH_V3_REAL_RUN_DISABLED } from './native-claim-graph-v3-policy.mjs';
assert.equal(CLAIM_GRAPH_V3_REAL_RUN_DISABLED, false, 'CLAIM_GRAPH_V3_REQUIRES_FROZEN_CHECKPOINT_AND_EXPLICIT_LAUNCH');
const { runNativeClaimGraphV3Supervisor } = await import('./native-flow-supervisor.mjs');
await runNativeClaimGraphV3Supervisor();
