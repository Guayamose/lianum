/** Read-only retained files; no prover, compiler, financial runtime or mutation. */
import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {join} from 'node:path';
import {projectRoot} from '@lianum/environment';

let alteredPath=null, forbiddenHost=null;
const exportsOf=namespace=>Object.fromEntries(Object.entries(namespace).filter(([name])=>name!=='default'));
mock.module('node:fs',{namedExports:{...exportsOf(fs),readFileSync(path,...args){
 const resolved=path instanceof URL ? path.pathname : String(path);
 if(resolved===forbiddenHost)throw new Error('RETAINED_HOST_IS_NOT_CURRENT_COMPILER_INPUT');
 const value=fs.readFileSync(path,...args);
 if(resolved!==alteredPath)return value;
 assert.ok(Buffer.isBuffer(value));const changed=Buffer.from(value);changed[changed.length-1]^=1;return changed;
}}});
const {inspectRetainedFundedPagedGraphArtifactsForPreparationV4,PAEG_PAGED_RETAINED_ARTIFACT_DIRECTORY_V3}=
 await import('../../src/toolchain/paged-artifacts-v3.mjs');

test('paged reuse authenticates the original programs and compiler inputs without relabelling changed host sources',()=>{
 assert.throws(()=>inspectRetainedFundedPagedGraphArtifactsForPreparationV4({}),/PAEG_PAGED_PREPARATION_NO_OPTIONS/);
 forbiddenHost=join(projectRoot,'.internal/runtime/omnichain-flat-profile/flat-wallet/proof-workers/solidity-compiler.mjs');
 const receipt=inspectRetainedFundedPagedGraphArtifactsForPreparationV4();
 assert.deepEqual(Object.keys(receipt.roles),['reserve','fold','terminal','admission','withdraw']);
 assert.ok(receipt.compilerInputs.some(row=>row.path.endsWith('.nr')));
 assert.ok(receipt.compilerInputs.every(row=>!row.path.endsWith('.mjs')));
 assert.equal(receipt.compilerInputs.length+receipt.hostSources.length,receipt.recordedSourceFiles.length);
 assert.equal(receipt.hostSources.filter(row=>row.source!==row.path).length,14);
 assert.equal(receipt.currentLaunchersClaimedAsOriginal,false);
 assert.equal(receipt.sourceCapsuleRewritten,false);
 assert.equal(receipt.compiledNow,false);
 assert.equal(receipt.artifactBundleIssued,false);
 assert.equal(receipt.financialAcceptance,false);
 forbiddenHost=null;
 const circuit=receipt.compilerInputs.find(row=>row.path.endsWith('.nr')).path;
 for(const [path,code]of [
  [join(PAEG_PAGED_RETAINED_ARTIFACT_DIRECTORY_V3,'manifest.json'),'PAEG_PAGED_MANIFEST_PIN'],
  [join(PAEG_PAGED_RETAINED_ARTIFACT_DIRECTORY_V3,'prepared/reserve.json'),'PAEG_PAGED_ARTIFACT_PIN'],
  [join(projectRoot,receipt.compilerInputs.find(row=>row.path===circuit).source??circuit),'PAEG_PAGED_RETAINED_COMPILER_PIN'],
  [join(projectRoot,receipt.hostSources.find(row=>row.source.startsWith('archive/source-evidence/')).source),'PAEG_PAGED_RETAINED_HOST_PIN'],
 ]){
  alteredPath=path;
  assert.throws(()=>inspectRetainedFundedPagedGraphArtifactsForPreparationV4(),new RegExp(code));
 }
 alteredPath=null;
});
