/** HOST: public fixture scalar and ordinary transaction bytes only. No node,
 * RPC, vault, recovery grant, native funds or financial authority is created. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeEconomicLocalAddressV2,signNativeEconomicLocalTransactionV2,
  prepareNativeEconomicLocalSignerV2,consumeNativeEconomicLocalSignerV2,revokeNativeEconomicLocalSignerV2}
  from '../../../../src/chains/evm/runtime/native-economic-local-signing-v2.mjs';
import {encodeCanonicalEvmUnsignedTransaction,decodeCanonicalEvmTransaction,assertSignedEvmTransaction}
  from '../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {publicKeccak256} from '../../../../../engine/src/cohorts/private-cohort-public-native.mjs';

// Scalar one is a public synthetic fixture, never a customer credential.
const fixtureKey=()=>Buffer.from('00'.repeat(31)+'01','hex');
const sender='0x7e5f4552091a69125d5dfcb7b8c2659029395bdf';
const transaction=()=>({chainId:'31337',nonce:'0',gasPrice:'1000000000',gas:'21000',
  from:sender,to:'0x'+'35'.repeat(20),value:'1',data:'0x'});

test('local EIP155 signatures join original public preimages, recovered sender and low-S decoder across RLP boundaries',async()=>{
  const key=fixtureKey();
  try {
    assert.equal(await nativeEconomicLocalAddressV2(key),sender);
    for(const length of [0,1,55,56]) {
      const tx={...transaction(),nonce:String(length),data:'0x'+'81'.repeat(length)};
      const result=await signNativeEconomicLocalTransactionV2(key,tx);
      assert.equal(result.unsignedWire,encodeCanonicalEvmUnsignedTransaction(tx));
      const decoded=assertSignedEvmTransaction(result.nativeWire,tx);
      assert.equal(decoded.from,sender);assert.equal(decoded.unsignedWire,result.unsignedWire);
      assert.equal(decoded.nativeId,result.nativeId);
      assert.equal(result.nativeId,'0x'+Buffer.from(publicKeccak256(Buffer.from(result.nativeWire.slice(2),'hex'))).toString('hex'));
      assert.equal(Object.isFrozen(result),true);
      assert.deepEqual(Object.keys(result).sort(),['from','nativeId','nativeWire','unsignedWire']);
      assert.deepEqual(key,fixtureKey());
    }
    // Contract creation uses the same replay-protected legacy format. The
    // retained unsigned public encoder only accepts a nonempty target, so
    // independently decode the creation wire instead of extending that API.
    const creation={...transaction(),to:null,gas:'100000',value:'0',data:'0x60006000f3'};
    const result=await signNativeEconomicLocalTransactionV2(key,creation);
    const decoded=assertSignedEvmTransaction(result.nativeWire,creation);
    assert.equal(decoded.to,null);assert.equal(decoded.unsignedWire,result.unsignedWire);
    assert.equal(decoded.chainId,'31337');assert.equal(decoded.from,sender);
  } finally {key.fill(0);}
});

test('prepared signing snapshots key and terms and revokes before synchronous one-use key release',async()=>{
  const key=fixtureKey(),tx=transaction(),expected=structuredClone(tx);
  const pending=prepareNativeEconomicLocalSignerV2(key,tx);
  key.fill(0);tx.to='0x'+'99'.repeat(20);tx.nonce='99';tx.value='99';tx.data='0xdeadbeef';
  const prepared=await pending;
  // Later caller mutation cannot select another digest, nonce or recipient.
  tx.nonce='100';tx.value='100';tx.data='0xcafe';
  const signed=consumeNativeEconomicLocalSignerV2(prepared);assert.equal(signed.then,undefined);
  assert.throws(()=>consumeNativeEconomicLocalSignerV2(prepared),/NATIVE_ECONOMIC_PREPARED_SIGNER_CLOSED_OR_USED/);
  assertSignedEvmTransaction(signed.nativeWire,expected);
  assert.equal(signed.unsignedWire,encodeCanonicalEvmUnsignedTransaction(expected));
  assert.deepEqual(key,Buffer.alloc(32));
  const held=fixtureKey();
  try {
    for(const field of ['chainId','nonce','gasPrice','gas','value','from','to','data'])
      await assert.rejects(signNativeEconomicLocalTransactionV2(held,{...expected,[field]:expected[field]+'\n'}),{name:'AssertionError'});
    for(const change of [{nonce:'00'},{gas:'0'},{chainId:'0'},{data:'0x0'},{to:'0x'+'35'.repeat(19)},{caller:true},{digest:'00'.repeat(32)}])
      await assert.rejects(signNativeEconomicLocalTransactionV2(held,{...expected,...change}),{name:'AssertionError'});
    let touched=false;const accessor={...expected};
    Object.defineProperty(accessor,'data',{enumerable:true,get(){touched=true;throw new Error('unexpected signing getter');}});
    await assert.rejects(signNativeEconomicLocalTransactionV2(held,accessor),{name:'AssertionError'});assert.equal(touched,false);
    await assert.rejects(signNativeEconomicLocalTransactionV2(held,{...expected,from:'0x'+'11'.repeat(20)}),/NATIVE_ECONOMIC_SIGNER_WRONG_ACCOUNT/);
    assert.deepEqual(held,fixtureKey());
    const closed=await prepareNativeEconomicLocalSignerV2(held,expected);
    revokeNativeEconomicLocalSignerV2(closed);
    assert.throws(()=>consumeNativeEconomicLocalSignerV2(closed),/NATIVE_ECONOMIC_PREPARED_SIGNER_CLOSED_OR_USED/);
    assert.throws(()=>consumeNativeEconomicLocalSignerV2(Object.freeze({})),/NATIVE_ECONOMIC_PREPARED_SIGNER_CLOSED_OR_USED/);
    assert.throws(()=>consumeNativeEconomicLocalSignerV2(prepared,{nonce:'100'}),{name:'AssertionError'});
    // This reader independently enforces low-S, canonical RLP and recovered
    // sender on every returned wire; no acceptance flag substitutes for it.
    assert.equal(decodeCanonicalEvmTransaction(signed.nativeWire).from,sender);
  } finally {held.fill(0);}
});
