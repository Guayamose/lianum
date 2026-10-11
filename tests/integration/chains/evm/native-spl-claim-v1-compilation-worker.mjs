/** Original CI51 public compile/stats/key, then two verifier compilations. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,LOCAL} from '@lianum/proofs/catalog';
import {hash,regular} from '@lianum/proofs/tooling/tooling';
import {compileNativeSplClaimV1Verifiers,assertNativeSplClaimV1CompiledOriginal,NATIVE_SPL_CLAIM_V1_ORIGINAL_PINS} from '../../../../packages/backend/src/operations/deployments/claims/native-spl-claim-v1-compilation.mjs';
import {writeFixturePrivate} from '../../fixtures/runners/owned-flat-fixture.mjs';
import {nativeSplClaimV1CompilationSourcePins} from './native-spl-claim-v1-compilation-source-pins.mjs';
import {SPL_CLAIM_V1_COMPILATION_RESULT,SPL_CLAIM_V1_COMPILATION_PROFILE,assertNativeSplClaimV1CompilationResult,assertNativeSplClaimV1PreparationReceipt,parseNativeSplClaimV1PreparationStatus} from './native-spl-claim-v1-compilation-policy.mjs';
const FLOW='.local/native-spl-claim-v1-compilation-only-v1';
assert.equal(process.argv.length,2);assert.deepEqual(process.execArgv,[]);assert.equal(realpathSync(process.argv[1]),fileURLToPath(import.meta.url));
assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.LANG,'C.UTF-8');assert.equal(process.env.PATH,'/usr/bin:/bin');
const parent=readFileSync(`/proc/${process.ppid}/cmdline`,'utf8').split('\0').filter(Boolean);assert.equal(parent.length,2);
assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`),parent[1])),fileURLToPath(new URL('./run-native-spl-claim-v1-compilation.mjs',import.meta.url)));
const lock=JSON.parse(readFileSync(join(ROOT,FLOW,'active.lock')));assert.equal(lock.pid,process.ppid);
assert.match(lock.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.equal(lock.attempt,FLOW+'/attempt-'+lock.runId);
const directory=join(ROOT,lock.attempt),began=performance.now(),sourcePins=await nativeSplClaimV1CompilationSourcePins();
const result={format:SPL_CLAIM_V1_COMPILATION_RESULT,profile:SPL_CLAIM_V1_COMPILATION_PROFILE,runId:lock.runId,phase:'starting',success:false,
 localOnly:true,fakeFundsOnly:true,publicNetwork:false,sourcePins,sourceUnchanged:false,supervisor:{supervisorPID:process.ppid,workerPID:process.pid},
 proofs:[],preparation:[],files:{},compilationCount:0,proofAcceptanceEstablished:false,nativeNodesStarted:false,historicalReportsRecreated:false,historicalCI51VkEqualityEstablished:false,privateGraphAcceptance:false,fullWalletAcceptance:false,
 cleanup:{preparationChildrenClosed:false,compilerReset:false,errors:[]}};
const save=()=>writeFixturePrivate(join(directory,'result.json'),result);save();
async function prepareOriginal(mode){
 result.phase='original-ci51-v1-'+mode;save();let bytes=0,closed=false,childError;const stdout=[];
 const child=spawn(process.execPath,[fileURLToPath(new URL('../../../../packages/proofs/src/jobs/run-bounded.mjs',import.meta.url)),'native_claim_ingress',mode],{cwd:ROOT,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},stdio:['ignore','pipe','pipe']});
 const terminal=await new Promise(resolve=>{child.once('error',error=>{childError=error;});child.once('close',(code,signal)=>{closed=true;resolve({code,signal});});for(const stream of [child.stdout,child.stderr]){stream.once('error',error=>{childError??=error;});stream.on('data',value=>{bytes+=value.length;if(bytes>1048576)childError??=Error('SPL_CLAIM_V1_PUBLIC_TASK_OUTPUT_LIMIT');else if(stream===child.stdout)stdout.push(value);});}});
 assert.equal(closed,true);if(childError)throw childError;assert.equal(terminal.code,0,'SPL_CLAIM_V1_ORIGINAL_PREPARATION_FAILED');assert.equal(terminal.signal,null,'SPL_CLAIM_V1_ORIGINAL_PREPARATION_SIGNAL');
 const status=parseNativeSplClaimV1PreparationStatus(Buffer.concat(stdout),mode),runId=status.runId;
 const files={};for(const name of ['resources.json','result.json','runtime-pins.json']){const raw=regular(join(LOCAL,'attempts',runId,name));files[name]={bytes:raw.length,sha256:hash(raw)};}const row={mode,runId,status,files};assertNativeSplClaimV1PreparationReceipt(row);result.preparation.push(row);save();
}
try{
 globalThis.fetch=async()=>{throw Error('SPL_CLAIM_V1_COMPILATION_OFFLINE_REQUIRED');};
 for(const mode of ['compile','stats','prepare-key']){await prepareOriginal(mode);if(mode==='compile')await assertNativeSplClaimV1CompiledOriginal();}result.cleanup.preparationChildrenClosed=true;
 const compiled=await compileNativeSplClaimV1Verifiers();result.compilationCount=2;result.cleanup.compilerReset=true;
 assert.deepEqual(await nativeSplClaimV1CompilationSourcePins(),sourcePins,'SPL_CLAIM_V1_COMPILATION_SOURCE_CHANGED');result.sourceUnchanged=true;
 writeFixturePrivate(join(directory,'compiled.json'),compiled);writeFixturePrivate(join(directory,'source-pins.json'),sourcePins);
 for(const name of ['compiled.json','source-pins.json']){const raw=regular(join(directory,name));result.files[name]={bytes:raw.length,sha256:hash(raw)};}
 writeFixturePrivate(join(directory,'receipt.json'),{format:'LIANUM_NEW_ORIGINAL_SPL_CLAIM_V1_COMPILATION_RECEIPT_V1',runId:lock.runId,phase:'completed',compilationCount:2,
 compiledSHA256:result.files['compiled.json'].sha256,sourcePinsSHA256:result.files['source-pins.json'].sha256,originalPins:NATIVE_SPL_CLAIM_V1_ORIGINAL_PINS,ci51ProgrammeProvenance:compiled.ci51ProgrammeProvenance,preparation:result.preparation,
 sourceUnchanged:true,compilerReset:true,historicalReportsRecreated:false,historicalCI51VkEqualityEstablished:false,proofAcceptanceEstablished:false,nativeNodesStarted:false,privateGraphAcceptance:false});
 const raw=regular(join(directory,'receipt.json'));result.files['receipt.json']={bytes:raw.length,sha256:hash(raw)};
 assert.deepEqual(await nativeSplClaimV1CompilationSourcePins(),sourcePins,'SPL_CLAIM_V1_COMPILATION_SOURCE_CHANGED');result.phase='completed';result.success=true;await assertNativeSplClaimV1CompilationResult(result);
}catch(error){result.phase='failed';result.success=false;result.errorCode=/^[A-Z][A-Z0-9_]{2,160}$/.test(error?.message??'')?error.message:'SPL_CLAIM_V1_COMPILATION_FAILED';
 writeFixturePrivate(join(directory,'error-private.json'),{code:error?.code??null,message:String(error?.message??error),stack:String(error?.stack??'')});process.exitCode=1;
}finally{result.elapsedMilliseconds=performance.now()-began;save();}
