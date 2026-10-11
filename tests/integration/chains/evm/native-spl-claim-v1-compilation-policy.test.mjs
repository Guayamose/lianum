import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import {join,relative} from 'node:path';
import {ROOT,LOCAL} from '@lianum/proofs/catalog';
import {classifyNativeSplClaimV1Preparation,nativeSplClaimV1CompilationProcessFailure,parseNativeSplClaimV1PreparationStatus} from './native-spl-claim-v1-compilation-policy.mjs';
test('fixed CI51 V1 public preparation accepts no prove, alternative relation or argv; exited foreign work also rejects',()=>{
 const node='/usr/bin/node',id='5aa01bb7-1c2b-41ad-a161-a03b030a2768';
 for(const mode of ['compile','stats','prepare-key']){const argv=[node,fileURLToPath(new URL('../../../../packages/proofs/src/jobs/run-bounded.mjs',import.meta.url)),'native_claim_ingress',mode];assert.deepEqual(classifyNativeSplClaimV1Preparation(argv),{role:'spl-claim-v1-public-preparation',proofWorker:false});const worker=[node,fileURLToPath(new URL('../../../../packages/proofs/src/jobs/worker.mjs',import.meta.url)),'native_claim_ingress',mode,id];assert.deepEqual(classifyNativeSplClaimV1Preparation(worker),{role:'flat-proof-worker',proofWorker:true});assert.throws(()=>classifyNativeSplClaimV1Preparation([...argv,id]));assert.throws(()=>classifyNativeSplClaimV1Preparation(worker.slice(0,4)));assert.throws(()=>classifyNativeSplClaimV1Preparation([...worker.slice(0,4),'not-generated-uuid']));for(const other of ['prove','prepare-key-dyadic21','verify'])assert.throws(()=>classifyNativeSplClaimV1Preparation([...argv.slice(0,3),other]));assert.throws(()=>classifyNativeSplClaimV1Preparation([node,argv[1],'native_claim_ingress_v3',mode]));assert.throws(()=>classifyNativeSplClaimV1Preparation([...argv,'--alternate']));}
 assert.equal(nativeSplClaimV1CompilationProcessFailure([{role:'main-worker',proofWorker:false},{role:'spl-claim-v1-public-preparation',proofWorker:false},{role:'flat-proof-worker',proofWorker:true,state:'Z'}]),null);
 for(const row of [{role:'solana',proofWorker:false,state:'Z'},{role:'owned-descendant',proofWorker:false,state:'X'},{role:'main-worker',proofWorker:true}])assert.equal(nativeSplClaimV1CompilationProcessFailure([row]),'SPL_CLAIM_V1_UNEXPECTED_PROCESS');
});

test('public status preserves the guard-generated UUID and fixed report path; mismatched or malformed statuses reject',()=>{
 const runId='5aa01bb7-1c2b-41ad-a161-a03b030a2768',status={relation:'native_claim_ingress',mode:'compile',runId,phase:'completed',errorCode:null,report:relative(ROOT,join(LOCAL,'attempts',runId,'resources.json'))};
 const bytes=Buffer.from(JSON.stringify(status)+'\n');assert.deepEqual(parseNativeSplClaimV1PreparationStatus(bytes,'compile'),status);
 for(const change of [{relation:'native_claim_ingress_v3'},{mode:'stats'},{runId:'caller-id'},{phase:'failed'},{errorCode:'PW_FIXED_ARGUMENTS'},{report:'../other/resources.json'},{extra:'caller'}])assert.throws(()=>parseNativeSplClaimV1PreparationStatus(Buffer.from(JSON.stringify({...status,...change})),'compile'));
 for(const value of [Buffer.alloc(0),Buffer.alloc(1048577),Buffer.from('null'),Buffer.from('[]'),Buffer.concat([bytes,bytes])])assert.throws(()=>parseNativeSplClaimV1PreparationStatus(value,'compile'));
});
