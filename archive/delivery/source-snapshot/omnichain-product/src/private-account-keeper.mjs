/** Surviving owned-local authority and custody lifetime. Disposable account
 * coordinators journal requests and reconcile original notes; they never own
 * the chain/issuer lifetime. A keeper/server loss is explicitly unavailable. */
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createOwnedPrivateAccountRuntime} from './private-account-runtime.mjs';
import {PRIVATE_ACCOUNT_PROFILE} from './private-account-state.mjs';
const random=()=>randomBytes(16).toString('hex');
const safe=e=>{const m=/^([A-Z][A-Z0-9_]{1,100})(?:\n|$)/.exec(e?.message??'');return m?.[1]??(/^[A-Z][A-Z0-9_]{1,100}$/.test(e?.code??'')?e.code:'ACCOUNT_OPERATION_FAILED');};
const clone=x=>structuredClone(x);
const spawnWorker=()=>fork(fileURLToPath(new URL('./private-account-coordinator.mjs',import.meta.url)),[],{cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:['ignore','ignore','ignore','ipc'],serialization:'json',execArgv:[],env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'}});
export function createPrivateAccountKeeper(options){return createPrivateAccountKeeperForTest(options);}
export function createPrivateAccountKeeperForTest({accountId,onCheckpoint=async()=>{},signal},{createRuntime=createOwnedPrivateAccountRuntime,spawnCoordinator=spawnWorker,afterHostOperation=async()=>{}}={}){
 assert.match(accountId,/^[0-9a-f]{32}$/);const controller=new AbortController();let authority,job,config,checkpoint,lastSnapshot,busy=false,closed=false,phase='OPENING',errorCode=null,generationCount=0,stopPromise;
 const state=()=>({profile:PRIVATE_ACCOUNT_PROFILE,accountId,phase,busy,workerAvailable:Boolean(job&&!job.closed&&job.ready),authorityAvailable:Boolean(authority&&!closed),generationCount,assetCount:authority?.registry.length??0,requestCount:lastSnapshot?.requests.length??0,errorCode,capabilities:{coordinatorRestart:true,keeperRestart:false,nodeRestart:false,fullAcceptance:false}});
 const publish=async()=>{await onCheckpoint(state());};
 const guard=()=>{if(closed||controller.signal.aborted)throw Error('ACCOUNT_KEEPER_UNAVAILABLE');};
 function send(j,m){return new Promise((resolve,reject)=>{if(j.closed||j.child.connected===false)return reject(Error('ACCOUNT_COORDINATOR_UNAVAILABLE'));j.child.send(m,e=>e?reject(e):resolve());});}
 async function startWorker(create){guard();assert.ok(!job||job.closed,'ACCOUNT_WORKER_EXISTS');if(job?.hostWork)await job.hostWork.catch(()=>{});const child=spawnCoordinator(),generation=random();let readyResolve,readyReject,closeResolve;const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;}),done=new Promise(r=>{closeResolve=r;});const j={child,generation,closed:false,ready:false,pending:new Map(),hostSequence:0,hostWork:null,done};job=j;generationCount++;
  const bootTimer=setTimeout(()=>{readyReject(Error('ACCOUNT_BOOT_TIMEOUT'));child.kill('SIGTERM');},30000);
  const lost=(code=null)=>{if(j.closed)return;j.closed=true;j.ready=false;clearTimeout(bootTimer);readyReject(Error('ACCOUNT_COORDINATOR_LOST'));for(const p of j.pending.values()){clearTimeout(p.timer);p.reject(Error('ACCOUNT_COORDINATOR_LOST'));}j.pending.clear();closeResolve();if(!closed){phase='COORDINATOR_UNAVAILABLE';errorCode=code??'ACCOUNT_COORDINATOR_LOST';void publish().catch(()=>{});}};
  child.once('error',e=>lost(safe(e)));child.once('exit',()=>lost());child.once('close',()=>lost());
  child.on('message',m=>{void(async()=>{assert.ok(m&&Buffer.byteLength(JSON.stringify(m))<=512*1024&&m.generation===generation,'ACCOUNT_IPC_BINDING');if(j!==job||j.closed)return;
   if(m.type==='ready'){assert.equal(j.ready,false);j.ready=true;lastSnapshot=m.snapshot;clearTimeout(bootTimer);readyResolve();return;}
   if(m.type==='boot-failed'){readyReject(Error(safe({message:m.errorCode})));child.kill('SIGTERM');return;}
   if(m.type==='result'){const p=j.pending.get(m.commandId);assert.ok(p,'ACCOUNT_RESULT_ID');j.pending.delete(m.commandId);clearTimeout(p.timer);if(m.ok){lastSnapshot=m.snapshot;p.resolve(m.result);}else p.reject(Error(safe({message:m.errorCode})));return;}
   assert.equal(m.type,'host','ACCOUNT_HOST_MESSAGE');assert.equal(m.sequence,j.hostSequence+1,'ACCOUNT_HOST_SEQUENCE');assert.equal(j.hostWork,null,'ACCOUNT_HOST_BUSY');j.hostSequence=m.sequence;
   j.hostWork=(async()=>{let result;try{
    guard();if(m.method==='checkpoint'){const c=m.input.checkpoint;assert.ok(c&&Number.isSafeInteger(c.revision)&&/^[0-9a-f]{64}$/.test(c.stateSHA256),'ACCOUNT_CHECKPOINT');if(checkpoint)assert.ok(c.revision>=checkpoint.revision&&c.revision<=checkpoint.revision+1,'ACCOUNT_CHECKPOINT_SEQUENCE');checkpoint=clone(c);result={retained:true};}
    else if(m.method==='snapshot')result=await authority.snapshot(m.input.previous);
    else{assert.ok(['prepare','execute','reconcile'].includes(m.method),'ACCOUNT_HOST_METHOD');assert.ok(authority.registry.some(a=>a.assetId===m.input.request.assetId),'ACCOUNT_ASSET_UNKNOWN');result=await authority[m.method](m.input.request);await afterHostOperation({method:m.method,request:clone(m.input.request),child,authority});}
    if(!j.closed&&j===job)await send(j,{type:'reply',generation,sequence:m.sequence,ok:true,result});
   }catch(e){if(!j.closed&&j===job)await send(j,{type:'reply',generation,sequence:m.sequence,ok:false,errorCode:safe(e)}).catch(()=>{});}finally{j.hostWork=null;}})();
  })().catch(e=>{errorCode=safe(e);child.kill('SIGTERM');});});
  await send(j,{type:'boot',generation,config,create,checkpoint});await ready;return j;
 }
 async function rpc(action,input={}){guard();const j=job;assert.ok(j?.ready&&!j.closed,'ACCOUNT_COORDINATOR_UNAVAILABLE');const commandId=random();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{j.pending.delete(commandId);reject(Error('ACCOUNT_COMMAND_TIMEOUT'));j.child.kill('SIGTERM');},2*60*60_000);j.pending.set(commandId,{resolve,reject,timer});void send(j,{type:'command',generation:j.generation,commandId,action,input}).catch(e=>{clearTimeout(timer);j.pending.delete(commandId);reject(e);});});}
 const exclusive=async work=>{guard();assert.equal(busy,false,'ACCOUNT_ACTION_BUSY');busy=true;try{await publish();return await work();}catch(e){errorCode=safe(e);throw e;}finally{busy=false;await publish();}};
 async function stop(code='ACCOUNT_KEEPER_STOPPED'){if(stopPromise)return stopPromise;closed=true;controller.abort(Error(code));stopPromise=(async()=>{const j=job;if(j&&!j.closed){j.child.kill('SIGTERM');const kill=setTimeout(()=>j.child.kill('SIGKILL'),5000);await j.done;clearTimeout(kill);}if(j?.hostWork)await j.hostWork.catch(()=>{});await authority?.abort();phase='UNAVAILABLE';errorCode=code;config=null;await publish();})();return stopPromise;}
 signal?.addEventListener('abort',()=>{void stop('ACCOUNT_EXTERNAL_ABORT').catch(()=>{});},{once:true});
 return Object.freeze({
  summary:state,
  async open(){return exclusive(async()=>{assert.equal(authority,undefined,'ACCOUNT_ALREADY_OPEN');authority=await createRuntime({accountId,signal:controller.signal,guard,onProgress:async p=>{phase=p.phase??'OPENING';await publish();}});config={path:join(authority.local,'account.vault'),password:'synthetic-'+randomBytes(32).toString('hex'),accountId,lifetime:authority.lifetime,registry:authority.registry};await startWorker(true);await rpc('refresh');phase='READY';errorCode=null;return state();});},
  async prepare(input){return exclusive(()=>rpc('prepare',input));},
  async execute(requestId){return exclusive(async()=>{phase='EXECUTING';const result=await rpc('execute',{requestId});phase='READY';errorCode=null;return result;});},
  async reconcile(requestId){return exclusive(async()=>{phase='RECONCILING';const result=await rpc('reconcile',{requestId});phase='READY';errorCode=null;return result;});},
  async refresh(){return exclusive(async()=>{await rpc('refresh');return state();});},
  async privateStatus(){guard();assert.ok(job?.ready&&!job.closed,'ACCOUNT_COORDINATOR_UNAVAILABLE');if(busy)return clone(lastSnapshot);await rpc('snapshot');return clone(lastSnapshot);},
  async restartCoordinator(){return exclusive(async()=>{const j=job;assert.ok(j,'ACCOUNT_NOT_OPEN');if(!j.closed){j.child.kill('SIGTERM');const timer=setTimeout(()=>j.child.kill('SIGKILL'),5000);await j.done;clearTimeout(timer);}if(j.hostWork)await j.hostWork;await startWorker(false);await rpc('refresh');phase='READY';errorCode=null;return state();});},
  async close(){return exclusive(async()=>{await authority.close();closed=true;const j=job;if(j&&!j.closed){j.child.kill('SIGTERM');await j.done;}phase='CLOSED';config=null;errorCode=null;return state();});},
  stop,
  async inspectForTest(){return authority.inspect();},
  async crossAssetReplayForTest(){assert.equal(busy,false);return authority.crossAssetReplayForTest();},
 });
}
