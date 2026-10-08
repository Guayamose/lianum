/** HOST link framing only: no compiler, node, proof, mint or bootstrap authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {bindNativeSplClaimValidationLibrariesV1} from '../../../../packages/backend/src/operations/deployments/claims/native-claim-deployment-plan.mjs';
import {loadNativeSplClaimV1RetainedContracts} from '../../../../packages/backend/src/operations/deployments/claims/native-spl-claim-v1-compilation.mjs';
import {linkPrivateBytecode} from '../../../../packages/engine/src/notes/private-asset-runtime.mjs';
import {loadNativeSplClaimValidationArtifactsV1,NATIVE_SPL_CLAIM_VALIDATION_BUILD_RELEASE_V1}
 from '../../../../packages/backend/src/operations/deployments/claims/native-spl-claim-validation-artifacts-v1.mjs';
const key='native-claims/NativeClaimValidation.sol:NativeClaimValidation';
const original={source:'native-claims/NativeClaimValidation.sol',contractName:'NativeClaimValidation',address:'0x'+'11'.repeat(20),codeHash:'0x'+'aa'.repeat(32)},
 spl={source:'native-claims/NativeSplClaimValidationV1.sol',contractName:'NativeSplClaimValidationV1',address:'0x'+'22'.repeat(20),codeHash:'0x'+'bb'.repeat(32)};
function links(){return {'FlatHubCodec.sol:FlatHubCodec':'0x'+'33'.repeat(20),'crypto/Poseidon2Domains.sol:Poseidon2Domains':'0x'+'44'.repeat(20),
 'native-claims/NativeClaimCodec.sol:NativeClaimCodec':'0x'+'55'.repeat(20),[key]:original.address};}
test('same retained gateway ABI links BTC to its original library and SPL to the separately pinned USDC6 library',()=>{
 const base=links(),before=structuredClone(base),bound=bindNativeSplClaimValidationLibrariesV1(base,original,spl);
 assert.deepEqual(base,before);assert.equal(bound.gatewayLinks[0][key],original.address);assert.equal(bound.gatewayLinks[1][key],spl.address);
 assert.deepEqual(bound.validationHashes,[original.codeHash,spl.codeHash]);
 const artifact=loadNativeSplClaimV1RetainedContracts().artifacts.gateway;
 const refs=artifact.evm.deployedBytecode.linkReferences['native-claims/NativeClaimValidation.sol'].NativeClaimValidation;
 assert.ok(refs.length>0);
 const codes=bound.gatewayLinks.map(row=>linkPrivateBytecode(artifact.evm.deployedBytecode.object,artifact.evm.deployedBytecode.linkReferences,row));
 for(const ref of refs){assert.equal(codes[0].slice(ref.start*2,(ref.start+ref.length)*2),original.address.slice(2));
  assert.equal(codes[1].slice(ref.start*2,(ref.start+ref.length)*2),spl.address.slice(2));}
 for(const change of [r=>{r.source=original.source;},r=>{r.contractName=original.contractName;},r=>{r.address=original.address;},r=>{r.codeHash=original.codeHash;}]){
  const bad={...spl};change(bad);assert.throws(()=>bindNativeSplClaimValidationLibrariesV1(base,original,bad));}
});
test('validation consumer admits only the immutable reviewed compilation and grants no private credit',()=>{
 const pin=NATIVE_SPL_CLAIM_VALIDATION_BUILD_RELEASE_V1;
 assert.equal(pin.runId,'927b41e2-d646-424c-87ed-74372c36a9c5');assert.equal(Object.isFrozen(pin),true);
 assert.equal(Object.isFrozen(pin.files),true);for(const file of Object.values(pin.files))assert.equal(Object.isFrozen(file),true);
 assert.throws(()=>{pin.files['compiled.json'].sha256='00'.repeat(32);},TypeError);
 assert.throws(()=>loadNativeSplClaimValidationArtifactsV1({}),/NO_OPTIONS/);
 const artifact=loadNativeSplClaimValidationArtifactsV1();assert.equal(artifact.provenance.runId,pin.runId);
 assert.equal(artifact.provenance.newCompilationOnly,true);assert.equal(artifact.provenance.privateCreditEstablished,false);
});
