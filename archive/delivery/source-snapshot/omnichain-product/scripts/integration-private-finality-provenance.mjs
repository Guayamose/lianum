/** Public-only integrity inventory for PC16. Never reads private witness input or key files. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/chains/runtime-harness.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>readFile(join(projectRoot,p));
const report=JSON.parse(await read('evidence/m16-finality-native.json'));
assert.equal(report.phase,'completed');assert.equal(report.fullAcceptance,false);
const result={classification:'PC16_PUBLIC_ARTIFACT_INTEGRITY_NOT_INDEPENDENT_SECURITY_REVIEW',createdAt:new Date().toISOString(),runId:report.runId,fullAcceptance:false,sourceAtRun:{},currentSource:{},proofArtifacts:[],reusedCircuitArtifacts:{},nativeReport:{path:'evidence/m16-finality-native.json',sha256:sha(await read('evidence/m16-finality-native.json'))},privateWitnessesIncluded:false,privateKeysIncluded:false};
for(const [path,expected]of Object.entries(report.sourceHashes)){
 const archived=`evidence/m16-source-at-run/${report.runId}/${path}`,b=await read(archived);assert.equal(sha(b),expected,'SOURCE_AT_RUN_HASH');result.sourceAtRun[path]={path:archived,bytes:b.length,sha256:expected};
 const current=await read(path);result.currentSource[path]={sha256:sha(current),matchesRun:sha(current)===expected};
}
for(const proof of report.proofs){
 const prefix=`evidence/m16-proof/${report.runId}/${proof.label}`,bytes=await read(prefix+'/proof.bin'),inputs=await read(prefix+'/public-inputs.json');
 assert.equal(sha(bytes),proof.proofSHA256);assert.equal(sha(inputs),proof.publicInputsSHA256);assert.equal(bytes.length,proof.proofBytes);assert.equal(JSON.parse(inputs).length,proof.publicInputCount);
 result.proofArtifacts.push({mode:proof.mode,label:proof.label,proof:{path:prefix+'/proof.bin',bytes:bytes.length,sha256:sha(bytes)},publicInputs:{path:prefix+'/public-inputs.json',count:proof.publicInputCount,sha256:sha(inputs)}});
}
for(const mode of ['reserve','fulfill','refund','withdraw','sol_ready','btc_ready']){
 const root='experiments/private-core-proof/native-notes/.local',source=await read(`${root}/prepared/${mode}.sol`),vk=await read(`${root}/prepared/${mode}.vk`),compiled=await read(`${root}/compiled/${mode}.json`);
 assert.equal(sha(source),report.compilation.sources[`${mode}.sol`].sha256,'VERIFIER_SOURCE_MATCHES_DEPLOYMENT');
 const dest=`evidence/m16-source-at-run/${report.runId}/reused-circuits/${mode}`;await mkdir(join(projectRoot,dest),{recursive:true});
 for(const [name,b]of [['verifier.sol',source],['verification-key.bin',vk],['compiled.json',compiled]])await writeFile(join(projectRoot,dest,name),b);
 result.reusedCircuitArtifacts[mode]={verifierSHA256:sha(source),verificationKeySHA256:sha(vk),compiledJSONSHA256:sha(compiled),artifactDirectory:dest};
}
const delta=JSON.parse(await read('evidence/m16-host-delta.json'));
assert.equal(delta.runId,report.runId);assert.equal(delta.beforeSHA256,report.sourceHashes[delta.source]);assert.equal(delta.afterSHA256,result.currentSource[delta.source].sha256);
assert.equal(sha(await read(delta.afterSource)),delta.afterSHA256);
assert.ok(Object.entries(result.currentSource).every(([path,item])=>item.matchesRun||path===delta.source),'UNDOCUMENTED_POST_RUN_SOURCE_CHANGE');
result.postRunHostDelta={path:'evidence/m16-host-delta.json',sha256:sha(await read('evidence/m16-host-delta.json')),description:delta.change,source:delta.source,focusedTestsPassed:delta.tests.passed,actualSolanaReorgExecuted:false};
const controls=JSON.parse(await read('evidence/m16-controls.json'));assert.equal(controls.status,'PASSED');assert.equal(controls.classification,'CONTROL_FLOW_ONLY_NOT_PROOF_SECURITY');
result.mockControls={path:'evidence/m16-controls.json',sha256:sha(await read('evidence/m16-controls.json')),classification:controls.classification,passedCases:controls.passedCases,receiptCount:controls.receipts.length};
result.documentation={path:'docs/CURRENT-NATIVE-FINALITY-016.md',sha256:sha(await read('docs/CURRENT-NATIVE-FINALITY-016.md'))};
await writeFile(join(projectRoot,'evidence/m16-provenance.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({verified:true,runId:report.runId,publicProofs:result.proofArtifacts.length,allCurrentSourceMatchesRun:Object.values(result.currentSource).every(x=>x.matchesRun),fullAcceptance:false}));
