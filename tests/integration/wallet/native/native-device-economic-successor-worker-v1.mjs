/** Fixed causal successor of the ORIGINAL planned F recovery profile.
 * Only bounded private control IPC (OPEN/WAIT/AUDIT/CLOSE). Economic requests
 * use existing signed HTTPS routes. No device root/key enters this worker. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {exactRecord} from '../../../../packages/backend/src/execution/encoding/commitments.mjs';
import {privateFailureDiagnostic} from '../../../../packages/backend/src/execution/account/reconciliation/failure-diagnostics.mjs';
import {writeFixturePrivate} from '../../fixtures/runners/owned-flat-fixture.mjs';
import {reopenOriginalNativeValueEconomicSuccessorV1} from '../../../../packages/backend/src/operations/recovery/native-value-economic-successor-v1.mjs';
import {reinstallOriginalNativeDeviceEconomicServiceV1} from '../../../../packages/backend/src/operations/recovery/native-device-economic-service-v1.mjs';
import {awaitDeviceOwnerExecutionOriginalWorkV1} from '../../../../packages/backend/src/accounts/authority/device-owner-execution-bridge-v1.mjs';
import {auditNativeDeviceEconomicSuccessorV1} from './native-device-economic-successor-audit-v1.mjs';
const HERE=fileURLToPath(import.meta.url),MAXIMUM_IPC_BYTES=2*1024*1024;
assert.equal(process.argv.length,2);assert.deepEqual(process.execArgv,[]);assert.equal(realpathSync(process.argv[1]),HERE);assert.equal(realpathSync(process.cwd()),ROOT);
assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);
assert.equal(process.env.PATH,'/usr/bin:/bin');assert.equal(process.env.LANG,'C.UTF-8');
assert.equal(process.connected,true);assert.equal(typeof process.send,'function');
const parent=readFileSync(`/proc/${process.ppid}/cmdline`,'utf8').split('\0').filter(Boolean);
assert.equal(parent.length,2);assert.equal(parent[0],process.execPath);assert.equal(realpathSync(`/proc/${process.ppid}/exe`),process.execPath);
assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`),parent[1])),join(ROOT,'integration/native-value-economic-recovery-flow-v1.mjs'));
let originals,service,identity,sequence=0,opened=false,closing,deadline,acquisition,closeRequested=false;
const send=async value=>{assert.ok(Buffer.byteLength(JSON.stringify(value))<=MAXIMUM_IPC_BYTES,'NATIVE_ECONOMIC_SUCCESSOR_PUBLIC_IPC_LIMIT');
 await new Promise((done,reject)=>process.send(value,error=>error?reject(error):done()));};
const privateTLS=name=>{const path=join(identity.directory,'device-tls',name);assert.equal(realpathSync(path),path);const before=lstatSync(path);
 assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.uid===process.getuid()&&(before.mode&0o077)===0);assert.ok(before.size<=65536);
 const bytes=readFileSync(path),after=lstatSync(path);for(const key of ['ino','dev','size','mtimeMs','ctimeMs'])assert.equal(before[key],after[key]);return bytes.toString('utf8');};
async function close(){closeRequested=true;if(closing)return closing;closing=(async()=>{clearTimeout(deadline);const failures=[],stopped={};
 if(acquisition)try{await acquisition;}catch{/* Acquisition retains its original error; cleanup still owns every acquired section. */}
 const stop=async(name,work)=>{try{stopped[name]=await work();}catch(error){failures.push(error);}};
 if(service)await stop('transport',()=>service.transport.close());
 if(originals){await stop('session',()=>originals.session.close());await stop('accountAbort',()=>originals.account.abort());await stop('account',()=>originals.account.close());
   await stop('executor',()=>originals.nativeExecution.close());if(!originals.providerCustody.report().closed)await stop('provider',()=>originals.providerCustody.close());
   await stop('owner',()=>originals.owner.close());await stop('bootstrap',()=>{originals.bootstrap.close();return{closed:true};});
   await stop('native',()=>originals.nativeRuntime.close());await stop('receiver',()=>originals.runtime.close());}
 if(failures.length)throw new AggregateError(failures,'NATIVE_ECONOMIC_SUCCESSOR_ORIGINAL_CLEANUP_FAILED');
 if(!service||!originals)return{closed:false,originalBackendStopped:false,processId:process.pid};
 assert.equal(stopped.transport?.closed,true);assert.equal(stopped.transport.ownedSocketsRemaining,0);assert.equal(stopped.session?.phase,'CLOSED');
 assert.equal(stopped.account?.closed,true);assert.equal(stopped.executor?.closed,true);assert.equal(stopped.owner?.childExited,true);assert.equal(stopped.bootstrap?.closed,true);
 for(const name of['native','receiver']){assert.equal(stopped[name]?.stopped,true);assert.equal(stopped[name].exitObserved,true);assert.equal(stopped[name].exitCode,0);assert.equal(stopped[name].signal,null);
   const runtime=name==='native'?originals.nativeRuntime:originals.runtime,last=runtime.lifecycle.filter(row=>row.event==='stopped-owned-process').at(-1);
   assert.ok(last);assert.equal(last.pid,stopped[name].pid);assert.equal(last.forced,false);}
 return{closed:true,listenerClosed:true,ownedSocketsRemaining:0,originalBackendStopped:true,processId:process.pid};})();return closing;}
