/** Real canonical address/script DATA; no network/genesis observation,
 * private wallet, authorization or financial execution acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveNativeAccountV1,validateNativeAddressV1,bitcoinScriptV1} from '@lianum/crypto/native-wallet-v1';
import {pagedBitcoinRecipientDataValidV4} from '../src/custody/paged-bitcoin-recipient-data-v4.mjs';
import {pagedNativeRecipientV3,pagedNativePaymentDraftV3} from '../src/screens/device-paged-operation-form-v3.ts';

test('form accepts canonical testnet P2WPKH and existing LOCAL recipient without aliasing network',()=>{
 const entropy=new Uint8Array(16).fill(1);try{
  const testnet=deriveNativeAccountV1(entropy,'bitcoin-testnet'),mainnet=deriveNativeAccountV1(entropy,'bitcoin-mainnet'),local='bcrt1qpufg5vncjtnetgy4882vvvdsqtrmk96ylstvs7';
  assert.equal(validateNativeAddressV1('bitcoin-testnet',testnet.address),testnet.address);assert.match(bitcoinScriptV1(testnet.address,'testnet'),/^0014[0-9a-f]{40}$/);
  assert.equal(pagedBitcoinRecipientDataValidV4(testnet.address),true);assert.equal(pagedNativeRecipientV3('BTC',testnet.address),testnet.address);assert.equal(pagedNativeRecipientV3('BTC',local),local);assert.equal(pagedNativeRecipientV3('BTC',' '+testnet.address+' '),testnet.address);
  const configuration={networks:[{family:'BTC',decimals:8,chainDomain:'1'.repeat(64),evidencePolicy:'2'.repeat(64)}]},draft=pagedNativePaymentDraftV3(configuration,{family:'BTC',recipient:testnet.address,amount:'0.001',knownIds:[]});assert.equal(draft.intent.recipient,testnet.address);assert.equal(draft.intent.amount,'100000');
  assert.throws(()=>validateNativeAddressV1('bitcoin-mainnet',testnet.address));assert.throws(()=>validateNativeAddressV1('bitcoin-testnet',mainnet.address));assert.equal(pagedBitcoinRecipientDataValidV4(mainnet.address),false);
  const damaged=testnet.address.slice(0,-1)+(testnet.address.endsWith('q')?'p':'q');for(const value of [damaged,'tb1'+'q'.repeat(39),testnet.address.slice(0,8)+'\n'+testnet.address.slice(8),'not-an-address']){assert.equal(pagedBitcoinRecipientDataValidV4(value),false);assert.throws(()=>pagedNativeRecipientV3('BTC',value));}
 }finally{entropy.fill(0);}
});

test('same original public Bitcoin adapter rejects crossed genesis despite syntactically valid recipients',async t=>{
 const {nativePublicNetworksV1}=await import('../../../packages/backend/src/native-wallet/networks-v1.mjs'),{bitcoinWalletAdapterV1}=await import('../../../packages/backend/src/native-wallet/bitcoin-v1.mjs');
 const config=nativePublicNetworksV1({networks:[{id:'bitcoin-testnet',endpoint:'https://mempool.space/testnet/api',feeProvider:'MEMPOOL'}]})[0],mainnet=nativePublicNetworksV1({networks:[{id:'bitcoin-mainnet',endpoint:'https://mempool.space/api'}]})[0];let observed=config.network.genesisHash,calls=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{calls++;assert.equal(url,'https://mempool.space/testnet/api/block-height/0');assert.equal(options.method,'GET');return new Response(observed,{status:200});});
 const adapter=bitcoinWalletAdapterV1(config);await adapter.identify();observed=mainnet.network.genesisHash;await assert.rejects(adapter.identify(),/NETWORK_IDENTITY/);observed='0'.repeat(64);await assert.rejects(adapter.identify(),/NETWORK_IDENTITY/);assert.equal(calls,3,'each actual adapter identity read uses its configured genesis; no prefix alias');
});
