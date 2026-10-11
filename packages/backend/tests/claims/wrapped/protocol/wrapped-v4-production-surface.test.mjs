/** Unmocked production import/API refusal checks. No factory is permitted to
 * pass its original identity boundary, generate a key, or start a native node. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Wrapped from '../../../../src/claims/wrapped/controller/wrapped-controller-v1.mjs';
import * as Native from '../../../../src/claims/controller/controller.mjs';
import * as Dispatch from '../../../../src/claims/payouts/payout-controller-dispatch-v1.mjs';
import * as Operators from '../../../../src/claims/wrapped/operations/wrapped-operators-v1.mjs';
import * as Combined from '../../../../src/operations/operators/wrapped/wrapped-claim-combined-operators-v1.mjs';
import * as Graph from '../../../../src/operations/operators/wrapped/wrapped-claim-graph-operators-v1.mjs';
import * as Bootstrap from '../../../../src/operations/operators/wrapped/wrapped-claim-operator-bootstrap-v1.mjs';

test('actual wrapped factories expose existing APIs and reject fake construction before any key/runtime work',async()=>{
  for(const [module,name] of [[Wrapped,'createWrappedNativeClaimControllerV1'],[Combined,'createCombinedWrappedClaimOperatorV1'],
    [Operators,'createClaimOperatorQuorum'],[Operators,'createScopedClaimOperator'],[Graph,'createScopedWrappedClaimGraphOperatorV1'],
    [Bootstrap,'createWrappedClaimOperatorBootstrapV1']])assert.equal(typeof module[name],'function',name);
  await assert.rejects(Wrapped.createWrappedNativeClaimControllerV1({}));
  await assert.rejects(Bootstrap.createWrappedClaimOperatorBootstrapV1({runtime:{},nativeRuntimes:[],custodyBootstrap:{}}),/OWNED|ORIGINAL|BOOTSTRAP/);
  assert.throws(()=>Combined.createCombinedWrappedClaimOperatorV1({}),/PRIVATE_OPERATOR_CONSTRUCTION/);
  assert.throws(()=>Operators.createScopedClaimOperator({signerIndex:0},{}),/PRIVATE_CUSTODY/);
  assert.throws(()=>Graph.createScopedWrappedClaimGraphOperatorV1({signerIndex:0},{}),/PRIVATE_CUSTODY/);
  assert.throws(()=>Operators.createClaimOperatorQuorum({operators:[{},{},{}]}),/OWNED_OPERATOR/);
});

test('unmocked wrapper consumers reject shape, callback, proxy and legacy-name lookalikes without any fallback',async()=>{
  for(const token of [undefined,null,true,{},Object.freeze({profile:'WRAPPED_CLAIM_ORIGINAL_NATIVE_KEY_AUTHORITY_V4'}),
    Object.freeze({profile:'CLAIM_ORIGINAL_NATIVE_KEY_AUTHORITY_V4'}),new Proxy({},{}),{assertBeforeKey(){assert.fail('CALLER_CALLBACK');}}]){
    assert.equal(Wrapped.isWrappedClaimOriginalKeyAuthorityV4(token),false);
    assert.equal(Native.isNativeClaimOriginalKeyAuthorityV4(token),false);
    assert.throws(()=>Wrapped.consumeWrappedClaimOriginalKeyAuthorityV4(token,'payout',()=>{},'g','redeem',{}),/AUTHORITY_V4_REQUIRED/);
    assert.throws(()=>Dispatch.consumeNativeClaimOriginalKeyAuthorityV4(token,'payout',()=>{},'g','redeem',{}),/AUTHORITY_V4_REQUIRED/);
    assert.throws(()=>Dispatch.authorizeNativeClaimBitcoinPayoutLatch(token,{},{}),/PRIVATE_SEND_TOKEN_REQUIRED/);
    assert.throws(()=>Dispatch.openNativeClaimSolanaPayoutAuthority(token,()=>{},'g',{},{}),/PRIVATE_PAYOUT_AUTHORITY_REQUIRED/);
    assert.throws(()=>Operators.openWrappedClaimOriginalAuthorizationLeaseV4(token,{},{}),/PRIVATE_ORIGINAL_LEASE_REQUIRED/);
    await assert.rejects(Wrapped.createClaimEvmDispatchRequest(token),/PRIVATE_DISPATCH_TOKEN_REQUIRED/);
  }
});

test('original controller namespaces expose no caller-accessible issuer or authority setter',()=>{
  for(const namespace of [Wrapped,Native])for(const name of Object.keys(namespace))
    assert.doesNotMatch(name,/^(?:mint|register|set.*Authority|create.*KeyAuthority)/i);
});
