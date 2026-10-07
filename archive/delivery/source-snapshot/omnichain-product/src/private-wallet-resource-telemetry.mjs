import {PRIVATE_RESOURCE_POLICY} from './private-resource-policy.mjs';
/** Bounded diagnostic-only PC23 runtime telemetry. PIDs come exclusively from
 * the owned runtime metadata and are pinned to this keeper's PPid/start ticks.
 * No process discovery, signals, endpoints, memory contents or credentials.
 * This cannot grant economic permission or weaken resource-floor monitors. */
import assert from 'node:assert/strict';
import {openSync,readSync,closeSync,statfsSync} from 'node:fs';
const STAGES=new Set(['STARTUP','NATIVE_STARTED','ALL_RUNTIMES_STARTED','BEFORE_HEAVY','AFTER_HEAVY','PERIODIC','GUARD_ABORT','BEFORE_CLOSE','AFTER_CLOSE']);
const roles=['evm','btc','sol'];
const fields=['rssBytes','pssBytes','privateBytes','anonymousBytes','rssAnonBytes','rssFileBytes','rssShmemBytes','swapBytes','highWaterRSSBytes','threads'];
const safeError=e=>['ENOENT','ESRCH','EACCES','EPERM'].includes(e?.code)?e.code:'READ_FAILED';
const boundedRead=(path,limit)=>{const fd=openSync(path,'r'),buffer=Buffer.alloc(limit+1);try{let n=0;while(n<buffer.length){const got=readSync(fd,buffer,n,buffer.length-n,null);if(got===0)break;n+=got;}assert.ok(n<=limit,'PC23_TELEMETRY_READ_BOUND');return buffer.toString('utf8',0,n);}finally{closeSync(fd);buffer.fill(0);}};
function statIdentity(text){const at=text.lastIndexOf(')');assert.ok(at>1,'PC23_TELEMETRY_STAT');const rest=text.slice(at+1).trim().split(/\s+/);assert.ok(rest.length>=20&&/^[0-9]+$/.test(rest[1])&&/^[0-9]+$/.test(rest[19]),'PC23_TELEMETRY_STAT');return{ppid:Number(rest[1]),startTicks:rest[19]};}
function numericKB(text,key){const match=new RegExp('^'+key+':\\s+(\\d+)\\s+kB\\s*$','m').exec(text);if(!match)return null;const n=Number(match[1])*1024;assert.ok(Number.isSafeInteger(n)&&n>=0,'PC23_TELEMETRY_NUMBER');return n;}
const max=(a,b)=>b===null?a:a===null?b:Math.max(a,b),min=(a,b)=>b===null?a:a===null?b:Math.min(a,b);
function processEmpty(role,pid,status,errorCode=null){return{role,pid,status,errorCode,...Object.fromEntries(fields.map(k=>[k,null]))};}
/** Seam functions are trusted host-test arguments only, never IPC/config data. */
export function createPrivateWalletResourceTelemetry({diskPath,write,periodMs=30000,maxRecords=2048,writeTimeoutMs=2000},{read=boundedRead,disk=()=>statfsSync(diskPath),memory=()=>process.memoryUsage(),ownerPid=process.pid,now=()=>performance.now(),timers=globalThis}={}){
 assert.equal(typeof diskPath,'string');assert.equal(typeof write,'function');assert.ok(Number.isSafeInteger(periodMs)&&periodMs>=30000);assert.ok(Number.isSafeInteger(maxRecords)&&maxRecords>=1&&maxRecords<=2048);assert.ok(Number.isSafeInteger(writeTimeoutMs)&&writeTimeoutMs>0&&writeTimeoutMs<=2000);
 const pins=new Map(),began=now();let interval,pending=0,tail=Promise.resolve(),finished=false,writesDisabled=false,finalPromise;
 const stats={schemaVersion:1,classification:'DIAGNOSTIC_OWNED_RUNTIME_NUMERIC_RESOURCE_TELEMETRY',sampleCount:0,persistedSampleCount:0,attemptedSampleWrites:0,droppedOverlapCount:0,recordLimitCount:0,diagnosticReadFailures:0,diagnosticWriteFailures:0,writeTimeouts:0,minimumAvailableRAM:null,minimumFreeDisk:null,controllerPeakRSS:0,controllerPeakExternal:0,controllerPeakArrayBuffers:0,stages:Object.fromEntries([...STAGES].map(s=>[s,0])),processPeaks:Object.fromEntries(roles.map(role=>[role,{pid:null,samples:0,exitedObserved:false,...Object.fromEntries(fields.map(k=>[k,null]))}]))};
 function pin(role,pid){
  assert.ok(roles.includes(role)&&Number.isSafeInteger(pid)&&pid>0,'PC23_TELEMETRY_OWNED_PID');
  if(pins.has(role)){assert.equal(pins.get(role).pid,pid,'PC23_TELEMETRY_RUNTIME_REPLACED');return;}
  const p={pid,identity:null,dead:false,error:null};pins.set(role,p);stats.processPeaks[role].pid=pid;
  try{const identity=statIdentity(read(`/proc/${pid}/stat`,4096));assert.equal(identity.ppid,ownerPid,'PC23_TELEMETRY_NOT_OWNED_CHILD');p.identity=identity;}
  catch(error){stats.diagnosticReadFailures++;p.error=safeError(error);p.dead=['ENOENT','ESRCH'].includes(p.error);}
 }
 function sampleProcess(role){
  const pin=pins.get(role);if(!pin)return processEmpty(role,null,'NOT_STARTED');
  if(pin.dead)return processEmpty(role,pin.pid,'EXITED');
  if(!pin.identity)return processEmpty(role,pin.pid,'UNAVAILABLE',pin.error);
  try{
   const before=statIdentity(read(`/proc/${pin.pid}/stat`,4096));if(before.ppid!==ownerPid||before.startTicks!==pin.identity.startTicks){pin.dead=true;return processEmpty(role,pin.pid,'IDENTITY_CHANGED','IDENTITY_CHANGED');}
   const status=read(`/proc/${pin.pid}/status`,65536),result=processEmpty(role,pin.pid,'LIVE');
   for(const [key,proc]of Object.entries({rssBytes:'VmRSS',rssAnonBytes:'RssAnon',rssFileBytes:'RssFile',rssShmemBytes:'RssShmem',swapBytes:'VmSwap',highWaterRSSBytes:'VmHWM'}))result[key]=numericKB(status,proc);
   const threads=/^Threads:\s+(\d+)\s*$/m.exec(status);result.threads=threads?Number(threads[1]):null;
   try{const rollup=read(`/proc/${pin.pid}/smaps_rollup`,65536);result.rssBytes=numericKB(rollup,'Rss')??result.rssBytes;result.pssBytes=numericKB(rollup,'Pss');result.anonymousBytes=numericKB(rollup,'Anonymous');const clean=numericKB(rollup,'Private_Clean'),dirty=numericKB(rollup,'Private_Dirty'),huge=numericKB(rollup,'Private_Hugetlb');result.privateBytes=clean===null||dirty===null?null:clean+dirty+(huge??0);}
   catch(error){result.errorCode=safeError(error);stats.diagnosticReadFailures++;}
   const after=statIdentity(read(`/proc/${pin.pid}/stat`,4096));if(after.ppid!==before.ppid||after.startTicks!==before.startTicks){pin.dead=true;return processEmpty(role,pin.pid,'IDENTITY_CHANGED','IDENTITY_CHANGED');}
   return result;
  }catch(error){const code=safeError(error);stats.diagnosticReadFailures++;if(['ENOENT','ESRCH'].includes(code)){pin.dead=true;return processEmpty(role,pin.pid,'EXITED');}return processEmpty(role,pin.pid,'UNAVAILABLE',code);}
 }
 function capture(stage,label){
  const record={kind:'private-owned-runtime-resource-sample',schemaVersion:1,sequence:++stats.sampleCount,elapsedMilliseconds:Math.max(0,Math.floor(now()-began)),stage,label,host:{availableRAM:null,freeDisk:null},controller:{rssBytes:null,externalBytes:null,arrayBuffersBytes:null},processes:roles.map(sampleProcess)};
  try{record.host.availableRAM=numericKB(read('/proc/meminfo',65536),'MemAvailable');if(record.host.availableRAM===null)stats.diagnosticReadFailures++;}catch{stats.diagnosticReadFailures++;}
  try{const s=disk(),bytes=Number(s.bavail)*Number(s.bsize);assert.ok(Number.isSafeInteger(bytes)&&bytes>=0);record.host.freeDisk=bytes;}catch{stats.diagnosticReadFailures++;}
  try{const m=memory();for(const[from,to]of [['rss','rssBytes'],['external','externalBytes'],['arrayBuffers','arrayBuffersBytes']])if(Number.isSafeInteger(m[from])&&m[from]>=0)record.controller[to]=m[from];}catch{stats.diagnosticReadFailures++;}
  stats.stages[stage]++;stats.minimumAvailableRAM=min(stats.minimumAvailableRAM,record.host.availableRAM);stats.minimumFreeDisk=min(stats.minimumFreeDisk,record.host.freeDisk);stats.controllerPeakRSS=max(stats.controllerPeakRSS,record.controller.rssBytes);stats.controllerPeakExternal=max(stats.controllerPeakExternal,record.controller.externalBytes);stats.controllerPeakArrayBuffers=max(stats.controllerPeakArrayBuffers,record.controller.arrayBuffersBytes);
  for(const p of record.processes){const peak=stats.processPeaks[p.role];if(p.status==='LIVE'){peak.samples++;for(const f of fields)peak[f]=max(peak[f],p[f]);}else if(p.status==='EXITED')peak.exitedObserved=true;}
  return record;
 }
 async function persist(record,final=false){
  if(writesDisabled&&!final)return false;
  if(!final&&stats.attemptedSampleWrites>=maxRecords){stats.recordLimitCount++;return false;}
  if(Buffer.byteLength(JSON.stringify(record))>16384){stats.diagnosticWriteFailures++;return false;}
  if(!final)stats.attemptedSampleWrites++;
  let timer;const writing=Promise.resolve().then(()=>write(record));writing.catch(()=>{});
  const timeout=new Promise(resolve=>{timer=timers.setTimeout(()=>resolve('TIMEOUT'),writeTimeoutMs);});
  try{const result=await Promise.race([writing.then(()=>true,()=>false),timeout]);if(result==='TIMEOUT'){stats.diagnosticWriteFailures++;stats.writeTimeouts++;writesDisabled=true;return false;}if(result===false){stats.diagnosticWriteFailures++;return false;}if(!final)stats.persistedSampleCount++;return true;}
  finally{timers.clearTimeout(timer);}
 }
 function sample(stage,label=null){
  if(finished)return Promise.resolve(null);assert.ok(STAGES.has(stage),'PC23_TELEMETRY_STAGE');assert.ok(label===null||typeof label==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(label),'PC23_TELEMETRY_LABEL');
  if(pending>=2||(stage==='PERIODIC'&&pending>0)){stats.droppedOverlapCount++;return Promise.resolve(null);}pending++;
  const work=tail.then(async()=>{let record;try{record=capture(stage,label);}catch{stats.diagnosticReadFailures++;return null;}await persist(record);return record;}).catch(()=>{stats.diagnosticReadFailures++;return null;}).finally(()=>{pending--;});tail=work.then(()=>{});return work;
 }
 return Object.freeze({
  trackNative(metadata){try{assert.ok(Array.isArray(metadata.processIds)&&metadata.processIds.length===2,'PC23_TELEMETRY_NATIVE_PIDS');pin('evm',metadata.processIds[0]);pin('btc',metadata.processIds[1]);}catch{stats.diagnosticReadFailures++;}},
  trackSolana(metadata){try{pin('sol',metadata.processId);}catch{stats.diagnosticReadFailures++;}},
  sample,
  start(){if(!interval&&!finished)interval=timers.setInterval(()=>{void sample('PERIODIC');},periodMs);},
  summary(){return structuredClone({...stats,periodMs,maxPersistedSamples:maxRecords,retainedRawSamples:0,diagnosticOnly:true,floorsUnchanged:true,resourcePolicy:PRIVATE_RESOURCE_POLICY});},
  finish({faultCode=null}={}){if(finalPromise)return finalPromise;finished=true;timers.clearInterval(interval);interval=null;finalPromise=(async()=>{await tail;const summary={kind:'private-owned-runtime-resource-summary',elapsedMilliseconds:Math.max(0,Math.floor(now()-began)),...stats,periodMs,maxPersistedSamples:maxRecords,retainedRawSamples:0,diagnosticOnly:true,floorsUnchanged:true,resourcePolicy:PRIVATE_RESOURCE_POLICY,faultCode:typeof faultCode==='string'&&/^[A-Z][A-Z0-9_]{1,100}$/.test(faultCode)?faultCode:null};const finalSummaryPersisted=await persist(summary,true);return structuredClone({...summary,diagnosticWriteFailures:stats.diagnosticWriteFailures,writeTimeouts:stats.writeTimeouts,finalSummaryPersisted});})();return finalPromise;},
 });
}
