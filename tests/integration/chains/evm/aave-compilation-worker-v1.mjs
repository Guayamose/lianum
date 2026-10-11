/** New official wrapper/local sources compile once under original supervisor. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT} from '@lianum/proofs/catalog';
import {hash,regular} from '@lianum/proofs/tooling/tooling';
import {compileAaveDevelopmentContractsV1} from '../../../../packages/backend/src/operations/deployments/defi/aave-v3-development-compilation-v1.mjs';
import {writeFixturePrivate} from '../../fixtures/runners/owned-flat-fixture.mjs';
import {aaveCompilationSourcePinsV1} from './aave-compilation-source-pins-v1.mjs';
import {AAVE_COMPILATION_RESULT_V1,AAVE_COMPILATION_PROFILE_V1,assertAaveCompilationArtifactsV1,assertAaveCompilationResultV1} from './aave-compilation-policy-v1.mjs';
const FLOW='.local/evm-aave-compilation-only-v1';
assert.equal(process.argv.length,2);assert.deepEqual(process.execArgv,[]);assert.equal(realpathSync(process.argv[1]),fileURLToPath(import.meta.url));
assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.LANG,'C.UTF-8');assert.equal(process.env.PATH,'/usr/bin:/bin');
const parent=readFileSync(`/proc/${process.ppid}/cmdline`,'utf8').split('\0').filter(Boolean);assert.equal(parent.length,2);
assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`),parent[1])),fileURLToPath(new URL('./run-evm-aave-compilation-v1.mjs',import.meta.url)));
const lock=JSON.parse(readFileSync(join(ROOT,FLOW,'active.lock')));assert.equal(lock.pid,process.ppid);
assert.match(lock.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.equal(lock.attempt,FLOW+'/attempt-'+lock.runId);
const directory=join(ROOT,lock.attempt),began=performance.now(),sourcePins=aaveCompilationSourcePinsV1();
const result={format:AAVE_COMPILATION_RESULT_V1,profile:AAVE_COMPILATION_PROFILE_V1,runId:lock.runId,phase:'starting',success:false,
 localOnly:true,fakeFundsOnly:true,publicNetwork:false,sourcePins,sourceUnchanged:false,supervisor:{supervisorPID:process.ppid,workerPID:process.pid},
 proofs:[],files:{},compilationCount:0,proofAcceptanceEstablished:false,nativeNodesStarted:false,deploymentAcceptanceEstablished:false,privateGraphAcceptance:false,fullWalletAcceptance:false,
 cleanup:{compilerReset:false,errors:[]}};
const save=()=>writeFixturePrivate(join(directory,'result.json'),result);save();
try{
 globalThis.fetch=async()=>{throw Error('AAVE_COMPILATION_OFFLINE_REQUIRED');};
 const compiled=compileAaveDevelopmentContractsV1();result.compilationCount++;result.cleanup.compilerReset=true;assertAaveCompilationArtifactsV1(compiled);
 assert.deepEqual(aaveCompilationSourcePinsV1(),sourcePins,'AAVE_COMPILATION_SOURCE_CHANGED');result.sourceUnchanged=true;
 writeFixturePrivate(join(directory,'compiled.json'),compiled);writeFixturePrivate(join(directory,'source-pins.json'),sourcePins);
 for(const name of ['compiled.json','source-pins.json']){const raw=regular(join(directory,name));result.files[name]={bytes:raw.length,sha256:hash(raw)};}
 writeFixturePrivate(join(directory,'receipt.json'),{format:'LIANUM_NEW_OFFICIAL_AAVE_COMPILATION_RECEIPT_V1',runId:lock.runId,phase:'completed',compilationCount:1,
 compiler:compiled.compilerPin,inputSHA256:compiled.inputSHA256,compiledSHA256:result.files['compiled.json'].sha256,sourcePinsSHA256:result.files['source-pins.json'].sha256,
 sourceUnchanged:true,compilerReset:true,historicalArtifactRecovered:false,proofAcceptanceEstablished:false,nativeNodesStarted:false,privateGraphAcceptance:false});
 const raw=regular(join(directory,'receipt.json'));result.files['receipt.json']={bytes:raw.length,sha256:hash(raw)};
 assert.deepEqual(aaveCompilationSourcePinsV1(),sourcePins,'AAVE_COMPILATION_SOURCE_CHANGED');result.phase='completed';result.success=true;assertAaveCompilationResultV1(result);
}catch(error){result.phase='failed';result.success=false;result.errorCode=/^[A-Z][A-Z0-9_]{2,160}$/.test(error?.message??'')?error.message:'AAVE_COMPILATION_FAILED';
 writeFixturePrivate(join(directory,'error-private.json'),{code:error?.code??null,message:String(error?.message??error),stack:String(error?.stack??'')});process.exitCode=1;
}finally{result.elapsedMilliseconds=performance.now()-began;save();}
