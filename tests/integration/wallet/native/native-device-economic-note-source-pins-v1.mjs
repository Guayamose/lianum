/** Fixed planned restart source capsule. This extends the original financial
 * capsule; raw source code for both original PIDs and the Python launcher is
 * checked before/after. No caller root/pin or historical compiler-table change. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {ROOT,FLAT} from '../../../../packages/proofs/src/catalog.mjs';
import {nativeValueDevFinancialSourcePinsV5} from '../../../../packages/backend/src/operations/releases/native-value/native-value-dev-financial-source-pins-v5.mjs';
import {nativeDeviceEconomicSourcePinsV1} from './native-device-economic-source-pins-v1.mjs';
const FIXED=Object.freeze(['integration/native-value-economic-note-recovery-flow-v1.mjs','integration/run-native-value-economic-note-recovery-v1.mjs',
 'integration/native-device-economic-note-source-pins-v1.mjs','integration/native-device-economic-note-policy-v1.mjs','integration/native-device-economic-note-successor-worker-v1.mjs','integration/native-device-economic-note-process-scope-v1.mjs']);
// This raw-receipt consumer belongs to the new profile, independently of the
// immutable compiler's finite development-script table. Its canonical bytes
// remain part of this profile's before/after source closure.
function nativeNoteReceiptReaderPin(){
 const name='development-tooling/native_economic_note_receipts.py';
 const path=join(resolve(FLAT,'../../..'),'scripts/development/native_economic_note_receipts.py');
 assert.equal(realpathSync(path),path,'NATIVE_NOTE_RECEIPT_READER_SOURCE_ALIAS');
 const before=lstatSync(path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.size>0&&before.size<=262144,'NATIVE_NOTE_RECEIPT_READER_SOURCE_FILE');
 const bytes=readFileSync(path),after=lstatSync(path);
 for(const key of['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(before[key],after[key],'NATIVE_NOTE_RECEIPT_READER_SOURCE_CHANGED');
 assert.equal(bytes.length,before.size,'NATIVE_NOTE_RECEIPT_READER_SOURCE_CHANGED');
 return{path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export function nativeDeviceEconomicNoteSourcePinsV1(){assert.equal(arguments.length,0,'NATIVE_DEVICE_ECONOMIC_SOURCE_NO_OPTIONS');
 return{...nativeDeviceEconomicSourcePinsV1(),format:'LIANUM_NATIVE_DEVICE_ECONOMIC_NOTE_SOURCE_CAPSULE_V1',financialCurrent:nativeValueDevFinancialSourcePinsV5(),nativeNoteReceiptReader:[nativeNoteReceiptReaderPin()],nativeNoteRestartRunner:FIXED.map(name=>{
  const path=join(ROOT,name);assert.equal(realpathSync(path),path);const before=lstatSync(path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.size<=262144);
  const bytes=readFileSync(path),after=lstatSync(path);for(const key of['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(before[key],after[key]);
  return{path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};})};}
