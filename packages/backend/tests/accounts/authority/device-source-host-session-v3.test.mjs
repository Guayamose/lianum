import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile),fixture=fileURLToPath(new URL('../../support/device-source-host-session-fixture.mjs',import.meta.url));
for(const [method,reopens]of [['installOriginalSourceGraphSdkV2',1],['installOriginalSourceGraphSdkV3',2],['installOriginalAaveSourceGraphSdkV3',2]]){
 test('HOST full mobile SOURCE session '+method+' preserves paired Vault across exactly '+reopens+' reopens',async()=>{
  const {stdout}=await run(process.execPath,[fixture,method],{timeout:20000,maxBuffer:65536});assert.deepEqual(JSON.parse(stdout),{mode:method,reopens,requests:reopens+1,closed:true});
 });
}
