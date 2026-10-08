/** Fixed local product stdio driver over the accepted guarded Java opener.
 * The original runtime keeps its brands, journals, dispatch and finality checks.
 * No caller URL, clock, deadline, binary, key, adapter or callback is accepted. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { open, lstat, realpath, mkdir, mkdtemp, chmod, writeFile, rm, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../../../../../../engine/src/chains/shared/runtime-harness.mjs';
import { exact, hex } from '../../transfers/owned-tron-native-value-profile.mjs';
import { startOwnedTronAlignedProductChildV1 } from './tron-aligned-child-opener-v1.mjs';
import { createTronProductHostGuardV1 } from './tron-product-host-scope-v1.mjs';
import { assertOwnedTronProductReleaseV1, OWNED_TRON_PRODUCT_DRIVER_RELEASE_V1, OWNED_TRON_PRODUCT_TOTAL_MILLISECONDS_V1 } from './tron-product-release-v1.mjs';
import { captureTronProductSourcePinsV1 } from './tron-product-source-pins-v1.mjs';
const RUNTIME=join(projectRoot,'.local/owned-tron-native-value-v1');
const BASE=join(RUNTIME,'aligned-rocksdb-candidate-acceptance');
const LOCAL=join(RUNTIME,'product-runtime-v1'), LOCK=join(LOCAL,'active.lock');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function privateDirectory(path) {
 assert.equal(await realpath(path),path,'TRON_PRODUCT_DIRECTORY_SYMLINK'); const stat=await lstat(path);
 assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()&&(stat.mode&0o7777)===0o700,'TRON_PRODUCT_PRIVATE_DIRECTORY');
}
async function publish(path,value) { await writeFile(path,JSON.stringify(value),{mode:0o600,flag:'wx'}); }
function beginLifetime(scope) {
 const controller=new AbortController(); let finished=false;
 const began=scope.startedAt===undefined?Date.now():Date.parse(scope.startedAt);
 assert.ok(Number.isFinite(began),'TRON_PRODUCT_FIXED_LIFETIME_START');
 const deadline=began+OWNED_TRON_PRODUCT_TOTAL_MILLISECONDS_V1;
 const stop=code=>{if(!finished&&!controller.signal.aborted)controller.abort(Error(code));};
 const onTerm=()=>stop('TRON_PRODUCT_OWNER_SIGTERM_ORIGINAL_OUTCOME_UNKNOWN'),onInt=()=>stop('TRON_PRODUCT_OWNER_SIGINT_ORIGINAL_OUTCOME_UNKNOWN');
 process.on('SIGTERM',onTerm);process.on('SIGINT',onInt);
 const timer=setTimeout(()=>stop('TRON_PRODUCT_ORIGINAL_TOTAL_DEADLINE_OUTCOME_UNKNOWN'),Math.max(0,deadline-Date.now())); timer.unref();
 return {signal:controller.signal,deadline,assertActive(){if(controller.signal.aborted)throw controller.signal.reason;assert.equal(finished,false);assert.ok(Date.now()<deadline,'TRON_PRODUCT_FIXED_TOTAL_DEADLINE');},
  finish(){if(finished)return;finished=true;clearTimeout(timer);process.removeListener('SIGTERM',onTerm);process.removeListener('SIGINT',onInt);}};
}
export function inspectOwnedTronProductDriverPrerequisitesV1() {
 assert.equal(arguments.length,0,'TRON_PRODUCT_INSPECT_NO_OPTIONS'); return Object.freeze({
  classification:OWNED_TRON_PRODUCT_DRIVER_RELEASE_V1===null?'LOCAL_PRODUCT_DRIVER_SOURCE_REVIEW_PENDING':'REVIEWED_LOCAL_PRODUCT_DRIVER_MATERIAL',
  release:OWNED_TRON_PRODUCT_DRIVER_RELEASE_V1,totalMilliseconds:OWNED_TRON_PRODUCT_TOTAL_MILLISECONDS_V1,
  canonicalRuntimeRelease:null,publicNetwork:false,publicProductionEstablished:false,cloudAcceptanceEstablished:false,
  graphAdmissionEstablished:false,creditEstablished:false,productNativeAcceptanceEstablished:false,
  canLaunch:OWNED_TRON_PRODUCT_DRIVER_RELEASE_V1!==null,
  blockers:OWNED_TRON_PRODUCT_DRIVER_RELEASE_V1===null?['TRON_PRODUCT_SOURCE_REVIEW_REQUIRED']:['GENUINE_NEW_PRODUCT_DRIVER_ACCEPTANCE_REQUIRED']});
}
export async function startFixedOwnedTronProductDriverV1() {
 assert.equal(arguments.length,0,'TRON_PRODUCT_ZERO_ARGUMENT_FACTORY');assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');
 assertOwnedTronProductReleaseV1();
 const host=createTronProductHostGuardV1(),lifetime=beginLifetime(host.evidence),runId=randomUUID();
 let lock,lockStat,original,startupCleanup,directory,audit,closed=false,closePromise,sourceBefore,scratchRemoved=false,openerAttempted=false;
 const assertAlive=()=>{lifetime.assertActive();assert.ok(original&&!closed,'OWNED_TRON_ORIGINAL_PROCESS_REQUIRED');original.assertAlive();};
 async function releaseLock() {
  const info=await lstat(LOCK);assert.equal(info.dev,lockStat.dev);assert.equal(info.ino,lockStat.ino);assert.equal(info.uid,process.getuid());
  await lock.close();lock=null;await unlink(LOCK);
 }
 async function finish() {
  let cleanup,cleanupError;
  try {
   if(original)cleanup=await original.close();
   else cleanup=startupCleanup??(openerAttempted?{stopped:false,originalChildSpawned:null,forced:null}:{stopped:true,originalChildSpawned:false,forced:false});
   assert.equal(cleanup.stopped,true,'TRON_PRODUCT_NATIVE_CLEANUP_UNCONFIRMED');
   if(original||openerAttempted||startupCleanup){assert.equal(cleanup.forced,false,'TRON_PRODUCT_FORCED_NATIVE_STOP');assert.equal(cleanup.exitCode,0,'TRON_PRODUCT_NATIVE_EXIT_FAILED');assert.equal(cleanup.signal,null,'TRON_PRODUCT_NATIVE_SIGNAL');}
   if(directory){await privateDirectory(directory);assert.equal(join(BASE,directory.slice(BASE.length+1)),directory);await rm(directory,{recursive:true,force:false});scratchRemoved=true;}
   const sourceAfter=captureTronProductSourcePinsV1();assert.deepEqual(sourceAfter,sourceBefore,'TRON_PRODUCT_CURRENT_SOURCE_CHANGED');
   if(audit)await publish(join(audit,'source-pins-after.json'),sourceAfter);
   const result={format:'LIANUM_TRON_PRODUCT_DRIVER_CLEANUP_V1',runId,...cleanup,sourceUnchanged:true,
    scratchRemoved:directory?scratchRemoved:true,syntheticKeysAndLedgerRemoved:directory?scratchRemoved:true,canonicalRuntimeRelease:null,publicNetwork:false};
   if(audit)await publish(join(audit,'cleanup.json'),result);
   if(lock)await releaseLock();
   return Object.freeze(result);
  }catch(error){cleanupError=error;error.productCleanup={...cleanup,stopped:cleanup?.stopped===true,scratchRemoved:directory?scratchRemoved:true,
    lockRetained:Boolean(lock),sourceUnchanged:false};throw error;}
  finally{closed=true;lifetime.finish();if(cleanupError&&audit){try{await publish(join(audit,'cleanup-rejected.json'),{
   format:'LIANUM_TRON_PRODUCT_DRIVER_REJECTED_CLEANUP_V1',runId,errorCode:String(cleanupError.message).match(/(?:TRON_[A-Z0-9_]+)/)?.[0]??'TRON_PRODUCT_CLEANUP_FAILED',
   stopped:cleanup?.stopped===true,lockRetained:Boolean(lock),publicNetwork:false});}catch{}}}
 }
 const close=()=>closePromise??=finish();
 try {
  sourceBefore=captureTronProductSourcePinsV1();
  await mkdir(LOCAL,{recursive:true,mode:0o700});await privateDirectory(LOCAL);
  lock=await open(LOCK,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);lockStat=await lock.stat();
  assert.ok(lockStat.isFile()&&lockStat.uid===process.getuid()&&(lockStat.mode&0o7777)===0o600);
  await lock.writeFile(JSON.stringify({format:'LIANUM_TRON_PRODUCT_DRIVER_LOCK_V1',pid:process.pid,runId,
   lifetime:host.evidence,totalMilliseconds:OWNED_TRON_PRODUCT_TOTAL_MILLISECONDS_V1}));await lock.sync();
  audit=join(LOCAL,'attempt-'+runId);await mkdir(audit,{mode:0o700});await privateDirectory(audit);
  await publish(join(audit,'source-pins-before.json'),sourceBefore);
  lifetime.assertActive();await privateDirectory(BASE);directory=await mkdtemp(join(BASE,'scratch-'));await chmod(directory,0o700);await privateDirectory(directory);
  openerAttempted=true;original=await startOwnedTronAlignedProductChildV1(directory,audit,lifetime.signal);
  lifetime.assertActive();const hello=original.hello,material=original.material;
  exact(hello,['kind','metadata']);assert.equal(hello.metadata.classification,'LOCAL_SYNTHETIC_TRON_JAVA_TRON_CONSENSUS');hex(hello.metadata.genesis,32,true);
  await publish(join(audit,'original-startup.json'),{format:'LIANUM_TRON_PRODUCT_GUARDED_STARTUP_V1',runId,
   originalHostScope:original.originalHostScope,identity:original.alignedStartupIdentityEvidence,
   native:original.alignedNativeAudit,material,totalMilliseconds:OWNED_TRON_PRODUCT_TOTAL_MILLISECONDS_V1,
   currentSourcePinsSHA256:sha(Buffer.from(JSON.stringify(sourceBefore))),publicNetwork:false,privateCreditEstablished:false,registeredGraphAuthorizationEstablished:false});
  let queue=Promise.resolve();const command=(kind,args=[])=>{const result=queue.then(()=>{assertAlive();return original.command(kind,args);});queue=result.catch(()=>{});return result;};
  return Object.freeze({directory,metadata:Object.freeze({...hello.metadata,javaSHA256:material.javaSHA256,patchedNodeSHA256:material.jarSHA256,
   driverSHA256:material.driverSHA256,offlinePatchSHA256:material.offlinePatchSHA256,replayRecorderPatchSHA256:material.replayRecorderPatchSHA256,
   sourceSHA256:material.sourceSHA256,buildReportSHA256:material.buildReportSHA256,acceptedCandidateReportSHA256:material.acceptedCandidateReportSHA256,
   storageEngine:'ROCKSDB',configuredGenesisTimestampMs:'1749999999000',originalLocalTotalMilliseconds:OWNED_TRON_PRODUCT_TOTAL_MILLISECONDS_V1,
   currentProductSourcePinsSHA256:sha(Buffer.from(JSON.stringify(sourceBefore))),productNativeAcceptanceEstablished:false,
   publicNetwork:false,publicProductionEstablished:false,cloudAcceptanceEstablished:false}),assertAlive,
   health:()=>command('HEALTH'),prepare:(amount,memo)=>command('PREPARE',[amount,memo]),current:id=>command('CURRENT',[id]),
   armKey:id=>command('ARMKEY',[id]),armSend:id=>command('ARMSEND',[id]),
   readBlock:height=>command('SOURCEBLOCK',[height]),readSolidBlock:()=>command('SOURCESOLID'),readTransaction:id=>command('SOURCETX',[id]),
   readTransactionInfo:id=>command('SOURCEINFO',[id]),readReplay:(id,block)=>command('SOURCEREPLAY',[id,block]),
   sign:(id,raw)=>command('SIGN',[id,raw]),broadcast:(id,nativeId,wireHash)=>command('BROADCAST',[id,nativeId,wireHash]),observe:id=>command('OBSERVE',[id]),close});
 }catch(error){
  // Startup failures own their returned original ChildProcess cleanup receipt.
  if(!lock){lifetime.finish();throw error;}
  startupCleanup=error.childCleanup;
  if(!original&&error.childCleanup?.stopped===false){closed=true;lifetime.finish();throw error;}
  try{error.productCleanup=await close();}catch(cleanupError){error.productCleanup=cleanupError.productCleanup??{stopped:false,lockRetained:Boolean(lock)};}
  throw error;
 }
}
