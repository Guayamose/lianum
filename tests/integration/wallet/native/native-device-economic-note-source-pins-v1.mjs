/** Fixed planned restart source capsule. This extends the original financial
 * capsule; raw source code for both original PIDs and the Python launcher is
 * checked before/after. No caller root/pin or historical compiler-table change. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync,openSync,fstatSync,closeSync,constants} from 'node:fs';
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

// Separate fixed SQL/economic acceptance. Infrastructure is local PostgreSQL;
// it is not an economic resource, effect selector, source note or authority.
const DURABLE_FIXED=Object.freeze(['integration/run-native-value-durable-economic-note-recovery-v1.mjs',
 'integration/run-native-value-durable-economic-note-successor-v1.mjs','integration/paired-native-note-flow-v2.mjs',
 'integration/device-owner-deposit-original-step-v1.mjs','integration/device-owner-reservation-original-continuation-v1.mjs',
 'integration/native-device-economic-launcher-v1.mjs','integration/native-device-economic-successor-worker-v1.mjs',
 'integration/native-device-economic-note-policy-v1.mjs','integration/native-device-economic-note-source-pins-v1.mjs',
 'integration/native-device-economic-note-process-scope-v1.mjs',
 'wallet-platform/modules/ops/native-device-local-operator-v1.mjs','wallet-platform/modules/ops/native-device-economic-service-v1.mjs',
 'wallet-platform/modules/mobile/original-device-durable-dispatch-v1.mjs','wallet-platform/modules/mobile/paired-original-account-http-v2.mjs',
 'wallet-platform/modules/native-claims/wrapped-recovery-authority-v1.mjs']);
const PLATFORM_FIXED=Object.freeze(['database-pool.mjs','original-device-schema-v1.mjs']);
const platformRoot=()=>join(resolve(FLAT,'../../..'),'apps/platform/src');
function durableSourcePin(name,path){assert.equal(realpathSync(path),path);const before=lstatSync(path);
 assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.size>0&&before.size<=262144);
 const bytes=readFileSync(path),after=lstatSync(path);for(const k of ['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs'])assert.equal(before[k],after[k]);
 return{path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
export function nativeDeviceDurableEconomicNoteSourcePinsV1(){assert.equal(arguments.length,0);
 return{...nativeDeviceEconomicNoteSourcePinsV1(),format:'LIANUM_NATIVE_DEVICE_DURABLE_ECONOMIC_NOTE_SOURCE_CAPSULE_V1',
  durableRunner:DURABLE_FIXED.map(n=>durableSourcePin(n,join(ROOT,n))),
  originalPlatform:PLATFORM_FIXED.map(n=>durableSourcePin('workspace-module/apps/platform/src/'+n,join(platformRoot(),n)))};}
function readDurableInfrastructure(){const path=join(ROOT,'.local/native-value-durable-economic-note-recovery-v1/operator-infrastructure.json');
 assert.equal(realpathSync(path),path);const directory=lstatSync(join(path,'..')),before=lstatSync(path);
 assert.ok(directory.isDirectory()&&!directory.isSymbolicLink()&&directory.uid===process.getuid()&&(directory.mode&0o077)===0);
 assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.uid===process.getuid()&&(before.mode&0o777)===0o600&&before.size>0&&before.size<=4096);
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;try{const opened=fstatSync(fd);for(const k of ['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs'])assert.equal(before[k],opened[k]);
  bytes=readFileSync(fd);const after=fstatSync(fd),named=lstatSync(path);for(const k of ['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs']){assert.equal(before[k],after[k]);assert.equal(before[k],named[k]);}assert.equal(bytes.length,before.size);
  const value=JSON.parse(bytes.toString('utf8'));assert.deepEqual(Object.keys(value).sort(),['databaseURL','privacyKey','profile']);
  assert.equal(value.profile,'ORIGINAL_NATIVE_DURABLE_ACCEPTANCE_INFRASTRUCTURE_V1');
  assert.ok(typeof value.databaseURL==='string'&&value.databaseURL.length<=2048);const uri=new URL(value.databaseURL);
  assert.ok(['postgresql:','postgres:'].includes(uri.protocol)&&['127.0.0.1','localhost','[::1]'].includes(uri.hostname));
  assert.match(value.privacyKey,/^[0-9a-f]{64}$/);assert.notEqual(value.privacyKey,'0'.repeat(64));
  return{value,identity:Object.freeze(Object.fromEntries(['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs'].map(k=>[k,before[k]])))};
 }finally{bytes?.fill(0);closeSync(fd);}}
async function openDurableInfrastructure(reopened,expected){const read=readDurableInfrastructure();if(reopened)assert.deepEqual(read.identity,expected,'NATIVE_DURABLE_ORIGINAL_INFRASTRUCTURE_CHANGED');
 const before=PLATFORM_FIXED.map(n=>durableSourcePin(n,join(platformRoot(),n))),{pathToFileURL}=await import('node:url');
 const [{createPlatformPool},{assertOriginalDeviceDispatchSchemaV1}]=await Promise.all(PLATFORM_FIXED.map(n=>import(pathToFileURL(join(platformRoot(),n)).href)));
 assert.deepEqual(PLATFORM_FIXED.map(n=>durableSourcePin(n,join(platformRoot(),n))),before);
 const pool=createPlatformPool(read.value.databaseURL);let closed=false;try{await assertOriginalDeviceDispatchSchemaV1(pool);
  if(!reopened)assert.equal((await pool.query('SELECT count(*)::integer AS n FROM public.original_device_dispatch_v1')).rows[0].n,0,'NATIVE_DURABLE_FRESH_JOURNAL_REQUIRED');
  const privacyKey=read.value.privacyKey;read.value.privacyKey=null;read.value.databaseURL=null;
  return Object.freeze({pool,privacyKey,identity:read.identity,async snapshot(){assert.equal(closed,false);const current=readDurableInfrastructure();try{assert.deepEqual(current.identity,read.identity);}finally{current.value.databaseURL=null;current.value.privacyKey=null;}
    const result=await pool.query('SELECT operation_key,consent_key,terms_hash,state FROM public.original_device_dispatch_v1 ORDER BY operation_key');
    for(const row of result.rows){assert.deepEqual(Object.keys(row).sort(),['consent_key','operation_key','state','terms_hash']);for(const k of ['operation_key','consent_key','terms_hash'])assert.match(row[k],/^[0-9a-f]{64}$/);assert.ok(['UNKNOWN','RETURNED'].includes(row.state));}
    return result.rows;},async close(){if(closed)return{closed:true};closed=true;await pool.end();return{closed:true};}});
 }catch(error){await pool.end().catch(()=>{});throw error;}finally{read.value.databaseURL=null;read.value.privacyKey=null;}}
export function openNativeDeviceDurableAcceptanceInfrastructureV1(){assert.equal(arguments.length,0);return openDurableInfrastructure(false,null);}
export function reopenNativeDeviceDurableAcceptanceInfrastructureV1(expected){assert.equal(arguments.length,1);return openDurableInfrastructure(true,expected);}
