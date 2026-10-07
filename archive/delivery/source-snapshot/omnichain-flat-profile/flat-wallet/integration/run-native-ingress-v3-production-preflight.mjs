/** Separate fixed one-production-proof route; no caller activation option. */
import assert from 'node:assert/strict';
import { PRODUCTION_PREFLIGHT_REAL_RUN_DISABLED } from './native-ingress-v3-preflight-policy.mjs';
assert.equal(PRODUCTION_PREFLIGHT_REAL_RUN_DISABLED, false, 'V3_PRODUCTION_PREFLIGHT_REQUIRES_FROZEN_CHECKPOINT_AND_EXPLICIT_LAUNCH');
const { runNativeIngressV3ProductionPreflightSupervisor } = await import('./native-flow-supervisor.mjs');
await runNativeIngressV3ProductionPreflightSupervisor();
