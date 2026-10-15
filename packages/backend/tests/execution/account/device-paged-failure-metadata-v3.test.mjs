/** Filesystem boundary HOST. Actual diagnostic producer; no proof or finance. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as environment from '@lianum/environment';
const directory=await mkdtemp(join(tmpdir(),'lianum-failure-metadata-'));
mock.module('@lianum/environment',{exports:{...environment,resourceRoot(name){assert.equal(name,'engine');return directory;}}});
const {retainDevicePagedFailureMetadataV3}=await import('../../../src/operations/local/device-paged-failure-metadata-v3.mjs');
test('wrapped Original worker code is retained separately without private error data',async t=>{
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const first=Error('PAGED_GRAPH_ORIGINAL_PROOF_FAILED');Object.defineProperty(first,'originalProofCode',{value:'PAEG_PAGED_WORKER_RSS'});first.witness='PRIVATE_TEST_WITNESS_SENTINEL';retainDevicePagedFailureMetadataV3(first,'GRAPH_RECIPIENT');
 const second=Error('PRIVATE_TEST_WITNESS_SENTINEL');Object.defineProperty(second,'originalProofCode',{value:'PAEG_PAGED_WORKER_RSS\nPRIVATE_TEST_WITNESS_SENTINEL'});retainDevicePagedFailureMetadataV3(second,'GRAPH_RECIPIENT');
 let getterCalls=0;const third=Error('PAGED_GRAPH_ORIGINAL_PROOF_FAILED');Object.defineProperty(third,'originalProofCode',{get(){getterCalls++;return 'PAEG_PAGED_WORKER_RSS';}});retainDevicePagedFailureMetadataV3(third,'GRAPH_RECIPIENT');
 const path=join(directory,'evidence/paeg-proof-attempts'),files=await readdir(path),rows=[];assert.equal(files.length,3);for(const file of files){const text=await readFile(join(path,file),'utf8');assert.ok(!text.includes('PRIVATE_TEST_WITNESS_SENTINEL'));assert.equal((await stat(join(path,file))).mode&0o777,0o600);rows.push(JSON.parse(text));}
 assert.equal(rows.filter(row=>row.originalProofCode==='PAEG_PAGED_WORKER_RSS').length,1);assert.equal(rows.filter(row=>row.originalProofCode===null).length,2);assert.equal(rows.find(row=>row.originalProofCode!==null).code,'PAGED_GRAPH_ORIGINAL_PROOF_FAILED');assert.equal(getterCalls,0);
});
