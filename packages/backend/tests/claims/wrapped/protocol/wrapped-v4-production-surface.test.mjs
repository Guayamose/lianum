/** Unmocked production import/API refusal checks. No factory is permitted to
 * pass its original identity boundary, generate a key, or start a native node. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as Wrapped from '../../../../src/claims/wrapped/controller/wrapped-controller-v1.mjs';
import * as Native from '../../../../src/claims/controller/controller.mjs';
import * as Dispatch from '../../../../src/claims/payouts/payout-controller-dispatch-v1.mjs';
import * as Gate from '../../../../src/claims/wrapped/protocol/wrapped-evm-dispatch-gate-v1.mjs';
import * as Operators from '../../../../src/claims/wrapped/operations/wrapped-operators-v1.mjs';
import * as Combined from '../../../../src/operations/operators/wrapped/wrapped-claim-combined-operators-v1.mjs';
import * as Graph from '../../../../src/operations/operators/wrapped/wrapped-claim-graph-operators-v1.mjs';
import * as Bootstrap from '../../../../src/operations/operators/wrapped/wrapped-claim-operator-bootstrap-v1.mjs';
const source=file=>readFileSync(new URL(file,import.meta.url),'utf8');

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
  for(const name of ['createClaimEvmDispatchRequest','isOwnedClaimEvmDispatchRequest','assertOwnedClaimEvmDispatchRequest'])
    assert.equal(Gate[name],Wrapped[name], 'COMPATIBILITY_FACADE_USES_ORIGINAL_CONTROLLER_AUTHORITY');
  for(const token of [undefined,null,true,{},Object.freeze({profile:'WRAPPED_CLAIM_ORIGINAL_NATIVE_KEY_AUTHORITY_V4'}),
    Object.freeze({profile:'CLAIM_ORIGINAL_NATIVE_KEY_AUTHORITY_V4'}),new Proxy({},{}),{assertBeforeKey(){assert.fail('CALLER_CALLBACK');}}]){
    assert.equal(Wrapped.isWrappedClaimOriginalKeyAuthorityV4(token),false);
    assert.equal(Native.isNativeClaimOriginalKeyAuthorityV4(token),false);
    assert.throws(()=>Wrapped.consumeWrappedClaimOriginalKeyAuthorityV4(token,'payout',()=>{},'g','redeem',{}),/AUTHORITY_V4_REQUIRED/);
    assert.throws(()=>Dispatch.consumeNativeClaimOriginalKeyAuthorityV4(token,'payout',()=>{},'g','redeem',{}),/AUTHORITY_V4_REQUIRED/);
    assert.throws(()=>Dispatch.authorizeNativeClaimBitcoinPayoutLatch(token,{},{}),/PRIVATE_SEND_TOKEN_REQUIRED/);
    assert.throws(()=>Dispatch.openNativeClaimSolanaPayoutAuthority(token,()=>{},'g',{},{}),/PRIVATE_PAYOUT_AUTHORITY_REQUIRED/);
    assert.throws(()=>Operators.openWrappedClaimOriginalAuthorizationLeaseV4(token,{},{}),/PRIVATE_ORIGINAL_LEASE_REQUIRED/);
    await assert.rejects(Gate.createClaimEvmDispatchRequest(token),/PRIVATE_DISPATCH_TOKEN_REQUIRED/);
  }
});

test('original wrapped scope migration and narrow fixed runtime routing are coherent',()=>{
  const controller=source('./wrapped-controller-v1.mjs'),gate=source('./wrapped-evm-dispatch-gate-v1.mjs'),evm=source('../chain-adapters/owned-evm-runtime-backend-v1.mjs');
  assert.match(controller,/WRAPPED_CLAIM_AUTHORIZATION_LIFECYCLE_V4/);
  assert.match(controller,/openWrappedClaimOriginalAuthorizationLeaseV4\(token, quorum, result\)/);
  assert.match(controller,/return payoutKeyAuthorityV4\(row, prepared, authorization\)/);
  assert.match(controller,/transaction, beforeSign, consumeBeforeKey, onSigned/);
  assert.match(gate,/export \{ createClaimEvmDispatchRequest, isOwnedClaimEvmDispatchRequest, assertOwnedClaimEvmDispatchRequest \} from/);
  assert.match(evm,/const claimV4 = isOwnedClaimEvmDispatchRequest\(scopedRequest\) \|\| isWrapped\(scopedRequest\)/);
  assert.doesNotMatch(source('./payout-controller-dispatch-v1.mjs'),/catch|register|UNRELEASED/);
  for(const file of ['../chain-adapters/owned-bitcoin-runtime.mjs','../chain-adapters/owned-solana-runtime.mjs'])
    assert.match(source(file),/originalKeyControllerV4 = custody \? await import\('\.\.\/native-claims\/payout-controller-dispatch-v1.mjs'\)/);
  for(const name of Object.keys(Wrapped))assert.doesNotMatch(name,/mint|register|set.*Authority|create.*KeyAuthority/i);
});

test('closed production artifacts and wallet gates remain null; no ingress key lease is invented',()=>{
  for(const file of ['../ops/wrapped-wallet-release-v1.mjs','../../../proof-workers/wrapped-claim-proof-pins-v1.mjs','../ops/wrapped-claim-release-v1.mjs']){
    const text=source(file);assert.match(text,/=\s*null/);
    for(const match of text.matchAll(/export const (\w*(?:RELEASE|PIN_SET)\w*) = ([^;]+);/g)) if(!match[1].includes('SCHEMA')) assert.equal(match[2],'null',match[1]);
  }
  const controller=source('./wrapped-controller-v1.mjs');
  assert.doesNotMatch(controller,/purpose:\s*'ingress'/);
  const ingress=controller.slice(controller.indexOf('  async function authorizeIngressBroadcast('),controller.indexOf('  async function retainedUnsentPayout('));
  assert.doesNotMatch(ingress,/originalLeaseV4|payoutKeyAuthorityV4/);
});
