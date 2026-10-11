/** Bounded request sender for the original SOURCE child. It never retries or
 * renews an operation; the parent owns the child and original deadline. */
import assert from 'node:assert/strict';
/** @typedef {{resolve:(value:unknown)=>void,reject:(error:unknown)=>void}} Pending */
/**
 * @param {{active:()=>unknown,deadline:number,afterGraph?:boolean}} context
 * @param {{connected:boolean,send:(packet:{sequence:number,action:string,payload:unknown},callback:(error:Error|null)=>void)=>unknown,disconnect:()=>unknown}} child
 * @param {{ended:()=>unknown,pending:Map<number,Pending>}} state
 */
export function createConfirmedSourceRequestSenderV2(context,child,state){
 let next=0;
 /** @param {string} action @param {unknown} [payload] */
 return function call(action,payload={}){
  context.active();assert.equal(state.ended(),null);assert.equal(child.connected,true);
  assert.ok(['START','AUDIT','HTTP_FAILURE','RECEIPTS','CHECKPOINT','HARD_EXIT','CLOSE',...(context.afterGraph?['PROOF_COUNT','PROOF_AT']:[])].includes(action));
  const packet={sequence:++next,action,payload};assert.ok(Buffer.byteLength(JSON.stringify(packet))<=131072);
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{state.pending.delete(packet.sequence);reject(Error('DEVICE_CONFIRMED_SOURCE_CHILD_DEADLINE'));if(child.connected)child.disconnect();},Math.max(1,Math.min(900000,context.deadline-Date.now())));
   state.pending.set(packet.sequence,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
   child.send(packet,error=>{if(error){const pending=state.pending.get(packet.sequence);state.pending.delete(packet.sequence);pending?.reject(error);}});
  });
 };
}
