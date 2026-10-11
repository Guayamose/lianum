/** Existing full financial capsule plus the fixed happy continuation. The
 * original mobile TS client paths are already captured by the U/S capsule. */
import assert from 'node:assert/strict';
import {projectRoot} from '@lianum/environment';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT} from '@lianum/proofs/catalog';
import {deviceOwnerReservationSourcePinsV1} from './device-owner-reservation-source-pins-v1.mjs';
const RUNNER=Object.freeze(['tests/integration/wallet/native/device-owner-execution-flow-v1.mjs','tests/integration/wallet/native/run-device-owner-execution-v1.mjs',
 'tests/integration/wallet/native/device-owner-execution-original-continuation-v1.mjs','tests/integration/wallet/native/device-owner-execution-native-checks-v1.mjs',
 'tests/integration/wallet/native/device-owner-execution-policy-v1.mjs','tests/integration/wallet/native/device-owner-execution-source-pins-v1.mjs']);
export function deviceOwnerExecutionSourcePinsV1(){assert.equal(arguments.length,0,'DEVICE_NATIVE_SOURCE_NO_OPTIONS');
 return{...deviceOwnerReservationSourcePinsV1(),format:'LIANUM_DEVICE_OWNER_EXECUTION_SOURCE_CAPSULE_V1',executionRunner:RUNNER.map(name=>{
  const path=join(projectRoot,name);assert.equal(realpathSync(path),path);const before=lstatSync(path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.size<=262144);
  const raw=readFileSync(path),after=lstatSync(path);for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(before[k],after[k]);
  return{path:name,bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')};})};}
