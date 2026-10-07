import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {objectDigest} from '../../src/paeg/generic-balance-custody.mjs';
import {createGenericBalanceOwnerProcess} from '../../src/paeg/generic-balance-owner-process.mjs';
import {BALANCE_OWNER_PROTOCOL,MAX_MESSAGE_BYTES,encode,createFrameReader,writeFrame,methodPlane}
  from '../../src/paeg/generic-balance-owner-protocol.mjs';
import {signature} from '../../src/private-note-encoding.mjs';
import {artifact,identity,ledger,terms,submission,success,recoverySuccess,recoveryRequest} from './generic-balance-fixtures.mjs';

const childFile=fileURLToPath(new URL('../../src/paeg/generic-balance-owner-child.mjs',import.meta.url));
const session='ab'.repeat(32);
const message=(fields)=>({protocol:BALANCE_OWNER_PROTOCOL,session,...fields});

/** Synthetic pipe harness, deliberately confined to tests. It launches the
 * same fixed child, but does not claim the production runtime/observer brands. */
async function childHarness(t) {
  const directory=await mkdtemp(join(tmpdir(),'balance-owner-ipc-host-'));
  const id=identity(),path=join(directory,'custody.vault'),password='synthetic-private-ipc-password';
  let checkpoint=null,current=ledger(id),job=null;
  const observations=new Map();
  const base={path,password,identity:id,poolArtifact:artifact};
  const harness={id,path,get snapshot(){return structuredClone(current);},set snapshot(v){current=structuredClone(v);},
    observe(ref,value){observations.set(ref,structuredClone(value));},get checkpoint(){return structuredClone(checkpoint);},
    get job(){return job;},
    async start(mode='create') {
      let readyResolve,readyReject,exitResolve,pending=null,nextId=1,hostSequence=0;
      const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;}),done=new Promise(r=>{exitResolve=r;});
      const child=spawn(process.execPath,[childFile],{cwd:directory,env:{LANG:'C.UTF-8'},stdio:['pipe','pipe','pipe']});
      const childSession=randomBytes(32).toString('hex'),send=fields=>writeFrame(child.stdin,{protocol:BALANCE_OWNER_PROTOCOL,session:childSession,...fields});
      job={child,done,exit:null,stderrBytes:0,send,session:childSession};
      const reader=createFrameReader(m=>{
        assert.equal(m.session,childSession);
        if(m.type==='hostRequest') {
          assert.equal(m.sequence,++hostSequence);
          let result;
          if(m.method==='checkpoint'){checkpoint=structuredClone(m.input);result={retained:true};}
          else if(m.method==='readSnapshot')result=current;
          else {assert.equal(m.method,'readTransaction');result=observations.get(m.input.ownerOperationRef)??null;}
          void send({type:'hostReply',sequence:m.sequence,ok:true,result}).catch(readyReject);return;
        }
        if(m.type==='ready'){readyResolve(m);return;}
        if(m.type==='startupFailure'){readyReject(Error(m.code));return;}
        assert.equal(m.type,'result');assert.ok(pending);assert.equal(m.id,pending.id);
        const p=pending;pending=null;clearTimeout(p.timer);m.ok?p.resolve(m.result):p.reject(Error(m.code));
      });
      child.stdout.on('data',b=>{try{reader.push(b);}catch(e){readyReject(e);pending?.reject(e);child.kill('SIGTERM');}finally{b.fill(0);}});
      child.stderr.on('data',b=>{job.stderrBytes+=b.length;b.fill(0);});
      child.on('error',readyReject);
      child.on('close',(code,signal)=>{job.exit={code,signal};reader.close();if(pending){clearTimeout(pending.timer);pending.reject(Error('child exited'));pending=null;}
        readyReject(Error('child exited'));exitResolve({code,signal});});
      job.call=async(method,input=null)=>{
        assert.equal(pending,null);const id=nextId++;
        const result=new Promise((resolve,reject)=>{pending={id,resolve,reject,timer:setTimeout(()=>{reject(Error('fixture request timeout'));child.kill('SIGTERM');},15000)};});
        await send({type:'request',id,plane:methodPlane(method),method,input});return result;
      };
      await send({type:'boot',mode,config:{...base,create:mode==='create',checkpoint}});await ready;return job;
    },
    async stop(){if(job&&!job.exit){await job.call('close');await job.done;}},
  };
  t.after(async()=>{if(job&&!job.exit){job.child.kill('SIGTERM');await job.done;}await rm(directory,{recursive:true,force:true});});
  return harness;
}

