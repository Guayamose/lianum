/** Fixed new process: one-use originals, signed HTTPS, no root/key IPC. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {exactRecord} from '../../../../packages/backend/src/execution/encoding/commitments.mjs';
import {cloneInput,frozenInput} from '../../../../packages/backend/src/execution/account/preparation/readiness-inputs.mjs';
import {openNativeLiveArmedRecoveryAuthorityV1,reopenNativeLiveArmedFromAuthorityV1} from '../../../../packages/backend/src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import {installOriginalNativeDeviceLiveArmedServiceV1} from '../../../../packages/backend/src/operations/recovery/native-device-live-armed-restart-v1.mjs';
import {reopenOriginalNativeDeviceLiveArmedObservedClocksV1} from '../../../../packages/backend/src/operations/recovery/native-device-local-observed-clock-v1.mjs';
import {createOriginalNativeDeviceLiveRecoveryProducerV1} from '../../../../packages/backend/src/operations/recovery/native-device-local-live-recovery-v1.mjs';
import {auditNativeDeviceLiveArmedShortV1} from './native-device-live-armed-short-audit-v1.mjs';
import {privateNativeEconomicSuccessorFirstErrorV1} from './native-device-economic-private-error-v1.mjs';
import {writeFixturePrivate} from '../../fixtures/runners/owned-flat-fixture.mjs';
const HERE=join(ROOT,'integration/native-device-live-armed-short-successor-v1.mjs');
assert.equal(process.argv.length,2);assert.deepEqual(process.execArgv,[]);assert.equal(realpathSync(process.argv[1]),HERE);assert.equal(realpathSync(process.cwd()),ROOT);
assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.PATH,'/usr/bin:/bin');assert.equal(process.env.LANG,'C.UTF-8');assert.equal(process.connected,true);
const parent=readFileSync(`/proc/${process.ppid}/cmdline`,'utf8').split('\0').filter(Boolean);assert.equal(parent.length,2);assert.equal(parent[0],process.execPath);assert.equal(realpathSync(`/proc/${process.ppid}/exe`),process.execPath);
assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`),parent[1])),join(ROOT,'integration/native-value-live-armed-short-restart-flow-v1.mjs'));
let originals,service,clocks,producer,identity,sequence=0,opened=false,closing,deadline,acquisition,closeRequested=false,firstError=false,controlDeadlineMs,auditWork;
const send=async value=>{assert.ok(Buffer.byteLength(JSON.stringify(value))<=2*1024*1024);await new Promise((done,reject)=>process.send(value,e=>e?reject(e):done()));};
function privateTLS(name){const path=join(identity.directory,'device-tls',name);assert.equal(realpathSync(path),path);const before=lstatSync(path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.uid===process.getuid()&&(before.mode&0o077)===0&&before.nlink===1&&before.size<=65536);
 const bytes=readFileSync(path),after=lstatSync(path);for(const k of ['ino','dev','size','mtimeMs','ctimeMs'])assert.equal(before[k],after[k]);return bytes.toString('utf8');}
function active(){assert.ok(!closeRequested&&!closing&&Date.now()<controlDeadlineMs&&Date.now()<identity.deadlineMs,'NATIVE_LIVE_ARMED_SHORT_CONTROL_CLOSED');}
function close(){closeRequested=true;if(closing)return closing;closing=(async()=>{clearTimeout(deadline);if(acquisition)try{await acquisition;}catch{}
 const failures=[],stopped={};const run=async(name,work)=>{try{stopped[name]=await work();}catch(e){failures.push(e);}};
 const liveStop=producer?.close(),transportStop=service?.transport.close();for(const p of [liveStop,transportStop])p?.catch(()=>{});
 if(liveStop)await run('live',()=>liveStop);if(transportStop)await run('transport',()=>transportStop);if(auditWork)await run('audit',()=>auditWork);
 if(originals){await run('abort',()=>originals.account.abort());await run('session',()=>originals.session.close());await run('account',()=>originals.account.close());await run('executor',()=>originals.nativeExecution.close());if(!originals.providerCustody.report().closed)await run('provider',()=>originals.providerCustody.close());await run('owner',()=>originals.owner.close());await run('bootstrap',()=>{originals.bootstrap.close();return{closed:true};});
  if(clocks)await run('clock',()=>clocks.close());else for(const [name,runtime]of [['native',originals.nativeRuntime],['receiver',originals.runtime]])await run(name,()=>runtime.close({removeScratch:false}));}
 if(failures.length)throw new AggregateError(failures,'NATIVE_LIVE_ARMED_SHORT_CLEANUP_FAILED');if(!service||!originals)return{closed:false,originalBackendStopped:false,processId:process.pid};
 assert.ok(stopped.transport?.closed&&stopped.transport.ownedSocketsRemaining===0);assert.equal(stopped.session.phase,'CLOSED');assert.equal(stopped.account.closed,true);assert.equal(stopped.executor.closed,true);assert.equal(stopped.owner.childExited,true);
 for(const runtime of [originals.runtime,originals.nativeRuntime]){assert.equal(runtime.processStatus().stopped,true);const row=runtime.lifecycle.filter(x=>x.event==='stopped-owned-process');assert.equal(row.length,1);assert.equal(row[0].forced,false);assert.equal(row[0].exitCode,0);assert.equal(row[0].signal,null);}
 return{closed:true,listenerClosed:true,ownedSocketsRemaining:0,originalBackendStopped:true,processId:process.pid};})();return closing;}
async function handle(packet){assert.ok(Buffer.byteLength(JSON.stringify(packet))<=8192);exactRecord(packet,packet.action==='OPEN'?['sequence','action','identity','checkpoint','controlDeadlineMs']:['sequence','action']);assert.equal(packet.sequence,++sequence);
 if(packet.action==='OPEN'){assert.equal(opened,false);opened=true;identity=cloneInput(packet.identity);const checkpoint=cloneInput(packet.checkpoint);exactRecord(identity,['directory','runId','sourceSHA256','deadlineMs']);exactRecord(checkpoint,['revision','commitment']);
  controlDeadlineMs=packet.controlDeadlineMs;assert.ok(Number.isSafeInteger(controlDeadlineMs)&&Date.now()<controlDeadlineMs&&controlDeadlineMs<=identity.deadlineMs);deadline=setTimeout(()=>{void close().catch(()=>{});},controlDeadlineMs-Date.now());deadline.unref();
  acquisition=(async()=>{const authority=await openNativeLiveArmedRecoveryAuthorityV1(identity,checkpoint);originals=await reopenNativeLiveArmedFromAuthorityV1(authority);active();clocks=reopenOriginalNativeDeviceLiveArmedObservedClocksV1(originals.account,{runtime:originals.runtime,nativeRuntime:originals.nativeRuntime});
   service=await installOriginalNativeDeviceLiveArmedServiceV1(Object.fromEntries(['runtime','system','owner','account','nativeExecution','providerCustody','actor'].map(k=>[k,originals[k]])),{certificate:privateTLS('certificate.pem'),privateKey:privateTLS('key.pem')});active();assert.equal(service.state,'ARMED');
   producer=createOriginalNativeDeviceLiveRecoveryProducerV1({account:originals.account,executionBridge:service.executionBridge,runtime:originals.runtime,system:originals.system,nativeRuntime:originals.nativeRuntime,clock:clocks.clock});
   const audit=await auditNativeDeviceLiveArmedShortV1(originals,service);return{receipt:frozenInput({kind:'ORIGINAL_NATIVE_LIVE_ARMED_SHORT_SUCCESSOR_V1',sourceSHA256:identity.sourceSHA256,checkpoint,processId:process.pid,originalProcessLifetimeDifferent:true,originalSectionsStoppedBeforeCheckpoint:true,issuerClosed:true,economicAcceptanceEstablished:false}),descriptor:service.descriptor,parentJobId:service.parentJobId,depositJobId:audit.status.reservation.consentFields.depositJobId,rootId:audit.status.reservation.consentFields.custody.rootId};})();acquisition.catch(()=>{});const value=await acquisition;active();await send({sequence,ok:true,value});return;}
 active();if(packet.action==='AUDIT'){assert.equal(auditWork,undefined);const admitted=auditNativeDeviceLiveArmedShortV1(originals,service);auditWork=admitted;admitted.catch(()=>{});let value;try{value=await admitted;}finally{if(auditWork===admitted)auditWork=undefined;}active();await send({sequence,ok:true,value});}
 else{assert.equal(packet.action,'CLOSE');const value=await close();await send({sequence,ok:true,value});process.disconnect();}}
let chain=Promise.resolve();process.on('message',packet=>{chain=chain.then(()=>handle(packet)).catch(async error=>{if(identity&&!firstError){firstError=true;try{writeFixturePrivate(join(identity.directory,'successor-first-error-private.json'),privateNativeEconomicSuccessorFirstErrorV1(error));}catch{}}
 if(process.connected)await send({sequence,ok:false,errorCode:'NATIVE_LIVE_ARMED_SHORT_ORIGINAL_FAILURE'}).catch(()=>{});if(!service||closing){await close().catch(()=>{});process.exitCode=1;if(process.connected)process.disconnect();}});});
process.once('disconnect',()=>{void close().catch(()=>{process.exitCode=1;});});for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void close().then(()=>{if(process.connected)process.disconnect();},()=>{process.exitCode=1;if(process.connected)process.disconnect();});});
