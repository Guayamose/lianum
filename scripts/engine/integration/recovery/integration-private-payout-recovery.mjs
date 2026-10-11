/** One actual fixed-profile API payment with a test-only coordinating-worker
 * SIGKILL after the successful claim and before withdrawal. Production host,
 * nodes, proofs, custody and API transport; no simulated chain/receipt/proof. */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { startLocalServer } from '../../../../packages/backend/src/api/private-runtime-server.mjs';
import { projectRoot } from '../../../../packages/engine/src/chains/shared/runtime-harness.mjs';
assert.ok(process.argv.includes('--authorized-local-private-payout-recovery'),'PRIVATE_CLIENT_EXPLICIT_LOCAL_AUTHORIZATION');
const runId=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
const local=join(projectRoot,'.local','private-wallet-recovery-'+runId),evidence=join(projectRoot,'evidence','m20-private-recovery-'+runId+'.json');
await mkdir(local,{recursive:true,mode:0o700});
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={classification:'IN_PROGRESS_ACTUAL_PRIVATE_WALLET_PAYOUT_WORKER_RECOVERY',runId,realFunds:false,publicNetwork:false,fullAcceptance:false,visualBrowserQAPerformed:false,apiUsesProductionEngine:true,testOnlyCrashInjection:'COORDINATOR_SIGKILL_AFTER_ACTUAL_CLAIM_BEFORE_WITHDRAWAL',keeperRestartClaimed:false,nodeRestartClaimed:false,hostileOSCustodyClaimed:false,sourceHashes:{},stages:[]};
for(const path of ['scripts/integration-private-payout-recovery.mjs','scripts/fixtures/private-payment-recovery-worker.mjs','src/private-payment-keeper.mjs','src/private-payment-coordinator.mjs','src/private-payout-recovery.mjs','src/server.mjs','src/private-payment-session.mjs','src/private-operation-store.mjs','src/private-payment-engine.mjs','src/private-payment-worker.mjs','src/private-assembly-actors.mjs','client/index.html','client/private.mjs','client/private-outcome.mjs','client/style.css'])report.sourceHashes[path]=sha(await readFile(join(projectRoot,path)));
const save=()=>writeFile(evidence,JSON.stringify(report,null,2)+'\n');
const pause=ms=>new Promise(r=>setTimeout(r,ms));let app,restarted,operationId,headers,keeperForks=0;
async function connect(instance){const page=await fetch(instance.origin);assert.equal(page.status,200);const html=await page.text();assert.ok(html.includes('/private.mjs'));const token=html.match(/name="local-token" content="([0-9a-f]+)"/)?.[1];assert.ok(token);return {'X-Local-Token':token,'Content-Type':'application/json',Origin:instance.origin};}
async function post(body){const r=await fetch(app.origin+'/api/private/action',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,202,'PRIVATE_CLIENT_ACCEPTANCE');return r;}
try{
 report.phase='starting-wallet-api';await save();
 app=await startLocalServer({port:0,directory:join(local,'client-first'),privateDirectory:join(local,'wallet'),privateSessionOptions:{spawnWorker:()=>{keeperForks++;return fork(join(projectRoot,'scripts/fixtures/private-payment-recovery-worker.mjs'),[],{cwd:projectRoot,execArgv:[],stdio:['ignore','pipe','pipe','ipc'],serialization:'json',env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'}});}}});headers=await connect(app);
 for(const path of ['/private.mjs','/private-outcome.mjs'])assert.equal((await fetch(app.origin+path)).status,200);
 report.phase='preparing-fixed-private-payment';await save();
 const prepared=await(await post({action:'prepare',requestId:randomUUID(),profile:'PC18_EXACT_LOCAL_V1'})).json();operationId=prepared.operation.id;report.operationId=operationId;assert.equal(prepared.operation.phase,'PREPARED');
 const start={action:'start',requestId:randomUUID(),operationId};const accepted=await post(start);await accepted.body.cancel();report.acceptanceResponseDiscarded=true;
 const repeated=await(await post(start)).json();assert.equal(repeated.operation.id,operationId);assert.equal(repeated.replayed,true);report.sameRequestReplayedWithoutNewOperation=true;
 let last='',recoveryRequested=false;
 for(;;){
  const response=await fetch(app.origin+'/api/private/operations/'+operationId,{headers});assert.equal(response.status,200);const {operation}=await response.json();assert.equal(operation.id,operationId);
  const key=[operation.phase,operation.progressCode,operation.ownerState,operation.settlementState,operation.cleanupState].join('|');
  if(key!==last){last=key;report.phase=operation.phase;report.stages.push({at:new Date().toISOString(),phase:operation.phase,progressCode:operation.progressCode,ownerState:operation.ownerState,settlementState:operation.settlementState,cleanupState:operation.cleanupState});await save();console.log(JSON.stringify(report.stages.at(-1)));}
  // Evaluate a repeated recovery result before accepting a first recovery,
  // never against the stale pre-request snapshot after mutating the flag.
  if(operation.phase==='RECOVERABLE'&&operation.allowedActions.includes('recover')&&recoveryRequested){report.terminalOperation=operation;throw Error('PRIVATE_RECOVERY_ATTEMPT_NOT_COMPLETED');}
  if(operation.phase==='RECOVERABLE'&&operation.allowedActions.includes('recover')&&!recoveryRequested){
   assert.equal(operation.recoveryState,'AVAILABLE');assert.equal(operation.cleanupState,'RETAINED');assert.equal(operation.settlementState,'PAYOUT_NOTES_ISSUED');assert.equal(operation.ownerState,'EXIT_CONFIRMED');assert.equal(operation.engineState,'STOPPED');assert.deepEqual(operation.allowedActions,['recover']);
   for(const role of ['sol','btc']){assert.equal(operation.payouts[role].state,'ISSUED');assert.equal(operation.exposure[role],'OBSERVED');}
   report.retainedAfterActualClaim=operation;await save();headers=await connect(app);
   const request={action:'recover',requestId:randomUUID(),operationId};const accepted=await post(request);await accepted.body.cancel();report.recoveryAcceptanceResponseDiscarded=true;
   const replay=await(await post(request)).json();assert.equal(replay.replayed,true);assert.equal(replay.operation.id,operationId);assert.equal(replay.operation.lastRecoveryRequestId,request.requestId);report.recoverySameRequestDeduplicated=true;recoveryRequested=true;await save();
  }
  if(['COMPLETED','FAILED','INTERRUPTED'].includes(operation.phase)&&operation.engineState!=='RUNNING') {report.terminalOperation=operation;break;}
  await pause(15000);
 }
 await app.privatePayment.idle();
 const final=(await(await fetch(app.origin+'/api/private',{headers})).json());if(final.operations[0]?.phase!=='COMPLETED')throw new Error(final.operations[0]?.errorCode??'PRIVATE_CLIENT_PAYMENT_NOT_COMPLETED');assert.equal(final.operations.length,1);assert.equal(final.operations[0].phase,'COMPLETED');assert.equal(final.operations[0].errorCode,null);assert.equal(final.operations[0].cleanupState,'COMPLETED');assert.equal(final.operations[0].ownerState,'EXIT_CONFIRMED');assert.equal(final.operations[0].settlementState,'PAYOUT_NOTES_ISSUED');assert.equal(final.activeOperationId,null);assert.equal(final.busy,false);
 for(const role of ['sol','btc']){assert.equal(final.operations[0].payouts[role].state,'WITHDRAWN');assert.equal(final.operations[0].payouts[role].amountWei,'500000000000000');assert.equal(final.operations[0].exposure[role],'OBSERVED');}
 assert.equal(recoveryRequested,true);assert.equal(keeperForks,1);assert.equal(final.operations[0].recoveryState,'COMPLETED');report.sameOriginalKeeperRetained=true;report.payoutWorkerRestartClaimed=true;report.terminalOperation=final.operations[0];await app.close();app=null;
 report.phase='restoring-retained-history';await save();
 restarted=await startLocalServer({port:0,directory:join(local,'client-restarted'),privateDirectory:join(local,'wallet')});const restoredHeaders=await connect(restarted);const history=await(await fetch(restarted.origin+'/api/private',{headers:restoredHeaders})).json();assert.equal(history.operations.length,1);assert.equal(history.operations[0].id,operationId);assert.equal(history.operations[0].phase,'COMPLETED');assert.equal(history.operations[0].observation,'RETAINED_HISTORY');assert.equal(history.busy,false);report.historyRestoredAfterCleanServerRestart=true;report.executionRestartClaimed=false;await restarted.close();restarted=null;
 const privateAudit=join(projectRoot,'.local','private-payments',operationId,'native-audit');const records=[];for(const name of await readdir(privateAudit))records.push(JSON.parse(await readFile(join(privateAudit,name))));
 const signed=records.filter(r=>r.kind==='signed-native-dispatch');assert.equal(signed.length,2);for(const role of ['sol','btc'])assert.equal(signed.filter(r=>r.role===role).length,1);const certificates=records.filter(r=>r.kind==='native-certificate');for(const chain of ['SOL','BTC']){const own=certificates.filter(r=>r.envelope.certificate.chainDomain.chain===chain);assert.ok(own.length>=1);assert.equal(new Set(own.map(r=>JSON.stringify(r.envelope.certificate.canonicalEffect))).size,1);}for(const label of ['recursive terminal and fresh permits issue payouts','sol exact recipient withdrawal','btc exact recipient withdrawal'])assert.equal(records.filter(r=>r.kind==='PRIVATE_EVM_TRANSACTION_RECEIPT_HEADER'&&r.label===label&&r.receipt.status==='0x1').length,1);
 const life=records.filter(r=>r.kind==='private-payment-coordinator-lifecycle'),starts=life.filter(r=>r.event==='STARTED'),exits=life.filter(r=>r.event==='EXITED');
 assert.equal(starts.length,2);assert.equal(exits.length,2);assert.deepEqual(starts.map(r=>r.mode),['payment','recovery']);assert.notEqual(starts[0].generation,starts[1].generation);assert.notEqual(starts[0].coordinatorPid,starts[1].coordinatorPid);assert.equal(starts[0].keeperPid,starts[1].keeperPid);
 const failed=exits.find(r=>r.mode==='payment'),recovered=exits.find(r=>r.mode==='recovery');assert.equal(failed.generation,starts[0].generation);assert.equal(failed.signal,'SIGKILL');assert.equal(failed.complete,false);assert.equal(recovered.generation,starts[1].generation);assert.equal(recovered.code,0);assert.equal(recovered.complete,true);
 for(const key of ['pool','scope','policy','evmGenesis','bitcoinGenesis','solanaGenesis']){assert.ok(starts[0][key]);assert.ok(life.every(r=>r[key]===starts[0][key]));}
 const authorities=records.filter(r=>r.kind==='private-same-authority-recovery');assert.equal(authorities.length,1);assert.equal(authorities[0].pool,starts[0].pool);assert.equal(authorities[0].owner.closed,true);assert.equal(authorities[0].owner.writesAfterExit,0);for(const role of ['sol','btc'])assert.equal(authorities[0].states[role].state,'READY');
 report.coordinatorRestart={oldWorkerKilledAfterClaim:true,replacementWorkerDifferent:true,sameKeeperAndPoolVerified:true,paymentGenerations:1,recoveryGenerations:1};
 assert.equal(records.filter(r=>r.kind==='private-payment-completion').length,1);assert.ok(records.some(r=>r.kind==='private-owned-cleanup'&&r.completed));
 report.nativeDispatches=2;report.distinctNativeEffects=2;report.freshCertificateCount=certificates.length;report.privateAuditExcluded=true;report.resourceStageSamples=records.filter(r=>r.kind==='private-numeric-resource-sample').map(r=>Object.fromEntries(['stage','availableRAM','freeDisk','controllerRSS','controllerExternal','controllerArrayBuffers','producerRSS'].filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]])));
 for(const [path,h]of Object.entries(report.sourceHashes))assert.equal(sha(await readFile(join(projectRoot,path))),h,'PRIVATE_CLIENT_SOURCE_CHANGED_DURING_RUN');report.sourcesUnchanged=true;
 report.phase='completed';report.classification='ACTUAL_PRIVATE_WALLET_PAYOUT_RECOVERY_AFTER_CLAIM_WORKER_CRASH_SAME_LIVE_AUTHORITY';report.finishedAt=new Date().toISOString();
}catch(error){report.failedPhase=report.phase;report.phase='failed';report.classification='FAILED_ACTUAL_PRIVATE_WALLET_PAYOUT_RECOVERY';report.failureCode=/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'PRIVATE_CLIENT_ASSERTION_OR_OPERATION_FAILED';process.exitCode=1;}
finally{await app?.close().catch(()=>{report.cleanupWarning=true;});await restarted?.close().catch(()=>{report.cleanupWarning=true;});await save();}
console.log(JSON.stringify({phase:report.phase,evidence,classification:report.classification}));
