/** HOST procfs race observations only; fixtures cannot brand a process, proof
 * or financial outcome. The original observer, resource failure and limits run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {observeStandardProofRSSV1,proofResourceMonitorErrorCodeV1} from '../../src/jobs/standard-proof-resources-v1.mjs';
import {parseNativeProcStat} from '../../../../tests/integration/native/native-flow-owned-files-v1.mjs';
import {resourceFailure} from '../../src/tooling/tooling.mjs';
import {LIMITS} from '../../src/catalog.mjs';
const raw=(pid=42,state='R',ticks='100',ppid=1,group=42,session=42)=>{
  const fields=Array(22).fill('0');fields[0]=state;fields[1]=String(ppid);fields[2]=String(group);fields[3]=String(session);fields[19]=ticks;
  return`${pid} (host fixture) ${fields.join(' ')}\n`;
};
const original=Object.freeze({...parseNativeProcStat(42,raw()),uid:1000});
const status=(tid=42,rss=null,owner=1000,tgid=42)=>`Name:\thost fixture\nTgid:\t${tgid}\nPid:\t${tid}\nUid:\t${owner}\t${owner}\t${owner}\t${owner}\n${rss===null?'':`VmRSS:\t${rss} kB\n`}`;
const missing=()=>Object.assign(Error('synthetic entry absent'),{code:'ENOENT'});
function fixture(files,tasks=['42']){
  const counts=new Map();
  const value=(path,input)=>{const at=counts.get(path)??0;counts.set(path,at+1);
    if(Array.isArray(input))input=input[Math.min(at,input.length-1)];
    if(typeof input==='function')input=input(at);
    if(input===undefined)throw missing();if(input instanceof Error)throw input;return input;};
  return{counts,readFileSync:path=>value(path,files[path]),readdirSync:path=>value(path,path==='/proc/42/task'
    ?()=>Array.isArray(tasks[0])?tasks[Math.min((counts.get(path)??1)-1,tasks.length-1)]:tasks:undefined)};
}
const group=(state='R',rss=null,statm='0 0 0 0 0 0 0\n')=>({
  '/proc/42/stat':raw(42,state),'/proc/42/status':status(),
  '/proc/42/task/42/stat':raw(42,state),'/proc/42/task/42/status':status(42,rss),'/proc/42/task/42/statm':statm});

test('a leader missing VmRSS rereads real RSS under its exact original identity and UID',()=>{
  const fs=fixture({'/proc/42/stat':raw(),'/proc/42/status':[status(),status(42,1234),status(42,1234)]});
  const result=observeStandardProofRSSV1(original,fs);
  assert.equal(result.rssBytes,1234*1024);assert.equal(result.rssSource,'VmRSS');
  assert.equal(result.stat.startTimeTicks,original.startTimeTicks);
  assert.equal(fs.counts.get('/proc/42/status'),3);
});

test('R or Z leaders cannot hide a live sibling or a sample exceeding the same 3 GiB',()=>{
  for(const state of['R','Z']){
    const files={...group(state),'/proc/42/task/43/stat':raw(43,'S','101'),'/proc/42/task/43/status':status(43,4*1024*1024)};
    const measured=observeStandardProofRSSV1(original,fixture(files,['42','43']));
    assert.equal(measured.rssBytes,4*1024**3);assert.equal(measured.liveThreadCount,state==='Z'?1:2);
    assert.equal(LIMITS.workerRSS,3221225472);
    assert.equal(resourceFailure({availableRAM:LIMITS.availableRAM,freeDisk:LIMITS.freeDisk,workerRSS:measured.rssBytes}),'WORKER_RSS_LIMIT');
  }
});

test('whole-entry absence and measured no-mm groups are observations; live unmeasured RSS and churn reject',()=>{
  assert.equal(observeStandardProofRSSV1(original,fixture({})),null);
  for(const state of['R','Z']){
    const result=observeStandardProofRSSV1(original,fixture(group(state)));
    assert.equal(result.rssBytes,0);assert.equal(result.rssSource,'task-VmRSS-or-statm-zero');
    assert.equal(result.liveThreadCount,state==='Z'?0:1); // R is never relabelled gone.
  }
  for(const statm of['20 3 0 0 0 0 0\n',missing()])
    assert.throws(()=>observeStandardProofRSSV1(original,fixture(group('R',null,statm))),/NATIVE_OWNED_RSS_UNAVAILABLE/);
  assert.throws(()=>observeStandardProofRSSV1(original,fixture(group(),[['42'],['42','43']])),/NATIVE_OWNED_RSS_UNAVAILABLE/);
});

test('reused PID/task, changed parent/group/session/TGID and either UID reread fail closed',()=>{
  for(const changed of[raw(42,'R','999'),raw(42,'R','100',9),raw(42,'R','100',1,9),raw(42,'R','100',1,42,9)])
    assert.throws(()=>observeStandardProofRSSV1(original,fixture({'/proc/42/stat':[raw(),changed],'/proc/42/status':status(42,10)})),/IDENTITY_CHANGED|NATIVE_MEASURED_PROCESS_CHANGED|PARENT_CHANGED|GROUP_CHANGED|SESSION_CHANGED/);
  for(const path of['/proc/42/status','/proc/42/task/42/status'])
    assert.throws(()=>observeStandardProofRSSV1(original,fixture({...group(),[path]:status(42,null,1001)})),/UID_CHANGED/);
  assert.throws(()=>observeStandardProofRSSV1(original,fixture({'/proc/42/stat':raw(),'/proc/42/status':[status(42,10),status(42,10,1001)]})),/UID_CHANGED/);
  assert.throws(()=>observeStandardProofRSSV1(original,fixture({...group(),'/proc/42/task/42/status':status(42,null,1000,99)})),/NATIVE_MEASURED_PROCESS_CHANGED/);
  assert.throws(()=>observeStandardProofRSSV1(original,fixture({...group(),'/proc/42/task/42/stat':[raw(),raw(42,'R','999')]})),/NATIVE_MEASURED_PROCESS_CHANGED/);
});

test('monitor diagnostics retain only safe original codes and never paths, stacks or private text',()=>{
  assert.equal(proofResourceMonitorErrorCodeV1(Error('NATIVE_OWNED_RSS_UNAVAILABLE')),'NATIVE_OWNED_RSS_UNAVAILABLE');
  assert.equal(proofResourceMonitorErrorCodeV1(Error('PW_STANDARD_WORKER_UID_CHANGED\nprivate details')),'PW_STANDARD_WORKER_UID_CHANGED');
  const denied=Object.assign(Error('private filesystem path'),{code:'EACCES'});
  assert.throws(()=>observeStandardProofRSSV1(original,fixture({...group(),'/proc/42/task/42/status':denied})),error=>error===denied);
  assert.equal(proofResourceMonitorErrorCodeV1(denied),'EACCES');
  assert.equal(proofResourceMonitorErrorCodeV1(Error('PW_VALID_PREFIX /private/path')),'PW_RESOURCE_MEASUREMENT_FAILED');
  assert.equal(proofResourceMonitorErrorCodeV1(Error('private stack/message')),'PW_RESOURCE_MEASUREMENT_FAILED');
});