test('bounded binary frames reject oversized, truncated and cross-plane data',()=>{
  const source=message({type:'request',id:1,plane:'public',method:'summary',input:null}),decoded=[];
  const r=createFrameReader(m=>decoded.push(m)),encoded=encode(source);
  for(const byte of encoded)r.push(Buffer.from([byte]));r.end();assert.deepEqual(decoded,[source]);
  const large=Buffer.alloc(4);large.writeUInt32BE(MAX_MESSAGE_BYTES+1);
  assert.throws(()=>createFrameReader(()=>{}).push(large),/MESSAGE_LIMIT/);
  const partial=createFrameReader(()=>{});partial.push(encoded.subarray(0,6));assert.throws(()=>partial.end(),/TRUNCATED/);
  assert.throws(()=>encode(message({type:'request',id:1,plane:'public',method:'depositInput',input:'some-reference'})),/PLANE/);
  for(const method of ['constructor','closeUnsafe','sign','recoverAbsentCheckpoint'])assert.throws(()=>methodPlane(method),/METHOD_DENIED/);
  assert.throws(()=>encode({...source,privateKeyPem:'injected'}),/FIELDS/);
});

test('production constructor rejects caller-shaped runtime, identity, path and callbacks before spawning',async()=>{
  await assert.rejects(createGenericBalanceOwnerProcess({runtime:{},system:{},poolIndex:0,observer:{}}),/OWNED_CAPABILITY_REQUIRED/);
  for(const extra of ['path','password','identity','sign','rpcUrl','childFile']){
    await assert.rejects(createGenericBalanceOwnerProcess({runtime:{},system:{},poolIndex:0,observer:{},[extra]:'injected'}),/CONSTRUCTOR_FIELDS/);
  }
});

test('frame encoding errors reject asynchronously so caller cleanup always runs',async()=>{
  const stream={write(){throw Error('must not write an invalid envelope');}};
  await assert.rejects(writeFrame(stream,message({type:'request',id:1,plane:'public',method:'sign',input:null})),/METHOD_DENIED/);
});

