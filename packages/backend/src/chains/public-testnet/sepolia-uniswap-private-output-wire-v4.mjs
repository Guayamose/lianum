/** Exact type-2 wire validation ONLY. Original Mixed READY, target D27 and
 * protected-key/one-queue issuance are mandatory elsewhere and absent here.
 * This codec intentionally exports no sign, send or authority issuer. */
import assert from 'node:assert/strict';
import {sepoliaSourceCallUnsignedV4,validateSepoliaSourceCallWireV4} from '@lianum/crypto/sepolia-source-wire-v4';
import {encodeSepoliaUniswapPrivateOutputCallV4} from './sepolia-uniswap-private-output-codec-v4.mjs';
function exactIntent(raw,delivery){
 const encoded=encodeSepoliaUniswapPrivateOutputCallV4(delivery);assert.equal(raw.profile,'ORIGINAL_PAGED_SEPOLIA_SOURCE_CALL_V4');assert.equal(raw.chainId,'11155111');assert.equal(raw.to,'0x'+delivery.plan.identity.router);assert.equal(raw.value,encoded.transactionValueWei,'SEPOLIA_UNISWAP_NATIVE_VALUE');assert.equal(raw.calldata,encoded.calldata,'SEPOLIA_UNISWAP_ORIGINAL_CALL_BYTES');return encoded;
}
export function prepareSepoliaUniswapPrivateOutputUnsignedV4(raw,delivery){assert.equal(arguments.length,2);exactIntent(raw,delivery);return Object.freeze({...sepoliaSourceCallUnsignedV4(raw),profile:'SEPOLIA_UNISWAP_UNSIGNED_TRANSPORT_DATA_V4',signingAuthorized:false});}
export function validateSepoliaUniswapPrivateOutputWireV4(raw,delivery,sender,wire){assert.equal(arguments.length,4);const encoded=exactIntent(raw,delivery);assert.equal(sender,'0x'+delivery.plan.identity.solver);return Object.freeze({...validateSepoliaSourceCallWireV4(raw,sender,wire),profile:'SEPOLIA_UNISWAP_SIGNED_TRANSPORT_DATA_V4',descriptor:encoded.descriptor,ownerOutput:encoded.ownerOutput,dispatchAuthorized:false,privateBalanceCredited:false});}
