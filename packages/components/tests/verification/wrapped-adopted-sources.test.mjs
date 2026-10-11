/** Source authentication only. Original manifest bytes, whole inspector and
 * adoption reader; no runtime, custody identity, signing permit or proof. */
import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root=mkdtempSync(join(tmpdir(),'wrapped-current-sources-'));
const installation=join(root,'installation');
const originalManifest=readFileSync(new URL('../../../../archive/source-evidence/wrapped-activation-installation-v2/source-manifest.json',import.meta.url));
const inspectorPath='packages/components/src/verification/wrapped-installation-source-inspector-v2.mjs';
const inspector=readFileSync(new URL('../../src/verification/wrapped-installation-source-inspector-v2.mjs',import.meta.url));
mock.module('@lianum/environment',{exports:{projectRoot:root,legacyDataRoot:()=>join(installation,'omnichain-flat-profile/flat-wallet')}});
const write=(path,value)=>{const absolute=join(root,path);mkdirSync(join(absolute,'..'),{recursive:true});writeFileSync(absolute,value);};
const sha=value=>createHash('sha256').update(value).digest('hex');
function adopt(body='export const current=true;\n') {
 write(inspectorPath,inspector);write('packages/host.mjs',body);
 const files=[[inspectorPath,inspector],['packages/host.mjs',Buffer.from(body)]].map(([path,bytes])=>({path,source:path,sourceSHA256:sha(bytes),sha256:sha(bytes),bytes:bytes.length}));
 const contract={sourceClosureSHA256:'ab'.repeat(32),files};
 const sources=JSON.stringify({schema:'LIANUM_DEVELOPMENT_SOURCE_GENERATION_V1',currentSourceContract:contract});
 const generation=sha(sources),base='.local/generations/'+generation;
 const candidate=JSON.stringify({schema:'LIANUM_DEVELOPMENT_RELEASE_CANDIDATE_V7',sourceGeneration:generation,currentSourceClosureSHA256:contract.sourceClosureSHA256,artifactInspection:{status:'VERIFIED_RETAINED_ARTIFACTS'},pagedReuseReceipt:{manifestSHA256:'cd'.repeat(32)}});
 write(base+'/sources.json',sources);write(base+'/candidate-release.json',candidate);
 write('scripts/development/adopted-generation.json',JSON.stringify({schema:'LIANUM_ADOPTED_SOURCE_GENERATION_V1',generation,candidateSHA256:sha(candidate)}));
 return generation;
}
test('wrapped inspector authenticates adopted code with original manifest and permanently rejects drift',async t=>{
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 write('installation/drafts/wrapped-activation-installation-v2/source-manifest.json',originalManifest);
 const generation=adopt();
 const {inspectWrappedInstallationSourcesV2:inspect}=await import('../../src/verification/wrapped-installation-source-inspector-v2.mjs?source-drift');
 const result=inspect();assert.equal(result.adoptedSourceGeneration,generation);
 assert.equal(result.sourceCount,2);assert.equal(result.activationAuthorized,false);
 assert.equal(result.immutableLifetimeEstablished,false);assert.ok(result.originalSourceCount>2);
 assert.throws(()=>inspect({generation}),/WRAPPED_INSTALL_NO_OPTIONS/);
 assert.equal(inspect().adoptedSourceGeneration,generation);
 write('packages/host.mjs','export const current=false;\n');
 assert.throws(inspect,/CURRENT_SOURCE_PIN/);
 adopt();assert.throws(inspect,/WRAPPED_INSTALLATION_PERMANENTLY_FAULTED/);
 // A newly created process/inspector still cannot switch its adopted generation.
 const {inspectWrappedInstallationSourcesV2:second}=await import('../../src/verification/wrapped-installation-source-inspector-v2.mjs?generation-drift');
 second();adopt('export const current=2;\n');
 assert.throws(second,/WRAPPED_INSTALLATION_GENERATION_CHANGED/);
 // Original installation metadata retains its original physical hash.
 const {inspectWrappedInstallationSourcesV2:third}=await import('../../src/verification/wrapped-installation-source-inspector-v2.mjs?manifest-drift');
 write('installation/drafts/wrapped-activation-installation-v2/source-manifest.json',Buffer.concat([originalManifest,Buffer.from(' ')]));
 assert.throws(third,/WRAPPED_INSTALL_MANIFEST_PIN/);
});
