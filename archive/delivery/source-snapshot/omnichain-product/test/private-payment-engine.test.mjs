import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runPrivatePayment, runPrivatePaymentWithHostForTest, PRIVATE_PAYMENT_PROFILE, PRIVATE_PAYMENT_AMOUNTS, sanitizePrivatePaymentSummary, retainLocalProofAndRetireProducer, verifyPrivatePaymentFileIntegrity, assertOriginalRefundProofBinding, startRecipient, stopOwnedChild } from '../src/private-payment-engine.mjs';
import { createPrivatePaymentWorkerHost } from '../src/private-payment-worker.mjs';
import { assemblyEvmProof } from '../src/private-assembly-native-dispatch.mjs';
import { noteHashToWords } from '../src/private-note-tree.mjs';
import { origin } from '../src/private-note-encoding.mjs';
import { attachAssemblyControl } from '../src/private-assembly-actors.mjs';

const operationId='a'.repeat(32);
const opts=onCheckpoint=>({operationId,profile:PRIVATE_PAYMENT_PROFILE,onCheckpoint});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const base=()=>({phase:'PREPARING',progressCode:'PREPARING',engineState:'RUNNING',ownerState:'PREPARING',settlementState:'NOT_FUNDED',exposure:{evm:'NONE',sol:'NONE',btc:'NONE'},payouts:{sol:{state:'PENDING',amountWei:null},btc:{state:'PENDING',amountWei:null}},cleanupState:'NOT_STARTED',observation:'LIVE'});
function fixture({failAt,cleanupFail=false}={}) {
  const events=[];let ownerExited=false;
  const factory=async c=>{
    const hit=name=>{events.push(name);if(failAt===name)throw Error('PRIVATE_PAYMENT_TEST_FAILURE');};
    const send=async name=>{await c.beforeEvm(name);hit(name+'-send');c.evmConfirmed(name);};
    return {
      async prepare(){hit('prepare');}, async prepareReserve(){hit('prepare-reserve');}, async reserve(){await send('reserve');}, async authorize(){hit('authorize');},
      async releaseOwner(){hit('owner-exit');ownerExited=true;}, async assertOwnerExited(){assert.ok(ownerExited);},
      async readiness(role){hit(role+'-ready');return {role};},
      async execute(role,ready){assert.ok(ownerExited);assert.equal(ready.role,role);await c.beforeNative(role);hit(role+'-private-signed-record');await c.signedRetained(role);hit(role+'-broadcast');await c.observed(role);hit(role+'-local-proof');},
      async join(){hit('join');},async terminal(){hit('terminal');return {};},
      async permit(role){await send('authority');hit(role+'-permit');},async claim(){await send('claim');},
      async withdraw(role){await send('withdraw');hit(role+'-withdraw');return {role,amount:PRIVATE_PAYMENT_AMOUNTS.payoutWei};},
      async verifyCompletion(){hit('verify-completion');},async cleanup(){hit('cleanup');if(cleanupFail)throw Error('PRIVATE_PAYMENT_CLEANUP_FAILED');},
    };
  };
  return {events,factory};
}
class Transport extends EventEmitter {
  connected=true;messages=[];autoAck=true;
  send(message,callback){this.messages.push(structuredClone(message));callback?.();if(this.autoAck&&message.type==='checkpoint')queueMicrotask(()=>this.emit('message',{type:'ack',sequence:message.sequence}));}
  disconnect(){this.connected=false;this.emit('disconnect');}
  start(extra={}){this.emit('message',{type:'start',operationId,profile:PRIVATE_PAYMENT_PROFILE,...extra});}
}