async function handle(packet){assert.ok(Buffer.byteLength(JSON.stringify(packet))<=8192,'NATIVE_ECONOMIC_SUCCESSOR_CONTROL_LIMIT');
 exactRecord(packet,packet.action==='OPEN'?['sequence','action','identity','checkpoint']:['sequence','action']);assert.equal(packet.sequence,++sequence);
 if(packet.action==='OPEN'){assert.equal(opened,false);opened=true;identity=packet.identity;assert.ok(Date.now()<identity.deadlineMs);
   deadline=setTimeout(()=>{void close().catch(()=>{});},identity.deadlineMs-Date.now());deadline.unref();
   acquisition=(async()=>{const value=await reopenOriginalNativeValueEconomicSuccessorV1(identity,packet.checkpoint);originals=value.originals;
     assert.ok(!closeRequested&&Date.now()<identity.deadlineMs,'NATIVE_ECONOMIC_SUCCESSOR_CLOSED_DURING_REOPEN');
     service=await reinstallOriginalNativeDeviceEconomicServiceV1({...Object.fromEntries(['runtime','system','owner','account','nativeExecution','providerCustody','actor'].map(name=>[name,originals[name]])),
       tls:{certificate:privateTLS('certificate.pem'),privateKey:privateTLS('key.pem')}});return value;})();
   acquisition.catch(()=>{});const value=await acquisition;
   assert.ok(!closeRequested&&Date.now()<identity.deadlineMs,'NATIVE_ECONOMIC_SUCCESSOR_CLOSED_DURING_REOPEN');
   await send({sequence,ok:true,value:{receipt:value.receipt,descriptor:service.descriptor,parentJobId:service.parentJobId,depositJobId:service.depositJobId,rootId:service.rootId}});return;}
 assert.ok(service&&!closeRequested&&!closing&&Date.now()<identity.deadlineMs,'NATIVE_ECONOMIC_SUCCESSOR_ORIGINAL_LIVE');
 if(packet.action==='WAIT'){await awaitDeviceOwnerExecutionOriginalWorkV1(service.executionBridge);await send({sequence,ok:true,value:{originalWorkCompleted:true}});}
 else if(packet.action==='AUDIT')await send({sequence,ok:true,value:await auditNativeDeviceEconomicSuccessorV1(originals,service)});
 else{assert.equal(packet.action,'CLOSE');const value=await close();await send({sequence,ok:true,value});process.disconnect();}
}
let chain=Promise.resolve();process.on('message',packet=>{chain=chain.then(()=>handle(packet)).catch(async error=>{
 const diagnostic=privateFailureDiagnostic(error,'NATIVE_ECONOMIC_SUCCESSOR_ORIGINAL_FAILURE');
 if(identity)writeFixturePrivate(join(identity.directory,'successor-error.json'),diagnostic);
 if(process.connected)await send({sequence,ok:false,errorCode:diagnostic.code}).catch(()=>{});
 if(!service||closing){await close().catch(()=>{});process.exitCode=1;if(process.connected)process.disconnect();}
 });});
process.once('disconnect',()=>{void close().catch(error=>{process.stderr.write(privateFailureDiagnostic(error,'NATIVE_ECONOMIC_SUCCESSOR_CLEANUP_FAILED').code+'\n');process.exitCode=1;});});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void close().then(()=>{if(process.connected)process.disconnect();},error=>{process.stderr.write(privateFailureDiagnostic(error,'NATIVE_ECONOMIC_SUCCESSOR_CLEANUP_FAILED').code+'\n');process.exitCode=1;});});
