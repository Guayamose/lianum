/** Execute the ORIGINAL private finalize body in a host VM with synthetic
 * completed process/resource boundaries. No native or worker is spawned. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {Script} from 'node:vm';
import {createHash} from 'node:crypto';import {relative} from 'node:path';
import {osakaSmokeProcessFailure} from './development-osaka-smoke-policy.mjs';
const source=readFileSync(new URL('../../native/native-flow-supervisor.mjs',import.meta.url),'utf8');
const body=source.slice(source.indexOf('  function finalize('),source.indexOf('  const onTerm =',source.indexOf('  function finalize(')));
assert.ok(body.startsWith('  function finalize('));
function exercise(history,code=body){
 const pins={format:'SYNTHETIC_FINALIZE_SOURCE'},runId='11111111-1111-4111-8111-111111111111';
 const result={format:'SYNTHETIC_COMPLETED_WORKER_RESULT',phase:'completed',success:true,runId,sourcePins:pins};
 const profile={sourcePins:()=>pins},cleared=[],output=[];
 const context={assert,relative,JSON,wrappedSourceBinding:false,confirmedSource:false,osakaSmokeProcessFailure,profile,FLOW_PROFILES:{developmentOsakaSmoke:profile},history:new Map(history.map((row,i)=>[i,row])),
  finishing:false,finished:false,monitorTimer:'monitor',reserveTimer:'reserve',hardTimer:'hard',killTimer:'kill',cleanupTimer:'cleanup',
  clearInterval:value=>cleared.push(value),clearTimeout:value=>cleared.push(value),rearmed:0,
  report:{failures:[],workerExit:{code:0,signal:null},workerClose:{code:0,signal:null}},failure:null,
  resources:()=>({ownedGroupLiveCount:0,ownedProcesses:[]}),recordSample(){},nativeResourceFailure:()=>null,
  workerSpawned:true,childExited:true,childClosed:true,groupOwnershipLost:false,finalGroupMeasurementSucceeded:false,
  child:{pid:43,stdio:[]},coldCycle:false,sourcePins:pins,resultPath:'/synthetic/attempt/result.json',ROOT:'/synthetic',attempt:'/synthetic/attempt',
  runId,attemptCreated:true,elapsed:()=>5,NATIVE_FLOW_LIMITS:{totalMilliseconds:1000,killGraceMilliseconds:10},termAt:null,
  readRegular:()=>Buffer.from(JSON.stringify(result)),existsSync:()=>true,
  HASH:bytes=>createHash('sha256').update(bytes).digest('hex'),assertNativeFlowRunId:value=>value,
  validateResultIdentity(){},validateCompletedResult:()=>({format:result.format,phase:'completed',success:true}),
  streams:Object.fromEntries(['stdout','stderr'].map(name=>[name,{bytes:0,hash:createHash('sha256')}])),
  lockIdentity:{},bestEffortSave:()=>true,publicErrorCode:()=> 'SYNTHETIC_ERROR',publicFailureCode:()=> 'SYNTHETIC_ERROR',
  process:{pid:42,exitCode:null,removeListener(){}},console:{log:value=>output.push(value)},onTerm(){},onInt(){},onUncaught(){},onRejected(){},
  resolveCompletion(){context.resolved=true;},releaseLock(){context.report.lockReleased=true;},
  fail(reason){context.failure??=reason;context.report.failures.push({code:reason});},
  stop(){context.rearmed++;},signalOwnedGroup(){throw Error('UNEXPECTED_SIGNAL_IN_COMPLETED_FINALIZE');}};
 new Script(code+'\nfinalize();',{filename:'original-supervisor-finalize-host-fixture.mjs'}).runInNewContext(context);
 assert.equal(context.finished,true);assert.equal(context.resolved,true);assert.equal(context.rearmed,0);
 assert.deepEqual(cleared,['monitor','reserve','hard','kill','cleanup']);assert.equal(output.length,1);
 return context;
}
test('actual finalize body closes without a lexical sample, never rearms timers and rejects full history even when proof is gone',()=>{
 const allowed=exercise([{role:'main-worker',state:'Z',proofWorker:false},{role:'evm-runtime',state:'Z',proofWorker:false}]);
 assert.equal(allowed.failure,null);assert.equal(allowed.report.phase,'completed');assert.equal(allowed.report.resultAccepted,true);
 assert.equal(allowed.report.ownedGroupCleanupConfirmed,true);assert.equal(allowed.report.lockReleased,true);
 for(const forbidden of [{role:'flat-proof-worker',state:'Z',proofWorker:true},{role:'owned-descendant',state:'X',proofWorker:false}]){
  const closed=exercise([{role:'main-worker',state:'Z',proofWorker:false},forbidden]);
  assert.equal(closed.failure,'OSAKA_SMOKE_UNEXPECTED_PROCESS_OR_PROOF');assert.equal(closed.report.phase,'failed');
  assert.equal(closed.report.resultAccepted,false);assert.equal(closed.report.ownedGroupCleanupConfirmed,true);assert.equal(closed.process.exitCode,1);
 }
 // The rejected draft's exact expression genuinely throws here: no global
 // "sample" is supplied. This ensures the test exercises the closing branch.
 const regression=body.replace("osakaSmokeProcessFailure([...history.values()]);\n        if (forbidden) fail(forbidden);",
  "osakaSmokeProcessFailure(sample.ownedProcesses);\n        if (forbidden) stop(forbidden, {}, sample);");
 assert.notEqual(regression,body);assert.throws(()=>exercise([],regression),/sample is not defined/);
});