test('fixed entrypoint rejects extra executor/proof/amount/endpoint inputs without host work',async()=>{
  for(const key of ['endpoint','executor','amount','proof','destination','authorizedNativeRun','expectedRoot','expectedSequence','expectedPostRoot','epoch','afterGuardedDeposit','createHost'])await assert.rejects(runPrivatePayment({...opts(async()=>{}),[key]:'caller-input'}),/PRIVATE_PAYMENT_REQUEST_FIELDS/);
  for(const id of ['../../other','', 'x'])await assert.rejects(runPrivatePayment({...opts(async()=>{}),operationId:id}),/PRIVATE_PAYMENT_OPERATION_ID/);
  await assert.rejects(runPrivatePayment({...opts(async()=>{}),profile:'TRANSPARENT'}),/PRIVATE_PAYMENT_PROFILE/);
});
test('host-only paid flow orders owner exit, genuine-stage calls and both exact withdrawals',async()=>{
  const f=fixture(),checkpoints=[];const result=await runPrivatePaymentWithHostForTest(opts(async x=>checkpoints.push(x)),f.factory);
  assert.equal(result.phase,'COMPLETED');assert.equal(result.engineState,'STOPPED');assert.equal(result.observation,'RETAINED_HISTORY');assert.equal(result.cleanupState,'COMPLETED');
  assert.equal(result.settlementState,'PAYOUT_NOTES_ISSUED');for(const r of ['sol','btc'])assert.deepEqual(result.payouts[r],{state:'WITHDRAWN',amountWei:'500000000000000'});
  const sequence=['prepare','prepare-reserve','authorize','owner-exit','reserve-send','sol-ready','sol-broadcast','sol-local-proof','join','btc-ready','btc-broadcast','btc-local-proof','terminal','sol-permit','btc-permit','claim-send','sol-withdraw','btc-withdraw','verify-completion','cleanup'];
  for(let i=1;i<sequence.length;i++)assert.ok(f.events.indexOf(sequence[i-1])<f.events.indexOf(sequence[i]),sequence[i]);
  assert.ok(checkpoints.some(c=>c.ownerState==='PACKAGES_ACKNOWLEDGED'));assert.ok(checkpoints.some(c=>c.exposure.sol==='SIGNED_RETAINED'));
});
test('failed funding checkpoint prevents send and never retries',async()=>{
  const f=fixture();const result=await runPrivatePaymentWithHostForTest(opts(async p=>{if(p.progressCode==='RESERVE_SUBMISSION_PENDING')throw Error('disk failed');}),f.factory);
  assert.equal(result.phase,'FAILED');assert.equal(result.errorCode,'PRIVATE_PAYMENT_CHECKPOINT_FAILED');assert.equal(result.settlementState,'UNKNOWN');
  assert.equal(result.exposure.evm,'MAY_HAVE_SUBMITTED');assert.ok(!f.events.includes('reserve-send'));assert.ok(f.events.includes('cleanup'));
});
test('retained signed record ACK failure prevents native broadcast and the next chain',async()=>{
  const f=fixture();const result=await runPrivatePaymentWithHostForTest(opts(async p=>{if(p.progressCode==='SOL_SIGNED_RETAINED')throw Error('no durable ACK');}),f.factory);
  assert.equal(result.phase,'FAILED');assert.equal(result.exposure.sol,'SIGNED_RETAINED');assert.equal(result.settlementState,'FUNDED');
  assert.ok(f.events.includes('sol-private-signed-record'));assert.ok(!f.events.includes('sol-broadcast'));assert.ok(!f.events.includes('btc-ready'));
});
test('lost EVM claim result stays unknown and is sent once',async()=>{
  const f=fixture({failAt:'claim-send'});const result=await runPrivatePaymentWithHostForTest(opts(async()=>{}),f.factory);
  assert.equal(result.phase,'FAILED');assert.equal(result.settlementState,'UNKNOWN');assert.equal(result.exposure.evm,'MAY_HAVE_SUBMITTED');assert.equal(f.events.filter(x=>x==='claim-send').length,1);
  assert.ok(!f.events.includes('sol-withdraw'));
});
test('post-claim checkpoint loss preserves issued notes and prevents withdrawals',async()=>{
  const f=fixture();const result=await runPrivatePaymentWithHostForTest(opts(async p=>{if(p.progressCode==='PAYOUT_NOTES_ISSUED')throw Error('disk failed');}),f.factory);
  assert.equal(result.settlementState,'PAYOUT_NOTES_ISSUED');assert.equal(result.payouts.sol.state,'ISSUED');assert.ok(!f.events.includes('sol-withdraw'));
});
test('both verified withdrawals remain financially completed through ACK or cleanup failure',async()=>{
  for(const kind of ['checkpoint','cleanup']) {
    const f=fixture({cleanupFail:kind==='cleanup'});const result=await runPrivatePaymentWithHostForTest(opts(async p=>{if(kind==='checkpoint'&&p.progressCode==='BTC_PAYOUT_WITHDRAWN')throw Error('disk failed');}),f.factory);
    assert.equal(result.phase,'COMPLETED');assert.equal(result.engineState,'STOPPED');assert.equal(result.payouts.btc.state,'WITHDRAWN');assert.equal(result.cleanupState,kind==='cleanup'?'FAILED':'COMPLETED');assert.match(result.errorCode,/PRIVATE_PAYMENT_/);
  }
});
test('sanitization removes private IDs/proofs and rejects premature success',()=>{
  const b=base();b.secret='private';b.exposure.txid='native-id';b.payouts.sol.recipient='private';
  assert.equal(JSON.stringify(sanitizePrivatePaymentSummary(b)).includes('private'),false);
  assert.throws(()=>sanitizePrivatePaymentSummary({...b,phase:'COMPLETED'}),/PRIVATE_PAYMENT_INCOMPLETE_PAYOUTS/);
});
test('IPC host requires every exact monotonic durable ACK before continuing',async()=>{
  const transport=new Transport();transport.autoAck=false;const f=fixture();
  const worker=createPrivatePaymentWorkerHost({transport,runPayment:o=>runPrivatePaymentWithHostForTest(o,f.factory),ackTimeoutMs:1000});transport.start();await tick();
  assert.equal(transport.messages.length,1);assert.deepEqual(f.events,[]);
  transport.emit('message',{type:'ack',sequence:1});await tick();assert.ok(f.events.includes('prepare'));
  let cursor=1;
  while(!transport.messages.some(m=>m.type==='result')) {
    const next=transport.messages[cursor];if(next?.type==='checkpoint'){assert.equal(next.sequence,cursor+1);transport.emit('message',{type:'ack',sequence:next.sequence});cursor++;}await tick();
  }
  const result=await worker.done;assert.equal(result.phase,'COMPLETED');assert.equal(f.events.at(-1),'cleanup');
  assert.equal(transport.messages.at(-1).type,'result');assert.equal(transport.messages.at(-1).summary.cleanupState,'COMPLETED');
});
test('IPC ACK timeout latches abort and disposes owned host work without exposure',async()=>{
  const transport=new Transport(),f=fixture();let checkpoints=0;
  transport.send=function(m,cb){this.messages.push(structuredClone(m));cb?.();if(m.type==='checkpoint'&&++checkpoints===1)queueMicrotask(()=>this.emit('message',{type:'ack',sequence:m.sequence}));};
  const worker=createPrivatePaymentWorkerHost({transport,runPayment:o=>runPrivatePaymentWithHostForTest(o,f.factory),ackTimeoutMs:10});transport.start();const result=await worker.done;
  assert.equal(result.phase,'FAILED');assert.ok(!f.events.includes('reserve-send'));assert.ok(f.events.includes('cleanup'));
});
test('parent loss at signed-retained ACK cleans up without broadcasting or replaying',async()=>{
  const transport=new Transport(),f=fixture();
  transport.send=function(m,cb){this.messages.push(structuredClone(m));cb?.();if(m.type==='checkpoint'){if(m.payload.progressCode==='SOL_SIGNED_RETAINED')queueMicrotask(()=>this.disconnect());else queueMicrotask(()=>this.emit('message',{type:'ack',sequence:m.sequence}));}};
  const worker=createPrivatePaymentWorkerHost({transport,runPayment:o=>runPrivatePaymentWithHostForTest(o,f.factory)});transport.start();const result=await worker.done;
  assert.equal(result.phase,'FAILED');assert.equal(result.exposure.sol,'SIGNED_RETAINED');assert.ok(!f.events.includes('sol-broadcast'));assert.ok(f.events.includes('cleanup'));assert.ok(!transport.messages.some(m=>m.type==='result'));
});
test('IPC rejects extra boot config, oversized frames, duplicate start and wrong ACK',async()=>{
  for(const attack of ['extra','large','start','ack']) {
    const transport=new Transport();transport.autoAck=false;let runs=0;
    const worker=createPrivatePaymentWorkerHost({transport,runPayment:async o=>{runs++;try{await o.onCheckpoint(base());}catch{}return {...base(),phase:'FAILED',engineState:'STOPPED',cleanupState:'COMPLETED',observation:'RETAINED_HISTORY'};}});
    if(attack==='extra')transport.start({executor:'/bin/other'});
    else if(attack==='large')transport.start({operationId:'a'.repeat(20_000)});
    else {transport.start();await tick();if(attack==='start')transport.start();else transport.emit('message',{type:'ack',sequence:999});}
    await worker.done;assert.equal(runs,['extra','large'].includes(attack)?0:1);
  }
});
test('owned actor termination escalates only its ChildProcess after finite grace',async()=>{
  const child=new EventEmitter();child.pid=4321;child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdio=[child.stdin,child.stdout,child.stderr];
  const signals=[];child.kill=signal=>{signals.push(signal);if(signal==='SIGKILL')queueMicrotask(()=>child.emit('close',null,'SIGKILL'));};
  const c=attachAssemblyControl(child,'owner');c.ready.catch(()=>{});const outcome=await c.terminate({forceAfterMs:5});
  assert.deepEqual(signals,['SIGTERM','SIGKILL']);assert.equal(outcome.signal,'SIGKILL');assert.equal(c.provenance().closed,true);
});
test('production paid program has no automatic refund, duplicate, or missing-permit controls',async()=>{
  const source=await readFile(new URL('../src/private-payment-engine.mjs',import.meta.url),'utf8');const host=source.slice(source.indexOf('async function createOwnedPaymentHost'));
  for(const token of ['expectedRevert','expectedStatus','assert.rejects','duplicate withdrawal','without current permits'])assert.equal(host.includes(token),false,token);
  assert.match(host,/await audit\(role,item\)/);
  const {PRIVATE_PAYMENT_PROGRAMS}=await import('../src/private-payment-coordinator.mjs');assert.equal(PRIVATE_PAYMENT_PROGRAMS.payment.some(op=>/refund/i.test(op)),false);assert.deepEqual(PRIVATE_PAYMENT_PROGRAMS.refund,['validateRefund','awaitRefundCutoff','issueRefund','withdrawRefund','verifyRefund']);assert.match(host,/await context\.signedRetained\(role\)/);
  const harness=await readFile(new URL('../scripts/integration-private-assembly-native.mjs',import.meta.url),'utf8');assert.match(harness,/NATIVE_SCHEMA_REPAIR_REQUIRED = true/);assert.match(harness,/await completeAssemblyPaidPayment\(/);
});

test('fixed real fork boot disconnects before initial ACK without starting native work',async()=>{
  const child=fork(fileURLToPath(new URL('../src/private-payment-worker.mjs',import.meta.url)),[],{stdio:['ignore','ignore','ignore','ipc'],env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'}});
  const frames=[];let timer;
  const closed=new Promise((resolve,reject)=>{
    timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('WORKER_DID_NOT_CLOSE'));},5000);
    child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));
    child.on('message',m=>{frames.push(m);if(m.type==='checkpoint')child.disconnect();});
  });
  child.send({type:'start',operationId,profile:PRIVATE_PAYMENT_PROFILE});
  const result=await closed.finally(()=>clearTimeout(timer));assert.equal(result.code,1);assert.equal(result.signal,null);
  assert.equal(frames.length,1);assert.equal(frames[0].sequence,1);assert.equal(frames[0].payload.phase,'PREPARING');assert.equal(frames[0].payload.exposure.evm,'NONE');
});


