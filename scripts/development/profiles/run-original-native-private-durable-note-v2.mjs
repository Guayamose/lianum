/** Fixed private Native D26/W39 + durable SQL entry. Original local infrastructure and
 * protected public pairing/TLS config; no witness, root, funding or mode input. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startPlatformOriginalPrivateNativeNoteDurableOperatorV2,platformOriginalDeviceDurableLocalConfigurationPathV1} from '../../../services/api-server/src/original/original-device-local-operator-v1.mjs';
import {createPlatformPool} from '../../../services/api-server/src/storage/database-pool.mjs';
import {readPlatformPrivacyKeyV1} from '../../../services/api-server/src/authorization/privacy-key-v1.mjs';
import {assertOriginalDeviceDispatchSchemaV1} from '../../../services/api-server/src/original/original-device-schema-v1.mjs';
async function privateFile(path, maximum) {
  const directory = dirname(path), dir = await lstat(directory);
  assert.ok(dir.isDirectory() && !dir.isSymbolicLink() && dir.uid === process.getuid()
    && (dir.mode & 0o077) === 0 && await realpath(directory) === directory, 'PLATFORM_ORIGINAL_LOCAL_PRIVATE_DIRECTORY');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); let bytes;
  try {
    const before = await handle.stat();
    assert.ok(before.isFile() && before.uid === process.getuid() && (before.mode & 0o777) === 0o600
      && before.nlink === 1 && before.size > 0 && before.size <= maximum, 'PLATFORM_ORIGINAL_LOCAL_PRIVATE_FILE');
    bytes = Buffer.alloc(maximum + 1); const count = (await handle.read(bytes, 0, bytes.length, 0)).bytesRead;
    const after = await handle.stat(), named = await lstat(path);
    for (const field of ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'])
      assert.ok(before[field] === after[field] && before[field] === named[field], 'PLATFORM_ORIGINAL_LOCAL_FILE_CHANGED');
    assert.equal(named.isSymbolicLink(), false); assert.equal(count, before.size);
    return JSON.parse(bytes.subarray(0, count).toString('utf8'));
  } finally { bytes?.fill(0); await handle.close(); }
}
async function publishDescriptor(directory, service) {
  const destination = join(directory, 'paired-private-durable-note-descriptor-v2.json'), value = { version: 1, profile: service.profile,
    origin: service.origin, descriptor: service.descriptor, localFakeValues: true, automaticFunding: false, cloudAuthority: false, durableOriginalAdmission:true,
    privateD26AndW39Intake:true, nativeRecipientToWorkerEncrypted:false };
  const handle = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  const parent = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await parent.sync(); } finally { await parent.close(); }
  assert.deepEqual(await privateFile(destination, 16384), value);
}
const entry=fileURLToPath(import.meta.url);
assert.equal(process.execPath,fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node',import.meta.url)),'PLATFORM_ORIGINAL_LOCAL_PINNED_NODE');
assert.equal(process.argv.length,2,'PLATFORM_ORIGINAL_LOCAL_FIXED_ENTRY');assert.equal(process.argv[1],entry);
assert.equal(await realpath(entry),entry);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
assert.deepEqual(process.execArgv,['--max-old-space-size=384'],'PLATFORM_ORIGINAL_LOCAL_FIXED_HEAP');
let acquisition,service,pool,closeRequested=false,captureRequested=false,closing;
function close(){closeRequested=true;return closing??=(async()=>{try{
 if(acquisition)service=await acquisition;
 if(service){
  if(captureRequested){try{const result=await service.capture();assert.ok(result.closed&&result.originalResourcesStopped&&result.plannedCaptureForNewProcess,'PLATFORM_ORIGINAL_LOCAL_CAPTURE_UNCONFIRMED');process.stdout.write('ORIGINAL_PRIVATE_NATIVE_NOTE_DURABLE_CAPTURE_READY\n');}
   catch(error){try{await service.close();}catch(failure){throw new AggregateError([error,failure],'PLATFORM_ORIGINAL_LOCAL_CAPTURE_CLOSE_UNCONFIRMED');}throw error;}}
  else{const result=await service.close();assert.ok(result.closed&&result.originalResourcesStopped,'PLATFORM_ORIGINAL_LOCAL_CLOSE_UNCONFIRMED');}
 }
 }finally{await pool?.end();}})();}
const stop=()=>{void close().catch(()=>{process.stderr.write('PLATFORM_ORIGINAL_PRIVATE_DURABLE_NOTE_CLOSE_UNCONFIRMED\n');process.exitCode=1;});};
process.once('SIGINT',stop);process.once('SIGTERM',stop);process.once('SIGUSR2',()=>{if(!closeRequested)captureRequested=true;stop();});
try{
 const path=await platformOriginalDeviceDurableLocalConfigurationPathV1(),config=await privateFile(path,32768);
 assert.ok(process.env.DATABASE_URL,'PLATFORM_ORIGINAL_SCHEMA_CONFIGURATION');
 await lstat(join(dirname(path),'paired-private-durable-note-descriptor-v2.json')).then(()=>{throw Error('PLATFORM_ORIGINAL_PRIVATE_DURABLE_ALREADY_PAIRED');},error=>{if(error.code!=='ENOENT')throw error;});
 if(!closeRequested){
  pool=createPlatformPool(process.env.DATABASE_URL);await assertOriginalDeviceDispatchSchemaV1(pool);
  if(closeRequested){config.tls=null;await close();}else{
  acquisition=startPlatformOriginalPrivateNativeNoteDurableOperatorV2({...config,pool,privacyKey:readPlatformPrivacyKeyV1()});acquisition.catch(()=>{});config.tls=null;service=await acquisition;
  assert.equal(service.profile,'ORIGINAL_NATIVE_DEVICE_PRIVATE_DURABLE_NOTE_OPERATOR_V2');
  if(closeRequested)await close();else{await publishDescriptor(dirname(path),service);if(closeRequested)await close();else process.stdout.write('ORIGINAL_PRIVATE_NATIVE_NOTE_DURABLE_SERVICE_READY\n');}}
 }else config.tls=null;
}catch{process.exitCode=1;try{await close();}catch{process.stderr.write('PLATFORM_ORIGINAL_PRIVATE_DURABLE_NOTE_CLOSE_UNCONFIRMED\n');}process.stderr.write('PLATFORM_ORIGINAL_PRIVATE_DURABLE_NOTE_START_FAILED\n');}
