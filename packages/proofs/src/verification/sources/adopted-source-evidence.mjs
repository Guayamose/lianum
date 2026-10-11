/** Current source evidence has one authority: the explicitly adopted generation.
 * Original compiler/key evidence remains in its retained artifact readers. */
import assert from 'node:assert/strict';
import {join,relative,sep} from 'node:path';
import {projectRoot} from '@lianum/environment';
import {FLAT,CANDIDATE} from '@lianum/proofs/catalog';
import {regular,hash,verifyAPI,verifyVendor} from '@lianum/proofs/tooling/tooling';
import {assertAdoptedSourceGeneration} from '../../toolchain/current-source-generation.mjs';

export function captureAdoptedSourceEvidence(){
 assert.equal(arguments.length,0,'ADOPTED_SOURCE_EVIDENCE_NO_OPTIONS');
 const adopted=assertAdoptedSourceGeneration();
 const local=adopted.sourceFiles.map(row=>{
  const path=join(projectRoot,row.source),bytes=regular(path);
  assert.equal(hash(bytes),row.sourceSHA256,'ADOPTED_SOURCE_CHANGED_DURING_CAPTURE');
  return Object.freeze({path:relative(FLAT,path).split(sep).join('/'),bytes:bytes.length,sha256:row.sourceSHA256});
 });
 // This original verifier is still executed by retained-key validation. Its
 // bytes are evidence, never substituted by an editable implementation.
 const original=join(CANDIDATE,'src/component-tooling.mjs'),bytes=regular(original);
 const immutableExecutionSources=Object.freeze([Object.freeze({path:relative(FLAT,original).split(sep).join('/'),bytes:bytes.length,sha256:hash(bytes)})]);
 local.push(...immutableExecutionSources);local.sort((a,b)=>a.path.localeCompare(b.path));
 assert.equal(new Set(local.map(row=>row.path)).size,local.length,'ADOPTED_SOURCE_DUPLICATE_RECORD');
 return Object.freeze({format:'ADOPTED_EXECUTION_SOURCE_EVIDENCE_V1',generation:adopted.generation,sourceSHA256:adopted.sourceSHA256,
  sourceFiles:adopted.sourceFiles,local:Object.freeze(local),immutableExecutionSources,
  officialAPI:verifyAPI(),vendor:verifyVendor()});
}

/** Check that a fixed caller's entrypoints are covered by a captured generation.
 * This is data validation, not an issuer or substitute for capturing evidence. */
export function assertCapturedCurrentSources(evidence,required){
 const available=new Set(evidence.sourceFiles.map(row=>row.source));
 for(const source of required)assert.ok(available.has(source),'ADOPTED_EXECUTION_ENTRY_REQUIRED: '+source);
}