test('producer retirement waits for verified own-role assembler ACK and closes only that producer',async()=>{
  for(const role of ['sol','btc']) {
    let acknowledge,closed=false;const events=[],ownSide={},targetSide={};
    const producer={side:{assembler:ownSide},control:{
      async stop(){events.push('stop');closed=true;return {code:0};},
      async terminate(){assert.fail('no forced stop needed');},
      provenance(){return {closed,channelsClosed:closed,writesAfterExit:0};},
    }};
    const assembler={side:{[role]:targetSide},control:{stop(){assert.fail('assembler must survive');}}};
    const transferPackage=async(from,operation,to,admit)=>{
      assert.equal(from,ownSide);assert.equal(to,targetSide);assert.equal(operation,'localProof');assert.equal(admit,'retainLocal');
      events.push('verification-pending');await new Promise(resolve=>{acknowledge=resolve;});events.push('verified-ack');
      return {retained:true,mode:role+'_local',packageSHA256:'f'.repeat(64)};
    };
    const work=retainLocalProofAndRetireProducer({role,producer,assembler,transferPackage,recordResources:async(stage,c)=>{assert.equal(c,producer.control);events.push(stage);}});
    await tick();assert.deepEqual(events,['verification-pending']);assert.equal(closed,false);
    acknowledge();await work;
    assert.deepEqual(events,['verification-pending','verified-ack',role.toUpperCase()+'_PRODUCER_BEFORE_RETIREMENT','stop',role.toUpperCase()+'_PRODUCER_AFTER_RETIREMENT']);assert.equal(closed,true);
  }
});
test('missing, rejected or mismatched assembler ACK cannot retire a producer',async()=>{
  for(const ack of [null,{retained:false,mode:'sol_local',packageSHA256:'f'.repeat(64)},{retained:true,mode:'btc_local',packageSHA256:'f'.repeat(64)},{retained:true,mode:'sol_local',packageSHA256:'bad'}]) {
    let stops=0,samples=0;
    const producer={side:{assembler:{}},control:{async stop(){stops++;},async terminate(){stops++;}}};
    await assert.rejects(retainLocalProofAndRetireProducer({role:'sol',producer,assembler:{side:{sol:{}}},transferPackage:async()=>{if(ack===null)throw Error('GENUINE_VERIFIER_REJECTED');return ack;},recordResources:async()=>{samples++;}}));
    assert.equal(stops,0);assert.equal(samples,0);
  }
});
test('streamed prerequisite integrity preserves exact size/hash with a fixed64KiB maximum chunk',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'private-payment-stream-'));const file=join(directory,'crs-test.dat');
  const bytes=Buffer.alloc(2*1024*1024+19,0x37),pin={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  try {
    await writeFile(file,bytes);const result=await verifyPrivatePaymentFileIntegrity(file,pin,'PC18_CRS_PIN');
    assert.equal(result.bytes,pin.bytes);assert.equal(result.sha256,pin.sha256);assert.equal(result.maximumChunkBytes,64*1024);
    await assert.rejects(verifyPrivatePaymentFileIntegrity(file,{...pin,bytes:pin.bytes+1},'PC18_CRS_PIN'),/PC18_CRS_PIN/);
    await assert.rejects(verifyPrivatePaymentFileIntegrity(file,{...pin,sha256:'0'.repeat(64)},'PC18_CRS_PIN'),/PC18_CRS_PIN/);
    await writeFile(file,Buffer.alloc(0));const empty={bytes:0,sha256:createHash('sha256').digest('hex')};
    assert.deepEqual(await verifyPrivatePaymentFileIntegrity(file,empty),{...empty,maximumChunkBytes:0});
  } finally {await rm(directory,{recursive:true,force:true});}
  const source=await readFile(new URL('../src/private-payment-engine.mjs',import.meta.url),'utf8');
  assert.match(source,/await verifyPrivatePaymentFileIntegrity\(join\(crs,record\.file\),record,'PC18_CRS_PIN'\)/);
  assert.equal(source.includes('readFile(join(crs,record.file))'),false);
  assert.match(source,/await recordResources\('BEFORE_TERMINAL_FULFILLMENT'\);await heavy\('terminal-fulfillment'/);
});

