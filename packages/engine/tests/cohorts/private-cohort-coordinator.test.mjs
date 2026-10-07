import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPrivateCohortCoordinator,PRIVATE_COHORT_TERMS,PRIVATE_COHORT_MAX_CONSENT_MS,validatePrivateCohortTerms} from '../../src/cohorts/private-cohort-coordinator.mjs';
import {createPrivateCohortStageGate,wrapPrivateCohortOperationHost} from '../../src/cohorts/private-cohort-gate.mjs';

const delay=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const hex=(n,size=64)=>n.toString(16).padStart(size,'0');
const ID=n=>hex(n,32);
async function originalPaymentProgram(host){
 await host.prepare();await host.prepareReserve();await host.authorize();await host.releaseOwner();await host.assertOwnerExited();await host.reserve();
 await host.execute('sol',await host.readiness('sol'));await host.assertOwnerExited();await host.join();
 await host.execute('btc',await host.readiness('btc'));
 const terminal=await host.terminal();await host.permit('sol',terminal);await host.permit('btc',terminal);await host.claim(terminal);await host.verifyCompletion();await host.retireSettledProcesses();
}

function fixture({failAt,holdAt,chooseOrder=stage=>({reservation:[0,1],sol:[1,0],btc:[0,1],settlement:[1,0]})[stage],checkpoint=async()=>{},onOwnerCheckpoint,emitOwnerCheckpoints=false,abortUnblocksHost=false,fatalShutdownTimeoutMs=60_000}={}){
 let time=10_000,mutationActive=false,heavyActive=false,baseClosed=0,hostCount=0,authorityAborts=0;
 const events=[],authorities=[],views=[],hosts=[],held=deferred(),entered=deferred();
 const base={local:'/owned/cohort',identity:{pool:hex(1,40),issuerLifetime:hex(2)},pool:{},clock:1,
  async mutate(label,work){assert.equal(mutationActive,false,'mutations overlap');mutationActive=true;events.push(['lease',label]);try{return await work();}finally{events.push(['release',label]);mutationActive=false;}},
  async heavy(label,work){assert.equal(heavyActive,false,'proof contexts overlap');assert.equal(mutationActive,true,'proof outside mutation lease');heavyActive=true;try{return await work();}finally{heavyActive=false;}},
  audit:async()=>{},close:async()=>{baseClosed++;},
 };
 const dependencies={now:()=>time,chooseOrder,fatalShutdownTimeoutMs,createRuntime:async()=>base,
  createParticipantView:async(shared,{ownerIndex,walletId})=>{const view=Object.create(shared);Object.assign(view,{identity:{...shared.identity,walletId},local:`${shared.local}/${walletId}`,ownerIndex});views.push(view);return view;},
  createAuthority:(options,deps)=>{
   const index=authorities.length,intents=new Map();let shared,host,busy=false,status={walletId:options.walletId,phase:'READY'};
   const authority={status:()=>structuredClone(status),privateStatus:async()=>({walletId:options.walletId,notes:[{privateToOwner:index}],intents:[...intents.values()]}),abort:async()=>{authorityAborts++;if(abortUnblocksHost)held.resolve();},
    async action(action,input){
     if(action==='open'){shared=await deps.createRuntime();return;}
     if(action==='prepareIntent'){intents.set(input.intentId,structuredClone(input));return{intentId:input.intentId,kind:input.kind};}
     if(action==='close'){await shared.close();return;}
     if(action==='reconcile'){events.push([index,'reconcile']);return{state:'QUARANTINED'};}
     assert.equal(busy,false);busy=true;
     try{const intent=intents.get(input.intentId);assert.ok(intent);
      if(intent.kind!=='payment')return await shared.mutate('wallet-'+intent.kind,async()=>{events.push([index,intent.kind]);if(intent.kind==='refund')await host.issueRefund();return{kind:intent.kind};});
      return await shared.mutate('wallet-payment',async()=>{
       if(emitOwnerCheckpoints)await options.onCheckpoint({profile:'PC23_SHARED_LOCAL_V1',walletId:options.walletId,phase:'PREPARING',progressCode:'OWNER_DURABLE_SUBMISSION_BOUNDARY',engineState:'RUNNING',authorityState:'LIVE',activeOperationId:input.operationId,operationCount:1,notesState:'RETAINED',errorCode:null});
       const context={operationId:input.operationId,signal:options.signal,guard:()=>{},beforeNative:async()=>{},beforeEvm:async()=>{},submitSpend:async()=>{},evmConfirmed:()=>{}};
       host=await deps.createOperationHost(context,shared,{opaqueOwnerCustody:index},intent.terms);await originalPaymentProgram(host);status={...status,phase:'SETTLED_IN_POOL'};return status;
      });
     }finally{busy=false;}
    },
   };
   authorities.push(authority);return authority;
  },
  createOperationHost:async(context,shared,custody,terms)=>{
   const index=shared.ownerIndex;hostCount++;
   let exited=false;const token=Object.freeze({owner:index});
   const call=async key=>{
    assert.equal(mutationActive,true,`${key} lacks whole-stage lease`);events.push([index,key]);
    if(holdAt===`${index}:${key}`){entered.resolve();await held.promise;}
    if(failAt===`${index}:${key}`)throw Object.assign(Error('PC24_TEST_FAILURE'),{code:'PC24_TEST_FAILURE'});
    return shared.heavy(key,delay);
   };
   const host={
    prepare:()=>call('prepare'),prepareReserve:()=>call('prepareReserve'),authorize:()=>call('authorize'),
    async releaseOwner(){await call('releaseOwner');exited=true;},async assertOwnerExited(){assert.equal(exited,true);},
    async reserve(){assert.equal(exited,true);await context.submitSpend(token);await call('reserve');},
    async readiness(role){await call('readiness:'+role);return token;},
    async execute(role,value){assert.equal(value,token);assert.equal(exited,true);await context.beforeNative(role);await call('execute:'+role);},
    join:()=>call('join'),async terminal(){await call('terminal');return token;},
    async permit(role,value){assert.equal(value,token);await call('permit:'+role);},
    async claim(value){assert.equal(value,token);await context.beforeEvm('claim');await call('claim');},
    verifyCompletion:()=>call('verifyCompletion'),retireSettledProcesses:()=>call('retireSettledProcesses'),
    async issueRefund(){context.guard();await context.beforeEvm('refund');events.push([index,'original-refund']);},
   };
   hosts[index]=host;return host;
  },
 };
 const controller=createPrivateCohortCoordinator({cohortId:ID(1),onCheckpoint:checkpoint,...(onOwnerCheckpoint?{onOwnerCheckpoint}:{})},dependencies);
 const consent=()=>({terms:structuredClone(PRIVATE_COHORT_TERMS),consentToWait:true,expiresAt:time+60_000});
 return{controller,base,events,authorities,views,hosts,consent,entered,held,hostCount:()=>hostCount,baseClosed:()=>baseClosed,authorityAborts:()=>authorityAborts,setTime:value=>{time=value;}};
}

