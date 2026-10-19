import {need} from './validation.mjs';
export function createAgentPushWorker({store,sender=null}){
 need(sender===null||typeof sender.send==='function','CONFIGURATION');const active=new Map();let closed=false;
 return Object.freeze({configured:Boolean(sender),
  async tick(){if(closed||!sender)return;const work=[];for(const row of store.claimPush()){
   const id=row.seq+':'+row.tokenHash;if(active.has(id))continue;const controller=new AbortController();
   const promise=(async()=>{if(!store.pushPending(row)){store.skipPush(row);return;}let result;try{result=await sender.send(row,controller.signal);}catch{result={success:false,error:'NATIVE_AGENT_PUSH_UNCONFIRMED'};}if(!controller.signal.aborted)store.finishPush(row,result);})().finally(()=>active.delete(id));active.set(id,{controller,promise});work.push(promise);
  }await Promise.allSettled(work);},
  async close(){closed=true;for(const row of active.values())row.controller.abort();await Promise.allSettled([...active.values()].map(row=>row.promise));}
 });
}
