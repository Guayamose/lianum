/** Actual empty original local ledger only. No user/provider testnet funds,
 * Paged proof, accepted grant, public deployment or financial closure. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createOwnedPagedObservedHubEvmV4,assertOwnedPagedObservedHubEvmV4}
 from '../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {prepareOriginalDevicePagedPublicTestnetNativeGraphOperatorV4}
 from '../../../src/operations/local/funded-paged-public-testnet-native-graph-operator-v4.mjs';

test('fixed Paged observed hub owns a real clock and rejects caller-selected routes, copies and time',async()=>{
 await assert.rejects(createOwnedPagedObservedHubEvmV4({clock:'1900000000'}),/PAGED_OBSERVED_HUB_FIXED_BIRTH/);
 let runtime,pid;
 try{
  runtime=await createOwnedPagedObservedHubEvmV4();pid=runtime.metadata.processId;
  assert.equal(assertOwnedPagedObservedHubEvmV4(runtime),runtime);assert.equal('advanceTo' in runtime,false);
  assert.throws(()=>assertOwnedPagedObservedHubEvmV4({...runtime}),/PAGED_OBSERVED_HUB_ORIGINAL_REQUIRED/);
  const first=await runtime.block(),nonce=await runtime.nonce(runtime.accounts[0],'pending');
  const wall=Math.floor(Date.now()/1000);assert.ok(BigInt(first.timestamp)<=BigInt(wall)&&BigInt(wall)-BigInt(first.timestamp)<=10n);
  await assert.rejects(runtime.dispatch(Object.freeze({observedClock:true,pagedObservedV4:true,transaction:{}})),/PAGED_OBSERVED_ORIGINAL_WRAPPED_REQUEST/);
  assert.equal(await runtime.nonce(runtime.accounts[0],'pending'),nonce);assert.deepEqual(await runtime.block(),first);
  await new Promise(resolve=>setTimeout(resolve,1100));await runtime.refreshObservedClock();
  const current=await runtime.block();await runtime.assertCanonical(current);assert.ok(BigInt(current.timestamp)>BigInt(first.timestamp));
  assert.ok(BigInt(current.timestamp)<=BigInt(Math.floor(Date.now()/1000)));assert.equal(current.transactions.length,0);
  await assert.rejects(prepareOriginalDevicePagedPublicTestnetNativeGraphOperatorV4({},Object.freeze({profile:'ORIGINAL_PAGED_PUBLIC_TESTNET_PROVIDER_V4'})),/PAGED_NATIVE_PROVIDER_CLOSED/);
 }finally{await runtime?.close();}
 await assert.rejects(readFile('/proc/'+pid+'/stat'),error=>error.code==='ENOENT');
 assert.throws(()=>assertOwnedPagedObservedHubEvmV4(runtime),/CLOSED|EXIT|STOPPED|DEAD|PROCESS|ALIVE/);
});
