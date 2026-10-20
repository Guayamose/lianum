/** The actual entrypoint close/stop functions run in a real child process.
 * Capture, RPC and retained-state services are inert HOST ports; this proves
 * signal lifetime and single-close behavior, not a public financial capture. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

const source=await readFile(new URL('../src/public/run-public-operator-v4.mjs',import.meta.url),'utf8');
const first=source.indexOf('async function close(){'),last=source.indexOf('async function beginReadOnly(){');
assert.ok(first>=0&&last>first);
const closeAndStop=source.slice(first,last),registration=source.match(/^process\.(?:on|once)\('SIGTERM',stop\);process\.(?:on|once)\('SIGINT',stop\);$/m)?.[0];assert.ok(registration);
function start(t,failCapture=false){
 const fixture=`const assert=require('node:assert/strict');
 let stopping=false,closing,captureTimer,startupReadCache,acquisition,phoneAcquisition,transition,readOpening,readServer,ingress;
 const acquisitionControl=new AbortController(),startupChannel={unsubscribe(){}},captureChannelV25={unsubscribe(){}},startupObserver=()=>{},captureObserverV25=()=>{},ignoreFinancialSignalBeforeReady=()=>{},transport={closeOriginalPagedRemoteIngressBindingV4(){throw Error('HOST_NO_INGRESS');}},financialControl={async close(){}},startupProgress=setInterval(()=>{},1000),keepAlive=setInterval(()=>{},1000);
 let count=0,release;const gate=new Promise(resolve=>release=resolve);
 let product={async close(){count++;process.send({stage:'CAPTURE_STARTED',count});await gate;if(${failCapture})throw Error('HOST_CAPTURE_FAILED');return{closed:true,ownedServicesClosed:true,externalChainsStopped:false,automaticRebroadcast:false,retainedOriginalState:true};}};
 const emit=record=>{if(record.stage==='STOPPED'){clearInterval(keepAlive);process.send({...record,count},()=>process.disconnect());}};
 const failure=(stage,error)=>process.send({stage,count,error:error.message});
 ${closeAndStop}
 ${registration}
 process.on('message',message=>{if(message==='release')release();else if(message==='ping')process.send({stage:'ALIVE_DURING_CAPTURE',count,stopping});});
 process.send({stage:'READY'});`;
 const child=spawn(process.execPath,['-e',fixture],{stdio:['ignore','pipe','pipe','ipc']}),messages=[],waiters=[];let stderr='',done=null;child.stderr.on('data',b=>{stderr+=b;});
 child.on('message',message=>{messages.push(message);for(const row of [...waiters])if(row.stage===message.stage){waiters.splice(waiters.indexOf(row),1);clearTimeout(row.timer);row.resolve(message);}});
 const exited=new Promise(resolve=>child.once('exit',(code,signal)=>{done={code,signal};for(const row of waiters.splice(0)){clearTimeout(row.timer);row.reject(Error('HOST_CHILD_EARLY_EXIT '+JSON.stringify({code,signal,stderr})));}resolve(done);}));
 const wait=stage=>{const prior=messages.find(row=>row.stage===stage);if(prior)return Promise.resolve(prior);if(done)return Promise.reject(Error('HOST_CHILD_ALREADY_EXITED '+JSON.stringify(done)));return new Promise((resolve,reject)=>{const row={stage,resolve,reject,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(row),1);reject(Error('HOST_CHILD_MESSAGE_TIMEOUT '+stage+' '+stderr));},5000)};waiters.push(row);});};
 t.after(async()=>{if(!done)child.kill('SIGKILL');await exited;});return{child,wait,exited,messages,get done(){return done;}};
}
test('two SIGTERM and SIGINT during slow capture retain the handler and perform exactly one complete close',{timeout:10000},async t=>{
 const f=start(t);await f.wait('READY');assert.ok(f.child.kill('SIGTERM'));assert.equal((await f.wait('CAPTURE_STARTED')).count,1);assert.ok(f.child.kill('SIGTERM'));await delay(30);assert.equal(f.done,null,'second SIGTERM must not terminate an unfinished capture');assert.ok(f.child.kill('SIGINT'));await delay(30);f.child.send('ping');const alive=await f.wait('ALIVE_DURING_CAPTURE');assert.equal(alive.count,1);assert.equal(alive.stopping,true);f.child.send('release');const stopped=await f.wait('STOPPED');assert.equal(stopped.count,1);assert.equal(stopped.controlledCapture,true);assert.equal(stopped.externalChainsStopped,false);assert.deepEqual(await f.exited,{code:0,signal:null});assert.equal(f.messages.filter(row=>row.stage==='CAPTURE_STARTED').length,1);assert.equal(f.messages.filter(row=>row.stage==='STOPPED').length,1);assert.equal(f.messages.filter(row=>row.stage==='CAPTURE').length,0);
});
test('capture failure is reported once and restores ordinary signal termination after closure fails',{timeout:10000},async t=>{
 const f=start(t,true);await f.wait('READY');f.child.kill('SIGTERM');await f.wait('CAPTURE_STARTED');f.child.kill('SIGTERM');await delay(30);f.child.send('ping');assert.equal((await f.wait('ALIVE_DURING_CAPTURE')).count,1);f.child.send('release');const failure=await f.wait('CAPTURE');assert.equal(failure.error,'HOST_CAPTURE_FAILED');assert.equal(failure.count,1);assert.equal(f.messages.filter(row=>row.stage==='STOPPED').length,0);f.child.kill('SIGTERM');assert.deepEqual(await f.exited,{code:null,signal:'SIGTERM'});assert.equal(f.messages.filter(row=>row.stage==='CAPTURE').length,1);
});
