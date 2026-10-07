/** Two-owner stage barriers. Only participant handles and public completion
 * facts enter this scheduler; proof packages and openings remain opaque. */
import assert from 'node:assert/strict';
import {randomInt} from 'node:crypto';

export const PRIVATE_COHORT_STAGES=Object.freeze(['reservation','sol','btc','settlement']);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const error=code=>Object.assign(new Error(code),{code});
const owner=value=>assert.ok(value===0||value===1,'PC24_OWNER_INDEX');

/** The mutation lease spans each whole stage, including gaps between the
 * original authority's host method calls. Independent orders are selected with
 * a cryptographic coin flip, never participant-controlled request order. */
export function createPrivateCohortStageGate({mutate,onPhase=async()=>{},onCompletion=async()=>{},chooseOrder=()=>randomInt(2)===0?[0,1]:[1,0]}){
 assert.equal(typeof mutate,'function','PC24_MUTATION_LEASE_REQUIRED');
 const orders=PRIVATE_COHORT_STAGES.map(stage=>{const order=chooseOrder(stage);assert.deepEqual([...order].sort(),[0,1],'PC24_STAGE_ORDER');return Object.freeze([...order]);});
 let stageIndex=0,position=0,active=null,fault=null,pumping=false,phaseAnnounced=-1;
 const waiting=new Map(),completed=[new Set(),new Set()],listeners=new Set();
 const guard=()=>{if(fault)throw fault;};
 const notify=()=>{for(const listener of listeners)listener();listeners.clear();};
 const abort=(reason='PC24_COHORT_QUARANTINED')=>{
  fault??=typeof reason==='string'?error(reason):reason;
  for(const item of waiting.values())item.reject(fault);waiting.clear();notify();return fault;
 };
 async function pump(){
  if(pumping||active||fault||stageIndex===PRIVATE_COHORT_STAGES.length)return;
  const index=orders[stageIndex][position],key=`${index}:${stageIndex}`,item=waiting.get(key);if(!item)return;
  pumping=true;waiting.delete(key);const stage=PRIVATE_COHORT_STAGES[stageIndex],release=deferred(),closed=deferred();
  const lease={owner:index,stage,index:stageIndex,release,closed,finished:false};active=lease;
  // A rejected closed promise is observed by both the acquisition and finish
  // paths. Attach a sink now, before either caller can be cancelled.
  closed.promise.catch(()=>{});
  release.promise.catch(()=>{});
  try{
   lease.running=Promise.resolve().then(()=>mutate(`cohort-${stage}`,async()=>{
    guard();if(phaseAnnounced!==stageIndex){await onPhase(stage);guard();phaseAnnounced=stageIndex;}
    item.resolve();await release.promise;
   }));
   lease.running.then(()=>{
    assert.equal(lease.finished,true,'PC24_UNFINISHED_STAGE_LEASE');
    active=null;position++;if(position===2){position=0;stageIndex++;}
    closed.resolve();notify();void pump();
   }).catch(e=>{abort(e);active=null;item.reject(e);closed.reject(e);notify();});
  }catch(e){abort(e);active=null;item.reject(e);closed.reject(e);}
  finally{pumping=false;}
 }
 return Object.freeze({
  guard,
  async enter(index,stage){
   owner(index);guard();const at=PRIVATE_COHORT_STAGES.indexOf(stage);assert.ok(at>=0,'PC24_STAGE');
   assert.ok(!completed[index].has(stage),'PC24_STAGE_ALREADY_COMPLETED');
   assert.ok(at===0||completed[index].has(PRIVATE_COHORT_STAGES[at-1]),'PC24_STAGE_CAUSAL_ORDER');
   assert.ok(!active||active.owner!==index,'PC24_STAGE_ALREADY_ACTIVE');
   const key=`${index}:${at}`;assert.equal(waiting.has(key),false,'PC24_STAGE_ALREADY_QUEUED');
   const item=deferred();waiting.set(key,item);void pump();await item.promise;guard();
   assert.ok(active?.owner===index&&active.stage===stage,'PC24_STAGE_LEASE_REQUIRED');
  },
  assertActive(index,stage){owner(index);guard();assert.ok(active?.owner===index&&active.stage===stage&&!active.finished,'PC24_STAGE_LEASE_REQUIRED');},
  async finish(index,stage){
   owner(index);guard();assert.ok(active?.owner===index&&active.stage===stage&&!active.finished,'PC24_STAGE_LEASE_REQUIRED');
   const lease=active;completed[index].add(stage);
   try{await onCompletion(index,stage);guard();lease.finished=true;lease.release.resolve();await lease.closed.promise;}
   catch(e){abort(e);lease.release.reject(e);await lease.closed.promise.catch(()=>{});throw e;}
  },
  /** Stop queued work without destroying the surviving original operation host.
   * An active invocation must unwind itself before releasing its lease. */
  abort,
  async fail(index,reason){
   owner(index);const failure=abort(reason);
   if(active?.owner===index){const lease=active;lease.release.reject(failure);await lease.closed.promise.catch(()=>{});}
   throw failure;
  },
  async idle(){while(active||waiting.size){await new Promise(resolve=>listeners.add(resolve));}},
  completion(index){owner(index);return Object.freeze(Object.fromEntries(PRIVATE_COHORT_STAGES.map(stage=>[stage,completed[index].has(stage)])));},
  // Trusted operational audit only. Never include this in a client response.
  auditOrder(){return PRIVATE_COHORT_STAGES.map((stage,i)=>({stage,order:[...orders[i]]}));},
 });
}

