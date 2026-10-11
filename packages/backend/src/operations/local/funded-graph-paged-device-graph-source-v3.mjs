/** Active generation check; original source inventory is retained as evidence. */
import assert from 'node:assert/strict';
import {assertAdoptedSourceGeneration} from '@lianum/proofs/toolchain/current-source-generation';
export function assertOriginalDevicePagedGraphSourceV3() {
  assert.equal(arguments.length, 0);
  const generation = assertAdoptedSourceGeneration();
  return Object.freeze({profile: 'LIANUM_CURRENT_PAGED_GRAPH_SOURCE_V4', ...generation});
}
