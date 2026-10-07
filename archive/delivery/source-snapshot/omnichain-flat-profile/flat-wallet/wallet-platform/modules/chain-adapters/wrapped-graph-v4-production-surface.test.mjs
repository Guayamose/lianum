/** Unmocked production import/negative boundaries. No native factory starts. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import * as Gate from './wrapped-claim-graph-dispatch-gate-v1.mjs';import * as Evm from './owned-evm-v2-runtime.mjs';import * as Tron from './owned-tron-native-value-runtime.mjs';
import * as Operators from '../ops/wrapped-claim-graph-operators-v1.mjs';import * as Combined from '../ops/wrapped-claim-combined-operators-v1.mjs';
import * as Owner from './wrapped-claim-dispatch-owner-v1.mjs';import * as Release from '../ops/wrapped-claim-release-v1.mjs';
const source=name=>readFileSync(new URL(name,import.meta.url),'utf8');
test('actual GRAPH operation/result/key consumer APIs exist and unknown public objects grant no authority',async()=>{
 for(const token of [undefined,null,{},Object.freeze({profile:'OWNED_WRAPPED_GRAPH_NATIVE_OPERATION_V4'}),new Proxy({},{}),{assertBeforeKey(){assert.fail();}}]){
  assert.throws(()=>Gate.readWrappedGraphDispatchOperationV4(token),/ORIGINAL_DISPATCH_OPERATION_REQUIRED/);
  assert.throws(()=>Evm.readOwnedEvmWrappedGraphOperationV4(token,{},{}),/ORIGINAL_NATIVE_OPERATION_REQUIRED/);
  assert.throws(()=>Tron.readOwnedTronWrappedGraphOperationV4(token,{},{}),/ORIGINAL_NATIVE_OPERATION_REQUIRED/);
  assert.throws(()=>Gate.consumeWrappedGraphDispatchAuthorityV4(token,'native-key',{}, {},{},null),/PRIVATE_AUTHORITY_REQUIRED/);
  assert.throws(()=>Gate.consumeWrappedGraphProviderAuthorityV4(token,{},{},{},{}),/PRIVATE_AUTHORITY_REQUIRED/);
  assert.throws(()=>Operators.issueWrappedGraphDispatchHealthV4({}, {poolIndex:0,validUntil:'1'},token),/OWNED_QUORUM/);
  assert.throws(()=>Operators.validateWrappedGraphOriginalAuthorizationV4({},token),/ORIGINAL_AUTHORIZATION_REQUIRED/);
  assert.throws(()=>Operators.consumeWrappedGraphOriginalAuthorizationV4(token,{},{}),/PRIVATE_ORIGINAL_LEASE_REQUIRED/);
 }
 assert.equal(Combined.signWrappedGraphAuthorizationV1,undefined,'NO_WRAPPED_LEGACY_KEY_ROUTE');
 for(const name of ['signWrappedGraphAuthorizationV4','consumeWrappedGraphOperatorKeyLeaseV4'])assert.equal(typeof(name.startsWith('sign')?Combined:Operators)[name],'function',name);
});
test('actual original provider and runtime gate factories reject substitutes before any side effect',async()=>{
 let touched=0;const trap=new Proxy({}, {get(){touched++;throw Error('UNEXPECTED_NATIVE_ACCESS');}});
 await assert.rejects(Gate.createOwnedNativeValueProvider({runtime:{},system:{},poolIndex:0,dispatchLease:trap}),/OWNED_DEPLOYMENT/);
 await assert.rejects(Owner.openNativeValueDispatchLease(trap,{runtime:{},system:{},poolIndex:0},{}),/ORIGINAL_DISPATCH_LEASE/);
 assert.equal(touched,0);
});
test('native/provider codecs finish before the fixed synchronous V4 consumption and terminal key seams',()=>{
 const evm=source('./owned-evm-v2-runtime.mjs'),tron=source('./owned-tron-native-value-runtime.mjs'),owner=source('./wrapped-claim-dispatch-owner-v1.mjs');
 const e=evm.slice(evm.indexOf('const dispatchNativeValueV1 ='),evm.indexOf('/** Only the exact immutable preparation delivered'));
 assert.match(e,/wrappedV4 = wrapped\.isWrappedClaimGraphDispatchRequestV1\(scopedRequest\)/);
 assert.ok(e.indexOf('encodeCanonicalEvmUnsignedTransaction(prepared.transaction)')<e.indexOf("consumeWrappedGraphDispatchAuthorityV4(authority, 'native-key'"));
 assert.match(e,/terminalV4\(wrapped\.consumeWrappedGraphDispatchAuthorityV4\(authority, 'send'/);
 assert.match(e,/finally \{ if \(operationV4\) wrappedGraphOperationsV4.delete\(operationV4\)/);
 assert.match(tron,/WRAPPED_GRAPH_ORIGINAL_NATIVE_PHASE_REQUIRED/);assert.match(tron,/wrappedGraphOperationsV4.delete\(operationV4\)/);
 const p=owner.slice(owner.indexOf('signDispatchOnce(statement,authority,operation)'),owner.indexOf('observeOriginal:'));
 assert.ok(p.indexOf('nativeDispatchStatementFrame(statement)')<p.indexOf('consumeWrappedGraphProviderAuthorityV4('));
 assert.ok(!/await\s/.test(p));assert.ok(p.indexOf('elapsed<30000')<p.indexOf('return signature(key,frame)'));
});
test('all original wrapped release gates remain null and each stage durably retains the exact original authorization',()=>{
 for(const [name,value] of Object.entries(Release))if(name.includes('RELEASE')&&!name.includes('SCHEMA'))assert.equal(value,null,name);
 const gate=source('./wrapped-claim-graph-dispatch-gate-v1.mjs');assert.match(gate,/CURRENT_CHECKED_V4/);
 assert.ok(gate.indexOf("await append(operation?'CURRENT_CHECKED_V4'")<gate.indexOf('validateWrappedGraphOriginalAuthorizationV4(quorum,permit)'));
 assert.ok(gate.indexOf('validateWrappedGraphOriginalAuthorizationV4(quorum,permit)')<gate.indexOf('authoritiesV4.set(token,'));
 assert.match(gate,/WRAPPED_GRAPH_ORIGINAL_RETAINED_PHASE/);assert.match(gate,/WRAPPED_GRAPH_AUTHORITY_PROVIDER_OWNER/);
});