test('fixed compatible terms and two explicit fresh wait consents precede all reservation work',async()=>{
 const f=fixture();await f.controller.open();assert.equal(f.controller.snapshot().state,'WAITING_FOR_COHORT');
 await assert.rejects(f.controller.start(),/NOT_READY/);assert.equal(f.hostCount(),0);
 const bad=f.consent();bad.consentToWait=false;await assert.rejects(f.controller.owner(0).join(bad),/WAIT_CONSENT/);
 const incompatible=f.consent();incompatible.terms.amountSol='3000001';await assert.rejects(f.controller.owner(0).join(incompatible),/INCOMPATIBLE_TERMS/);
 await f.controller.owner(0).join(f.consent());await assert.rejects(f.controller.start(),/NOT_READY/);assert.equal(f.hostCount(),0);
 await f.controller.owner(1).join(f.consent());assert.equal(f.controller.snapshot().state,'READY_FOR_REVIEW');assert.equal(f.hostCount(),0);
 const accepted=await f.controller.start();assert.equal(accepted.active,true);assert.equal((await f.controller.idle()).state,'SETTLED_IN_POOL');
 await assert.rejects(f.controller.start(),/ALREADY_STARTED/);assert.equal(f.hostCount(),2);
 assert.equal(f.controller.snapshot().privacyEvaluation,'NOT_EVALUATED');assert.equal(f.controller.snapshot().transparentFallback,false);
});

