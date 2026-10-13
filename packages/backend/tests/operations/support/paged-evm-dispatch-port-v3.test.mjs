/** Actual fixed lifecycle composition, with inert HOST runtime/clock bodies.
 * Original provider gates reject forged requests; no resource, signer or ledger. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOriginalNativeSourceLifecycleV1,SOURCE_LIFECYCLE_LOADERS_V1,SOURCE_LIFECYCLE_DEPENDENCIES_V1} from '../../../src/operations/recovery/native-original-source-lifecycle-backend-v1.mjs';
import * as provider from '../../../src/providers/funded-paged-native-provider-v3.mjs';

test('Paged Uniswap clock reaches its committed start and rejects a late inclusion before dispatch',()=>{
 // The hub can lag the other original EVM head used when the READY action was
 // prepared. Advancing only to hub=100 leaves start=120 unexecutable.
 assert.equal(provider.pagedUniswapExecutionTimestampV3('100','120','200','220'),'120');
 assert.equal(provider.pagedUniswapExecutionTimestampV3('150','120','200','220'),'150');
 assert.equal(provider.pagedUniswapExecutionTimestampV3('120','120','200','200'),'120');
 assert.equal(provider.pagedUniswapExecutionTimestampV3('198','120','200','220'),'198');
 for(const values of [['199','120','200','220'],['200','120','200','220'],['100','199','200','220'],['100','200','200','220'],['100','120','200','199'],['0100','120','200','220'],['100','120','200','18446744073709551616'],['9007199254740991','120','9007199254740993','9007199254740993']]){
  assert.throws(()=>provider.pagedUniswapExecutionTimestampV3(...values),/PAGED_UNISWAP_EXECUTION_(?:CLOCK|WINDOW)/);
 }
});

test('the fixed Paged EVM port forwards both original gates without admitting caller requests',async()=>{
 const unused=()=>assert.fail('HOST_PAGED_DISPATCH_UNUSED_PORT');let runtimeContracts,loads=0;
 const dependencies=Object.fromEntries(SOURCE_LIFECYCLE_DEPENDENCIES_V1.map(name=>[name,unused]));
 dependencies.ROOT='/tmp/lianum-host-paged-dispatch-unused';
 dependencies.buildOwnedEvmRuntimeBackendV1=contracts=>{runtimeContracts=contracts;return Object.freeze({});};
 dependencies.buildOriginalNativeSourceClockBackendV1=()=>Object.freeze({});
 const load=Object.fromEntries(SOURCE_LIFECYCLE_LOADERS_V1.map(name=>[name,unused]));
 load.fundedPagedNativeProviderV3=async()=>{loads++;return provider;};
 buildOriginalNativeSourceLifecycleV1(Object.freeze({wrappedRecovery:Object.freeze({}),deviceSourceAuthority:Object.freeze({}),assertOwnedEvmRecoveryStateDumpV1:unused,load:Object.freeze(load),dependencies:Object.freeze(dependencies)}));
 assert.equal(loads,0,'HOST_PAGED_LOADER_MUST_STAY_LAZY');assert.ok(Object.isFrozen(runtimeContracts.dispatch));
 const port=await runtimeContracts.dispatch.paged();assert.equal(loads,1);assert.ok(Object.isFrozen(port));
 assert.deepEqual(Object.keys(port).sort(),['openOriginalPagedNativeDispatchV3','openOriginalPagedUniswapProviderDispatchV3']);
 assert.equal(port.openOriginalPagedNativeDispatchV3,provider.openOriginalPagedNativeDispatchV3);
 assert.equal(port.openOriginalPagedUniswapProviderDispatchV3,provider.openOriginalPagedUniswapProviderDispatchV3);
 for(const value of [Object.freeze(Object.create(null)),{variant:'UNISWAP',active:true},{}]){
  assert.throws(()=>port.openOriginalPagedNativeDispatchV3(value,{}),/PAGED_NATIVE_ORIGINAL_DISPATCH_REQUEST/);
  assert.throws(()=>port.openOriginalPagedUniswapProviderDispatchV3(value,{}),/PAGED_UNISWAP_ORIGINAL_DISPATCH_REQUEST/);
 }
});