const PHASE_CALLS=Object.freeze({
 reservation:['prepare','prepareReserve','authorize','releaseOwner','reserve'],
 sol:['readiness:sol','execute:sol','join'],
 btc:['readiness:btc','execute:btc'],
 settlement:['terminal','permit:sol','permit:btc','claim','verifyCompletion','retireSettledProcesses'],
});

/** Add barriers around the unmodified operation host. No argument is decoded,
 * cloned, archived, or shared with the other participant. Native receipts and
 * witness packages remain entirely within each original host and authority. */
export function wrapPrivateCohortOperationHost(host,{gate,ownerIndex,onExposure=()=>{}}){
 owner(ownerIndex);const positions=Object.fromEntries(PRIVATE_COHORT_STAGES.map(stage=>[stage,0]));
 const wrappers={};
 for(const [stage,calls]of Object.entries(PHASE_CALLS))for(let i=0;i<calls.length;i++){
  const [name,role]=calls[i].split(':');if(wrappers[name])continue;
  wrappers[name]=async(...args)=>{
   const key=role?`${name}:${args[0]}`:name;
   const currentStage=PRIVATE_COHORT_STAGES.find(s=>PHASE_CALLS[s].includes(key));
   assert.ok(currentStage,'PC24_HOST_OPERATION');
   const plan=PHASE_CALLS[currentStage],at=positions[currentStage];
   assert.equal(plan[at],key,'PC24_HOST_CAUSAL_SEQUENCE');
   try{
    if(at===0)await gate.enter(ownerIndex,currentStage);else gate.assertActive(ownerIndex,currentStage);
    if(name==='reserve'||name==='execute'||name==='claim')await onExposure(ownerIndex,name,name==='execute'?args[0]:null);
    const result=await host[name](...args);positions[currentStage]++;
    if(positions[currentStage]===plan.length)await gate.finish(ownerIndex,currentStage);
    return result;
   }catch(e){return gate.fail(ownerIndex,e);}
  };
 }
 // This assertion also runs between stages. Keep the original host assertion,
 // but do not acquire a new lease or weaken its owner-exit checks.
 wrappers.assertOwnerExited=async(...args)=>{gate.guard();return host.assertOwnerExited(...args);};
 return new Proxy(host,{get(target,key){return wrappers[key]??Reflect.get(target,key,target);}});
}
