/** Arithmetic over already-observed public transfer facts. This helper issues
 * no ownership, finality, note or execution authority. Assets stay separate. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const uint=value=>{assert.ok(typeof value==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(value),'PAGED_ECONOMIC_AMOUNT');const number=BigInt(value);assert.ok(number<1n<<256n,'PAGED_ECONOMIC_AMOUNT');return number;};
export function nativeTransferConservationV3(family,input){
 assert.equal(arguments.length,2);assert.ok(['EVM','BTC','SOL'].includes(family));
 const common=['amount','fee'];const keys=family==='BTC'?[...common,'input','change']:[...common,'sourceBefore','sourceAfter','recipientBefore','recipientAfter'];assert.ok(input&&Object.getPrototypeOf(input)===Object.prototype);assert.deepEqual(Reflect.ownKeys(input).sort(),keys.sort());for(const key of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(input,key),'value'));
 const values=Object.fromEntries(Object.entries(input).map(([key,value])=>[key,uint(value)]));assert.ok(values.amount>0n&&values.fee>0n,'PAGED_ECONOMIC_POSITIVE_TRANSFER');
 if(family==='BTC')assert.equal(values.input,values.amount+values.change+values.fee,'PAGED_ECONOMIC_UTXO_CONSERVATION');
 else{assert.equal(values.sourceBefore-values.sourceAfter,values.amount+values.fee,'PAGED_ECONOMIC_SOURCE_CONSERVATION');assert.equal(values.recipientAfter-values.recipientBefore,values.amount,'PAGED_ECONOMIC_RECIPIENT_CONSERVATION');}
 return Object.freeze({status:'OBSERVED',kind:family==='BTC'?'BITCOIN_UTXO':'NATIVE_ACCOUNT',balanced:true,...input,crossAssetValueConservation:false});
}

/** Same native-value asset namespace used by evmNativeTransferNetwork. The
 * chain ID is the original local runtime's actual ID, never a public alias. */
export function pagedLocalEvmFeeAssetV3(chainId,genesisHash){
 assert.equal(arguments.length,2);assert.ok(['1','31337'].includes(chainId),'PAGED_ECONOMIC_LOCAL_EVM_CHAIN');assert.ok(typeof genesisHash==='string'&&/^0x[0-9a-f]{64}$/.test(genesisHash)&&genesisHash!=='0x'+'0'.repeat(64),'PAGED_ECONOMIC_LOCAL_EVM_GENESIS');
 const nativeAssetId=`eip155:${chainId}/genesis:${genesisHash}/native`;
 return createHash('sha256').update('LIANUM/native-value-asset/1\0'+JSON.stringify({nativeAssetId})).digest('hex');
}
