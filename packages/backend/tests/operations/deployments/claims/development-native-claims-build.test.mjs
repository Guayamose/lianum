/** Integration checks require the separately reviewed local public build. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ROOT } from '../../../../../proofs/src/catalog.mjs';
import { hash } from '../../../../../proofs/src/tooling/tooling.mjs';
import { loadNativeClaimIngressV3Artifacts,loadNativeClaimIngressV3ProofArtifacts,
  loadNativeClaimIngressV3PublicProof } from '../../../../src/operations/deployments/claims/native-claim-ingress-v3-artifacts.mjs';
import { preflightNativeClaimIngressV3Artifacts } from '../../../../src/operations/deployments/claims/deploy-native-claims.mjs';
const directory=join(ROOT,'.local/development-native-claims/v2');
const role=join(directory,'verifiers/native_claim_ingress_v3');
async function mutate(paths,action,check) {
  const originals=paths.map(path=>readFileSync(path));
  try {action(originals);await check();}
  finally{paths.forEach((path,index)=>writeFileSync(path,originals[index]));
    paths.forEach((path,index)=>assert.equal(hash(readFileSync(path)),hash(originals[index])));}
}
test('reviewed native claims public build and tamper protection',{
  skip:process.env.LIANUM_TEST_NATIVE_CLAIMS_REBUILD!=='1',timeout:30000,
},async t=>{
 await t.test('fixed preflight reads genuine CI51V3/CO42 without starting a node',async()=>{
  await preflightNativeClaimIngressV3Artifacts();const value=await loadNativeClaimIngressV3Artifacts();
  assert.deepEqual(Object.keys(value.verifiers),['CI51','CO42']);
  assert.equal(value.verifiers.CI51.keyCommitment,'11682686c16db1276738b60ad906560a58ddf18183acf7ec5fb40f99474d8f6f');
  assert.equal(value.verifiers.CO42.keyCommitment,'0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83');
  assert.equal(value.verifiers.CI51.lineage.proofAcceptanceEstablished,false);
 });
 await t.test('changed published manifest closes the loader',async()=>{
  const path=join(directory,'manifest.json');await mutate([path],([bytes])=>writeFileSync(path,Buffer.concat([bytes,Buffer.from(' ')])),
    ()=>assert.rejects(loadNativeClaimIngressV3Artifacts,/DEVELOPMENT_CLAIMS_ARTIFACT_PIN/));
 });
 await t.test('changed generated VK closes the proof loader',async()=>{
  const path=join(role,'key.vk');await mutate([path],([bytes])=>{const changed=Buffer.from(bytes);changed[0]^=1;writeFileSync(path,changed);},
    ()=>assert.rejects(loadNativeClaimIngressV3ProofArtifacts,/DEVELOPMENT_CLAIMS_ARTIFACT_PIN/));
 });
 const paths=['program.json','compiled-manifest.json','key-manifest.json'].map(name=>join(role,name));
 const rewrite=(originals,change)=>{
  const [program,compiled,key]=originals.map(bytes=>JSON.parse(bytes));change(program);
  const programBytes=JSON.stringify(program,null,2)+'\n';compiled.programSHA256=hash(programBytes);
  compiled.abiSHA256=hash(JSON.stringify(program.abi));
  const compiledBytes=JSON.stringify(compiled,null,2)+'\n';key.compiledManifestSHA256=hash(compiledBytes);
  [programBytes,compiledBytes,JSON.stringify(key,null,2)+'\n'].forEach((bytes,index)=>writeFileSync(paths[index],bytes));
 };
 await t.test('portable diagnostic path preserves exact program and actual local file pins',async()=>{
  const before=await loadNativeClaimIngressV3ProofArtifacts();
  await mutate(paths,originals=>rewrite(originals,program=>{
    const main=Object.values(program.file_map).find(record=>record.path.startsWith('/'));
    main.path='/different/developer/checkout/experiments/native-ingress-v3/circuits/native-claim-ingress-v3/src/main.nr';
  }),async()=>{
    const after=await loadNativeClaimIngressV3ProofArtifacts();assert.ok(before.compressed.equals(after.compressed));
    assert.ok(before.key.equals(after.key));assert.deepEqual(before.program.abi,after.program.abi);
    assert.notEqual(before.artifactSHA256,after.artifactSHA256);assert.notEqual(before.compiledManifestSHA256,after.compiledManifestSHA256);
  });
 });
 await t.test('self-consistent local file hashes cannot substitute an ABI or diagnostic source',async()=>{
  await mutate(paths,originals=>rewrite(originals,program=>{
    const entry=Object.values(program.file_map).find(record=>record.path.startsWith('/'));entry.source+='\n// substituted source';
  }),()=>assert.rejects(loadNativeClaimIngressV3ProofArtifacts));
 });
 await t.test('self-consistent metadata cannot substitute the original ABI',async()=>{
  await mutate(paths,originals=>rewrite(originals,program=>{program.abi.parameters[0].name='substituted_domain';}),
    ()=>assert.rejects(loadNativeClaimIngressV3ProofArtifacts));
 });
 await t.test('a new build does not fabricate the original historical public proof',async()=>{
  if(!existsSync(join(ROOT,'experiments/native-ingress-v3-artifacts/acceptance.json')))
    await assert.rejects(loadNativeClaimIngressV3PublicProof,/ENOENT/);
 });
 await preflightNativeClaimIngressV3Artifacts();
});