test('independent private stage orders preserve full S, SOL/J, BTC, O barriers and serial proof contexts',async()=>{
 const f=fixture();await f.controller.open();for(const i of [0,1])await f.controller.owner(i).join(f.consent());await f.controller.start();await f.controller.idle();
 const observed=f.events.filter(e=>typeof e[0]==='number'),positions=key=>observed.flatMap((entry,i)=>entry[1]===key?[i]:[]);
 const owners=key=>observed.filter(e=>e[1]===key).map(e=>e[0]);
 assert.deepEqual(owners('reserve'),[0,1]);assert.deepEqual(owners('readiness:sol'),[1,0]);assert.deepEqual(owners('readiness:btc'),[0,1]);assert.deepEqual(owners('terminal'),[1,0]);
 assert.ok(Math.max(...positions('reserve'))<Math.min(...positions('readiness:sol')));
 assert.ok(Math.max(...positions('join'))<Math.min(...positions('readiness:btc')));
 assert.ok(Math.max(...positions('execute:btc'))<Math.min(...positions('terminal')));
 const leases=f.events.filter(e=>typeof e[0]==='string');assert.equal(leases.length,16);
 for(let i=0;i<leases.length;i+=2){assert.equal(leases[i][0],'lease');assert.equal(leases[i+1][0],'release');assert.equal(leases[i][1],leases[i+1][1]);}
});

test('pending consent is bounded and expiry or cancellation creates no S or native dispatch and keeps D accessible',async()=>{
 for(const mode of ['expiry','cancel']){
  const f=fixture();await f.controller.open();const owner=f.controller.owner(0);
  await owner.action('prepareIntent',{intentId:ID(2),kind:'topup',terms:{amount:PRIVATE_COHORT_TERMS.depositWei}});
  await owner.action('execute',{intentId:ID(2),operationId:ID(3)});
  const unbounded=f.consent();unbounded.expiresAt=10_000+PRIVATE_COHORT_MAX_CONSENT_MS+1;await assert.rejects(owner.join(unbounded),/BOUNDED_CONSENT/);
  await owner.join(f.consent());if(mode==='expiry'){f.setTime(70_001);assert.equal(await f.controller.expire(),true);}else await owner.cancel();
  assert.equal(f.controller.snapshot().state,'EXPIRED_NO_DISPATCH');assert.equal(f.hostCount(),0);assert.equal(f.baseClosed(),0);
  assert.deepEqual(f.events.filter(e=>typeof e[0]==='number'),[[0,'topup']]);
  assert.deepEqual((await owner.privateStatus()).notes,[{privateToOwner:0}]);
  await assert.rejects(f.controller.start(),/NOT_READY/);
 }
});

test('owner views expose own custody and own original ids, never the other owner or private stage order',async()=>{
 const f=fixture();await f.controller.open();for(const i of [0,1])await f.controller.owner(i).join(f.consent());await f.controller.start();await f.controller.idle();
 const a=f.controller.owner(0),b=f.controller.owner(1),text=JSON.stringify(a.status());
 assert.notEqual(a.walletId,b.walletId);assert.notEqual(a.status().operationId,b.status().operationId);
 assert.equal(text.includes(b.walletId),false);assert.equal(text.includes(b.status().operationId),false);assert.equal(text.includes('orders'),false);
 assert.deepEqual((await a.privateStatus()).notes,[{privateToOwner:0}]);assert.deepEqual((await b.privateStatus()).notes,[{privateToOwner:1}]);
 await assert.rejects(a.action('prepareIntent',{intentId:ID(4),kind:'payment',terms:PRIVATE_COHORT_TERMS}),/PAYMENT_REQUIRES_COHORT/);
});

