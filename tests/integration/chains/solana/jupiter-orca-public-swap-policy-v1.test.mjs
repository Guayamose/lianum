/** Process/duplicate metadata only; never starts a native child or signer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {jupiterOrcaSwapProcessFailureV1,assertJupiterSwapObservationAgreementV1} from './jupiter-orca-public-swap-policy-v1.mjs';
import {runJupiterOrcaPublicSwapSupervisorV1} from '../../native/native-flow-supervisor.mjs';
test('fixed public profile rejects caller authority and proof/other native history including dead children',async()=>{
 await assert.rejects(runJupiterOrcaPublicSwapSupervisorV1({endpoint:'caller'}),/JUPITER_SWAP_SUPERVISOR_NO_OPTIONS/);
 assert.equal(jupiterOrcaSwapProcessFailureV1([{role:'main-worker',proofWorker:false,state:'S'},{role:'solana-runtime',proofWorker:false,state:'Z'}]),null);
 for(const row of [{role:'proof-worker',proofWorker:true,state:'Z'},{role:'main-worker',proofWorker:true,state:'X'},{role:'anvil',proofWorker:false,state:'Z'},{role:'unknown-child',proofWorker:false,state:'X'}])assert.equal(jupiterOrcaSwapProcessFailureV1([row]),'JUPITER_SWAP_UNEXPECTED_CHILD');
 const original={signature:'host-metadata',transactionSlot:'8',finalizedSlot:'9',broadcastAttempts:1};
 assert.equal(assertJupiterSwapObservationAgreementV1(original,{...original,finalizedSlot:'10'}),true);
 assert.throws(()=>assertJupiterSwapObservationAgreementV1(original,{...original,broadcastAttempts:2}));
 assert.throws(()=>assertJupiterSwapObservationAgreementV1(original,{...original,finalizedSlot:'7'}));
});
