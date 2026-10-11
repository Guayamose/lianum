import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {lstatSync,readFileSync,realpathSync} from 'node:fs';import {join} from 'node:path';
import {ROOT} from '@lianum/proofs/catalog';
import {deviceOwnerRecoverySourcePinsV1} from './device-owner-recovery-source-pins-v1.mjs';
const FIXED=Object.freeze(['integration/run-device-owner-original-f-reorg-v1.mjs','integration/device-owner-original-f-reorg-flow-v1.mjs',
 'integration/device-owner-original-f-reorg-step-v1.mjs','integration/device-owner-original-f-reorg-policy-v1.mjs','integration/device-owner-original-f-reorg-source-pins-v1.mjs']);
export function deviceOwnerFReorgSourcePinsV1(){assert.equal(arguments.length,0);return{...deviceOwnerRecoverySourcePinsV1(),format:'ORIGINAL_DEVICE_F_REORG_SOURCE_CAPSULE_V1',originalFReorg:FIXED.map(name=>{
 const path=join(ROOT,name);assert.equal(realpathSync(path),path);const before=lstatSync(path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.size<=262144);const bytes=readFileSync(path),after=lstatSync(path);
 for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(before[k],after[k]);return{path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};})};}
