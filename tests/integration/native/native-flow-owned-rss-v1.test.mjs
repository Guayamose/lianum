/** HOST-only original procfs race/identity regressions. No actual PID, process,
 * signal, native runtime, proof, timers or RSS budget is created or relaxed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {observeNativeOwnedRSSV1} from './native-flow-owned-rss-v1.mjs';
import {parseNativeProcStat,nativeProcStatIntegerDiagnosticV1,isOriginalNativeProcStatMinusOneV1} from './native-flow-owned-files-v1.mjs';
import {nativeExitedProcessClassification,nativeProofProcessResources,nativeResourceFailure,NATIVE_FLOW_LIMITS}
  from './native-flow-supervisor.mjs';
const rawStat=(pid=42,state='R',ticks='100',session=42)=>{
  const fields=Array(22).fill('0');fields[0]=state;fields[1]='1';fields[2]='42';fields[3]=String(session);fields[19]=ticks;
  return `${pid} (host fixture) ${fields.join(' ')}\n`;
};
const original=parseNativeProcStat(42,rawStat());
const absent=()=>Object.assign(Error('proc entry absent'),{code:'ENOENT'});
const status=(tid=42,rss=null)=>`Name:\thost-fixture\nTgid:\t42\nPid:\t${tid}\n${rss===null?'':`VmRSS:\t${rss} kB\n`}`;
function fixture(files,tasks=['42']){
  const counts=new Map();
  const resolve=(path,value)=>{const count=counts.get(path)??0;counts.set(path,count+1);
    if(Array.isArray(value))value=value[Math.min(count,value.length-1)];
    if(typeof value==='function')value=value(count);
    if(value===undefined)throw absent();if(value instanceof Error)throw value;return value;
  };
  return{counts,readFileSync:path=>resolve(path,files[path]),readdirSync:path=>resolve(path,path==='/proc/42/task'
    ?count=>Array.isArray(tasks[0])?tasks[Math.min(count,tasks.length-1)]:tasks:undefined)};
}
const taskFiles=(state='R',rss=null,statm='0 0 0 0 0 0 0\n')=>({
  '/proc/42/stat':rawStat(42,state),'/proc/42/status':status(),
  '/proc/42/task/42/stat':rawStat(42,state),'/proc/42/task/42/status':status(42,rss),'/proc/42/task/42/statm':statm});
test('a missing VmRSS reread returns real bytes under the same original identity, never cached zero',()=>{
  const fs=fixture({'/proc/42/stat':rawStat(),'/proc/42/status':[status(),status(42,1234)]});
  const measured=observeNativeOwnedRSSV1(original,fs);
  assert.equal(measured.rssBytes,1234*1024);assert.equal(measured.rssSource,'VmRSS');
  assert.equal(measured.stat.startTimeTicks,original.startTimeTicks);assert.equal(fs.counts.get('/proc/42/status'),2);
});
test('mmless R and Z leaders retain the real shared RSS and live siblings under the original 3 GiB guard',()=>{
  for(const state of ['R','Z']){
    const files=taskFiles(state);Object.assign(files,{'/proc/42/task/43/stat':rawStat(43,'S','101'),
      '/proc/42/task/43/status':status(43,4*1024*1024)});
    const measured=observeNativeOwnedRSSV1(original,fixture(files,['42','43']));
    assert.equal(measured.rssBytes,4*1024**3);assert.equal(measured.liveThreadCount,state==='Z'?1:2);
    const established={...original,role:'flat-proof-worker',proofWorker:true};
    const label=state==='Z'?nativeExitedProcessClassification(measured.stat,established):established;
    const resources=nativeProofProcessResources([{...measured.stat,...label,rssBytes:measured.rssBytes,liveThreadCount:measured.liveThreadCount}]);
    assert.equal(resources.liveProofWorkers,1);assert.equal(resources.maximumProofWorkerRSSBytes,measured.rssBytes);
    assert.equal(nativeResourceFailure({...resources,availableRAMBytes:NATIVE_FLOW_LIMITS.minimumAvailableRAMBytes,
      freeDiskBytes:NATIVE_FLOW_LIMITS.minimumFreeDiskBytes,mainWorkerRSSBytes:0,supervisorRSSBytes:0}),'NATIVE_PROOF_WORKER_RSS_LIMIT');
  }
});
test('PID reuse, changed session/TGID and reused task identity reject even if RSS/statm are present',()=>{
  for(const changed of [rawStat(42,'R','999'),rawStat(42,'R','100',99),rawStat(42,'Z','100',99)])
    assert.throws(()=>observeNativeOwnedRSSV1(original,fixture({'/proc/42/stat':[rawStat(),changed],'/proc/42/status':status(42,1234)})),/NATIVE_MEASURED_PROCESS_CHANGED/);
  const wrongTgid={...taskFiles(),'/proc/42/task/42/status':status().replace('Tgid:\t42','Tgid:\t99')};
  assert.throws(()=>observeNativeOwnedRSSV1(original,fixture(wrongTgid)),/NATIVE_MEASURED_PROCESS_CHANGED/);
  const reusedTask={...taskFiles(),'/proc/42/task/42/stat':[rawStat(),rawStat(42,'R','999')]};
  assert.throws(()=>observeNativeOwnedRSSV1(original,fixture(reusedTask)),/NATIVE_MEASURED_PROCESS_CHANGED/);
});
test('only real original PID absence or a completely measured dead thread group closes without live memory',()=>{
  assert.equal(observeNativeOwnedRSSV1(original,fixture({})),null);
  const dead=observeNativeOwnedRSSV1(original,fixture(taskFiles('Z',null,absent())));
  assert.equal(dead.stat.state,'Z');assert.equal(dead.liveThreadCount,0);assert.equal(dead.rssBytes,0);
  const exiting=observeNativeOwnedRSSV1(original,fixture(taskFiles('R')));
  assert.equal(exiting.stat.state,'R');assert.equal(exiting.liveThreadCount,1);assert.equal(exiting.rssBytes,0);
  assert.equal(exiting.rssSource,'task-VmRSS-or-statm-zero');
});
test('persistent live unmeasured RSS, denied reads and task-set churn stay strong failures',()=>{
  for(const value of ['20 3 0 0 0 0 0\n',absent()]){
    const fs=fixture(taskFiles('R',null,value));
    assert.throws(()=>observeNativeOwnedRSSV1(original,fs),/NATIVE_OWNED_RSS_UNAVAILABLE/);
    assert.equal(fs.counts.get('/proc/42/task/42/statm'),3);
  }
  const denied=Object.assign(Error('permission denied'),{code:'EACCES'});
  assert.throws(()=>observeNativeOwnedRSSV1(original,fixture({...taskFiles(),'/proc/42/task/42/status':denied})),error=>error===denied);
  const fs=fixture(taskFiles(),[['42'],['42','43']]);
  assert.throws(()=>observeNativeOwnedRSSV1(original,fs),/NATIVE_OWNED_RSS_UNAVAILABLE/);
});

test('HOST original proc-stat integer rejection retains only owned finite field/shape diagnostics without accepting or retrying',()=>{
  // Only public inert procfs fixture strings. The parser/RSS consumer and
  // original AssertionError are real; no PID, runtime, signal or budget exists.
  for(const [index,field] of [[1,'PPID'],[2,'PGRP'],[3,'SESSION']]){
    for(const [token,tokenShape] of [['-1','negative'],['not_decimal','nonDecimal'],['9007199254740992','unsafeInteger']]){
      const fields=Array(22).fill('0');fields[0]='R';fields[1]='1';fields[2]='42';fields[3]='42';fields[19]='100';fields[index]=token;
      const text=`42 (host fixture) ${fields.join(' ')}\n`;
      let originalFailure;
      assert.throws(()=>parseNativeProcStat(42,text),error=>{
        originalFailure=error;assert.equal(error.code,'ERR_ASSERTION');assert.equal(error.message,'NATIVE_RESOURCE_INTEGER');return true;
      });
      const diagnostic=nativeProcStatIntegerDiagnosticV1(originalFailure);
      assert.deepEqual(diagnostic,{field,tokenShape,originalIntegerFailure:true,identityMinusOne:token==='-1'&&field!=='PPID'});assert.ok(Object.isFrozen(diagnostic));
      assert.equal(isOriginalNativeProcStatMinusOneV1(originalFailure),token==='-1'&&field!=='PPID');
      assert.deepEqual(Object.keys(diagnostic).sort(),['field','identityMinusOne','originalIntegerFailure','tokenShape']);
      assert.equal(JSON.stringify(diagnostic).includes(token),false);
      assert.equal(nativeProcStatIntegerDiagnosticV1(originalFailure),diagnostic);
      assert.equal(nativeProcStatIntegerDiagnosticV1(Object.assign(new Error('NATIVE_RESOURCE_INTEGER'),{code:'ERR_ASSERTION'})),null);
      assert.equal(nativeProcStatIntegerDiagnosticV1({...originalFailure}),null);
      assert.equal(nativeProcStatIntegerDiagnosticV1(Object.create(originalFailure)),null);
      const proxy=new Proxy(originalFailure,{get(){throw Error('HOST_PROXY_MUST_NOT_READ');}});
      assert.equal(nativeProcStatIntegerDiagnosticV1(proxy),null);
      assert.equal(isOriginalNativeProcStatMinusOneV1(proxy),false);
      const fs=fixture({'/proc/42/stat':text});let measuredFailure;
      assert.throws(()=>observeNativeOwnedRSSV1(original,fs),error=>{measuredFailure=error;return error.message==='NATIVE_RESOURCE_INTEGER';});
      assert.deepEqual(nativeProcStatIntegerDiagnosticV1(measuredFailure),diagnostic);
      assert.equal(fs.counts.get('/proc/42/stat'),token==='-1'&&field!=='PPID'?4:1);assert.equal(fs.counts.get('/proc/42/status')??0,0);
    }
  }
  assert.equal(nativeProcStatIntegerDiagnosticV1({field:'SESSION',tokenShape:'negative',originalIntegerFailure:true}),null);
  assert.equal(nativeProcStatIntegerDiagnosticV1(null),null);
  // Missing fields fail the unchanged enclosing format guard first: no fake
  // numeric metadata is attached to an unrelated original rejection.
  let malformed;assert.throws(()=>parseNativeProcStat(42,'42 (host fixture) R 1 42\n'),error=>{malformed=error;return error.message==='NATIVE_PROC_STAT_FIELDS';});
  assert.equal(nativeProcStatIntegerDiagnosticV1(malformed),null);
  assert.deepEqual(parseNativeProcStat(42,rawStat()),original);
});

test('HOST original RSS rereads only branded exact minus-one identities with a total bound and full original identity checks',()=>{
  // Same real parser and RSS observer; only filesystem contents are inert.
  const partial=field=>{
    const fields=Array(22).fill('0');fields[0]='R';fields[1]='1';fields[2]='42';fields[3]='42';fields[19]='100';fields[field]='-1';
    return `42 (host fixture) ${fields.join(' ')}\n`;
  };
  for(const field of [2,3]){
    const fs=fixture({'/proc/42/stat':[partial(field),partial(field),partial(field),rawStat()],'/proc/42/status':status(42,1234)});
    const measured=observeNativeOwnedRSSV1(original,fs);
    assert.deepEqual(measured.stat,original);assert.equal(measured.rssBytes,1234*1024);assert.equal(measured.rssSource,'VmRSS');
    assert.equal(fs.counts.get('/proc/42/stat'),5);assert.equal(fs.counts.get('/proc/42/status'),1);
    const persistent=fixture({'/proc/42/stat':partial(field)});
    assert.throws(()=>observeNativeOwnedRSSV1(original,persistent),/NATIVE_RESOURCE_INTEGER/);assert.equal(persistent.counts.get('/proc/42/stat'),4);
  }
  for(const changed of [rawStat(42,'R','999'),rawStat(42,'R','100',99),rawStat().replace(' R 1 42 42 ',' R 1 0 42 ')]){
    const fs=fixture({'/proc/42/stat':[partial(2),changed],'/proc/42/status':status(42,1234)});
    assert.throws(()=>observeNativeOwnedRSSV1(original,fs),/NATIVE_MEASURED_PROCESS_CHANGED/);assert.equal(fs.counts.get('/proc/42/status')??0,0);
  }
  const malformed=fixture({'/proc/42/stat':[partial(2),'42 (host fixture) R 1 42\n']});
  let first;assert.throws(()=>observeNativeOwnedRSSV1(original,malformed),error=>{first=error;return error.message==='NATIVE_RESOURCE_INTEGER';});
  assert.deepEqual(nativeProcStatIntegerDiagnosticV1(first),{field:'PGRP',tokenShape:'negative',originalIntegerFailure:true,identityMinusOne:true});
  assert.equal(malformed.counts.get('/proc/42/stat'),2);
  const ppid=fixture({'/proc/42/stat':partial(1)});assert.throws(()=>observeNativeOwnedRSSV1(original,ppid),/NATIVE_RESOURCE_INTEGER/);assert.equal(ppid.counts.get('/proc/42/stat'),1);
  const wrongNegative=fixture({'/proc/42/stat':partial(2).replace(' R 1 -1 42 ',' R 1 -2 42 ')});
  assert.throws(()=>observeNativeOwnedRSSV1(original,wrongNegative),/NATIVE_RESOURCE_INTEGER/);assert.equal(wrongNegative.counts.get('/proc/42/stat'),1);
  const absentOriginal=fixture({'/proc/42/stat':[partial(2),absent()]});assert.equal(observeNativeOwnedRSSV1(original,absentOriginal),null);assert.equal(absentOriginal.counts.get('/proc/42/stat'),2);
  // A successful early read does not renew the three-reread allowance before
  // the later same-observation read. A valid literal zero still fails identity.
  const exhausted=fixture({'/proc/42/stat':[partial(2),partial(2),partial(2),rawStat(),partial(3)],'/proc/42/status':status(42,1234)});
  assert.throws(()=>observeNativeOwnedRSSV1(original,exhausted),/NATIVE_RESOURCE_INTEGER/);assert.equal(exhausted.counts.get('/proc/42/stat'),5);
});
