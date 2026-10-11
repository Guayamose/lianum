/** Actual read-only I84 publication: original bytes and zero caller options.
 * Relocation, outside-root denial and tamper are exercised by the source bundle.
 * No compiler, proof worker, runtime or financial capability is constructed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadRetainedI84ArtifactsV1,inspectRetainedI84ReaderPinsV1} from '@lianum/proofs/tooling/retained-i84-artifacts-v1';

test('I84 loads the original public program, key and five independently verified fixture records',()=>{
 const loaded=loadRetainedI84ArtifactsV1(),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 assert.equal(loaded.classification,'GENUINE_SHARED_NATIVE_VALUE_I84_ARTIFACTS_NOT_DEPLOYMENT_OR_LIVE_ACCEPTANCE');
 assert.equal(loaded.context.sourceVersion,'4a6503d4b139e20e4d672ca39eb5d5f1f75497555ba6d55a7d6c424dcbb5d92e');
 assert.equal(loaded.context.spec.publicWords,84);
 assert.equal(hash(loaded.compiled.programBytes),loaded.compiled.manifest.programSHA256);
 assert.equal(hash(loaded.prepared.key),loaded.prepared.manifest.keySHA256);
 assert.equal(hash(loaded.prepared.solidity),loaded.prepared.manifest.soliditySHA256);
 assert.deepEqual(Object.keys(loaded.proofs),['ethereum','base','arbitrum','bnb','tron']);
 for(const proof of Object.values(loaded.proofs)){
  assert.equal(proof.verificationAttempt.result.independentlyVerified,true);
  assert.equal(hash(proof.proof),proof.manifest.proofSHA256);
  assert.equal(proof.publicInputs.length,84);
 }
 const pins=inspectRetainedI84ReaderPinsV1();
 assert.equal(pins.driverSourceManifestSHA256,loaded.driverSourceManifestSHA256);
 assert.equal(pins.sourceFiles,132);
});
test('the actual reader rejects caller paths, manifests and copied publication data',()=>{
 for(const caller of ['/caller/restored/read.mjs','../restored/read.mjs',{path:'admission-prepared/../caller.mjs'},{}]){
  assert.throws(()=>loadRetainedI84ArtifactsV1(caller),/PW_FIXED_READER_NO_OPTIONS/);
  assert.throws(()=>inspectRetainedI84ReaderPinsV1(caller),/NATIVE_VALUE_I_READER_NO_OPTIONS/);
 }
});
