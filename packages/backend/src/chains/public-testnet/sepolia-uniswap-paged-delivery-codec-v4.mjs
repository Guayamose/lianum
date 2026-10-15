/** PUBLIC Router02 framing for the unchanged PAEG native action. This pure
 * codec confers no original READY, D27 owner, quote, signer or receipt grant. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectSepoliaUniswapCallWireDataV4} from '@lianum/crypto/sepolia-uniswap-call-wire-v4';
import {nativeCustodyCommitment} from '@lianum/engine/native/native-receipt-binding';
import {evmFundingEndpointCommitment} from '../evm/dispatch/evm-facts-binding.mjs';
import {prepareSepoliaUniswapPrivateOutputPlanV4,encodeSepoliaUniswapPrivateOutputCallV4,decodeSepoliaUniswapPrivateOutputCallV4} from './sepolia-uniswap-private-output-codec-v4.mjs';

const KEYS=['genesis','sourceDomain','sourceAssetIdentity','targetLedgerNamespace','targetAssetIdentity','targetPlanSHA256'];
const exact=(value,keys)=>{assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype);assert.deepEqual(Reflect.ownKeys(value).sort(),keys.slice().sort());for(const key of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'),'PUBLIC_UNISWAP_PAGED_CODEC_DATA');};
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;},sha=v=>createHash('sha256').update(v).digest('hex');
function framing(parts){return Buffer.concat(parts.flatMap(part=>{const size=Buffer.alloc(4);size.writeUInt32BE(part.length);return[size,part];}));}
export function prepareSepoliaUniswapPagedDeliveryDescriptorV4(raw){
 assert.equal(arguments.length,1);exact(raw,['profile','context','plan']);assert.equal(raw.profile,'PUBLIC_SEPOLIA_UNISWAP_PAGED_DELIVERY_DATA_V4');exact(raw.context,KEYS);
 for(const key of KEYS){assert.match(raw.context[key],/^[0-9a-f]{64}$/);assert.notEqual(raw.context[key],'0'.repeat(64));}assert.equal(raw.context.genesis,'25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9');assert.notEqual(raw.context.sourceAssetIdentity,raw.context.targetAssetIdentity);
 const plan=prepareSepoliaUniswapPrivateOutputPlanV4(raw.plan),parts=[Buffer.from('LIANUM/PAEG/uniswap-router02-sepolia-private-output/4'),...KEYS.map(key=>Buffer.from(raw.context[key],'hex')),Buffer.from(plan.descriptor,'hex')],destinationCommitment=sha(framing(parts)),sourceCommitment=evmFundingEndpointCommitment({genesis:raw.context.genesis,asset:raw.context.targetAssetIdentity,address:raw.plan.identity.solver});
 return freeze({profile:raw.profile,context:structuredClone(raw.context),plan:structuredClone(raw.plan),descriptorCommitment:destinationCommitment,sourceCommitment,destinationCommitment,custodyCommitment:nativeCustodyCommitment({family:'3',genesis:raw.context.genesis,asset:raw.context.targetAssetIdentity,sourceCommitment,destinationCommitment}),amount:plan.outputAmount,maximumInputWei:plan.maximumInput,dispatchAuthorized:false,financialAcceptance:false});
}
/** A signed transaction is mechanically bound to the exact descriptor and
 * receipt commitment; it is not evidence of inclusion or private credit. */
export function validateSepoliaUniswapPagedDeliveryWireV4(nativeWire,raw){
 assert.equal(arguments.length,2);exact(raw,['descriptor','receiptCommitment','proof']);assert.match(nativeWire,/^0x02[0-9a-f]+$/);const descriptor=prepareSepoliaUniswapPagedDeliveryDescriptorV4(raw.descriptor),expected=encodeSepoliaUniswapPrivateOutputCallV4({plan:descriptor.plan,receiptCommitment:raw.receiptCommitment,proof:raw.proof}),transaction=inspectSepoliaUniswapCallWireDataV4(nativeWire,{from:'0x'+descriptor.plan.identity.solver,to:'0x'+descriptor.plan.identity.router,value:expected.transactionValueWei,data:expected.calldata});
 const decoded=decodeSepoliaUniswapPrivateOutputCallV4({calldata:transaction.calldata,identity:descriptor.plan.identity});assert.deepEqual(decoded.plan,descriptor.plan);assert.equal(decoded.receiptCommitment,raw.receiptCommitment);assert.equal(decoded.proof,raw.proof);
 return freeze({profile:'PUBLIC_SEPOLIA_UNISWAP_PAGED_SIGNED_WIRE_DATA_V4',nativeId:transaction.nativeId,transactionSHA256:transaction.transactionSHA256,effectIndex:'0',sourceCommitment:descriptor.sourceCommitment,destinationCommitment:descriptor.destinationCommitment,custodyCommitment:descriptor.custodyCommitment,amount:descriptor.amount,maximumInputWei:descriptor.maximumInputWei,financialAcceptance:false});
}