test('real assembly EVM refund encoding binds decimal original epoch numerically and rejects substitutions',()=>{
  const hash=n=>'0x'+n.toString(16).repeat(64),epoch='3166680';
  const binding={scope:hash(1),policy:hash(2),epoch,root:hash(3),reserveNullifier:hash(4),paymentCommitment:hash(5)};
  const pkg={version:1,mode:'refund',target:'evm',proofBase64:Buffer.from('shape-only-no-proof-execution').toString('base64'),
    publicInputs:[...noteHashToWords(binding.scope),...noteHashToWords(binding.policy),epoch,...noteHashToWords(binding.root),...noteHashToWords(binding.reserveNullifier),...noteHashToWords(binding.paymentCommitment)]};
  const proof=assemblyEvmProof(pkg);
  assert.match(proof.publicInputs[16],/^0x[0-9a-f]{64}$/);assert.notEqual(proof.publicInputs[16],epoch);assert.equal(BigInt(proof.publicInputs[16]),BigInt(epoch));
  assert.doesNotThrow(()=>assertOriginalRefundProofBinding(proof,binding));
  for(const mismatch of [-1n,1n])assert.throws(()=>assertOriginalRefundProofBinding(proof,{...binding,epoch:(BigInt(epoch)+mismatch).toString()}),/PRIVATE_PAYMENT_REFUND_EPOCH/);
  for(const field of ['scope','policy','root','reserveNullifier','paymentCommitment'])assert.throws(()=>assertOriginalRefundProofBinding(proof,{...binding,[field]:hash(9)}),/PRIVATE_PAYMENT_.*REFUND_/);
  const badEpoch=structuredClone(proof);badEpoch.publicInputs[16]='0x'+(1n<<64n).toString(16);assert.throws(()=>assertOriginalRefundProofBinding(badEpoch,binding),/EPOCH_RANGE/);
  const badCount=structuredClone(proof);badCount.publicInputs.pop();assert.throws(()=>assertOriginalRefundProofBinding(badCount,binding),/REFUND_INPUTS/);
});

