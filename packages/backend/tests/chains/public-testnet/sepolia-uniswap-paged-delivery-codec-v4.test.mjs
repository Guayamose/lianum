/** Cryptographic transport binding only; proof bytes are explicitly HOST
 * framing data. This test creates no original D27/READY or public broadcast. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Transaction} from 'micro-eth-signer';
import {randomBytes} from 'node:crypto';
import {publicPagedAccountFromKeyV1} from '../../../src/chains/public-testnet/wire-v1.mjs';
import {readFixedSepoliaUniswapVenueReferencesV4} from '../../../src/chains/public-testnet/sepolia-uniswap-venue-v4.mjs';
import {encodeSepoliaUniswapPrivateOutputCallV4} from '../../../src/chains/public-testnet/sepolia-uniswap-private-output-codec-v4.mjs';
import {prepareSepoliaUniswapPagedDeliveryDescriptorV4,validateSepoliaUniswapPagedDeliveryWireV4} from '../../../src/chains/public-testnet/sepolia-uniswap-paged-delivery-codec-v4.mjs';
test('PUBLIC Router02 wire binds source/target domains, private output, receipt and exact signed type2 transaction; HOST proof transport',()=>{
 const key=randomBytes(32),solver=publicPagedAccountFromKeyV1('ethereum-sepolia',key).address.slice(2),refs=readFixedSepoliaUniswapVenueReferencesV4(),limbs=v=>Array.from({length:8},(_,i)=>BigInt('0x'+v.slice(i*8,i*8+8)).toString());
 try{
  const scope='11'.repeat(32),policy='22'.repeat(32),output='33'.repeat(32),identity={chainId:'11155111',router:'44'.repeat(20),solver,inputAsset:refs.input.address.slice(2),outputAsset:refs.venues.AAVE_USDC.output.address.slice(2),protocol:refs.router.address.slice(2),targetPool:'55'.repeat(20),inputCode:refs.input.codeSHA256,outputCode:refs.venues.AAVE_USDC.output.codeSHA256,protocolCode:refs.router.codeSHA256,poolCode:'66'.repeat(32),scope,policy},route={maximumInput:'200000000000000',outputAmount:'1000000',validFrom:'1',validUntil:'600'},plan={identity,route,ownerPublicInputs:[...limbs(scope),...limbs(policy),route.validFrom,route.validUntil,route.outputAmount,...limbs(output)]},descriptor={profile:'PUBLIC_SEPOLIA_UNISWAP_PAGED_DELIVERY_DATA_V4',context:{genesis:'25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',sourceDomain:'77'.repeat(32),sourceAssetIdentity:'88'.repeat(32),targetLedgerNamespace:'99'.repeat(32),targetAssetIdentity:'aa'.repeat(32),targetPlanSHA256:'bb'.repeat(32)},plan},intent={descriptor,receiptCommitment:'cc'.repeat(32),proof:'dd'.repeat(32)},encoded=encodeSepoliaUniswapPrivateOutputCallV4({plan,receiptCommitment:intent.receiptCommitment,proof:intent.proof}),transaction={type:'eip1559',chainId:11155111n,nonce:0n,to:'0x'+identity.router,value:BigInt(route.maximumInput),data:encoded.calldata,gasLimit:1000000n,maxFeePerGas:2n,maxPriorityFeePerGas:1n,accessList:[]},signed=Transaction.prepare(transaction).signBy(key.toString('hex')),wire=signed.toHex(),bound=validateSepoliaUniswapPagedDeliveryWireV4(wire,intent);
  assert.equal(bound.nativeId,signed.hash);assert.equal(bound.amount,'1000000');assert.equal(bound.maximumInputWei,route.maximumInput);assert.equal(bound.financialAcceptance,false);assert.notEqual(bound.sourceCommitment,bound.destinationCommitment);
  assert.throws(()=>validateSepoliaUniswapPagedDeliveryWireV4(wire,{...intent,receiptCommitment:'ff'.repeat(32)}));assert.throws(()=>validateSepoliaUniswapPagedDeliveryWireV4(wire,{...intent,proof:'ee'.repeat(32)}));
  for(const change of [{chainId:31337n},{to:'0x'+'ff'.repeat(20)},{value:1n}]){const changed=Transaction.prepare({...transaction,...change}).signBy(key.toString('hex'));assert.throws(()=>validateSepoliaUniswapPagedDeliveryWireV4(changed.toHex(),intent));}
  for(const field of ['sourceDomain','sourceAssetIdentity','targetLedgerNamespace','targetAssetIdentity','targetPlanSHA256']){const changed=structuredClone(descriptor);changed.context[field]='fe'.repeat(32);assert.notEqual(prepareSepoliaUniswapPagedDeliveryDescriptorV4(changed).destinationCommitment,bound.destinationCommitment);}
  assert.throws(()=>prepareSepoliaUniswapPagedDeliveryDescriptorV4({...descriptor,context:{...descriptor.context,genesis:'00'.repeat(32)}}));
 }finally{key.fill(0);}
});