test('partial failure stops queued exposure, quarantines, never re-sends, and preserves original refund under surviving lease',async()=>{
 const f=fixture({failAt:'1:execute:sol'});await f.controller.open();for(const i of [0,1])await f.controller.owner(i).join(f.consent());await f.controller.start();
 assert.equal((await f.controller.idle()).state,'QUARANTINED');
 assert.equal(f.controller.snapshot().counts.reservationsConfirmed,2);assert.equal(f.controller.snapshot().counts.btcCompleted,0);assert.equal(f.baseClosed(),0);
 assert.deepEqual(f.events.filter(e=>e[1]==='execute:sol').map(e=>e[0]),[1]);assert.equal(f.events.some(e=>e[1]==='readiness:btc'),false);
 await assert.rejects(f.controller.start(),/ALREADY_STARTED/);const owner=f.controller.owner(0);
 await owner.action('prepareIntent',{intentId:ID(8),kind:'refund',terms:{operationId:owner.status().operationId}});
 await owner.action('execute',{intentId:ID(8),operationId:ID(9)});assert.ok(f.events.some(e=>e[1]==='original-refund'));assert.equal(f.baseClosed(),0);
});

test('cancellation during an in-flight reservation stops every queued later exposure and does not kill keeper',async()=>{
 const f=fixture({holdAt:'0:reserve'});await f.controller.open();for(const i of [0,1])await f.controller.owner(i).join(f.consent());await f.controller.start();await f.entered.promise;
 assert.equal((await f.controller.owner(1).cancel()).state,'CANCELLATION_PENDING');f.held.resolve();
 const result=await f.controller.idle();assert.equal(result.state,'QUARANTINED');assert.equal(f.baseClosed(),0);
 assert.deepEqual(f.events.filter(e=>e[1]==='reserve').map(e=>e[0]),[0]);assert.equal(f.events.some(e=>e[1]==='readiness:sol'),false);
 assert.equal(f.controller.owner(0).status().ownerProgress.reservationAttempted,true);
});

test('nonpayment commands retain original mutation behavior and unknown payment intents cannot bypass enrollment',async()=>{
 const f=fixture();await f.controller.open();const a=f.controller.owner(0),b=f.controller.owner(1);
 await assert.rejects(a.action('prepareIntent',{intentId:ID(4),kind:'payment',terms:PRIVATE_COHORT_TERMS}),/PAYMENT_REQUIRES_COHORT/);
 await assert.rejects(a.action('execute',{intentId:ID(5),operationId:ID(6)}),/ORIGINAL_INTENT/);
 await Promise.all([a.action('prepareIntent',{intentId:ID(7),kind:'topup',terms:{amount:PRIVATE_COHORT_TERMS.depositWei}}),b.action('prepareIntent',{intentId:ID(8),kind:'topup',terms:{amount:PRIVATE_COHORT_TERMS.depositWei}})]);
 await Promise.all([a.action('execute',{intentId:ID(7),operationId:ID(9)}),b.action('execute',{intentId:ID(8),operationId:ID(10)})]);
 assert.deepEqual(f.events,[['lease','wallet-topup'],[0,'topup'],['release','wallet-topup'],['lease','wallet-topup'],[1,'topup'],['release','wallet-topup']]);
});

