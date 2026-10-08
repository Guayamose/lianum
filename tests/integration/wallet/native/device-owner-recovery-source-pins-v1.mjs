/** Fixed F extension of the same original happy source capsule. No caller roots. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {deviceOwnerExecutionSourcePinsV1} from './device-owner-execution-source-pins-v1.mjs';
const FIXED=Object.freeze(['integration/device-owner-recovery-flow-v1.mjs','integration/run-device-owner-recovery-v1.mjs',
 'integration/device-owner-recovery-policy-v1.mjs','integration/device-owner-recovery-source-pins-v1.mjs']);
export function deviceOwnerRecoverySourcePinsV1(){assert.equal(arguments.length,0,'DEVICE_RECOVERY_SOURCE_NO_OPTIONS');
 return{...deviceOwnerExecutionSourcePinsV1(),format:'LIANUM_DEVICE_OWNER_RECOVERY_SOURCE_CAPSULE_V1',recoveryRunner:FIXED.map(name=>{
  const path=join(ROOT,name);assert.equal(realpathSync(path),path);const before=lstatSync(path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.size<=262144);
  const bytes=readFileSync(path),after=lstatSync(path);for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(before[k],after[k]);
  return{path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};})};}
