/** Fixed planned restart source capsule. This extends the original financial
 * capsule; raw source code for both original PIDs and the Python launcher is
 * checked before/after. No caller root/pin or historical compiler-table change. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT} from '@lianum/proofs/catalog';
import {deviceOwnerRecoverySourcePinsV1} from './device-owner-recovery-source-pins-v1.mjs';
const FIXED=Object.freeze(['integration/native-value-economic-recovery-flow-v1.mjs','integration/run-native-value-economic-recovery-v1.mjs',
 'integration/native-device-economic-source-pins-v1.mjs','integration/native-device-economic-policy-v1.mjs','integration/native-device-economic-launcher-v1.mjs',
 'integration/native-device-economic-original-continuation-v1.mjs','integration/native-device-economic-successor-worker-v1.mjs','integration/native-device-economic-successor-audit-v1.mjs',
 'wallet-platform/modules/ops/native-device-economic-service-v1.mjs','wallet-platform/modules/ops/native-value-economic-successor-v1.mjs']);
export function nativeDeviceEconomicSourcePinsV1(){assert.equal(arguments.length,0,'NATIVE_DEVICE_ECONOMIC_SOURCE_NO_OPTIONS');
 return{...deviceOwnerRecoverySourcePinsV1(),format:'LIANUM_NATIVE_DEVICE_ECONOMIC_SOURCE_CAPSULE_V1',economicRestartRunner:FIXED.map(name=>{
  const path=join(ROOT,name);assert.equal(realpathSync(path),path);const before=lstatSync(path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.size<=262144);
  const bytes=readFileSync(path),after=lstatSync(path);for(const key of['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(before[key],after[key]);
  return{path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};})};}
