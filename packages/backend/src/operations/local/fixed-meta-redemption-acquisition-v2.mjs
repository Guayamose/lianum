/** Acquire fixed Meta redemption resources before original empty pools can
 * be funded. The service retains ownership and its existing cleanup order. */
import assert from 'node:assert/strict';
/** @typedef {{head:unknown,ledger:{commitments:unknown[],nullifiers:unknown[]}}} EmptyPoolView */
/** @typedef {{read:()=>Promise<EmptyPoolView>,assertCurrent:(view:EmptyPoolView)=>Promise<unknown>}} PoolReader */
/**
 * @template {object} Runtime, System, Protocols, Account, Exit
 * @template {{close:()=>Promise<unknown>}} Adapter
 * @param {{runtime:Runtime,system:System,protocols:Protocols,targets:Account[],exits:Exit[]}} input
 * @param {{reader:(input:{runtime:Runtime,system:System,poolIndex:number})=>Promise<PoolReader>,adapter:(input:{runtime:Runtime,protocolFixture:Protocols})=>Promise<Adapter>,exit:(input:{runtime:Runtime,system:System,account:Account,protocols:Protocols,adapter:Adapter})=>Promise<Exit>}} ports
 */
export async function acquireFixedMetaRedemptionsV2(input,ports){
 const {runtime,system,protocols,targets,exits}=input;
 /** @type {{reader:PoolReader,view:EmptyPoolView}[]} */ const checks=[];
 for(const poolIndex of [0,1]){
  const reader=await ports.reader({runtime,system,poolIndex}),view=await reader.read();
  await reader.assertCurrent(view);assert.ok(view.ledger.commitments.length===0&&view.ledger.nullifiers.length===0,'META_REDEMPTION_FIXED_BEFORE_FUND');
  if(checks.length)assert.deepEqual(view.head,checks[0].view.head);checks.push({reader,view});
 }
 for(const account of targets){
  const adapter=await ports.adapter({runtime,protocolFixture:protocols});
  try{exits.push(await ports.exit({runtime,system,account,protocols,adapter}));}catch(error){await adapter.close();throw error;}
 }
 for(const {reader} of checks){const view=await reader.read();await reader.assertCurrent(view);assert.ok(view.ledger.commitments.length===0&&view.ledger.nullifiers.length===0,'META_REDEMPTION_FIXED_BEFORE_FUND');}
}
