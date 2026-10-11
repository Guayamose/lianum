import {fileURLToPath} from 'node:url';
/** Fixed SOURCE backend child. Infrastructure crosses IPC; device keys and
 * note openings stay in the parent or its explicitly consented original TLS job. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT} from '@lianum/proofs/catalog';
import {createOriginalNativeSourceLocalOperatorV1,reopenOriginalNativeSourceLocalOperatorV1,
 readOriginalNativeSourceLocalContextV1,readOriginalNativeSourceLocalOwnedProcessesV1,
 readOriginalNativeSourceLocalArmedAuditV1} from '../../../../packages/backend/src/operations/recovery/native-original-source-local-operator-v1.mjs';
import {readOriginalSessionWalletEconomicStateV1} from '@lianum/backend/accounts/manual-graph';
import {assertOriginalWalletEconomicStateV1,originalWalletEconomicStateBindingsV1} from '@lianum/backend/accounts/state/original-wallet-economic-state-v1';
import {originalNativeSourceCapsuleStatusV1} from '../../../../packages/backend/src/operations/recovery/native-original-source-lifecycle-v1.mjs';
import {readOriginalNativeSourceProofReceiptsV1} from '../../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs';
import {createNativeValueSystemStateReader} from '../../../../packages/backend/src/execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import {nativeProcStatV1} from '../../native/native-flow-owned-files-v1.mjs';
import {privateNativeEconomicSuccessorFirstErrorV1} from './native-device-economic-private-error-v1.mjs';
const name=fileURLToPath(new URL('./native-original-source-abrupt-backend-v1.mjs',import.meta.url));
assert.equal(process.argv.length,2);assert.deepEqual(process.execArgv,[]);assert.equal(realpathSync(process.argv[1]),name);
assert.equal(realpathSync(process.cwd()),ROOT);assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);
const parent=readFileSync('/proc/'+process.ppid+'/cmdline','utf8').split('\0').filter(Boolean);
assert.deepEqual(parent,[process.execPath,fileURLToPath(new URL('./native-original-source-abrupt-flow-v1.mjs',import.meta.url))]);
assert.equal(typeof process.send,'function');
let service=null,started=false,closed=false,closing=false,tail=Promise.resolve();
const max=4*1024*1024;
function exact(value,fields){assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype);assert.deepEqual(Object.keys(value).sort(),[...fields].sort());}
function send(value){assert.ok(Buffer.byteLength(JSON.stringify(value))<=max,'NATIVE_SOURCE_PRIVATE_IPC_BOUND');return new Promise((resolve,reject)=>process.send(value,error=>error?reject(error):resolve()));}
function context(){assert.ok(service&&!closing);return readOriginalNativeSourceLocalContextV1(service);}
async function basic(){const c=context(),reader=await createNativeValueSystemStateReader({runtime:c.runtime,system:c.system,poolIndex:0});
 const view=await reader.read();await reader.assertCurrent(view);const ownerView=await c.account.ownerView(),linux=await c.owner.ownerView.summary();await reader.assertCurrent(view);
 const capsule=originalNativeSourceCapsuleStatusV1(c.authority);assert.equal(capsule.phase,'CONFIRMED');assert.equal(capsule.pending,false);
 return{process:nativeProcStatV1(process.pid),descriptor:service.descriptor,sourceGeneration:service.originalSourceGeneration,capsule,
  artifactKeys:Object.fromEntries(['deposit_balance','authorization','reservation'].map(name=>[name,c.system.verifiers[name].lineage.keySHA256])),head:view.head,domain:{scope:view.domain.scope,policy:view.domain.policy,pool:c.system.pools[0].address,recipient:c.runtime.accounts[3]},
  counts:{receiver:c.runtime.transactions.length,native:c.nativeRuntime.transactions.length},
  ledger:{publicState:view.ledger.publicState,commitments:view.ledger.commitments,nullifiers:view.ledger.nullifiers},
  linuxSourceStatus:linux.notes.source.status,linuxAvailable:ownerView.balances.available};}
async function economicPoint(observe){
 const c=context(),cap=readOriginalSessionWalletEconomicStateV1(c.session);assertOriginalWalletEconomicStateV1(cap);
 assert.ok(originalWalletEconomicStateBindingsV1(cap).some(row=>row.session===c.session),'NATIVE_SOURCE_ORIGINAL_STATE_SESSION');
 const value=observe?await cap.observe():await cap.snapshot(),checkpoint=cap.checkpoint();
 assert.equal(value.storageAvailable,true);assert.equal(value.lifetime,checkpoint.lifetime);assert.equal(value.revision,checkpoint.revision);
 assert.equal(readOriginalSessionWalletEconomicStateV1(context().session),cap,'NATIVE_SOURCE_ORIGINAL_STATE_CHANGED');
 return{value,checkpoint};
}
async function armedPoint(jobId){
 const value=await readOriginalNativeSourceLocalArmedAuditV1(service,jobId),c=context(),capsule=originalNativeSourceCapsuleStatusV1(c.authority);
 assert.equal(capsule.phase,'CONFIRMED');assert.equal(capsule.pending,false);assert.equal(value.arm.state,'ARMED');assert.equal(value.arm.jobId,jobId);
 assert.equal(value.status.outcome,null);assert.equal(value.counts.native,0);assert.ok(BigInt(value.head.timestamp)<BigInt(value.arm.settleBefore));
 return{process:nativeProcStatV1(process.pid),descriptor:service.descriptor,sourceGeneration:service.originalSourceGeneration,capsule,snapshot:value};
}
async function dispatch(message){exact(message,['id','method','payload']);assert.ok(Number.isSafeInteger(message.id)&&message.id>0);assert.ok(!closed&&!closing);
 const {id,method,payload}=message;
 if(method==='START'){assert.equal(started,false);exact(payload,payload.mode==='OPEN_ARMED'?['mode','configuration','jobId']:['mode','configuration']);assert.ok(['CREATE','OPEN','OPEN_ARMED'].includes(payload.mode));started=true;
  service=await(payload.mode==='CREATE'?createOriginalNativeSourceLocalOperatorV1:reopenOriginalNativeSourceLocalOperatorV1)(payload.configuration);
  assert.equal(service.profile,'ORIGINAL_NATIVE_DURABLE_SOURCE_OPERATOR_V1');assert.ok(service.descriptor);const initial=payload.mode==='OPEN_ARMED'?await armedPoint(payload.jobId):await basic();
  return send({id,ok:true,value:{initial,ownedProcesses:await readOriginalNativeSourceLocalOwnedProcessesV1(service)}});}
 assert.ok(started&&service);
 if(method==='RECEIPTS'){exact(payload,['count']);assert.ok([1,2,3].includes(payload.count));
  const receipts=await readOriginalNativeSourceProofReceiptsV1(context().account);assert.equal(receipts.length,payload.count,'NATIVE_SOURCE_ORIGINAL_PROOF_COUNT');return send({id,ok:true,value:[receipts.at(-1)]});}
 if(method==='AUDIT'){exact(payload,[]);return send({id,ok:true,value:await basic()});}
 if(method==='STATE_CACHE'||method==='STATE_READ'){exact(payload,[]);return send({id,ok:true,value:await economicPoint(method==='STATE_READ')});}
 if(method==='ARM_AUDIT'){exact(payload,['jobId']);const value=await readOriginalNativeSourceLocalArmedAuditV1(service,payload.jobId);
  assert.equal(value.arm.state,'ARMED');assert.equal(value.status.outcome,null);assert.equal(value.counts.native,0);assert.ok(BigInt(value.head.timestamp)<BigInt(value.arm.settleBefore));
  return send({id,ok:true,value});}
 if(method==='EXIT17'){exact(payload,[]);const value=await basic();assert.equal(value.ledger.commitments.length,1);assert.equal(value.ledger.nullifiers.length,0);
  assert.equal(value.ledger.publicState.backedAmount,'500');assert.equal(value.linuxAvailable,'0');
  const ownedProcesses=await readOriginalNativeSourceLocalOwnedProcessesV1(service);assert.equal(originalNativeSourceCapsuleStatusV1(context().authority).pending,false);
  await send({id,ok:true,value:{before:value,ownedProcesses,orderedCaptureCalled:false,originalCloseCalled:false,intendedExitCode:17}});
  process.exit(17);}
 if(method==='EXIT17_ARM'){exact(payload,['jobId']);const before=await armedPoint(payload.jobId),ownedProcesses=readOriginalNativeSourceLocalOwnedProcessesV1(service);
  assert.equal(before.snapshot.ledger.publicState.backedAmount,'500');assert.equal(before.snapshot.ownerView.balances.available,'0');assert.equal(before.snapshot.linuxSummary.notes.source.status,'UNISSUED');
  await send({id,ok:true,value:{before,ownedProcesses,orderedCaptureCalled:false,originalCloseCalled:false,intendedExitCode:17}});process.exit(17);}
 if(method==='CLOSE'){exact(payload,[]);const ownedProcesses=await readOriginalNativeSourceLocalOwnedProcessesV1(service);closing=true;
  const report=await service.close();assert.equal(report.closed,true);assert.equal(report.originalResourcesStopped,true);
  for(const birth of ownedProcesses)if(birth.pid!==process.pid)assert.equal(nativeProcStatV1(birth.pid),null,'NATIVE_SOURCE_ORIGINAL_CLOSE_PROCESS_PRESENT');closed=true;
  await send({id,ok:true,value:{report,ownedProcesses}});process.disconnect();return;}
 throw Error('NATIVE_SOURCE_FIXED_CHILD_METHOD');}
process.on('message',message=>{if(closing)return;tail=tail.then(()=>dispatch(message)).catch(async error=>{
 try{await send({id:Number.isSafeInteger(message?.id)?message.id:0,ok:false,error:privateNativeEconomicSuccessorFirstErrorV1(error)});}catch{}
 if(message?.method==='START'&&!service){closing=true;process.exitCode=1;if(process.connected)process.disconnect();}
 });});
// Parent disappearance cancels future admission and drains existing real work.
// The intentional EXIT17 branch never reaches this ordered cleanup.
process.on('disconnect',()=>{if(closed)return;closing=true;tail=tail.then(async()=>{await service?.close();closed=true;}).catch(()=>{process.exitCode=1;});});
