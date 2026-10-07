import test from 'node:test';import assert from 'node:assert/strict';import {fixture} from './wrapped-graph-v4-runtime.fixture.mjs';
for(const family of ['EVM','TRON'])test('actual '+family+' native factory + original wrapped gate/provider source consumes three original busy-phase authorities once',async()=>{
 const f=await fixture({family});try{f.c.issueHook=(_phase,_result)=>{const operation=f.c.operations.at(-1),reader=family==='EVM'?f.Evm.readOwnedEvmWrappedGraphOperationV4:f.Tron.readOwnedTronWrappedGraphOperationV4;assert.throws(()=>reader(operation,f.c.native,{}),/ORIGINAL_NATIVE_OPERATION/);assert.equal(reader(operation,f.c.native,f.c.runtimeRequest).phase,_phase);};const result=await f.provider.execute(f.data.request);assert.equal(result.phase,'BROADCAST');assert.equal(f.c.signs,1);assert.equal(f.c.providerSigns,1);assert.equal(f.c.sends,1);
 assert.deepEqual(f.c.validations.map(v=>v.phase),['native-key','provider-key','send']);
 for(const row of f.c.validations){assert.equal(row.operation.physicalState.busy,true);assert.equal(row.operation.physicalState.activeMutations,1);assert.equal(row.operation.physicalState.readsIdle,true);}
 const retained=f.c.record.state.events.filter(e=>e.kind==='CURRENT_CHECKED_V4');assert.equal(retained.length,3);retained.forEach((e,i)=>assert.deepEqual(e.data.authorization,f.c.issued[i]));
 }finally{await f.close();}
});

for(const family of ['EVM','TRON'])for(const phase of ['native-key','provider-key','send'])test(`${family} exact30s after last original authorization consumption refuses ${phase} before its key/send`,async t=>{
 const clock={now:0},mocked=t.mock.method(performance,'now',()=>clock.now),f=await fixture({family});
 try{f.c.consumeHook=purpose=>{if(purpose===phase)clock.now=30000;};await assert.rejects(f.provider.execute(f.data.request),/TOO_OLD/);
  assert.equal(f.c.signs,phase==='native-key'?0:1);assert.equal(f.c.providerSigns,phase==='send'?1:0);assert.equal(f.c.sends,0);
  if(phase==='provider-key')assert.throws(()=>f.Gate.consumeWrappedGraphProviderAuthorityV4(...f.c.lastProviderAuthority),/PRIVATE_AUTHORITY_REQUIRED/);
  else assert.throws(()=>f.Gate.consumeWrappedGraphDispatchAuthorityV4(...f.c.lastNativeAuthority),/PRIVATE_AUTHORITY_REQUIRED/);
 }finally{mocked.mock.restore();await f.close();}
});
for(const phase of ['native-key','provider-key','send'])test(`EVM physical read after final all-signer await invalidates ${phase} even if it finishes`,async()=>{
 const f=await fixture();let late;
 try{f.c.afterValidationHook=purpose=>{if(purpose===phase)queueMicrotask(()=>{late=f.c.native.block();});};
  await assert.rejects(f.provider.execute(f.data.request),/STATE_CHANGED|OPERATION_CHANGED/);await late;
  assert.equal(f.c.signs,phase==='native-key'?0:1);assert.equal(f.c.providerSigns,phase==='send'?1:0);assert.equal(f.c.sends,0);
 }finally{await f.close();}
});
for(const fault of ['copy','prepared-copy','operation-copy','runtime-copy','purpose','replay'])test(`genuine native key authority refuses ${fault} and cannot enter a later runtime attempt`,async()=>{
 const f=await fixture();try{f.c.nativeAuthorityFault='native-key';f.c.authorityFault=fault;
  await assert.rejects(f.provider.execute(f.data.request),/PRIVATE_AUTHORITY|AUTHORITY_|ORIGINAL/);assert.equal(f.c.signs,0);assert.equal(f.c.providerSigns,0);assert.equal(f.c.sends,0);
  const operation=f.c.operations[0];assert.throws(()=>f.Gate.readWrappedGraphDispatchOperationV4(operation),/ORIGINAL_DISPATCH_OPERATION/);
  await assert.rejects(f.provider.execute(f.data.request),/UNKNOWN_NATIVE_ID|NO_REPLACEMENT/);assert.equal(f.c.signs,0);
 }finally{await f.close();}
});
for(const family of ['EVM','TRON'])test(`${family} uncertain original send never creates a second native/provider key or broadcast`,async()=>{
 const f=await fixture({family});try{f.c.sendFailure=true;await assert.rejects(f.provider.execute(f.data.request),/SEND_UNCERTAIN/);
  assert.equal(f.c.signs,1);assert.equal(f.c.providerSigns,1);assert.equal(f.c.sends,1);const retained=f.provider.report();assert.equal(retained.phase,'UNKNOWN');
  await f.provider.execute(f.data.request);assert.equal(f.c.signs,1);assert.equal(f.c.providerSigns,1);assert.equal(f.c.sends,1);
 }finally{await f.close();}
});
test('provider-key private authority is original-owner/statement-bound and burns before mismatched signing',async()=>{
 const f=await fixture();try{f.c.beforeProviderConsume=args=>{args[2]=Object.freeze({});};
  await assert.rejects(f.provider.execute(f.data.request),/AUTHORITY_PROVIDER_OWNER/);assert.equal(f.c.signs,1);assert.equal(f.c.providerSigns,0);assert.equal(f.c.sends,0);
  assert.throws(()=>f.Gate.consumeWrappedGraphProviderAuthorityV4(...f.c.lastProviderAuthority),/PRIVATE_AUTHORITY_REQUIRED/);
 }finally{await f.close();}
});
test('stopping the original provider after final validation refuses the pending native key',async()=>{
 const f=await fixture();try{f.c.afterValidationHook=phase=>{if(phase==='native-key')queueMicrotask(()=>f.provider.stop());};
  await assert.rejects(f.provider.execute(f.data.request),/INACTIVE_SCOPE|CANCELLED/);assert.equal(f.c.signs,0);assert.equal(f.c.providerSigns,0);assert.equal(f.c.sends,0);
 }finally{await f.close();}
});

test('native-key original authority accepts 29999ms and later phases use independently completed original observations',async t=>{
 const clock={now:0},mocked=t.mock.method(performance,'now',()=>clock.now),f=await fixture();
 try{f.c.consumeHook=phase=>{if(phase==='native-key')clock.now=29999;};await f.provider.execute(f.data.request);
  assert.equal(f.c.signs,1);assert.equal(f.c.providerSigns,1);assert.equal(f.c.sends,1);assert.equal(f.c.validations[1].operation.nativeAuditStarted,29999);
 }finally{mocked.mock.restore();await f.close();}
});
