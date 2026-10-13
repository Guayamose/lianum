/** Closed V3 adapter: the original native provider issues the request and
 * journals each key boundary; this gate retains original Uniswap/D27 guards.
 * There is no public callback, signer, runtime or permission registration. */
import assert from 'node:assert/strict';
import {LOCAL_EVM_PROFILE} from '../runtime/local-evm-profiles.mjs';
import {encodeEvmGraphDeliveryCallV1,UNISWAP_GRAPH_DELIVERY_PROFILE_V1} from './evm-graph-delivery-codec-v1.mjs';
import {validateEvmDeliveryWire} from './evm-facts-binding.mjs';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
/** Mechanical adapter only. The original native provider obtains the closed
 * source port from its private dispatch WeakMap before calling this function.
 * Caller data cannot create a provider permission, runtime or observer brand. */
export function validatePagedUniswapDispatchScopeV3(source,runtime){
 assert.equal(arguments.length,2);source.assertLive();assert.equal(source.chainId,String(runtime.metadata.chainId));
 assert.match(source.receiptKeyCommitment,/^[0-9a-f]{64}$/);
 const delivery=structuredClone(source.delivery),intent=freeze({descriptor:delivery.descriptor,receiptKeyCommitment:source.receiptKeyCommitment,proof:delivery.proof}),calldata=encodeEvmGraphDeliveryCallV1(intent);
 assert.equal(intent.descriptor.profile,UNISWAP_GRAPH_DELIVERY_PROFILE_V1);assert.equal(delivery.rule.family,'3');assert.equal(delivery.rule.asset,intent.descriptor.context.targetAssetIdentity);assert.equal(delivery.amount,intent.descriptor.plan.route.outputAmount);
 const transaction=freeze({from:'0x'+intent.descriptor.plan.identity.solver,to:'0x'+intent.descriptor.plan.identity.router,data:calldata,gas:'0x'+BigInt(LOCAL_EVM_PROFILE.maxGas).toString(16),value:'0x0'});
 assert.deepEqual(source.transaction,transaction,'PAGED_UNISWAP_ORIGINAL_CALLDATA');
 const current=async prepared=>{source.assertLive();const retained=await source.readPrepared();assert.deepEqual(retained,delivery,'PAGED_UNISWAP_ORIGINAL_PREPARATION');assert.equal(prepared.genesis,'0x'+delivery.rule.genesis);await source.assertPrepared(prepared);};
 return Object.freeze({transaction,chainId:source.chainId,receiverTimestamp:source.receiverTimestamp,
  async beforeSign(prepared){await current(prepared);return source.beforeSign(prepared);},
  async finalCurrent(token,prepared){await current(prepared);return source.finalCurrent(token,prepared);},
  consumeBeforeKey(token,prepared){source.assertLive();return source.consumeBeforeKey(token,prepared);},
  async onSigned(signed,prepared){assert.match(signed.nativeWire,/^0x(?:[0-9a-f]{2})+$/);const wire=validateEvmDeliveryWire(signed.nativeWire.slice(2),intent);assert.equal(signed.nativeId,'0x'+wire.nativeId);assert.equal(signed.transactionSHA256,wire.transactionSHA256);return source.onSigned(signed,prepared);},
  async beforeSend(signed,prepared){await current(prepared);return source.beforeSend(signed,prepared);},
 });
}
