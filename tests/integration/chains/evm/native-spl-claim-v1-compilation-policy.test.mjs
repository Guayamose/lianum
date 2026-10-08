import assert from 'node:assert/strict';
import test from 'node:test';
import {join} from 'node:path';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {classifyNativeSplClaimV1Preparation,nativeSplClaimV1CompilationProcessFailure} from './native-spl-claim-v1-compilation-policy.mjs';
test('fixed CI51 V1 public preparation accepts no prove, alternative relation or argv; exited foreign work also rejects',()=>{
 const node='/usr/bin/node',id='5aa01bb7-1c2b-41ad-a161-a03b030a2768';
 for(const mode of ['compile','stats','prepare-key']){const argv=[node,join(ROOT,'proof-workers/run-bounded.mjs'),'native_claim_ingress',mode,id];assert.deepEqual(classifyNativeSplClaimV1Preparation(argv),{role:'spl-claim-v1-public-preparation',proofWorker:false});assert.deepEqual(classifyNativeSplClaimV1Preparation([node,join(ROOT,'proof-workers/worker.mjs'),'native_claim_ingress',mode,id]),{role:'flat-proof-worker',proofWorker:true});for(const other of ['prove','prepare-key-dyadic21','verify'])assert.throws(()=>classifyNativeSplClaimV1Preparation([...argv.slice(0,3),other,id]));assert.throws(()=>classifyNativeSplClaimV1Preparation([node,argv[1],'native_claim_ingress_v3',mode,id]));assert.throws(()=>classifyNativeSplClaimV1Preparation([...argv,'--alternate']));}
 assert.equal(nativeSplClaimV1CompilationProcessFailure([{role:'main-worker',proofWorker:false},{role:'spl-claim-v1-public-preparation',proofWorker:false},{role:'flat-proof-worker',proofWorker:true,state:'Z'}]),null);
 for(const row of [{role:'solana',proofWorker:false,state:'Z'},{role:'owned-descendant',proofWorker:false,state:'X'},{role:'main-worker',proofWorker:true}])assert.equal(nativeSplClaimV1CompilationProcessFailure([row]),'SPL_CLAIM_V1_UNEXPECTED_PROCESS');
});
