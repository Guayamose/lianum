/** Arithmetic fixtures only; no runtime ownership, RPC, proof or acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeTransferConservationV3,pagedLocalEvmFeeAssetV3} from '../../src/providers/paged-native-economic-balance-v3.mjs';
import {evmNativeTransferNetwork} from '../../src/chains/evm/observations/evm-native-transfer-observer.mjs';
test('native conservation preserves each asset and rejects fee, change and recipient mismatches',()=>{
 const account={amount:'1000000',fee:'5000',sourceBefore:'2000000',sourceAfter:'995000',recipientBefore:'0',recipientAfter:'1000000'};
 for(const family of ['EVM','SOL']){assert.equal(nativeTransferConservationV3(family,account).balanced,true);assert.equal(nativeTransferConservationV3(family,account).crossAssetValueConservation,false);assert.throws(()=>nativeTransferConservationV3(family,{...account,fee:'5001'}),/PAGED_ECONOMIC_SOURCE_CONSERVATION/);assert.throws(()=>nativeTransferConservationV3(family,{...account,recipientAfter:'1000001'}),/PAGED_ECONOMIC_RECIPIENT_CONSERVATION/);}
 const utxo={input:'1250',amount:'1000',change:'200',fee:'50'};assert.equal(nativeTransferConservationV3('BTC',utxo).balanced,true);assert.throws(()=>nativeTransferConservationV3('BTC',{...utxo,change:'201'}),/PAGED_ECONOMIC_UTXO_CONSERVATION/);assert.throws(()=>nativeTransferConservationV3('BTC',{...utxo,fee:'49'}),/PAGED_ECONOMIC_UTXO_CONSERVATION/);
 for(const value of ['-1','0.1','01',String(1n<<256n)])assert.throws(()=>nativeTransferConservationV3('BTC',{...utxo,amount:value}),/PAGED_ECONOMIC_AMOUNT/);
});

test('local gas asset uses the original chain ID and genesis in the canonical native namespace',()=>{const genesis='0x'+'a'.repeat(64);assert.equal(pagedLocalEvmFeeAssetV3('1',genesis),evmNativeTransferNetwork({chain:'ethereum',genesisHash:genesis}).nativeAssetCommitment);assert.notEqual(pagedLocalEvmFeeAssetV3('31337',genesis),pagedLocalEvmFeeAssetV3('1',genesis));assert.notEqual(pagedLocalEvmFeeAssetV3('31337',genesis),pagedLocalEvmFeeAssetV3('31337','0x'+'b'.repeat(64)));assert.throws(()=>pagedLocalEvmFeeAssetV3('8453',genesis),/PAGED_ECONOMIC_LOCAL_EVM_CHAIN/);});
