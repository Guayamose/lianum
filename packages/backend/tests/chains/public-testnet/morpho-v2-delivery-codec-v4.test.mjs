import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePrivateExternalDelivery,encodePrivateExternalDelivery,decodePrivateExternalDeliveryCall} from '@lianum/engine/encoding/private-external-delivery';
import {encodeDepositIntentInputs} from '@lianum/engine/execution/inputs/deposit-intent';
// Pure codec DATA only: no witness/signature, dispatch cap, proof acceptance,
// chain receipts or original note owner are manufactured by this test.
const identity={chainId:'11155111',...Object.fromEntries(['router','solver','inputAsset','outputAsset','protocol','targetPool'].map((k,i)=>[k,(i+1).toString(16).repeat(40)])),...Object.fromEntries(['inputCode','outputCode','protocolCode','poolCode','scope','policy'].map((k,i)=>[k,(i+1).toString(16).repeat(64)]))};identity.protocol=identity.outputAsset;
const amount='1000000000000000000',statement={scope:identity.scope,policy:identity.policy,validFrom:'1',validUntil:'900',amount,output:'7'.repeat(64)},ownerPublicInputs=encodeDepositIntentInputs(statement),base={identity,fee:null,route:{maximumInput:'1000150',outputAmount:amount,validFrom:'10',validUntil:'600'},ownerPublicInputs};
test('MorphoVaultV2 code binds exact shares18 and assets6 without silent scaling or V1 relabelling',()=>{
 const v2={...base,protocolKind:'MORPHO_VAULT_V2_EXACT_SHARE_MINT'},v1={...base,protocolKind:'METAMORPHO_V1_EXACT_SHARE_MINT'},prepared=preparePrivateExternalDelivery(v2),encoded=encodePrivateExternalDelivery({plan:v2,receiptCommitment:'8'.repeat(64),proof:'01'});
 assert.equal(prepared.outputAmount,amount);assert.equal(prepared.maximumInput,'1000150');assert.notEqual(prepared.descriptor,preparePrivateExternalDelivery(v1).descriptor);
 const read=decodePrivateExternalDeliveryCall({calldata:encoded.calldata,identity,protocolKind:v2.protocolKind,fee:null});assert.equal(read.plan.route.outputAmount,amount);assert.equal(read.plan.route.maximumInput,'1000150');assert.equal(read.chainInclusionEstablished,false);
 assert.throws(()=>decodePrivateExternalDeliveryCall({calldata:encoded.calldata,identity,protocolKind:v1.protocolKind,fee:null}),/EXACT_EXTERNAL_DESCRIPTOR/);
 assert.throws(()=>preparePrivateExternalDelivery({...v2,route:{...v2.route,outputAmount:'18446744073709551616'}}));
});
