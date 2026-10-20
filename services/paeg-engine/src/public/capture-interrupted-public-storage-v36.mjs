/** Finish authenticated storage capture after a dead public process. This CLI
 * never opens an operator, issues an epoch, signs or sends a transaction. The
 * storage owners authenticate every component; the review additionally binds
 * the complete private tree and preserves all files outside their directories. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream,constants} from 'node:fs';
import {lstat,readFile,readdir,open} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PUBLIC_OPERATOR_STATE_V4,PUBLIC_NATIVE_DIRECTORY_V4,readPrivateOperatorFileV4} from './public-operator-state-v4.mjs';
import {readPublicUniswapModeV6} from './public-uniswap-mode-v6.mjs';
import {publicSepoliaDefiConfigurationV8} from './public-sepolia-defi-mode-v8.mjs';
import {publicErrorDataV9} from './public-error-data-v9.mjs';

assert.equal(process.argv.length,4);const action=process.argv[2],reviewPath=process.argv[3];
assert.ok(['--check','--seal'].includes(action));assert.ok(isAbsolute(reviewPath));
assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0);
assert.deepEqual(process.execArgv,['--max-old-space-size=1024']);
for(const name of ['NODE_OPTIONS','NODE_PATH','NODE_TLS_REJECT_UNAUTHORIZED','LD_PRELOAD','LD_LIBRARY_PATH','PYTHONPATH','PYTHONHOME'])assert.equal(process.env[name],undefined);
const base='/var/lib/lianum-testnet-signer',root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url))),load=path=>import(pathToFileURL(join(root,path)).href);
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonicalInventory=value=>JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])));
let configuration,defiInput;
async function json(name){const bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,name);try{return JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}}
async function inventory(){
 const files={};
 async function visit(directory){
  for(const name of (await readdir(directory)).sort()){
   const path=join(directory,name),before=await lstat(path);assert.ok(!before.isSymbolicLink(),'INTERRUPTED_CAPTURE_PRIVATE_ALIAS');
   if(before.isDirectory()){await visit(path);continue;}
   assert.ok(before.isFile(),'INTERRUPTED_CAPTURE_PRIVATE_FILE_TYPE');
   const digest=createHash('sha256');for await(const chunk of createReadStream(path)){digest.update(chunk);chunk.fill(0);}
   const after=await lstat(path);for(const key of ['dev','ino','size','mtimeMs','ctimeMs','uid','gid','mode','nlink'])assert.equal(after[key],before[key],'INTERRUPTED_CAPTURE_PRIVATE_FILE_CHANGED');
   files[relative(base,path)]={sha256:digest.digest('hex'),bytes:before.size,uid:before.uid,gid:before.gid,mode:before.mode&0o7777};
  }
 }
 await visit(base);return files;
}
function inside(path,directory){return path===directory||path.startsWith(directory+'/');}
async function reviewedBytes(){
 const handle=await open(reviewPath,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=await handle.stat();assert.ok(before.isFile()&&before.uid===0&&before.nlink===1&&(before.mode&0o022)===0&&before.size<=4*1024*1024,'INTERRUPTED_CAPTURE_REVIEW_FILE');
  const bytes=await handle.readFile();assert.equal(bytes.length,before.size,'INTERRUPTED_CAPTURE_REVIEW_CHANGED');
  for(const after of [await handle.stat(),await lstat(reviewPath)])for(const key of ['dev','ino','size','mtimeMs','ctimeMs','uid','gid','mode','nlink'])assert.equal(after[key],before[key],'INTERRUPTED_CAPTURE_REVIEW_CHANGED');
  return bytes;
 }finally{await handle.close();}
}
try{
 const reviewBytes=await reviewedBytes(),review=JSON.parse(reviewBytes.toString('utf8')),reviewSHA256=sha(reviewBytes);reviewBytes.fill(0);
 assert.deepEqual(Object.keys(review).sort(),['expiresAt','files','profile','releaseSHA256'].sort());assert.equal(review.profile,'LIANUM_INTERRUPTED_PUBLIC_STORAGE_REVIEW_V36');
 assert.ok(Number.isSafeInteger(review.expiresAt)&&review.expiresAt>Date.now()&&review.expiresAt<=Date.now()+3600000,'INTERRUPTED_CAPTURE_REVIEW_EXPIRED');
 assert.match(review.releaseSHA256,/^[a-f0-9]{64}$/);assert.equal(sha(await readFile(join(root,'../release-manifest.json'))),review.releaseSHA256,'INTERRUPTED_CAPTURE_REVIEW_RELEASE');
 assert.ok(review.files&&typeof review.files==='object'&&!Array.isArray(review.files));
 const before=await inventory();assert.deepEqual(before,review.files,'INTERRUPTED_CAPTURE_REVIEW_TREE_CHANGED');
 configuration=await json('operator.json');assert.equal(configuration.nativeDirectory,PUBLIC_NATIVE_DIRECTORY_V4);assert.equal(configuration.supervisorDirectory,join(PUBLIC_OPERATOR_STATE_V4,'supervisor'));assert.equal(configuration.journal.path,join(PUBLIC_OPERATOR_STATE_V4,'authority','journal.vault'));
 const phone=await json('paired-phone-connection.json'),uniswap=await readPublicUniswapModeV6(root,configuration);assert.ok(uniswap,'INTERRUPTED_CAPTURE_MIXED_REQUIRED');
 defiInput=publicSepoliaDefiConfigurationV8(configuration,phone.descriptor.devicePublicKey,'CAPTURED');
 const input={mixed:{directory:uniswap.input.parent.supervisorDirectory,password:configuration.journal.password,mixedJournalPassword:uniswap.input.mixed.journal.password,flatJournalPassword:uniswap.input.mixed.flatJournal.password},defi:{directory:join(defiInput.directory,'retention'),password:defiInput.password,parentSupervisorDirectory:configuration.supervisorDirectory,parentPassword:configuration.journal.password}};
 const supervisorDirectories=[configuration.supervisorDirectory,input.mixed.directory,input.defi.directory];
 assert.equal(new Set(supervisorDirectories).size,3);for(const directory of supervisorDirectories){assert.equal(resolve(directory),directory);assert.ok(inside(directory,PUBLIC_OPERATOR_STATE_V4)&&directory!==PUBLIC_OPERATOR_STATE_V4);}
 const R=await load('packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs'),D=await load('packages/backend/src/operations/recovery/sepolia-defi-retention-v8.mjs');
 const initialRoot=await R.readOriginalPagedPublicRecoveryModeV4({directory:configuration.supervisorDirectory,password:configuration.journal.password}),initialDefi=await D.readOriginalSepoliaDefiRetentionModeV8({directory:input.defi.directory,password:input.defi.password});
 assert.ok(['ACTIVE_DEAD_EXPIRED_FENCED','PARTIAL_OPENING_FENCED','CAPTURED'].includes(initialRoot.mode),'INTERRUPTED_CAPTURE_ROOT_MODE');
 assert.ok(['ACTIVE','OPENING','CAPTURED'].includes(uniswap.state.phase),'INTERRUPTED_CAPTURE_MIXED_MODE');assert.equal(initialDefi.phase,'CAPTURED','INTERRUPTED_CAPTURE_DEFI_ALREADY_CAPTURED_REQUIRED');
 emit({stage:'INTERRUPTED_STORAGE_REVIEW_MATCHED',reviewSHA256,rootMode:initialRoot.mode,mixedPhase:uniswap.state.phase,defiPhase:initialDefi.phase,files:Object.keys(before).length,financialSourcePermissionIssued:false,transactionsBroadcast:0});
 if(action==='--seal'){
  assert.ok(review.expiresAt>Date.now(),'INTERRUPTED_CAPTURE_REVIEW_EXPIRED');
  const C=await load('packages/backend/src/operations/recovery/paged-public-full-storage-financial-review-v9.mjs');let result,sealFailure,integrityFailure,protection,sealSucceeded=false;
  try{
   result=await C.sealOriginalPagedPublicFullStorageV9(input);
   assert.equal(result.rootPhase,'CAPTURED');assert.equal(result.mixedPhase,'CAPTURED');assert.equal(result.defiPhase,'CAPTURED');assert.equal(result.financialSourcePermissionIssued,false);assert.equal(result.transactionsBroadcast,0);sealSucceeded=true;
  }catch(error){sealFailure=error;}finally{
   try{
    const after=await inventory(),changed=[],releasedLocks=[];
    // Original authenticates and releases these exact dead-actor ownership
    // locks. Only their deletion is allowed, never replacement or modification.
    const originalDeadLocks=new Set(['dispatch-journal','source-operations'].map(name=>join(PUBLIC_NATIVE_DIRECTORY_V4,name,'native-wallet.lock')));
    for(const name of new Set([...Object.keys(before),...Object.keys(after)])){
     if(JSON.stringify(before[name])===JSON.stringify(after[name]))continue;
     const path=join(base,name);if(originalDeadLocks.has(path)&&before[name]&&after[name]===undefined){releasedLocks.push(name);continue;}
     assert.ok(supervisorDirectories.some(directory=>inside(path,directory)),'INTERRUPTED_CAPTURE_NON_SUPERVISOR_FILE_CHANGED');changed.push(name);
    }
    protection={changedSupervisorFiles:changed.length,releasedOriginalDeadJournalLocks:releasedLocks.length,protectedFilesPreserved:true,privateInventorySHA256:sha(canonicalInventory(after))};
    emit({stage:'INTERRUPTED_STORAGE_POSTCHECK',reviewSHA256,sealCompleted:sealSucceeded,...protection});
   }catch(error){integrityFailure=error;emit({stage:'INTERRUPTED_STORAGE_INTEGRITY_REQUIRES_DIAGNOSIS',reviewSHA256,...publicErrorDataV9(error),...(sealFailure?{originalFailure:publicErrorDataV9(sealFailure)}:{}),automaticRetry:false});}
  }
  if(integrityFailure)throw integrityFailure;if(!sealSucceeded)throw(sealFailure??Error('INTERRUPTED_CAPTURE_FAILED'));
  emit({stage:'INTERRUPTED_STORAGE_CAPTURED',reviewSHA256,...result,...protection,financialPermissionChanged:false,automaticRebroadcast:false});
 }else{
  assert.deepEqual(await inventory(),before,'INTERRUPTED_CAPTURE_CHECK_MUTATED_STATE');
  emit({stage:'INTERRUPTED_STORAGE_READONLY_CHECK_PASSED',reviewSHA256,financialSourcePermissionIssued:false,transactionsBroadcast:0,storageSealed:false});
 }
}catch(error){process.exitCode=1;emit({stage:'INTERRUPTED_STORAGE_CAPTURE_REQUIRES_DIAGNOSIS',...publicErrorDataV9(error),automaticRetry:false});}
finally{if(configuration)configuration.journal.password=null;if(defiInput)defiInput.password=null;}
