/** Actual retained reader in an isolated, unadopted courier; no runtime/proof. */
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink,mkdir,rm,lstat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=resolve(process.argv[2]),owned=resolve(fileURLToPath(new URL('../../../.local/',import.meta.url)));
assert.equal(process.argv.length,3);assert.ok(root.startsWith(owned+'/'),'N32_TEST_OWN_CANDIDATE');
const manifest=JSON.parse(await readFile(join(root,'source-bundle.json')));
assert.equal(manifest.status,'candidate');assert.equal(manifest.financialAcceptance,false);
assert.equal(manifest.adoptedGeneration,null,'N32_TEST_UNADOPTED_REVIEW_ONLY');
const original=path=>import(pathToFileURL(join(root,path)).href);
const env=await original('packages/environment/src/paths.mjs');assert.equal(env.resourceMode,'candidate');
const {inspectRetainedNodeArtifactsForPreparationV1:inspect}=await original('packages/proofs/src/tooling/retained-node-artifacts-v1.mjs');
const {NODE_PINS}=await original('packages/proofs/src/catalog.mjs');
const compiled=JSON.parse(await readFile(env.resourcePath('crypto','.local/component/compiled/'+NODE_PINS.compiledManifestSHA256+'/manifest.json')));
assert.equal(compiled.executionSources.length,9);
const first=compiled.executionSources[0],evidence=env.resourcePath('crypto','evidence/retained-n32/sources/'+first.sha256+'.source');
const baseline=await readFile(evidence),roots={candidate:'omnichain-flat-profile/candidate-poseidon','flat-reference':'omnichain-flat-profile',golden:'omnichain-product'};
const archive=join(root,'packages/proofs/evidence/original-sources',first.sha256+'.source');
await assert.rejects(lstat(join(root,'archive')),error=>error.code==='ENOENT');
let canary=false;
try{
 const data=await inspect();assert.ok(data.compiled&&data.prepared);
 const changed=Buffer.from(baseline);changed[0]^=1;await writeFile(evidence,changed);
 await assert.rejects(inspect(),error=>error.message.startsWith('RETAINED_NODE_SOURCE_PIN'));
 await writeFile(evidence,baseline);
 await unlink(evidence);await mkdir(dirname(archive),{recursive:true,mode:0o700});
 await writeFile(archive,baseline,{flag:'wx',mode:0o600});canary=true;
 // Even matching old evidence cannot become a candidate fallback or executable.
 await assert.rejects(inspect(),error=>error.code==='ENOENT');
 await writeFile(evidence,baseline);assert.ok((await inspect()).prepared);
 const {hasAdoptedSourceGeneration,assertAdoptedSourceGeneration}=await original('packages/proofs/src/toolchain/current-source-generation.mjs');
 assert.equal(hasAdoptedSourceGeneration(),false);assert.throws(assertAdoptedSourceGeneration);
 console.log(JSON.stringify({profile:'N32_REAL_READONLY_COURIER_DELTA_V1',cases:4,
  exactOriginalArtifacts:true,evidenceFiles:9,tamperRejected:true,missingNeverFallsBack:true,
  financialSourceGuardStillClosed:true,runtimeStarted:false,proofGenerated:false}));
}finally{await writeFile(evidence,baseline);if(canary)await rm(join(root,'archive'),{recursive:true,force:false});baseline.fill(0);}
