/** Canonical argv/parent guards only. No compiler, circuit, key or chain starts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,realpathSync} from 'node:fs';
import {projectRoot} from '@lianum/environment';
import {NATIVE_CLAIMS_BUILD_SOURCES} from '../../../src/proving/native-ingress/tooling/native-claims-build-common.mjs';
import {manualWalletEntrypoints,manualWalletInvocation} from '../../../../../tests/integration/wallet/manual/manual-wallet-entrypoints.mjs';
const env={PATH:'/usr/bin:/bin',LANG:'C.UTF-8'};

test('preparation and manual-wallet launchers resolve fixed canonical owners',()=>{
 for(const path of Object.values(NATIVE_CLAIMS_BUILD_SOURCES)){
  assert.ok(path.startsWith(projectRoot+'/'));assert.ok(!path.includes('/.internal/'));
  assert.equal(existsSync(path),true);assert.equal(realpathSync(path),path);
 }
 for(const selected of Object.values(manualWalletEntrypoints)){
  assert.equal(manualWalletInvocation(selected.worker,selected.entry),selected);
  assert.throws(()=>manualWalletInvocation(selected.worker,selected.entry+'.copy'),/FIXED_PARENT/);
  assert.throws(()=>manualWalletInvocation(selected.worker+'.copy',selected.entry),/FIXED_WORKER/);
  for(const path of [selected.worker,selected.entry])assert.equal(realpathSync(path),path);
 }
});
test('actual CO42 parent guard rejects an unrelated parent before exec',()=>{
 const result=spawnSync('/usr/bin/python3',[NATIVE_CLAIMS_BUILD_SOURCES.guardian,'compile'],{env,timeout:5000,encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/NATIVE_REBUILD_FIXED_ACTUAL_PARENT/);assert.equal(result.stdout,'');
});
test('actual build worker rejects malformed launch identity before opening any build',()=>{
 const result=spawnSync(process.execPath,[NATIVE_CLAIMS_BUILD_SOURCES.worker,'compile-v3','not-an-original-run-id'],{env,timeout:5000,encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/PW_GENERATED_UUID_REQUIRED/);assert.equal(result.stdout,'');
});
