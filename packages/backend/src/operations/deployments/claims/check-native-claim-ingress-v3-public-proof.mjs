/** Fixed read-only check of the retained synthetic proof against an actually
 * owned deployed V3 verifier. It proves no registered-domain/native issuance. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { assertOwnedNativeClaimSystem } from './deploy-native-claims.mjs';
import { loadNativeClaimIngressV3PublicProof } from './native-claim-ingress-v3-artifacts.mjs';
import { evmRuntimeCodeHash } from '../../../chains/evm/contracts/evm-code-hash.mjs';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { cloneInput } from '@lianum/components/plain-input';
import { regular, hash, assertID } from '@lianum/proofs/tooling/tooling';
import { NATIVE_INGRESS_V3_LOCAL, NATIVE_INGRESS_V3_RELATION, NATIVE_INGRESS_V3_SOURCE_VERSION,
  NATIVE_INGRESS_V3_KEY_SHA256 } from '@lianum/proofs/native-ingress/metadata/native-ingress-v3-profile';
export async function verifyOwnedNativeClaimIngressV3PublicProof(input){
  assert.equal(arguments.length,1,'V3_PUBLIC_PROOF_ARGUMENTS');exactRecord(input,['runtime','claims']);
  const {runtime,claims}=input;assertOwnedNativeClaimSystem(runtime,claims);
  return verifyOwnedPublicProof(runtime,claims,await loadNativeClaimIngressV3PublicProof(),'retained-artifact-proof');
}
/** Separate production-role preflight variant. Accept only the exact public
 * result preserved by the fixed V3 job, never a supplied key/verifier/path. */
export async function verifyOwnedNativeClaimIngressV3ProductionProof(input){
  assert.equal(arguments.length,1,'V3_PUBLIC_PROOF_ARGUMENTS');exactRecord(input,['runtime','claims','proofResult']);
  const {runtime,claims}=input;assertOwnedNativeClaimSystem(runtime,claims);
  const value=cloneInput(input.proofResult);exactRecord(value,['proof','publicInputs','evidence']);
  const evidence=value.evidence,runId=assertID(evidence.runId),jobId=assertID(evidence.jobId);
  assert.equal(evidence.relation,NATIVE_INGRESS_V3_RELATION);assert.equal(evidence.role,'claim_ingress');
  const directory=join(NATIVE_INGRESS_V3_LOCAL,'attempts',runId),read=name=>JSON.parse(regular(join(directory,name)));
  const result=read('result.json'),resources=read('resources.json'),manifestBytes=regular(join(directory,'proof-manifest.json')),
    manifest=JSON.parse(manifestBytes),proofBytes=regular(join(directory,'proof.bin')),publicBytes=regular(join(directory,'public-inputs.json'));
  for(const record of [result,resources,manifest]){assert.equal(record.profile,'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3');assert.equal(record.runId,runId);assert.equal(record.jobId,jobId);assert.equal(record.relation,NATIVE_INGRESS_V3_RELATION);}
  assert.equal(result.phase,'completed');assert.equal(resources.phase,'completed');assert.equal(resources.exitCode,0);assert.equal(resources.signal,null);assert.equal(resources.failure,null);assert.deepEqual(resources.failures,[]);
  assert.equal(result.backendDestroyed,true);assert.equal(manifest.selfVerified,true);assert.equal(manifest.sourceVersion,NATIVE_INGRESS_V3_SOURCE_VERSION);assert.equal(manifest.keySHA256,NATIVE_INGRESS_V3_KEY_SHA256);
  assert.equal(hash(manifestBytes),evidence.manifestSHA256);assert.equal(hash(proofBytes),manifest.proofSHA256);assert.equal(hash(proofBytes),evidence.proofSHA256);assert.equal(hash(publicBytes),manifest.publicInputsSHA256);
  assert.equal(value.proof,proofBytes.toString('hex'));assert.deepEqual(value.publicInputs,JSON.parse(publicBytes));assert.equal(evidence.keySHA256,NATIVE_INGRESS_V3_KEY_SHA256);
  return verifyOwnedPublicProof(runtime,claims,{proof:value.proof,publicInputs:value.publicInputs,
    sourceVersion:NATIVE_INGRESS_V3_SOURCE_VERSION,keySHA256:NATIVE_INGRESS_V3_KEY_SHA256},'fresh-production-role-proof');
}
async function verifyOwnedPublicProof(runtime,claims,proof,origin){
  const verifier=claims.verifiers.CI51;
  assert.equal(verifier.source,'native_claim_ingress_v3.sol');assert.equal(verifier.lineage.sourceVersion,proof.sourceVersion);
  assert.equal(verifier.lineage.keySHA256,proof.keySHA256);assert.equal(verifier.lineage.actualGeneratedKeyAndSource,true);
  assert.equal(claims.bootstrap.completeRuntimesMatched,true);assert.equal(claims.bootstrap.originalDeploymentReceiptsMatched,true);
  const head=await runtime.block();await runtime.assertCanonical(head);
  const records=claims.deployments.filter(row=>row.source==='native_claim_ingress_v3.sol');
  assert.ok(records.some(row=>row.address===verifier.address),'V3_DEPLOYED_VERIFIER_RECORD');
  for(const record of records){const code=await runtime.code(record.address,head.number);assert.equal(code,record.expectedCode,'V3_CURRENT_LINKED_RUNTIME');assert.equal(evmRuntimeCodeHash(code),record.codeHash);}
  const words=proof.publicInputs.map(value=>'0x'+BigInt(value).toString(16).padStart(64,'0'));
  const result=await verifier.call('verify(bytes,bytes32[])',['0x'+proof.proof,words],head.number);
  assert.equal(result,'0x'+'1'.padStart(64,'0'),'V3_DEPLOYED_PUBLIC_PROOF_REJECTED');
  await runtime.assertCanonical(head);const after=await runtime.block();assert.equal(after.hash,head.hash);assert.equal(after.number,head.number);
  return Object.freeze({classification:'OWNED_DEPLOYED_VERIFIER_ACCEPTED_RETAINED_SYNTHETIC_PROOF',
    head:Object.freeze({number:head.number,hash:head.hash}),origin,verifier:verifier.address,sourceVersion:proof.sourceVersion,
    keySHA256:proof.keySHA256,linkedRuntimesMatched:records.length,verified:true,registeredDomainIssuance:false,
    nativeFinalityEstablished:false,transactionSubmitted:false});
}