test('stage gate rejects causal skips and duplicate proof work without interpreting opaque package values',async()=>{
 const gate=createPrivateCohortStageGate({mutate:async(label,work)=>work(),chooseOrder:()=>[0,1]});
 await assert.rejects(gate.enter(0,'btc'),/CAUSAL_ORDER/);
 const wrapped=wrapPrivateCohortOperationHost({readiness:async()=>{},assertOwnerExited:async()=>{}},{gate,ownerIndex:0});
 await assert.rejects(wrapped.readiness('evil'),/HOST_OPERATION/);
 assert.throws(()=>validatePrivateCohortTerms({...PRIVATE_COHORT_TERMS,witness:'forbidden'}),/FIXED_TERMS/);
});

test('checkpoint failure before reservation prevents all proof work and fails closed without disposing balances',async()=>{
 let fail=false;const f=fixture({checkpoint:async value=>{if(fail&&value.state==='PREPARING_RESERVATIONS')throw Error('storage unavailable');}});
 await f.controller.open();for(const i of [0,1])await f.controller.owner(i).join(f.consent());fail=true;
 await f.controller.start();await assert.rejects(f.controller.idle(),/CHECKPOINT_FAILED/);
 assert.equal(f.controller.snapshot().state,'QUARANTINED');assert.equal(f.controller.snapshot().errorCode,'PC24_CHECKPOINT_FAILED');assert.equal(f.baseClosed(),0);
 assert.equal(f.events.some(e=>e[1]==='prepare'),false);assert.equal(f.events.some(e=>e[1]==='reserve'),false);
});

test('six explicit original-note exits use owner authorities, remain serial and do not create another payment',async()=>{
 const f=fixture();await f.controller.open();for(const i of [0,1])await f.controller.owner(i).join(f.consent());await f.controller.start();await f.controller.idle();
 let next=30;
 for(const index of [0,1]){
  const owner=f.controller.owner(index),operationId=owner.status().operationId;
  for(const terms of [{noteId:hex(index+1)},{operationId,role:'sol'},{operationId,role:'btc'}]){
   const intentId=ID(next++);await owner.action('prepareIntent',{intentId,kind:'exit',terms});await owner.action('execute',{intentId,operationId:ID(next++)});
  }
 }
 assert.equal(f.events.filter(e=>e[1]==='exit').length,6);assert.equal(f.hostCount(),2);assert.equal(f.baseClosed(),0);
 await f.controller.close();assert.equal(f.baseClosed(),1);assert.equal(f.controller.snapshot().state,'CLOSED');
});

test('participant wrapper preserves live shared clock and does not weaken other mutation labels',async()=>{
 const f=fixture();await f.controller.open();f.base.clock=314;assert.equal(f.views[0].clock,314);assert.equal(f.views[1].clock,314);
 await f.controller.owner(0).action('prepareIntent',{intentId:ID(60),kind:'topup',terms:{amount:PRIVATE_COHORT_TERMS.depositWei}});
 await f.controller.owner(0).action('execute',{intentId:ID(60),operationId:ID(61)});
 assert.equal(f.events[0][1],'wallet-topup');
});

test('owner-only durable checkpoint ACK is awaited before original payment dispatch',async()=>{
 const release=deferred(),entered=deferred(),observed=[];
 const f=fixture({emitOwnerCheckpoints:true,onOwnerCheckpoint:async(index,summary)=>{observed.push({index,summary});entered.resolve();await release.promise;}});
 await f.controller.open();for(const i of [0,1])await f.controller.owner(i).join(f.consent());await f.controller.start();await entered.promise;
 assert.equal(f.events.some(e=>e[1]==='reserve'),false);assert.equal(f.hostCount(),0);
 for(const item of observed){assert.equal(item.summary.walletId,f.controller.owner(item.index).walletId);assert.equal('terms'in item.summary,false);assert.equal('notes'in item.summary,false);}
 release.resolve();assert.equal((await f.controller.idle()).state,'SETTLED_IN_POOL');assert.equal(observed.length,2);
});

