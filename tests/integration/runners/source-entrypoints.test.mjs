import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {realpathSync,statSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {projectRoot} from '@lianum/environment';
import {applicationFlowEntrypoints} from './application-flow-entrypoints.mjs';
import {integrationTask} from './task-catalog.mjs';

test('fixed application and compiler profiles resolve actual source owners',()=>{
 const compiler=['claim-verifiers','native-claim','evm-deposit','envelope','native','verification','verifiers'].map(integrationTask);
 for(const row of [...Object.values(applicationFlowEntrypoints),...compiler]){
  assert.ok(Object.isFrozen(row));
  for(const path of [row.entry,row.worker]){
   assert.ok(path.startsWith(join(projectRoot,'tests/integration')+'/'));
   assert.equal(realpathSync(path),path);assert.ok(statSync(path).isFile());
  }
 }
 for(const invalid of ['completion','../../other','__proto__',null,{}])assert.throws(()=>integrationTask(invalid),/ENVELOPE_FIXED_TASK/);
});

test('a real canonical worker rejects malformed launch before compiler or output creation',()=>{
 const directory=mkdtempSync(join(tmpdir(),'lianum-fixed-worker-'));
 try{
  for(const [worker,expected] of [
   [integrationTask('envelope').worker,/ENVELOPE_FIXED_WORKER_ARGS/],
   [fileURLToPath(new URL('../../../packages/backend/src/proving/native-value/runtime/native-value-dev-live-v5-worker.mjs',import.meta.url)),/AssertionError/],
  ]){
   const child=spawnSync(process.execPath,[worker],{
    cwd:directory,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},encoding:'utf8',timeout:10000,maxBuffer:1024*1024,
   });
   assert.ifError(child.error);assert.equal(child.status,1);assert.match(child.stderr,expected);
   assert.doesNotMatch(child.stderr,/ERR_MODULE_NOT_FOUND|ENOENT|CURRENT_SOURCE_PIN/);
  }
 }finally{rmSync(directory,{recursive:true,force:true});}
});
