import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readBitcoinFeeRateV1} from '../../src/native-wallet/bitcoin-fee-rate-v1.mjs';
import {nativePublicNetworksV1} from '../../src/native-wallet/networks-v1.mjs';
import {publicPagedTestnetNetworksV1} from '../../src/chains/public-testnet/profile-v1.mjs';
import {publicPagedNativeAdapterV1} from '../../src/chains/public-testnet/adapters-v1.mjs';
import {publicPagedAccountFromKeyV1,validatePublicPagedPreparedV1} from '../../src/chains/public-testnet/wire-v1.mjs';
import {bitcoinScriptV1} from '@lianum/crypto/native-wallet-v1';

const config=()=>nativePublicNetworksV1({networks:[{id:'bitcoin-testnet',endpoint:'https://mempool.space/testnet/api',feeProvider:'MEMPOOL'}]})[0];
const response=value=>Response.json(value),text=value=>new Response(value),unavailable=()=>new Response('',{status:503,headers:{'retry-after':'0'}});

test('Mempool fee503 uses one bounded alternative fee read after checking the same genesis',async t=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(options.method,'GET');calls.push(url);if(url.includes('mempool.space'))return unavailable();if(url.endsWith('/block-height/0'))return text(config().network.genesisHash);return response({'6':1.012});});
 assert.equal(await readBitcoinFeeRateV1(config()),1.012);
 assert.deepEqual(calls,[...Array(3).fill('https://mempool.space/testnet/api/v1/fees/recommended'),'https://blockstream.info/testnet/api/block-height/0','https://blockstream.info/testnet/api/fee-estimates']);
});

test('fee fallback never accepts another network genesis',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(url)=>{calls.push(url);return url.includes('mempool.space')?unavailable():text('0'.repeat(64));});
 await assert.rejects(readBitcoinFeeRateV1(config()),/NETWORK_IDENTITY/);assert.equal(calls.length,4);assert.ok(!calls.some(url=>url.endsWith('/fee-estimates')));
});

test('persistent alternative fee failure stops after its original bounded GET attempts',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async(url)=>{calls++;return url.endsWith('/block-height/0')?text(config().network.genesisHash):unavailable();});
 await assert.rejects(readBitcoinFeeRateV1(config()),{code:'NATIVE_WALLET_HTTP_STATUS',httpStatus:503});assert.equal(calls,7);
});

test('invalid fee data cannot silently select a second provider or a default fee',async t=>{
 for(const value of [0,-1,10001,'2',null]){
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return response({hourFee:value});});
  await assert.rejects(readBitcoinFeeRateV1(config()),/BTC_FEE_ESTIMATE/);assert.equal(calls,1);
 }
});

test('fee fallback is restricted to approved public routes and transient HTTP statuses',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return unavailable();});
 await assert.rejects(readBitcoinFeeRateV1({...config(),endpoint:'https://private-provider.example/api'}),{httpStatus:503});assert.equal(calls,3);
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('',{status:403});});
 await assert.rejects(readBitcoinFeeRateV1(config()),{httpStatus:403});assert.equal(calls,4);
});

test('cancelled fee preparation cannot enter the alternative provider',async t=>{
 const controller=new AbortController();let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;controller.abort();return unavailable();});
 await assert.rejects(readBitcoinFeeRateV1(config(),controller.signal),{code:'NATIVE_WALLET_CANCELLED'});assert.equal(calls,1);
});

test('PAEG BTC preparation binds the fallback fee and preserves the existing financial ceiling',async t=>{
 // Explicit synthetic public account and previous transaction, never live keys.
 const own=publicPagedAccountFromKeyV1('bitcoin-testnet',new Uint8Array(32).fill(1)),other=publicPagedAccountFromKeyV1('bitcoin-testnet',new Uint8Array(32).fill(2)),script=bitcoinScriptV1(own.address,'testnet');
 const amount=Buffer.alloc(8);amount.writeBigUInt64LE(200000n);
 const raw='0200000001'+'c'.repeat(64)+'0000000000ffffffff01'+amount.toString('hex')+'16'+script+'00000000';
 const fundingId=Buffer.from(createHash('sha256').update(createHash('sha256').update(Buffer.from(raw,'hex')).digest()).digest()).reverse().toString('hex');
 const tip='a'.repeat(64),block='b'.repeat(64),calls=[];let feeRate=1.012;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(options.method,'GET');calls.push(url);const endpoint=new URL(url),path=endpoint.pathname.replace('/testnet/api','');
  if(endpoint.hostname==='blockstream.info')return path==='/block-height/0'?text(config().network.genesisHash):response({'6':feeRate});
  if(path==='/block-height/0')return text(config().network.genesisHash);
  if(path==='/v1/fees/recommended')return unavailable();
  if(path.startsWith('/address/'))return response([{txid:fundingId,vout:0,value:200000,status:{confirmed:true,block_height:100,block_hash:block}}]);
  if(path==='/blocks/tip/hash')return text(tip);
  if(path==='/block/'+tip)return response({id:tip,height:200,timestamp:1792378800});
  if(path==='/block-height/100')return text(block);
  if(path==='/tx/'+fundingId+'/hex')return text(raw);
  if(path==='/tx/'+fundingId)return response({txid:fundingId,status:{confirmed:true,block_hash:block},vin:[{is_coinbase:false}]});
  assert.fail('unexpected read');
 });
 const adapter=publicPagedNativeAdapterV1(publicPagedTestnetNetworksV1()[1]);await adapter.identify();
 const prepared=await adapter.prepare(own,other.address,'1000','12'.repeat(32));
 assert.equal(prepared.feeAtomic,'448');assert.equal(prepared.transaction.intent.feeSatoshi,'448');assert.equal(validatePublicPagedPreparedV1(own,prepared),prepared);
 assert.ok(calls.filter(url=>url.includes('blockstream.info')).every(url=>url.endsWith('/block-height/0')||url.endsWith('/fee-estimates')),'fallback never reads or sends account transactions');
 feeRate=45;await assert.rejects(adapter.prepare(own,other.address,'1000','12'.repeat(32)),/PUBLIC_BTC_FEE_BINDING_LIMIT/);
});
