/** HTTP integration with a fake engine only; genuine execution is separate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startLocalServer } from '../../../backend/src/api/private-runtime-server.mjs';
const base={phase:'PREPARING',progressCode:'PREPARING',engineState:'RUNNING',ownerState:'PREPARING',settlementState:'NOT_FUNDED',exposure:{evm:'NONE',sol:'NONE',btc:'NONE'},payouts:{sol:{state:'PENDING',amountWei:null},btc:{state:'PENDING',amountWei:null}},cleanupState:'NOT_STARTED',errorCode:null,observation:'LIVE'};
class Engine extends EventEmitter{
 constructor(){super();this.connected=true;this.stdout=new PassThrough();this.stderr=new PassThrough();this.acks=[];}
 send(m,cb){cb?.(null);if(m.type==='start'){this.start=m;queueMicrotask(()=>this.emit('message',{type:'checkpoint',sequence:1,payload:base}));}else this.acks.push(m.sequence);}
 finish(){this.emit('message',{type:'result',summary:{...base,phase:'COMPLETED',progressCode:'PAYMENT_COMPLETED',engineState:'STOPPED',ownerState:'EXIT_CONFIRMED',settlementState:'PAYOUT_NOTES_ISSUED',exposure:{evm:'OBSERVED',sol:'OBSERVED',btc:'OBSERVED'},payouts:{sol:{state:'WITHDRAWN',amountWei:'500000000000000'},btc:{state:'WITHDRAWN',amountWei:'500000000000000'}},cleanupState:'COMPLETED',observation:'RETAINED_HISTORY'}});queueMicrotask(()=>{this.connected=false;this.emit('close',0,null);});}
 disconnect(){this.connected=false;queueMicrotask(()=>this.emit('close',1,null));}kill(){this.disconnect();}
}
async function connection(app){const html=await(await fetch(app.origin)).text(),token=html.match(/name="local-token" content="([0-9a-f]+)"/)?.[1];assert.ok(token);return {headers:{'X-Local-Token':token,'Content-Type':'application/json',Origin:app.origin},html};}

test('private wallet HTTP prepare/start is authenticated, idempotent and reload-safe with durable terminal history',async()=>{
 const root=await mkdtemp(join(tmpdir(),'private-api-'));const workers=[];let app,again;
 const opts={preflight:async()=>({ready:true}),spawnWorker:()=>{const w=new Engine();workers.push(w);return w;}};
 try{
  app=await startLocalServer({port:0,directory:join(root,'client-a'),privateDirectory:join(root,'wallet'),privateSessionOptions:opts});const {headers,html}=await connection(app);assert.match(html,/private\.mjs/);
  for(const asset of ['/private.mjs','/private-outcome.mjs'])assert.equal((await fetch(app.origin+asset)).status,200);
  assert.equal((await fetch(app.origin+'/api/private')).status,403);
  const post=body=>fetch(app.origin+'/api/private/action',{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await fetch(app.origin+'/api/private/action',{method:'POST',headers:{...headers,Origin:'https://attacker.invalid'},body:'{}'})).status,403);
  assert.equal((await post({action:'prepare',requestId:randomUUID(),profile:'PC18_EXACT_LOCAL_V1',endpoint:'https://attacker.invalid'})).status,400);
  const request={action:'prepare',requestId:randomUUID(),profile:'PC18_EXACT_LOCAL_V1'};const p=await post(request);assert.equal(p.status,202);const prepared=await p.json();assert.equal(workers.length,0);
  const repeated=await(await post(request)).json();assert.equal(repeated.operation.id,prepared.operation.id);assert.equal(repeated.replayed,true);
  const conflicting=await post({action:'start',requestId:request.requestId,operationId:prepared.operation.id});assert.equal(conflicting.status,409);
  const start={action:'start',requestId:randomUUID(),operationId:prepared.operation.id};const responses=await Promise.all([post(start),post(start)]);assert.ok(responses.every(r=>r.status===202));await Promise.all(responses.map(r=>r.body.cancel())); // Client discards both acceptance bodies.
  const lookup=await(await fetch(app.origin+'/api/private/operations/'+prepared.operation.id,{headers})).json();assert.equal(lookup.operation.id,prepared.operation.id);assert.equal(workers.length,1);
  const fresh=await connection(app);const state=await(await fetch(app.origin+'/api/private',{headers:fresh.headers})).json();assert.equal(state.activeOperationId,prepared.operation.id);assert.equal(state.capabilities.executionRestart,false);assert.ok(!JSON.stringify(state).includes('privateKey'));
  const anotherKey=await(await post({...start,requestId:randomUUID()})).json();assert.equal(anotherKey.replayed,true);assert.equal(workers.length,1);
  await new Promise(r=>setTimeout(r,20));workers[0].finish();await app.privatePayment.idle();const final=await(await fetch(app.origin+'/api/private',{headers})).json();assert.equal(final.operations[0].phase,'COMPLETED');assert.equal(final.operations[0].payouts.sol.amountWei,'500000000000000');assert.equal(final.activeOperationId,null);
  await app.close();app=null;
  again=await startLocalServer({port:0,directory:join(root,'client-b'),privateDirectory:join(root,'wallet'),privateSessionOptions:opts});const restarted=await connection(again);const history=await(await fetch(again.origin+'/api/private',{headers:restarted.headers})).json();assert.equal(history.operations[0].id,prepared.operation.id);assert.equal(history.operations[0].observation,'RETAINED_HISTORY');assert.equal(workers.length,1);
  assert.equal((await fetch(again.origin+'/api/private/operations/'+'0'.repeat(32),{headers:restarted.headers})).status,404);
 }finally{for(const w of workers)if(w.connected)w.disconnect();await app?.close();await again?.close();await rm(root,{recursive:true,force:true});}
});

test('one admission queue excludes transparent starts during private durable acceptance',async()=>{
 const root=await mkdtemp(join(tmpdir(),'private-admission-'));const {PrivateOperationStore}=await import('../../src/payments/private-operation-store.mjs');const real=new PrivateOperationStore(join(root,'wallet'));let release,enteredResolve,gate=false,worker,nativeStarts=0;const blocked=new Promise(r=>{release=r;}),entered=new Promise(r=>{enteredResolve=r;});
 const store={initialize:()=>real.initialize(),read:()=>real.read(),update:async(v,t)=>{const next=t(await real.read());if(gate){gate=false;enteredResolve();await blocked;}return real.update(v,()=>next);}};
 let app;
 try{app=await startLocalServer({port:0,directory:join(root,'client'),privateDirectory:join(root,'wallet'),privateSessionOptions:{store,preflight:async()=>{},spawnWorker:()=>worker=new Engine()}});const {headers}=await connection(app);app.native.submit=()=>{nativeStarts++;return {status:'HOST_MOCK_ONLY'};};
 const post=(path,body)=>fetch(app.origin+path,{method:'POST',headers,body:JSON.stringify(body)});const prepared=await(await post('/api/private/action',{action:'prepare',requestId:randomUUID(),profile:'PC18_EXACT_LOCAL_V1'})).json();gate=true;const starting=post('/api/private/action',{action:'start',requestId:randomUUID(),operationId:prepared.operation.id});await entered;const transparent=post('/api/native/action',{action:'prepare'});await new Promise(r=>setTimeout(r,30));assert.equal(nativeStarts,0);release();assert.equal((await starting).status,202);assert.equal((await transparent).status,409);assert.equal(nativeStarts,0);worker.finish();await app.privatePayment.idle();}
 finally{release?.();if(worker?.connected)worker.disconnect();await app?.close();await rm(root,{recursive:true,force:true});}
});

test('uncertain journal acceptance returns503 so a client retains its request identity',async()=>{
 const root=await mkdtemp(join(tmpdir(),'private-http-uncertain-'));const {PrivateOperationStore}=await import('../../src/payments/private-operation-store.mjs');const real=new PrivateOperationStore(join(root,'wallet'));let uncertain=false,spawns=0;const store={initialize:()=>real.initialize(),read:()=>real.read(),update:async(v,t)=>{const record=await real.update(v,t);if(uncertain){uncertain=false;throw Object.assign(Error('uncertain'),{code:'PRIVATE_STORE_WRITE_UNCERTAIN'});}return record;}};let app;
 try{app=await startLocalServer({port:0,directory:join(root,'client'),privateDirectory:join(root,'wallet'),privateSessionOptions:{store,preflight:async()=>{},spawnWorker:()=>{spawns++;return new Engine();}}});const {headers}=await connection(app);const post=body=>fetch(app.origin+'/api/private/action',{method:'POST',headers,body:JSON.stringify(body)});const prepared=await(await post({action:'prepare',requestId:randomUUID(),profile:'PC18_EXACT_LOCAL_V1'})).json();uncertain=true;const response=await post({action:'start',requestId:randomUUID(),operationId:prepared.operation.id});assert.equal(response.status,503);assert.equal((await response.json()).error,'PRIVATE_STORE_WRITE_UNCERTAIN');assert.equal(spawns,0);}
 finally{await app?.close();await rm(root,{recursive:true,force:true});}
});

test('HTTP recovery targets retained same operation with exact request dedupe and no new keeper',async()=>{
 const root=await mkdtemp(join(tmpdir(),'private-recovery-api-'));let app,worker;const sent=[];
 try{app=await startLocalServer({port:0,directory:join(root,'client'),privateDirectory:join(root,'wallet'),privateSessionOptions:{preflight:async()=>{},spawnWorker:()=>{worker=new Engine();const send=worker.send.bind(worker);worker.send=(m,cb)=>{sent.push(m);send(m,cb);};return worker;}}});const {headers}=await connection(app);const post=body=>fetch(app.origin+'/api/private/action',{method:'POST',headers,body:JSON.stringify(body)});const prepared=await(await post({action:'prepare',requestId:randomUUID(),profile:'PC18_EXACT_LOCAL_V1'})).json();const operationId=prepared.operation.id;await(await post({action:'start',requestId:randomUUID(),operationId})).body.cancel();await new Promise(r=>setTimeout(r,25));
 worker.emit('message',{type:'result',summary:{...base,phase:'RECOVERABLE',progressCode:'PAYOUT_RECOVERY_AVAILABLE',engineState:'STOPPED',ownerState:'EXIT_CONFIRMED',settlementState:'PAYOUT_NOTES_ISSUED',exposure:{evm:'OBSERVED',sol:'OBSERVED',btc:'OBSERVED'},payouts:{sol:{state:'ISSUED',amountWei:'500000000000000'},btc:{state:'ISSUED',amountWei:'500000000000000'}},recoveryState:'AVAILABLE',cleanupState:'RETAINED'}});await new Promise(r=>setTimeout(r,25));
 const snapshot=await(await fetch(app.origin+'/api/private',{headers})).json();assert.equal(snapshot.capabilities.payoutWorkerRestart,true);assert.deepEqual(snapshot.operations[0].allowedActions,['recover']);assert.equal(snapshot.busy,true);assert.equal((await post({action:'recover',requestId:randomUUID(),operationId,endpoint:'http://attacker.invalid'})).status,400);
 const request={action:'recover',requestId:randomUUID(),operationId};const response=await post(request);assert.equal(response.status,202);await response.body.cancel();const repeated=await(await post(request)).json();assert.equal(repeated.replayed,true);assert.equal(repeated.operation.lastRecoveryRequestId,request.requestId);assert.equal(sent.filter(m=>m.type==='recover').length,1);assert.equal(sent.filter(m=>m.type==='start').length,1);worker.finish();await app.privatePayment.idle();
 }finally{if(worker?.connected)worker.disconnect();await app?.close();await rm(root,{recursive:true,force:true});}
});

test('HTTP owner refund keeps withdrawal outcome separate and deduplicates both manual actions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'private-owner-refund-api-'));let app,worker;const sent=[];const ownerRefund=state=>({state,amountWei:'1000000000000000',claimEpoch:'3000000',eligibleAt:'2027-01-15T08:00:00.000Z'});const retained=state=>({...base,phase:'REFUNDABLE',progressCode:'OWNER_REFUND_RETAINED',engineState:'STOPPED',ownerState:'EXIT_CONFIRMED',settlementState:state==='NOTE_ISSUED'?'RECOVERY_NOTE_ISSUED':'FUNDED',exposure:{evm:'OBSERVED',sol:'OBSERVED',btc:'NONE'},ownerRefund:ownerRefund(state),cleanupState:'RETAINED'});
 try{app=await startLocalServer({port:0,directory:join(root,'client'),privateDirectory:join(root,'wallet'),privateSessionOptions:{preflight:async()=>{},spawnWorker:()=>{worker=new Engine();const send=worker.send.bind(worker);worker.send=(m,cb)=>{sent.push(m);send(m,cb);};return worker;}}});const {headers}=await connection(app),post=body=>fetch(app.origin+'/api/private/action',{method:'POST',headers,body:JSON.stringify(body)});const {operation}=await(await post({action:'prepare',requestId:randomUUID(),profile:'PC18_EXACT_LOCAL_V1'})).json();await(await post({action:'start',requestId:randomUUID(),operationId:operation.id})).body.cancel();await new Promise(r=>setTimeout(r,25));worker.emit('message',{type:'result',summary:retained('WAITING')});await new Promise(r=>setTimeout(r,25));
 for(const action of ['refund','recoverRefund']){const request={action,requestId:randomUUID(),operationId:operation.id};assert.equal((await post({...request,recipient:'0'.repeat(40)})).status,400);const accepted=await post(request);assert.equal(accepted.status,202);await accepted.body.cancel();const replay=await(await post(request)).json();assert.equal(replay.replayed,true);assert.equal(replay.operation.lastOwnerRefundRequestId,request.requestId);assert.equal(sent.filter(m=>m.type===action).length,1);if(action==='refund'){worker.emit('message',{type:'result',summary:retained('NOTE_ISSUED')});await new Promise(r=>setTimeout(r,25));}}
 worker.emit('message',{type:'result',summary:{...retained('WITHDRAWN'),phase:'REFUNDED',progressCode:'OWNER_REFUND_COMPLETED',ownerRefund:ownerRefund('WITHDRAWN'),settlementState:'RECOVERY_NOTE_ISSUED',cleanupState:'COMPLETED',observation:'RETAINED_HISTORY'}});queueMicrotask(()=>{worker.connected=false;worker.emit('close',0,null);});await app.privatePayment.idle();const state=await(await fetch(app.origin+'/api/private',{headers})).json();assert.equal(state.capabilities.recoveryWithdrawal,true);assert.equal(state.operations[0].phase,'REFUNDED');assert.equal(state.operations[0].ownerRefund.state,'WITHDRAWN');assert.equal(state.operations[0].payouts.sol.state,'PENDING');assert.equal(state.operations[0].exposure.sol,'OBSERVED');assert.equal(state.busy,false);
 }finally{if(worker?.connected)worker.disconnect();await app?.close();await rm(root,{recursive:true,force:true});}
});
