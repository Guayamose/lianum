/** Active generation check; original source inventory is retained as evidence. */
import assert from 'node:assert/strict';
import {assertAdoptedSourceGeneration} from '@lianum/proofs/toolchain/current-source-generation';
export function assertOriginalPagedNativeFinancialSourceV3() {
  assert.equal(arguments.length, 0);
  const generation = assertAdoptedSourceGeneration();
  return Object.freeze({profile: 'LIANUM_CURRENT_PAGED_NATIVE_SOURCE_V4', ...generation});
}
