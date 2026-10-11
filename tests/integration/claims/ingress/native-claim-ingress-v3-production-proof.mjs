/** Fixed one-proof synthetic acceptance of the actual installed V3 role/IPC
 * boundary. Importing does nothing. Run only under the explicitly authorized
 * bounded integration supervisor after durable merged-source checkpointing. */
import assert from 'node:assert/strict';
import { loadPinned,resourceModuleURL } from '@lianum/proofs/tooling/tooling';
import { createRoleProofClient } from '@lianum/backend/proving/roles/role-client';
import { loadNativeClaimIngressV3ProofArtifacts } from '../../../../packages/backend/src/operations/deployments/claims/native-claim-ingress-v3-artifacts.mjs';
import { loadNativeClaimArtifacts } from '../../../../packages/backend/src/operations/deployments/claims/native-claim-artifacts.mjs';
import { FIELD_MODULUS } from '@lianum/components/encoding/statements';
import { buildSyntheticGenericIngressV3Fixture } from '../../../../experiments/wallet/native-ingress-v3/fixtures/synthetic-ingress-v3.mjs';
import { regular } from '@lianum/proofs/tooling/tooling';
import { ROOT } from '@lianum/proofs/catalog';
import { join } from 'node:path';
export async function proveNativeClaimIngressV3ProductionBoundary(){
 assert.equal(arguments.length,0,'V3_PRODUCTION_BOUNDARY_NO_OPTIONS');
 const artifacts=await loadNativeClaimIngressV3ProofArtifacts(),helpers=await import(resourceModuleURL);helpers.verifyToolchain();
 const bb=await loadPinned('@aztec/bb.js');let backend,fixture,job,client;
 try{
  backend=await bb.Barretenberg.new({backend:bb.BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:32768}});
  const hashFields=async fields=>{const inputs=fields.map(value=>{assert.ok(typeof value==='bigint'&&value>=0n&&value<FIELD_MODULUS);return Buffer.from(value.toString(16).padStart(64,'0'),'hex');});return Buffer.from((await backend.poseidon2Hash({inputs})).hash).toString('hex');};
  // CO42 ABI is read only to build the existing complete fixture matrix. No
  // CO42 proof is requested; the selected case and role remain exactly V3.
  const co42=JSON.parse(regular(join(ROOT,'.local/proof-workers/relations/native_claim_discharge/7ddd3be0eaddf7bc08840d6fa0660ee6e6596108e35c9c1ac83ca4f76f468ea5/compiled/61d900c0-e5a2-4757-a274-c59fd0d0c645/program.json')));
  await loadNativeClaimArtifacts(); // Authenticates that retained unchanged CO42 lineage.
  fixture=await buildSyntheticGenericIngressV3Fixture({hashFields,abis:{native_claim_ingress_v3:artifacts.program.abi,native_claim_discharge:co42.abi}});
  const selected=fixture.cases.find(item=>item.name==='ci51-v3-sol-v2-signed-ingress');assert.equal(selected?.expected,true);
  job={relation:'native_claim_ingress_v3',inputs:structuredClone(selected.inputs),expectedPublicInputs:[...selected.publicInputs]};
  fixture.destroy();fixture=undefined;await backend.destroy();backend=undefined;
  client=createRoleProofClient('claim_ingress');
  const proofResult=await client.prove(job);job.inputs=undefined;job=undefined;
  assert.equal(proofResult.evidence.relation,'native_claim_ingress_v3');assert.equal(proofResult.evidence.role,'claim_ingress');assert.equal(proofResult.evidence.keySHA256,artifacts.keySHA256);
  return Object.freeze({classification:'ONE_SYNTHETIC_PROOF_THROUGH_PRODUCTION_V3_ROLE',proofResult,
    actualProductionRoleIPC:true,officialPoseidon2:true,proofsGenerated:1,keyGenerated:false,statsRegenerated:false,
    syntheticUnregisteredDomain:true,witnessPersisted:false,nativeNodesStarted:false});
 }finally{if(job)job.inputs=undefined;fixture?.destroy?.();await backend?.destroy();client?.close();}
}
