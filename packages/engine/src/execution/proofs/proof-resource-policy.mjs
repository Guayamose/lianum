/** Application watchdog budgets selected from an already verified proof profile.
 * These are sampled process limits, not host security settings or kernel limits.
 * The larger budget is confined to the new 2^21 native proof family. Callers
 * cannot select a budget through the proof facade, IPC, or environment.
 */
import { PRIVATE_RESOURCE_POLICY } from '../../crypto/private-resource-policy.mjs';

const largeNativeModes = new Set([
  'capsule', 'ready', 'node', 'admission', 'aggregate_pair', 'aggregate_all', 'fulfill',
]);

export const NATIVE_2M_PROOF_RESOURCE_POLICY = Object.freeze({
  ...PRIVATE_RESOURCE_POLICY,
  profile: 'GENERIC_NATIVE_2M_MEASURED_HEADROOM_V1',
  proofWorkerRSSLimit: 3758096384,
});

export function selectProofResourcePolicy(mode, verifiedPublicPins) {
  return largeNativeModes.has(mode)
    && verifiedPublicPins.mode === mode
    && verifiedPublicPins.dyadicGates === 2097152
    && verifiedPublicPins.maximumPages === 65536
    ? NATIVE_2M_PROOF_RESOURCE_POLICY
    : PRIVATE_RESOURCE_POLICY;
}
