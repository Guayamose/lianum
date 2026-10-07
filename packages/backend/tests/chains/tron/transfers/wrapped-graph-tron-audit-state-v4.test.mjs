/** Actual TRON factory with a fully inert original driver. No Java, native
 * transport, key, wire, proof, funded action or process is executed. */
import test,{mock} from 'node:test';import assert from 'node:assert/strict';
let control;
mock.module(new URL('./owned-tron-node-driver.mjs',import.meta.url).href,{exports:{
 async startFixedOwnedTronDriver(){const c=control;return {directory:'/tmp/inert-tron-no-io',metadata:{genesis:'0000000000000000'+'11'.repeat(24),solverEndpoint:'41'+'11'.repeat(20),recipientEndpoint:'41'+'22'.repeat(20)},
  assertAlive(){assert.equal(c.closed,false,'INERT_TRON_CLOSED');},async health(){await c.hold;return {genesis:'0000000000000000'+'11'.repeat(24)};},async close(){c.closed=true;}};},
 inspectOwnedTronRuntimePrerequisites(){throw Error('TEST_NO_NATIVE_PREREQUISITES');}
}});
const {createOwnedLocalTronNativeValueV1,readOwnedLocalTronNativeValueAuditStateV4,openOwnedTronOriginalReadPort}=await import('../../../../src/chains/tron/runtime/owned-tron-native-value-runtime.mjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('actual TRON private snapshot records original lifetime/read progress and rejects copies',async()=>{
 control={closed:false};const r=await createOwnedLocalTronNativeValueV1();try{
  const first=readOwnedLocalTronNativeValueAuditStateV4(r);assert.equal(first.family,'TRON');assert.ok(first.lifetimeId);assert.equal(first.readGeneration,'0');assert.equal(first.journal,null);assert.equal(first.entry,null);
  assert.ok(Object.isFrozen(first));assert.equal(first.pending,false);assert.equal(first.uncertain,false);
  assert.throws(()=>readOwnedLocalTronNativeValueAuditStateV4({...r}),/ORIGINAL_RUNTIME/);assert.throws(()=>openOwnedTronOriginalReadPort({...r},{}),/ORIGINAL_RUNTIME/);
  let release;control.hold=new Promise(resolve=>{release=resolve;});const pending=r.health();await tick();
  const active=readOwnedLocalTronNativeValueAuditStateV4(r);assert.equal(active.activeReads,1);assert.equal(active.readsIdle,false);assert.equal(active.readGeneration,'1');
  release();await pending;control.hold=null;const after=readOwnedLocalTronNativeValueAuditStateV4(r);assert.equal(after.readGeneration,'2');assert.equal(after.readsIdle,true);assert.equal(after.lifetimeId,first.lifetimeId);
  await assert.rejects(r.observeNativeValueOriginal({nativeId:'11',nativeWire:'22',transactionSHA256:'33'}),/UNKNOWN_ORIGINAL/);
  const failed=readOwnedLocalTronNativeValueAuditStateV4(r);assert.equal(failed.mutationGeneration,'1');assert.equal(failed.busy,false);assert.equal(failed.activeReads,0);assert.equal(failed.readGeneration,'4');
 }finally{await r.close();}assert.throws(()=>readOwnedLocalTronNativeValueAuditStateV4(r),/CLOSED/);
});
