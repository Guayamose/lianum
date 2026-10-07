/** The source gate runs before any supervisor import or output creation. */
import assert from 'node:assert/strict';
import { PREFLIGHT_REAL_RUN_DISABLED } from './native-ingress-v3-preflight-policy.mjs';
assert.equal(PREFLIGHT_REAL_RUN_DISABLED, false, 'V3_PREFLIGHT_REQUIRES_FROZEN_CHECKPOINT_AND_EXPLICIT_LAUNCH');
const { runNativeIngressV3PreflightSupervisor } = await import('./native-flow-supervisor.mjs');
await runNativeIngressV3PreflightSupervisor();
