/** One fixed official SBF compiler child, owned by the original native supervisor. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,realpathSync,readdirSync,existsSync,unlinkSync,lstatSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {nativeProcStatV1} from '../../native/native-flow-owned-files-v1.mjs';
import {regular,hash} from '../../../../packages/proofs/src/tooling/tooling.mjs';
import {writeFixturePrivate} from '../../fixtures/runners/owned-flat-fixture.mjs';
import {nativeSplCompilationMaterialV1,SPL_COMPILATION_MATERIAL_V1} from './native-spl-compilation-material-v1.mjs';
import {nativeSplCompilationSourcePinsV1} from './native-spl-compilation-source-pins-v1.mjs';
import {SPL_COMPILATION_RESULT_V1,assertNativeSplElfV1,assertNativeSplCompilationResultV1} from './native-spl-compilation-policy-v1.mjs';
const FLOW='.local/native-spl-compilation-only-v1';
assert.equal(process.argv.length,2);assert.deepEqual(process.execArgv,[]);assert.equal(realpathSync(process.argv[1]),fileURLToPath(import.meta.url));
assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.LANG,'C.UTF-8');assert.equal(process.env.PATH,'/usr/bin:/bin');
const parent=readFileSync(`/proc/${process.ppid}/cmdline`,'utf8').split('\0').filter(Boolean);assert.equal(parent.length,2);
assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`),parent[1])),join(ROOT,'integration/run-native-spl-compilation-v1.mjs'));
const lock=JSON.parse(readFileSync(join(ROOT,FLOW,'active.lock')));assert.equal(lock.pid,process.ppid);assert.equal(lock.attempt,FLOW+'/attempt-'+lock.runId);
assert.match(lock.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const directory=join(ROOT,lock.attempt),began=performance.now(),sourcePins=nativeSplCompilationSourcePinsV1();
const result={format:SPL_COMPILATION_RESULT_V1,runId:lock.runId,phase:'starting',success:false,localOnly:true,fakeFundsOnly:true,publicNetwork:false,
 sourcePins,sourceUnchanged:false,supervisor:{supervisorPID:process.ppid,workerPID:process.pid},proofs:[],files:{},compilationCount:0,compilerExitCode:null,compilerSignal:null,
 privateCreditEstablished:false,nativeNodesStarted:false,sourceRegistrationEstablished:false,compiledReleaseEstablished:false,
 cleanup:{compilerClosed:false,generatedDeployKeyRemoved:false,errors:[]}};
const save=()=>writeFixturePrivate(join(directory,'result.json'),result);save();
let interrupted=false,child,closed=false,childError=null,outputFailure=null,keyCleanupReceipt=null;
const workerIdentity=nativeProcStatV1(process.pid);assert.ok(workerIdentity&&workerIdentity.pgrp===process.pid,'SPL_COMPILATION_ORIGINAL_WORKER_GROUP');
// This fixed compiler worker owns its umask; the user/parent environment is unchanged.
process.umask(0o077);
function removeGeneratedDeployKey(){
 assert.equal(closed,true,'SPL_COMPILATION_KEY_CLEANUP_CHILD_OPEN');assert.ok(Number.isSafeInteger(child?.pid)&&child.pid>1,'SPL_COMPILATION_KEY_CLEANUP_CHILD_UNKNOWN');
 assert.equal(nativeProcStatV1(child.pid),null,'SPL_COMPILATION_KEY_CLEANUP_COMPILER_ALIVE');
 const before=nativeProcStatV1(process.pid);assert.ok(before);
 for(const key of ['pid','ppid','pgrp','session','startTimeTicks'])assert.equal(before[key],workerIdentity[key],'SPL_COMPILATION_KEY_CLEANUP_WORKER_CHANGED');
 for(const name of readdirSync('/proc')){if(!/^[1-9][0-9]*$/.test(name))continue;const current=nativeProcStatV1(Number(name));
  if(current?.pgrp===workerIdentity.pgrp)assert.equal(current.pid,process.pid,'SPL_COMPILATION_KEY_CLEANUP_GROUP_NOT_CLOSED');}
 const after=nativeProcStatV1(process.pid);assert.ok(after);for(const key of ['pid','ppid','pgrp','session','startTimeTicks'])assert.equal(after[key],workerIdentity[key],'SPL_COMPILATION_KEY_CLEANUP_WORKER_CHANGED');
 const output=join(SPL_COMPILATION_MATERIAL_V1,'out'),generatedKey=join(output,'native_spl_custody_v1-keypair.json');
 assert.equal(realpathSync(output),output);const directoryInfo=lstatSync(output);assert.ok(directoryInfo.isDirectory()&&directoryInfo.uid===process.getuid()&&(directoryInfo.mode&0o077)===0,'SPL_COMPILATION_KEY_CLEANUP_PRIVATE_DIRECTORY');
 let keySHA256=null;
 if(existsSync(generatedKey)){assert.equal(realpathSync(generatedKey),generatedKey);const info=lstatSync(generatedKey);assert.ok(info.isFile()&&info.uid===process.getuid()&&(info.mode&0o077)===0,'SPL_COMPILATION_KEY_CLEANUP_PRIVATE_FILE');
  assert.ok(info.size>0&&info.size<=1024,'SPL_COMPILATION_GENERATED_KEY_SIZE');const raw=regular(generatedKey);try{let values;try{values=JSON.parse(raw);}catch{throw Error('SPL_COMPILATION_GENERATED_KEY_FORMAT');}assert.ok(Array.isArray(values)&&values.length===64&&values.every(v=>Number.isInteger(v)&&v>=0&&v<=255),'SPL_COMPILATION_GENERATED_KEY_FORMAT');keySHA256=hash(raw);values.fill(0);}finally{raw.fill(0);}
  const again=lstatSync(generatedKey);for(const key of ['dev','ino','uid','mode','size','mtimeMs','ctimeMs'])assert.equal(again[key],info[key],'SPL_COMPILATION_GENERATED_KEY_CHANGED');unlinkSync(generatedKey);const fd=openSync(output,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
 assert.equal(existsSync(generatedKey),false);result.cleanup.generatedDeployKeyRemoved=true;
 keyCleanupReceipt={format:'LIANUM_NEW_SPL_GENERATED_DEPLOY_KEY_CLEANUP_V1',runId:lock.runId,compilerPID:child.pid,compilerClosed:true,compilerGroupClosed:true,method:'FIXED_PRIVATE_REGULAR_FILE_AFTER_ORIGINAL_CHILD_AND_GROUP_CLOSE',keySHA256,removed:true};
 writeFixturePrivate(join(directory,'generated-key-cleanup-receipt.json'),keyCleanupReceipt);
}
const captures={stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)},captureCounts={stdout:0,stderr:0};
const interrupt=()=>{interrupted=true;};process.on('SIGTERM',interrupt);process.on('SIGINT',interrupt);
try{
 globalThis.fetch=async()=>{throw Error('SPL_COMPILATION_OFFLINE_REQUIRED');};
 const material=nativeSplCompilationMaterialV1(),output=join(SPL_COMPILATION_MATERIAL_V1,'out');
 assert.deepEqual(readdirSync(output),[],'SPL_COMPILATION_OUTPUT_NAMESPACE_ALREADY_USED');assert.equal(interrupted,false,'SPL_COMPILATION_INTERRUPTED_BEFORE_SPAWN');
 result.phase='compiling';result.compilationCount=1;save();
 // Immediate listeners attach to the original ChildProcess; the supervisor
 // authenticates its complete inherited group before any signal or acceptance.
 child=spawn(material.argv[0],material.argv.slice(1),{cwd:material.cwd,env:material.env,stdio:['ignore','pipe','pipe']});
 const completed=new Promise(resolveDone=>{
  child.once('error',error=>{childError=error;});
  child.once('close',(code,signal)=>{closed=true;result.compilerExitCode=code;result.compilerSignal=signal;resolveDone();});
 });
 for(const name of ['stdout','stderr'])child[name].on('data',bytes=>{
  captureCounts[name]+=bytes.length;const room=1024**2-captures[name].length;if(room>0)captures[name]=Buffer.concat([captures[name],bytes.subarray(0,room)]);
  if(captureCounts[name]>1024**2&&!outputFailure){outputFailure=new Error('SPL_COMPILATION_LOG_LIMIT');child.kill('SIGTERM');}
 });
 if(interrupted)child.kill('SIGTERM');
 await completed;result.cleanup.compilerClosed=closed;
 for(const name of ['stdout','stderr'])writeFixturePrivate(join(directory,'compiler-'+name+'.json'),{bytes:captureCounts[name],retainedBytes:captures[name].length,truncated:captureCounts[name]>captures[name].length,text:captures[name].toString('utf8')});
 if(childError)throw childError;if(outputFailure)throw outputFailure;
 assert.equal(interrupted,false,'SPL_COMPILATION_INTERRUPTED');assert.equal(result.compilerExitCode,0,'SPL_COMPILATION_COMPILER_EXIT');assert.equal(result.compilerSignal,null,'SPL_COMPILATION_COMPILER_SIGNAL');
 const elf=regular(join(output,'native_spl_custody_v1.so'));assertNativeSplElfV1(elf);
 assert.deepEqual(nativeSplCompilationSourcePinsV1(),sourcePins,'SPL_COMPILATION_SOURCE_CHANGED');result.sourceUnchanged=true;
 removeGeneratedDeployKey();
 assert.deepEqual(readdirSync(output),['native_spl_custody_v1.so'],'SPL_COMPILATION_UNEXPECTED_OUTPUT');
 const outputFD=openSync(join(directory,'native_spl_custody_v1.so'),'wx',0o600);try{writeFileSync(outputFD,elf);fsyncSync(outputFD);}finally{closeSync(outputFD);}
 const directoryFD=openSync(directory,'r');try{fsyncSync(directoryFD);}finally{closeSync(directoryFD);}writeFixturePrivate(join(directory,'source-pins.json'),sourcePins);
 for(const name of ['native_spl_custody_v1.so','source-pins.json','generated-key-cleanup-receipt.json']){const raw=regular(join(directory,name));result.files[name]={bytes:raw.length,sha256:hash(raw)};}
 writeFixturePrivate(join(directory,'receipt.json'),{format:'LIANUM_NEW_NATIVE_SPL_SBF_COMPILATION_RECEIPT_V1',runId:lock.runId,
  programSHA256:hash(elf),sourcePinsSHA256:result.files['source-pins.json'].sha256,arguments:material.argv.slice(1),compilerExitCode:0,compilerSignal:null,
  compilerPID:child.pid,sourceUnchanged:true,generatedDeployKeyRemoved:true,generatedDeployKeyCleanup:keyCleanupReceipt,historicalArtifactRecovered:false,privateCreditEstablished:false,compiledReleaseEstablished:false});
 const receipt=regular(join(directory,'receipt.json'));result.files['receipt.json']={bytes:receipt.length,sha256:hash(receipt)};
 assert.equal(interrupted,false,'SPL_COMPILATION_INTERRUPTED');assert.deepEqual(nativeSplCompilationSourcePinsV1(),sourcePins,'SPL_COMPILATION_SOURCE_CHANGED');
 result.phase='completed';result.success=true;assertNativeSplCompilationResultV1(result);
}catch(error){result.phase='failed';result.success=false;result.errorCode=/^[A-Z][A-Z0-9_]{2,160}$/.test(error?.message??'')?error.message:'SPL_COMPILATION_FAILED';
 writeFixturePrivate(join(directory,'error-private.json'),{code:error?.code??null,message:String(error?.message??error),stack:String(error?.stack??'')});process.exitCode=1;
}finally{result.cleanup.compilerClosed=closed;
 // Failed compilations may also create this fixed deploy key. Unknown/live
 // ownership preserves the file and the first failure; no broad deletion.
 if(closed&&Number.isSafeInteger(child?.pid)&&!result.cleanup.generatedDeployKeyRemoved){try{removeGeneratedDeployKey();}catch(error){
  const code=/^[A-Z][A-Z0-9_]{2,160}$/.test(error?.message??'')?error.message:'SPL_COMPILATION_GENERATED_KEY_CLEANUP_FAILED';result.cleanup.errors.push(code);
  if(result.phase!=='failed'){result.phase='failed';result.success=false;result.errorCode=code;}process.exitCode=1;}}
 result.elapsedMilliseconds=performance.now()-began;save();process.off('SIGTERM',interrupt);process.off('SIGINT',interrupt);}
