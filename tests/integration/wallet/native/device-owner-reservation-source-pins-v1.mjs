/** Existing full financial capsule plus EXACT physical mobile TS modules
 * actually executed by this enumerated Node acceptance. No caller pin/path. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {ROOT,FLAT} from '@lianum/proofs/catalog';
import {deviceOwnerDepositSourcePinsV1} from './device-owner-deposit-source-pins-v1.mjs';
const MOBILE=resolve(FLAT,'../../../apps/mobile'),PROJECT=resolve(ROOT,'../../../..');
const CLIENT=Object.freeze(['src/api/original-account-api-v2.mjs','src/api/device-owner-deposit-api-v1.ts','src/api/device-owner-reservation-api-v1.ts',
 'src/api/device-owner-exit-api-v1.ts','src/api/device-owner-execution-api-v1.ts','src/api/device-owner-output-balance-api-v1.ts','src/custody/device-balance-withdrawal-codec-v1.mjs',
 'src/custody/local-root-note-vault-v1.ts','src/custody/signing.mjs','src/custody/balance-note-codec-v1.mjs','src/custody/unissued-deposit-terms-v1.mjs',
 'src/custody/funded-balance-owner-codec-v1.mjs']);
const RUNNER=Object.freeze(['integration/device-owner-reservation-flow-v1.mjs','integration/run-device-owner-reservation-v1.mjs',
 'integration/device-owner-reservation-original-continuation-v1.mjs','integration/device-owner-reservation-host-vault-v1.mjs',
 'integration/device-owner-reservation-original-preparation-v1.mjs','integration/device-owner-reservation-policy-v1.mjs',
 'integration/device-owner-reservation-source-pins-v1.mjs']);
function fixed(base,name,label){let current=base;assert.equal(realpathSync(base),base);
 for(const part of name.split('/')){current=join(current,part);assert.equal(lstatSync(current).isSymbolicLink(),false);}
 const before=lstatSync(current);assert.ok(before.isFile()&&before.size<=2*1024*1024);const bytes=readFileSync(current),after=lstatSync(current);
 for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(after[k],before[k]);assert.equal(bytes.length,before.size);
 return{path:label+name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
export function deviceOwnerReservationSourcePinsV1(){assert.equal(arguments.length,0,'DEVICE_US_SOURCE_NO_OPTIONS');
 return{...deviceOwnerDepositSourcePinsV1(),format:'LIANUM_DEVICE_OWNER_RESERVATION_SOURCE_CAPSULE_V1',
  reservationClient:CLIENT.map(name=>fixed(MOBILE,name,'mobile-app/')),reservationRunner:RUNNER.map(name=>fixed(ROOT,name,'')),
  originalLauncher:fixed(PROJECT,'scripts/development/paired_original_account_lab.py','development-project/')};}