test('real fixed child retains funded keys across process restart and never regrants a committed dispatch',async t=>{
  const f=await childHarness(t);await f.start();let call=(method,input)=>f.job.call(method,input);
  const funding='ipc-funding-reference';await call('prepareFunding',{ownerOperationRef:funding,identitySHA256:objectDigest(f.id),amount:'50000',epoch:'10'});
  const witness=await call('depositInput',funding),depositPlan=await call('ownerPlan',funding);
  assert.deepEqual(await call('depositInput',funding),witness);
  let local={id:f.id,snapshot:f.snapshot,owner:{ownerPlan:()=>depositPlan}};
  const deposit=submission(local,funding,'D26');assert.equal((await call('bindSubmission',deposit)).dispatchAllowed,true);
  const funded=success(local,funding,deposit,'D26');f.observe(funding,funded);await call('reconcile',funding);f.snapshot=funded.after;
  const source=(await call('privateBalance')).notes.find(n=>n.status==='AVAILABLE');
  const reference='ipc-spend-reference',{key,terms:typed}=terms(reference,20000),request={ownerOperationRef:reference,
    identitySHA256:objectDigest(f.id),sourceNoteId:source.noteId,terms:typed};
  await call('prepareOperation',request);
  const invoices=await call('invoiceRequests',reference),authorization={ownerOperationRef:reference,
    invoiceSignatures:invoices.map(r=>signature(key,Buffer.from(r.message,'hex')).toString('hex'))};
  const signed=await call('authorizeOperation',authorization),plan=await call('ownerPlan',reference);
  local={id:f.id,snapshot:f.snapshot,owner:{ownerPlan:()=>plan}};
  const s66=submission(local,reference);assert.equal((await call('bindSubmission',s66)).dispatchAllowed,true);
  await call('markUnknown',reference);const oldPid=f.job.child.pid;
  await f.stop();assert.deepEqual(f.job.exit,{code:0,signal:null});assert.equal(f.job.stderrBytes,0);
  await f.start('recover');assert.notEqual(f.job.child.pid,oldPid);call=(method,input)=>f.job.call(method,input);
  assert.deepEqual(await call('authorizeOperation',authorization),signed);
  assert.equal((await call('bindSubmission',s66)).dispatchAllowed,false);
  assert.equal((await call('reconcile',reference)).stage,'UNKNOWN');
  const projection=await call('projection',reference);assert.deepEqual(Object.keys(projection).sort(),['dispatchAllowed','kind','ownerOperationRef','reconcileRequired','stage']);
  assert.doesNotMatch(JSON.stringify(projection),/privateKey|secret|graph|opening|signature/i);
  const observation=success(local,reference,s66);f.observe(reference,observation);await call('reconcile',reference);
  assert.equal((await call('privateBalance')).available,'30000');
  f.snapshot=observation.after;
  const change=(await call('privateBalance')).notes.find(n=>n.status==='AVAILABLE'),exitReference='ipc-withdrawal-reference';
  await call('prepareWithdrawal',{ownerOperationRef:exitReference,identitySHA256:objectDigest(f.id),sourceNoteId:change.noteId,recipient:'45'.repeat(20),epoch:'10'});
  await call('withdrawalInput',exitReference);const exitPlan=await call('ownerPlan',exitReference);
  local={id:f.id,snapshot:f.snapshot,owner:{ownerPlan:()=>exitPlan}};
  const exitRequest=submission(local,exitReference,'W39');await call('bindSubmission',exitRequest);
  const withdrawn=success(local,exitReference,exitRequest,'W39');
  f.observe(exitReference,withdrawn);await call('reconcile',exitReference);f.snapshot=withdrawn.after;
  assert.equal((await call('privateBalance')).notes.find(n=>n.noteId===change.noteId).status,'WITHDRAWN');
  assert.equal((await call('bindSubmission',exitRequest)).dispatchAllowed,false);
  const recovered=await recoverySuccess(f,reference,{authorizationStatement:signed.authorizationStatement});
  const recovery=recoveryRequest(recovered,reference);f.observe(reference,recovered);
  assert.equal((await call('reconcileRecovery',recovery)).recoveryStage,'CONFIRMED');
  assert.equal((await call('privateBalance')).available,'20000');
  await f.stop();await f.start('recover');call=(method,input)=>f.job.call(method,input);
  const beforeRepeat=f.checkpoint;await call('reconcileRecovery',recovery);assert.deepEqual(f.checkpoint,beforeRepeat);
  assert.equal((await call('privateBalance')).notes.find(n=>n.role==='RECOVERY').status,'AVAILABLE');
  const raw=await readFile(f.path,'utf8');assert.doesNotMatch(raw,/PRIVATE KEY|reserveSecret|ipc-spend-reference/);
  await f.stop();assert.deepEqual(f.job.exit,{code:0,signal:null});assert.equal(f.job.stderrBytes,0);
});

test('wrong child session or request sequence closes the owned child without granting a command',async t=>{
  const f=await childHarness(t);await f.start();
  await f.job.send({type:'request',id:9,plane:'public',method:'summary',input:null});
  const result=await f.job.done;assert.equal(result.code,1);assert.equal(f.job.stderrBytes,0);
});
