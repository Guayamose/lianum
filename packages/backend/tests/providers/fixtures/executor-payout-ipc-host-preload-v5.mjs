/** Test child only. Real recipient IPC/OWNER/Graph remain; this explicitly
 * replaces SNARK computation, never a production verifier/acceptance path. */
import {mock} from 'node:test';import assert from 'node:assert/strict';
import * as Graph from '@lianum/engine/execution/graph/funded-graph-paged-v3';
import {wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
const results=new WeakMap();
const prover={async provePrepared(compiled,job){const original=Graph.readOriginalFundedPagedGraphProofJobV3(compiled,job);try{const result=Object.freeze({});results.set(result,{mode:original.mode,inputs:[...original.expectedPublicInputs]});Graph.closeFundedPagedGraphProofJobV3(job);return result;}finally{wipePrivateProofInputsV1(original.inputs);}},async close(){}};
mock.module('@lianum/proofs/tooling/original-paged-artifacts-v3',{exports:{Graph,loadFundedPagedGraphArtifactsV3(manifest){assert.match(manifest,/^[0-9a-f]{64}$/);return {};},createFundedPagedGraphProofClientV3:()=>prover,readOriginalFundedPagedGraphProofResultV3(client,result,mode){assert.strictEqual(client,prover);const r=results.get(result);assert.equal(r?.mode,mode);return {proof:Buffer.from([1]),publicInputs:[...r.inputs]};}}});
