/** Offline native signatures and gateway HTTP fixtures. No public broadcast,
 * faucet, phone, PAEG proof or user keys. Entropy below is an explicit test vector. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {deriveNativeAccountV1,bitcoinScriptV1,signNativeWalletTransactionV1,nativeJsonHashV1} from '@lianum/crypto/native-wallet-v1';
import {createNativeWalletGatewayV1} from '../../src/native-wallet/index.mjs';
import {ethereumWalletAdapterV1} from '../../src/native-wallet/ethereum-v1.mjs';
const entropy=new Uint8Array(32),otherEntropy=new Uint8Array(32).fill(1),hash='a'.repeat(64),fundingHash='b'.repeat(64);
const genesis={
 'ethereum-mainnet':'0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3',
 'bitcoin-mainnet':'000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
 'solana-mainnet':'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
};
const directory=()=>mkdtemp(join(tmpdir(),'lianum-public-native-fixture-'));
const configuration=id=>({networks:[{id,endpoint:'https://native-fixture.example/api'}]});
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
const text=value=>new Response(value,{status:200});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};

test('a slow account does not block another account and journal commits retain both quotes',async t=>{
 const root=await directory(),id='ethereum-mainnet',a=deriveNativeAccountV1(entropy,id),b=deriveNativeAccountV1(otherEntropy,id);
 const network=mockNetwork(t,id,a,root),fetch=globalThis.fetch,entered=deferred(),release=deferred();
 t.mock.method(globalThis,'fetch',async(url,options)=>{const request=JSON.parse(options.body);if(request.method==='eth_getBalance'&&request.params[0]===a.address){entered.resolve();await release.promise;}return fetch(url,options);});
 const gateway=await createNativeWalletGatewayV1({directory:root,configuration:configuration(id)});
 t.after(async()=>{release.resolve();await gateway.close();await rm(root,{recursive:true,force:true});});
 const first=gateway.prepareSend({account:a,recipient:b.address,amountAtomic:'1000'});await entered.promise;
 const alternate={...a,address:a.address===a.address.toLowerCase()?'0x'+a.address.slice(2).toUpperCase():a.address.toLowerCase()};assert.notEqual(alternate.address,a.address);
 const duplicate=gateway.prepareSend({account:alternate,recipient:b.address,amountAtomic:'2000'}).then(()=>null,error=>error);
 const second=await Promise.race([gateway.prepareSend({account:b,recipient:a.address,amountAtomic:'3000'}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('independent account was blocked')),2000);timer.unref();})]);
 assert.equal(second.account.address,b.address);release.resolve();const quote=await first;
 assert.match((await duplicate).message,/ACCOUNT_PENDING/);
 assert.equal((await gateway.balances(alternate)).hasPendingTransfer,true,'case variants retain the same reservation');
 const saved=JSON.parse(await readFile(join(root,'native-wallet.json'),'utf8'));
 assert.deepEqual(new Set(saved.operations.map(row=>row.quote.id)),new Set([quote.id,second.id]));
 await Promise.all([gateway.cancelQuote({id:quote.id}),gateway.cancelQuote({id:second.id})]);
 assert.ok(JSON.parse(await readFile(join(root,'native-wallet.json'),'utf8')).operations.every(row=>row.phase==='CANCELLED'));
 assert.equal(network.sends,0);
});

test('unchanged observations do not rewrite the journal and duplicate submissions send once',async t=>{
 const root=await directory(),id='ethereum-mainnet',own=deriveNativeAccountV1(entropy,id),recipient=deriveNativeAccountV1(otherEntropy,id),network=mockNetwork(t,id,own,root);
 const gateway=await createNativeWalletGatewayV1({directory:root,configuration:configuration(id)});t.after(async()=>{await gateway.close();await rm(root,{recursive:true,force:true});});
 const quote=await gateway.prepareSend({account:own,recipient:recipient.address,amountAtomic:'1000'}),signed=signNativeWalletTransactionV1(entropy,own,quote.transaction);
 const submit={quoteId:quote.id,rawTransaction:signed.rawTransaction};await Promise.all([gateway.broadcast(submit),gateway.broadcast(submit)]);assert.equal(network.sends,1);
 await gateway.observeTransfer(quote.id);const before=await readFile(join(root,'native-wallet.json'),'utf8');
 await Promise.all([gateway.observeTransfer(quote.id),gateway.observeTransfer(signed.id)]);
 assert.equal(await readFile(join(root,'native-wallet.json'),'utf8'),before);
 network.observed=true;assert.equal((await gateway.observeTransfer(quote.id)).status,'FINALIZED');
 const after=await readFile(join(root,'native-wallet.json'),'utf8');await gateway.observeTransfer(quote.id);assert.equal(await readFile(join(root,'native-wallet.json'),'utf8'),after);
});
function previousTx(account){const amount=Buffer.alloc(8);amount.writeBigUInt64LE(200000n);const script=bitcoinScriptV1(account.address,account.network),raw='0200000001'+'c'.repeat(64)+'0000000000ffffffff01'+amount.toString('hex')+'16'+script+'00000000',id=Buffer.from(createHash('sha256').update(createHash('sha256').update(Buffer.from(raw,'hex')).digest()).digest()).reverse().toString('hex');return{raw,id};}
function mockNetwork(t,id,account,root,fees=null,behavior=null){let sends=0,signed=null,observed=false,wrongGenesis=false,fakeUtxo=false;const previous=id==='bitcoin-mainnet'?previousTx(account):null;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(id==='bitcoin-mainnet'){
   const path=new URL(url).pathname.replace('/api','');
   if(path==='/block-height/0')return text(wrongGenesis?'0'.repeat(64):genesis[id]);
   if(path==='/blocks/tip/hash')return text(hash);
   if(path==='/blocks/tip/height')return text('200');
   if(path==='/block/'+hash)return json({id:hash,height:200});
   if(path==='/block-height/100')return text(fundingHash);
   if(path==='/block-height/195')return text(hash);
   if(path.startsWith('/address/'))return json([{txid:previous.id,vout:0,value:fakeUtxo?210000:200000,status:{confirmed:true,block_height:100,block_hash:fundingHash}}]);
   if(path==='/fee-estimates'){if(fees)fees.paths.push(path);return json({'6':2});}
   if(path==='/v1/fees/recommended'){assert.ok(fees,'MEMPOOL fee endpoint must be explicitly selected');fees.paths.push(path);return json({fastestFee:20,halfHourFee:10,hourFee:fees.hourFee,economyFee:1,minimumFee:1});}
   if(path==='/tx/'+previous.id+'/hex')return text(previous.raw);
   if(path==='/tx/'+previous.id)return json({txid:previous.id,status:{confirmed:true,block_hash:fundingHash},vin:[{is_coinbase:false}]});
   if(path==='/tx'&&options.method==='POST'){sends++;const stored=JSON.parse(await readFile(join(root,'native-wallet.json'),'utf8'));assert.ok(stored.operations.some(row=>row.phase==='SUBMITTING'&&row.rawTransaction===options.body),'signed wire must be durable before send');signed=options.body;throw Error('FIXTURE_REPLY_LOST');}
   if(path.includes('/status'))return json({confirmed:observed,block_height:195,block_hash:hash});
   if(path.endsWith('/hex'))return text(signed);
   assert.fail('unexpected Esplora method');
  }
  const request=JSON.parse(options.body),reply=result=>json({jsonrpc:'2.0',id:request.id,result}),method=request.method;
  if(id==='ethereum-mainnet'){
   if(method==='eth_chainId')return reply('0x1');
   if(method==='eth_getBlockByNumber'){const tag=request.params[0];return reply(tag==='0x0'?{hash:wrongGenesis?'0x'+'0'.repeat(64):genesis[id],number:'0x0'}:{hash:'0x'+hash,number:tag==='0x10'?'0x10':'0x20',baseFeePerGas:'0x3b9aca00'});}
   if(method==='eth_getBalance')return reply('0x8ac7230489e80000');
   if(method==='eth_getTransactionCount')return reply('0x0');
   if(method==='eth_maxPriorityFeePerGas')return reply('0x3b9aca00');
   if(method==='eth_getCode')return reply('0x');
   if(method==='eth_estimateGas')return reply('0x5208');
   if(method==='eth_sendRawTransaction'){sends++;const stored=JSON.parse(await readFile(join(root,'native-wallet.json'),'utf8'));assert.ok(stored.operations.some(row=>row.phase==='SUBMITTING'&&row.rawTransaction===request.params[0]),'signed wire must be durable before send');signed=request.params[0];if(behavior?.writeError)return json({jsonrpc:'2.0',id:request.id,error:behavior.writeError});throw Error('FIXTURE_REPLY_LOST');}
   if(method==='eth_getTransactionByHash')return reply(null);
   if(method==='eth_getTransactionReceipt')return reply(observed?{transactionHash:request.params[0],blockHash:'0x'+hash,blockNumber:'0x10',from:account.address,to:deriveNativeAccountV1(otherEntropy,id).address,status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00'}:null);
  }else{
   if(method==='getGenesisHash')return reply(wrongGenesis?'11111111111111111111111111111111':genesis[id]);
   if(method==='getBalance')return reply({context:{slot:200},value:1000000000});
   if(method==='getBlock')return reply({blockhash:'11111111111111111111111111111111',signatures:request.params[1].transactionDetails==='signatures'?[request.params[0]===195?currentID:null]:undefined});
   if(method==='getLatestBlockhash')return reply({context:{slot:200},value:{blockhash:'11111111111111111111111111111111',lastValidBlockHeight:300}});
   if(method==='getFeeForMessage')return reply({context:{slot:200},value:5000});
   if(method==='getBlockHeight')return reply(200);
   if(method==='isBlockhashValid')return reply({context:{slot:200},value:true});
   if(method==='getMinimumBalanceForRentExemption')return reply(890880);
   if(method==='getAccountInfo')return reply({context:{slot:200},value:{owner:'11111111111111111111111111111111',executable:false,data:['','base64']}});
   if(method==='sendTransaction'){sends++;const stored=JSON.parse(await readFile(join(root,'native-wallet.json'),'utf8'));assert.ok(stored.operations.some(row=>row.phase==='SUBMITTING'&&row.rawTransaction===request.params[0]),'signed wire must be durable before send');signed=request.params[0];currentID=stored.operations[0].nativeId;throw Error('FIXTURE_REPLY_LOST');}
   if(method==='getSignatureStatuses')return reply({context:{slot:200},value:[observed?{slot:195,confirmations:null,err:null,confirmationStatus:'finalized'}:null]});
   if(method==='getTransaction')return reply({slot:195,transaction:[signed,'base64'],meta:{fee:5000,err:null}});
  }
  assert.fail('unexpected RPC method');
 });let currentID=null;return{get sends(){return sends;},set observed(value){observed=value;},set wrongGenesis(value){wrongGenesis=value;},set fakeUtxo(value){fakeUtxo=value;}};
}

for(const id of ['ethereum-mainnet','bitcoin-mainnet','solana-mainnet'])test(id+' prepares and verifies exact native wire, persists before lost reply, reopens and observes without another send',async t=>{
 const root=await directory();const own=deriveNativeAccountV1(entropy,id),destination=deriveNativeAccountV1(otherEntropy,id),network=mockNetwork(t,id,own,root);let gateway=await createNativeWalletGatewayV1({directory:root,configuration:configuration(id)});t.after(async()=>{try{await gateway.close();}finally{await rm(root,{recursive:true,force:true});}});
 const balance=await gateway.balances(own);assert.equal(balance.network.genesisHash,genesis[id]);assert.ok(BigInt(balance.spendableAtomic)>0n);
 const amountAtomic=id==='ethereum-mainnet'?'1000000000000000':id==='bitcoin-mainnet'?'10000':'1000000',quote=await gateway.prepareSend({account:own,recipient:destination.address,amountAtomic});
 const signed=signNativeWalletTransactionV1(entropy,own,quote.transaction),first=await gateway.broadcast({quoteId:quote.id,rawTransaction:signed.rawTransaction});assert.equal(first.status,'UNKNOWN');assert.equal(first.id,signed.id);assert.equal(network.sends,1);
 const blocked=await gateway.balances(own);assert.equal(blocked.spendableAtomic,'0');assert.equal(blocked.hasPendingTransfer,true);
 await gateway.close();gateway=await createNativeWalletGatewayV1({directory:root,configuration:configuration(id)});network.observed=true;
 const observed=await gateway.observeTransfer(quote.id);assert.equal(observed.status,'FINALIZED');assert.equal(observed.id,signed.id);assert.equal(observed.terminal,true);
 const duplicate=await gateway.broadcast({quoteId:quote.id,rawTransaction:signed.rawTransaction});assert.equal(duplicate.status,'FINALIZED');assert.equal(network.sends,1,'a retry must observe, not rebroadcast');
 await assert.rejects(gateway.cancelQuote({id:quote.id}),/NATIVE_WALLET_SIGNED_CANNOT_CANCEL/);
 const changed={...quote.transaction,...(id==='ethereum-mainnet'?{to:own.address}:id==='bitcoin-mainnet'?{outputs:[{...quote.transaction.outputs[0],address:own.address,scriptPubKey:bitcoinScriptV1(own.address,own.network)},quote.transaction.outputs[1]]}:{to:own.address})};
 assert.throws(()=>signNativeWalletTransactionV1(otherEntropy,own,changed));assert.equal(network.sends,1);
});
test('bounded broadcast rejection survives absent receipts and restart, without releasing or rebroadcasting signed UNKNOWN',async t=>{
 const root=await directory(),id='ethereum-mainnet',own=deriveNativeAccountV1(entropy,id),other=deriveNativeAccountV1(otherEntropy,id),behavior={writeError:{code:-32000,message:'transaction underpriced: PRIVATE_PROVIDER_TEXT'}},network=mockNetwork(t,id,own,root,null,behavior);
 let gateway=await createNativeWalletGatewayV1({directory:root,configuration:configuration(id)});t.after(async()=>{try{await gateway.close();}finally{await rm(root,{recursive:true,force:true});}});
 const quote=await gateway.prepareSend({account:own,recipient:other.address,amountAtomic:'1000000000000000'}),signed=signNativeWalletTransactionV1(entropy,own,quote.transaction),first=await gateway.broadcast({quoteId:quote.id,rawTransaction:signed.rawTransaction});
 assert.equal(first.status,'UNKNOWN');assert.equal(first.errorCode,'NATIVE_WALLET_RPC_WRITE_FEE_TOO_LOW');assert.equal(first.terminal,false);
 for(let i=0;i<2;i++){const read=await gateway.observeTransfer(quote.id);assert.equal(read.errorCode,first.errorCode);assert.equal(read.status,'UNKNOWN');}
 const stored=await readFile(join(root,'native-wallet.json'),'utf8');assert.ok(!stored.includes('PRIVATE_PROVIDER_TEXT'));
 await gateway.close();gateway=await createNativeWalletGatewayV1({directory:root,configuration:configuration(id)});
 assert.equal((await gateway.observeTransfer(quote.id)).errorCode,first.errorCode);assert.equal((await gateway.balances(own)).spendableAtomic,'0');
 await assert.rejects(gateway.cancelQuote({id:quote.id}),/SIGNED_CANNOT_CANCEL/);
 await gateway.broadcast({quoteId:quote.id,rawTransaction:signed.rawTransaction});assert.equal(network.sends,1);
 network.observed=true;const final=await gateway.observeTransfer(quote.id);assert.equal(final.status,'FINALIZED');assert.equal(final.errorCode,null);assert.equal(final.terminal,true);assert.equal(network.sends,1);
});
test('cancelling an unsigned review persists and releases the account without admitting a later signature',async t=>{
 const root=await directory(),id='ethereum-mainnet',own=deriveNativeAccountV1(entropy,id),other=deriveNativeAccountV1(otherEntropy,id),network=mockNetwork(t,id,own,root);let gateway=await createNativeWalletGatewayV1({directory:root,configuration:configuration(id)});t.after(async()=>{try{await gateway.close();}finally{await rm(root,{recursive:true,force:true});}});
 const quote=await gateway.prepareSend({account:own,recipient:other.address,amountAtomic:'1000000000000000'}),signed=signNativeWalletTransactionV1(entropy,own,quote.transaction),cancelled=await gateway.cancelQuote({id:quote.id});assert.equal(cancelled.status,'FAILED');assert.equal(cancelled.errorCode,'NATIVE_WALLET_QUOTE_CANCELLED');assert.equal(cancelled.terminal,true);assert.equal((await gateway.balances(own)).hasPendingTransfer,false);
 await gateway.close();gateway=await createNativeWalletGatewayV1({directory:root,configuration:configuration(id)});assert.equal((await gateway.observeTransfer(quote.id)).errorCode,'NATIVE_WALLET_QUOTE_CANCELLED');await assert.rejects(gateway.broadcast({quoteId:quote.id,rawTransaction:signed.rawTransaction}),/NATIVE_WALLET_QUOTE_CANCELLED/);await gateway.prepareSend({account:own,recipient:other.address,amountAtomic:'1000000000000000'});assert.equal(network.sends,0);
});
test('public gateway rejects another genesis and fabricated BTC prevout amounts before signing or broadcasting',async t=>{
 const root=await directory();const id='bitcoin-mainnet',own=deriveNativeAccountV1(entropy,id),other=deriveNativeAccountV1(otherEntropy,id),network=mockNetwork(t,id,own,root),gateway=await createNativeWalletGatewayV1({directory:root,configuration:configuration(id)});t.after(async()=>{try{await gateway.close();}finally{await rm(root,{recursive:true,force:true});}});network.wrongGenesis=true;await assert.rejects(gateway.balances(own),/NATIVE_WALLET_NETWORK_IDENTITY/);network.wrongGenesis=false;network.fakeUtxo=true;await assert.rejects(gateway.prepareSend({account:own,recipient:other.address,amountAtomic:'10000'}),/NATIVE_PREVOUT_BINDING/);assert.equal(network.sends,0);
});
test('unsigned quote expiry releases the account; elapsed signed UNKNOWN is never converted to expired or resent',async t=>{
 const root=await directory();const id='ethereum-mainnet',own=deriveNativeAccountV1(entropy,id),other=deriveNativeAccountV1(otherEntropy,id),network=mockNetwork(t,id,own,root),gateway=await createNativeWalletGatewayV1({directory:root,configuration:configuration(id)});t.after(async()=>{try{await gateway.close();}finally{await rm(root,{recursive:true,force:true});}});const now=process.hrtime.bigint();let tick=now;t.mock.method(process.hrtime,'bigint',()=>tick);
 const first=await gateway.prepareSend({account:own,recipient:other.address,amountAtomic:'1000000000000000'});tick+=121000000000n;assert.equal((await gateway.observeTransfer(first.id)).status,'EXPIRED');assert.equal((await gateway.balances(own)).hasPendingTransfer,false);
 const second=await gateway.prepareSend({account:own,recipient:other.address,amountAtomic:'1000000000000000'}),signed=signNativeWalletTransactionV1(entropy,own,second.transaction);await gateway.broadcast({quoteId:second.id,rawTransaction:signed.rawTransaction});tick+=121000000000n;const status=await gateway.observeTransfer(second.id);assert.equal(status.status,'UNKNOWN');assert.equal(status.id,signed.id);assert.equal(status.terminal,false);await gateway.broadcast({quoteId:second.id,rawTransaction:signed.rawTransaction});assert.equal(network.sends,1);
});
test('explicit MEMPOOL configuration requests recommended hour fee, rounds up sat/vbyte, and refuses invalid rates without fallback or broadcast',async t=>{
 const root=await directory(),id='bitcoin-mainnet',own=deriveNativeAccountV1(entropy,id),recipient=deriveNativeAccountV1(otherEntropy,id),fees={hourFee:2.1,paths:[]},network=mockNetwork(t,id,own,root,fees);
 const config={networks:[{id,endpoint:'https://native-fixture.example/api',feeProvider:'MEMPOOL'}]},gateway=await createNativeWalletGatewayV1({directory:root,configuration:config});t.after(async()=>{try{await gateway.close();}finally{await rm(root,{recursive:true,force:true});}});
 const quote=await gateway.prepareSend({account:own,recipient:recipient.address,amountAtomic:'10000'});
 assert.deepEqual(fees.paths,['/v1/fees/recommended']);assert.equal(quote.fee.maximumAtomic,'423','one P2WPKH input, recipient and change at ceiling(2.1)=3 sat/vbyte');
 const input=BigInt(quote.transaction.inputs[0].valueAtomic),outputs=quote.transaction.outputs.reduce((sum,out)=>sum+BigInt(out.valueAtomic),0n);assert.equal((input-outputs).toString(),quote.fee.maximumAtomic);
 await gateway.cancelQuote({id:quote.id});
 for(const invalid of [0,-1,10001,'3',null]){fees.hourFee=invalid;await assert.rejects(gateway.prepareSend({account:own,recipient:recipient.address,amountAtomic:'10000'}),/NATIVE_WALLET_BTC_FEE_ESTIMATE/);}
 assert.ok(fees.paths.every(path=>path==='/v1/fees/recommended'),'the explicit provider must not fall back to a different fee shape');assert.equal(network.sends,0);
 await assert.rejects(createNativeWalletGatewayV1({directory:join(root,'invalid-provider'),configuration:{networks:[{id,endpoint:'https://native-fixture.example/api',feeProvider:'OTHER'}]}}),/NATIVE_WALLET_CONFIG/);
});


test('full history rejects a new quote before RPC while retained operations remain queryable',async t=>{
 const root=await directory(),id='ethereum-mainnet',own=deriveNativeAccountV1(entropy,id),recipient=deriveNativeAccountV1(otherEntropy,id);
 mockNetwork(t,id,own,root);let gateway=await createNativeWalletGatewayV1({directory:root,configuration:configuration(id)});
 t.after(async()=>{await gateway.close();await rm(root,{recursive:true,force:true});});
 const quote=await gateway.prepareSend({account:own,recipient:recipient.address,amountAtomic:'1000'});await gateway.cancelQuote({id:quote.id});await gateway.close();
 const saved=JSON.parse(await readFile(join(root,'native-wallet.json'),'utf8'));
 const {openNativeWalletJournalV1}=await import('../../src/native-wallet/journal-v1.mjs');
 const journal=await openNativeWalletJournalV1(root,saved.configurationSHA256);
 const rows=Array.from({length:512},()=>{const row=structuredClone(saved.operations[0]);row.quote.id=randomUUID();const {quoteSHA256,...body}=row.quote;row.quote.quoteSHA256=nativeJsonHashV1(body);return row;});
 await journal.commit(rows);await journal.close();
 gateway=await createNativeWalletGatewayV1({directory:root,configuration:configuration(id)});
 const before=await readFile(join(root,'native-wallet.json'),'utf8');let requests=0;
 t.mock.method(globalThis,'fetch',async()=>{requests++;throw Error('unexpected RPC after capacity exhaustion');});
 await assert.rejects(gateway.prepareSend({account:own,recipient:recipient.address,amountAtomic:'1000'}),/JOURNAL_CAPACITY/);
 assert.equal((await gateway.observeTransfer(rows[0].quote.id)).terminal,true);assert.equal(requests,0);
 assert.equal(await readFile(join(root,'native-wallet.json'),'utf8'),before);
});

async function retryFixture(t,onSend){
 const root=await directory(),id='ethereum-mainnet',own=deriveNativeAccountV1(entropy,id),recipient=deriveNativeAccountV1(otherEntropy,id);
 const baseline=mockNetwork(t,id,own,root),originalFetch=globalThis.fetch,wires=[],times=[];
 const state={nonce:'0x0',transaction:null,readFailure:false,preflights:0};let gateway=await createNativeWalletGatewayV1({directory:root,configuration:configuration(id)});
 t.after(async()=>{await gateway.close();await rm(root,{recursive:true,force:true});});
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const request=JSON.parse(options.body),reply=result=>json({jsonrpc:'2.0',id:request.id,result});
  if(request.method==='eth_getTransactionByHash'){if(state.readFailure)return json({jsonrpc:'2.0',id:request.id,error:{code:-32000,message:'fixture read unavailable'}});return reply(state.transaction);}
  if(request.method==='eth_getTransactionCount'){state.preflights++;return reply(state.nonce);}
  if(request.method==='eth_sendRawTransaction'){
   wires.push(request.params[0]);times.push(performance.now());const saved=JSON.parse(await readFile(join(root,'native-wallet.json'),'utf8')).operations[0];
   assert.equal(saved.rawTransaction,request.params[0]);assert.equal(saved.phase,'SUBMITTING');assert.equal(saved.broadcastAttempts,wires.length,'each attempt is durably counted before POST');
   return onSend({attempt:wires.length,request,reply,saved,state});
  }
  return originalFetch(url,options);
 });
 const quote=await gateway.prepareSend({account:own,recipient:recipient.address,amountAtomic:'1000'}),signed=signNativeWalletTransactionV1(entropy,own,quote.transaction);
 const input={quoteId:quote.id,rawTransaction:signed.rawTransaction};
 return{root,quote,signed,input,state,wires,times,baseline,get gateway(){return gateway;},async reopen(){await gateway.close();gateway=await createNativeWalletGatewayV1({directory:root,configuration:configuration(id)});}};
}

test('native ETH recovers one 429 using identical signed bytes after fresh checks and cooldown',async t=>{
 const fixture=await retryFixture(t,({attempt,reply,saved})=>attempt===1?new Response('',{status:429}):reply(saved.nativeId));
 const first=await fixture.gateway.broadcast(fixture.input);
 assert.equal(first.status,'SUBMITTED');assert.equal(first.errorCode,null);assert.equal(first.id,fixture.signed.id);
 assert.deepEqual(fixture.wires,[fixture.signed.rawTransaction,fixture.signed.rawTransaction]);assert.ok(fixture.times[1]-fixture.times[0]>=2900);
 assert.equal(fixture.state.preflights,3,'quote, first send, and retry each check the nonce');
 await fixture.gateway.transactionStatus({id:fixture.quote.id});await fixture.gateway.broadcast(fixture.input);
 assert.equal(fixture.wires.length,2,'ordinary polling or duplicate submission cannot repeat a successful send');
});

test('native ETH caps persistent transient sends at three, including after process reopen',async t=>{
 const fixture=await retryFixture(t,()=>new Response('',{status:503}));
 const status=await fixture.gateway.broadcast(fixture.input);assert.equal(status.status,'UNKNOWN');assert.equal(status.errorCode,'NATIVE_WALLET_BROADCAST_UNAVAILABLE');assert.equal(fixture.wires.length,3);
 await fixture.reopen();await fixture.gateway.transactionStatus({id:fixture.quote.id});await fixture.gateway.broadcast(fixture.input);
 assert.equal(fixture.wires.length,3);assert.equal((await fixture.gateway.balances(fixture.quote.account)).hasPendingTransfer,true);
 await assert.rejects(fixture.gateway.cancelQuote({id:fixture.quote.id}),/SIGNED_CANNOT_CANCEL/);
});

test('aborting the native recovery cooldown prevents another POST and preserves the pending wire',async t=>{
 const controller=new AbortController();
 const fixture=await retryFixture(t,()=>{setTimeout(()=>controller.abort(),50);return new Response('',{status:429});});
 const status=await fixture.gateway.broadcast(fixture.input,controller.signal);
 assert.equal(status.errorCode,'NATIVE_WALLET_CANCELLED');assert.equal(fixture.wires.length,1);assert.equal(status.terminal,false);
 await fixture.gateway.transactionStatus({id:fixture.quote.id});assert.equal(fixture.wires.length,1);
});

test('quote expiry during native cooldown prevents POST without releasing signed uncertainty',async t=>{
 let offset=0;const now=Date.now;t.mock.method(Date,'now',()=>now()+offset);
 const fixture=await retryFixture(t,()=>{setTimeout(()=>{offset=121000;},50);return new Response('',{status:429});});
 const status=await fixture.gateway.broadcast(fixture.input);assert.equal(status.errorCode,'NATIVE_WALLET_QUOTE_EXPIRED');assert.equal(status.status,'UNKNOWN');assert.equal(status.terminal,false);assert.equal(fixture.wires.length,1);
 await fixture.gateway.broadcast(fixture.input);assert.equal(fixture.wires.length,1);
});

for(const failure of ['nonce','observation'])test('native recovery stops when fresh '+failure+' checks fail',async t=>{
 const fixture=await retryFixture(t,({state})=>{if(failure==='nonce')state.nonce='0x1';else state.readFailure=true;return new Response('',{status:429});});
 const status=await fixture.gateway.broadcast(fixture.input);assert.equal(status.status,'UNKNOWN');assert.equal(fixture.wires.length,1);
 assert.equal(status.errorCode,failure==='nonce'?'NATIVE_WALLET_EVM_NONCE_CHANGED':'NATIVE_WALLET_RPC_FAILED');
});

test('an exact mempool transaction ends native recovery before another POST',async t=>{
 const fixture=await retryFixture(t,({state,saved})=>{
  const tx=saved.quote.transaction,hex=n=>'0x'+BigInt(n).toString(16);
  state.transaction={hash:saved.nativeId,from:saved.quote.account.address,to:saved.quote.recipient,nonce:hex(tx.nonce),value:hex(tx.value),gas:hex(tx.gasLimit),maxFeePerGas:hex(tx.maxFeePerGas),maxPriorityFeePerGas:hex(tx.maxPriorityFeePerGas),input:'0x',type:'0x2',chainId:hex(tx.chainId),accessList:[]};
  return new Response('',{status:429});
 });
 const status=await fixture.gateway.broadcast(fixture.input);assert.equal(status.status,'SUBMITTED');assert.equal(status.errorCode,null);assert.equal(fixture.wires.length,1);
 await fixture.gateway.transactionStatus({id:fixture.quote.id});assert.equal(fixture.wires.length,1);
});

test('a mismatched mempool transaction cannot authorize a resend or successful status',async t=>{
 const fixture=await retryFixture(t,({state,saved})=>{state.transaction={hash:saved.nativeId,from:saved.quote.account.address,to:saved.quote.account.address};return new Response('',{status:429});});
 const status=await fixture.gateway.broadcast(fixture.input);assert.equal(status.status,'UNKNOWN');assert.equal(status.errorCode,'NATIVE_WALLET_EVM_TRANSACTION_BINDING');assert.equal(fixture.wires.length,1);
});

test('native HTTP500 and changed signed bytes never enter automatic send recovery',async t=>{
 const fixture=await retryFixture(t,()=>new Response('',{status:500}));
 const status=await fixture.gateway.broadcast(fixture.input);assert.equal(status.errorCode,'NATIVE_WALLET_HTTP_STATUS');assert.equal(fixture.wires.length,1);
 const changed=signNativeWalletTransactionV1(entropy,fixture.quote.account,{...fixture.quote.transaction,value:'1001'});
 await assert.rejects(fixture.gateway.broadcast({...fixture.input,rawTransaction:changed.rawTransaction}),/NATIVE_SIGNATURE_BINDING/);
 await fixture.gateway.broadcast(fixture.input);assert.equal(fixture.wires.length,1);
});

test('shared Ethereum adapter preserves PAEG missing-receipt observation without native recovery',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(_url,options)=>{const request=JSON.parse(options.body);calls.push(request.method);assert.equal(request.method,'eth_getTransactionReceipt');return json({jsonrpc:'2.0',id:request.id,result:null});});
 const adapter=ethereumWalletAdapterV1({endpoint:'https://native-fixture.example/api'});
 const result=await adapter.observe({nativeId:'0x'+'a'.repeat(64),quote:{transaction:{kind:'PAGED_SEPOLIA_1559_V1'}}});
 assert.equal(result.status,'UNKNOWN');assert.deepEqual(calls,['eth_getTransactionReceipt']);
});

test('switching only the native BTC RPC provider preserves quotes and network journal identity',async t=>{
 const root=await directory(),id='bitcoin-mainnet',own=deriveNativeAccountV1(entropy,id),other=deriveNativeAccountV1(otherEntropy,id),fees={hourFee:2,paths:[]};
 const network=mockNetwork(t,id,own,root,fees);let gateway=await createNativeWalletGatewayV1({directory:root,configuration:{networks:[{id,endpoint:'https://native-fixture.example/api',feeProvider:'MEMPOOL'}]}});
 t.after(async()=>{await gateway.close();await rm(root,{recursive:true,force:true});});
 const quote=await gateway.prepareSend({account:own,recipient:other.address,amountAtomic:'1000'});await gateway.close();
 gateway=await createNativeWalletGatewayV1({directory:root,configuration:{networks:[{id,endpoint:'https://other-fixture.example/api',feeProvider:'ESPLORA'}]}});
 assert.equal((await gateway.transactionStatus({id:quote.id})).status,'PREPARED');await gateway.cancelQuote({id:quote.id});
 const changed=await gateway.prepareSend({account:own,recipient:other.address,amountAtomic:'1000'});assert.equal(changed.network.genesisHash,quote.network.genesisHash);
 assert.deepEqual(fees.paths,['/v1/fees/recommended','/fee-estimates']);assert.equal(network.sends,0);
});