test('concurrent owned abort and cleanup share one termination and await close rather than exit',async()=>{
  const child=new EventEmitter();child.pid=1234;child.exitCode=null;child.signalCode=null;const signals=[];
  child.kill=signal=>{signals.push(signal);child.signalCode=signal;child.emit('exit',null,signal);};
  let closed=false;const abort=stopOwnedChild(child,{forceAfterMs:50}),cleanup=stopOwnedChild(child,{forceAfterMs:50});
  assert.equal(abort,cleanup);cleanup.then(()=>{closed=true;});await tick();assert.equal(closed,false);assert.deepEqual(signals,['SIGTERM']);
  child.emit('close',null,'SIGTERM');assert.deepEqual(await cleanup,{pid:1234,code:null,signal:'SIGTERM'});assert.equal(closed,true);
  await stopOwnedChild(child);assert.deepEqual(signals,['SIGTERM']);
});

test('aborted real recipient cleanup confirms closure despite concurrent graceful IPC rejection',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'refund-recipient-abort-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const scope='11'.repeat(32),seed='22'.repeat(32),children=[];
  const terms={scope,policy:'33'.repeat(32),role:'sol',originSlot:1,origin:origin(scope,seed,1).toString('hex'),value:'500000000000000',
    descriptor:{chain:1,nonce:'44'.repeat(32),source:'55'.repeat(32),recipient:'66'.repeat(32),amount:'3000000',executeAfter:'1900000200',executeBefore:'1900005000',validFrom:'3166667',validUntil:'3166676'}};
  const recipient=await startRecipient({path:join(directory,'recipient.vault'),password:'synthetic-test-only-password',expectedTerms:terms,withdrawalRecipient:'77'.repeat(20)},[],children);
  t.after(()=>recipient.terminate());const child=children[0];let sawClose=false;child.once('close',()=>{sawClose=true;});
  child.kill('SIGSTOP');await new Promise(resolve=>setTimeout(resolve,10));
  const graceful=recipient.stop();const expectedRejection=assert.rejects(graceful,/PC18_RECIPIENT_EXIT/);
  const aborted=stopOwnedChild(child,{forceAfterMs:20});const cleanup=recipient.terminate();
  await expectedRejection;await aborted;const result=await cleanup;
  assert.equal(sawClose,true);assert.equal(result.pid,child.pid);assert.equal(result.signal,'SIGKILL');
  assert.equal((await recipient.terminate()).pid,child.pid);
});

test('proven no-deposit failure restores prior deployment exposure while canonical guarded revert is observed',async()=>{
  for(const branch of ['not-submitted','canonical-revert']) {
    const f=fixture(),factory=async context=>{
      const host=await f.factory(context);
      return {...host,
        async prepare(){await host.prepare();await context.beforeEvm('deployment');context.evmConfirmed('deployment');},
        async reserve(){
          await host.assertOwnerExited();await context.beforeEvm('reserve');
          if(branch==='not-submitted')context.reserveNotSubmitted();else context.reserveReverted();
          throw Error('PRIVATE_PAYMENT_RESERVE_PRESTATE_CHANGED');
        },
      };
    };
    const result=await runPrivatePaymentWithHostForTest(opts(async()=>{}),factory);
    assert.equal(result.phase,'FAILED');assert.equal(result.settlementState,'NOT_FUNDED');assert.equal(result.exposure.evm,'OBSERVED');assert.equal(result.ownerRefund.state,'NONE');assert.equal(result.exposure.sol,'NONE');assert.equal(result.exposure.btc,'NONE');assert.equal(result.cleanupState,'COMPLETED');
    assert.equal(f.events.includes('reserve-send'),false);assert.equal(f.events.includes('sol-ready'),false);
  }
});
