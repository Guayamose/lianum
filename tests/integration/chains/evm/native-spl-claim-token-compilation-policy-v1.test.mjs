/** Pure process-history boundary; no compiler or financial authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeSplClaimTokenCompilationProcessFailureV1 as failure} from './native-spl-claim-token-compilation-policy-v1.mjs';
test('new SPL token compiler scope rejects any native/proof child, including exited children',()=>{
 assert.equal(failure([{role:'main-worker',proofWorker:false,state:'Z'}]),null);
 for(const row of [{role:'native-solana-validator',proofWorker:false,state:'Z'},{role:'main-worker',proofWorker:true,state:'X'},{role:'unexpected',proofWorker:false,state:'S'}])assert.equal(failure([row]),'SPL_TOKEN_COMPILATION_UNEXPECTED_CHILD');
});
