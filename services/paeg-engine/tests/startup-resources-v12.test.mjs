import test from 'node:test';
import assert from 'node:assert/strict';
import {mock} from 'node:test';
let available=16*1024**3,free=10*1024**3,workerPath;
mock.module('node:fs/promises',{exports:{readFile:async()=>`MemAvailable: ${available/1024} kB`,statfs:async path=>{workerPath=path;return{bavail:free/4096,bsize:4096};}}});
const {assertPublicStartupResourcesV12:check}=await import('../src/public/startup-resources-v12.mjs');
const policy={floors:{availableRAM:2684354560,freeDisk:5368709120}};
test('startup rejects the observed failed disk margin before any owner/RPC and keeps post-install headroom',async()=>{
 free=4556742656;await assert.rejects(check('/HOST/candidate',policy),/PAEG_STARTUP_DISK_HEADROOM/);
 free=policy.floors.freeDisk+1024**3;await assert.rejects(check('/HOST/candidate',policy),/PAEG_STARTUP_DISK_HEADROOM/);
 free=10*1024**3;available=1024**3;await assert.rejects(check('/HOST/candidate',policy),/PAEG_STARTUP_RAM_FLOOR/);
 available=16*1024**3;const result=await check('/HOST/candidate',policy);assert.equal(result.stage,'STARTUP_RESOURCES_VERIFIED');assert.equal(result.requiredDisk,7*1024**3);assert.ok(workerPath.endsWith('/packages/backend/src/operations/local/device-paged-graph-recipient-v3.mjs'));
});
