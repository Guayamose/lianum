/** A Source capture checkpoints its journal once, preserving every operation. */
import assert from 'node:assert/strict';
export function assertPreservedSourceCaptureV7(before,after){
 assert.ok(Number.isSafeInteger(before.revision)&&before.revision>=0);
 assert.equal(after.revision,before.revision+1,'PAEG_UNISWAP_RECOVERY_CAPTURE_REVISION');
 assert.deepEqual({...after,revision:before.revision},before,'PAEG_UNISWAP_RECOVERY_SOURCE_CHANGED');
}
