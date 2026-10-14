/** Read-only current public compiler data for pure proposal tests. No original
 * runtime/system/custody brand, verifier execution, build or deployment. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {resourceRoot} from '@lianum/environment';
import {DEVELOPMENT_EVM_DIRECTORY,DEVELOPMENT_EVM_BUILD_PIN,readDevelopmentEvmBuild} from '../../../../src/operations/deployments/system/development-evm-build.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function readCurrentFlatPublicPlanArtifacts(){
 assert.equal(arguments.length,0);
 readDevelopmentEvmBuild();
 const path=join(DEVELOPMENT_EVM_DIRECTORY,'ledger/compiled.json'),stat=lstatSync(path);
 assert.ok(stat.isFile()&&!stat.isSymbolicLink());
 const bytes=readFileSync(path);assert.equal(sha(bytes),DEVELOPMENT_EVM_BUILD_PIN.ledgerSHA256);
 const compilation=JSON.parse(bytes),sourceMap={};
 for(const row of compilation.sources){
  assert.ok(typeof row.name==='string'&&/^[A-Za-z0-9_/-]+\.sol$/.test(row.name)&&!row.name.startsWith('/')&&!row.name.split('/').includes('..'));
  const path=join(resourceRoot('wallet'),'contracts',row.name),stat=lstatSync(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink());
  const source=readFileSync(path);assert.equal(source.length,row.bytes);assert.equal(sha(source),row.sha256);
  sourceMap[row.name]={content:source.toString('utf8'),sha256:row.sha256};
 }
 // The original pure planner still validates compiler/settings/AST/ABI/runtime
 // and every fixed source pin when consuming this DATA below.
 return {compilation,sourceMap};
}