test('explicit fatal shutdown aborts original hosts before waiting for a pending proof',async()=>{
 const f=fixture({holdAt:'0:prepare',abortUnblocksHost:true});await f.controller.open();for(const i of [0,1])await f.controller.owner(i).join(f.consent());await f.controller.start();await f.entered.promise;
 const result=await f.controller.abort();assert.equal(result.state,'QUARANTINED');assert.equal(result.errorCode,'PC24_AUTHORITY_UNAVAILABLE');assert.equal(f.authorityAborts(),2);assert.equal(f.baseClosed(),1);
 assert.equal(f.events.some(e=>e[1]==='reserve'),false);assert.deepEqual(await f.controller.abort(),result);assert.equal(f.authorityAborts(),2);
});

test('fatal shutdown deadline bounds a nonresponsive original host and never reports successful close',async()=>{
 const f=fixture({holdAt:'0:prepare',fatalShutdownTimeoutMs:20});await f.controller.open();for(const i of [0,1])await f.controller.owner(i).join(f.consent());await f.controller.start();await f.entered.promise;
 const result=await f.controller.abort();assert.equal(result.state,'QUARANTINED');assert.equal(result.errorCode,'PC24_FATAL_CLEANUP_TIMEOUT');assert.equal(f.authorityAborts(),2);assert.equal(f.baseClosed(),1);
 f.held.resolve();await f.controller.idle();assert.equal(f.events.some(e=>e[1]==='reserve'),false);
});

test('a stalled durable checkpoint sink cannot make explicit fatal shutdown unbounded',async()=>{
 const entered=deferred(),release=deferred();let blocked=false;
 const f=fixture({fatalShutdownTimeoutMs:20,checkpoint:async value=>{if(value.state==='PREPARING_RESERVATIONS'&&!blocked){blocked=true;entered.resolve();await release.promise;}}});
 await f.controller.open();for(const i of [0,1])await f.controller.owner(i).join(f.consent());await f.controller.start();await entered.promise;
 const result=await f.controller.abort();assert.equal(result.errorCode,'PC24_FATAL_CLEANUP_TIMEOUT');assert.equal(result.state,'QUARANTINED');assert.equal(f.authorityAborts(),2);
 release.resolve();await f.controller.idle();assert.equal(f.events.some(e=>e[1]==='prepare'),false);
});

test('actual wallet authorities create separate encrypted balance and intent vaults on one fake shared runtime',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'pc24-owner-custody-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let baseClosed=0;const scope=hex(1),policy=hex(2),pool=hex(3,40);
 const identity={walletId:ID(1),pool,scope,policy,chainId:'31337',evmGenesis:hex(4),bitcoinGenesis:hex(5),solanaGenesis:hex(6),issuerLifetime:hex(7),deploymentHash:hex(8),verifierSetHash:hex(9)};
 const base={identity,local:directory,pool:{},mutate:async(label,work)=>work(),close:async()=>{baseClosed++;}};
 const locals=[];
 const controller=createPrivateCohortCoordinator({cohortId:ID(1),onOwnerCheckpoint:async()=>{}},{createRuntime:async()=>base,createParticipantView:async(shared,{walletId})=>{
  const local=join(directory,'owners',walletId);await mkdir(local,{recursive:true,mode:0o700});locals.push(local);return{...shared,identity:{...identity,walletId},local};
 }});
 await controller.open();assert.notEqual(locals[0],locals[1]);
 for(const name of ['balance.vault','intents.vault']){
  const [a,b]=await Promise.all(locals.map(local=>readFile(join(local,name),'utf8')));assert.notEqual(a,b);
  for(const encoded of [a,b]){assert.equal(encoded.includes('synthetic-'),false);assert.equal(encoded.includes('privateKey'),false);assert.equal(encoded.includes('"intents"'),false);}
 }
 await controller.abort();assert.equal(baseClosed,1);assert.equal(controller.snapshot().state,'QUARANTINED');
});
