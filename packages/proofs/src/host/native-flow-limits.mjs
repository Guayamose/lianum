/** Shared immutable resource bounds; importing them starts no supervisor. */
import {LIMITS as PROOF_LIMITS} from '../catalog.mjs';
import {PRIVATE_RESOURCE_FLOORS,PRIVATE_RESOURCE_POLICY,PRIVATE_PROOF_WORKER_RSS_LIMIT} from '@lianum/components/resources/private-resource-policy';
export const NATIVE_FLOW_LIMITS = Object.freeze({
  minimumAvailableRAMBytes: PRIVATE_RESOURCE_FLOORS.availableRAM,
  minimumFreeDiskBytes: PRIVATE_RESOURCE_FLOORS.freeDisk,
  maximumProofOrMainRSSBytes: PRIVATE_PROOF_WORKER_RSS_LIMIT,
  sampleMilliseconds: PRIVATE_RESOURCE_POLICY.externalSampleMilliseconds,
  totalMilliseconds: 90 * 60 * 1000,
  cleanupReserveMilliseconds: 15000,
  killGraceMilliseconds: PROOF_LIMITS.killGraceMilliseconds,
  maximumOutputBytes: 4 * 1024 * 1024,
  maximumResultBytes: 8 * 1024 * 1024,
});
